import { describe, expect, it } from 'vitest';
import { parseTiingoDaily } from '@/lib/data/providers/tiingo';
import { parseAlphaVantageDaily, parseAlphaVantageOverview, parseEarningsCalendarCsv } from '@/lib/data/providers/alphavantage';
import { extractAnnual, parseCompanyFacts } from '@/lib/data/providers/sec';
import { businessDays, demoBars, demoFundamentals, demoNextEarnings } from '@/lib/data/providers/demo';
import { ProviderError } from '@/lib/data/http';

describe('Tiingo parser', () => {
  it('uses adjusted fields and sorts oldest first', () => {
    const bars = parseTiingoDaily([
      { date: '2024-01-03T00:00:00.000Z', open: 10, high: 11, low: 9, close: 10.5, volume: 100, adjOpen: 5, adjHigh: 5.5, adjLow: 4.5, adjClose: 5.25, adjVolume: 200 },
      { date: '2024-01-02T00:00:00.000Z', open: 10, high: 11, low: 9, close: 10, volume: 100, adjOpen: 5, adjHigh: 5.5, adjLow: 4.5, adjClose: 5, adjVolume: 200 },
    ]);
    expect(bars.map((b) => b.time)).toEqual(['2024-01-02', '2024-01-03']);
    expect(bars[1].close).toBe(5.25);
    expect(bars[1].volume).toBe(200);
  });
  it('maps error payloads to typed provider errors', () => {
    expect(() => parseTiingoDaily({ detail: 'Error: You have run over your hourly request allocation. Upgrade or wait. limit' })).toThrowError(ProviderError);
    try {
      parseTiingoDaily({ detail: 'Error: Ticker \'ZZZZ\' not found' });
    } catch (e) {
      expect((e as ProviderError).code).toBe('not_found');
    }
  });
});

describe('Alpha Vantage parsers', () => {
  it('parses TIME_SERIES_DAILY', () => {
    const bars = parseAlphaVantageDaily({
      'Meta Data': {},
      'Time Series (Daily)': {
        '2024-01-03': { '1. open': '2', '2. high': '3', '3. low': '1', '4. close': '2.5', '5. volume': '10' },
        '2024-01-02': { '1. open': '1', '2. high': '2', '3. low': '0.5', '4. close': '1.5', '5. volume': '20' },
      },
    });
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ time: '2024-01-02', open: 1, high: 2, low: 0.5, close: 1.5, volume: 20 });
  });
  it('detects rate-limit and premium messages', () => {
    const rl = () => parseAlphaVantageDaily({ Information: 'We have detected your API key and our standard API rate limit is 25 requests per day.' });
    expect(rl).toThrowError(/rate limit/);
    try { rl(); } catch (e) { expect((e as ProviderError).code).toBe('rate_limited'); }
    try { parseAlphaVantageDaily({ Information: 'This is a premium endpoint.' }); } catch (e) { expect((e as ProviderError).code).toBe('premium'); }
  });
  it('treats "None" as unavailable in OVERVIEW', () => {
    const o = parseAlphaVantageOverview({ Symbol: 'X', ForwardPE: 'None', PEGRatio: '1.8', AnalystTargetPrice: '-', Sector: 'TECHNOLOGY', Name: 'X Corp' })!;
    expect(o.forwardPE).toBeNull();
    expect(o.pegRatio).toBe(1.8);
    expect(o.analystTargetPrice).toBeNull();
  });
  it('reads the earliest upcoming earnings date from CSV', () => {
    const csv = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency\nIBM,IBM,2026-10-21,2026-09-30,2.4,USD\nIBM,IBM,2027-01-20,2026-12-31,,USD\n';
    expect(parseEarningsCalendarCsv(csv, 'IBM')).toBe('2026-10-21');
    expect(parseEarningsCalendarCsv('symbol,name\n', 'IBM')).toBeNull();
  });
});

describe('SEC companyfacts parser', () => {
  const fact = (start: string | undefined, end: string, val: number, form = '10-K', filed = '2025-02-01', accn = 'a1') => ({ start, end, val, form, filed, accn });
  const json = {
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [fact('2022-01-01', '2022-12-31', 90), fact('2023-01-01', '2023-12-31', 100), fact('2023-10-01', '2023-12-31', 30, '10-Q')] } },
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [fact('2024-01-01', '2024-12-31', 120), fact('2023-01-01', '2023-12-31', 101, '10-K', '2025-02-01')] } },
        EarningsPerShareDiluted: { units: { 'USD/shares': [fact('2024-01-01', '2024-12-31', 2.5, '10-K', '2025-02-01'), fact('2024-01-01', '2024-12-31', 2.4, '10-K/A', '2025-05-01')] } },
        StockholdersEquity: { units: { USD: [fact(undefined, '2024-12-31', 500), fact(undefined, '2023-12-31', 450)] } },
        PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact('2024-01-01', '2024-12-31', 7)] } },
      },
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [fact(undefined, '2025-01-20', 600, '10-K', '2025-02-01', 'x'), fact(undefined, '2025-01-20', 400, '10-K', '2025-02-01', 'x'), fact(undefined, '2024-01-20', 999, '10-K', '2024-02-01', 'y')] } } },
    },
  };
  it('keeps annual 10-K durations only, prefers earlier tags, latest filing wins', () => {
    const f = parseCompanyFacts(json, 'TST');
    expect(f.history.revenue.map((v) => [v.fiscalYear, v.value])).toEqual([[2022, 90], [2023, 101], [2024, 120]]);
    expect(f.history.epsDiluted[0].value).toBe(2.4); // amended 10-K/A filed later wins
    expect(f.history.equity.map((v) => v.value)).toEqual([450, 500]);
    expect(f.history.capex[0].value).toBe(7);
  });
  it('sums multi-class share counts from the latest cover page', () => {
    const f = parseCompanyFacts(json, 'TST');
    expect(f.sharesOutstanding).toBe(1000);
    expect(f.sharesAsOf).toBe('2025-01-20');
  });
  it('returns an empty list when a tag is absent (never invents values)', () => {
    expect(extractAnnual(json.facts as never, ['GrossProfit'], 'USD', true)).toEqual([]);
    expect(parseCompanyFacts(json, 'TST').history.grossProfit).toEqual([]);
  });
});

describe('demo provider', () => {
  it('is deterministic and append-only', () => {
    const a = demoBars('NWND.DM', '2026-03-31')!;
    const b = demoBars('NWND.DM', '2026-06-30')!;
    expect(b.slice(0, a.length)).toEqual(a);
    expect(demoBars('NWND.DM', '2026-03-31')).toEqual(a);
  });
  it('generates valid OHLC on weekdays only', () => {
    const bars = demoBars('QNTM.DM', '2026-06-30')!;
    for (const b of bars) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      const dow = new Date(b.time + 'T00:00:00Z').getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
    expect(businessDays('2019-01-08')).toHaveLength(5);
  });
  it('only covers fictional .DM symbols and labels fundamentals as demo', () => {
    expect(demoBars('AAPL')).toBeNull();
    const f = demoFundamentals('CBLT.DM', '2026-06-30')!;
    expect(f.kind).toBe('demo');
    expect(f.history.grossProfit).toEqual([]);
    expect(f.notes.join(' ')).toMatch(/FICTIONAL/);
    expect(demoNextEarnings('NWND.DM', '2026-06-30') > '2026-06-30').toBe(true);
  });
});
