/**
 * Keys, transposition and Roman numerals.
 *
 * Transposition is interval-preserving: every chord root keeps its relation
 * to the key's tonic (letter distance + semitones). In G, an F chord is ♭VII;
 * transposed to A it becomes G (still ♭VII), and to E♭ it becomes D♭ — not C♯.
 */
import { type Chord, chordTones, isNoChord, parseChord, formatChord, QUALITIES } from './chords';
import {
  type SpelledNote, type Interval, addInterval, intervalBetween, noteName, parseNote, pcOf, simplify, spellPc, mod12, mod,
} from './notes';

export type Mode = 'major' | 'minor';
export type SpellingPreference = 'auto' | 'sharp' | 'flat';

export interface Key {
  tonic: SpelledNote;
  mode: Mode;
}

/** Conventional key spellings (fewest accidentals; F♯ and C♯m favoured for guitar). */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export const KEY_NAMES = {
  major: MAJOR_KEYS,
  minor: MINOR_KEYS,
};

export function parseKey(text: string): Key | null {
  const m = /^\s*([A-Ga-g][#♯b♭]?)\s*(m|min|minor|maj|major)?\s*$/.exec(text);
  if (!m) return null;
  const tonic = parseNote(m[1]);
  if (!tonic) return null;
  const mode: Mode = m[2] && m[2].startsWith('m') && !m[2].startsWith('maj') ? 'minor' : 'major';
  return { tonic, mode };
}

export function keyName(k: Key, style: 'ascii' | 'unicode' = 'unicode'): string {
  return noteName(k.tonic, style) + (k.mode === 'minor' ? 'm' : '');
}

export function keyLabel(k: Key): string {
  return `${noteName(k.tonic, 'unicode')} ${k.mode}`;
}

/** Spell a key tonic for a pitch class following conventions or a preference. */
export function spellKeyTonic(pc: number, mode: Mode, prefer: SpellingPreference = 'auto'): SpelledNote {
  if (prefer === 'sharp' || prefer === 'flat') {
    // Natural notes stay natural; black keys follow the preference.
    const s = spellPc(pc, prefer);
    return s;
  }
  return parseNote(KEY_NAMES[mode][mod12(pc)])!;
}

/** Does this key's signature use flats? (F major, B♭, Dm… → true) */
export function keyUsesFlats(k: Key): boolean {
  if (k.tonic.acc < 0) return true;
  if (k.tonic.acc > 0) return false;
  const pc = pcOf(k.tonic);
  // Natural tonics with flat signatures: F major; D, G, C, F minor.
  return k.mode === 'major' ? pc === 5 : [2, 7, 0, 5].includes(pc);
}

export function transposeKey(k: Key, semis: number, prefer: SpellingPreference = 'auto'): Key {
  return { tonic: spellKeyTonic(pcOf(k.tonic) + semis, k.mode, prefer), mode: k.mode };
}

const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
/** Allowed deviations from the major/perfect interval per letter distance (unison … seventh). */
const ALLOWED_DEV = [[0, 1], [-1, 0, 1], [-1, 0], [0, 1], [-1, 0, 1], [-1, 0], [-2, -1, 0]];
/** Most common spelling for each semitone distance. */
const COMMON_STEPS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

/**
 * Re-spell unusual intervals (e.g. a "diminished unison" F♯→F, which appears
 * after E♯ was simplified to F) as their common equivalent (a major 7th).
 */
export function normalizeInterval(i: Interval): Interval {
  let dev = mod12(i.semis) - MAJOR_SEMIS[i.steps];
  if (dev > 6) dev -= 12;
  if (dev < -6) dev += 12;
  if (ALLOWED_DEV[i.steps].includes(dev)) return i;
  return { steps: COMMON_STEPS[mod12(i.semis)], semis: mod12(i.semis) };
}

/** Transpose a spelled note from one key into another, keeping its scale-degree relation. */
export function transposeNoteBetweenKeys(n: SpelledNote, from: Key, to: Key): SpelledNote {
  const i = normalizeInterval(intervalBetween(from.tonic, n));
  const out = addInterval(to.tonic, i);
  return simplify(out, keyUsesFlats(to) ? 'flat' : 'sharp');
}

/**
 * Transpose a chord symbol.
 * - With prefer 'auto', spelling follows the target key (relations preserved).
 * - With 'sharp' / 'flat', every black-key root uses that accidental.
 * No-chord markers and unparseable symbols are returned unchanged.
 */
export function transposeChordSymbol(symbol: string, semis: number, from: Key, prefer: SpellingPreference = 'auto'): string {
  if (isNoChord(symbol)) return symbol;
  const c = parseChord(symbol);
  if (!c) return symbol;
  return formatChord(transposeChord(c, semis, from, prefer));
}

export function transposeChord(c: Chord, semis: number, from: Key, prefer: SpellingPreference = 'auto'): Chord {
  if (mod12(semis) === 0 && prefer === 'auto') return c;
  const to = transposeKey(from, semis, prefer);
  const move = (n: SpelledNote): SpelledNote =>
    prefer === 'auto' ? transposeNoteBetweenKeys(n, from, to) : spellPc(pcOf(n) + semis, prefer);
  const out: Chord = { root: move(c.root), quality: c.quality };
  if (c.bass) out.bass = move(c.bass);
  return out;
}

/** Scale intervals for numerals (major scale for major keys, natural minor for minor keys). */
const SCALE_SEMIS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export function scaleDegree(key: Key, degree: number): SpelledNote {
  const d = mod(degree, 7);
  return addInterval(key.tonic, { steps: d, semis: SCALE_SEMIS[key.mode][d] });
}

/** Diatonic triad/seventh qualities for each degree. */
const DIATONIC_TRIADS: Record<Mode, string[]> = {
  major: ['', 'm', 'm', '', '', 'm', 'dim'],
  minor: ['m', 'dim', '', 'm', 'm', '', ''],
};

/** Roman numeral for a chord in a key, e.g. "vi", "V7", "♭VII", "ii°". */
export function romanNumeral(symbol: string, key: Key): string {
  if (isNoChord(symbol)) return '—';
  const c = parseChord(symbol);
  if (!c) return '?';
  const i = intervalBetween(key.tonic, c.root);
  const expected = SCALE_SEMIS[key.mode][i.steps];
  let diff = mod12(i.semis - expected);
  if (diff > 6) diff -= 12;
  const acc = diff < 0 ? '♭'.repeat(-diff) : '♯'.repeat(diff);
  const q = QUALITIES[c.quality];
  const lower = q.family === 'minor' || q.family === 'diminished';
  let numeral = NUMERALS[i.steps];
  if (lower) numeral = numeral.toLowerCase();
  const suffixMap: Record<string, string> = {
    '': '', m: '', dim: '°', aug: '+', '7': '7', m7: '7', maj7: 'maj7', dim7: '°7', m7b5: 'ø7',
    '6': '6', m6: '6', '9': '9', m9: '9', maj9: 'maj9',
  };
  const suffix = c.quality in suffixMap ? suffixMap[c.quality] : c.quality;
  let inversion = '';
  if (c.bass) {
    const tones = chordTones(c).map(pcOf);
    const idx = tones.indexOf(pcOf(c.bass));
    inversion = idx === 1 ? '⁶' : idx === 2 ? '⁶₄' : idx === 3 ? '⁴₂' : `/${noteName(c.bass, 'unicode')}`;
    if ((idx === 1 || idx === 2) && tones.length === 4) inversion = idx === 1 ? '⁶₅' : '⁴₃';
  }
  return acc + numeral + suffix + inversion;
}

/**
 * Build a chord symbol from a Roman numeral in a key.
 * "I", "vi", "V7", "ii7", "♭VII", "bVI", "iv", "vii°", "IVmaj7", "Vsus4".
 */
export function chordFromNumeral(numeral: string, key: Key): string | null {
  const m = /^([b♭#♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|o|ø|\+)?(.*)$/.exec(numeral.trim());
  if (!m) return null;
  const degree = NUMERALS.indexOf(m[2].toUpperCase());
  const upper = m[2] === m[2].toUpperCase();
  const shift = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0;
  const i: Interval = { steps: degree, semis: SCALE_SEMIS[key.mode][degree] + shift };
  const root = simplify(addInterval(key.tonic, i), keyUsesFlats(key) || shift < 0 ? 'flat' : 'sharp');
  const mark = m[3] ?? '';
  const ext = m[4] ?? '';
  let quality: string;
  if (mark === '°' || mark === 'o') quality = ext === '7' ? 'dim7' : 'dim';
  else if (mark === 'ø') quality = 'm7b5';
  else if (mark === '+') quality = 'aug';
  else if (ext === '7') quality = upper ? '7' : 'm7';
  else if (ext === 'maj7') quality = upper ? 'maj7' : 'm7';
  else if (ext) quality = upper ? ext : ext.startsWith('m') ? ext : `m${ext}`;
  else quality = upper ? '' : 'm';
  if (!(quality in QUALITIES)) return null;
  return formatChord({ root, quality });
}

/** The seven diatonic chords of a key (triads). */
export function diatonicChords(key: Key): string[] {
  return DIATONIC_TRIADS[key.mode].map((q, d) => formatChord({ root: simplify(scaleDegree(key, d), keyUsesFlats(key) ? 'flat' : 'sharp'), quality: q }));
}

/** Common progressions, written as numerals so they work in any key. */
export const PROGRESSION_PRESETS: { name: string; numerals: string[]; mode: Mode | 'any'; note: string }[] = [
  { name: 'Pop anthem', numerals: ['I', 'V', 'vi', 'IV'], mode: 'major', note: 'The most-used pop progression.' },
  { name: 'Sensitive', numerals: ['vi', 'IV', 'I', 'V'], mode: 'major', note: 'Same chords, starting on the minor vi for a moodier feel.' },
  { name: 'Doo-wop', numerals: ['I', 'vi', 'IV', 'V'], mode: 'major', note: '1950s ballad classic.' },
  { name: 'Three-chord', numerals: ['I', 'IV', 'V', 'I'], mode: 'major', note: 'Folk, country and rock basics.' },
  { name: 'Jazz turnaround', numerals: ['ii7', 'V7', 'Imaj7', 'Imaj7'], mode: 'major', note: 'The ii–V–I cadence.' },
  { name: 'Mixolydian rock', numerals: ['I', '♭VII', 'IV', 'I'], mode: 'major', note: 'Borrowed ♭VII for a classic-rock sound.' },
  { name: 'Minor descent', numerals: ['i', 'VII', 'VI', 'VII'], mode: 'minor', note: 'Epic minor-key loop.' },
  { name: 'Minor ballad', numerals: ['i', 'iv', 'VII', 'III'], mode: 'minor', note: 'Moody minor progression.' },
  { name: 'Andalusian', numerals: ['i', 'VII', 'VI', 'V'], mode: 'minor', note: 'Flamenco-flavoured descending bass.' },
];
