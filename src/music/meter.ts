/**
 * Musical time and meters.
 *
 * All musical positions are integer TICKS. A quarter note is 960 ticks, which
 * divides evenly into eighths (480), sixteenths (240), thirty-seconds (120),
 * eighth-note triplets (320), sixteenth triplets (160) and quintuplets (192).
 * Integer ticks never accumulate floating-point error, so bar 200 starts at
 * exactly 200 × bar length no matter how long the song is.
 *
 * Seconds only appear at the very edge (audio scheduling), via `secondsPerTick`.
 */

export const TPQ = 960; // ticks per quarter note
export const WHOLE = TPQ * 4;

export const NOTE = {
  whole: WHOLE,
  half: TPQ * 2,
  quarter: TPQ,
  eighth: TPQ / 2,
  sixteenth: TPQ / 4,
  thirtySecond: TPQ / 8,
  dottedHalf: TPQ * 3,
  dottedQuarter: (TPQ * 3) / 2,
  dottedEighth: (TPQ * 3) / 4,
  tripletEighth: TPQ / 3,
  tripletSixteenth: TPQ / 6,
} as const;

/** A time signature. `grouping` (optional) splits the bar into beats, in units of 1/den. */
export interface Meter {
  num: number;
  den: number;
  /** e.g. 7/8 as [2, 2, 3]. Sum must equal `num`. Defaults are derived from the meter. */
  grouping?: number[];
}

export type MeterKind = 'simple' | 'compound' | 'irregular';

export const SUPPORTED_DENOMINATORS = [2, 4, 8, 16] as const;

/** Common meters offered in pickers. */
export const COMMON_METERS: Meter[] = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 5, den: 4 },
  { num: 6, den: 8 },
  { num: 7, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
];

export function meterLabel(m: Meter): string {
  const base = `${m.num}/${m.den}`;
  const g = m.grouping;
  if (g && g.join('+') !== defaultGrouping({ num: m.num, den: m.den }).join('+')) return `${base} (${g.join('+')})`;
  return base;
}

export function parseMeter(text: string): Meter | null {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:\(([\d+\s]+)\))?\s*$/.exec(text);
  if (!m) return null;
  const meter: Meter = { num: Number(m[1]), den: Number(m[2]) };
  if (m[3]) meter.grouping = m[3].split('+').map((s) => Number(s.trim()));
  return validateMeter(meter) ? null : meter;
}

/** Returns an error message, or null when the meter is usable. */
export function validateMeter(m: Meter): string | null {
  if (!Number.isInteger(m.num) || m.num < 1 || m.num > 32) return 'Numerator must be a whole number from 1 to 32';
  if (!(SUPPORTED_DENOMINATORS as readonly number[]).includes(m.den)) return 'Denominator must be 2, 4, 8 or 16';
  if (m.grouping) {
    if (!m.grouping.every((g) => Number.isInteger(g) && g > 0)) return 'Beat groups must be positive whole numbers';
    const sum = m.grouping.reduce((a, b) => a + b, 0);
    if (sum !== m.num) return `Beat groups (${m.grouping.join('+')}) must add up to ${m.num}`;
  }
  return null;
}

/** Length of one 1/den note ("pulse"). */
export const pulseTicks = (m: Meter): number => WHOLE / m.den;

export const barTicks = (m: Meter): number => m.num * pulseTicks(m);

/**
 * Compound meters (6/8, 9/8, 12/8, 6/4…) group pulses in threes and are felt
 * as dotted beats. Irregular meters (5/8, 7/8, 11/8) have unequal groups.
 */
export function meterKind(m: Meter): MeterKind {
  const groups = beatGrouping(m);
  if (groups.every((g) => g === 1)) return 'simple';
  if (groups.every((g) => g === 3)) return 'compound';
  return 'irregular';
}

export function defaultGrouping(m: Meter): number[] {
  const { num, den } = m;
  if (den >= 8) {
    if (num % 3 === 0 && num > 3) return new Array(num / 3).fill(3);
    if (num <= 4) return new Array(num).fill(1);
    // Irregular eighth-note meters: twos with a three at the end (5 = 2+3, 7 = 2+2+3).
    const groups: number[] = [];
    let left = num;
    while (left > 3) {
      groups.push(2);
      left -= 2;
    }
    groups.push(left);
    return groups;
  }
  return new Array(num).fill(1);
}

export function beatGrouping(m: Meter): number[] {
  return m.grouping && m.grouping.length ? m.grouping : defaultGrouping(m);
}

export interface Beat {
  index: number;
  /** Offset from the start of the bar. */
  start: number;
  length: number;
}

/** The felt beats of a bar (dotted quarters in 6/8, 2+2+3 eighths in 7/8, quarters in 4/4). */
export function beatsOfBar(m: Meter): Beat[] {
  const p = pulseTicks(m);
  let start = 0;
  return beatGrouping(m).map((g, index) => {
    const beat = { index, start, length: g * p };
    start += g * p;
    return beat;
  });
}

/**
 * The note value the BPM counts:
 *  - simple meters: the denominator note (♩ in 4/4, 𝅗𝅥 in 2/2)
 *  - compound meters: the dotted beat (♩. in 6/8)
 *  - irregular meters: the pulse (♪ in 7/8), because the beats are unequal
 */
export function tempoUnitTicks(m: Meter): number {
  const kind = meterKind(m);
  if (kind === 'compound') return pulseTicks(m) * 3;
  return pulseTicks(m);
}

export function tempoUnitSymbol(m: Meter): string {
  const t = tempoUnitTicks(m);
  const symbols: Record<number, string> = {
    [NOTE.half]: '𝅗𝅥',
    [NOTE.dottedHalf]: '𝅗𝅥.',
    [NOTE.quarter]: '♩',
    [NOTE.dottedQuarter]: '♩.',
    [NOTE.eighth]: '♪',
    [NOTE.dottedEighth]: '♪.',
    [NOTE.sixteenth]: '𝅘𝅥𝅯',
  };
  return symbols[t] ?? '♩';
}

/** Seconds per tick for a BPM counted in the meter's tempo unit. */
export function secondsPerTick(bpm: number, m: Meter): number {
  return 60 / (bpm * tempoUnitTicks(m));
}

/** Convert a BPM in one meter's tempo unit to quarter-note BPM (tempo map uses quarters). */
export function toQuarterBpm(bpm: number, m: Meter): number {
  return (bpm * tempoUnitTicks(m)) / TPQ;
}

export const secondsPerTickFromQuarterBpm = (qbpm: number): number => 60 / (qbpm * TPQ);

/** Accent levels: 2 = bar downbeat, 1 = beat, 0 = subdivision. */
export type Accent = 0 | 1 | 2;

/** Accent of a pulse/subdivision at `offset` ticks into the bar. */
export function accentAt(m: Meter, offset: number): Accent {
  if (offset === 0) return 2;
  return beatsOfBar(m).some((b) => b.start === offset) ? 1 : 0;
}

/**
 * Count label for a position inside the bar, given the grid step used for display.
 * 4/4 eighths: 1 & 2 & …  16ths: 1 e & a …  6/8 eighths: 1 & a 2 & a
 * 7/8: 1 2 | 1 2 | 1 2 3 shown as beat numbers plus "&"/"a".
 */
export function countLabel(m: Meter, offset: number, step: number): string {
  const beats = beatsOfBar(m);
  const beat = beats.find((b) => offset >= b.start && offset < b.start + b.length);
  if (!beat) return '';
  const within = offset - beat.start;
  if (within === 0) return String(beat.index + 1);
  const p = pulseTicks(m);
  const kind = meterKind(m);
  if (kind !== 'simple') {
    // Beats made of several pulses: name pulses "&" / "a", sub-pulses "·".
    if (within % p === 0) {
      const pulseIdx = within / p;
      const pulses = beat.length / p;
      if (pulses === 2) return '&';
      return pulseIdx === 1 ? '&' : 'a';
    }
    return '·';
  }
  // Simple meter: one beat split into subdivisions.
  const frac = within / beat.length;
  if (step * 3 === beat.length || step * 6 === beat.length) {
    // Triplets
    if (Math.abs(frac - 1 / 3) < 1e-9) return 'trip';
    if (Math.abs(frac - 2 / 3) < 1e-9) return 'let';
    return '·';
  }
  if (frac === 0.5) return '&';
  if (frac === 0.25) return 'e';
  if (frac === 0.75) return 'a';
  return '·';
}

/** Human readable duration in beats/bars for a tick length, e.g. "1 bar", "2 beats", "1½ beats". */
export function describeDuration(ticks: number, m: Meter): string {
  const bar = barTicks(m);
  if (ticks % bar === 0) {
    const n = ticks / bar;
    return `${n} bar${n === 1 ? '' : 's'}`;
  }
  const beats = beatsOfBar(m);
  const uniform = beats.every((b) => b.length === beats[0].length);
  if (uniform) {
    const beatLen = beats[0].length;
    const whole = Math.floor(ticks / beatLen);
    const rest = ticks - whole * beatLen;
    const fracs: Record<string, string> = { '0.5': '½', '0.25': '¼', '0.75': '¾', '0.333': '⅓', '0.667': '⅔' };
    const fracText = rest ? (fracs[(rest / beatLen).toFixed(3).replace(/0+$/, '')] ?? `+${rest}t`) : '';
    const label = `${whole || (fracText ? '' : '0')}${fracText}`;
    const plural = whole > 1 || (whole === 1 && fracText) ? 's' : '';
    return `${label} beat${plural}`;
  }
  const pulses = ticks / pulseTicks(m);
  return `${Number.isInteger(pulses) ? pulses : pulses.toFixed(2)} × ${meterUnitName(m.den)}`;
}

function meterUnitName(den: number): string {
  return { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }[den] ?? `1/${den}`;
}

export const sameMeter = (a: Meter, b: Meter): boolean =>
  a.num === b.num && a.den === b.den && beatGrouping(a).join() === beatGrouping(b).join();
