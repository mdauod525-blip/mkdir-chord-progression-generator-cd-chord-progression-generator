/** Fixed bottom transport: position, play/pause, tempo, metronome, loop, full screen. */
import type { Player, PlayerSnapshot } from '../player/player';
import { IconExpand, IconLoop, IconMetronome, IconMinus, IconPause, IconPlay, IconPlus, IconRestart, IconClose } from '../ui/icons';
import { beatsOfBar, tempoUnitSymbol } from '../music/meter';
import { chordLabel } from './display';
import type { SheetDisplay } from './ChordSheetView';

interface Props {
  player: Player;
  snap: PlayerSnapshot;
  display: SheetDisplay;
  onLoopMenu: () => void;
  onTempoMenu: () => void;
  onFullscreen?: () => void;
  compact?: boolean;
}

export function TransportBar({ player, snap, display, onLoopMenu, onTempoMenu, onFullscreen, compact }: Props) {
  const { timeline: tl, frame, status, settings, loop } = snap;
  const bar = tl.bars[frame.loc.barIndex];
  const sec = tl.sections[frame.loc.sectionIndex];
  const playing = status === 'playing';
  const beats = bar ? beatsOfBar(bar.meter) : [];
  const next = frame.loc.nextChordIndex >= 0 ? tl.chords[frame.loc.nextChordIndex] : null;
  const unit = tempoUnitSymbol(tl.song.meter);
  const pct = Math.round((settings.bpm / tl.song.bpm) * 100);

  return (
    <div className={`transport${compact ? ' transport-compact' : ''}`} role="region" aria-label="Playback controls">
      <div className="tp-status">
        <span className="tp-where">
          {frame.countIn ? (
            <strong>Count-in {frame.countInBeat + 1}</strong>
          ) : (
            <>
              Bar {frame.loc.barIndex + 1}/{tl.bars.length}
              {sec && <span className="muted"> · {sec.section.name}</span>}
            </>
          )}
        </span>
        <span className="tp-beats" aria-hidden="true">
          {beats.map((b) => (
            <span key={b.index} className={`tp-dot${b.index === 0 ? ' down' : ''}${playing && !frame.countIn && frame.loc.beatIndex === b.index ? ' on' : ''}${frame.countIn && frame.countInBeat === b.index ? ' on count' : ''}`} />
          ))}
        </span>
        {loop ? (
          <button type="button" className="tp-loop-badge" onClick={() => player.setLoop(null)} aria-label={`Looping ${loop.label}. Tap to stop looping.`}>
            <IconLoop size={14} /> {loop.label} <IconClose size={12} />
          </button>
        ) : next ? (
          <span className="tp-next muted">Next: {chordLabel(tl, next.symbol, display.names, display.capo, display.prefer)}</span>
        ) : null}
      </div>
      <div className="tp-controls">
        <button type="button" className="icon-btn" onClick={() => player.restart()} aria-label={loop ? 'Restart loop' : 'Restart section'}>
          <IconRestart />
        </button>
        <button type="button" className="play-btn" onClick={() => void player.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IconPause size={28} /> : <IconPlay size={28} />}
        </button>
        <div className="tempo" role="group" aria-label="Tempo">
          <button type="button" className="icon-btn icon-btn-small" onClick={() => player.updateSettings({ bpm: settings.bpm - 5 })} aria-label="Slower (−5 BPM)">
            <IconMinus size={18} />
          </button>
          <button type="button" className="tempo-value" onClick={onTempoMenu} aria-label={`Tempo ${settings.bpm} BPM (${pct}% of song tempo). Tap for tempo options.`}>
            <span className="tempo-num">
              {unit}={settings.bpm}
            </span>
            <span className={`tempo-pct${pct !== 100 ? ' changed' : ''}`}>{pct}%</span>
          </button>
          <button type="button" className="icon-btn icon-btn-small" onClick={() => player.updateSettings({ bpm: settings.bpm + 5 })} aria-label="Faster (+5 BPM)">
            <IconPlus size={18} />
          </button>
        </div>
        <button type="button" className={`icon-btn toggle${settings.metronome ? ' on' : ''}`} onClick={() => player.updateSettings({ metronome: !settings.metronome })} aria-pressed={settings.metronome} aria-label="Metronome">
          <IconMetronome />
        </button>
        <button type="button" className={`icon-btn toggle${loop ? ' on' : ''}`} onClick={onLoopMenu} aria-label="Loop options">
          <IconLoop />
        </button>
        {onFullscreen && (
          <button type="button" className="icon-btn" onClick={onFullscreen} aria-label="Full-screen practice mode">
            <IconExpand />
          </button>
        )}
      </div>
    </div>
  );
}
