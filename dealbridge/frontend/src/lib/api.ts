// Same-origin API client. The session is an httpOnly cookie; state-changing requests carry the
// CSRF header the backend requires for cookie-authenticated calls.
export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === 'string' ? detail : detailMessage(detail));
  }
}

function detailMessage(d: unknown): string {
  if (!d) return 'Request failed';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((e) => (e?.loc ? `${e.loc.slice(1).join('.')}: ${e.msg}` : String(e?.msg ?? e))).join('; ');
  if (typeof d === 'object' && d && 'message' in d) return String((d as { message: unknown }).message);
  return JSON.stringify(d);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-DealBridge-CSRF'] = '1';
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data ?? res.statusText);
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
