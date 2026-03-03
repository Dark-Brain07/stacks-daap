'use client';

import React from 'react';
import { DEPLOY_FEE_STX } from '@/lib/constants';

interface Props {
    balanceStx: number;
    contractCount: number;
    address: string;
}

export default function BalanceDisplay({ balanceStx, contractCount, address }: Props) {
    const requiredStx = contractCount * DEPLOY_FEE_STX;
    const sufficient = balanceStx >= requiredStx;

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <h3>Balance</h3>
            </div>

            <div className="balance-address">
                <span className="text-muted">Address:</span>
                <code className="address-code">{address}</code>
            </div>

            <div className="balance-grid">
                <div className="balance-item">
                    <span className="balance-label">Available</span>
                    <span className="balance-value">{balanceStx.toFixed(6)} STX</span>
                </div>
                <div className="balance-item">
                    <span className="balance-label">Fee per contract</span>
                    <span className="balance-value">{DEPLOY_FEE_STX} STX</span>
                </div>
                <div className="balance-item">
                    <span className="balance-label">Contracts to deploy</span>
                    <span className="balance-value">{contractCount.toLocaleString()}</span>
                </div>
                <div className={`balance-item ${sufficient ? 'balance-sufficient' : 'balance-insufficient'}`}>
                    <span className="balance-label">Required total</span>
                    <span className="balance-value">{requiredStx.toFixed(6)} STX</span>
                </div>
            </div>

            {!sufficient && contractCount > 0 && (
                <div className="error-banner">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>
                        Insufficient balance. You need <strong>{(requiredStx - balanceStx).toFixed(6)} STX</strong> more.
                    </span>
                </div>
            )}

            {sufficient && contractCount > 0 && (
                <div className="success-banner">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>Balance sufficient for deployment.</span>
                </div>
            )}
        </div>
    );
}
