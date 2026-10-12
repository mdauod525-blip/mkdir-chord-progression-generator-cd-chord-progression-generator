'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAlertEvents, useApp, usePaper, useSettings, useWatchlists } from '@/components/AppContext';
import { Sparkline } from '@/components/Sparkline';
import { StockCard } from '@/components/StockCard';
import { Badge, Card, DataBadge, Delta, Empty, ErrorBox, LoadingList, PageHeader, Stat, TrendChip } from '@/components/ui';
import type { ScanRow } from '@/lib/analysis/stock';
import { classifyDailyTrend } from '@/lib/analysis/technical';
import type { ScanResponse } from '@/lib/client/apiTypes';
import { daysUntil, fmtDate, fmtDateTime, fmtPct, fmtPrice } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';
import { benchmarkReturn, computeLedger, portfolioValue } from '@/lib/paper/portfolio';
import { reweight } from '@/lib/scoring/score';

function ret(closes: number[], n: number) {
  return closes.length > n ? (closes[closes.length - 1] / closes[closes.length - 1 - n] - 1) * 100 : null;
}

function MiniList({ rows, empty, render }: { rows: ScanRow[]; empty: string; render: (r: ScanRow) => React.ReactNode }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.symbol}>
          <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="flex min-h-11 items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="font-semibold">{r.symbol}</span> <span className="tabular text-sm">{fmtPrice(r.price)}</span>
            </span>
            <span className="text-right text-xs text-muted">{render(r)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { status } = useApp();
  const { data, error, loading, reload } = useApi<ScanResponse>('/api/scan');
  const [settings] = useSettings();
  const [events] = useAlertEvents();
  const [watchlists] = useWatchlists();
  const [paper] = usePaper();

  const rows = useMemo(() => (data?.rows ?? []).map((r) => ({ ...r, score: reweight(r.components, settings.weights) })).sort((a, b) => b.score - a.score), [data, settings.weights]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingList rows={6} />;

  const bench = data.benchmark;
  const bcloses = bench?.bars.map((b) => b.close) ?? [];
  const benchTrend = bcloses.length >= 200 ? classifyDailyTrend(bcloses) : null;
  const up = rows.filter((r) => r.dailyTrendScore >= 0.5).length;
  const withSetup = rows.filter((r) => r.setup);
  const nearSupport = rows.filter((r) => r.flags?.nearSupport && r.dailyTrendScore > -0.5).slice(0, 5);
  const nearRes = rows.filter((r) => r.flags?.nearResistance).slice(0, 5);
  const breakouts = rows.filter((r) => r.flags?.breakout || r.setupType === 'breakout' || r.setupType === 'retest').slice(0, 5);
  const extended = rows.filter((r) => r.flags?.extended || r.flags?.overbought).slice(0, 5);
  const earnings = rows.filter((r) => r.nextEarningsDate && daysUntil(r.nextEarningsDate) >= 0 && daysUntil(r.nextEarningsDate) <= 30).sort((a, b) => a.nextEarningsDate!.localeCompare(b.nextEarningsDate!));

  const wlSymbols = [...new Set(watchlists.flatMap((w) => w.symbols))];
  const wlRows = rows.filter((r) => wlSymbols.includes(r.symbol));
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const ledger = computeLedger(paper);
  const prices = Object.fromEntries(rows.map((r) => [r.symbol, r.price]));
  const pv = portfolioValue(ledger, prices);
  const firstFill = paper.orders.filter((o) => o.fill).map((o) => o.fill!.date).sort()[0] ?? null;
  const pfRet = (pv.equity / paper.settings.startingCash - 1) * 100;
  const bRet = bench ? benchmarkReturn(bench.bars, firstFill) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={<>Scan of {rows.length} stocks · updated {fmtDateTime(data.generatedAt)}</>}
        action={<button onClick={reload} className="rounded-xl border border-border px-3 py-2 text-sm font-medium">Refresh</button>}
      />
      {status?.mode === 'demo' && (
        <div className="rounded-2xl border border-demo/30 bg-demo-soft p-3 text-sm text-demo">
          <strong>Demo mode.</strong> Every price, chart and financial figure is generated for fictional “.DM” companies. Nothing here is market data. <Link href="/settings" className="underline">Connect a free data provider</Link>.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Market overview" action={bench && <DataBadge meta={bench.meta} compact />}>
          {bench && bcloses.length ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-muted">{status?.benchmark.name}</div>
                  <div className="tabular text-xl font-bold">{fmtPrice(bcloses[bcloses.length - 1])}</div>
                  {benchTrend && <TrendChip state={benchTrend.state} />}
                </div>
                <Sparkline values={bcloses.slice(-126)} label="Benchmark, last 6 months" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Stat label="1D" value={<Delta value={ret(bcloses, 1)} />} />
                <Stat label="1M" value={<Delta value={ret(bcloses, 21)} />} />
                <Stat label="3M" value={<Delta value={ret(bcloses, 63)} />} />
                <Stat label="1Y" value={<Delta value={ret(bcloses, 252)} />} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Benchmark data unavailable.</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <Stat label="In uptrend" value={`${up}/${rows.length}`} />
            <Stat label="With setup" value={withSetup.length} />
            <Stat label="Extended" value={extended.length} />
          </div>
        </Card>

        <Card title="Paper portfolio" action={<Badge tone="warn">Simulated</Badge>}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Equity" value={fmtPrice(pv.equity)} />
            <Stat label="Total return" value={<Delta value={pfRet} digits={2} />} />
            <Stat label="Benchmark (same period)" value={<Delta value={bRet} digits={2} />} sub={firstFill ? `since ${fmtDate(firstFill)}` : 'no trades yet'} />
            <Stat label="Open positions" value={ledger.positions.length} />
          </div>
          {pv.missingPrices > 0 && <p className="mt-2 text-xs text-warn">{pv.missingPrices} position(s) outside the scan universe are valued at cost here; open Paper for live values.</p>}
          <Link href="/paper" className="mt-3 inline-block text-sm font-semibold text-accent">Open paper portfolio →</Link>
        </Card>
      </div>

      <Card title="Top potential opportunities" action={<Link href="/scanner" className="text-sm font-semibold text-accent">Scanner →</Link>}>
        <div className="grid gap-2 md:grid-cols-2">
          {rows.filter((r) => r.setup).slice(0, 4).map((r) => <StockCard key={r.symbol} row={r} />)}
        </div>
        {!withSetup.length && <Empty title="No clear setups today">Nothing in the universe currently matches a defined entry pattern with acceptable reward/risk.</Empty>}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Approaching support">
          <MiniList rows={nearSupport} empty="None within 1.5 ATR of support." render={(r) => <>support {r.support ? `${fmtPrice(r.support[0])}–${fmtPrice(r.support[1])}` : '—'}</>} />
        </Card>
        <Card title="Approaching resistance">
          <MiniList rows={nearRes} empty="None within 1.5 ATR of resistance." render={(r) => <>resistance {r.resistance ? fmtPrice(r.resistance[0]) : '—'}</>} />
        </Card>
        <Card title="Potential breakouts & retests">
          <MiniList rows={breakouts} empty="No recent breakouts above multi-touch resistance." render={(r) => <>{r.setup ?? 'closed above resistance'}</>} />
        </Card>
        <Card title="Extended / overbought">
          <MiniList rows={extended} empty="Nothing stretched right now." render={(r) => <>RSI {r.rsi?.toFixed(0)} {r.flags?.extended ? '· >4 ATR above 50d' : ''}</>} />
        </Card>
        <Card title="Upcoming earnings (30 days)">
          {status?.mode === 'live' && !status.estimates ? (
            <p className="text-sm text-muted">Earnings dates need an Alpha Vantage key (unavailable).</p>
          ) : (
            <MiniList rows={earnings} empty="No reports in the next 30 days." render={(r) => <>{fmtDate(r.nextEarningsDate)} · {daysUntil(r.nextEarningsDate!)}d{r.demo ? ' · demo date' : ''}</>} />
          )}
        </Card>
        <Card title="Recent alerts" action={<Link href="/alerts" className="text-sm font-semibold text-accent">All →</Link>}>
          {events.length ? (
            <ul className="space-y-2">
              {events.slice(0, 5).map((e) => (
                <li key={e.id} className="text-sm">
                  <span className={e.read ? '' : 'font-semibold'}>{e.message}</span>
                  <div className="text-xs text-muted">bar {fmtDate(e.barDate)}{e.demo ? ' · demo data' : ''}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No alerts yet. Create rules on the Alerts page or enable alerts on a watchlist.</p>
          )}
        </Card>
      </div>

      <Card title="Watchlist performance" action={<Link href="/watchlists" className="text-sm font-semibold text-accent">Manage →</Link>}>
        {wlRows.length ? (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Stat label="Symbols" value={wlSymbols.length} />
              <Stat label="Avg 1D" value={<Delta value={avg(wlRows.map((r) => r.change1d))} />} />
              <Stat label="Avg 5D" value={<Delta value={avg(wlRows.map((r) => r.change5d))} />} />
            </div>
            <MiniList rows={wlRows.slice(0, 8)} empty="" render={(r) => <>5D {fmtPct(r.change5d)} · score {r.score}</>} />
          </>
        ) : (
          <p className="text-sm text-muted">Add stocks to a watchlist to track them here.</p>
        )}
      </Card>

      {data.errors.length > 0 && (
        <Card title="Data issues">
          <ul className="space-y-1 text-sm text-warn">
            {data.errors.map((e) => <li key={e.symbol}><strong>{e.symbol}:</strong> {e.error}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
