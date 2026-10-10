/**
 * Standard MIDI File (format 1) writer.
 *   Track 0: tempo, time signature, key signature, track name
 *   Track 1: chords (upper voices), channel 1, Electric Piano
 *   Track 2: bass, channel 2, Acoustic Bass
 */
import { eighthsPerMeasure, eighthsPerTempoBeat, midiTimeSignatureBytes } from '../theory/timeSignature.js';
import { describeChord } from '../theory/chords.js';
import { makeKey } from '../theory/scales.js';
import { toAscii, spell } from '../theory/notes.js';

export const PPQ = 480; // ticks per quarter note
const TICKS_PER_EIGHTH = PPQ / 2;

/** Encode a number as a MIDI variable-length quantity. */
export function vlq(value) {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7)) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

const textBytes = (str) => Array.from(new TextEncoder().encode(toAscii(str)));
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];

function chunk(type, data) {
  return [...textBytes(type), ...u32(data.length), ...data];
}

/** Turn absolute-time events into a track chunk with delta times. */
function track(events) {
  // Sort by time; note-offs before note-ons at the same tick.
  const sorted = events
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.tick - b.tick || a.order - b.order || a.i - b.i);
  const data = [];
  let last = 0;
  for (const e of sorted) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return chunk('MTrk', data);
}

/** Microseconds per quarter note for the app's tempo convention. */
export function microsecondsPerQuarter(timeSignature, bpm) {
  // BPM counts quarter notes (2 eighths) or dotted quarters (3 eighths).
  const quarterBpm = bpm * (eighthsPerTempoBeat(timeSignature) === 3 ? 1.5 : 1);
  return Math.round(60000000 / quarterBpm);
}

const KEY_SIGNATURES = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F♯': 6, 'C♯': 7,
  F: -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7,
};

/** MIDI key signature bytes: [sharps(+)/flats(-), major(0)/minor(1)]. */
export function keySignature(tonic, mode) {
  const key = makeKey(tonic, mode);
  // Minor keys share the signature of their relative major (a minor 3rd up).
  const relativeMajor = mode === 'minor' ? spell(key.tonicLetter + 2, key.tonicPc + 3) : spell(key.tonicLetter, key.tonicPc);
  const sf = KEY_SIGNATURES[relativeMajor] ?? 0;
  return [sf & 0xff, mode === 'minor' ? 1 : 0];
}

/**
 * Build the MIDI file bytes.
 * @param progression  generated progression
 * @param voicings     array of { bass, upper } aligned with progression.slots
 */
export function progressionToMidi(progression, voicings) {
  const s = progression.settings;
  const key = makeKey(s.tonic, s.mode);
  const epm = eighthsPerMeasure(s.timeSignature);

  const tempo = microsecondsPerQuarter(s.timeSignature, s.tempo);
  const meta = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(textBytes('ChordLab').length), ...textBytes('ChordLab')] },
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] },
    { tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, ...midiTimeSignatureBytes(s.timeSignature)] },
    { tick: 0, order: 0, bytes: [0xff, 0x59, 0x02, ...keySignature(s.tonic, s.mode)] },
  ];

  const chordEvents = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(textBytes('Chords').length), ...textBytes('Chords')] },
    { tick: 0, order: 0, bytes: [0xc0, 4] }, // Electric Piano 1
  ];
  const bassEvents = [
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(textBytes('Bass').length), ...textBytes('Bass')] },
    { tick: 0, order: 0, bytes: [0xc1, 32] }, // Acoustic Bass
  ];

  progression.slots.forEach((slot, i) => {
    const v = voicings[i];
    const start = (slot.measure * epm + slot.start) * TICKS_PER_EIGHTH;
    const end = start + slot.duration * TICKS_PER_EIGHTH;
    const label = describeChord(slot.chord, key).symbol;
    meta.push({ tick: start, order: 1, bytes: [0xff, 0x06, ...vlq(textBytes(label).length), ...textBytes(label)] });
    for (const note of v.upper) {
      chordEvents.push({ tick: start, order: 2, bytes: [0x90, note, 80] });
      chordEvents.push({ tick: end, order: 1, bytes: [0x80, note, 0] });
    }
    if (v.bass != null) {
      bassEvents.push({ tick: start, order: 2, bytes: [0x91, v.bass, 90] });
      bassEvents.push({ tick: end, order: 1, bytes: [0x81, v.bass, 0] });
    }
  });

  const header = chunk('MThd', [...u16(1), ...u16(3), ...u16(PPQ)]);
  return new Uint8Array([...header, ...track(meta), ...track(chordEvents), ...track(bassEvents)]);
}
