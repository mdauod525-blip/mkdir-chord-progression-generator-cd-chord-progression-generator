import { describe, expect, it } from 'vitest';
import { parseChord, formatChord, chordTones, displayChord, isNoChord } from '../src/music/chords';
import { noteName } from '../src/music/notes';
import {
  parseKey, keyName, transposeKey, transposeChordSymbol, romanNumeral, chordFromNumeral, diatonicChords,
} from '../src/music/keys';

const tones = (s: string) => chordTones(parseChord(s)!).map((n) => noteName(n));

describe('chord parsing', () => {
  it('parses roots, qualities, aliases and slash chords', () => {
    expect(formatChord(parseChord('F#m7')!)).toBe('F#m7');
    expect(formatChord(parseChord('Bbmaj7')!)).toBe('Bbmaj7');
    expect(formatChord(parseChord('CM7')!)).toBe('Cmaj7');
    expect(formatChord(parseChord('Amin')!)).toBe('Am');
    expect(formatChord(parseChord('D/F#')!)).toBe('D/F#');
    expect(formatChord(parseChord('Esus')!)).toBe('Esus4');
    expect(parseChord('H7')).toBeNull();
    expect(parseChord('Cfoo')).toBeNull();
    expect(isNoChord('N.C.')).toBe(true);
    expect(displayChord('Bb7')).toBe('B♭7');
  });

  it('spells chord tones by letter', () => {
    expect(tones('Eb')).toEqual(['Eb', 'G', 'Bb']);
    expect(tones('F#m')).toEqual(['F#', 'A', 'C#']);
    expect(tones('G7')).toEqual(['G', 'B', 'D', 'F']);
    expect(tones('Bdim')).toEqual(['B', 'D', 'F']);
    expect(tones('Cadd9')).toEqual(['C', 'E', 'G', 'D']);
  });
});

describe('transposition', () => {
  const G = parseKey('G')!;
  it('transposes keys with conventional spellings', () => {
    expect(keyName(transposeKey(G, 2))).toBe('A');
    expect(keyName(transposeKey(G, 1))).toBe('A♭');
    expect(keyName(transposeKey(G, -1))).toBe('F♯');
    expect(keyName(transposeKey(parseKey('Am')!, 1))).toBe('B♭m');
    expect(keyName(transposeKey(G, 1, 'sharp'))).toBe('G♯');
  });

  it('preserves chord qualities and slash bass', () => {
    expect(transposeChordSymbol('Em7', 2, G)).toBe('F#m7');
    expect(transposeChordSymbol('D/F#', 2, G)).toBe('E/G#');
    expect(transposeChordSymbol('Cmaj7', 5, G)).toBe('Fmaj7');
  });

  it('preserves scale-degree relationships (♭VII stays ♭VII)', () => {
    // F is ♭VII in G.
    expect(transposeChordSymbol('F', 2, G)).toBe('G'); // A major: G
    expect(transposeChordSymbol('F', 5, G)).toBe('Bb'); // C major: B♭, not A#
    expect(transposeChordSymbol('F', 8, G)).toBe('Db'); // E♭ major: D♭, not C#
    expect(transposeChordSymbol('D', 1, G)).toBe('Eb'); // V of A♭ is E♭
    expect(transposeChordSymbol('B7', 1, parseKey('E')!)).toBe('C7'); // V7 of F
  });

  it('honours a sharp/flat preference', () => {
    expect(transposeChordSymbol('G', 3, G, 'sharp')).toBe('A#');
    expect(transposeChordSymbol('G', 3, G, 'flat')).toBe('Bb');
  });

  it('round-trips: up then down returns the original', () => {
    for (const sym of ['G', 'D', 'Em', 'C', 'F', 'Bm7', 'A7sus4', 'D/F#']) {
      for (let k = -11; k <= 11; k++) {
        const up = transposeChordSymbol(sym, k, G);
        const back = transposeChordSymbol(up, -k, transposeKey(G, k));
        expect(back).toBe(sym);
      }
    }
  });
});

describe('Roman numerals', () => {
  const C = parseKey('C')!;
  it('analyses chords in a key', () => {
    expect(['C', 'G', 'Am', 'F'].map((c) => romanNumeral(c, C))).toEqual(['I', 'V', 'vi', 'IV']);
    expect(romanNumeral('Bb', C)).toBe('♭VII');
    expect(romanNumeral('G7', C)).toBe('V7');
    expect(romanNumeral('Bdim', C)).toBe('vii°');
    expect(romanNumeral('C/E', C)).toBe('I⁶');
    expect(romanNumeral('E7', parseKey('Am')!)).toBe('V7');
    expect(romanNumeral('G', parseKey('Am')!)).toBe('VII');
  });

  it('builds chords from numerals in any key', () => {
    const in_ = (k: string) => ['I', 'V', 'vi', 'IV'].map((n) => chordFromNumeral(n, parseKey(k)!));
    expect(in_('G')).toEqual(['G', 'D', 'Em', 'C']);
    expect(in_('Eb')).toEqual(['Eb', 'Bb', 'Cm', 'Ab']);
    expect(in_('E')).toEqual(['E', 'B', 'C#m', 'A']);
    expect(chordFromNumeral('♭VII', parseKey('D')!)).toBe('C');
    expect(chordFromNumeral('ii7', parseKey('C')!)).toBe('Dm7');
    expect(chordFromNumeral('V7', parseKey('Am')!)).toBe('E7');
    expect(diatonicChords(parseKey('F')!)).toEqual(['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim']);
  });
});
