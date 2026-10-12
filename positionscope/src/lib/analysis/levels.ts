/**
 * Support & resistance engine.
 *
 * Method (documented in docs/METHODOLOGY.md):
 * 1. Find swing highs/lows ("pivots") on daily bars (±5 bars) and weekly bars (±3 bars).
 *    A pivot at bar i is only *confirmed* once k bars exist after it. Pivots that are not yet
 *    confirmed at the analysis date are ignored, so the engine never uses future bars.
 * 2. Cluster pivot prices that lie within a volatility tolerance (0.6 × ATR14, min 1% of price)
 *    into zones. Zones are ranges, not single prices.
 * 3. Collect evidence for each zone: number of touches, weekly touches, wick rejections,
 *    role reversal (acted as both support and resistance → breakout/retest level), share of
 *    traded volume that occurred inside the zone, consolidation time, and recency.
 * 4. Score strength 0–100 from that evidence and classify each zone relative to the last close.
 * Moving averages and Fibonacci retracements are returned separately as secondary references.
 */
import type { Bar } from '../types';
import { atr, lastValue, sma, toWeekly } from '../indicators';

export interface Pivot {
  index: number;
  time: string;
  price: number;
  kind: 'high' | 'low';
  timeframe: 'daily' | 'weekly';
  volume: number;
}

export interface LevelZone {
  id: string;
  low: number;
  high: number;
  mid: number;
  role: 'support' | 'resistance' | 'testing';
  strength: number;
  touches: number;
  weeklyTouches: number;
  rejections: number;
  roleReversal: boolean;
  volumeShare: number;
  firstSeen: string;
  lastTouched: string;
  timeframes: ('daily' | 'weekly')[];
  evidence: string[];
}

export interface MovingAverageLevel {
  label: string;
  value: number;
  slope: 'rising' | 'falling' | 'flat';
  role: 'support' | 'resistance';
}

export interface FibLevel {
  ratio: number;
  price: number;
}

export interface FibReference {
  direction: 'up' | 'down';
  swingLow: { time: string; price: number };
  swingHigh: { time: string; price: number };
  levels: FibLevel[];
  note: string;
}

export interface LevelsResult {
  zones: LevelZone[];
  movingAverages: MovingAverageLevel[];
  fibonacci: FibReference | null;
  atr: number | null;
  tolerance: number | null;
}

/** Confirmed pivots: bar i is a swing high if its high is the strict max of [i-k, i+k]. */
export function findPivots(bars: Bar[], k: number, timeframe: 'daily' | 'weekly'): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, time: bars[i].time, price: bars[i].high, kind: 'high', timeframe, volume: bars[i].volume });
    if (isLow) pivots.push({ index: i, time: bars[i].time, price: bars[i].low, kind: 'low', timeframe, volume: bars[i].volume });
  }
  return pivots;
}

const fmt = (n: number) => n.toFixed(2);

export function detectLevels(daily: Bar[], opts: { lookbackDays?: number; maxZones?: number } = {}): LevelsResult {
  const lookback = opts.lookbackDays ?? 504; // ~2 years of daily pivots
  const maxZones = opts.maxZones ?? 8;
  if (daily.length < 30) return { zones: [], movingAverages: [], fibonacci: null, atr: null, tolerance: null };

  const lastClose = daily[daily.length - 1].close;
  const atr14 = lastValue(atr(daily, 14));
  const tolerance = Math.max((atr14 ?? lastClose * 0.02) * 0.6, lastClose * 0.01);

  const startIdx = Math.max(0, daily.length - lookback);
  const recent = daily.slice(startIdx);
  const dailyPivots = findPivots(recent, 5, 'daily');
  const weekly = toWeekly(daily).bars;
  // Only weekly pivots inside the lookback (plus one extra year for major levels).
  const weeklyStart = recent[0].time;
  const weeklyPivots = findPivots(weekly, 3, 'weekly').filter((p) => p.time >= shiftYears(weeklyStart, -1));

  const all = [...dailyPivots, ...weeklyPivots].sort((a, b) => a.price - b.price);
  const clusters: Pivot[][] = [];
  for (const p of all) {
    const c = clusters[clusters.length - 1];
    if (c) {
      const mean = c.reduce((s, x) => s + x.price, 0) / c.length;
      if (Math.abs(p.price - mean) <= tolerance) {
        c.push(p);
        continue;
      }
    }
    clusters.push([p]);
  }

  // Volume-at-price: share of total volume in the lookback traded with typical price inside a zone.
  const totalVol = recent.reduce((s, b) => s + b.volume, 0);
  const avgVol = totalVol / recent.length;
  const lastTime = daily[daily.length - 1].time;

  const zones: LevelZone[] = clusters.map((c, idx) => {
    const prices = c.map((p) => p.price);
    const pad = tolerance * 0.25;
    const low = Math.min(...prices) - pad;
    const high = Math.max(...prices) + pad;
    const mid = (low + high) / 2;
    const dailyTouches = c.filter((p) => p.timeframe === 'daily');
    const weeklyTouches = c.filter((p) => p.timeframe === 'weekly').length;
    const highs = c.filter((p) => p.kind === 'high').length;
    const lows = c.filter((p) => p.kind === 'low').length;
    const roleReversal = highs > 0 && lows > 0;

    let rejections = 0;
    let barsInside = 0;
    let volInside = 0;
    for (const b of recent) {
      const typical = (b.high + b.low + b.close) / 3;
      if (typical >= low && typical <= high) {
        barsInside++;
        volInside += b.volume;
      }
      // Wick into zone from below, close back under → rejection as resistance (and mirror for support).
      if (b.high >= low && b.close < low && b.open < low) rejections++;
      if (b.low <= high && b.close > high && b.open > high) rejections++;
    }
    const volumeShare = totalVol > 0 ? volInside / totalVol : 0;
    const pivotVolRatio = dailyTouches.length ? dailyTouches.reduce((s, p) => s + p.volume, 0) / dailyTouches.length / avgVol : 1;

    const times = c.map((p) => p.time).sort();
    const lastTouched = times[times.length - 1];
    const daysSince = daysBetween(lastTouched, lastTime);

    const evidence: string[] = [];
    evidence.push(`${c.length} swing ${c.length === 1 ? 'point' : 'points'} between $${fmt(Math.min(...prices))} and $${fmt(Math.max(...prices))} (${highs} high${highs === 1 ? '' : 's'}, ${lows} low${lows === 1 ? '' : 's'})`);
    if (weeklyTouches) evidence.push(`${weeklyTouches} weekly-chart pivot${weeklyTouches === 1 ? '' : 's'} (higher-timeframe level)`);
    if (roleReversal) evidence.push('Role reversal: acted as both resistance and support (breakout/retest level)');
    if (rejections >= 2) evidence.push(`${rejections} daily wick rejections at the zone`);
    if (volumeShare >= 0.08) evidence.push(`${(volumeShare * 100).toFixed(0)}% of 2-year volume traded inside the zone (consolidation / volume shelf)`);
    if (pivotVolRatio >= 1.3) evidence.push(`Swing points formed on ${pivotVolRatio.toFixed(1)}× average volume`);
    evidence.push(`Last touched ${lastTouched} (${daysSince} days ago); first seen ${times[0]}`);

    const recency = daysSince < 60 ? 15 : daysSince < 180 ? 10 : daysSince < 365 ? 5 : 0;
    const strength = Math.min(
      100,
      Math.round(
        Math.min(c.length, 6) * 9 +
          weeklyTouches * 8 +
          Math.min(rejections, 6) * 3 +
          (roleReversal ? 12 : 0) +
          Math.min(volumeShare * 100, 20) +
          (pivotVolRatio >= 1.3 ? 5 : 0) +
          recency,
      ),
    );

    const role: LevelZone['role'] = lastClose > high ? 'support' : lastClose < low ? 'resistance' : 'testing';
    const timeframes = [...new Set(c.map((p) => p.timeframe))];
    return {
      id: `z${idx}`,
      low,
      high,
      mid,
      role,
      strength,
      touches: c.length,
      weeklyTouches,
      rejections,
      roleReversal,
      volumeShare,
      firstSeen: times[0],
      lastTouched,
      timeframes,
      evidence,
    };
  });

  // Keep meaningful zones: ≥2 touches, or one weekly pivot, and prefer the strongest near price.
  const meaningful = zones
    .filter((z) => z.touches >= 2 || z.weeklyTouches >= 1)
    .filter((z) => Math.abs(z.mid - lastClose) / lastClose < 0.4)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxZones)
    .sort((a, b) => a.mid - b.mid);

  return {
    zones: meaningful,
    movingAverages: movingAverageLevels(daily),
    fibonacci: fibonacci(daily),
    atr: atr14,
    tolerance,
  };
}

function movingAverageLevels(daily: Bar[]): MovingAverageLevel[] {
  const closes = daily.map((b) => b.close);
  const lastClose = closes[closes.length - 1];
  const out: MovingAverageLevel[] = [];
  for (const p of [50, 100, 200]) {
    const s = sma(closes, p);
    const v = s[s.length - 1];
    const prev = s[s.length - 11];
    if (v === null || v === undefined) continue;
    let slope: MovingAverageLevel['slope'] = 'flat';
    if (prev !== null && prev !== undefined) {
      const ch = (v - prev) / prev;
      slope = ch > 0.005 ? 'rising' : ch < -0.005 ? 'falling' : 'flat';
    }
    out.push({ label: `${p}-day SMA`, value: v, slope, role: lastClose >= v ? 'support' : 'resistance' });
  }
  return out;
}

/** Fibonacci retracements of the dominant swing over the last year. Secondary reference only. */
function fibonacci(daily: Bar[]): FibReference | null {
  const window = daily.slice(-252);
  if (window.length < 60) return null;
  let hi = 0;
  let lo = 0;
  window.forEach((b, i) => {
    if (b.high > window[hi].high) hi = i;
    if (b.low < window[lo].low) lo = i;
  });
  const H = window[hi].high;
  const L = window[lo].low;
  if (H - L <= 0) return null;
  const up = lo < hi; // swing low came first → retracements of an advance
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map((r) => ({ ratio: r, price: up ? H - (H - L) * r : L + (H - L) * r }));
  return {
    direction: up ? 'up' : 'down',
    swingLow: { time: window[lo].time, price: L },
    swingHigh: { time: window[hi].time, price: H },
    levels,
    note: up
      ? 'Retracements of the 1-year advance (secondary reference; confirm with price-based zones).'
      : 'Retracements of the 1-year decline — potential resistance on rebounds (secondary reference).',
  };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function shiftYears(date: string, years: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Nearest zone below/above price. */
export function nearestSupport(zones: LevelZone[], price: number): LevelZone | null {
  const below = zones.filter((z) => z.high <= price * 1.002 && z.role !== 'resistance');
  return below.length ? below.reduce((a, b) => (b.high > a.high ? b : a)) : null;
}

export function nearestResistance(zones: LevelZone[], price: number): LevelZone | null {
  const above = zones.filter((z) => z.low >= price * 0.998 && z.role !== 'support');
  return above.length ? above.reduce((a, b) => (b.low < a.low ? b : a)) : null;
}
