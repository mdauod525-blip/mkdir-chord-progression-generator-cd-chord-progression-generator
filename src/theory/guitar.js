/**
 * Guitar chord-shape finder (standard tuning).
 *
 * Searches every 4-fret window of the neck (plus open strings) for fingerings
 * that contain the chord's essential tones, put the right note in the bass and
 * can actually be played (at most four fingers, or a barre + three). Shapes are
 * ranked so familiar open chords (C = x32010, Am = x02210) come first.
 */
import { QUALITIES, rootOf, bassNote } from './chords.js';
import { mod12 } from './notes.js';

/** Open-string MIDI notes, low E to high E. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];
const MAX_FRET = 15;

/**
 * @param pcs        chord pitch classes (all tones)
 * @param required   pitch classes that must sound
 * @param bassPc     pitch class that must be the lowest sounding note
 * @returns shapes sorted best-first: { frets: (number|null)[], baseFret, barre, score }
 */
export function findGuitarShapes(pcs, required, bassPc, { limit = 3, tuning = STANDARD_TUNING } = {}) {
  const pcSet = new Set(pcs);
  const seen = new Set();
  const shapes = [];

  for (let w = 1; w <= MAX_FRET - 3; w++) {
    // Options per string: muted, open, or a fret in the window that is a chord tone.
    const options = tuning.map((open) => {
      const opts = [null];
      for (const f of [0, w, w + 1, w + 2, w + 3]) {
        if (pcSet.has(mod12(open + f)) && !opts.includes(f)) opts.push(f);
      }
      return opts;
    });
    const frets = new Array(tuning.length);
    const walk = (s) => {
      if (s === tuning.length) {
        const key = frets.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        const shape = evaluate(frets, required, bassPc, tuning);
        if (shape) shapes.push(shape);
        return;
      }
      for (const o of options[s]) {
        frets[s] = o;
        walk(s + 1);
      }
    };
    walk(0);
  }

  shapes.sort((a, b) => a.score - b.score);
  return shapes.slice(0, limit);
}

function evaluate(frets, required, bassPc, tuning) {
  const sounding = frets.map((f, i) => (f === null ? null : tuning[i] + f));
  const firstSounding = sounding.findIndex((n) => n !== null);
  if (firstSounding < 0) return null;
  const count = sounding.filter((n) => n !== null).length;
  if (count < 4) return null;

  // Lowest note must be the requested bass.
  if (mod12(sounding[firstSounding]) !== bassPc) return null;

  // Muted strings: allowed below the bass string; at most one inside the shape.
  let innerMutes = 0;
  for (let i = firstSounding + 1; i < frets.length; i++) if (frets[i] === null) innerMutes++;
  if (innerMutes > 1) return null;

  const present = new Set(sounding.filter((n) => n !== null).map(mod12));
  if (!required.every((pc) => present.has(pc))) return null;

  const fretted = frets.filter((f) => f !== null && f > 0);
  const opens = frets.filter((f) => f === 0).length;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;

  // Fingers: up to four fretted notes, otherwise a barre at the lowest fret.
  let barre = null;
  if (fretted.length > 4) {
    const barreStrings = frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
    const from = barreStrings[0];
    // A barre presses every string from its first string up; none of them may be open or muted.
    const coverable = frets.slice(from).every((f) => f !== null && f >= minF);
    const fingers = 1 + fretted.filter((f) => f > minF).length;
    if (barreStrings.length < 2 || !coverable || fingers > 4) return null;
    barre = { fret: minF, from };
  }

  const missing = new Set(sounding.filter((n) => n !== null).map(mod12)).size;
  let score = 0;
  score += minF * 0.7; // lower on the neck is easier
  score += firstSounding * 1; // muted bass strings
  score += innerMutes * 5;
  score += barre ? 1 : 0;
  score -= opens * 0.3;
  score -= count * 0.3;
  score += (maxF - minF) * 0.7; // finger stretch
  if (maxF >= 4) score += opens * 1.5; // open strings mixed with high frets are awkward
  score -= missing * 0.1; // prefer complete chords

  return {
    frets: frets.slice(),
    baseFret: maxF > 4 ? minF : 1,
    barre,
    score: Math.round(score * 100) / 100,
  };
}

const shapeCache = new Map();

/** Guitar shapes for a ChordLab chord in a key (cached). */
export function guitarShapes(chord, key, opts) {
  const cacheKey = `${key.tonicPc}:${chord.root}:${chord.quality}:${chord.inversion || 0}:${opts?.limit ?? 3}`;
  if (!shapeCache.has(cacheKey)) shapeCache.set(cacheKey, computeShapes(chord, key, opts));
  return shapeCache.get(cacheKey);
}

function computeShapes(chord, key, opts) {
  const { pc: rootPc } = rootOf(chord, key);
  const tones = QUALITIES[chord.quality].tones;
  const pcs = tones.map(([semi]) => mod12(rootPc + semi));
  // The perfect fifth is optional when there are other colour tones.
  const required = tones.filter(([semi]) => !(semi === 7 && tones.length >= 3)).map(([semi]) => mod12(rootPc + semi));
  let shapes = findGuitarShapes(pcs, required, bassNote(chord, key).pc, opts);
  if (!shapes.length && tones.length > 4) {
    // Five-note chords: also allow dropping the root above the bass / the 9th.
    const essential = tones.filter(([semi]) => semi !== 7 && semi !== 14).map(([semi]) => mod12(rootPc + semi));
    shapes = findGuitarShapes(pcs, essential, bassNote(chord, key).pc, opts);
  }
  return shapes;
}

/** Compact text form, e.g. "x32010" (frets ≥ 10 in parentheses). */
export function shapeToString(shape) {
  return shape.frets.map((f) => (f === null ? 'x' : f >= 10 ? `(${f})` : String(f))).join('');
}
