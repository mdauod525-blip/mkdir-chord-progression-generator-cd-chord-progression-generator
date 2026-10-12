/**
 * Song / progression editor: song details, sections with chord lists and
 * lengths, measure visualisation, progression suggestions, strum patterns,
 * play order, preview, save / duplicate / delete.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { app, allPatterns, findSong, useApp } from '../state/app';
import { navigate } from '../state/router';
import {
  type Draft, type DraftSection, copyDraft, draftBars, draftToSong, durationOptions, durationStep, makeItem, newDraft, newSection, presetChords,
  sectionMeterOf, setDraftMeter, songToDraft, transposeDraft, validateDraft,
} from '../editor/draft';
import { DIFFICULTIES, SECTION_KINDS, type SectionKind, type Song } from '../data/song';
import { isDemoId } from '../data/demos';
import { COMMON_METERS, type Meter, describeDuration, meterLabel, parseMeter, sameMeter, tempoUnitSymbol, barTicks, toQuarterBpm } from '../music/meter';
import { TUNINGS, shapesForChord } from '../music/guitar';
import { KEY_NAMES, PROGRESSION_PRESETS, diatonicChords, parseKey, romanNumeral, type Mode } from '../music/keys';
import { displayChord, isNoChord, parseChord } from '../music/chords';
import { parseChart, toChart } from '../data/chart';
import { StrumPatternView } from '../ui/StrumPatternView';
import { ChordDiagram } from '../ui/ChordDiagram';
import { ChordDetail } from '../ui/ChordDetail';
import { Term } from '../ui/Glossary';
import { toast } from '../ui/toast';
import { IconBack, IconCopy, IconDown, IconPause, IconPlay, IconPlus, IconTrash, IconUp } from '../ui/icons';
import { Player } from '../player/player';
import { sectionRegion } from '../music/timeline';
import { NotFound } from './NotFound';

export function Editor({ id, query }: { id: string; query: URLSearchParams }) {
  const state = useApp();
  const from = query.get('from');
  const initial = useMemo<Draft | null>(() => {
    if (id === 'new') {
      const src = from ? findSong(state, from) : undefined;
      return src ? copyDraft(src) : newDraft();
    }
    const s = findSong(state, id);
    if (!s || isDemoId(s.id)) return null;
    return songToDraft(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, from]);
  if (!initial) return <NotFound what="song" />;
  return <EditorBody key={`${id}:${from ?? ''}`} initial={initial} isNew={id === 'new'} />;
}

function EditorBody({ initial, isNew }: { initial: Draft; isNew: boolean }) {
  const state = useApp();
  const library = allPatterns(state);
  const [d, setD] = useState<Draft>(initial);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [numerals, setNumerals] = useState(false);
  const [chordInfo, setChordInfo] = useState<string | null>(null);
  const preview = usePreview();
  const saved = useRef(!isNew);

  const update = (next: Draft) => {
    setD(next);
    setDirty(true);
  };
  const updateSection = (sid: string, patch: Partial<DraftSection>) => update({ ...d, sections: d.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = (thenOpen: boolean) => {
    const errs = validateDraft(d, library);
    setErrors(errs);
    if (errs.length) {
      toast('Please fix the problems listed at the top', 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    try {
      const song = app.saveSong(draftToSong(d, library));
      setD({ ...d, createdAt: song.createdAt, updatedAt: song.updatedAt });
      setDirty(false);
      saved.current = true;
      toast('Saved');
      preview.stop();
      if (thenOpen) navigate(`/song/${encodeURIComponent(song.id)}`);
      else if (isNew) navigate(`/edit/${encodeURIComponent(song.id)}`, true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const leave = () => {
    if (dirty && !confirm('Leave without saving your changes?')) return;
    preview.stop();
    navigate(saved.current ? `/song/${encodeURIComponent(d.id)}` : '/');
  };

  const playPreview = (sectionId?: string) => {
    const errs = validateDraft(d, library);
    if (errs.length) {
      setErrors(errs);
      toast('Fix the problems before previewing', 'error');
      return;
    }
    setErrors([]);
    preview.play(draftToSong(d, library), sectionId);
  };

  const key = parseKey(d.key);
  const keyTonic = key ? d.key.replace(/m$/, '') : 'G';
  const mode: Mode = key?.mode ?? 'major';
  const palette = key ? diatonicChords(key) : [];
  const unit = tempoUnitSymbol(d.meter);
  const meterIsCommon = COMMON_METERS.some((m) => sameMeter(m, d.meter));

  return (
    <div className="screen editor">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={leave} aria-label="Back">
          <IconBack />
        </button>
        <div className="topbar-title">
          <h1>{isNew && !saved.current ? 'New song' : 'Edit song'}</h1>
          <p className="muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={() => save(false)}>
          Save
        </button>
      </header>

      {errors.length > 0 && (
        <div className="notice danger" role="alert">
          <strong>Can’t save yet:</strong>
          <ul>
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="card" aria-label="Song details">
        <h2 className="h2">Song</h2>
        <label className="field">
          <span>Title</span>
          <input value={d.title} onChange={(e) => update({ ...d, title: e.target.value })} placeholder="My song" maxLength={120} />
        </label>
        <label className="field">
          <span>Artist or creator</span>
          <input value={d.artist} onChange={(e) => update({ ...d, artist: e.target.value })} placeholder="You" maxLength={120} />
        </label>
        <div className="grid-2">
          <div className="field">
            <span>
              <Term id="key">Key</Term>
            </span>
            <div className="row gap">
              <select value={keyTonic} onChange={(e) => update({ ...d, key: e.target.value + (mode === 'minor' ? 'm' : '') })} aria-label="Key note">
                {KEY_NAMES[mode].map((k) => (
                  <option key={k} value={k}>
                    {displayChord(k)}
                  </option>
                ))}
                {!KEY_NAMES[mode].includes(keyTonic) && <option value={keyTonic}>{displayChord(keyTonic)}</option>}
              </select>
              <select value={mode} onChange={(e) => update({ ...d, key: keyTonic + (e.target.value === 'minor' ? 'm' : '') })} aria-label="Major or minor">
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </div>
          </div>
          <div className="field">
            <span>
              <Term id="transpose">Transpose all chords</Term>
            </span>
            <div className="row gap">
              <button type="button" className="btn btn-small" onClick={() => update(transposeDraft(d, -1))} aria-label="Transpose song down a semitone">
                −1
              </button>
              <button type="button" className="btn btn-small" onClick={() => update(transposeDraft(d, 1))} aria-label="Transpose song up a semitone">
                +1
              </button>
            </div>
          </div>
          <label className="field">
            <span>
              <Term id="bpm">Tempo</Term> ({unit} = {d.bpm})
            </span>
            <input type="range" min={30} max={240} value={d.bpm} onChange={(e) => update({ ...d, bpm: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>BPM</span>
            <input type="number" inputMode="numeric" min={20} max={400} value={d.bpm} onChange={(e) => update({ ...d, bpm: Math.max(20, Math.min(400, Number(e.target.value) || 20)) })} />
          </label>
          <label className="field">
            <span>
              <Term id="meter">Time signature</Term>
            </span>
            <select
              value={meterIsCommon ? meterLabel(d.meter) : 'custom'}
              onChange={(e) => {
                const m = parseMeter(e.target.value);
                if (!m) return;
                const r = setDraftMeter(d, m, library);
                update(r.draft);
                if (r.reassigned) toast(`${r.reassigned} section pattern(s) changed to fit ${meterLabel(m)}`);
              }}
            >
              {COMMON_METERS.map((m) => (
                <option key={meterLabel(m)} value={meterLabel(m)}>
                  {meterLabel(m)}
                </option>
              ))}
              {!meterIsCommon && <option value="custom">{meterLabel(d.meter)}</option>}
            </select>
          </label>
          <MeterGrouping meter={d.meter} onChange={(m) => update(setDraftMeter(d, m, library).draft)} />
          <label className="field">
            <span>
              <Term id="tuning">Tuning</Term>
            </span>
            <select value={d.tuning.name} onChange={(e) => update({ ...d, tuning: TUNINGS.find((t) => t.name === e.target.value) ?? d.tuning })}>
              {TUNINGS.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
              {!TUNINGS.some((t) => t.name === d.tuning.name) && <option>{d.tuning.name}</option>}
            </select>
          </label>
          <label className="field">
            <span>
              <Term id="capo">Capo</Term>
            </span>
            <select value={d.capo} onChange={(e) => update({ ...d, capo: Number(e.target.value) })}>
              {Array.from({ length: 13 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'No capo' : `Fret ${i}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select value={d.difficulty} onChange={(e) => update({ ...d, difficulty: e.target.value as Draft['difficulty'] })}>
              {DIFFICULTIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Style / genre</span>
            <input value={d.genre} onChange={(e) => update({ ...d, genre: e.target.value })} maxLength={40} />
          </label>
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={d.notes ?? ''} onChange={(e) => update({ ...d, notes: e.target.value })} placeholder="Practice tips, where the arrangement comes from…" />
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={numerals} onChange={(e) => setNumerals(e.target.checked)} />
          <span>
            Show <Term id="roman">Roman numerals</Term> in the editor
          </span>
        </label>
      </section>

      {d.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          d={d}
          s={s}
          index={i}
          library={library}
          palette={palette}
          numerals={numerals}
          activeBar={preview.activeSectionId === s.id ? preview.activeBar : null}
          activeItem={preview.activeSectionId === s.id ? preview.activeItem : null}
          onChange={(patch) => updateSection(s.id, patch)}
          onMove={(dir) => {
            const arr = [...d.sections];
            const j = i + dir;
            if (j < 0 || j >= arr.length) return;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            update({ ...d, sections: arr });
          }}
          onDuplicate={() => {
            const copy = { ...newSection(d, s.kind), name: `${s.name} (copy)`, patternId: s.patternId, items: s.items.map((it) => ({ ...makeItem(it.chord, it.duration), lyric: it.lyric })), pickup: s.pickup, meter: s.meter };
            const arr = [...d.sections];
            arr.splice(i + 1, 0, copy);
            update({ ...d, sections: arr });
          }}
          onDelete={() => {
            if (d.sections.length === 1) return toast('A song needs at least one section', 'error');
            if (!confirm(`Delete section "${s.name}"?`)) return;
            update({ ...d, sections: d.sections.filter((x) => x.id !== s.id), form: d.form ? d.form.filter((x) => x !== s.id) : null });
          }}
          onPreview={() => (preview.playing ? preview.stop() : playPreview(s.id))}
          previewing={preview.playing && preview.sectionId === s.id}
          onChordInfo={setChordInfo}
        />
      ))}

      <div className="add-section card">
        <span className="muted small">Add a section</span>
        <div className="chip-wrap">
          {SECTION_KINDS.filter((k) => k !== 'other').map((k) => (
            <button key={k} type="button" className="chip" onClick={() => update({ ...d, sections: [...d.sections, newSection(d, k)] })}>
              <IconPlus size={14} /> {k}
            </button>
          ))}
        </div>
      </div>

      <FormEditor d={d} onChange={(form) => update({ ...d, form })} />

      <div className="editor-actions">
        <button type="button" className="btn" onClick={() => (preview.playing ? preview.stop() : playPreview())}>
          {preview.playing && !preview.sectionId ? <IconPause size={18} /> : <IconPlay size={18} />} {preview.playing && !preview.sectionId ? 'Stop' : 'Preview song'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => save(true)}>
          Save &amp; practise
        </button>
      </div>

      {!isNew || saved.current ? (
        <div className="editor-danger">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/edit/new?from=${encodeURIComponent(d.id)}`)} disabled={dirty} title={dirty ? 'Save first' : undefined}>
            <IconCopy size={16} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-ghost danger-text"
            onClick={() => {
              if (!confirm(`Delete "${d.title || 'this song'}"? This cannot be undone.`)) return;
              preview.stop();
              app.deleteSong(d.id);
              toast('Song deleted');
              navigate('/library');
            }}
          >
            <IconTrash size={16} /> Delete song
          </button>
        </div>
      ) : null}

      <ChordDetail symbol={chordInfo} onClose={() => setChordInfo(null)} tuning={d.tuning} capo={d.capo} songShapes={d.shapes} songKey={key} />
    </div>
  );
}

function MeterGrouping({ meter, onChange }: { meter: Meter; onChange: (m: Meter) => void }) {
  if (meter.den !== 8 || meter.num % 3 === 0) return null;
  const options = groupings(meter.num);
  if (options.length < 2) return null;
  const current = (meter.grouping ?? options[0]).join('+');
  return (
    <label className="field">
      <span>Beat grouping</span>
      <select value={current} onChange={(e) => onChange({ num: meter.num, den: meter.den, grouping: e.target.value.split('+').map(Number) })}>
        {options.map((g) => (
          <option key={g.join('+')} value={g.join('+')}>
            {g.join(' + ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function groupings(n: number): number[][] {
  // Groups of 2 and 3 adding up to n (e.g. 7 → 2+2+3, 2+3+2, 3+2+2).
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (left === 0) return out.push(acc);
    for (const g of [2, 3]) if (g <= left) walk(left - g, [...acc, g]);
  };
  walk(n, []);
  return out.sort((a, b) => (b[b.length - 1] === 3 ? 1 : 0) - (a[a.length - 1] === 3 ? 1 : 0)).slice(0, 6);
}

interface SectionProps {
  d: Draft;
  s: DraftSection;
  index: number;
  library: ReturnType<typeof allPatterns>;
  palette: string[];
  numerals: boolean;
  activeBar: number | null;
  activeItem: number | null;
  previewing: boolean;
  onChange: (patch: Partial<DraftSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onChordInfo: (sym: string) => void;
}

function SectionEditor({ d, s, index, library, palette, numerals, activeBar, activeItem, previewing, onChange, onMove, onDuplicate, onDelete, onPreview, onChordInfo }: SectionProps) {
  const meter = sectionMeterOf(d, s);
  const bar = barTicks(meter);
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [quick, setQuick] = useState('');
  const [showQuick, setShowQuick] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const bars = draftBars(meter, s);
  const key = parseKey(d.key);
  const pool = [...d.patterns, ...library].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
  const fitting = pool.filter((p) => sameMeter(p.meter, meter));
  const pattern = pool.find((p) => p.id === s.patternId);
  const options = durationOptions(meter);
  const step = durationStep(meter);
  const total = s.items.reduce((a, b) => a + b.duration, 0);
  const remainder = (total - s.pickup) % bar;

  const setItems = (items: DraftSection['items']) => onChange({ items });
  const addChord = (sym: string) => {
    const trimmed = sym.trim();
    if (!trimmed) return;
    if (!isNoChord(trimmed) && !parseChord(trimmed)) return toast(`"${trimmed}" isn’t a chord name I know`, 'error');
    setItems([...s.items, makeItem(isNoChord(trimmed) ? 'N.C.' : trimmed, bar)]);
    setCustom('');
  };

  return (
    <section className="card section-editor" aria-label={`Section ${s.name}`}>
      <div className="section-editor-head">
        <input className="section-title-input" value={s.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Section name" maxLength={40} />
        <select value={s.kind} onChange={(e) => onChange({ kind: e.target.value as SectionKind })} aria-label="Section type">
          {SECTION_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="row gap wrap section-editor-tools">
        <button type="button" className="btn btn-small" onClick={onPreview}>
          {previewing ? <IconPause size={16} /> : <IconPlay size={16} />} {previewing ? 'Stop' : 'Preview'}
        </button>
        <button type="button" className="icon-btn icon-btn-small" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move section up">
          <IconUp size={18} />
        </button>
        <button type="button" className="icon-btn icon-btn-small" onClick={() => onMove(1)} disabled={index === d.sections.length - 1} aria-label="Move section down">
          <IconDown size={18} />
        </button>
        <button type="button" className="icon-btn icon-btn-small" onClick={onDuplicate} aria-label="Duplicate section">
          <IconCopy size={18} />
        </button>
        <button type="button" className="icon-btn icon-btn-small danger-text" onClick={onDelete} aria-label="Delete section">
          <IconTrash size={18} />
        </button>
      </div>

      {/* Measure visualisation */}
      <div className="measure-grid" aria-label={`${bars.length} bars`}>
        {bars.map((b, bi) => (
          <div key={bi} className={`measure${b.isPickup ? ' bar-pickup' : ''}${activeBar === bi ? ' bar-active' : ''}`}>
            <span className="bar-num">{b.isPickup ? 'pickup' : b.number}</span>
            <div className="bar-segments">
              {b.segments.map((seg, k) => {
                const it = s.items[seg.item];
                return (
                  <button
                    key={k}
                    type="button"
                    className={`seg${seg.held ? ' seg-held' : ''}${selected === seg.item ? ' seg-selected' : ''}${activeItem === seg.item ? ' seg-active' : ''}${isNoChord(it.chord) ? ' seg-empty' : ''}`}
                    style={{ flexGrow: seg.to - seg.from }}
                    onClick={() => setSelected(seg.item === selected ? null : seg.item)}
                    aria-label={`${it.chord}, ${describeDuration(it.duration, meter)}`}
                  >
                    {!seg.held ? <span className="seg-chord">{displayChord(it.chord)}</span> : <span className="seg-hold" />}
                    {!seg.held && numerals && key && !isNoChord(it.chord) && parseChord(it.chord) && <span className="seg-numeral">{romanNumeral(it.chord, key)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">
        {bars.filter((b) => !b.isPickup).length} bars of {meterLabel(meter)}
        {remainder ? ` · the last chord rings to the end of the bar` : ''}
      </p>

      {/* Chord list */}
      <ol className="chord-list">
        {s.items.map((it, i) => {
          const valid = isNoChord(it.chord) || Boolean(parseChord(it.chord.trim()));
          const opts = options.includes(it.duration) ? options : [...options, it.duration].sort((a, b) => a - b);
          return (
            <li key={it.key} className={`chord-row${selected === i ? ' selected' : ''}${activeItem === i ? ' playing' : ''}`} onFocus={() => setSelected(i)}>
              <div className="chord-row-main">
                <input
                  className={`chord-input${valid ? '' : ' invalid'}`}
                  value={it.chord}
                  onChange={(e) => setItems(s.items.map((x, j) => (j === i ? { ...x, chord: e.target.value } : x)))}
                  aria-label={`Chord ${i + 1}`}
                  aria-invalid={!valid}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={12}
                />
                <div className="dur" role="group" aria-label="Length">
                  <button type="button" className="icon-btn icon-btn-small" onClick={() => setItems(s.items.map((x, j) => (j === i ? { ...x, duration: Math.max(step, x.duration - step) } : x)))} aria-label="Shorter">
                    −
                  </button>
                  <select value={it.duration} onChange={(e) => setItems(s.items.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) } : x)))} aria-label={`Length of chord ${i + 1}`}>
                    {opts.map((o) => (
                      <option key={o} value={o}>
                        {describeDuration(o, meter)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn icon-btn-small" onClick={() => setItems(s.items.map((x, j) => (j === i ? { ...x, duration: x.duration + step } : x)))} aria-label="Longer">
                    +
                  </button>
                </div>
                <div className="row-tools">
                  {valid && !isNoChord(it.chord) && (
                    <button type="button" className="mini-diagram" onClick={() => onChordInfo(it.chord.trim())} aria-label={`${it.chord} diagram`}>
                      <ChordDiagram shape={shapesForChord(it.chord.trim(), d.tuning, d.shapes)[0]} width={34} showFingers={false} />
                    </button>
                  )}
                  <button type="button" className="icon-btn icon-btn-small" disabled={i === 0} onClick={() => setItems(swap(s.items, i, i - 1))} aria-label="Move chord earlier">
                    <IconUp size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-small" disabled={i === s.items.length - 1} onClick={() => setItems(swap(s.items, i, i + 1))} aria-label="Move chord later">
                    <IconDown size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-small danger-text" onClick={() => setItems(s.items.filter((_, j) => j !== i))} aria-label={`Remove chord ${i + 1}`}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
              {(selected === i || it.lyric) && (
                <input className="lyric-input" value={it.lyric} placeholder="Lyrics or notes under this chord (optional)" onChange={(e) => setItems(s.items.map((x, j) => (j === i ? { ...x, lyric: e.target.value } : x)))} aria-label={`Lyrics for chord ${i + 1}`} maxLength={200} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="add-chord">
        <span className="muted small">Add a chord{key ? ` (in ${displayChord(d.key)})` : ''}:</span>
        <div className="chip-wrap">
          {palette.map((c) => (
            <button key={c} type="button" className="chip chord-chip" onClick={() => addChord(c)}>
              {displayChord(c)}
              {numerals && key && <small> {romanNumeral(c, key)}</small>}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => addChord('N.C.')}>
            N.C. (rest)
          </button>
        </div>
        <form
          className="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            addChord(custom);
          }}
        >
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Any chord: F#m7, Bb, D/F#…" aria-label="Chord name" autoCorrect="off" spellCheck={false} maxLength={12} />
          <button type="submit" className="btn btn-small">
            Add
          </button>
        </form>
      </div>

      <div className="row gap wrap">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowPresets(!showPresets)} aria-expanded={showPresets}>
          Progression ideas
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => {
            setQuick(toChart(draftToSong({ ...d, sections: [s] }, library).sections[0].chords, meter, Math.ceil((total - s.pickup) / bar), s.pickup));
            setShowQuick(!showQuick);
          }}
          aria-expanded={showQuick}
        >
          Type as text
        </button>
      </div>

      {showPresets && key && (
        <div className="presets">
          {PROGRESSION_PRESETS.filter((p) => p.mode === 'any' || p.mode === key.mode).map((p) => {
            const chords = presetChords(p.numerals, d.key);
            return (
              <div key={p.name} className="preset">
                <div>
                  <strong>{p.name}</strong> <span className="muted small">{p.numerals.join('–')}</span>
                  <div className="preset-chords">{chords.map(displayChord).join(' – ')}</div>
                  <div className="muted small">{p.note}</div>
                </div>
                <div className="row gap">
                  <button type="button" className="btn btn-small" onClick={() => setItems(chords.map((c) => makeItem(c, bar)))}>
                    Use
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setItems([...s.items, ...chords.map((c) => makeItem(c, bar))])}>
                    Append
                  </button>
                </div>
              </div>
            );
          })}
          {PROGRESSION_PRESETS.every((p) => p.mode !== key.mode) && <p className="muted">No presets for this mode yet.</p>}
        </div>
      )}

      {showQuick && (
        <div className="quick-entry">
          <p className="muted small">
            Bars separated by <code>|</code>. Chords in a bar share it equally; <code>.</code> holds the previous chord for one share; <code>%</code> holds it for a bar; <code>Am:3.5 F:0.5</code> sets beats exactly.
          </p>
          <textarea rows={3} value={quick} onChange={(e) => setQuick(e.target.value)} spellCheck={false} aria-label="Chords as text" />
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => {
              const r = parseChart(quick, meter);
              if (r.errors.length) return toast(r.errors[0], 'error');
              const items = r.chords.map((c) => makeItem(c.chord, c.duration));
              setItems(items);
              setShowQuick(false);
            }}
          >
            Apply
          </button>
        </div>
      )}

      <div className="pattern-select">
        <label className="field">
          <span>
            <Term id="strum">Strumming pattern</Term>
          </span>
          <select value={s.patternId} onChange={(e) => onChange({ patternId: e.target.value })}>
            {fitting.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {pattern && !fitting.includes(pattern) && <option value={pattern.id}>{pattern.name} (other meter)</option>}
          </select>
        </label>
        {pattern && <StrumPatternView pattern={pattern} compact quarterBpm={toQuarterBpm(d.bpm, d.meter)} />}
        {pattern && !sameMeter(pattern.meter, meter) && <p className="notice small">This pattern was written for {meterLabel(pattern.meter)}; pick one for {meterLabel(meter)}.</p>}
      </div>

      <details className="more-options">
        <summary>More options</summary>
        <label className="field">
          <span>
            <Term id="pickup">Pickup</Term> before bar 1
          </span>
          <select value={s.pickup} onChange={(e) => onChange({ pickup: Number(e.target.value) })}>
            <option value={0}>None</option>
            {durationOptions(meter)
              .filter((t) => t < bar)
              .map((t) => (
                <option key={t} value={t}>
                  {describeDuration(t, meter)}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Time signature for this section</span>
          <select
            value={s.meter ? meterLabel(s.meter) : ''}
            onChange={(e) => {
              const m = e.target.value ? parseMeter(e.target.value) : null;
              const nextMeter = m ?? undefined;
              const fit = pool.find((p) => p.id === s.patternId);
              const patternId = fit && sameMeter(fit.meter, nextMeter ?? d.meter) ? s.patternId : (pool.find((p) => sameMeter(p.meter, nextMeter ?? d.meter))?.id ?? s.patternId);
              onChange({ meter: nextMeter, patternId });
            }}
          >
            <option value="">Same as song ({meterLabel(d.meter)})</option>
            {COMMON_METERS.filter((m) => !sameMeter(m, d.meter)).map((m) => (
              <option key={meterLabel(m)} value={meterLabel(m)}>
                {meterLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Section notes</span>
          <textarea rows={2} value={s.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </label>
        {s.tab?.length ? <p className="muted small">This section has {s.tab.length} tab notes (kept as is; tab editing is a planned feature).</p> : null}
      </details>
    </section>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

function FormEditor({ d, onChange }: { d: Draft; onChange: (form: string[] | null) => void }) {
  const byId = new Map(d.sections.map((s) => [s.id, s]));
  const form = d.form ?? d.sections.map((s) => s.id);
  return (
    <section className="card" aria-label="Play order">
      <h2 className="h2">Play order</h2>
      <label className="switch-row">
        <input type="checkbox" checked={Boolean(d.form)} onChange={(e) => onChange(e.target.checked ? d.sections.map((s) => s.id) : null)} />
        <span>Custom order with repeats (e.g. Verse → Chorus → Verse → Chorus)</span>
      </label>
      {d.form && (
        <>
          <ol className="form-list">
            {form.map((id, i) => (
              <li key={`${id}-${i}`} className="form-item">
                <span>{byId.get(id)?.name ?? id}</span>
                <span className="row">
                  <button type="button" className="icon-btn icon-btn-small" disabled={i === 0} onClick={() => onChange(swap(form, i, i - 1))} aria-label="Earlier">
                    <IconUp size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-small" disabled={i === form.length - 1} onClick={() => onChange(swap(form, i, i + 1))} aria-label="Later">
                    <IconDown size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-small danger-text" onClick={() => onChange(form.filter((_, j) => j !== i))} aria-label="Remove from play order">
                    <IconTrash size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <div className="chip-wrap">
            {d.sections.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => onChange([...form, s.id])}>
                <IconPlus size={14} /> {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Preview playback for the editor (one Player per preview run). */
function usePreview() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const snap = useSyncExternalStore(player ? player.subscribe : noop, player ? player.getSnapshot : nil);
  useEffect(() => () => player?.destroy(), [player]);
  const playing = snap?.status === 'playing';
  let activeSectionId: string | null = null;
  let activeBar: number | null = null;
  let activeItem: number | null = null;
  if (snap && playing && !snap.frame.countIn) {
    const tl = snap.timeline;
    const sec = tl.sections[snap.frame.loc.sectionIndex];
    if (sec) {
      activeSectionId = sec.section.id;
      activeBar = snap.frame.loc.barIndex - sec.firstBar;
      const ci = snap.frame.loc.chordIndex;
      if (ci >= 0) {
        const c = tl.chords[ci];
        // Item index = position of this chord among the section's chords (N.C. items shift it).
        activeItem = itemIndexForTick(sec.section, c.start - sec.start);
      }
    }
  }
  return {
    playing,
    sectionId,
    activeSectionId,
    activeBar,
    activeItem,
    play(song: Song, sid?: string) {
      player?.destroy();
      const p = new Player(song);
      if (sid) {
        const idx = p.getSnapshot().timeline.sections.findIndex((s) => s.section.id === sid);
        if (idx >= 0) p.setLoop({ region: sectionRegion(p.getSnapshot().timeline, idx), label: 'section' });
      }
      p.updateSettings({ countIn: false });
      setPlayer(p);
      setSectionId(sid ?? null);
      void p.start();
    },
    stop() {
      player?.destroy();
      setPlayer(null);
      setSectionId(null);
    },
  };
}

function itemIndexForTick(section: { chords: { start: number; duration: number }[] }, tick: number): number {
  // Draft items include N.C. gaps; reconstruct the same sequence.
  let t = 0;
  let idx = 0;
  for (const c of [...section.chords].sort((a, b) => a.start - b.start)) {
    if (c.start > t) {
      if (tick >= t && tick < c.start) return idx;
      idx++;
    }
    if (tick >= c.start && tick < c.start + c.duration) return idx;
    t = c.start + c.duration;
    idx++;
  }
  return idx;
}

const noop = () => () => {};
const nil = () => null;
