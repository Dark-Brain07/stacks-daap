// Stax Bulk Deployer — Constants
// All fee values are in microSTX (1 STX = 1,000,000 µSTX)

// Minimum fee floors (safety net if API returns too low)
export const MIN_FEE_MICRO_STX = 2000; // 0.002 STX — absolute minimum
export const DEFAULT_FEE_MULTIPLIER = 1.25; // 25% safety margin on estimated fees

// Legacy fixed fees (kept for reference, no longer used as defaults)
export const DEPLOY_FEE_MICRO_STX = 10000; // 0.01 STX — safe default for deploys
export const DEPLOY_FEE_STX = 0.01;
export const FILLER_FEE_MICRO_STX = 10000; // 0.01 STX — same as deploy
export const FILLER_FEE_STX = 0.01;

export const MAX_CONTRACTS = 10_000;
export const CONCURRENCY_LIMIT = 1;  // Sequential to avoid nonce conflicts
export const MAX_RETRIES = 6;
export const RETRY_DELAY_MS = 3000;
export const INTER_TX_DELAY_MS = 800; // Fast interval between broadcasts (short contracts)
export const MEMPOOL_CHAIN_LIMIT = 25; // Stacks mempool max pending txs per address
export const MEMPOOL_POLL_INTERVAL_MS = 10_000; // Poll every 10s to check if mempool cleared
export const RATE_LIMIT_MAX = 200; // requests per minute
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const STACKS_MAINNET_API = 'https://api.mainnet.hiro.so';
export const STACKS_EXPLORER_TX = 'https://explorer.hiro.so/txid';

export const CONTRACT_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9]|[-_])*$/;
export const MAX_CONTRACT_NAME_LENGTH = 128;
export const MAX_CONTRACT_BODY_LENGTH = 100_000; // bytes

// Fee tiers for UI
export type FeeTier = 'low' | 'medium' | 'high';
export const FEE_TIER_LABELS: Record<FeeTier, string> = {
    low: '🐢 Low (may take hours)',
    medium: '⚡ Medium (recommended)',
    high: '🚀 High (fast confirmation)',
};
