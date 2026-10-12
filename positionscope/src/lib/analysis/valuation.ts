/**
 * Valuation framework. Each method states its assumptions and is skipped with an explanation when
 * it does not suit the company or inputs are missing. Fair values are estimates, never facts.
 */
import type { Bar, Fundamentals } from '../types';
import type { FundamentalMetrics } from './fundamentals';

export interface Scenario {
  conservative: number;
  base: number;
  optimistic: number;
}

export interface ValuationMethod {
  key: 'historicalPE' | 'historicalPS' | 'dcf' | 'peers';
  name: string;
  suitable: boolean;
  /** Per-share fair value scenarios (USD). */
  fairValue: Scenario | null;
  assumptions: string[];
  explanation: string;
}

export interface PeerMedians {
  group: string;
  count: number;
  pe: number | null;
  ps: number | null;
  evEbitda: number | null;
}

export interface ValuationResult {
  price: number | null;
  methods: ValuationMethod[];
  /** Median of the base cases of suitable methods. */
  blended: Scenario | null;
  /** (base fair value − price) ÷ price, in percent. */
  upsideToBase: number | null;
  assessment: 'Undervalued (est.)' | 'Fairly valued (est.)' | 'Overvalued (est.)' | 'Insufficient data';
  score: number | null;
  peerComparison: { metric: string; company: number | null; peerMedian: number | null }[];
  notes: string[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Close on or before a date (no later prices). */
export function closeOnOrBefore(bars: Bar[], date: string): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= date) {
      ans = bars[mid].close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface DcfInput {
  fcfPerShare: number;
  growth: number; // decimal, years 1–5
  discount: number; // decimal
  terminalGrowth: number; // decimal
  years?: number;
}

/** Two-stage DCF per share: explicit growth for `years`, Gordon-growth terminal value. */
export function dcfPerShare({ fcfPerShare, growth, discount, terminalGrowth, years = 5 }: DcfInput): number {
  let pv = 0;
  let fcf = fcfPerShare;
  for (let t = 1; t <= years; t++) {
    fcf *= 1 + growth;
    pv += fcf / Math.pow(1 + discount, t);
  }
  const terminal = (fcf * (1 + terminalGrowth)) / (discount - terminalGrowth);
  return pv + terminal / Math.pow(1 + discount, years);
}

export function computeValuation(
  f: Fundamentals | null,
  fm: FundamentalMetrics,
  bars: Bar[],
  peers: PeerMedians | null = null,
  sector: string | null = null,
): ValuationResult {
  const price = bars.length ? bars[bars.length - 1].close : null;
  const methods: ValuationMethod[] = [];
  const notes: string[] = [];
  const h = f?.history;
  const shares = f?.sharesOutstanding ?? null;

  // 1. Historical P/E: P/E at each fiscal year-end using that year's EPS and the close on/before period end.
  {
    const eps = h?.epsDiluted ?? [];
    const pes: { fy: number; pe: number }[] = [];
    for (const e of eps) {
      const p = closeOnOrBefore(bars, e.periodEnd);
      if (p !== null && e.value > 0 && bars[0] && bars[0].time <= e.periodEnd) pes.push({ fy: e.fiscalYear, pe: p / e.value });
    }
    const latest = eps.length ? eps[eps.length - 1] : null;
    const base: ValuationMethod = { key: 'historicalPE', name: 'Historical P/E range', suitable: false, fairValue: null, assumptions: [], explanation: '' };
    if (!latest) base.explanation = 'Unavailable: no reported EPS.';
    else if (latest.value <= 0) base.explanation = 'Unsuitable: latest EPS is not positive, so P/E is not meaningful.';
    else if (pes.length < 3) base.explanation = `Unsuitable: only ${pes.length} fiscal year(s) with positive EPS overlap the price history (3 needed).`;
    else {
      const vals = pes.map((x) => x.pe);
      const sorted = [...vals].sort((a, b) => a - b);
      base.suitable = true;
      base.fairValue = { conservative: latest.value * sorted[0], base: latest.value * median(vals), optimistic: latest.value * sorted[sorted.length - 1] };
      base.assumptions = [
        `FY${latest.fiscalYear} diluted EPS $${latest.value.toFixed(2)} (reported).`,
        `Fiscal-year-end P/E history: ${pes.map((x) => `FY${x.fy} ${x.pe.toFixed(1)}×`).join(', ')}.`,
        `Conservative = lowest (${sorted[0].toFixed(1)}×), base = median (${median(vals).toFixed(1)}×), optimistic = highest (${sorted[sorted.length - 1].toFixed(1)}×).`,
      ];
      base.explanation = 'Assumes the market will value current earnings within its own recent range. Fails if growth or risk has changed structurally.';
    }
    methods.push(base);
  }

  // 2. Historical P/S — works for companies with thin or negative earnings.
  {
    const rev = h?.revenue ?? [];
    const pss: { fy: number; ps: number }[] = [];
    const m: ValuationMethod = { key: 'historicalPS', name: 'Historical price/sales range', suitable: false, fairValue: null, assumptions: [], explanation: '' };
    if (!shares) m.explanation = 'Unavailable: shares outstanding not reported.';
    else {
      for (const r of rev) {
        const p = closeOnOrBefore(bars, r.periodEnd);
        if (p !== null && r.value > 0 && bars[0] && bars[0].time <= r.periodEnd) pss.push({ fy: r.fiscalYear, ps: (p * shares) / r.value });
      }
      const latest = rev[rev.length - 1];
      if (!latest) m.explanation = 'Unavailable: no reported revenue.';
      else if (pss.length < 3) m.explanation = `Unsuitable: only ${pss.length} fiscal year(s) overlap the price history (3 needed).`;
      else {
        const vals = pss.map((x) => x.ps);
        const sorted = [...vals].sort((a, b) => a - b);
        const rps = latest.value / shares;
        m.suitable = true;
        m.fairValue = { conservative: rps * sorted[0], base: rps * median(vals), optimistic: rps * sorted[sorted.length - 1] };
        m.assumptions = [
          `FY${latest.fiscalYear} revenue per share $${rps.toFixed(2)} using current share count (share-count changes over time are ignored).`,
          `Fiscal-year-end P/S history: ${pss.map((x) => `FY${x.fy} ${x.ps.toFixed(1)}×`).join(', ')}.`,
        ];
        m.explanation = 'Useful when earnings are depressed; ignores margins, so weigh alongside profitability.';
      }
    }
    methods.push(m);
  }

  // 3. Simple 2-stage free-cash-flow DCF with explicit scenario assumptions.
  {
    const m: ValuationMethod = { key: 'dcf', name: 'Free-cash-flow DCF (5-year, 2-stage)', suitable: false, fairValue: null, assumptions: [], explanation: '' };
    const fcf = fm.metrics.fcf.value;
    const revCagr = fm.metrics.revenueCagr3.value;
    if (fcf === null) m.explanation = 'Unavailable: operating cash flow or capex not reported.';
    else if (!shares) m.explanation = 'Unavailable: shares outstanding not reported.';
    else if (fcf <= 0) m.explanation = 'Unsuitable: free cash flow is not positive, so a FCF-based value is not meaningful.';
    else if (revCagr === null) m.explanation = 'Unsuitable: needs 3+ years of revenue history to anchor the growth assumption.';
    else {
      const fps = fcf / shares;
      const g = Math.max(0, Math.min(0.15, revCagr / 100));
      const cases = {
        conservative: { growth: g * 0.5, discount: 0.1, terminalGrowth: 0.02 },
        base: { growth: g, discount: 0.09, terminalGrowth: 0.025 },
        optimistic: { growth: Math.min(0.2, g * 1.3), discount: 0.085, terminalGrowth: 0.03 },
      };
      m.suitable = true;
      m.fairValue = {
        conservative: dcfPerShare({ fcfPerShare: fps, ...cases.conservative }),
        base: dcfPerShare({ fcfPerShare: fps, ...cases.base }),
        optimistic: dcfPerShare({ fcfPerShare: fps, ...cases.optimistic }),
      };
      const p = (x: number) => `${(x * 100).toFixed(1)}%`;
      m.assumptions = [
        `Starting FCF per share $${fps.toFixed(2)} (FY${fm.latestFiscalYear}, operating cash flow − capex, current share count).`,
        `Growth years 1–5 anchored to the 3-year revenue CAGR (${revCagr.toFixed(1)}%), capped at 15%.`,
        `Conservative: growth ${p(cases.conservative.growth)}, discount ${p(0.1)}, terminal ${p(0.02)}.`,
        `Base: growth ${p(cases.base.growth)}, discount ${p(0.09)}, terminal ${p(0.025)}.`,
        `Optimistic: growth ${p(cases.optimistic.growth)}, discount ${p(0.085)}, terminal ${p(0.03)}.`,
      ];
      m.explanation = 'Highly sensitive to the discount rate and terminal growth. Not suitable for banks/insurers, whose cash flows are not comparable.';
      if (sector && /financ/i.test(sector)) {
        m.suitable = false;
        m.explanation = 'Unsuitable for financial companies: operating cash flow includes lending/deposit flows, so FCF is not comparable.';
      }
    }
    methods.push(m);
  }

  // 4. Peer multiples (only when a peer group exists in the scanned universe).
  const peerComparison: ValuationResult['peerComparison'] = [];
  {
    const m: ValuationMethod = { key: 'peers', name: 'Sector peer P/E', suitable: false, fairValue: null, assumptions: [], explanation: '' };
    const eps = h?.epsDiluted.length ? h.epsDiluted[h.epsDiluted.length - 1] : null;
    if (peers) {
      peerComparison.push({ metric: 'P/E', company: fm.metrics.pe.value, peerMedian: peers.pe });
      peerComparison.push({ metric: 'P/S', company: fm.metrics.ps.value, peerMedian: peers.ps });
      peerComparison.push({ metric: 'EV/EBITDA', company: fm.metrics.evEbitda.value, peerMedian: peers.evEbitda });
    }
    if (!peers || peers.count < 3) m.explanation = `Unsuitable: fewer than 3 peers with data in the ${peers?.group ?? 'sector'} group of the scanned universe.`;
    else if (!eps || eps.value <= 0 || peers.pe === null) m.explanation = 'Unsuitable: EPS not positive or peer P/E unavailable.';
    else {
      m.suitable = true;
      m.fairValue = { conservative: eps.value * peers.pe * 0.85, base: eps.value * peers.pe, optimistic: eps.value * peers.pe * 1.15 };
      m.assumptions = [`${peers.group} median P/E ${peers.pe.toFixed(1)}× across ${peers.count} scanned peers, ±15% for scenarios.`, `FY diluted EPS $${eps.value.toFixed(2)}.`];
      m.explanation = 'Peers in this app are a small, hand-picked universe, not a full industry; differences in growth and quality may justify premiums or discounts.';
    }
    methods.push(m);
  }

  const suitable = methods.filter((m) => m.suitable && m.fairValue);
  let blended: Scenario | null = null;
  if (suitable.length) {
    blended = {
      conservative: median(suitable.map((m) => m.fairValue!.conservative)),
      base: median(suitable.map((m) => m.fairValue!.base)),
      optimistic: median(suitable.map((m) => m.fairValue!.optimistic)),
    };
  } else notes.push('No valuation method had sufficient, suitable data. Valuation is treated as missing (not favourable) in the score.');

  const upsideToBase = blended && price ? ((blended.base - price) / price) * 100 : null;
  let assessment: ValuationResult['assessment'] = 'Insufficient data';
  let score: number | null = null;
  if (upsideToBase !== null && blended && price) {
    // Map discount to base fair value onto 0–100: −40% → 0, 0% → 50, +40% → 100; penalize when price is above optimistic.
    score = Math.round(Math.max(0, Math.min(100, 50 + upsideToBase * 1.25)));
    if (price > blended.optimistic) score = Math.min(score, 20);
    if (price < blended.conservative) score = Math.max(score, 75);
    assessment = upsideToBase > 15 ? 'Undervalued (est.)' : upsideToBase < -15 ? 'Overvalued (est.)' : 'Fairly valued (est.)';
    // Very large gaps usually mean the market expects fundamentals to change (or inputs are stale),
    // not a free lunch — so they are flagged and not allowed to max out the score.
    if (upsideToBase > 100) {
      score = Math.min(score, 75);
      notes.push(`Model value is ${upsideToBase.toFixed(0)}% above the price. Gaps this large often signal expected earnings declines (a possible value trap) or stale inputs; valuation score capped at 75.`);
    }
    if (suitable.length === 1) notes.push('Only one valuation method was suitable; treat the estimate with extra caution.');
  }
  return { price, methods, blended, upsideToBase, assessment, score, peerComparison, notes };
}

