'use client';

import React, { useState } from 'react';

interface Props {
    onConfirm: () => void;
    confirmed: boolean;
    onConfirmChange: (v: boolean) => void;
}

export default function MainnetWarning({ onConfirm, confirmed, onConfirmChange }: Props) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed && confirmed) return null;

    return (
        <div className="mainnet-warning">
            <div className="mainnet-warning-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86l-8.58 14.02a1 1 0 0 0 .86 1.5h17.14a1 1 0 0 0 .86-1.5l-8.58-14.02a1 1 0 0 0-1.72 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            </div>
            <h2 className="mainnet-warning-title">⚠️ Stacks Mainnet</h2>
            <p className="mainnet-warning-text">
                You are deploying to <strong>Stacks Mainnet</strong>. This uses <strong>real STX tokens</strong>.
                All transactions are irreversible. Verify all contract code before deploying.
            </p>
            <ul className="mainnet-warning-list">
                <li>Each deployment costs <strong>0.003 STX</strong> in gas fees</li>
                <li>Deployed contracts are <strong>permanent and immutable</strong></li>
                <li>Ensure you have sufficient STX balance</li>
                <li>Double-check all contract names for duplicates</li>
            </ul>
            <label className="mainnet-checkbox">
                <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => onConfirmChange(e.target.checked)}
                />
                <span>I understand the risks and want to deploy to Stacks Mainnet</span>
            </label>
            {confirmed && (
                <button
                    className="btn btn-warning"
                    onClick={() => {
                        setDismissed(true);
                        onConfirm();
                    }}
                >
                    Proceed to Deployment
                </button>
            )}
        </div>
    );
}
