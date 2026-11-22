'use client';
import { AuthGate } from '@/components/auth';
import { Shell } from '@/components/Shell';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate roles={['admin', 'analyst']}>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
