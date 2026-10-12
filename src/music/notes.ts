/**
 * Notes, pitch classes and letter-based spelling.
 *
 * A spelled note keeps its letter, so intervals can be preserved when
 * transposing: the IV of F is B♭ (a fourth above F), never A♯.
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

export const mod = (n: number, m: number): number => ((n % m) + m) % m;
export const mod12 = (n: number): number => mod(n, 12);

export interface SpelledNote {
  /** 0 = C … 6 = B */
  letter: number;
  /** semitone offset from the natural letter (-2..2) */
  acc: number;
}

export const pcOf = (n: SpelledNote): number => mod12(NATURAL_PC[n.letter] + n.acc);

/** Parse "C", "F#", "Bb", "E♭", "C##". Returns null when it is not a note name. */
export function parseNote(text: string): SpelledNote | null {
  const m = /^([A-Ga-g])([#♯b♭]{0,2})$/.exec(text.trim());
  if (!m) return null;
  const letter = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  let acc = 0;
  for (const ch of m[2]) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return { letter, acc };
}

export type AccidentalStyle = 'unicode' | 'ascii';

export function noteName(n: SpelledNote, style: AccidentalStyle = 'ascii'): string {
  const sharp = style === 'unicode' ? '♯' : '#';
  const flat = style === 'unicode' ? '♭' : 'b';
  const acc = n.acc > 0 ? sharp.repeat(n.acc) : flat.repeat(-n.acc);
  return LETTERS[n.letter] + acc;
}

/** Spell a pitch class with a given letter. */
export function spellWithLetter(letter: number, pc: number): SpelledNote {
  const l = mod(letter, 7);
  let acc = mod12(pc - NATURAL_PC[l]);
  if (acc > 6) acc -= 12;
  return { letter: l, acc };
}

const SHARP_SPELLING: SpelledNote[] = [
  { letter: 0, acc: 0 }, { letter: 0, acc: 1 }, { letter: 1, acc: 0 }, { letter: 1, acc: 1 },
  { letter: 2, acc: 0 }, { letter: 3, acc: 0 }, { letter: 3, acc: 1 }, { letter: 4, acc: 0 },
  { letter: 4, acc: 1 }, { letter: 5, acc: 0 }, { letter: 5, acc: 1 }, { letter: 6, acc: 0 },
];
const FLAT_SPELLING: SpelledNote[] = [
  { letter: 0, acc: 0 }, { letter: 1, acc: -1 }, { letter: 1, acc: 0 }, { letter: 2, acc: -1 },
  { letter: 2, acc: 0 }, { letter: 3, acc: 0 }, { letter: 4, acc: -1 }, { letter: 4, acc: 0 },
  { letter: 5, acc: -1 }, { letter: 5, acc: 0 }, { letter: 6, acc: -1 }, { letter: 6, acc: 0 },
];

export function spellPc(pc: number, prefer: 'sharp' | 'flat'): SpelledNote {
  return { ...(prefer === 'flat' ? FLAT_SPELLING : SHARP_SPELLING)[mod12(pc)] };
}

/** Replace double sharps/flats and E#, B#, Fb, Cb with the simpler enharmonic. */
export function simplify(n: SpelledNote, prefer: 'sharp' | 'flat'): SpelledNote {
  const odd = Math.abs(n.acc) > 1 || (n.acc === 1 && (n.letter === 2 || n.letter === 6)) || (n.acc === -1 && (n.letter === 3 || n.letter === 0));
  return odd ? spellPc(pcOf(n), n.acc > 0 ? 'sharp' : n.acc < 0 ? 'flat' : prefer) : n;
}

/** Diatonic interval: letter steps and semitones. */
export interface Interval {
  steps: number;
  semis: number;
}

export function intervalBetween(from: SpelledNote, to: SpelledNote): Interval {
  return { steps: mod(to.letter - from.letter, 7), semis: mod12(pcOf(to) - pcOf(from)) };
}

export function addInterval(n: SpelledNote, i: Interval): SpelledNote {
  const letter = mod(n.letter + i.steps, 7);
  return spellWithLetter(letter, pcOf(n) + i.semis);
}

/** MIDI note number → frequency (A4 = 440 Hz). */
export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** "E2" → 40, "A#3" → 58. */
export function parseNoteWithOctave(text: string): number | null {
  const m = /^([A-Ga-g][#♯b♭]{0,2})(-?\d)$/.exec(text.trim());
  if (!m) return null;
  const n = parseNote(m[1]);
  if (!n) return null;
  // Octave belongs to the letter (B#3 is C4 in pitch), so use the natural letter + accidental offset.
  return (Number(m[2]) + 1) * 12 + NATURAL_PC[n.letter] + n.acc;
}

export function midiToName(midi: number, prefer: 'sharp' | 'flat' = 'sharp'): string {
  return noteName(spellPc(midi, prefer)) + (Math.floor(midi / 12) - 1);
}
