/** Sheets for the learning screen: tempo & trainer, loop, practice settings, pattern picker. */
import { Sheet } from '../ui/Sheet';
import { Term } from '../ui/Glossary';
import type { Player, PlayerSnapshot } from '../player/player';
import { beatsOfBar, meterKind, meterLabel, sameMeter, tempoUnitSymbol } from '../music/meter';
import { type StrumPattern } from '../music/strum';
import { StrumPatternView } from '../ui/StrumPatternView';
import { keyName } from '../music/keys';
import { barsRegion, sectionRegion } from '../music/timeline';

export function TempoSheet({ open, onClose, player, snap }: { open: boolean; onClose: () => void; player: Player; snap: PlayerSnapshot }) {
  const { settings, timeline: tl } = snap;
  const songBpm = tl.song.bpm;
  const unit = tempoUnitSymbol(tl.song.meter);
  const set = (bpm: number) => player.updateSettings({ bpm });
  const t = settings.trainer;
  return (
    <Sheet open={open} title="Tempo" onClose={onClose}>
      <p className="muted">
        Song tempo: {unit} = {songBpm} <Term id="bpm">What is BPM?</Term>
      </p>
      <label className="field">
        <span>
          Practice tempo: <strong>{unit} = {settings.bpm}</strong> ({Math.round((settings.bpm / songBpm) * 100)}%)
        </span>
        <input type="range" min={Math.max(20, Math.round(songBpm * 0.3))} max={Math.round(songBpm * 1.5)} value={settings.bpm} onChange={(e) => set(Number(e.target.value))} />
      </label>
      <div className="row gap wrap">
        {[50, 60, 75, 90, 100].map((p) => (
          <button key={p} type="button" className={`chip${Math.round((settings.bpm / songBpm) * 100) === p ? ' chip-on' : ''}`} onClick={() => set(Math.round((songBpm * p) / 100))}>
            {p}%
          </button>
        ))}
      </div>
      <h3 className="h3">Speed trainer</h3>
      <p className="muted small">While looping, StrumFlow raises the tempo a little after every few passes until it reaches your target.</p>
      <label className="switch-row">
        <input type="checkbox" checked={t.enabled} onChange={(e) => player.updateSettings({ trainer: { ...t, enabled: e.target.checked, target: Math.max(t.target, settings.bpm) } })} />
        <span>Gradually speed up while looping</span>
      </label>
      {t.enabled && (
        <div className="grid-3">
          <label className="field">
            <span>Add BPM</span>
            <input type="number" min={1} max={20} value={t.step} onChange={(e) => player.updateSettings({ trainer: { ...t, step: clampInt(e.target.value, 1, 20) } })} />
          </label>
          <label className="field">
            <span>Every N loops</span>
            <input type="number" min={1} max={16} value={t.every} onChange={(e) => player.updateSettings({ trainer: { ...t, every: clampInt(e.target.value, 1, 16) } })} />
          </label>
          <label className="field">
            <span>Target</span>
            <input type="number" min={20} max={320} value={t.target} onChange={(e) => player.updateSettings({ trainer: { ...t, target: clampInt(e.target.value, 20, 320) } })} />
          </label>
        </div>
      )}
      {t.enabled && !snap.loop && <p className="notice small">Turn on a loop (a section or a few bars) for the trainer to work.</p>}
    </Sheet>
  );
}

function clampInt(v: string, lo: number, hi: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

export function LoopSheet({ open, onClose, player, snap, onSelectBars }: { open: boolean; onClose: () => void; player: Player; snap: PlayerSnapshot; onSelectBars: () => void }) {
  const tl = snap.timeline;
  const loc = snap.frame.loc;
  const sec = tl.sections[loc.sectionIndex];
  const choose = (region: { start: number; end: number }, label: string) => {
    player.setLoop({ region, label });
    onClose();
  };
  return (
    <Sheet open={open} title="Loop" onClose={onClose}>
      <div className="menu">
        {sec && (
          <button type="button" className="menu-item" onClick={() => choose(sectionRegion(tl, sec.index), sec.section.name)}>
            Loop this section <span className="muted">({sec.section.name})</span>
          </button>
        )}
        <button type="button" className="menu-item" onClick={() => choose(barsRegion(tl, loc.barIndex, Math.min(tl.bars.length - 1, loc.barIndex + 1)), `Bars ${loc.barIndex + 1}–${Math.min(tl.bars.length, loc.barIndex + 2)}`)}>
          Loop this bar and the next <span className="muted">(practise a chord change)</span>
        </button>
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onSelectBars();
            onClose();
          }}
        >
          Choose bars to loop… <span className="muted">(tap first and last bar)</span>
        </button>
        <button type="button" className="menu-item" onClick={() => choose({ start: 0, end: tl.totalTicks }, 'Whole song')}>
          Loop the whole song
        </button>
        {snap.loop && (
          <button
            type="button"
            className="menu-item danger"
            onClick={() => {
              player.setLoop(null);
              onClose();
            }}
          >
            Stop looping
          </button>
        )}
      </div>
      <h3 className="h3">Sections</h3>
      <div className="row gap wrap">
        {tl.sections.map((s) => (
          <button key={s.index} type="button" className="chip" onClick={() => choose(sectionRegion(tl, s.index), s.section.name + (s.occurrence > 1 ? ` (${s.occurrence})` : ''))}>
            {s.section.name}
            {s.occurrence > 1 ? ` ${s.occurrence}` : ''}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const ACCENT_LABEL = ['Off', 'Normal', 'Accent'];

export function PracticeSettingsSheet({
  open, onClose, player, snap, showDiagrams, showStrum, numerals, onPrefs,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
  snap: PlayerSnapshot;
  showDiagrams: boolean;
  showStrum: boolean;
  numerals: boolean;
  onPrefs: (p: { showDiagrams?: boolean; showStrum?: boolean; numerals?: boolean }) => void;
}) {
  const { settings, timeline: tl, transpose, prefer } = snap;
  const meter = tl.song.meter;
  const beats = beatsOfBar(meter);
  const accents = settings.accents ?? beats.map((b) => (b.index === 0 ? 2 : 1));
  const kind = meterKind(meter);
  return (
    <Sheet open={open} title="Practice settings" onClose={onClose}>
      <h3 className="h3">
        <Term id="transpose">Transpose</Term>
      </h3>
      <div className="row gap center">
        <button type="button" className="btn" onClick={() => player.setTranspose(transpose - 1)} aria-label="Transpose down a semitone">
          −1
        </button>
        <span className="transpose-value">
          {transpose > 0 ? `+${transpose}` : transpose} {tl.key && <span className="muted">· key {keyName(tl.key)}</span>}
        </span>
        <button type="button" className="btn" onClick={() => player.setTranspose(transpose + 1)} aria-label="Transpose up a semitone">
          +1
        </button>
        {transpose !== 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => player.setTranspose(0)}>
            Reset
          </button>
        )}
      </div>
      <div className="seg-control" role="radiogroup" aria-label="Accidentals">
        {(['auto', 'sharp', 'flat'] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={prefer === p} className={prefer === p ? 'on' : ''} onClick={() => player.setTranspose(transpose, p)}>
            {p === 'auto' ? 'Follow key' : p === 'sharp' ? 'Sharps ♯' : 'Flats ♭'}
          </button>
        ))}
      </div>

      <h3 className="h3">Metronome</h3>
      <label className="switch-row">
        <input type="checkbox" checked={settings.metronome} onChange={(e) => player.updateSettings({ metronome: e.target.checked })} />
        <span>Click on the beats</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={settings.subdivisions} onChange={(e) => player.updateSettings({ subdivisions: e.target.checked })} />
        <span>Also click {kind === 'simple' ? 'the "&"s (eighth notes)' : 'every eighth note'}</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={settings.countIn} onChange={(e) => player.updateSettings({ countIn: e.target.checked })} />
        <span>
          <Term id="countin">Count-in</Term> one bar before playing
        </span>
      </label>
      <p className="muted small">
        Beat accents in {meterLabel(meter)} — tap a beat to change it:
      </p>
      <div className="accent-row" role="group" aria-label="Beat accents">
        {beats.map((b) => (
          <button
            key={b.index}
            type="button"
            className={`accent-btn level-${accents[b.index] ?? 1}`}
            onClick={() => {
              const next = [...accents];
              next[b.index] = ((next[b.index] ?? 1) + 1) % 3;
              player.updateSettings({ accents: next });
            }}
            aria-label={`Beat ${b.index + 1}: ${ACCENT_LABEL[accents[b.index] ?? 1]}`}
          >
            <span>{b.index + 1}</span>
            <small>{ACCENT_LABEL[accents[b.index] ?? 1]}</small>
          </button>
        ))}
      </div>
      {settings.accents && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => player.updateSettings({ accents: null })}>
          Reset accents
        </button>
      )}
      <label className="field">
        <span>Click volume</span>
        <input type="range" min={0} max={1} step={0.05} value={settings.clickVolume} onChange={(e) => player.updateSettings({ clickVolume: Number(e.target.value) })} />
      </label>

      <h3 className="h3">Practice guitar</h3>
      <label className="switch-row">
        <input type="checkbox" checked={settings.backing} onChange={(e) => player.updateSettings({ backing: e.target.checked })} />
        <span>Play the strumming pattern with a generated guitar</span>
      </label>
      <p className="muted small">The practice guitar is synthesized from the chord shapes on screen. It is not a recording of the original song.</p>
      <label className="field">
        <span>Guitar volume</span>
        <input type="range" min={0} max={1} step={0.05} value={settings.guitarVolume} onChange={(e) => player.updateSettings({ guitarVolume: Number(e.target.value) })} />
      </label>

      <h3 className="h3">Display</h3>
      <label className="switch-row">
        <input type="checkbox" checked={showDiagrams} onChange={(e) => onPrefs({ showDiagrams: e.target.checked })} />
        <span>Show chord diagrams</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={showStrum} onChange={(e) => onPrefs({ showStrum: e.target.checked })} />
        <span>Show strumming patterns</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={numerals} onChange={(e) => onPrefs({ numerals: e.target.checked })} />
        <span>
          Show <Term id="roman">Roman numerals</Term>
        </span>
      </label>
    </Sheet>
  );
}

export function PatternPicker({
  open, onClose, patterns, current, meter, quarterBpm, previewStrings, onPick, sectionName, isDemo,
}: {
  open: boolean;
  onClose: () => void;
  patterns: StrumPattern[];
  current: string;
  meter: { num: number; den: number; grouping?: number[] };
  quarterBpm: number;
  previewStrings: (number | null)[] | null;
  onPick: (p: StrumPattern) => void;
  sectionName: string;
  isDemo: boolean;
}) {
  const fitting = patterns.filter((p) => sameMeter(p.meter, meter));
  return (
    <Sheet open={open} title={`Strum for ${sectionName}`} onClose={onClose} wide>
      <p className="muted small">
        Changing the pattern never changes the chords. {isDemo ? 'Demo songs keep the change for this session only — use "Edit a copy" to save it.' : 'The change is saved to your song.'}
      </p>
      {fitting.length === 0 && <p className="notice">No saved patterns in {meterLabel(meter)} yet. Create one on the Patterns screen.</p>}
      <div className="pattern-list">
        {fitting.map((p) => (
          <div key={p.id} className={`pattern-card${p.id === current ? ' current' : ''}`}>
            <StrumPatternView pattern={p} quarterBpm={quarterBpm} previewStrings={previewStrings} compact />
            <button type="button" className={`btn ${p.id === current ? '' : 'btn-primary'}`} disabled={p.id === current} onClick={() => onPick(p)}>
              {p.id === current ? 'In use' : 'Use this pattern'}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
