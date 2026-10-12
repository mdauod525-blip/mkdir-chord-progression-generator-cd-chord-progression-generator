'use client';
/**
 * Evaluates alert rules against the latest end-of-day analysis when the app is open
 * (at most every 30 minutes). In-app only: push/email delivery needs a server-side scheduler.
 */
import { useEffect } from 'react';
import { evaluateAlerts, type PaperLevels } from '@/lib/alerts/engine';
import type { ScanRow } from '@/lib/analysis/stock';
import { getJson } from '@/lib/client/useApi';
import { stores } from '@/lib/client/store';
import { computeLedger } from '@/lib/paper/portfolio';
import { useApp } from './AppContext';

const INTERVAL = 30 * 60_000;

export async function runAlerts(mode: string): Promise<number> {
  const rulesStore = stores.alertRules(mode);
  const eventsStore = stores.alertEvents(mode);
  const watch = stores.watchlists(mode).get();
  const ledger = computeLedger(stores.paper(mode).get());
  const rules = rulesStore.get();
  // Watchlists with alerts enabled get default entry-zone + support-break rules evaluated implicitly.
  const implicit = watch.filter((w) => w.alertsEnabled).flatMap((w) => w.symbols);
  const symbols = [...new Set([...rules.filter((r) => r.enabled).map((r) => r.symbol), ...implicit])];
  if (!symbols.length) return 0;
  const { rows } = await getJson<{ rows: ScanRow[] }>(`/api/rows?symbols=${encodeURIComponent(symbols.slice(0, 40).join(','))}`);
  const paper: PaperLevels[] = ledger.positions.map((p) => ({ symbol: p.symbol, invalidation: p.invalidation, target: p.target }));
  const implicitRules = implicit
    .filter((s) => !rules.some((r) => r.symbol === s && (r.type === 'entryZone' || r.type === 'supportBreak')))
    .flatMap((s) => [
      { id: `wl-entry-${s}`, symbol: s, type: 'entryZone' as const, timeframe: 'daily' as const, cooldownDays: 5, enabled: true, createdAt: '' },
      { id: `wl-break-${s}`, symbol: s, type: 'supportBreak' as const, timeframe: 'daily' as const, cooldownDays: 5, enabled: true, createdAt: '' },
    ]);
  const existing = eventsStore.get();
  const res = evaluateAlerts([...rules, ...implicitRules], rows, existing, paper);
  rulesStore.set(res.rules.filter((r) => !r.id.startsWith('wl-')));
  // Implicit rules keep their cooldown via event history (duplicate key = rule id + bar date).
  if (res.events.length) eventsStore.set([...res.events, ...existing].slice(0, 300));
  return res.events.length;
}

export function AlertRunner() {
  const { mode, status } = useApp();
  useEffect(() => {
    if (!status) return;
    const key = `positionscope:lastAlertRun:${mode}`;
    const tick = () => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(key) ?? 0);
      } catch {}
      if (Date.now() - last < INTERVAL) return;
      try {
        sessionStorage.setItem(key, String(Date.now()));
      } catch {}
      runAlerts(mode).catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => clearInterval(id);
  }, [mode, status]);
  return null;
}
