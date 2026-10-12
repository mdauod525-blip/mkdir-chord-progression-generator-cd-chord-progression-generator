/**
 * Tiingo end-of-day prices (https://www.tiingo.com/documentation/end-of-day).
 * Free plan (check current terms): limited requests per hour/day and unique symbols per month;
 * personal/internal use. We use the adjusted OHLCV fields.
 */
import type { Bar } from '../../types';
import { fetchJson, ProviderError, Throttle } from '../http';
import type { PriceProvider } from './types';

interface TiingoRow {
  date: string;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjClose?: number;
  adjVolume?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function parseTiingoDaily(json: unknown): Bar[] {
  if (!Array.isArray(json)) {
    const detail = (json as { detail?: string } | null)?.detail ?? String(json).slice(0, 120);
    if (/limit/i.test(detail)) throw new ProviderError(`Tiingo: ${detail}`, 'rate_limited');
    if (/not found|invalid/i.test(detail)) throw new ProviderError(`Tiingo: ${detail}`, 'not_found');
    throw new ProviderError(`Tiingo: unexpected response: ${detail}`, 'bad_response');
  }
  return (json as TiingoRow[])
    .map((r) => ({
      time: r.date.slice(0, 10),
      open: r.adjOpen ?? r.open,
      high: r.adjHigh ?? r.high,
      low: r.adjLow ?? r.low,
      close: r.adjClose ?? r.close,
      volume: r.adjVolume ?? r.volume,
    }))
    .filter((b) => [b.open, b.high, b.low, b.close].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export class TiingoProvider implements PriceProvider {
  readonly id = 'tiingo';
  readonly name = 'Tiingo (end-of-day, adjusted)';
  readonly adjusted = true;
  readonly limitations = [
    'End-of-day only — prices update after the US close, never real-time.',
    'Free plan has hourly/daily request caps and a monthly unique-symbol cap; responses are cached.',
    'Free plan licence is for personal use; redistribution requires a commercial plan.',
  ];
  private throttle = new Throttle(1200);
  constructor(private apiKey: string) {}

  async getDailyBars(symbol: string, startDate: string): Promise<Bar[]> {
    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${startDate}&format=json`;
    const json = await this.throttle.run(() =>
      fetchJson(url, { headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'application/json' } }),
    );
    return parseTiingoDaily(json);
  }
}
