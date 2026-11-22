'use client';
import Link from 'next/link';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label, pct, usd } from '@/lib/format';
import { Badge, Card, DemoBadge, Disclaimer, Empty, PageHeader } from '@/components/ui';
import { ScoreBadge } from '@/components/deal';

export default function Marketplace() {
  const { data, error, reload } = useApi('/marketplace');
  if (error instanceof ApiError && error.status === 403)
    return <Card className="mx-auto max-w-xl"><h1 className="text-lg font-semibold">Your account is under review</h1>
      <p className="mt-2 text-sm text-ink-2">We verify every investor before granting marketplace access. Meanwhile, complete <Link className="text-accent hover:underline" href="/portal/profile">your profile</Link> so we can match you with suitable opportunities.</p></Card>;
  return (
    <div>
      <PageHeader title="Opportunities" sub="Analyzed and approved deals. Your match score reflects only the preferences you shared." />
      {data?.length === 0 && <Empty>No published opportunities right now. We will email you when one fits your preferences (if you opted in).</Empty>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((o: any) => (
          <Card key={o.id} className="flex flex-col">
            {o.property.photos?.[0] && <img src={o.property.photos[0].url} alt="" className="mb-3 h-40 w-full rounded-lg object-cover" />}
            <div className="flex items-start justify-between gap-2">
              <Link href={`/portal/opportunities/${o.id}`} className="font-semibold hover:text-accent">{o.title}</Link>
              <button aria-label={o.saved ? 'Unsave' : 'Save'} onClick={async () => { await api(`/marketplace/${o.id}/interest`, { body: { kind: 'saved' } }); void reload(); }}>{o.saved ? <BookmarkCheck size={18} className="text-accent" /> : <Bookmark size={18} className="text-muted" />}</button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">{o.location.city}, {o.location.state} <DemoBadge show={o.is_demo} /> {o.property.opportunity_types.slice(0, 2).map((t: string) => <Badge key={t}>{label(t)}</Badge>)}</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-2">Asking</dt><dd className="tabular text-right">{usd(o.asking_price)}</dd>
              <dt className="text-ink-2">Est. ARV</dt><dd className="tabular text-right">{usd(o.analysis?.arv)}</dd>
              <dt className="text-ink-2">Est. total cost</dt><dd className="tabular text-right">{usd(o.analysis?.total_project_cost)}</dd>
              <dt className="text-ink-2">Projected profit</dt><dd className="tabular text-right">{usd(o.analysis?.net_profit)}</dd>
              <dt className="text-ink-2">Projected ROI</dt><dd className="tabular text-right">{pct(o.analysis?.roi_pct)}</dd>
            </dl>
            <div className="mt-auto flex items-center justify-between pt-3"><ScoreBadge score={o.analysis?.score} />{o.my_match && <span className="text-xs text-ink-2">Your fit {o.my_match.score.toFixed(0)}/100</span>}</div>
          </Card>
        ))}
      </div>
      <Disclaimer className="mt-6" />
    </div>
  );
}
