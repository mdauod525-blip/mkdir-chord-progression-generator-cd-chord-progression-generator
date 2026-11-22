'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { label } from '@/lib/format';
import { Button, Card, CardTitle, Disclaimer, ErrorBox, Field, Input, PageHeader, Select } from '@/components/ui';
import { AnalysisView } from '@/components/deal';

type C = { sale_price: string; sale_date: string; sqft: string; beds: string; baths: string; distance_miles: string; condition_at_sale: string };
const blank: C = { sale_price: '', sale_date: '', sqft: '', beds: '', baths: '', distance_miles: '', condition_at_sale: 'renovated' };

export default function Analyzer() {
  const [f, setF] = useState<Record<string, string>>({ purchase_price: '250000', renovation_total: '', arv: '', sqft: '1700', beds: '3', baths: '2', year_built: '1985', condition: 'fair', scope: '', property_type: 'single_family', annual_taxes: '', hoa_monthly: '', days_on_market: '', market_profile: 'northern_virginia', financing_type: 'hard_money', interest_rate_pct: '', loan_to_purchase_pct: '', target_profit_pct_of_arv: '', agent_commission_pct: '' });
  const [comps, setComps] = useState<C[]>([]);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v === '' ? null : Number(v));
  async function calc(e: React.FormEvent) {
    e.preventDefault();
    const overrides: Record<string, any> = { financing_type: f.financing_type };
    for (const k of ['interest_rate_pct', 'loan_to_purchase_pct', 'target_profit_pct_of_arv', 'agent_commission_pct']) if (f[k] !== '') overrides[k] = Number(f[k]);
    try {
      setRes(await api('/analyzer/calculate', {
        body: {
          purchase_price: n(f.purchase_price), renovation_total: n(f.renovation_total), arv: n(f.arv), sqft: n(f.sqft), beds: n(f.beds), baths: n(f.baths),
          year_built: n(f.year_built), condition: f.condition, scope: f.scope || null, property_type: f.property_type, annual_taxes: n(f.annual_taxes),
          hoa_monthly: n(f.hoa_monthly), days_on_market: n(f.days_on_market), market_profile: f.market_profile || null, assumption_overrides: overrides,
          comps: comps.filter((c) => c.sale_price && c.sale_date).map((c) => ({ sale_price: Number(c.sale_price), sale_date: c.sale_date, sqft: n(c.sqft), beds: n(c.beds), baths: n(c.baths), distance_miles: n(c.distance_miles), condition_at_sale: c.condition_at_sale })),
        },
      }));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div>
      <PageHeader title="Deal analyzer" sub="Standalone fix-and-flip calculator. Enter closed comparable sales for a comp-supported ARV; an entered ARV is treated as an unverified override." />
      <form onSubmit={calc} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardTitle>Deal inputs</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase price"><Input required type="number" value={f.purchase_price} onChange={set('purchase_price')} /></Field>
            <Field label="Market profile"><Select value={f.market_profile} onChange={set('market_profile')}><option value="northern_virginia">Northern Virginia</option><option value="shenandoah_valley_va">Winchester / Frederick VA</option><option value="eastern_panhandle_wv">Eastern Panhandle WV</option><option value="">Defaults</option></Select></Field>
            <Field label="Renovation total" hint="Blank = rule-based estimate"><Input type="number" value={f.renovation_total} onChange={set('renovation_total')} /></Field>
            <Field label="ARV override" hint="Prefer comps below"><Input type="number" value={f.arv} onChange={set('arv')} /></Field>
            <Field label="Sqft"><Input type="number" value={f.sqft} onChange={set('sqft')} /></Field>
            <Field label="Year built"><Input type="number" value={f.year_built} onChange={set('year_built')} /></Field>
            <Field label="Beds"><Input type="number" value={f.beds} onChange={set('beds')} /></Field>
            <Field label="Baths"><Input type="number" step="0.5" value={f.baths} onChange={set('baths')} /></Field>
            <Field label="Condition"><Select value={f.condition} onChange={set('condition')}>{['unknown', 'excellent', 'good', 'fair', 'poor', 'distressed'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Scope"><Select value={f.scope} onChange={set('scope')}><option value="">From condition</option>{['cosmetic', 'light', 'medium', 'heavy', 'gut'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Annual taxes"><Input type="number" value={f.annual_taxes} onChange={set('annual_taxes')} /></Field>
            <Field label="HOA / month"><Input type="number" value={f.hoa_monthly} onChange={set('hoa_monthly')} /></Field>
            <Field label="Days on market"><Input type="number" value={f.days_on_market} onChange={set('days_on_market')} /></Field>
            <Field label="Financing"><Select value={f.financing_type} onChange={set('financing_type')}><option value="hard_money">Hard money</option><option value="cash">All cash</option></Select></Field>
            <Field label="Interest rate %" hint="Default 11"><Input type="number" step="0.1" value={f.interest_rate_pct} onChange={set('interest_rate_pct')} /></Field>
            <Field label="Loan-to-purchase %" hint="Default 85"><Input type="number" value={f.loan_to_purchase_pct} onChange={set('loan_to_purchase_pct')} /></Field>
            <Field label="Target profit % ARV" hint="Default 12"><Input type="number" value={f.target_profit_pct_of_arv} onChange={set('target_profit_pct_of_arv')} /></Field>
            <Field label="Agent commission %" hint="Default 5"><Input type="number" step="0.1" value={f.agent_commission_pct} onChange={set('agent_commission_pct')} /></Field>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardTitle hint="Closed, arm's-length sales you have verified" right={<Button type="button" variant="outline" size="sm" onClick={() => setComps([...comps, { ...blank }])}><Plus size={14} /> Add comp</Button>}>Comparable sales</CardTitle>
          {comps.length === 0 && <p className="text-sm text-muted">No comps entered — the ARV override will be used and the score capped.</p>}
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-8">
                {(['sale_price', 'sale_date', 'sqft', 'beds', 'baths', 'distance_miles'] as const).map((k) => (
                  <Field key={k} label={label(k)}><Input type={k === 'sale_date' ? 'date' : 'number'} step="any" value={c[k]} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></Field>
                ))}
                <Field label="Condition"><Select value={c.condition_at_sale} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, condition_at_sale: e.target.value } : x)))}>{['renovated', 'good', 'average', 'poor', 'unknown'].map((o) => <option key={o}>{o}</option>)}</Select></Field>
                <Button type="button" variant="ghost" aria-label="Remove comp" onClick={() => setComps(comps.filter((_, j) => j !== i))}><Trash2 size={15} /></Button>
              </div>
            ))}
          </div>
          <div className="mt-4"><Button>Calculate</Button></div>
          <div className="mt-2"><ErrorBox error={error} /></div>
        </Card>
      </form>
      {res && <div className="mt-4"><AnalysisView results={res} /></div>}
      <Disclaimer className="mt-6" />
    </div>
  );
}
