'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { QueueProgress, TxStatus } from '@/lib/queue';
import { STACKS_EXPLORER_TX } from '@/lib/constants';

interface Props {
    progress: QueueProgress | null;
    isDeploying: boolean;
    onCancel: () => void;
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export default function DeploymentProgress({ progress, isDeploying, onCancel }: Props) {
    const [now, setNow] = useState(Date.now());

    // Re-render every second for live elapsed time
    useEffect(() => {
        if (!isDeploying) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [isDeploying]);

    const pct = progress ? (progress.total > 0 ? (progress.completed / progress.total) * 100 : 0) : 0;

    // Calculate time stats
    const elapsed = progress ? now - progress.startedAt : 0;
    const rate = progress && elapsed > 0 && progress.succeeded > 0
        ? (progress.succeeded / (elapsed / 3_600_000)) // contracts per hour
        : 0;
    const remaining = progress && rate > 0
        ? ((progress.total - progress.completed) / rate) * 3_600_000
        : 0;

    // Show only first 50 + last 10 if too many
    const displayStatuses = useMemo(() => {
        if (!progress) return [];
        if (progress.statuses.length <= 60) return progress.statuses;
        return [
            ...progress.statuses.slice(0, 50),
            ...progress.statuses.slice(-10),
        ];
    }, [progress]);

    if (!progress) return null;

    const showGap = progress.statuses.length > 60;

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <h3>Deployment Progress</h3>
            </div>

            {/* Progress bar */}
            <div className="progress-bar-container">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="progress-text">
                    {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} ({pct.toFixed(1)}%)
                </span>
            </div>

            {/* Batch info */}
            {progress.currentBatch && progress.totalBatches && progress.totalBatches > 1 && (
                <div style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
                    Batch {progress.currentBatch} of {progress.totalBatches} (max 25 txs per batch — Stacks mempool limit)
                </div>
            )}

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
                        {remaining > 0 ? `~${formatDuration(remaining)}` : '---'}
                    </span>
                    <span className="deploy-stat-label">ETA</span>
                </div>
            </div>

            {/* Tx stats grid */}
            <div className="deploy-stats">
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-pending">
                        {progress.pending.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Pending</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-success">
                        {progress.succeeded.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Succeeded</span>
                </div>
                <div className="deploy-stat">
                    <span className="deploy-stat-value deploy-stat-failed">
                        {progress.failed.toLocaleString()}
                    </span>
                    <span className="deploy-stat-label">Failed</span>
                </div>
            </div>

            {/* Cancel button */}
            {isDeploying && (
                <button className="btn btn-danger" onClick={onCancel} style={{ marginBottom: '1rem' }}>
                    Cancel Deployment
                </button>
            )}

            {/* Tx list */}
            <div className="tx-list">
                {displayStatuses.map((tx) => (
                    <TxRow key={tx.contractName} tx={tx} />
                ))}
                {showGap && (
                    <div className="tx-row" style={{ justifyContent: 'center', opacity: 0.5 }}>
                        … {progress.statuses.length - 60} more …
                    </div>
                )}
            </div>
        </div>
    );
}

function TxRow({ tx }: { tx: TxStatus }) {
    const statusClass =
        tx.status === 'success'
            ? 'tx-success'
            : tx.status === 'failed'
                ? 'tx-failed'
                : tx.status === 'broadcasting' || tx.status === 'signing'
                    ? 'tx-active'
                    : 'tx-pending';

    return (
        <div className={`tx-row ${statusClass}`}>
            <StatusIcon status={tx.status} />
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
            {tx.error && <span className="tx-error" title={tx.error}>{tx.error.slice(0, 60)}</span>}
        </div>
    );
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'success') {
        return (
            <svg className="tx-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        );
    }
    if (status === 'failed') {
        return (
            <svg className="tx-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        );
    }
    if (status === 'broadcasting' || status === 'signing') {
        return <span className="spinner spinner-sm" />;
    }
    if (status === 'waiting') {
        return (
            <svg className="tx-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
        );
    }
    return (
        <svg className="tx-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
        </svg>
    );
}
