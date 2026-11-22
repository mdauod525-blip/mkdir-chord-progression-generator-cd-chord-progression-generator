'use client';
// shadcn/ui-style primitives (same API shape: variants via cva, className merging via tailwind-merge).
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as React from 'react';
import type { Tone } from '@/lib/format';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink hover:opacity-90',
        outline: 'border border-line bg-surface hover:bg-surface-2',
        ghost: 'hover:bg-surface-2',
        danger: 'bg-bad text-white hover:opacity-90',
      },
      size: { sm: 'h-8 px-3', md: 'h-9 px-4', lg: 'h-10 px-5' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export function Button({ className, variant, size, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-line bg-surface p-4 shadow-sm', className)} {...p} />;
}

export function CardTitle({ children, hint, right }: { children: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{children}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  neutral: 'bg-surface-2 text-ink-2',
  demo: 'bg-demo-bg text-demo',
  accent: 'bg-accent/15 text-accent',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', toneClass[tone], className)}>{children}</span>;
}

export const DemoBadge = ({ show = true }: { show?: boolean }) =>
  show ? <Badge tone="demo" className="uppercase tracking-wide">Demo</Badge> : null;

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted focus:outline-2 focus:outline-accent', className)} {...p} />;
});

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm focus:outline-2 focus:outline-accent', className)} {...p}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent', className)} {...p} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block text-sm', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-3.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, onClick, active, className }: { children?: React.ReactNode; onClick?: () => void; active?: boolean; className?: string }) => (
  <th
    onClick={onClick}
    className={cn('border-b border-line px-3 py-2 text-left text-xs font-medium text-ink-2 whitespace-nowrap', onClick && 'cursor-pointer select-none hover:text-ink', active && 'text-ink', className)}
  >
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn('border-b border-line px-3 py-2 align-top', className)}>{children}</td>
);

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn('-mb-px border-b-2 px-3 py-2 text-sm', value === t.id ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted', className)}>
      ARV, renovation, cost, ROI and profit figures are estimates from stated assumptions and available data — not appraisals,
      guarantees, or investment advice. Matches are preliminary and are not funding commitments.
    </p>
  );
}
