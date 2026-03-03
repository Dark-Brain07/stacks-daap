import { NextRequest, NextResponse } from 'next/server';
import { enqueueBatch, getQueueStatus, clearQueue } from '@/lib/tx-store';

// ---------- POST /api/queue — Store pre-signed transactions ----------
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { address, transactions } = body;

        if (!address || !transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return NextResponse.json(
                { error: 'Missing address or transactions array.' },
                { status: 400 }
            );
        }

        // Validate each tx has required fields
        for (const tx of transactions) {
            if (!tx.contractName || !tx.signedTxHex || tx.nonce === undefined) {
                return NextResponse.json(
                    { error: `Invalid transaction: missing contractName, signedTxHex, or nonce.` },
                    { status: 400 }
                );
            }
        }

        const queueId = await enqueueBatch(address, transactions);

        return NextResponse.json({
            queueId,
            total: transactions.length,
            message: `Queued ${transactions.length} transactions. They will be broadcast automatically via cron.`,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Queue POST error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ---------- GET /api/queue — Get queue status ----------
export async function GET() {
    try {
        const { meta, txs } = await getQueueStatus();

        if (!meta) {
            return NextResponse.json({
                active: false,
                message: 'No active deployment queue.',
            });
        }

        // Return summary + first/last few tx statuses for display
        const displayTxs = txs.length <= 60
            ? txs.map(({ signedTxHex, ...rest }) => rest)
            : [
                ...txs.slice(0, 50).map(({ signedTxHex, ...rest }) => rest),
                ...txs.slice(-10).map(({ signedTxHex, ...rest }) => rest),
            ];

        return NextResponse.json({
            active: true,
            meta,
            transactions: displayTxs,
            totalDisplayed: displayTxs.length,
            totalHidden: Math.max(0, txs.length - 60),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Queue GET error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ---------- DELETE /api/queue — Clear queue ----------
export async function DELETE() {
    try {
        await clearQueue();
        return NextResponse.json({ message: 'Queue cleared.' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Queue DELETE error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
