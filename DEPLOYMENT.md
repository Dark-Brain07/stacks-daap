# Deploying STAX Bulk Deployer to Vercel

## Prerequisites

- A [Vercel account](https://vercel.com)
- [Vercel CLI](https://vercel.com/docs/cli) (optional for CLI deployment)
- Git repository (GitHub, GitLab, or Bitbucket)

---

## Option 1: Deploy via Vercel Dashboard (Recommended)

1. Push your code to a Git repository (GitHub / GitLab / Bitbucket)

2. Go to [vercel.com/new](https://vercel.com/new)

3. Click **Import** and select your repository

4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

5. Click **Deploy**

6. Vercel will build and deploy your app. You'll get a URL like `https://your-project.vercel.app`

---

## Option 2: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (preview)
vercel

# Deploy to production
vercel --prod
```

---

## Environment Variables

**None required.** The app uses the public Stacks Mainnet API endpoint.

If you want to use a custom Stacks node:

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_STACKS_API` | `https://stacks-node-api.mainnet.stacks.co` | Custom Stacks API URL |

---

## Vercel Configuration

The app works with zero configuration on Vercel. The serverless functions in `src/app/api/` are automatically deployed as Vercel Edge/Serverless functions.

### Function Limits (Free Tier)

| Limit | Value |
|---|---|
| Execution timeout | 10s (Hobby) / 60s (Pro) |
| Memory | 1024 MB |
| Payload size | 4.5 MB |

> **Note**: For deploying 10,000 contracts, the Pro plan is recommended for longer function timeouts. The app handles this by broadcasting transactions individually via the client, so the API route only needs to relay one transaction at a time.

---

## Post-Deployment Checklist

- [ ] Verify the app loads at your Vercel URL
- [ ] Test wallet connection with a seed phrase
- [ ] Test balance display
- [ ] Test contract upload and validation
- [ ] Deploy 1 test contract to confirm end-to-end flow
- [ ] Monitor Vercel logs for any errors

---

## Custom Domain

1. Go to your project settings on Vercel
2. Click **Domains**
3. Add your custom domain
4. Configure DNS as instructed

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Build fails | Ensure Node.js 18+ is set in Vercel settings |
| Crypto polyfill errors | `next.config.ts` includes Webpack fallbacks — verify it's present |
| API timeout | The app broadcasts one tx at a time, so timeouts shouldn't occur |
| Rate limiting | Increase limits in `src/lib/constants.ts` if needed |
