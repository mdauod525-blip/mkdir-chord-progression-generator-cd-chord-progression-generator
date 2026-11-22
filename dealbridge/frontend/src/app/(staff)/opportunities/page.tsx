'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { date, label, pct, usd } from '@/lib/format';
import { Badge, DemoBadge, Empty, ErrorBox, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { ScoreBadge } from '@/components/deal';

export default function Opportunities() {
  const [status, setStatus] = useState('');
  const { data, error } = useApi(`/opportunities${qs({ status })}`);
  const interests = useApi('/admin/interests');
  return (
    <div>
      <PageHeader title="Investment marketplace" sub="Opportunities move draft → pending approval → approved → published. Only an admin can approve and publish." />
      <Select className="mb-3 w-56" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['draft', 'pending_approval', 'approved', 'published', 'under_contract', 'closed', 'withdrawn'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty>No opportunities yet. Open an analyzed property and choose “Create opportunity”.</Empty>}
      {data?.length > 0 && (
        <Table>
          <thead><tr><Th>Opportunity</Th><Th>Status</Th><Th>Score</Th><Th>Est. ARV</Th><Th>Net profit</Th><Th>ROI</Th><Th>Interest</Th><Th>Published</Th></tr></thead>
          <tbody>{data.map((o: any) => (
            <tr key={o.id} className="hover:bg-surface-2">
              <Td><Link className="font-medium hover:text-accent" href={`/opportunities/${o.id}`}>{o.title}</Link> <DemoBadge show={o.is_demo} /><div className="text-xs text-muted">{o.city}, {o.state} · {label(o.visibility)}</div></Td>
              <Td><Badge tone={o.status === 'published' ? 'good' : o.status === 'withdrawn' ? 'bad' : 'warn'}>{label(o.status)}</Badge></Td>
              <Td><ScoreBadge score={o.analysis?.score} /></Td>
              <Td className="tabular">{usd(o.analysis?.arv)}</Td>
              <Td className="tabular">{usd(o.analysis?.net_profit)}</Td>
              <Td className="tabular">{pct(o.analysis?.roi_pct)}</Td>
              <Td className="tabular">{o.interest_count}</Td>
              <Td className="text-xs">{date(o.published_at)}</Td>
            </tr>))}</tbody>
        </Table>
      )}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Recent investor interest</h2>
      <ul className="space-y-1 text-sm">
        {interests.data?.slice(0, 20).map((x: any) => (
          <li key={x.id}><Badge>{label(x.kind)}</Badge> <Link className="hover:text-accent" href={`/investors/${x.investor.id}`}>{x.investor.name}</Link> on <Link className="hover:text-accent" href={`/opportunities/${x.opportunity.id}`}>{x.opportunity.title}</Link>{x.indicated_amount ? ` · nonbinding ${usd(x.indicated_amount)}` : ''} <span className="text-xs text-muted">{date(x.created_at)}</span></li>))}
        {interests.data?.length === 0 && <li className="text-muted">None yet.</li>}
      </ul>
    </div>
  );
}
