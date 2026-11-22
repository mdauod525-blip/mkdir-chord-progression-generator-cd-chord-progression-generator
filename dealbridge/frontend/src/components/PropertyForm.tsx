'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { label } from '@/lib/format';
import { Button, Card, CardTitle, ErrorBox, Field, Input, Select, Textarea } from './ui';

const OPP = ['foreclosure', 'pre_foreclosure', 'reo', 'auction', 'probate', 'estate_sale', 'vacant', 'distressed', 'needs_renovation', 'price_reduced', 'extended_dom', 'fsbo', 'wholesale', 'off_market', 'hud_home', 'tax_lien', 'underpriced'];
const ISSUES = ['roof', 'hvac', 'electrical', 'plumbing', 'foundation', 'water_damage', 'mold', 'fire_damage', 'kitchen', 'bathrooms'];

const nums = ['lat', 'lng', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'stories', 'list_price', 'days_on_market', 'annual_taxes', 'hoa_monthly', 'assessed_value', 'estimated_market_value'];

export function PropertyForm({ staff, onCreated }: { staff: boolean; onCreated: (id: string) => void }) {
  const [f, setF] = useState<Record<string, any>>({ state: 'VA', property_type: 'single_family', condition: 'unknown', listing_status: 'unknown', opportunity_types: [], distress_signals: [], source_description: staff ? 'manual entry' : 'wholesaler submission' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (k: string, v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v === '' || v === undefined) continue;
      body[k] = nums.includes(k) ? Number(v) : v;
    }
    try {
      const r = await api<{ id: string }>('/properties', { body });
      onCreated(r.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardTitle hint="Used for de-duplication across sources">Location</CardTitle>
        <div className="grid gap-3 md:grid-cols-6">
          <Field label="Street address" className="md:col-span-3"><Input required value={f.address_line ?? ''} onChange={set('address_line')} /></Field>
          <Field label="Unit"><Input value={f.unit ?? ''} onChange={set('unit')} /></Field>
          <Field label="City" className="md:col-span-2"><Input required value={f.city ?? ''} onChange={set('city')} /></Field>
          <Field label="State"><Select value={f.state} onChange={set('state')}>{['VA', 'WV', 'MD', 'DC'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="ZIP"><Input required pattern="\d{5}(-\d{4})?" value={f.zip_code ?? ''} onChange={set('zip_code')} /></Field>
          <Field label="County"><Input value={f.county ?? ''} onChange={set('county')} /></Field>
          <Field label="Parcel ID"><Input value={f.parcel_id ?? ''} onChange={set('parcel_id')} /></Field>
          <Field label="Latitude" hint="Needed for radius comps"><Input type="number" step="any" value={f.lat ?? ''} onChange={set('lat')} /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={f.lng ?? ''} onChange={set('lng')} /></Field>
          <Field label="Subdivision" className="md:col-span-2"><Input value={f.subdivision ?? ''} onChange={set('subdivision')} /></Field>
        </div>
      </Card>
      <Card>
        <CardTitle>Property</CardTitle>
        <div className="grid gap-3 md:grid-cols-6">
          <Field label="Type" className="md:col-span-2"><Select value={f.property_type} onChange={set('property_type')}>{['single_family', 'townhouse', 'condo', 'multi_family_2_4', 'manufactured', 'land', 'other'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Beds"><Input type="number" step="1" value={f.beds ?? ''} onChange={set('beds')} /></Field>
          <Field label="Baths"><Input type="number" step="0.5" value={f.baths ?? ''} onChange={set('baths')} /></Field>
          <Field label="Living sqft"><Input type="number" value={f.sqft ?? ''} onChange={set('sqft')} /></Field>
          <Field label="Lot sqft"><Input type="number" value={f.lot_sqft ?? ''} onChange={set('lot_sqft')} /></Field>
          <Field label="Year built"><Input type="number" value={f.year_built ?? ''} onChange={set('year_built')} /></Field>
          <Field label="Stories"><Input type="number" step="0.5" value={f.stories ?? ''} onChange={set('stories')} /></Field>
          <Field label="Condition" className="md:col-span-2"><Select value={f.condition} onChange={set('condition')}>{['unknown', 'excellent', 'good', 'fair', 'poor', 'distressed'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Annual taxes"><Input type="number" value={f.annual_taxes ?? ''} onChange={set('annual_taxes')} /></Field>
          <Field label="HOA / month"><Input type="number" value={f.hoa_monthly ?? ''} onChange={set('hoa_monthly')} /></Field>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-ink-2">Known issues (drive the renovation estimate)</div>
          <div className="flex flex-wrap gap-2">{ISSUES.map((i) => (
            <label key={i} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.distress_signals.includes(i)} onChange={() => toggle('distress_signals', i)} />{label(i)}</label>))}</div>
        </div>
      </Card>
      <Card>
        <CardTitle hint="Only mark 'active' with a listing URL or supporting source. Public assessment records never establish availability.">Listing & opportunity</CardTitle>
        <div className="grid gap-3 md:grid-cols-6">
          <Field label="Listing status" className="md:col-span-2"><Select value={f.listing_status} onChange={set('listing_status')}>{['unknown', 'off_market', 'active', 'pending', 'auction', 'sold', 'withdrawn'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <Field label="Asking / list price"><Input type="number" value={f.list_price ?? ''} onChange={set('list_price')} /></Field>
          <Field label="Days on market"><Input type="number" value={f.days_on_market ?? ''} onChange={set('days_on_market')} /></Field>
          <Field label="Listing URL" className="md:col-span-2"><Input type="url" value={f.listing_url ?? ''} onChange={set('listing_url')} /></Field>
          <Field label="Assessed value" hint="Tax figure — never used as ARV"><Input type="number" value={f.assessed_value ?? ''} onChange={set('assessed_value')} /></Field>
          <Field label="Source description" className="md:col-span-3"><Input required value={f.source_description} onChange={set('source_description')} /></Field>
          <Field label="Source URL" className="md:col-span-2"><Input type="url" value={f.source_url ?? ''} onChange={set('source_url')} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{OPP.map((o) => (
          <label key={o} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.opportunity_types.includes(o)} onChange={() => toggle('opportunity_types', o)} />{label(o)}</label>))}</div>
      </Card>
      <Card>
        <CardTitle hint="Encrypted at rest; visible only to staff and investors granted access">Restricted information</CardTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Seller contact"><Textarea rows={2} value={f.seller_contact ?? ''} onChange={set('seller_contact')} /></Field>
          <Field label="Property access (lockbox, showing instructions)"><Textarea rows={2} value={f.access_info ?? ''} onChange={set('access_info')} /></Field>
          <Field label="Notes" className="md:col-span-2"><Textarea rows={3} value={f.notes ?? ''} onChange={set('notes')} /></Field>
        </div>
        {staff && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.verified_by_staff} onChange={(e) => setF({ ...f, verified_by_staff: e.target.checked })} /> I verified these facts against the source</label>}
        {!staff && <p className="mt-3 text-xs text-muted">By submitting you confirm you have the right to share this opportunity and that the information is accurate to your knowledge.</p>}
      </Card>
      <ErrorBox error={error} />
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save property'}</Button>
    </form>
  );
}
