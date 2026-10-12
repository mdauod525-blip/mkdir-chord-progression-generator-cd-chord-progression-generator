import { describe, expect, it } from 'vitest';
import { DEMO_SONGS } from '../src/data/demos';
import { buildTimeline, collectEvents, locate, patternCellAt, countInEvents, barsRegion, sectionRegion } from '../src/music/timeline';
import { parseChart, toChart } from '../src/data/chart';
import { NOTE, TPQ, barTicks } from '../src/music/meter';
import { patternStrokes, cellOffset, validatePattern, defaultPatternFor, cellLabels, naturalStroke, nextStroke } from '../src/music/strum';
import { BUILT_IN_PATTERNS } from '../src/data/patterns';
import type { Song } from '../src/data/song';

const demo = (id: string) => DEMO_SONGS.find((s) => s.id === `demo-${id}`)!;
const BAR = barTicks({ num: 4, den: 4 });

describe('bar charts', () => {
  const m44 = { num: 4, den: 4 };
  it('splits bars evenly and supports multiple chords per bar', () => {
    const r = parseChart('| G | D Em | C . . G |', m44);
    expect(r.errors).toEqual([]);
    expect(r.bars).toBe(3);
    expect(r.chords).toEqual([
      { chord: 'G', start: 0, duration: BAR },
      { chord: 'D', start: BAR, duration: BAR / 2 },
      { chord: 'Em', start: BAR * 1.5, duration: BAR / 2 },
      { chord: 'C', start: BAR * 2, duration: TPQ * 3 },
      { chord: 'G', start: BAR * 2 + TPQ * 3, duration: TPQ },
    ]);
  });

  it('holds chords across bars with %', () => {
    const r = parseChart('| Em | % | % | C |', m44);
    expect(r.chords[0]).toEqual({ chord: 'Em', start: 0, duration: BAR * 3 });
    expect(r.chords[1].start).toBe(BAR * 3);
  });

  it('supports explicit beat lengths for anticipations', () => {
    const r = parseChart('| C:3.5 G:0.5 | % |', m44);
    expect(r.chords).toEqual([
      { chord: 'C', start: 0, duration: TPQ * 3.5 },
      { chord: 'G', start: TPQ * 3.5, duration: TPQ * 4.5 },
    ]);
  });

  it('reports useful errors', () => {
    expect(parseChart('| G | Xyz |', m44).errors[0]).toMatch(/Bar 2: "Xyz"/);
    expect(parseChart('| G:3 D:3 |', m44).errors[0]).toMatch(/more than one bar/);
  });

  it('round-trips through toChart', () => {
    for (const text of ['| G | D Em | C . . G |', '| Em | % | % | C |', '| C:3.5 G:0.5 | % |']) {
      const r = parseChart(text, m44);
      expect(parseChart(toChart(r.chords, m44, r.bars), m44).chords).toEqual(r.chords);
    }
  });
});

describe('timeline', () => {
  it('flattens sections in form order with repeats', () => {
    const tl = buildTimeline(demo('first-light'));
    expect(tl.sections.map((s) => s.section.name)).toEqual(['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro']);
    expect(tl.sections[3].occurrence).toBe(2);
    expect(tl.bars).toHaveLength(4 + 8 + 8 + 8 + 8 + 2);
    expect(tl.totalTicks).toBe(38 * BAR);
    // Bars are contiguous.
    tl.bars.forEach((b, i) => i && expect(b.start).toBe(tl.bars[i - 1].start + tl.bars[i - 1].length));
  });

  it('handles pickups', () => {
    const tl = buildTimeline(demo('slow-tide'));
    expect(tl.bars[0]).toMatchObject({ isPickup: true, length: TPQ, phase: TPQ * 3, number: 0 });
    expect(tl.bars[1].start).toBe(TPQ);
    const loc = locate(tl, 0);
    expect(loc.beatIndex).toBe(3); // the pickup is beat 4
    expect(tl.chords[1]).toMatchObject({ symbol: 'Em', start: TPQ, end: TPQ + 4 * BAR }); // held 4 bars
  });

  it('locates chords, beats and the next chord', () => {
    const tl = buildTimeline(demo('island-steps'));
    const loc = locate(tl, TPQ * 2 + 10); // bar 1, beat 3 → G
    expect(tl.chords[loc.chordIndex].symbol).toBe('G');
    expect(loc.beatIndex).toBe(2);
    expect(tl.chords[loc.nextChordIndex].symbol).toBe('Am');
    expect(loc.ticksToNextChord).toBe(BAR - (TPQ * 2 + 10));
  });

  it('supports meter changes between sections', () => {
    const tl = buildTimeline(demo('odd-weather'));
    const verse = tl.sections[0];
    const bridge = tl.sections[1];
    expect(verse.end - verse.start).toBe(8 * NOTE.eighth * 7);
    expect(bridge.end - bridge.start).toBe(4 * TPQ * 5);
    expect(tl.bars[8].meter).toEqual({ num: 5, den: 4 });
  });

  it('transposes chord symbols and the key, keeping timing', () => {
    const song = demo('campfire-changes');
    const a = buildTimeline(song);
    const b = buildTimeline(song, { transpose: 3 });
    expect(b.chords.map((c) => [c.start, c.end])).toEqual(a.chords.map((c) => [c.start, c.end]));
    expect(b.chords.slice(8, 12).map((c) => c.symbol)).toEqual(['Bb', 'Ab', 'Eb', 'Bb']);
    expect(b.key && b.key.tonic).toMatchObject({ letter: 6, acc: -1 });
  });
});

describe('events', () => {
  const opts = { metronome: true, strums: true };
  it('clicks every beat with an accented downbeat in 4/4', () => {
    const tl = buildTimeline(demo('first-light'));
    const clicks = collectEvents(tl, 0, BAR, { metronome: true, strums: false });
    expect(clicks.map((c) => c.tick)).toEqual([0, TPQ, 2 * TPQ, 3 * TPQ]);
    expect(clicks.map((c) => (c.type === 'click' ? c.accent : -1))).toEqual([2, 1, 1, 1]);
  });

  it('clicks dotted-quarter beats in 6/8, with optional eighth subdivisions', () => {
    const tl = buildTimeline(demo('lantern-road'));
    const bar = barTicks({ num: 6, den: 8 });
    expect(collectEvents(tl, 0, bar, { metronome: true, strums: false }).map((c) => c.tick)).toEqual([0, NOTE.dottedQuarter]);
    const sub = collectEvents(tl, 0, bar, { metronome: true, subdivisions: true, strums: false });
    expect(sub).toHaveLength(6);
    expect(sub.map((c) => (c.type === 'click' ? c.accent : -1))).toEqual([2, 0, 0, 1, 0, 0]);
  });

  it('clicks the 2+2+3 groups in 7/8', () => {
    const tl = buildTimeline(demo('odd-weather'));
    const clicks = collectEvents(tl, 0, barTicks({ num: 7, den: 8 }), { metronome: true, strums: false });
    expect(clicks.map((c) => c.tick / NOTE.eighth)).toEqual([0, 2, 4]);
  });

  it('applies custom accents (0 = silent)', () => {
    const tl = buildTimeline(demo('first-light'));
    const clicks = collectEvents(tl, 0, BAR, { metronome: true, strums: false, accents: [2, 0, 2, 0] });
    expect(clicks.map((c) => c.tick)).toEqual([0, 2 * TPQ]);
  });

  it('places strums from the section pattern and pairs them with the active chord', () => {
    const tl = buildTimeline(demo('first-light'));
    const verseStart = tl.sections[1].start;
    const ev = collectEvents(tl, verseStart, verseStart + BAR, { metronome: false, strums: true });
    // Campfire: D - D U - U D U
    expect(ev.map((e) => (e.type === 'strum' ? e.stroke : ''))).toEqual(['D', 'D', 'U', 'U', 'D', 'U']);
    expect(ev.map((e) => (e.tick - verseStart) / NOTE.eighth)).toEqual([0, 2, 3, 5, 6, 7]);
    expect(ev.every((e) => e.type === 'strum' && tl.chords[e.chordIndex].symbol === 'G')).toBe(true);
  });

  it('switches chords at the exact tick when two chords share a bar', () => {
    const tl = buildTimeline(demo('island-steps'));
    const ev = collectEvents(tl, 0, BAR, { metronome: false, strums: true });
    const chordsAt = ev.map((e) => (e.type === 'strum' ? `${e.tick / NOTE.eighth}:${tl.chords[e.chordIndex].symbol}` : ''));
    expect(chordsAt).toEqual(['0:C', '1:C', '2:C', '3:C', '4:G', '5:G', '6:G', '7:G']);
  });

  it('keeps strumming through a chord held for several bars', () => {
    const tl = buildTimeline(demo('slow-tide'));
    const ev = collectEvents(tl, 0, TPQ + 4 * BAR, { metronome: false, strums: true });
    // Pickup is N.C. (no strum), then one strum per bar on Em for 4 bars.
    expect(ev.map((e) => (e.type === 'strum' ? tl.chords[e.chordIndex].symbol : ''))).toEqual(['Em', 'Em', 'Em', 'Em']);
    expect(ev.map((e) => e.tick)).toEqual([TPQ, TPQ + BAR, TPQ + 2 * BAR, TPQ + 3 * BAR]);
  });

  it('swings off-beat eighths to the triplet position', () => {
    const tl = buildTimeline(demo('porch-swing'));
    const ev = collectEvents(tl, 0, TPQ, { metronome: false, strums: true });
    expect(ev.map((e) => e.tick)).toEqual([0, 640]); // 2/3 of a beat
  });

  it('places syncopated sixteenths and chucks', () => {
    const tl = buildTimeline(demo('neon-bounce'));
    const ev = collectEvents(tl, 0, BAR, { metronome: false, strums: true });
    expect(ev.map((e) => (e.type === 'strum' ? `${e.tick / NOTE.sixteenth}${e.stroke}` : ''))).toEqual(
      ['0D', '3U', '4x', '6D', '7U', '9U', '10D', '12x', '14D', '15U'],
    );
  });

  it('honours an anticipated chord change (the "&" of 4)', () => {
    const tl = buildTimeline(demo('neon-bounce'));
    const chorus = tl.sections[1];
    const g = tl.chords.find((c) => c.sectionIndex === 1 && c.symbol === 'G')!;
    expect(g.start - chorus.start).toBe(TPQ * 3.5);
  });

  it('never produces events outside the requested range, and ranges tile', () => {
    const tl = buildTimeline(demo('neon-bounce'));
    const whole = collectEvents(tl, 0, tl.totalTicks, opts);
    const pieces: typeof whole = [];
    for (let t = 0; t < tl.totalTicks; t += 777) pieces.push(...collectEvents(tl, t, Math.min(t + 777, tl.totalTicks), opts));
    expect(pieces.map((e) => `${e.type}${e.tick}`)).toEqual(whole.map((e) => `${e.type}${e.tick}`));
  });

  it('builds a count-in bar that ends at the start tick', () => {
    const c = countInEvents({ num: 3, den: 4 }, 10 * TPQ);
    expect(c.map((e) => e.tick)).toEqual([7 * TPQ, 8 * TPQ, 9 * TPQ]);
  });

  it('reports the pattern cell for the strum animation', () => {
    const tl = buildTimeline(demo('first-light'));
    const v = tl.sections[1].start;
    expect(patternCellAt(tl, v + NOTE.eighth * 3 + 5)?.cell).toBe(3);
  });

  it('computes loop regions', () => {
    const tl = buildTimeline(demo('first-light'));
    expect(sectionRegion(tl, 2)).toEqual({ start: tl.sections[2].start, end: tl.sections[2].end });
    expect(barsRegion(tl, 5, 4)).toEqual({ start: 4 * BAR, end: 6 * BAR });
  });
});

describe('strum patterns', () => {
  it('all built-in patterns are valid and fill whole bars', () => {
    for (const p of BUILT_IN_PATTERNS) expect(validatePattern(p), p.id).toBeNull();
  });

  it('applies swing only to off-beat cells', () => {
    const p = BUILT_IN_PATTERNS.find((x) => x.id === 'p-shuffle-44')!;
    expect([0, 1, 2, 3].map((i) => cellOffset(p, i))).toEqual([0, 640, 960, 1600]);
    expect(patternStrokes(p)).toHaveLength(8);
  });

  it('builds sensible defaults for any meter', () => {
    const p68 = defaultPatternFor({ num: 6, den: 8 });
    expect(p68.steps).toEqual(['D', '-', '-', 'D', '-', '-']);
    const p78 = defaultPatternFor({ num: 7, den: 8 });
    expect(p78.steps).toEqual(['D', '-', 'D', '-', 'D', '-', '-']);
    expect(validatePattern(defaultPatternFor({ num: 12, den: 8 }))).toBeNull();
  });

  it('labels cells and suggests natural strokes', () => {
    const p = BUILT_IN_PATTERNS.find((x) => x.id === 'p-folk-44')!;
    expect(cellLabels(p)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(naturalStroke(p, 0)).toBe('D');
    expect(naturalStroke(p, 1)).toBe('U');
    expect(nextStroke('-', 'U')).toBe('U');
    expect(nextStroke('x', 'U')).toBe('-');
  });

  it('rejects a pattern that does not fit the bar', () => {
    const p = { ...BUILT_IN_PATTERNS[0], steps: ['D', 'D', 'D'] as ('D')[] };
    expect(validatePattern(p)).toMatch(/whole bars/);
  });
});

describe('demo data', () => {
  it('every demo is self-consistent', () => {
    for (const s of DEMO_SONGS as Song[]) {
      const tl = buildTimeline(s);
      expect(tl.totalTicks, s.id).toBeGreaterThan(0);
      expect(s.provenance.verified, s.id).toBe(false);
      for (const sec of s.sections) expect(s.patterns.some((p) => p.id === sec.patternId), `${s.id}/${sec.id}`).toBe(true);
      // Chords never overlap.
      for (let i = 1; i < tl.chords.length; i++) expect(tl.chords[i].start).toBeGreaterThanOrEqual(tl.chords[i - 1].end);
    }
  });
});
