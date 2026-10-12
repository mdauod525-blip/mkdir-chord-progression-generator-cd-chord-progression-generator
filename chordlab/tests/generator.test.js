import { describe, it, expect } from 'vitest';
import {
  generateProgression,
  regenerateChord,
  buildSlots,
  updateChord,
  normalizeSettings,
  qualityOptions,
  bestInversion,
} from '../src/generator/progression.js';
import { GENRE_IDS, MOOD_IDS } from '../src/generator/styles.js';
import { createRng, weightedPick } from '../src/generator/random.js';
import { TIME_SIGNATURE_IDS, eighthsPerMeasure, groupStarts } from '../src/theory/timeSignature.js';
import { QUALITIES, describeChord, maxInversion } from '../src/theory/chords.js';
import { makeKey } from '../src/theory/scales.js';

const seeds = Array.from({ length: 12 }, (_, i) => i + 1);

describe('random helpers', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('respects weights', () => {
    const rng = createRng(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[weightedPick({ a: 9, b: 1, c: 0 }, rng)]++;
    expect(counts.a).toBeGreaterThan(counts.b * 5);
    expect(weightedPick({ a: 0 }, rng)).toBeNull();
  });
});

describe('settings', () => {
  it('falls back to defaults for invalid input', () => {
    const s = normalizeSettings({ tonic: 'H', timeSignature: '11/8', tempo: 9999, complexity: 0, genre: 'polka' });
    expect(s).toMatchObject({ tonic: 'C', timeSignature: '4/4', tempo: 260, complexity: 1, genre: 'pop' });
  });
});

describe('slots', () => {
  it.each(TIME_SIGNATURE_IDS)('fills every measure of %s exactly, splitting on beat groups', (ts) => {
    for (const hr of ['auto', '1', '2']) {
      const slots = buildSlots({ timeSignature: ts, measures: 8, harmonicRhythm: hr, complexity: 5, genre: 'jazz' }, createRng(3));
      const epm = eighthsPerMeasure(ts);
      for (let m = 0; m < 8; m++) {
        const inBar = slots.filter((s) => s.measure === m);
        expect(inBar.reduce((a, s) => a + s.duration, 0)).toBe(epm);
        for (const s of inBar) expect(groupStarts(ts)).toContain(s.start);
        if (hr === '1') expect(inBar).toHaveLength(1);
        if (hr === '2') expect(inBar).toHaveLength(2);
      }
    }
  });
});

describe('generateProgression', () => {
  it('is reproducible with a seed', () => {
    const a = generateProgression({ genre: 'jazz', complexity: 4 }, { seed: 7 });
    const b = generateProgression({ genre: 'jazz', complexity: 4 }, { seed: 7 });
    expect(a.slots).toEqual(b.slots);
  });

  it('produces valid chords for every genre, mood, mode and meter', () => {
    for (const genre of GENRE_IDS) {
      for (const mode of ['major', 'minor']) {
        for (const ts of TIME_SIGNATURE_IDS) {
          const mood = MOOD_IDS[(genre.length + ts.length) % MOOD_IDS.length];
          const p = generateProgression({ genre, mode, timeSignature: ts, mood, complexity: 3, tonic: 'E♭', measures: 8 }, { seed: genre.length * 31 + ts.length });
          const key = makeKey(p.settings.tonic, p.settings.mode);
          expect(new Set(p.slots.map((s) => s.measure)).size).toBe(8);
          for (const { chord } of p.slots) {
            expect(QUALITIES[chord.quality]).toBeDefined();
            expect(chord.inversion).toBeLessThanOrEqual(maxInversion(chord.quality));
            const d = describeChord(chord, key);
            expect(d.symbol).toMatch(/^[A-G]/);
            expect(d.roman.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('never repeats the same chord back-to-back (outside the blues form)', () => {
    for (const genre of GENRE_IDS.filter((g) => g !== 'blues')) {
      for (const seed of seeds) {
        const p = generateProgression({ genre, complexity: 3, measures: 8, mode: seed % 2 ? 'major' : 'minor' }, { seed });
        for (let i = 1; i < p.slots.length; i++) {
          const a = p.slots[i - 1].chord;
          const b = p.slots[i].chord;
          expect(`${a.root}:${a.quality}:${a.inversion}`).not.toBe(`${b.root}:${b.quality}:${b.inversion}`);
        }
      }
    }
  });

  it('keeps complexity 1 diatonic, root-position triads (pop/classical/folk)', () => {
    for (const genre of ['pop', 'classical', 'folk']) {
      for (const mode of ['major', 'minor']) {
        for (const seed of seeds) {
          const p = generateProgression({ genre, mode, complexity: 1, measures: 8 }, { seed });
          for (const { chord } of p.slots) {
            expect(['diatonic', 'harmonic']).toContain(chord.func);
            expect(['maj', 'min', 'dim']).toContain(chord.quality);
            expect(chord.inversion).toBe(0);
          }
        }
      }
    }
  });

  it('starts on the tonic for Markov-generated classical progressions and ends with a cadence', () => {
    let tonicStarts = 0;
    let cadences = 0;
    for (const seed of seeds) {
      const p = generateProgression({ genre: 'classical', complexity: 2, measures: 8 }, { seed });
      const first = p.slots[0].chord;
      const last = p.slots[p.slots.length - 1].chord;
      if (first.root === 0) tonicStarts++;
      if (last.root === 0 || last.root === 7) cadences++;
    }
    expect(tonicStarts).toBeGreaterThanOrEqual(seeds.length * 0.75);
    expect(cadences).toBeGreaterThanOrEqual(seeds.length * 0.75);
  });

  it('uses seventh chords throughout jazz and dominant 7ths in blues', () => {
    for (const seed of seeds) {
      const jazz = generateProgression({ genre: 'jazz', complexity: 3 }, { seed });
      const sevenths = jazz.slots.filter((s) => QUALITIES[s.chord.quality].seventh).length;
      expect(sevenths / jazz.slots.length).toBeGreaterThan(0.6);

      const blues = generateProgression({ genre: 'blues', complexity: 2, measures: 12, harmonicRhythm: '1' }, { seed });
      expect(blues.slots).toHaveLength(12);
      expect(blues.slots[0].chord.root).toBe(0);
      expect(blues.slots[4].chord.root).toBe(5); // bar 5: IV
      expect(blues.slots[8].chord.root).toBe(7); // bar 9: V
      for (const s of blues.slots) expect(['dom7', 'dom9']).toContain(s.chord.quality);
    }
  });

  it('introduces borrowed chords, secondary dominants and extensions at high complexity', () => {
    const funcs = new Set();
    const qualities = new Set();
    let inversions = 0;
    for (const genre of ['jazz', 'rnb', 'cinematic', 'classical', 'lofi']) {
      for (const seed of seeds) {
        const p = generateProgression({ genre, complexity: 5, measures: 16 }, { seed });
        for (const { chord } of p.slots) {
          funcs.add(chord.func);
          qualities.add(chord.quality);
          if (chord.inversion) inversions++;
        }
      }
    }
    expect(funcs).toContain('borrowed');
    expect(funcs).toContain('secondary');
    expect(funcs).toContain('tritone');
    for (const q of ['maj7', 'min7', 'dom7', 'add9', 'maj9', 'sus4']) expect(qualities).toContain(q);
    expect(inversions).toBeGreaterThan(0);
  });

  it('secondary dominants resolve to their target', () => {
    for (const seed of seeds) {
      const p = generateProgression({ genre: 'classical', complexity: 5, measures: 16 }, { seed });
      p.slots.forEach(({ chord }, i) => {
        if (chord.func !== 'secondary') return;
        const next = p.slots[i + 1]?.chord;
        expect(next).toBeDefined();
        expect((chord.root + 5) % 12).toBe(next.root);
      });
    }
  });

  it('keeps locked chords when regenerating', () => {
    const p = generateProgression({ genre: 'pop', complexity: 3 }, { seed: 5 });
    const locked = updateChord(p, 2, { locked: true });
    for (const seed of seeds) {
      const q = generateProgression(locked.settings, { seed, previous: locked });
      expect(q.slots[2].chord).toEqual(locked.slots[2].chord);
      expect(q.slots.map((s) => s.start)).toEqual(locked.slots.map((s) => s.start));
    }
  });
});

describe('regenerateChord', () => {
  it('changes only the chosen chord', () => {
    const p = generateProgression({ genre: 'pop', complexity: 3 }, { seed: 11 });
    for (const seed of seeds) {
      const index = seed % p.slots.length;
      const q = regenerateChord(p, index, { seed });
      q.slots.forEach((slot, i) => {
        if (i === index) {
          const a = p.slots[i].chord;
          expect(`${slot.chord.root}:${slot.chord.quality}`).not.toBe(`${a.root}:${a.quality}`);
        } else {
          expect(slot).toBe(p.slots[i]);
        }
      });
    }
  });
});

describe('editing helpers', () => {
  it('clamps inversions when the quality changes', () => {
    const p = generateProgression({ complexity: 1 }, { seed: 2 });
    const q = updateChord(updateChord(p, 0, { quality: 'maj7', inversion: 3 }), 0, { quality: 'maj' });
    expect(q.slots[0].chord.inversion).toBe(2);
  });

  it('offers quality options for the chord family', () => {
    expect(qualityOptions({ quality: 'min' })).toContain('min7');
    expect(qualityOptions({ quality: 'dom7' })).toContain('maj7');
    expect(qualityOptions({ quality: 'dim' })).toEqual(['dim', 'hdim7', 'dim7']);
  });

  it('chooses inversions that smooth the bass line', () => {
    // C → G → Am: G/B gives a stepwise bass C–B–A.
    const C = { root: 0, quality: 'maj', inversion: 0 };
    const G = { root: 7, quality: 'maj', inversion: 0 };
    const Am = { root: 9, quality: 'min', inversion: 0 };
    expect(bestInversion(G, C, Am)).toBe(1);
  });
});

describe('refitToTimeSignature', () => {
  it('keeps chords and re-splits bars on the new meter', async () => {
    const { refitToTimeSignature } = await import('../src/generator/progression.js');
    const p = generateProgression({ timeSignature: '4/4', measures: 4, harmonicRhythm: '2' }, { seed: 3 });
    for (const ts of TIME_SIGNATURE_IDS) {
      const q = refitToTimeSignature(p, ts);
      expect(q.settings.timeSignature).toBe(ts);
      expect(q.slots.map((s) => s.chord)).toEqual(p.slots.map((s) => s.chord));
      for (let m = 0; m < 4; m++) {
        const bar = q.slots.filter((s) => s.measure === m);
        expect(bar.reduce((a, s) => a + s.duration, 0)).toBe(eighthsPerMeasure(ts));
        expect(groupStarts(ts)).toContain(bar[1].start);
      }
    }
  });
});
