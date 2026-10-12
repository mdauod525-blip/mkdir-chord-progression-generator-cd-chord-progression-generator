/**
 * Note names, pitch classes and spelling helpers.
 *
 * Spelling is letter-based: every chord tone knows which letter it should be
 * written with (root letter + interval letter offset), so F major's IV chord is
 * spelled B♭–D–F rather than A♯–D–F.
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

const ACCIDENTALS = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Wrap any integer into 0..11. */
export const mod12 = (n) => ((n % 12) + 12) % 12;

/** Signed semitone difference folded into -6..5. */
export function signedInterval(from, to) {
  const d = mod12(to - from);
  return d > 5 ? d - 12 : d;
}

/**
 * Parse a note name such as "C", "F#", "Bb", "E♭" into { letter, pc }.
 * Accepts ASCII (#, b) and Unicode (♯, ♭) accidentals.
 */
export function parseNote(name) {
  const m = /^([A-Ga-g])([#♯b♭]*)$/.exec(String(name).trim());
  if (!m) throw new Error(`Invalid note name: ${name}`);
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  let acc = 0;
  for (const ch of m[2]) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return { letter, pc: mod12(NATURAL_PC[letter] + acc) };
}

/** Spell a pitch class using a specific letter (0 = C … 6 = B). */
export function spell(letterIndex, pc) {
  const letter = ((letterIndex % 7) + 7) % 7;
  const acc = signedInterval(NATURAL_PC[letter], pc);
  if (Math.abs(acc) > 2) return SHARP_NAMES[mod12(pc)];
  return LETTERS[letter] + ACCIDENTALS[String(acc)];
}

/** Plain-ASCII version of a note/chord string (for text export and filenames). */
export function toAscii(str) {
  return String(str)
    .replace(/𝄫/g, 'bb')
    .replace(/𝄪/g, 'x')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/°/g, 'dim')
    .replace(/ø/g, 'hdim');
}

/** MIDI note number → name with octave, e.g. 60 → "C4". */
export function midiToName(midi) {
  return SHARP_NAMES[mod12(midi)] + (Math.floor(midi / 12) - 1);
}

/** MIDI note number → frequency in Hz (A4 = 440). */
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Keys offered in the UI, spelled the way musicians usually write them. */
export const KEY_OPTIONS = {
  major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
  minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
};

/** Map any tonic onto the preferred spelling for the mode (e.g. "C#" major → "D♭"). */
export function normalizeTonic(tonic, mode) {
  const { pc } = parseNote(tonic);
  return KEY_OPTIONS[mode === 'minor' ? 'minor' : 'major'][pc];
}
