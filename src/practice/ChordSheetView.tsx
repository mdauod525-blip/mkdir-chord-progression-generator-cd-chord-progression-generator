/**
 * Chord sheet: sections → bars → chord segments sized by duration, with beat
 * ticks, lyrics and live highlighting. Tap a bar to start from it.
 */
import { memo } from 'react';
import type { Timeline, TLSection } from '../music/timeline';
import type { Frame } from '../player/player';
import { beatsOfBar, describeDuration } from '../music/meter';
import { type ChordNames, barSegments, chordLabel, numeralFor } from './display';
import type { SpellingPreference } from '../music/keys';
import { IconLoop } from '../ui/icons';

export interface SheetDisplay {
  names: ChordNames;
  capo: number;
  prefer: SpellingPreference;
  numerals: boolean;
}

interface Props {
  tl: Timeline;
  frame: Frame;
  playing: boolean;
  display: SheetDisplay;
  loop: { start: number; end: number } | null;
  /** Bars chosen while selecting a loop. */
  selecting: number[] | null;
  onBarTap: (barIndex: number) => void;
  onLoopSection: (sectionIndex: number) => void;
  onPatternTap: (sectionIndex: number) => void;
  onChordTap: (symbol: string) => void;
}

export function ChordSheetView(props: Props) {
  const { tl } = props;
  return (
    <div className="sheet-view">
      {tl.sections.map((sec) => (
        <SectionBlock key={sec.index} sec={sec} {...props} activeSection={props.frame.loc.sectionIndex === sec.index} />
      ))}
    </div>
  );
}

const SectionBlock = memo(function SectionBlock({
  sec, tl, frame, playing, display, loop, selecting, onBarTap, onLoopSection, onPatternTap, onChordTap, activeSection,
}: Props & { sec: TLSection; activeSection: boolean }) {
  const s = sec.section;
  const bars = tl.bars.slice(sec.firstBar, sec.endBar);
  const hasLyrics = Boolean(s.lyrics?.length);
  const looped = loop && loop.start === sec.start && loop.end === sec.end;
  return (
    <section className={`song-section kind-${s.kind}${activeSection ? ' section-active' : ''}`} aria-label={s.name}>
      <header className="section-head">
        <h3 className="section-name">
          {s.name}
          {sec.occurrence > 1 && <span className="section-rep"> · {ordinal(sec.occurrence)} time</span>}
        </h3>
        <div className="section-tools">
          <button type="button" className="chip chip-small" onClick={() => onPatternTap(sec.index)} aria-label={`Strumming pattern for ${s.name}: ${sec.pattern.name}. Tap to change.`}>
            {sec.pattern.name}
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn-small${looped ? ' on' : ''}`}
            onClick={() => onLoopSection(sec.index)}
            aria-pressed={Boolean(looped)}
            aria-label={looped ? `Stop looping ${s.name}` : `Loop ${s.name}`}
          >
            <IconLoop size={18} />
          </button>
        </div>
      </header>
      <p className="section-meta muted small">
        {s.bars} bar{s.bars === 1 ? '' : 's'}
        {s.pickup ? ` + pickup` : ''}
        {s.meter ? ` · ${s.meter.num}/${s.meter.den}` : ''}
        {s.notes ? ` · ${s.notes}` : ''}
      </p>
      <div className={`bars${hasLyrics ? ' has-lyrics' : ''}`}>
        {bars.map((bar) => {
          const active = frame.loc.barIndex === bar.index && (playing || frame.tick > 0);
          const inLoop = loop && bar.start >= loop.start && bar.start < loop.end;
          const selected = selecting?.includes(bar.index) || (selecting && selecting.length === 1 && bar.index === selecting[0]);
          const beats = beatsOfBar(bar.meter);
          const lyrics = s.lyrics?.filter((l) => l.start + sec.start >= bar.start && l.start + sec.start < bar.start + bar.length) ?? [];
          return (
            <div
              key={bar.index}
              className={`bar${active ? ' bar-active' : ''}${inLoop ? ' bar-loop' : ''}${selected ? ' bar-selected' : ''}${bar.isPickup ? ' bar-pickup' : ''}`}
              onClick={() => onBarTap(bar.index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onBarTap(bar.index))}
              aria-label={`Bar ${bar.isPickup ? 'pickup' : bar.number}${selecting ? ', select for loop' : ', start here'}`}
            >
              <span className="bar-num">{bar.isPickup ? 'pickup' : bar.number}</span>
              <div className="bar-segments">
                {barSegments(tl, bar).map((seg, i) => {
                  const c = seg.chordIndex >= 0 ? tl.chords[seg.chordIndex] : null;
                  const isActive = active && c && frame.loc.chordIndex === c.index;
                  return (
                    <div key={i} className={`seg${seg.held ? ' seg-held' : ''}${isActive ? ' seg-active' : ''}${!c ? ' seg-empty' : ''}`} style={{ flexGrow: seg.to - seg.from }}>
                      {c && !seg.held ? (
                        <button
                          type="button"
                          className="seg-chord"
                          onClick={(e) => {
                            if (selecting) return;
                            e.stopPropagation();
                            onChordTap(c.symbol);
                          }}
                          aria-label={`${chordLabel(tl, c.symbol, display.names, display.capo, display.prefer)} for ${describeDuration(c.end - c.start, bar.meter)}. Tap for diagram.`}
                        >
                          {chordLabel(tl, c.symbol, display.names, display.capo, display.prefer)}
                          {display.numerals && !c.noChord && <span className="seg-numeral">{numeralFor(tl, c.symbol)}</span>}
                        </button>
                      ) : (
                        <span className="seg-hold" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="bar-beats" aria-hidden="true">
                {beats.map((b) => {
                  const startInBar = b.start - bar.phase;
                  if (startInBar < 0) return null;
                  const left = (startInBar / bar.length) * 100;
                  const on = active && frame.loc.beatIndex === b.index;
                  return <span key={b.index} className={`beat-tick${b.index === 0 ? ' downbeat' : ''}${on ? ' on' : ''}`} style={{ left: `${left}%` }} />;
                })}
              </div>
              {hasLyrics && <div className="bar-lyrics">{lyrics.map((l) => l.text).join(' ')}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
});

function ordinal(n: number): string {
  return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
