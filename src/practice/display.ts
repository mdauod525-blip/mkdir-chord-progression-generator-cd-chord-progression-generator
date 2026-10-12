/** Helpers for how chords are shown on the learning screen. */
import type { Timeline, TLBar, TLChord } from '../music/timeline';
import { displayChord, isNoChord } from '../music/chords';
import { type SpellingPreference, romanNumeral, transposeChordSymbol, transposeKey, keyName } from '../music/keys';
import { secondsPerTick } from '../music/meter';

export type ChordNames = 'shapes' | 'sounding';

/** Chord name as displayed: the fingered shape, or the sounding pitch with the capo. */
export function chordLabel(tl: Timeline, symbol: string, mode: ChordNames, capo: number, prefer: SpellingPreference): string {
  if (isNoChord(symbol)) return 'N.C.';
  if (mode === 'sounding' && capo && tl.key) return displayChord(transposeChordSymbol(symbol, capo, tl.key, prefer));
  return displayChord(symbol);
}

export function numeralFor(tl: Timeline, symbol: string): string {
  return tl.key ? romanNumeral(symbol, tl.key) : '';
}

export function keyText(tl: Timeline, capo: number, prefer: SpellingPreference): { shapes: string; sounding: string | null } {
  if (!tl.key) return { shapes: tl.song.key, sounding: null };
  return {
    shapes: keyName(tl.key),
    sounding: capo ? keyName(transposeKey(tl.key, capo, prefer)) : null,
  };
}

export interface BarSegment {
  /** Chord index in the timeline, or -1 for nothing. */
  chordIndex: number;
  /** Fraction of the bar (0..1). */
  from: number;
  to: number;
  /** True if the chord started in an earlier bar. */
  held: boolean;
}

/** Split a bar into chord segments (proportional to duration) for display. */
export function barSegments(tl: Timeline, bar: TLBar): BarSegment[] {
  const start = bar.start;
  const end = bar.start + bar.length;
  const out: BarSegment[] = [];
  let cursor = start;
  for (const c of chordsInRange(tl.chords, start, end)) {
    const s = Math.max(c.start, start);
    const e = Math.min(c.end, end);
    if (s > cursor) out.push({ chordIndex: -1, from: (cursor - start) / bar.length, to: (s - start) / bar.length, held: false });
    out.push({ chordIndex: c.index, from: (s - start) / bar.length, to: (e - start) / bar.length, held: c.start < start });
    cursor = e;
  }
  if (cursor < end) out.push({ chordIndex: -1, from: (cursor - start) / bar.length, to: 1, held: false });
  return out;
}

function chordsInRange(chords: TLChord[], start: number, end: number): TLChord[] {
  // chords are sorted; linear scan is fine for song-sized data
  return chords.filter((c) => c.start < end && c.end > start);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function songSeconds(tl: Timeline, bpm: number): number {
  return tl.totalTicks * secondsPerTick(bpm, tl.song.meter);
}
