'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './Shell';
import { logout, useMe } from './auth';
import { cn } from './ui';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me } = useMe();
  const links = me?.role === 'wholesaler' ? [{ href: '/submit', label: 'Submit a deal' }] : [{ href: '/portal', label: 'Opportunities' }, { href: '/portal/activity', label: 'My activity' }, { href: '/portal/profile', label: 'My profile' }];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <nav className="flex gap-1">{links.map((l) => <Link key={l.href} href={l.href} className={cn('rounded-lg px-3 py-1.5 text-sm', path === l.href ? 'bg-surface-2 font-medium' : 'text-ink-2 hover:bg-surface-2')}>{l.label}</Link>)}</nav>
          <button onClick={logout} className="text-sm text-ink-2 hover:text-ink">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
