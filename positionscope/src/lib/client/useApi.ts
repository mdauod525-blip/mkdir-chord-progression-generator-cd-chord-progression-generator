'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

const memo = new Map<string, { at: number; data: unknown }>();
const TTL = 60_000;

/** Minimal fetch hook with a 1-minute client cache to keep navigation fast. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(() => (url && memo.get(url) ? (memo.get(url)!.data as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url && !memo.get(url));
  const [nonce, setNonce] = useState(0);
  const forced = useRef(false);
  const reload = useCallback(() => {
    forced.current = true;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!url) return;
    const hit = memo.get(url);
    if (hit && Date.now() - hit.at < TTL && !forced.current) {
      setData(hit.data as T);
      setLoading(false);
      return;
    }
    forced.current = false;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as T;
      })
      .then((j) => {
        if (!alive) return;
        memo.set(url, { at: Date.now(), data: j });
        setData(j);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, nonce]);

  return { data, error, loading, reload };
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
