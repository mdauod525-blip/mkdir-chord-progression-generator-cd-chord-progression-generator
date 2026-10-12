import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getPriceSeries } from '@/lib/data/service';
import type { Bar, DataMeta } from '@/lib/types';
import { symbolListSchema } from '../_util';

export const dynamic = 'force-dynamic';

const since = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/** Daily bars on/after `since` for several symbols (used for paper-trade fills and valuations). */
export async function GET(req: NextRequest) {
  const syms = symbolListSchema.safeParse(req.nextUrl.searchParams.get('symbols') ?? '');
  const from = since.safeParse(req.nextUrl.searchParams.get('since') ?? undefined);
  if (!syms.success || !from.success) return NextResponse.json({ error: 'Invalid parameters', code: 'invalid' }, { status: 400 });
  const out: Record<string, { bars: Bar[]; meta: DataMeta } | { error: string }> = {};
  for (const s of syms.data) {
    try {
      const series = await getPriceSeries(s);
      out[s] = { bars: from.data ? series.bars.filter((b) => b.time >= from.data!) : series.bars.slice(-30), meta: series.meta };
    } catch (e) {
      out[s] = { error: (e as Error).message };
    }
  }
  return NextResponse.json(out);
}
