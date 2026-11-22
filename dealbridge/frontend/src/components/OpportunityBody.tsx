'use client';
import { Fragment } from 'react';
import { compactUsd, date, label, pct, usd } from '@/lib/format';
import { Badge, Card, CardTitle, Table, Td, Th } from './ui';
import { Flags, ScoreBadge } from './deal';

export function OpportunityBody({ o }: { o: any }) {
  const a = o.analysis;
  const fin = o.financial_breakdown;
  return (
    <div className="space-y-4">
      {o.is_demo && <div className="rounded-lg bg-demo-bg px-3 py-2 text-sm text-demo">DEMO — fictional opportunity for demonstration only.</div>}
      {o.property.photos?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">{o.property.photos.map((ph: any) => (
          <figure key={ph.url} className="shrink-0"><img src={ph.url} alt="Property" className="h-40 rounded-lg object-cover" /><figcaption className="text-xs text-muted">{ph.credit ?? ph.license}</figcaption></figure>))}</div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[
          ['Location', `${o.location.city}, ${o.location.state} ${o.location.zip_code}`],
          ['Asking price', usd(o.asking_price)], ['Est. ARV', usd(a?.arv)], ['Renovation budget', usd(a?.renovation_total)],
          ['Est. total investment', usd(a?.total_project_cost)], ['Projected net profit', usd(a?.net_profit)], ['Projected ROI', pct(a?.roi_pct)], ['Timeline', a?.duration_months ? `${a.duration_months} mo` : '—'],
        ].map(([k, v]) => <Card key={k} className="p-3"><div className="text-xs text-ink-2">{k}</div><div className="tabular mt-1 text-sm font-semibold">{v}</div></Card>)}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2"><ScoreBadge score={a?.score} band={a?.score_band} /><span className="text-xs text-ink-2">ARV confidence {o.arv_confidence?.toFixed?.(0) ?? '—'}/100 from {o.comp_count} verified comps</span></div>
        <p className="mt-2 text-sm">{o.summary}</p>
        <div className="mt-2"><Flags flags={o.risk_assessment.flags} /></div>
        {o.risk_assessment.explanation && o.risk_assessment.explanation !== o.summary && <p className="mt-2 text-sm text-ink-2">{o.risk_assessment.explanation}</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Financial breakdown</CardTitle>
          {fin ? (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              {[['Acquisition costs', fin.acquisition_costs], ['Renovation', fin.renovation_total], ['Holding costs', fin.holding_costs], ['Financing costs', fin.financing_costs], ['Selling costs', fin.selling_costs], ['Total project cost', fin.total_project_cost], ['Loan amount (assumed)', fin.loan_amount], ['Cash required', fin.cash_invested], ['Break-even sale price', fin.break_even_price], ['Net profit', fin.net_profit]].map(([k, v]) => (
                <Fragment key={k as string}><dt className="text-ink-2">{k}</dt><dd className="tabular text-right">{usd(v as number)}</dd></Fragment>))}
              <dt className="text-ink-2">Annualized ROI</dt><dd className="tabular text-right">{pct(fin.annualized_roi_pct)}</dd>
            </dl>
          ) : <p className="text-sm text-muted">Not available.</p>}
        </Card>
        <Card><CardTitle>Comparable sales</CardTitle>
          <Table><thead><tr><Th>Sold</Th><Th>Price</Th><Th>Adjusted</Th><Th>Distance</Th><Th>Source</Th></tr></thead>
            <tbody>{o.comparable_sales.map((c: any, i: number) => (
              <tr key={i}><Td>{date(c.sale_date)}{c.address && <div className="text-xs text-muted">{c.address}</div>}</Td><Td className="tabular">{compactUsd(c.sale_price)}</Td><Td className="tabular">{compactUsd(c.adjusted_price)}</Td><Td className="tabular">{c.distance_miles !== null ? `${c.distance_miles.toFixed(2)} mi` : '—'}</Td><Td className="text-xs">{c.is_demo ? <Badge tone="demo">DEMO</Badge> : label(c.verification_status)}</Td></tr>))}</tbody></Table>
        </Card>
        <Card><CardTitle>Property</CardTitle>
          <p className="text-sm">{label(o.property.type)} · {o.property.beds} bd · {o.property.baths} ba · {o.property.sqft} sqft · built {o.property.year_built} · condition {o.property.condition}</p>
          <p className="mt-1 text-xs text-ink-2">Opportunity: {o.property.opportunity_types.map(label).join(', ') || '—'} · Flood zone: {o.property.flood_zone ?? 'not checked'}</p>
          {o.location.address_line ? <p className="mt-2 text-sm">Address: <b>{o.location.address_line}</b></p> : <p className="mt-2 text-xs text-muted">Exact address shared after access is granted.</p>}
          {o.seller_contact && <p className="mt-1 text-sm">Seller contact: {o.seller_contact}</p>}
          {o.access_info && <p className="mt-1 text-sm">Access: {o.access_info}</p>}
        </Card>
        <Card><CardTitle>Source & verification</CardTitle>
          <p className="text-sm">{o.source.data_provider} · {label(o.source.verification_status)} · retrieved {date(o.source.retrieved_at)}</p>
          <p className="mt-1 text-xs text-ink-2">{o.source.license}</p>
          {o.documents.length > 0 && <ul className="mt-2 text-sm">{o.documents.map((d: any) => <li key={d.url}><a className="text-accent hover:underline" href={d.url} target="_blank" rel="noreferrer noopener">{d.name}</a></li>)}</ul>}
        </Card>
      </div>
      <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">{o.disclosure}</p>
    </div>
  );
}
