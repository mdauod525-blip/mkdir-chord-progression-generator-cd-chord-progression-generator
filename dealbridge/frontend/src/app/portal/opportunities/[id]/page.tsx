'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Button, Card, CardTitle, ErrorBox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { OpportunityBody } from '@/components/OpportunityBody';

export default function PortalOpportunity() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error } = useApi(`/marketplace/${id}`);
  const [f, setF] = useState({ kind: 'interested', message: '', indicated_amount: '', preferred_times: '', acknowledge_nonbinding: false });
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState('');
  if (error) return <ErrorBox error={error} />;
  if (!o) return <p className="text-sm text-muted">Loading…</p>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api(`/marketplace/${id}/interest`, { body: { ...f, indicated_amount: f.indicated_amount ? Number(f.indicated_amount) : null } });
      setDone(r.note ?? 'Sent.');
      setErr(null);
    } catch (x) {
      setErr(x);
    }
  }
  return (
    <div>
      <PageHeader title={o.title} sub={`${o.location.city}, ${o.location.state}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><OpportunityBody o={o} /></div>
        <Card className="h-fit lg:sticky lg:top-4">
          <CardTitle hint="Nothing here is an offer, commitment or agreement.">Next steps</CardTitle>
          {done ? <p className="text-sm text-good">{done}</p> : (
            <form onSubmit={submit} className="space-y-3">
              <Field label="I'd like to"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="interested">Express interest</option><option value="info_request">Request more information</option>
                <option value="schedule_discussion">Schedule a discussion</option><option value="nonbinding_eoi">Submit a nonbinding expression of interest</option></Select></Field>
              <Field label="Message"><Textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
              {f.kind === 'schedule_discussion' && <Field label="Preferred times"><Input value={f.preferred_times} onChange={(e) => setF({ ...f, preferred_times: e.target.value })} /></Field>}
              {f.kind === 'nonbinding_eoi' && <>
                <Field label="Indicative amount (nonbinding)"><Input type="number" value={f.indicated_amount} onChange={(e) => setF({ ...f, indicated_amount: e.target.value })} /></Field>
                <label className="flex gap-2 text-xs"><input type="checkbox" checked={f.acknowledge_nonbinding} onChange={(e) => setF({ ...f, acknowledge_nonbinding: e.target.checked })} />I understand this is a nonbinding indication of interest — not an offer, commitment or agreement by me or anyone else.</label>
              </>}
              <Button className="w-full">Send</Button>
              <ErrorBox error={err} />
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
