'use client';

import {
    makeContractDeploy,
    makeSTXTokenTransfer,
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
 * Uses dynamic fee calculation based on contract code size.
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
    const serialized = transaction.serialize();

    // Handle both string and Uint8Array return types
    if (typeof serialized === 'string') {
        return serialized;
    }
    // Convert Uint8Array to hex without Buffer (browser-safe)
    return Array.from(new Uint8Array(serialized))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ---------- Hex to Uint8Array helper ----------
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
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
 * Uses the same proven deploy path as real contract deployments.
 */
export async function buildFillerTx(params: FillerTxParams): Promise<string> {
    const { senderKey, nonce, fee } = params;

    // Random 6-char suffix to avoid name collisions
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
    const serialized = transaction.serialize();

    if (typeof serialized === 'string') {
        return serialized;
    }
    return Array.from(new Uint8Array(serialized))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ---------- Broadcast (not used directly — goes through /api/deploy) ----------
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
