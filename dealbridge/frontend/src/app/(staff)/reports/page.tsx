'use client';
import { useState } from 'react';
import { useApi } from '@/lib/hooks';
import { compactUsd, date, pct, usd } from '@/lib/format';
import { Card, CardTitle, Disclaimer, PageHeader, Stat } from '@/components/ui';

export default function Reports() {
  const fin = useApi('/reports/financial');
  const list = useApi('/reports');
  const [sel, setSel] = useState<string | null>(null);
  const rep = useApi(sel ? `/reports/${sel}` : null);
  const q = fin.data?.qualified;
  const all = fin.data?.all_analyzed;
  return (
    <div>
      <PageHeader title="Financial reporting" sub="Projected deal economics across the pipeline and platform revenue." />
      {fin.data && (
        <>
          <h2 className="mb-2 text-sm font-semibold">Qualified deals (score ≥ 70, no open review flags)</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="Deals" value={q.count} sub={`of ${all.count} with a full analysis`} />
            <Stat label="Total project cost" value={compactUsd(q.total_project_cost)} />
            <Stat label="Projected profit" value={compactUsd(q.total_projected_profit)} />
            <Stat label="Cash required" value={compactUsd(q.total_cash_required)} />
            <Stat label="Avg ROI on cash" value={pct(q.avg_roi_pct)} />
            <Stat label="Avg margin" value={pct(q.avg_margin_pct)} />
            <Stat label="Avg duration" value={q.avg_duration_months ? `${q.avg_duration_months} mo` : '—'} />
          </div>
          <h2 className="mb-2 mt-5 text-sm font-semibold">Platform revenue</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active subscriptions" value={fin.data.subscriptions.active} />
            <Stat label="Monthly recurring revenue" value={usd(fin.data.subscriptions.monthly_recurring_revenue)} sub="subscriptions only" />
          </div>
          <p className="mt-2 text-xs text-muted">{fin.data.note}</p>
        </>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card><CardTitle>Generated reports</CardTitle>
          <ul className="space-y-1 text-sm">{list.data?.map((r: any) => <li key={r.id}><button className={`text-left hover:text-accent ${sel === r.id ? 'font-medium text-accent' : ''}`} onClick={() => setSel(r.id)}>{r.title}</button> <span className="text-xs text-muted">{date(r.created_at)}</span></li>)}
            {list.data?.length === 0 && <li className="text-muted">The weekly workflow generates a report each run.</li>}</ul>
        </Card>
        <Card className="lg:col-span-2"><CardTitle>{rep.data?.title ?? 'Report'}</CardTitle>
          {rep.data ? <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{rep.data.content_md}</pre> : <p className="text-sm text-muted">Select a report.</p>}
        </Card>
      </div>
      <Disclaimer className="mt-6" />
    </div>
  );
}
