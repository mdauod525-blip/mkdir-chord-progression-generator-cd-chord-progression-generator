import { describe, it, expect } from 'vitest';
import {
  TIME_SIGNATURE_IDS,
  eighthsPerMeasure,
  beatsPerMeasure,
  groupStarts,
  secondsPerEighth,
  measureSeconds,
  halfMeasureSplit,
  accentLevels,
  beatGrid,
  groupingLabel,
  midiTimeSignatureBytes,
  getTimeSignature,
  quarterNotesPerMeasure,
} from '../src/theory/timeSignature.js';

describe('time signatures', () => {
  it('supports every required meter', () => {
    expect(TIME_SIGNATURE_IDS).toEqual(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8']);
  });

  it.each([
    ['2/4', 4, 2],
    ['3/4', 6, 3],
    ['4/4', 8, 4],
    ['5/4', 10, 5],
    ['6/8', 6, 2],
    ['7/8', 7, 3],
    ['9/8', 9, 3],
    ['12/8', 12, 4],
  ])('%s has %i eighths and %i felt beats', (id, eighths, beats) => {
    expect(eighthsPerMeasure(id)).toBe(eighths);
    expect(beatsPerMeasure(id)).toBe(beats);
    const groups = getTimeSignature(id).groups;
    expect(groups.reduce((a, b) => a + b, 0)).toBe(eighths);
  });

  it('groups compound meters in threes and 7/8 as 2+2+3', () => {
    expect(getTimeSignature('6/8').groups).toEqual([3, 3]);
    expect(getTimeSignature('12/8').groups).toEqual([3, 3, 3, 3]);
    expect(getTimeSignature('7/8').groups).toEqual([2, 2, 3]);
    expect(groupStarts('7/8')).toEqual([0, 2, 4]);
    expect(groupingLabel('7/8')).toBe('2+2+3');
    expect(groupingLabel('9/8')).toBe('3+3+3');
  });

  it.each([
    ['2/4', 1.0],
    ['3/4', 1.5],
    ['4/4', 2.0],
    ['5/4', 2.5],
    ['6/8', 1.0], // two dotted-quarter beats at 120
    ['7/8', 1.75], // seven eighths, eighth = 0.25s
    ['9/8', 1.5],
    ['12/8', 2.0],
  ])('%s lasts %fs per measure at 120 BPM', (id, seconds) => {
    expect(measureSeconds(id, 120)).toBeCloseTo(seconds, 10);
  });

  it('computes eighth-note durations from the tempo unit', () => {
    expect(secondsPerEighth('4/4', 60)).toBeCloseTo(0.5);
    expect(secondsPerEighth('6/8', 60)).toBeCloseTo(1 / 3);
    expect(() => secondsPerEighth('4/4', 0)).toThrow();
  });

  it('places mid-bar chord changes on beat-group boundaries', () => {
    expect(halfMeasureSplit('2/4')).toBe(2);
    expect(halfMeasureSplit('3/4')).toBe(4); // beat 3
    expect(halfMeasureSplit('4/4')).toBe(4); // beat 3
    expect(halfMeasureSplit('5/4')).toBe(6); // 3 + 2
    expect(halfMeasureSplit('6/8')).toBe(3);
    expect(halfMeasureSplit('7/8')).toBe(4); // after 2+2
    expect(halfMeasureSplit('9/8')).toBe(6);
    expect(halfMeasureSplit('12/8')).toBe(6);
    for (const id of TIME_SIGNATURE_IDS) expect(groupStarts(id)).toContain(halfMeasureSplit(id));
  });

  it('accents downbeats and secondary beats', () => {
    expect(accentLevels('4/4')).toEqual([2, 0, 1, 0]);
    expect(accentLevels('5/4')).toEqual([2, 0, 0, 1, 0]);
    expect(accentLevels('6/8')).toEqual([2, 0]);
    expect(accentLevels('12/8')).toEqual([2, 0, 1, 0]);
  });

  it('builds a beat grid with counting labels', () => {
    expect(beatGrid('4/4').map((g) => g.label).join(' ')).toBe('1 & 2 & 3 & 4 &');
    expect(beatGrid('6/8').map((g) => g.label).join(' ')).toBe('1 la li 2 la li');
    expect(beatGrid('7/8').map((g) => g.label).join(' ')).toBe('1 & 2 & 3 la li');
    expect(beatGrid('9/8').filter((g) => g.isBeat)).toHaveLength(3);
  });

  it('reports quarter notes per measure', () => {
    expect(quarterNotesPerMeasure('4/4')).toBe(4);
    expect(quarterNotesPerMeasure('6/8')).toBe(3);
    expect(quarterNotesPerMeasure('7/8')).toBe(3.5);
  });

  it('produces MIDI time-signature meta bytes', () => {
    expect(midiTimeSignatureBytes('4/4')).toEqual([4, 2, 24, 8]);
    expect(midiTimeSignatureBytes('6/8')).toEqual([6, 3, 36, 8]);
    expect(midiTimeSignatureBytes('7/8')).toEqual([7, 3, 24, 8]);
    expect(midiTimeSignatureBytes('12/8')).toEqual([12, 3, 36, 8]);
  });

  it('rejects unsupported meters', () => {
    expect(() => getTimeSignature('11/16')).toThrow();
  });
});
