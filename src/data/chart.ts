/**
 * Bar-chart notation ⇄ chord events.
 *
 *   | G | D Em | C . . G | % | Am:3.5 F:0.5 | N.C. |
 *
 * - Bars are separated by "|".
 * - Chords in a bar share it equally ("D Em" = two beats each in 4/4).
 * - "." repeats the previous chord for one share ("C . . G" = C for three beats, G for one).
 * - "%" (or an empty bar) holds the previous chord for the whole bar.
 * - "Chord:beats" gives an explicit length in beats ("Am:3.5 F:0.5" pushes F to the "and" of 4).
 * - "N.C." means no chord.
 */
import type { ChordEvent } from './song';
import { type Meter, barTicks, beatsOfBar } from '../music/meter';
import { isNoChord, parseChord } from '../music/chords';

export interface ChartResult {
  chords: ChordEvent[];
  bars: number;
  errors: string[];
}

export function parseChart(text: string, meter: Meter, startOffset = 0): ChartResult {
  const bar = barTicks(meter);
  const beatLen = beatsOfBar(meter)[0].length;
  const errors: string[] = [];
  const chords: ChordEvent[] = [];
  const rawBars = text.split('|').map((b) => b.trim());
  // Drop the empty strings produced by leading/trailing bar lines.
  if (rawBars.length && rawBars[0] === '') rawBars.shift();
  if (rawBars.length && rawBars[rawBars.length - 1] === '') rawBars.pop();

  let t = startOffset;
  const extend = (until: number) => {
    const last = chords[chords.length - 1];
    if (last) last.duration = until - last.start;
  };

  rawBars.forEach((rb, bi) => {
    const barStart = startOffset + bi * bar;
    const tokens = rb.split(/\s+/).filter(Boolean);
    if (!tokens.length || (tokens.length === 1 && tokens[0] === '%')) {
      if (!chords.length) errors.push(`Bar ${bi + 1}: nothing to hold yet`);
      extend(barStart + bar);
      t = barStart + bar;
      return;
    }
    const explicit = tokens.some((tk) => /:\d/.test(tk));
    const share = bar / tokens.length;
    let pos = barStart;
    tokens.forEach((tk) => {
      let sym = tk;
      let len = share;
      if (explicit) {
        const m = /^(.*):(\d+(?:\.\d+)?)$/.exec(tk);
        if (m) {
          sym = m[1];
          len = Math.round(Number(m[2]) * beatLen);
        } else len = beatLen;
      }
      if (!Number.isInteger(len)) {
        errors.push(`Bar ${bi + 1}: "${tk}" does not fit the grid — use explicit beats like ${tk}:1`);
        len = Math.round(len);
      }
      if (sym === '.' || sym === '%') {
        extend(pos + len);
      } else if (isNoChord(sym) || parseChord(sym)) {
        chords.push({ chord: isNoChord(sym) ? 'N.C.' : sym, start: pos, duration: len });
      } else {
        errors.push(`Bar ${bi + 1}: "${sym}" is not a chord I recognise`);
        chords.push({ chord: 'N.C.', start: pos, duration: len });
      }
      pos += len;
    });
    if (pos !== barStart + bar) {
      if (pos < barStart + bar) extend(barStart + bar);
      else errors.push(`Bar ${bi + 1}: chords add up to more than one bar`);
    }
    t = barStart + bar;
  });

  return { chords, bars: Math.round((t - startOffset) / bar), errors };
}

/** Events → bar chart text (inverse of parseChart for charts on the beat grid). */
export function toChart(chords: ChordEvent[], meter: Meter, bars: number, startOffset = 0): string {
  const bar = barTicks(meter);
  const beatLen = beatsOfBar(meter)[0].length;
  const out: string[] = [];
  const sorted = [...chords].sort((a, b) => a.start - b.start);
  for (let i = 0; i < bars; i++) {
    const bs = startOffset + i * bar;
    const be = bs + bar;
    const inBar = sorted.filter((c) => c.start < be && c.start + c.duration > bs);
    const starting = inBar.filter((c) => c.start >= bs);
    if (!starting.length) {
      out.push('%');
      continue;
    }
    // Segments of the bar: [chord-or-held, length]
    const segs: { sym: string; len: number }[] = [];
    const first = inBar[0];
    if (first.start < bs) segs.push({ sym: '.', len: Math.min(first.start + first.duration, be) - bs });
    for (const c of starting) segs.push({ sym: c.chord, len: Math.min(c.start + c.duration, be) - c.start });
    const equal = segs.every((s) => s.len === segs[0].len) && segs[0].sym !== '.';
    if (equal) out.push(segs.map((s) => s.sym).join(' '));
    else out.push(segs.map((s) => `${s.sym}:${+(s.len / beatLen).toFixed(3)}`).join(' '));
  }
  return `| ${out.join(' | ')} |`;
}
