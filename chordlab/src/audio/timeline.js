/**
 * Pure (DOM-free) description of what happens on every eighth note of a
 * progression. The transport walks this timeline; tests can inspect it.
 */
import { beatGrid, eighthsPerMeasure, getTimeSignature, groupStarts } from '../theory/timeSignature.js';

/**
 * Build the per-eighth timeline.
 * Each entry: { index, measure, eighthInMeasure, isBeat, accent, group, groupSize, posInGroup,
 *               slotIndex, chordStart, slotStart, slotDuration }
 */
export function buildTimeline(progression) {
  const ts = progression.settings.timeSignature;
  const epm = eighthsPerMeasure(ts);
  const grid = beatGrid(ts);
  const groups = getTimeSignature(ts).groups;
  const starts = groupStarts(ts);
  const total = progression.settings.measures * epm;

  // Absolute start eighth of each slot.
  const slotStarts = progression.slots.map((s) => s.measure * epm + s.start);
  const events = [];
  let slotIndex = 0;
  for (let e = 0; e < total; e++) {
    while (slotIndex + 1 < slotStarts.length && slotStarts[slotIndex + 1] <= e) slotIndex++;
    const g = grid[e % epm];
    events.push({
      index: e,
      measure: Math.floor(e / epm),
      eighthInMeasure: e % epm,
      isBeat: g.isBeat,
      accent: g.accent,
      group: g.group,
      groupSize: groups[g.group],
      posInGroup: (e % epm) - starts[g.group],
      slotIndex,
      chordStart: slotStarts[slotIndex] === e,
      slotStart: slotStarts[slotIndex],
      slotDuration: progression.slots[slotIndex].duration,
    });
  }
  return { total, eighthsPerMeasure: epm, events };
}

