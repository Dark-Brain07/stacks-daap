import { NextRequest, NextResponse } from 'next/server';

const STACKS_API = 'https://api.mainnet.hiro.so';

// ---------- GET /api/nonce-gaps?address=... ----------
export async function GET(req: NextRequest) {
    try {
        const address = req.nextUrl.searchParams.get('address');
        if (!address) {
            return NextResponse.json({ error: 'Missing address parameter.' }, { status: 400 });
        }

        // Get nonce details including missing nonces
        const nonceRes = await fetch(
            `${STACKS_API}/extended/v1/address/${address}/nonces`,
            {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            }
        );

        if (!nonceRes.ok) {
            const text = await nonceRes.text();
            console.error('Stacks API nonce-gaps error:', nonceRes.status, text);
            return NextResponse.json(
                { error: `Stacks API error: ${nonceRes.statusText}` },
                { status: nonceRes.status }
            );
        }

        const nonceData = await nonceRes.json();

        // Get mempool transactions count
        const mempoolRes = await fetch(
            `${STACKS_API}/extended/v1/address/${address}/mempool?limit=1`,
            {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            }
        );

        let mempoolCount = 0;
        if (mempoolRes.ok) {
            const mempoolData = await mempoolRes.json();
            mempoolCount = mempoolData.total || 0;
        }

        return NextResponse.json({
            lastExecutedNonce: nonceData.last_executed_tx_nonce,
            lastMempoolNonce: nonceData.last_mempool_tx_nonce,
            possibleNextNonce: nonceData.possible_next_nonce,
            missingNonces: nonceData.detected_missing_nonces || [],
            mempoolNonces: nonceData.detected_mempool_nonces || [],
            pendingCount: mempoolCount,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Nonce gaps API error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
