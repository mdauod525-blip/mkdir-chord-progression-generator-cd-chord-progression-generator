'use client';
/**
 * Browser persistence (localStorage) for watchlists, alerts, paper portfolio and settings.
 * Phase-1 limitation: data lives only in this browser/device. The store interface is small so it
 * can be swapped for a server/database-backed implementation (Prisma + Postgres) later.
 */
import { useSyncExternalStore } from 'react';
import type { AlertEvent, AlertRule } from '../alerts/engine';
import { DEFAULT_PAPER, type PaperState } from '../paper/portfolio';
import { DEFAULT_WEIGHTS, type ComponentKey } from '../scoring/score';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(cb: () => void): () => void;
}

export function createStore<T>(key: string, initial: T): Store<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (value !== undefined) return value;
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      value = raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      value = initial;
    }
    return value;
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        value = undefined;
        listeners.forEach((l) => l());
      }
    });
  }
  return {
    get: read,
    set(next) {
      value = typeof next === 'function' ? (next as (p: T) => T)(read()) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage full or blocked (private mode): keep in memory for this session.
      }
      listeners.forEach((l) => l());
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

export function useStore<T>(store: Store<T>, initial: T): [T, Store<T>['set']] {
  const v = useSyncExternalStore(store.subscribe, store.get, () => initial);
  return [v, store.set];
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  alertsEnabled: boolean;
}

export interface Settings {
  weights: Record<ComponentKey, number>;
  theme: 'system' | 'light' | 'dark';
}

/** Store keys include the data mode so demo and live data never mix. */
const mk = (name: string) => `positionscope:v1:${name}`;

export const DEFAULT_WATCHLISTS: Watchlist[] = [];
export const DEFAULT_SETTINGS: Settings = { weights: DEFAULT_WEIGHTS, theme: 'system' };

const cache = new Map<string, Store<unknown>>();
function scoped<T>(name: string, mode: string, initial: T): Store<T> {
  const key = mk(`${mode}:${name}`);
  if (!cache.has(key)) cache.set(key, createStore(key, initial) as Store<unknown>);
  return cache.get(key) as Store<T>;
}

export const stores = {
  watchlists: (mode: string) => scoped<Watchlist[]>('watchlists', mode, DEFAULT_WATCHLISTS),
  alertRules: (mode: string) => scoped<AlertRule[]>('alertRules', mode, []),
  alertEvents: (mode: string) => scoped<AlertEvent[]>('alertEvents', mode, []),
  paper: (mode: string) => scoped<PaperState>('paper', mode, DEFAULT_PAPER),
  settings: (() => {
    const key = mk('settings');
    if (!cache.has(key)) cache.set(key, createStore(key, DEFAULT_SETTINGS) as Store<unknown>);
    return cache.get(key) as Store<Settings>;
  })(),
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
