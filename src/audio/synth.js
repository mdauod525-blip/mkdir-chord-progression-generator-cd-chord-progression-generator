/**
 * Lightweight synthesised instruments built from oscillators – no samples to
 * download, so the app works offline and loads instantly.
 */
import { midiToFreq } from '../theory/notes.js';

export const INSTRUMENTS = {
  keys: 'Electric piano',
  pad: 'Warm pad',
  pluck: 'Guitar pluck',
  organ: 'Organ',
};

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
  pluck: {
    partials: [['triangle', 1, 0.6, 0], ['square', 2, 0.06, 4], ['sine', 3, 0.08, 0]],
    env: { attack: 0.003, decay: 0.7, sustain: 0.05, release: 0.25 },
    filter: 3000,
    gain: 0.22,
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
export function playChord(ctx, destination, voicing, { time, duration, instrument = 'keys', velocity = 1, strum = 0, bass = true }) {
  const recipe = RECIPES[instrument] || RECIPES.keys;
  const handles = [];
  if (bass && voicing.bass != null) handles.push(playVoice(ctx, destination, BASS, voicing.bass, time, duration, velocity));
  voicing.upper.forEach((note, i) => {
    const t = time + i * strum;
    handles.push(playVoice(ctx, destination, recipe, note, t, duration - i * strum, velocity * 0.9));
  });
  return handles;
}

/** Play a single note with the chosen instrument (used for arpeggios). */
export function playNote(ctx, destination, midi, { time, duration, instrument = 'keys', velocity = 1 }) {
  return playVoice(ctx, destination, RECIPES[instrument] || RECIPES.keys, midi, time, duration, velocity);
}

/** Play a bass note on its own. */
export function playBass(ctx, destination, midi, { time, duration, velocity = 1 }) {
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
