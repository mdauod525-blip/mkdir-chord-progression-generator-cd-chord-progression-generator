/**
 * Plucked-string synthesis (Karplus-Strong), adapted from ChordLab's guitar
 * model. Pure function → Float32Array, so it can be cached and unit tested.
 */
import { midiToFreq } from '../music/notes';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function noise(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

export function renderPluck(midi: number, sampleRate = 44100, seconds?: number): Float32Array {
  const f0 = midiToFreq(midi);
  const duration = seconds ?? clamp(3.2 - (midi - 40) * 0.04, 1.4, 3.2);
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  const period = sampleRate / f0;
  const delay = period - 0.5; // the two-point average adds half a sample
  const t60 = clamp(3.6 - (midi - 40) * 0.06, 1, 3.6);
  const rho = Math.pow(0.001, 1 / (f0 * t60));

  const rnd = noise(midi * 104729);
  const exLen = Math.max(2, Math.round(period));
  const ex = new Float32Array(exLen);
  let lp = 0;
  for (let i = 0; i < exLen; i++) {
    lp += 0.5 * (rnd() - lp);
    ex[i] = lp;
  }
  const pluck = Math.max(1, Math.round(exLen * 0.18));
  const read = (pos: number) => {
    if (pos < 0) return 0;
    const i = Math.floor(pos);
    const f = pos - i;
    return out[i] * (1 - f) + (i + 1 < n ? out[i + 1] : 0) * f;
  };
  for (let i = 0; i < n; i++) {
    const excite = i < exLen ? ex[i] - (i >= pluck ? ex[i - pluck] : 0) : 0;
    const fb = i >= delay ? 0.5 * (read(i - delay) + read(i - delay - 1)) : 0;
    out[i] = excite + rho * fb;
  }
  // DC blocker, fade-out and normalisation.
  let px = 0;
  let py = 0;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const x = out[i];
    py = x - px + 0.995 * py;
    px = x;
    out[i] = py;
    max = Math.max(max, Math.abs(py));
  }
  const fade = Math.min(n, Math.floor(0.15 * sampleRate));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  const g = max > 0 ? 0.5 / max : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/** Estimate the fundamental of a rendered note by autocorrelation (used in tests). */
export function estimatePitch(samples: Float32Array, sampleRate: number, minHz = 60, maxHz = 1200): number {
  const start = Math.floor(0.05 * sampleRate);
  const len = Math.min(samples.length - start, Math.floor(0.2 * sampleRate));
  let bestLag = 0;
  let best = -Infinity;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  const corr = (lag: number) => {
    let c = 0;
    for (let i = 0; i < len - lag; i++) c += samples[start + i] * samples[start + i + lag];
    return c;
  };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = corr(lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  // Parabolic interpolation around the peak.
  const a = corr(bestLag - 1);
  const b = best;
  const c = corr(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sampleRate / (bestLag + (Number.isFinite(shift) ? shift : 0));
}
