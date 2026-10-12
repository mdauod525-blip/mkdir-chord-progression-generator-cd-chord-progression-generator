import { describe, expect, it } from 'vitest';
import { DEMO_SONGS } from '../src/data/demos';
import { BUILT_IN_PATTERNS } from '../src/data/patterns';
import {
  songToDraft, draftToSong, newDraft, copyDraft, draftBars, durationOptions, transposeDraft, setDraftMeter, presetChords, validateDraft, makeItem,
} from '../src/editor/draft';
import { buildTimeline } from '../src/music/timeline';
import { TPQ, NOTE } from '../src/music/meter';
import { filterSongs, EMPTY_FILTER, isBeginnerFriendly, facets } from '../src/data/library';

const timing = (s: Parameters<typeof buildTimeline>[0]) => buildTimeline(s).chords.filter((c) => !c.noChord).map((c) => `${c.symbol}@${c.start}-${c.end}`);

describe('editor draft model', () => {
  it('round-trips every demo song without changing chord timing', () => {
    for (const s of DEMO_SONGS) {
      const back = draftToSong(songToDraft(s), BUILT_IN_PATTERNS);
      expect(timing(back), s.id).toEqual(timing(s));
      expect(back.sections.map((x) => x.bars)).toEqual(s.sections.map((x) => x.bars));
      expect(back.form).toEqual(s.form);
    }
  });

  it('keeps lyrics attached to their chords', () => {
    const s = DEMO_SONGS[0];
    const back = draftToSong(songToDraft(s), BUILT_IN_PATTERNS);
    expect(back.sections[1].lyrics).toEqual(s.sections[1].lyrics);
  });

  it('extends the last chord to fill an incomplete bar', () => {
    const d = newDraft();
    d.title = 'x';
    d.sections[0].items.push(makeItem('Am', 2 * TPQ));
    const song = draftToSong(d, BUILT_IN_PATTERNS);
    expect(song.sections[0].bars).toBe(5);
    expect(song.sections[0].chords.at(-1)).toEqual({ chord: 'Am', start: 16 * TPQ, duration: 4 * TPQ });
  });

  it('produces valid songs and explains invalid chords', () => {
    const d = newDraft();
    expect(validateDraft(d, BUILT_IN_PATTERNS)).toEqual(['Give the song a title.']);
    d.title = 'Ok';
    d.sections[0].items[1].chord = 'Hxx';
    expect(validateDraft(d, BUILT_IN_PATTERNS)[0]).toMatch(/"Hxx" isn’t a chord/);
    d.sections[0].items[1].chord = 'D';
    expect(validateDraft(d, BUILT_IN_PATTERNS)).toEqual([]);
  });

  it('copies demos as user songs with honest provenance', () => {
    const c = copyDraft(DEMO_SONGS[0]);
    expect(c.id).not.toBe(DEMO_SONGS[0].id);
    expect(c.provenance).toMatchObject({ kind: 'user', verified: false });
    expect(c.provenance.source).toMatch(/Based on the StrumFlow demo/);
  });

  it('visualises bars with multi-bar and split chords', () => {
    const d = newDraft();
    const s = { ...d.sections[0], items: [makeItem('G', 8 * TPQ), makeItem('D', 2 * TPQ), makeItem('C', 2 * TPQ)] };
    const bars = draftBars(d.meter, s);
    expect(bars).toHaveLength(3);
    expect(bars[1].segments).toEqual([{ item: 0, from: 0, to: 1, held: true }]);
    expect(bars[2].segments.map((x) => [x.item, x.from, x.to])).toEqual([[1, 0, 0.5], [2, 0.5, 1]]);
  });

  it('offers meter-aware chord lengths', () => {
    expect(durationOptions({ num: 4, den: 4 }).slice(0, 4)).toEqual([NOTE.eighth, TPQ, 1.5 * TPQ, 2 * TPQ]);
    expect(durationOptions({ num: 6, den: 8 }).slice(0, 3)).toEqual([NOTE.eighth, 2 * NOTE.eighth, 3 * NOTE.eighth]);
  });

  it('transposes the whole draft and key', () => {
    const t = transposeDraft(newDraft(), 2);
    expect(t.key).toBe('A');
    expect(t.sections[0].items.map((i) => i.chord)).toEqual(['A', 'E', 'F#m', 'D']);
  });

  it('reassigns patterns that no longer fit a new meter', () => {
    const r = setDraftMeter(newDraft(), { num: 3, den: 4 }, BUILT_IN_PATTERNS);
    expect(r.reassigned).toBe(1);
    expect(BUILT_IN_PATTERNS.find((p) => p.id === r.draft.sections[0].patternId)!.meter).toEqual({ num: 3, den: 4 });
  });

  it('calculates progression presets in the chosen key', () => {
    expect(presetChords(['vi', 'IV', 'I', 'V'], 'E')).toEqual(['C#m', 'A', 'E', 'B']);
    expect(presetChords(['i', 'VII', 'VI', 'V'], 'Am')).toEqual(['Am', 'G', 'F', 'E']);
  });
});

describe('library filters', () => {
  it('searches and filters', () => {
    const f = (patch: Partial<typeof EMPTY_FILTER>) => filterSongs(DEMO_SONGS, { ...EMPTY_FILTER, ...patch }).map((s) => s.id);
    expect(f({ q: 'waltz' })).toEqual(['demo-harbor-waltz']);
    expect(f({ meter: '6/8' })).toEqual(['demo-lantern-road']);
    expect(f({ tuning: 'alternate' })).toEqual(['demo-drop-anchor']);
    expect(f({ minBpm: 150 })).toEqual(['demo-odd-weather']);
    expect(f({ difficulty: 'advanced' })).toHaveLength(2);
    expect(f({ source: 'mine' })).toEqual([]);
    expect(facets(DEMO_SONGS).meters).toContain('7/8');
  });

  it('flags beginner-friendly songs', () => {
    const byId = (id: string) => DEMO_SONGS.find((s) => s.id === `demo-${id}`)!;
    expect(isBeginnerFriendly(byId('first-light'))).toBe(true);
    expect(isBeginnerFriendly(byId('odd-weather'))).toBe(false);
  });
});
