'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { compactUsd, date, label } from '@/lib/format';
import { Badge, Button, Card, CardTitle, DemoBadge, PageHeader } from '@/components/ui';

export default function CRM() {
  const pipe = useApi('/crm/pipeline');
  const fus = useApi('/crm/follow-ups');
  const notes = useApi('/notifications?limit=30');
  const move = async (id: string, stage: string) => { await api(`/investors/${id}/stage`, { body: { stage } }); void pipe.reload(); };
  const onDrop = (stage: string) => (e: React.DragEvent) => { const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, stage); };
  return (
    <div>
      <PageHeader title="Investor CRM" sub="Drag investors between stages. Every change is logged in their contact history." />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pipe.data?.stages.map((s: string) => (
          <div key={s} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(s)} className="w-56 shrink-0 rounded-xl border border-line bg-surface-2 p-2">
            <div className="mb-2 flex justify-between px-1 text-xs font-semibold text-ink-2"><span>{label(s)}</span><span>{pipe.data.columns[s]?.length ?? 0}</span></div>
            <div className="min-h-24 space-y-2">
              {pipe.data.columns[s]?.map((i: any) => (
                <div key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)} className="cursor-grab rounded-lg border border-line bg-surface p-2 text-sm shadow-sm">
                  <Link href={`/investors/${i.id}`} className="font-medium hover:text-accent">{i.name}</Link> <DemoBadge show={i.is_demo} />
                  <div className="text-xs text-muted">{label(i.investor_type)} · {compactUsd(i.available_capital)}</div>
                  {i.next_follow_up && <div className="mt-1 text-xs text-ink-2">Follow up {date(i.next_follow_up)}</div>}
                </div>))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Open follow-ups</CardTitle>
          <ul className="space-y-1.5 text-sm">{fus.data?.map((f: any) => (
            <li key={f.id} className="flex items-center justify-between gap-2"><span>{f.overdue && <Badge tone="bad">overdue</Badge>} {date(f.due_date)} — <Link className="hover:text-accent" href={`/investors/${f.investor_id}`}>{f.investor_name}</Link>: {f.note}</span>
              <Button size="sm" variant="ghost" onClick={async () => { await api(`/crm/follow-ups/${f.id}/done`, { method: 'POST' }); void fus.reload(); }}>Done</Button></li>))}
            {fus.data?.length === 0 && <li className="text-muted">Nothing due.</li>}</ul>
        </Card>
        <Card><CardTitle hint="dry_run = no provider key configured; blocked = consent rules">Recent messages</CardTitle>
          <ul className="space-y-1 text-sm">{notes.data?.map((n: any) => <li key={n.id} className="flex justify-between gap-2"><span className="truncate">{n.subject ?? n.template_key} → {n.recipient}</span><Badge tone={n.status === 'sent' ? 'good' : n.status.startsWith('blocked') || n.status === 'failed' ? 'bad' : 'neutral'}>{n.status}</Badge></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
