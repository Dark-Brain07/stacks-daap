'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { STACKS_EXPLORER_TX } from '@/lib/constants';

interface QueueTx {
    contractName: string;
    nonce: number;
    status: 'queued' | 'broadcasting' | 'success' | 'failed';
    txId?: string;
    error?: string;
    attempts: number;
}

interface QueueMeta {
    id: string;
    address: string;
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
    createdAt: number;
    updatedAt: number;
    isProcessing: boolean;
}

interface Props {
    onClear: () => void;
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export default function ServerQueueProgress({ onClear }: Props) {
    const [meta, setMeta] = useState<QueueMeta | null>(null);
    const [txs, setTxs] = useState<QueueTx[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/queue');
            const data = await res.json();
            if (data.error) {
                setError(data.error);
                return;
            }
            if (data.active) {
                setMeta(data.meta);
                setTxs(data.transactions || []);
            } else {
                setMeta(null);
                setTxs([]);
            }
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch status');
        } finally {
            setLoading(false);
        }
    }, []);

    // Poll every 10 seconds
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10_000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleClear = async () => {
        if (!confirm('Clear the deployment queue? This cannot be undone.')) return;
        try {
            await fetch('/api/queue', { method: 'DELETE' });
            setMeta(null);
            setTxs([]);
            onClear();
        } catch {
            // ignore
        }
    };

    if (loading) {
        return (
            <div className="card">
                <div className="card-header">
                    <span className="spinner" />
                    <h3>Loading queue status...</h3>
                </div>
            </div>
        );
    }

    if (!meta) return null;

    const pct = meta.total > 0 ? ((meta.succeeded + meta.failed) / meta.total) * 100 : 0;
    const elapsed = Date.now() - meta.createdAt;
    const rate = elapsed > 0 && meta.succeeded > 0
        ? (meta.succeeded / (elapsed / 3_600_000))
        : 0;
    const remaining = rate > 0 ? (meta.pending / rate) * 3_600_000 : 0;
    const isComplete = meta.pending === 0;

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <h3>Server-Side Deployment {meta.isProcessing && '(Processing...)'}</h3>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* Progress bar */}
            <div className="progress-bar-container">
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="progress-text">
                    {(meta.succeeded + meta.failed).toLocaleString()} / {meta.total.toLocaleString()} ({pct.toFixed(1)}%)
                </span>
            </div>

            {/* Time stats */}
            <div className="deploy-stats" style={{ marginBottom: '0.75rem' }}>
                <div className="deploy-stat">
                    <span className="deploy-stat-value" style={{ fontSize: '1rem' }}>
                        {formatDuration(elapsed)}
                    </span>
                    <span className="deploy-stat-label">Elapsed</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value" style={{ fontSize: '1rem' }}>
                        {rate > 0 ? `~${Math.round(rate)}/hr` : '---'}
                    </span>
                    <span className="deploy-stat-label">Rate</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value" style={{ fontSize: '1rem' }}>
                        {remaining > 0 && !isComplete ? `~${formatDuration(remaining)}` : isComplete ? 'Done!' : '---'}
                    </span>
                    <span className="deploy-stat-label">ETA</span>
                </div>
            </div>

            {/* Status counters */}
            <div className="deploy-stats">
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-pending">
                        {meta.pending.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Pending</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-success">
                        {meta.succeeded.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Succeeded</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-failed">
                        {meta.failed.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Failed</span>
                </div>
            </div>

            {/* Info banner */}
            {!isComplete && (
                <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>
                        Cron job runs every 10 min. You can <strong>close this page</strong> — deployment continues on the server.
                    </span>
                </div>
            )}

            {isComplete && (
                <div className="success-banner" style={{ marginTop: '0.75rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>Deployment complete! 🎉</span>
                </div>
            )}

            {/* Tx list */}
            <div className="tx-list" style={{ marginTop: '0.75rem' }}>
                {txs.map((tx) => (
                    <div
                        key={tx.contractName}
                        className={`tx-row ${tx.status === 'success' ? 'tx-success'
                                : tx.status === 'failed' ? 'tx-failed'
                                    : tx.status === 'broadcasting' ? 'tx-active'
                                        : 'tx-pending'
                            }`}
                    >
                        <span className="tx-name">{tx.contractName}</span>
                        <span className="tx-status-label">{tx.status}</span>
                        {tx.txId && (
                            <a
                                href={`${STACKS_EXPLORER_TX}/${tx.txId}?chain=mainnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tx-link"
                            >
                                View ↗
                            </a>
                        )}
                        {tx.error && <span className="tx-error" title={tx.error}>{tx.error.slice(0, 50)}</span>}
                    </div>
                ))}
            </div>

            {/* Clear button */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-danger" onClick={handleClear}>
                    Clear Queue
                </button>
                <button className="btn" onClick={fetchStatus}>
                    Refresh
                </button>
            </div>
        </div>
    );
}
