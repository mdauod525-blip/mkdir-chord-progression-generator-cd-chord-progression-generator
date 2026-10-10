/**
 * Shared Web Audio context and master bus.
 *
 * iOS Safari only starts audio after a user gesture, and (on iOS 17+) routes
 * Web Audio through the ringer unless the audio session is set to "playback".
 */

let ctx = null;
let master = null;

export function isAudioSupported() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

/** Lazily create the AudioContext and master chain (compressor → output). */
export function getAudio() {
  if (ctx) return { ctx, master };
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.2;

  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return { ctx, master };
}

/**
 * Call from a click/tap handler: resumes the context and asks iOS to play
 * even when the ring/silent switch is on.
 */
export async function unlockAudio() {
  const { ctx: c } = getAudio();
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      /* ignored – will retry on next gesture */
    }
  }
  // A one-sample silent buffer fully unlocks older iOS versions.
  const buffer = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  src.start(0);
  return c;
}

export function setMasterVolume(v) {
  const { ctx: c, master: m } = getAudio();
  m.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), c.currentTime, 0.02);
}
