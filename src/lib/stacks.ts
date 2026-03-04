'use client';

import {
    makeContractDeploy,
    AnchorMode,
    PostConditionMode,
    ClarityVersion,
    getAddressFromPrivateKey,
} from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';
import { generateWallet } from '@stacks/wallet-sdk';
import {
    DEPLOY_FEE_MICRO_STX,
    FILLER_FEE_MICRO_STX,
} from './constants';

// ---------- Fee Estimation ----------
export interface FeeEstimate {
    low: number;
    medium: number;
    high: number;
    source: string;
}

/**
 * Fetch dynamic fee estimates from the server.
 * Returns low/medium/high fee tiers in µSTX.
 */
export async function fetchFeeEstimate(): Promise<FeeEstimate> {
    try {
        const res = await fetch('/api/fee-estimate');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data as FeeEstimate;
    } catch {
        // Fallback if API fails
        return {
            low: 5000,
            medium: 10000,
            high: 20000,
            source: 'fallback',
        };
    }
}

// ---------- Key Derivation ----------
export interface DerivedAccount {
    stxAddress: string;
    stxPrivateKey: string;
}

/**
 * Derive the first STX account from a BIP-39 mnemonic.
 * All processing happens in-memory on the client — nothing is persisted.
 */
export async function deriveAccount(seedPhrase: string): Promise<DerivedAccount> {
    const wallet = await generateWallet({
        secretKey: seedPhrase,
        password: '',
    });

    const stxPrivateKey = wallet.accounts[0].stxPrivateKey;
    const stxAddress = getAddressFromPrivateKey(stxPrivateKey);

    return { stxAddress, stxPrivateKey };
}

// ---------- Transaction Building ----------
export interface ContractDeployParams {
    contractName: string;
    codeBody: string;
    senderKey: string;
    nonce: number;
    fee?: number;
}

/**
 * Build and sign a contract-deploy transaction entirely client-side.
 * Returns the serialized hex string ready for broadcast.
 * Fee should be provided from dynamic estimation.
 */
export async function buildSignedDeployTx(
    params: ContractDeployParams
): Promise<string> {
    const { contractName, codeBody, senderKey, nonce, fee } = params;

    const txOptions = {
        contractName,
        codeBody,
        senderKey,
        nonce,
        fee: fee ?? DEPLOY_FEE_MICRO_STX,
        network: STACKS_MAINNET,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        clarityVersion: ClarityVersion.Clarity2,
    };

    const transaction = await makeContractDeploy(txOptions);
    return serializeTx(transaction);
}

// ---------- Filler Transaction (Tiny Contract Deploy) ----------
export interface FillerTxParams {
    senderKey: string;
    recipientAddress: string;
    nonce: number;
    fee?: number;
}

/**
 * Build a minimal contract deploy to fill a missing nonce gap.
 * Deploys a tiny 1-line Clarity contract with a unique random name.
 */
export async function buildFillerTx(params: FillerTxParams): Promise<string> {
    const { senderKey, nonce, fee } = params;

    const suffix = Math.random().toString(36).substring(2, 8);
    const contractName = `fill-${nonce}-${suffix}`;
    const codeBody = `(define-constant FILLER true)`;

    const txOptions = {
        contractName,
        codeBody,
        senderKey,
        nonce,
        fee: fee ?? FILLER_FEE_MICRO_STX,
        network: STACKS_MAINNET,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        clarityVersion: ClarityVersion.Clarity2,
    };

    const transaction = await makeContractDeploy(txOptions);
    return serializeTx(transaction);
}

// ---------- Serialize Transaction ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTx(transaction: any): string {
    const serialized = transaction.serialize();
    if (typeof serialized === 'string') {
        return serialized;
    }
    return Array.from(new Uint8Array(serialized))
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ---------- Broadcast (goes through /api/deploy) ----------
export async function broadcastTx(signedTxHex: string): Promise<string> {
    const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTxHex }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
        throw new Error(data.error || data.reason || 'Broadcast failed');
    }

    return data.txId;
}
