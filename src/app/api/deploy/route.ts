import { NextRequest, NextResponse } from 'next/server';

const STACKS_API = 'https://api.mainnet.hiro.so';

// ---------- Simple in-memory rate limiter ----------
const requestLog = new Map<string, number[]>();
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const timestamps = (requestLog.get(ip) || []).filter((t) => t > windowStart);
    timestamps.push(now);
    requestLog.set(ip, timestamps);
    return timestamps.length > RATE_LIMIT_MAX;
}

// ---------- Broadcast with retry ----------
const BROADCAST_MAX_RETRIES = 3;
const BROADCAST_RETRY_DELAY_MS = 3000;

async function broadcastWithRetry(txBytes: Uint8Array): Promise<Response> {
    for (let attempt = 1; attempt <= BROADCAST_MAX_RETRIES; attempt++) {
        const res = await fetch(`${STACKS_API}/v2/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: Buffer.from(txBytes),
        });

        // If rate-limited by Hiro, wait and retry
        if (res.status === 429 && attempt < BROADCAST_MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BROADCAST_RETRY_DELAY_MS * attempt));
            continue;
        }

        return res;
    }

    // Shouldn't reach here, but just in case
    return fetch(`${STACKS_API}/v2/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(txBytes),
    });
}

// ---------- POST /api/deploy ----------
export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please slow down and try again.' },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { signedTxHex } = body;

        if (!signedTxHex || typeof signedTxHex !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid signedTxHex field.' },
                { status: 400 }
            );
        }

        // Convert hex to bytes
        const txBytes = new Uint8Array(
            signedTxHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
        );

        // Relay to Stacks node with retry on 429
        const res = await broadcastWithRetry(txBytes);

        const responseText = await res.text();

        let data: Record<string, unknown>;
        try {
            data = JSON.parse(responseText);
        } catch {
            // Plain string txid
            return NextResponse.json({ txId: responseText.replace(/"/g, ''), status: 'submitted' });
        }

        if (!res.ok || data.error || data.message) {
            const errorMsg = (data.error || data.message || 'Broadcast rejected') as string;
            const errorDetail = [
                errorMsg,
                data.reason ? `Reason: ${data.reason}` : '',
                data.reason_data ? `Detail: ${JSON.stringify(data.reason_data)}` : '',
            ].filter(Boolean).join(' | ');

            console.error('Stacks API rejection:', errorDetail);

            return NextResponse.json(
                {
                    error: errorMsg,
                    reason: data.reason || '',
                    reasonData: data.reason_data || null,
                    txId: null,
                    status: 'rejected',
                },
                { status: res.status >= 400 ? res.status : 400 }
            );
        }

        return NextResponse.json({
            txId: data.txid || responseText.replace(/"/g, ''),
            status: 'submitted',
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Deploy API error:', message);
        return NextResponse.json({ error: message, status: 'error' }, { status: 500 });
    }
}
