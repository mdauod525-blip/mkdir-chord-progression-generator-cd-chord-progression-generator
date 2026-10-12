import { describe, expect, it } from 'vitest';
import { DEMO_SONGS } from '../src/data/demos';
import { exportSongJson, exportLibraryJson, importText, parseChordSheet } from '../src/data/io';
import { validateSong } from '../src/data/validate';
import { MemoryStore, SongRepository, PatternRepository, PrefsRepository, KEYS, StorageError } from '../src/storage/storage';
import { BUILT_IN_PATTERNS } from '../src/data/patterns';
import { TPQ } from '../src/music/meter';
import type { Song } from '../src/data/song';

const song = (): Song => JSON.parse(JSON.stringify(DEMO_SONGS[0]));

describe('validation', () => {
  it('accepts every demo song', () => {
    for (const s of DEMO_SONGS) expect(validateSong(s), s.id).toEqual([]);
  });

  it('reports precise, readable errors', () => {
    const s = song() as unknown as Record<string, unknown>;
    s.bpm = 5;
    s.key = 'Q';
    (s.sections as Song['sections'])[1].chords[2].chord = 'Hm';
    (s.sections as Song['sections'])[1].chords[3].start = 1;
    s.form = ['intro', 'nope'];
    const errs = validateSong(s);
    expect(errs).toContain('bpm: must be a number from 20 to 400');
    expect(errs.some((e) => e.startsWith('key: "Q"'))).toBe(true);
    expect(errs).toContain('sections[1].chords[2].chord: "Hm" is not a chord symbol');
    expect(errs.some((e) => /sections\[1\]\.chords\[\d\]: overlaps/.test(e))).toBe(true);
    expect(errs).toContain('form[1]: no section with id "nope"');
  });

  it('rejects chords past the end of the section and bad meters', () => {
    const s = song();
    s.sections[0].chords.push({ chord: 'G', start: 4 * 4 * TPQ, duration: TPQ });
    s.meter = { num: 4, den: 3 };
    const errs = validateSong(s);
    expect(errs.some((e) => e.startsWith('meter:'))).toBe(true);
  });
});

describe('JSON import/export', () => {
  it('round-trips a song and marks it imported/unverified', () => {
    const r = importText(exportSongJson(DEMO_SONGS[2]));
    expect(r.errors).toEqual([]);
    expect(r.songs).toHaveLength(1);
    expect(r.songs[0].sections).toEqual(DEMO_SONGS[2].sections);
    expect(r.songs[0].provenance).toMatchObject({ kind: 'imported', verified: false });
  });

  it('never trusts a "verified" claim from a file', () => {
    const s = { ...song(), provenance: { kind: 'licensed', verified: true, source: 'Somebody' } };
    const r = importText(JSON.stringify(s));
    expect(r.songs[0].provenance.verified).toBe(false);
    expect(r.songs[0].provenance.note).toMatch(/cannot confirm/);
  });

  it('imports a library file with patterns', () => {
    const r = importText(exportLibraryJson(DEMO_SONGS.slice(0, 3), BUILT_IN_PATTERNS.slice(0, 2)));
    expect(r.songs).toHaveLength(3);
    expect(r.patterns).toHaveLength(2);
  });

  it('explains bad input', () => {
    expect(importText('{ nope').errors[0]).toMatch(/Not valid JSON/);
    expect(importText('{"format":"other"}').errors[0]).toMatch(/Unknown format/);
    expect(importText('{"title":"x"}').errors[0]).toMatch(/^Song "x": id: required/);
    expect(importText('   ').errors[0]).toMatch(/empty/);
  });
});

describe('plain-text chord sheets', () => {
  it('parses metadata, sections and bar lines with exact timing', () => {
    const r = parseChordSheet(`Title: Paper Boats
Artist: Me
Key: D
BPM: 72
Time: 3/4
Capo: 2

[Verse]
| D | A | Bm G | G |

[Chorus]
| G | % | D | A |`);
    expect(r.errors).toEqual([]);
    const s = r.songs[0];
    expect(s).toMatchObject({ title: 'Paper Boats', artist: 'Me', key: 'D', bpm: 72, capo: 2, meter: { num: 3, den: 4 } });
    expect(s.sections.map((x) => [x.name, x.kind, x.bars])).toEqual([['Verse', 'verse', 4], ['Chorus', 'chorus', 4]]);
    expect(s.sections[0].chords[2]).toEqual({ chord: 'Bm', start: 2 * 3 * TPQ, duration: 1.5 * TPQ });
    expect(s.sections[1].chords[0].duration).toBe(2 * 3 * TPQ);
    expect(s.provenance).toMatchObject({ kind: 'imported', verified: false });
    expect(s.patterns[0].meter).toEqual({ num: 3, den: 4 });
  });

  it('parses chords over lyrics, assuming one bar per chord', () => {
    const r = parseChordSheet(`Verse 1:
G          D
Here are some words
Em         C
and some more`);
    expect(r.songs[0].sections[0].chords.map((c) => c.chord)).toEqual(['G', 'D', 'Em', 'C']);
    expect(r.songs[0].sections[0].lyrics).toEqual([
      { start: 0, text: 'Here are' },
      { start: 4 * TPQ, text: 'some words' },
      { start: 8 * TPQ, text: 'and some' },
      { start: 12 * TPQ, text: 'more' },
    ]);
    expect(r.warnings.join(' ')).toMatch(/one bar/);
    expect(r.songs[0].key).toBe('G');
  });

  it('reports lines it cannot use', () => {
    expect(parseChordSheet('just some words').errors[0]).toMatch(/No chords found/);
    expect(parseChordSheet('| G | Zz |').errors[0]).toMatch(/Line 1: Bar 2: "Zz"/);
  });
});

describe('storage', () => {
  it('saves, updates, lists and deletes songs', () => {
    const store = new MemoryStore();
    const repo = new SongRepository(store);
    const s = { ...song(), id: 'u1', provenance: { kind: 'user' as const, verified: false } };
    repo.save(s);
    expect(repo.list()).toHaveLength(1);
    repo.save({ ...s, title: 'Renamed' });
    expect(repo.list()).toHaveLength(1);
    expect(repo.get('u1')!.title).toBe('Renamed');
    expect(repo.get('u1')!.updatedAt).toBeTruthy();
    // Survives a "reload" (new repository on the same store).
    expect(new SongRepository(store).get('u1')!.title).toBe('Renamed');
    repo.delete('u1');
    expect(repo.list()).toEqual([]);
  });

  it('refuses to save invalid songs and ignores corrupted data', () => {
    const store = new MemoryStore();
    const repo = new SongRepository(store);
    expect(() => repo.save({ ...song(), bpm: -1 })).toThrow(StorageError);
    store.set(KEYS.songs, '{not json');
    expect(repo.list()).toEqual([]);
    store.set(KEYS.songs, JSON.stringify([{ id: 'broken' }, { ...song(), id: 'ok' }]));
    expect(repo.list().map((s) => s.id)).toEqual(['ok']);
  });

  it('reports a full storage', () => {
    const repo = new SongRepository({
      get: () => null,
      set: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      remove: () => {},
    });
    expect(() => repo.save({ ...song(), id: 'x' })).toThrow(/Storage is full/);
  });

  it('stores custom strum patterns', () => {
    const repo = new PatternRepository(new MemoryStore());
    repo.save({ ...BUILT_IN_PATTERNS[2], id: 'mine', name: 'Mine' });
    expect(repo.list().map((p) => p.name)).toEqual(['Mine']);
    expect(() => repo.save({ ...BUILT_IN_PATTERNS[2], id: 'bad', steps: ['D', 'D', 'D'] })).toThrow();
  });

  it('keeps preferences: favorites, recents, per-song practice memory', () => {
    const prefs = new PrefsRepository(new MemoryStore());
    expect(prefs.get().theme).toBe('dark');
    prefs.toggleFavorite('a');
    prefs.toggleFavorite('b');
    prefs.toggleFavorite('a');
    expect(prefs.get().favorites).toEqual(['b']);
    prefs.touchRecent('x', 1);
    prefs.touchRecent('y', 2);
    prefs.touchRecent('x', 3);
    expect(prefs.get().recents.map((r) => r.id)).toEqual(['x', 'y']);
    prefs.rememberSong('x', { bpm: 70 });
    prefs.rememberSong('x', { transpose: 2 });
    expect(prefs.get().songs.x).toEqual({ bpm: 70, transpose: 2 });
    prefs.forgetSong('x');
    expect(prefs.get().songs.x).toBeUndefined();
    expect(prefs.get().recents.map((r) => r.id)).toEqual(['y']);
  });
});
