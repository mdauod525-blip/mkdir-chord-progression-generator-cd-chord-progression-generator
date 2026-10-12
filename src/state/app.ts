/**
 * App-wide state: user songs, user patterns and preferences, backed by the
 * storage repositories. Components read it with `useApp()`.
 */
import { useSyncExternalStore } from 'react';
import type { Song } from '../data/song';
import type { StrumPattern } from '../music/strum';
import { DEMO_SONGS } from '../data/demos';
import { BUILT_IN_PATTERNS } from '../data/patterns';
import {
  type KeyValueStore, type Prefs, type SongPracticeMemory, browserStore, MemoryStore, PatternRepository, PrefsRepository, SongRepository,
} from '../storage/storage';

export interface AppSnapshot {
  userSongs: Song[];
  userPatterns: StrumPattern[];
  prefs: Prefs;
  /** False when the browser blocks storage (data lasts for this session only). */
  persistent: boolean;
}

export class AppStore {
  private listeners = new Set<() => void>();
  private snap: AppSnapshot;
  readonly songs: SongRepository;
  readonly patterns: PatternRepository;
  readonly prefs: PrefsRepository;

  constructor(store: KeyValueStore, persistent: boolean) {
    this.songs = new SongRepository(store);
    this.patterns = new PatternRepository(store);
    this.prefs = new PrefsRepository(store);
    this.snap = { userSongs: this.songs.list(), userPatterns: this.patterns.list(), prefs: this.prefs.get(), persistent };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private refresh() {
    this.snap = { ...this.snap, userSongs: this.songs.list(), userPatterns: this.patterns.list(), prefs: this.prefs.get() };
    for (const l of this.listeners) l();
  }

  saveSong(song: Song): Song {
    const saved = this.songs.save(song);
    this.refresh();
    return saved;
  }

  deleteSong(id: string): void {
    this.songs.delete(id);
    this.prefs.forgetSong(id);
    this.refresh();
  }

  savePattern(p: StrumPattern): void {
    this.patterns.save(p);
    this.refresh();
  }

  deletePattern(id: string): void {
    this.patterns.delete(id);
    this.refresh();
  }

  setPrefs(patch: Partial<Prefs>): void {
    this.prefs.update(patch);
    this.refresh();
  }

  toggleFavorite(id: string): void {
    this.prefs.toggleFavorite(id);
    this.refresh();
  }

  touchRecent(id: string): void {
    this.prefs.touchRecent(id);
    this.refresh();
  }

  rememberSong(id: string, mem: SongPracticeMemory): void {
    this.prefs.rememberSong(id, mem);
    this.refresh();
  }

  clearAll(): void {
    for (const s of this.songs.list()) this.songs.delete(s.id);
    for (const p of this.patterns.list()) this.patterns.delete(p.id);
    this.prefs.set({ ...this.prefs.get(), favorites: [], recents: [], songs: {} });
    this.refresh();
  }
}

const { store, persistent } = typeof window !== 'undefined' ? browserStore() : { store: new MemoryStore(), persistent: false };
export const app = new AppStore(store, persistent);

export function useApp(): AppSnapshot {
  return useSyncExternalStore(app.subscribe, app.getSnapshot);
}

export function allSongs(s: AppSnapshot): Song[] {
  return [...s.userSongs, ...DEMO_SONGS];
}

export function findSong(s: AppSnapshot, id: string): Song | undefined {
  return s.userSongs.find((x) => x.id === id) ?? DEMO_SONGS.find((x) => x.id === id);
}

export function allPatterns(s: AppSnapshot): StrumPattern[] {
  return [...s.userPatterns, ...BUILT_IN_PATTERNS];
}

export const isBuiltInPattern = (id: string) => BUILT_IN_PATTERNS.some((p) => p.id === id);
