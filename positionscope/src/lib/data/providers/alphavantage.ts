/**
 * Alpha Vantage (https://www.alphavantage.co/documentation/).
 * Free key: ~25 requests/day and 5/minute (check current terms). Adjusted daily series are a
 * premium endpoint, so the free fallback uses TIME_SERIES_DAILY (unadjusted — flagged in the UI).
 * OVERVIEW supplies forward P/E, PEG and analyst target, which we show as provider estimates.
 */
import type { Bar } from '../../types';
import { fetchJson, ProviderError, Throttle } from '../http';
import type { PriceProvider } from './types';

type AvDaily = Record<string, Record<string, string>>;

function checkAvError(json: unknown) {
  if (typeof json !== 'object' || json === null) throw new ProviderError('Alpha Vantage: unexpected response', 'bad_response');
  const o = json as Record<string, string>;
  const msg = o['Information'] ?? o['Note'] ?? o['Error Message'];
  if (msg) {
    if (/premium/i.test(msg)) throw new ProviderError(`Alpha Vantage: ${msg.slice(0, 160)}`, 'premium');
    if (/rate limit|call frequency|requests per day/i.test(msg)) throw new ProviderError(`Alpha Vantage: ${msg.slice(0, 160)}`, 'rate_limited');
    if (/invalid api call/i.test(msg)) throw new ProviderError(`Alpha Vantage: symbol not found`, 'not_found');
    throw new ProviderError(`Alpha Vantage: ${msg.slice(0, 160)}`, 'bad_response');
  }
}

export function parseAlphaVantageDaily(json: unknown): Bar[] {
  checkAvError(json);
  const series = (json as Record<string, AvDaily>)['Time Series (Daily)'];
  if (!series) throw new ProviderError('Alpha Vantage: missing daily series', 'bad_response');
  return Object.entries(series)
    .map(([time, r]) => ({
      time,
      open: Number(r['1. open']),
      high: Number(r['2. high']),
      low: Number(r['3. low']),
      close: Number(r['4. close']),
      volume: Number(r['5. volume']),
    }))
    .filter((b) => [b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface AvOverview {
  forwardPE: number | null;
  pegRatio: number | null;
  analystTargetPrice: number | null;
  sector: string | null;
  name: string | null;
}

const num = (v: string | undefined) => {
  if (v === undefined || v === 'None' || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseAlphaVantageOverview(json: unknown): AvOverview | null {
  checkAvError(json);
  const o = json as Record<string, string>;
  if (!o.Symbol) return null;
  return {
    forwardPE: num(o.ForwardPE),
    pegRatio: num(o.PEGRatio),
    analystTargetPrice: num(o.AnalystTargetPrice),
    sector: o.Sector && o.Sector !== 'None' ? o.Sector : null,
    name: o.Name ?? null,
  };
}

/** EARNINGS_CALENDAR returns CSV: symbol,name,reportDate,fiscalDateEnding,estimate,currency */
export function parseEarningsCalendarCsv(csv: string, symbol: string): string | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].startsWith('symbol')) return null;
  const dates = lines
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => c[0]?.toUpperCase() === symbol.toUpperCase() && /^\d{4}-\d{2}-\d{2}$/.test(c[2] ?? ''))
    .map((c) => c[2])
    .sort();
  return dates[0] ?? null;
}

export class AlphaVantageProvider implements PriceProvider {
  readonly id = 'alphavantage';
  readonly name = 'Alpha Vantage (end-of-day, unadjusted on free tier)';
  readonly adjusted = false;
  readonly limitations = [
    'Free key allows roughly 25 requests per day — responses are cached for 12 hours.',
    'Free daily series is NOT split/dividend adjusted; long-range charts can show split gaps.',
    'End-of-day only — never real-time.',
  ];
  private throttle = new Throttle(13000); // ≤5 requests/minute
  constructor(private apiKey: string) {}

  private url(params: Record<string, string>) {
    const q = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `https://www.alphavantage.co/query?${q}`;
  }

  async getDailyBars(symbol: string): Promise<Bar[]> {
    try {
      return parseAlphaVantageDaily(await this.throttle.run(() => fetchJson(this.url({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'full' }))));
    } catch (e) {
      // Fall back to the last ~100 sessions if full history is premium-gated.
      if (e instanceof ProviderError && e.code === 'premium') {
        return parseAlphaVantageDaily(await this.throttle.run(() => fetchJson(this.url({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' }))));
      }
      throw e;
    }
  }

  async getOverview(symbol: string): Promise<AvOverview | null> {
    return parseAlphaVantageOverview(await this.throttle.run(() => fetchJson(this.url({ function: 'OVERVIEW', symbol }))));
  }

  async getNextEarnings(symbol: string): Promise<string | null> {
    const res = await this.throttle.run(() => fetchJson(this.url({ function: 'EARNINGS_CALENDAR', symbol, horizon: '3month' })));
    if (typeof res !== 'string') {
      checkAvError(res);
      return null;
    }
    return parseEarningsCalendarCsv(res, symbol);
  }
}
