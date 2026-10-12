/**
 * Opportunity score (0–100). A screening and comparison tool — NOT a probability of profit.
 *
 * score = Σ weight_c × adjusted_c, where each component c is normalized to 0–100 and
 * adjusted_c = completeness_c × raw_c + (1 − completeness_c) × MISSING_SCORE.
 * Missing information is therefore pulled toward a deliberately unfavourable value (default 25),
 * never toward neutral or favourable. Data completeness is reported alongside the score.
 */
import type { FundamentalMetrics } from '../analysis/fundamentals';
import type { SetupResult } from '../analysis/setups';
import type { TechnicalSnapshot } from '../analysis/technical';
import type { ValuationResult } from '../analysis/valuation';
import { scale } from '../analysis/fundamentals';

export type ComponentKey = 'technical' | 'quality' | 'valuation' | 'growth' | 'momentum' | 'riskReward';

export const DEFAULT_WEIGHTS: Record<ComponentKey, number> = {
  technical: 25,
  quality: 20,
  valuation: 20,
  growth: 15,
  momentum: 10,
  riskReward: 10,
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  technical: 'Technical setup',
  quality: 'Fundamental quality',
  valuation: 'Valuation',
  growth: 'Growth',
  momentum: 'Momentum & relative strength',
  riskReward: 'Risk/reward',
};

export const MISSING_SCORE = 25;

export interface ComponentScore {
  key: ComponentKey;
  label: string;
  weight: number;
  raw: number | null;
  completeness: number;
  adjusted: number;
  contribution: number;
  reasons: string[];
}

export interface OpportunityScore {
  total: number;
  components: ComponentScore[];
  completeness: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

export function technicalComponent(snap: TechnicalSnapshot | null, setups: SetupResult | null): { raw: number | null; completeness: number; reasons: string[] } {
  if (!snap) return { raw: null, completeness: 0, reasons: ['No price history'] };
  const reasons: string[] = [];
  // Trend structure (daily 60%, weekly 40%) mapped from −2..+2 → 0..100.
  const trend = ((snap.dailyTrend.score + 2) / 4) * 60 + ((snap.weeklyTrend.score + 2) / 4) * 40;
  reasons.push(`Trend structure ${Math.round(trend)}/100 (daily ${snap.dailyTrend.state}, weekly ${snap.weeklyTrend.state})`);
  let raw = trend * 0.5;
  if (setups?.best) {
    raw += setups.best.quality * 0.5;
    reasons.push(`Best setup "${setups.best.label}" quality ${setups.best.quality}/100`);
  } else {
    raw += 15;
    reasons.push('No clear setup (setup half scored 30/100)');
  }
  if (snap.flags.extended) {
    raw -= 10;
    reasons.push('−10: extended above the 50-day SMA');
  }
  const completeness = snap.barsAvailable >= 252 ? 1 : snap.barsAvailable >= 200 ? 0.8 : 0.4;
  if (completeness < 1) reasons.push(`Only ${snap.barsAvailable} daily bars available`);
  return { raw: Math.max(0, Math.min(100, Math.round(raw))), completeness, reasons };
}

export function momentumComponent(snap: TechnicalSnapshot | null): { raw: number | null; completeness: number; reasons: string[] } {
  if (!snap) return { raw: null, completeness: 0, reasons: ['No price history'] };
  const parts: number[] = [];
  const reasons: string[] = [];
  const rs = snap.relativeStrength;
  let avail = 0;
  if (rs.vsBenchmark3m !== null) { parts.push(scale(rs.vsBenchmark3m, -15, 15)); avail++; reasons.push(`3-month return vs benchmark ${rs.vsBenchmark3m.toFixed(1)} pts`); }
  if (rs.vsBenchmark6m !== null) { parts.push(scale(rs.vsBenchmark6m, -20, 20)); avail++; reasons.push(`6-month return vs benchmark ${rs.vsBenchmark6m.toFixed(1)} pts`); }
  if (snap.indicators.roc63 !== null) { parts.push(scale(snap.indicators.roc63, -15, 25)); avail++; reasons.push(`63-day rate of change ${snap.indicators.roc63.toFixed(1)}%`); }
  if (snap.indicators.macdHist !== null) { parts.push(snap.indicators.macdHist > 0 ? 70 : 35); avail++; reasons.push(`MACD histogram ${snap.indicators.macdHist > 0 ? 'positive' : 'negative'}`); }
  if (rs.vsBenchmark3m === null) reasons.push('Benchmark comparison unavailable');
  if (!parts.length) return { raw: null, completeness: 0, reasons };
  let raw = parts.reduce((a, b) => a + b, 0) / parts.length;
  if (snap.indicators.rsi14 !== null && snap.indicators.rsi14 > 78) { raw -= 10; reasons.push('−10: RSI above 78 (stretched)'); }
  return { raw: Math.round(Math.max(0, Math.min(100, raw))), completeness: avail / 4, reasons };
}

export function riskRewardComponent(setups: SetupResult | null): { raw: number | null; completeness: number; reasons: string[] } {
  const s = setups?.best;
  if (!s) return { raw: null, completeness: 0, reasons: ['No setup → no defined entry, invalidation and target'] };
  const raw = scale(s.rewardRisk, 0.5, 4);
  return { raw, completeness: 1, reasons: [`Reward/risk ${s.rewardRisk.toFixed(2)}:1 to first target (0.5→0, 4.0→100)`] };
}

export function computeOpportunityScore(
  input: { snap: TechnicalSnapshot | null; setups: SetupResult | null; fundamentals: FundamentalMetrics | null; valuation: ValuationResult | null },
  weights: Record<ComponentKey, number> = DEFAULT_WEIGHTS,
): OpportunityScore {
  const fm = input.fundamentals;
  const comps: Record<ComponentKey, { raw: number | null; completeness: number; reasons: string[] }> = {
    technical: technicalComponent(input.snap, input.setups),
    quality: fm ? { raw: fm.qualityScore, completeness: fm.qualityCompleteness, reasons: fm.qualityReasons } : { raw: null, completeness: 0, reasons: ['Fundamentals unavailable'] },
    valuation: input.valuation?.score !== null && input.valuation?.score !== undefined
      ? { raw: input.valuation.score, completeness: Math.min(1, input.valuation.methods.filter((m) => m.suitable).length / 2), reasons: [`${input.valuation.assessment}; base-case upside ${input.valuation.upsideToBase?.toFixed(1)}%`, `${input.valuation.methods.filter((m) => m.suitable).length} suitable method(s)`] }
      : { raw: null, completeness: 0, reasons: ['No suitable valuation method'] },
    growth: fm ? { raw: fm.growthScore, completeness: fm.growthCompleteness, reasons: fm.growthReasons } : { raw: null, completeness: 0, reasons: ['Fundamentals unavailable'] },
    momentum: momentumComponent(input.snap),
    riskReward: riskRewardComponent(input.setups),
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const components: ComponentScore[] = (Object.keys(comps) as ComponentKey[]).map((key) => {
    const c = comps[key];
    const completeness = c.raw === null ? 0 : c.completeness;
    const adjusted = c.raw === null ? MISSING_SCORE : completeness * c.raw + (1 - completeness) * MISSING_SCORE;
    const w = weights[key] / totalWeight;
    return { key, label: COMPONENT_LABELS[key], weight: weights[key], raw: c.raw, completeness, adjusted: Math.round(adjusted), contribution: adjusted * w, reasons: c.reasons };
  });
  const total = Math.round(components.reduce((s, c) => s + c.contribution, 0));
  const completeness = components.reduce((s, c) => s + c.completeness * (c.weight / totalWeight), 0);
  const notes: string[] = [];
  const missing = components.filter((c) => c.raw === null).map((c) => c.label);
  if (missing.length) notes.push(`Missing: ${missing.join(', ')} — scored at ${MISSING_SCORE}/100, which lowers the total.`);
  return {
    total,
    components,
    completeness,
    confidence: completeness >= 0.8 ? 'high' : completeness >= 0.5 ? 'medium' : 'low',
    notes,
  };
}

/** Recompute a total from missing-adjusted component scores with custom weights. */
export function reweight(components: Record<ComponentKey, number>, weights: Record<ComponentKey, number>): number {
  const keys = Object.keys(DEFAULT_WEIGHTS) as ComponentKey[];
  const total = keys.reduce((s, k) => s + Math.max(0, weights[k] ?? 0), 0);
  if (total <= 0) return 0;
  return Math.round(keys.reduce((s, k) => s + (components[k] ?? MISSING_SCORE) * Math.max(0, weights[k] ?? 0), 0) / total);
}
