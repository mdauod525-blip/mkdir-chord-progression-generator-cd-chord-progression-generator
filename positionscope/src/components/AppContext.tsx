'use client';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { ProviderStatus } from '@/lib/data/service';
import { useApi } from '@/lib/client/useApi';
import { DEFAULT_SETTINGS, stores, useStore } from '@/lib/client/store';
import { DEFAULT_PAPER } from '@/lib/paper/portfolio';

interface Ctx {
  status: ProviderStatus | null;
  statusError: string | null;
  mode: string;
}

const AppCtx = createContext<Ctx>({ status: null, statusError: null, mode: 'pending' });

export function AppProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApi<ProviderStatus>('/api/status');
  const value = useMemo(() => ({ status: data, statusError: error, mode: data?.mode ?? 'pending' }), [data, error]);
  const [settings] = useStore(stores.settings, DEFAULT_SETTINGS);
  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);

/** Mode-scoped persisted state (demo and live data are kept apart). */
export function useWatchlists() {
  const { mode } = useApp();
  return useStore(stores.watchlists(mode), []);
}
export function useAlertRules() {
  const { mode } = useApp();
  return useStore(stores.alertRules(mode), []);
}
export function useAlertEvents() {
  const { mode } = useApp();
  return useStore(stores.alertEvents(mode), []);
}
export function usePaper() {
  const { mode } = useApp();
  return useStore(stores.paper(mode), DEFAULT_PAPER);
}
export function useSettings() {
  return useStore(stores.settings, DEFAULT_SETTINGS);
}
