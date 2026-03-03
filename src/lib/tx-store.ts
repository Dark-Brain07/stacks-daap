/**
 * Redis-backed transaction store for server-side deployment queue.
 * Uses Upstash Redis to persist signed transactions so the browser
 * can close after signing. A cron job processes them in batches.
 */

import { Redis } from '@upstash/redis';

// ---------- Redis Client ----------
let redis: Redis | null = null;

function getRedis(): Redis {
    if (!redis) {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!url || !token) {
            throw new Error(
                'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables. ' +
                'Create a free Redis database at https://upstash.com'
            );
        }

        redis = new Redis({ url, token });
    }
    return redis;
}

// ---------- Types ----------
export interface StoredTx {
    contractName: string;
    signedTxHex: string;
    nonce: number;
    status: 'queued' | 'broadcasting' | 'success' | 'failed';
    txId?: string;
    error?: string;
    attempts: number;
    queuedAt: number;
    updatedAt: number;
}

export interface QueueMeta {
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

// ---------- Keys ----------
const QUEUE_META_KEY = 'stax:queue:meta';
const QUEUE_TXS_KEY = 'stax:queue:txs';
const QUEUE_LOCK_KEY = 'stax:queue:lock';

// ---------- Queue Operations ----------

/**
 * Store a batch of pre-signed transactions for server-side deployment.
 */
export async function enqueueBatch(
    address: string,
    txs: { contractName: string; signedTxHex: string; nonce: number }[]
): Promise<string> {
    const r = getRedis();
    const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const storedTxs: StoredTx[] = txs.map((tx) => ({
        contractName: tx.contractName,
        signedTxHex: tx.signedTxHex,
        nonce: tx.nonce,
        status: 'queued',
        attempts: 0,
        queuedAt: Date.now(),
        updatedAt: Date.now(),
    }));

    const meta: QueueMeta = {
        id: queueId,
        address,
        total: txs.length,
        succeeded: 0,
        failed: 0,
        pending: txs.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isProcessing: false,
    };

    // Store in Redis
    await r.set(QUEUE_META_KEY, JSON.stringify(meta));
    await r.set(QUEUE_TXS_KEY, JSON.stringify(storedTxs));

    return queueId;
}

/**
 * Get the current queue status.
 */
export async function getQueueStatus(): Promise<{
    meta: QueueMeta | null;
    txs: StoredTx[];
}> {
    const r = getRedis();

    const [metaStr, txsStr] = await Promise.all([
        r.get<string>(QUEUE_META_KEY),
        r.get<string>(QUEUE_TXS_KEY),
    ]);

    const meta: QueueMeta | null = metaStr
        ? (typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr)
        : null;

    const txs: StoredTx[] = txsStr
        ? (typeof txsStr === 'string' ? JSON.parse(txsStr) : txsStr)
        : [];

    return { meta, txs };
}

/**
 * Acquire a lock for processing (prevents double-processing by concurrent cron runs).
 * Returns true if lock acquired, false otherwise.
 */
export async function acquireProcessingLock(): Promise<boolean> {
    const r = getRedis();
    // SET NX with 5-minute TTL
    const result = await r.set(QUEUE_LOCK_KEY, 'locked', { nx: true, ex: 300 });
    return result === 'OK';
}

/**
 * Release the processing lock.
 */
export async function releaseProcessingLock(): Promise<void> {
    const r = getRedis();
    await r.del(QUEUE_LOCK_KEY);
}

/**
 * Get the next batch of queued transactions to process.
 */
export async function getNextBatch(limit: number = 25): Promise<StoredTx[]> {
    const { txs } = await getQueueStatus();
    return txs.filter((tx) => tx.status === 'queued').slice(0, limit);
}

/**
 * Update a transaction status after broadcast.
 */
export async function updateTxStatus(
    contractName: string,
    update: Partial<Pick<StoredTx, 'status' | 'txId' | 'error' | 'attempts'>>
): Promise<void> {
    const r = getRedis();
    const { meta, txs } = await getQueueStatus();

    const tx = txs.find((t) => t.contractName === contractName);
    if (!tx) return;

    const oldStatus = tx.status;
    Object.assign(tx, update, { updatedAt: Date.now() });

    // Update meta counters
    if (meta) {
        if (oldStatus === 'queued' || oldStatus === 'broadcasting') {
            if (update.status === 'success') {
                meta.succeeded++;
                meta.pending--;
            } else if (update.status === 'failed') {
                meta.failed++;
                meta.pending--;
            }
        }
        meta.updatedAt = Date.now();
    }

    await Promise.all([
        r.set(QUEUE_META_KEY, JSON.stringify(meta)),
        r.set(QUEUE_TXS_KEY, JSON.stringify(txs)),
    ]);
}

/**
 * Mark queue as processing/not processing.
 */
export async function setProcessing(isProcessing: boolean): Promise<void> {
    const r = getRedis();
    const { meta } = await getQueueStatus();
    if (meta) {
        meta.isProcessing = isProcessing;
        meta.updatedAt = Date.now();
        await r.set(QUEUE_META_KEY, JSON.stringify(meta));
    }
}

/**
 * Clear the entire queue.
 */
export async function clearQueue(): Promise<void> {
    const r = getRedis();
    await Promise.all([
        r.del(QUEUE_META_KEY),
        r.del(QUEUE_TXS_KEY),
        r.del(QUEUE_LOCK_KEY),
    ]);
}
