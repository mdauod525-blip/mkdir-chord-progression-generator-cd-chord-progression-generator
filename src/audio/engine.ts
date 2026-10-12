/**
 * Web Audio engine: metronome clicks and a generated practice guitar.
 *
 * The AudioContext is created lazily inside a user gesture (iOS/Chrome
 * autoplay rules). Everything is scheduled at explicit audio-clock times
 * handed over by the transport; nothing here uses JS timers for timing.
 *
 * The generated guitar is a practice backing built from the chord shapes on
 * screen — it is not, and does not imitate, any original recording.
 */
import { renderPluck } from './guitarSynth';

type AC = typeof AudioContext;

interface Voice {
  src: AudioScheduledSourceNode;
  gain: GainNode;
  start: number;
}

export interface StrumRequest {
  /** MIDI notes per string, low → high; null for muted strings. */
  strings: (number | null)[];
  stroke: 'D' | 'U' | 'x';
  accent: boolean;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private clickBus: GainNode | null = null;
  private guitarBus: GainNode | null = null;
  private voices: Voice[] = [];
  private stringVoices = new Map<number, Voice>();
  private buffers = new Map<number, AudioBuffer>();
  private noiseBuffer: AudioBuffer | null = null;
  clickVolume = 0.8;
  guitarVolume = 0.7;

  static supported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext);
  }

  /** Create/resume the context. Call from a tap/click handler. */
  async unlock(): Promise<AudioContext | null> {
    if (!AudioEngine.supported()) return null;
    if (!this.ctx) {
      const Ctor: AC = window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      this.clickBus = this.ctx.createGain();
      this.clickBus.gain.value = this.clickVolume;
      this.clickBus.connect(this.master);
      this.guitarBus = this.ctx.createGain();
      this.guitarBus.gain.value = this.guitarVolume;
      this.guitarBus.connect(this.master);
    }
    try {
      // iOS 17+: play through the silent switch like a media app.
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* unsupported */
    }
    this.startMediaChannel();
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* retry on next gesture */
      }
    }
    // A silent one-sample buffer fully unlocks older iOS versions.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
    return this.ctx;
  }

  private media: HTMLAudioElement | null = null;

  /**
   * Older iOS versions mute Web Audio when the ring/silent switch is off.
   * Playing a silent looping <audio> element (inside the tap) moves the page
   * into the "media playback" audio category, which ignores the switch.
   */
  private startMediaChannel(): void {
    if (typeof Audio === 'undefined' || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return;
    try {
      if (!this.media) {
        this.media = new Audio(silentWavDataUri());
        this.media.loop = true;
        this.media.setAttribute('playsinline', '');
        this.media.setAttribute('x-webkit-airplay', 'deny');
        this.media.preload = 'auto';
      }
      void this.media.play().catch(() => {});
    } catch {
      /* best effort */
    }
  }

  get ready(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Seconds between scheduling a sound and hearing it (for UI alignment). */
  outputLatency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!c) return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  setClickVolume(v: number): void {
    this.clickVolume = v;
    if (this.clickBus && this.ctx) this.clickBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setGuitarVolume(v: number): void {
    this.guitarVolume = v;
    if (this.guitarBus && this.ctx) this.guitarBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Pre-render the notes a song needs so the first strum does not stutter. */
  warm(midiNotes: Iterable<number>): void {
    if (!this.ctx) return;
    for (const m of midiNotes) this.buffer(m);
  }

  click(time: number, accent: 0 | 1 | 2): void {
    const ctx = this.ctx;
    if (!ctx || !this.clickBus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = accent === 2 ? 'square' : 'sine';
    osc.frequency.value = accent === 2 ? 1760 : accent === 1 ? 1320 : 990;
    const peak = accent === 2 ? 0.45 : accent === 1 ? 0.4 : 0.18;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (accent === 0 ? 0.03 : 0.06));
    osc.connect(g).connect(this.clickBus);
    osc.start(time);
    osc.stop(time + 0.08);
    this.track({ src: osc, gain: g, start: time });
  }

  strum(time: number, req: StrumRequest): void {
    const ctx = this.ctx;
    if (!ctx || !this.guitarBus) return;
    if (req.stroke === 'x') {
      this.chuck(time, req.accent);
      return;
    }
    const indices = req.strings.map((n, i) => (n === null ? -1 : i)).filter((i) => i >= 0);
    // Upstrokes mostly catch the higher strings.
    const played = req.stroke === 'U' ? indices.filter((i) => i >= Math.max(2, indices[0])) : indices;
    const order = req.stroke === 'D' ? played : [...played].reverse();
    const spread = req.accent ? 0.009 : 0.013;
    const vel = (req.accent ? 1 : 0.78) * (req.stroke === 'U' ? 0.75 : 1);
    order.forEach((stringIndex, k) => {
      const midi = req.strings[stringIndex]!;
      const t = time + k * spread;
      this.chokeString(stringIndex, t);
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(midi);
      const g = ctx.createGain();
      g.gain.value = vel * (0.9 - k * 0.03);
      src.connect(g).connect(this.guitarBus!);
      src.start(t);
      const v = { src, gain: g, start: t };
      this.stringVoices.set(stringIndex, v);
      this.track(v);
    });
  }

  /** Stop strings ringing (used for N.C. and chucks). */
  muteAll(time: number): void {
    for (const i of [...this.stringVoices.keys()]) this.chokeString(i, time);
  }

  /** Muted percussive strum: strings choked + a short noisy scratch. */
  private chuck(time: number, accent: boolean): void {
    const ctx = this.ctx!;
    this.muteAll(time);
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.06);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = accent ? 0.9 : 0.6;
    src.connect(bp).connect(g).connect(this.guitarBus!);
    src.start(time);
    this.track({ src, gain: g, start: time });
  }

  private chokeString(i: number, time: number): void {
    const prev = this.stringVoices.get(i);
    if (!prev) return;
    try {
      prev.gain.gain.setTargetAtTime(0, Math.max(time, prev.start), 0.012);
    } catch {
      /* node already gone */
    }
    this.stringVoices.delete(i);
  }

  /** Cancel everything that starts at/after `time`, fade out what is ringing. */
  cancel(time: number): void {
    const keep: Voice[] = [];
    for (const v of this.voices) {
      try {
        if (v.start >= time) v.src.stop();
        else {
          v.gain.gain.cancelScheduledValues(time);
          v.gain.gain.setTargetAtTime(0, time, 0.02);
          v.src.stop(time + 0.15);
        }
      } catch {
        /* already stopped */
      }
    }
    this.voices = keep;
    this.stringVoices.clear();
  }

  private track(v: Voice): void {
    this.voices.push(v);
    v.src.onended = () => {
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    };
  }

  private buffer(midi: number): AudioBuffer {
    let b = this.buffers.get(midi);
    if (!b) {
      const ctx = this.ctx!;
      const data = renderPluck(midi, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data);
      this.buffers.set(midi, b);
    }
    return b;
  }
}

/** One engine for the whole app (one AudioContext). */
export const audio = new AudioEngine();

/** A short silent mono WAV as a data URI (for the iOS media-channel unlock). */
function silentWavDataUri(): string {
  const rate = 8000;
  const n = rate / 2; // 0.5 s
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true); // 8-bit
  str(36, 'data');
  dv.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit silence
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
