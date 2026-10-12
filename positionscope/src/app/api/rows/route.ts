import { NextResponse, type NextRequest } from 'next/server';
import { analyzeSymbol, scanUniverse } from '@/lib/data/service';
import { toScanRow, type ScanRow } from '@/lib/analysis/stock';
import { errorResponse, symbolListSchema } from '../_util';

export const dynamic = 'force-dynamic';

/** Scan rows for arbitrary symbols (watchlists, alerts). Universe symbols come from the scan cache. */
export async function GET(req: NextRequest) {
  const parsed = symbolListSchema.safeParse(req.nextUrl.searchParams.get('symbols') ?? '');
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid symbols', code: 'invalid' }, { status: 400 });
  try {
    const scan = await scanUniverse();
    const rows: ScanRow[] = [];
    const errors: { symbol: string; error: string }[] = [];
    for (const s of parsed.data) {
      const hit = scan.rows.find((r) => r.symbol === s);
      if (hit) {
        rows.push(hit);
        continue;
      }
      try {
        rows.push(toScanRow((await analyzeSymbol(s)).analysis));
      } catch (e) {
        errors.push({ symbol: s, error: (e as Error).message });
      }
    }
    return NextResponse.json({ rows, errors });
  } catch (e) {
    return errorResponse(e);
  }
}
