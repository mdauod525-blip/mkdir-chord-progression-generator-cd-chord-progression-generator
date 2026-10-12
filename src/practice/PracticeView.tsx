/**
 * Beat-by-beat practice view: the chord you play now (big), the next chord and
 * when it arrives, the beats of the current bar, the strum pattern, and the
 * upcoming bars.
 */
import type { Timeline } from '../music/timeline';
import type { Frame } from '../player/player';
import type { Song } from '../data/song';
import { beatsOfBar, countLabel, describeDuration, meterKind, pulseTicks } from '../music/meter';
import { shapesForChord } from '../music/guitar';
import { ChordDiagram } from '../ui/ChordDiagram';
import { StrumPatternView } from '../ui/StrumPatternView';
import { type SheetDisplay } from './ChordSheetView';
import { barSegments, chordLabel, numeralFor } from './display';

interface Props {
  song: Song;
  tl: Timeline;
  frame: Frame;
  playing: boolean;
  display: SheetDisplay;
  showDiagrams: boolean;
  showStrum: boolean;
  quarterBpm: number;
  previewStrings: (number | null)[] | null;
  big?: boolean;
  onSeek: (tick: number) => void;
  onChordTap: (symbol: string) => void;
}

export function PracticeView({ song, tl, frame, playing, display, showDiagrams, showStrum, quarterBpm, previewStrings, big, onSeek, onChordTap }: Props) {
  const { loc } = frame;
  const bar = tl.bars[loc.barIndex];
  const sec = tl.sections[loc.sectionIndex];
  const cur = loc.chordIndex >= 0 ? tl.chords[loc.chordIndex] : null;
  const next = loc.nextChordIndex >= 0 ? tl.chords[loc.nextChordIndex] : null;
  const label = (sym: string) => chordLabel(tl, sym, display.names, display.capo, display.prefer);
  const shape = (sym: string) => shapesForChord(sym, song.tuning, song.shapes)[0];
  if (!bar || !sec) return null;

  const beats = beatsOfBar(bar.meter);
  const subdivide = meterKind(bar.meter) !== 'simple';
  const pulse = pulseTicks(bar.meter);
  const upcoming = tl.bars.slice(loc.barIndex, loc.barIndex + (big ? 6 : 8));
  const sectionBars = sec.endBar - sec.firstBar;
  const changeIn = next ? describeDuration(Math.ceil(loc.ticksToNextChord / pulse) * pulse || pulse, bar.meter) : '';

  return (
    <div className={`practice${big ? ' practice-big' : ''}`}>
      <div className="pv-where">
        <span className="pv-section">{sec.section.name}</span>
        <span className="muted">
          {bar.isPickup ? 'pickup' : `bar ${bar.number} of ${sectionBars - (sec.section.pickup ? 1 : 0)}`}
        </span>
      </div>

      {frame.countIn && (
        <div className="countin" aria-live="assertive">
          <span className="muted">Count-in</span>
          <span className="countin-num">{frame.countInBeat + 1}</span>
        </div>
      )}

      <div className="pv-now-next">
        <div className={`pv-now${cur && !cur.noChord ? '' : ' pv-nc'}`}>
          <span className="pv-label muted">Now</span>
          <button type="button" className="pv-chord" onClick={() => cur && !cur.noChord && onChordTap(cur.symbol)} aria-label={cur ? `Current chord ${label(cur.symbol)}. Tap for diagram.` : 'No chord'}>
            {cur ? label(cur.symbol) : '—'}
          </button>
          {display.numerals && cur && !cur.noChord && <span className="pv-numeral">{numeralFor(tl, cur.symbol)}</span>}
          {showDiagrams && cur && !cur.noChord && <ChordDiagram shape={shape(cur.symbol)} width={big ? 190 : 150} label={label(cur.symbol)} />}
        </div>
        <div className="pv-next">
          <span className="pv-label muted">Next</span>
          {next ? (
            <>
              <button type="button" className="pv-next-chord" onClick={() => !next.noChord && onChordTap(next.symbol)}>
                {label(next.symbol)}
              </button>
              <span className="pv-in muted">in {changeIn}</span>
              {showDiagrams && !next.noChord && <ChordDiagram shape={shape(next.symbol)} width={big ? 110 : 88} showFingers={false} label={label(next.symbol)} />}
            </>
          ) : (
            <span className="muted">End</span>
          )}
        </div>
      </div>

      <div className="pv-beats" role="group" aria-label="Beats in this bar — tap to start from a beat">
        {beats.map((b) => {
          const startInBar = b.start - bar.phase;
          const disabled = startInBar < 0;
          const changeHere = tl.chords.find((c) => c.start === bar.start + startInBar && startInBar >= 0);
          const subs = subdivide ? Math.round(b.length / pulse) : 1;
          const on = loc.beatIndex === b.index && !frame.countIn && (playing || frame.tick > 0);
          return (
            <button
              key={b.index}
              type="button"
              className={`pv-beat${b.index === 0 ? ' downbeat' : ''}${on ? ' on' : ''}`}
              style={{ flexGrow: b.length }}
              disabled={disabled}
              onClick={() => onSeek(bar.start + startInBar)}
              aria-label={`Beat ${b.index + 1}${changeHere ? `, change to ${label(changeHere.symbol)}` : ''}`}
            >
              <span className="pv-beat-change">{changeHere ? label(changeHere.symbol) : ''}</span>
              <span className="pv-beat-num">{b.index + 1}</span>
              {subs > 1 && (
                <span className="pv-subs" aria-hidden="true">
                  {Array.from({ length: subs }, (_, k) => (
                    <span key={k} className={`pv-sub${on && Math.floor(loc.offsetInBeat / pulse) === k ? ' on' : ''}`}>
                      {k === 0 ? '' : countLabel(bar.meter, b.start + k * pulse, pulse)}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showStrum && (
        <StrumPatternView
          pattern={sec.pattern}
          activeCell={frame.cell && frame.cell.sectionIndex === sec.index && (playing || frame.tick > 0) ? frame.cell.cell : null}
          quarterBpm={quarterBpm}
          previewStrings={previewStrings}
          compact={big}
        />
      )}

      <div className="pv-ribbon" role="group" aria-label="Upcoming bars — tap to jump">
        {upcoming.map((b) => (
          <button key={b.index} type="button" className={`pv-ribbon-bar${b.index === loc.barIndex ? ' on' : ''}`} onClick={() => onSeek(b.start)} aria-label={`Jump to ${tl.sections[b.sectionIndex].section.name} bar ${b.number}`}>
            {barSegments(tl, b).map((seg, i) => {
              const c = seg.chordIndex >= 0 ? tl.chords[seg.chordIndex] : null;
              return (
                <span key={i} className={`pv-ribbon-seg${seg.held ? ' held' : ''}`} style={{ flexGrow: seg.to - seg.from }}>
                  {c && !seg.held ? label(c.symbol) : '·'}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
