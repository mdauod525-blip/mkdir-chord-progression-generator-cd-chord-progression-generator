/**
 * Technical snapshot of one stock at its latest bar. `analyzeAsOf` slices the input to a past date,
 * which is how historical signals are produced without look-ahead.
 */
import type { Bar } from '../types';
import { atr, bollinger, ema, lastValue, macd, periodReturn, relativeStrengthLine, roc, rsi, sma, toWeekly, valueAgo } from '../indicators';
import { detectLevels, nearestResistance, nearestSupport, type LevelsResult, type LevelZone } from './levels';

export type TrendState = 'strong uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong downtrend' | 'insufficient data';

export interface TrendInfo {
  state: TrendState;
  /** -2..+2 */
  score: number;
  reasons: string[];
}

export interface TechnicalSnapshot {
  asOf: string;
  close: number;
  change1d: number | null;
  change5d: number | null;
  dailyTrend: TrendInfo;
  weeklyTrend: TrendInfo;
  weeklyConfirmed: boolean;
  indicators: {
    sma20: number | null;
    sma50: number | null;
    sma100: number | null;
    sma200: number | null;
    ema20: number | null;
    ema50: number | null;
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    macdHistPrev: number | null;
    roc20: number | null;
    roc63: number | null;
    atr14: number | null;
    atrPct: number | null;
    bbUpper: number | null;
    bbLower: number | null;
    volume: number;
    avgVolume50: number | null;
    high52w: number;
    low52w: number;
  };
  relativeStrength: {
    vsBenchmark3m: number | null;
    vsBenchmark6m: number | null;
    vsBenchmark12m: number | null;
    rsLineAt3mHigh: boolean;
    rsImproving: boolean | null;
  };
  levels: LevelsResult;
  nearestSupport: LevelZone | null;
  nearestResistance: LevelZone | null;
  flags: {
    nearSupport: boolean;
    nearResistance: boolean;
    breakout: boolean;
    breakdown: boolean;
    extended: boolean;
    overbought: boolean;
    oversold: boolean;
    unusualVolume: boolean;
  };
  barsAvailable: number;
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;

export function classifyDailyTrend(closes: number[]): TrendInfo {
  if (closes.length < 200) return { state: 'insufficient data', score: 0, reasons: [`Only ${closes.length} daily bars; 200 needed for the 200-day average.`] };
  const c = closes[closes.length - 1];
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const m50 = valueAgo(s50, 0) as number;
  const m200 = valueAgo(s200, 0) as number;
  const m50prev = valueAgo(s50, 20) as number;
  const m200prev = valueAgo(s200, 20) as number;
  let score = 0;
  const reasons: string[] = [];
  if (c > m200) { score++; reasons.push('Close above the 200-day SMA'); } else { score--; reasons.push('Close below the 200-day SMA'); }
  if (m50 > m200) { score++; reasons.push('50-day SMA above 200-day SMA'); } else { score--; reasons.push('50-day SMA below 200-day SMA'); }
  if (m50 > m50prev) { score++; reasons.push('50-day SMA rising over 20 sessions'); } else { score--; reasons.push('50-day SMA falling over 20 sessions'); }
  if (m200 > m200prev) score += 0.5; else score -= 0.5;
  if (c > m50) score += 0.5; else score -= 0.5;
  return { state: stateFromScore(score / 2), score: clamp(score / 2, -2, 2), reasons };
}

export function classifyWeeklyTrend(weeklyCloses: number[]): TrendInfo {
  if (weeklyCloses.length < 40) return { state: 'insufficient data', score: 0, reasons: [`Only ${weeklyCloses.length} weekly bars; 40 needed.`] };
  const c = weeklyCloses[weeklyCloses.length - 1];
  const s10 = sma(weeklyCloses, 10);
  const s40 = sma(weeklyCloses, 40);
  const m10 = valueAgo(s10, 0) as number;
  const m40 = valueAgo(s40, 0) as number;
  const m40prev = valueAgo(s40, 4) as number;
  let score = 0;
  const reasons: string[] = [];
  if (c > m40) { score++; reasons.push('Weekly close above 40-week SMA'); } else { score--; reasons.push('Weekly close below 40-week SMA'); }
  if (m10 > m40) { score++; reasons.push('10-week SMA above 40-week SMA'); } else { score--; reasons.push('10-week SMA below 40-week SMA'); }
  if (m40 > m40prev) { score++; reasons.push('40-week SMA rising'); } else { score--; reasons.push('40-week SMA falling'); }
  if (c > m10) score += 0.5; else score -= 0.5;
  return { state: stateFromScore(score / 1.75), score: clamp(score / 1.75, -2, 2), reasons };
}

function stateFromScore(s: number): TrendState {
  if (s >= 1.5) return 'strong uptrend';
  if (s >= 0.5) return 'uptrend';
  if (s > -0.5) return 'sideways';
  if (s > -1.5) return 'downtrend';
  return 'strong downtrend';
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function analyzeTechnical(daily: Bar[], benchmark: Bar[] = []): TechnicalSnapshot | null {
  if (daily.length < 30) return null;
  const closes = daily.map((b) => b.close);
  const lastBar = daily[daily.length - 1];
  const close = lastBar.close;
  const { bars: weekly, lastWeekComplete } = toWeekly(daily);
  const weeklyCloses = weekly.map((b) => b.close);
  // Weekly trend uses only completed weeks so a partial week does not change the weekly signal.
  const confirmedWeekly = lastWeekComplete ? weeklyCloses : weeklyCloses.slice(0, -1);

  const atrS = atr(daily, 14);
  const atr14 = lastValue(atrS);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const vols = daily.map((b) => b.volume);
  const avgVol50 = lastValue(sma(vols, 50));
  const rsiS = rsi(closes, 14);
  const year = daily.slice(-252);
  const high52w = Math.max(...year.map((b) => b.high));
  const low52w = Math.min(...year.map((b) => b.low));

  const levels = detectLevels(daily);
  const sup = nearestSupport(levels.zones, close);
  const res = nearestResistance(levels.zones, close);

  // Relative strength vs benchmark, using only common dates up to the analysis date.
  const benchUpTo = benchmark.filter((b) => b.time <= lastBar.time);
  const rsLine = benchUpTo.length ? relativeStrengthLine(daily, benchUpTo) : [];
  const benchCloses = benchUpTo.map((b) => b.close);
  const relRet = (n: number) => {
    const a = periodReturn(closes, n);
    const b = periodReturn(benchCloses, n);
    return a !== null && b !== null && benchUpTo.length && benchUpTo[benchUpTo.length - 1].time === lastBar.time ? a - b : null;
  };
  let rsLineAt3mHigh = false;
  let rsImproving: boolean | null = null;
  const rsVals = rsLine.filter((v): v is number => v !== null);
  if (rsVals.length > 63) {
    const lastRs = rsVals[rsVals.length - 1];
    rsLineAt3mHigh = lastRs >= Math.max(...rsVals.slice(-63)) * 0.995;
    rsImproving = lastRs > rsVals[rsVals.length - 21];
  }

  const sma20 = lastValue(sma(closes, 20));
  const sma50 = lastValue(sma(closes, 50));
  const sma200 = lastValue(sma(closes, 200));
  const rsiNow = lastValue(rsiS);
  const atrPct = atr14 !== null ? (atr14 / close) * 100 : null;

  const prevClose = closes[closes.length - 2];
  const near = (z: LevelZone | null, side: 'below' | 'above') => {
    if (!z || atr14 === null) return false;
    return side === 'below' ? close - z.high <= 1.5 * atr14 : z.low - close <= 1.5 * atr14;
  };
  // Breakout: today's close cleared a resistance zone that the prior close was below or inside.
  const brokeOut = levels.zones.some((z) => z.touches >= 2 && close > z.high && prevClose <= z.high);
  const brokeDown = levels.zones.some((z) => z.touches >= 2 && close < z.low && prevClose >= z.low);
  const extended = sma50 !== null && atr14 !== null && (close - sma50) / atr14 > 4;

  return {
    asOf: lastBar.time,
    close,
    change1d: closes.length > 1 ? pct(close, prevClose) : null,
    change5d: closes.length > 5 ? pct(close, closes[closes.length - 6]) : null,
    dailyTrend: classifyDailyTrend(closes),
    weeklyTrend: classifyWeeklyTrend(confirmedWeekly),
    weeklyConfirmed: lastWeekComplete,
    indicators: {
      sma20,
      sma50,
      sma100: lastValue(sma(closes, 100)),
      sma200,
      ema20: lastValue(ema(closes, 20)),
      ema50: lastValue(ema(closes, 50)),
      rsi14: rsiNow,
      macd: lastValue(m.macd),
      macdSignal: lastValue(m.signal),
      macdHist: lastValue(m.histogram),
      macdHistPrev: valueAgo(m.histogram, 1),
      roc20: lastValue(roc(closes, 20)),
      roc63: lastValue(roc(closes, 63)),
      atr14,
      atrPct,
      bbUpper: lastValue(bb.upper),
      bbLower: lastValue(bb.lower),
      volume: lastBar.volume,
      avgVolume50: avgVol50,
      high52w,
      low52w,
    },
    relativeStrength: {
      vsBenchmark3m: relRet(63),
      vsBenchmark6m: relRet(126),
      vsBenchmark12m: relRet(252),
      rsLineAt3mHigh,
      rsImproving,
    },
    levels,
    nearestSupport: sup,
    nearestResistance: res,
    flags: {
      nearSupport: near(sup, 'below'),
      nearResistance: near(res, 'above'),
      breakout: brokeOut,
      breakdown: brokeDown,
      extended,
      overbought: rsiNow !== null && rsiNow >= 70,
      oversold: rsiNow !== null && rsiNow <= 30,
      unusualVolume: avgVol50 !== null && avgVol50 > 0 && lastBar.volume >= 2 * avgVol50,
    },
    barsAvailable: daily.length,
  };
}

/** Analysis using only bars dated on or before `date`. */
export function analyzeAsOf(daily: Bar[], benchmark: Bar[], date: string): TechnicalSnapshot | null {
  return analyzeTechnical(
    daily.filter((b) => b.time <= date),
    benchmark.filter((b) => b.time <= date),
  );
}
