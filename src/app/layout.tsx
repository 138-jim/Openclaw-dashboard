import type { Metadata } from 'next';
import './globals.css';
import DashboardShell from '@/components/DashboardShell';

export const metadata: Metadata = { title: 'OpenClaw Dashboard', description: 'Agent monitoring dashboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><DashboardShell>{children}</DashboardShell></body>
    </html>
  );
}
