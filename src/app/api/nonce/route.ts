import { NextRequest, NextResponse } from 'next/server';

const STACKS_API = 'https://api.mainnet.hiro.so';

// ---------- GET /api/nonce?address=... ----------
export async function GET(req: NextRequest) {
    try {
        const address = req.nextUrl.searchParams.get('address');
        if (!address) {
            return NextResponse.json({ error: 'Missing address parameter.' }, { status: 400 });
        }

        // Get confirmed nonce
        const accountRes = await fetch(
            `${STACKS_API}/v2/accounts/${address}?proof=0`,
            {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            }
        );

        if (!accountRes.ok) {
            const text = await accountRes.text();
            console.error('Stacks API nonce error:', accountRes.status, text);
            return NextResponse.json(
                { error: `Stacks API error: ${accountRes.statusText}` },
                { status: accountRes.status }
            );
        }

        const accountData = await accountRes.json();

        // Get pending nonce (accounts for in-mempool txs)
        let possibleNextNonce = accountData.nonce;
        try {
            const nonceRes = await fetch(
                `${STACKS_API}/extended/v1/address/${address}/nonces`,
                {
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                }
            );
            if (nonceRes.ok) {
                const nonceData = await nonceRes.json();
                possibleNextNonce = nonceData.possible_next_nonce ?? accountData.nonce;
            }
        } catch {
            // Fallback to confirmed nonce
        }

        return NextResponse.json({
            confirmedNonce: accountData.nonce,
            possibleNextNonce,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Nonce API error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
