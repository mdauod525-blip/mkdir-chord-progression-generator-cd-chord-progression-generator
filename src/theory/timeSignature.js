/**
 * Time-signature maths.
 *
 * Every supported meter is described in eighth notes. A measure is a list of
 * beat groups (e.g. 6/8 = [3, 3], 7/8 = [2, 2, 3]); each group is one felt beat
 * and the eighths inside it are its subdivisions.
 *
 * Tempo convention (shown in the UI):
 *   simple meters (x/4)           BPM counts quarter notes
 *   compound meters (6/8 9/8 12/8) BPM counts dotted quarters (the felt beat)
 *   irregular meters (7/8)        BPM counts quarter notes; the 3-group is 1½ beats long
 */

export const TIME_SIGNATURES = {
  '2/4':  { numerator: 2,  denominator: 4, groups: [2, 2],             kind: 'simple' },
  '3/4':  { numerator: 3,  denominator: 4, groups: [2, 2, 2],          kind: 'simple' },
  '4/4':  { numerator: 4,  denominator: 4, groups: [2, 2, 2, 2],       kind: 'simple' },
  '5/4':  { numerator: 5,  denominator: 4, groups: [2, 2, 2, 2, 2],    kind: 'simple' },
  '6/8':  { numerator: 6,  denominator: 8, groups: [3, 3],             kind: 'compound' },
  '7/8':  { numerator: 7,  denominator: 8, groups: [2, 2, 3],          kind: 'irregular' },
  '9/8':  { numerator: 9,  denominator: 8, groups: [3, 3, 3],          kind: 'compound' },
  '12/8': { numerator: 12, denominator: 8, groups: [3, 3, 3, 3],       kind: 'compound' },
};

export const TIME_SIGNATURE_IDS = Object.keys(TIME_SIGNATURES);

/** Secondary accents (beat-group indexes) beyond the downbeat. */
const SECONDARY_ACCENTS = { '4/4': [2], '5/4': [3], '12/8': [2] };

/** Look up a time signature by id ("6/8"); throws for unsupported meters. */
export function getTimeSignature(id) {
  const ts = TIME_SIGNATURES[id];
  if (!ts) throw new Error(`Unsupported time signature: ${id}`);
  return { id, ...ts };
}

/** Number of eighth notes in one measure. */
export function eighthsPerMeasure(id) {
  const ts = getTimeSignature(id);
  return (ts.numerator * 8) / ts.denominator;
}

/** Number of felt beats (beat groups) in one measure. */
export const beatsPerMeasure = (id) => getTimeSignature(id).groups.length;

/** Start offsets (in eighths) of each beat group within the measure. */
export function groupStarts(id) {
  const starts = [];
  let pos = 0;
  for (const g of getTimeSignature(id).groups) {
    starts.push(pos);
    pos += g;
  }
  return starts;
}

/** How many eighths one tempo "beat" spans (see tempo convention above). */
export function eighthsPerTempoBeat(id) {
  return getTimeSignature(id).kind === 'compound' ? 3 : 2;
}

/** Name of the note value the BPM refers to. */
export function tempoUnitLabel(id) {
  return getTimeSignature(id).kind === 'compound' ? 'dotted ♩' : '♩';
}

/** Duration of one eighth note in seconds at the given BPM. */
export function secondsPerEighth(id, bpm) {
  if (!(bpm > 0)) throw new Error(`Invalid tempo: ${bpm}`);
  return 60 / bpm / eighthsPerTempoBeat(id);
}

/** Duration of a whole measure in seconds. */
export const measureSeconds = (id, bpm) => eighthsPerMeasure(id) * secondsPerEighth(id, bpm);

/** Measure length in quarter notes (used for MIDI ticks). */
export const quarterNotesPerMeasure = (id) => eighthsPerMeasure(id) / 2;

/**
 * Where to put a mid-measure chord change: the beat-group boundary closest to
 * the middle of the bar (ties resolve later, e.g. 3/4 → beat 3, 5/4 → 3+2).
 * Returns null for meters with a single group.
 */
export function halfMeasureSplit(id) {
  const starts = groupStarts(id).slice(1);
  if (!starts.length) return null;
  const half = eighthsPerMeasure(id) / 2;
  let best = starts[0];
  for (const s of starts) {
    if (Math.abs(s - half) <= Math.abs(best - half)) best = s;
  }
  return best;
}

/**
 * Accent level of each beat group: 2 = downbeat, 1 = secondary accent, 0 = weak.
 */
export function accentLevels(id) {
  const secondary = SECONDARY_ACCENTS[id] || [];
  return getTimeSignature(id).groups.map((_, i) => (i === 0 ? 2 : secondary.includes(i) ? 1 : 0));
}

/**
 * Beat grid for display and the metronome: one entry per eighth note.
 *   { eighth, group, isBeat, accent, label }
 * Simple meters count "1 & 2 &", compound meters "1 la li", 7/8 "1 & 2 & 3 la li".
 */
export function beatGrid(id) {
  const ts = getTimeSignature(id);
  const accents = accentLevels(id);
  const grid = [];
  let eighth = 0;
  ts.groups.forEach((size, group) => {
    for (let i = 0; i < size; i++) {
      const sub = size === 3 ? ['', 'la', 'li'][i] : ['', '&'][i];
      grid.push({
        eighth,
        group,
        isBeat: i === 0,
        accent: i === 0 ? accents[group] : -1,
        label: i === 0 ? String(group + 1) : sub,
      });
      eighth++;
    }
  });
  return grid;
}

/** Human-readable grouping, e.g. "2+2+3" for 7/8, "3+3" for 6/8. */
export function groupingLabel(id) {
  const ts = getTimeSignature(id);
  if (ts.kind === 'simple') return `${ts.numerator} beats`;
  return ts.groups.join('+');
}

/**
 * MIDI time-signature meta-event data: [nn, dd, cc, bb]
 * cc = MIDI clocks per metronome click (24 = quarter, 36 = dotted quarter).
 */
export function midiTimeSignatureBytes(id) {
  const ts = getTimeSignature(id);
  const dd = Math.log2(ts.denominator);
  const cc = ts.kind === 'compound' ? 36 : 24;
  return [ts.numerator, dd, cc, 8];
}
