'use client';

import React, { useState, useCallback, useRef } from 'react';
import SeedPhraseInput from '@/components/SeedPhraseInput';
import BalanceDisplay from '@/components/BalanceDisplay';
import MainnetWarning from '@/components/MainnetWarning';
import ContractUploader, { ContractItem } from '@/components/ContractUploader';
import DeploymentProgress from '@/components/DeploymentProgress';
import ServerQueueProgress from '@/components/ServerQueueProgress';
import { deriveAccount, buildSignedDeployTx, DerivedAccount } from '@/lib/stacks';
import { findDuplicateNames } from '@/lib/clarity-validator';
import { runDeploymentQueue, QueueProgress, DeployJob } from '@/lib/queue';
import { DEPLOY_FEE_STX } from '@/lib/constants';

type DeployMode = 'live' | 'server';

export default function HomePage() {
  // ---------- State ----------
  const [account, setAccount] = useState<DerivedAccount | null>(null);
  const [senderKey, setSenderKey] = useState('');
  const [balanceStx, setBalanceStx] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [mainnetConfirmed, setMainnetConfirmed] = useState(false);
  const [mainnetProceeded, setMainnetProceeded] = useState(false);

  const [deployMode, setDeployMode] = useState<DeployMode>('server');
  const [isDeploying, setIsDeploying] = useState(false);
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const [deployError, setDeployError] = useState('');

  // Server queue state
  const [isSigning, setIsSigning] = useState(false);
  const [signingProgress, setSigningProgress] = useState({ current: 0, total: 0 });
  const [serverQueued, setServerQueued] = useState(false);

  const cancelledRef = useRef(false);

  // ---------- Connect wallet ----------
  const handleConnect = useCallback(async (seedPhrase: string) => {
    setIsConnecting(true);
    setConnectError('');
    try {
      const derived = await deriveAccount(seedPhrase);
      setAccount(derived);
      setSenderKey(derived.stxPrivateKey);

      const res = await fetch(`/api/balance?address=${derived.stxAddress}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBalanceStx(parseFloat(data.balanceStx));
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect');
      setAccount(null);
      setSenderKey('');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ---------- Server-Side Deploy (Pre-Sign + Queue) ----------
  const handleServerDeploy = useCallback(async () => {
    if (!account || !senderKey) return;

    const validContracts = contracts.filter((c) => c.valid);
    if (validContracts.length === 0) {
      setDeployError('No valid contracts to deploy.');
      return;
    }

    const duplicates = findDuplicateNames(validContracts.map((c) => c.name));
    if (duplicates.length > 0) {
      setDeployError(`Duplicate contract names: ${duplicates.join(', ')}`);
      return;
    }

    const requiredStx = validContracts.length * DEPLOY_FEE_STX;
    if (balanceStx < requiredStx) {
      setDeployError(`Insufficient balance. Need ${requiredStx.toFixed(6)} STX, have ${balanceStx.toFixed(6)} STX.`);
      return;
    }

    setDeployError('');
    setIsSigning(true);
    setSigningProgress({ current: 0, total: validContracts.length });

    try {
      // Fetch current nonce
      const nonceRes = await fetch(`/api/nonce?address=${account.stxAddress}`);
      const nonceData = await nonceRes.json();
      if (nonceData.error) throw new Error(nonceData.error);
      let currentNonce = nonceData.possibleNextNonce;

      // Sign all transactions client-side
      const signedTxs: { contractName: string; signedTxHex: string; nonce: number }[] = [];

      for (let i = 0; i < validContracts.length; i++) {
        const contract = validContracts[i];
        setSigningProgress({ current: i + 1, total: validContracts.length });

        const signedHex = await buildSignedDeployTx({
          contractName: contract.name,
          codeBody: contract.code,
          senderKey,
          nonce: currentNonce,
        });

        signedTxs.push({
          contractName: contract.name,
          signedTxHex: signedHex,
          nonce: currentNonce,
        });

        currentNonce++;
      }

      // Submit all signed txs to server queue
      const queueRes = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: account.stxAddress,
          transactions: signedTxs,
        }),
      });

      const queueData = await queueRes.json();
      if (queueData.error) throw new Error(queueData.error);

      setServerQueued(true);
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Failed to sign and queue');
    } finally {
      setIsSigning(false);
    }
  }, [account, senderKey, contracts, balanceStx]);

  // ---------- Live Deploy (Browser-Based) ----------
  const handleLiveDeploy = useCallback(async () => {
    if (!account || !senderKey) return;

    const validContracts = contracts.filter((c) => c.valid);
    if (validContracts.length === 0) {
      setDeployError('No valid contracts to deploy.');
      return;
    }

    const duplicates = findDuplicateNames(validContracts.map((c) => c.name));
    if (duplicates.length > 0) {
      setDeployError(`Duplicate contract names: ${duplicates.join(', ')}`);
      return;
    }

    const requiredStx = validContracts.length * DEPLOY_FEE_STX;
    if (balanceStx < requiredStx) {
      setDeployError(`Insufficient balance. Need ${requiredStx.toFixed(6)} STX, have ${balanceStx.toFixed(6)} STX.`);
      return;
    }

    setDeployError('');
    setIsDeploying(true);
    cancelledRef.current = false;

    try {
      const nonceRes = await fetch(`/api/nonce?address=${account.stxAddress}`);
      const nonceData = await nonceRes.json();
      if (nonceData.error) throw new Error(nonceData.error);
      const startNonce = nonceData.possibleNextNonce;

      const jobs: DeployJob[] = validContracts.map((c) => ({
        contractName: c.name,
        codeBody: c.code,
      }));

      await runDeploymentQueue(jobs, {
        senderKey,
        startNonce,
        onProgress: (p) => setProgress({ ...p }),
        buildAndSignTx: async (name, code, key, nonce) => {
          return buildSignedDeployTx({ contractName: name, codeBody: code, senderKey: key, nonce });
        },
        broadcastTx: async (signedHex) => {
          const res = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signedTxHex: signedHex }),
          });
          const data = await res.json();
          if (data.error) {
            const reason = data.reason ? ` (${data.reason})` : '';
            throw new Error(`${data.error}${reason}`);
          }
          return data.txId;
        },
        fetchNonce: async () => {
          const res = await fetch(`/api/nonce?address=${account!.stxAddress}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          return data.possibleNextNonce;
        },
        cancelled: () => cancelledRef.current,
      });
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  }, [account, senderKey, contracts, balanceStx]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  // ---------- Derived UI state ----------
  const validContractCount = contracts.filter((c) => c.valid).length;
  const readyToDeploy =
    account && mainnetConfirmed && mainnetProceeded && validContractCount > 0 && !isDeploying && !isSigning;

  return (
    <main className="page-container">
      {/* Hero */}
      <header className="hero">
        <div className="hero-glow" />
        <h1 className="hero-title">
          <span className="hero-icon">⚡</span>
          STAX Bulk Deployer
        </h1>
        <p className="hero-subtitle">
          Deploy up to 10,000 Clarity smart contracts to Stacks Mainnet
        </p>
      </header>

      <div className="flow">
        {/* Step 1: Connect */}
        <section className="step">
          <div className="step-number">1</div>
          <div className="step-content">
            <SeedPhraseInput
              onSeedPhraseSubmit={handleConnect}
              isLoading={isConnecting}
              isConnected={!!account}
            />
            {connectError && (
              <div className="error-banner" style={{ marginTop: '0.5rem' }}>
                {connectError}
              </div>
            )}
          </div>
        </section>

        {/* Step 2: Balance */}
        {account && (
          <section className="step fade-in">
            <div className="step-number">2</div>
            <div className="step-content">
              <BalanceDisplay
                balanceStx={balanceStx}
                contractCount={validContractCount}
                address={account.stxAddress}
              />
            </div>
          </section>
        )}

        {/* Step 3: Contracts */}
        {account && (
          <section className="step fade-in">
            <div className="step-number">3</div>
            <div className="step-content">
              <ContractUploader
                contracts={contracts}
                onContractsChange={setContracts}
              />
            </div>
          </section>
        )}

        {/* Step 4: Mainnet warning */}
        {account && validContractCount > 0 && (
          <section className="step fade-in">
            <div className="step-number">4</div>
            <div className="step-content">
              <MainnetWarning
                confirmed={mainnetConfirmed}
                onConfirmChange={setMainnetConfirmed}
                onConfirm={() => setMainnetProceeded(true)}
              />
            </div>
          </section>
        )}

        {/* Step 5: Deploy */}
        {readyToDeploy && (
          <section className="step fade-in">
            <div className="step-number">5</div>
            <div className="step-content">
              <div className="card">
                <div className="card-header">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <h3>Launch Deployment</h3>
                </div>

                {/* Deploy mode selector */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    className={`btn ${deployMode === 'server' ? 'btn-primary' : ''}`}
                    onClick={() => setDeployMode('server')}
                    style={{ flex: 1 }}
                  >
                    🖥️ Server Queue
                  </button>
                  <button
                    className={`btn ${deployMode === 'live' ? 'btn-primary' : ''}`}
                    onClick={() => setDeployMode('live')}
                    style={{ flex: 1 }}
                  >
                    🌐 Live Deploy
                  </button>
                </div>

                {deployMode === 'server' && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.9rem' }}>
                    <strong>🖥️ Server Queue Mode</strong>
                    <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>
                      Signs all {validContractCount.toLocaleString()} contracts upfront (~2-3 min), queues them on the server,
                      then a cron job broadcasts 25 every 10 min. <strong>You can close this page after signing!</strong>
                    </p>
                  </div>
                )}

                {deployMode === 'live' && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.9rem' }}>
                    <strong>🌐 Live Deploy Mode</strong>
                    <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>
                      Deploys directly from your browser in batches of 25. You <strong>must keep this tab open</strong> for
                      the entire duration (~{Math.ceil(validContractCount / 25 * 15)} min).
                    </p>
                  </div>
                )}

                <p className="text-muted">
                  Deploy <strong>{validContractCount.toLocaleString()}</strong> contracts for a total of{' '}
                  <strong>{(validContractCount * DEPLOY_FEE_STX).toFixed(6)} STX</strong>.
                </p>

                {deployError && (
                  <div className="error-banner">{deployError}</div>
                )}

                <button
                  className="btn btn-primary btn-lg"
                  onClick={deployMode === 'server' ? handleServerDeploy : handleLiveDeploy}
                >
                  {deployMode === 'server'
                    ? `🖥️ Sign & Queue ${validContractCount.toLocaleString()} Contracts`
                    : `🚀 Live Deploy ${validContractCount.toLocaleString()} Contracts`
                  }
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Signing progress (server mode) */}
        {isSigning && (
          <section className="step fade-in">
            <div className="step-number">⏳</div>
            <div className="step-content">
              <div className="card">
                <div className="card-header">
                  <span className="spinner" />
                  <h3>Signing Contracts...</h3>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${signingProgress.total > 0 ? (signingProgress.current / signingProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="progress-text">
                    {signingProgress.current} / {signingProgress.total} contracts signed
                  </span>
                </div>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                  Signing all transactions client-side. This takes ~2-3 minutes for 1000 contracts.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Server queue progress */}
        {serverQueued && (
          <section className="step fade-in">
            <div className="step-number">📊</div>
            <div className="step-content">
              <ServerQueueProgress onClear={() => setServerQueued(false)} />
            </div>
          </section>
        )}

        {/* Live deploy progress */}
        {progress && !serverQueued && (
          <section className="step fade-in">
            <div className="step-number">📊</div>
            <div className="step-content">
              <DeploymentProgress
                progress={progress}
                isDeploying={isDeploying}
                onCancel={handleCancel}
              />
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>STAX Bulk Deployer — Stacks Mainnet — All signing happens in your browser</p>
      </footer>
    </main>
  );
}
