import type { Bar } from '@/lib/types';

/** Business-day bars from closes (open = previous close, ±1% high/low). */
export function barsFromCloses(closes: number[], start = '2022-01-03', volume = 1_000_000): Bar[] {
  const out: Bar[] = [];
  const d = new Date(start + 'T00:00:00Z');
  let prev = closes[0];
  for (const c of closes) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const open = prev;
    out.push({ time: d.toISOString().slice(0, 10), open, high: Math.max(open, c) * 1.01, low: Math.min(open, c) * 0.99, close: c, volume });
    prev = c;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Oscillating series between lo and hi with a given period (creates repeated swing points). */
export function oscillate(n: number, lo: number, hi: number, period = 40, trendPerBar = 0): number[] {
  return Array.from({ length: n }, (_, i) => lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / period)) + trendPerBar * i);
}
