/**
 * Pure (DOM-free) description of what happens on every eighth note of a
 * progression. The transport walks this timeline; tests can inspect it.
 */
import { beatGrid, eighthsPerMeasure } from '../theory/timeSignature.js';

/**
 * Build the per-eighth timeline.
 * Each entry: { index, measure, eighthInMeasure, isBeat, accent, group,
 *               slotIndex, chordStart, slotStart, slotDuration }
 */
export function buildTimeline(progression) {
  const ts = progression.settings.timeSignature;
  const epm = eighthsPerMeasure(ts);
  const grid = beatGrid(ts);
  const total = progression.settings.measures * epm;

  // Absolute start eighth of each slot.
  const starts = progression.slots.map((s) => s.measure * epm + s.start);
  const events = [];
  let slotIndex = 0;
  for (let e = 0; e < total; e++) {
    while (slotIndex + 1 < starts.length && starts[slotIndex + 1] <= e) slotIndex++;
    const g = grid[e % epm];
    events.push({
      index: e,
      measure: Math.floor(e / epm),
      eighthInMeasure: e % epm,
      isBeat: g.isBeat,
      accent: g.accent,
      group: g.group,
      slotIndex,
      chordStart: starts[slotIndex] === e,
      slotStart: starts[slotIndex],
      slotDuration: progression.slots[slotIndex].duration,
    });
  }
  return { total, eighthsPerMeasure: epm, events };
}

