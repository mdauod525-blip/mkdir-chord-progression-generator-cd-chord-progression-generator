'use client';
import { useApp, useSettings } from '@/components/AppContext';
import { Badge, Button, Card, Field, inputCls, PageHeader, Segmented } from '@/components/ui';
import { COMPONENT_LABELS, DEFAULT_WEIGHTS, type ComponentKey } from '@/lib/scoring/score';

export default function SettingsPage() {
  const { status } = useApp();
  const [settings, setSettings] = useSettings();
  const total = Object.values(settings.weights).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Data & settings" />
      <Card title="Data sources" action={<Badge tone={status?.mode === 'demo' ? 'demo' : 'accent'}>{status?.mode === 'demo' ? 'Demo mode' : 'Live EOD mode'}</Badge>}>
        <ul className="space-y-1 text-sm">{status?.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="font-semibold">Prices</dt><dd className="text-muted">{status?.price ? `${status.price.name}${status.fallbackPrice ? `; fallback ${status.fallbackPrice.name}` : ''}` : 'Demo generator (fictional companies)'}</dd>
            {status?.price?.limitations.map((l) => <dd key={l} className="text-xs text-muted">– {l}</dd>)}</div>
          <div><dt className="font-semibold">Fundamentals</dt><dd className="text-muted">{status?.fundamentals?.name ?? 'Not configured'}</dd>
            {status?.fundamentals?.limitations.map((l) => <dd key={l} className="text-xs text-muted">– {l}</dd>)}</div>
          <div><dt className="font-semibold">Estimates & earnings dates</dt><dd className="text-muted">{status?.estimates?.name ?? (status?.mode === 'demo' ? 'Fictional demo dates only' : 'Not configured')}</dd></div>
          <div><dt className="font-semibold">Benchmark</dt><dd className="text-muted">{status?.benchmark.name}</dd></div>
        </dl>
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
          <div className="font-semibold">Connect free real data (server-side keys, never sent to the browser)</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>Copy <code>.env.example</code> to <code>.env.local</code> in the <code>positionscope</code> folder.</li>
            <li>Set <code>TIINGO_API_KEY</code> (free account at tiingo.com) — adjusted end-of-day prices.</li>
            <li>Set <code>SEC_USER_AGENT</code> to e.g. <code>PositionScope you@example.com</code> — free SEC filings data.</li>
            <li>Optional: <code>ALPHAVANTAGE_API_KEY</code> for forward P/E, PEG, analyst targets and earnings dates (25 requests/day).</li>
            <li>Restart the server.</li>
          </ol>
        </div>
        <p className="mt-2 text-xs text-muted">Nothing in this app is real-time. Demo and live data keep separate watchlists, alerts and paper portfolios.</p>
      </Card>

      <Card title="Appearance">
        <Segmented label="Theme" value={settings.theme} onChange={(theme) => setSettings({ ...settings, theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>

      <Card title="Opportunity score weights" action={<span className={`text-sm font-semibold ${total === 100 ? 'text-muted' : 'text-warn'}`}>Total {total}</span>}>
        <p className="mb-3 text-xs text-muted">Weights are normalized, so they need not add to 100. Missing components are always scored at 25/100 regardless of weight.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(DEFAULT_WEIGHTS) as ComponentKey[]).map((k) => (
            <Field key={k} label={`${COMPONENT_LABELS[k]} (default ${DEFAULT_WEIGHTS[k]})`}>
              <input className={inputCls} type="number" min={0} max={100} value={settings.weights[k]} onChange={(e) => setSettings({ ...settings, weights: { ...settings.weights, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
            </Field>
          ))}
        </div>
        <Button className="mt-3" variant="secondary" onClick={() => setSettings({ ...settings, weights: DEFAULT_WEIGHTS })}>Reset to defaults</Button>
      </Card>

      <Card title="Your data">
        <p className="text-sm text-muted">Watchlists, alerts, paper trades and settings are stored only in this browser (localStorage). Clearing site data deletes them, and they do not sync between devices yet.</p>
      </Card>
    </div>
  );
}
