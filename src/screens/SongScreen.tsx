/** Song learning screen: metadata, chord sheet / practice / tab views, transport. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '../data/song';
import { provenanceLabel } from '../data/song';
import { isDemoId } from '../data/demos';
import { app, allPatterns, findSong, useApp } from '../state/app';
import { navigate, up } from '../state/router';
import { usePlayer } from '../practice/usePlayer';
import { ChordSheetView, type SheetDisplay } from '../practice/ChordSheetView';
import { PracticeView } from '../practice/PracticeView';
import { TabView, hasTab } from '../practice/TabView';
import { TransportBar } from '../practice/TransportBar';
import { LoopSheet, PatternPicker, PracticeSettingsSheet, TempoSheet } from '../practice/PracticeSheets';
import { keyText, formatDuration, songSeconds, chordLabel } from '../practice/display';
import { ChordDetail } from '../ui/ChordDetail';
import { ChordDiagram } from '../ui/ChordDiagram';
import { Term } from '../ui/Glossary';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/toast';
import { IconBack, IconClose, IconMore, IconSettings, IconStar } from '../ui/icons';
import { meterKind, meterLabel, tempoUnitSymbol, toQuarterBpm } from '../music/meter';
import { StrumPatternView } from '../ui/StrumPatternView';
import { isStandardTuning, shapesForChord, tuningNotes } from '../music/guitar';
import { barsRegion } from '../music/timeline';
import type { StrumPattern } from '../music/strum';
import { exportSongJson } from '../data/io';
import { saveTextFile, slug } from '../ui/download';
import { NotFound } from './NotFound';

type View = 'sheet' | 'practice' | 'tab';

export function SongScreen({ id, initialView }: { id: string; initialView: string | null }) {
  const state = useApp();
  const stored = findSong(state, id);
  // Practice-only overrides (e.g. a different strum on a demo song).
  const [override, setOverride] = useState<Song | null>(null);
  const song = override && override.id === id ? override : stored;
  if (!song) return <NotFound what="song" />;
  return <SongLearning key={song.id} song={song} setOverride={setOverride} initialView={initialView} />;
}

function SongLearning({ song, setOverride, initialView }: { song: Song; setOverride: (s: Song | null) => void; initialView: string | null }) {
  const state = useApp();
  const prefs = state.prefs;
  const memory = prefs.songs[song.id];
  const { player, snap } = usePlayer(song, { settings: memory?.bpm ? { bpm: memory.bpm } : undefined, transpose: memory?.transpose, prefer: prefs.prefer });
  const [view, setView] = useState<View>(initialView === 'practice' || initialView === 'tab' ? initialView : 'sheet');
  const [names, setNames] = useState<'shapes' | 'sounding'>('shapes');
  const [chord, setChord] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'tempo' | 'loop' | 'settings' | 'more'>(null);
  const [patternFor, setPatternFor] = useState<number | null>(null);
  const [selecting, setSelecting] = useState<number[] | null>(null);
  const [fullscreen, setFullscreen] = useState(initialView === 'focus');
  const demo = isDemoId(song.id);

  useEffect(() => {
    app.touchRecent(song.id);
  }, [song.id]);

  // Keep the player in sync when the song data changes (pattern edits).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    player?.setSong(song);
  }, [song, player]);

  // Remember tempo and transpose per song.
  const bpm = snap?.settings.bpm;
  const transpose = snap?.transpose;
  useEffect(() => {
    if (bpm === undefined || transpose === undefined) return;
    const t = setTimeout(() => app.rememberSong(song.id, { bpm, transpose }), 400);
    return () => clearTimeout(t);
  }, [bpm, transpose, song.id]);

  // Keyboard: space = play/pause, arrows = previous/next bar.
  useEffect(() => {
    if (!player || !snap) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.body.classList.contains('sheet-open')) return;
      const s = player.getSnapshot();
      if (e.code === 'Space') {
        e.preventDefault();
        void player.toggle();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const bi = Math.max(0, Math.min(s.timeline.bars.length - 1, s.frame.loc.barIndex + (e.key === 'ArrowRight' ? 1 : -1)));
        if (s.status === 'playing') void player.start(s.timeline.bars[bi].start);
        else player.seek(s.timeline.bars[bi].start);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, snap]);

  const onBarTap = useCallback(
    (barIndex: number) => {
      if (!player) return;
      const s = player.getSnapshot();
      if (selecting) {
        if (selecting.length === 0) setSelecting([barIndex]);
        else {
          const [a] = selecting;
          const region = barsRegion(s.timeline, a, barIndex);
          const lo = Math.min(a, barIndex) + 1;
          const hi = Math.max(a, barIndex) + 1;
          player.setLoop({ region, label: lo === hi ? `Bar ${lo}` : `Bars ${lo}–${hi}` });
          setSelecting(null);
        }
        return;
      }
      const tick = s.timeline.bars[barIndex].start;
      if (s.status === 'playing') void player.start(tick);
      else player.seek(tick);
    },
    [player, selecting],
  );

  const onLoopSection = useCallback(
    (sectionIndex: number) => {
      if (!player) return;
      const s = player.getSnapshot();
      const sec = s.timeline.sections[sectionIndex];
      if (s.loop && s.loop.region.start === sec.start && s.loop.region.end === sec.end) player.setLoop(null);
      else player.setLoop({ region: { start: sec.start, end: sec.end }, label: sec.section.name });
    },
    [player],
  );

  const patterns = useMemo(() => {
    const seen = new Set<string>();
    return [...song.patterns, ...allPatterns(state)].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [song.patterns, state]);

  if (!player || !snap) return null;
  const tl = snap.timeline;
  const playing = snap.status === 'playing';
  const display: SheetDisplay = { names, capo: song.capo, prefer: snap.prefer, numerals: prefs.numerals };
  const keys = keyText(tl, song.capo, snap.prefer);
  const unit = tempoUnitSymbol(song.meter);
  const fav = prefs.favorites.includes(song.id);
  const uniqueChords = [...new Set(tl.chords.filter((c) => !c.noChord).map((c) => c.symbol))];
  const curSection = tl.sections[snap.frame.loc.sectionIndex];
  const curChord = snap.frame.loc.chordIndex >= 0 ? snap.frame.loc.chordIndex : tl.chords.findIndex((c) => !c.noChord);
  const previewStrings = curChord >= 0 ? player.chordNotes(curChord) : null;
  const tabAvailable = hasTab(song);
  const kind = meterKind(song.meter);

  const pickPattern = (p: StrumPattern) => {
    if (patternFor === null) return;
    const sectionId = tl.sections[patternFor].section.id;
    const next: Song = {
      ...song,
      patterns: song.patterns.some((x) => x.id === p.id) ? song.patterns : [...song.patterns, p],
      sections: song.sections.map((s) => (s.id === sectionId ? { ...s, patternId: p.id } : s)),
    };
    if (demo) {
      setOverride(next);
      toast('Pattern changed for this session. Use "Edit a copy" to keep it.');
    } else {
      try {
        app.saveSong(next);
        toast('Pattern saved');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
    setPatternFor(null);
  };

  const editCopy = () => navigate(`/edit/new?from=${encodeURIComponent(song.id)}`);

  return (
    <div className="screen song-screen">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => up('/library')} aria-label="Back to library">
          <IconBack />
        </button>
        <div className="topbar-title">
          <h1>{song.title}</h1>
          <p className="muted">{song.artist || 'Unknown artist'}</p>
        </div>
        <button type="button" className={`icon-btn${fav ? ' fav-on' : ''}`} onClick={() => app.toggleFavorite(song.id)} aria-pressed={fav} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}>
          <IconStar filled={fav} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setSheet('more')} aria-label="More actions">
          <IconMore />
        </button>
      </header>

      <div className="meta-chips">
        <span className={`chip chip-static diff-${song.difficulty}`}>{song.difficulty}</span>
        <Term id="key" className="chip chip-static">
          Key {keys.shapes}
          {keys.sounding ? ` (sounds ${keys.sounding})` : ''}
        </Term>
        <Term id="bpm" className="chip chip-static">
          {unit} = {song.bpm}
        </Term>
        <Term id={kind === 'compound' ? 'compound' : kind === 'irregular' ? 'irregular' : 'meter'} className="chip chip-static">
          {meterLabel(song.meter)}
        </Term>
        <Term id="tuning" className="chip chip-static">
          {song.tuning.name}
          {!isStandardTuning(song.tuning) && ` (${tuningNotes(song.tuning).join(' ')})`}
        </Term>
        <Term id="capo" className="chip chip-static">
          {song.capo ? `Capo ${song.capo}` : 'No capo'}
        </Term>
        <span className="chip chip-static">
          {tl.sections.length} sections · {tl.bars.length} bars · {formatDuration(songSeconds(tl, song.bpm))}
        </span>
        <Term id="verified" className={`chip chip-static prov prov-${song.provenance.verified ? 'verified' : song.provenance.kind}`}>
          {provenanceLabel(song.provenance)}
        </Term>
      </div>

      {song.notes && (
        <details className="song-notes">
          <summary>About this arrangement</summary>
          <p>{song.notes}</p>
          {song.provenance.note && <p className="muted small">{song.provenance.note}</p>}
        </details>
      )}

      <div className="toolbar">
        <div className="seg-control" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'sheet'} className={view === 'sheet' ? 'on' : ''} onClick={() => setView('sheet')}>
            Chord sheet
          </button>
          <button type="button" role="tab" aria-selected={view === 'practice'} className={view === 'practice' ? 'on' : ''} onClick={() => setView('practice')}>
            Beat by beat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'tab'}
            className={view === 'tab' ? 'on' : ''}
            disabled={!tabAvailable}
            onClick={() => setView('tab')}
            title={tabAvailable ? 'Tab view' : 'This arrangement has no tab data'}
          >
            Tab{!tabAvailable && <small> (none)</small>}
          </button>
        </div>
        <div className="chip-row" role="group" aria-label="Display options">
          <div className="chip chip-group" role="group" aria-label="Transpose">
            <button type="button" onClick={() => player.setTranspose(snap.transpose - 1)} aria-label="Transpose down">
              −
            </button>
            <Term id="transpose">
              {snap.transpose === 0 ? 'Transpose' : `${snap.transpose > 0 ? '+' : ''}${snap.transpose}`}
            </Term>
            <button type="button" onClick={() => player.setTranspose(snap.transpose + 1)} aria-label="Transpose up">
              +
            </button>
          </div>
          <button type="button" className={`chip${prefs.showDiagrams ? ' chip-on' : ''}`} aria-pressed={prefs.showDiagrams} onClick={() => app.setPrefs({ showDiagrams: !prefs.showDiagrams })}>
            Chords
          </button>
          <button type="button" className={`chip${prefs.showStrum ? ' chip-on' : ''}`} aria-pressed={prefs.showStrum} onClick={() => app.setPrefs({ showStrum: !prefs.showStrum })}>
            Strum
          </button>
          <button type="button" className={`chip${prefs.numerals ? ' chip-on' : ''}`} aria-pressed={prefs.numerals} onClick={() => app.setPrefs({ numerals: !prefs.numerals })}>
            I–V
          </button>
          {song.capo > 0 && (
            <button type="button" className="chip chip-on" onClick={() => setNames(names === 'shapes' ? 'sounding' : 'shapes')} aria-label={`Showing ${names === 'shapes' ? 'chord shapes as played' : 'sounding chords'}. Tap to switch.`}>
              {names === 'shapes' ? 'Shapes' : 'Sounding'}
            </button>
          )}
          <button type="button" className="chip" onClick={() => setSheet('settings')} aria-label="Practice settings">
            <IconSettings size={16} /> More
          </button>
        </div>
      </div>

      {snap.notice && <p className="notice">{snap.notice}</p>}
      {selecting && (
        <div className="notice select-banner" role="status">
          {selecting.length === 0 ? 'Tap the first bar of the loop' : 'Now tap the last bar'}
          <button type="button" className="btn btn-small" onClick={() => setSelecting(null)}>
            Cancel
          </button>
        </div>
      )}

      {prefs.showDiagrams && view !== 'practice' && (
        <div className="diagram-strip" role="list" aria-label="Chords in this song">
          {uniqueChords.map((sym) => (
            <button key={sym} type="button" className="diagram-card" role="listitem" onClick={() => setChord(sym)} aria-label={`${chordLabel(tl, sym, names, song.capo, snap.prefer)} — open diagram`}>
              <span className="diagram-name">{chordLabel(tl, sym, names, song.capo, snap.prefer)}</span>
              <ChordDiagram shape={shapesForChord(sym, song.tuning, song.shapes)[0]} width={72} label={sym} />
            </button>
          ))}
        </div>
      )}

      {prefs.showStrum && view === 'sheet' && curSection && (
        <div className="strum-dock">
          <PatternDock snapPattern={curSection.pattern} activeCell={snap.frame.cell && snap.frame.cell.sectionIndex === curSection.index && (playing || snap.frame.tick > 0) ? snap.frame.cell.cell : null} label={curSection.section.name} quarterBpm={toQ(snap.settings.bpm, song)} previewStrings={previewStrings} onChange={() => setPatternFor(curSection.index)} />
        </div>
      )}

      <main className="song-body">
        {view === 'sheet' && (
          <ChordSheetView
            tl={tl}
            frame={snap.frame}
            playing={playing}
            display={display}
            loop={snap.loop?.region ?? null}
            selecting={selecting}
            onBarTap={onBarTap}
            onLoopSection={onLoopSection}
            onPatternTap={setPatternFor}
            onChordTap={setChord}
          />
        )}
        {view === 'practice' && (
          <PracticeView
            song={song}
            tl={tl}
            frame={snap.frame}
            playing={playing}
            display={display}
            showDiagrams={prefs.showDiagrams}
            showStrum={prefs.showStrum}
            quarterBpm={toQ(snap.settings.bpm, song)}
            previewStrings={previewStrings}
            onSeek={(t) => (playing ? void player.start(t) : player.seek(t))}
            onChordTap={setChord}
          />
        )}
        {view === 'tab' && <TabView song={song} tl={tl} frame={snap.frame} playing={playing} display={display} onBarTap={onBarTap} />}
      </main>

      <TransportBar player={player} snap={snap} display={display} onLoopMenu={() => setSheet('loop')} onTempoMenu={() => setSheet('tempo')} onFullscreen={() => setFullscreen(true)} />

      {fullscreen && (
        <FullscreenPractice onClose={() => setFullscreen(false)} playing={playing}>
          <PracticeView
            song={song}
            tl={tl}
            frame={snap.frame}
            playing={playing}
            display={display}
            showDiagrams={prefs.showDiagrams}
            showStrum={prefs.showStrum}
            quarterBpm={toQ(snap.settings.bpm, song)}
            previewStrings={previewStrings}
            big
            onSeek={(t) => (playing ? void player.start(t) : player.seek(t))}
            onChordTap={setChord}
          />
          <TransportBar player={player} snap={snap} display={display} onLoopMenu={() => setSheet('loop')} onTempoMenu={() => setSheet('tempo')} compact />
        </FullscreenPractice>
      )}

      <ChordDetail symbol={chord} onClose={() => setChord(null)} tuning={song.tuning} capo={song.capo} songShapes={song.shapes} songKey={tl.key} />
      <TempoSheet open={sheet === 'tempo'} onClose={() => setSheet(null)} player={player} snap={snap} />
      <LoopSheet open={sheet === 'loop'} onClose={() => setSheet(null)} player={player} snap={snap} onSelectBars={() => setSelecting([])} />
      <PracticeSettingsSheet
        open={sheet === 'settings'}
        onClose={() => setSheet(null)}
        player={player}
        snap={snap}
        showDiagrams={prefs.showDiagrams}
        showStrum={prefs.showStrum}
        numerals={prefs.numerals}
        onPrefs={(p) => app.setPrefs(p)}
      />
      {patternFor !== null && tl.sections[patternFor] && (
        <PatternPicker
          open
          onClose={() => setPatternFor(null)}
          patterns={patterns}
          current={tl.sections[patternFor].pattern.id}
          meter={tl.sections[patternFor].meter}
          quarterBpm={toQ(snap.settings.bpm, song)}
          previewStrings={previewStrings}
          onPick={pickPattern}
          sectionName={tl.sections[patternFor].section.name}
          isDemo={demo}
        />
      )}
      <Sheet open={sheet === 'more'} title={song.title} onClose={() => setSheet(null)}>
        <div className="menu">
          {demo ? (
            <button type="button" className="menu-item" onClick={editCopy}>
              Edit a copy <span className="muted">(demo songs are read-only)</span>
            </button>
          ) : (
            <button type="button" className="menu-item" onClick={() => navigate(`/edit/${encodeURIComponent(song.id)}`)}>
              Edit song
            </button>
          )}
          {!demo && (
            <button type="button" className="menu-item" onClick={editCopy}>
              Duplicate
            </button>
          )}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              void saveTextFile(`${slug(song.title)}.strumflow.json`, exportSongJson(song));
              setSheet(null);
            }}
          >
            Export as JSON
          </button>
          {!demo && (
            <button
              type="button"
              className="menu-item danger"
              onClick={() => {
                if (confirm(`Delete "${song.title}"? This cannot be undone.`)) {
                  player.stop();
                  app.deleteSong(song.id);
                  toast('Song deleted');
                  navigate('/library');
                }
              }}
            >
              Delete song
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

const toQ = (bpm: number, song: Song) => toQuarterBpm(bpm, song.meter);

function PatternDock({
  snapPattern, activeCell, label, quarterBpm, previewStrings, onChange,
}: {
  snapPattern: StrumPattern;
  activeCell: number | null;
  label: string;
  quarterBpm: number;
  previewStrings: (number | null)[] | null;
  onChange: () => void;
}) {
  return (
    <div className="pattern-dock">
      <div className="pattern-dock-head">
        <span className="muted small">Strum · {label}</span>
        <button type="button" className="btn btn-ghost btn-small" onClick={onChange}>
          Change
        </button>
      </div>
      <StrumPatternView pattern={snapPattern} activeCell={activeCell} quarterBpm={quarterBpm} previewStrings={previewStrings} compact />
    </div>
  );
}

function FullscreenPractice({ children, onClose, playing }: { children: React.ReactNode; onClose: () => void; playing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    // Real full screen where supported (not on iPhone Safari — the overlay fills the screen instead).
    const req = el?.requestFullscreen?.bind(el);
    if (req) req().catch(() => {});
    document.body.classList.add('sheet-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sheet-open');
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);
  useWakeLock(playing);
  return (
    <div className="fullscreen-practice" ref={ref} role="dialog" aria-modal="true" aria-label="Full-screen practice">
      <button type="button" className="icon-btn fs-close" onClick={onClose} aria-label="Exit full-screen practice">
        <IconClose />
      </button>
      {children}
    </div>
  );
}

/** Keep the screen awake while practising (where the Wake Lock API exists). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    nav.wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [active]);
}
