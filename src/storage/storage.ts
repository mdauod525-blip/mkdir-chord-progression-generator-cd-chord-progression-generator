/**
 * Persistence.
 *
 * A tiny key-value interface (`KeyValueStore`) with a localStorage backend and
 * an in-memory fallback (private browsing, storage disabled, tests). The
 * repositories on top only depend on the interface, so a server/database
 * backend with accounts can replace it later without touching the UI.
 *
 * User data is stored separately from the built-in demo content, which lives
 * in code and is never written to storage.
 */
import type { Song } from '../data/song';
import type { StrumPattern } from '../music/strum';
import type { SpellingPreference } from '../music/keys';
import { validateSong, validatePatternData } from '../data/validate';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  get(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  set(key: string, value: string) {
    this.m.set(key, value);
  }
  remove(key: string) {
    this.m.delete(key);
  }
}

/** localStorage when it works, otherwise memory (data then lasts for the session only). */
export function browserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const ls = window.localStorage;
    const probe = '__strumflow_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      store: {
        get: (k) => ls.getItem(k),
        set: (k, v) => ls.setItem(k, v),
        remove: (k) => ls.removeItem(k),
      },
      persistent: true,
    };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}

const PREFIX = 'strumflow:v1:';
export const KEYS = {
  songs: `${PREFIX}songs`,
  patterns: `${PREFIX}patterns`,
  prefs: `${PREFIX}prefs`,
};

function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export class StorageError extends Error {}

function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try {
    store.set(key, JSON.stringify(value));
  } catch (e) {
    throw new StorageError(
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Storage is full. Export and delete some songs to free space.'
        : 'Could not save to this device.',
    );
  }
}

export class SongRepository {
  constructor(private store: KeyValueStore) {}

  /** User songs. Invalid stored entries are skipped rather than crashing the app. */
  list(): Song[] {
    const raw = readJson<unknown[]>(this.store, KEYS.songs, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is Song => validateSong(s).length === 0);
  }

  get(id: string): Song | undefined {
    return this.list().find((s) => s.id === id);
  }

  save(song: Song): Song {
    const errors = validateSong(song);
    if (errors.length) throw new StorageError(`Song is invalid: ${errors[0]}`);
    const now = new Date().toISOString();
    const saved: Song = { ...song, createdAt: song.createdAt ?? now, updatedAt: now };
    const all = this.list();
    const i = all.findIndex((s) => s.id === song.id);
    if (i >= 0) all[i] = saved;
    else all.unshift(saved);
    writeJson(this.store, KEYS.songs, all);
    return saved;
  }

  delete(id: string): void {
    writeJson(this.store, KEYS.songs, this.list().filter((s) => s.id !== id));
  }
}

export class PatternRepository {
  constructor(private store: KeyValueStore) {}

  list(): StrumPattern[] {
    const raw = readJson<unknown[]>(this.store, KEYS.patterns, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is StrumPattern => validatePatternData(p, 'pattern').length === 0);
  }

  save(p: StrumPattern): void {
    const errors = validatePatternData(p, 'pattern');
    if (errors.length) throw new StorageError(errors[0]);
    const all = this.list();
    const i = all.findIndex((x) => x.id === p.id);
    if (i >= 0) all[i] = p;
    else all.unshift(p);
    writeJson(this.store, KEYS.patterns, all);
  }

  delete(id: string): void {
    writeJson(this.store, KEYS.patterns, this.list().filter((p) => p.id !== id));
  }
}

export type Theme = 'dark' | 'light';

export interface SongPracticeMemory {
  bpm?: number;
  transpose?: number;
}

export interface Prefs {
  theme: Theme;
  favorites: string[];
  recents: { id: string; at: number }[];
  prefer: SpellingPreference;
  /** Last practice tempo / transpose per song. */
  songs: Record<string, SongPracticeMemory>;
  showDiagrams: boolean;
  showStrum: boolean;
  /** Show Roman numerals next to chords. */
  numerals: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  favorites: [],
  recents: [],
  prefer: 'auto',
  songs: {},
  showDiagrams: true,
  showStrum: true,
  numerals: false,
};

export class PrefsRepository {
  constructor(private store: KeyValueStore) {}

  get(): Prefs {
    const raw = readJson<Partial<Prefs>>(this.store, KEYS.prefs, {});
    const p = { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!Array.isArray(p.favorites)) p.favorites = [];
    if (!Array.isArray(p.recents)) p.recents = [];
    if (!p.songs || typeof p.songs !== 'object') p.songs = {};
    return p;
  }

  set(p: Prefs): void {
    writeJson(this.store, KEYS.prefs, p);
  }

  update(patch: Partial<Prefs>): Prefs {
    const next = { ...this.get(), ...patch };
    this.set(next);
    return next;
  }

  toggleFavorite(id: string): Prefs {
    const p = this.get();
    const favorites = p.favorites.includes(id) ? p.favorites.filter((f) => f !== id) : [id, ...p.favorites];
    return this.update({ favorites });
  }

  touchRecent(id: string, at = Date.now()): Prefs {
    const p = this.get();
    const recents = [{ id, at }, ...p.recents.filter((r) => r.id !== id)].slice(0, 12);
    return this.update({ recents });
  }

  rememberSong(id: string, mem: SongPracticeMemory): Prefs {
    const p = this.get();
    return this.update({ songs: { ...p.songs, [id]: { ...p.songs[id], ...mem } } });
  }

  forgetSong(id: string): Prefs {
    const p = this.get();
    const songs = { ...p.songs };
    delete songs[id];
    return this.update({
      songs,
      favorites: p.favorites.filter((f) => f !== id),
      recents: p.recents.filter((r) => r.id !== id),
    });
  }
}
