# STAX Bulk Deployer

Deploy up to **10,000 Clarity smart contracts** to **Stacks Mainnet** in a single session.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Stacks](https://img.shields.io/badge/Stacks-Mainnet-purple)

---

## ⚡ Features

- **Bulk Deployment** — Deploy up to 10,000 contracts with concurrency control
- **Client-Side Signing** — Seed phrase never leaves your browser
- **Real-Time Progress** — Live tracking with success/fail status per contract
- **Contract Validation** — Syntax checking & duplicate name detection
- **Template Generator** — Generate thousands of contracts from a template
- **File Upload** — Upload `.clar` files via drag & drop
- **Nonce Management** — Automatic sequential nonce handling
- **Retry Logic** — Automatic retries on mempool rejection with exponential backoff
- **Rate Limiting** — Server-side protection against API abuse
- **Explorer Links** — Direct links to each transaction on Hiro Explorer

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                       │
│                                                 │
│  Seed Phrase → Key Derivation → Sign Tx         │
│  (never leaves browser)        (client-side)    │
│                                                 │
│  Signed Tx Hex ──→ /api/deploy ──→ Stacks Node  │
└─────────────────────────────────────────────────┘
```

- **Frontend**: Next.js 14 App Router + TypeScript
- **Signing**: `@stacks/transactions` + `@stacks/wallet-sdk` (browser)
- **Backend**: Vercel serverless API routes (relay only)
- **Gas Fee**: Fixed 0.003 STX per deployment

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- A Stacks wallet with STX balance

### Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd stax-bulk-deployer

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

No environment variables required. The app connects directly to the public Stacks Mainnet API.

---

## 📁 Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with metadata
│   ├── page.tsx                # Main deployment page
│   ├── globals.css             # Design system & styles
│   └── api/
│       ├── deploy/route.ts     # Broadcast signed transactions
│       ├── balance/route.ts    # Proxy balance queries
│       └── nonce/route.ts      # Fetch account nonce
├── components/
│   ├── SeedPhraseInput.tsx     # Secure seed phrase form
│   ├── ContractUploader.tsx    # Upload / generate contracts
│   ├── DeploymentProgress.tsx  # Real-time progress tracker
│   ├── BalanceDisplay.tsx      # Balance & fee summary
│   └── MainnetWarning.tsx      # Mainnet risk confirmation
└── lib/
    ├── stacks.ts               # Key derivation, tx building, broadcast
    ├── clarity-validator.ts    # Contract syntax validation
    ├── queue.ts                # Deployment queue with concurrency
    └── constants.ts            # Configuration constants
contracts/
└── example-contract.clar       # Example Clarity template
```

---

## 🔐 Security

| Concern | Implementation |
|---|---|
| Seed phrase storage | **Never stored** — only held in React state, cleared on unmount |
| Seed phrase transmission | **Never sent** to any server — signing is 100% client-side |
| API route | Only receives pre-signed serialized transaction hex |
| Logging | No sensitive data in `console.log` or server logs |
| Input validation | Contract names and code validated before deployment |
| Rate limiting | Server-side rate limiting (50 req/min per IP) |

### Security Best Practices

1. **Always verify** your contract code before bulk deploying
2. **Test with a small batch** (1-5 contracts) first
3. **Monitor your balance** — deployments are irreversible
4. **Use a dedicated wallet** for bulk deployments
5. **Never share** your seed phrase with anyone

---

## 💰 Fee Calculation

| Contracts | Fee Each | Total Cost |
|---|---|---|
| 1 | 0.003 STX | 0.003 STX |
| 100 | 0.003 STX | 0.3 STX |
| 1,000 | 0.003 STX | 3 STX |
| 10,000 | 0.003 STX | 30 STX |

---

## 🌐 Deploy to Vercel

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

Quick deploy:

```bash
npm i -g vercel
vercel --prod
```

---

## 📋 Usage Guide

1. **Connect Wallet** — Enter your 12 or 24-word seed phrase
2. **Check Balance** — Confirm sufficient STX for deployment fees
3. **Add Contracts** — Upload `.clar` files or use the bulk generator
4. **Confirm Mainnet** — Acknowledge the mainnet risk warning
5. **Deploy** — Click deploy and monitor real-time progress
6. **View Results** — Click transaction links to verify on Hiro Explorer

---

## License

MIT
