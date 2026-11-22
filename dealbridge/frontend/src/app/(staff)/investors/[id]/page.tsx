'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { compactUsd, date, label, pct, usd } from '@/lib/format';
import { Badge, Button, Card, CardTitle, DemoBadge, ErrorBox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { InvestorForm } from '@/components/InvestorForm';

const STAGES = ['new', 'contacted', 'qualified', 'opportunity_presented', 'interested', 'due_diligence', 'negotiation', 'funded_closed', 'not_interested'];

export default function InvestorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: inv, error, reload } = useApi(`/investors/${id}`);
  const templates = useApi('/templates');
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState({ kind: 'call', subject: '', body: '' });
  const [fu, setFu] = useState({ due_date: '', note: '' });
  const [ver, setVer] = useState({ kind: 'identity', document_reference: '', notes: '' });
  const [tx, setTx] = useState({ description: '', role: 'equity', amount: '', closed_on: '' });
  const [tpl, setTpl] = useState('follow_up');
  const [sendResult, setSendResult] = useState('');
  const act = async (fn: () => Promise<any>) => {
    try {
      await fn();
      setErr(null);
      await reload();
    } catch (e) {
      setErr(e);
    }
  };
  if (error) return <ErrorBox error={error} />;
  if (!inv) return <p className="text-sm text-muted">Loading…</p>;
  if (edit) return <div className="max-w-5xl"><PageHeader title={`Edit ${inv.name}`} actions={<Button variant="outline" onClick={() => setEdit(false)}>Cancel</Button>} /><InvestorForm mode="staff-edit" initial={inv} onSaved={() => { setEdit(false); void reload(); }} /></div>;
  return (
    <div>
      <PageHeader title={inv.name} sub={<span className="flex flex-wrap items-center gap-2">{inv.entity_name && <span>{inv.entity_name} ·</span>}{label(inv.investor_type)} <DemoBadge show={inv.is_demo} />
        <Badge tone={inv.verification_status === 'verified' ? 'good' : 'warn'}>{inv.verification_status}</Badge></span>}
        actions={<>
          <Select className="w-48" value={inv.pipeline_stage} onChange={(e) => act(() => api(`/investors/${id}/stage`, { body: { stage: e.target.value } }))}>{STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          <Button variant="outline" onClick={() => setEdit(true)}>Edit profile</Button>
          <Button variant="outline" onClick={() => act(() => api(`/investors/${id}/portal-access`, { body: { approved: true } }))}>Approve portal access</Button>
        </>} />
      <ErrorBox error={err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardTitle>Preferences</CardTitle>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-2">Email</dt><dd className="break-all">{inv.email}</dd>
            <dt className="text-ink-2">Phone</dt><dd>{inv.phone ?? '—'}</dd>
            <dt className="text-ink-2">Capital</dt><dd className="tabular">{usd(inv.available_capital)}</dd>
            <dt className="text-ink-2">Range</dt><dd className="tabular">{compactUsd(inv.min_investment)} – {compactUsd(inv.max_investment)}</dd>
            <dt className="text-ink-2">Min ROI</dt><dd>{pct(inv.min_roi_pct, 0)}</dd>
            <dt className="text-ink-2">Max duration</dt><dd>{inv.max_duration_months ? `${inv.max_duration_months} mo` : '—'}</dd>
            <dt className="text-ink-2">Risk</dt><dd>{inv.risk_tolerance}</dd>
            <dt className="text-ink-2">Strategies</dt><dd>{inv.strategies.map(label).join(', ')}</dd>
            <dt className="text-ink-2">Funding</dt><dd>{label(inv.funding_availability)}</dd>
            <dt className="text-ink-2">Accreditation</dt><dd>{label(inv.accreditation_status)}</dd>
            <dt className="text-ink-2">Proof of funds</dt><dd>{inv.proof_of_funds_verified ? 'verified' : 'not verified'}</dd>
            <dt className="text-ink-2">Consent</dt><dd>{inv.unsubscribed ? 'unsubscribed' : [inv.email_consent && 'email', inv.sms_consent && 'SMS'].filter(Boolean).join(', ') || 'none'}</dd>
          </dl>
        </Card>

        <Card><CardTitle hint="Documents are reviewed manually; store files in secure storage and record only a reference here.">Verification & qualification</CardTitle>
          <ul className="mb-3 space-y-1.5 text-sm">
            {inv.verifications.map((v: any) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2">
                <span>{label(v.kind)} <Badge tone={v.status === 'approved' ? 'good' : v.status === 'rejected' ? 'bad' : 'warn'}>{v.status}</Badge><div className="text-xs text-muted">{v.document_reference}</div></span>
                {v.status === 'pending' && <span className="flex gap-1"><Button size="sm" onClick={() => act(() => api(`/verifications/${v.id}/decision`, { body: { status: 'approved' } }))}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(() => api(`/verifications/${v.id}/decision`, { body: { status: 'rejected' } }))}>Reject</Button></span>}
              </li>))}
          </ul>
          <div className="grid gap-2">
            <Select value={ver.kind} onChange={(e) => setVer({ ...ver, kind: e.target.value })}>{['identity', 'accreditation', 'proof_of_funds', 'entity'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select>
            <Input placeholder="Document reference (storage path)" value={ver.document_reference} onChange={(e) => setVer({ ...ver, document_reference: e.target.value })} />
            <Button variant="outline" onClick={() => act(() => api(`/investors/${id}/verifications`, { body: ver }))}>Add verification item</Button>
          </div>
        </Card>

        <Card><CardTitle hint="Consent is enforced; without provider keys messages are dry-run">Send a template</CardTitle>
          <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.data?.map((t: any) => <option key={t.key} value={t.key}>{t.name} ({t.channel})</option>)}</Select>
          <Button className="mt-2" variant="outline" onClick={() => act(async () => {
            const t = templates.data?.find((x: any) => x.key === tpl);
            const r = await api(`/investors/${id}/send`, { body: { template_key: tpl, channel: t?.channel, context: { opportunity: {}, note: '' } } });
            setSendResult(`${r.status}${r.error ? `: ${r.error}` : ''}`);
          })}>Send</Button>
          {sendResult && <p className="mt-2 text-sm">Result: <b>{sendResult}</b></p>}
        </Card>

        <Card className="lg:col-span-2"><CardTitle>Contact history</CardTitle>
          <div className="mb-3 grid gap-2 md:grid-cols-4">
            <Select value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })}>{['call', 'email', 'sms', 'meeting', 'note'].map((k) => <option key={k}>{k}</option>)}</Select>
            <Input placeholder="Subject" value={note.subject} onChange={(e) => setNote({ ...note, subject: e.target.value })} className="md:col-span-3" />
            <Textarea placeholder="Notes" rows={2} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} className="md:col-span-3" />
            <Button variant="outline" onClick={() => act(async () => { await api(`/investors/${id}/interactions`, { body: note }); setNote({ kind: 'call', subject: '', body: '' }); })}>Log</Button>
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {inv.interactions.map((x: any) => (
              <li key={x.id} className="rounded-lg border border-line p-2 text-sm"><div className="flex justify-between"><span><Badge>{x.kind}</Badge> {x.subject}</span><span className="text-xs text-muted">{date(x.occurred_at)}</span></div>{x.body && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-2">{x.body.slice(0, 400)}</p>}</li>))}
          </ul>
        </Card>

        <Card><CardTitle>Follow-ups</CardTitle>
          <div className="mb-2 grid gap-2">
            <Input type="date" value={fu.due_date} onChange={(e) => setFu({ ...fu, due_date: e.target.value })} />
            <Input placeholder="What to do" value={fu.note} onChange={(e) => setFu({ ...fu, note: e.target.value })} />
            <Button variant="outline" onClick={() => act(() => api(`/investors/${id}/follow-ups`, { body: fu }))}>Add follow-up</Button>
          </div>
          <ul className="space-y-1 text-sm">{inv.follow_ups.map((f: any) => (
            <li key={f.id} className={`flex items-center justify-between gap-2 ${f.done ? 'line-through opacity-60' : ''}`}><span>{date(f.due_date)} — {f.note}</span>{!f.done && <Button size="sm" variant="ghost" onClick={() => act(() => api(`/crm/follow-ups/${f.id}/done`, { method: 'POST' }))}>Done</Button>}</li>))}</ul>
        </Card>

        <Card className="lg:col-span-2"><CardTitle hint="Preliminary fits — not funding commitments">Matched opportunities</CardTitle>
          <ul className="space-y-1 text-sm">{inv.matches.map((m: any) => (
            <li key={m.id} className="flex justify-between"><Link className="hover:text-accent" href={`/properties/${m.property_id}`}>{m.address}</Link><span><Badge tone={m.eligible ? 'good' : 'neutral'}>{m.score.toFixed(0)}</Badge> <span className="text-xs text-muted">{label(m.status)}</span></span></li>))}
            {inv.matches.length === 0 && <li className="text-muted">No matches yet.</li>}</ul>
        </Card>

        <Card><CardTitle hint="Manually recorded; no fees are computed">Previous transactions</CardTitle>
          <ul className="mb-2 space-y-1 text-sm">{inv.transactions.map((t: any) => <li key={t.id}>{t.description} · {label(t.role)} · {usd(t.amount)} · {date(t.closed_on)}</li>)}</ul>
          <div className="grid gap-2">
            <Input placeholder="Description" value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Select value={tx.role} onChange={(e) => setTx({ ...tx, role: e.target.value })}>{['equity', 'lender', 'buyer', 'partner', 'other'].map((r) => <option key={r}>{r}</option>)}</Select><Input type="number" placeholder="Amount" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} /></div>
            <Field label="Closed on"><Input type="date" value={tx.closed_on} onChange={(e) => setTx({ ...tx, closed_on: e.target.value })} /></Field>
            <Button variant="outline" onClick={() => act(() => api(`/investors/${id}/transactions`, { body: { ...tx, amount: tx.amount ? Number(tx.amount) : null, closed_on: tx.closed_on || null } }))}>Record transaction</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
