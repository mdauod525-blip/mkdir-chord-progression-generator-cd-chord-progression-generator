'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity, BarChart3, Building2, Calculator, Handshake, LayoutDashboard, LogOut, Menu, Search, Settings, Store, Users, Workflow, X,
} from 'lucide-react';
import { cn } from './ui';
import { logout, useMe } from './auth';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/properties', label: 'Deal discovery', icon: Search },
  { href: '/analyzer', label: 'Deal analyzer', icon: Calculator },
  { href: '/investors', label: 'Investors', icon: Users },
  { href: '/matching', label: 'Investor matching', icon: Handshake },
  { href: '/opportunities', label: 'Marketplace', icon: Store },
  { href: '/crm', label: 'CRM', icon: Workflow },
  { href: '/agent', label: 'Agent activity', icon: Activity },
  { href: '/reports', label: 'Financial reporting', icon: BarChart3 },
  { href: '/admin', label: 'Administration', icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <Brand />
        <button aria-label="Open menu" onClick={() => setOpen(!open)} className="rounded-md p-1.5 hover:bg-surface-2">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <aside className={cn('border-r border-line bg-surface md:sticky md:top-0 md:block md:h-screen md:w-60 md:shrink-0', open ? 'block' : 'hidden')}>
        <div className="hidden px-4 py-4 md:block"><Brand /></div>
        <nav className="flex flex-col gap-0.5 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm', active(href) ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon size={16} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-4 py-3 text-xs text-ink-2 md:absolute md:bottom-0 md:w-60">
          <div className="truncate font-medium text-ink">{me?.full_name || me?.email}</div>
          <div className="mb-2 capitalize">{me?.role}</div>
          <button onClick={logout} className="inline-flex items-center gap-1 hover:text-ink"><LogOut size={13} /> Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
    </div>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink"><Building2 size={15} /></span>
      DealBridge AI
    </Link>
  );
}
