/**
 * StrumFlow arrangement data model.
 *
 * Time inside a section is measured in integer ticks (960 per quarter note, see
 * music/meter.ts), counted from the start of the section. If the section has a
 * pickup (anacrusis), tick 0 is the start of the pickup and bar 1 starts at
 * `pickup` ticks.
 *
 * Chords are stored as the shapes the guitarist fingers (relative to the capo),
 * which is how chord sheets are normally written. The sounding key is
 * `key` transposed up by `capo` semitones.
 *
 * Example (4/4, two chords in bar 2, one chord held for two bars):
 *   chords: [
 *     { chord: 'G',  start: 0,    duration: 3840 },  // bar 1
 *     { chord: 'D',  start: 3840, duration: 1920 },  // bar 2, beats 1–2
 *     { chord: 'Em', start: 5760, duration: 1920 },  // bar 2, beats 3–4
 *     { chord: 'C',  start: 7680, duration: 7680 },  // bars 3–4
 *   ]
 */
import type { Meter } from '../music/meter';
import type { StrumPattern } from '../music/strum';
import type { ChordShape, Tuning } from '../music/guitar';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export type SectionKind = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'solo' | 'interlude' | 'outro' | 'other';

export const SECTION_KINDS: SectionKind[] = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'solo', 'interlude', 'outro', 'other'];

export interface ChordEvent {
  /** Chord symbol as fingered, e.g. "G", "F#m7", "D/F#", or "N.C." for no chord. */
  chord: string;
  /** Start, in ticks from the section start. */
  start: number;
  /** Length in ticks. Chords may span several bars or share a bar with other chords. */
  duration: number;
}

export interface LyricFragment {
  /** Tick (from section start) the text is sung on. */
  start: number;
  text: string;
}

export interface TabNote {
  start: number;
  duration: number;
  /** 0 = low E string … 5 = high e string. */
  string: number;
  fret: number;
}

export interface Section {
  id: string;
  /** Display name, e.g. "Verse 1". */
  name: string;
  kind: SectionKind;
  /** Number of full bars (the pickup is extra). */
  bars: number;
  /** Optional pickup (anacrusis) length in ticks before bar 1. */
  pickup?: number;
  /** Overrides the song meter for this section. */
  meter?: Meter;
  chords: ChordEvent[];
  /** Strumming pattern used in this section (id in song.patterns). */
  patternId?: string;
  /** User-provided or licensed lyrics, anchored to ticks. */
  lyrics?: LyricFragment[];
  /** Optional tablature. Only shown in Tab view. */
  tab?: TabNote[];
  notes?: string;
}

export type ProvenanceKind = 'demo' | 'user' | 'imported' | 'licensed';

export interface Provenance {
  kind: ProvenanceKind;
  /** True only when the arrangement was checked against an authoritative source. */
  verified: boolean;
  /** Who made it / where it came from. */
  source?: string;
  license?: string;
  note?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  difficulty: Difficulty;
  genre: string;
  /** Key of the chord shapes as written, e.g. "G" or "Em". */
  key: string;
  /** Tempo in the meter's tempo unit (♩ in 4/4, ♩. in 6/8, ♪ in 7/8). */
  bpm: number;
  meter: Meter;
  tuning: Tuning;
  capo: number;
  /** Strumming patterns used by the sections (songs are self-contained). */
  patterns: StrumPattern[];
  sections: Section[];
  /** Playing order as section ids; repeats allowed. Defaults to the order of `sections`. */
  form?: string[];
  /** Custom chord shapes by symbol (e.g. for alternate tunings). */
  shapes?: Record<string, ChordShape>;
  notes?: string;
  tags?: string[];
  provenance: Provenance;
  createdAt?: string;
  updatedAt?: string;
}

/** The playing order of sections, resolving `form`. Unknown ids are skipped. */
export function songForm(song: Song): Section[] {
  if (!song.form || !song.form.length) return song.sections;
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  return song.form.map((id) => byId.get(id)).filter((s): s is Section => Boolean(s));
}

export const sectionMeter = (song: Song, s: Section): Meter => s.meter ?? song.meter;

export function newId(prefix = 'id'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}

export function provenanceLabel(p: Provenance): string {
  if (p.verified) return 'Verified arrangement';
  switch (p.kind) {
    case 'demo':
      return 'Original demo';
    case 'user':
      return 'Your arrangement';
    case 'imported':
      return 'Imported · unverified';
    case 'licensed':
      return 'Licensed · unverified';
  }
}
