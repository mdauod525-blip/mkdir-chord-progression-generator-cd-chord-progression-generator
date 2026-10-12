/** HTTP helpers shared by providers (no server-only import so parsers stay testable). */
/** Serializes calls per provider with a minimum spacing between them. */
export class Throttle {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private minIntervalMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'rate_limited' | 'not_found' | 'unauthorized' | 'premium' | 'network' | 'bad_response',
  ) {
    super(message);
  }
}

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    throw new ProviderError(`Network error: ${(e as Error).message}`, 'network');
  } finally {
    clearTimeout(t);
  }
  if (res.status === 429) throw new ProviderError('Rate limit reached', 'rate_limited');
  if (res.status === 401 || res.status === 403) throw new ProviderError('Unauthorized — check the API key', 'unauthorized');
  if (res.status === 404) throw new ProviderError('Symbol not found', 'not_found');
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}: ${text.slice(0, 160)}`, 'bad_response');
  try {
    return JSON.parse(text);
  } catch {
    // Some endpoints return CSV; let callers handle text.
    return text;
  }
}
