/** Library search & filters (pure, testable). */
import { type Song, type Difficulty, songForm } from './song';
import { isStandardTuning } from '../music/guitar';
import { meterKind, meterLabel } from '../music/meter';
import { isNoChord } from '../music/chords';

const EASY_CHORDS = new Set([
  'C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm', 'E7', 'A7', 'D7', 'G7', 'C7', 'B7', 'Cmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7', 'Dmaj7',
  'Asus2', 'Dsus2', 'Asus4', 'Dsus4', 'Esus4', 'Em7', 'Am7', 'Dm7', 'Cadd9', 'G/B', 'D/F#', 'D5', 'E5', 'A5',
]);

export function songChords(song: Song): string[] {
  return [...new Set(songForm(song).flatMap((s) => s.chords.map((c) => c.chord)).filter((c) => !isNoChord(c)))];
}

/** Beginner-friendly: marked beginner, or slow, simple meter, open chords only, standard tuning. */
export function isBeginnerFriendly(song: Song): boolean {
  if (song.difficulty === 'beginner') return true;
  return song.bpm <= 100 && meterKind(song.meter) === 'simple' && isStandardTuning(song.tuning) && songChords(song).every((c) => EASY_CHORDS.has(c));
}

export type SourceFilter = 'all' | 'demo' | 'mine' | 'imported';

export interface LibraryFilter {
  q: string;
  difficulty: Difficulty | 'all';
  genre: string;
  key: string;
  meter: string;
  minBpm: number | null;
  maxBpm: number | null;
  tuning: 'any' | 'standard' | 'alternate';
  beginnerFriendly: boolean;
  source: SourceFilter;
}

export const EMPTY_FILTER: LibraryFilter = {
  q: '', difficulty: 'all', genre: '', key: '', meter: '', minBpm: null, maxBpm: null, tuning: 'any', beginnerFriendly: false, source: 'all',
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function filterSongs(songs: Song[], f: LibraryFilter): Song[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  return songs.filter((s) => {
    if (words.length) {
      const hay = norm([s.title, s.artist, s.genre, ...(s.tags ?? [])].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.difficulty !== 'all' && s.difficulty !== f.difficulty) return false;
    if (f.genre && s.genre !== f.genre) return false;
    if (f.key && s.key !== f.key) return false;
    if (f.meter && meterLabel(s.meter) !== f.meter) return false;
    if (f.minBpm !== null && s.bpm < f.minBpm) return false;
    if (f.maxBpm !== null && s.bpm > f.maxBpm) return false;
    if (f.tuning === 'standard' && !isStandardTuning(s.tuning)) return false;
    if (f.tuning === 'alternate' && isStandardTuning(s.tuning)) return false;
    if (f.beginnerFriendly && !isBeginnerFriendly(s)) return false;
    if (f.source === 'demo' && s.provenance.kind !== 'demo') return false;
    if (f.source === 'mine' && s.provenance.kind !== 'user') return false;
    if (f.source === 'imported' && !(s.provenance.kind === 'imported' || s.provenance.kind === 'licensed')) return false;
    return true;
  });
}

export function facets(songs: Song[]) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    genres: uniq(songs.map((s) => s.genre).filter(Boolean)),
    keys: uniq(songs.map((s) => s.key)),
    meters: uniq(songs.map((s) => meterLabel(s.meter))),
  };
}

export function activeFilterCount(f: LibraryFilter): number {
  return (
    Number(f.difficulty !== 'all') + Number(!!f.genre) + Number(!!f.key) + Number(!!f.meter) + Number(f.minBpm !== null || f.maxBpm !== null) +
    Number(f.tuning !== 'any') + Number(f.beginnerFriendly) + Number(f.source !== 'all')
  );
}
