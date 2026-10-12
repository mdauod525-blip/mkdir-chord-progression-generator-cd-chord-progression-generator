import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Song } from '../data/song';
import { Player, type PlayerSnapshot, type PracticeSettings } from '../player/player';
import type { SpellingPreference } from '../music/keys';

/** Create a Player for a song (re-created when the song id changes) and subscribe to it. */
export function usePlayer(song: Song | undefined, init?: { settings?: Partial<PracticeSettings>; transpose?: number; prefer?: SpellingPreference }) {
  const player = useMemo(
    () => (song ? new Player(song, { settings: init?.settings as PracticeSettings | undefined, transpose: init?.transpose, prefer: init?.prefer }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [song?.id],
  );
  useEffect(() => () => player?.destroy(), [player]);
  const snap = useSyncExternalStore(
    player ? player.subscribe : noopSubscribe,
    player ? player.getSnapshot : nullSnapshot,
  ) as PlayerSnapshot | null;
  return { player, snap };
}

const noopSubscribe = () => () => {};
const nullSnapshot = () => null;
