'use client';

import React, { useState, useCallback } from 'react';

interface Props {
    onSeedPhraseSubmit: (seedPhrase: string) => void;
    isLoading: boolean;
    isConnected: boolean;
}

export default function SeedPhraseInput({ onSeedPhraseSubmit, isLoading, isConnected }: Props) {
    const [seedPhrase, setSeedPhrase] = useState('');
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            const words = seedPhrase.trim().split(/\s+/);
            if (words.length !== 12 && words.length !== 24) {
                setError('Seed phrase must be 12 or 24 words.');
                return;
            }
            setError('');
            onSeedPhraseSubmit(seedPhrase.trim());
        },
        [seedPhrase, onSeedPhraseSubmit]
    );

    const handleClear = useCallback(() => {
        setSeedPhrase('');
        setError('');
    }, []);

    if (isConnected) {
        return (
            <div className="card card-success">
                <div className="card-header">
                    <div className="status-dot status-dot-success" />
                    <h3>Wallet Connected</h3>
                </div>
                <p className="text-muted">Your wallet is connected. Seed phrase is held in memory only.</p>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <h3>Connect Wallet</h3>
            </div>

            <div className="warning-banner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01M10.29 3.86l-8.58 14.02a1 1 0 0 0 .86 1.5h17.14a1 1 0 0 0 .86-1.5l-8.58-14.02a1 1 0 0 0-1.72 0z" />
                </svg>
                <div>
                    <strong>Security Notice</strong>
                    <p>Your seed phrase is processed entirely in your browser. It is never sent to any server, stored, or logged.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="seed-form">
                <label className="input-label">
                    Enter your Stacks seed phrase (12 or 24 words)
                </label>
                <div className="seed-input-wrapper">
                    <textarea
                        className={`seed-input ${error ? 'seed-input-error' : ''}`}
                        value={seedPhrase}
                        onChange={(e) => setSeedPhrase(e.target.value)}
                        placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                        rows={3}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        style={{
                            WebkitTextSecurity: visible ? 'none' : 'disc',
                        } as React.CSSProperties}
                    />
                    <button
                        type="button"
                        className="btn-icon toggle-visibility"
                        onClick={() => setVisible(!visible)}
                        title={visible ? 'Hide seed phrase' : 'Show seed phrase'}
                    >
                        {visible ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        )}
                    </button>
                </div>

                {error && <p className="input-error">{error}</p>}

                <div className="btn-row">
                    <button type="submit" className="btn btn-primary" disabled={isLoading || !seedPhrase.trim()}>
                        {isLoading ? (
                            <>
                                <span className="spinner" />
                                Deriving Keys…
                            </>
                        ) : (
                            'Connect Wallet'
                        )}
                    </button>
                    {seedPhrase && (
                        <button type="button" className="btn btn-ghost" onClick={handleClear}>
                            Clear
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
