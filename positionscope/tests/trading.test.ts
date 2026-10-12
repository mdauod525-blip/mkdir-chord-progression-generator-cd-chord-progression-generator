import { describe, expect, it } from 'vitest';
import { computeLedger, DEFAULT_PAPER, portfolioValue, processOrders, type PaperOrder, type PaperState } from '@/lib/paper/portfolio';
import { positionSize } from '@/lib/risk/sizing';
import { evaluateAlerts, type AlertRule } from '@/lib/alerts/engine';
import type { ScanRow } from '@/lib/analysis/stock';
import { barsFromCloses } from './helpers';

const bars = barsFromCloses([100, 102, 104, 103, 99, 101], '2024-01-01');
const order = (o: Partial<PaperOrder>): PaperOrder => ({ id: Math.random().toString(36), symbol: 'X', side: 'buy', qty: 10, type: 'market', placedAt: '2024-01-01T20:00:00Z', placedAfterBar: '2024-01-01', status: 'pending', ...o });
const state = (orders: PaperOrder[], extra: Partial<PaperState['settings']> = {}): PaperState => ({ ...DEFAULT_PAPER, settings: { ...DEFAULT_PAPER.settings, slippageBps: 10, commission: 1, ...extra }, orders });

describe('paper trading fills', () => {
  it('fills a market order at the NEXT session open plus slippage — never the placement bar', () => {
    const s = processOrders(state([order({})]), { X: bars });
    const o = s.orders[0];
    expect(o.status).toBe('filled');
    expect(o.fill!.date).toBe('2024-01-02');
    expect(o.fill!.price).toBeCloseTo(bars[1].open * 1.001, 4);
  });
  it('stays pending when no later session exists yet', () => {
    const s = processOrders(state([order({ placedAfterBar: bars[bars.length - 1].time })]), { X: bars });
    expect(s.orders[0].status).toBe('pending');
  });
  it('fills a buy limit only when the low reaches it, at min(open, limit)', () => {
    const s = processOrders(state([order({ type: 'limit', limitPrice: 98.5 })]), { X: bars });
    expect(s.orders[0].fill!.date).toBe('2024-01-05'); // first low ≤ 98.5 is 99×0.99 on the 5th; open 103 → fill at the limit
    expect(s.orders[0].fill!.price).toBe(98.5);
  });
  it('rejects buys beyond cash and sells beyond the position', () => {
    const s = processOrders(state([order({ qty: 10_000 }), order({ side: 'sell', qty: 5, placedAt: '2024-01-01T21:00:00Z' })]), { X: bars });
    expect(s.orders[0].status).toBe('rejected');
    expect(s.orders[1].status).toBe('rejected');
  });
  it('computes average cost, realized and unrealized P/L with commissions', () => {
    let s = state([
      order({ id: 'a', qty: 10 }),
      order({ id: 'b', qty: 10, placedAfterBar: '2024-01-02', placedAt: '2024-01-02T20:00:00Z' }),
      order({ id: 'c', side: 'sell', qty: 5, placedAfterBar: '2024-01-03', placedAt: '2024-01-03T20:00:00Z' }),
    ], { slippageBps: 0 });
    s = processOrders(s, { X: bars });
    const l = computeLedger(s);
    // buys at 100 and 102 (+$1 each) → cost 2022, avg 101.1; sell 5 at 104 − 1 = 519; realized = 519 − 505.5 = 13.5
    expect(l.positions[0].qty).toBe(15);
    expect(l.positions[0].avgCost).toBeCloseTo(101.1);
    expect(l.realizedPnL).toBeCloseTo(13.5);
    expect(l.cash).toBeCloseTo(100_000 - 2022 + 519);
    const v = portfolioValue(l, { X: 110 });
    expect(v.unrealized).toBeCloseTo(15 * 110 - 15 * 101.1);
  });
  it('credits dividends only for shares held on the date', () => {
    let s = state([order({ qty: 10 })], { slippageBps: 0, commission: 0 });
    s = processOrders(s, { X: bars });
    s.dividends = [{ id: 'd1', symbol: 'X', date: '2024-01-01', amountPerShare: 1 }, { id: 'd2', symbol: 'X', date: '2024-01-03', amountPerShare: 0.5 }];
    expect(computeLedger(s).dividendIncome).toBeCloseTo(5);
  });
});

describe('position sizing', () => {
  it('sizes by dollar risk including round-trip costs', () => {
    const r = positionSize({ equity: 100_000, riskPct: 1, entry: 50, stop: 45, target: 65, costPerShare: 0.05 });
    expect(r.riskPerShare).toBeCloseTo(5.1);
    expect(r.shares).toBe(Math.floor(1000 / 5.1));
    expect(r.rewardRisk).toBeCloseTo((15 - 0.1) / 5.1);
    expect(r.maxLoss).toBeLessThanOrEqual(1000);
  });
  it('validates inputs and warns about concentration', () => {
    expect(positionSize({ equity: 1000, riskPct: 1, entry: 50, stop: 55 }).valid).toBe(false);
    const r = positionSize({ equity: 10_000, riskPct: 2, entry: 100, stop: 99 });
    expect(r.warnings.join(' ')).toMatch(/concentration|equity/);
  });
});

describe('alert engine', () => {
  const row = (o: Partial<ScanRow>): ScanRow => ({ symbol: 'X', name: 'X', sector: 'T', demo: true, price: 50, asOf: '2024-01-05', rsi: 75, macdHist: 0.1, macdHistPrev: -0.1, weeklyConfirmed: false, flags: null, ...o }) as ScanRow;
  const rule = (o: Partial<AlertRule>): AlertRule => ({ id: 'r1', symbol: 'X', type: 'rsiAbove', param: 70, timeframe: 'daily', cooldownDays: 3, enabled: true, createdAt: '', ...o });
  it('fires once per bar (duplicate prevention)', () => {
    const r1 = evaluateAlerts([rule({})], [row({})], []);
    expect(r1.events).toHaveLength(1);
    const r2 = evaluateAlerts(r1.rules, [row({})], r1.events);
    expect(r2.events).toHaveLength(0);
  });
  it('respects the cooldown', () => {
    const r1 = evaluateAlerts([rule({})], [row({})], []);
    expect(evaluateAlerts(r1.rules, [row({ asOf: '2024-01-07' })], r1.events).events).toHaveLength(0);
    expect(evaluateAlerts(r1.rules, [row({ asOf: '2024-01-09' })], r1.events).events).toHaveLength(1);
  });
  it('waits for a completed week on weekly rules', () => {
    expect(evaluateAlerts([rule({ timeframe: 'weekly' })], [row({})], []).events).toHaveLength(0);
    expect(evaluateAlerts([rule({ timeframe: 'weekly' })], [row({ weeklyConfirmed: true })], []).events).toHaveLength(1);
  });
  it('detects MACD crosses and records a fundamentals baseline before firing', () => {
    expect(evaluateAlerts([rule({ type: 'macdCrossUp' })], [row({})], []).events).toHaveLength(1);
    const base = evaluateAlerts([rule({ type: 'fundamentalsChanged', param: 10 })], [row({ latestFiscalYear: 2023, qualityScore: 60 })], []);
    expect(base.events).toHaveLength(0);
    const later = evaluateAlerts(base.rules, [row({ latestFiscalYear: 2024, qualityScore: 60, asOf: '2024-03-01' })], []);
    expect(later.events[0].message).toMatch(/FY2024/);
  });
});
