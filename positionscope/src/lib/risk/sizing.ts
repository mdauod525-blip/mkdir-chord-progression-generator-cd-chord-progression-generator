/** Position sizing from a fixed fraction of account equity at risk. */

export interface SizingInput {
  equity: number;
  riskPct: number; // e.g. 1 = 1% of equity
  entry: number;
  stop: number;
  target?: number | null;
  costPerShare?: number; // estimated commission + slippage per share, each way
  maxPositionPct?: number; // concentration limit, default 25%
  existingExposure?: number; // USD already invested in correlated/same-sector positions
}

export interface SizingResult {
  valid: boolean;
  errors: string[];
  riskPerShare: number;
  dollarRiskBudget: number;
  shares: number;
  positionValue: number;
  exposurePct: number;
  maxLoss: number;
  potentialGain: number | null;
  rewardRisk: number | null;
  warnings: string[];
}

export function positionSize(i: SizingInput): SizingResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cost = Math.max(0, i.costPerShare ?? 0);
  if (!(i.equity > 0)) errors.push('Account equity must be positive.');
  if (!(i.riskPct > 0) || i.riskPct > 100) errors.push('Risk % must be between 0 and 100.');
  if (!(i.entry > 0)) errors.push('Entry price must be positive.');
  if (!(i.stop > 0)) errors.push('Stop/invalidation must be positive.');
  if (i.entry > 0 && i.stop >= i.entry) errors.push('This calculator is for long positions: the stop must be below the entry.');
  if (i.target !== undefined && i.target !== null && i.target <= i.entry) errors.push('Target must be above the entry for a long position.');
  const empty: SizingResult = { valid: false, errors, riskPerShare: 0, dollarRiskBudget: 0, shares: 0, positionValue: 0, exposurePct: 0, maxLoss: 0, potentialGain: null, rewardRisk: null, warnings };
  if (errors.length) return empty;

  // Costs are paid on entry and exit, so they add to the risk per share and reduce the gain.
  const riskPerShare = i.entry - i.stop + 2 * cost;
  const budget = (i.equity * i.riskPct) / 100;
  let shares = Math.floor(budget / riskPerShare);
  if (shares * i.entry > i.equity) {
    shares = Math.floor(i.equity / i.entry);
    warnings.push('Position capped by available equity (no leverage assumed).');
  }
  const positionValue = shares * i.entry;
  const exposurePct = (positionValue / i.equity) * 100;
  const maxPct = i.maxPositionPct ?? 25;
  if (exposurePct > maxPct) warnings.push(`Position would be ${exposurePct.toFixed(1)}% of equity — above your ${maxPct}% concentration limit. Consider a smaller size or a wider account.`);
  if (i.existingExposure && i.existingExposure > 0) {
    const combined = ((i.existingExposure + positionValue) / i.equity) * 100;
    if (combined > maxPct * 1.5) warnings.push(`Combined exposure with correlated/same-sector holdings would be ${combined.toFixed(1)}% of equity.`);
  }
  if (i.riskPct > 2) warnings.push('Risking more than 2% of equity per trade is aggressive for position trading.');
  if (shares === 0) warnings.push('Risk budget is smaller than the risk of one share — no position fits these limits.');
  const potentialGain = i.target ? shares * (i.target - i.entry - 2 * cost) : null;
  const rewardRisk = i.target ? (i.target - i.entry - 2 * cost) / riskPerShare : null;
  if (rewardRisk !== null && rewardRisk < 1.5) warnings.push(`Reward/risk ${rewardRisk.toFixed(2)}:1 is below 1.5:1.`);
  return { valid: true, errors, riskPerShare, dollarRiskBudget: budget, shares, positionValue, exposurePct, maxLoss: shares * riskPerShare, potentialGain, rewardRisk, warnings };
}
