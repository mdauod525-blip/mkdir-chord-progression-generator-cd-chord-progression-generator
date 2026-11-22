'use client';
// Shared deal-analysis presentation used by the property page and the standalone analyzer.
import { AlertTriangle } from 'lucide-react';
import { Badge, Card, CardTitle, Table, Td, Th } from './ui';
import { date, label, num, pct, scoreTone, usd } from '@/lib/format';

export function ScoreBadge({ score, band }: { score: number | null | undefined; band?: string | null }) {
  const insufficient = !!band?.startsWith('Insufficient');
  return (
    <Badge tone={scoreTone(score, insufficient)}>
      <span className="tabular font-semibold">{score === null || score === undefined ? '—' : score.toFixed(0)}</span>
      {band && <span className="hidden sm:inline">· {band}</span>}
    </Badge>
  );
}

const FLAG_TEXT: Record<string, string> = {
  manual_review_required: 'Manual review required',
  insufficient_comps: 'Fewer verified comps than required',
  no_verified_comps: 'No verified comparable sales',
  low_arv_confidence: 'Low ARV confidence',
  high_comp_dispersion: 'Comps disagree (high dispersion)',
  stale_comps: 'Comps older than preferred window',
  arv_manual_override: 'ARV entered manually (not comp-derived)',
  manual_arv_differs_from_comps: 'Manual ARV differs >10% from comps',
  insufficient_data: 'Insufficient data',
  no_arv: 'No ARV',
  no_asking_price: 'No asking price',
  projected_loss: 'Projected loss',
  structural_risk: 'Structural risk',
  pre_1960_construction: 'Pre-1960 construction',
  condition_unverified: 'Condition not inspected',
  condition_unknown_assumed_medium_scope: 'Condition unknown — medium scope assumed',
  loan_capped_by_max_loan_to_arv: 'Loan capped by max loan-to-ARV',
  demo_comps_used: 'Demo comps used',
  target_profit_unreachable_at_any_price: 'Target profit unreachable at any price',
};

export function Flags({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <Badge key={f} tone={['projected_loss', 'no_verified_comps', 'structural_risk', 'manual_review_required'].includes(f) ? 'bad' : 'warn'}>
          <AlertTriangle size={11} aria-hidden /> {FLAG_TEXT[f] ?? label(f)}
        </Badge>
      ))}
    </div>
  );
}

function Row({ k, v, strong, neg }: { k: string; v: React.ReactNode; strong?: boolean; neg?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 text-sm ${strong ? 'border-t border-line pt-2 font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-ink-2'}>{k}</span>
      <span className={`tabular ${neg ? 'text-bad' : ''}`}>{v}</span>
    </div>
  );
}

export function AnalysisView({ results }: { results: any }) {
  const fin = results.financials;
  const arv = results.arv;
  const sc = results.score;
  const reno = results.renovation;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-ink-2">Deal score</div>
            <div className="mt-1 flex items-center gap-2"><span className="tabular text-3xl font-semibold">{sc.score.toFixed(0)}</span><ScoreBadge score={sc.score} band={sc.band} /></div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-ink-2">Est. ARV</div><div className="tabular font-medium">{usd(arv.arv)}</div></div>
            <div><div className="text-xs text-ink-2">Net profit</div><div className={`tabular font-medium ${fin && fin.net_profit < 0 ? 'text-bad' : ''}`}>{usd(fin?.net_profit)}</div></div>
            <div><div className="text-xs text-ink-2">ROI (cash)</div><div className="tabular font-medium">{pct(fin?.roi_pct)}</div></div>
            <div><div className="text-xs text-ink-2">MAO</div><div className="tabular font-medium">{usd(results.mao)}</div></div>
          </div>
        </div>
        <div className="mt-3"><Flags flags={sc.flags} /></div>
        <p className="mt-3 text-sm text-ink-2">{sc.explanation}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Weighted factors; caps applied when data is weak">Score breakdown</CardTitle>
          <ul className="space-y-2">
            {sc.components.map((c: any) => (
              <li key={c.key} className="text-sm">
                <div className="flex justify-between"><span>{c.label}</span><span className="tabular text-ink-2">{c.points.toFixed(1)} / {c.weight}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${(c.points / c.weight) * 100}%`, background: 'var(--series-1)' }} />
                </div>
                <div className="mt-0.5 text-xs text-muted">{c.detail}</div>
              </li>
            ))}
          </ul>
          {sc.caps_applied.length > 0 && (
            <div className="mt-3 rounded-lg bg-warn-bg p-2 text-xs text-warn">{sc.caps_applied.map((c: string) => <div key={c}>Score {c}</div>)}</div>
          )}
        </Card>

        <Card>
          <CardTitle hint="Deterministic model — no AI in any number">Financial breakdown</CardTitle>
          {fin ? (
            <>
              <Row k="Purchase price" v={usd(fin.purchase_price)} />
              <Row k="Acquisition costs" v={usd(fin.acquisition_costs)} />
              <Row k="Renovation" v={usd(fin.renovation_total)} />
              <Row k="Holding costs" v={usd(fin.holding_costs)} />
              <Row k="Financing costs (points, fees, interest)" v={usd(fin.financing_costs)} />
              <Row k="Selling costs" v={usd(fin.selling_costs)} />
              <Row k="Total project cost" v={usd(fin.total_project_cost)} strong />
              <Row k="Gross sale proceeds (ARV)" v={usd(fin.gross_sale_proceeds)} />
              <Row k="Net profit" v={usd(fin.net_profit)} strong neg={fin.net_profit < 0} />
              <div className="mt-2 grid grid-cols-2 gap-x-6">
                <Row k="Loan amount" v={usd(fin.loan_amount)} />
                <Row k="Cash invested" v={usd(fin.cash_invested)} />
                <Row k="ROI on cash" v={pct(fin.roi_pct)} />
                <Row k="Cash-on-cash" v={pct(fin.cash_on_cash_pct)} />
                <Row k="Return on cost" v={pct(fin.return_on_cost_pct)} />
                <Row k="Annualized ROI" v={pct(fin.annualized_roi_pct)} />
                <Row k="Profit margin" v={pct(fin.profit_margin_pct)} />
                <Row k="Duration" v={`${fin.duration_months} mo`} />
                <Row k="Break-even sale price" v={usd(fin.break_even_price)} />
                <Row k="Target profit" v={usd(fin.target_profit)} />
              </div>
              <div className="mt-3 rounded-lg bg-surface-2 p-2.5 text-xs text-ink-2">
                <div className="font-medium text-ink">MAO = ARV − renovation − holding − selling − financing − acquisition − target profit</div>
                {fin.mao_breakdown ? (
                  <div className="tabular mt-1">
                    {usd(fin.mao_breakdown.arv)} − {usd(-fin.mao_breakdown.renovation)} − {usd(-fin.mao_breakdown.holding)} − {usd(-fin.mao_breakdown.selling)} − {usd(-fin.mao_breakdown.financing)} − {usd(-fin.mao_breakdown.acquisition)} − {usd(-fin.mao_breakdown.target_profit)} = <b>{usd(fin.mao)}</b>
                  </div>
                ) : <div className="mt-1">Target profit is not reachable at any purchase price.</div>}
                <div className="mt-1">For reference only, the 70% rule would give {usd(fin.seventy_percent_rule_reference)} — not used.</div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{arv.arv ? 'No purchase price — MAO shown above frames an offer.' : 'Needs verified comparable sales (or a documented manual ARV) before returns can be computed.'}</p>
          )}
        </Card>
      </div>

      {fin && (
        <Card>
          <CardTitle hint="Net profit if assumptions move against you">Sensitivity</CardTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(fin.sensitivity as Record<string, number>).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line p-2">
                <div className="text-xs text-ink-2">{label(k).replace('pct', '%')}</div>
                <div className={`tabular text-sm font-medium ${v < 0 ? 'text-bad' : ''}`}>{usd(v)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle hint={`${reno.scope} scope · ${reno.basis?.all ?? 'rule-based estimate — replace with contractor bids'}`}>Renovation budget {usd(reno.total)}</CardTitle>
        {reno.line_items && Object.keys(reno.line_items).length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {Object.entries(reno.line_items as Record<string, number>).map(([k, v]) => (
              <Row key={k} k={label(k)} v={usd(v)} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle hint={`ARV method: ${label(arv.method)} · confidence ${arv.confidence.toFixed(0)}/100 · ${arv.neighborhood_sales_6mo} nearby verified sales in 6 months`}>
          Comparable sales ({arv.comp_count} used of {arv.evaluations.length} evaluated)
        </CardTitle>
        {arv.evaluations.length ? (
          <Table>
            <thead><tr><Th>Address</Th><Th>Sold</Th><Th>Price</Th><Th>Distance</Th><Th>Adjusted</Th><Th>Similarity</Th><Th>Status</Th></tr></thead>
            <tbody>
              {arv.evaluations.map((e: any) => (
                <tr key={e.comp_id} className={e.included ? '' : 'opacity-60'}>
                  <Td>{e.address}{e.is_demo && <Badge tone="demo" className="ml-1">DEMO</Badge>}<div className="text-xs text-muted">{e.data_provider} · {label(e.verification_status)}</div></Td>
                  <Td className="whitespace-nowrap">{date(e.sale_date)}<div className="text-xs text-muted">{e.months_ago} mo ago</div></Td>
                  <Td className="tabular">{usd(e.sale_price)}</Td>
                  <Td className="tabular">{e.distance_miles !== null ? `${e.distance_miles.toFixed(2)} mi` : 'same ZIP'}</Td>
                  <Td className="tabular">{e.included ? usd(e.adjusted_price) : '—'}</Td>
                  <Td className="tabular">{e.included ? pct(e.similarity * 100, 0) : '—'}</Td>
                  <Td>{e.included ? <Badge tone="good">Used</Badge> : <span className="text-xs text-ink-2">Excluded: {e.exclusion_reason}</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-sm text-muted">No closed sales found nearby. Add verified comps manually — active listings and assessed values are never used.</p>}
        {arv.arv && <p className="mt-2 text-xs text-muted">ARV range {usd(arv.arv_low)} – {usd(arv.arv_high)}{arv.median_ppsf ? ` · median ${usd(arv.median_ppsf)}/sqft` : ''}</p>}
      </Card>
    </div>
  );
}

export const fmtSqft = (v: number | null) => (v ? `${num(v)} sqft` : '—');
