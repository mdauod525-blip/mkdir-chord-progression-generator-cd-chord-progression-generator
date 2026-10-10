/**
 * Chord qualities, chord construction, naming, inversions and Roman numerals.
 *
 * A chord in ChordLab is a small serialisable object:
 *   {
 *     degree:    0-6   scale-degree letter offset from the tonic (drives spelling)
 *     root:      0-11  semitones above the tonic
 *     quality:   key of QUALITIES
 *     inversion: 0..n  which chord member is in the bass
 *     func:      'diatonic' | 'harmonic' | 'borrowed' | 'secondary' | 'tritone'
 *     target:    degree the chord resolves to (secondary dominants only)
 *     base:      the functional token it was generated from (e.g. "V", "bVII")
 *     locked:    boolean, kept when the whole progression is regenerated
 *   }
 */
import { spell, mod12, signedInterval } from './notes.js';
import { SCALES } from './scales.js';

/**
 * tones: [semitones above root, letter offset above root]
 * family: underlying triad type, used for Roman-numeral case and substitutions.
 */
export const QUALITIES = {
  maj:   { label: 'Major',          symbol: '',        roman: '',      family: 'maj', tones: [[0, 0], [4, 2], [7, 4]] },
  min:   { label: 'Minor',          symbol: 'm',       roman: '',      family: 'min', tones: [[0, 0], [3, 2], [7, 4]] },
  dim:   { label: 'Diminished',     symbol: 'dim',     roman: '°',     family: 'dim', tones: [[0, 0], [3, 2], [6, 4]] },
  aug:   { label: 'Augmented',      symbol: 'aug',     roman: '+',     family: 'aug', tones: [[0, 0], [4, 2], [8, 4]] },
  sus2:  { label: 'Sus 2',          symbol: 'sus2',    roman: 'sus2',  family: 'sus', tones: [[0, 0], [2, 1], [7, 4]] },
  sus4:  { label: 'Sus 4',          symbol: 'sus4',    roman: 'sus4',  family: 'sus', tones: [[0, 0], [5, 3], [7, 4]] },
  maj7:  { label: 'Major 7th',      symbol: 'maj7',    roman: 'maj7',  family: 'maj', seventh: true, tones: [[0, 0], [4, 2], [7, 4], [11, 6]] },
  dom7:  { label: 'Dominant 7th',   symbol: '7',       roman: '7',     family: 'maj', seventh: true, tones: [[0, 0], [4, 2], [7, 4], [10, 6]] },
  min7:  { label: 'Minor 7th',      symbol: 'm7',      roman: '7',     family: 'min', seventh: true, tones: [[0, 0], [3, 2], [7, 4], [10, 6]] },
  hdim7: { label: 'Half-dim 7th',   symbol: 'm7♭5',    roman: 'ø7',    family: 'dim', seventh: true, tones: [[0, 0], [3, 2], [6, 4], [10, 6]] },
  dim7:  { label: 'Diminished 7th', symbol: 'dim7',    roman: '°7',    family: 'dim', seventh: true, tones: [[0, 0], [3, 2], [6, 4], [9, 6]] },
  '7sus4': { label: '7 sus 4',      symbol: '7sus4',   roman: '7sus4', family: 'sus', seventh: true, tones: [[0, 0], [5, 3], [7, 4], [10, 6]] },
  add9:  { label: 'Add 9',          symbol: 'add9',    roman: 'add9',  family: 'maj', tones: [[0, 0], [4, 2], [7, 4], [14, 1]] },
  madd9: { label: 'Minor add 9',    symbol: 'm(add9)', roman: 'add9',  family: 'min', tones: [[0, 0], [3, 2], [7, 4], [14, 1]] },
  maj6:  { label: 'Major 6th',      symbol: '6',       roman: '6',     family: 'maj', tones: [[0, 0], [4, 2], [7, 4], [9, 5]] },
  min6:  { label: 'Minor 6th',      symbol: 'm6',      roman: '6',     family: 'min', tones: [[0, 0], [3, 2], [7, 4], [9, 5]] },
  maj9:  { label: 'Major 9th',      symbol: 'maj9',    roman: 'maj9',  family: 'maj', seventh: true, tones: [[0, 0], [4, 2], [7, 4], [11, 6], [14, 1]] },
  dom9:  { label: 'Dominant 9th',   symbol: '9',       roman: '9',     family: 'maj', seventh: true, tones: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1]] },
  min9:  { label: 'Minor 9th',      symbol: 'm9',      roman: '9',     family: 'min', seventh: true, tones: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1]] },
};

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SUPERSCRIPT_FIGURES = {
  triad: ['', '⁶', '⁶₄'],
  seventh: ['7', '⁶₅', '⁴₃', '⁴₂'],
};

/** Chord members that may sit in the bass (extensions such as the 9th are excluded). */
export function bassMembers(quality) {
  return QUALITIES[quality].tones.filter(([semi]) => semi < 12);
}

/** Highest valid inversion index for a quality (triads: 2, sevenths: 3). */
export const maxInversion = (quality) => bassMembers(quality).length - 1;

/** Absolute pitch class and letter of a chord's root within a key. */
export function rootOf(chord, key) {
  const pc = mod12(key.tonicPc + chord.root);
  let letter = key.tonicLetter + chord.degree;
  // Chromatic chords (tritone subs, secondary dominants) get the most readable
  // enharmonic root: E7 rather than F♭7, D♭7 rather than C♯7 over a flat key.
  if (chord.func === 'tritone' || chord.func === 'secondary') {
    const awkward = (l) => {
      const name = spell(l, pc);
      return /𝄫|𝄪/.test(name) || ['F♭', 'C♭', 'E♯', 'B♯'].includes(name);
    };
    if (awkward(letter)) letter = [letter - 1, letter + 1].find((l) => !awkward(l)) ?? letter;
  }
  return { pc, letter };
}

/**
 * Spelled chord tones (root position order), e.g. ["E♭", "G", "B♭", "D"].
 */
export function chordNotes(chord, key) {
  const { pc, letter } = rootOf(chord, key);
  return QUALITIES[chord.quality].tones.map(([semi, lo]) => spell(letter + lo, pc + semi));
}

/** Pitch classes (0-11) of the chord tones, in root-position order. */
export function chordPitchClasses(chord, key) {
  const { pc } = rootOf(chord, key);
  return QUALITIES[chord.quality].tones.map(([semi]) => mod12(pc + semi));
}

/** Pitch class and spelling of the bass note given the chord's inversion. */
export function bassNote(chord, key) {
  const { pc, letter } = rootOf(chord, key);
  const members = bassMembers(chord.quality);
  const [semi, lo] = members[Math.min(chord.inversion || 0, members.length - 1)];
  return { pc: mod12(pc + semi), name: spell(letter + lo, pc + semi) };
}

/** Lead-sheet chord symbol, e.g. "Cmaj7/E", "F♯m7♭5", "B♭sus4". */
export function chordSymbol(chord, key) {
  const { pc, letter } = rootOf(chord, key);
  const root = spell(letter, pc);
  const name = root + QUALITIES[chord.quality].symbol;
  return chord.inversion ? `${name}/${bassNote(chord, key).name}` : name;
}

function numeralFor(degree, family, accidental) {
  let n = NUMERALS[((degree % 7) + 7) % 7];
  if (family === 'min' || family === 'dim') n = n.toLowerCase();
  const acc = accidental < 0 ? '♭' : accidental > 0 ? '♯' : '';
  return acc + n;
}

/** Accidental of a chord root relative to the key's own scale degree. */
function rootAccidental(degree, root, mode) {
  const scale = SCALES[mode];
  const d = ((degree % 7) + 7) % 7;
  // In minor the raised leading tone (harmonic minor) is written without an accidental.
  if (mode === 'minor' && d === 6 && mod12(root) === 11) return 0;
  return signedInterval(scale[d], root);
}

/**
 * Roman-numeral analysis relative to the key, e.g. "V⁶₅/ii", "♭VII", "iiø7", "IV⁶".
 */
export function romanNumeral(chord, mode) {
  const q = QUALITIES[chord.quality];
  const inv = chord.inversion || 0;
  const suffix = romanSuffix(chord.quality, inv);

  if (chord.func === 'secondary' && chord.target != null) {
    const targetDegree = ((chord.target % 7) + 7) % 7;
    // Secondary dominants of the minor-key dominant point at "V", not "v".
    const targetFamily = mode === 'minor' && targetDegree === 4 ? 'maj' : diatonicFamily(mode, targetDegree);
    const base = q.family === 'dim' ? 'vii' : 'V';
    return `${base}${suffix}/${numeralFor(targetDegree, targetFamily, 0)}`;
  }

  if (chord.func === 'tritone') {
    const targetDegree = ((chord.target ?? 0) % 7 + 7) % 7;
    if (targetDegree === 0) return `subV${suffix}`;
    const targetFamily = mode === 'minor' && targetDegree === 4 ? 'maj' : diatonicFamily(mode, targetDegree);
    return `subV${suffix}/${numeralFor(targetDegree, targetFamily, 0)}`;
  }

  const acc = rootAccidental(chord.degree, chord.root, mode);
  return numeralFor(chord.degree, q.family, acc) + suffix;
}

const TRIADS = ['maj', 'min', 'dim', 'aug'];
const SEVENTHS = ['maj7', 'dom7', 'min7', 'hdim7', 'dim7'];

/** Quality suffix plus figured-bass inversion symbol for a Roman numeral. */
function romanSuffix(quality, inv) {
  const q = QUALITIES[quality];
  if (TRIADS.includes(quality)) return q.roman + SUPERSCRIPT_FIGURES.triad[inv];
  if (SEVENTHS.includes(quality)) return q.roman.replace('7', '') + SUPERSCRIPT_FIGURES.seventh[inv];
  // Extended / suspended chords: quality suffix plus the matching figure.
  const figures = q.seventh ? SUPERSCRIPT_FIGURES.seventh : SUPERSCRIPT_FIGURES.triad;
  return inv ? q.roman + figures[inv] : q.roman;
}

function diatonicFamily(mode, degree) {
  const s = SCALES[mode];
  const r = s[degree];
  const third = mod12(s[(degree + 2) % 7] - r);
  const fifth = mod12(s[(degree + 4) % 7] - r);
  if (third === 3) return fifth === 6 ? 'dim' : 'min';
  return 'maj';
}

/** Everything the UI / exports need to show a chord. */
export function describeChord(chord, key) {
  const q = QUALITIES[chord.quality];
  return {
    symbol: chordSymbol(chord, key),
    roman: romanNumeral(chord, key.mode),
    notes: chordNotes(chord, key),
    bass: bassNote(chord, key).name,
    qualityLabel: q.label,
    func: chord.func,
  };
}
