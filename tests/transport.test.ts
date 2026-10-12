import { describe, expect, it } from 'vitest';
import { Transport } from '../src/audio/transport';
import { DEMO_SONGS } from '../src/data/demos';
import { buildTimeline, collectEvents, type MusicEvent } from '../src/music/timeline';
import { TPQ, barTicks } from '../src/music/meter';

const demo = (id: string) => DEMO_SONGS.find((s) => s.id === `demo-${id}`)!;
const BAR = barTicks({ num: 4, den: 4 });

function rig(songId = 'first-light', opts = { metronome: true, strums: false }) {
  let now = 10;
  const scheduled: { ev: MusicEvent; time: number; countIn: boolean }[] = [];
  let cancelledAt: number | null = null;
  const tl = buildTimeline(demo(songId));
  const t = new Transport(
    {
      now: () => now,
      schedule: (ev, time, countIn) => scheduled.push({ ev, time, countIn }),
      cancel: (time) => {
        cancelledAt = time;
        // Drop events that have not started yet, like the audio engine does.
        for (let i = scheduled.length - 1; i >= 0; i--) if (scheduled[i].time >= time) scheduled.splice(i, 1);
      },
    },
    tl,
    opts,
  );
  t.startDelay = 0;
  /** Advance the fake clock in 25 ms timer ticks. */
  const run = (seconds: number, step = 0.025) => {
    const end = now + seconds;
    while (now < end - 1e-9) {
      now = Math.min(end, now + step);
      t.pump();
    }
  };
  return { t, tl, scheduled, run, get now() { return now; }, set now(v: number) { now = v; }, cancelled: () => cancelledAt };
}

describe('transport', () => {
  it('schedules beats at exact audio times (80 BPM → 0.75 s per beat)', () => {
    const r = rig();
    r.t.play(0);
    r.run(3.1);
    const times = r.scheduled.map((s) => s.time - 10);
    expect(times.slice(0, 5).map((x) => +x.toFixed(9))).toEqual([0, 0.75, 1.5, 2.25, 3]);
  });

  it('position follows the audio clock', () => {
    const r = rig();
    r.t.play(0);
    r.run(1.5);
    expect(r.t.positionAt(r.now).tick).toBeCloseTo(2 * TPQ, 6);
  });

  it('has no cumulative drift over a long song', () => {
    const r = rig();
    r.t.play(0);
    r.run(120, 0.031);
    const clicks = r.scheduled.filter((s) => s.ev.type === 'click');
    for (const c of clicks) expect(c.time - 10).toBeCloseTo((c.ev.tick / TPQ) * 0.75, 9);
    expect(clicks.length).toBeGreaterThan(100);
  });

  it('changes tempo without a jump in position', () => {
    const r = rig();
    r.t.play(0);
    r.run(1.5);
    const before = r.t.positionAt(r.now).tick;
    r.t.setTempo(160);
    const after = r.t.positionAt(r.now).tick;
    expect(after).toBeCloseTo(before, 6);
    r.run(3);
    // Every click is still on a beat and times strictly increase.
    const clicks = r.scheduled.map((s) => s);
    for (let i = 1; i < clicks.length; i++) expect(clicks[i].time).toBeGreaterThan(clicks[i - 1].time);
    for (const c of clicks) expect(c.ev.tick % TPQ).toBe(0);
    // After the change, beats are 0.375 s apart.
    const late = clicks.slice(-3).map((c) => c.time);
    expect(late[2] - late[1]).toBeCloseTo(0.375, 9);
    // The UI position agrees with when each recent click sounds (older anchors are pruned).
    for (const c of clicks.filter((x) => x.time > r.now - 0.9)) expect(r.t.positionAt(c.time).tick).toBeCloseTo(c.ev.tick, 4);
  });

  it('loops a section seamlessly', () => {
    const r = rig();
    const tl = r.tl;
    const chorus = tl.sections[2];
    r.t.setLoop({ start: chorus.start, end: chorus.end });
    r.t.play();
    const loopSeconds = ((chorus.end - chorus.start) / TPQ) * 0.75;
    r.run(loopSeconds * 2.5);
    const ticks = r.scheduled.map((s) => s.ev.tick);
    expect(Math.min(...ticks)).toBe(chorus.start);
    expect(Math.max(...ticks)).toBeLessThan(chorus.end);
    // The first beat of the second pass comes exactly one beat after the last beat of the first.
    const times = r.scheduled.map((s) => s.time);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(0.75, 9);
    expect(r.t.loopPasses).toBe(2);
  });

  it('speed trainer: raises the tempo at each loop wrap', () => {
    const r = rig();
    r.t.setLoop({ start: 0, end: BAR });
    r.t.onLoop = () => r.t.quarterBpm + 20;
    r.t.play();
    r.run(3 + 60 / 100 * 4 + 0.2);
    expect(r.t.quarterBpm).toBe(120);
    const firstBeat = r.scheduled.filter((s) => s.ev.tick === 0).map((s) => s.time);
    expect(firstBeat[1] - firstBeat[0]).toBeCloseTo(3, 9); // 4 beats at 80 BPM
    expect(firstBeat[2] - firstBeat[1]).toBeCloseTo(2.4, 9); // 4 beats at 100 BPM
  });

  it('pauses and resumes from the same musical position', () => {
    const r = rig();
    r.t.play(0);
    r.run(1.6);
    r.t.pause();
    const pausedAt = r.t.positionAt(r.now).tick;
    expect(pausedAt).toBeCloseTo((1.6 / 0.75) * TPQ, 3);
    expect(r.cancelled()).toBeCloseTo(r.now, 9);
    const count = r.scheduled.length;
    r.run(5); // time passes while paused
    expect(r.scheduled.length).toBe(count);
    expect(r.t.positionAt(r.now).tick).toBe(pausedAt);
    r.t.play();
    const resumeTime = r.now;
    r.run(1);
    const next = r.scheduled.slice(count);
    // Paused during beat 3; the next click (beat 4) comes after the rest of beat 3.
    expect(next[0].ev.tick).toBe(3 * TPQ);
    expect(next[0].time - resumeTime).toBeCloseTo(((3 * TPQ - pausedAt) / TPQ) * 0.75, 6);
  });

  it('counts in one bar before starting', () => {
    const r = rig('harbor-waltz');
    r.t.play(0, { countIn: true });
    r.run(0.1);
    expect(r.t.positionAt(r.now).countIn).toBe(true);
    r.run(3);
    const countIn = r.scheduled.filter((s) => s.countIn);
    expect(countIn).toHaveLength(3); // 3/4
    const firstSong = r.scheduled.find((s) => !s.countIn)!;
    // Song starts exactly one bar (3 beats at 108 BPM) after the count-in starts.
    expect(firstSong.time - countIn[0].time).toBeCloseTo((3 * 60) / 108, 9);
    expect(firstSong.ev.tick).toBe(0);
    expect(r.t.positionAt(firstSong.time + 0.01).countIn).toBe(false);
  });

  it('starts from a chosen beat', () => {
    const r = rig();
    r.t.play(5 * TPQ);
    r.run(0.01);
    expect(r.scheduled[0].ev.tick).toBe(5 * TPQ);
  });

  it('stays aligned after the tab was in the background (timer throttled)', () => {
    const r = rig();
    r.t.play(0);
    r.run(1);
    r.run(10, 1.0); // timer only fires once per second
    r.run(1);
    // Position still matches elapsed time exactly.
    expect(r.t.positionAt(r.now).tick).toBeCloseTo((12 / 0.75) * TPQ, 3);
    // Nothing was scheduled in the past (no burst of stale notes).
    // Every scheduled event time matches its tick.
    for (const s of r.scheduled) expect(s.time - 10).toBeCloseTo((s.ev.tick / TPQ) * 0.75, 9);
  });

  it('stops at the end of the song', () => {
    const r = rig('harbor-waltz');
    let ended = false;
    r.t.onEnded = () => (ended = true);
    r.t.play(r.tl.totalTicks - 3 * TPQ);
    r.run(3);
    expect(ended).toBe(true);
    expect(r.t.state).toBe('stopped');
  });

  it('schedules the same events as the timeline, chord changes included', () => {
    const r = rig('island-steps', { metronome: true, strums: true });
    r.t.play(0);
    r.run(((r.tl.totalTicks / TPQ) * 60) / 100 + 1);
    const expected = collectEvents(r.tl, 0, r.tl.totalTicks, { metronome: true, strums: true });
    expect(r.scheduled.map((s) => `${s.ev.type}${s.ev.tick}`)).toEqual(expected.map((e) => `${e.type}${e.tick}`));
  });

  it('keeps position when the timeline is swapped (transpose while playing)', () => {
    const r = rig('campfire-changes');
    r.t.play(0);
    r.run(2);
    const before = r.t.positionAt(r.now).tick;
    r.t.setTimeline(buildTimeline(demo('campfire-changes'), { transpose: 2 }));
    expect(r.t.positionAt(r.now).tick).toBeCloseTo(before, 0);
  });
});
