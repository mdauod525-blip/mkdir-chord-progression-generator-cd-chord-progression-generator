'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { label } from '@/lib/format';
import { Button, Card, CardTitle, ErrorBox, Field, Input, Select, Textarea } from './ui';

const TYPES = ['individual', 'investment_group', 'private_lender', 'hard_money_lender', 'investment_company', 'jv_partner', 'wholesaler', 'contractor_investor'];
const STRATS = ['fix_and_flip', 'buy_and_hold', 'brrrr', 'wholesale', 'lending', 'jv_equity'];
const PTYPES = ['single_family', 'townhouse', 'condo', 'multi_family_2_4', 'manufactured'];

export function InvestorForm({ initial, mode, onSaved }: { initial?: any; mode: 'staff-create' | 'staff-edit' | 'self'; onSaved: (r: any) => void }) {
  const markets = useApi('/markets');
  const [f, setF] = useState<any>({
    name: '', email: '', entity_name: '', investor_type: 'individual', preferred_markets: [], preferred_zip_codes: [], available_capital: '', min_investment: '', max_investment: '',
    property_types: [], strategies: ['fix_and_flip'], min_roi_pct: '', max_duration_months: '', risk_tolerance: 'medium', experience_level: 'none', funding_availability: 'within_30_days',
    lending_terms: {}, preferences_notes: '', email_consent: false, sms_consent: false, consent_source: '', tags: [], pipeline_stage: 'new',
    ...(initial ?? {}), phone: initial?.phone && !String(initial.phone).includes('•') ? initial.phone : '',
  });
  const [error, setError] = useState<unknown>(null);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const toggle = (k: string, v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  const lender = ['private_lender', 'hard_money_lender'].includes(f.investor_type);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));
    const body: any = {
      entity_name: f.entity_name || null, investor_type: f.investor_type, preferred_markets: f.preferred_markets,
      preferred_zip_codes: typeof f.preferred_zip_codes === 'string' ? f.preferred_zip_codes.split(/[,\s]+/).filter(Boolean) : f.preferred_zip_codes,
      available_capital: n(f.available_capital), min_investment: n(f.min_investment), max_investment: n(f.max_investment), property_types: f.property_types,
      strategies: f.strategies, min_roi_pct: n(f.min_roi_pct), max_duration_months: n(f.max_duration_months), risk_tolerance: f.risk_tolerance,
      experience_level: f.experience_level, funding_availability: f.funding_availability, lending_terms: f.lending_terms ?? {}, preferences_notes: f.preferences_notes || null,
      email_consent: f.email_consent, sms_consent: f.sms_consent,
    };
    if (f.phone) body.phone = f.phone;
    if (mode !== 'self') Object.assign(body, { name: f.name, email: f.email, tags: f.tags ?? [], consent_source: f.consent_source || null, pipeline_stage: f.pipeline_stage });
    try {
      const r = mode === 'staff-create' ? await api('/investors', { body }) : mode === 'staff-edit' ? await api(`/investors/${initial.id}`, { method: 'PUT', body }) : await api('/portal/profile', { method: 'PUT', body });
      setError(null);
      onSaved(r);
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {mode !== 'self' && (
        <Card><CardTitle>Contact</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Name"><Input required value={f.name} onChange={set('name')} /></Field>
            <Field label="Email"><Input required type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone" hint="Encrypted at rest"><Input value={f.phone} onChange={set('phone')} /></Field>
          </div>
        </Card>
      )}
      <Card><CardTitle>Investor profile</CardTitle>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Investor type"><Select value={f.investor_type} onChange={set('investor_type')}>{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Investment entity"><Input value={f.entity_name ?? ''} onChange={set('entity_name')} /></Field>
          <Field label="Experience"><Select value={f.experience_level} onChange={set('experience_level')}>{['none', 'beginner', 'intermediate', 'experienced', 'professional'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Funding availability"><Select value={f.funding_availability} onChange={set('funding_availability')}>{['immediate', 'within_30_days', 'within_90_days', 'not_currently'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Available capital ($)"><Input type="number" value={f.available_capital ?? ''} onChange={set('available_capital')} /></Field>
          <Field label="Min investment ($)"><Input type="number" value={f.min_investment ?? ''} onChange={set('min_investment')} /></Field>
          <Field label="Max investment ($)"><Input type="number" value={f.max_investment ?? ''} onChange={set('max_investment')} /></Field>
          <Field label="Risk tolerance"><Select value={f.risk_tolerance} onChange={set('risk_tolerance')}>{['low', 'medium', 'high'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          {!lender && <Field label="Minimum ROI (%)"><Input type="number" value={f.min_roi_pct ?? ''} onChange={set('min_roi_pct')} /></Field>}
          <Field label="Max project duration (months)"><Input type="number" value={f.max_duration_months ?? ''} onChange={set('max_duration_months')} /></Field>
          {lender && <Field label="Max loan-to-ARV (%)"><Input type="number" value={f.lending_terms?.max_ltv_pct ?? ''} onChange={(e) => setF({ ...f, lending_terms: { ...f.lending_terms, max_ltv_pct: e.target.value ? Number(e.target.value) : undefined } })} /></Field>}
          {lender && <Field label="Typical rate (%)"><Input type="number" step="0.1" value={f.lending_terms?.rate_pct ?? ''} onChange={(e) => setF({ ...f, lending_terms: { ...f.lending_terms, rate_pct: e.target.value ? Number(e.target.value) : undefined } })} /></Field>}
          <Field label="Preferred ZIP codes" className="md:col-span-2" hint="Comma separated"><Input value={Array.isArray(f.preferred_zip_codes) ? f.preferred_zip_codes.join(', ') : f.preferred_zip_codes} onChange={set('preferred_zip_codes')} /></Field>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div><div className="mb-1 text-xs font-medium text-ink-2">Preferred markets</div><div className="flex flex-wrap gap-3">{markets.data?.map((m: any) => <label key={m.id} className="flex items-center gap-1"><input type="checkbox" checked={f.preferred_markets.includes(m.id)} onChange={() => toggle('preferred_markets', m.id)} />{m.name}</label>)}</div></div>
          <div><div className="mb-1 text-xs font-medium text-ink-2">Strategies</div><div className="flex flex-wrap gap-3">{STRATS.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={f.strategies.includes(s)} onChange={() => toggle('strategies', s)} />{label(s)}</label>)}</div></div>
          <div><div className="mb-1 text-xs font-medium text-ink-2">Property types (none = any)</div><div className="flex flex-wrap gap-3">{PTYPES.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={f.property_types.includes(s)} onChange={() => toggle('property_types', s)} />{label(s)}</label>)}</div></div>
        </div>
        <Field label="Other preferences" className="mt-3"><Textarea rows={2} value={f.preferences_notes ?? ''} onChange={set('preferences_notes')} /></Field>
      </Card>
      <Card><CardTitle hint="Email requires opt-in (CAN-SPAM); SMS requires separate express consent (TCPA).">Communication consent</CardTitle>
        <div className="space-y-2 text-sm">
          {mode === 'self' && <Field label="Mobile phone (for SMS, optional)"><Input value={f.phone} onChange={set('phone')} /></Field>}
          <label className="flex gap-2"><input type="checkbox" checked={!!f.email_consent} onChange={(e) => setF({ ...f, email_consent: e.target.checked })} />{mode === 'self' ? 'Email me opportunities that match my preferences.' : 'Investor opted in to email'}</label>
          <label className="flex gap-2"><input type="checkbox" checked={!!f.sms_consent} onChange={(e) => setF({ ...f, sms_consent: e.target.checked })} />{mode === 'self' ? 'Text me deal alerts. Message & data rates may apply; reply STOP to opt out.' : 'Investor gave express written consent to SMS'}</label>
          {mode !== 'self' && <Field label="Where/how consent was obtained" hint="Required when recording consent"><Input value={f.consent_source ?? ''} onChange={set('consent_source')} /></Field>}
        </div>
      </Card>
      <ErrorBox error={error} />
      <Button>Save</Button>
    </form>
  );
}
