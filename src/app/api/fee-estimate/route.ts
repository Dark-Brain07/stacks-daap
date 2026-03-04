import { NextRequest, NextResponse } from 'next/server';

const STACKS_API = 'https://api.mainnet.hiro.so';

interface FeeEstimation {
    fee_rate: number;
    fee: number;
}

interface FeeEstimateResponse {
    estimations: FeeEstimation[];
    cost_scalar_change_by_byte: number;
}

// ---------- POST /api/fee-estimate ----------
// Accepts: { transaction_payload: string, estimated_len?: number }
// Returns: { low, medium, high } fee estimates in µSTX
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { transaction_payload, estimated_len } = body;

        if (!transaction_payload) {
            return NextResponse.json({ error: 'Missing transaction_payload' }, { status: 400 });
        }

        // Try the Stacks fee estimation API
        try {
            const feeRes = await fetch(`${STACKS_API}/v2/fees/transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transaction_payload,
                    estimated_len: estimated_len || null,
                }),
            });

            if (feeRes.ok) {
                const feeData: FeeEstimateResponse = await feeRes.json();

                if (feeData.estimations && feeData.estimations.length >= 3) {
                    return NextResponse.json({
                        low: Math.max(feeData.estimations[0].fee, 1000),
                        medium: Math.max(feeData.estimations[1].fee, 2000),
                        high: Math.max(feeData.estimations[2].fee, 5000),
                        source: 'api',
                    });
                }
            }
        } catch {
            // Fall through to mempool-based estimation
        }

        // Fallback: use mempool stats for estimation
        const statsRes = await fetch(`${STACKS_API}/extended/v1/tx/mempool/stats`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });

        if (statsRes.ok) {
            const stats = await statsRes.json();
            const scFees = stats.tx_simple_fee_averages?.smart_contract;

            if (scFees) {
                // Use mempool percentiles with safety margins
                const low = Math.max(scFees.p50 || 3000, 3000);
                const medium = Math.max(scFees.p75 || 5000, 5000);
                const high = Math.max((scFees.p95 || 10000) * 1.2, 10000);

                return NextResponse.json({
                    low,
                    medium: Math.round(medium),
                    high: Math.round(high),
                    source: 'mempool_stats',
                });
            }
        }

        // Ultimate fallback: safe defaults
        return NextResponse.json({
            low: 5000,    // 0.005 STX
            medium: 10000, // 0.01 STX
            high: 20000,   // 0.02 STX
            source: 'default',
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Fee estimate error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ---------- GET /api/fee-estimate ----------
// Quick fee estimate without a specific transaction
export async function GET() {
    try {
        // Get mempool stats for smart contracts
        const statsRes = await fetch(`${STACKS_API}/extended/v1/tx/mempool/stats`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });

        if (statsRes.ok) {
            const stats = await statsRes.json();
            const scFees = stats.tx_simple_fee_averages?.smart_contract;

            if (scFees) {
                const low = Math.max(scFees.p50 || 3000, 3000);
                const medium = Math.max(scFees.p75 || 5000, 5000);
                const high = Math.max((scFees.p95 || 10000) * 1.2, 10000);

                return NextResponse.json({
                    low,
                    medium: Math.round(medium),
                    high: Math.round(high),
                    source: 'mempool_stats',
                });
            }
        }

        // Fallback
        return NextResponse.json({
            low: 5000,
            medium: 10000,
            high: 20000,
            source: 'default',
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
