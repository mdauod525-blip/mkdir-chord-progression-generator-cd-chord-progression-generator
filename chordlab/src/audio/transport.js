/**
 * Playback transport: a look-ahead scheduler (Chris Wilson's "tale of two
 * clocks" pattern) that queues Web Audio events slightly ahead of time and
 * reports the playhead back to the UI with requestAnimationFrame.
 *
 * Tempo, metronome and loop changes take effect on the next eighth note.
 */
import { getAudio, unlockAudio } from './engine.js';
import { playChord, playClick, playNote, DEFAULT_INSTRUMENT, STRUMMED } from './synth.js';
import { arpeggioStep, strumAction } from './patterns.js';
import { buildTimeline } from './timeline.js';
import { secondsPerEighth, getTimeSignature, beatGrid } from '../theory/timeSignature.js';

export const PLAY_STYLES = {
  sustain: 'Sustain',
  pulse: 'Beat',
  strum: 'Strum',
  arpeggio: 'Arpeggio',
};

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead
const TICK_MS = 25;

export class Transport {
  constructor({ onPosition = () => {}, onStateChange = () => {} } = {}) {
    this.onPosition = onPosition;
    this.onStateChange = onStateChange;
    this.playing = false;
    this.options = {
      tempo: 100,
      loop: true,
      metronome: false,
      subdivisions: false,
      countIn: false,
      instrument: DEFAULT_INSTRUMENT,
      style: 'sustain',
      arpPattern: 'up',
      arpSpeed: '8',
      volume: 1,
    };
    this.handles = [];
    this.visualQueue = [];
  }

  /** Update playback options (tempo, loop, metronome, instrument, …) live. */
  setOptions(opts) {
    Object.assign(this.options, opts);
  }

  /** Swap in an edited progression/voicings while playing. */
  setProgression(progression, voicings) {
    this.progression = progression;
    this.voicings = voicings;
    this.timeline = buildTimeline(progression);
    if (this.eighth >= this.timeline.total) this.eighth = 0;
  }

  async play(progression, voicings, opts = {}) {
    await unlockAudio();
    this.stop(false);
    const { ctx, master } = getAudio();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.options.volume;
    this.out.connect(master);
    this.setOptions(opts);
    this.setProgression(progression, voicings);

    const ts = progression.settings.timeSignature;
    this.eighth = this.options.countIn ? -getTimeSignature(ts).groups.reduce((a, b) => a + b, 0) : 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.playing = true;
    this.finishing = false;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
    this.raf = requestAnimationFrame(() => this.drawLoop());
    this.onStateChange(true);
  }

  stop(notify = true) {
    if (this.timer) clearInterval(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
    const now = this.ctx?.currentTime ?? 0;
    this.handles.forEach((h) => h.stop(now));
    this.handles = [];
    this.visualQueue = [];
    if (this.out) {
      const out = this.out;
      setTimeout(() => out.disconnect(), 300);
      this.out = null;
    }
    const wasPlaying = this.playing;
    this.playing = false;
    if (notify && wasPlaying) {
      this.onPosition(null);
      this.onStateChange(false);
    }
  }

  schedule() {
    if (!this.playing || this.finishing) return;
    const ctx = this.ctx;
    // If the tab was suspended, skip ahead rather than playing a burst of notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const spe = secondsPerEighth(this.progression.settings.timeSignature, this.options.tempo);
      this.scheduleEighth(this.eighth, this.nextTime, spe);
      this.nextTime += spe;
      this.eighth++;
      if (this.eighth >= this.timeline.total) {
        if (this.options.loop) this.eighth = 0;
        else {
          this.finishing = true;
          this.endTime = this.nextTime;
          break;
        }
      }
    }
  }

  scheduleEighth(e, time, spe) {
    const { ctx, out, options: o } = this;
    const ts = this.progression.settings.timeSignature;

    if (e < 0) {
      // Count-in: clicks only.
      const epm = this.timeline.eighthsPerMeasure;
      const g = beatGrid(ts)[(e + epm) % epm];
      if (g.isBeat) playClick(ctx, out, time, g.accent, 1);
      this.visualQueue.push({ time, countIn: true, beat: g.group + 1 });
      return;
    }

    const ev = this.timeline.events[e];
    if (o.metronome && (ev.isBeat || o.subdivisions)) {
      playClick(ctx, out, time, ev.isBeat ? ev.accent : -1, 1);
    }

    const voicing = this.voicings[ev.slotIndex];
    if (voicing) this.scheduleChordPart(ev, voicing, time, spe);

    this.visualQueue.push({ time, slotIndex: ev.slotIndex, measure: ev.measure, eighthInMeasure: ev.eighthInMeasure, isBeat: ev.isBeat });
  }

  /** Schedule what the chord instrument plays on this eighth for the chosen style. */
  scheduleChordPart(ev, voicing, time, spe) {
    const { ctx, out, options: o } = this;
    const instrument = o.instrument;
    const slotEnd = ev.slotStart + ev.slotDuration;
    const remaining = (slotEnd - ev.index) * spe;
    const naturalStrum = STRUMMED.has(instrument) ? 0.016 : 0;

    if (o.style === 'pulse') {
      if (!ev.isBeat) return;
      const len = Math.min(ev.groupSize, slotEnd - ev.index);
      const velocity = ev.accent >= 2 ? 1 : ev.accent === 1 ? 0.85 : 0.7;
      this.track(playChord(ctx, out, voicing, { time, duration: len * spe * 0.85, instrument, velocity, strum: naturalStrum * 0.6, bass: ev.chordStart || ev.accent >= 1 }));
    } else if (o.style === 'strum') {
      const action = strumAction(ev.posInGroup, ev.groupSize);
      if (!action) return;
      if (action === 'down') {
        const ring = Math.min(Math.max(ev.groupSize - 1, 1), slotEnd - ev.index) * spe;
        const velocity = ev.accent >= 2 ? 0.95 : ev.accent === 1 ? 0.85 : 0.75;
        this.track(playChord(ctx, out, voicing, { time, duration: ring, instrument, velocity, strum: 0.013, bass: ev.chordStart || ev.accent >= 1 }));
      } else {
        // Up-strums hit only the top strings, lighter and in reverse order.
        const top = voicing.upper.slice(-3);
        this.track(playChord(ctx, out, voicing, { time, duration: Math.min(spe, remaining), instrument, velocity: 0.55, strum: 0.009, bass: false, notes: top, direction: 'up' }));
      }
    } else if (o.style === 'arpeggio') {
      const perEighth = o.arpSpeed === '16' ? 2 : 1;
      const sustained = instrument === 'piano' || instrument === 'guitar';
      for (let sub = 0; sub < perEighth; sub++) {
        const step = (ev.index - ev.slotStart) * perEighth + sub;
        const t = time + (sub * spe) / perEighth;
        // Piano and guitar let notes ring to the end of the chord, like a sustain pedal.
        const duration = sustained ? Math.max(remaining - (sub * spe) / perEighth, 0.2) : (spe / perEighth) * 1.8;
        const accent = step === 0 ? 1 : ev.isBeat && sub === 0 ? 0.85 : 0.7;
        for (const note of arpeggioStep(voicing, step, o.arpPattern)) {
          this.track([playNote(ctx, out, note, { time: t, duration, instrument, velocity: accent })]);
        }
      }
    } else if (ev.chordStart) {
      this.track(playChord(ctx, out, voicing, { time, duration: ev.slotDuration * spe, instrument, strum: naturalStrum }));
    }
  }

  track(handles) {
    this.handles.push(...handles);
    if (this.handles.length > 256) this.handles.splice(0, this.handles.length - 256);
  }

  drawLoop() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    let latest = null;
    while (this.visualQueue.length && this.visualQueue[0].time <= now) latest = this.visualQueue.shift();
    if (latest) this.onPosition(latest);
    if (this.finishing && now >= this.endTime) {
      this.stop();
      return;
    }
    this.raf = requestAnimationFrame(() => this.drawLoop());
  }

  /** Audition a single chord immediately (e.g. when a chord is tapped). */
  async preview(voicing, { instrument = this.options.instrument, duration = 1.2 } = {}) {
    await unlockAudio();
    const { ctx, master } = getAudio();
    const strum = STRUMMED.has(instrument) ? 0.02 : 0;
    playChord(ctx, master, voicing, { time: ctx.currentTime + 0.02, duration, instrument, strum });
  }
}
