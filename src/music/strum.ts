/**
 * Strumming patterns.
 *
 * A pattern is a grid of strokes: `step` ticks per cell, one symbol per cell.
 *   D = downstroke, U = upstroke, x = muted/percussive strum ("chuck"), - = no stroke
 * The chord keeps ringing through "-" cells, so a 16th-note grid expresses
 * dotted rhythms (D - - U = dotted eighth + sixteenth), and a quarter grid
 * expresses plain quarter notes.
 *
 * Swing delays the second cell of every pair of cells (eighths or sixteenths)
 * so the pair is long–short instead of even. Patterns are independent of the
 * chords: a section only references a pattern by id, so changing the pattern
 * never changes the chord progression.
 */
import { type Meter, NOTE, barTicks, beatsOfBar, countLabel, meterKind, meterLabel, accentAt } from './meter';

export type Stroke = 'D' | 'U' | 'x' | '-';
export const STROKES: Stroke[] = ['D', 'U', 'x', '-'];

export type Feel = 'straight' | 'swing';

export interface StrumPattern {
  id: string;
  name: string;
  /** Meter the pattern was written for. */
  meter: Meter;
  /** Grid cell length in ticks (960 = quarter, 480 = eighth, 240 = sixteenth, 320 = eighth triplet). */
  step: number;
  /** One stroke per cell; length × step is the pattern length (one or more bars). */
  steps: Stroke[];
  /** Cell indices that are accented (played harder). */
  accents?: number[];
  feel?: Feel;
  /** Share of each swung pair given to the first note: 0.5 = straight, 2/3 = triplet swing. */
  swingRatio?: number;
  description?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface StrokeEvent {
  /** Index of the cell in the pattern. */
  cell: number;
  /** Tick offset from the start of the pattern (after swing). */
  offset: number;
  stroke: Exclude<Stroke, '-'>;
  accent: boolean;
}

export const GRID_OPTIONS: { label: string; step: number }[] = [
  { label: 'Quarter notes', step: NOTE.quarter },
  { label: 'Eighth notes', step: NOTE.eighth },
  { label: 'Sixteenth notes', step: NOTE.sixteenth },
  { label: 'Eighth triplets', step: NOTE.tripletEighth },
];

export const patternLength = (p: StrumPattern): number => p.steps.length * p.step;

/** Can the pattern swing? Only straight even grids of eighths or sixteenths in simple meters. */
export function canSwing(p: Pick<StrumPattern, 'meter' | 'step'>): boolean {
  return meterKind(p.meter) === 'simple' && (p.step === NOTE.eighth || p.step === NOTE.sixteenth);
}

/** Tick offset of a cell inside the pattern, with swing applied. */
export function cellOffset(p: StrumPattern, cell: number): number {
  const straight = cell * p.step;
  if (p.feel !== 'swing' || !canSwing(p) || cell % 2 === 0) return straight;
  const pair = p.step * 2;
  const ratio = p.swingRatio ?? 2 / 3;
  return (cell - 1) * p.step + Math.round(pair * ratio);
}

/** The strokes of one pass through the pattern. */
export function patternStrokes(p: StrumPattern): StrokeEvent[] {
  const accents = new Set(p.accents ?? []);
  const out: StrokeEvent[] = [];
  p.steps.forEach((s, cell) => {
    if (s === '-') return;
    out.push({ cell, offset: cellOffset(p, cell), stroke: s, accent: accents.has(cell) });
  });
  return out;
}

/** Count labels for each cell, from the meter (1 & 2 & … / 1 e & a … / 1 & a 2 & a …). */
export function cellLabels(p: StrumPattern): string[] {
  const bar = barTicks(p.meter);
  return p.steps.map((_, i) => countLabel(p.meter, (i * p.step) % bar, p.step));
}

/** Which cells start a beat (for visual grouping). */
export function beatStartCells(p: StrumPattern): Set<number> {
  const bar = barTicks(p.meter);
  const starts = new Set(beatsOfBar(p.meter).map((b) => b.start));
  const out = new Set<number>();
  p.steps.forEach((_, i) => {
    if (starts.has((i * p.step) % bar)) out.add(i);
  });
  return out;
}

/** Validation: returns an error message or null. */
export function validatePattern(p: StrumPattern): string | null {
  if (!p.steps.length) return 'Pattern needs at least one cell';
  if (!Number.isInteger(p.step) || p.step <= 0) return 'Grid step must be a positive whole number of ticks';
  if (!p.steps.every((s) => STROKES.includes(s))) return 'Strokes must be D, U, x or -';
  const len = patternLength(p);
  const bar = barTicks(p.meter);
  if (len % bar !== 0 && bar % len !== 0) {
    return `Pattern length (${p.steps.length} cells) must fill whole bars of ${meterLabel(p.meter)} or divide a bar evenly`;
  }
  return null;
}

/** A default pattern for any meter: a downstroke on each beat, accent on the downbeat. */
export function defaultPatternFor(meter: Meter, id = `default-${meter.num}-${meter.den}`): StrumPattern {
  const kind = meterKind(meter);
  const step = kind === 'simple' ? Math.min(NOTE.quarter, barTicks(meter) / meter.num) : barTicks(meter) / meter.num;
  const cells = barTicks(meter) / step;
  const steps: Stroke[] = [];
  for (let i = 0; i < cells; i++) steps.push(accentAt(meter, i * step) > 0 ? 'D' : '-');
  return { id, name: `Beats in ${meterLabel(meter)}`, meter, step, steps, accents: [0], description: 'One downstroke on every beat.', difficulty: 'beginner' };
}

/**
 * Suggested stroke when the user taps an empty cell: hands move down on
 * beats/strong subdivisions and up in between.
 */
export function naturalStroke(p: Pick<StrumPattern, 'meter' | 'step'>, cell: number): 'D' | 'U' {
  const bar = barTicks(p.meter);
  const offset = (cell * p.step) % bar;
  if (accentAt(p.meter, offset) > 0) return 'D';
  // In simple meters, the half-beat (the "&") is an upstroke on an eighth grid,
  // and a downstroke on a sixteenth grid (1 e & a = D U D U).
  return cell % 2 === 0 ? 'D' : 'U';
}

/** Cycle used when tapping a cell in the editor. */
export function nextStroke(current: Stroke, natural: 'D' | 'U'): Stroke {
  const order: Stroke[] = natural === 'D' ? ['-', 'D', 'U', 'x'] : ['-', 'U', 'D', 'x'];
  return order[(order.indexOf(current) + 1) % order.length];
}

export function patternToText(p: StrumPattern): string {
  return p.steps.join(' ');
}
