/**
 * Practice player: one object that owns the timeline, the transport, the
 * practice settings and the audio wiring for a song. React components read
 * immutable snapshots via subscribe/getSnapshot (useSyncExternalStore).
 *
 * The visual playhead is derived from the same transport anchors the audio
 * scheduler uses, shifted by the device's output latency, so the highlighted
 * chord changes when you hear it change.
 */
import type { Song } from '../data/song';
import { audio } from '../audio/engine';
import { Transport, type LoopRegion } from '../audio/transport';
import { createTicker, type Ticker } from '../audio/ticker';
import { buildTimeline, locate, patternCellAt, type Location, type MusicEvent, type Timeline } from '../music/timeline';
import { toQuarterBpm } from '../music/meter';
import { shapesForChord } from '../music/guitar';
import type { SpellingPreference } from '../music/keys';

export interface TrainerSettings {
  enabled: boolean;
  /** BPM added each time… */
  step: number;
  /** …this many loop passes complete. */
  every: number;
  /** Stop increasing at this BPM. */
  target: number;
}

export interface PracticeSettings {
  /** Practice tempo in the song's tempo unit. */
  bpm: number;
  metronome: boolean;
  subdivisions: boolean;
  /** Per-beat accent levels for the metronome; null = default (downbeat accented). */
  accents: number[] | null;
  countIn: boolean;
  /** Generated practice guitar (strums the shapes on screen). */
  backing: boolean;
  clickVolume: number;
  guitarVolume: number;
  trainer: TrainerSettings;
}

export type PlayerStatus = 'stopped' | 'playing' | 'paused';

export interface Frame {
  tick: number;
  countIn: boolean;
  countInBeat: number;
  loc: Location;
  /** Strum-pattern cell currently sounding. */
  cell: { sectionIndex: number; cell: number } | null;
}

export interface LoopState {
  region: LoopRegion;
  label: string;
}

export interface PlayerSnapshot {
  status: PlayerStatus;
  settings: PracticeSettings;
  loop: LoopState | null;
  transpose: number;
  prefer: SpellingPreference;
  timeline: Timeline;
  frame: Frame;
  audioReady: boolean;
  /** Message for the user (e.g. audio unavailable). */
  notice: string | null;
}

export function defaultSettings(song: Song): PracticeSettings {
  return {
    bpm: song.bpm,
    metronome: true,
    subdivisions: false,
    accents: null,
    countIn: true,
    backing: true,
    clickVolume: 0.8,
    guitarVolume: 0.7,
    trainer: { enabled: false, step: 5, every: 2, target: song.bpm },
  };
}

export class Player {
  private listeners = new Set<() => void>();
  private snap: PlayerSnapshot;
  private transport: Transport;
  private ticker: Ticker | null = null;
  private raf = 0;
  private chordStrings: ((number | null)[] | null)[] = [];
  private lastFrameKey = '';
  private onVisibility = () => this.handleVisibility();

  constructor(
    private song: Song,
    init?: Partial<Pick<PlayerSnapshot, 'settings' | 'transpose' | 'prefer'>>,
  ) {
    const transpose = init?.transpose ?? 0;
    const prefer = init?.prefer ?? 'auto';
    const timeline = buildTimeline(song, { transpose, prefer });
    const settings = { ...defaultSettings(song), ...init?.settings };
    this.transport = new Transport(
      {
        now: () => audio.now(),
        schedule: (ev, time) => this.play(ev, time),
        cancel: (time) => audio.cancel(time),
      },
      timeline,
      this.eventOptions(settings),
    );
    this.transport.setTempo(toQuarterBpm(settings.bpm, song.meter));
    this.transport.onEnded = () => {
      this.stopAnimation();
      this.update({ status: 'stopped' });
      this.refreshFrame();
    };
    this.transport.onLoop = (passes) => this.trainerStep(passes);
    this.computeChordStrings(timeline);
    this.snap = {
      status: 'stopped',
      settings,
      loop: null,
      transpose,
      prefer,
      timeline,
      frame: this.frameAt(0, false, 0, timeline),
      audioReady: audio.ready,
      notice: null,
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  // --- external store -------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): PlayerSnapshot => this.snap;

  private update(patch: Partial<PlayerSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  // --- transport controls ---------------------------------------------------

  /** Must be called from a user gesture the first time (autoplay rules). */
  async start(fromTick?: number): Promise<void> {
    const ctx = await audio.unlock();
    if (!ctx) {
      this.update({ notice: 'Audio is not available in this browser. The chord highlighting still works with the visual metronome.' });
    }
    this.warm();
    const resuming = this.snap.status === 'paused' && fromTick === undefined;
    this.transport.play(fromTick, { countIn: this.snap.settings.countIn && !resuming });
    if (!this.ticker) this.ticker = createTicker(() => this.transport.pump());
    this.ticker.start();
    this.update({ status: 'playing', audioReady: audio.ready });
    this.startAnimation();
  }

  pause(): void {
    this.transport.pause();
    this.ticker?.stop();
    this.stopAnimation();
    this.update({ status: 'paused' });
    this.refreshFrame();
  }

  async toggle(): Promise<void> {
    if (this.snap.status === 'playing') this.pause();
    else await this.start();
  }

  stop(): void {
    this.transport.stop();
    this.ticker?.stop();
    this.stopAnimation();
    this.update({ status: 'stopped' });
    this.refreshFrame();
  }

  /** Jump to a tick (e.g. tapping a bar or beat). */
  seek(tick: number): void {
    this.transport.seek(tick);
    if (this.snap.status === 'stopped') this.update({ status: 'paused' });
    this.refreshFrame();
  }

  /** Restart the current loop region / section from its start. */
  restart(): void {
    const loop = this.snap.loop;
    const sec = this.snap.timeline.sections[this.snap.frame.loc.sectionIndex];
    const target = loop ? loop.region.start : sec ? sec.start : 0;
    if (this.snap.status === 'playing') void this.start(target);
    else this.seek(target);
  }

  setLoop(loop: LoopState | null): void {
    this.transport.setLoop(loop ? loop.region : null);
    this.update({ loop });
    if (loop && this.snap.status !== 'playing') this.seek(loop.region.start);
  }

  setTranspose(transpose: number, prefer: SpellingPreference = this.snap.prefer): void {
    const t = Math.max(-11, Math.min(11, transpose));
    const timeline = buildTimeline(this.song, { transpose: t, prefer });
    this.computeChordStrings(timeline);
    this.transport.setTimeline(timeline);
    this.update({ transpose: t, prefer, timeline });
    this.refreshFrame();
  }

  /** Replace the song (e.g. a different strum pattern for a section), keeping position and settings. */
  setSong(song: Song): void {
    this.song = song;
    this.setTranspose(this.snap.transpose, this.snap.prefer);
  }

  updateSettings(patch: Partial<PracticeSettings>): void {
    const settings = { ...this.snap.settings, ...patch };
    if (patch.bpm !== undefined) {
      settings.bpm = Math.max(20, Math.min(320, Math.round(patch.bpm)));
      this.transport.setTempo(toQuarterBpm(settings.bpm, this.song.meter));
    }
    if (patch.clickVolume !== undefined) audio.setClickVolume(patch.clickVolume);
    if (patch.guitarVolume !== undefined) audio.setGuitarVolume(patch.guitarVolume);
    const optsChanged = ['metronome', 'subdivisions', 'accents', 'backing'].some((k) => k in patch);
    if (optsChanged) this.transport.setEventOptions(this.eventOptions(settings));
    this.update({ settings });
  }

  destroy(): void {
    this.stop();
    this.ticker?.dispose();
    this.ticker = null;
    this.listeners.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Notes per string for a timeline chord (what the practice guitar strums). */
  chordNotes(index: number): (number | null)[] | null {
    return this.chordStrings[index] ?? null;
  }

  // --- internals ------------------------------------------------------------

  private eventOptions(s: PracticeSettings) {
    return { metronome: s.metronome, subdivisions: s.subdivisions, accents: s.accents ?? undefined, strums: s.backing };
  }

  private trainerStep(passes: number): number | void {
    const t = this.snap.settings.trainer;
    if (!t.enabled || passes % Math.max(1, t.every) !== 0) return;
    const bpm = this.snap.settings.bpm;
    if (bpm >= t.target) return;
    const next = Math.min(t.target, bpm + t.step);
    // Update the displayed tempo (the transport applies it at the loop point).
    queueMicrotask(() => this.update({ settings: { ...this.snap.settings, bpm: next } }));
    return toQuarterBpm(next, this.song.meter);
  }

  private computeChordStrings(tl: Timeline): void {
    const { tuning, capo, shapes } = this.song;
    this.chordStrings = tl.chords.map((c) => {
      if (c.noChord) return null;
      const shape = shapesForChord(c.symbol, tuning, shapes)[0];
      if (!shape) return null;
      return shape.frets.map((f, i) => (f === null ? null : tuning.notes[i] + f + capo));
    });
  }

  private warm(): void {
    const notes = new Set<number>();
    for (const s of this.chordStrings) if (s) for (const n of s) if (n !== null) notes.add(n);
    audio.warm(notes);
  }

  private play(ev: MusicEvent, time: number): void {
    if (ev.type === 'click') {
      audio.click(time, ev.accent);
      return;
    }
    const strings = ev.chordIndex >= 0 ? this.chordStrings[ev.chordIndex] : null;
    if (ev.stroke === 'x' || strings) audio.strum(time, { strings: strings ?? [], stroke: ev.stroke, accent: ev.accent });
  }

  private frameAt(tick: number, countIn: boolean, countInBeat: number, tl = this.snap.timeline): Frame {
    return { tick, countIn, countInBeat, loc: locate(tl, tick), cell: countIn ? null : patternCellAt(tl, tick) };
  }

  private refreshFrame(): void {
    const latency = audio.outputLatency();
    const p = this.transport.positionAt(audio.now() - latency);
    const frame = this.frameAt(p.tick, p.countIn, p.countInBeat);
    const key = `${frame.loc.barIndex}|${frame.loc.beatIndex}|${frame.loc.chordIndex}|${frame.cell?.cell}|${frame.countIn}|${frame.countInBeat}`;
    if (key !== this.lastFrameKey || this.snap.status !== 'playing') {
      this.lastFrameKey = key;
      this.update({ frame });
    }
  }

  private startAnimation(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    cancelAnimationFrame(this.raf);
    const loop = () => {
      // Extra scheduling pass on every frame (cheap; guards against a stalled timer).
      this.transport.pump();
      this.refreshFrame();
      if (this.snap.status === 'playing') this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopAnimation(): void {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
  }

  private handleVisibility(): void {
    const hidden = document.visibilityState === 'hidden';
    // Background tabs throttle timers to ~1 Hz: schedule further ahead so audio keeps going.
    this.transport.lookahead = hidden ? 1.5 : 0.12;
    if (!hidden) {
      if (audio.ctx && audio.ctx.state !== 'running' && this.snap.status === 'playing') void audio.ctx.resume();
      this.transport.pump();
      if (this.snap.status === 'playing') this.startAnimation();
    }
  }
}
