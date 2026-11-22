'use client';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import { Badge, PageHeader } from '@/components/ui';
import { InvestorForm } from '@/components/InvestorForm';

export default function MyProfile() {
  const { data, reload } = useApi('/portal/profile');
  const [saved, setSaved] = useState(false);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="max-w-5xl">
      <PageHeader title="My investment profile" sub={<span className="flex items-center gap-2">Verification <Badge tone={data.verification_status === 'verified' ? 'good' : 'warn'}>{data.verification_status}</Badge> Marketplace access <Badge tone={data.account_approved ? 'good' : 'warn'}>{data.account_approved ? 'approved' : 'pending'}</Badge></span>} />
      {saved && <p className="mb-3 text-sm text-good">Saved — your matches have been refreshed.</p>}
      <InvestorForm mode="self" initial={data} onSaved={() => { setSaved(true); void reload(); }} />
    </div>
  );
}
