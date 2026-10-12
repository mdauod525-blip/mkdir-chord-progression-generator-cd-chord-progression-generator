/** Strumming pattern library and editor (create, edit, save, reuse). */
import { useMemo, useState } from 'react';
import { app, allPatterns, isBuiltInPattern, useApp } from '../state/app';
import { href, navigate } from '../state/router';
import { StrumPatternView } from '../ui/StrumPatternView';
import { Term } from '../ui/Glossary';
import { toast } from '../ui/toast';
import { IconBack, IconPlus } from '../ui/icons';
import { type StrumPattern, type Stroke, GRID_OPTIONS, canSwing, naturalStroke, nextStroke, validatePattern } from '../music/strum';
import { COMMON_METERS, type Meter, barTicks, meterLabel, parseMeter, sameMeter } from '../music/meter';
import { newId } from '../data/song';
import { NotFound } from './NotFound';

export function Patterns() {
  const state = useApp();
  const patterns = allPatterns(state);
  const [meter, setMeter] = useState<string>('');
  const meters = [...new Set(patterns.map((p) => meterLabel(p.meter)))];
  const shown = meter ? patterns.filter((p) => meterLabel(p.meter) === meter) : patterns;
  return (
    <div className="screen patterns">
      <header className="screen-head">
        <h1>Strum patterns</h1>
        <a className="btn btn-primary btn-small" href={href('/patterns/new')}>
          <IconPlus size={16} /> New
        </a>
      </header>
      <p className="muted small">
        Tap <strong>Hear it</strong> to listen. <Term id="strum">How to read these</Term>. Your own patterns can be used in any song with the same time signature.
      </p>
      <div className="chip-row" role="group" aria-label="Time signature">
        <button type="button" className={`chip${!meter ? ' chip-on' : ''}`} onClick={() => setMeter('')}>
          All
        </button>
        {meters.map((m) => (
          <button key={m} type="button" className={`chip${meter === m ? ' chip-on' : ''}`} onClick={() => setMeter(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="pattern-list">
        {shown.map((p) => {
          const builtIn = isBuiltInPattern(p.id);
          return (
            <div key={p.id} className="pattern-card">
              <StrumPatternView pattern={p} />
              <div className="row gap">
                <span className={`badge ${builtIn ? '' : 'badge-mine'}`}>{builtIn ? 'Built-in' : 'Yours'}</span>
                {p.difficulty && <span className={`badge diff-${p.difficulty}`}>{p.difficulty}</span>}
                <span className="spacer" />
                {!builtIn && (
                  <a className="btn btn-small" href={href(`/patterns/${encodeURIComponent(p.id)}`)}>
                    Edit
                  </a>
                )}
                <a className="btn btn-small btn-ghost" href={href(`/patterns/new?from=${encodeURIComponent(p.id)}`)}>
                  {builtIn ? 'Customize' : 'Duplicate'}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PatternEditor({ id, query }: { id: string; query: URLSearchParams }) {
  const state = useApp();
  const all = allPatterns(state);
  const initial = useMemo<StrumPattern | null>(() => {
    if (id === 'new') {
      const from = query.get('from');
      const src = from ? all.find((p) => p.id === from) : undefined;
      if (src) return { ...src, id: newId('pattern'), name: `${src.name} (mine)`, difficulty: undefined };
      return { id: newId('pattern'), name: 'My pattern', meter: { num: 4, den: 4 }, step: 480, steps: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], accents: [0] };
    }
    const p = state.userPatterns.find((x) => x.id === id);
    return p ? { ...p } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const [p, setP] = useState<StrumPattern | null>(initial);
  const [bpm, setBpm] = useState(80);
  if (!p) return <NotFound what="pattern" />;
  const isNew = !state.userPatterns.some((x) => x.id === p.id);
  const bar = barTicks(p.meter);
  const bars = Math.max(1, Math.round((p.steps.length * p.step) / bar));
  const grids = GRID_OPTIONS.filter((g) => bar % g.step === 0);
  const error = validatePattern(p);

  const reshape = (meter: Meter, step: number, nBars: number) => {
    // Keep strokes that still land on the new grid.
    const len = barTicks(meter) * nBars;
    const cells = len / step;
    const steps: Stroke[] = [];
    const accents: number[] = [];
    for (let i = 0; i < cells; i++) {
      const t = i * step;
      const old = t % p.step === 0 ? t / p.step : -1;
      steps.push(old >= 0 && old < p.steps.length ? p.steps[old] : '-');
      if (old >= 0 && p.accents?.includes(old)) accents.push(i);
    }
    setP({ ...p, meter, step, steps, accents, feel: canSwing({ meter, step }) ? p.feel : 'straight' });
  };

  const save = () => {
    if (error) return toast(error, 'error');
    if (!p.name.trim()) return toast('Give the pattern a name', 'error');
    try {
      app.savePattern({ ...p, name: p.name.trim() });
      toast('Pattern saved');
      navigate('/patterns');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="screen pattern-editor">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => navigate('/patterns')} aria-label="Back to patterns">
          <IconBack />
        </button>
        <div className="topbar-title">
          <h1>{isNew ? 'New pattern' : 'Edit pattern'}</h1>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={save}>
          Save
        </button>
      </header>
      <section className="card">
        <label className="field">
          <span>Name</span>
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={40} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>
              <Term id="meter">Time signature</Term>
            </span>
            <select
              value={meterLabel(p.meter)}
              onChange={(e) => {
                const m = parseMeter(e.target.value)!;
                const bl = barTicks(m);
                const step = bl % p.step === 0 ? p.step : 480;
                reshape(m, step, bars);
              }}
            >
              {COMMON_METERS.map((m) => (
                <option key={meterLabel(m)}>{meterLabel(m)}</option>
              ))}
              {!COMMON_METERS.some((m) => sameMeter(m, p.meter)) && <option>{meterLabel(p.meter)}</option>}
            </select>
          </label>
          <label className="field">
            <span>Grid</span>
            <select value={p.step} onChange={(e) => reshape(p.meter, Number(e.target.value), bars)}>
              {grids.map((g) => (
                <option key={g.step} value={g.step}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <select value={bars} onChange={(e) => reshape(p.meter, p.step, Number(e.target.value))}>
              <option value={1}>1 bar</option>
              <option value={2}>2 bars</option>
            </select>
          </label>
          <label className="field">
            <span>
              <Term id="swing">Feel</Term>
            </span>
            <select value={p.feel ?? 'straight'} disabled={!canSwing(p)} onChange={(e) => setP({ ...p, feel: e.target.value as 'straight' | 'swing', swingRatio: 2 / 3 })}>
              <option value="straight">Straight</option>
              <option value="swing">Swing</option>
            </select>
          </label>
        </div>
        {!canSwing(p) && <p className="muted small">Swing applies to eighth or sixteenth grids in simple meters (compound meters already swing in threes).</p>}
      </section>

      <section className="card">
        <h2 className="h2">Strokes</h2>
        <p className="muted small">Tap a cell to cycle ↓ down → ↑ up → ✕ muted → · none. Tap the small mark above a cell to accent it (&gt;).</p>
        <StrumPatternView
          pattern={p}
          quarterBpm={bpm}
          onCellTap={(i) => {
            const steps = [...p.steps];
            steps[i] = nextStroke(steps[i], naturalStroke(p, i));
            setP({ ...p, steps });
          }}
          onAccentTap={(i) => {
            const acc = new Set(p.accents ?? []);
            if (acc.has(i)) acc.delete(i);
            else acc.add(i);
            setP({ ...p, accents: [...acc].sort((a, b) => a - b) });
          }}
        />
        <label className="field">
          <span>Preview tempo: ♩ = {bpm}</span>
          <input type="range" min={40} max={180} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        </label>
        {error && <p className="notice danger">{error}</p>}
      </section>
      <section className="card">
        <label className="field">
          <span>Description (optional)</span>
          <textarea rows={2} value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} maxLength={240} />
        </label>
      </section>
      {!isNew && (
        <div className="editor-danger">
          <button
            type="button"
            className="btn btn-ghost danger-text"
            onClick={() => {
              if (!confirm(`Delete pattern "${p.name}"? Songs that already use it keep their own copy.`)) return;
              app.deletePattern(p.id);
              toast('Pattern deleted');
              navigate('/patterns');
            }}
          >
            Delete pattern
          </button>
        </div>
      )}
    </div>
  );
}
