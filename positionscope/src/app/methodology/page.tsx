import Link from 'next/link';
import { Card, Disclaimer, PageHeader } from '@/components/ui';
import { COMPONENT_LABELS, DEFAULT_WEIGHTS, MISSING_SCORE } from '@/lib/scoring/score';

export const metadata = { title: 'Methodology · PositionScope' };

export default function Methodology() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <PageHeader title="Methodology" subtitle="How every number in the app is produced." />
      <Card title="Data">
        <ul className="list-disc space-y-1 pl-4">
          <li>Prices are daily OHLCV bars. In live mode they come from an end-of-day provider and are delayed — the app never shows real-time quotes. Weekly bars are aggregated from daily bars (Monday-based weeks); weekly signals use completed weeks only.</li>
          <li>Freshness labels: <strong>DEMO</strong> (fictional, generated), <strong>End-of-day</strong> (fetched from the provider), <strong>Cached EOD</strong> (served from the server cache, with fetch time), <strong>STALE</strong> (latest bar older than 4 calendar days, or a refresh failed).</li>
          <li>Fundamentals are reported annual 10-K figures from SEC EDGAR XBRL. Forward P/E, PEG and analyst targets appear only if a provider supplies them, and are labelled as estimates. Missing values are shown as “unavailable”, never filled in.</li>
        </ul>
      </Card>
      <Card title="Indicators">
        <p>SMA/EMA (20/50/100/200; EMA seeded with the SMA), RSI(14) and ATR(14) with Wilder smoothing, MACD(12, 26, 9), rate of change, Bollinger Bands (20, 2σ population), and relative strength = stock return − benchmark return. Each value at a bar uses only that bar and earlier bars.</p>
      </Card>
      <Card title="Support & resistance zones">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Swing highs/lows on daily (±5 bars) and weekly (±3 bars) charts over ~2 years. A swing point counts only once k later bars exist, so recent unconfirmed turns are ignored (no look-ahead).</li>
          <li>Swing prices within 0.6 × ATR(14) (min 1% of price) are clustered into a zone; the zone spans the cluster, padded by a quarter of the tolerance.</li>
          <li>Evidence per zone: touches, weekly touches, wick rejections, role reversal (both support and resistance → breakout/retest level), share of volume traded inside the zone, volume at the swing points, and recency. Strength 0–100 is a weighted sum of these.</li>
          <li>Moving averages (50/100/200-day) are shown as dynamic levels and Fibonacci retracements of the 1-year swing as a secondary reference only.</li>
        </ol>
      </Card>
      <Card title="Entry setups">
        <p>Seven rule-based patterns: pullback to support in an uptrend, breakout above multi-touch resistance, breakout retest, recovery above the 50/200-day SMA, improving relative strength, attractive valuation with improving technicals, and reversal after a decline (always labelled higher risk). Each produces an entry zone, an invalidation level (a volatility buffer below structure), targets from the next resistance zones (or a labelled measured-move projection), reward/risk to the first target, and reasons for and against. RSI extremes are interpreted with trend and never trigger a setup alone. If no pattern qualifies with reward/risk ≥ 1.2, the result is “No clear setup”.</p>
      </Card>
      <Card title="Valuation">
        <p>Up to four methods, each skipped with an explanation when unsuitable: historical P/E range (FY EPS × the lowest/median/highest fiscal-year-end P/E), historical P/S range, a 5-year two-stage free-cash-flow DCF (growth anchored to the 3-year revenue CAGR, capped at 15%; discount 10/9/8.5%; terminal 2/2.5/3%), and sector-peer P/E from the scanned universe. The blended fair value is the median of the suitable methods. Banks and insurers are excluded from the DCF.</p>
      </Card>
      <Card title="Opportunity score (0–100)">
        <ul className="list-disc space-y-1 pl-4">
          {Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => <li key={k}>{COMPONENT_LABELS[k as keyof typeof COMPONENT_LABELS]}: {w}%</li>)}
        </ul>
        <p className="mt-2">Each component is normalized to 0–100. If a component is partly or entirely missing, the missing share is scored at {MISSING_SCORE}/100: adjusted = completeness × raw + (1 − completeness) × {MISSING_SCORE}. Missing data therefore lowers the score instead of being treated as neutral. Data completeness is shown separately. Weights can be changed in <Link className="underline" href="/settings">settings</Link>.</p>
        <p className="mt-2 font-semibold">The score ranks how much evidence lines up. It is not a probability of profit or a forecast of returns.</p>
      </Card>
      <Card title="Alerts and paper trading">
        <p>Alerts are evaluated on daily closes (weekly rules on completed weeks), once per rule per bar, with a cooldown. Paper orders fill at the next session’s open after the order was placed (plus slippage and commission), or when a later session trades through a limit — never on prices that were unknown when the order was placed.</p>
      </Card>
      <Card title="Not built yet">
        <p>Backtesting (planned after the data and signal engine have more live validation), quarterly/TTM fundamentals, push notifications, accounts and cross-device sync. There is no brokerage connection, and none is planned without an explicit request.</p>
      </Card>
      <Disclaimer />
    </div>
  );
}
