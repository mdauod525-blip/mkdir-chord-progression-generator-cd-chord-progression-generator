import { describe, expect, it } from 'vitest';
import { renderPluck, estimatePitch } from '../src/audio/guitarSynth';
import { midiToFreq } from '../src/music/notes';

describe('plucked-string synth', () => {
  it('renders in tune (within 15 cents) across the guitar range', () => {
    for (const midi of [40, 45, 52, 59, 64, 69, 76]) {
      const sr = 44100;
      const f = estimatePitch(renderPluck(midi, sr, 0.6), sr);
      const cents = 1200 * Math.log2(f / midiToFreq(midi));
      expect(Math.abs(cents), `midi ${midi}: ${f.toFixed(2)} Hz`).toBeLessThan(15);
    }
  });

  it('stays below clipping and decays', () => {
    const s = renderPluck(52, 22050, 1.5);
    let max = 0;
    for (const x of s) max = Math.max(max, Math.abs(x));
    expect(max).toBeLessThanOrEqual(0.5 + 1e-6);
    const tail = s.slice(s.length - 2000).reduce((a, x) => Math.max(a, Math.abs(x)), 0);
    expect(tail).toBeLessThan(0.05);
  });
});
