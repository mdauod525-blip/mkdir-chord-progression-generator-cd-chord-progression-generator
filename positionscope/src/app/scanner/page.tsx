'use client';
import { useMemo, useState } from 'react';
import { useSettings } from '@/components/AppContext';
import { StockCard } from '@/components/StockCard';
import { Empty, ErrorBox, Field, inputCls, LoadingList, PageHeader } from '@/components/ui';
import type { ScanRow } from '@/lib/analysis/stock';
import type { ScanResponse } from '@/lib/client/apiTypes';
import { fmtDateTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/useApi';
import { reweight } from '@/lib/scoring/score';

type SortKey = 'score' | 'rr' | 'upside' | 'rs' | 'value' | 'quality' | 'cap' | 'change';
const SORTS: { key: SortKey; label: string; get: (r: ScanRow) => number | null }[] = [
  { key: 'score', label: 'Opportunity score', get: (r) => r.score },
  { key: 'rr', label: 'Reward/risk', get: (r) => r.rewardRisk },
  { key: 'upside', label: 'Upside to target', get: (r) => r.upsidePct },
  { key: 'rs', label: 'Relative strength (3m)', get: (r) => r.rsVs3m },
  { key: 'value', label: 'Upside to fair value (est.)', get: (r) => r.upsideToFair },
  { key: 'quality', label: 'Fundamental quality', get: (r) => r.qualityScore },
  { key: 'cap', label: 'Market cap', get: (r) => r.marketCap },
  { key: 'change', label: '1-day change', get: (r) => r.change1d },
];

const CAPS = [
  { v: 'all', label: 'Any', test: () => true },
  { v: 'mega', label: 'Mega (≥$200B)', test: (c: number | null) => c !== null && c >= 200e9 },
  { v: 'large', label: 'Large ($10–200B)', test: (c: number | null) => c !== null && c >= 10e9 && c < 200e9 },
  { v: 'mid', label: 'Mid/small (<$10B)', test: (c: number | null) => c !== null && c < 10e9 },
  { v: 'unknown', label: 'Unknown', test: (c: number | null) => c === null },
];

export default function Scanner() {
  const { data, error, loading, reload } = useApi<ScanResponse>('/api/scan');
  const [settings] = useSettings();
  const [sector, setSector] = useState('all');
  const [trend, setTrend] = useState('all');
  const [valuation, setValuation] = useState('all');
  const [cap, setCap] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [minRR, setMinRR] = useState(0);
  const [setupsOnly, setSetupsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('score');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const rows = useMemo(() => (data?.rows ?? []).map((r) => ({ ...r, score: reweight(r.components, settings.weights) })), [data, settings.weights]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);
  const filtered = useMemo(() => {
    const s = SORTS.find((x) => x.key === sort)!;
    const capTest = CAPS.find((c) => c.v === cap)!.test;
    return rows
      .filter((r) => (q ? (r.symbol + ' ' + r.name).toLowerCase().includes(q.toLowerCase()) : true))
      .filter((r) => sector === 'all' || r.sector === sector)
      .filter((r) => trend === 'all' || (trend === 'up' ? r.dailyTrendScore >= 0.5 : trend === 'down' ? r.dailyTrendScore <= -0.5 : r.dailyTrendScore > -0.5 && r.dailyTrendScore < 0.5))
      .filter((r) => valuation === 'all' || r.valuationAssessment.toLowerCase().startsWith(valuation))
      .filter((r) => capTest(r.marketCap))
      .filter((r) => r.score >= minScore)
      .filter((r) => (minRR > 0 ? (r.rewardRisk ?? 0) >= minRR : true))
      .filter((r) => !setupsOnly || r.setup)
      .sort((a, b) => (s.get(b) ?? -Infinity) - (s.get(a) ?? -Infinity));
  }, [rows, q, sector, trend, valuation, cap, minScore, minRR, setupsOnly, sort]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingList rows={6} />;
  const active = [sector !== 'all', trend !== 'all', valuation !== 'all', cap !== 'all', minScore > 0, minRR > 0, setupsOnly].filter(Boolean).length;

  return (
    <div>
      <PageHeader title="Opportunity scanner" subtitle={<>Ranked by transparent score · {fmtDateTime(data.generatedAt)}</>} />
      <div className="sticky top-[49px] z-10 -mx-4 mb-3 space-y-2 border-b border-border bg-bg/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex gap-2">
          <input aria-label="Search symbol or name" className={inputCls} placeholder="Search symbol or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="min-h-10 shrink-0 rounded-xl border border-border bg-surface px-3 text-sm font-semibold">
            Filters{active ? ` (${active})` : ''}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted" htmlFor="sort">Sort</label>
          <select id="sort" className={`${inputCls} !min-h-9 !text-sm`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Sector">
              <select className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="all">All sectors</option>
                {sectors.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Daily trend">
              <select className={inputCls} value={trend} onChange={(e) => setTrend(e.target.value)}>
                <option value="all">Any</option><option value="up">Uptrend</option><option value="side">Sideways</option><option value="down">Downtrend</option>
              </select>
            </Field>
            <Field label="Valuation">
              <select className={inputCls} value={valuation} onChange={(e) => setValuation(e.target.value)}>
                <option value="all">Any</option><option value="under">Undervalued (est.)</option><option value="fair">Fairly valued (est.)</option><option value="over">Overvalued (est.)</option><option value="insufficient">Insufficient data</option>
              </select>
            </Field>
            <Field label="Market cap">
              <select className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)}>
                {CAPS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={`Min score: ${minScore}`}>
              <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </Field>
            <Field label={`Min reward/risk: ${minRR ? minRR.toFixed(1) + ':1' : 'any'}`}>
              <input type="range" min={0} max={4} step={0.5} value={minRR} onChange={(e) => setMinRR(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </Field>
            <label className="col-span-2 flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={setupsOnly} onChange={(e) => setSetupsOnly(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" /> Only stocks with a defined setup
            </label>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-muted">{filtered.length} of {rows.length} stocks. The score ranks evidence for comparison; it is not a probability of profit.</p>
      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((r) => <StockCard key={r.symbol} row={r} />)}
      </div>
      {!filtered.length && <Empty title="No stocks match">Loosen the filters to see more results.</Empty>}
      {data.errors.length > 0 && <p className="mt-3 text-xs text-warn">Skipped: {data.errors.map((e) => `${e.symbol} (${e.error})`).join('; ')}</p>}
    </div>
  );
}
