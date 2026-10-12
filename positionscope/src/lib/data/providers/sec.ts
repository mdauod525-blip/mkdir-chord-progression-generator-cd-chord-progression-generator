/**
 * SEC EDGAR XBRL "companyfacts" API — free, official, public-domain reported financials.
 * https://www.sec.gov/edgar/sec-api-documentation
 * Fair access: ≤10 requests/second and a descriptive User-Agent with contact email are required.
 * Only annual (10-K) figures are extracted. Fiscal year = calendar year of the period end date.
 */
import { emptyHistory, type FiscalValue, type Fundamentals } from '../../types';
import { fetchJson, ProviderError, Throttle } from '../http';

interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

type Facts = Record<string, Record<string, { units: Record<string, XbrlFact[]> }>>;

const TAGS: Record<keyof Fundamentals['history'], { tags: string[]; unit: string; flow: boolean }> = {
  revenue: { tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], unit: 'USD', flow: true },
  grossProfit: { tags: ['GrossProfit'], unit: 'USD', flow: true },
  operatingIncome: { tags: ['OperatingIncomeLoss'], unit: 'USD', flow: true },
  netIncome: { tags: ['NetIncomeLoss'], unit: 'USD', flow: true },
  epsDiluted: { tags: ['EarningsPerShareDiluted'], unit: 'USD/shares', flow: true },
  operatingCashFlow: { tags: ['NetCashProvidedByUsedInOperatingActivities'], unit: 'USD', flow: true },
  capex: { tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], unit: 'USD', flow: true },
  depreciation: { tags: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'], unit: 'USD', flow: true },
  totalDebt: { tags: ['LongTermDebt', 'LongTermDebtNoncurrent'], unit: 'USD', flow: false },
  cash: { tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], unit: 'USD', flow: false },
  equity: { tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], unit: 'USD', flow: false },
  dividendsPerShare: { tags: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], unit: 'USD/shares', flow: true },
  incomeTaxExpense: { tags: ['IncomeTaxExpenseBenefit'], unit: 'USD', flow: true },
  pretaxIncome: {
    tags: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
    unit: 'USD',
    flow: true,
  },
};

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;

/** Annual values for one concept: 10-K facts, full-year durations for flows, latest filing wins. */
export function extractAnnual(facts: Facts, tags: string[], unit: string, flow: boolean, maxYears = 6): FiscalValue[] {
  const byEnd = new Map<string, FiscalValue & { filed: string }>();
  for (const tag of tags) {
    const list = facts['us-gaap']?.[tag]?.units?.[unit];
    if (!list) continue;
    for (const f of list) {
      if (!/^10-K/.test(f.form)) continue;
      if (flow) {
        if (!f.start) continue;
        const d = days(f.start, f.end);
        if (d < 350 || d > 380) continue;
      }
      const prev = byEnd.get(f.end);
      // Earlier tags in the list take precedence for the same period; within a tag, latest filing wins.
      if (prev && (prev.source?.split(' ')[0] !== tag || prev.filed >= f.filed)) continue;
      byEnd.set(f.end, {
        fiscalYear: Number(f.end.slice(0, 4)),
        periodEnd: f.end,
        value: f.val,
        filed: f.filed,
        source: `${tag} ${f.form} filed ${f.filed}`,
      });
    }
  }
  // Balance-sheet facts can include quarter-ends restated in a 10-K; keep one value per fiscal year (latest period end).
  const perYear = new Map<number, FiscalValue & { filed: string }>();
  for (const v of byEnd.values()) {
    const p = perYear.get(v.fiscalYear);
    if (!p || v.periodEnd > p.periodEnd) perYear.set(v.fiscalYear, v);
  }
  return [...perYear.values()]
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .slice(-maxYears)
    .map(({ fiscalYear, periodEnd, value, source }) => ({ fiscalYear, periodEnd, value, source }));
}

export function parseCompanyFacts(json: unknown, symbol: string): Fundamentals {
  const facts = (json as { facts?: Facts })?.facts;
  if (!facts) throw new ProviderError('SEC: companyfacts missing', 'bad_response');
  const history = emptyHistory();
  for (const key of Object.keys(TAGS) as (keyof typeof TAGS)[]) {
    const t = TAGS[key];
    history[key] = extractAnnual(facts, t.tags, t.unit, t.flow);
  }
  // Capex is reported as a positive payment; keep the magnitude.
  history.capex = history.capex.map((v) => ({ ...v, value: Math.abs(v.value) }));

  // Shares outstanding (cover page). Multi-class companies report one fact per class for the same date → sum.
  let shares: number | null = null;
  let sharesAsOf: string | null = null;
  const so = facts['dei']?.['EntityCommonStockSharesOutstanding']?.units?.['shares'];
  if (so?.length) {
    const latestEnd = so.reduce((m, f) => (f.end > m ? f.end : m), '');
    const sameDate = so.filter((f) => f.end === latestEnd);
    const latestAccn = sameDate.reduce((m, f) => (f.filed > m.filed ? f : m)).accn;
    shares = sameDate.filter((f) => f.accn === latestAccn).reduce((s, f) => s + f.val, 0);
    sharesAsOf = latestEnd;
  }
  const notes = ['Reported annual figures from SEC 10-K filings (XBRL).'];
  if (!history.totalDebt.length) notes.push('Total debt tag not found; leverage metrics may be unavailable.');
  return {
    symbol,
    provider: 'SEC EDGAR',
    kind: 'eod',
    fetchedAt: new Date().toISOString(),
    currency: 'USD',
    history,
    sharesOutstanding: shares,
    sharesAsOf,
    estimates: { forwardPE: null, pegRatio: null, analystTargetPrice: null, source: null, asOf: null },
    nextEarningsDate: null,
    notes,
  };
}

export class SecEdgarProvider {
  readonly id = 'sec';
  readonly name = 'SEC EDGAR company facts';
  readonly limitations = [
    'Annual 10-K data only (no quarterly/TTM yet); companies that file 20-F/40-F (most foreign issuers) are not covered.',
    'XBRL tags vary by company; some metrics may be missing rather than guessed.',
    'No forecasts or analyst estimates — those require a separate provider.',
  ];
  private throttle = new Throttle(150);
  private tickerMap: Map<string, number> | null = null;
  constructor(private userAgent: string) {}

  private headers() {
    return { 'User-Agent': this.userAgent, Accept: 'application/json' };
  }

  async cikFor(symbol: string): Promise<number | null> {
    if (!this.tickerMap) {
      const json = (await this.throttle.run(() => fetchJson('https://www.sec.gov/files/company_tickers.json', { headers: this.headers() }))) as Record<string, { cik_str: number; ticker: string }>;
      this.tickerMap = new Map(Object.values(json).map((r) => [r.ticker.toUpperCase(), r.cik_str]));
    }
    return this.tickerMap.get(symbol.toUpperCase().replace('.', '-')) ?? null;
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const cik = await this.cikFor(symbol);
    if (!cik) return null;
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
    const json = await this.throttle.run(() => fetchJson(url, { headers: this.headers(), timeoutMs: 30000 }));
    return parseCompanyFacts(json, symbol);
  }
}
