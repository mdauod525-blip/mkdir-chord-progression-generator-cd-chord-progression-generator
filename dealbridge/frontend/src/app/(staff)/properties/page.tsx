'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { label, pct, usd } from '@/lib/format';
import { Badge, Button, DemoBadge, Empty, ErrorBox, Input, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { ScoreBadge } from '@/components/deal';

const OPP = ['foreclosure', 'pre_foreclosure', 'reo', 'auction', 'probate', 'estate_sale', 'vacant', 'distressed', 'needs_renovation', 'price_reduced', 'extended_dom', 'fsbo', 'wholesale', 'hud_home'];

export default function Properties() {
  const [f, setF] = useState({ q: '', market_id: '', status: '', opportunity_type: '', min_score: '', needs_review: '', demo: '', sort: '-score' });
  const markets = useApi('/markets');
  const { data, error, loading } = useApi(`/properties${qs({ ...f, page_size: 200 })}`);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const sortBy = (k: string) => setF({ ...f, sort: f.sort === `-${k}` ? k : `-${k}` });
  return (
    <div>
      <PageHeader title="Deal discovery" sub="Every property from approved sources and manual entry, with its current analysis."
        actions={<Link href="/properties/new"><Button><Plus size={15} /> Add property</Button></Link>} />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Input placeholder="Address, city, ZIP" value={f.q} onChange={set('q')} className="col-span-2" />
        <Select value={f.market_id} onChange={set('market_id')}><option value="">All markets</option>{markets.data?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        <Select value={f.opportunity_type} onChange={set('opportunity_type')}><option value="">Any opportunity</option>{OPP.map((o) => <option key={o} value={o}>{label(o)}</option>)}</Select>
        <Select value={f.status} onChange={set('status')}><option value="">Any status</option>{['new', 'analyzed', 'needs_review', 'under_review', 'approved', 'rejected', 'archived'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        <Select value={f.min_score} onChange={set('min_score')}><option value="">Any score</option><option value="80">≥ 80</option><option value="70">≥ 70</option><option value="60">≥ 60</option></Select>
        <Select value={f.needs_review} onChange={set('needs_review')}><option value="">Review: any</option><option value="true">Needs review</option><option value="false">No flags</option></Select>
        <Select value={f.demo} onChange={set('demo')}><option value="">Real + demo</option><option value="false">Real only</option><option value="true">Demo only</option></Select>
      </div>
      <ErrorBox error={error} />
      {data && data.items.length === 0 && <Empty>No properties match. Add one manually or enable a data source in Administration.</Empty>}
      {data && data.items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Property</Th><Th>Type</Th><Th onClick={() => sortBy('price')} active={f.sort.includes('price')}>List price</Th>
              <Th>Est. ARV</Th><Th onClick={() => setF({ ...f, sort: 'profit' })} active={f.sort === 'profit'}>Net profit</Th>
              <Th onClick={() => setF({ ...f, sort: 'roi' })} active={f.sort === 'roi'}>ROI</Th><Th>Comps</Th>
              <Th onClick={() => sortBy('score')} active={f.sort.includes('score')}>Score</Th><Th>Signals</Th><Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p: any) => (
              <tr key={p.id} className="hover:bg-surface-2">
                <Td><Link href={`/properties/${p.id}`} className="font-medium hover:text-accent">{p.address_line}</Link> <DemoBadge show={p.is_demo} />
                  <div className="text-xs text-muted">{p.city}, {p.state} {p.zip_code}</div></Td>
                <Td className="whitespace-nowrap text-xs">{label(p.property_type)}<div className="text-muted">{p.beds ?? '—'} bd · {p.baths ?? '—'} ba · {p.sqft ?? '—'} sf</div></Td>
                <Td className="tabular">{usd(p.list_price)}<div className="text-xs text-muted">{label(p.listing_status)}{p.days_on_market !== null ? ` · ${p.days_on_market} DOM` : ''}</div></Td>
                <Td className="tabular">{usd(p.analysis?.arv)}</Td>
                <Td className={`tabular ${p.analysis?.net_profit < 0 ? 'text-bad' : ''}`}>{usd(p.analysis?.net_profit)}</Td>
                <Td className="tabular">{pct(p.analysis?.roi_pct)}</Td>
                <Td className="tabular">{p.analysis?.comp_count ?? '—'}</Td>
                <Td><ScoreBadge score={p.analysis?.score} />{p.analysis?.needs_manual_review && <Badge tone="warn" className="ml-1">review</Badge>}</Td>
                <Td><div className="flex max-w-48 flex-wrap gap-1">{p.opportunity_types.slice(0, 3).map((o: string) => <Badge key={o}>{label(o)}</Badge>)}</div></Td>
                <Td className="text-xs text-ink-2">{p.data_provider}<div className="text-muted">{label(p.verification_status)}</div></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {loading && !data && <p className="text-sm text-muted">Loading…</p>}
      {data && <p className="mt-2 text-xs text-muted">{data.total} properties</p>}
    </div>
  );
}
