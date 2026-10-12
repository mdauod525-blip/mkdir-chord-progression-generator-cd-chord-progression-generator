import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DataUnavailableError } from '@/lib/data/service';
import { SYMBOL_RE } from '@/lib/universe';

export const symbolSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => SYMBOL_RE.test(s), 'Invalid ticker symbol');

export const symbolListSchema = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))
  .pipe(z.array(z.string().regex(SYMBOL_RE, 'Invalid ticker symbol')).max(40, 'At most 40 symbols per request'));

export function errorResponse(e: unknown) {
  if (e instanceof DataUnavailableError) {
    const status = e.code === 'not_found' ? 404 : e.code === 'rate_limited' ? 429 : 503;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  console.error(e);
  return NextResponse.json({ error: 'Unexpected server error', code: 'internal' }, { status: 500 });
}
