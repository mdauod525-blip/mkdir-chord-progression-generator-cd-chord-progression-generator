import { describe, it, expect } from 'vitest';
import { renderPiano, renderGuitar } from '../src/audio/models.js';
import { arpeggioStep, strumAction, ARP_PATTERNS } from '../src/audio/patterns.js';
import { buildTimeline } from '../src/audio/timeline.js';
import { generateProgression } from '../src/generator/progression.js';
import { progressionToMidi, GM_PROGRAMS } from '../src/export/midi.js';
import { voiceProgression } from '../src/theory/voicing.js';
import { makeKey } from '../src/theory/scales.js';
import { midiToFreq } from '../src/theory/notes.js';

/** Estimate the fundamental with autocorrelation around the expected period. */
function estimatePitch(samples, sampleRate, expected) {
  const start = Math.floor(0.15 * sampleRate);
  const len = Math.min(4096, samples.length - start - 2000);
  const period = sampleRate / expected;
  const corr = (lag) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += samples[start + i] * samples[start + i + lag];
    return s;
  };
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(period * 0.9); lag <= Math.ceil(period * 1.1); lag++) {
    const c = corr(lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  // Parabolic interpolation for sub-sample accuracy.
  const a = corr(bestLag - 1);
  const b = best;
  const c = corr(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sampleRate / (bestLag + shift);
}

const cents = (f, ref) => 1200 * Math.log2(f / ref);
const rms = (s, from, to) => Math.sqrt(s.slice(from, to).reduce((a, x) => a + x * x, 0) / (to - from));

describe('instrument models', () => {
  for (const [name, render] of [['piano', renderPiano], ['guitar', renderGuitar]]) {
    it.each([40, 52, 60, 67, 76])(`${name} note %i is in tune, bounded and decays`, (midi) => {
      const { samples, sampleRate } = render(midi);
      expect(samples.length).toBeGreaterThan(sampleRate);
      let peak = 0;
      for (const x of samples) {
        expect(Number.isFinite(x)).toBe(true);
        peak = Math.max(peak, Math.abs(x));
      }
      expect(peak).toBeLessThanOrEqual(0.51);
      const f = estimatePitch(samples, sampleRate, midiToFreq(midi));
      expect(Math.abs(cents(f, midiToFreq(midi)))).toBeLessThan(12);
      const early = rms(samples, Math.floor(0.05 * sampleRate), Math.floor(0.25 * sampleRate));
      const late = rms(samples, samples.length - Math.floor(0.6 * sampleRate), samples.length - Math.floor(0.4 * sampleRate));
      expect(late).toBeLessThan(early * 0.5);
    });
  }

  it('renders deterministically', () => {
    expect(renderGuitar(55).samples).toEqual(renderGuitar(55).samples);
  });
});

describe('arpeggio patterns', () => {
  const v = { bass: 48, upper: [60, 64, 67] };
  const run = (pattern, n) => Array.from({ length: n }, (_, i) => arpeggioStep(v, i, pattern));

  it('plays up, down and up-and-down through bass and chord tones', () => {
    expect(run('up', 5).flat()).toEqual([48, 60, 64, 67, 48]);
    expect(run('down', 4).flat()).toEqual([67, 64, 60, 48]);
    expect(run('updown', 7).flat()).toEqual([48, 60, 64, 67, 64, 60, 48]);
  });

  it('fingerpicks with an alternating thumb and a pinch on the first step', () => {
    expect(run('fingerpick', 8)).toEqual([[48, 67], [64], [60], [67], [48], [64], [60], [67]]);
  });

  it('handles every pattern and tiny voicings', () => {
    for (const p of Object.keys(ARP_PATTERNS)) {
      expect(arpeggioStep({ bass: 40, upper: [] }, 3, p).length).toBeGreaterThan(0);
      for (let i = 0; i < 16; i++) arpeggioStep(v, i, p).forEach((n) => expect([48, 60, 64, 67]).toContain(n));
    }
  });
});

describe('strum pattern', () => {
  it('strums down on beats and up on the last eighth of each group', () => {
    expect([0, 1].map((p) => strumAction(p, 2))).toEqual(['down', 'up']);
    expect([0, 1, 2].map((p) => strumAction(p, 3))).toEqual(['down', null, 'up']);
  });

  it('follows the 7/8 grouping through the timeline', () => {
    const p = generateProgression({ timeSignature: '7/8', measures: 1, harmonicRhythm: '1' }, { seed: 1 });
    const t = buildTimeline(p);
    expect(t.events.map((e) => strumAction(e.posInGroup, e.groupSize))).toEqual(['down', 'up', 'down', 'up', 'down', null, 'up']);
  });
});

describe('MIDI program per sound', () => {
  it('writes the General MIDI program of the chosen instrument', () => {
    const p = generateProgression({ measures: 2 }, { seed: 2 });
    const voicings = voiceProgression(p.slots.map((s) => s.chord), makeKey(p.settings.tonic, p.settings.mode));
    for (const [inst, program] of Object.entries(GM_PROGRAMS)) {
      const bytes = Array.from(progressionToMidi(p, voicings, { instrument: inst }));
      const i = bytes.findIndex((b, j) => b === 0xc0 && j > 0 && bytes[j - 1] === 0x00);
      expect(bytes[i + 1]).toBe(program);
    }
  });
});
