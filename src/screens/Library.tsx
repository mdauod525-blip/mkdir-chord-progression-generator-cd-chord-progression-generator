import { useEffect, useMemo, useState } from 'react';
import { allSongs, app, useApp } from '../state/app';
import { navigate } from '../state/router';
import { SongCard } from '../ui/SongCard';
import { IconSearch, IconUpload } from '../ui/icons';
import { EMPTY_FILTER, activeFilterCount, facets, filterSongs, type LibraryFilter } from '../data/library';
import { DIFFICULTIES, type Difficulty } from '../data/song';
import { ImportSheet } from './ImportSheet';
import { Term } from '../ui/Glossary';

export function Library({ query }: { query: URLSearchParams }) {
  const state = useApp();
  const songs = allSongs(state);
  const [f, setF] = useState<LibraryFilter>(() => fromQuery(query));
  const [showFilters, setShowFilters] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => setF(fromQuery(query)), [query]);
  const fc = useMemo(() => facets(songs), [songs]);
  const results = filterSongs(songs, f);
  const fav = new Set(state.prefs.favorites);
  const set = (patch: Partial<LibraryFilter>) => setF({ ...f, ...patch });
  const count = activeFilterCount(f);

  return (
    <div className="screen library">
      <header className="screen-head">
        <h1>Library</h1>
        <button type="button" className="btn btn-small" onClick={() => setImporting(true)}>
          <IconUpload size={16} /> Import
        </button>
      </header>
      <div className="search">
        <IconSearch size={20} />
        <input type="search" placeholder="Title, artist, style or tag" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search the library" />
      </div>

      <div className="chip-row" role="group" aria-label="Difficulty">
        {(['all', ...DIFFICULTIES] as const).map((d) => (
          <button key={d} type="button" className={`chip${f.difficulty === d ? ' chip-on' : ''}`} aria-pressed={f.difficulty === d} onClick={() => set({ difficulty: d as Difficulty | 'all' })}>
            {d === 'all' ? 'All levels' : d}
          </button>
        ))}
        <button type="button" className={`chip${f.beginnerFriendly ? ' chip-on' : ''}`} aria-pressed={f.beginnerFriendly} onClick={() => set({ beginnerFriendly: !f.beginnerFriendly })}>
          Beginner-friendly
        </button>
        <button type="button" className={`chip${showFilters || count ? ' chip-on' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          Filters{count ? ` (${count})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="filters card">
          <label className="field">
            <span>Source</span>
            <select value={f.source} onChange={(e) => set({ source: e.target.value as LibraryFilter['source'] })}>
              <option value="all">All songs</option>
              <option value="demo">Original demos</option>
              <option value="mine">My songs</option>
              <option value="imported">Imported</option>
            </select>
          </label>
          <label className="field">
            <span>Style</span>
            <select value={f.genre} onChange={(e) => set({ genre: e.target.value })}>
              <option value="">Any style</option>
              {fc.genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Key</span>
            <select value={f.key} onChange={(e) => set({ key: e.target.value })}>
              <option value="">Any key</option>
              {fc.keys.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              <Term id="meter">Time signature</Term>
            </span>
            <select value={f.meter} onChange={(e) => set({ meter: e.target.value })}>
              <option value="">Any</option>
              {fc.meters.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>
              <Term id="bpm">Tempo (BPM)</Term>
            </span>
            <div className="row gap">
              <input type="number" inputMode="numeric" placeholder="min" min={20} max={400} value={f.minBpm ?? ''} onChange={(e) => set({ minBpm: e.target.value ? Number(e.target.value) : null })} aria-label="Minimum BPM" />
              <span className="muted">to</span>
              <input type="number" inputMode="numeric" placeholder="max" min={20} max={400} value={f.maxBpm ?? ''} onChange={(e) => set({ maxBpm: e.target.value ? Number(e.target.value) : null })} aria-label="Maximum BPM" />
            </div>
          </div>
          <label className="field">
            <span>
              <Term id="tuning">Tuning</Term>
            </span>
            <select value={f.tuning} onChange={(e) => set({ tuning: e.target.value as LibraryFilter['tuning'] })}>
              <option value="any">Any tuning</option>
              <option value="standard">Standard only</option>
              <option value="alternate">Alternate tunings</option>
            </select>
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => setF({ ...EMPTY_FILTER, q: f.q })}>
            Clear filters
          </button>
        </div>
      )}

      <p className="muted small results-count" aria-live="polite">
        {results.length} song{results.length === 1 ? '' : 's'}
      </p>
      <div className="song-grid">
        {results.map((s) => (
          <SongCard key={s.id} song={s} favorite={fav.has(s.id)} />
        ))}
      </div>
      {results.length === 0 && (
        <div className="empty-state">
          <p>No songs match.</p>
          <p className="muted small">StrumFlow doesn’t search an online catalog. Create the song yourself or import a chord sheet.</p>
          <div className="row gap center">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/edit/new')}>
              Create a song
            </button>
            <button type="button" className="btn" onClick={() => setImporting(true)}>
              Import
            </button>
          </div>
        </div>
      )}
      <p className="small muted library-note">
        <Term id="verified">About these arrangements</Term> — {state.userSongs.length} of your own, {songs.length - state.userSongs.length} original demos.
        {!state.persistent && ' Storage is blocked in this browser, so your songs last only until you close the tab.'}
      </p>
      <ImportSheet open={importing} onClose={() => setImporting(false)} onImported={(id) => (id ? navigate(`/song/${encodeURIComponent(id)}`) : undefined)} store={app} />
    </div>
  );
}

function fromQuery(q: URLSearchParams): LibraryFilter {
  const level = q.get('level');
  return {
    ...EMPTY_FILTER,
    q: q.get('q') ?? '',
    difficulty: DIFFICULTIES.includes(level as Difficulty) ? (level as Difficulty) : 'all',
    genre: q.get('genre') ?? '',
  };
}
