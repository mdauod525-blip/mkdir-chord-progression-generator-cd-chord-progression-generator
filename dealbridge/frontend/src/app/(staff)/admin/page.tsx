'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { date, label, usd } from '@/lib/format';
import { Badge, Button, Card, CardTitle, ErrorBox, Field, Input, PageHeader, Select, Table, Tabs, Td, Textarea, Th } from '@/components/ui';
import { useMe } from '@/components/auth';

export default function Admin() {
  const [tab, setTab] = useState('markets');
  const { me } = useMe();
  return (
    <div>
      <PageHeader title="Administration & settings" sub={me?.role === 'admin' ? undefined : 'Read-only for analysts; changes require an admin.'} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'markets', label: 'Markets' }, { id: 'sources', label: 'Data sources' }, { id: 'ai', label: 'AI & automation' },
        { id: 'templates', label: 'Templates' }, { id: 'pricing', label: 'Pricing tiers' }, { id: 'users', label: 'Users' }, { id: 'audit', label: 'Audit log' },
      ]} />
      {tab === 'markets' && <Markets />}
      {tab === 'sources' && <Sources />}
      {tab === 'ai' && <AiSettings />}
      {tab === 'templates' && <Templates />}
      {tab === 'pricing' && <Pricing />}
      {tab === 'users' && <Users />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function Markets() {
  const { data, reload } = useApi('/markets');
  const [sel, setSel] = useState<any>(null);
  const [json, setJson] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [nm, setNm] = useState({ name: '', state: '', region: '', counties: '', cities: '', zip_codes: '', assumption_profile: '' });
  useEffect(() => { if (sel) setJson(JSON.stringify(sel.assumptions, null, 2)); }, [sel]);
  const split = (s: string) => s.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardTitle>Investment markets</CardTitle>
        <ul className="space-y-1 text-sm">{data?.map((m: any) => (
          <li key={m.id}><button className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 ${sel?.id === m.id ? 'bg-surface-2 font-medium' : ''}`} onClick={() => setSel(m)}>{m.name} <span className="text-xs text-muted">{m.region} · {m.zip_codes.length} ZIPs</span></button></li>))}</ul>
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <div className="text-xs font-semibold text-ink-2">Add a market (expansion)</div>
          <Input placeholder="Name, e.g. Montgomery County, MD" value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2"><Input placeholder="State" maxLength={2} value={nm.state} onChange={(e) => setNm({ ...nm, state: e.target.value })} /><Input placeholder="Region" value={nm.region} onChange={(e) => setNm({ ...nm, region: e.target.value })} /></div>
          <Input placeholder="Counties (comma separated)" value={nm.counties} onChange={(e) => setNm({ ...nm, counties: e.target.value })} />
          <Input placeholder="Cities" value={nm.cities} onChange={(e) => setNm({ ...nm, cities: e.target.value })} />
          <Textarea rows={2} placeholder="ZIP codes" value={nm.zip_codes} onChange={(e) => setNm({ ...nm, zip_codes: e.target.value })} />
          <Select value={nm.assumption_profile} onChange={(e) => setNm({ ...nm, assumption_profile: e.target.value })}><option value="">Default assumptions</option><option value="northern_virginia">Northern Virginia profile</option><option value="shenandoah_valley_va">Shenandoah Valley profile</option><option value="eastern_panhandle_wv">Eastern Panhandle profile</option></Select>
          <Button variant="outline" onClick={async () => { try { await api('/markets', { body: { ...nm, counties: split(nm.counties), cities: split(nm.cities), zip_codes: split(nm.zip_codes), assumption_profile: nm.assumption_profile || null } }); setErr(null); void reload(); } catch (e) { setErr(e); } }}>Add market</Button>
        </div>
      </Card>
      <Card className="lg:col-span-2"><CardTitle hint={sel ? `Last reviewed ${date(sel.assumptions_reviewed_at)}. These are estimates — confirm with local title, lender, insurer and contractor quotes.` : 'Select a market'}>{sel ? `${sel.name} — underwriting assumptions` : 'Assumptions'}</CardTitle>
        {sel && <>
          <Textarea rows={22} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
          <Button className="mt-2" onClick={async () => { try { const v = JSON.parse(json); delete v.fhfa_place_id; await api(`/markets/${sel.id}/assumptions`, { method: 'PUT', body: { values: v } }); setErr(null); void reload(); } catch (e) { setErr(e); } }}>Save assumptions</Button>
        </>}
        <ErrorBox error={err} />
      </Card>
    </div>
  );
}

function Sources() {
  const { data, reload } = useApi('/data-sources');
  const [sel, setSel] = useState<any>(null);
  const [cfg, setCfg] = useState('');
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => { if (sel) setCfg(JSON.stringify(sel.config, null, 2)); setOut(null); }, [sel]);
  const act = async (fn: () => Promise<any>) => { try { setOut(await fn()); setErr(null); void reload(); } catch (e) { setErr(e); } };
  const tiers: Record<string, any> = { free: 'good', free_key: 'accent', paid: 'warn' };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Table><thead><tr><Th>Source</Th><Th>Cost</Th><Th>Status</Th></tr></thead>
          <tbody>{data?.map((s: any) => (
            <tr key={s.key} onClick={() => setSel(s)} className={`cursor-pointer hover:bg-surface-2 ${sel?.key === s.key ? 'bg-surface-2' : ''}`}>
              <Td><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{label(s.category)} · {s.connector}</div></Td>
              <Td><Badge tone={tiers[s.cost_tier]}>{label(s.cost_tier)}</Badge></Td>
              <Td className="text-xs">{s.enabled ? <Badge tone="good">enabled</Badge> : <Badge>off</Badge>}{s.last_status && <div className="mt-1 text-muted">{label(s.last_status)}</div>}</Td>
            </tr>))}</tbody></Table>
      </div>
      <Card className="lg:col-span-3">
        {!sel ? <p className="text-sm text-muted">Select a source. Each connector uses only official downloads or documented APIs, records provenance on every record, and never bypasses authentication, CAPTCHAs, rate limits or terms.</p> : <>
          <CardTitle hint={sel.notes}>{sel.name}</CardTitle>
          <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-2">License</dt><dd>{sel.license ?? '— (set before use)'}</dd>
            <dt className="text-ink-2">Permitted use</dt><dd>{sel.permitted_use ?? '—'}</dd>
            <dt className="text-ink-2">Endpoint</dt><dd className="break-all text-xs">{sel.base_url ?? '—'}</dd>
            {sel.credential_env_var && <><dt className="text-ink-2">Credential</dt><dd>{sel.credential_env_var} {sel.credentials_present ? <Badge tone="good">present</Badge> : <Badge tone="warn">missing</Badge>}</dd></>}
            <dt className="text-ink-2">Schedule</dt><dd>{sel.schedule}</dd>
            {sel.last_run && <><dt className="text-ink-2">Last run</dt><dd className="text-xs">{label(sel.last_run.status)} · +{sel.last_run.created} · {sel.last_run.errors?.[0]}</dd></>}
          </dl>
          {sel.cost_tier === 'paid' ? <p className="rounded-lg bg-warn-bg p-2 text-sm text-warn">Optional paid module — disabled in the free MVP. See docs/DATA_SOURCES.md for the cost/benefit case required before purchasing.</p> : <>
            <Field label="Connector config (JSON: layer_url / dataset, field_map, defaults)"><Textarea rows={12} className="font-mono text-xs" value={cfg} onChange={(e) => setCfg(e.target.value)} /></Field>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => act(() => api(`/data-sources/${sel.key}`, { method: 'PATCH', body: { config: JSON.parse(cfg) } }))}>Save config</Button>
              <Button variant="outline" onClick={() => act(() => api(`/data-sources/${sel.key}`, { method: 'PATCH', body: { enabled: !sel.enabled } }))}>{sel.enabled ? 'Disable' : 'Enable'}</Button>
              {sel.connector === 'arcgis_feature' && <Button variant="outline" onClick={() => act(() => api(`/data-sources/${sel.key}/describe`))}>Describe layer fields</Button>}
              {!['enrichment'].includes(sel.category) && <Button variant="outline" onClick={() => act(() => api(`/data-sources/${sel.key}/run?max_records=500`, { method: 'POST' }))}>Run now (500)</Button>}
              <Select className="w-36" value={sel.schedule ?? 'manual'} onChange={(e) => act(() => api(`/data-sources/${sel.key}`, { method: 'PATCH', body: { schedule: e.target.value } }))}>{['daily', 'weekly', 'monthly', 'manual'].map((s) => <option key={s}>{s}</option>)}</Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <input type="file" accept=".csv,.json,.geojson,.parquet" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
              <Button variant="outline" disabled={!file} onClick={() => act(() => { const fd = new FormData(); fd.append('file', file!); return api(`/data-sources/${sel.key}/upload`, { form: fd }); })}>Import file</Button>
              <span className="text-xs text-muted">CSV, JSON, GeoJSON or Parquet downloaded from the official source.</span>
            </div>
          </>}
          <ErrorBox error={err} />
          {out && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-surface-2 p-2 text-xs">{JSON.stringify(out, null, 2)}</pre>}
        </>}
      </Card>
    </div>
  );
}

function AiSettings() {
  const s = useApi('/settings');
  const u = useApi('/ai/usage');
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (s.data) setForm(s.data); }, [s.data]);
  if (!form) return null;
  const keys: [string, string, string][] = [
    ['ai_enabled', 'AI features enabled', 'bool'], ['ai_monthly_budget_usd', 'Monthly AI budget (USD)', 'num'], ['ai_daily_request_limit', 'Daily AI request limit', 'num'],
    ['ai_summary_min_score', 'Only auto-summarize deals scoring ≥', 'num'], ['alert_min_score', 'Alert admins for deals scoring ≥', 'num'], ['match_min_score', 'Minimum match score to notify', 'num'],
    ['include_demo_data', 'Include demo data in workflows', 'bool'], ['agent_daily_enabled', 'Daily workflow enabled', 'bool'], ['agent_weekly_enabled', 'Weekly workflow enabled', 'bool'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardTitle hint="Numbers are always computed deterministically; Claude only explains them.">AI cost control & automation</CardTitle>
        <div className="grid grid-cols-2 gap-3">{keys.map(([k, l, t]) => t === 'bool'
          ? <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />{l}</label>
          : <Field key={k} label={l}><Input type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} /></Field>)}</div>
        <Field label="Alert thresholds (% of budget, comma separated)" className="mt-3"><Input value={(form.ai_alert_thresholds_pct ?? []).join(', ')} onChange={(e) => setForm({ ...form, ai_alert_thresholds_pct: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) })} /></Field>
        <Field label="Investor-facing disclosure" className="mt-3"><Textarea rows={5} value={form.disclosure_text} onChange={(e) => setForm({ ...form, disclosure_text: e.target.value })} /></Field>
        <div className="mt-3 flex items-center gap-2"><Button onClick={async () => { try { await api('/settings', { method: 'PUT', body: form }); setErr(null); setSaved(true); } catch (e) { setErr(e); } }}>Save settings</Button>{saved && <span className="text-sm text-good">Saved</span>}</div>
        <ErrorBox error={err} />
      </Card>
      <Card><CardTitle hint={u.data ? `Model ${u.data.model} · API key ${u.data.configured ? 'configured' : 'NOT configured (deterministic text only)'}` : ''}>AI usage this month</CardTitle>
        {u.data && <>
          <div className="mb-2 text-sm">Spend <b className="tabular">{usd(u.data.month_spend_usd, 2)}</b> of {usd(u.data.monthly_budget_usd, 2)} ({u.data.budget_used_pct ?? 0}%) · {u.data.requests_last_24h}/{u.data.daily_request_limit} requests in 24h</div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, u.data.budget_used_pct ?? 0)}%`, background: (u.data.budget_used_pct ?? 0) >= 80 ? 'var(--bad)' : 'var(--series-1)' }} /></div>
          <Table><thead><tr><Th>Task</Th><Th>Calls</Th><Th>Cache hits</Th><Th>Tokens in/out</Th><Th>Cost</Th></tr></thead>
            <tbody>{u.data.by_task.map((t: any) => <tr key={t.task}><Td>{label(t.task)}</Td><Td className="tabular">{t.calls}</Td><Td className="tabular">{t.cache_hits}</Td><Td className="tabular">{t.input_tokens}/{t.output_tokens}</Td><Td className="tabular">{usd(t.cost_usd, 4)}</Td></tr>)}</tbody></Table>
        </>}
      </Card>
    </div>
  );
}

function Templates() {
  const { data, reload } = useApi('/templates');
  const [sel, setSel] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardTitle>Message templates</CardTitle><ul className="space-y-1 text-sm">{data?.map((t: any) => <li key={t.key}><button className="hover:text-accent" onClick={() => setSel({ ...t })}>{t.name}</button> <Badge>{t.channel}</Badge>{t.customized && <Badge tone="accent" className="ml-1">custom</Badge>}</li>)}</ul></Card>
      <Card className="lg:col-span-2">{sel ? <>
        <CardTitle hint="Jinja syntax: {{ investor.name }}, {{ opportunity.title }}, {{ opportunity.url }}… Unsubscribe link, mailing address and disclosures are appended automatically to emails.">{sel.name}</CardTitle>
        {sel.channel === 'email' && <Field label="Subject"><Input value={sel.subject ?? ''} onChange={(e) => setSel({ ...sel, subject: e.target.value })} /></Field>}
        <Field label="Body" className="mt-2"><Textarea rows={12} className="font-mono text-xs" value={sel.body} onChange={(e) => setSel({ ...sel, body: e.target.value })} /></Field>
        <Button className="mt-2" onClick={async () => { try { await api(`/templates/${sel.key}`, { method: 'PUT', body: { name: sel.name, channel: sel.channel, subject: sel.subject, body: sel.body } }); setErr(null); void reload(); } catch (e) { setErr(e); } }}>Save template</Button>
        <ErrorBox error={err} /></> : <p className="text-sm text-muted">Select a template.</p>}</Card>
    </div>
  );
}

function Pricing() {
  const { data, reload } = useApi('/admin/pricing');
  const [err, setErr] = useState<unknown>(null);
  return (
    <div>
      <p className="mb-3 text-sm text-ink-2">Subscription tiers only. Transaction-based success fees, brokerage commissions and capital-raising compensation are intentionally not implemented — they require legal review and appropriate licensing.</p>
      <ErrorBox error={err} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{data?.map((t: any) => (
        <Card key={t.key}>
          <CardTitle hint={label(t.audience)}>{t.name}</CardTitle>
          <Field label="Monthly price"><Input type="number" defaultValue={t.monthly_price} onBlur={async (e) => { try { await api(`/admin/pricing/${t.key}`, { method: 'PUT', body: { ...t, monthly_price: Number(e.target.value) } }); void reload(); } catch (x) { setErr(x); } }} /></Field>
          <ul className="mt-2 list-disc pl-4 text-xs text-ink-2">{t.features.map((f: string) => <li key={f}>{f}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={t.is_active} onChange={async () => { await api(`/admin/pricing/${t.key}`, { method: 'PUT', body: { ...t, is_active: !t.is_active } }); void reload(); }} />Active</label>
        </Card>))}</div>
    </div>
  );
}

function Users() {
  const { data, reload } = useApi('/users');
  const [f, setF] = useState({ email: '', full_name: '', role: 'analyst', password: '' });
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2"><Table><thead><tr><Th>User</Th><Th>Role</Th><Th>Approved</Th><Th>Last login</Th><Th /></tr></thead>
        <tbody>{data?.map((u: any) => <tr key={u.id}><Td>{u.full_name}<div className="text-xs text-muted">{u.email}</div></Td><Td>{u.role}</Td><Td>{u.is_approved ? 'yes' : 'no'}</Td><Td className="text-xs">{date(u.last_login_at)}</Td>
          <Td><Button size="sm" variant="ghost" onClick={async () => { try { await api(`/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }); void reload(); } catch (e) { setErr(e); } }}>{u.is_active ? 'Deactivate' : 'Activate'}</Button></Td></tr>)}</tbody></Table></div>
      <Card><CardTitle>Add staff user</CardTitle>
        <div className="space-y-2">
          <Input placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <Input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="analyst">Analyst</option><option value="admin">Admin</option></Select>
          <Input placeholder="Temporary password (12+ chars)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <Button onClick={async () => { try { await api('/users', { body: f }); setErr(null); void reload(); } catch (e) { setErr(e); } }}>Create</Button>
          <ErrorBox error={err} />
        </div>
      </Card>
    </div>
  );
}

function Audit() {
  const { data, error } = useApi('/audit-logs?limit=300');
  return (
    <>
      <ErrorBox error={error} />
      <Table><thead><tr><Th>When</Th><Th>Action</Th><Th>Entity</Th><Th>User</Th><Th>IP</Th><Th>Details</Th></tr></thead>
        <tbody>{data?.map((a: any) => <tr key={a.id}><Td className="whitespace-nowrap text-xs">{new Date(a.created_at).toLocaleString()}</Td><Td className="text-xs font-medium">{a.action}</Td><Td className="text-xs">{a.entity_type} {a.entity_id?.slice(0, 8)}</Td><Td className="text-xs">{a.user_id?.slice(0, 8)}</Td><Td className="text-xs">{a.ip_address}</Td><Td className="max-w-md truncate text-xs text-muted">{a.details ? JSON.stringify(a.details) : ''}</Td></tr>)}</tbody></Table>
    </>
  );
}
