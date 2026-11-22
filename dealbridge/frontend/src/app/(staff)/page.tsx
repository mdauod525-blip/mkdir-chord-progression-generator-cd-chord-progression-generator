'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useApi } from '@/lib/hooks';
import { compactUsd, date, pct } from '@/lib/format';
import { Badge, Card, CardTitle, Disclaimer, ErrorBox, PageHeader, Stat } from '@/components/ui';
import { MarketBars, RoiScatter, SimpleBars } from '@/components/charts';

const PropertyMap = dynamic(() => import('@/components/PropertyMap').then((m) => m.PropertyMap), { ssr: false });
const BANDS: [string, string][] = [
  ['Exceptional opportunity', 'Exceptional 90+'], ['Strong opportunity', 'Strong 80–89'], ['Potential opportunity', 'Potential 70–79'],
  ['Requires further investigation', 'Investigate 60–69'], ['Not recommended', 'Not rec. <60'], ['Insufficient data — manual review', 'Insufficient data'],
];

export default function Dashboard() {
  const router = useRouter();
  const m = useApi('/dashboard/metrics');
  const c = useApi('/dashboard/charts');
  const map = useApi('/dashboard/map');
  const alerts = useApi('/alerts?unread_only=true');
  const go = useCallback((id: string) => router.push(`/properties/${id}`), [router]);
  const d = m.data;
  const bands = c.data ? BANDS.map(([b, short]) => ({ band: short, count: c.data.score_bands.find((x: any) => x.band === b)?.count ?? 0 })) : [];
  return (
    <div>
      <PageHeader title="Dashboard" sub="Pipeline health across all active markets." />
      <ErrorBox error={m.error} />
      {d && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Properties discovered" value={d.properties_discovered} />
          <Stat label="Deals analyzed" value={d.deals_analyzed} sub={`${d.needs_manual_review} need manual review`} />
          <Stat label="Qualified deals" value={d.qualified_deals} sub="score ≥ 70, no open flags" />
          <Stat label="Avg projected ROI" value={pct(d.average_projected_roi_pct)} sub="qualified deals" />
          <Stat label="Total est. deal profit" value={compactUsd(d.total_estimated_profit)} sub="qualified, projected" />
          <Stat label="Active investors" value={d.active_investors} />
          <Stat label="Investor matches" value={d.investor_matches} sub="eligible, preliminary" />
          <Stat label="Under review" value={d.opportunities_under_review} sub="draft → approved" />
          <Stat label="Presented" value={d.opportunities_presented} sub="published opportunities" />
          <Stat label="Closed transactions" value={d.closed_transactions} />
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Current analysis per property">Deals by score band</CardTitle>
          {c.data && <SimpleBars data={bands} x="band" y="count" valueLabel="Deals" horizontal />}
        </Card>
        <Card>
          <CardTitle hint="Click a point to open the property">ROI on cash vs. deal score</CardTitle>
          {c.data && <RoiScatter data={c.data.roi_vs_score} onSelect={go} />}
        </Card>
        <Card>
          <CardTitle hint="Analyzed vs. qualified">Deals by market</CardTitle>
          {c.data && <MarketBars data={c.data.by_market} />}
        </Card>
        <Card>
          <CardTitle hint="OpenStreetMap">Property map</CardTitle>
          {map.data && <PropertyMap points={map.data} height={260} onSelect={go} />}
        </Card>
        <Card>
          <CardTitle hint="Active investors by CRM stage">Investor pipeline</CardTitle>
          {c.data && <SimpleBars data={c.data.pipeline.map((p: any) => ({ ...p, stage: p.stage.replace(/_/g, ' ') }))} x="stage" y="count" valueLabel="Investors" horizontal />}
        </Card>
        <Card>
          <CardTitle right={<Link href="/agent" className="text-xs text-accent hover:underline">Agent activity</Link>}>Unread alerts</CardTitle>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(alerts.data ?? []).slice(0, 12).map((a: any) => (
              <li key={a.id} className="rounded-lg border border-line p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone={a.level === 'critical' ? 'bad' : a.level === 'warning' ? 'warn' : 'accent'}>{a.category}</Badge>
                  <span className="font-medium">{a.title}</span>
                </div>
                {a.body && <p className="mt-1 text-xs text-ink-2">{a.body}</p>}
                <div className="mt-1 text-xs text-muted">{date(a.created_at)}</div>
              </li>
            ))}
            {alerts.data?.length === 0 && <li className="text-sm text-muted">No unread alerts.</li>}
          </ul>
        </Card>
      </div>
      <Disclaimer className="mt-6" />
    </div>
  );
}
