import { describe, it, expect } from 'vitest';
import { progressionToText, progressionToLine, slotsByMeasure } from '../src/export/text.js';
import { progressionToMidi, vlq, microsecondsPerQuarter, keySignature, PPQ } from '../src/export/midi.js';
import { buildTimeline } from '../src/audio/timeline.js';
import { createFavoritesStore } from '../src/storage/favorites.js';
import { generateProgression } from '../src/generator/progression.js';
import { voiceProgression } from '../src/theory/voicing.js';
import { makeKey } from '../src/theory/scales.js';

const fixed = (overrides = {}) => {
  const settings = { tonic: 'C', mode: 'major', timeSignature: '4/4', tempo: 120, genre: 'pop', mood: 'neutral', complexity: 1, measures: 4, harmonicRhythm: '1', voicing: 'close', ...overrides };
  const chords = [
    { degree: 0, root: 0, quality: 'maj', inversion: 0, func: 'diatonic', base: 'I', locked: false },
    { degree: 4, root: 7, quality: 'maj', inversion: 1, func: 'diatonic', base: 'V', locked: false },
    { degree: 5, root: 9, quality: 'min7', inversion: 0, func: 'diatonic', base: 'vi', locked: false },
    { degree: 3, root: 5, quality: 'maj', inversion: 0, func: 'diatonic', base: 'IV', locked: false },
  ];
  const epm = { '4/4': 8, '6/8': 6, '7/8': 7 }[settings.timeSignature];
  return { version: 1, id: 'test', seed: 1, settings, slots: chords.map((chord, i) => ({ measure: i, start: 0, duration: epm, chord })) };
};

const voicingsFor = (p) => voiceProgression(p.slots.map((s) => s.chord), makeKey(p.settings.tonic, p.settings.mode), 'close');

function readMidi(bytes) {
  const str = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
  const u32 = (o) => (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
  const header = { id: str(0, 4), format: (bytes[8] << 8) | bytes[9], tracks: (bytes[10] << 8) | bytes[11], ppq: (bytes[12] << 8) | bytes[13] };
  const tracks = [];
  let o = 14;
  while (o < bytes.length) {
    const len = u32(o + 4);
    tracks.push({ id: str(o, 4), data: bytes.slice(o + 8, o + 8 + len) });
    o += 8 + len;
  }
  return { header, tracks };
}

function parseTrack(data) {
  const events = [];
  let i = 0;
  let tick = 0;
  const readVlq = () => {
    let v = 0;
    let b;
    do {
      b = data[i++];
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  while (i < data.length) {
    tick += readVlq();
    const status = data[i++];
    if (status === 0xff) {
      const type = data[i++];
      const len = readVlq();
      events.push({ tick, meta: type, data: Array.from(data.slice(i, i + len)) });
      i += len;
    } else {
      const size = (status & 0xf0) === 0xc0 ? 1 : 2;
      events.push({ tick, status, data: Array.from(data.slice(i, i + size)) });
      i += size;
    }
  }
  return events;
}

describe('text export', () => {
  it('renders a chart with chords, numerals and chord tones', () => {
    const txt = progressionToText(fixed());
    expect(txt).toContain('Key: C major');
    expect(txt).toContain('Time: 4/4');
    expect(txt).toMatch(/\| C\s+\| G\/B\s+\| Am7\s+\| F\s+\|/);
    expect(txt).toContain('V⁶');
    expect(txt).toMatch(/Am7\s+A C E G/);
    expect(txt).toMatch(/\n  C\s+C E G\s+x32010/);
  });

  it('supports ASCII output and one-line summaries', () => {
    const p = fixed({ tonic: 'B♭' });
    expect(progressionToText(p, { ascii: true })).not.toMatch(/[♭♯]/);
    expect(progressionToLine(p)).toBe('B♭ – F/A – Gm7 – E♭');
  });

  it('groups slots by measure', () => {
    const p = generateProgression({ measures: 8, harmonicRhythm: '2' }, { seed: 4 });
    const m = slotsByMeasure(p);
    expect(m).toHaveLength(8);
    expect(m.every((slots) => slots.length === 2)).toBe(true);
  });
});

describe('MIDI export', () => {
  it('encodes variable-length quantities', () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(480)).toEqual([0x83, 0x60]);
    expect(vlq(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });

  it('converts tempo using the beat unit of the meter', () => {
    expect(microsecondsPerQuarter('4/4', 120)).toBe(500000);
    expect(microsecondsPerQuarter('6/8', 80)).toBe(500000); // dotted quarter 80 = quarter 120
  });

  it('writes key signatures', () => {
    expect(keySignature('C', 'major')).toEqual([0, 0]);
    expect(keySignature('E♭', 'major')).toEqual([0xfd, 0]);
    expect(keySignature('E', 'minor')).toEqual([1, 1]);
    expect(keySignature('F♯', 'major')).toEqual([6, 0]);
  });

  it('writes a valid multi-track file with the right notes and timing', () => {
    const p = fixed();
    const bytes = progressionToMidi(p, voicingsFor(p));
    const { header, tracks } = readMidi(bytes);
    expect(header).toEqual({ id: 'MThd', format: 1, tracks: 3, ppq: PPQ });
    expect(tracks.map((t) => t.id)).toEqual(['MTrk', 'MTrk', 'MTrk']);

    const meta = parseTrack(tracks[0].data);
    expect(meta.find((e) => e.meta === 0x58).data).toEqual([4, 2, 24, 8]);
    expect(meta.find((e) => e.meta === 0x51).data).toEqual([0x07, 0xa1, 0x20]);
    expect(meta.filter((e) => e.meta === 0x06).map((e) => String.fromCharCode(...e.data))).toEqual(['C', 'G/B', 'Am7', 'F']);

    const chords = parseTrack(tracks[1].data);
    const ons = chords.filter((e) => (e.status & 0xf0) === 0x90);
    expect(ons).toHaveLength(3 + 3 + 4 + 3);
    expect([...new Set(ons.map((e) => e.tick))]).toEqual([0, 1920, 3840, 5760]); // one 4/4 bar = 4 * 480
    const offs = chords.filter((e) => (e.status & 0xf0) === 0x80);
    expect(Math.max(...offs.map((e) => e.tick))).toBe(4 * 1920);

    const bass = parseTrack(tracks[2].data).filter((e) => (e.status & 0xf0) === 0x90);
    expect(bass.map((e) => e.data[0] % 12)).toEqual([0, 11, 9, 5]); // G/B has B in the bass
  });

  it('uses compound-meter bar lengths', () => {
    const p = fixed({ timeSignature: '6/8' });
    const { tracks } = readMidi(progressionToMidi(p, voicingsFor(p)));
    const meta = parseTrack(tracks[0].data);
    expect(meta.find((e) => e.meta === 0x58).data).toEqual([6, 3, 36, 8]);
    const ticks = [...new Set(parseTrack(tracks[1].data).filter((e) => (e.status & 0xf0) === 0x90).map((e) => e.tick))];
    expect(ticks).toEqual([0, 1440, 2880, 4320]); // 6 eighths * 240
  });
});

describe('playback timeline', () => {
  it('marks chord starts and beat accents per eighth', () => {
    const p = fixed({ timeSignature: '7/8' });
    const t = buildTimeline(p);
    expect(t.total).toBe(28);
    expect(t.events.filter((e) => e.chordStart).map((e) => e.index)).toEqual([0, 7, 14, 21]);
    expect(t.events.slice(0, 7).map((e) => e.isBeat)).toEqual([true, false, true, false, true, false, false]);
    expect(t.events[7]).toMatchObject({ measure: 1, eighthInMeasure: 0, accent: 2, slotIndex: 1 });
  });

  it('tracks split measures', () => {
    const p = generateProgression({ timeSignature: '3/4', measures: 2, harmonicRhythm: '2' }, { seed: 9 });
    const t = buildTimeline(p);
    expect(t.events.filter((e) => e.chordStart).map((e) => e.index)).toEqual([0, 4, 6, 10]);
  });
});

describe('favorites', () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  };

  it('saves, lists, renames and removes favorites', () => {
    const store = createFavoritesStore(memory());
    const p = fixed();
    store.save(p, 'Verse');
    store.save({ ...p, id: 'other' }, 'Chorus');
    expect(store.list().map((f) => f.name)).toEqual(['Chorus', 'Verse']);
    store.save(p, 'Verse 2'); // same id replaces
    expect(store.list()).toHaveLength(2);
    store.rename('test', 'Bridge');
    expect(store.list().find((f) => f.id === 'test').name).toBe('Bridge');
    store.remove('other');
    expect(store.has('other')).toBe(false);
    expect(store.list()[0].progression.slots).toHaveLength(4);
  });

  it('survives corrupt or failing storage', () => {
    const broken = { getItem: () => '{nope', setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const store = createFavoritesStore(broken);
    expect(store.list()).toEqual([]);
    expect(() => store.save(fixed(), 'x')).not.toThrow();
  });
});
