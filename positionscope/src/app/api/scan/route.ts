import { NextResponse, type NextRequest } from 'next/server';
import { getBenchmarkSeries, getStatus, scanUniverse } from '@/lib/data/service';
import { errorResponse } from '../_util';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('refresh') === '1';
    const scan = await scanUniverse(force);
    const bench = await getBenchmarkSeries();
    return NextResponse.json({
      status: getStatus(),
      generatedAt: new Date(scan.at).toISOString(),
      rows: scan.rows,
      errors: scan.errors,
      benchmark: bench ? { symbol: bench.symbol, meta: bench.meta, bars: bench.bars.slice(-260) } : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
