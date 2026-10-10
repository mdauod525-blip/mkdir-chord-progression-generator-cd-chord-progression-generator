/**
 * Functional tokens used by the generator, written as Roman numerals relative
 * to the MAJOR scale of the tonic (so a minor key's mediant is "bIII").
 *
 *   "I" "ii" "viio" "bVII" "iv" "V" "bII" "III+" ...
 */
import { MAJOR, SCALES, diatonicTriad } from './scales.js';
import { mod12 } from './notes.js';

const NUMERALS = ['vii', 'vi', 'iv', 'v', 'iii', 'ii', 'i'];
const DEGREE = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };

/** Parse a token into { degree, root, triad } (root in semitones above tonic). */
export function parseToken(token) {
  const m = /^([b#]?)([ivIV]+)(o|\+)?$/.exec(token);
  if (!m) throw new Error(`Invalid Roman-numeral token: ${token}`);
  const [, accStr, numeral, mark] = m;
  const lower = numeral.toLowerCase();
  if (!NUMERALS.includes(lower)) throw new Error(`Invalid numeral: ${token}`);
  const degree = DEGREE[lower];
  const acc = accStr === 'b' ? -1 : accStr === '#' ? 1 : 0;
  const isUpper = numeral === numeral.toUpperCase();
  let triad = isUpper ? 'maj' : 'min';
  if (mark === 'o') triad = 'dim';
  if (mark === '+') triad = 'aug';
  return { degree, root: mod12(MAJOR[degree] + acc), triad };
}

/**
 * How a token relates to the key:
 *   'diatonic' – built entirely from the key's scale
 *   'harmonic' – the raised-leading-tone V / vii° of a minor key
 *   'borrowed' – modal mixture from the parallel key (or other modes)
 */
export function classifyToken(token, mode) {
  const { degree, root, triad } = typeof token === 'string' ? parseToken(token) : token;
  const scale = SCALES[mode];
  if (scale[degree] === root && diatonicTriad(mode, degree) === triad) return 'diatonic';
  if (mode === 'minor') {
    if (degree === 4 && root === 7 && triad === 'maj') return 'harmonic';
    if (degree === 6 && root === 11 && triad === 'dim') return 'harmonic';
  }
  return 'borrowed';
}

/** The tonic token for a mode. */
export const tonicToken = (mode) => (mode === 'minor' ? 'i' : 'I');

/** True for tokens that act as the tonic chord. */
export const isTonic = (token) => token === 'I' || token === 'i';
