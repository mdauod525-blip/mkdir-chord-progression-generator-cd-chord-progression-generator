'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export type Me = { id: string; email: string; full_name: string; role: 'admin' | 'analyst' | 'investor' | 'wholesaler'; is_approved: boolean; investor_id: string | null };
const Ctx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });
export const useMe = () => useContext(Ctx);

export function AuthGate({ roles, children }: { roles: Me['role'][]; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const refresh = async () => {
    try {
      setMe(await api<Me>('/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setChecked(true);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!checked) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (!roles.includes(me.role)) router.replace(me.role === 'investor' ? '/portal' : me.role === 'wholesaler' ? '/submit' : '/');
  }, [checked, me, roles, router, path]);
  if (!checked || !me || !roles.includes(me.role)) return <div className="p-10 text-sm text-muted">Loading…</div>;
  return <Ctx.Provider value={{ me, refresh }}>{children}</Ctx.Provider>;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}
