'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { date, label, usd } from '@/lib/format';
import { Badge, Button, Card, CardTitle, DemoBadge, ErrorBox, Field, Input, PageHeader, Select } from '@/components/ui';
import { OpportunityBody } from '@/components/OpportunityBody';

export default function OpportunityAdmin() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error, reload } = useApi(`/opportunities/${id}`);
  const matches = useApi(o ? `/matches?property_id=${o.property_id ?? ''}` : null);
  const investors = useApi('/investors');
  const [err, setErr] = useState<unknown>(null);
  const [override, setOverride] = useState('');
  const [legal, setLegal] = useState(false);
  const [grant, setGrant] = useState({ investor_id: '', reason: '' });
  const [notifyResult, setNotifyResult] = useState<Record<string, string> | null>(null);
  const act = async (fn: () => Promise<any>) => { try { await fn(); setErr(null); await reload(); } catch (e) { setErr(e); } };
  const tr = (action: string) => act(() => api(`/opportunities/${id}/transition`, { body: { action, override_review_reason: override || null, legal_review_confirmed: legal } }));
  if (error) return <ErrorBox error={error} />;
  if (!o) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div>
      <PageHeader title={o.title} sub={<span className="flex items-center gap-2"><Badge tone={o.status === 'published' ? 'good' : 'warn'}>{label(o.status)}</Badge><DemoBadge show={o.is_demo} /></span>} />
      <ErrorBox error={err} />
      <Card className="mb-4">
        <CardTitle hint="Human approval is required before anything reaches investors. The platform never makes offers, signs agreements or moves money.">Approval workflow</CardTitle>
        {o.analysis?.needs_manual_review && <Field label="Manual review notes (required to approve a flagged deal)" className="mb-2"><Input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="What you verified and how" /></Field>}
        {!o.is_demo && <label className="mb-3 flex gap-2 text-sm"><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} />Counsel has reviewed investor-facing materials and our solicitation approach for this opportunity (required to publish).</label>}
        <div className="flex flex-wrap gap-2">
          {o.status === 'draft' && <Button onClick={() => tr('submit')}>Submit for approval</Button>}
          {o.status === 'pending_approval' && <Button onClick={() => tr('approve')}>Approve</Button>}
          {o.status === 'approved' && <Button onClick={() => tr('publish')}>Publish to marketplace</Button>}
          {o.status === 'published' && <><Button variant="outline" onClick={() => tr('unpublish')}>Unpublish</Button><Button variant="outline" onClick={() => tr('under_contract')}>Mark under contract</Button>
            <Button onClick={() => act(async () => setNotifyResult((await api(`/opportunities/${id}/notify`, { body: {} })).results))}>Notify matched investors</Button></>}
          {o.status === 'under_contract' && <Button variant="outline" onClick={() => tr('close')}>Mark closed</Button>}
          {!['withdrawn', 'closed'].includes(o.status) && <Button variant="danger" onClick={() => tr('withdraw')}>Withdraw</Button>}
          <Link href={`/properties/${o.property_id ?? ''}`}><Button variant="ghost">Open property</Button></Link>
        </div>
        {notifyResult && <div className="mt-3 text-sm">Notification results: {Object.entries(notifyResult).map(([k, v]) => <Badge key={k} className="mr-1">{v}</Badge>)}{Object.keys(notifyResult).length === 0 && 'no eligible investors'}</div>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardTitle>Investor interest</CardTitle>
          <ul className="space-y-2 text-sm">{o.interests.map((x: any) => (
            <li key={x.id} className="rounded-lg border border-line p-2"><Badge>{label(x.kind)}</Badge> <Link className="font-medium hover:text-accent" href={`/investors/${x.investor_id}`}>{x.investor_name}</Link> <span className="text-xs text-muted">{date(x.created_at)}</span>
              {x.indicated_amount && <span> · nonbinding indication {usd(x.indicated_amount)}</span>}{x.message && <p className="mt-1 text-xs text-ink-2">{x.message}</p>}{x.preferred_times && <p className="text-xs text-ink-2">Times: {x.preferred_times}</p>}</li>))}
            {o.interests.length === 0 && <li className="text-muted">No interest yet.</li>}</ul>
          <h3 className="mb-1 mt-4 text-xs font-semibold text-ink-2">Eligible matches</h3>
          <ul className="space-y-1 text-sm">{matches.data?.map((m: any) => <li key={m.id}><Badge tone="good">{m.score.toFixed(0)}</Badge> {m.investor.name} <span className="text-xs text-muted">{label(m.status)}</span></li>)}</ul>
        </Card>
        <Card><CardTitle hint="Exact address, seller contact and access details are shared only with investors you grant (e.g. after an NDA).">Restricted access</CardTitle>
          <ul className="mb-2 space-y-1 text-sm">{o.access_grants.map((g: any) => <li key={g.investor_id}>{investors.data?.find((i: any) => i.id === g.investor_id)?.name ?? g.investor_id} — {g.reason}</li>)}</ul>
          <Select value={grant.investor_id} onChange={(e) => setGrant({ ...grant, investor_id: e.target.value })}><option value="">Choose investor…</option>{investors.data?.filter((i: any) => i.is_demo === o.is_demo).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
          <Input className="mt-2" placeholder="Reason (e.g. NDA signed 2026-11-20)" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} />
          <Button className="mt-2" variant="outline" onClick={() => act(() => api(`/opportunities/${id}/access-grants`, { body: grant }))}>Grant access</Button>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold">Investor-facing preview</h2>
      <OpportunityBody o={o} />
    </div>
  );
}
