/**
 * DEMO provider — generates FICTIONAL prices and financials for fictional ".DM" companies.
 * Nothing produced here is a market price. Generation is deterministic and append-only: each
 * symbol's series is a seeded simulation over business days from 2019-01-02, so yesterday's bars
 * never change when a new day is added (paper-trade fills stay consistent).
 * Market holidays are not modelled — every weekday is a session.
 */
import { emptyHistory, type Bar, type FiscalValue, type Fundamentals } from '../../types';
import { DEMO_BENCHMARK, DEMO_UNIVERSE, type DemoProfile } from '../../universe';

const START = '2019-01-02';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Business days (Mon–Fri) from START through `end` inclusive. */
export function businessDays(end: string): string[] {
  const out: string[] = [];
  const d = new Date(START + 'T00:00:00Z');
  const e = Date.parse(end + 'T00:00:00Z');
  while (d.getTime() <= e) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Last completed demo session: today after 16:30 New York time on a weekday, else the previous weekday. */
export function lastDemoSession(now = new Date()): string {
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = new Date(Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate()));
  const afterClose = ny.getHours() * 60 + ny.getMinutes() >= 16 * 60 + 30;
  if (!afterClose) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Regime drifts that switch every 30–150 sessions. */
function regimeSeries(rand: () => number, n: number, amplitude: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const len = 30 + Math.floor(rand() * 120);
    const drift = (rand() * 2 - 1) * amplitude;
    for (let i = 0; i < len && out.length < n; i++) out.push(drift / 252);
  }
  return out;
}

// Separate random streams for regimes, returns and OHLC so each day consumes a fixed number of draws
// from each stream — this is what keeps the series append-only as new days are added.
function marketReturns(days: string[]): number[] {
  const regimes = regimeSeries(mulberry32(hash(DEMO_BENCHMARK.symbol) ^ 0x1), days.length, 0.25);
  const rand = mulberry32(hash(DEMO_BENCHMARK.symbol) ^ 0x2);
  return days.map((_, i) => 0.05 / 252 + regimes[i] + 0.009 * gaussian(rand));
}

function simulate(days: string[], returns: number[], startPrice: number, vol: number, rand: () => number, baseVolume: number): Bar[] {
  const bars: Bar[] = [];
  let prev = startPrice;
  for (let i = 0; i < days.length; i++) {
    const gap = 0.25 * vol * gaussian(rand);
    const open = prev * (1 + gap);
    const close = Math.max(0.5, prev * (1 + returns[i]));
    const range = Math.abs(gaussian(rand)) * vol * 0.7 + vol * 0.2;
    const high = Math.max(open, close) * (1 + range * rand());
    const low = Math.min(open, close) * (1 - range * rand());
    const volume = Math.round(baseVolume * (0.6 + Math.abs(returns[i]) / vol * 0.45) * Math.exp(0.25 * gaussian(rand)));
    bars.push({ time: days[i], open: r2(open), high: r2(high), low: r2(low), close: r2(close), volume });
    prev = close;
  }
  return bars;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function demoBars(symbol: string, end = lastDemoSession()): Bar[] | null {
  const days = businessDays(end);
  const mkt = marketReturns(days);
  if (symbol === DEMO_BENCHMARK.symbol) {
    return simulate(days, mkt, 4000, 0.009, mulberry32(hash(symbol) ^ 0x3), 2_000_000_000);
  }
  const p = DEMO_UNIVERSE.find((d) => d.symbol === symbol);
  if (!p) return null;
  const regimes = regimeSeries(mulberry32(hash(p.symbol) ^ 0x1), days.length, 0.4);
  const rand = mulberry32(hash(p.symbol) ^ 0x2);
  const returns = days.map((_, i) => {
    let r = p.beta * mkt[i] + (p.drift - 0.04) / 252 + regimes[i] + p.vol * gaussian(rand);
    const jump = rand(); // drawn every day to keep the stream aligned
    if (i > 0 && i % 63 === 21) r += (jump * 2 - 1) * 0.07; // fictional earnings-day jumps
    return r;
  });
  const baseVolume = 2e6 + (hash(p.symbol) % 8000) * 1000;
  return simulate(days, returns, p.startPrice, p.vol + 0.004, mulberry32(hash(p.symbol) ^ 0x3), baseVolume);
}

/** Fictional quarterly report dates: ~3–5 weeks after each calendar quarter end. */
export function demoNextEarnings(symbol: string, asOf: string): string {
  const offset = 22 + (hash(symbol) % 14);
  const y = Number(asOf.slice(0, 4));
  for (const year of [y, y + 1]) {
    for (const qEnd of ['03-31', '06-30', '09-30', '12-31']) {
      const d = new Date(`${year}-${qEnd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
      const s = d.toISOString().slice(0, 10);
      if (s > asOf) return s;
    }
  }
  return asOf;
}

export function demoFundamentals(symbol: string, asOf = lastDemoSession()): Fundamentals | null {
  const p: DemoProfile | undefined = DEMO_UNIVERSE.find((d) => d.symbol === symbol);
  if (!p) return null;
  const rand = mulberry32(hash(p.symbol + ':fund'));
  const shares0 = (p.revenue0 * p.psAtStart) / p.startPrice;
  const h = emptyHistory();
  const asOfYear = Number(asOf.slice(0, 4));
  // A fiscal year (Dec 31 year-end) is "reported" from Feb 20 of the next year.
  const lastFy = asOf.slice(5) >= '02-20' ? asOfYear - 1 : asOfYear - 2;
  let shares = shares0;
  for (let fy = 2019; fy <= lastFy; fy++) {
    const k = fy - 2019;
    const end = `${fy}-12-31`;
    const src = 'Demo generator (fictional)';
    const v = (value: number): FiscalValue => ({ fiscalYear: fy, periodEnd: end, value, source: src });
    const rev = p.revenue0 * Math.pow(1 + p.revGrowth, k) * (1 + 0.03 * gaussian(rand));
    const opM = p.opMargin + p.marginTrend * k + 0.01 * gaussian(rand);
    const op = rev * opM;
    const debt = rev * p.debtToRevenue;
    const pretax = op - debt * 0.04;
    const tax = Math.max(0, pretax) * 0.2;
    const ni = pretax - tax;
    shares *= 0.99;
    const eps = ni / shares;
    const da = rev * 0.04;
    h.revenue.push(v(rev));
    if (p.grossMargin !== null) h.grossProfit.push(v(rev * (p.grossMargin + 0.01 * gaussian(rand))));
    h.operatingIncome.push(v(op));
    h.netIncome.push(v(ni));
    h.epsDiluted.push(v(Math.round(eps * 100) / 100));
    h.operatingCashFlow.push(v(ni + da + rev * 0.02 * gaussian(rand)));
    h.capex.push(v(rev * 0.05));
    h.depreciation.push(v(da));
    h.totalDebt.push(v(debt));
    h.cash.push(v(rev * 0.15));
    h.equity.push(v(rev * 0.6));
    h.incomeTaxExpense.push(v(tax));
    h.pretaxIncome.push(v(pretax));
    if (p.dividendPayout > 0 && eps > 0) h.dividendsPerShare.push(v(Math.round(eps * p.dividendPayout * 100) / 100));
  }
  for (const m of p.missing ?? []) h[m] = [];
  return {
    symbol,
    provider: 'Demo generator',
    kind: 'demo',
    fetchedAt: new Date().toISOString(),
    currency: 'USD',
    history: h,
    sharesOutstanding: Math.round(shares),
    sharesAsOf: `${lastFy}-12-31`,
    estimates: { forwardPE: null, pegRatio: null, analystTargetPrice: null, source: null, asOf: null },
    nextEarningsDate: demoNextEarnings(symbol, asOf),
    notes: ['FICTIONAL demo financials for a fictional company. Not real data.', ...(p.missing?.length ? [`Deliberately missing: ${p.missing.join(', ')} (to demonstrate missing-data handling).`] : [])],
  };
}
