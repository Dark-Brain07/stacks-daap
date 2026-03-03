import { NextRequest, NextResponse } from 'next/server';

const STACKS_API = 'https://api.mainnet.hiro.so';

// ---------- GET /api/balance?address=... ----------
export async function GET(req: NextRequest) {
    try {
        const address = req.nextUrl.searchParams.get('address');
        if (!address) {
            return NextResponse.json({ error: 'Missing address parameter.' }, { status: 400 });
        }

        const res = await fetch(`${STACKS_API}/v2/accounts/${address}?proof=0`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('Stacks API error:', res.status, text);
            return NextResponse.json(
                { error: `Stacks API error: ${res.statusText}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        const balanceBigInt = BigInt(data.balance);
        const balanceStx = Number(balanceBigInt) / 1_000_000;

        return NextResponse.json({
            balance: data.balance,
            locked: data.locked,
            nonce: data.nonce,
            balanceStx: balanceStx.toFixed(6),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Balance API error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
