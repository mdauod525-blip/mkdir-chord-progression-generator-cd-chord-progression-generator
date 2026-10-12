/**
 * Server-side market-data service. Chooses providers from environment variables, caches responses,
 * labels data freshness honestly, and degrades gracefully when a provider fails.
 */
import 'server-only';
import type { Bar, CompanyInfo, DataMeta, Fundamentals, PriceSeries } from '../types';
import { cached } from './cache';
import { ProviderError } from './http';
import { AlphaVantageProvider } from './providers/alphavantage';
import { demoBars, demoFundamentals, lastDemoSession } from './providers/demo';
import { SecEdgarProvider } from './providers/sec';
import { TiingoProvider } from './providers/tiingo';
import type { PriceProvider } from './providers/types';
import { DEMO_BENCHMARK, DEMO_UNIVERSE, isDemoSymbol, LIVE_BENCHMARK, LIVE_UNIVERSE } from '../universe';
import { buildStockAnalysis, peerMediansFor, toScanRow, type ScanRow, type StockAnalysis } from '../analysis/stock';

const HOUR = 3600_000;
const PRICE_TTL = 6 * HOUR;
const FUND_TTL = 24 * HOUR;
const ESTIMATE_TTL = 24 * HOUR;
const HISTORY_YEARS = 6;

export type Mode = 'demo' | 'live';

export interface ProviderStatus {
  mode: Mode;
  price: { id: string; name: string; adjusted: boolean; limitations: string[] } | null;
  fallbackPrice: { id: string; name: string } | null;
  fundamentals: { id: string; name: string; limitations: string[] } | null;
  estimates: { id: string; name: string } | null;
  benchmark: CompanyInfo;
  universeSize: number;
  notes: string[];
}

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

let providers: { price: PriceProvider | null; fallback: PriceProvider | null; av: AlphaVantageProvider | null; sec: SecEdgarProvider | null } | null = null;
function getProviders() {
  if (!providers) {
    const tiingo = env('TIINGO_API_KEY') ? new TiingoProvider(env('TIINGO_API_KEY')!) : null;
    const av = env('ALPHAVANTAGE_API_KEY') ? new AlphaVantageProvider(env('ALPHAVANTAGE_API_KEY')!) : null;
    providers = {
      price: tiingo ?? av,
      fallback: tiingo && av ? av : null,
      av,
      sec: env('SEC_USER_AGENT') ? new SecEdgarProvider(env('SEC_USER_AGENT')!) : null,
    };
  }
  return providers;
}

export function getMode(): Mode {
  if (env('DATA_MODE') === 'demo') return 'demo';
  return getProviders().price ? 'live' : 'demo';
}

export function getStatus(): ProviderStatus {
  const mode = getMode();
  const p = getProviders();
  const notes: string[] = [];
  if (mode === 'demo') {
    notes.push('DEMO MODE: all prices and financials are generated for fictional ".DM" companies. They are not market data.');
    notes.push('Add TIINGO_API_KEY (or ALPHAVANTAGE_API_KEY) and SEC_USER_AGENT to .env.local to use real end-of-day data.');
  } else {
    notes.push('Prices are end-of-day (delayed). Nothing in this app is real-time.');
    if (!p.sec) notes.push('SEC_USER_AGENT not set — fundamentals and valuation are unavailable and scored as missing.');
    if (!p.av) notes.push('No Alpha Vantage key — forward P/E, PEG, analyst targets and earnings dates are unavailable.');
  }
  return {
    mode,
    price: mode === 'live' && p.price ? { id: p.price.id, name: p.price.name, adjusted: p.price.adjusted, limitations: p.price.limitations } : null,
    fallbackPrice: mode === 'live' && p.fallback ? { id: p.fallback.id, name: p.fallback.name } : null,
    fundamentals: mode === 'live' && p.sec ? { id: p.sec.id, name: p.sec.name, limitations: p.sec.limitations } : mode === 'demo' ? { id: 'demo', name: 'Demo generator (fictional)', limitations: [] } : null,
    estimates: mode === 'live' && p.av ? { id: 'alphavantage', name: 'Alpha Vantage OVERVIEW / EARNINGS_CALENDAR' } : null,
    benchmark: mode === 'demo' ? DEMO_BENCHMARK : LIVE_BENCHMARK,
    universeSize: mode === 'demo' ? DEMO_UNIVERSE.length : LIVE_UNIVERSE.length,
    notes,
  };
}

export function getUniverse(): CompanyInfo[] {
  return getMode() === 'demo' ? DEMO_UNIVERSE.map(({ symbol, name, sector, demo }) => ({ symbol, name, sector, demo })) : LIVE_UNIVERSE;
}

export function getBenchmarkInfo(): CompanyInfo {
  return getMode() === 'demo' ? DEMO_BENCHMARK : LIVE_BENCHMARK;
}

export function companyInfo(symbol: string): CompanyInfo {
  const all = [...getUniverse(), getBenchmarkInfo()];
  return all.find((c) => c.symbol === symbol) ?? { symbol, name: symbol, sector: 'Unclassified' };
}

/** Calendar days since a trading date, relative to now. */
function ageDays(date: string): number {
  return (Date.now() - Date.parse(date + 'T21:00:00Z')) / 86400000;
}

function startDate(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
}

export class DataUnavailableError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export async function getPriceSeries(symbol: string): Promise<PriceSeries> {
  const mode = getMode();
  if (mode === 'demo' || isDemoSymbol(symbol)) {
    if (mode === 'live' && isDemoSymbol(symbol)) throw new DataUnavailableError('Demo symbols are only available in demo mode.', 'not_found');
    const bars = demoBars(symbol);
    if (!bars) throw new DataUnavailableError(`${symbol} is not in the demo universe. Demo mode only covers fictional ".DM" companies.`, 'not_found');
    return {
      symbol,
      bars,
      meta: { kind: 'demo', provider: 'Demo generator', asOf: bars[bars.length - 1]?.time ?? null, fetchedAt: new Date().toISOString(), adjusted: true, stale: false, notes: ['Simulated prices for a fictional company — not market data.'] },
    };
  }
  const { price, fallback } = getProviders();
  const attempt = async (prov: PriceProvider) => {
    const res = await cached(`px:${prov.id}:${symbol}`, PRICE_TTL, () => prov.getDailyBars(symbol, startDate()));
    return { res, prov };
  };
  let out: Awaited<ReturnType<typeof attempt>>;
  const notes: string[] = [];
  try {
    out = await attempt(price!);
  } catch (e) {
    if (!fallback) throw toUnavailable(e, price!.name);
    notes.push(`${price!.name} failed (${(e as Error).message}); using ${fallback.name}.`);
    try {
      out = await attempt(fallback);
    } catch (e2) {
      throw toUnavailable(e2, fallback.name);
    }
  }
  const { res, prov } = out;
  const bars = res.value;
  if (!bars.length) throw new DataUnavailableError(`${prov.name} returned no price history for ${symbol}.`, 'not_found');
  const asOf = bars[bars.length - 1].time;
  // EOD data older than 4 calendar days (covers weekends + a holiday) is flagged stale.
  const stale = ageDays(asOf) > 4;
  if (res.staleFallback) notes.push(`Refresh failed (${res.error}); showing cached data from ${res.fetchedAt}.`);
  if (!prov.adjusted) notes.push('Prices are not split/dividend adjusted.');
  if (bars.length < 252) notes.push(`Only ${bars.length} sessions of history available.`);
  const meta: DataMeta = { kind: res.fromCache ? 'cached' : 'eod', provider: prov.name, asOf, fetchedAt: res.fetchedAt, adjusted: prov.adjusted, stale: stale || res.staleFallback, notes };
  return { symbol, bars, meta };
}

function toUnavailable(e: unknown, name: string) {
  if (e instanceof ProviderError) {
    const msg = e.code === 'rate_limited' ? `${name}: free-tier rate limit reached. Try again later; cached symbols still work.` : `${name}: ${e.message}`;
    return new DataUnavailableError(msg, e.code);
  }
  return new DataUnavailableError(`${name}: ${(e as Error).message}`, 'network');
}

export async function getFundamentals(symbol: string): Promise<{ data: Fundamentals | null; note: string | null }> {
  if (getMode() === 'demo') return { data: demoFundamentals(symbol, lastDemoSession()), note: null };
  const { sec, av } = getProviders();
  if (symbol === LIVE_BENCHMARK.symbol) return { data: null, note: 'ETF — no company fundamentals.' };
  let data: Fundamentals | null = null;
  let note: string | null = null;
  if (sec) {
    try {
      const res = await cached(`sec:${symbol}`, FUND_TTL, () => sec.getFundamentals(symbol));
      data = res.value ? { ...res.value, kind: res.fromCache ? 'cached' : 'eod', fetchedAt: res.fetchedAt } : null;
      if (!data) note = 'Not found in SEC EDGAR (foreign filers and ETFs are not covered).';
      if (res.staleFallback) note = `SEC refresh failed; showing cached filings from ${res.fetchedAt}.`;
    } catch (e) {
      note = `SEC EDGAR unavailable: ${(e as Error).message}`;
    }
  } else note = 'Fundamentals provider not configured (set SEC_USER_AGENT).';
  if (data && av) {
    try {
      const ov = await cached(`av:overview:${symbol}`, ESTIMATE_TTL, () => av.getOverview(symbol));
      if (ov.value) data.estimates = { forwardPE: ov.value.forwardPE, pegRatio: ov.value.pegRatio, analystTargetPrice: ov.value.analystTargetPrice, source: 'Alpha Vantage OVERVIEW', asOf: ov.fetchedAt.slice(0, 10) };
      const ec = await cached(`av:earn:${symbol}`, ESTIMATE_TTL, () => av.getNextEarnings(symbol));
      data.nextEarningsDate = ec.value;
    } catch (e) {
      data.notes.push(`Estimates unavailable: ${(e as Error).message}`);
    }
  }
  return { data, note };
}

async function benchmarkBars(): Promise<{ bars: Bar[]; error: string | null }> {
  try {
    return { bars: (await getPriceSeries(getBenchmarkInfo().symbol)).bars, error: null };
  } catch (e) {
    return { bars: [], error: (e as Error).message };
  }
}

export async function getBenchmarkSeries(): Promise<PriceSeries | null> {
  try {
    return await getPriceSeries(getBenchmarkInfo().symbol);
  } catch {
    return null;
  }
}

let scanCache: { at: number; mode: Mode; rows: ScanRow[]; errors: { symbol: string; error: string }[] } | null = null;
const SCAN_TTL = 30 * 60_000;

/** Analyze every symbol in the universe (sequential to respect provider rate limits). */
export async function scanUniverse(force = false) {
  const mode = getMode();
  if (!force && scanCache && scanCache.mode === mode && Date.now() - scanCache.at < SCAN_TTL) return scanCache;
  const bench = await benchmarkBars();
  const inputs: { info: CompanyInfo; series: PriceSeries; fundamentals: Fundamentals | null }[] = [];
  const errors: { symbol: string; error: string }[] = [];
  for (const info of getUniverse()) {
    try {
      const series = await getPriceSeries(info.symbol);
      const f = await getFundamentals(info.symbol);
      inputs.push({ info, series, fundamentals: f.data });
    } catch (e) {
      errors.push({ symbol: info.symbol, error: (e as Error).message });
    }
  }
  // Pass 1 builds rows for peer medians; pass 2 includes peer valuation so scan and detail pages agree.
  const firstPass = inputs.map((i) => toScanRow(buildStockAnalysis({ info: i.info, bars: i.series.bars, priceMeta: i.series.meta, benchmark: bench.bars, fundamentals: i.fundamentals })));
  const rows = inputs.map((i) =>
    toScanRow(buildStockAnalysis({ info: i.info, bars: i.series.bars, priceMeta: i.series.meta, benchmark: bench.bars, fundamentals: i.fundamentals, peers: peerMediansFor(firstPass, i.info.sector, i.info.symbol) })),
  );
  if (bench.error) errors.push({ symbol: getBenchmarkInfo().symbol, error: bench.error });
  scanCache = { at: Date.now(), mode, rows: rows.sort((a, b) => b.score - a.score), errors };
  return scanCache;
}

export async function analyzeSymbol(symbol: string): Promise<{ analysis: StockAnalysis; bars: Bar[]; benchmark: Bar[]; benchmarkError: string | null; fundamentalsNote: string | null }> {
  const series = await getPriceSeries(symbol);
  const bench = await benchmarkBars();
  const f = await getFundamentals(symbol);
  // Peer medians come from the cached scan if one exists (no extra provider calls are triggered here).
  const peers = scanCache && scanCache.mode === getMode() ? peerMediansFor(scanCache.rows, companyInfo(symbol).sector, symbol) : null;
  const analysis = buildStockAnalysis({ info: companyInfo(symbol), bars: series.bars, priceMeta: series.meta, benchmark: bench.bars, fundamentals: f.data, peers });
  return { analysis, bars: series.bars, benchmark: bench.bars, benchmarkError: bench.error, fundamentalsNote: f.note };
}
