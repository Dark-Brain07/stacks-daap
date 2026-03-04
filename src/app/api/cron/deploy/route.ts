import { NextRequest, NextResponse } from 'next/server';
import {
    getQueueStatus,
    getNextBatch,
    updateTxStatus,
    acquireProcessingLock,
    releaseProcessingLock,
    setProcessing,
} from '@/lib/tx-store';
import { MEMPOOL_CHAIN_LIMIT } from '@/lib/constants';

const STACKS_API = 'https://api.mainnet.hiro.so';

/**
 * GET /api/cron/deploy
 *
 * Called by Vercel Cron every 10 minutes.
 * Broadcasts the next batch of queued txs (up to 25).
 */
export async function GET(req: NextRequest) {
    // Verify cron secret (optional but recommended)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Check if there's an active queue
        const { meta } = await getQueueStatus();
        if (!meta || meta.pending === 0) {
            return NextResponse.json({
                message: 'No pending transactions.',
                succeeded: meta?.succeeded || 0,
                failed: meta?.failed || 0,
            });
        }

        // Acquire lock to prevent double-processing
        // But first, force-release stale locks (isProcessing should be false)
        if (!meta.isProcessing) {
            await releaseProcessingLock();
        }

        const lockAcquired = await acquireProcessingLock();
        if (!lockAcquired) {
            // Force release and try once more
            await releaseProcessingLock();
            const retry = await acquireProcessingLock();
            if (!retry) {
                return NextResponse.json({
                    message: 'Could not acquire lock. Try again shortly.',
                });
            }
        }

        await setProcessing(true);

        let batchSucceeded = 0;
        let batchFailed = 0;

        try {
            // Get next batch
            const batch = await getNextBatch(MEMPOOL_CHAIN_LIMIT);

            if (batch.length === 0) {
                return NextResponse.json({
                    message: 'No queued transactions to process.',
                });
            }

            console.log(`[CRON] Processing batch of ${batch.length} transactions...`);

            // Broadcast each transaction sequentially
            for (const tx of batch) {
                try {
                    await updateTxStatus(tx.contractName, {
                        status: 'broadcasting',
                        attempts: tx.attempts + 1,
                    });

                    // Convert hex to bytes
                    const txBytes = new Uint8Array(
                        tx.signedTxHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
                    );

                    // Broadcast to Stacks API
                    const res = await fetch(`${STACKS_API}/v2/transactions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: Buffer.from(txBytes),
                    });

                    const responseText = await res.text();

                    let data: Record<string, unknown>;
                    try {
                        data = JSON.parse(responseText);
                    } catch {
                        // Plain string txid — success!
                        const txId = responseText.replace(/"/g, '');
                        await updateTxStatus(tx.contractName, {
                            status: 'success',
                            txId,
                        });
                        batchSucceeded++;
                        console.log(`[CRON] ✓ ${tx.contractName} → ${txId}`);
                        continue;
                    }

                    if (!res.ok || data.error || data.message) {
                        const errorMsg = (data.error || data.message || 'Broadcast rejected') as string;

                        // If mempool chaining limit, stop processing this batch
                        if (errorMsg.includes('chaining limit')) {
                            console.log(`[CRON] Mempool chaining limit reached. Stopping batch.`);
                            await updateTxStatus(tx.contractName, { status: 'queued' });
                            break;
                        }

                        // Contract already exists — count as success
                        if (errorMsg.includes('ContractAlreadyExists') || errorMsg.includes('already been deployed')) {
                            await updateTxStatus(tx.contractName, {
                                status: 'success',
                                error: 'Already deployed',
                            });
                            batchSucceeded++;
                            continue;
                        }

                        // Other errors — mark as failed
                        await updateTxStatus(tx.contractName, {
                            status: 'failed',
                            error: errorMsg,
                            attempts: tx.attempts + 1,
                        });
                        batchFailed++;
                        console.log(`[CRON] ✗ ${tx.contractName}: ${errorMsg}`);
                    } else {
                        // Success
                        const txId = (data.txid || responseText.replace(/"/g, '')) as string;
                        await updateTxStatus(tx.contractName, {
                            status: 'success',
                            txId,
                        });
                        batchSucceeded++;
                        console.log(`[CRON] ✓ ${tx.contractName} → ${txId}`);
                    }

                    // Small delay between broadcasts
                    await new Promise((r) => setTimeout(r, 500));
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    await updateTxStatus(tx.contractName, {
                        status: 'failed',
                        error: message,
                        attempts: tx.attempts + 1,
                    });
                    batchFailed++;
                    console.error(`[CRON] ✗ ${tx.contractName}:`, message);
                }
            }
        } finally {
            await setProcessing(false);
            await releaseProcessingLock();
        }

        return NextResponse.json({
            message: `Batch processed: ${batchSucceeded} succeeded, ${batchFailed} failed.`,
            batchSucceeded,
            batchFailed,
            totalSucceeded: (meta.succeeded || 0) + batchSucceeded,
            totalPending: Math.max(0, (meta.pending || 0) - batchSucceeded - batchFailed),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[CRON] Error:', message);
        await releaseProcessingLock();
        await setProcessing(false);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
