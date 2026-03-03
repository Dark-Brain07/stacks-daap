/**
 * Deployment queue with batch processing to respect Stacks mempool limits.
 *
 * Key reliability features:
 *  - Batch deployment (25 txs max) to avoid mempool chaining limit
 *  - Waits for batch confirmation before sending next batch
 *  - Sequential within each batch to avoid nonce conflicts
 *  - Smart retry with exponential backoff
 *  - Rate-limit (429) and nonce-conflict aware
 */

import {
    CONCURRENCY_LIMIT,
    MAX_RETRIES,
    RETRY_DELAY_MS,
    INTER_TX_DELAY_MS,
    MEMPOOL_CHAIN_LIMIT,
    MEMPOOL_POLL_INTERVAL_MS,
} from './constants';

// ---------- Types ----------
export type TxStatusType = 'pending' | 'signing' | 'broadcasting' | 'success' | 'failed' | 'waiting';

export interface TxStatus {
    contractName: string;
    status: TxStatusType;
    txId?: string;
    error?: string;
    attempt: number;
}

export interface QueueProgress {
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
    pending: number;
    statuses: TxStatus[];
    currentBatch?: number;
    totalBatches?: number;
    startedAt: number; // Date.now() timestamp
}

export type ProgressCallback = (progress: QueueProgress) => void;

export interface DeployJob {
    contractName: string;
    codeBody: string;
}

export interface QueueOptions {
    senderKey: string;
    startNonce: number;
    onProgress: ProgressCallback;
    buildAndSignTx: (
        contractName: string,
        codeBody: string,
        senderKey: string,
        nonce: number
    ) => Promise<string>;
    broadcastTx: (signedHex: string) => Promise<string>;
    fetchNonce?: () => Promise<number>;
    concurrency?: number;
    cancelled?: () => boolean;
}

// ---------- Helpers ----------
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(message: string): boolean {
    return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('Rate limit') ||
        message.includes('Too Many Requests') ||
        message.includes('too_many_requests')
    );
}

function isNonceError(message: string): boolean {
    return (
        message.includes('ConflictingNonceInMempool') ||
        message.includes('BadNonce') ||
        message.includes('nonce') ||
        message.includes('Nonce')
    );
}

function isMempoolLimitError(message: string): boolean {
    return (
        message.includes('chaining limit') ||
        message.includes('TooMuchChaining') ||
        message.includes('too many chained')
    );
}

function isContractExistsError(message: string): boolean {
    return (
        message.includes('ContractAlreadyExists') ||
        message.includes('contract already exists') ||
        message.includes('already been deployed')
    );
}

function isFeeTooLowError(message: string): boolean {
    return (
        message.includes('FeeTooLow') ||
        message.includes('fee too low') ||
        message.includes('NotEnoughFunds') ||
        message.includes('not enough funds')
    );
}

// ---------- Queue Runner ----------
export async function runDeploymentQueue(
    jobs: DeployJob[],
    options: QueueOptions
): Promise<QueueProgress> {
    const {
        senderKey,
        startNonce,
        onProgress,
        buildAndSignTx,
        broadcastTx,
        fetchNonce,
        cancelled = () => false,
    } = options;

    const statuses: TxStatus[] = jobs.map((j) => ({
        contractName: j.contractName,
        status: 'pending' as TxStatusType,
        attempt: 0,
    }));

    let currentNonce = startNonce;
    let succeeded = 0;
    let failed = 0;

    // Split jobs into batches of MEMPOOL_CHAIN_LIMIT
    const totalBatches = Math.ceil(jobs.length / MEMPOOL_CHAIN_LIMIT);
    const deployStartedAt = Date.now();

    const emitProgress = (currentBatch?: number) => {
        const completed = succeeded + failed;
        onProgress({
            total: jobs.length,
            completed,
            succeeded,
            failed,
            pending: jobs.length - completed,
            statuses: [...statuses],
            currentBatch,
            totalBatches,
            startedAt: deployStartedAt,
        });
    };

    emitProgress(0);

    // Process a single job
    const processSingle = async (index: number, nonce: number): Promise<boolean> => {
        const job = jobs[index];
        const status = statuses[index];

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (cancelled()) {
                status.status = 'failed';
                status.error = 'Cancelled';
                failed++;
                emitProgress();
                return false;
            }

            status.attempt = attempt;
            let activeNonce = nonce;

            try {
                // On retries, re-fetch the nonce
                if (attempt > 1 && fetchNonce) {
                    try {
                        activeNonce = await fetchNonce();
                        currentNonce = activeNonce + 1;
                    } catch {
                        activeNonce = nonce;
                    }
                }

                // Sign
                status.status = 'signing';
                emitProgress();
                const signedHex = await buildAndSignTx(
                    job.contractName,
                    job.codeBody,
                    senderKey,
                    activeNonce
                );

                // Broadcast
                status.status = 'broadcasting';
                emitProgress();
                const txId = await broadcastTx(signedHex);

                status.status = 'success';
                status.txId = txId;
                succeeded++;
                emitProgress();
                return true;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);

                // Contract already deployed — count as success
                if (isContractExistsError(message)) {
                    status.status = 'success';
                    status.error = 'Already deployed (skipped)';
                    succeeded++;
                    emitProgress();
                    return true;
                }

                // Fee too low — fail immediately
                if (isFeeTooLowError(message)) {
                    status.status = 'failed';
                    status.error = `Fee too low or insufficient funds: ${message}`;
                    failed++;
                    emitProgress();
                    return false;
                }

                // Mempool chaining limit — wait without consuming retry attempts
                if (isMempoolLimitError(message)) {
                    // Wait for mempool to clear (Stacks blocks take ~10-30 min)
                    let mempoolWaitAttempts = 0;
                    const maxMempoolWaits = 120; // 120 × 15s = ~30 min max wait
                    let mempoolCleared = false;

                    while (mempoolWaitAttempts < maxMempoolWaits && !cancelled()) {
                        const minutesWaited = Math.round((mempoolWaitAttempts * MEMPOOL_POLL_INTERVAL_MS) / 60_000);
                        status.status = 'waiting';
                        status.error = `Waiting for mempool to clear (~${minutesWaited}m waited, blocks take ~10-30min)...`;
                        emitProgress();

                        await sleep(MEMPOOL_POLL_INTERVAL_MS);
                        mempoolWaitAttempts++;

                        // Check if mempool has room by re-fetching nonce
                        if (fetchNonce) {
                            try {
                                const latestNonce = await fetchNonce();
                                // If our nonce is now within the chaining limit, we can proceed
                                if (nonce < latestNonce + MEMPOOL_CHAIN_LIMIT) {
                                    activeNonce = nonce;
                                    mempoolCleared = true;
                                    break;
                                }
                            } catch {
                                // Keep waiting
                            }
                        }
                    }

                    if (mempoolCleared || mempoolWaitAttempts >= 5) {
                        // Don't consume a retry — go back and try again
                        attempt--;
                        continue;
                    }
                }

                if (attempt < MAX_RETRIES) {
                    if (isRateLimitError(message)) {
                        status.error = `Rate limited, retrying (${attempt}/${MAX_RETRIES})...`;
                        emitProgress();
                        await sleep(10_000 + RETRY_DELAY_MS * attempt);
                        continue;
                    }

                    if (isNonceError(message)) {
                        status.error = `Nonce conflict, retrying (${attempt}/${MAX_RETRIES})...`;
                        emitProgress();
                        await sleep(RETRY_DELAY_MS * attempt);
                        continue;
                    }

                    status.error = `Error, retrying (${attempt}/${MAX_RETRIES})...`;
                    emitProgress();
                    await sleep(RETRY_DELAY_MS * attempt);
                } else {
                    status.status = 'failed';
                    status.error = message;
                    failed++;
                    emitProgress();
                    return false;
                }
            }
        }
        return false;
    };

    // ---------- Batch Processing ----------
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        if (cancelled()) break;

        const batchStart = batchNum * MEMPOOL_CHAIN_LIMIT;
        const batchEnd = Math.min(batchStart + MEMPOOL_CHAIN_LIMIT, jobs.length);

        emitProgress(batchNum + 1);

        // If not the first batch, wait for previous batch to clear from mempool
        if (batchNum > 0 && fetchNonce) {
            // Mark waiting contracts
            for (let i = batchStart; i < batchEnd; i++) {
                statuses[i].status = 'waiting';
            }
            emitProgress(batchNum + 1);

            // Poll until the mempool has cleared (nonce has advanced)
            const expectedNonce = currentNonce;
            let waitAttempts = 0;
            const maxWaitAttempts = 60; // Up to ~15 minutes

            while (waitAttempts < maxWaitAttempts && !cancelled()) {
                try {
                    const latestNonce = await fetchNonce();
                    // If the latest nonce is close enough to what we expect,
                    // the mempool has room for our next batch
                    if (latestNonce >= expectedNonce - MEMPOOL_CHAIN_LIMIT + 5) {
                        currentNonce = latestNonce;
                        break;
                    }
                } catch {
                    // Nonce fetch failed, keep waiting
                }
                waitAttempts++;
                await sleep(MEMPOOL_POLL_INTERVAL_MS);
            }
        }

        // Process each job in the batch sequentially
        for (let i = batchStart; i < batchEnd; i++) {
            if (cancelled()) break;

            // Add delay between transactions (not before the first one in batch)
            if (i > batchStart && INTER_TX_DELAY_MS > 0) {
                await sleep(INTER_TX_DELAY_MS);
            }

            const nonce = currentNonce;
            currentNonce++;
            await processSingle(i, nonce);
        }
    }

    const finalProgress: QueueProgress = {
        total: jobs.length,
        completed: succeeded + failed,
        succeeded,
        failed,
        pending: 0,
        statuses,
        currentBatch: totalBatches,
        totalBatches,
        startedAt: deployStartedAt,
    };
    onProgress(finalProgress);
    return finalProgress;
}
