'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AppProvider, useAlertEvents, useApp } from './AppContext';
import { AlertRunner } from './AlertRunner';
import { Badge, Disclaimer, ErrorBox, LoadingList } from './ui';
import { IconBell, IconBook, IconGear, IconHome, IconList, IconMore, IconScan, IconShield, IconWallet, IconX } from './Icons';

const primary = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/scanner', label: 'Scanner', icon: IconScan },
  { href: '/watchlists', label: 'Watchlists', icon: IconList },
  { href: '/alerts', label: 'Alerts', icon: IconBell },
  { href: '/paper', label: 'Paper', icon: IconWallet },
];
const secondary = [
  { href: '/risk', label: 'Risk calculator', icon: IconShield },
  { href: '/settings', label: 'Data & settings', icon: IconGear },
  { href: '/methodology', label: 'Methodology', icon: IconBook },
];

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path.startsWith(href);
}

function ModeBadge() {
  const { status, statusError } = useApp();
  if (statusError) return <Badge tone="warn">Server unavailable</Badge>;
  if (!status) return <Badge>Loading…</Badge>;
  return status.mode === 'demo' ? (
    <Link href="/settings"><Badge tone="demo" title="All data is simulated for fictional companies">DEMO DATA</Badge></Link>
  ) : (
    <Link href="/settings"><Badge tone="accent" title="End-of-day data — not real-time">EOD · {status.price?.id}</Badge></Link>
  );
}

function UnreadDot() {
  const [events] = useAlertEvents();
  const n = events.filter((e) => !e.read).length;
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-down px-1 text-center text-[10px] font-bold leading-4 text-white" aria-label={`${n} unread alerts`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Waits for the server status so mode-scoped storage never reads the wrong data set. */
function Gate({ children }: { children: ReactNode }) {
  const { status, statusError } = useApp();
  if (statusError) return <ErrorBox message={`The app server could not be reached (${statusError}).`} onRetry={() => location.reload()} />;
  if (!status) return <LoadingList rows={5} />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-border p-4 md:flex">
        <Link href="/" className="mb-4 text-lg font-bold tracking-tight">PositionScope</Link>
        {[...primary, ...secondary].map((n) => (
          <Link key={n.href} href={n.href} className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive(path, n.href) ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2'}`} aria-current={isActive(path, n.href) ? 'page' : undefined}>
            <span className="relative"><n.icon width={18} height={18} />{n.href === '/alerts' && <UnreadDot />}</span>
            {n.label}
          </Link>
        ))}
        <div className="mt-auto"><Disclaimer /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 py-2.5 backdrop-blur" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <Link href="/" className="font-bold tracking-tight md:invisible">PositionScope</Link>
          <ModeBadge />
        </header>
        <main className="flex-1 px-4 pb-28 pt-4 md:pb-10">
          <Gate>{children}</Gate>
        </main>
        <footer className="px-4 pb-28 md:hidden"><Disclaimer /></footer>
      </div>

      {/* Mobile bottom tab bar */}
      <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-6">
          {primary.map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${isActive(path, n.href) ? 'text-accent' : 'text-muted'}`}>
                <span className="relative"><n.icon />{n.href === '/alerts' && <UnreadDot />}</span>
                {n.label}
              </Link>
            </li>
          ))}
          <li>
            <button onClick={() => setMore(true)} aria-haspopup="dialog" className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${secondary.some((s) => isActive(path, s.href)) ? 'text-accent' : 'text-muted'}`}>
              <IconMore />
              More
            </button>
          </li>
        </ul>
      </nav>

      {more && (
        <div role="dialog" aria-modal="true" aria-label="More" className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setMore(false)}>
          <div className="safe-bottom w-full rounded-t-3xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">More</span>
              <button onClick={() => setMore(false)} aria-label="Close" className="p-2"><IconX /></button>
            </div>
            {secondary.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-2 font-medium">
                <n.icon /> {n.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <AlertRunner />
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
