/**
 * Paper trading — SIMULATED ONLY. No brokerage connection exists.
 *
 * Fill policy (no future information):
 * - An order records `placedAfterBar`, the latest session known when it was placed.
 * - Market orders fill at the OPEN of the first session strictly after that bar,
 *   adjusted by slippage (buys pay more, sells receive less), plus a fixed commission.
 * - Limit orders are checked on each later session: buy fills if low ≤ limit at min(open, limit);
 *   sell fills if high ≥ limit at max(open, limit). Unfilled limits expire after 20 sessions.
 * - Buys that exceed cash, or sells that exceed the position, are rejected at fill time.
 * Accounting uses the average-cost method; commissions are included in cost basis / proceeds.
 */
import type { Bar } from '../types';

export interface PaperSettings {
  startingCash: number;
  commission: number; // USD per order
  slippageBps: number; // basis points applied to fills
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit';
  limitPrice?: number;
  placedAt: string;
  placedAfterBar: string;
  status: 'pending' | 'filled' | 'cancelled' | 'expired' | 'rejected';
  fill?: { date: string; price: number; commission: number };
  rejectReason?: string;
  thesis?: string;
  invalidation?: number;
  target?: number;
  notes?: string;
}

export interface PaperDividend {
  id: string;
  symbol: string;
  date: string;
  amountPerShare: number;
}

export interface PaperState {
  version: 1;
  createdAt: string;
  settings: PaperSettings;
  orders: PaperOrder[];
  dividends: PaperDividend[];
}

export const DEFAULT_PAPER: PaperState = {
  version: 1,
  createdAt: new Date(0).toISOString(),
  settings: { startingCash: 100_000, commission: 0, slippageBps: 5 },
  orders: [],
  dividends: [],
};

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number;
  costBasis: number;
  invalidation: number | null;
  target: number | null;
  thesis: string | null;
  openedAt: string;
}

export interface Ledger {
  cash: number;
  positions: Position[];
  realizedPnL: number;
  dividendIncome: number;
  commissions: number;
  closedTrades: { symbol: string; date: string; qty: number; pnl: number; entryAvg: number; exitPrice: number }[];
}

const LIMIT_EXPIRY_SESSIONS = 20;

export function slip(price: number, side: 'buy' | 'sell', bps: number) {
  return side === 'buy' ? price * (1 + bps / 10000) : price * (1 - bps / 10000);
}

/** Replay filled orders and dividends chronologically. */
export function computeLedger(state: PaperState): Ledger {
  const filled = state.orders.filter((o) => o.status === 'filled' && o.fill).sort((a, b) => (a.fill!.date === b.fill!.date ? a.placedAt.localeCompare(b.placedAt) : a.fill!.date.localeCompare(b.fill!.date)));
  const events: ({ kind: 'order'; date: string; o: PaperOrder } | { kind: 'div'; date: string; d: PaperDividend })[] = [
    ...filled.map((o) => ({ kind: 'order' as const, date: o.fill!.date, o })),
    ...state.dividends.map((d) => ({ kind: 'div' as const, date: d.date, d })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'order' ? -1 : 1));

  let cash = state.settings.startingCash;
  let realized = 0;
  let divIncome = 0;
  let commissions = 0;
  const pos = new Map<string, Position>();
  const closedTrades: Ledger['closedTrades'] = [];
  for (const e of events) {
    if (e.kind === 'div') {
      const p = pos.get(e.d.symbol);
      if (p && p.qty > 0) {
        const amt = p.qty * e.d.amountPerShare;
        cash += amt;
        divIncome += amt;
      }
      continue;
    }
    const o = e.o;
    const { price, commission } = o.fill!;
    commissions += commission;
    const p = pos.get(o.symbol) ?? { symbol: o.symbol, qty: 0, avgCost: 0, costBasis: 0, invalidation: null, target: null, thesis: null, openedAt: o.fill!.date };
    if (o.side === 'buy') {
      const cost = price * o.qty + commission;
      cash -= cost;
      p.costBasis += cost;
      p.qty += o.qty;
      p.avgCost = p.costBasis / p.qty;
      if (o.invalidation !== undefined) p.invalidation = o.invalidation;
      if (o.target !== undefined) p.target = o.target;
      if (o.thesis) p.thesis = o.thesis;
      pos.set(o.symbol, p);
    } else {
      const proceeds = price * o.qty - commission;
      cash += proceeds;
      const costOut = p.avgCost * o.qty;
      const pnl = proceeds - costOut;
      realized += pnl;
      closedTrades.push({ symbol: o.symbol, date: o.fill!.date, qty: o.qty, pnl, entryAvg: p.avgCost, exitPrice: price });
      p.qty -= o.qty;
      p.costBasis -= costOut;
      if (p.qty <= 0) pos.delete(o.symbol);
      else pos.set(o.symbol, p);
    }
  }
  return { cash, positions: [...pos.values()], realizedPnL: realized, dividendIncome: divIncome, commissions, closedTrades };
}

/**
 * Try to fill pending orders using bars that came AFTER each order's placement bar.
 * Pure: returns a new state. `barsBySymbol` must be oldest-first.
 */
export function processOrders(state: PaperState, barsBySymbol: Record<string, Bar[]>): PaperState {
  const orders = state.orders.map((o) => ({ ...o }));
  // Process in placement order so cash/position checks are sequential.
  const pendingIdx = orders.map((o, i) => [o, i] as const).filter(([o]) => o.status === 'pending').sort((a, b) => a[0].placedAt.localeCompare(b[0].placedAt));
  for (const [, i] of pendingIdx) {
    const o = orders[i];
    const bars = (barsBySymbol[o.symbol] ?? []).filter((b) => b.time > o.placedAfterBar);
    if (!bars.length) continue;
    let fill: { date: string; price: number } | null = null;
    if (o.type === 'market') {
      fill = { date: bars[0].time, price: slip(bars[0].open, o.side, state.settings.slippageBps) };
    } else if (o.limitPrice !== undefined) {
      const window = bars.slice(0, LIMIT_EXPIRY_SESSIONS);
      for (const b of window) {
        if (o.side === 'buy' && b.low <= o.limitPrice) { fill = { date: b.time, price: Math.min(b.open, o.limitPrice) }; break; }
        if (o.side === 'sell' && b.high >= o.limitPrice) { fill = { date: b.time, price: Math.max(b.open, o.limitPrice) }; break; }
      }
      if (!fill && bars.length >= LIMIT_EXPIRY_SESSIONS) {
        orders[i] = { ...o, status: 'expired' };
        continue;
      }
    }
    if (!fill) continue;
    // Validate against the ledger as of all fills so far.
    const ledger = computeLedger({ ...state, orders });
    const commission = state.settings.commission;
    if (o.side === 'buy' && fill.price * o.qty + commission > ledger.cash + 1e-9) {
      orders[i] = { ...o, status: 'rejected', rejectReason: `Insufficient simulated cash at fill (${fill.date})` };
      continue;
    }
    const held = ledger.positions.find((p) => p.symbol === o.symbol)?.qty ?? 0;
    if (o.side === 'sell' && o.qty > held) {
      orders[i] = { ...o, status: 'rejected', rejectReason: `Sell quantity exceeds simulated position (${held})` };
      continue;
    }
    orders[i] = { ...o, status: 'filled', fill: { date: fill.date, price: Math.round(fill.price * 10000) / 10000, commission } };
  }
  return { ...state, orders };
}

export function portfolioValue(ledger: Ledger, prices: Record<string, number | null>) {
  let market = 0;
  let unrealized = 0;
  let missing = 0;
  for (const p of ledger.positions) {
    const px = prices[p.symbol];
    if (px === null || px === undefined) {
      missing++;
      market += p.costBasis; // fall back to cost so totals stay finite; flagged in UI
      continue;
    }
    market += px * p.qty;
    unrealized += px * p.qty - p.costBasis;
  }
  return { marketValue: market, equity: ledger.cash + market, unrealized, missingPrices: missing };
}

/** Benchmark return over the same window as the portfolio (from the first fill to the latest bar). */
export function benchmarkReturn(bench: Bar[], fromDate: string | null): number | null {
  if (!fromDate || !bench.length) return null;
  const start = bench.find((b) => b.time >= fromDate);
  const end = bench[bench.length - 1];
  if (!start) return null;
  return (end.close / start.open - 1) * 100;
}
