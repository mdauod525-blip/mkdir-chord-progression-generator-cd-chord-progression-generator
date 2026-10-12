import { useState } from 'react';
import { allSongs, app, findSong, useApp } from '../state/app';
import { href, navigate } from '../state/router';
import { SongCard } from '../ui/SongCard';
import { IconMoon, IconPlay, IconPlus, IconSearch, IconSun } from '../ui/icons';
import { DEMO_SONGS } from '../data/demos';
import { DIFFICULTIES, type Song } from '../data/song';

const LEVEL_TEXT: Record<string, string> = {
  beginner: 'Open chords, steady strums',
  intermediate: 'Barre chords, 6/8, swing',
  advanced: 'Syncopation, odd meters',
};

export function Home() {
  const state = useApp();
  const [q, setQ] = useState('');
  const songs = allSongs(state);
  const fav = new Set(state.prefs.favorites);
  const recent = state.prefs.recents.map((r) => findSong(state, r.id)).filter((s): s is Song => Boolean(s));
  const favorites = state.prefs.favorites.map((id) => findSong(state, id)).filter((s): s is Song => Boolean(s));
  const quick = recent[0] ?? DEMO_SONGS[0];
  const byGenre = groupBy(songs, (s) => s.genre);

  return (
    <div className="screen home">
      <header className="home-head">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden="true">
            <rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor" opacity=".14" />
            <path d="M9 8v13M9 21l-3-3M9 21l3-3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M22 24V11M22 11l-3 3M22 11l3 3" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".7" />
          </svg>
          <div>
            <h1>StrumFlow</h1>
            <p className="muted small">Learn songs: chords, strums, timing</p>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => app.setPrefs({ theme: state.prefs.theme === 'dark' ? 'light' : 'dark' })}
          aria-label={state.prefs.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {state.prefs.theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </header>

      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/library?q=${encodeURIComponent(q)}`);
        }}
      >
        <IconSearch size={20} />
        <input type="search" placeholder="Search songs or artists" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search songs or artists" enterKeyHint="search" />
      </form>

      <section className="quick" aria-label="Quick practice">
        <a className="quick-card" href={href(`/song/${encodeURIComponent(quick.id)}?view=practice`)}>
          <span className="quick-play" aria-hidden="true">
            <IconPlay size={26} />
          </span>
          <span>
            <span className="muted small">{recent.length ? 'Continue practising' : 'Start here'}</span>
            <strong>{quick.title}</strong>
            <span className="muted small"> · beat-by-beat practice</span>
          </span>
        </a>
        <div className="quick-actions">
          <a className="btn btn-primary" href={href('/edit/new')}>
            <IconPlus size={18} /> Create a song
          </a>
          <a className="btn" href={href('/patterns')}>
            Strum patterns
          </a>
        </div>
      </section>

      {recent.length > 0 && (
        <Shelf title="Recently played">
          {recent.slice(0, 8).map((s) => (
            <SongCard key={s.id} song={s} favorite={fav.has(s.id)} compact />
          ))}
        </Shelf>
      )}

      {favorites.length > 0 && (
        <Shelf title="Favorites">
          {favorites.map((s) => (
            <SongCard key={s.id} song={s} favorite compact />
          ))}
        </Shelf>
      )}

      <section aria-label="Levels">
        <h2 className="h2">Levels</h2>
        <div className="levels">
          {DIFFICULTIES.map((d) => (
            <a key={d} className={`level-card diff-${d}`} href={href(`/library?level=${d}`)}>
              <strong>{d[0].toUpperCase() + d.slice(1)}</strong>
              <span className="small muted">{LEVEL_TEXT[d]}</span>
              <span className="small">{songs.filter((s) => s.difficulty === d).length} songs</span>
            </a>
          ))}
        </div>
      </section>

      {DIFFICULTIES.map((d) => {
        const list = songs.filter((s) => s.difficulty === d);
        return list.length ? (
          <Shelf key={d} title={`Suggested · ${d}`}>
            {list.map((s) => (
              <SongCard key={s.id} song={s} favorite={fav.has(s.id)} compact />
            ))}
          </Shelf>
        ) : null;
      })}

      <section aria-label="Styles">
        <h2 className="h2">By style</h2>
        <div className="chip-wrap">
          {Object.entries(byGenre).map(([g, list]) => (
            <a key={g} className="chip" href={href(`/library?genre=${encodeURIComponent(g)}`)}>
              {g} <span className="muted">{list.length}</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="home-foot small muted">
        <p>
          StrumFlow comes with original practice songs written for the app — not transcriptions of commercial recordings. Add your own songs, or import chord sheets you have the
          right to use.
        </p>
        <p>
          Need ideas for a progression? Try <a href="./chordlab/">ChordLab, the chord progression generator</a>.
        </p>
      </footer>
    </div>
  );
}

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="h2">{title}</h2>
      <div className="shelf">{children}</div>
    </section>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}
