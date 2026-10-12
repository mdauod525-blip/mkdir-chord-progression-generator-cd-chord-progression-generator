/**
 * Technical indicators. Every function returns an array aligned 1:1 with its input, with `null`
 * where there is not yet enough history. Each value at index i uses only inputs at indices <= i,
 * so indicators never look ahead.
 */
import type { Bar } from '../types';

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** EMA over a series that may start with nulls (used for the MACD signal line). */
function emaOfSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const start = values.findIndex((v) => v !== null);
  if (start < 0) return out;
  const tail = values.slice(start) as number[];
  const e = ema(tail, period);
  for (let i = 0; i < e.length; i++) out[start + i] = e[i];
  return out;
}

/** RSI with Wilder smoothing. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));
  const signal = emaOfSeries(line, signalPeriod);
  const histogram: Series = line.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null));
  return { macd: line, signal, histogram };
}

/** Rate of change in percent over `period` bars. */
export function roc(closes: number[], period = 20): Series {
  return closes.map((c, i) => (i >= period && closes[i - period] !== 0 ? ((c - closes[i - period]) / closes[i - period]) * 100 : null));
}

export function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Average True Range with Wilder smoothing. */
export function atr(bars: Bar[], period = 14): Series {
  const tr = trueRange(bars);
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
}

/** Bollinger Bands using the population standard deviation. */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i] as number;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle, upper, lower };
}

/**
 * Relative strength line: stock close / benchmark close, rebased to 100 at the first common date.
 * Aligned to `bars`; dates missing from the benchmark are null.
 */
export function relativeStrengthLine(bars: Bar[], benchmark: Bar[]): Series {
  const bench = new Map(benchmark.map((b) => [b.time, b.close]));
  let base: number | null = null;
  return bars.map((b) => {
    const bc = bench.get(b.time);
    if (bc === undefined || bc === 0) return null;
    const ratio = b.close / bc;
    if (base === null) base = ratio;
    return (ratio / base) * 100;
  });
}

/** Percent return over the last `period` bars, or null. */
export function periodReturn(closes: number[], period: number): number | null {
  const n = closes.length;
  if (n <= period || closes[n - 1 - period] === 0) return null;
  return (closes[n - 1] / closes[n - 1 - period] - 1) * 100;
}

/**
 * Aggregate daily bars into weekly bars (Monday-based ISO weeks). The final week may be partial;
 * `lastWeekComplete` reports whether it ended on/after Friday so callers can wait for weekly confirmation.
 */
export function toWeekly(daily: Bar[]): { bars: Bar[]; lastWeekComplete: boolean } {
  const out: Bar[] = [];
  let currentKey = '';
  let lastDay = -1;
  for (const b of daily) {
    const d = new Date(b.time + 'T00:00:00Z');
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const monday = new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
    if (monday !== currentKey) {
      out.push({ ...b });
      currentKey = monday;
    } else {
      const w = out[out.length - 1];
      w.high = Math.max(w.high, b.high);
      w.low = Math.min(w.low, b.low);
      w.close = b.close;
      w.volume += b.volume;
    }
    lastDay = dow;
  }
  return { bars: out, lastWeekComplete: lastDay >= 4 };
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export function lastValue(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i];
  return null;
}

/** Value `back` bars before the end (0 = last bar). */
export function valueAgo(series: Series, back: number): number | null {
  const v = series[series.length - 1 - back];
  return v === undefined ? null : v;
}
