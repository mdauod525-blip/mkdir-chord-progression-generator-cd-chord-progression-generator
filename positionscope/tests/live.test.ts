/**
 * Live-mode service tests with a mocked fetch (no network): provider selection, freshness labels,
 * caching, stale-if-error fallback and rate-limit handling.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { demoBars } from '@/lib/data/providers/demo';

const dir = mkdtempSync(path.join(tmpdir(), 'ps-cache-'));
let tiingoMode: 'ok' | 'ratelimit' = 'ok';
const calls: string[] = [];

function tiingoRows(symbol: string) {
  // Reuse the demo generator purely as a deterministic fixture shape, ending "today".
  const src = symbol === 'SPY' ? 'DM500.DM' : 'NWND.DM';
  const end = new Date().toISOString().slice(0, 10);
  return demoBars(src, end)!.map((b) => ({ date: b.time + 'T00:00:00.000Z', open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, adjOpen: b.open, adjHigh: b.high, adjLow: b.low, adjClose: b.close, adjVolume: b.volume }));
}

const fy = (y: number, val: number) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, form: '10-K', filed: `${y + 1}-02-01`, accn: `a${y}` });
const companyFacts = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => fy(y, 100e9 * 1.1 ** i)) } },
      OperatingIncomeLoss: { units: { USD: [2022, 2023, 2024, 2025].map((y, i) => fy(y, 30e9 * 1.1 ** i)) } },
      NetIncomeLoss: { units: { USD: [2024, 2025].map((y) => fy(y, 25e9)) } },
      EarningsPerShareDiluted: { units: { 'USD/shares': [2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => fy(y, 1 + i * 0.2)) } },
      StockholdersEquity: { units: { USD: [{ end: '2025-12-31', val: 80e9, form: '10-K', filed: '2026-02-01', accn: 'x' }] } },
    },
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-01-20', val: 15e9, form: '10-K', filed: '2026-02-01', accn: 'x' }] } } },
  },
};

beforeAll(() => {
  process.env.CACHE_DIR = dir;
  process.env.TIINGO_API_KEY = 'test-key';
  process.env.SEC_USER_AGENT = 'PositionScope test test@example.com';
  delete process.env.ALPHAVANTAGE_API_KEY;
  delete process.env.DATA_MODE;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.includes('api.tiingo.com')) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Token test-key');
      if (tiingoMode === 'ratelimit') return json({ detail: 'Error: You have run over your hourly request allocation.' }, 429);
      const sym = /daily\/([a-z.]+)\//.exec(url)![1].toUpperCase();
      if (sym === 'ZZZZ') return json({ detail: 'Not found' }, 404);
      return json(tiingoRows(sym));
    }
    if (url.includes('company_tickers.json')) return json({ 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple' } });
    if (url.includes('companyfacts')) return json(companyFacts);
    return json({ error: 'unexpected' }, 500);
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  tiingoMode = 'ok';
});

describe('live mode service (mocked providers)', () => {
  it('selects live mode and never exposes API keys in status', async () => {
    const { getStatus } = await import('@/lib/data/service');
    const s = getStatus();
    expect(s.mode).toBe('live');
    expect(s.price?.id).toBe('tiingo');
    expect(JSON.stringify(s)).not.toContain('test-key');
  });

  it('labels the first fetch as end-of-day and the second as cached', async () => {
    const { getPriceSeries } = await import('@/lib/data/service');
    const a = await getPriceSeries('AAPL');
    expect(a.meta.kind).toBe('eod');
    expect(a.meta.adjusted).toBe(true);
    expect(a.meta.stale).toBe(false);
    const n = calls.length;
    const b = await getPriceSeries('AAPL');
    expect(b.meta.kind).toBe('cached');
    expect(calls.length).toBe(n); // no new network call
  });

  it('maps unknown symbols to a not-found error', async () => {
    const { getPriceSeries, DataUnavailableError } = await import('@/lib/data/service');
    await expect(getPriceSeries('ZZZZ')).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it('reports a rate-limit error clearly when nothing is cached', async () => {
    tiingoMode = 'ratelimit';
    const { getPriceSeries } = await import('@/lib/data/service');
    await expect(getPriceSeries('MSFT')).rejects.toThrow(/rate limit/i);
  });

  it('builds a full analysis from SEC fundamentals and refuses demo symbols in live mode', async () => {
    const { analyzeSymbol, getPriceSeries } = await import('@/lib/data/service');
    const r = await analyzeSymbol('AAPL');
    expect(r.analysis.fundamentals?.provider).toBe('SEC EDGAR');
    expect(r.analysis.fundamentalMetrics.metrics.revenueGrowth.value).toBeCloseTo(10);
    expect(r.analysis.fundamentalMetrics.marketCap).toBeGreaterThan(0);
    expect(r.analysis.fundamentalMetrics.metrics.forwardPE.value).toBeNull(); // no estimate provider configured
    expect(r.benchmark.length).toBeGreaterThan(0);
    await expect(getPriceSeries('NWND.DM')).rejects.toThrow(/demo mode/);
  });
});
