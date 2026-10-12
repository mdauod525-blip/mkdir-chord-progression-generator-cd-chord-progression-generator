/**
 * The shared musical timeline.
 *
 * A song (sections + form + chords + patterns) is flattened into absolute
 * integer ticks once. Everything that needs musical position — the audio
 * scheduler, the chord highlighter, the strum animation, the bar counter —
 * reads from this one structure, so the UI and the audio can never disagree
 * about where a chord change is.
 */
import { type Song, type Section, songForm, sectionMeter } from '../data/song';
import { type Accent, type Meter, barTicks, beatsOfBar, meterKind, pulseTicks, toQuarterBpm } from './meter';
import { type StrumPattern, defaultPatternFor, patternLength, patternStrokes } from './strum';
import { type Key, type SpellingPreference, parseKey, transposeChordSymbol, transposeKey } from './keys';
import { isNoChord } from './chords';

export interface TLBar {
  index: number;
  start: number;
  length: number;
  meter: Meter;
  sectionIndex: number;
  /** 1-based bar number inside the section; 0 for a pickup bar. */
  number: number;
  isPickup: boolean;
  /** Where inside a full bar this bar begins (non-zero only for pickups). */
  phase: number;
}

export interface TLSection {
  index: number;
  section: Section;
  start: number;
  end: number;
  firstBar: number;
  /** exclusive */
  endBar: number;
  /** 1 for the first time this section is played, 2 for a repeat… */
  occurrence: number;
  meter: Meter;
  pattern: StrumPattern;
}

export interface TLChord {
  index: number;
  start: number;
  end: number;
  /** Chord as fingered, after transposition. */
  symbol: string;
  /** Chord as written in the song data. */
  original: string;
  sectionIndex: number;
  noChord: boolean;
}

export interface Timeline {
  song: Song;
  totalTicks: number;
  bars: TLBar[];
  sections: TLSection[];
  chords: TLChord[];
  /** Shape key after transposition (null if the song key is unparseable). */
  key: Key | null;
  transpose: number;
  /** Song tempo converted to quarter notes per minute. */
  quarterBpm: number;
}

export interface TimelineOptions {
  transpose?: number;
  prefer?: SpellingPreference;
}

export function patternFor(song: Song, section: Section): StrumPattern {
  const meter = sectionMeter(song, section);
  return song.patterns.find((p) => p.id === section.patternId) ?? defaultPatternFor(meter);
}

export function sectionLength(song: Song, s: Section): number {
  return (s.pickup ?? 0) + s.bars * barTicks(sectionMeter(song, s));
}

export function buildTimeline(song: Song, opts: TimelineOptions = {}): Timeline {
  const transpose = opts.transpose ?? 0;
  const prefer = opts.prefer ?? 'auto';
  const songKey = parseKey(song.key);
  const bars: TLBar[] = [];
  const sections: TLSection[] = [];
  const chords: TLChord[] = [];
  const seen = new Map<string, number>();
  let t = 0;

  songForm(song).forEach((section, sectionIndex) => {
    const meter = sectionMeter(song, section);
    const bar = barTicks(meter);
    const pickup = section.pickup ?? 0;
    const start = t;
    const firstBar = bars.length;
    if (pickup > 0) {
      bars.push({ index: bars.length, start: t, length: pickup, meter, sectionIndex, number: 0, isPickup: true, phase: bar - pickup });
      t += pickup;
    }
    for (let i = 0; i < section.bars; i++) {
      bars.push({ index: bars.length, start: t, length: bar, meter, sectionIndex, number: i + 1, isPickup: false, phase: 0 });
      t += bar;
    }
    const end = t;
    const occurrence = (seen.get(section.id) ?? 0) + 1;
    seen.set(section.id, occurrence);
    sections.push({ index: sectionIndex, section, start, end, firstBar, endBar: bars.length, occurrence, meter, pattern: patternFor(song, section) });

    const ordered = [...section.chords].sort((a, b) => a.start - b.start);
    for (const ev of ordered) {
      const cs = start + ev.start;
      const ce = Math.min(end, cs + ev.duration);
      if (ce <= cs || cs >= end) continue;
      const symbol = songKey && !isNoChord(ev.chord) ? transposeChordSymbol(ev.chord, transpose, songKey, prefer) : ev.chord;
      chords.push({ index: chords.length, start: cs, end: ce, symbol, original: ev.chord, sectionIndex, noChord: isNoChord(ev.chord) });
    }
  });

  return {
    song,
    totalTicks: t,
    bars,
    sections,
    chords,
    key: songKey ? transposeKey(songKey, transpose, prefer) : null,
    transpose,
    quarterBpm: toQuarterBpm(song.bpm, song.meter),
  };
}

/** Last item whose start <= tick (items sorted by start). */
function findIndex<T extends { start: number }>(items: T[], tick: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= tick) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface Location {
  tick: number;
  barIndex: number;
  sectionIndex: number;
  /** Position inside a full bar (pickups are offset by their phase). */
  offsetInBar: number;
  beatIndex: number;
  /** Position inside the beat in ticks. */
  offsetInBeat: number;
  chordIndex: number;
  nextChordIndex: number;
  ticksToNextChord: number;
}

export function locate(tl: Timeline, rawTick: number): Location {
  const tick = Math.max(0, Math.min(tl.totalTicks - 1, Math.floor(rawTick)));
  const barIndex = Math.max(0, findIndex(tl.bars, tick));
  const bar = tl.bars[barIndex];
  const offsetInBar = bar ? tick - bar.start + bar.phase : 0;
  let beatIndex = 0;
  let offsetInBeat = 0;
  if (bar) {
    const beats = beatsOfBar(bar.meter);
    const beat = beats.find((b) => offsetInBar >= b.start && offsetInBar < b.start + b.length) ?? beats[0];
    beatIndex = beat.index;
    offsetInBeat = offsetInBar - beat.start;
  }
  let chordIndex = findIndex(tl.chords, tick);
  if (chordIndex >= 0 && tl.chords[chordIndex].end <= tick) chordIndex = -1;
  const nextChordIndex = tl.chords.findIndex((c) => c.start > tick);
  return {
    tick,
    barIndex,
    sectionIndex: bar ? bar.sectionIndex : 0,
    offsetInBar,
    beatIndex,
    offsetInBeat,
    chordIndex,
    nextChordIndex,
    ticksToNextChord: nextChordIndex >= 0 ? tl.chords[nextChordIndex].start - tick : -1,
  };
}

/** Chord active at a tick (-1 when none). */
export function chordAt(tl: Timeline, tick: number): number {
  const i = findIndex(tl.chords, tick);
  return i >= 0 && tl.chords[i].end > tick ? i : -1;
}

// ---------------------------------------------------------------------------
// Musical events for the scheduler
// ---------------------------------------------------------------------------

export interface ClickEvent {
  type: 'click';
  tick: number;
  /** 2 = downbeat, 1 = beat, 0 = subdivision */
  accent: Accent;
  barIndex: number;
  beatIndex: number;
}

export interface StrumEvent {
  type: 'strum';
  tick: number;
  stroke: 'D' | 'U' | 'x';
  accent: boolean;
  chordIndex: number;
  sectionIndex: number;
  /** Cell index in the section's pattern (for the strum animation). */
  cell: number;
}

export type MusicEvent = ClickEvent | StrumEvent;

export interface EventOptions {
  metronome: boolean;
  /** Also click the subdivisions (eighths in simple meters, pulses in compound/irregular). */
  subdivisions?: boolean;
  /** Per-beat accent override for the metronome (0 = silent, 1 = normal, 2 = accented). */
  accents?: number[];
  strums: boolean;
}

/** Ticks inside the section where the section's pattern started (bar 1 = 0, pickup is negative). */
const sectionPos = (bar: TLBar, tickInBar: number): number => (bar.number - 1) * barTicks(bar.meter) + bar.phase + tickInBar;

/** All events with from <= tick < to, sorted by tick. */
export function collectEvents(tl: Timeline, from: number, to: number, opts: EventOptions): MusicEvent[] {
  const out: MusicEvent[] = [];
  if (to <= from) return out;
  let bi = Math.max(0, findIndex(tl.bars, from));
  for (; bi < tl.bars.length; bi++) {
    const bar = tl.bars[bi];
    if (bar.start >= to) break;
    const barEnd = bar.start + bar.length;
    if (barEnd <= from) continue;
    const inRange = (t: number) => t >= from && t < to && t >= bar.start && t < barEnd;

    if (opts.metronome) {
      const beats = beatsOfBar(bar.meter);
      const sub = meterKind(bar.meter) === 'simple' ? beats[0].length / 2 : pulseTicks(bar.meter);
      for (const beat of beats) {
        const level = opts.accents?.[beat.index] ?? (beat.index === 0 ? 2 : 1);
        const t = bar.start + beat.start - bar.phase;
        if (level > 0 && inRange(t)) out.push({ type: 'click', tick: t, accent: level as Accent, barIndex: bar.index, beatIndex: beat.index });
        if (opts.subdivisions) {
          for (let s = sub; s < beat.length; s += sub) {
            const st = t + s;
            if (inRange(st)) out.push({ type: 'click', tick: st, accent: 0, barIndex: bar.index, beatIndex: beat.index });
          }
        }
      }
    }

    if (opts.strums) {
      const sec = tl.sections[bar.sectionIndex];
      const pattern = sec.pattern;
      const len = patternLength(pattern);
      const strokes = patternStrokes(pattern);
      const posStart = sectionPos(bar, 0);
      const firstRep = Math.floor(posStart / len);
      const lastRep = Math.floor((posStart + bar.length - 1) / len);
      for (let rep = firstRep; rep <= lastRep; rep++) {
        for (const s of strokes) {
          const pos = rep * len + s.offset;
          const t = bar.start + (pos - posStart);
          if (!inRange(t)) continue;
          const ci = chordAt(tl, t);
          const chord = ci >= 0 ? tl.chords[ci] : null;
          if ((!chord || chord.noChord) && s.stroke !== 'x') continue;
          out.push({ type: 'strum', tick: t, stroke: s.stroke, accent: s.accent, chordIndex: ci, sectionIndex: sec.index, cell: s.cell });
        }
      }
    }
  }
  out.sort((a, b) => a.tick - b.tick || (a.type === 'click' ? -1 : 1));
  return out;
}

/** Count-in clicks: one bar of `meter` ending exactly at `endTick`. Ticks may be negative. */
export function countInEvents(meter: Meter, endTick: number, accents?: number[]): ClickEvent[] {
  const start = endTick - barTicks(meter);
  return beatsOfBar(meter)
    .map((b) => ({ b, level: accents?.[b.index] ?? (b.index === 0 ? 2 : 1) }))
    .filter(({ level }) => level > 0)
    .map(({ b, level }) => ({ type: 'click' as const, tick: start + b.start, accent: level as Accent, barIndex: -1, beatIndex: b.index }));
}

/** Strum-cell position (which cell of the pattern is sounding) at a tick. */
export function patternCellAt(tl: Timeline, tick: number): { sectionIndex: number; cell: number } | null {
  const bi = findIndex(tl.bars, tick);
  if (bi < 0) return null;
  const bar = tl.bars[bi];
  const pattern = tl.sections[bar.sectionIndex].pattern;
  const len = patternLength(pattern);
  const pos = sectionPos(bar, tick - bar.start);
  const within = ((pos % len) + len) % len;
  // Latest stroke cell at or before `within` (falls back to the grid cell).
  return { sectionIndex: bar.sectionIndex, cell: Math.min(pattern.steps.length - 1, Math.floor(within / pattern.step)) };
}

/** The bar range of a section instance as a loop region. */
export function sectionRegion(tl: Timeline, sectionIndex: number): { start: number; end: number } {
  const s = tl.sections[sectionIndex];
  return { start: s.start, end: s.end };
}

export function barsRegion(tl: Timeline, fromBar: number, toBar: number): { start: number; end: number } {
  const a = tl.bars[Math.min(fromBar, toBar)];
  const b = tl.bars[Math.max(fromBar, toBar)];
  return { start: a.start, end: b.start + b.length };
}
