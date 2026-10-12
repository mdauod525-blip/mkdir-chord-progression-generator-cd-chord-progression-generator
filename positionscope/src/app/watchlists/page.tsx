'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApp, useSettings, useWatchlists } from '@/components/AppContext';
import { valuationTone } from '@/components/StockCard';
import { Badge, Button, Card, Delta, Empty, ErrorBox, inputCls, LoadingList, PageHeader, TrendChip } from '@/components/ui';
import type { ScanRow } from '@/lib/analysis/stock';
import { fmtPrice } from '@/lib/client/format';
import { uid } from '@/lib/client/store';
import { useApi } from '@/lib/client/useApi';
import { reweight } from '@/lib/scoring/score';
import { SYMBOL_RE } from '@/lib/universe';

export default function Watchlists() {
  const { status } = useApp();
  const [lists, setLists] = useWatchlists();
  const [settings] = useSettings();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [sym, setSym] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const url = active?.symbols.length ? `/api/rows?symbols=${encodeURIComponent(active.symbols.join(','))}` : null;
  const { data, error, loading, reload } = useApi<{ rows: ScanRow[]; errors: { symbol: string; error: string }[] }>(url);
  const rows = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.symbol, { ...r, score: reweight(r.components, settings.weights) }])), [data, settings.weights]);

  const create = () => {
    const name = newName.trim() || `Watchlist ${lists.length + 1}`;
    const w = { id: uid(), name, symbols: [], alertsEnabled: true };
    setLists([...lists, w]);
    setActiveId(w.id);
    setNewName('');
  };
  const update = (fn: (w: NonNullable<typeof active>) => NonNullable<typeof active>) => active && setLists(lists.map((l) => (l.id === active.id ? fn(l) : l)));
  const add = () => {
    const s = sym.trim().toUpperCase();
    setErr(null);
    if (!SYMBOL_RE.test(s)) return setErr('Enter a valid ticker, e.g. MSFT.');
    if (status?.mode === 'demo' && !s.endsWith('.DM')) return setErr('Demo mode only has fictional “.DM” tickers (see Scanner). Configure a data provider for real symbols.');
    if (!active) return;
    if (active.symbols.includes(s)) return setErr(`${s} is already in this list.`);
    update((w) => ({ ...w, symbols: [...w.symbols, s] }));
    setSym('');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Watchlists" subtitle="Saved in this browser only (no account yet)." />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {lists.map((l) => (
          <button key={l.id} onClick={() => setActiveId(l.id)} aria-pressed={active?.id === l.id} className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold ${active?.id === l.id ? 'bg-accent text-white' : 'border border-border bg-surface'}`}>
            {l.name} <span className="opacity-70">({l.symbols.length})</span>
          </button>
        ))}
      </div>
      <Card title="New watchlist">
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Name, e.g. Quality compounders" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New watchlist name" />
          <Button onClick={create}>Create</Button>
        </div>
      </Card>

      {!active ? (
        <Empty title="No watchlists yet">Create one above, or tap “Watch” on any stock page.</Empty>
      ) : (
        <Card
          title={active.name}
          action={
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={active.alertsEnabled} onChange={(e) => update((w) => ({ ...w, alertsEnabled: e.target.checked }))} />
              Alerts
            </label>
          }
        >
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input className={inputCls} placeholder={status?.mode === 'demo' ? 'Ticker, e.g. HRBR.DM' : 'Ticker, e.g. MSFT'} value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Ticker to add" autoCapitalize="characters" />
            <Button type="submit">Add</Button>
          </form>
          {err && <p role="alert" className="mb-2 text-sm text-down">{err}</p>}
          {active.alertsEnabled && <p className="mb-2 text-xs text-muted">With alerts on, every symbol here gets entry-zone and support-breakdown alerts (daily close).</p>}
          {error && <ErrorBox message={error} onRetry={reload} />}
          {loading && <LoadingList rows={3} />}
          {!active.symbols.length && <Empty title="Empty watchlist">Add tickers above.</Empty>}
          <ul className="divide-y divide-border">
            {active.symbols.map((s) => {
              const r = rows.get(s);
              const e = data?.errors.find((x) => x.symbol === s);
              return (
                <li key={s} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/stock/${encodeURIComponent(s)}`} className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2"><span className="font-bold">{s}</span><span className="tabular">{fmtPrice(r?.price)}</span><span className="text-sm"><Delta value={r?.change1d} /></span></div>
                      {r ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone="accent">Score {r.score}</Badge>
                          <TrendChip state={r.dailyTrend} />
                          <Badge tone={valuationTone(r.valuationAssessment)}>{r.valuationAssessment}</Badge>
                          {r.entryLow !== null && <Badge tone={r.inEntryZone ? 'accent' : 'neutral'}>Entry {fmtPrice(r.entryLow)}–{fmtPrice(r.entryHigh)}{r.inEntryZone ? ' · in zone' : ''}</Badge>}
                          {r.demo && <Badge tone="demo">demo</Badge>}
                        </div>
                      ) : e ? <div className="mt-1 text-xs text-warn">{e.error}</div> : null}
                    </Link>
                    <button onClick={() => update((w) => ({ ...w, symbols: w.symbols.filter((x) => x !== s) }))} className="min-h-10 rounded-lg px-2 text-sm text-down" aria-label={`Remove ${s}`}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button variant="danger" onClick={() => { if (confirm(`Delete “${active.name}”?`)) { setLists(lists.filter((l) => l.id !== active.id)); setActiveId(null); } }}>Delete list</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
