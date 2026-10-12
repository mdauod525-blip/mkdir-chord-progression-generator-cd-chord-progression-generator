/** Shared domain types. Prices are per-share in USD; dates are exchange-local trading days (YYYY-MM-DD). */

export interface Bar {
  /** Trading day, YYYY-MM-DD. For weekly bars: the first trading day of the week. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = 'daily' | 'weekly';

/**
 * Where the numbers came from. These labels are shown in the UI and must never be upgraded:
 * - `demo`: generated, fictional data. Not a market price.
 * - `eod`: end-of-day data from a real provider (delayed — never real-time).
 * - `cached`: real provider data served from cache; `fetchedAt` says when it was retrieved.
 */
export type DataKind = 'demo' | 'eod' | 'cached';

export interface DataMeta {
  kind: DataKind;
  provider: string;
  /** Date of the latest bar. */
  asOf: string | null;
  /** ISO timestamp of when the provider was queried. */
  fetchedAt: string;
  /** Prices are split/dividend adjusted. */
  adjusted: boolean;
  /** Latest bar is older than expected for an end-of-day feed. */
  stale: boolean;
  notes: string[];
}

export interface PriceSeries {
  symbol: string;
  bars: Bar[];
  meta: DataMeta;
}

export interface CompanyInfo {
  symbol: string;
  name: string;
  sector: string;
  industry?: string;
  /** Fictional demo company. */
  demo?: boolean;
}

/** A reported (historical) fiscal-year figure. */
export interface FiscalValue {
  fiscalYear: number;
  periodEnd: string;
  value: number;
  /** e.g. "10-K filed 2025-10-31" */
  source?: string;
}

/**
 * Fundamentals. Every field is nullable: `null` means the provider did not supply it.
 * Reported history (from filings) is kept separate from estimates (from a provider's analyst data).
 */
export interface Fundamentals {
  symbol: string;
  provider: string;
  kind: DataKind;
  fetchedAt: string;
  currency: 'USD';
  /** Reported annual history, oldest first. */
  history: {
    revenue: FiscalValue[];
    grossProfit: FiscalValue[];
    operatingIncome: FiscalValue[];
    netIncome: FiscalValue[];
    epsDiluted: FiscalValue[];
    operatingCashFlow: FiscalValue[];
    capex: FiscalValue[];
    depreciation: FiscalValue[];
    totalDebt: FiscalValue[];
    cash: FiscalValue[];
    equity: FiscalValue[];
    dividendsPerShare: FiscalValue[];
    incomeTaxExpense: FiscalValue[];
    pretaxIncome: FiscalValue[];
  };
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  /** Forward-looking figures from a provider. Never computed by this app. */
  estimates: {
    forwardPE: number | null;
    pegRatio: number | null;
    analystTargetPrice: number | null;
    source: string | null;
    asOf: string | null;
  };
  nextEarningsDate: string | null;
  notes: string[];
}

export function emptyHistory(): Fundamentals['history'] {
  return {
    revenue: [],
    grossProfit: [],
    operatingIncome: [],
    netIncome: [],
    epsDiluted: [],
    operatingCashFlow: [],
    capex: [],
    depreciation: [],
    totalDebt: [],
    cash: [],
    equity: [],
    dividendsPerShare: [],
    incomeTaxExpense: [],
    pretaxIncome: [],
  };
}
