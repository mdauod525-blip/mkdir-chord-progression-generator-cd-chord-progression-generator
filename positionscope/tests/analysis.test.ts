import { describe, expect, it } from 'vitest';
import { detectLevels, findPivots } from '@/lib/analysis/levels';
import { analyzeAsOf, analyzeTechnical } from '@/lib/analysis/technical';
import { detectSetups } from '@/lib/analysis/setups';
import { computeFundamentalMetrics } from '@/lib/analysis/fundamentals';
import { closeOnOrBefore, computeValuation, dcfPerShare } from '@/lib/analysis/valuation';
import { computeOpportunityScore, MISSING_SCORE } from '@/lib/scoring/score';
import { buildStockAnalysis } from '@/lib/analysis/stock';
import { demoBars, demoFundamentals } from '@/lib/data/providers/demo';
import { emptyHistory, type DataMeta, type Fundamentals } from '@/lib/types';
import { barsFromCloses, oscillate } from './helpers';

const meta: DataMeta = { kind: 'demo', provider: 'test', asOf: null, fetchedAt: '', adjusted: true, stale: false, notes: [] };

describe('support & resistance', () => {
  const bars = barsFromCloses(oscillate(400, 100, 120, 40));
  it('only confirms pivots with k bars on both sides', () => {
    const p = findPivots(bars, 5, 'daily');
    expect(p.every((x) => x.index >= 5 && x.index < bars.length - 5)).toBe(true);
  });
  it('finds zones near repeated swing highs and lows, with evidence', () => {
    const r = detectLevels(bars);
    const near = (x: number) => r.zones.find((z) => z.low - 2 <= x && z.high + 2 >= x);
    expect(near(99)).toBeTruthy();
    expect(near(121)).toBeTruthy();
    const top = near(121)!;
    expect(top.touches).toBeGreaterThanOrEqual(3);
    expect(top.evidence.length).toBeGreaterThan(1);
    expect(top.high).toBeGreaterThan(top.low); // zones, not single prices
  });
  it('analysis as of a past date equals analysis of the truncated series (no look-ahead)', () => {
    const date = bars[300].time;
    const a = analyzeAsOf(bars, [], date)!;
    const b = analyzeTechnical(bars.slice(0, 301), [])!;
    expect(a.asOf).toBe(date);
    expect(a.levels.zones).toEqual(b.levels.zones);
    expect(a.indicators).toEqual(b.indicators);
  });
});

describe('trend and setups', () => {
  it('classifies a steady advance as an uptrend', () => {
    const bars = barsFromCloses(Array.from({ length: 300 }, (_, i) => 50 + i * 0.3));
    const t = analyzeTechnical(bars)!;
    expect(t.dailyTrend.state).toMatch(/uptrend/);
  });
  it('returns "no clear setup" with insufficient history', () => {
    const bars = barsFromCloses(Array.from({ length: 120 }, (_, i) => 50 + i * 0.1));
    const t = analyzeTechnical(bars)!;
    const s = detectSetups(bars, t);
    expect(s.status).toBe('no clear setup');
    expect(s.best).toBeNull();
  });
  it('does not produce a setup from oversold RSI alone in a downtrend', () => {
    const bars = barsFromCloses(Array.from({ length: 320 }, (_, i) => 200 - i * 0.4));
    const t = analyzeTechnical(bars)!;
    expect(t.flags.oversold || (t.indicators.rsi14 ?? 50) < 40).toBe(true);
    const s = detectSetups(bars, t);
    expect(s.best).toBeNull();
    expect(s.warnings.join(' ')).toMatch(/not a buy signal/);
  });
  it('setups carry entry < targets and invalidation < entry, with consistent R/R', () => {
    for (const sym of ['NWND.DM', 'HRBR.DM', 'ALPN.DM', 'MRDN.DM', 'BRKW.DM', 'LMNS.DM', 'FLNT.DM', 'QNTM.DM']) {
      const bars = demoBars(sym, '2026-06-30')!;
      for (const cut of [400, 700, 1000, 1300]) {
        const slice = bars.slice(0, cut);
        const t = analyzeTechnical(slice)!;
        for (const s of detectSetups(slice, t).candidates) {
          expect(s.invalidation).toBeLessThan(s.entryLow);
          expect(s.entryHigh).toBeGreaterThan(s.entryLow);
          expect(s.targets[0].low).toBeGreaterThan((s.entryLow + s.entryHigh) / 2);
          expect(s.rewardRisk).toBeCloseTo(s.upsidePct / s.downsidePct, 6);
        }
      }
    }
  });
});

function fund(overrides: Partial<Fundamentals['history']> = {}, shares = 1e9): Fundamentals {
  const h = emptyHistory();
  const v = (fy: number, value: number) => ({ fiscalYear: fy, periodEnd: `${fy}-12-31`, value });
  h.revenue = [v(2021, 100e9), v(2022, 110e9), v(2023, 121e9), v(2024, 133.1e9)];
  h.grossProfit = [v(2024, 66.55e9)];
  h.operatingIncome = [v(2021, 20e9), v(2024, 33.275e9)];
  h.netIncome = [v(2023, 20e9), v(2024, 24e9)];
  h.epsDiluted = [v(2021, 1.5), v(2022, 1.8), v(2023, 2.0), v(2024, 2.4)];
  h.operatingCashFlow = [v(2024, 30e9)];
  h.capex = [v(2024, 5e9)];
  h.depreciation = [v(2024, 6e9)];
  h.totalDebt = [v(2024, 20e9)];
  h.cash = [v(2024, 10e9)];
  h.equity = [v(2024, 90e9)];
  h.incomeTaxExpense = [v(2024, 6e9)];
  h.pretaxIncome = [v(2024, 30e9)];
  Object.assign(h, overrides);
  return { symbol: 'TEST', provider: 'test', kind: 'eod', fetchedAt: '', currency: 'USD', history: h, sharesOutstanding: shares, sharesAsOf: null, estimates: { forwardPE: null, pegRatio: null, analystTargetPrice: null, source: null, asOf: null }, nextEarningsDate: null, notes: [] };
}

describe('fundamentals', () => {
  const m = computeFundamentalMetrics(fund(), 60).metrics;
  it('computes growth and margins from reported values', () => {
    expect(m.revenueGrowth.value).toBeCloseTo(10);
    expect(m.revenueCagr3.value).toBeCloseTo(10);
    expect(m.grossMargin.value).toBeCloseTo(50);
    expect(m.operatingMargin.value).toBeCloseTo(25);
    expect(m.epsGrowth.value).toBeCloseTo(20);
  });
  it('computes FCF, ROIC (with reported tax rate) and multiples', () => {
    expect(m.fcf.value).toBeCloseTo(25e9);
    // NOPAT = 33.275 × (1 − 0.2) = 26.62; invested = 20 + 90 − 10 = 100 → 26.62%
    expect(m.roic.value).toBeCloseTo(26.62, 1);
    expect(m.pe.value).toBeCloseTo(25);
    expect(m.ps.value).toBeCloseTo(60e9 / 133.1e9);
    expect(m.evEbitda.value).toBeCloseTo((60e9 + 10e9) / (33.275e9 + 6e9));
  });
  it('marks P/E not meaningful when EPS is negative and never invents estimates', () => {
    const neg = computeFundamentalMetrics(fund({ epsDiluted: [{ fiscalYear: 2024, periodEnd: '2024-12-31', value: -1 }] }), 60).metrics;
    expect(neg.pe.value).toBeNull();
    expect(neg.forwardPE.value).toBeNull();
    expect(neg.analystTarget.value).toBeNull();
  });
  it('returns nulls and zero completeness when fundamentals are missing', () => {
    const fm = computeFundamentalMetrics(null, 50);
    expect(fm.qualityScore).toBeNull();
    expect(fm.qualityCompleteness).toBe(0);
  });
});

describe('valuation', () => {
  it('DCF matches a hand-computed value', () => {
    // FCF 1, growth 0, discount 10%, terminal 0 → perpetuity of 1 = 10
    expect(dcfPerShare({ fcfPerShare: 1, growth: 0, discount: 0.1, terminalGrowth: 0 })).toBeCloseTo(10, 6);
  });
  it('closeOnOrBefore never returns a later price', () => {
    const bars = barsFromCloses([1, 2, 3, 4], '2024-01-01');
    expect(closeOnOrBefore(bars, '2024-01-02')).toBe(2);
    expect(closeOnOrBefore(bars, '2023-12-31')).toBeNull();
  });
  it('explains unsuitable methods instead of producing a value', () => {
    const f = fund({ epsDiluted: [{ fiscalYear: 2024, periodEnd: '2024-12-31', value: -1 }], operatingCashFlow: [{ fiscalYear: 2024, periodEnd: '2024-12-31', value: 1e9 }], capex: [{ fiscalYear: 2024, periodEnd: '2024-12-31', value: 5e9 }] });
    const bars = barsFromCloses(Array.from({ length: 300 }, () => 60), '2023-06-01');
    const v = computeValuation(f, computeFundamentalMetrics(f, 60), bars);
    const pe = v.methods.find((x) => x.key === 'historicalPE')!;
    const dcf = v.methods.find((x) => x.key === 'dcf')!;
    expect(pe.suitable).toBe(false);
    expect(pe.explanation).toMatch(/not positive/);
    expect(dcf.suitable).toBe(false);
    expect(dcf.explanation).toMatch(/not positive/);
  });
});

describe('opportunity score', () => {
  const bars = demoBars('NWND.DM', '2026-06-30')!;
  const bench = demoBars('DM500.DM', '2026-06-30')!;
  it('stays within 0–100 and reports component contributions that sum to the total', () => {
    const a = buildStockAnalysis({ info: { symbol: 'NWND.DM', name: 'x', sector: 'Technology' }, bars, priceMeta: meta, benchmark: bench, fundamentals: demoFundamentals('NWND.DM', '2026-06-30') });
    expect(a.score.total).toBeGreaterThanOrEqual(0);
    expect(a.score.total).toBeLessThanOrEqual(100);
    const sum = a.score.components.reduce((s, c) => s + c.contribution, 0);
    expect(Math.round(sum)).toBe(a.score.total);
  });
  it('missing fundamentals never raise the score and lower completeness', () => {
    const withF = buildStockAnalysis({ info: { symbol: 'NWND.DM', name: 'x', sector: 'Technology' }, bars, priceMeta: meta, benchmark: bench, fundamentals: demoFundamentals('NWND.DM', '2026-06-30') });
    const without = buildStockAnalysis({ info: { symbol: 'NWND.DM', name: 'x', sector: 'Technology' }, bars, priceMeta: meta, benchmark: bench, fundamentals: null });
    expect(without.score.completeness).toBeLessThan(withF.score.completeness);
    for (const key of ['quality', 'valuation', 'growth'] as const) {
      expect(without.score.components.find((c) => c.key === key)!.adjusted).toBe(MISSING_SCORE);
    }
    expect(without.score.notes.join(' ')).toMatch(/Missing/);
  });
  it('a perfectly scored stock with all data missing is capped by the missing score', () => {
    const s = computeOpportunityScore({ snap: null, setups: null, fundamentals: null, valuation: null });
    expect(s.total).toBe(MISSING_SCORE);
    expect(s.confidence).toBe('low');
  });
});

describe('custom weights', () => {
  it('reweight with default weights reproduces the total within rounding', async () => {
    const { reweight, DEFAULT_WEIGHTS } = await import('@/lib/scoring/score');
    const { toScanRow } = await import('@/lib/analysis/stock');
    const bars = demoBars('LMNS.DM', '2026-06-30')!;
    const a = buildStockAnalysis({ info: { symbol: 'LMNS.DM', name: 'x', sector: 'Communication Services' }, bars, priceMeta: meta, benchmark: demoBars('DM500.DM', '2026-06-30')!, fundamentals: demoFundamentals('LMNS.DM', '2026-06-30') });
    const row = toScanRow(a);
    expect(Math.abs(reweight(row.components, DEFAULT_WEIGHTS) - row.score)).toBeLessThanOrEqual(1);
    expect(reweight(row.components, { ...DEFAULT_WEIGHTS, technical: 100, quality: 0, valuation: 0, growth: 0, momentum: 0, riskReward: 0 })).toBe(row.components.technical);
  });
});

describe('valuation sanity cap', () => {
  it('caps the valuation score and adds a caution when the model value is >100% above price', () => {
    const f = fund();
    const bars = barsFromCloses(Array.from({ length: 1300 }, (_, i) => (i < 1200 ? 60 : 15)), '2020-01-02');
    const v = computeValuation(f, computeFundamentalMetrics(f, 15), bars);
    expect(v.upsideToBase!).toBeGreaterThan(100);
    expect(v.score!).toBeLessThanOrEqual(75);
    expect(v.notes.join(' ')).toMatch(/value trap/);
  });
});
