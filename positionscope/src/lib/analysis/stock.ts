/** Combines price, technical, fundamental and valuation analysis for one stock (pure, testable). */
import type { Bar, CompanyInfo, DataMeta, Fundamentals } from '../types';
import { computeFundamentalMetrics, type FundamentalMetrics } from './fundamentals';
import { detectSetups, type SetupResult } from './setups';
import { analyzeTechnical, type TechnicalSnapshot } from './technical';
import { computeValuation, type PeerMedians, type ValuationResult } from './valuation';
import { computeOpportunityScore, DEFAULT_WEIGHTS, type ComponentKey, type OpportunityScore } from '../scoring/score';

export interface StockAnalysis {
  info: CompanyInfo;
  priceMeta: DataMeta;
  technical: TechnicalSnapshot | null;
  setups: SetupResult | null;
  fundamentals: Fundamentals | null;
  fundamentalMetrics: FundamentalMetrics;
  valuation: ValuationResult;
  score: OpportunityScore;
  nextEarningsDate: string | null;
  completeness: { price: boolean; benchmark: boolean; fundamentals: number; valuation: boolean };
}

export function buildStockAnalysis(args: {
  info: CompanyInfo;
  bars: Bar[];
  priceMeta: DataMeta;
  benchmark: Bar[];
  fundamentals: Fundamentals | null;
  peers?: PeerMedians | null;
  weights?: Record<ComponentKey, number>;
}): StockAnalysis {
  const { bars, benchmark, fundamentals } = args;
  const technical = analyzeTechnical(bars, benchmark);
  const price = technical?.close ?? null;
  const fundamentalMetrics = computeFundamentalMetrics(fundamentals, price);
  const valuation = computeValuation(fundamentals, fundamentalMetrics, bars, args.peers ?? null, args.info.sector);
  const setups = technical ? detectSetups(bars, technical, valuation.score) : null;
  const score = computeOpportunityScore({ snap: technical, setups, fundamentals: fundamentals ? fundamentalMetrics : null, valuation }, args.weights ?? DEFAULT_WEIGHTS);
  return {
    info: args.info,
    priceMeta: args.priceMeta,
    technical,
    setups,
    fundamentals,
    fundamentalMetrics,
    valuation,
    score,
    nextEarningsDate: fundamentals?.nextEarningsDate ?? null,
    completeness: {
      price: bars.length >= 252,
      benchmark: benchmark.length > 0,
      fundamentals: fundamentals ? (fundamentalMetrics.qualityCompleteness + fundamentalMetrics.growthCompleteness) / 2 : 0,
      valuation: valuation.methods.some((m) => m.suitable),
    },
  };
}

/** Compact row for the scanner and dashboard. */
export interface ScanRow {
  symbol: string;
  name: string;
  sector: string;
  demo: boolean;
  price: number | null;
  asOf: string | null;
  change1d: number | null;
  change5d: number | null;
  dailyTrend: string;
  weeklyTrend: string;
  dailyTrendScore: number;
  score: number;
  /** Missing-adjusted component scores, so the client can re-weight without refetching. */
  components: Record<ComponentKey, number>;
  confidence: OpportunityScore['confidence'];
  completeness: number;
  qualityScore: number | null;
  valuationAssessment: ValuationResult['assessment'];
  valuationScore: number | null;
  upsideToFair: number | null;
  rsVs3m: number | null;
  marketCap: number | null;
  pe: number | null;
  ps: number | null;
  evEbitda: number | null;
  setup: string | null;
  setupType: string | null;
  setupRisk: 'standard' | 'higher' | null;
  entryLow: number | null;
  entryHigh: number | null;
  invalidation: number | null;
  target: number | null;
  upsidePct: number | null;
  downsidePct: number | null;
  rewardRisk: number | null;
  inEntryZone: boolean;
  support: [number, number] | null;
  resistance: [number, number] | null;
  rsi: number | null;
  macdHist: number | null;
  macdHistPrev: number | null;
  sma50: number | null;
  atr: number | null;
  weeklyConfirmed: boolean;
  latestFiscalYear: number | null;
  flags: TechnicalSnapshot['flags'] | null;
  nextEarningsDate: string | null;
  dataKind: DataMeta['kind'];
  stale: boolean;
  fundamentalsAvailable: boolean;
  error?: string;
}

export function toScanRow(a: StockAnalysis): ScanRow {
  const t = a.technical;
  const best = a.setups?.best ?? null;
  const m = a.fundamentalMetrics.metrics;
  return {
    symbol: a.info.symbol,
    name: a.info.name,
    sector: a.info.sector,
    demo: !!a.info.demo,
    price: t?.close ?? null,
    asOf: t?.asOf ?? null,
    change1d: t?.change1d ?? null,
    change5d: t?.change5d ?? null,
    dailyTrend: t?.dailyTrend.state ?? 'insufficient data',
    weeklyTrend: t?.weeklyTrend.state ?? 'insufficient data',
    dailyTrendScore: t?.dailyTrend.score ?? 0,
    score: a.score.total,
    components: Object.fromEntries(a.score.components.map((c) => [c.key, c.adjusted])) as Record<ComponentKey, number>,
    confidence: a.score.confidence,
    completeness: a.score.completeness,
    qualityScore: a.fundamentalMetrics.qualityScore,
    valuationAssessment: a.valuation.assessment,
    valuationScore: a.valuation.score,
    upsideToFair: a.valuation.upsideToBase,
    rsVs3m: t?.relativeStrength.vsBenchmark3m ?? null,
    marketCap: a.fundamentalMetrics.marketCap,
    pe: m.pe.value,
    ps: m.ps.value,
    evEbitda: m.evEbitda.value,
    setup: best?.label ?? null,
    setupType: best?.type ?? null,
    setupRisk: best?.risk ?? null,
    entryLow: best?.entryLow ?? null,
    entryHigh: best?.entryHigh ?? null,
    invalidation: best?.invalidation ?? null,
    target: best?.targets[0]?.low ?? null,
    upsidePct: best?.upsidePct ?? null,
    downsidePct: best?.downsidePct ?? null,
    rewardRisk: best?.rewardRisk ?? null,
    inEntryZone: best?.priceInEntryZone ?? false,
    support: t?.nearestSupport ? [t.nearestSupport.low, t.nearestSupport.high] : null,
    resistance: t?.nearestResistance ? [t.nearestResistance.low, t.nearestResistance.high] : null,
    rsi: t?.indicators.rsi14 ?? null,
    macdHist: t?.indicators.macdHist ?? null,
    macdHistPrev: t?.indicators.macdHistPrev ?? null,
    sma50: t?.indicators.sma50 ?? null,
    atr: t?.indicators.atr14 ?? null,
    weeklyConfirmed: t?.weeklyConfirmed ?? false,
    latestFiscalYear: a.fundamentalMetrics.latestFiscalYear,
    flags: t?.flags ?? null,
    nextEarningsDate: a.nextEarningsDate,
    dataKind: a.priceMeta.kind,
    stale: a.priceMeta.stale,
    fundamentalsAvailable: !!a.fundamentals,
  };
}

export function peerMediansFor(rows: ScanRow[], sector: string, exclude: string): PeerMedians | null {
  const peers = rows.filter((r) => r.sector === sector && r.symbol !== exclude);
  if (!peers.length) return null;
  const med = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null && x > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  return { group: sector, count: peers.filter((p) => p.pe !== null).length, pe: med(peers.map((p) => p.pe)), ps: med(peers.map((p) => p.ps)), evEbitda: med(peers.map((p) => p.evEbitda)) };
}
