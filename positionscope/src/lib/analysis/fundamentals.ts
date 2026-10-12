/**
 * Fundamental metrics derived from reported annual filings. Nothing is estimated here:
 * if an input is missing, the metric is `null` with a note explaining why.
 */
import type { FiscalValue, Fundamentals } from '../types';

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  /** 'pct' values are percentages (12.3 = 12.3%). */
  format: 'pct' | 'ratio' | 'usd' | 'usdPerShare' | 'x';
  basis: string;
  kind: 'reported' | 'derived' | 'estimate';
  note?: string;
}

export interface FundamentalMetrics {
  latestFiscalYear: number | null;
  periodEnd: string | null;
  marketCap: number | null;
  metrics: Record<string, Metric>;
  qualityScore: number | null;
  qualityCompleteness: number;
  qualityReasons: string[];
  growthScore: number | null;
  growthCompleteness: number;
  growthReasons: string[];
}

const lastOf = (arr: FiscalValue[]) => (arr.length ? arr[arr.length - 1] : null);
const byYear = (arr: FiscalValue[], fy: number) => arr.find((v) => v.fiscalYear === fy) ?? null;

export function cagr(first: number, last: number, years: number): number | null {
  if (first <= 0 || last <= 0 || years <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

function growthYoY(arr: FiscalValue[]): number | null {
  const l = lastOf(arr);
  if (!l) return null;
  const p = byYear(arr, l.fiscalYear - 1);
  if (!p || p.value <= 0) return null;
  return (l.value / p.value - 1) * 100;
}

function cagrN(arr: FiscalValue[], n: number): number | null {
  const l = lastOf(arr);
  if (!l) return null;
  const p = byYear(arr, l.fiscalYear - n);
  return p ? cagr(p.value, l.value, n) : null;
}

/** Piecewise-linear map of x onto 0–100 between `bad` (0) and `good` (100). */
export function scale(x: number, bad: number, good: number): number {
  const t = (x - bad) / (good - bad);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

export function computeFundamentalMetrics(f: Fundamentals | null, price: number | null): FundamentalMetrics {
  const metrics: Record<string, Metric> = {};
  const put = (m: Metric) => (metrics[m.key] = m);
  const h = f?.history;
  const rev = h ? lastOf(h.revenue) : null;
  const fy = rev?.fiscalYear ?? (h ? lastOf(h.netIncome)?.fiscalYear ?? null : null);
  const at = (arr: FiscalValue[] | undefined) => (arr && fy !== null ? byYear(arr, fy) : null);

  const gp = at(h?.grossProfit);
  const op = at(h?.operatingIncome);
  const ni = at(h?.netIncome);
  const eps = at(h?.epsDiluted);
  const ocf = at(h?.operatingCashFlow);
  const capex = at(h?.capex);
  const dep = at(h?.depreciation);
  const debt = at(h?.totalDebt);
  const cash = at(h?.cash);
  const equity = at(h?.equity);
  const dps = at(h?.dividendsPerShare);
  const tax = at(h?.incomeTaxExpense);
  const pretax = at(h?.pretaxIncome);
  const fyLabel = fy !== null ? `FY${fy}` : 'latest FY';

  put({ key: 'revenue', label: 'Revenue', value: rev?.value ?? null, format: 'usd', basis: fyLabel, kind: 'reported' });
  put({ key: 'revenueGrowth', label: 'Revenue growth (YoY)', value: h ? growthYoY(h.revenue) : null, format: 'pct', basis: fyLabel + ' vs prior FY', kind: 'derived' });
  put({ key: 'revenueCagr3', label: 'Revenue CAGR (3y)', value: h ? cagrN(h.revenue, 3) : null, format: 'pct', basis: '3 fiscal years', kind: 'derived' });
  put({ key: 'epsGrowth', label: 'Diluted EPS growth (YoY)', value: h ? growthYoY(h.epsDiluted) : null, format: 'pct', basis: fyLabel + ' vs prior FY', kind: 'derived', note: 'Not meaningful when prior EPS ≤ 0.' });
  put({ key: 'epsCagr3', label: 'Diluted EPS CAGR (3y)', value: h ? cagrN(h.epsDiluted, 3) : null, format: 'pct', basis: '3 fiscal years', kind: 'derived' });
  put({ key: 'netIncomeGrowth', label: 'Net income growth (YoY)', value: h ? growthYoY(h.netIncome) : null, format: 'pct', basis: fyLabel, kind: 'derived' });

  const margin = (x: FiscalValue | null) => (x && rev && rev.value > 0 ? (x.value / rev.value) * 100 : null);
  put({ key: 'grossMargin', label: 'Gross margin', value: margin(gp), format: 'pct', basis: fyLabel, kind: 'derived', note: gp ? undefined : 'Gross profit not reported (common for banks and some service firms).' });
  put({ key: 'operatingMargin', label: 'Operating margin', value: margin(op), format: 'pct', basis: fyLabel, kind: 'derived' });
  put({ key: 'netMargin', label: 'Net margin', value: margin(ni), format: 'pct', basis: fyLabel, kind: 'derived' });

  // Operating-margin trend vs 3 years earlier (percentage points).
  let opMarginTrend: number | null = null;
  if (h && fy !== null) {
    const op3 = byYear(h.operatingIncome, fy - 3);
    const rev3 = byYear(h.revenue, fy - 3);
    const nowM = margin(op);
    if (op3 && rev3 && rev3.value > 0 && nowM !== null) opMarginTrend = nowM - (op3.value / rev3.value) * 100;
  }
  put({ key: 'opMarginTrend', label: 'Operating margin change (3y)', value: opMarginTrend, format: 'ratio', basis: 'percentage points', kind: 'derived' });

  const fcf = ocf && capex ? ocf.value - Math.abs(capex.value) : null;
  put({ key: 'fcf', label: 'Free cash flow', value: fcf, format: 'usd', basis: `${fyLabel}: operating cash flow − capex`, kind: 'derived' });
  put({ key: 'fcfMargin', label: 'FCF margin', value: fcf !== null && rev && rev.value > 0 ? (fcf / rev.value) * 100 : null, format: 'pct', basis: fyLabel, kind: 'derived' });

  // ROIC = NOPAT / (debt + equity − cash). Tax rate = reported tax / pretax, clamped 0–35%; 21% if unavailable.
  let roic: number | null = null;
  let roicNote = 'NOPAT ÷ (debt + equity − cash).';
  if (op && equity) {
    let taxRate = 0.21;
    if (tax && pretax && pretax.value > 0) taxRate = Math.max(0, Math.min(0.35, tax.value / pretax.value));
    else roicNote += ' Tax rate not reported; 21% US statutory rate assumed.';
    const invested = (debt?.value ?? 0) + equity.value - (cash?.value ?? 0);
    if (!debt) roicNote += ' Debt not reported; treated as 0.';
    if (invested > 0) roic = ((op.value * (1 - taxRate)) / invested) * 100;
    else roicNote += ' Invested capital ≤ 0, so ROIC is not meaningful.';
  }
  put({ key: 'roic', label: 'Return on invested capital', value: roic, format: 'pct', basis: fyLabel + ' (approximation)', kind: 'derived', note: roicNote });

  const ebitda = op && dep ? op.value + dep.value : null;
  const netDebt = debt || cash ? (debt?.value ?? 0) - (cash?.value ?? 0) : null;
  put({ key: 'netDebt', label: 'Net debt (debt − cash)', value: netDebt, format: 'usd', basis: fyLabel + ' balance sheet', kind: 'derived', note: debt ? undefined : 'Debt not reported.' });
  put({ key: 'debtToEquity', label: 'Debt / equity', value: debt && equity && equity.value > 0 ? debt.value / equity.value : null, format: 'x', basis: fyLabel, kind: 'derived' });
  put({ key: 'netDebtToEbitda', label: 'Net debt / EBITDA', value: netDebt !== null && ebitda && ebitda > 0 ? netDebt / ebitda : null, format: 'x', basis: fyLabel, kind: 'derived' });

  const shares = f?.sharesOutstanding ?? null;
  const marketCap = price !== null && shares ? price * shares : null;
  put({ key: 'marketCap', label: 'Market cap', value: marketCap, format: 'usd', basis: `latest price × shares outstanding${f?.sharesAsOf ? ` (${f.sharesAsOf})` : ''}`, kind: 'derived' });

  const pe = price !== null && eps && eps.value > 0 ? price / eps.value : null;
  put({ key: 'pe', label: 'P/E (last FY EPS)', value: pe, format: 'x', basis: `price ÷ ${fyLabel} diluted EPS`, kind: 'derived', note: eps && eps.value <= 0 ? 'Not meaningful: EPS ≤ 0.' : 'Uses fiscal-year EPS, not trailing-twelve-months.' });
  put({ key: 'ps', label: 'Price / sales', value: marketCap && rev && rev.value > 0 ? marketCap / rev.value : null, format: 'x', basis: fyLabel + ' revenue', kind: 'derived' });
  const ev = marketCap !== null ? marketCap + (debt?.value ?? 0) - (cash?.value ?? 0) : null;
  put({ key: 'evEbitda', label: 'EV / EBITDA', value: ev !== null && ebitda && ebitda > 0 ? ev / ebitda : null, format: 'x', basis: `${fyLabel}; EBITDA = operating income + D&A`, kind: 'derived', note: dep ? undefined : 'D&A not reported.' });
  put({ key: 'fcfYield', label: 'FCF yield', value: fcf !== null && marketCap ? (fcf / marketCap) * 100 : null, format: 'pct', basis: fyLabel + ' FCF ÷ market cap', kind: 'derived' });
  const epsCagr = metrics.epsCagr3.value;
  put({ key: 'pegTrailing', label: 'PEG (trailing 3y EPS growth)', value: pe !== null && epsCagr !== null && epsCagr > 0 ? pe / epsCagr : null, format: 'x', basis: 'P/E ÷ historical 3y EPS CAGR', kind: 'derived', note: 'Uses past growth, not forecasts. Not meaningful when growth ≤ 0.' });
  put({ key: 'dividendYield', label: 'Dividend yield', value: price !== null && dps && price > 0 ? (dps.value / price) * 100 : null, format: 'pct', basis: `${fyLabel} dividends declared per share ÷ price`, kind: 'derived', note: dps ? undefined : 'No dividend reported (or not available).' });
  put({ key: 'payoutRatio', label: 'Payout ratio', value: dps && eps && eps.value > 0 ? (dps.value / eps.value) * 100 : null, format: 'pct', basis: fyLabel, kind: 'derived' });

  const est = f?.estimates;
  const estBasis = est?.source ? `${est.source}${est.asOf ? `, ${est.asOf}` : ''}` : 'no estimate provider configured';
  put({ key: 'forwardPE', label: 'Forward P/E', value: est?.forwardPE ?? null, format: 'x', basis: estBasis, kind: 'estimate' });
  put({ key: 'pegForward', label: 'PEG (provider)', value: est?.pegRatio ?? null, format: 'x', basis: estBasis, kind: 'estimate' });
  put({ key: 'analystTarget', label: 'Analyst target price', value: est?.analystTargetPrice ?? null, format: 'usdPerShare', basis: estBasis, kind: 'estimate' });

  // Quality score: average of available sub-scores; completeness reported separately.
  const q: [string, number | null, (v: number) => number, string][] = [
    ['grossMargin', metrics.grossMargin.value, (v) => scale(v, 20, 70), 'Gross margin'],
    ['operatingMargin', metrics.operatingMargin.value, (v) => scale(v, 0, 35), 'Operating margin'],
    ['roic', metrics.roic.value, (v) => scale(v, 0, 25), 'ROIC'],
    ['fcfMargin', metrics.fcfMargin.value, (v) => scale(v, -5, 25), 'FCF margin'],
    ['netDebtToEbitda', metrics.netDebtToEbitda.value, (v) => scale(-v, -4, 0), 'Leverage (net debt/EBITDA)'],
    ['opMarginTrend', metrics.opMarginTrend.value, (v) => scale(v, -5, 5), 'Margin trend'],
  ];
  const quality = subscore(q);
  const g: [string, number | null, (v: number) => number, string][] = [
    ['revenueGrowth', metrics.revenueGrowth.value, (v) => scale(v, -5, 25), 'Revenue growth'],
    ['revenueCagr3', metrics.revenueCagr3.value, (v) => scale(v, -5, 25), 'Revenue CAGR 3y'],
    ['epsGrowth', metrics.epsGrowth.value, (v) => scale(v, -10, 30), 'EPS growth'],
    ['epsCagr3', metrics.epsCagr3.value, (v) => scale(v, -10, 30), 'EPS CAGR 3y'],
  ];
  const growth = subscore(g);

  return {
    latestFiscalYear: fy,
    periodEnd: rev?.periodEnd ?? null,
    marketCap,
    metrics,
    qualityScore: quality.score,
    qualityCompleteness: quality.completeness,
    qualityReasons: quality.reasons,
    growthScore: growth.score,
    growthCompleteness: growth.completeness,
    growthReasons: growth.reasons,
  };
}

function subscore(parts: [string, number | null, (v: number) => number, string][]) {
  const avail = parts.filter((p) => p[1] !== null);
  const reasons = parts.map((p) => (p[1] === null ? `${p[3]}: unavailable` : `${p[3]}: ${p[2](p[1] as number)}/100`));
  if (!avail.length) return { score: null, completeness: 0, reasons };
  const score = Math.round(avail.reduce((s, p) => s + p[2](p[1] as number), 0) / avail.length);
  return { score, completeness: avail.length / parts.length, reasons };
}
