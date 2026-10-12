'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useAlertRules, useSettings, useWatchlists } from '@/components/AppContext';
import { valuationTone } from '@/components/StockCard';
import { Badge, Button, Card, DataBadge, Delta, Disclaimer, ErrorBox, LinkButton, LoadingList, ScorePill, Skeleton, Stat, TrendChip } from '@/components/ui';
import type { Metric } from '@/lib/analysis/fundamentals';
import type { Setup } from '@/lib/analysis/setups';
import type { StockResponse } from '@/lib/client/apiTypes';
import { fmtBig, fmtDate, fmtDateTime, fmtNum, fmtPct, fmtPrice, fmtRR, fmtVol, fmtX } from '@/lib/client/format';
import { uid } from '@/lib/client/store';
import { useApi } from '@/lib/client/useApi';
import { reweight } from '@/lib/scoring/score';

const PriceChart = dynamic(() => import('@/components/PriceChart').then((m) => m.PriceChart), { ssr: false, loading: () => <Skeleton className="h-[400px]" /> });

function fmtMetric(m: Metric) {
  switch (m.format) {
    case 'pct': return fmtPct(m.value, 1, false);
    case 'usd': return fmtBig(m.value);
    case 'usdPerShare': return fmtPrice(m.value);
    case 'x': return fmtX(m.value);
    default: return m.value === null ? '—' : `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)} pp`;
  }
}

function SetupView({ s }: { s: Setup }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{s.label}</h3>
        {s.risk === 'higher' && <Badge tone="warn">Higher risk</Badge>}
        {s.priceInEntryZone && <Badge tone="accent">Price in entry zone</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Entry zone" value={`${fmtPrice(s.entryLow)}–${fmtPrice(s.entryHigh)}`} />
        <Stat label="Invalidation" value={fmtPrice(s.invalidation)} sub={`−${s.downsidePct.toFixed(1)}% from mid`} />
        <Stat label="Target 1" value={fmtPrice(s.targets[0].low)} sub={`+${s.upsidePct.toFixed(1)}% from mid`} />
        <Stat label="Reward/risk" value={fmtRR(s.rewardRisk)} />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {s.targets.map((t, i) => <li key={i}>Target {i + 1}: {fmtPrice(t.low)}–{fmtPrice(t.high)} · {t.label}</li>)}
        <li>{s.atrContext}</li>
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><div className="text-xs font-semibold uppercase tracking-wide text-up">✓ For</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{s.reasonsFor.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div><div className="text-xs font-semibold uppercase tracking-wide text-down">✗ Against</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{s.reasonsAgainst.length ? s.reasonsAgainst.map((r) => <li key={r}>{r}</li>) : <li className="text-muted">No major objections found by the rules</li>}</ul></div>
        <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Confirmation to look for</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{s.confirmation.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Cancels the setup</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{s.cancelIf.map((r) => <li key={r}>{r}</li>)}</ul></div>
      </div>
    </div>
  );
}

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent(use(params).symbol).toUpperCase();
  const { data, error, loading, reload } = useApi<StockResponse>(`/api/stock/${encodeURIComponent(symbol)}`);
  const [settings] = useSettings();
  const [watchlists, setWatchlists] = useWatchlists();
  const [, setRules] = useAlertRules();
  const [msg, setMsg] = useState<string | null>(null);
  const customScore = useMemo(() => (data ? reweight(Object.fromEntries(data.analysis.score.components.map((c) => [c.key, c.adjusted])) as never, settings.weights) : null), [data, settings.weights]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingList rows={6} />;
  const a = data.analysis;
  const t = a.technical;
  const best = a.setups?.best ?? null;
  const m = a.fundamentalMetrics.metrics;
  const inList = watchlists.some((w) => w.symbols.includes(symbol));

  const addToWatchlist = () => {
    setWatchlists((ws) => {
      if (!ws.length) return [{ id: uid(), name: 'My watchlist', symbols: [symbol], alertsEnabled: true }];
      return ws.map((w, i) => (i === 0 && !w.symbols.includes(symbol) ? { ...w, symbols: [...w.symbols, symbol] } : w));
    });
    setMsg(`Added ${symbol} to ${watchlists[0]?.name ?? 'My watchlist'}.`);
  };
  const quickAlerts = () => {
    const now = new Date().toISOString();
    setRules((rs) => [
      ...rs,
      { id: uid(), symbol, type: 'entryZone', timeframe: 'daily', cooldownDays: 5, enabled: true, createdAt: now },
      { id: uid(), symbol, type: 'nearSupport', timeframe: 'daily', cooldownDays: 5, enabled: true, createdAt: now },
      { id: uid(), symbol, type: 'resistanceBreakout', timeframe: 'weekly', cooldownDays: 7, enabled: true, createdAt: now },
    ]);
    setMsg('Created entry-zone, near-support and weekly breakout alerts. Manage them on the Alerts page.');
  };
  const q = best ? `symbol=${symbol}&entry=${((best.entryLow + best.entryHigh) / 2).toFixed(2)}&stop=${best.invalidation.toFixed(2)}&target=${best.targets[0].low.toFixed(2)}` : `symbol=${symbol}${t ? `&entry=${t.close.toFixed(2)}` : ''}`;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{a.info.symbol}</h1>
            <div className="truncate text-sm text-muted">{a.info.name} · {a.info.sector}</div>
          </div>
          <div className="text-right">
            <div className="tabular text-2xl font-bold">{fmtPrice(t?.close)}</div>
            <div className="text-sm"><Delta value={t?.change1d} /> <span className="text-xs text-muted">1D</span></div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DataBadge meta={a.priceMeta} />
          <Badge title={a.priceMeta.provider}>Source: {a.priceMeta.provider}</Badge>
          <Badge>Fetched {fmtDateTime(a.priceMeta.fetchedAt)}</Badge>
        </div>
        {a.priceMeta.notes.map((n) => <p key={n} className="mt-1 text-xs text-warn">{n}</p>)}
        {data.benchmarkError && <p className="mt-1 text-xs text-warn">Benchmark unavailable: {data.benchmarkError}. Relative strength is missing.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={addToWatchlist} disabled={inList}>{inList ? '★ In watchlist' : '☆ Watch'}</Button>
          <Button variant="secondary" onClick={quickAlerts}>Add alerts</Button>
          <LinkButton href={`/paper?${q}`}>Paper trade</LinkButton>
          <LinkButton href={`/risk?${q}`}>Size position</LinkButton>
        </div>
        {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
      </div>

      <Card title="Chart">
        <PriceChart daily={data.bars} benchmark={data.benchmark} zones={t?.levels.zones ?? []} fib={t?.levels.fibonacci ?? null} setup={best} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Entry opportunity" id="setup">
          {best ? <SetupView s={best} /> : <p className="font-medium">{a.setups?.summary ?? 'No clear setup — not enough data.'}</p>}
          {a.setups && a.setups.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-warn-soft p-2.5 text-sm text-warn">{a.setups.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
          )}
          {a.setups && a.setups.candidates.length > (best ? 1 : 0) && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">Other candidate setups ({a.setups.candidates.length - (best ? 1 : 0)})</summary>
              <div className="mt-2 space-y-4">{a.setups.candidates.filter((c) => c !== best).map((c, i) => <div key={i} className="rounded-xl border border-border p-3"><SetupView s={c} /></div>)}</div>
            </details>
          )}
        </Card>

        <Card title="Opportunity score">
          <div className="flex items-center gap-4">
            <ScorePill score={customScore ?? a.score.total} confidence={a.score.confidence} size="lg" />
            <div className="text-sm">
              <div>Data completeness <strong>{Math.round(a.score.completeness * 100)}%</strong> ({a.score.confidence} confidence)</div>
              {customScore !== a.score.total && <div className="text-xs text-muted">Default weights: {a.score.total}. Shown with your custom weights.</div>}
              <div className="mt-1 text-xs text-muted">A screening score for comparison — not a probability of profit.</div>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {a.score.components.map((c) => (
              <li key={c.key}>
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between text-sm"><span>{c.label} <span className="text-xs text-muted">({settings.weights[c.key]}%)</span></span><span className="tabular font-semibold">{c.raw === null ? <span className="text-warn">missing → {c.adjusted}</span> : c.adjusted}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${c.raw === null ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${c.adjusted}%` }} /></div>
                  </summary>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                    {c.reasons.map((r) => <li key={r}>{r}</li>)}
                    <li>Completeness {Math.round(c.completeness * 100)}%{c.completeness < 1 ? ' — missing share pulled toward 25' : ''}</li>
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          {a.score.notes.map((n) => <p key={n} className="mt-2 text-xs text-warn">{n}</p>)}
        </Card>
      </div>

      {t && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Technical snapshot" action={<span className="text-xs text-muted">as of {fmtDate(t.asOf)}</span>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="mb-1 text-xs font-medium text-muted">Daily trend</div><TrendChip state={t.dailyTrend.state} /><ul className="mt-1 text-xs text-muted">{t.dailyTrend.reasons.map((r) => <li key={r}>• {r}</li>)}</ul></div>
              <div><div className="mb-1 text-xs font-medium text-muted">Weekly trend {t.weeklyConfirmed ? '' : '(last completed week)'}</div><TrendChip state={t.weeklyTrend.state} /><ul className="mt-1 text-xs text-muted">{t.weeklyTrend.reasons.map((r) => <li key={r}>• {r}</li>)}</ul></div>
            </div>
            <dl className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm sm:grid-cols-3">
              {[
                ['SMA 20', fmtPrice(t.indicators.sma20)], ['SMA 50', fmtPrice(t.indicators.sma50)], ['SMA 100', fmtPrice(t.indicators.sma100)], ['SMA 200', fmtPrice(t.indicators.sma200)],
                ['EMA 20', fmtPrice(t.indicators.ema20)], ['EMA 50', fmtPrice(t.indicators.ema50)], ['RSI 14', fmtNum(t.indicators.rsi14, 1)], ['MACD hist', fmtNum(t.indicators.macdHist, 2)],
                ['ROC 20d', fmtPct(t.indicators.roc20)], ['ROC 63d', fmtPct(t.indicators.roc63)], ['ATR 14', `${fmtPrice(t.indicators.atr14)} (${fmtNum(t.indicators.atrPct, 1)}%)`], ['Bollinger', `${fmtPrice(t.indicators.bbLower)}–${fmtPrice(t.indicators.bbUpper)}`],
                ['52w high', fmtPrice(t.indicators.high52w)], ['52w low', fmtPrice(t.indicators.low52w)], ['Volume', `${fmtVol(t.indicators.volume)} (avg ${fmtVol(t.indicators.avgVolume50)})`],
                ['RS vs bench 3m', fmtPct(t.relativeStrength.vsBenchmark3m)], ['RS 6m', fmtPct(t.relativeStrength.vsBenchmark6m)], ['RS 12m', fmtPct(t.relativeStrength.vsBenchmark12m)],
              ].map(([k, v]) => <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
            <p className="mt-2 text-xs text-muted">RS = stock return minus {data.benchmarkInfo.name} return over the period, in percentage points.{t.relativeStrength.rsLineAt3mHigh ? ' RS line is at a 3-month high.' : ''}</p>
          </Card>

          <Card title="Support & resistance">
            {t.levels.zones.length ? (
              <ul className="space-y-2">
                {[...t.levels.zones].reverse().map((z) => (
                  <li key={z.id} className="rounded-xl border border-border p-2.5">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                        <span className="tabular font-semibold">{fmtPrice(z.low)}–{fmtPrice(z.high)}</span>
                        <span className="flex gap-1">
                          <Badge tone={z.role === 'support' ? 'up' : z.role === 'resistance' ? 'down' : 'neutral'}>{z.role === 'testing' ? 'price inside' : z.role}</Badge>
                          <Badge>strength {z.strength}</Badge>
                        </span>
                      </summary>
                      <ul className="mt-2 list-disc pl-4 text-xs text-muted">{z.evidence.map((e) => <li key={e}>{e}</li>)}<li>Timeframes: {z.timeframes.join(' + ')}</li></ul>
                    </details>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Not enough confirmed swing points to define zones.</p>}
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="text-xs font-medium text-muted">Moving averages (dynamic levels)</div>
              <ul className="tabular mt-1">{t.levels.movingAverages.map((ma) => <li key={ma.label}>{ma.label}: {fmtPrice(ma.value)} · {ma.slope} · acting as {ma.role}</li>)}</ul>
              {t.levels.fibonacci && (
                <>
                  <div className="mt-2 text-xs font-medium text-muted">Fibonacci (secondary reference)</div>
                  <p className="text-xs text-muted">{t.levels.fibonacci.note} Swing {fmtPrice(t.levels.fibonacci.swingLow.price)} ({fmtDate(t.levels.fibonacci.swingLow.time)}) → {fmtPrice(t.levels.fibonacci.swingHigh.price)} ({fmtDate(t.levels.fibonacci.swingHigh.time)}).</p>
                  <p className="tabular text-xs">{t.levels.fibonacci.levels.map((l) => `${(l.ratio * 100).toFixed(1)}% ${fmtPrice(l.price)}`).join(' · ')}</p>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      <Card title="Fundamentals" action={a.fundamentals ? <Badge tone={a.fundamentals.kind === 'demo' ? 'demo' : 'neutral'}>{a.fundamentals.provider}{a.fundamentals.kind === 'demo' ? ' · fictional' : ''}</Badge> : <Badge tone="warn">Unavailable</Badge>}>
        {!a.fundamentals ? (
          <p className="text-sm text-muted">{data.fundamentalsNote ?? 'No fundamentals available.'} Quality, growth and valuation are scored as missing.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted">
              <span>Latest fiscal year: FY{a.fundamentalMetrics.latestFiscalYear ?? '—'} (period end {fmtDate(a.fundamentalMetrics.periodEnd)})</span>
              <span>· Quality {a.fundamentalMetrics.qualityScore ?? '—'}/100 ({Math.round(a.fundamentalMetrics.qualityCompleteness * 100)}% of inputs)</span>
              <span>· Growth {a.fundamentalMetrics.growthScore ?? '—'}/100 ({Math.round(a.fundamentalMetrics.growthCompleteness * 100)}% of inputs)</span>
            </div>
            {(['Growth', 'Profitability', 'Balance sheet', 'Valuation multiples', 'Dividends', 'Estimates (provider forecasts)'] as const).map((group) => {
              const keys: Record<string, string[]> = {
                Growth: ['revenue', 'revenueGrowth', 'revenueCagr3', 'netIncomeGrowth', 'epsGrowth', 'epsCagr3'],
                Profitability: ['grossMargin', 'operatingMargin', 'netMargin', 'opMarginTrend', 'fcf', 'fcfMargin', 'roic'],
                'Balance sheet': ['netDebt', 'debtToEquity', 'netDebtToEbitda'],
                'Valuation multiples': ['marketCap', 'pe', 'ps', 'evEbitda', 'fcfYield', 'pegTrailing'],
                Dividends: ['dividendYield', 'payoutRatio'],
                'Estimates (provider forecasts)': ['forwardPE', 'pegForward', 'analystTarget'],
              };
              return (
                <div key={group} className="mb-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group}</div>
                  <dl className="divide-y divide-border rounded-xl border border-border">
                    {keys[group].map((k) => {
                      const mm = m[k];
                      return (
                        <div key={k} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <dt className="min-w-0"><div>{mm.label}</div><div className="text-[11px] text-muted">{mm.basis}{mm.value === null && mm.note ? ` · ${mm.note}` : ''}</div></dt>
                          <dd className={`tabular shrink-0 font-semibold ${mm.value === null ? 'text-muted' : ''}`}>{mm.value === null ? 'unavailable' : fmtMetric(mm)}{mm.kind === 'estimate' && mm.value !== null && <Badge className="ml-1">est.</Badge>}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Reported annual history</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="tabular w-full min-w-[420px] text-right text-xs">
                  <thead><tr className="text-muted"><th className="py-1 text-left">Fiscal year</th>{a.fundamentals.history.revenue.map((r) => <th key={r.fiscalYear}>FY{r.fiscalYear}</th>)}</tr></thead>
                  <tbody>
                    {([['Revenue', 'revenue', fmtBig], ['Operating income', 'operatingIncome', fmtBig], ['Net income', 'netIncome', fmtBig], ['Diluted EPS', 'epsDiluted', fmtPrice], ['Operating cash flow', 'operatingCashFlow', fmtBig], ['Capex', 'capex', fmtBig]] as const).map(([label, key, f]) => (
                      <tr key={key} className="border-t border-border">
                        <td className="py-1 text-left">{label}</td>
                        {a.fundamentals!.history.revenue.map((r) => {
                          const v = a.fundamentals!.history[key].find((x) => x.fiscalYear === r.fiscalYear);
                          return <td key={r.fiscalYear}>{v ? f(v.value) : '—'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 text-[11px] text-muted">{a.fundamentals.notes.map((n) => <li key={n}>{n}</li>)}<li>Retrieved {fmtDateTime(a.fundamentals.fetchedAt)}</li></ul>
            </details>
          </>
        )}
      </Card>

      <Card title="Valuation" action={<Badge tone={valuationTone(a.valuation.assessment)}>{a.valuation.assessment}</Badge>}>
        {a.valuation.blended ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3">
            <Stat label="Conservative" value={fmtPrice(a.valuation.blended.conservative)} />
            <Stat label="Base" value={fmtPrice(a.valuation.blended.base)} sub={`${fmtPct(a.valuation.upsideToBase, 0)} vs price`} />
            <Stat label="Optimistic" value={fmtPrice(a.valuation.blended.optimistic)} />
          </div>
        ) : <p className="text-sm text-muted">No method had sufficient, suitable data — no fair value is shown.</p>}
        <p className="mt-2 text-xs text-muted">Median of the suitable methods below. Fair values are model estimates built on the stated assumptions, not predictions.</p>
        <ul className="mt-3 space-y-2">
          {a.valuation.methods.map((vm) => (
            <li key={vm.key} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{vm.name}</span>
                {vm.suitable && vm.fairValue ? <span className="tabular text-xs">{fmtPrice(vm.fairValue.conservative)} / <strong>{fmtPrice(vm.fairValue.base)}</strong> / {fmtPrice(vm.fairValue.optimistic)}</span> : <Badge tone="warn">Not used</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">{vm.explanation}</p>
              {vm.assumptions.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs">{vm.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>}
            </li>
          ))}
        </ul>
        {a.valuation.peerComparison.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Peer comparison ({a.info.sector}, scanned universe)</div>
            <table className="tabular mt-1 w-full text-sm"><tbody>
              {a.valuation.peerComparison.map((p) => <tr key={p.metric} className="border-t border-border"><td className="py-1">{p.metric}</td><td className="text-right">{fmtX(p.company)}</td><td className="text-right text-muted">peer median {fmtX(p.peerMedian)}</td></tr>)}
            </tbody></table>
          </div>
        )}
        {a.valuation.notes.map((n) => <p key={n} className="mt-2 text-xs text-warn">{n}</p>)}
      </Card>

      <p className="text-xs text-muted">Next earnings: {a.nextEarningsDate ? `${fmtDate(a.nextEarningsDate)}${a.info.demo ? ' (fictional demo date)' : ''}` : 'unavailable from configured providers'}. <Link href="/methodology" className="underline">How these numbers are computed</Link>.</p>
      <Disclaimer />
    </div>
  );
}
