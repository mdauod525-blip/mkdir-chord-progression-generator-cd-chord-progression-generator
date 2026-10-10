/**
 * Instruments. Grand piano and acoustic guitar are physical models rendered
 * once per note and cached (see models.js); the others are built live from
 * oscillators. Nothing is downloaded, so the app works offline.
 */
import { midiToFreq } from '../theory/notes.js';
import { MODELS } from './models.js';

export const INSTRUMENTS = {
  piano: 'Grand piano',
  guitar: 'Acoustic guitar',
  keys: 'Electric piano',
  pad: 'Warm pad',
  organ: 'Organ',
};

export const DEFAULT_INSTRUMENT = 'piano';

/** Instruments that strum their chords by default. */
export const STRUMMED = new Set(['guitar']);

/* ------------------------------------------------------- modelled instruments */

const MODELLED = {
  piano: { gain: 0.5, release: 0.18, eq: [['highpass', 30, 0.7, 0], ['lowshelf', 180, 0, 2], ['peaking', 3000, 0.8, 1.5]] },
  guitar: { gain: 0.95, release: 0.1, eq: [['highpass', 75, 0.7, 0], ['peaking', 110, 1.2, 4], ['peaking', 220, 1.4, 3], ['peaking', 2800, 1, 2.5]] },
};

const renders = new Map(); // "inst:midi" → { samples, sampleRate }
const buffers = new WeakMap(); // AudioContext → Map("inst:midi" → AudioBuffer)

export const isModelled = (instrument) => instrument in MODELLED;

function render(instrument, midi) {
  const key = `${instrument}:${midi}`;
  let r = renders.get(key);
  if (!r) {
    r = MODELS[instrument](midi);
    renders.set(key, r);
  }
  return r;
}

function getBuffer(ctx, instrument, midi) {
  let map = buffers.get(ctx);
  if (!map) buffers.set(ctx, (map = new Map()));
  const key = `${instrument}:${midi}`;
  let buf = map.get(key);
  if (!buf) {
    const { samples, sampleRate } = render(instrument, midi);
    buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples, 0);
    map.set(key, buf);
  }
  return buf;
}

/**
 * Pre-render notes in the background (a few per tick) so playback starts
 * instantly. Resolves when all notes are cached.
 */
export function prepareNotes(instrument, notes) {
  if (!isModelled(instrument)) return Promise.resolve();
  const todo = [...new Set(notes)].filter((m) => m != null && !renders.has(`${instrument}:${m}`));
  return new Promise((resolve) => {
    const step = () => {
      const started = performance.now();
      while (todo.length && performance.now() - started < 24) render(instrument, todo.shift());
      if (todo.length) setTimeout(step, 0);
      else resolve();
    };
    step();
  });
}

const busses = new WeakMap(); // destination node → { instrument → input node }

function instrumentBus(ctx, destination, instrument) {
  let map = busses.get(destination);
  if (!map) busses.set(destination, (map = {}));
  if (map[instrument]) return map[instrument];
  let input = destination;
  for (const [type, freq, q, gain] of [...MODELLED[instrument].eq].reverse()) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    f.gain.value = gain;
    f.connect(input);
    input = f;
  }
  map[instrument] = input;
  return input;
}

function playModelled(ctx, destination, instrument, midi, time, duration, velocity = 1) {
  const spec = MODELLED[instrument];
  const buffer = getBuffer(ctx, instrument, midi);
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // Softer notes are darker as well as quieter.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1800 + 9000 * velocity * velocity;

  const env = ctx.createGain();
  const end = time + Math.max(duration, 0.05);
  env.gain.setValueAtTime(spec.gain * velocity, time);
  env.gain.setTargetAtTime(0.0001, end, spec.release / 4);

  src.connect(tone);
  tone.connect(env);
  env.connect(instrumentBus(ctx, destination, instrument));
  src.start(time);
  src.stop(Math.min(end + spec.release * 2, time + buffer.duration));
  src.onended = () => {
    try {
      env.disconnect();
    } catch {
      /* already gone */
    }
  };

  return {
    stop(at = ctx.currentTime) {
      env.gain.cancelScheduledValues(at);
      env.gain.setTargetAtTime(0.0001, at, 0.02);
      try {
        src.stop(at + 0.12);
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ------------------------------------------------------ oscillator instruments */

/**
 * Instrument recipes.
 *   partials: [waveform, frequency ratio, gain, detune cents]
 *   env: attack, decay, sustain level, release (seconds)
 */
const RECIPES = {
  keys: {
    partials: [['sine', 1, 0.7, 0], ['triangle', 2, 0.18, 3], ['sine', 4, 0.05, 0]],
    env: { attack: 0.005, decay: 1.4, sustain: 0.25, release: 0.35 },
    filter: 4200,
    gain: 0.22,
  },
  pad: {
    partials: [['sawtooth', 1, 0.35, -8], ['sawtooth', 1, 0.35, 8], ['triangle', 0.5, 0.2, 0]],
    env: { attack: 0.35, decay: 0.6, sustain: 0.8, release: 0.9 },
    filter: 1600,
    gain: 0.13,
  },
  organ: {
    partials: [['sine', 1, 0.5, 0], ['sine', 2, 0.3, 0], ['sine', 3, 0.15, 0], ['sine', 4, 0.1, 0]],
    env: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.12 },
    filter: 5000,
    gain: 0.12,
  },
};

const BASS = {
  partials: [['triangle', 1, 0.8, 0], ['sine', 0.5, 0.35, 0]],
  env: { attack: 0.01, decay: 0.5, sustain: 0.55, release: 0.25 },
  filter: 700,
  gain: 0.32,
};

/**
 * Schedule one note. Returns a handle with stop(time) so the transport can cut
 * voices off immediately when playback stops.
 */
function playVoice(ctx, destination, recipe, midi, time, duration, velocity = 1) {
  const freq = midiToFreq(midi);
  const { attack, decay, sustain, release } = recipe.env;
  const peak = recipe.gain * velocity;
  const end = time + Math.max(duration, attack + 0.02);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(recipe.filter + freq * 2, 12000);
  filter.Q.value = 0.6;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(peak, time + attack);
  env.gain.setTargetAtTime(peak * sustain, time + attack, decay / 3);
  env.gain.setTargetAtTime(0.0001, end, release / 4);

  filter.connect(env);
  env.connect(destination);

  const oscs = recipe.partials.map(([type, ratio, g, detune]) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    osc.detune.value = detune;
    const pg = ctx.createGain();
    pg.gain.value = g;
    osc.connect(pg);
    pg.connect(filter);
    osc.start(time);
    osc.stop(end + release * 1.5 + 0.05);
    return osc;
  });

  oscs[0].onended = () => {
    try {
      env.disconnect();
    } catch {
      /* already gone */
    }
  };

  return {
    stop(at = ctx.currentTime) {
      env.gain.cancelScheduledValues(at);
      env.gain.setTargetAtTime(0.0001, at, 0.02);
      oscs.forEach((o) => {
        try {
          o.stop(at + 0.12);
        } catch {
          /* already stopped */
        }
      });
    },
  };
}

/**
 * Play a voiced chord ({ bass, upper }) at `time` for `duration` seconds.
 * `strum` spreads the upper notes (seconds between notes) for guitar-like attacks.
 */
export function playChord(
  ctx,
  destination,
  voicing,
  { time, duration, instrument = DEFAULT_INSTRUMENT, velocity = 1, strum = 0, bass = true, notes = null, direction = 'down' },
) {
  const handles = [];
  let upper = notes || voicing.upper;
  if (direction === 'up') upper = [...upper].reverse();
  let offset = 0;
  if (bass && voicing.bass != null) {
    handles.push(playBass(ctx, destination, voicing.bass, { time, duration, velocity, instrument }));
    offset = strum;
  }
  upper.forEach((note, i) => {
    const t = time + offset + i * strum;
    handles.push(playNote(ctx, destination, note, { time: t, duration: duration - (t - time), instrument, velocity: velocity * 0.9 }));
  });
  return handles;
}

/** Play a single note with the chosen instrument (used for arpeggios). */
export function playNote(ctx, destination, midi, { time, duration, instrument = DEFAULT_INSTRUMENT, velocity = 1 }) {
  if (isModelled(instrument)) return playModelled(ctx, destination, instrument, midi, time, duration, velocity);
  return playVoice(ctx, destination, RECIPES[instrument] || RECIPES.keys, midi, time, duration, velocity);
}

/** Play a bass note: modelled instruments play their own low notes, others use the synth bass. */
export function playBass(ctx, destination, midi, { time, duration, velocity = 1, instrument = DEFAULT_INSTRUMENT }) {
  if (isModelled(instrument)) return playModelled(ctx, destination, instrument, midi, time, duration, velocity * 0.95);
  return playVoice(ctx, destination, BASS, midi, time, duration, velocity);
}

/**
 * Metronome click. accent: 2 = downbeat, 1 = secondary beat, 0 = beat, -1 = subdivision.
 */
export function playClick(ctx, destination, time, accent = 0, volume = 1) {
  const freq = accent >= 2 ? 1760 : accent === 1 ? 1320 : accent === 0 ? 1100 : 880;
  const level = (accent >= 2 ? 0.55 : accent >= 0 ? 0.35 : 0.16) * volume;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 2;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(level, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(filter);
  filter.connect(env);
  env.connect(destination);
  osc.start(time);
  osc.stop(time + 0.06);
}
