import { describe, expect, it } from 'vitest';
import { atr, bollinger, ema, macd, relativeStrengthLine, roc, rsi, sma, toWeekly } from '@/lib/indicators';
import { barsFromCloses } from './helpers';

describe('moving averages', () => {
  it('computes SMA with nulls before the window fills', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('seeds EMA with the SMA and applies k = 2/(n+1)', () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(3); // 4*0.5 + 2*0.5
    expect(e[4]).toBeCloseTo(4);
  });
});

describe('RSI (Wilder)', () => {
  // Classic reference series (Wilder / StockCharts example).
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  it('matches the published reference values', () => {
    const r = rsi(closes, 14);
    expect(r[13]).toBeNull();
    expect(r[14]).toBeCloseTo(70.46, 0);
    expect(r[15]).toBeCloseTo(66.25, 0);
    expect(r[19]).toBeCloseTo(57.92, 0);
  });
  it('is 100 when there are no losses and 50 when flat', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
    expect(rsi([5, 5, 5, 5, 5], 3)[4]).toBe(50);
  });
});

describe('MACD, ROC, Bollinger, ATR', () => {
  it('MACD of a constant series is zero', () => {
    const m = macd(new Array(60).fill(10));
    expect(m.macd[59]).toBeCloseTo(0);
    expect(m.signal[59]).toBeCloseTo(0);
    expect(m.histogram[59]).toBeCloseTo(0);
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull(); // 26 + 9 − 2
  });
  it('ROC is percent change over the period', () => {
    expect(roc([100, 110, 121], 2)[2]).toBeCloseTo(21);
  });
  it('Bollinger bands collapse on a constant series', () => {
    const b = bollinger(new Array(25).fill(7), 20, 2);
    expect(b.upper[24]).toBeCloseTo(7);
    expect(b.lower[24]).toBeCloseTo(7);
  });
  it('ATR equals the constant true range', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ time: `2024-01-${String(i + 1).padStart(2, '0')}`, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
    expect(atr(bars, 14)[29]).toBeCloseTo(2);
  });
});

describe('no look-ahead', () => {
  it('indicator values at i do not change when future bars are appended', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.1);
    const full = rsi(closes, 14);
    const prefix = rsi(closes.slice(0, 80), 14);
    expect(full.slice(0, 80)).toEqual(prefix);
    const m1 = macd(closes).histogram.slice(0, 80);
    const m2 = macd(closes.slice(0, 80)).histogram;
    expect(m1).toEqual(m2);
  });
});

describe('weekly aggregation and relative strength', () => {
  it('aggregates Mon–Fri into one weekly bar', () => {
    const bars = barsFromCloses([10, 11, 12, 9, 10, 13], '2024-01-01'); // Mon 1st … Mon 8th
    const { bars: w, lastWeekComplete } = toWeekly(bars);
    expect(w).toHaveLength(2);
    expect(w[0].open).toBe(10);
    expect(w[0].close).toBe(10);
    expect(w[0].high).toBeCloseTo(12 * 1.01);
    expect(w[0].volume).toBe(5_000_000);
    expect(lastWeekComplete).toBe(false);
  });
  it('rebases the RS line to 100 and tracks out/under-performance', () => {
    const a = barsFromCloses([10, 11, 12]);
    const b = barsFromCloses([100, 100, 100]);
    const rs = relativeStrengthLine(a, b) as number[];
    expect(rs[0]).toBeCloseTo(100);
    expect(rs[1]).toBeCloseTo(110);
    expect(rs[2]).toBeCloseTo(120);
  });
});
