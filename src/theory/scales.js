/**
 * Scales and diatonic harmony.
 */
import { parseNote, mod12 } from './notes.js';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor (Aeolian)
};

/** Degrees of the major scale; internal Roman-numeral tokens are relative to it. */
export const MAJOR = SCALES.major;

/** Build a key descriptor: { tonic, mode, tonicPc, tonicLetter, scale }. */
export function makeKey(tonic, mode = 'major') {
  const m = mode === 'minor' ? 'minor' : 'major';
  const { letter, pc } = parseNote(tonic);
  return { tonic, mode: m, tonicPc: pc, tonicLetter: letter, scale: SCALES[m] };
}

/** Classify three stacked intervals (from the root) as a triad quality. */
export function triadFromIntervals(third, fifth) {
  if (third === 4 && fifth === 7) return 'maj';
  if (third === 3 && fifth === 7) return 'min';
  if (third === 3 && fifth === 6) return 'dim';
  if (third === 4 && fifth === 8) return 'aug';
  return null;
}

/** The triad quality built on a scale degree (0-6) of the given mode. */
export function diatonicTriad(mode, degree) {
  const s = SCALES[mode];
  const r = s[degree % 7];
  const third = mod12(s[(degree + 2) % 7] - r);
  const fifth = mod12(s[(degree + 4) % 7] - r);
  return triadFromIntervals(third, fifth);
}

/** The seventh-chord quality built on a scale degree of the given mode. */
export function diatonicSeventh(mode, degree) {
  const s = SCALES[mode];
  const r = s[degree % 7];
  const triad = diatonicTriad(mode, degree);
  const seventh = mod12(s[(degree + 6) % 7] - r);
  if (triad === 'maj') return seventh === 11 ? 'maj7' : 'dom7';
  if (triad === 'min') return 'min7';
  if (triad === 'dim') return seventh === 10 ? 'hdim7' : 'dim7';
  return null;
}
