'use client';

import React, { useState, useCallback } from 'react';
import { buildFillerTx, fetchFeeEstimate } from '@/lib/stacks';
import { STACKS_EXPLORER_TX } from '@/lib/constants';

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
    const [isBumping, setIsBumping] = useState(false);
    const [results, setResults] = useState<FillerResult[]>([]);
    const [bumpResults, setBumpResults] = useState<FillerResult[]>([]);
    const [error, setError] = useState('');

    // ---------- Check for nonce gaps ----------
    const checkGaps = useCallback(async () => {
        setIsChecking(true);
        setError('');
        setResults([]);
        setBumpResults([]);
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

        // Get competitive fee
        const fees = await fetchFeeEstimate();
        const fee = fees.high; // Use high fee for gap fillers to ensure inclusion

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
                const signedHex = await buildFillerTx({
                    senderKey,
                    recipientAddress: address,
                    nonce,
                    fee,
                });

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
        setTimeout(() => checkGaps(), 3000);
    }, [gapInfo, senderKey, address, checkGaps]);

    // ---------- Bump fees for stuck pending txs ----------
    const bumpFees = useCallback(async () => {
        if (!gapInfo || gapInfo.mempoolNonces.length === 0) return;

        setIsBumping(true);
        setError('');
        const sortedNonces = [...gapInfo.mempoolNonces].sort((a, b) => a - b);

        // Get competitive fee — use high tier for RBF
        const fees = await fetchFeeEstimate();
        const fee = fees.high;

        const initialResults: FillerResult[] = sortedNonces.map((n) => ({
            nonce: n,
            status: 'pending' as const,
        }));
        setBumpResults(initialResults);
        const updatedResults = [...initialResults];

        for (let i = 0; i < sortedNonces.length; i++) {
            const nonce = sortedNonces[i];
            updatedResults[i] = { ...updatedResults[i], status: 'sending' };
            setBumpResults([...updatedResults]);

            try {
                // Deploy a replacement contract at the same nonce with higher fee
                const signedHex = await buildFillerTx({
                    senderKey,
                    recipientAddress: address,
                    nonce,
                    fee,
                });

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
            setBumpResults([...updatedResults]);

            // Small delay between broadcasts to avoid rate limits
            if (i < sortedNonces.length - 1) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        setIsBumping(false);
        setTimeout(() => checkGaps(), 5000);
    }, [gapInfo, senderKey, address, checkGaps]);

    const hasGaps = gapInfo && gapInfo.missingNonces.length > 0;
    const hasPending = gapInfo && gapInfo.mempoolNonces.length > 0;
    const allGapsFixed = results.length > 0 && results.every((r) => r.status === 'success');
    const allBumped = bumpResults.length > 0 && bumpResults.every((r) => r.status === 'success');
    const hasBumpFailed = bumpResults.length > 0 && bumpResults.some((r) => r.status === 'failed') && !isBumping;
    const hasGapFailed = results.length > 0 && results.some((r) => r.status === 'failed') && !isFixing;

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
                        Check for stuck transactions and fix them with one click.
                    </p>
                    <button className="btn btn-secondary" onClick={checkGaps} disabled={isChecking}>
                        {isChecking ? (
                            <><span className="spinner spinner-sm" /> Checking…</>
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

                    {/* No issues */}
                    {!hasGaps && !hasPending && (
                        <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                            ✅ No issues detected. All transactions are healthy.
                        </div>
                    )}

                    {/* ===== Missing Nonces Section ===== */}
                    {hasGaps && !allGapsFixed && (
                        <>
                            <div className="warning-banner" style={{ marginTop: '0.75rem' }}>
                                <strong>⚠️ {gapInfo.missingNonces.length} missing nonce(s) blocking {gapInfo.pendingCount} pending transactions</strong>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                                    Missing: <code>{gapInfo.missingNonces.sort((a, b) => a - b).join(', ')}</code>
                                </p>
                            </div>
                            {results.length === 0 && (
                                <button className="btn btn-warning" onClick={fixGaps} disabled={isFixing} style={{ marginTop: '0.5rem' }}>
                                    {isFixing ? <><span className="spinner spinner-sm" /> Fixing…</> : `🔧 Fix ${gapInfo.missingNonces.length} Missing Nonce(s)`}
                                </button>
                            )}
                        </>
                    )}

                    {/* Gap fix results */}
                    {results.length > 0 && (
                        <ResultsList results={results} label="Gap Fix" />
                    )}
                    {hasGapFailed && (
                        <button className="btn btn-warning" onClick={() => { setResults([]); fixGaps(); }} style={{ marginTop: '0.5rem' }}>
                            🔄 Retry Gap Fix
                        </button>
                    )}

                    {/* ===== Fee Bump Section ===== */}
                    {hasPending && !hasGaps && bumpResults.length === 0 && (
                        <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', marginBottom: '0.5rem' }}>
                                <strong>⏳ {gapInfo.mempoolNonces.length} pending transaction(s) with low fees</strong>
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
                                    Nonces {gapInfo.mempoolNonces[0]}–{gapInfo.mempoolNonces[gapInfo.mempoolNonces.length - 1]} are
                                    stuck because their fees are too low for miners. Bump to a competitive fee to get them confirmed.
                                </p>
                            </div>
                            <button className="btn btn-warning" onClick={bumpFees} disabled={isBumping}>
                                {isBumping ? (
                                    <><span className="spinner spinner-sm" /> Bumping fees…</>
                                ) : (
                                    `🚀 Bump Fees for ${gapInfo.mempoolNonces.length} Transaction(s)`
                                )}
                            </button>
                        </div>
                    )}

                    {/* Bump results */}
                    {bumpResults.length > 0 && (
                        <ResultsList results={bumpResults} label="Fee Bump" />
                    )}
                    {allBumped && (
                        <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                            ✅ All {bumpResults.length} transactions bumped with competitive fees! They should confirm within 1-2 blocks.
                        </div>
                    )}
                    {hasBumpFailed && (
                        <button className="btn btn-warning" onClick={() => { setBumpResults([]); bumpFees(); }} style={{ marginTop: '0.5rem' }}>
                            🔄 Retry Fee Bump
                        </button>
                    )}

                    {/* Re-check */}
                    <button className="btn btn-ghost" onClick={checkGaps} disabled={isChecking} style={{ marginTop: '0.5rem' }}>
                        {isChecking ? 'Checking…' : '🔄 Re-check'}
                    </button>
                </div>
            )}
        </div>
    );
}

// ---------- Shared Results List ----------
function ResultsList({ results, label }: { results: FillerResult[]; label: string }) {
    const done = results.filter((r) => r.status === 'success').length;
    const total = results.length;

    return (
        <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                {label}: {done}/{total} complete
            </div>
            {/* Progress bar */}
            <div className="progress-bar-container">
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
                </div>
            </div>
            <div className="nonce-fix-list" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {results.map((r) => (
                    <div key={r.nonce} className={`nonce-fix-row nonce-fix-${r.status}`}>
                        <span className="nonce-fix-nonce">#{r.nonce}</span>
                        <span className="nonce-fix-status">
                            {r.status === 'pending' && '⏳'}
                            {r.status === 'sending' && <span className="spinner spinner-sm" />}
                            {r.status === 'success' && '✅'}
                            {r.status === 'failed' && `❌ ${r.error?.slice(0, 60)}`}
                        </span>
                        {r.txId && (
                            <a href={`${STACKS_EXPLORER_TX}/${r.txId}?chain=mainnet`} target="_blank" rel="noopener noreferrer" className="tx-link">
                                View ↗
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
