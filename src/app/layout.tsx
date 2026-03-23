import type { Metadata, Viewport } from 'next';
import './globals.css';
import DashboardShell from '@/components/DashboardShell';

export const metadata: Metadata = {
  title: 'OpenClaw Dashboard',
  description: 'Agent monitoring dashboard',
};

export const viewport: Viewport = {
  themeColor: '#0a0a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><DashboardShell>{children}</DashboardShell></body>
    </html>
  );
}
