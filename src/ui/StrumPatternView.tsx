/** Visual strumming pattern with beat counts, accents and live highlighting. */
import { useEffect, useRef, useState } from 'react';
import { type StrumPattern, beatStartCells, cellLabels, cellOffset, patternLength, patternStrokes, canSwing } from '../music/strum';
import { type Meter, barTicks, beatsOfBar, meterLabel, secondsPerTickFromQuarterBpm } from '../music/meter';
import { audio } from '../audio/engine';
import { IconPause, IconPlay } from './icons';
import { Term } from './Glossary';

const SYMBOL: Record<string, string> = { D: '↓', U: '↑', x: '✕', '-': '·' };
const WORD: Record<string, string> = { D: 'down', U: 'up', x: 'muted', '-': 'no strum' };

interface Props {
  pattern: StrumPattern;
  /** Cell to highlight (from the player). */
  activeCell?: number | null;
  /** Practice tempo (quarter notes per minute) for the preview. */
  quarterBpm?: number;
  /** Notes per string to strum in the preview (defaults to an open G chord). */
  previewStrings?: (number | null)[] | null;
  compact?: boolean;
  /** Called when a cell is tapped (editor). */
  onCellTap?: (cell: number) => void;
  onAccentTap?: (cell: number) => void;
  showHeader?: boolean;
}

const OPEN_G: (number | null)[] = [43, 47, 50, 55, 59, 67];

export function StrumPatternView({ pattern, activeCell = null, quarterBpm = 80, previewStrings, compact, onCellTap, onAccentTap, showHeader = true }: Props) {
  const { cell: previewCell, playing, toggle } = usePatternPreview(pattern, quarterBpm, previewStrings ?? OPEN_G);
  const labels = cellLabels(pattern);
  const beatStarts = beatStartCells(pattern);
  const accents = new Set(pattern.accents ?? []);
  const active = playing ? previewCell : activeCell;
  const swing = pattern.feel === 'swing' && canSwing(pattern);
  const bar = barTicks(pattern.meter);
  const barStarts = new Set(pattern.steps.map((_, i) => i).filter((i) => i > 0 && (i * pattern.step) % bar === 0));
  const editable = Boolean(onCellTap);

  return (
    <div className={`strum${compact ? ' strum-compact' : ''}`}>
      {showHeader && (
        <div className="strum-head">
          <div className="strum-title">
            <Term id="strum">{pattern.name}</Term>
            <span className="muted small">
              {' '}
              · {meterLabel(pattern.meter)}
              {swing && (
                <>
                  {' · '}
                  <Term id="swing">swing</Term>
                </>
              )}
            </span>
          </div>
          <button type="button" className="btn btn-small" onClick={toggle} aria-label={playing ? 'Stop preview' : `Hear the ${pattern.name} pattern`}>
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />} {playing ? 'Stop' : 'Hear it'}
          </button>
        </div>
      )}
      <div
        className="strum-grid"
        style={{ gridTemplateColumns: `repeat(${pattern.steps.length}, minmax(0, 1fr))` }}
        role="list"
        aria-label={`Strumming pattern: ${pattern.steps.map((s, i) => `${labels[i]} ${WORD[s]}`).join(', ')}`}
      >
        {pattern.steps.map((s, i) => {
          const cls = [
            'strum-cell',
            `stroke-${s === '-' ? 'rest' : s}`,
            beatStarts.has(i) ? 'beat-start' : '',
            barStarts.has(i) ? 'bar-start' : '',
            accents.has(i) ? 'accent' : '',
            active === i ? 'active' : '',
          ].join(' ');
          const content = (
            <>
              <span className="strum-accent" aria-hidden="true">{accents.has(i) ? '>' : ''}</span>
              <span className="strum-symbol" aria-hidden="true">{SYMBOL[s]}</span>
              <span className="strum-count">{labels[i]}</span>
            </>
          );
          return editable ? (
            <div key={i} className={cls} role="listitem">
              {onAccentTap && (
                <button type="button" className="strum-accent-btn" onClick={() => onAccentTap(i)} aria-label={`Accent ${labels[i]} (${accents.has(i) ? 'on' : 'off'})`} aria-pressed={accents.has(i)}>
                  {accents.has(i) ? '>' : '·'}
                </button>
              )}
              <button type="button" className="strum-cell-btn" onClick={() => onCellTap!(i)} aria-label={`Count ${labels[i]}: ${WORD[s]}. Tap to change.`}>
                <span className="strum-symbol" aria-hidden="true">{SYMBOL[s]}</span>
                <span className="strum-count">{labels[i]}</span>
              </button>
            </div>
          ) : (
            <div key={i} className={cls} role="listitem">
              {content}
            </div>
          );
        })}
      </div>
      {!compact && pattern.description && <p className="muted small strum-desc">{pattern.description}</p>}
    </div>
  );
}

/**
 * Plays a pattern twice (with clicks on the beats) and reports the sounding
 * cell, using the audio clock for both sound and highlight.
 */
export function usePatternPreview(pattern: StrumPattern, quarterBpm: number, strings: (number | null)[]) {
  const [cell, setCell] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const stopAt = useRef(0);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (playing) audio.cancel(audio.now());
    setPlaying(false);
    setCell(null);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // Stop if the pattern is edited while previewing.
  useEffect(() => {
    if (playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern]);

  const start = async () => {
    const ctx = await audio.unlock();
    if (!ctx) return;
    audio.warm(strings.filter((n): n is number => n !== null));
    const spt = secondsPerTickFromQuarterBpm(quarterBpm);
    const len = patternLength(pattern);
    const reps = len >= barTicks(pattern.meter) * 2 ? 1 : 2;
    const t0 = audio.now() + 0.08;
    const strokes = patternStrokes(pattern);
    const beats = beatsOfBar(pattern.meter as Meter);
    const bar = barTicks(pattern.meter);
    for (let r = 0; r < reps; r++) {
      for (let b = 0; b < len / bar; b++)
        beats.forEach((beat) => audio.click(t0 + (r * len + b * bar + beat.start) * spt, beat.index === 0 && b === 0 ? 2 : 1));
      for (const s of strokes) audio.strum(t0 + (r * len + s.offset) * spt, { strings, stroke: s.stroke, accent: s.accent });
    }
    stopAt.current = t0 + reps * len * spt;
    setPlaying(true);
    const tick = () => {
      const now = audio.now() - audio.outputLatency();
      if (now >= stopAt.current) {
        setPlaying(false);
        setCell(null);
        return;
      }
      const pos = Math.max(0, (now - t0) / spt) % len;
      // Latest cell whose (swung) start has passed.
      let c = 0;
      for (let i = 0; i < pattern.steps.length; i++) if (cellOffset(pattern, i) <= pos) c = i;
      setCell(c);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const toggle = () => {
    if (playing) stop();
    else void start();
  };
  return { cell, playing, toggle };
}

