# Market-data provider evaluation (October 2026)

Free-tier terms change often. These notes come from public documentation and third-party summaries; check each provider's current pricing page before relying on them.

| Provider | What the free tier gives | Limits (as published / reported) | Licensing | Use in PositionScope |
|---|---|---|---|---|
| **Tiingo** | End-of-day OHLCV with split/dividend-**adjusted** fields, long history | Reported as ~50 requests/hour, ~1,000/day, ~500 unique symbols/month (verify the current limits) | Free plan is for personal/internal use; redistribution needs a commercial licence | **Primary price source** (`TIINGO_API_KEY`) |
| **Alpha Vantage** | `TIME_SERIES_DAILY` (unadjusted), `OVERVIEW` (forward P/E, PEG, analyst target), `EARNINGS_CALENDAR` | 25 requests/day, 5/minute; adjusted daily series is premium | Free key, personal use | **Fallback prices** + **estimates/earnings dates** (`ALPHAVANTAGE_API_KEY`) |
| **SEC EDGAR (XBRL company facts)** | Reported financial statements from 10-K/10-Q filings | ≤10 requests/second; must send a User-Agent with contact info | US government data, public domain | **Fundamentals** (`SEC_USER_AGENT`) |
| Financial Modeling Prep | EOD prices, profiles, some statements | 250 calls/day, 500 MB/30-day bandwidth; many endpoints symbol- or history-restricted on the free plan | Commercial terms apply | Not implemented; good candidate for a paid upgrade |
| Finnhub | Quotes, some fundamentals | 60 calls/minute; historical candles are reported to be premium-only on recent plans | Commercial terms apply | Not implemented |
| Yahoo Finance (unofficial libraries) | Broad coverage | Unofficial, can break or block without notice | Yahoo's terms restrict automated/commercial use | **Deliberately not used** |

## Why this combination

- Daily/weekly position trading needs **adjusted end-of-day history**, not intraday data. Tiingo's free plan provides it.
- Fundamentals from **SEC EDGAR** are official, free, and include filing dates. So every number can be traced to a filing, and nothing is estimated.
- Forecasts (forward P/E, analyst targets) are kept separate. They come only from a provider (Alpha Vantage) and are labelled as estimates.

## Switching providers

Implement `PriceProvider` or `FundamentalsProvider` in `src/lib/data/providers/` and wire it into `getProviders()` in `src/lib/data/service.ts`. The analysis, UI and caching layers don't depend on a specific provider.

## Rate-limit strategy

- Prices are cached for 6 hours and fundamentals/estimates for 24 hours, in memory and in JSON files under `CACHE_DIR`. Restarts therefore don't spend quota.
- Calls are serialized per provider with a minimum spacing (Tiingo 1.2 s, Alpha Vantage 13 s, SEC 150 ms).
- If a refresh fails and an older cached copy exists, the old copy is served and labelled **STALE**, with the fetch time.
- The scanner universe is 20 symbols plus the benchmark. That fits within Tiingo's reported monthly symbol cap. Keep the universe small on free tiers.
