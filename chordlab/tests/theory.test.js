import { describe, it, expect } from 'vitest';
import { parseNote, spell, normalizeTonic, toAscii, midiToFreq } from '../src/theory/notes.js';
import { makeKey, diatonicTriad, diatonicSeventh } from '../src/theory/scales.js';
import {
  chordNotes,
  chordSymbol,
  romanNumeral,
  bassNote,
  maxInversion,
  describeChord,
  QUALITIES,
} from '../src/theory/chords.js';
import { parseToken, classifyToken } from '../src/theory/roman.js';
import { voiceChord, voiceProgression } from '../src/theory/voicing.js';

const C = makeKey('C', 'major');
const F = makeKey('F', 'major');
const Am = makeKey('A', 'minor');
const chord = (degree, root, quality, extra = {}) => ({ degree, root, quality, inversion: 0, func: 'diatonic', ...extra });

describe('notes', () => {
  it('parses ASCII and Unicode accidentals', () => {
    expect(parseNote('F#')).toEqual({ letter: 3, pc: 6 });
    expect(parseNote('B♭')).toEqual({ letter: 6, pc: 10 });
    expect(parseNote('Cb')).toEqual({ letter: 0, pc: 11 });
    expect(() => parseNote('H')).toThrow();
  });

  it('spells pitch classes by letter', () => {
    expect(spell(6, 10)).toBe('B♭');
    expect(spell(5, 10)).toBe('A♯');
    expect(spell(3, 6)).toBe('F♯');
    expect(spell(4, 6)).toBe('G♭');
  });

  it('normalises tonic spellings per mode', () => {
    expect(normalizeTonic('C#', 'major')).toBe('D♭');
    expect(normalizeTonic('C#', 'minor')).toBe('C♯');
    expect(normalizeTonic('Bb', 'minor')).toBe('B♭');
  });

  it('converts to ASCII and frequencies', () => {
    expect(toAscii('B♭m7♭5')).toBe('Bbm7b5');
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe('scales', () => {
  it('builds diatonic triads', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => diatonicTriad('major', d))).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => diatonicTriad('minor', d))).toEqual(['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']);
  });

  it('builds diatonic seventh chords', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => diatonicSeventh('major', d))).toEqual(['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'hdim7']);
  });
});

describe('chords', () => {
  it('spells chords correctly in flat keys', () => {
    expect(chordNotes(chord(3, 5, 'maj'), F)).toEqual(['B♭', 'D', 'F']);
    expect(chordSymbol(chord(3, 5, 'maj'), F)).toBe('B♭');
    expect(chordNotes(chord(4, 7, 'dom7'), C)).toEqual(['G', 'B', 'D', 'F']);
  });

  it('names every quality', () => {
    const names = Object.keys(QUALITIES).map((q) => chordSymbol(chord(0, 0, q), C));
    expect(names).toEqual(['C', 'Cm', 'Cdim', 'Caug', 'Csus2', 'Csus4', 'Cmaj7', 'C7', 'Cm7', 'Cm7♭5', 'Cdim7', 'C7sus4', 'Cadd9', 'Cm(add9)', 'C6', 'Cm6', 'Cmaj9', 'C9', 'Cm9']);
  });

  it('builds seventh, suspended and extended chords', () => {
    expect(chordNotes(chord(1, 2, 'min7'), C)).toEqual(['D', 'F', 'A', 'C']);
    expect(chordNotes(chord(4, 7, 'sus4'), C)).toEqual(['G', 'C', 'D']);
    expect(chordNotes(chord(4, 7, '7sus4'), C)).toEqual(['G', 'C', 'D', 'F']);
    expect(chordNotes(chord(0, 0, 'add9'), C)).toEqual(['C', 'E', 'G', 'D']);
    expect(chordNotes(chord(6, 11, 'hdim7'), C)).toEqual(['B', 'D', 'F', 'A']);
    expect(chordNotes(chord(6, 11, 'dim7'), Am)).toEqual(['G♯', 'B', 'D', 'F']);
  });

  it('handles inversions as slash chords', () => {
    const c1 = chord(0, 0, 'maj', { inversion: 1 });
    expect(chordSymbol(c1, C)).toBe('C/E');
    expect(bassNote(chord(4, 7, 'dom7', { inversion: 3 }), C).name).toBe('F');
    expect(maxInversion('maj')).toBe(2);
    expect(maxInversion('dom7')).toBe(3);
    expect(maxInversion('add9')).toBe(2); // the 9th never goes in the bass
  });

  it('writes Roman numerals with figured bass', () => {
    expect(romanNumeral(chord(0, 0, 'maj'), 'major')).toBe('I');
    expect(romanNumeral(chord(1, 2, 'min7'), 'major')).toBe('ii7');
    expect(romanNumeral(chord(0, 0, 'maj', { inversion: 1 }), 'major')).toBe('I⁶');
    expect(romanNumeral(chord(0, 0, 'maj', { inversion: 2 }), 'major')).toBe('I⁶₄');
    expect(romanNumeral(chord(4, 7, 'dom7', { inversion: 1 }), 'major')).toBe('V⁶₅');
    expect(romanNumeral(chord(6, 11, 'hdim7'), 'major')).toBe('viiø7');
    expect(romanNumeral(chord(0, 0, 'maj7'), 'major')).toBe('Imaj7');
  });

  it('marks borrowed chords with accidentals relative to the key', () => {
    expect(romanNumeral(chord(6, 10, 'maj', { func: 'borrowed' }), 'major')).toBe('♭VII');
    expect(romanNumeral(chord(5, 8, 'maj', { func: 'borrowed' }), 'major')).toBe('♭VI');
    expect(romanNumeral(chord(3, 5, 'min', { func: 'borrowed' }), 'major')).toBe('iv');
    // In minor the natural VI/VII need no accidental, the leading-tone vii° neither.
    expect(romanNumeral(chord(5, 8, 'maj'), 'minor')).toBe('VI');
    expect(romanNumeral(chord(6, 11, 'dim', { func: 'harmonic' }), 'minor')).toBe('vii°');
  });

  it('labels secondary dominants and tritone substitutes', () => {
    const v7ofii = chord(5, 9, 'dom7', { func: 'secondary', target: 1 });
    expect(romanNumeral(v7ofii, 'major')).toBe('V7/ii');
    expect(chordSymbol(v7ofii, C)).toBe('A7');
    const v7ofV = chord(1, 2, 'dom7', { func: 'secondary', target: 4 });
    expect(romanNumeral(v7ofV, 'minor')).toBe('V7/V');
    const sub = chord(1, 1, 'dom7', { func: 'tritone', target: 0 });
    expect(chordSymbol(sub, C)).toBe('D♭7');
    expect(romanNumeral(sub, 'major')).toBe('subV7');
  });

  it('describes a chord for the UI', () => {
    const d = describeChord(chord(4, 7, 'dom7', { inversion: 1 }), C);
    expect(d).toMatchObject({ symbol: 'G7/B', roman: 'V⁶₅', bass: 'B', notes: ['G', 'B', 'D', 'F'] });
  });
});

describe('roman tokens', () => {
  it('parses tokens relative to the major scale', () => {
    expect(parseToken('bVII')).toEqual({ degree: 6, root: 10, triad: 'maj' });
    expect(parseToken('viio')).toEqual({ degree: 6, root: 11, triad: 'dim' });
    expect(parseToken('iv')).toEqual({ degree: 3, root: 5, triad: 'min' });
    expect(() => parseToken('X')).toThrow();
  });

  it('classifies diatonic, harmonic and borrowed chords', () => {
    expect(classifyToken('IV', 'major')).toBe('diatonic');
    expect(classifyToken('iv', 'major')).toBe('borrowed');
    expect(classifyToken('bVII', 'major')).toBe('borrowed');
    expect(classifyToken('bVII', 'minor')).toBe('diatonic');
    expect(classifyToken('V', 'minor')).toBe('harmonic');
    expect(classifyToken('v', 'minor')).toBe('diatonic');
    expect(classifyToken('IV', 'minor')).toBe('borrowed');
  });
});

describe('voicing', () => {
  const pcs = (notes) => new Set(notes.map((n) => n % 12));

  it('voices all chord tones above the bass', () => {
    for (const style of ['close', 'drop2', 'open']) {
      const v = voiceChord(chord(0, 0, 'maj7'), C, style);
      expect(v.bass % 12).toBe(0);
      expect(pcs(v.upper)).toEqual(new Set([0, 4, 7, 11]));
      expect(Math.min(...v.upper)).toBeGreaterThan(v.bass);
    }
  });

  it('puts the inversion note in the bass', () => {
    const v = voiceChord(chord(0, 0, 'maj', { inversion: 1 }), C);
    expect(v.bass % 12).toBe(4);
  });

  it('keeps close voicings within an octave and voice-leads smoothly', () => {
    const chords = [chord(0, 0, 'maj'), chord(5, 9, 'min'), chord(3, 5, 'maj'), chord(4, 7, 'maj')];
    const vs = voiceProgression(chords, C, 'close');
    for (const v of vs) expect(Math.max(...v.upper) - Math.min(...v.upper)).toBeLessThan(12);
    for (let i = 1; i < vs.length; i++) {
      const moved = vs[i].upper.reduce((s, n, j) => s + Math.abs(n - vs[i - 1].upper[j]), 0);
      expect(moved).toBeLessThanOrEqual(6);
    }
  });

  it('thins five-note chords to four upper voices', () => {
    expect(voiceChord(chord(0, 0, 'maj9'), C).upper).toHaveLength(4);
  });
});

describe('roman numerals for extended inversions', () => {
  it('uses figured bass rather than slash notation', () => {
    const c = { degree: 2, root: 4, quality: 'dom9', inversion: 1, func: 'secondary', target: 5 };
    expect(romanNumeral(c, 'major')).toBe('V9⁶₅/vi');
    expect(romanNumeral({ degree: 0, root: 0, quality: 'add9', inversion: 1, func: 'diatonic' }, 'major')).toBe('Iadd9⁶');
  });
});

describe('enharmonic respelling of chromatic chords', () => {
  it('spells a tritone substitute in E♭ as E7, not F♭7', () => {
    const Eb = makeKey('E♭', 'major');
    const sub = { degree: 3, root: 1, quality: 'dom7', inversion: 1, func: 'tritone', target: 2 };
    expect(chordSymbol(sub, Eb)).toBe('E7/G♯');
  });
});
