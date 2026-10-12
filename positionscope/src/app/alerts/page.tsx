'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAlertEvents, useAlertRules, useApp } from '@/components/AppContext';
import { runAlerts } from '@/components/AlertRunner';
import { Badge, Button, Card, Empty, Field, inputCls, PageHeader } from '@/components/ui';
import { ALERT_TYPES, type AlertType } from '@/lib/alerts/engine';
import { fmtDate, fmtDateTime } from '@/lib/client/format';
import { uid } from '@/lib/client/store';
import { SYMBOL_RE } from '@/lib/universe';

export default function Alerts() {
  const { mode } = useApp();
  const [rules, setRules] = useAlertRules();
  const [events, setEvents] = useAlertEvents();
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<AlertType>('entryZone');
  const [param, setParam] = useState<string>('');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');
  const [cooldown, setCooldown] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const def = ALERT_TYPES.find((t) => t.type === type)!;

  const add = () => {
    const s = symbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(s)) return setMsg('Enter a valid ticker.');
    if (mode === 'demo' && !s.endsWith('.DM')) return setMsg('Demo mode only covers fictional “.DM” tickers.');
    const p = def.param ? Number(param || def.param.default) : undefined;
    if (def.param && (!Number.isFinite(p) || (p as number) <= 0)) return setMsg(`Enter a positive ${def.param.name}.`);
    setRules([...rules, { id: uid(), symbol: s, type, param: p, timeframe, cooldownDays: Math.max(0, cooldown), enabled: true, createdAt: new Date().toISOString() }]);
    setMsg(`Alert added for ${s}.`);
  };
  const evaluate = async () => {
    setBusy(true);
    try {
      const n = await runAlerts(mode);
      setMsg(n ? `${n} new alert(s).` : 'Checked — no new alerts.');
    } catch (e) {
      setMsg(`Check failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const unread = events.filter((e) => !e.read).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Alerts" subtitle="Evaluated on daily closes (weekly rules on completed weeks). In-app only." action={<Button variant="secondary" onClick={evaluate} disabled={busy}>{busy ? 'Checking…' : 'Check now'}</Button>} />
      {msg && <p role="status" className="text-sm text-accent">{msg}</p>}

      <Card title={`History${unread ? ` · ${unread} unread` : ''}`} action={events.length > 0 && <button className="text-sm font-semibold text-accent" onClick={() => setEvents(events.map((e) => ({ ...e, read: true })))}>Mark all read</button>}>
        {events.length ? (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="py-2.5">
                <Link href={`/stock/${encodeURIComponent(e.symbol)}`} onClick={() => setEvents(events.map((x) => (x.id === e.id ? { ...x, read: true } : x)))} className="block">
                  <div className={`text-sm ${e.read ? '' : 'font-semibold'}`}>{!e.read && <span className="mr-1 text-accent" aria-label="unread">●</span>}{e.message}</div>
                  <div className="mt-0.5 text-xs text-muted">Bar {fmtDate(e.barDate)} · detected {fmtDateTime(e.triggeredAt)}{e.demo ? ' · demo data' : ''}</div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No alerts yet">Alerts appear here when a rule’s condition is met on a new daily (or weekly) close.</Empty>
        )}
        {events.length > 0 && <div className="mt-2 text-right"><button className="text-sm text-down" onClick={() => confirm('Clear alert history?') && setEvents([])}>Clear history</button></div>}
      </Card>

      <Card title="Create alert">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ticker"><input className={inputCls} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={mode === 'demo' ? 'e.g. NWND.DM' : 'e.g. MSFT'} autoCapitalize="characters" /></Field>
          <Field label="Condition">
            <select className={inputCls} value={type} onChange={(e) => { setType(e.target.value as AlertType); setParam(''); }}>
              {ALERT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </Field>
          {def.param && <Field label={`Threshold (${def.param.unit || def.param.name})`}><input className={inputCls} inputMode="decimal" value={param} placeholder={String(def.param.default || '')} onChange={(e) => setParam(e.target.value)} /></Field>}
          <Field label="Confirmation">
            <select className={inputCls} value={timeframe} onChange={(e) => setTimeframe(e.target.value as 'daily' | 'weekly')}>
              <option value="daily">Daily close</option>
              <option value="weekly">Weekly close (completed week)</option>
            </select>
          </Field>
          <Field label="Cooldown (days)" hint="After firing, the rule stays quiet this long. One alert per rule per bar regardless."><input className={inputCls} type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} /></Field>
        </div>
        <Button className="mt-3" onClick={add}>Add alert</Button>
      </Card>

      <Card title={`Rules (${rules.length})`}>
        {rules.length ? (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 text-sm">
                  <div><strong>{r.symbol}</strong> · {ALERT_TYPES.find((t) => t.type === r.type)?.label}{r.param !== undefined ? ` ${r.param}` : ''}</div>
                  <div className="text-xs text-muted">{r.timeframe} · cooldown {r.cooldownDays}d{r.lastFiredBar ? ` · last fired ${fmtDate(r.lastFiredBar)}` : ''}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))} className="min-h-9 rounded-lg px-2"><Badge tone={r.enabled ? 'up' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</Badge></button>
                  <button onClick={() => setRules(rules.filter((x) => x.id !== r.id))} className="min-h-9 rounded-lg px-2 text-sm text-down" aria-label={`Delete alert for ${r.symbol}`}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No rules">Create one above, or use “Add alerts” on a stock page.</Empty>}
      </Card>
      <p className="text-xs text-muted">Alerts are checked when the app is open (every 30 minutes at most) using end-of-day data; they are not real-time. Push or email notifications need a server-side scheduler and are planned for a later phase.</p>
    </div>
  );
}
