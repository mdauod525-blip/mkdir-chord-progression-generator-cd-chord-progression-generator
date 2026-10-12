# PositionScope

A mobile-first research and decision-support tool for **position trading**: holding US-listed blue-chip and growth stocks for weeks to months, using daily and weekly charts. It combines technical analysis, support/resistance zones, fundamentals, valuation and risk/reward into a transparent opportunity score. Its paper-trading portfolio is **simulated only**.

> Not financial advice. Scores, setups and fair values are uncertain screening aids. They are not predictions or probabilities of profit. No brokerage is connected and no real orders are ever placed.

## Quick start

Requires Node 20.9+ (22 recommended).

```bash
cd positionscope
npm install
npm run dev          # http://localhost:3000, also on your LAN (binds 0.0.0.0)
```

Without API keys the app runs in **demo mode**. Demo mode covers 16 *fictional* companies (tickers end in `.DM`) and a fictional "Demo 500" benchmark. All of their data is generated, and it is labelled DEMO everywhere. Demo data is never shown for a real ticker.

### Use real end-of-day data (free)

```bash
cp .env.example .env.local
# then edit .env.local:
TIINGO_API_KEY=...                      # free account at tiingo.com (adjusted EOD prices)
SEC_USER_AGENT="PositionScope you@example.com"   # SEC requires a contact; no key needed
ALPHAVANTAGE_API_KEY=...                # optional: forward P/E, PEG, analyst target, earnings dates
```

Restart the server. Keys are read only on the server and never sent to the browser. See [docs/DATA_PROVIDERS.md](docs/DATA_PROVIDERS.md) for the provider evaluation, limits and licensing.

### Preview on your iPhone

- **Same Wi-Fi (quickest):** run `npm run dev` and find your computer's LAN IP (macOS: `ipconfig getifaddr en0`). Then open `http://<that-ip>:3000` in Safari. For a production-speed preview, run `npm run build && npm start` instead.
- **Anywhere (free hosting):** import the repo into Vercel and set **Root Directory = `positionscope`**. Add the same environment variables there, plus `CACHE_DIR=/tmp/positionscope`, then open the deployment URL on the phone. Vercel's free Hobby plan is for personal, non-commercial use.
- In Safari, tap **Share → Add to Home Screen** for a full-screen app icon.

GitHub Pages (used by the StrumFlow app in this repo) can't host this app, because it needs server-side API routes to keep keys secret and cache provider data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on `0.0.0.0:3000` |
| `npm test` | 59 unit tests (indicators, S/R, setups, fundamentals, valuation, scoring, providers, alerts, paper trading, sizing, mocked live mode) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` / `npm start` | Production build / server |

CI: `.github/workflows/positionscope.yml` runs typecheck, tests and build on changes under `positionscope/`.

## What works now (Phase 1 plus parts of Phases 2–5)

| Area | Status |
|---|---|
| **Dashboard** | Benchmark overview (S&P 500 via SPY in live mode), breadth, top opportunities, near support/resistance, breakouts and retests, extended/overbought, upcoming earnings, recent alerts, watchlist performance, paper-portfolio summary |
| **Opportunity scanner** | Ranked cards with every requested field. Filter by sector, trend, valuation, market cap, minimum score and minimum R/R; sort by eight keys; search |
| **Stock page** | Candlestick chart (daily/weekly; 3M–5Y/All) with volume; SMA and EMA 20/50/100/200; Bollinger Bands; S/R zones; entry, invalidation and target lines; Fibonacci; RSI, MACD, RS-vs-benchmark, ROC and ATR panes. All toggleable |
| **Support/resistance** | Confirmed swing pivots (daily and weekly), clustered into ATR-scaled zones. Evidence per zone: touches, rejections, role reversal, volume-at-price, recency. Moving averages and Fibonacci shown as secondary references. No look-ahead (tested) |
| **Entry setups** | 7 setup types, each with entry zone, confirmation, invalidation, targets, upside/downside, R/R, ATR context, reasons for and against, and cancel conditions. Otherwise "No clear setup" |
| **Fundamentals** | Growth, margins, FCF, ROIC, leverage, P/E, P/S, EV/EBITDA, FCF yield, trailing PEG, dividends. Reported vs estimate labelled, fiscal periods shown, sources listed |
| **Valuation** | Historical P/E and P/S ranges, FCF DCF and peer P/E, each with conservative/base/optimistic cases and stated assumptions. Unsuitable methods are explained, never forced |
| **Score** | 0–100 with the requested weights (configurable in Settings). Missing data scores 25/100, never favourable. Completeness and confidence shown separately |
| **Alerts** | 18 rule types, daily-close or weekly-confirmation, duplicate prevention, cooldowns, history, watchlist auto-alerts. **In-app only**, evaluated while the app is open |
| **Watchlists** | Multiple lists; prices, trend, score, valuation, entry zones; alerts per list |
| **Paper trading** | Market/limit orders filled at the *next* session's open (no look-ahead), slippage and commission, average cost, realized/unrealized P/L, dividends, thesis and invalidation, journal, benchmark comparison |
| **Risk calculator** | Fixed-fraction sizing with round-trip costs, exposure, R/R, concentration and correlation warnings, stop-gap disclaimer |
| **UI** | Mobile-first, bottom tabs, dark/light/system theme, explicit DEMO/EOD/CACHED/STALE badges, loading, empty and error states, no horizontal scroll at iPhone width |

### Uses demo data / needs keys or infrastructure

- **Demo mode:** everything works on fictional data. Live mode needs `TIINGO_API_KEY` (or `ALPHAVANTAGE_API_KEY`) for prices and `SEC_USER_AGENT` for fundamentals.
- **Forward P/E, PEG (forward), analyst targets, earnings dates:** need `ALPHAVANTAGE_API_KEY` (25 requests/day). Without it they show as *unavailable*.
- **Persistence:** watchlists, alerts, paper trades and settings live in the browser's `localStorage`, kept separately for demo and live mode. They don't sync across devices, and clearing site data removes them. Moving them to PostgreSQL/Prisma needs accounts and a database (planned).
- **Push/email alerts:** need a scheduled server job plus a notification service. Today alerts are in-app.
- **Not verified against live providers in this environment:** outbound access to data providers was blocked while this was built. The Tiingo, Alpha Vantage and SEC parsers are tested against recorded response shapes and a mocked end-to-end live-mode run, but not against real responses. Check the first live run (see Settings → Data sources).
- **Backtesting:** not built yet (Phase 6).

## Architecture

```
src/lib/
  types.ts                 domain types (Bar, DataMeta, Fundamentals…)
  indicators/              SMA, EMA, RSI, MACD, ROC, ATR, Bollinger, RS line, weekly aggregation
  analysis/levels.ts       support/resistance engine
  analysis/technical.ts    trend classification + technical snapshot (analyzeAsOf for history)
  analysis/setups.ts       entry-setup detection
  analysis/fundamentals.ts derived metrics, quality and growth sub-scores
  analysis/valuation.ts    valuation methods and scenarios
  analysis/stock.ts        combines everything → StockAnalysis / ScanRow
  scoring/score.ts         opportunity score, weights, reweighting
  alerts/engine.ts         alert rules, dedupe, cooldown
  paper/portfolio.ts       simulated fills and ledger
  risk/sizing.ts           position sizing
  data/providers/          demo, Tiingo, Alpha Vantage, SEC EDGAR (provider interfaces in types.ts)
  data/cache.ts, http.ts   disk+memory cache with stale-if-error, throttling, typed provider errors
  data/service.ts          server-only: provider selection, freshness labels, scan
  client/                  localStorage stores, fetch hook, formatting
src/app/                   pages (dashboard, scanner, stock/[symbol], watchlists, alerts, paper, risk, settings, methodology) and API routes
src/components/            app shell, chart, cards, UI primitives
tests/                     Vitest suites
```

All calculations are pure functions with no I/O, so they can be checked independently. [docs/METHODOLOGY.md](docs/METHODOLOGY.md) describes every formula (the in-app Methodology page summarizes it).

## Roadmap

1. **Phase 1 (done):** app, navigation, dashboard, stock pages and charts, indicators, S/R, scanner, scoring, watchlists, alerts, paper trading.
2. **Phase 2 (mostly done):** Tiingo, Alpha Vantage and SEC providers, caching, freshness labels, rate-limit handling. Remaining: validate against live responses; add quarterly/TTM fundamentals.
3. **Phase 3:** server-side scheduled alert evaluation, notifications, tune setup rules with historical signal studies.
4. **Phase 4:** quarterly/TTM data, historical multiple bands, larger peer sets.
5. **Phase 5:** accounts plus PostgreSQL/Prisma persistence, time-weighted returns, equity curve.
6. **Phase 6:** backtesting engine (reusing `analyzeAsOf` for look-ahead-free signals), paid-provider adapters. No brokerage execution unless explicitly requested.
