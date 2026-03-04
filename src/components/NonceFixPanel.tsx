'use client';

import React, { useState, useCallback } from 'react';
import { buildFillerTx } from '@/lib/stacks';
import { FILLER_FEE_STX, STACKS_EXPLORER_TX } from '@/lib/constants';

interface NonceGapInfo {
    lastExecutedNonce: number;
    lastMempoolNonce: number;
    possibleNextNonce: number;
    missingNonces: number[];
    mempoolNonces: number[];
    pendingCount: number;
}

interface FillerResult {
    nonce: number;
    status: 'pending' | 'sending' | 'success' | 'failed';
    txId?: string;
    error?: string;
}

interface Props {
    address: string;
    senderKey: string;
}

export default function NonceFixPanel({ address, senderKey }: Props) {
    const [gapInfo, setGapInfo] = useState<NonceGapInfo | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [results, setResults] = useState<FillerResult[]>([]);
    const [error, setError] = useState('');

    // ---------- Check for nonce gaps ----------
    const checkGaps = useCallback(async () => {
        setIsChecking(true);
        setError('');
        setResults([]);
        try {
            const res = await fetch(`/api/nonce-gaps?address=${address}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setGapInfo(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to check nonce gaps');
        } finally {
            setIsChecking(false);
        }
    }, [address]);

    // ---------- Fix missing nonces ----------
    const fixGaps = useCallback(async () => {
        if (!gapInfo || gapInfo.missingNonces.length === 0) return;

        setIsFixing(true);
        setError('');
        const sortedNonces = [...gapInfo.missingNonces].sort((a, b) => a - b);

        const initialResults: FillerResult[] = sortedNonces.map((n) => ({
            nonce: n,
            status: 'pending' as const,
        }));
        setResults(initialResults);

        const updatedResults = [...initialResults];

        for (let i = 0; i < sortedNonces.length; i++) {
            const nonce = sortedNonces[i];
            updatedResults[i] = { ...updatedResults[i], status: 'sending' };
            setResults([...updatedResults]);

            try {
                // Build filler tx (self-transfer of 1 µSTX)
                const signedHex = await buildFillerTx({
                    senderKey,
                    recipientAddress: address,
                    nonce,
                });

                // Broadcast via deploy API
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signedTxHex: signedHex }),
                });
                const data = await res.json();

                if (data.error) {
                    const errMsg = data.reason ? `${data.error} (${data.reason})` : data.error;
                    updatedResults[i] = { ...updatedResults[i], status: 'failed', error: errMsg };
                } else {
                    updatedResults[i] = { ...updatedResults[i], status: 'success', txId: data.txId };
                }
            } catch (err: unknown) {
                updatedResults[i] = {
                    ...updatedResults[i],
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Unknown error',
                };
            }
            setResults([...updatedResults]);
        }

        setIsFixing(false);

        // Refresh gap info after fixing
        setTimeout(() => checkGaps(), 3000);
    }, [gapInfo, senderKey, address, checkGaps]);

    const totalFillerCost = gapInfo ? gapInfo.missingNonces.length * FILLER_FEE_STX : 0;
    const hasGaps = gapInfo && gapInfo.missingNonces.length > 0;
    const allFixed = results.length > 0 && results.every((r) => r.status === 'success');
    const hasFailed = results.length > 0 && results.some((r) => r.status === 'failed') && !isFixing;

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                </svg>
                <h3>Transaction Health</h3>
            </div>

            {/* Check button */}
            {!gapInfo && (
                <div>
                    <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
                        Check if this wallet has stuck pending transactions due to missing nonce gaps.
                    </p>
                    <button className="btn btn-secondary" onClick={checkGaps} disabled={isChecking}>
                        {isChecking ? (
                            <>
                                <span className="spinner spinner-sm" />
                                Checking…
                            </>
                        ) : (
                            '🔍 Check for Stuck Transactions'
                        )}
                    </button>
                </div>
            )}

            {error && <div className="error-banner" style={{ marginTop: '0.5rem' }}>{error}</div>}

            {/* Results */}
            {gapInfo && (
                <div className="nonce-fix-results">
                    {/* Status grid */}
                    <div className="nonce-stats">
                        <div className="nonce-stat">
                            <span className="nonce-stat-value">{gapInfo.lastExecutedNonce}</span>
                            <span className="nonce-stat-label">Last Confirmed</span>
                        </div>
                        <div className="nonce-stat">
                            <span className="nonce-stat-value">{gapInfo.pendingCount}</span>
                            <span className="nonce-stat-label">Pending TXs</span>
                        </div>
                        <div className="nonce-stat">
                            <span className={`nonce-stat-value ${hasGaps ? 'nonce-stat-danger' : 'nonce-stat-ok'}`}>
                                {gapInfo.missingNonces.length}
                            </span>
                            <span className="nonce-stat-label">Missing Nonces</span>
                        </div>
                    </div>

                    {/* No gaps — all good */}
                    {!hasGaps && (
                        <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <span>No nonce gaps detected. All pending transactions should process normally.</span>
                        </div>
                    )}

                    {/* Has gaps — show fix UI */}
                    {hasGaps && !allFixed && (
                        <>
                            <div className="warning-banner" style={{ marginTop: '0.75rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 9v4m0 4h.01M10.29 3.86l-8.58 14.02a1 1 0 0 0 .86 1.5h17.14a1 1 0 0 0 .86-1.5l-8.58-14.02a1 1 0 0 0-1.72 0z" />
                                </svg>
                                <div>
                                    <strong>{gapInfo.missingNonces.length} missing nonce(s) blocking {gapInfo.pendingCount} pending transactions</strong>
                                    <p>
                                        Missing: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                            {gapInfo.missingNonces.sort((a, b) => a - b).join(', ')}
                                        </code>
                                    </p>
                                    <p style={{ marginTop: '0.25rem' }}>
                                        Fix by sending {gapInfo.missingNonces.length} filler transaction(s) — total cost: <strong>{totalFillerCost.toFixed(4)} STX</strong>
                                    </p>
                                </div>
                            </div>

                            {results.length === 0 && (
                                <button
                                    className="btn btn-warning"
                                    onClick={fixGaps}
                                    disabled={isFixing}
                                    style={{ marginTop: '0.75rem' }}
                                >
                                    {isFixing ? (
                                        <>
                                            <span className="spinner spinner-sm" />
                                            Fixing…
                                        </>
                                    ) : (
                                        `🔧 Fix ${gapInfo.missingNonces.length} Missing Nonce(s)`
                                    )}
                                </button>
                            )}
                        </>
                    )}

                    {/* Fix progress */}
                    {results.length > 0 && (
                        <div className="nonce-fix-list" style={{ marginTop: '0.75rem' }}>
                            {results.map((r) => (
                                <div key={r.nonce} className={`nonce-fix-row nonce-fix-${r.status}`}>
                                    <span className="nonce-fix-nonce">Nonce {r.nonce}</span>
                                    <span className="nonce-fix-status">
                                        {r.status === 'pending' && '⏳ Waiting'}
                                        {r.status === 'sending' && (
                                            <><span className="spinner spinner-sm" /> Sending…</>
                                        )}
                                        {r.status === 'success' && '✅ Sent'}
                                        {r.status === 'failed' && `❌ ${r.error?.slice(0, 80)}`}
                                    </span>
                                    {r.txId && (
                                        <a
                                            href={`${STACKS_EXPLORER_TX}/${r.txId}?chain=mainnet`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tx-link"
                                        >
                                            View ↗
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* All fixed success */}
                    {allFixed && (
                        <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <span>
                                All nonce gaps filled! Your {gapInfo.pendingCount} pending transactions should now process in order.
                            </span>
                        </div>
                    )}

                    {/* Retry button after failures */}
                    {hasFailed && (
                        <button
                            className="btn btn-warning"
                            onClick={() => { setResults([]); fixGaps(); }}
                            style={{ marginTop: '0.5rem' }}
                        >
                            🔄 Retry Failed Nonces
                        </button>
                    )}

                    {/* Re-check button */}
                    <button
                        className="btn btn-ghost"
                        onClick={checkGaps}
                        disabled={isChecking}
                        style={{ marginTop: '0.5rem' }}
                    >
                        {isChecking ? 'Checking…' : '🔄 Re-check'}
                    </button>
                </div>
            )}
        </div>
    );
}
