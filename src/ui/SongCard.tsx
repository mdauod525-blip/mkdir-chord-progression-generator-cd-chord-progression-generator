import type { Song } from '../data/song';
import { provenanceLabel } from '../data/song';
import { href } from '../state/router';
import { app } from '../state/app';
import { meterLabel, tempoUnitSymbol } from '../music/meter';
import { isStandardTuning } from '../music/guitar';
import { IconStar } from './icons';
import { displayChord } from '../music/chords';
import { songChords } from '../data/library';

export function SongCard({ song, favorite, compact }: { song: Song; favorite: boolean; compact?: boolean }) {
  const chords = songChords(song).slice(0, 6);
  return (
    <article className={`song-card${compact ? ' compact' : ''}`}>
      <a className="song-card-link" href={href(`/song/${encodeURIComponent(song.id)}`)}>
        <div className="song-card-top">
          <h3>{song.title}</h3>
          <span className={`badge diff-${song.difficulty}`}>{song.difficulty}</span>
        </div>
        <p className="muted small">{song.artist || 'Unknown artist'} · {song.genre}</p>
        {!compact && <p className="song-card-chords">{chords.map(displayChord).join('  ')}</p>}
        <p className="song-card-meta small">
          <span>{song.key}</span>
          <span>{meterLabel(song.meter)}</span>
          <span>
            {tempoUnitSymbol(song.meter)}={song.bpm}
          </span>
          {song.capo > 0 && <span>Capo {song.capo}</span>}
          {!isStandardTuning(song.tuning) && <span>{song.tuning.name}</span>}
        </p>
        <span className={`prov prov-${song.provenance.verified ? 'verified' : song.provenance.kind} small`}>{provenanceLabel(song.provenance)}</span>
      </a>
      <button
        type="button"
        className={`icon-btn song-card-fav${favorite ? ' fav-on' : ''}`}
        onClick={() => app.toggleFavorite(song.id)}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`}
      >
        <IconStar filled={favorite} size={20} />
      </button>
    </article>
  );
}
