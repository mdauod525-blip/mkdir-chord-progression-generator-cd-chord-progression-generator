import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealBridge AI',
  description: 'Fix-and-flip deal sourcing, underwriting and investor matching.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
