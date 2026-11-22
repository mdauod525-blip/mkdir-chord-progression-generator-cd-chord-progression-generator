'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { date, label, num, usd } from '@/lib/format';
import { Badge, Button, Card, CardTitle, DemoBadge, Disclaimer, Empty, ErrorBox, Field, Input, PageHeader, Select, Table, Tabs, Td, Textarea, Th } from '@/components/ui';
import { AnalysisView, ScoreBadge } from '@/components/deal';

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: p, error, reload } = useApi(`/properties/${id}`);
  const [tab, setTab] = useState('analysis');
  const [msg, setMsg] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [opt, setOpt] = useState({ purchase_price: '', manual_arv: '', manual_arv_reason: '', scope: '' });
  const [ai, setAi] = useState<{ task: string; text: string; source: string; reason?: string } | null>(null);

  async function run(name: string, fn: () => Promise<any>) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg(e);
    } finally {
      setBusy('');
    }
  }
  const analyze = (force = false) =>
    run('analyze', () => api(`/properties/${id}/analyze`, {
      body: {
        force,
        purchase_price: opt.purchase_price ? Number(opt.purchase_price) : null,
        manual_arv: opt.manual_arv ? Number(opt.manual_arv) : null,
        manual_arv_reason: opt.manual_arv_reason || null,
        scope: opt.scope || null,
      },
    }));
  const askAi = (task: string) => run('ai', async () => setAi(await api(`/properties/${id}/ai/${task}`, { method: 'POST' })));
  const setStatus = (status: string) => run('status', () => api(`/properties/${id}/status`, { body: { status } }));
  const createOpp = () => run('opp', async () => {
    const o = await api<{ id: string }>('/opportunities', { body: { property_id: id } });
    router.push(`/opportunities/${o.id}`);
  });

  if (error) return <ErrorBox error={error} />;
  if (!p) return <p className="text-sm text-muted">Loading…</p>;
  const a = p.analysis;
  return (
    <div>
      <PageHeader
        title={`${p.address_line}${p.unit ? ` #${p.unit}` : ''}`}
        sub={<span className="flex flex-wrap items-center gap-2">{p.city}, {p.state} {p.zip_code} <DemoBadge show={p.is_demo} /> <Badge>{label(p.status)}</Badge>
          {a && <ScoreBadge score={a.score} band={a.score_band} />}</span>}
        actions={<>
          <Button variant="outline" onClick={() => analyze(true)} disabled={!!busy}>{busy === 'analyze' ? 'Analyzing…' : 'Re-analyze'}</Button>
          <Button variant="outline" onClick={() => run('enrich', () => api(`/properties/${id}/enrich`, { method: 'POST' }))} disabled={!!busy}>Enrich (FEMA/Census/EPA)</Button>
          <Select className="w-40" value="" onChange={(e) => e.target.value && setStatus(e.target.value)}>
            <option value="">Set status…</option>{['under_review', 'approved', 'rejected', 'archived'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Button onClick={createOpp} disabled={!!busy || !a}>Create opportunity</Button>
        </>}
      />
      {p.is_demo && <div className="mb-4 rounded-lg bg-demo-bg px-3 py-2 text-sm text-demo">DEMO — fictional record for demonstration only. Not a real property, listing or sale.</div>}
      <ErrorBox error={msg} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'analysis', label: 'Analysis' }, { id: 'comps', label: 'Add comps' }, { id: 'renovation', label: 'Renovation' }, { id: 'details', label: 'Details & source' }, { id: 'history', label: 'History' }]} />

      {tab === 'analysis' && (
        <div className="space-y-4">
          <Card>
            <CardTitle hint="Override inputs for what-if analysis. A manual ARV needs a documented reason and caps the score.">Analysis inputs</CardTitle>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="Purchase price" hint={`List: ${usd(p.list_price)}`}><Input type="number" value={opt.purchase_price} onChange={(e) => setOpt({ ...opt, purchase_price: e.target.value })} /></Field>
              <Field label="Renovation scope"><Select value={opt.scope} onChange={(e) => setOpt({ ...opt, scope: e.target.value })}><option value="">From condition</option>{['cosmetic', 'light', 'medium', 'heavy', 'gut'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Manual ARV (optional)"><Input type="number" value={opt.manual_arv} onChange={(e) => setOpt({ ...opt, manual_arv: e.target.value })} /></Field>
              <Field label="Reason for manual ARV" className="md:col-span-2"><Input value={opt.manual_arv_reason} onChange={(e) => setOpt({ ...opt, manual_arv_reason: e.target.value })} placeholder="e.g. agent BPO with 3 MLS solds" /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => analyze(false)} disabled={!!busy}>Run analysis</Button>
              <Button variant="outline" onClick={() => askAi('deal_explanation')} disabled={!!busy || !a}><Sparkles size={14} /> Explain score</Button>
              <Button variant="outline" onClick={() => askAi('risk_factors')} disabled={!!busy || !a}><Sparkles size={14} /> Unusual risks</Button>
              <Button variant="outline" onClick={() => askAi('comp_summary')} disabled={!!busy || !a}><Sparkles size={14} /> Summarize comps</Button>
              <Button variant="outline" onClick={() => askAi('investor_summary')} disabled={!!busy || !a}><Sparkles size={14} /> Investor summary</Button>
            </div>
            {ai && (
              <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-ink-2"><Badge tone={ai.source === 'claude' ? 'accent' : 'neutral'}>{ai.source === 'claude' ? 'Claude' : 'Deterministic'}</Badge>{label(ai.task)}{ai.reason && <span>· AI unavailable: {ai.reason}</span>}</div>
                <p className="whitespace-pre-wrap">{ai.text}</p>
              </div>
            )}
          </Card>
          {a?.ai_summary && <Card><CardTitle hint="Generated by Claude from the deterministic results">AI explanation</CardTitle><p className="whitespace-pre-wrap text-sm">{a.ai_summary}</p></Card>}
          {a ? <AnalysisView results={a.results} /> : <Empty>Not analyzed yet. Run the analysis above.</Empty>}
          <Disclaimer />
        </div>
      )}
      {tab === 'comps' && <CompForm p={p} onSaved={() => { void reload(); }} />}
      {tab === 'renovation' && <RenovationEditor id={id} onSaved={() => { void reload(); }} />}
      {tab === 'details' && <Details p={p} />}
      {tab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardTitle>Price history</CardTitle>
            {p.price_history.length ? <ul className="space-y-1 text-sm">{p.price_history.map((h: any, i: number) => <li key={i} className="flex justify-between"><span>{date(h.date)} · {label(h.event)}</span><span className="tabular">{usd(h.price)}</span></li>)}</ul> : <p className="text-sm text-muted">No price events.</p>}
          </Card>
          <Card><CardTitle>Analysis history</CardTitle>
            <ul className="space-y-1 text-sm">{p.analysis_history.map((h: any) => <li key={h.id} className="flex justify-between"><span>{date(h.created_at)}</span><span className="tabular">score {h.score?.toFixed(0)} · profit {usd(h.net_profit)}</span></li>)}</ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Details({ p }: { p: any }) {
  const rows: [string, any][] = [
    ['Type', label(p.property_type)], ['Beds / baths', `${p.beds ?? '—'} / ${p.baths ?? '—'}`], ['Living area', p.sqft ? `${num(p.sqft)} sqft` : '—'],
    ['Lot', p.lot_sqft ? `${num(p.lot_sqft)} sqft` : '—'], ['Year built', p.year_built ?? '—'], ['Condition', label(p.condition)],
    ['Listing status', label(p.listing_status)], ['List price', usd(p.list_price)], ['Original list', usd(p.original_list_price)],
    ['Days on market', p.days_on_market ?? '—'], ['Assessed value', `${usd(p.assessed_value)} (${p.assessment_year ?? '—'}) — never used as ARV`],
    ['Annual taxes', usd(p.annual_taxes)], ['HOA', usd(p.hoa_monthly)], ['Last sale', `${usd(p.last_sale_price)} ${p.last_sale_date ? `on ${date(p.last_sale_date)}` : ''}`],
    ['Parcel', p.parcel_id ?? '—'], ['County', p.county ?? '—'], ['Flood zone', p.flood_zone ?? 'not checked'],
  ];
  const pv = p.provenance;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardTitle>Property facts</CardTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{rows.map(([k, v]) => <Fragment key={k}><dt className="text-ink-2">{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        {p.listing_url && <a className="mt-3 inline-block text-sm text-accent hover:underline" href={p.listing_url} target="_blank" rel="noreferrer noopener">Listing link ↗</a>}
      </Card>
      <Card><CardTitle hint="Every record carries its provider, URL, retrieval time, license and verification status">Source & provenance</CardTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-2">Provider</dt><dd>{pv.data_provider}</dd>
          <dt className="text-ink-2">Source URL</dt><dd className="break-all">{pv.source_url ? <a className="text-accent hover:underline" href={pv.source_url} target="_blank" rel="noreferrer noopener">{pv.source_url}</a> : '—'}</dd>
          <dt className="text-ink-2">Retrieved</dt><dd>{date(pv.retrieved_at)}</dd>
          <dt className="text-ink-2">Source updated</dt><dd>{date(pv.source_updated_at)}</dd>
          <dt className="text-ink-2">Freshness</dt><dd><Badge tone={pv.freshness.label === 'stale' ? 'warn' : 'neutral'}>{pv.freshness.label}{pv.freshness.days !== null ? ` · ${pv.freshness.days}d` : ''}</Badge></dd>
          <dt className="text-ink-2">License</dt><dd>{pv.license ?? '—'}</dd>
          <dt className="text-ink-2">Permitted use</dt><dd>{pv.permitted_use ?? '—'}</dd>
          <dt className="text-ink-2">Verification</dt><dd>{label(pv.verification_status)}</dd>
        </dl>
        {p.sources.length > 0 && <div className="mt-3 text-xs text-ink-2">Linked source records: {p.sources.map((s: any) => `${s.source_key}:${s.external_id}`).join(', ')}</div>}
      </Card>
      <Card><CardTitle hint="Encrypted at rest; staff only unless an investor is granted access">Restricted</CardTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm"><dt className="text-ink-2">Seller contact</dt><dd>{p.seller_contact ?? '—'}</dd><dt className="text-ink-2">Access</dt><dd>{p.access_info ?? '—'}</dd><dt className="text-ink-2">Notes</dt><dd>{p.notes ?? '—'}</dd></dl>
      </Card>
      <Card><CardTitle hint="Free public datasets; context only — not used in scoring">Enrichment</CardTitle>
        {Object.keys(p.enrichment ?? {}).length ? <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-2 text-xs">{JSON.stringify(p.enrichment, null, 2)}</pre> : <p className="text-sm text-muted">Not enriched yet.</p>}
      </Card>
    </div>
  );
}

function CompForm({ p, onSaved }: { p: any; onSaved: () => void }) {
  const empty = { address_line: '', city: p.city, state: p.state, zip_code: p.zip_code, lat: '', lng: '', property_type: p.property_type, beds: '', baths: '', sqft: '', year_built: '', sale_price: '', sale_date: '', condition_at_sale: 'renovated', sale_type: 'arms_length', source_type: 'manual_verified', source_description: '', source_url: '', deed_book_page: '', notes: '', subdivision: '' };
  const [f, setF] = useState<Record<string, string>>(empty);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const nearby = useApi(`/comps?zip_code=${p.zip_code}&limit=50`);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(f)) if (v !== '') body[k] = ['lat', 'lng', 'beds', 'baths', 'sqft', 'year_built', 'sale_price'].includes(k) ? Number(v) : v;
    try {
      await api('/comps', { body });
      setOk('Saved. Re-run the analysis to include it.');
      setF(empty);
      setError(null);
      void nearby.reload();
      onSaved();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle hint="Closed sales only — from deed records, county sales data or a licensed MLS sold record you verified. Never active listings or assessed values.">Add a verified comparable sale</CardTitle>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-6">
          <Field label="Address" className="md:col-span-3"><Input required value={f.address_line} onChange={set('address_line')} /></Field>
          <Field label="City"><Input required value={f.city} onChange={set('city')} /></Field>
          <Field label="State"><Input required maxLength={2} value={f.state} onChange={set('state')} /></Field>
          <Field label="ZIP"><Input required value={f.zip_code} onChange={set('zip_code')} /></Field>
          <Field label="Sale price"><Input required type="number" value={f.sale_price} onChange={set('sale_price')} /></Field>
          <Field label="Sale (recording) date"><Input required type="date" value={f.sale_date} onChange={set('sale_date')} /></Field>
          <Field label="Sqft"><Input type="number" value={f.sqft} onChange={set('sqft')} /></Field>
          <Field label="Beds"><Input type="number" value={f.beds} onChange={set('beds')} /></Field>
          <Field label="Baths"><Input type="number" step="0.5" value={f.baths} onChange={set('baths')} /></Field>
          <Field label="Year built"><Input type="number" value={f.year_built} onChange={set('year_built')} /></Field>
          <Field label="Latitude"><Input type="number" step="any" value={f.lat} onChange={set('lat')} /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={f.lng} onChange={set('lng')} /></Field>
          <Field label="Condition at sale"><Select value={f.condition_at_sale} onChange={set('condition_at_sale')}>{['renovated', 'good', 'average', 'poor', 'unknown'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Sale type"><Select value={f.sale_type} onChange={set('sale_type')}>{['arms_length', 'foreclosure', 'reo', 'short_sale', 'non_arms_length', 'auction', 'unknown'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Evidence type"><Select value={f.source_type} onChange={set('source_type')}><option value="manual_verified">Manually verified</option><option value="recorded_deed">Recorded deed</option><option value="licensed_mls_sold">Licensed MLS sold</option></Select></Field>
          <Field label="Source (required)" className="md:col-span-2" hint="e.g. Loudoun deed book 1234/567"><Input required value={f.source_description} onChange={set('source_description')} /></Field>
          <Field label="Deed book/page"><Input value={f.deed_book_page} onChange={set('deed_book_page')} /></Field>
          <Field label="Source URL" className="md:col-span-2"><Input type="url" value={f.source_url} onChange={set('source_url')} /></Field>
          <Field label="Notes" className="md:col-span-6"><Textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
          <div className="md:col-span-6 flex items-center gap-3"><Button>Save comp</Button>{ok && <span className="text-sm text-good">{ok}</span>}</div>
          <div className="md:col-span-6"><ErrorBox error={error} /></div>
        </form>
      </Card>
      <Card>
        <CardTitle hint={`Recorded in ZIP ${p.zip_code}`}>Closed sales on file</CardTitle>
        <Table>
          <thead><tr><Th>Address</Th><Th>Sold</Th><Th>Price</Th><Th>Sqft</Th><Th>Type</Th><Th>Source</Th></tr></thead>
          <tbody>{(nearby.data ?? []).map((c: any) => (
            <tr key={c.id}><Td>{c.address_line} <DemoBadge show={c.is_demo} /></Td><Td>{date(c.sale_date)}</Td><Td className="tabular">{usd(c.sale_price)}</Td><Td className="tabular">{num(c.sqft)}</Td><Td className="text-xs">{label(c.sale_type)} · {label(c.condition_at_sale)}</Td><Td className="text-xs text-ink-2">{c.data_provider}<div>{label(c.verification_status)}</div></Td></tr>))}</tbody>
        </Table>
      </Card>
    </div>
  );
}

function RenovationEditor({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { data, reload } = useApi(`/properties/${id}/renovation`);
  const [items, setItems] = useState<Record<string, string>>({});
  const [method, setMethod] = useState('manual');
  const [scope, setScope] = useState('medium');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (data) {
      setItems(Object.fromEntries(Object.entries(data.current.line_items ?? {}).map(([k, v]) => [k, String(Math.round(v as number))])));
      setScope(data.current.scope);
    }
  }, [data]);
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const total = Object.values(items).reduce((s, v) => s + (Number(v) || 0), 0);
  async function save() {
    try {
      await api(`/properties/${id}/renovation`, { body: { method, scope, notes, line_items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, Number(v) || 0])) } });
      setError(null);
      await reload();
      onSaved();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle hint={`Currently used: ${label(data.current_method)}. Saving replaces it for future analyses.`}>Renovation budget editor</CardTitle>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="manual">Analyst estimate</option><option value="contractor_bid">Contractor bid</option></Select></Field>
          <Field label="Scope"><Select value={scope} onChange={(e) => setScope(e.target.value)}>{['cosmetic', 'light', 'medium', 'heavy', 'gut'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {data.line_items.map((k: string) => (
            <Field key={k} label={label(k)}><Input type="number" value={items[k] ?? '0'} onChange={(e) => setItems({ ...items, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <Field label="Notes" className="mt-3"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="mt-3 flex items-center justify-between"><span className="tabular font-semibold">Total {usd(total)}</span><Button onClick={save}>Save estimate</Button></div>
        <ErrorBox error={error} />
      </Card>
      <Card>
        <CardTitle hint={`Scope ${data.rule_based_preview.scope}; market cost multiplier applied`}>Rule-based estimate {usd(data.rule_based_preview.total)}</CardTitle>
        <ul className="space-y-1.5 text-sm">
          {Object.entries(data.rule_based_preview.line_items as Record<string, number>).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2"><span><span className="text-ink-2">{label(k)}</span><div className="text-xs text-muted">{data.rule_based_preview.basis[k]}</div></span><span className="tabular">{usd(v)}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Planning-level unit costs. Replace with contractor bids before any commitment.</p>
      </Card>
    </div>
  );
}
