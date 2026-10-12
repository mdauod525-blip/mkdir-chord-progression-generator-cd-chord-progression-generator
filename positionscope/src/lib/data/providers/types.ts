import type { Bar, CompanyInfo, Fundamentals } from '../../types';

/**
 * Market-data provider abstraction. Swap or add providers (e.g. a paid feed) by implementing
 * these interfaces and registering them in `data/service.ts`; nothing else needs to change.
 */
export interface PriceProvider {
  readonly id: string;
  readonly name: string;
  /** True when prices are split/dividend adjusted. */
  readonly adjusted: boolean;
  /** Daily OHLCV, oldest first, starting no earlier than `startDate` where supported. */
  getDailyBars(symbol: string, startDate: string): Promise<Bar[]>;
  limitations: string[];
}

export interface FundamentalsProvider {
  readonly id: string;
  readonly name: string;
  getFundamentals(symbol: string): Promise<Fundamentals | null>;
  limitations: string[];
}

export interface ProfileProvider {
  getProfile?(symbol: string): Promise<Partial<CompanyInfo> | null>;
}
