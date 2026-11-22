'use client';
import { useState } from 'react';
import { AuthGate } from '@/components/auth';
import { PortalShell } from '@/components/PortalShell';
import { PageHeader } from '@/components/ui';
import { PropertyForm } from '@/components/PropertyForm';

export default function Submit() {
  const [done, setDone] = useState(false);
  return (
    <AuthGate roles={['wholesaler', 'admin', 'analyst']}>
      <PortalShell>
        <div className="max-w-5xl">
          <PageHeader title="Submit a deal" sub="Wholesaler submissions are underwritten automatically and reviewed by our team before any investor sees them." />
          {done ? <p className="text-sm text-good">Thanks — your submission was received and will be analyzed.</p> : <PropertyForm staff={false} onCreated={() => setDone(true)} />}
        </div>
      </PortalShell>
    </AuthGate>
  );
}
