'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, usePaper } from '@/components/AppContext';
import { Badge, Button, Card, Delta, Empty, Field, inputCls, PageHeader, Stat } from '@/components/ui';
import type { BarsResponse } from '@/lib/client/apiTypes';
import { fmtDate, fmtPct, fmtPrice } from '@/lib/client/format';
import { uid } from '@/lib/client/store';
import { getJson } from '@/lib/client/useApi';
import { benchmarkReturn, computeLedger, DEFAULT_PAPER, portfolioValue, processOrders, type PaperOrder } from '@/lib/paper/portfolio';
import type { Bar } from '@/lib/types';
import { SYMBOL_RE } from '@/lib/universe';

function num(s: string | null) {
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function PaperInner() {
  const sp = useSearchParams();
  const { status, mode } = useApp();
  const [paper, setPaper] = usePaper();
  const [bars, setBars] = useState<Record<string, Bar[]>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: sp.get('symbol') ?? '',
    side: 'buy' as 'buy' | 'sell',
    qty: '',
    type: 'market' as 'market' | 'limit',
    limit: '',
    thesis: '',
    invalidation: sp.get('stop') ?? '',
    target: sp.get('target') ?? '',
    notes: '',
  });
  const [div, setDiv] = useState({ symbol: '', date: '', amount: '' });
  const benchSym = status?.benchmark.symbol ?? '';

  const ledger = useMemo(() => computeLedger(paper), [paper]);
  const symbols = useMemo(() => [...new Set([...paper.orders.filter((o) => o.status === 'pending').map((o) => o.symbol), ...ledger.positions.map((p) => p.symbol), benchSym].filter(Boolean))], [paper.orders, ledger.positions, benchSym]);

  /** Fetch bars after the earliest pending order / first fill, then simulate fills. */
  const sync = useCallback(async () => {
    if (!symbols.length) return;
    const pending = paper.orders.filter((o) => o.status === 'pending').map((o) => o.placedAfterBar);
    const fills = paper.orders.filter((o) => o.fill).map((o) => o.fill!.date);
    const since = [...pending, ...fills].sort()[0];
    try {
      const res = await getJson<BarsResponse>(`/api/bars?symbols=${encodeURIComponent(symbols.join(','))}${since ? `&since=${since}` : ''}`);
      const map: Record<string, Bar[]> = {};
      const errs: string[] = [];
      for (const [s, v] of Object.entries(res)) {
        if ('bars' in v) map[s] = v.bars;
        else errs.push(`${s}: ${v.error}`);
      }
      setBars(map);
      setLoadErr(errs.length ? errs.join('; ') : null);
      setPaper((p) => {
        const next = processOrders(p, map);
        return JSON.stringify(next.orders) === JSON.stringify(p.orders) ? p : next;
      });
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, [symbols, paper.orders, setPaper]);

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  const prices = Object.fromEntries(Object.entries(bars).map(([s, b]) => [s, b.length ? b[b.length - 1].close : null]));
  const pv = portfolioValue(ledger, prices);
  const firstFill = paper.orders.filter((o) => o.fill).map((o) => o.fill!.date).sort()[0] ?? null;
  const totalRet = (pv.equity / paper.settings.startingCash - 1) * 100;
  const bRet = benchmarkReturn(bars[benchSym] ?? [], firstFill);

  const submit = async () => {
    setMsg(null);
    const s = form.symbol.trim().toUpperCase();
    const qty = Math.floor(Number(form.qty));
    if (!SYMBOL_RE.test(s)) return setMsg('Enter a valid ticker.');
    if (mode === 'demo' && !s.endsWith('.DM')) return setMsg('Demo mode only covers fictional “.DM” tickers.');
    if (!(qty > 0)) return setMsg('Quantity must be a whole number above 0.');
    if (form.type === 'limit' && !num(form.limit)) return setMsg('Enter a limit price.');
    try {
      const res = await getJson<BarsResponse>(`/api/bars?symbols=${encodeURIComponent(s)}`);
      const r = res[s];
      if (!r || !('bars' in r) || !r.bars.length) return setMsg(`No price data for ${s}${r && 'error' in r ? `: ${r.error}` : ''}.`);
      const lastBar = r.bars[r.bars.length - 1].time;
      const order: PaperOrder = {
        id: uid(),
        symbol: s,
        side: form.side,
        qty,
        type: form.type,
        limitPrice: form.type === 'limit' ? num(form.limit) : undefined,
        placedAt: new Date().toISOString(),
        placedAfterBar: lastBar,
        status: 'pending',
        thesis: form.thesis || undefined,
        invalidation: num(form.invalidation),
        target: num(form.target),
        notes: form.notes || undefined,
      };
      setPaper((p) => ({ ...p, createdAt: p.orders.length ? p.createdAt : new Date().toISOString(), orders: [...p.orders, order] }));
      setMsg(`Simulated ${form.side} order placed. It fills at the first session after ${fmtDate(lastBar)} (${form.type === 'market' ? 'next open ± slippage' : 'if the limit is reached'}).`);
      setForm((f) => ({ ...f, qty: '', limit: '', thesis: '', notes: '' }));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const pending = paper.orders.filter((o) => o.status === 'pending');
  const history = [...paper.orders].filter((o) => o.status !== 'pending').sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <PageHeader title="Paper portfolio" subtitle={<>All orders and results are <strong>simulated</strong>. No brokerage is connected.</>} action={<Button variant="secondary" onClick={sync}>Update</Button>} />
      {loadErr && <p className="text-sm text-warn">Price data issue: {loadErr}</p>}

      <Card title="Summary" action={<Badge tone="warn">SIMULATED</Badge>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Equity" value={fmtPrice(pv.equity)} sub={`start ${fmtPrice(paper.settings.startingCash)}`} />
          <Stat label="Cash" value={fmtPrice(ledger.cash)} />
          <Stat label="Unrealized P/L" value={<Delta value={pv.unrealized} digits={2} suffix="" />} />
          <Stat label="Realized P/L" value={<Delta value={ledger.realizedPnL} digits={2} suffix="" />} sub={ledger.dividendIncome ? `+ dividends ${fmtPrice(ledger.dividendIncome)}` : undefined} />
          <Stat label="Total return" value={<Delta value={totalRet} digits={2} />} />
          <Stat label={`${status?.benchmark.symbol ?? 'Benchmark'} same period`} value={<Delta value={bRet} digits={2} />} sub={firstFill ? `from first fill ${fmtDate(firstFill)}` : 'no fills yet'} />
          <Stat label="Commissions" value={fmtPrice(ledger.commissions)} />
          <Stat label="Exposure" value={fmtPct(pv.equity ? (pv.marketValue / pv.equity) * 100 : 0, 0, false)} />
        </div>
        <p className="mt-2 text-[11px] text-muted">Total return is simple (not time-weighted). Benchmark return is from the open of the first fill date to the latest close.</p>
      </Card>

      <Card title={`Positions (${ledger.positions.length})`}>
        {ledger.positions.length ? (
          <ul className="divide-y divide-border">
            {ledger.positions.map((p) => {
              const px = prices[p.symbol];
              const pnl = px ? (px * p.qty - p.costBasis) : null;
              return (
                <li key={p.symbol} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/stock/${encodeURIComponent(p.symbol)}`} className="font-bold">{p.symbol}</Link>
                    <span className="tabular">{p.qty} @ {fmtPrice(p.avgCost)} → {fmtPrice(px)}</span>
                  </div>
                  <div className="tabular mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>P/L <Delta value={pnl} digits={2} suffix="" /> ({fmtPct(pnl !== null ? (pnl / p.costBasis) * 100 : null)})</span>
                    <span>Invalidation {fmtPrice(p.invalidation)}{px && p.invalidation ? ` (${fmtPct(((p.invalidation - px) / px) * 100)})` : ''}</span>
                    <span>Target {fmtPrice(p.target)}{px && p.target ? ` (${fmtPct(((p.target - px) / px) * 100)})` : ''}</span>
                  </div>
                  {p.thesis && <p className="mt-1 text-xs">Thesis: {p.thesis}</p>}
                  {px && p.invalidation && px <= p.invalidation && <p className="mt-1 text-xs font-semibold text-down">⚠ Latest close is at/below the invalidation level.</p>}
                </li>
              );
            })}
          </ul>
        ) : <Empty title="No open positions">Place a simulated order below.</Empty>}
      </Card>

      <Card title="New simulated order">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Ticker"><input className={inputCls} value={form.symbol} onChange={set('symbol')} autoCapitalize="characters" placeholder={mode === 'demo' ? 'NWND.DM' : 'MSFT'} /></Field>
          <Field label="Side"><select className={inputCls} value={form.side} onChange={set('side')}><option value="buy">Buy</option><option value="sell">Sell</option></select></Field>
          <Field label="Quantity"><input className={inputCls} inputMode="numeric" value={form.qty} onChange={set('qty')} placeholder="shares" /></Field>
          <Field label="Type"><select className={inputCls} value={form.type} onChange={set('type')}><option value="market">Market (next open)</option><option value="limit">Limit (20 sessions)</option></select></Field>
          {form.type === 'limit' && <Field label="Limit price"><input className={inputCls} inputMode="decimal" value={form.limit} onChange={set('limit')} /></Field>}
          <Field label="Invalidation"><input className={inputCls} inputMode="decimal" value={form.invalidation} onChange={set('invalidation')} placeholder="stop level" /></Field>
          <Field label="Target"><input className={inputCls} inputMode="decimal" value={form.target} onChange={set('target')} /></Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Entry thesis"><textarea className={`${inputCls} min-h-16 py-2`} value={form.thesis} onChange={set('thesis')} placeholder="Why this trade? What has to stay true?" /></Field>
          <Field label="Notes"><textarea className={`${inputCls} min-h-16 py-2`} value={form.notes} onChange={set('notes')} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={submit}>Place simulated order</Button>
          {sp.get('entry') && <span className="text-xs text-muted">Setup entry midpoint {fmtPrice(Number(sp.get('entry')))} — <Link className="underline" href={`/risk?${sp.toString()}`}>size it first</Link></span>}
        </div>
        {msg && <p role="status" className="mt-2 text-sm text-accent">{msg}</p>}
        <p className="mt-2 text-[11px] text-muted">Fill policy: market orders fill at the next session’s open after the latest bar known when you placed them, plus {paper.settings.slippageBps} bps slippage and {fmtPrice(paper.settings.commission)} commission. Limits fill only if a later session trades through the limit. No future prices are used.</p>
      </Card>

      {pending.length > 0 && (
        <Card title={`Pending orders (${pending.length})`}>
          <ul className="divide-y divide-border">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{o.side.toUpperCase()} {o.qty} {o.symbol} · {o.type}{o.limitPrice ? ` @ ${fmtPrice(o.limitPrice)}` : ''} · after {fmtDate(o.placedAfterBar)}</span>
                <button className="min-h-9 px-2 text-down" onClick={() => setPaper((p) => ({ ...p, orders: p.orders.map((x) => (x.id === o.id ? { ...x, status: 'cancelled' } : x)) }))}>Cancel</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Trade journal">
        {history.length ? (
          <ul className="divide-y divide-border">
            {history.map((o) => (
              <li key={o.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.side.toUpperCase()} {o.qty} {o.symbol}</span>
                  <Badge tone={o.status === 'filled' ? 'up' : o.status === 'rejected' ? 'down' : 'neutral'}>{o.status}</Badge>
                </div>
                <div className="tabular text-xs text-muted">{o.fill ? `Filled ${fmtDate(o.fill.date)} @ ${fmtPrice(o.fill.price)} (+${fmtPrice(o.fill.commission)} comm.)` : o.rejectReason ?? `Placed ${fmtDate(o.placedAt)}`}</div>
                {o.thesis && <div className="text-xs">Thesis: {o.thesis}</div>}
                {o.notes && <div className="text-xs text-muted">Notes: {o.notes}</div>}
              </li>
            ))}
          </ul>
        ) : <Empty title="No trades yet" />}
        {ledger.closedTrades.length > 0 && (
          <div className="mt-3 border-t border-border pt-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Closed trades (average cost)</div>
            {ledger.closedTrades.map((t, i) => <div key={i} className="tabular">{fmtDate(t.date)} {t.symbol} {t.qty} sh: {fmtPrice(t.entryAvg)} → {fmtPrice(t.exitPrice)} = <Delta value={t.pnl} digits={2} suffix="" /></div>)}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Record a dividend">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Ticker"><input className={inputCls} value={div.symbol} onChange={(e) => setDiv({ ...div, symbol: e.target.value })} /></Field>
            <Field label="Date"><input className={inputCls} type="date" value={div.date} onChange={(e) => setDiv({ ...div, date: e.target.value })} /></Field>
            <Field label="$/share"><input className={inputCls} inputMode="decimal" value={div.amount} onChange={(e) => setDiv({ ...div, amount: e.target.value })} /></Field>
          </div>
          <Button className="mt-2" variant="secondary" onClick={() => {
            const amt = num(div.amount);
            if (!div.symbol || !div.date || !amt) return;
            setPaper((p) => ({ ...p, dividends: [...p.dividends, { id: uid(), symbol: div.symbol.toUpperCase(), date: div.date, amountPerShare: amt }] }));
            setDiv({ symbol: '', date: '', amount: '' });
          }}>Add dividend</Button>
          <p className="mt-2 text-[11px] text-muted">Credited for shares held on that date. Dividends are entered manually (the free data feeds here do not supply a dividend calendar).</p>
        </Card>
        <Card title="Simulation settings">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Starting cash"><input className={inputCls} inputMode="decimal" disabled={paper.orders.length > 0} value={paper.settings.startingCash} onChange={(e) => setPaper((p) => ({ ...p, settings: { ...p.settings, startingCash: Number(e.target.value) || 0 } }))} /></Field>
            <Field label="Commission $"><input className={inputCls} inputMode="decimal" value={paper.settings.commission} onChange={(e) => setPaper((p) => ({ ...p, settings: { ...p.settings, commission: Math.max(0, Number(e.target.value) || 0) } }))} /></Field>
            <Field label="Slippage bps"><input className={inputCls} inputMode="decimal" value={paper.settings.slippageBps} onChange={(e) => setPaper((p) => ({ ...p, settings: { ...p.settings, slippageBps: Math.max(0, Number(e.target.value) || 0) } }))} /></Field>
          </div>
          <p className="mt-2 text-[11px] text-muted">Changing costs applies to future fills only. Starting cash is locked once orders exist.</p>
          <Button className="mt-2" variant="danger" onClick={() => confirm('Reset the paper portfolio? This deletes all simulated orders.') && setPaper({ ...DEFAULT_PAPER, createdAt: new Date().toISOString() })}>Reset portfolio</Button>
        </Card>
      </div>
    </div>
  );
}

export default function PaperPage() {
  return (
    <Suspense>
      <PaperInner />
    </Suspense>
  );
}
