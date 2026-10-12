/**
 * Guitar tunings and chord shapes.
 *
 * Shapes are structured data (frets, fingers, barres) rendered by one
 * reusable diagram component. Lookup order for a chord:
 *   1. song-provided shapes (e.g. for alternate tunings)
 *   2. the hand-checked open-chord library (standard tuning)
 *   3. movable E-shape / A-shape barre forms (standard tuning)
 *   4. a fretboard search that works in any tuning
 * Strings are indexed low → high: 0 = low E … 5 = high e.
 */
import { type Chord, chordPcs, isNoChord, parseChord, QUALITIES } from './chords';
import { mod12, pcOf } from './notes';

export interface Tuning {
  name: string;
  /** MIDI notes of the open strings, low → high. */
  notes: number[];
}

export const TUNINGS: Tuning[] = [
  { name: 'Standard', notes: [40, 45, 50, 55, 59, 64] },
  { name: 'Drop D', notes: [38, 45, 50, 55, 59, 64] },
  { name: 'Half-step down', notes: [39, 44, 49, 54, 58, 63] },
  { name: 'Whole-step down', notes: [38, 43, 48, 53, 57, 62] },
  { name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { name: 'Open G', notes: [38, 43, 50, 55, 59, 62] },
  { name: 'Open D', notes: [38, 45, 50, 54, 57, 62] },
];

export const STANDARD = TUNINGS[0];

const STRING_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const tuningNotes = (t: Tuning): string[] => t.notes.map((n) => STRING_NAMES[mod12(n)]);

export function isStandardTuning(t: Tuning): boolean {
  return t.notes.join() === STANDARD.notes.join();
}

/** Same intervals as standard (e.g. half-step down): standard shapes still apply. */
export function hasStandardIntervals(t: Tuning): boolean {
  if (t.notes.length !== 6) return false;
  const shift = t.notes[0] - STANDARD.notes[0];
  return t.notes.every((n, i) => n - STANDARD.notes[i] === shift);
}

export type Finger = number | 'T' | null;

export interface Barre {
  fret: number;
  /** lowest string index covered (0 = low E) */
  from: number;
  /** highest string index covered */
  to: number;
  finger: number;
}

export interface ChordShape {
  frets: (number | null)[];
  fingers: Finger[];
  barres: Barre[];
  source: 'library' | 'movable' | 'search' | 'song';
  label?: string;
}

// ---------------------------------------------------------------------------
// 1. Open-chord library (standard tuning). Notation: x = muted.
// ---------------------------------------------------------------------------

type LibEntry = [symbol: string, frets: string, fingers: string, barre?: [fret: number, from: number, to: number]];

const LIBRARY: LibEntry[] = [
  ['C', 'x32010', 'x32010'],
  ['C7', 'x32310', 'x32410'],
  ['Cmaj7', 'x32000', 'x32000'],
  ['Cadd9', 'x32030', 'x21030'],
  ['Csus2', 'x30013', 'x30014'],
  ['Csus4', 'x33011', 'x34011', [1, 4, 5]],
  ['C/G', '332010', '342010'],
  ['D', 'xx0232', 'xx0132'],
  ['D7', 'xx0212', 'xx0213'],
  ['Dmaj7', 'xx0222', 'xx0123'],
  ['Dsus2', 'xx0230', 'xx0130'],
  ['Dsus4', 'xx0233', 'xx0134'],
  ['Dm', 'xx0231', 'xx0231'],
  ['Dm7', 'xx0211', 'xx0211', [1, 4, 5]],
  ['D/F#', '2x0232', 'Tx0132'],
  ['E', '022100', '023100'],
  ['E7', '020100', '020100'],
  ['Emaj7', '021100', '031200'],
  ['Esus4', '022200', '023400'],
  ['Em', '022000', '023000'],
  ['Em7', '022030', '012030'],
  ['F', '133211', '134211', [1, 0, 5]],
  ['Fmaj7', 'xx3210', 'xx3210'],
  ['G', '320003', '210003'],
  ['G7', '320001', '320001'],
  ['Gmaj7', '320002', '320001'],
  ['Gsus4', '330013', '230014'],
  ['G/B', 'x20003', 'x10003'],
  ['A', 'x02220', 'x01230'],
  ['A7', 'x02020', 'x02030'],
  ['Amaj7', 'x02120', 'x02130'],
  ['Asus2', 'x02200', 'x01200'],
  ['Asus4', 'x02230', 'x01230'],
  ['Am', 'x02210', 'x02310'],
  ['Am7', 'x02010', 'x02010'],
  ['Am/G', '302210', '302310'],
  ['B7', 'x21202', 'x21304'],
  ['Bm', 'x24432', 'x13421', [2, 1, 5]],
  ['Bm7', 'x20202', 'x10203'],
];

function parseFrets(s: string): (number | null)[] {
  return [...s].map((ch) => (ch === 'x' ? null : Number(ch)));
}
function parseFingers(s: string): Finger[] {
  return [...s].map((ch) => (ch === 'x' ? null : ch === 'T' ? 'T' : Number(ch) || null));
}

const shapeKey = (c: Chord): string => `${pcOf(c.root)}:${c.quality}:${c.bass ? pcOf(c.bass) : ''}`;

const LIBRARY_MAP = new Map<string, ChordShape>();
for (const [sym, frets, fingers, barre] of LIBRARY) {
  const c = parseChord(sym)!;
  LIBRARY_MAP.set(shapeKey(c), {
    frets: parseFrets(frets),
    fingers: parseFingers(fingers),
    barres: barre ? [{ fret: barre[0], from: barre[1], to: barre[2], finger: 1 }] : [],
    source: 'library',
    label: 'Open position',
  });
}

// ---------------------------------------------------------------------------
// 2. Movable barre forms, relative to the root fret r.
// ---------------------------------------------------------------------------

interface Form {
  /** offsets from r, null = muted */
  offsets: (number | null)[];
  fingers: (number | null)[];
  /** offset of the barre fret relative to r, and covered strings */
  barre?: [offset: number, from: number, to: number];
}

const E_FORMS: Record<string, Form> = {
  '': { offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: [0, 0, 5] },
  m: { offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: [0, 0, 5] },
  '7': { offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barre: [0, 0, 5] },
  m7: { offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: [0, 0, 5] },
  maj7: { offsets: [0, null, 1, 1, 0, null], fingers: [1, null, 3, 4, 2, null] },
  sus4: { offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: [0, 0, 5] },
  '7sus4': { offsets: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1], barre: [0, 0, 5] },
  '5': { offsets: [0, 2, 2, null, null, null], fingers: [1, 3, 4, null, null, null] },
};

const A_FORMS: Record<string, Form> = {
  '': { offsets: [null, 0, 2, 2, 2, 0], fingers: [null, 1, 2, 3, 4, 1], barre: [0, 1, 5] },
  m: { offsets: [null, 0, 2, 2, 1, 0], fingers: [null, 1, 3, 4, 2, 1], barre: [0, 1, 5] },
  '7': { offsets: [null, 0, 2, 0, 2, 0], fingers: [null, 1, 3, 1, 4, 1], barre: [0, 1, 5] },
  m7: { offsets: [null, 0, 2, 0, 1, 0], fingers: [null, 1, 3, 1, 2, 1], barre: [0, 1, 5] },
  maj7: { offsets: [null, 0, 2, 1, 2, 0], fingers: [null, 1, 3, 2, 4, 1], barre: [0, 1, 5] },
  sus2: { offsets: [null, 0, 2, 2, 0, 0], fingers: [null, 1, 3, 4, 1, 1], barre: [0, 1, 5] },
  sus4: { offsets: [null, 0, 2, 2, 3, 0], fingers: [null, 1, 2, 3, 4, 1], barre: [0, 1, 5] },
  '7sus4': { offsets: [null, 0, 2, 0, 3, 0], fingers: [null, 1, 3, 1, 4, 1], barre: [0, 1, 5] },
  '6': { offsets: [null, 0, 2, 2, 2, 2], fingers: [null, 1, 3, 3, 3, 3], barre: [2, 2, 5] },
  m6: { offsets: [null, 0, 2, 2, 1, 2], fingers: [null, 1, 3, 3, 2, 4] },
  add9: { offsets: [null, 0, 2, 4, 2, 0], fingers: [null, 1, 2, 4, 3, 1], barre: [0, 1, 5] },
  '9': { offsets: [null, 0, -1, 0, 0, 0], fingers: [null, 2, 1, 3, 3, 3], barre: [0, 3, 5] },
  m7b5: { offsets: [null, 0, 1, 0, 1, null], fingers: [null, 1, 3, 2, 4, null] },
  dim: { offsets: [null, 0, 1, 2, 1, null], fingers: [null, 1, 2, 4, 3, null] },
  dim7: { offsets: [null, 0, 1, -1, 1, null], fingers: [null, 2, 3, 1, 4, null] },
  aug: { offsets: [null, 0, -1, -2, -2, null], fingers: [null, 4, 3, 1, 1, null], barre: [-2, 3, 4] },
  '5': { offsets: [null, 0, 2, 2, null, null], fingers: [null, 1, 3, 4, null, null] },
};

function buildForm(form: Form, rootFret: number, name: string): ChordShape | null {
  const minOffset = Math.min(...form.offsets.filter((o): o is number => o !== null));
  let r = rootFret;
  if (r + minOffset < 0) r += 12;
  const frets = form.offsets.map((o) => (o === null ? null : r + o));
  if (frets.some((f) => f !== null && f > 15)) return null;
  const open = frets.some((f) => f === 0);
  let fingers: Finger[] = form.fingers.slice();
  let barres: Barre[] = [];
  if (form.barre && !(open && r + form.barre[0] === 0)) {
    barres = [{ fret: r + form.barre[0], from: form.barre[1], to: form.barre[2], finger: fingers[form.barre[1]] as number }];
  }
  if (open) {
    // Open-position version of the form: open strings need no finger; shift the rest down.
    const used = fingers.filter((f, i) => typeof f === 'number' && frets[i]! > 0) as number[];
    const shift = used.length && Math.min(...used) > 1 ? Math.min(...used) - 1 : 0;
    fingers = fingers.map((f, i) => (frets[i] === 0 ? 0 : typeof f === 'number' ? f - shift : f));
  }
  const lowest = Math.min(...frets.filter((f): f is number => f !== null && f > 0));
  const label = open ? `${name} (open)` : `${name} · fret ${Number.isFinite(lowest) ? lowest : r}`;
  return { frets, fingers, barres, source: 'movable', label };
}

// ---------------------------------------------------------------------------
// 3. Fretboard search (any tuning), adapted from ChordLab's shape finder.
// ---------------------------------------------------------------------------

const MAX_FRET = 15;

export function searchShapes(c: Chord, tuning: Tuning, limit = 3): ChordShape[] {
  const tones = QUALITIES[c.quality].intervals;
  const pcs = chordPcs(c);
  // The fifth is optional when the chord has other colour tones.
  const required = tones.length >= 4 ? pcs.filter((_, i) => tones[i].semis % 12 !== 7) : pcs;
  const bassPc = c.bass ? pcOf(c.bass) : pcOf(c.root);
  const pcSet = new Set([...pcs, bassPc]);
  const seen = new Set<string>();
  const found: { shape: ChordShape; score: number }[] = [];
  const n = tuning.notes.length;

  for (let w = 1; w <= MAX_FRET - 3; w++) {
    const options = tuning.notes.map((open) => {
      const opts: (number | null)[] = [null];
      for (const f of [0, w, w + 1, w + 2, w + 3]) if (pcSet.has(mod12(open + f)) && !opts.includes(f)) opts.push(f);
      return opts;
    });
    const frets: (number | null)[] = new Array(n).fill(null);
    const walk = (s: number): void => {
      if (s === n) {
        const key = frets.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        const r = evaluate(frets, tuning, required, bassPc);
        if (r) found.push(r);
        return;
      }
      for (const o of options[s]) {
        frets[s] = o;
        walk(s + 1);
      }
    };
    walk(0);
  }
  found.sort((a, b) => a.score - b.score);
  return found.slice(0, limit).map((f) => f.shape);
}

function evaluate(frets: (number | null)[], tuning: Tuning, required: number[], bassPc: number) {
  const sounding = frets.map((f, i) => (f === null ? null : tuning.notes[i] + f));
  const first = sounding.findIndex((x) => x !== null);
  if (first < 0) return null;
  const count = sounding.filter((x) => x !== null).length;
  if (count < Math.min(4, tuning.notes.length - 1)) return null;
  if (mod12(sounding[first]!) !== bassPc) return null;
  let innerMutes = 0;
  for (let i = first + 1; i < frets.length; i++) if (frets[i] === null) innerMutes++;
  if (innerMutes > 1) return null;
  const present = new Set(sounding.filter((x): x is number => x !== null).map(mod12));
  if (!required.every((pc) => present.has(pc))) return null;
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const opens = frets.filter((f) => f === 0).length;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;
  const barres: Barre[] = [];
  if (fretted.length > 4) {
    const barreStrings = frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
    const from = barreStrings[0];
    const coverable = frets.slice(from).every((f) => f !== null && f >= minF);
    const fingersNeeded = 1 + fretted.filter((f) => f > minF).length;
    if (barreStrings.length < 2 || !coverable || fingersNeeded > 4) return null;
    barres.push({ fret: minF, from, to: frets.length - 1, finger: 1 });
  }
  let score = minF * 0.7 + first + innerMutes * 5 + (barres.length ? 1 : 0) - opens * 0.3 - count * 0.3 + (maxF - minF) * 0.7;
  if (maxF >= 4) score += opens * 1.5;
  return {
    shape: { frets: frets.slice(), fingers: frets.map(() => null), barres, source: 'search' as const, label: minF > 0 ? `Fret ${minF}` : 'Open position' },
    score,
  };
}

// ---------------------------------------------------------------------------
// Public lookup
// ---------------------------------------------------------------------------

const cache = new Map<string, ChordShape[]>();

/**
 * All known shapes for a chord symbol, best first. `songShapes` (symbol → shape)
 * take priority, e.g. for alternate tunings.
 */
export function shapesForChord(symbol: string, tuning: Tuning = STANDARD, songShapes?: Record<string, ChordShape>): ChordShape[] {
  if (isNoChord(symbol)) return [];
  const own = songShapes?.[symbol];
  const c = parseChord(symbol);
  if (!c) return own ? [own] : [];
  const key = `${tuning.notes.join(',')}|${shapeKey(c)}`;
  let shapes = cache.get(key);
  if (!shapes) {
    shapes = computeShapes(c, tuning);
    cache.set(key, shapes);
  }
  return own ? [own, ...shapes] : shapes;
}

function computeShapes(c: Chord, tuning: Tuning): ChordShape[] {
  const out: ChordShape[] = [];
  if (hasStandardIntervals(tuning)) {
    const lib = LIBRARY_MAP.get(shapeKey(c));
    if (lib) out.push(lib);
    if (!c.bass) {
      const rootPc = pcOf(c.root);
      const forms: ChordShape[] = [];
      const e = E_FORMS[c.quality];
      if (e) {
        const s = buildForm(e, mod12(rootPc - 4), 'E-shape');
        if (s) forms.push(s);
      }
      const a = A_FORMS[c.quality];
      if (a) {
        const s = buildForm(a, mod12(rootPc - 9), 'A-shape');
        if (s) forms.push(s);
      }
      forms.sort((x, y) => highestFret(x) - highestFret(y));
      for (const f of forms) if (!out.some((o) => o.frets.join() === f.frets.join())) out.push(f);
    }
  }
  if (out.length < 2) {
    // Shift the search into the tuning's own pitch space (half-step down etc. still works).
    for (const s of searchShapes(c, tuning, 3)) {
      if (!out.some((o) => o.frets.join() === s.frets.join())) out.push(s);
      if (out.length >= 3) break;
    }
  }
  return out;
}

function highestFret(s: ChordShape): number {
  const f = s.frets.filter((x): x is number => x !== null);
  return f.length ? Math.max(...f) : 0;
}

export function shapeToString(s: ChordShape): string {
  return s.frets.map((f) => (f === null ? 'x' : f >= 10 ? `(${f})` : String(f))).join('');
}

/** MIDI notes the shape sounds (with capo), low → high, muted strings skipped. */
export function shapeMidiNotes(s: ChordShape, tuning: Tuning = STANDARD, capo = 0): number[] {
  return s.frets.flatMap((f, i) => (f === null || i >= tuning.notes.length ? [] : [tuning.notes[i] + f + capo]));
}

/** First fret to draw in a 5-fret diagram window. */
export function diagramBaseFret(s: ChordShape, window = 5): number {
  const fretted = s.frets.filter((f): f is number => f !== null && f > 0);
  if (!fretted.length) return 1;
  const max = Math.max(...fretted);
  const min = Math.min(...fretted);
  return max <= window - 1 ? 1 : min;
}

/** Plain-language fingering steps for beginners. */
export function describeFingering(s: ChordShape): string[] {
  const names = ['low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'high e (1st)'];
  const fingerName: Record<string, string> = { 1: 'index', 2: 'middle', 3: 'ring', 4: 'pinky', T: 'thumb' };
  const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const steps: string[] = [];
  for (const b of s.barres) {
    steps.push(`Lay your ${fingerName[b.finger] ?? 'index'} finger flat across the ${names[b.to]} to the ${names[b.from]} strings at the ${ord(b.fret)} fret (a barre).`);
  }
  s.frets.forEach((f, i) => {
    if (f === null || f === 0) return;
    const finger = s.fingers[i];
    if (s.barres.some((b) => b.fret === f && i >= b.from && i <= b.to && b.finger === finger)) return;
    const who = finger != null ? `${fingerName[String(finger)]} finger (${finger})` : 'a finger';
    steps.push(`Put your ${who} on the ${names[i]} string, ${ord(f)} fret.`);
  });
  const open = s.frets.map((f, i) => (f === 0 ? names[i] : null)).filter(Boolean);
  const muted = s.frets.map((f, i) => (f === null ? names[i] : null)).filter(Boolean);
  if (open.length) steps.push(`Let ${open.join(', ')} ring open (O).`);
  if (muted.length) steps.push(`Don't play ${muted.join(', ')} (X) — skip or mute ${muted.length > 1 ? 'them' : 'it'}.`);
  return steps;
}
