/**
 * Chord voicings: turn abstract chords into concrete MIDI notes with smooth
 * voice leading between consecutive chords.
 *
 * Styles
 *   close – all upper tones within an octave
 *   drop2 – close voicing with the 2nd-highest voice dropped an octave (jazz/piano)
 *   open  – alternate voices raised an octave for a wide, orchestral spread
 */
import { chordPitchClasses, bassNote, QUALITIES } from './chords.js';

export const VOICING_STYLES = {
  close: 'Close',
  drop2: 'Drop 2',
  open: 'Open / spread',
};

const BASS_RANGE = [36, 52];   // C2 .. E3
const UPPER_LOW = [52, 64];    // lowest upper voice lives between E3 and E4
const CENTER = { close: 64, drop2: 62, open: 64 };

/** Upper-structure pitch classes: drop the 5th of 5-note chords to keep four voices. */
function upperPitchClasses(chord, key) {
  const pcs = chordPitchClasses(chord, key);
  if (pcs.length > 4) {
    const fifthIndex = QUALITIES[chord.quality].tones.findIndex(([semi]) => semi === 7);
    if (fifthIndex > 0) pcs.splice(fifthIndex, 1);
  }
  return pcs;
}

/** All close-position stacks of the pitch classes, starting in the given range. */
function closeCandidates(pcs) {
  const out = [];
  for (let r = 0; r < pcs.length; r++) {
    const order = pcs.slice(r).concat(pcs.slice(0, r));
    for (let start = UPPER_LOW[0]; start <= UPPER_LOW[1]; start++) {
      if (start % 12 !== order[0]) continue;
      const notes = [start];
      for (let i = 1; i < order.length; i++) {
        let n = notes[i - 1] + 1;
        while (n % 12 !== order[i]) n++;
        notes.push(n);
      }
      out.push(notes);
    }
  }
  return out;
}

function applyStyle(notes, style) {
  const v = notes.slice();
  if (style === 'drop2') {
    if (v.length === 3) v.push(v[0] + 12); // double the lowest voice to get four parts
    const i = v.length - 2;
    v[i] -= 12;
  } else if (style === 'open') {
    for (let i = 1; i < v.length; i += 2) v[i] += 12;
  }
  return v.sort((a, b) => a - b);
}

/** Voice-leading distance between two voicings (handles different sizes). */
export function voiceLeadingCost(a, b) {
  if (!a || !b) return 0;
  const near = (n, set) => Math.min(...set.map((m) => Math.abs(n - m)));
  return a.reduce((s, n) => s + near(n, b), 0) + b.reduce((s, n) => s + near(n, a), 0);
}

function chooseBass(pc, prevBass) {
  const target = prevBass ?? 43;
  let best = null;
  for (let n = BASS_RANGE[0]; n <= BASS_RANGE[1]; n++) {
    if (n % 12 !== pc) continue;
    if (best === null || Math.abs(n - target) < Math.abs(best - target)) best = n;
  }
  return best;
}

/**
 * Voice one chord. `prev` is the previous voicing ({ bass, upper }) or null.
 * Returns { bass, upper } where upper is sorted ascending MIDI notes.
 */
export function voiceChord(chord, key, style = 'close', prev = null) {
  const bassPc = bassNote(chord, key).pc;
  const bass = chooseBass(bassPc, prev?.bass);
  const pcs = upperPitchClasses(chord, key);
  const center = CENTER[style] ?? 64;

  let best = null;
  let bestCost = Infinity;
  for (const cand of closeCandidates(pcs)) {
    const upper = applyStyle(cand, style);
    if (upper[0] <= bass + 2) continue; // keep the upper voices clear of the bass
    const mean = upper.reduce((a, b) => a + b, 0) / upper.length;
    const cost = voiceLeadingCost(upper, prev?.upper) + Math.abs(mean - center) * (prev ? 0.6 : 2);
    if (cost < bestCost) {
      bestCost = cost;
      best = upper;
    }
  }
  return { bass, upper: best };
}

/** Voice an entire chord sequence with voice leading from chord to chord. */
export function voiceProgression(chords, key, style = 'close') {
  const out = [];
  let prev = null;
  for (const chord of chords) {
    prev = voiceChord(chord, key, style, prev);
    out.push(prev);
  }
  return out;
}
