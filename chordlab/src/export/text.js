/**
 * Plain-text export: a lead-sheet style chart that pastes cleanly into notes,
 * messages or a DAW's marker list.
 */
import { describeChord } from '../theory/chords.js';
import { guitarShapes, shapeToString } from '../theory/guitar.js';
import { makeKey } from '../theory/scales.js';
import { toAscii } from '../theory/notes.js';
import { GENRES, MOODS } from '../generator/styles.js';
import { eighthsPerMeasure, tempoUnitLabel } from '../theory/timeSignature.js';

/** Group slots by measure: [[slot, slot], [slot], …]. */
export function slotsByMeasure(progression) {
  const measures = Array.from({ length: progression.settings.measures }, () => []);
  progression.slots.forEach((slot, index) => measures[slot.measure].push({ ...slot, index }));
  return measures;
}

/**
 * Build the text chart.
 * @param {object} options { ascii: boolean, barsPerLine: number }
 */
export function progressionToText(progression, { ascii = false, barsPerLine = 4, title = 'ChordLab progression' } = {}) {
  const s = progression.settings;
  const key = makeKey(s.tonic, s.mode);
  const epm = eighthsPerMeasure(s.timeSignature);
  const fmt = (str) => (ascii ? toAscii(str) : str);

  const header = [
    title,
    `Key: ${s.tonic} ${s.mode} · Time: ${s.timeSignature} · Tempo: ${s.tempo} BPM (${tempoUnitLabel(s.timeSignature) === '♩' ? 'quarter' : 'dotted quarter'})`,
    `Genre: ${GENRES[s.genre].label} · Mood: ${MOODS[s.mood].label} · Complexity: ${s.complexity}/5`,
    '',
  ];

  const measures = slotsByMeasure(progression);
  const cells = measures.map((slots) =>
    slots
      .map((slot) => {
        const name = describeChord(slot.chord, key).symbol;
        // Mark a mid-bar change with its beat position in eighths if uneven.
        return slot.start === 0 || slot.start * 2 === epm ? name : `${name}(@${slot.start / 2 + 1})`;
      })
      .join('  '),
  );
  const romans = measures.map((slots) => slots.map((slot) => describeChord(slot.chord, key).roman).join('  '));

  const width = Math.max(...cells.map((c) => c.length), ...romans.map((r) => r.length), 6) + 2;
  const lines = [];
  for (let i = 0; i < cells.length; i += barsPerLine) {
    const row = cells.slice(i, i + barsPerLine);
    const rrow = romans.slice(i, i + barsPerLine);
    lines.push('| ' + row.map((c) => c.padEnd(width)).join('| ') + '|');
    lines.push('  ' + rrow.map((r) => r.padEnd(width)).join('  '));
  }

  const seen = new Set();
  const legend = ['', 'Chord tones and guitar shapes (low E → high E):'];
  for (const slot of progression.slots) {
    const d = describeChord(slot.chord, key);
    if (seen.has(d.symbol)) continue;
    seen.add(d.symbol);
    const shape = guitarShapes(slot.chord, key)[0];
    legend.push(`  ${d.symbol.padEnd(12)} ${d.notes.join(' ').padEnd(14)} ${shape ? shapeToString(shape) : ''}`.trimEnd());
  }

  return fmt([...header, ...lines, ...legend].join('\n')) + '\n';
}

/** Compact one-line version, e.g. "C – G/B – Am7 – F". */
export function progressionToLine(progression) {
  const s = progression.settings;
  const key = makeKey(s.tonic, s.mode);
  return progression.slots.map((slot) => describeChord(slot.chord, key).symbol).join(' – ');
}
