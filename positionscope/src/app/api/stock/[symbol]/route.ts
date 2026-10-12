import { NextResponse, type NextRequest } from 'next/server';
import { analyzeSymbol, getBenchmarkInfo, getStatus } from '@/lib/data/service';
import { errorResponse, symbolSchema } from '../../_util';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const parsed = symbolSchema.safeParse(decodeURIComponent((await ctx.params).symbol));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ticker symbol', code: 'invalid' }, { status: 400 });
  try {
    const r = await analyzeSymbol(parsed.data);
    return NextResponse.json({ ...r, benchmarkInfo: getBenchmarkInfo(), mode: getStatus().mode });
  } catch (e) {
    return errorResponse(e);
  }
}
