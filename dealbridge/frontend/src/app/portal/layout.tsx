'use client';
import { AuthGate } from '@/components/auth';
import { PortalShell } from '@/components/PortalShell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate roles={['investor', 'admin', 'analyst']}><PortalShell>{children}</PortalShell></AuthGate>;
}
