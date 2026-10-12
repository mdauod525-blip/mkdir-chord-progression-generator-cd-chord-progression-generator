/**
 * Entry-setup detection for position trades. Every setup carries an entry zone, confirmation
 * conditions, an invalidation level, targets, reward/risk and the evidence for and against it.
 * When nothing qualifies the result is "No clear setup". RSI alone never triggers a setup.
 */
import type { Bar } from '../types';
import { macd, rsi, sma } from '../indicators';
import { nearestResistance, type LevelZone } from './levels';
import type { TechnicalSnapshot } from './technical';

export type SetupType =
  | 'pullback'
  | 'breakout'
  | 'retest'
  | 'maRecovery'
  | 'relativeStrength'
  | 'valueImproving'
  | 'reversal';

export const SETUP_LABELS: Record<SetupType, string> = {
  pullback: 'Pullback to support in an uptrend',
  breakout: 'Breakout above resistance',
  retest: 'Breakout retest',
  maRecovery: 'Recovery above key moving average',
  relativeStrength: 'Improving relative strength',
  valueImproving: 'Attractive valuation + improving technicals',
  reversal: 'Potential reversal after decline (higher risk)',
};

export interface Target {
  low: number;
  high: number;
  label: string;
}

export interface Setup {
  type: SetupType;
  label: string;
  risk: 'standard' | 'higher';
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  targets: Target[];
  upsidePct: number;
  downsidePct: number;
  rewardRisk: number;
  atrContext: string;
  confirmation: string[];
  reasonsFor: string[];
  reasonsAgainst: string[];
  cancelIf: string[];
  /** 0–100 internal ranking of setup quality. */
  quality: number;
  priceInEntryZone: boolean;
}

export interface SetupResult {
  best: Setup | null;
  candidates: Setup[];
  status: 'setup' | 'no clear setup';
  summary: string;
  warnings: string[];
}

const f2 = (n: number) => `$${n.toFixed(2)}`;

interface Ctx {
  bars: Bar[];
  snap: TechnicalSnapshot;
  atr: number;
  close: number;
  zones: LevelZone[];
  valuationScore: number | null;
}

function build(
  ctx: Ctx,
  type: SetupType,
  entryLow: number,
  entryHigh: number,
  invalidation: number,
  extra: { confirmation: string[]; reasonsFor: string[]; reasonsAgainst?: string[]; cancelIf: string[]; baseQuality: number; risk?: 'standard' | 'higher' },
): Setup | null {
  const { atr, close, zones } = ctx;
  if (!(entryHigh > entryLow) || !(invalidation < entryLow)) return null;
  const entryMid = (entryLow + entryHigh) / 2;
  const targets: Target[] = [];
  let res = nearestResistance(zones, entryHigh + atr * 0.5);
  while (res && targets.length < 2) {
    targets.push({ low: res.low, high: res.high, label: `Resistance zone (${res.touches} touches, strength ${res.strength})` });
    res = nearestResistance(zones, res.high + atr * 0.5);
  }
  const high52 = ctx.snap.indicators.high52w;
  if (!targets.length && high52 > entryHigh + atr) targets.push({ low: high52 - atr * 0.5, high: high52, label: '52-week high' });
  if (!targets.length) {
    // No overhead supply: measured move equal to the recent 3-month range height, labelled as a projection.
    const recent = ctx.bars.slice(-63);
    const range = Math.max(...recent.map((b) => b.high)) - Math.min(...recent.map((b) => b.low));
    targets.push({ low: entryMid + range * 0.8, high: entryMid + range, label: 'Measured-move projection (no overhead resistance; less reliable)' });
  }
  const t1 = targets[0].low;
  const upsidePct = ((t1 - entryMid) / entryMid) * 100;
  const downsidePct = ((entryMid - invalidation) / entryMid) * 100;
  if (upsidePct <= 0 || downsidePct <= 0) return null;
  const rewardRisk = upsidePct / downsidePct;
  const reasonsAgainst = [...(extra.reasonsAgainst ?? [])];
  if (rewardRisk < 1.5) reasonsAgainst.push(`Reward/risk to first target is only ${rewardRisk.toFixed(1)}:1`);
  if (downsidePct > 12) reasonsAgainst.push(`Distance to invalidation is wide (${downsidePct.toFixed(1)}%), requiring a smaller position`);
  const stopAtr = (entryMid - invalidation) / atr;
  return {
    type,
    label: SETUP_LABELS[type],
    risk: extra.risk ?? 'standard',
    entryLow,
    entryHigh,
    invalidation,
    targets,
    upsidePct,
    downsidePct,
    rewardRisk,
    atrContext: `ATR(14) ${f2(atr)} (${((atr / close) * 100).toFixed(1)}% of price); invalidation is ${stopAtr.toFixed(1)}× ATR below the entry midpoint.`,
    confirmation: extra.confirmation,
    reasonsFor: extra.reasonsFor,
    reasonsAgainst,
    cancelIf: extra.cancelIf,
    quality: Math.round(Math.max(0, Math.min(100, extra.baseQuality + Math.min(rewardRisk, 4) * 6 - reasonsAgainst.length * 6))),
    priceInEntryZone: close >= entryLow && close <= entryHigh,
  };
}

export function detectSetups(bars: Bar[], snap: TechnicalSnapshot, valuationScore: number | null = null): SetupResult {
  const warnings: string[] = [];
  const atr = snap.indicators.atr14;
  if (!atr || bars.length < 200) {
    return { best: null, candidates: [], status: 'no clear setup', summary: 'No clear setup — fewer than 200 daily bars, so trend and levels are unreliable.', warnings };
  }
  const close = snap.close;
  const zones = snap.levels.zones;
  const ctx: Ctx = { bars, snap, atr, close, zones, valuationScore };
  const { sma50, sma200, rsi14, macdHist, macdHistPrev } = snap.indicators;
  const up = snap.dailyTrend.score >= 0.5;
  const weeklyUp = snap.weeklyTrend.score >= 0.5;
  const down = snap.dailyTrend.score <= -0.5;
  const avgVol = snap.indicators.avgVolume50;
  const volRatio = avgVol ? bars[bars.length - 1].volume / avgVol : null;
  const out: Setup[] = [];

  // Contextual warnings — RSI is interpreted with trend, never alone.
  if (snap.flags.extended) warnings.push(`Extended: price is more than 4 ATR above the 50-day SMA; chasing here worsens reward/risk.`);
  if (snap.flags.overbought && up) warnings.push('RSI ≥ 70 in an uptrend: strong momentum, but entries are better on pullbacks. Not by itself a sell signal.');
  if (snap.flags.oversold && down) warnings.push('RSI ≤ 30 in a downtrend: weakness can persist; oversold alone is not a buy signal.');

  const commonAgainst: string[] = [];
  if (snap.flags.extended) commonAgainst.push('Price extended above the 50-day SMA');
  if (snap.weeklyTrend.score <= -0.5) commonAgainst.push(`Weekly trend is ${snap.weeklyTrend.state}`);
  if (snap.relativeStrength.vsBenchmark6m !== null && snap.relativeStrength.vsBenchmark6m < -10) commonAgainst.push(`Lagging the benchmark by ${Math.abs(snap.relativeStrength.vsBenchmark6m).toFixed(0)} pts over 6 months`);
  if (valuationScore !== null && valuationScore < 30) commonAgainst.push('Valuation looks stretched versus the estimates on this page');

  const support = snap.nearestSupport;
  const testing = zones.filter((z) => z.role === 'testing');

  // 1. Pullback toward support in an established uptrend.
  if (up && sma200 && close > sma200) {
    const zone = testing[0] ?? support;
    const anchor = zone && close - zone.high <= 1.5 * atr ? zone : null;
    const maAnchor = !anchor && sma50 && close >= sma50 && close - sma50 <= 1.2 * atr ? sma50 : null;
    if ((anchor || maAnchor) && (rsi14 === null || rsi14 < 62)) {
      const entryLow = anchor ? anchor.low : (maAnchor as number) - 0.3 * atr;
      const entryHigh = anchor ? anchor.high + 0.5 * atr : (maAnchor as number) + 0.5 * atr;
      const s = build(ctx, 'pullback', entryLow, entryHigh, entryLow - 0.75 * atr, {
        baseQuality: 50 + (weeklyUp ? 10 : 0) + (anchor ? Math.min(anchor.strength, 60) / 6 : 0),
        confirmation: ['A daily close holding above the entry zone after a test of it', 'Ideally a bullish reversal bar or MACD histogram turning up', weeklyUp ? 'Weekly trend already up — keep it that way on a weekly close' : 'Weekly close back above the 10-week SMA'],
        reasonsFor: [
          `Daily trend: ${snap.dailyTrend.state}`,
          anchor ? `Pulling back into a support zone ${f2(anchor.low)}–${f2(anchor.high)} (${anchor.touches} touches)` : `Pulling back toward the rising 50-day SMA (${f2(sma50!)})`,
          rsi14 !== null ? `RSI ${rsi14.toFixed(0)} — momentum has cooled without breaking down` : 'RSI unavailable',
        ],
        reasonsAgainst: [...commonAgainst],
        cancelIf: [`Daily close below ${f2(entryLow - 0.75 * atr)}`, 'Close below the 200-day SMA', 'Weekly close below the 40-week SMA'],
      });
      if (s) out.push(s);
    }
  }

  // 2. Breakout above resistance (recent close above a multi-touch zone, not yet far away).
  for (const z of zones) {
    if (z.touches < 2 || z.role !== 'support') continue;
    const brokeRecently = bars.slice(-5).some((b, i, arr) => b.close > z.high && (i === 0 ? bars[bars.length - 6].close <= z.high : arr[i - 1].close <= z.high));
    if (!brokeRecently || close - z.high > 1.5 * atr) continue;
    const s = build(ctx, 'breakout', z.high, z.high + 1.0 * atr, z.low - 0.25 * atr, {
      baseQuality: 55 + (volRatio && volRatio >= 1.3 ? 10 : 0) + (weeklyUp ? 5 : 0),
      confirmation: ['Second consecutive daily close above the zone', volRatio && volRatio >= 1.3 ? `Breakout volume ${volRatio.toFixed(1)}× average — keep watching for follow-through` : 'Breakout volume at least 1.3× the 50-day average (not yet seen)', 'Weekly close above the zone'],
      reasonsFor: [`Closed above resistance ${f2(z.low)}–${f2(z.high)} that capped price ${z.touches} times`, ...z.evidence.slice(1, 3)],
      reasonsAgainst: [...commonAgainst, ...(volRatio !== null && volRatio < 1 ? ['Breakout on below-average volume'] : [])],
      cancelIf: [`Daily close back below ${f2(z.low)} (failed breakout)`],
    });
    if (s) out.push(s);
    break;
  }

  // 3. Breakout followed by a retest: zone broken 5–40 bars ago, price back near it and holding.
  for (const z of zones) {
    if (z.touches < 2) continue;
    if (!(close >= z.low && close - z.high <= 0.75 * atr)) continue;
    const window = bars.slice(-45, -5);
    const brokeEarlier = window.some((b) => b.close > z.high + 0.5 * atr);
    const priorBelow = bars.slice(-90, -45).some((b) => b.close < z.low);
    if (!brokeEarlier || !priorBelow) continue;
    const s = build(ctx, 'retest', z.low, z.high + 0.3 * atr, z.low - 0.6 * atr, {
      baseQuality: 60 + (z.roleReversal ? 8 : 0),
      confirmation: ['A close back above the zone after holding it', 'Lower volume on the pullback than on the breakout'],
      reasonsFor: [`Former resistance ${f2(z.low)}–${f2(z.high)} broke within the last ~2 months`, 'Price has returned to test it from above', ...(z.roleReversal ? ['Zone already shows role reversal'] : [])],
      reasonsAgainst: [...commonAgainst],
      cancelIf: [`Daily close below ${f2(z.low - 0.6 * atr)} — breakout failed`],
    });
    if (s) out.push(s);
    break;
  }

  // 4. Recovery above an important moving average.
  {
    const closes = bars.map((b) => b.close);
    for (const p of [50, 200]) {
      const ma = sma(closes, p);
      const n = closes.length;
      const crossedIdx = [...Array(5).keys()].map((k) => n - 1 - k).find((i) => ma[i] !== null && ma[i - 1] !== null && closes[i] > (ma[i] as number) && closes[i - 1] <= (ma[i - 1] as number));
      if (crossedIdx === undefined || ma[n - 1] === null || closes[n - 1] < (ma[n - 1] as number)) continue;
      const below = closes.slice(-35, -5).filter((c, j) => {
        const v = ma[n - 35 + j];
        return v !== null && c < v;
      }).length;
      if (below < 15) continue;
      const recentLow = Math.min(...bars.slice(-20).map((b) => b.low));
      const maV = ma[n - 1] as number;
      const s = build(ctx, 'maRecovery', maV - 0.25 * atr, maV + 0.75 * atr, Math.min(recentLow, maV - atr) - 0.25 * atr, {
        baseQuality: 45 + (p === 200 ? 8 : 0) + (macdHist !== null && macdHist > 0 ? 7 : 0),
        risk: down ? 'higher' : 'standard',
        confirmation: [`Two or more daily closes above the ${p}-day SMA`, `The ${p}-day SMA flattening or turning up`, 'MACD above its signal line'],
        reasonsFor: [`Reclaimed the ${p}-day SMA after ${below} of 30 sessions below it`, ...(macdHist !== null && macdHist > 0 ? ['MACD histogram positive'] : [])],
        reasonsAgainst: [...commonAgainst, ...(down ? ['Broader daily trend still down — recoveries often fail'] : [])],
        cancelIf: [`Close back below the ${p}-day SMA for 3 sessions`, `Close below the recent low ${f2(recentLow)}`],
      });
      if (s) out.push(s);
      break;
    }
  }

  // 5. Improving relative strength with a constructive price structure.
  if (snap.relativeStrength.rsLineAt3mHigh && snap.relativeStrength.rsImproving && sma50 && close > sma50 && !snap.flags.extended && support) {
    const s = build(ctx, 'relativeStrength', Math.max(support.high, close - atr), close + 0.25 * atr, support.low - 0.5 * atr, {
      baseQuality: 50 + (weeklyUp ? 8 : 0),
      confirmation: ['RS line holding near its 3-month high', 'Price holding above the 50-day SMA on pullbacks'],
      reasonsFor: ['Relative-strength line vs the benchmark at a 3-month high', ...(snap.relativeStrength.vsBenchmark3m !== null ? [`Outperformed the benchmark by ${snap.relativeStrength.vsBenchmark3m.toFixed(1)} pts over 3 months`] : [])],
      reasonsAgainst: [...commonAgainst],
      cancelIf: [`Close below support ${f2(support.low)}`, 'RS line drops below its 50-day average'],
    });
    if (s) out.push(s);
  }

  // 6. Attractive valuation combined with improving technicals.
  if (valuationScore !== null && valuationScore >= 65 && support) {
    const improving = (macdHist !== null && macdHistPrev !== null && macdHist > macdHistPrev && macdHist > 0) || (sma50 !== null && close > sma50);
    if (improving) {
      const s = build(ctx, 'valueImproving', support.high, support.high + atr, support.low - 0.5 * atr, {
        baseQuality: 45 + (valuationScore - 65) / 2,
        risk: down ? 'higher' : 'standard',
        confirmation: ['Price holding above support on a weekly close', 'MACD histogram staying positive'],
        reasonsFor: [`Valuation score ${valuationScore}/100 (estimate — see assumptions)`, sma50 !== null && close > sma50 ? 'Price above the 50-day SMA' : 'MACD momentum improving'],
        reasonsAgainst: [...commonAgainst, ...(down ? ['Daily trend still down — value can stay cheap'] : [])],
        cancelIf: [`Close below ${f2(support.low)}`, 'Fundamentals deteriorate in the next report'],
      });
      if (s) out.push(s);
    }
  }

  // 7. Potential reversal after a prolonged decline — explicitly higher risk.
  if (sma200 && close < sma200 && close < snap.indicators.high52w * 0.75) {
    const closes = bars.map((b) => b.close);
    const r = rsi(closes, 14);
    const m = macd(closes).histogram;
    const n = closes.length;
    // Bullish divergence: price lower low in last 20 bars vs prior 20–60, RSI higher low.
    const lowA = Math.min(...closes.slice(-60, -20));
    const lowB = Math.min(...closes.slice(-20));
    const rsiA = Math.min(...(r.slice(-60, -20).filter((v) => v !== null) as number[]));
    const rsiB = Math.min(...(r.slice(-20).filter((v) => v !== null) as number[]));
    const divergence = lowB < lowA && rsiB > rsiA + 3;
    const macdTurn = m[n - 1] !== null && m[n - 2] !== null && (m[n - 1] as number) > 0 && (m[n - 2] as number) <= 0;
    const s20 = sma(closes, 20);
    const aboveS20 = s20[n - 1] !== null && closes[n - 1] > (s20[n - 1] as number);
    if ((divergence || macdTurn) && aboveS20) {
      const swingLow = Math.min(...bars.slice(-20).map((b) => b.low));
      const s = build(ctx, 'reversal', close - 0.5 * atr, close + 0.25 * atr, swingLow - 0.5 * atr, {
        baseQuality: 30,
        risk: 'higher',
        confirmation: ['A higher low on the daily chart', 'Weekly close above the 10-week SMA', 'Reclaim of the 50-day SMA'],
        reasonsFor: [divergence ? 'Bullish RSI divergence: lower price low with a higher RSI low' : 'MACD histogram turned positive', `Down ${(100 - (close / snap.indicators.high52w) * 100).toFixed(0)}% from the 52-week high`],
        reasonsAgainst: [...commonAgainst, 'Counter-trend: price below a falling 200-day SMA', 'Most reversal attempts in downtrends fail'],
        cancelIf: [`Close below the recent swing low ${f2(swingLow)}`],
      });
      if (s) out.push(s);
    }
  }

  const candidates = out.sort((a, b) => b.quality - a.quality);
  const viable = candidates.filter((s) => s.rewardRisk >= 1.2 && s.quality >= 40);
  const best = viable[0] ?? null;
  return {
    best,
    candidates,
    status: best ? 'setup' : 'no clear setup',
    summary: best
      ? `${best.label}: entry ${f2(best.entryLow)}–${f2(best.entryHigh)}, invalidation ${f2(best.invalidation)}, first target ${f2(best.targets[0].low)} (≈${best.rewardRisk.toFixed(1)}:1).`
      : candidates.length
        ? 'No clear setup — candidate setups exist but reward/risk or evidence is insufficient.'
        : 'No clear setup — current conditions do not match any defined entry pattern.',
    warnings,
  };
}
