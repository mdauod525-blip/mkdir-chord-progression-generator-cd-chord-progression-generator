export const fmtPrice = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmtPct = (n: number | null | undefined, digits = 1, sign = true) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${sign && n > 0 ? '+' : ''}${n.toFixed(digits)}%`);
export const fmtNum = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(digits));
export const fmtX = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(1)}×`);
export function fmtBig(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  return `${s}$${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
export const fmtVol = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n));
export const fmtRR = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}:1`);
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined });
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function daysUntil(date: string) {
  return Math.round((Date.parse(date + 'T12:00:00Z') - Date.now()) / 86400000);
}
