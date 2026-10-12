'use client';
import Link from 'next/link';
import type { ScanRow } from '@/lib/analysis/stock';
import { daysUntil, fmtBig, fmtDate, fmtPct, fmtPrice, fmtRR } from '@/lib/client/format';
import { Badge, DataBadge, Delta, ScorePill, TrendChip } from './ui';

export function valuationTone(a: string) {
  return a.startsWith('Under') ? 'up' : a.startsWith('Over') ? 'down' : 'neutral';
}

export function StockCard({ row, score, extra }: { row: ScanRow; score?: number; extra?: React.ReactNode }) {
  const earningsSoon = row.nextEarningsDate && daysUntil(row.nextEarningsDate) >= 0 && daysUntil(row.nextEarningsDate) <= 14;
  return (
    <Link href={`/stock/${encodeURIComponent(row.symbol)}`} className="block min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-3.5 transition active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <ScorePill score={score ?? row.score} confidence={row.confidence} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-bold">{row.symbol}</div>
              <div className="truncate text-xs text-muted">{row.name}</div>
            </div>
            <div className="text-right">
              <div className="tabular font-semibold">{fmtPrice(row.price)}</div>
              <div className="text-xs"><Delta value={row.change1d} /></div>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <TrendChip state={row.dailyTrend} />
            <Badge tone={/up/.test(row.weeklyTrend) ? 'up' : /down/.test(row.weeklyTrend) ? 'down' : 'neutral'}>W: {row.weeklyTrend}</Badge>
            <Badge tone={valuationTone(row.valuationAssessment)}>{row.valuationAssessment}</Badge>
            {row.flags?.extended && <Badge tone="warn">Extended</Badge>}
            {earningsSoon && <Badge tone="warn">Earnings {fmtDate(row.nextEarningsDate)}</Badge>}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-surface-2 p-2.5 text-xs">
        {row.setup ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{row.setup}</span>
              {row.inEntryZone && <Badge tone="accent">In entry zone</Badge>}
              {row.setupRisk === 'higher' && <Badge tone="warn">Higher risk</Badge>}
            </div>
            <div className="tabular mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              <span><span className="text-muted">Entry </span>{fmtPrice(row.entryLow)}–{fmtPrice(row.entryHigh)}</span>
              <span><span className="text-muted">Invalid </span>{fmtPrice(row.invalidation)}</span>
              <span><span className="text-muted">Up/Down </span>{fmtPct(row.upsidePct, 0)} / {fmtPct(row.downsidePct ? -row.downsidePct : null, 0)}</span>
              <span><span className="text-muted">R/R </span>{fmtRR(row.rewardRisk)}</span>
            </div>
          </>
        ) : (
          <span className="text-muted">No clear setup</span>
        )}
      </div>

      <div className="tabular mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Quality {row.qualityScore ?? '—'}</span>
        <span>RS 3m {fmtPct(row.rsVs3m, 0)}</span>
        <span>Mkt cap {fmtBig(row.marketCap)}</span>
        <span>Support {row.support ? fmtPrice(row.support[1]) : '—'}</span>
        <span>Resist. {row.resistance ? fmtPrice(row.resistance[0]) : '—'}</span>
        <span>Earnings {row.nextEarningsDate ? fmtDate(row.nextEarningsDate) : 'n/a'}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <DataBadge meta={{ kind: row.dataKind, asOf: row.asOf, stale: row.stale, fetchedAt: '', provider: '', adjusted: true }} compact />
        <Badge title="Share of score inputs that were available">Data {Math.round(row.completeness * 100)}%</Badge>
        {!row.fundamentalsAvailable && <Badge tone="warn">No fundamentals</Badge>}
        {extra}
      </div>
    </Link>
  );
}
