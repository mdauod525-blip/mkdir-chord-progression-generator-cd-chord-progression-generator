import type { CompanyInfo } from '../types';

/**
 * Default live-mode universe: large, liquid US-listed common stocks (blue chips and established
 * growth names). Names and sectors are static reference metadata — no prices are stored here.
 * Edit this list to change what the scanner covers; mind your provider's free-tier symbol limits.
 */
export const LIVE_UNIVERSE: CompanyInfo[] = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology' },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'Technology' },
  { symbol: 'ADBE', name: 'Adobe', sector: 'Technology' },
  { symbol: 'CRM', name: 'Salesforce', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet (Class A)', sector: 'Communication Services' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication Services' },
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer Discretionary' },
  { symbol: 'HD', name: 'Home Depot', sector: 'Consumer Discretionary' },
  { symbol: 'COST', name: 'Costco', sector: 'Consumer Staples' },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'V', name: 'Visa', sector: 'Financials' },
  { symbol: 'MA', name: 'Mastercard', sector: 'Financials' },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Health Care' },
  { symbol: 'UNH', name: 'UnitedHealth', sector: 'Health Care' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care' },
  { symbol: 'ISRG', name: 'Intuitive Surgical', sector: 'Health Care' },
  { symbol: 'CAT', name: 'Caterpillar', sector: 'Industrials' },
];

/** S&P 500 proxy for live mode. SPY is an ETF that tracks the index (it is not the index itself). */
export const LIVE_BENCHMARK: CompanyInfo = { symbol: 'SPY', name: 'SPDR S&P 500 ETF (S&P 500 proxy)', sector: 'Benchmark' };

/**
 * Demo profiles: FICTIONAL companies with tickers ending in ".DM" so they cannot be confused with
 * listed securities. All prices and financials for these are generated.
 */
export interface DemoProfile extends CompanyInfo {
  beta: number;
  vol: number; // daily idiosyncratic volatility
  drift: number; // annualized idiosyncratic drift
  startPrice: number;
  revenue0: number; // first fiscal-year revenue, USD
  revGrowth: number; // annual
  grossMargin: number | null;
  opMargin: number;
  marginTrend: number; // pp per year
  psAtStart: number;
  debtToRevenue: number;
  dividendPayout: number;
  missing?: (keyof import('../types').Fundamentals['history'])[];
  epsNegative?: boolean;
}

const D = (p: Omit<DemoProfile, 'demo'>): DemoProfile => ({ ...p, demo: true });

export const DEMO_UNIVERSE: DemoProfile[] = [
  D({ symbol: 'NWND.DM', name: 'Northwind Semiconductors (demo)', sector: 'Technology', beta: 1.3, vol: 0.016, drift: 0.14, startPrice: 42, revenue0: 8e9, revGrowth: 0.18, grossMargin: 0.62, opMargin: 0.3, marginTrend: 0.01, psAtStart: 6, debtToRevenue: 0.25, dividendPayout: 0.1 }),
  D({ symbol: 'HRBR.DM', name: 'Harbor Cloud Systems (demo)', sector: 'Technology', beta: 1.2, vol: 0.017, drift: 0.12, startPrice: 88, revenue0: 4e9, revGrowth: 0.22, grossMargin: 0.76, opMargin: 0.18, marginTrend: 0.02, psAtStart: 9, debtToRevenue: 0.3, dividendPayout: 0 }),
  D({ symbol: 'QNTM.DM', name: 'Quantum Ridge Software (demo)', sector: 'Technology', beta: 1.6, vol: 0.026, drift: 0.05, startPrice: 31, revenue0: 1.1e9, revGrowth: 0.3, grossMargin: 0.68, opMargin: -0.12, marginTrend: 0.02, psAtStart: 10, debtToRevenue: 0.6, dividendPayout: 0, epsNegative: true }),
  D({ symbol: 'ALPN.DM', name: 'Alpine Medical Devices (demo)', sector: 'Health Care', beta: 0.8, vol: 0.012, drift: 0.12, startPrice: 120, revenue0: 6e9, revGrowth: 0.11, grossMargin: 0.66, opMargin: 0.24, marginTrend: 0.005, psAtStart: 7, debtToRevenue: 0.4, dividendPayout: 0.25 }),
  D({ symbol: 'OKVL.DM', name: 'Oakvale Pharma (demo)', sector: 'Health Care', beta: 0.7, vol: 0.015, drift: -0.08, startPrice: 75, revenue0: 14e9, revGrowth: 0.01, grossMargin: 0.72, opMargin: 0.2, marginTrend: -0.015, psAtStart: 3.5, debtToRevenue: 0.9, dividendPayout: 0.55 }),
  D({ symbol: 'CDRB.DM', name: 'Cedar Brook Consumer (demo)', sector: 'Consumer Staples', beta: 0.5, vol: 0.009, drift: 0.01, startPrice: 64, revenue0: 30e9, revGrowth: 0.03, grossMargin: 0.48, opMargin: 0.19, marginTrend: 0, psAtStart: 4, debtToRevenue: 0.6, dividendPayout: 0.6 }),
  D({ symbol: 'GRNL.DM', name: 'Greenleaf Foods (demo)', sector: 'Consumer Staples', beta: 0.6, vol: 0.011, drift: -0.02, startPrice: 48, revenue0: 12e9, revGrowth: 0.04, grossMargin: 0.34, opMargin: 0.13, marginTrend: 0.004, psAtStart: 1.8, debtToRevenue: 0.5, dividendPayout: 0.45 }),
  D({ symbol: 'BRKW.DM', name: 'Brookwater Retail (demo)', sector: 'Consumer Discretionary', beta: 1.1, vol: 0.014, drift: 0.09, startPrice: 55, revenue0: 20e9, revGrowth: 0.08, grossMargin: 0.38, opMargin: 0.1, marginTrend: 0.005, psAtStart: 1.6, debtToRevenue: 0.3, dividendPayout: 0.2 }),
  D({ symbol: 'FLNT.DM', name: 'Flintstone Industrial (demo)', sector: 'Industrials', beta: 1.1, vol: 0.013, drift: 0.04, startPrice: 140, revenue0: 25e9, revGrowth: 0.05, grossMargin: 0.3, opMargin: 0.15, marginTrend: 0.006, psAtStart: 2.2, debtToRevenue: 0.7, dividendPayout: 0.35 }),
  D({ symbol: 'ATLS.DM', name: 'Atlas Logistics (demo)', sector: 'Industrials', beta: 1.0, vol: 0.013, drift: 0.0, startPrice: 92, revenue0: 18e9, revGrowth: 0.02, grossMargin: 0.22, opMargin: 0.08, marginTrend: -0.004, psAtStart: 1.1, debtToRevenue: 0.55, dividendPayout: 0.4 }),
  D({ symbol: 'MRDN.DM', name: 'Meridian Payments (demo)', sector: 'Financials', beta: 1.0, vol: 0.012, drift: 0.1, startPrice: 150, revenue0: 9e9, revGrowth: 0.12, grossMargin: 0.8, opMargin: 0.5, marginTrend: 0.005, psAtStart: 12, debtToRevenue: 1.2, dividendPayout: 0.2 }),
  D({ symbol: 'PNCL.DM', name: 'Pinnacle Regional Bank (demo)', sector: 'Financials', beta: 1.1, vol: 0.014, drift: 0.03, startPrice: 38, revenue0: 7e9, revGrowth: 0.04, grossMargin: null, opMargin: 0.32, marginTrend: 0, psAtStart: 2.5, debtToRevenue: 2.5, dividendPayout: 0.4, missing: ['grossProfit', 'capex', 'depreciation'] }),
  D({ symbol: 'LMNS.DM', name: 'Lumens Networks (demo)', sector: 'Communication Services', beta: 1.2, vol: 0.016, drift: 0.07, startPrice: 210, revenue0: 40e9, revGrowth: 0.13, grossMargin: 0.8, opMargin: 0.34, marginTrend: 0.006, psAtStart: 6, debtToRevenue: 0.2, dividendPayout: 0.08 }),
  D({ symbol: 'IRNW.DM', name: 'Ironwood Energy (demo)', sector: 'Energy', beta: 0.9, vol: 0.018, drift: 0.02, startPrice: 60, revenue0: 50e9, revGrowth: 0.02, grossMargin: 0.32, opMargin: 0.14, marginTrend: 0, psAtStart: 1.2, debtToRevenue: 0.35, dividendPayout: 0.5 }),
  D({ symbol: 'SLTR.DM', name: 'Solstice Renewable Power (demo)', sector: 'Utilities', beta: 0.7, vol: 0.015, drift: -0.06, startPrice: 70, revenue0: 10e9, revGrowth: 0.03, grossMargin: 0.45, opMargin: 0.2, marginTrend: -0.01, psAtStart: 3, debtToRevenue: 2.2, dividendPayout: 0.7 }),
  D({ symbol: 'CBLT.DM', name: 'Cobalt Materials (demo)', sector: 'Materials', beta: 1.2, vol: 0.018, drift: 0.04, startPrice: 33, revenue0: 6e9, revGrowth: 0.06, grossMargin: 0.28, opMargin: 0.12, marginTrend: 0, psAtStart: 1.5, debtToRevenue: 0.5, dividendPayout: 0.3, missing: ['grossProfit', 'operatingCashFlow', 'capex', 'dividendsPerShare'] }),
];

export const DEMO_BENCHMARK: CompanyInfo = { symbol: 'DM500.DM', name: 'Demo 500 Index (fictional benchmark)', sector: 'Benchmark', demo: true };

export const isDemoSymbol = (s: string) => s.toUpperCase().endsWith('.DM');

export const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
