/**
 * Look-ahead transport.
 *
 * Audio events are scheduled on the AudioContext clock a little ahead of time
 * (the "two clocks" pattern): a timer wakes up every ~25 ms and schedules every
 * event that falls inside the next look-ahead window at its exact audio time.
 * The timer may be late or throttled; the audio stays sample-accurate.
 *
 * Musical position is a piecewise-linear map from audio time to ticks, kept as
 * a list of anchors {time, tick, secondsPerTick}. A new anchor is added when
 * playback starts, the tempo changes or a loop wraps, always at the scheduling
 * frontier, so events already handed to the audio engine and the position the
 * UI draws come from the same map and cannot drift apart.
 *
 * This class is pure logic: the clock, the event sink and the timer are
 * injected, which lets the tests drive it with a fake clock.
 */
import { type Meter } from '../music/meter';
import { type EventOptions, type MusicEvent, type Timeline, collectEvents, countInEvents } from '../music/timeline';
import { barTicks, secondsPerTickFromQuarterBpm } from '../music/meter';

export interface Anchor {
  time: number;
  tick: number;
  spt: number;
}

export interface TransportDeps {
  /** Current audio clock time in seconds. */
  now(): number;
  /** Called for every musical event with its exact audio time. */
  schedule(ev: MusicEvent, time: number, countIn: boolean): void;
  /** Cancel everything scheduled at or after `time` (pause/stop/seek). */
  cancel(time: number): void;
}

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface LoopRegion {
  start: number;
  end: number;
}

export interface PlayOptions {
  /** Count in one bar before the first note (first pass only). */
  countIn?: boolean;
}

export interface Position {
  tick: number;
  /** True while the count-in bar is playing. */
  countIn: boolean;
  /** Beat number of the count-in (0-based) when countIn is true. */
  countInBeat: number;
}

export class Transport {
  state: TransportState = 'stopped';
  /** Lookahead window in seconds (enlarged while the page is hidden). */
  lookahead = 0.12;
  /** Small delay before the first event so the first click is not cut. */
  startDelay = 0.06;

  private tl: Timeline;
  private anchors: Anchor[] = [];
  private frontierTick = 0;
  private frontierTime = 0;
  private qbpm: number;
  private loop: LoopRegion | null = null;
  private endTime: number | null = null;
  private countInUntil = -Infinity;
  private countInMeter: Meter | null = null;
  private countInStartTick = 0;
  private pausedTick = 0;
  private eventOptions: EventOptions;

  /** Called when the loop wraps; may return a new quarter-note BPM (speed trainer). */
  onLoop: ((passes: number) => number | void) | null = null;
  onEnded: (() => void) | null = null;
  loopPasses = 0;

  constructor(
    private deps: TransportDeps,
    timeline: Timeline,
    eventOptions: EventOptions,
  ) {
    this.tl = timeline;
    this.qbpm = timeline.quarterBpm;
    this.eventOptions = eventOptions;
  }

  get quarterBpm(): number {
    return this.qbpm;
  }

  get timeline(): Timeline {
    return this.tl;
  }

  get loopRegion(): LoopRegion | null {
    return this.loop;
  }

  /** Swap the timeline (e.g. after transposing) keeping the current position. */
  setTimeline(tl: Timeline): void {
    const playing = this.state === 'playing';
    const pos = this.positionAt(this.deps.now()).tick;
    this.tl = tl;
    if (this.loop) this.loop = { start: Math.min(this.loop.start, tl.totalTicks), end: Math.min(this.loop.end, tl.totalTicks) };
    if (playing) this.restartAt(pos);
    else this.pausedTick = Math.min(this.pausedTick, Math.max(0, tl.totalTicks - 1));
  }

  setEventOptions(o: EventOptions): void {
    this.eventOptions = o;
    // Events already scheduled stay; new options apply from the frontier.
    if (this.state === 'playing') this.restartAt(this.positionAt(this.deps.now()).tick);
  }

  setLoop(region: LoopRegion | null): void {
    this.loop = region && region.end > region.start ? { ...region } : null;
    this.loopPasses = 0;
    if (this.state === 'playing' && this.loop) {
      const pos = this.positionAt(this.deps.now()).tick;
      if (pos < this.loop.start || pos >= this.loop.end) this.restartAt(this.loop.start);
      else if (this.frontierTick > this.loop.end) this.restartAt(pos);
    }
  }

  /** Change tempo (quarter-note BPM). Takes effect at the scheduling frontier. */
  setTempo(qbpm: number): void {
    this.qbpm = qbpm;
    if (this.state !== 'playing') return;
    const now = this.deps.now();
    const spt = secondsPerTickFromQuarterBpm(qbpm);
    // Count-in still running? Re-anchor at now to keep it simple and in time.
    if (now < this.countInUntil) {
      this.restartAt(this.countInStartTick, true);
      return;
    }
    this.anchors.push({ time: this.frontierTime, tick: this.frontierTick, spt });
    this.recomputeEnd();
  }

  play(fromTick?: number, opts: PlayOptions = {}): void {
    const start = fromTick ?? (this.state === 'paused' ? this.pausedTick : this.loop ? this.loop.start : 0);
    let tick = Math.max(0, Math.min(start, this.tl.totalTicks - 1));
    if (this.loop && (tick < this.loop.start || tick >= this.loop.end)) tick = this.loop.start;
    this.state = 'playing';
    this.loopPasses = 0;
    this.restartAt(tick, opts.countIn);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    const now = this.deps.now();
    const p = this.positionAt(now);
    this.pausedTick = p.countIn ? this.countInStartTick : p.tick;
    this.deps.cancel(now);
    this.state = 'paused';
    this.anchors = [];
    this.endTime = null;
  }

  stop(): void {
    this.deps.cancel(this.deps.now());
    this.state = 'stopped';
    this.anchors = [];
    this.pausedTick = this.loop ? this.loop.start : 0;
    this.endTime = null;
  }

  /** Jump to a tick. Keeps playing if playing. */
  seek(tick: number): void {
    const t = Math.max(0, Math.min(tick, this.tl.totalTicks - 1));
    if (this.state === 'playing') this.restartAt(t);
    else {
      this.pausedTick = t;
      if (this.state === 'stopped') this.state = 'paused';
    }
  }

  /** Position at an audio time (defaults to now). Works in every state. */
  positionAt(time: number = this.deps.now()): Position {
    if (this.state !== 'playing' || !this.anchors.length) {
      return { tick: this.pausedTick, countIn: false, countInBeat: 0 };
    }
    let a = this.anchors[0];
    for (const x of this.anchors) {
      if (x.time <= time) a = x;
      else break;
    }
    const raw = a.tick + (time - a.time) / a.spt;
    const countIn = time < this.countInUntil;
    if (countIn) {
      // During the count-in, the "virtual" ticks run up to the start tick.
      const meter = this.countInMeter!;
      const beat = countInEvents(meter, this.countInStartTick)
        .map((e) => e.tick)
        .filter((t) => t <= raw).length - 1;
      return { tick: this.countInStartTick, countIn: true, countInBeat: Math.max(0, beat) };
    }
    const max = this.loop ? this.loop.end : this.tl.totalTicks;
    return { tick: Math.max(0, Math.min(raw, max - 1e-6)), countIn: false, countInBeat: 0 };
  }

  /** Schedule everything up to now + lookahead. Call from a timer. */
  pump(): void {
    if (this.state !== 'playing') return;
    const now = this.deps.now();
    if (this.endTime !== null && now >= this.endTime) {
      this.state = 'stopped';
      this.anchors = [];
      this.pausedTick = 0;
      this.endTime = null;
      this.onEnded?.();
      return;
    }
    // Woke up late (background tab, busy main thread): skip what can no longer
    // be played instead of firing a burst of stale notes, but keep the timeline.
    if (this.frontierTime < now - 0.02) this.advance(now, false);
    this.advance(now + this.lookahead, true);
    this.pruneAnchors(now);
  }

  // -------------------------------------------------------------------------

  private restartAt(tick: number, countIn = false): void {
    const now = this.deps.now();
    this.deps.cancel(now);
    const spt = secondsPerTickFromQuarterBpm(this.qbpm);
    const startTime = now + this.startDelay;
    this.anchors = [];
    this.endTime = null;
    this.countInUntil = -Infinity;
    if (countIn) {
      const bar = this.tl.bars.find((b) => tick >= b.start && tick < b.start + b.length) ?? this.tl.bars[0];
      const meter = bar.meter;
      const clicks = countInEvents(meter, tick, this.eventOptions.accents);
      const barLen = barTicks(meter);
      for (const c of clicks) this.deps.schedule(c, startTime + (c.tick - (tick - barLen)) * spt, true);
      this.countInMeter = meter;
      this.countInStartTick = tick;
      this.countInUntil = startTime + barLen * spt;
      this.anchors.push({ time: startTime, tick: tick - barLen, spt });
      this.anchors.push({ time: this.countInUntil, tick, spt });
      this.frontierTick = tick;
      this.frontierTime = this.countInUntil;
    } else {
      this.anchors.push({ time: startTime, tick, spt });
      this.frontierTick = tick;
      this.frontierTime = startTime;
    }
    this.recomputeEnd();
    this.pump();
  }

  private current(): Anchor {
    return this.anchors[this.anchors.length - 1];
  }

  private timeOf(tick: number): number {
    const a = this.current();
    return a.time + (tick - a.tick) * a.spt;
  }

  private recomputeEnd(): void {
    if (this.loop || !this.anchors.length) {
      this.endTime = null;
      return;
    }
    this.endTime = this.timeOf(this.tl.totalTicks);
  }

  private advance(untilTime: number, emit: boolean): void {
    let guard = 0;
    while (this.frontierTime < untilTime && guard++ < 1000) {
      const a = this.current();
      const limit = this.loop ? this.loop.end : this.tl.totalTicks;
      const tickAt = a.tick + (untilTime - a.time) / a.spt;
      const end = Math.min(tickAt, limit);
      if (emit && end > this.frontierTick) {
        const from = Math.ceil(this.frontierTick);
        const to = Math.ceil(end);
        for (const ev of collectEvents(this.tl, from, to, this.eventOptions)) {
          this.deps.schedule(ev, this.timeOf(ev.tick), false);
        }
      }
      this.frontierTick = end;
      this.frontierTime = this.timeOf(end);
      if (end >= limit) {
        if (this.loop) {
          this.loopPasses++;
          const newBpm = this.onLoop?.(this.loopPasses);
          if (typeof newBpm === 'number' && newBpm > 0) this.qbpm = newBpm;
          const spt = secondsPerTickFromQuarterBpm(this.qbpm);
          this.anchors.push({ time: this.frontierTime, tick: this.loop.start, spt });
          this.frontierTick = this.loop.start;
        } else {
          this.frontierTime = Math.max(this.frontierTime, untilTime);
          break;
        }
      }
    }
  }

  private pruneAnchors(now: number): void {
    // Keep the anchor in effect 1 s ago (for latency-compensated UI reads) and everything after.
    const keepFrom = now - 1;
    let i = 0;
    while (i + 1 < this.anchors.length && this.anchors[i + 1].time <= keepFrom) i++;
    if (i > 0) this.anchors.splice(0, i);
  }
}
