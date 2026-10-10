/**
 * Playback transport: a look-ahead scheduler (Chris Wilson's "tale of two
 * clocks" pattern) that queues Web Audio events slightly ahead of time and
 * reports the playhead back to the UI with requestAnimationFrame.
 *
 * Tempo, metronome and loop changes take effect on the next eighth note.
 */
import { getAudio, unlockAudio } from './engine.js';
import { playChord, playClick, playNote, playBass } from './synth.js';
import { buildTimeline } from './timeline.js';
import { secondsPerEighth, getTimeSignature, beatGrid } from '../theory/timeSignature.js';

export const PLAY_STYLES = {
  sustain: 'Sustained',
  pulse: 'On the beat',
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
      instrument: 'keys',
      style: 'sustain',
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
    if (voicing) {
      const groups = getTimeSignature(ts).groups;
      if (o.style === 'pulse') {
        if (ev.isBeat) {
          const len = Math.min(groups[ev.group], ev.slotStart + ev.slotDuration - ev.index);
          const velocity = ev.accent >= 2 ? 1 : ev.accent === 1 ? 0.85 : 0.7;
          this.track(playChord(ctx, out, voicing, { time, duration: len * spe * 0.85, instrument: o.instrument, velocity, bass: ev.chordStart || ev.accent >= 1 }));
        }
      } else if (o.style === 'arpeggio') {
        const step = ev.index - ev.slotStart;
        if (ev.chordStart) this.track([playBass(ctx, out, voicing.bass, { time, duration: ev.slotDuration * spe })]);
        const notes = voicing.upper;
        const cycle = notes.concat(notes.slice(1, -1).reverse());
        const note = cycle[step % cycle.length];
        this.track([playNote(ctx, out, note, { time, duration: spe * 1.6, instrument: o.instrument, velocity: ev.isBeat ? 0.95 : 0.75 })]);
      } else if (ev.chordStart) {
        const strum = o.instrument === 'pluck' ? 0.018 : 0;
        this.track(playChord(ctx, out, voicing, { time, duration: ev.slotDuration * spe, instrument: o.instrument, strum }));
      }
    }

    this.visualQueue.push({ time, slotIndex: ev.slotIndex, measure: ev.measure, eighthInMeasure: ev.eighthInMeasure, isBeat: ev.isBeat });
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
    const strum = instrument === 'pluck' ? 0.02 : 0;
    playChord(ctx, master, voicing, { time: ctx.currentTime + 0.02, duration, instrument, strum });
  }
}
