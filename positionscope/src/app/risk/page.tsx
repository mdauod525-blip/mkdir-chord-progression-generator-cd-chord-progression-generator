'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { usePaper } from '@/components/AppContext';
import { Card, Field, inputCls, PageHeader, Stat } from '@/components/ui';
import { fmtPct, fmtPrice, fmtRR } from '@/lib/client/format';
import { computeLedger } from '@/lib/paper/portfolio';
import { positionSize } from '@/lib/risk/sizing';

function RiskInner() {
  const sp = useSearchParams();
  const [paper] = usePaper();
  const ledger = computeLedger(paper);
  const paperEquity = ledger.cash + ledger.positions.reduce((s, p) => s + p.costBasis, 0);
  const [v, setV] = useState({
    equity: String(Math.round(paperEquity)),
    riskPct: '1',
    entry: sp.get('entry') ?? '',
    stop: sp.get('stop') ?? '',
    target: sp.get('target') ?? '',
    cost: '0.02',
    maxPos: '20',
    existing: '0',
  });
  const n = (s: string) => Number(s);
  const r = useMemo(() => positionSize({ equity: n(v.equity), riskPct: n(v.riskPct), entry: n(v.entry), stop: n(v.stop), target: v.target ? n(v.target) : null, costPerShare: n(v.cost) || 0, maxPositionPct: n(v.maxPos) || 25, existingExposure: n(v.existing) || 0 }), [v]);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const sym = sp.get('symbol');

  return (
    <div className="space-y-4">
      <PageHeader title="Risk calculator" subtitle={sym ? <>Prefilled from the {sym} setup. <Link className="underline" href={`/stock/${encodeURIComponent(sym)}`}>Back</Link></> : 'Size a long position from the amount you are willing to lose.'} />
      <Card title="Inputs">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Account equity ($)" hint="Defaults to paper equity at cost"><input className={inputCls} inputMode="decimal" value={v.equity} onChange={set('equity')} /></Field>
          <Field label="Max risk per trade (%)"><input className={inputCls} inputMode="decimal" value={v.riskPct} onChange={set('riskPct')} /></Field>
          <Field label="Entry price"><input className={inputCls} inputMode="decimal" value={v.entry} onChange={set('entry')} /></Field>
          <Field label="Invalidation / stop"><input className={inputCls} inputMode="decimal" value={v.stop} onChange={set('stop')} /></Field>
          <Field label="Target (optional)"><input className={inputCls} inputMode="decimal" value={v.target} onChange={set('target')} /></Field>
          <Field label="Costs + slippage per share, each way ($)"><input className={inputCls} inputMode="decimal" value={v.cost} onChange={set('cost')} /></Field>
          <Field label="Max position size (% of equity)"><input className={inputCls} inputMode="decimal" value={v.maxPos} onChange={set('maxPos')} /></Field>
          <Field label="Existing correlated / same-sector exposure ($)"><input className={inputCls} inputMode="decimal" value={v.existing} onChange={set('existing')} /></Field>
        </div>
      </Card>
      <Card title="Result">
        {!r.valid ? (
          <ul className="space-y-1 text-sm text-down">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Shares" value={r.shares.toLocaleString()} />
              <Stat label="Position value" value={fmtPrice(r.positionValue)} sub={`${fmtPct(r.exposurePct, 1, false)} of equity`} />
              <Stat label="Risk per share" value={fmtPrice(r.riskPerShare)} sub="incl. round-trip costs" />
              <Stat label="Risk budget" value={fmtPrice(r.dollarRiskBudget)} />
              <Stat label="Max loss at stop" value={fmtPrice(r.maxLoss)} />
              <Stat label="Potential gain at target" value={fmtPrice(r.potentialGain)} />
              <Stat label="Reward/risk" value={fmtRR(r.rewardRisk)} />
            </div>
            {r.warnings.length > 0 && <ul className="mt-3 space-y-1 rounded-xl bg-warn-soft p-2.5 text-sm text-warn">{r.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
            {sym && r.shares > 0 && <Link className="mt-3 inline-block text-sm font-semibold text-accent" href={`/paper?${sp.toString()}`}>Use in a simulated order →</Link>}
          </>
        )}
        <p className="mt-3 text-xs text-muted">Stop orders do not guarantee execution at the stop price: gaps (for example after earnings) and fast markets can fill well below it, so actual losses can exceed the calculated maximum. This calculator assumes no leverage and long positions only.</p>
      </Card>
    </div>
  );
}

export default function RiskPage() {
  return (
    <Suspense>
      <RiskInner />
    </Suspense>
  );
}
