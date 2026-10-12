/**
 * Tablature view. Only shows tab that exists in the arrangement data — StrumFlow
 * never generates "tab" for a real recording.
 */
import type { Timeline } from '../music/timeline';
import type { Frame } from '../player/player';
import type { Song } from '../data/song';
import { tuningNotes } from '../music/guitar';
import { beatsOfBar } from '../music/meter';
import { type SheetDisplay } from './ChordSheetView';
import { barSegments, chordLabel } from './display';

interface Props {
  song: Song;
  tl: Timeline;
  frame: Frame;
  playing: boolean;
  display: SheetDisplay;
  onBarTap: (barIndex: number) => void;
}

export function hasTab(song: Song): boolean {
  return song.sections.some((s) => s.tab && s.tab.length > 0);
}

export function TabView({ song, tl, frame, playing, display, onBarTap }: Props) {
  const names = tuningNotes(song.tuning);
  return (
    <div className="tab-view">
      <p className="muted small">
        Tab lines from top to bottom: high e … low {names[0]}. Numbers are frets{song.capo ? ` (counted from the capo on fret ${song.capo})` : ''}.
      </p>
      {tl.sections.map((sec) => {
        const s = sec.section;
        const bars = tl.bars.slice(sec.firstBar, sec.endBar);
        return (
          <section key={sec.index} className="song-section">
            <header className="section-head">
              <h3 className="section-name">{s.name}</h3>
            </header>
            {!s.tab?.length ? (
              <p className="muted small">No tab for this section — strum the chords: {bars.flatMap((b) => barSegments(tl, b).filter((x) => x.chordIndex >= 0 && !x.held).map((x) => chordLabel(tl, tl.chords[x.chordIndex].symbol, display.names, display.capo, display.prefer))).join(' · ')}</p>
            ) : (
              <>
                {s.notes && <p className="muted small">{s.notes}</p>}
                <div className="tab-bars">
                  {bars.map((bar) => {
                    const notes = s.tab!.filter((n) => n.start + sec.start >= bar.start && n.start + sec.start < bar.start + bar.length);
                    const active = frame.loc.barIndex === bar.index && (playing || frame.tick > 0);
                    const W = 200;
                    const H = 86;
                    const line = (str: number) => 12 + (5 - str) * 13; // high e on top
                    const xOf = (tick: number) => 14 + ((tick - bar.start) / bar.length) * (W - 22);
                    const playX = active ? xOf(frame.tick) : null;
                    return (
                      <button key={bar.index} type="button" className={`tab-bar${active ? ' bar-active' : ''}`} onClick={() => onBarTap(bar.index)} aria-label={`Tab bar ${bar.number}`}>
                        <div className="tab-chords">
                          {barSegments(tl, bar).map((seg, i) => (
                            <span key={i} style={{ flexGrow: seg.to - seg.from }}>
                              {seg.chordIndex >= 0 && !seg.held ? chordLabel(tl, tl.chords[seg.chordIndex].symbol, display.names, display.capo, display.prefer) : ''}
                            </span>
                          ))}
                        </div>
                        <svg viewBox={`0 0 ${W} ${H}`} className="tab-svg" role="img" aria-label={`Frets: ${notes.map((n) => `string ${6 - n.string} fret ${n.fret}`).join(', ')}`}>
                          {[0, 1, 2, 3, 4, 5].map((str) => (
                            <line key={str} x1={4} x2={W - 4} y1={line(str)} y2={line(str)} className="tab-line" />
                          ))}
                          {beatsOfBar(bar.meter).map((b) => (
                            <line key={b.index} x1={xOf(bar.start + b.start)} x2={xOf(bar.start + b.start)} y1={line(5) - 4} y2={line(0) + 4} className="tab-beat" />
                          ))}
                          {playX !== null && <line x1={playX} x2={playX} y1={4} y2={H - 4} className="tab-playhead" />}
                          {notes.map((n, i) => {
                            const x = xOf(n.start + sec.start);
                            const on = active && frame.tick >= n.start + sec.start && frame.tick < n.start + sec.start + n.duration;
                            return (
                              <g key={i}>
                                <rect x={x - 6} y={line(n.string) - 6} width={12} height={12} className="tab-note-bg" />
                                <text x={x} y={line(n.string) + 4} textAnchor="middle" className={`tab-note${on ? ' on' : ''}`}>
                                  {n.fret}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
