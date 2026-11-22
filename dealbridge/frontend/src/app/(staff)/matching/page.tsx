'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/format';
import { Badge, Card, DemoBadge, Empty, ErrorBox, PageHeader, Select } from '@/components/ui';

export default function Matching() {
  const [f, setF] = useState({ eligible: 'true', min_score: '' });
  const { data, error, reload } = useApi(`/matches${qs(f)}`);
  const [open, setOpen] = useState<string | null>(null);
  const setStatus = async (id: string, status: string) => { await api(`/matches/${id}/status`, { body: { status } }); void reload(); };
  return (
    <div>
      <PageHeader title="Investor matching" sub="Deals compared against every active investor's stated preferences. A match is preliminary — never a funding commitment." />
      <div className="mb-3 flex gap-2">
        <Select className="w-48" value={f.eligible} onChange={(e) => setF({ ...f, eligible: e.target.value })}><option value="true">Eligible only</option><option value="false">Not eligible (refreshed)</option><option value="">All</option></Select>
        <Select className="w-40" value={f.min_score} onChange={(e) => setF({ ...f, min_score: e.target.value })}><option value="">Any score</option><option value="80">≥ 80</option><option value="70">≥ 70</option></Select>
      </div>
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty>No matches. Analyze properties and add investor profiles.</Empty>}
      <div className="space-y-2">
        {data?.map((m: any) => (
          <Card key={m.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={m.eligible ? 'good' : 'neutral'}><span className="tabular font-semibold">{m.score.toFixed(0)}</span></Badge>
                <Link href={`/investors/${m.investor.id}`} className="font-medium hover:text-accent">{m.investor.name}</Link><span className="text-xs text-muted">{label(m.investor.investor_type)}</span>
                <span className="text-muted">↔</span>
                <Link href={`/properties/${m.property.id}`} className="font-medium hover:text-accent">{m.property.address_line}, {m.property.city}</Link>
                <DemoBadge show={m.property.is_demo} />
              </div>
              <div className="flex items-center gap-2">
                <Select className="w-44" value={m.status} onChange={(e) => setStatus(m.id, e.target.value)}>{['suggested', 'approved_to_present', 'presented', 'dismissed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                <button className="text-xs text-accent hover:underline" onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? 'Hide' : 'Why?'}</button>
              </div>
            </div>
            {open === m.id && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <p className="text-sm text-ink-2">{m.explanation}</p>
                <ul className="space-y-1 text-xs">{m.components.map((c: any) => <li key={c.key} className="flex justify-between gap-2"><span>{c.label} — <span className="text-muted">{c.detail}</span></span><span className="tabular">{c.points}/{c.weight}</span></li>)}</ul>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
