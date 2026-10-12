/**
 * Alert engine. Rules are evaluated against end-of-day analysis rows (daily close), or only on
 * completed weeks for weekly rules. Duplicate prevention: one event per rule per bar date.
 * Cooldown: a rule that fired stays quiet for `cooldownDays` calendar days.
 */
import type { ScanRow } from '../analysis/stock';

export type AlertType =
  | 'entryZone'
  | 'nearSupport'
  | 'supportBreak'
  | 'resistanceBreakout'
  | 'breakoutRetest'
  | 'rsiAbove'
  | 'rsiBelow'
  | 'macdCrossUp'
  | 'macdCrossDown'
  | 'extended'
  | 'unusualVolume'
  | 'priceAbove'
  | 'priceBelow'
  | 'valuationUpside'
  | 'fundamentalsChanged'
  | 'earningsWithin'
  | 'paperNearStop'
  | 'paperNearTarget';

export const ALERT_TYPES: { type: AlertType; label: string; param?: { name: string; default: number; unit: string } }[] = [
  { type: 'entryZone', label: 'Price enters potential entry zone' },
  { type: 'nearSupport', label: 'Price approaching support (≤1.5 ATR)' },
  { type: 'supportBreak', label: 'Support breakdown (daily close below zone)' },
  { type: 'resistanceBreakout', label: 'Resistance breakout (daily close above zone)' },
  { type: 'breakoutRetest', label: 'Breakout retest setup detected' },
  { type: 'rsiAbove', label: 'RSI(14) closes above', param: { name: 'level', default: 70, unit: '' } },
  { type: 'rsiBelow', label: 'RSI(14) closes below', param: { name: 'level', default: 35, unit: '' } },
  { type: 'macdCrossUp', label: 'MACD crosses above signal' },
  { type: 'macdCrossDown', label: 'MACD crosses below signal' },
  { type: 'extended', label: 'Extended above 50-day SMA (>4 ATR)' },
  { type: 'unusualVolume', label: 'Unusual volume (≥2× 50-day avg)' },
  { type: 'priceAbove', label: 'Close above price', param: { name: 'price', default: 0, unit: '$' } },
  { type: 'priceBelow', label: 'Close below price', param: { name: 'price', default: 0, unit: '$' } },
  { type: 'valuationUpside', label: 'Estimated upside to base fair value at least', param: { name: 'pct', default: 15, unit: '%' } },
  { type: 'fundamentalsChanged', label: 'New fiscal year reported / quality score changes by', param: { name: 'points', default: 10, unit: 'pts' } },
  { type: 'earningsWithin', label: 'Earnings within', param: { name: 'days', default: 7, unit: 'days' } },
  { type: 'paperNearStop', label: 'Paper position within X% of invalidation', param: { name: 'pct', default: 3, unit: '%' } },
  { type: 'paperNearTarget', label: 'Paper position within X% of target', param: { name: 'pct', default: 3, unit: '%' } },
];

export interface AlertRule {
  id: string;
  symbol: string;
  type: AlertType;
  param?: number;
  timeframe: 'daily' | 'weekly';
  cooldownDays: number;
  enabled: boolean;
  createdAt: string;
  /** Engine-maintained state (last fire, fundamentals snapshot). */
  lastFiredBar?: string;
  snapshot?: { fiscalYear: number | null; quality: number | null };
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  symbol: string;
  type: AlertType;
  message: string;
  barDate: string;
  triggeredAt: string;
  demo: boolean;
  read: boolean;
}

export interface PaperLevels {
  symbol: string;
  invalidation: number | null;
  target: number | null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const f2 = (n: number) => `$${n.toFixed(2)}`;

/** Returns a message when the rule's condition holds on this row, else null. */
export function checkCondition(rule: AlertRule, row: ScanRow, paper: PaperLevels[] = [], today = new Date().toISOString().slice(0, 10)): string | null {
  const p = row.price;
  if (p === null) return null;
  const s = row.symbol;
  switch (rule.type) {
    case 'entryZone':
      return row.inEntryZone && row.entryLow !== null ? `${s} closed at ${f2(p)}, inside the ${row.setup} entry zone ${f2(row.entryLow)}–${f2(row.entryHigh!)}` : null;
    case 'nearSupport':
      return row.flags?.nearSupport && row.support ? `${s} at ${f2(p)} is within 1.5 ATR of support ${f2(row.support[0])}–${f2(row.support[1])}` : null;
    case 'supportBreak':
      return row.flags?.breakdown ? `${s} closed below a support zone at ${f2(p)}` : null;
    case 'resistanceBreakout':
      return row.flags?.breakout ? `${s} closed above a resistance zone at ${f2(p)}` : null;
    case 'breakoutRetest':
      return row.setupType === 'retest' ? `${s}: breakout retest setup — ${row.setup}` : null;
    case 'rsiAbove':
      return row.rsi !== null && row.rsi > (rule.param ?? 70) ? `${s} RSI(14) ${row.rsi.toFixed(0)} above ${rule.param ?? 70}` : null;
    case 'rsiBelow':
      return row.rsi !== null && row.rsi < (rule.param ?? 35) ? `${s} RSI(14) ${row.rsi.toFixed(0)} below ${rule.param ?? 35}` : null;
    case 'macdCrossUp':
      return row.macdHist !== null && row.macdHistPrev !== null && row.macdHist > 0 && row.macdHistPrev <= 0 ? `${s} MACD crossed above its signal line` : null;
    case 'macdCrossDown':
      return row.macdHist !== null && row.macdHistPrev !== null && row.macdHist < 0 && row.macdHistPrev >= 0 ? `${s} MACD crossed below its signal line` : null;
    case 'extended':
      return row.flags?.extended ? `${s} is extended: more than 4 ATR above its 50-day SMA` : null;
    case 'unusualVolume':
      return row.flags?.unusualVolume ? `${s} traded at least 2× its 50-day average volume` : null;
    case 'priceAbove':
      return rule.param && p > rule.param ? `${s} closed at ${f2(p)}, above ${f2(rule.param)}` : null;
    case 'priceBelow':
      return rule.param && p < rule.param ? `${s} closed at ${f2(p)}, below ${f2(rule.param)}` : null;
    case 'valuationUpside':
      return row.upsideToFair !== null && row.upsideToFair >= (rule.param ?? 15) ? `${s} estimated upside to base fair value ${row.upsideToFair.toFixed(0)}% (estimate, see assumptions)` : null;
    case 'fundamentalsChanged': {
      const snap = rule.snapshot;
      if (!snap) return null;
      if (row.latestFiscalYear !== null && snap.fiscalYear !== null && row.latestFiscalYear > snap.fiscalYear) return `${s} reported a new fiscal year (FY${row.latestFiscalYear})`;
      if (row.qualityScore !== null && snap.quality !== null && Math.abs(row.qualityScore - snap.quality) >= (rule.param ?? 10)) return `${s} quality score changed ${snap.quality} → ${row.qualityScore}`;
      return null;
    }
    case 'earningsWithin': {
      if (!row.nextEarningsDate) return null;
      const d = daysBetween(today, row.nextEarningsDate);
      return d >= 0 && d <= (rule.param ?? 7) ? `${s} reports earnings on ${row.nextEarningsDate} (in ${d} days)` : null;
    }
    case 'paperNearStop': {
      const lv = paper.find((x) => x.symbol === s);
      if (!lv?.invalidation) return null;
      return p <= lv.invalidation * (1 + (rule.param ?? 3) / 100) ? `Paper position ${s} at ${f2(p)} is within ${rule.param ?? 3}% of its invalidation ${f2(lv.invalidation)}` : null;
    }
    case 'paperNearTarget': {
      const lv = paper.find((x) => x.symbol === s);
      if (!lv?.target) return null;
      return p >= lv.target * (1 - (rule.param ?? 3) / 100) ? `Paper position ${s} at ${f2(p)} is within ${rule.param ?? 3}% of its target ${f2(lv.target)}` : null;
    }
  }
}

export interface EvaluationResult {
  rules: AlertRule[];
  events: AlertEvent[];
}

/**
 * Evaluate all enabled rules. Returns updated rules (with state) and only NEW events.
 * `existing` is used for duplicate prevention.
 */
export function evaluateAlerts(rules: AlertRule[], rows: ScanRow[], existing: AlertEvent[], paper: PaperLevels[] = [], now = new Date()): EvaluationResult {
  const seen = new Set(existing.map((e) => `${e.ruleId}|${e.barDate}`));
  const events: AlertEvent[] = [];
  const today = now.toISOString().slice(0, 10);
  const updated = rules.map((rule) => {
    const row = rows.find((r) => r.symbol === rule.symbol);
    if (!rule.enabled || !row || !row.asOf) return rule;
    let next = rule;
    if (rule.type === 'fundamentalsChanged' && !rule.snapshot) {
      // First evaluation records the baseline; nothing fires.
      return { ...rule, snapshot: { fiscalYear: row.latestFiscalYear, quality: row.qualityScore } };
    }
    if (rule.timeframe === 'weekly' && !row.weeklyConfirmed) return rule;
    const key = `${rule.id}|${row.asOf}`;
    if (seen.has(key)) return rule;
    if (rule.lastFiredBar && daysBetween(rule.lastFiredBar, row.asOf) < rule.cooldownDays) return rule;
    const msg = checkCondition(rule, row, paper, today);
    if (!msg) return rule;
    events.push({
      id: `${rule.id}-${row.asOf}`,
      ruleId: rule.id,
      symbol: rule.symbol,
      type: rule.type,
      message: msg + (rule.timeframe === 'weekly' ? ' (weekly close)' : ' (daily close)'),
      barDate: row.asOf,
      triggeredAt: now.toISOString(),
      demo: row.demo,
      read: false,
    });
    seen.add(key);
    next = { ...rule, lastFiredBar: row.asOf };
    if (rule.type === 'fundamentalsChanged') next.snapshot = { fiscalYear: row.latestFiscalYear, quality: row.qualityScore };
    return next;
  });
  return { rules: updated, events };
}
