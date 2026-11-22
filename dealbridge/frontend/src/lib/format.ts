export const usd = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });

export const compactUsd = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return `${v < 0 ? '-' : ''}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${v < 0 ? '-' : ''}$${Math.round(a / 1e3)}k`;
  return usd(v);
};

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits });

export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export const label = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'demo' | 'accent';

export function scoreTone(score: number | null | undefined, insufficient = false): Tone {
  if (insufficient || score === null || score === undefined) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 70) return 'accent';
  if (score >= 60) return 'warn';
  return 'bad';
}
