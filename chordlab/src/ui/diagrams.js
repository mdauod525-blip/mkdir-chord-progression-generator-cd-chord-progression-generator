/**
 * SVG chord diagrams: guitar chord boxes and piano keyboards.
 * Returned as strings; colours come from CSS classes so both themes work.
 */
import { STANDARD_TUNING } from '../theory/guitar.js';
import { mod12 } from '../theory/notes.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Guitar chord box.
 * @param shape   { frets, baseFret, barre } from guitarShapes()
 * @param opts    { names: pc → spelled name (shows note names under strings), compact }
 */
export function guitarDiagram(shape, { names = null, compact = false, label = '' } = {}) {
  if (!shape) return `<svg class="diagram guitar empty" viewBox="0 0 120 150" role="img" aria-label="No guitar shape"><text x="60" y="80" class="dg-text" text-anchor="middle">—</text></svg>`;
  const strings = 6;
  const frets = 4;
  const left = compact ? 14 : 22;
  const top = compact ? 22 : 30;
  const gapX = compact ? 18 : 20;
  const gapY = compact ? 22 : 24;
  const width = left * 2 + gapX * (strings - 1);
  const height = top + gapY * frets + (names ? 26 : 10);
  const x = (i) => left + i * gapX;
  const base = shape.baseFret;
  const parts = [];

  // Nut or position label.
  if (base === 1) parts.push(`<rect class="dg-nut" x="${x(0) - 1}" y="${top - 4}" width="${gapX * 5 + 2}" height="4" rx="1"/>`);
  else parts.push(`<text class="dg-pos" x="${x(0) - 6}" y="${top + gapY * 0.65}" text-anchor="end">${base}</text>`);
  for (let f = 0; f <= frets; f++) parts.push(`<line class="dg-line" x1="${x(0)}" x2="${x(5)}" y1="${top + f * gapY}" y2="${top + f * gapY}"/>`);
  for (let s = 0; s < strings; s++) parts.push(`<line class="dg-line" x1="${x(s)}" x2="${x(s)}" y1="${top}" y2="${top + frets * gapY}"/>`);

  if (shape.barre) {
    const y = top + (shape.barre.fret - base + 0.5) * gapY;
    parts.push(`<rect class="dg-dot" x="${x(shape.barre.from) - 6}" y="${y - 6}" width="${x(5) - x(shape.barre.from) + 12}" height="12" rx="6"/>`);
  }
  const r = compact ? 6.5 : 7;
  const bassString = shape.frets.findIndex((f) => f !== null);
  shape.frets.forEach((f, s) => {
    const cx = x(s);
    if (f === null) {
      parts.push(`<text class="dg-mark" x="${cx}" y="${top - 9}" text-anchor="middle">×</text>`);
    } else if (f === 0) {
      parts.push(`<circle class="dg-open${s === bassString ? ' bass' : ''}" cx="${cx}" cy="${top - 13}" r="4.5"/>`);
    } else if (!(shape.barre && f === shape.barre.fret && s >= shape.barre.from)) {
      parts.push(`<circle class="dg-dot${s === bassString ? ' bass' : ''}" cx="${cx}" cy="${top + (f - base + 0.5) * gapY}" r="${r}"/>`);
    }
    if (names && f !== null) {
      parts.push(`<text class="dg-note" x="${cx}" y="${top + frets * gapY + 17}" text-anchor="middle">${esc(names(mod12(STANDARD_TUNING[s] + f)))}</text>`);
    }
  });

  const aria = `Guitar shape ${label} ${shape.frets.map((f) => (f === null ? 'x' : f)).join(' ')}`;
  return `<svg class="diagram guitar${compact ? ' compact' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">${parts.join('')}</svg>`;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isBlack = (midi) => !WHITE_PCS.includes(mod12(midi));

/**
 * Piano keyboard with highlighted notes.
 * @param notes   MIDI notes to highlight
 * @param opts    { bass: MIDI note shown in the bass colour, names: pc → spelled name, compact }
 */
export function pianoDiagram(notes, { bass = null, names = null, compact = false, label = '' } = {}) {
  const all = bass != null ? [bass, ...notes] : [...notes];
  if (!all.length) return '';
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const start = lo - mod12(lo); // C at or below the lowest note
  let end = hi + (11 - mod12(hi)); // B at or above the highest note
  if (end - start < 23) end = start + 23; // show at least two octaves

  const whiteW = compact ? 10 : 16;
  const whiteH = compact ? 48 : 70;
  const blackW = whiteW * (compact ? 0.52 : 0.6);
  const blackH = whiteH * (compact ? 0.58 : 0.62);
  const on = new Set(notes);
  const whites = [];
  const blacks = [];
  let wx = 0;
  for (let m = start; m <= end; m++) {
    const cls = m === bass ? ' bass' : on.has(m) ? ' on' : '';
    if (!isBlack(m)) {
      whites.push(`<rect class="pk-white${cls}" x="${wx}" y="0" width="${whiteW}" height="${whiteH}" rx="2"/>`);
      if (cls && names && !compact) whites.push(`<text class="pk-label" x="${wx + whiteW / 2}" y="${whiteH - 6}" text-anchor="middle">${esc(names(mod12(m)))}</text>`);
      wx += whiteW;
    } else {
      const bx = wx - blackW / 2;
      blacks.push(`<rect class="pk-black${cls}" x="${bx}" y="0" width="${blackW}" height="${blackH}" rx="1.5"/>`);
      if (cls && names && !compact) blacks.push(`<text class="pk-label on-black" x="${bx + blackW / 2}" y="${blackH - 5}" text-anchor="middle">${esc(names(mod12(m)))}</text>`);
    }
  }
  return `<svg class="diagram piano${compact ? ' compact' : ''}" viewBox="-1 -1 ${wx + 2} ${whiteH + 2}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(`Piano keys ${label}`)}">${whites.join('')}${blacks.join('')}</svg>`;
}
