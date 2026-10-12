'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DataMeta } from '@/lib/types';
import { fmtDate, fmtDateTime } from '@/lib/client/format';

export function Card({ children, className = '', title, action, id }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section id={id} className={`min-w-0 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'demo' | 'accent';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  up: 'bg-up-soft text-up',
  down: 'bg-down-soft text-down',
  warn: 'bg-warn-soft text-warn',
  demo: 'bg-demo-soft text-demo',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ children, tone = 'neutral', title, className = '' }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneCls[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Shows exactly what kind of data is on screen. Never shows "real-time". */
export function DataBadge({ meta, compact }: { meta: Pick<DataMeta, 'kind' | 'asOf' | 'stale' | 'fetchedAt' | 'provider' | 'adjusted'> | null; compact?: boolean }) {
  if (!meta) return <Badge tone="warn">No data</Badge>;
  const asOf = meta.asOf ? fmtDate(meta.asOf) : '—';
  if (meta.kind === 'demo') return <Badge tone="demo" title="Generated prices for a fictional company — not market data">DEMO · simulated{compact ? '' : ` · ${asOf}`}</Badge>;
  const label = meta.kind === 'cached' ? 'Cached EOD' : 'End-of-day';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={meta.stale ? 'warn' : 'neutral'} title={`${meta.provider}; fetched ${fmtDateTime(meta.fetchedAt)}`}>
        {meta.stale ? 'STALE · ' : ''}
        {label} · {asOf}
      </Badge>
      {!meta.adjusted && !compact && <Badge tone="warn" title="Not split/dividend adjusted">Unadjusted</Badge>}
    </span>
  );
}

export function Delta({ value, digits = 1, suffix = '%' }: { value: number | null | undefined; digits?: number; suffix?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="text-muted">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 1e-9;
  return (
    <span className={`tabular font-medium ${flat ? 'text-muted' : up ? 'text-up' : 'text-down'}`}>
      <span aria-hidden>{flat ? '■' : up ? '▲' : '▼'}</span>
      <span className="sr-only">{flat ? 'unchanged' : up ? 'up' : 'down'}</span> {up ? '+' : ''}
      {value.toFixed(digits)}
      {suffix}
    </span>
  );
}

export function TrendChip({ state }: { state: string }) {
  const tone: Tone = /up/.test(state) ? 'up' : /down/.test(state) ? 'down' : 'neutral';
  const arrow = /strong up/.test(state) ? '⇈' : /up/.test(state) ? '↗' : /strong down/.test(state) ? '⇊' : /down/.test(state) ? '↘' : /insufficient/.test(state) ? '?' : '→';
  return (
    <Badge tone={tone}>
      <span aria-hidden>{arrow}</span> {state}
    </Badge>
  );
}

export function ScorePill({ score, confidence, size = 'md' }: { score: number; confidence?: 'high' | 'medium' | 'low'; size?: 'md' | 'lg' }) {
  const tone = score >= 70 ? 'border-up text-up' : score >= 50 ? 'border-accent text-accent' : 'border-border text-muted';
  const dim = size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-11 w-11 text-base';
  return (
    <div className="flex flex-col items-center" title={`Opportunity score ${score}/100${confidence ? `, ${confidence} data confidence` : ''}. A screening score, not a probability of profit.`}>
      <div className={`tabular flex items-center justify-center rounded-full border-[3px] font-bold ${tone} ${dim}`}>{score}</div>
      {confidence && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{confidence === 'high' ? 'complete' : confidence === 'medium' ? 'partial' : 'sparse'}</span>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular truncate text-[15px] font-semibold">{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-5 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-down/40 bg-down-soft p-4 text-sm text-down">
      <div className="font-semibold">Couldn’t load data</div>
      <div className="mt-1 break-words">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-lg border border-down/40 px-3 py-1.5 font-medium">
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-[10px] px-3 text-sm font-medium ${value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const v = {
    primary: 'bg-accent text-white',
    secondary: 'border border-border bg-surface text-text',
    danger: 'border border-down/40 text-down',
    ghost: 'text-accent',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${v} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = 'secondary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  return (
    <Link href={href} className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ${variant === 'primary' ? 'bg-accent text-white' : 'border border-border bg-surface'}`}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full min-h-10 rounded-xl border border-border bg-surface px-3 text-[16px] text-text placeholder:text-muted';

export function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-muted ${className}`}>
      Research and decision-support only — not personalized financial advice. Signals, scores and fair-value estimates are uncertain and can be wrong. Past patterns do not guarantee future results. Paper trading is simulated; no real orders are placed.
    </p>
  );
}
