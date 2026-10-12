/**
 * Chord-progression generator.
 *
 * Pipeline
 *   1. slots      – split the requested measures into chord slots (harmonic rhythm),
 *                   always on beat-group boundaries of the time signature
 *   2. tokens     – functional Roman numerals from a genre template, a 12-bar blues
 *                   form, or a weighted Markov walk with a cadence at the end
 *   3. substitutions – borrowed chords, secondary dominants, tritone substitutes
 *   4. colouring  – 7ths, 9ths, sus, add9, 6 chords based on genre/mood/complexity
 *   5. inversions – slash chords chosen to smooth the bass line
 */
import { eighthsPerMeasure, halfMeasureSplit, TIME_SIGNATURES } from '../theory/timeSignature.js';
import { parseToken, classifyToken, tonicToken } from '../theory/roman.js';
import { diatonicSeventh } from '../theory/scales.js';
import { QUALITIES, bassMembers, maxInversion } from '../theory/chords.js';
import { normalizeTonic, mod12, signedInterval, parseNote } from '../theory/notes.js';
import { GENRES, MOODS, TRANSITIONS } from './styles.js';
import { createRng, weightedPick, pick, chance, randomSeed } from './random.js';

export const LENGTH_OPTIONS = [4, 8, 12, 16];
export const HARMONIC_RHYTHMS = { auto: 'Auto', 1: '1 per bar', 2: '2 per bar' };

export const DEFAULT_SETTINGS = Object.freeze({
  tonic: 'C',
  mode: 'major',
  timeSignature: '4/4',
  tempo: 100,
  genre: 'pop',
  mood: 'neutral',
  complexity: 2,
  measures: 8,
  harmonicRhythm: 'auto',
  voicing: 'close',
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);

/** Validate and fill in settings, falling back to defaults for anything invalid. */
export function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  s.mode = s.mode === 'minor' ? 'minor' : 'major';
  try {
    s.tonic = normalizeTonic(s.tonic, s.mode);
  } catch {
    s.tonic = DEFAULT_SETTINGS.tonic;
  }
  if (!TIME_SIGNATURES[s.timeSignature]) s.timeSignature = DEFAULT_SETTINGS.timeSignature;
  if (!GENRES[s.genre]) s.genre = DEFAULT_SETTINGS.genre;
  if (!MOODS[s.mood]) s.mood = DEFAULT_SETTINGS.mood;
  s.tempo = Math.round(clamp(Number(s.tempo) || DEFAULT_SETTINGS.tempo, 30, 260));
  s.complexity = Math.round(clamp(Number(s.complexity) || 1, 1, 5));
  s.measures = Math.round(clamp(Number(s.measures) || 8, 1, 32));
  if (!(String(s.harmonicRhythm) in HARMONIC_RHYTHMS)) s.harmonicRhythm = 'auto';
  s.harmonicRhythm = String(s.harmonicRhythm);
  return s;
}

/* ------------------------------------------------------------------ slots */

const isBluesForm = (s) => GENRES[s.genre].allDominant && s.measures % 12 === 0;

/**
 * Split the progression into chord slots: { measure, start, duration } in eighths.
 * Mid-bar changes always land on a beat-group boundary of the meter.
 */
export function buildSlots(settings, rng = Math.random) {
  const s = normalizeSettings(settings);
  const epm = eighthsPerMeasure(s.timeSignature);
  const split = halfMeasureSplit(s.timeSignature);
  const genre = GENRES[s.genre];
  const blues = isBluesForm(s);
  const slots = [];

  for (let m = 0; m < s.measures; m++) {
    let two = false;
    if (split !== null) {
      if (blues) {
        // Only the turnaround bar of each 12-bar chorus splits (I → V).
        two = m % 12 === 11 && (s.harmonicRhythm === '2' || (s.harmonicRhythm === 'auto' && chance(0.6, rng)));
      } else if (s.harmonicRhythm === '2') {
        two = true;
      } else if (s.harmonicRhythm === 'auto') {
        const p = genre.split + (s.complexity - 3) * 0.06 + (m === s.measures - 1 ? 0.1 : 0);
        two = chance(clamp01(p), rng);
      }
    }
    if (two) {
      slots.push({ measure: m, start: 0, duration: split });
      slots.push({ measure: m, start: split, duration: epm - split });
    } else {
      slots.push({ measure: m, start: 0, duration: epm });
    }
  }
  return slots;
}

/* ------------------------------------------------------------------ tokens */

function allowBorrowed(s) {
  return s.complexity >= 3 || (GENRES[s.genre].modal && s.complexity >= 2);
}

/** Transition weights out of a token, with genre/mood bias and complexity filters. */
function transitionWeights(from, s) {
  const table = TRANSITIONS[s.mode];
  const genre = GENRES[s.genre];
  const mood = MOODS[s.mood];
  const row = table[from] || table[tonicToken(s.mode)];
  const out = {};
  for (const [to, w] of Object.entries(row)) {
    if (!allowBorrowed(s) && classifyToken(to, s.mode) === 'borrowed') continue;
    out[to] = w * (genre.bias[to] ?? 1) * (mood.bias[to] ?? 1);
  }
  return out;
}

/** Probability-like weight of moving from a → b (small floor for unlisted moves). */
function transitionWeight(a, b, s) {
  const row = TRANSITIONS[s.mode][a];
  return row?.[b] ?? 0.05;
}

/**
 * Choose a token that follows `prev` and (optionally) leads well into `next`,
 * never repeating either neighbour.
 */
function chooseToken(prev, next, s, rng, exclude = []) {
  const weights = prev
    ? transitionWeights(prev, s)
    : Object.fromEntries(Object.keys(TRANSITIONS[s.mode]).map((t) => [t, 1]));
  for (const t of Object.keys(weights)) {
    if (t === prev || t === next || exclude.includes(t)) weights[t] = 0;
    else if (next) weights[t] *= transitionWeight(t, next, s);
    if (!allowBorrowed(s) && classifyToken(t, s.mode) === 'borrowed') weights[t] = 0;
  }
  const choice = weightedPick(weights, rng);
  if (choice) return choice;
  // Fallback: any diatonic token that differs from its neighbours.
  const pool = Object.keys(TRANSITIONS[s.mode]).filter(
    (t) => t !== prev && t !== next && !exclude.includes(t) && classifyToken(t, s.mode) !== 'borrowed',
  );
  return pool.length ? pick(pool, rng) : tonicToken(s.mode);
}

const BLUES_FORMS = {
  major: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
  majorQuickChange: ['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
  minor: ['i', 'i', 'i', 'i', 'iv', 'iv', 'i', 'i', 'bVI', 'V', 'i', 'V'],
};

function bluesTokens(slots, s, rng) {
  const form =
    s.mode === 'minor'
      ? BLUES_FORMS.minor
      : s.complexity >= 3 && chance(0.6, rng)
        ? BLUES_FORMS.majorQuickChange
        : BLUES_FORMS.major;
  return slots.map((slot, i) => {
    const bar = slot.measure % 12;
    const sameBarAsPrev = i > 0 && slots[i - 1].measure === slot.measure;
    if (bar === 11) return sameBarAsPrev ? form[11] : slots[i + 1]?.measure === slot.measure ? tonicToken(s.mode) : form[11];
    return form[bar];
  });
}

function templateScore(tpl, s) {
  const mood = MOODS[s.mood];
  const genre = GENRES[s.genre];
  const logSum = tpl.reduce((acc, t) => acc + Math.log((mood.bias[t] ?? 1) * Math.sqrt(genre.bias[t] ?? 1)), 0);
  return Math.exp(logSum / tpl.length);
}

function templateTokens(n, s, rng) {
  const genre = GENRES[s.genre];
  let templates = genre.templates[s.mode] || [];
  if (!allowBorrowed(s)) {
    templates = templates.filter((tpl) => tpl.every((t) => classifyToken(t, s.mode) !== 'borrowed'));
  }
  if (!templates.length) return null;
  const weights = Object.fromEntries(templates.map((tpl, i) => [i, templateScore(tpl, s)]));
  const tpl = templates[Number(weightedPick(weights, rng))];
  const tokens = [];
  for (let i = 0; i < n; i++) tokens.push(tpl[i % tpl.length]);
  // Vary repeats a little so long progressions don't loop verbatim.
  const variation = 0.06 * (s.complexity - 1);
  for (let i = tpl.length; i < n - 1; i++) {
    if (chance(variation, rng)) tokens[i] = chooseToken(tokens[i - 1], tokens[i + 1], s, rng);
  }
  return tokens;
}

function markovTokens(n, s, rng) {
  const tonic = tonicToken(s.mode);
  const dominant = 'V';
  const subdominant = s.mode === 'minor' ? 'iv' : 'IV';
  const tokens = [tonic];
  for (let i = 1; i < n; i++) tokens.push(chooseToken(tokens[i - 1], null, s, rng));
  if (n < 2) return tokens;

  const ending = weightedPick(GENRES[s.genre].endings, rng);
  const refill = (i) => {
    if (i > 0 && i < n) tokens[i] = chooseToken(tokens[i - 1], tokens[i + 1], s, rng);
  };
  if (ending === 'authentic' || ending === 'plagal') {
    tokens[n - 1] = tonic;
    if (n >= 3) {
      tokens[n - 2] = ending === 'authentic' ? dominant : subdominant;
      if (tokens[n - 3] === tokens[n - 2] || tokens[n - 3] === tonic) refill(n - 3);
    }
  } else if (ending === 'half') {
    tokens[n - 1] = dominant;
    if (n >= 3 && tokens[n - 2] === dominant) refill(n - 2);
  } else {
    // Loop: last chord leads back into the first.
    tokens[n - 1] = chooseToken(tokens[n - 2], tokens[0], s, rng);
  }
  return tokens;
}

/**
 * Generate the functional token sequence for the given slots.
 * `locks` maps slot index → token that must be kept.
 */
export function generateTokens(slots, settings, rng, locks = new Map()) {
  const s = normalizeSettings(settings);
  const n = slots.length;
  const blues = isBluesForm(s);
  let tokens;
  if (blues) tokens = bluesTokens(slots, s, rng);
  else if (chance(GENRES[s.genre].templateProb, rng)) tokens = templateTokens(n, s, rng);
  if (!tokens) tokens = markovTokens(n, s, rng);

  for (const [i, t] of locks) tokens[i] = t;

  if (!blues) {
    // Never repeat the same chord back-to-back.
    for (let i = 1; i < n; i++) {
      if (tokens[i] !== tokens[i - 1]) continue;
      if (!locks.has(i)) tokens[i] = chooseToken(tokens[i - 1], tokens[i + 1], s, rng);
      else if (!locks.has(i - 1)) tokens[i - 1] = chooseToken(tokens[i - 2], tokens[i], s, rng);
    }
  }
  return tokens;
}

/* ------------------------------------------------------------- substitutions */

function tokenChord(token, mode) {
  const { degree, root, triad } = parseToken(token);
  return { degree, root, triad, func: classifyToken(token, mode), base: token };
}

const BORROWED_SUBS = {
  major: { IV: ['iv', 1], vi: ['bVI', 0.8], iii: ['bIII', 0.5], ii: ['iio', 0.5] },
  minor: { iv: ['IV', 0.8], v: ['V', 1], iio: ['ii', 0.4] },
};

function applyBorrowed(chords, s, rng, locked) {
  const genre = GENRES[s.genre];
  const mood = MOODS[s.mood];
  let p = 0;
  if (s.complexity >= 3) p = genre.borrowed * ((s.complexity - 2) / 2) + mood.borrowed;
  else if (s.complexity === 2 && genre.modal) p = genre.borrowed * 0.3;
  p = clamp01(p);
  const subs = BORROWED_SUBS[s.mode];
  for (let i = 1; i < chords.length; i++) {
    if (locked.has(i)) continue;
    const c = chords[i];
    const sub = subs[c.base];
    if (!sub || c.func !== 'diatonic' || !chance(p * sub[1], rng)) continue;
    const replacement = tokenChord(sub[0], s.mode);
    replacement.base = sub[0];
    chords[i] = replacement;
  }
  // Picardy third: a classical minor-key piece may end on a major tonic.
  const last = chords.length - 1;
  if (s.mode === 'minor' && s.genre === 'classical' && s.complexity >= 3 && last > 0 && !locked.has(last) && chords[last].base === 'i' && chance(0.35, rng)) {
    chords[last] = { ...tokenChord('I', 'minor'), base: 'i' };
  }
}

function applySecondaryDominants(chords, s, rng, locked) {
  if (s.complexity < 3) return;
  const p = clamp01(GENRES[s.genre].secondary * ((s.complexity - 2) / 3) * 1.5);
  for (let i = 2; i < chords.length; i++) {
    const target = chords[i];
    const prevIndex = i - 1;
    const prev = chords[prevIndex];
    // Don't overwrite a chord that an earlier secondary dominant resolves to.
    if (locked.has(prevIndex) || prev.func === 'secondary' || chords[prevIndex - 1]?.func === 'secondary') continue;
    if (target.root === 0 || !['diatonic', 'harmonic'].includes(target.func)) continue;
    if (target.triad !== 'maj' && target.triad !== 'min') continue;
    const root = mod12(target.root + 7);
    if (prev.root === root || chords[i - 2]?.root === root) continue;
    if (!chance(p, rng)) continue;
    chords[prevIndex] = {
      degree: (target.degree + 4) % 7,
      root,
      triad: 'maj',
      func: 'secondary',
      target: target.degree,
      base: prev.base,
    };
  }
}

function applyTritoneSubs(chords, s, rng, locked) {
  const genre = GENRES[s.genre];
  if (s.complexity < 4 || !genre.tritone) return;
  const p = clamp01(genre.tritone * ((s.complexity - 3) / 2) * 1.5);
  for (let i = 0; i < chords.length - 1; i++) {
    const c = chords[i];
    const next = chords[i + 1];
    const isDominant = c.triad === 'maj' && (c.func === 'secondary' || c.root === 7);
    if (locked.has(i) || !isDominant || mod12(c.root + 5) !== next.root) continue;
    if (chords[i - 1]?.func === 'secondary') continue; // keep secondary-dominant chains resolving
    if (!chance(p, rng)) continue;
    chords[i] = {
      degree: (next.degree + 1) % 7,
      root: mod12(next.root + 1),
      triad: 'maj',
      func: 'tritone',
      target: next.degree,
      base: c.base,
    };
  }
}

/* ----------------------------------------------------------------- colouring */

const NINTHS = { maj7: 'maj9', dom7: 'dom9', min7: 'min9' };

function isDominantFunction(c) {
  return c.func === 'secondary' || c.func === 'tritone' || (c.root === 7 && c.triad === 'maj');
}

function seventhQuality(c, s) {
  if (c.triad === 'min') return 'min7';
  if (c.triad === 'dim') {
    return c.func === 'harmonic' || c.func === 'secondary' ? 'dim7' : 'hdim7';
  }
  // Major-family chords.
  if (isDominantFunction(c)) return 'dom7';
  let q;
  if (c.func === 'diatonic') q = diatonicSeventh(s.mode, c.degree);
  else if (c.base === 'bVII' || c.base === 'IV') q = 'dom7'; // Mixolydian ♭VII7, Dorian IV7
  else q = 'maj7';
  if (q === 'dom7' && MOODS[s.mood].prefer === 'maj7' && c.root !== 7) q = 'maj7';
  return q;
}

/** Pick a chord quality for a generated chord. */
function colorize(c, s, rng, { isLast }) {
  const genre = GENRES[s.genre];
  const mood = MOODS[s.mood];
  const cx = s.complexity;

  if (c.triad === 'aug') return 'aug';
  if (c.func === 'tritone') return cx >= 5 && chance(genre.ninth, rng) ? 'dom9' : 'dom7';

  if (genre.allDominant) {
    if (c.triad === 'maj') return cx >= 4 && chance(genre.ninth, rng) ? 'dom9' : 'dom7';
    if (c.triad === 'min') return cx >= 4 && chance(genre.ninth, rng) ? 'min9' : 'min7';
    return 'hdim7';
  }

  let p7 = genre.seventh + (cx - 1) * genre.seventhStep + mood.seventh + (isDominantFunction(c) ? 0.2 : 0);
  if (cx === 1) p7 = genre.seventh >= 0.5 ? genre.seventh * 0.6 : 0;
  if (chance(clamp01(p7), rng)) {
    let q = seventhQuality(c, s);
    if (cx >= 4 && NINTHS[q] && chance(clamp01(genre.ninth * ((cx - 3) / 2) + (mood.prefer ? 0.1 : 0)), rng)) {
      q = NINTHS[q];
    } else if (q === 'dom7' && cx >= 3 && c.func !== 'secondary' && chance(genre.sus * 0.5, rng)) {
      q = '7sus4';
    }
    return q;
  }

  if (c.triad === 'dim') return 'dim';
  const susP = genre.sus * ((cx - 1) / 3) + mood.sus;
  if (cx >= 2 && c.triad === 'maj' && c.func !== 'secondary' && !isLast && chance(clamp01(susP), rng)) {
    return isDominantFunction(c) ? 'sus4' : pick(['sus2', 'sus4'], rng);
  }
  if (cx >= 3 && chance(clamp01(genre.add9 + mood.add9), rng)) return c.triad === 'maj' ? 'add9' : 'madd9';
  if (cx >= 2 && genre.six && c.root === 0 && chance(genre.six, rng)) return c.triad === 'maj' ? 'maj6' : 'min6';
  return c.triad;
}

/* ---------------------------------------------------------------- inversions */

const INVERTIBLE = new Set(['maj', 'min', 'dim', 'aug', 'maj7', 'dom7', 'min7', 'hdim7', 'dim7', 'add9', 'madd9']);
const TRIADS = new Set(['maj', 'min', 'dim', 'aug', 'add9', 'madd9']);

function bassPc(chord, inversion = chord.inversion || 0) {
  const members = bassMembers(chord.quality);
  return mod12(chord.root + members[Math.min(inversion, members.length - 1)][0]);
}

/** Pick the inversion that gives the smoothest bass between neighbours. */
export function bestInversion(chord, prev, next) {
  if (!INVERTIBLE.has(chord.quality) || !prev) return 0;
  const prevBass = bassPc(prev);
  const nextBass = next ? bassPc(next) : null;
  const maxInv = TRIADS.has(chord.quality) ? 1 : maxInversion(chord.quality);
  const cost = (inv) => {
    const b = bassPc(chord, inv);
    const toNext = nextBass === null ? 0 : Math.abs(signedInterval(b, nextBass));
    return Math.abs(signedInterval(prevBass, b)) + 0.5 * toNext;
  };
  let best = 0;
  for (let inv = 1; inv <= maxInv; inv++) {
    if (cost(inv) < cost(best) - 1.5) best = inv;
  }
  return best;
}

function assignInversions(chords, s, rng, locked) {
  const base = [0, 0, 0.3, 0.45, 0.55, 0.65][s.complexity];
  const factor = { blues: 0.3, edm: 0.3, rock: 0.6, classical: 1.3 }[s.genre] ?? 1;
  const p = clamp01(base * factor);
  for (let i = 1; i < chords.length - 1; i++) {
    if (locked.has(i)) continue;
    chords[i].inversion = chance(p, rng) ? bestInversion(chords[i], chords[i - 1], chords[i + 1]) : 0;
  }
}

/* ---------------------------------------------------------------------- API */

function finalizeChord(c) {
  const chord = {
    degree: c.degree,
    root: c.root,
    quality: c.quality,
    inversion: c.inversion || 0,
    func: c.func,
    base: c.base,
    locked: Boolean(c.locked),
  };
  if (c.target != null) chord.target = c.target;
  return chord;
}

let idCounter = 0;
const newId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/**
 * Generate a full progression.
 *
 * @param settings  see DEFAULT_SETTINGS
 * @param options   { seed?: number, previous?: progression } – chords marked
 *                  `locked` in `previous` are kept when its layout still fits.
 */
export function generateProgression(settings = {}, options = {}) {
  const s = normalizeSettings(settings);
  const seed = options.seed ?? randomSeed();
  const rng = createRng(seed);

  const prev = options.previous;
  const reuseLayout =
    prev &&
    prev.settings.timeSignature === s.timeSignature &&
    prev.settings.measures === s.measures &&
    prev.settings.mode === s.mode &&
    prev.slots.some((slot) => slot.chord.locked);

  const slots = reuseLayout
    ? prev.slots.map(({ measure, start, duration }) => ({ measure, start, duration }))
    : buildSlots(s, rng);

  const lockedChords = new Map();
  if (reuseLayout) prev.slots.forEach((slot, i) => slot.chord.locked && lockedChords.set(i, slot.chord));
  const tokenLocks = new Map([...lockedChords].map(([i, c]) => [i, c.base]));

  const tokens = generateTokens(slots, s, rng, tokenLocks);
  const chords = tokens.map((t) => tokenChord(t, s.mode));
  const locked = new Set(lockedChords.keys());
  for (const [i, c] of lockedChords) chords[i] = { ...c, triad: QUALITIES[c.quality].family };

  applyBorrowed(chords, s, rng, locked);
  applySecondaryDominants(chords, s, rng, locked);
  applyTritoneSubs(chords, s, rng, locked);

  chords.forEach((c, i) => {
    if (!locked.has(i)) {
      c.quality = colorize(c, s, rng, { isLast: i === chords.length - 1 });
      c.inversion = 0;
    }
  });
  assignInversions(chords, s, rng, locked);

  return {
    version: 1,
    id: newId(),
    seed,
    settings: s,
    slots: slots.map((slot, i) => ({ ...slot, chord: finalizeChord(chords[i]) })),
  };
}

/**
 * Replace one chord with a new one that fits between its neighbours.
 * Returns a new progression object (the input is not mutated).
 */
export function regenerateChord(progression, index, options = {}) {
  const s = normalizeSettings(progression.settings);
  const rng = createRng(options.seed ?? randomSeed());
  const slots = progression.slots;
  const n = slots.length;
  const current = slots[index].chord;
  const prevChord = index > 0 ? slots[index - 1].chord : null;
  const nextChord = index < n - 1 ? slots[index + 1].chord : n > 1 ? slots[0].chord : null;
  const prevToken = prevChord?.base ?? null;
  const nextToken = nextChord?.base ?? null;
  const currentSymbolKey = `${current.root}:${current.quality}`;

  let chord = null;
  for (let attempt = 0; attempt < 12 && !chord; attempt++) {
    let c;
    const nextIsTarget = nextChord && nextChord.root !== 0 && ['maj', 'min'].includes(QUALITIES[nextChord.quality].family);
    if (s.complexity >= 3 && nextIsTarget && index < n - 1 && chance(GENRES[s.genre].secondary * 0.6, rng)) {
      c = {
        degree: (nextChord.degree + 4) % 7,
        root: mod12(nextChord.root + 7),
        triad: 'maj',
        func: 'secondary',
        target: nextChord.degree,
        base: current.base,
      };
    } else {
      const token = chooseToken(prevToken, nextToken, s, rng, [current.base]);
      c = tokenChord(token, s.mode);
    }
    c.quality = colorize(c, s, rng, { isLast: index === n - 1 });
    c.inversion = 0;
    const key = `${c.root}:${c.quality}`;
    if (key === currentSymbolKey) continue;
    if (prevChord && key === `${prevChord.root}:${prevChord.quality}`) continue;
    if (index > 0 && index < n - 1 && s.complexity >= 2 && chance(0.4, rng)) {
      c.inversion = bestInversion(c, prevChord, slots[index + 1].chord);
    }
    chord = c;
  }
  if (!chord) return progression;

  return {
    ...progression,
    slots: slots.map((slot, i) => (i === index ? { ...slot, chord: finalizeChord(chord) } : slot)),
  };
}

/** Return a copy of the progression with one chord's fields changed. */
export function updateChord(progression, index, changes) {
  return {
    ...progression,
    slots: progression.slots.map((slot, i) => {
      if (i !== index) return slot;
      const chord = { ...slot.chord, ...changes };
      chord.inversion = Math.min(chord.inversion || 0, maxInversion(chord.quality));
      return { ...slot, chord };
    }),
  };
}

/** Qualities a user can switch a chord to, based on its underlying triad. */
export function qualityOptions(chord) {
  const family = QUALITIES[chord.quality].family;
  if (family === 'min') return ['min', 'min7', 'min9', 'min6', 'madd9', 'sus2', 'sus4'];
  if (family === 'dim') return ['dim', 'hdim7', 'dim7'];
  if (family === 'aug') return ['aug', 'maj', 'dom7'];
  return ['maj', 'maj7', 'dom7', 'maj9', 'dom9', 'maj6', 'add9', 'sus2', 'sus4', '7sus4'];
}

/** Change key/mode of settings without touching the chords' functions. */
export function transposeProgression(progression, tonic) {
  const settings = normalizeSettings({ ...progression.settings, tonic });
  parseNote(settings.tonic);
  return { ...progression, settings };
}

/**
 * Re-fit an existing progression to a new time signature, keeping its chords:
 * whole-bar chords fill the new bar, split bars split on the new meter's
 * mid-bar beat-group boundary.
 */
export function refitToTimeSignature(progression, timeSignature) {
  const settings = normalizeSettings({ ...progression.settings, timeSignature });
  const epm = eighthsPerMeasure(settings.timeSignature);
  const split = halfMeasureSplit(settings.timeSignature);
  const counts = new Map();
  progression.slots.forEach((slot) => counts.set(slot.measure, (counts.get(slot.measure) || 0) + 1));
  const seen = new Map();
  const slots = progression.slots.map((slot) => {
    const nth = seen.get(slot.measure) || 0;
    seen.set(slot.measure, nth + 1);
    if (counts.get(slot.measure) === 1 || split === null) return { ...slot, start: 0, duration: epm };
    return nth === 0 ? { ...slot, start: 0, duration: split } : { ...slot, start: split, duration: epm - split };
  });
  return { ...progression, settings, slots };
}
