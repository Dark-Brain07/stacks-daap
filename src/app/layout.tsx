import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STAX Bulk Deployer — Deploy Clarity Contracts at Scale',
  description:
    'Deploy up to 10,000 Clarity smart contracts to Stacks Mainnet. Secure client-side signing with real-time progress tracking.',
  keywords: ['Stacks', 'Clarity', 'smart contracts', 'bulk deploy', 'STX', 'blockchain'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
