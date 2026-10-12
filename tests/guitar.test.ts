import { describe, expect, it } from 'vitest';
import { shapesForChord, shapeToString, shapeMidiNotes, STANDARD, TUNINGS, describeFingering, diagramBaseFret } from '../src/music/guitar';
import { chordPcs, parseChord } from '../src/music/chords';
import { mod12 } from '../src/music/notes';

const first = (s: string, t = STANDARD) => shapeToString(shapesForChord(s, t)[0]);

describe('chord shapes', () => {
  it('uses familiar open shapes', () => {
    expect(first('C')).toBe('x32010');
    expect(first('G')).toBe('320003');
    expect(first('D')).toBe('xx0232');
    expect(first('Em')).toBe('022000');
    expect(first('Am')).toBe('x02210');
    expect(first('E')).toBe('022100');
    expect(first('A')).toBe('x02220');
    expect(first('Dm')).toBe('xx0231');
    expect(first('F')).toBe('133211');
    expect(first('Bm')).toBe('x24432');
    expect(first('D/F#')).toBe('2x0232');
  });

  it('generates movable barre shapes for other roots', () => {
    expect(first('F#m')).toBe('244222');
    expect(first('Bb')).toBe('x13331');
    expect(first('C#m')).toBe('x46654');
    expect(first('Ab')).toBe('466544');
  });

  it('every shape sounds only chord tones and includes the root and third', () => {
    const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const quals = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', '7sus4', 'add9', '6', 'm6', 'dim', 'dim7', 'm7b5', 'aug', '9', '5'];
    for (const r of roots) for (const q of quals) {
      const sym = r + q;
      const shapes = shapesForChord(sym);
      expect(shapes.length, sym).toBeGreaterThan(0);
      const pcs = new Set(chordPcs(parseChord(sym)!));
      for (const s of shapes) {
        const notes = shapeMidiNotes(s).map(mod12);
        expect(notes.every((n) => pcs.has(n)), `${sym} ${shapeToString(s)}`).toBe(true);
        expect(notes.includes(mod12(chordPcs(parseChord(sym)!)[0])), `${sym} root`).toBe(true);
        expect(s.frets).toHaveLength(6);
      }
    }
  });

  it('finds shapes in alternate tunings', () => {
    const dropD = TUNINGS.find((t) => t.name === 'Drop D')!;
    const shapes = shapesForChord('D', dropD);
    expect(shapes.length).toBeGreaterThan(0);
    const notes = shapeMidiNotes(shapes[0], dropD);
    expect(mod12(notes[0])).toBe(2); // D in the bass
  });

  it('applies the capo to sounding notes', () => {
    const s = shapesForChord('G')[0];
    expect(shapeMidiNotes(s, STANDARD, 2)[0]).toBe(shapeMidiNotes(s, STANDARD, 0)[0] + 2);
  });

  it('describes fingering and picks a diagram window', () => {
    const f = shapesForChord('F')[0];
    expect(describeFingering(f)[0]).toMatch(/barre/);
    expect(diagramBaseFret(shapesForChord('C#m')[0])).toBe(4);
    expect(diagramBaseFret(shapesForChord('C')[0])).toBe(1);
  });
});
