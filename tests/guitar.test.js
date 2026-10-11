import { describe, it, expect } from 'vitest';
import { guitarShapes, shapeToString, STANDARD_TUNING } from '../src/theory/guitar.js';
import { makeKey } from '../src/theory/scales.js';
import { chordPitchClasses, bassNote } from '../src/theory/chords.js';

const C = makeKey('C', 'major');
const ch = (degree, root, quality, inversion = 0) => ({ degree, root, quality, inversion, func: 'diatonic' });
const best = (c, key = C) => shapeToString(guitarShapes(c, key)[0]);

describe('guitar shapes', () => {
  it('finds the familiar open chords', () => {
    expect(best(ch(0, 0, 'maj'))).toBe('x32010'); // C
    expect(best(ch(5, 9, 'min'))).toBe('x02210'); // Am
    expect(best(ch(2, 4, 'maj'))).toBe('022100'); // E
    expect(best(ch(2, 4, 'min'))).toBe('022000'); // Em
    expect(best(ch(1, 2, 'maj'))).toBe('xx0232'); // D
    expect(best(ch(1, 2, 'min'))).toBe('xx0231'); // Dm
    expect(['320003', '320033']).toContain(best(ch(4, 7, 'maj'))); // G
    expect(best(ch(5, 9, 'maj'))).toBe('x02220'); // A
  });

  it('uses barre or partial shapes when there is no open chord', () => {
    expect(['133211', 'xx3211']).toContain(best(ch(3, 5, 'maj'))); // F
    expect(['x24432', 'xx4432']).toContain(best(ch(6, 11, 'min'))); // Bm
  });

  it('respects inversions (slash chords)', () => {
    expect(best(ch(0, 0, 'maj', 1))).toBe('032010'); // C/E
    const gOverB = guitarShapes(ch(4, 7, 'maj', 1), C)[0];
    const low = gOverB.frets.findIndex((f) => f !== null);
    expect((STANDARD_TUNING[low] + gOverB.frets[low]) % 12).toBe(11);
  });

  it('always returns playable shapes containing the chord tones', () => {
    const qualities = ['maj', 'min', 'dim', 'maj7', 'dom7', 'min7', 'hdim7', 'dim7', 'sus2', 'sus4', '7sus4', 'add9', 'madd9', 'maj6', 'min6', 'maj9', 'dom9', 'min9', 'aug'];
    for (const tonic of ['C', 'E♭', 'F♯', 'A']) {
      const key = makeKey(tonic, 'major');
      for (const q of qualities) {
        for (let root = 0; root < 12; root++) {
          const c = { degree: 0, root, quality: q, inversion: 0, func: 'borrowed' };
          const shapes = guitarShapes(c, key);
          expect(shapes.length, `${tonic} ${root} ${q}`).toBeGreaterThan(0);
          const s = shapes[0];
          const fretted = s.frets.filter((f) => f !== null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
          expect(s.frets.filter((f) => f !== null).length).toBeGreaterThanOrEqual(4);
          const pcs = new Set(chordPitchClasses(c, key));
          s.frets.forEach((f, i) => f !== null && expect(pcs.has((STANDARD_TUNING[i] + f) % 12)).toBe(true));
          const low = s.frets.findIndex((f) => f !== null);
          expect((STANDARD_TUNING[low] + s.frets[low]) % 12).toBe(bassNote(c, key).pc);
        }
      }
    }
  });
});
