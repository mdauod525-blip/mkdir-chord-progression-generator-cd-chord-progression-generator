import type { ScanRow, StockAnalysis } from '../analysis/stock';
import type { ProviderStatus } from '../data/service';
import type { Bar, CompanyInfo, DataMeta } from '../types';

export interface ScanResponse {
  status: ProviderStatus;
  generatedAt: string;
  rows: ScanRow[];
  errors: { symbol: string; error: string }[];
  benchmark: { symbol: string; meta: DataMeta; bars: Bar[] } | null;
}

export interface StockResponse {
  analysis: StockAnalysis;
  bars: Bar[];
  benchmark: Bar[];
  benchmarkError: string | null;
  fundamentalsNote: string | null;
  benchmarkInfo: CompanyInfo;
  mode: 'demo' | 'live';
}

export type BarsResponse = Record<string, { bars: Bar[]; meta: DataMeta } | { error: string }>;
