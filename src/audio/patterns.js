/**
 * Pure playing-pattern logic (no audio): which notes an arpeggio or strum
 * plays on a given step. The transport turns these into sound.
 */

export const ARP_PATTERNS = {
  up: 'Up',
  down: 'Down',
  updown: 'Up & down',
  fingerpick: 'Fingerpicked',
};

export const ARP_SPEEDS = { 8: '8ths', 16: '16ths' };

/**
 * Notes to play on arpeggio step `step` (0 = chord start) for a voicing
 * { bass, upper }. Returns an array of MIDI notes (two when the pattern pinches).
 */
export function arpeggioStep(voicing, step, pattern = 'up') {
  const upper = voicing.upper || [];
  const all = [voicing.bass, ...upper].filter((n) => n != null);
  if (!all.length) return [];
  switch (pattern) {
    case 'down': {
      const down = [...all].reverse();
      return [down[step % down.length]];
    }
    case 'updown': {
      const cycle = all.length > 2 ? all.concat(all.slice(1, -1).reverse()) : all;
      return [cycle[step % cycle.length]];
    }
    case 'fingerpick': {
      // Travis-style: the thumb alternates bass / inner voice on even steps,
      // fingers pick the upper strings on odd steps; the first step pinches the top note.
      if (!upper.length) return [all[0]];
      if (step % 2 === 0) {
        const thumb = (step / 2) % 2 === 0 ? (voicing.bass ?? upper[0]) : upper[0];
        return step === 0 ? [thumb, upper[upper.length - 1]] : [thumb];
      }
      const fingers = upper.length > 1 ? upper.slice(1) : upper;
      return [fingers[((step - 1) / 2) % fingers.length]];
    }
    default:
      return [all[step % all.length]];
  }
}

/**
 * Strum direction for an eighth note: a down-strum on every beat and an
 * up-strum on the last eighth of each beat group ("&" in x/4, "li" in x/8).
 * Returns 'down', 'up' or null.
 */
export function strumAction(posInGroup, groupSize) {
  if (posInGroup === 0) return 'down';
  if (groupSize > 1 && posInGroup === groupSize - 1) return 'up';
  return null;
}
