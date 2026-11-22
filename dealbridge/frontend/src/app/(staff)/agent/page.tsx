'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { date, label } from '@/lib/format';
import { Badge, Button, Card, CardTitle, ErrorBox, PageHeader } from '@/components/ui';

export default function Agent() {
  const runs = useApi('/agent/runs');
  const ingest = useApi('/ingestion-runs?limit=20');
  const alerts = useApi('/alerts');
  const [sel, setSel] = useState<string | null>(null);
  const events = useApi(sel ? `/agent/runs/${sel}/events` : null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const run = async (w: string) => {
    setBusy(w);
    try { await api(`/agent/run/${w}`, { method: 'POST' }); setErr(null); await runs.reload(); await alerts.reload(); } catch (e) { setErr(e); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="Automated agent activity"
        sub="Daily: ingest approved sources → dedupe → comps → ARV → renovation → returns → score → match → summaries → notify admins. Weekly: recalculate, detect price cuts and improvements, refresh matches, report. The agent never buys, offers, signs, moves money or publishes."
        actions={<><Button variant="outline" disabled={!!busy} onClick={() => run('daily')}>{busy === 'daily' ? 'Running…' : 'Run daily now'}</Button><Button variant="outline" disabled={!!busy} onClick={() => run('weekly')}>{busy === 'weekly' ? 'Running…' : 'Run weekly now'}</Button></>} />
      <ErrorBox error={err} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Workflow runs</CardTitle>
          <ul className="space-y-1.5 text-sm">{runs.data?.map((r: any) => (
            <li key={r.id}><button onClick={() => setSel(r.id)} className={`w-full rounded-lg border p-2 text-left ${sel === r.id ? 'border-accent' : 'border-line'}`}>
              <div className="flex justify-between"><span><Badge tone={r.status === 'succeeded' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status}</Badge> {r.workflow}</span><span className="text-xs text-muted">{date(r.started_at)} · {r.triggered_by}</span></div>
              <div className="mt-1 text-xs text-ink-2">{Object.entries(r.stats ?? {}).map(([k, v]) => `${label(k)}: ${v}`).join(' · ')}</div></button></li>))}
            {runs.data?.length === 0 && <li className="text-muted">No runs yet.</li>}</ul>
        </Card>
        <Card><CardTitle>{sel ? 'Run events' : 'Select a run to see its events'}</CardTitle>
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">{events.data?.map((e: any, i: number) => <li key={i} className="flex gap-2"><Badge tone={e.level === 'error' ? 'bad' : e.level === 'warning' ? 'warn' : 'neutral'}>{e.step}</Badge><span>{e.message}</span></li>)}</ul>
        </Card>
        <Card><CardTitle>Data ingestion runs</CardTitle>
          <ul className="space-y-1 text-sm">{ingest.data?.map((r: any) => <li key={r.id} className="flex justify-between gap-2"><span>{r.source_key} <Badge tone={r.status === 'succeeded' ? 'good' : r.status === 'not_configured' ? 'neutral' : 'bad'}>{label(r.status)}</Badge></span><span className="text-xs text-muted">+{r.created} / ~{r.updated} · {date(r.started_at)}</span></li>)}
            {ingest.data?.length === 0 && <li className="text-muted">No data sources have run. Configure them in Administration → Data sources.</li>}</ul>
        </Card>
        <Card><CardTitle>Alerts</CardTitle>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">{alerts.data?.map((a: any) => (
            <li key={a.id} className={a.is_read ? 'opacity-60' : ''}><Badge tone={a.level === 'critical' ? 'bad' : a.level === 'warning' ? 'warn' : 'accent'}>{a.category}</Badge> {a.title}
              {!a.is_read && <button className="ml-2 text-xs text-accent hover:underline" onClick={async () => { await api(`/alerts/${a.id}/read`, { method: 'POST' }); void alerts.reload(); }}>mark read</button>}</li>))}</ul>
        </Card>
      </div>
    </div>
  );
}
