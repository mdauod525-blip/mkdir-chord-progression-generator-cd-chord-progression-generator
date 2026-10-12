import { describe, expect, it } from 'vitest';
import {
  TPQ, NOTE, barTicks, beatsOfBar, meterKind, tempoUnitTicks, secondsPerTick, countLabel, describeDuration,
  parseMeter, validateMeter, COMMON_METERS, accentAt, toQuarterBpm,
} from '../src/music/meter';

describe('meters', () => {
  it('computes bar lengths in integer ticks for every supported meter', () => {
    const expected: Record<string, number> = {
      '2/4': 2 * TPQ, '3/4': 3 * TPQ, '4/4': 4 * TPQ, '5/4': 5 * TPQ,
      '6/8': 3 * TPQ, '7/8': 3.5 * TPQ, '9/8': 4.5 * TPQ, '12/8': 6 * TPQ,
    };
    for (const m of COMMON_METERS) {
      const len = barTicks(m);
      expect(Number.isInteger(len)).toBe(true);
      expect(len).toBe(expected[`${m.num}/${m.den}`]);
    }
  });

  it('distinguishes simple, compound and irregular meters', () => {
    expect(meterKind({ num: 4, den: 4 })).toBe('simple');
    expect(meterKind({ num: 3, den: 4 })).toBe('simple');
    expect(meterKind({ num: 6, den: 8 })).toBe('compound');
    expect(meterKind({ num: 9, den: 8 })).toBe('compound');
    expect(meterKind({ num: 12, den: 8 })).toBe('compound');
    expect(meterKind({ num: 7, den: 8 })).toBe('irregular');
    expect(meterKind({ num: 5, den: 8 })).toBe('irregular');
  });

  it('groups 6/8 as two dotted-quarter beats, not six beats', () => {
    const beats = beatsOfBar({ num: 6, den: 8 });
    expect(beats).toHaveLength(2);
    expect(beats.map((b) => b.length)).toEqual([NOTE.dottedQuarter, NOTE.dottedQuarter]);
    expect(beatsOfBar({ num: 12, den: 8 })).toHaveLength(4);
    expect(beatsOfBar({ num: 9, den: 8 })).toHaveLength(3);
  });

  it('groups 7/8 as 2+2+3 by default and honours custom groupings', () => {
    expect(beatsOfBar({ num: 7, den: 8 }).map((b) => b.length / NOTE.eighth)).toEqual([2, 2, 3]);
    expect(beatsOfBar({ num: 7, den: 8, grouping: [3, 2, 2] }).map((b) => b.start / NOTE.eighth)).toEqual([0, 3, 5]);
    expect(validateMeter({ num: 7, den: 8, grouping: [3, 3] })).toMatch(/add up to 7/);
  });

  it('5/4 has five quarter beats', () => {
    expect(beatsOfBar({ num: 5, den: 4 })).toHaveLength(5);
  });

  it('uses the felt beat as the tempo unit', () => {
    expect(tempoUnitTicks({ num: 4, den: 4 })).toBe(NOTE.quarter);
    expect(tempoUnitTicks({ num: 6, den: 8 })).toBe(NOTE.dottedQuarter);
    expect(tempoUnitTicks({ num: 7, den: 8 })).toBe(NOTE.eighth);
    expect(tempoUnitTicks({ num: 2, den: 2 })).toBe(NOTE.half);
  });

  it('converts tempo to seconds correctly', () => {
    // 120 BPM in 4/4: a quarter note lasts 0.5 s.
    expect(secondsPerTick(120, { num: 4, den: 4 }) * TPQ).toBeCloseTo(0.5, 10);
    // 60 BPM in 6/8: a dotted quarter lasts 1 s, so an eighth lasts 1/3 s.
    expect(secondsPerTick(60, { num: 6, den: 8 }) * NOTE.eighth).toBeCloseTo(1 / 3, 10);
    expect(toQuarterBpm(60, { num: 6, den: 8 })).toBe(90);
    expect(toQuarterBpm(200, { num: 7, den: 8 })).toBe(100);
  });

  it('labels counts for different grids', () => {
    const m44 = { num: 4, den: 4 };
    const eighths = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => countLabel(m44, i * NOTE.eighth, NOTE.eighth));
    expect(eighths).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    const sixteenths = [0, 1, 2, 3].map((i) => countLabel(m44, i * NOTE.sixteenth, NOTE.sixteenth));
    expect(sixteenths).toEqual(['1', 'e', '&', 'a']);
    const trip = [0, 1, 2].map((i) => countLabel(m44, i * NOTE.tripletEighth, NOTE.tripletEighth));
    expect(trip).toEqual(['1', 'trip', 'let']);
    const m68 = { num: 6, den: 8 };
    expect([0, 1, 2, 3, 4, 5].map((i) => countLabel(m68, i * NOTE.eighth, NOTE.eighth))).toEqual(['1', '&', 'a', '2', '&', 'a']);
  });

  it('accents the downbeat and beats', () => {
    const m68 = { num: 6, den: 8 };
    expect(accentAt(m68, 0)).toBe(2);
    expect(accentAt(m68, NOTE.dottedQuarter)).toBe(1);
    expect(accentAt(m68, NOTE.eighth)).toBe(0);
  });

  it('parses and describes', () => {
    expect(parseMeter('6/8')).toEqual({ num: 6, den: 8 });
    expect(parseMeter('7/8 (3+2+2)')).toEqual({ num: 7, den: 8, grouping: [3, 2, 2] });
    expect(parseMeter('4/3')).toBeNull();
    expect(describeDuration(barTicks({ num: 4, den: 4 }) * 2, { num: 4, den: 4 })).toBe('2 bars');
    expect(describeDuration(TPQ * 2, { num: 4, den: 4 })).toBe('2 beats');
    expect(describeDuration(TPQ * 1.5, { num: 4, den: 4 })).toBe('1½ beats');
    expect(describeDuration(TPQ / 2, { num: 4, den: 4 })).toBe('½ beat');
  });
});
