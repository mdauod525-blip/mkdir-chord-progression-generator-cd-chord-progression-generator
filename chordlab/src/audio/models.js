/**
 * Physical-model instruments rendered to plain sample arrays (no DOM, no
 * samples to download), so they are fast to cache and easy to test.
 *
 *   renderPiano  – additive synthesis of a struck string: inharmonic partials,
 *                  two-stage decay (prompt + aftersound), detuned unison
 *                  strings that beat slightly, and a short hammer thump.
 *   renderGuitar – Karplus-Strong plucked string with fractional-delay tuning,
 *                  pluck-position comb filtering and pitch-dependent sustain.
 *
 * Both return { samples: Float32Array, sampleRate }.
 */
import { midiToFreq } from '../theory/notes.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CENT = Math.pow(2, 1 / 1200) - 1;

/** Deterministic noise so renders (and tests) are reproducible. */
function noise(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Fade-in/out edges and scale to a target peak. */
function finish(out, sampleRate, { fadeIn = 0.002, fadeOut = 0.12, peak = 0.5 } = {}) {
  const inN = Math.floor(fadeIn * sampleRate);
  const outN = Math.min(Math.floor(fadeOut * sampleRate), out.length);
  for (let i = 0; i < inN && i < out.length; i++) out[i] *= i / inN;
  for (let i = 0; i < outN; i++) out[out.length - 1 - i] *= i / outN;
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) {
    const g = peak / max;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

export function renderPiano(midi, { sampleRate = 24000 } = {}) {
  const f0 = midiToFreq(midi);
  const duration = clamp(4 - (midi - 36) * 0.05, 1.3, 4);
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);

  // String stiffness: higher notes are more inharmonic.
  const B = 0.00007 * Math.pow(2, (midi - 48) / 20);
  const maxFreq = Math.min(sampleRate * 0.45, 9000);
  // Low strings ring for many seconds, treble strings die quickly.
  const slow = clamp(10 * Math.pow(2, -(midi - 21) / 15), 0.7, 10);
  const fast = slow * 0.1;

  for (let k = 1; k <= 20; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > maxFreq) break;
    // Hammer spectrum: rolling off with partial number, notch near the strike point (~1/7 of the string).
    let amp = Math.pow(k, -1.15) * Math.exp(-(k - 1) * 0.12) * (0.35 + 0.65 * Math.abs(Math.sin((Math.PI * k) / 7)));
    if (fk > 4000) amp *= 4000 / fk;
    const scale = 1 + 0.3 * (k - 1);
    const d1 = Math.exp(-1 / ((sampleRate * fast) / scale));
    const d2 = Math.exp(-1 / ((sampleRate * slow) / scale));
    const detunes = k <= 3 ? [-0.6, 0.8] : [0];
    for (const cents of detunes) {
      const w = (2 * Math.PI * fk * (1 + cents * CENT)) / sampleRate;
      const c = Math.cos(w);
      const s = Math.sin(w);
      let x = 1;
      let y = 0;
      let e1 = (0.6 * amp) / detunes.length;
      let e2 = (0.4 * amp) / detunes.length;
      for (let i = 0; i < n; i++) {
        out[i] += y * (e1 + e2);
        const nx = x * c - y * s;
        y = x * s + y * c;
        x = nx;
        e1 *= d1;
        e2 *= d2;
        if (e1 + e2 < 1e-4 && (i & 255) === 0) break;
      }
    }
  }

  // Hammer thump: a few milliseconds of low-passed noise.
  const rnd = noise(midi * 7919);
  const thumpN = Math.floor(0.012 * sampleRate);
  let lp = 0;
  for (let i = 0; i < thumpN; i++) {
    lp += 0.25 * (rnd() - lp);
    out[i] += lp * 0.08 * Math.exp(-i / (0.003 * sampleRate));
  }
  return { samples: finish(out, sampleRate, { fadeOut: 0.25 }), sampleRate };
}

export function renderGuitar(midi, { sampleRate = 44100 } = {}) {
  const f0 = midiToFreq(midi);
  const duration = clamp(5 - (midi - 40) * 0.06, 1.6, 5);
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);

  const period = sampleRate / f0;
  // The two-point average in the loop adds half a sample of delay.
  const delay = period - 0.5;
  const t60 = clamp(4.5 - (midi - 40) * 0.07, 1.2, 4.5);
  const rho = Math.pow(0.001, 1 / (f0 * t60));

  // Excitation: one period of softened noise, comb-filtered for a pluck near the bridge.
  const rnd = noise(midi * 104729);
  const exLen = Math.max(2, Math.round(period));
  const ex = new Float32Array(exLen);
  let lp = 0;
  for (let i = 0; i < exLen; i++) {
    lp += 0.55 * (rnd() - lp);
    ex[i] = lp;
  }
  const pluck = Math.max(1, Math.round(exLen * 0.16));
  const read = (pos) => {
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

  // Gentle DC blocker.
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = out[i];
    py = x - px + 0.995 * py;
    px = x;
    out[i] = py;
  }
  return { samples: finish(out, sampleRate, { fadeOut: 0.2 }), sampleRate };
}

export const MODELS = { piano: renderPiano, guitar: renderGuitar };
