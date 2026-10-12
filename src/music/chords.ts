/**
 * Chord symbols: parsing, formatting and chord tones.
 *
 * A chord keeps a spelled root (and optional bass), plus a canonical quality
 * suffix. Qualities are defined by diatonic intervals so the tones are spelled
 * correctly in every key (E♭ major = E♭–G–B♭).
 */
import { type Interval, type SpelledNote, addInterval, noteName, parseNote, pcOf, type AccidentalStyle } from './notes';

const P1: Interval = { steps: 0, semis: 0 };
const M2: Interval = { steps: 1, semis: 2 };
const m3: Interval = { steps: 2, semis: 3 };
const M3: Interval = { steps: 2, semis: 4 };
const P4: Interval = { steps: 3, semis: 5 };
const d5: Interval = { steps: 4, semis: 6 };
const P5: Interval = { steps: 4, semis: 7 };
const A5: Interval = { steps: 4, semis: 8 };
const M6: Interval = { steps: 5, semis: 9 };
const d7: Interval = { steps: 6, semis: 9 };
const m7: Interval = { steps: 6, semis: 10 };
const M7: Interval = { steps: 6, semis: 11 };
const M9: Interval = { steps: 1, semis: 14 };

export interface Quality {
  suffix: string;
  name: string;
  intervals: Interval[];
  /** Short, beginner-friendly description of the sound. */
  sound: string;
  /** 'major' | 'minor' | 'diminished' | 'other' (for Roman numeral case). */
  family: 'major' | 'minor' | 'diminished' | 'augmented' | 'neutral';
}

export const QUALITIES: Record<string, Quality> = {
  '': { suffix: '', name: 'major', intervals: [P1, M3, P5], family: 'major', sound: 'Bright, stable and resolved — the most common chord type.' },
  m: { suffix: 'm', name: 'minor', intervals: [P1, m3, P5], family: 'minor', sound: 'Darker and more emotional than major — only one note (the 3rd) is lowered.' },
  '5': { suffix: '5', name: 'power chord', intervals: [P1, P5], family: 'neutral', sound: 'Just the root and fifth: neither happy nor sad, punchy with distortion.' },
  '7': { suffix: '7', name: 'dominant seventh', intervals: [P1, M3, P5, m7], family: 'major', sound: 'Bluesy and restless — it wants to move to the next chord.' },
  maj7: { suffix: 'maj7', name: 'major seventh', intervals: [P1, M3, P5, M7], family: 'major', sound: 'Soft, dreamy and jazzy.' },
  m7: { suffix: 'm7', name: 'minor seventh', intervals: [P1, m3, P5, m7], family: 'minor', sound: 'Mellow minor colour, common in soul, pop and jazz.' },
  '6': { suffix: '6', name: 'major sixth', intervals: [P1, M3, P5, M6], family: 'major', sound: 'Sweet, vintage major sound.' },
  m6: { suffix: 'm6', name: 'minor sixth', intervals: [P1, m3, P5, M6], family: 'minor', sound: 'Minor with a mysterious, film-noir edge.' },
  sus2: { suffix: 'sus2', name: 'suspended second', intervals: [P1, M2, P5], family: 'neutral', sound: 'Open and airy: the 3rd is replaced by the 2nd.' },
  sus4: { suffix: 'sus4', name: 'suspended fourth', intervals: [P1, P4, P5], family: 'neutral', sound: 'Tense and hanging: the 3rd is replaced by the 4th, which usually resolves back down.' },
  '7sus4': { suffix: '7sus4', name: 'seventh suspended fourth', intervals: [P1, P4, P5, m7], family: 'neutral', sound: 'A softer, floating dominant sound.' },
  add9: { suffix: 'add9', name: 'added ninth', intervals: [P1, M3, P5, M9], family: 'major', sound: 'Major with a shimmering extra note on top.' },
  madd9: { suffix: 'madd9', name: 'minor added ninth', intervals: [P1, m3, P5, M9], family: 'minor', sound: 'Minor with a wistful extra note.' },
  '9': { suffix: '9', name: 'dominant ninth', intervals: [P1, M3, P5, m7, M9], family: 'major', sound: 'Funky, rich dominant sound.' },
  maj9: { suffix: 'maj9', name: 'major ninth', intervals: [P1, M3, P5, M7, M9], family: 'major', sound: 'Lush and jazzy.' },
  m9: { suffix: 'm9', name: 'minor ninth', intervals: [P1, m3, P5, m7, M9], family: 'minor', sound: 'Smooth, soulful minor.' },
  dim: { suffix: 'dim', name: 'diminished', intervals: [P1, m3, d5], family: 'diminished', sound: 'Tense and unstable, often a passing chord.' },
  dim7: { suffix: 'dim7', name: 'diminished seventh', intervals: [P1, m3, d5, d7], family: 'diminished', sound: 'Very tense and dramatic; symmetrical shape that repeats every 3 frets.' },
  m7b5: { suffix: 'm7b5', name: 'half-diminished', intervals: [P1, m3, d5, m7], family: 'diminished', sound: 'Dark and unresolved, common in minor-key jazz.' },
  aug: { suffix: 'aug', name: 'augmented', intervals: [P1, M3, A5], family: 'augmented', sound: 'Eerie and suspenseful: the 5th is raised.' },
};

const ALIASES: Record<string, string> = {
  maj: '', M: '', major: '',
  min: 'm', '-': 'm', minor: 'm', mi: 'm',
  M7: 'maj7', 'Δ7': 'maj7', 'Δ': 'maj7', ma7: 'maj7', major7: 'maj7',
  min7: 'm7', '-7': 'm7', mi7: 'm7',
  '°': 'dim', o: 'dim', '°7': 'dim7', o7: 'dim7',
  'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5',
  '+': 'aug', '#5': 'aug', '+5': 'aug',
  sus: 'sus4', '2': 'sus2', add2: 'add9', '7sus': '7sus4',
  min6: 'm6', '-6': 'm6', 'm(add9)': 'madd9', 'min9': 'm9', 'M9': 'maj9',
};

export interface Chord {
  root: SpelledNote;
  quality: string;
  bass?: SpelledNote;
}

const NO_CHORD = /^(N\.?C\.?|NC|n\.c\.)$/;

export const isNoChord = (symbol: string): boolean => NO_CHORD.test(symbol.trim());

/** Parse "G", "F#m7", "Bbmaj7", "D/F#", "Csus4". Returns null if not a chord. */
export function parseChord(symbol: string): Chord | null {
  const text = symbol.trim();
  const m = /^([A-G][#♯b♭]?)([^/]*)(?:\/([A-G][#♯b♭]?))?$/.exec(text);
  if (!m) return null;
  const root = parseNote(m[1]);
  if (!root) return null;
  const rawQ = m[2].trim();
  const quality = rawQ in QUALITIES ? rawQ : ALIASES[rawQ];
  if (quality === undefined) return null;
  const chord: Chord = { root, quality };
  if (m[3]) {
    const bass = parseNote(m[3]);
    if (!bass) return null;
    chord.bass = bass;
  }
  return chord;
}

export function formatChord(c: Chord, style: AccidentalStyle = 'ascii'): string {
  return noteName(c.root, style) + c.quality + (c.bass ? '/' + noteName(c.bass, style) : '');
}

/** Pretty display for UI (Unicode accidentals). */
export function displayChord(symbol: string): string {
  if (isNoChord(symbol)) return 'N.C.';
  const c = parseChord(symbol);
  return c ? formatChord(c, 'unicode') : symbol;
}

export function chordTones(c: Chord): SpelledNote[] {
  return QUALITIES[c.quality].intervals.map((i) => addInterval(c.root, i));
}

export function chordPcs(c: Chord): number[] {
  return chordTones(c).map(pcOf);
}

export function qualityOf(c: Chord): Quality {
  return QUALITIES[c.quality];
}

export function describeChordName(c: Chord): string {
  const q = qualityOf(c);
  const root = noteName(c.root, 'unicode');
  const base = q.suffix === '' ? `${root} major` : `${root} ${q.name}`;
  return c.bass ? `${base} over ${noteName(c.bass, 'unicode')} in the bass` : base;
}
