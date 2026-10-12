/**
 * Validation for songs and patterns coming from storage or import.
 * Returns human-readable errors with a path, e.g.
 *   "sections[1].chords[3].chord: "Hm" is not a chord symbol"
 */
import { validateMeter, barTicks, type Meter } from '../music/meter';
import { isNoChord, parseChord } from '../music/chords';
import { parseKey } from '../music/keys';
import { STROKES, validatePattern, type StrumPattern } from '../music/strum';
import { DIFFICULTIES, SECTION_KINDS, type Song } from './song';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function meterErrors(v: unknown, path: string): string[] {
  if (!isObj(v) || !isInt(v.num) || !isInt(v.den)) return [`${path}: must be { "num": 4, "den": 4 }`];
  if (v.grouping !== undefined && !(Array.isArray(v.grouping) && v.grouping.every(isInt))) return [`${path}.grouping: must be a list of whole numbers`];
  const e = validateMeter(v as unknown as Meter);
  return e ? [`${path}: ${e}`] : [];
}

export function validatePatternData(v: unknown, path: string): string[] {
  if (!isObj(v)) return [`${path}: must be an object`];
  const errs: string[] = [];
  if (!isStr(v.id) || !v.id) errs.push(`${path}.id: required`);
  if (!isStr(v.name)) errs.push(`${path}.name: required`);
  errs.push(...meterErrors(v.meter, `${path}.meter`));
  if (!isInt(v.step) || v.step <= 0) errs.push(`${path}.step: must be a positive whole number of ticks (480 = eighth note)`);
  if (!Array.isArray(v.steps) || !v.steps.every((s) => STROKES.includes(s as never))) errs.push(`${path}.steps: must be a list of "D", "U", "x" or "-"`);
  if (v.accents !== undefined && !(Array.isArray(v.accents) && v.accents.every(isInt))) errs.push(`${path}.accents: must be a list of cell numbers`);
  if (v.feel !== undefined && v.feel !== 'straight' && v.feel !== 'swing') errs.push(`${path}.feel: must be "straight" or "swing"`);
  if (!errs.length) {
    const e = validatePattern(v as unknown as StrumPattern);
    if (e) errs.push(`${path}: ${e}`);
  }
  return errs;
}

export function validateSong(v: unknown): string[] {
  if (!isObj(v)) return ['song: must be an object'];
  const errs: string[] = [];
  if (!isStr(v.id) || !v.id) errs.push('id: required');
  if (!isStr(v.title) || !v.title.trim()) errs.push('title: required');
  if (!isStr(v.artist)) errs.push('artist: must be text (can be empty)');
  if (!DIFFICULTIES.includes(v.difficulty as never)) errs.push(`difficulty: must be one of ${DIFFICULTIES.join(', ')}`);
  if (!isStr(v.genre)) errs.push('genre: must be text');
  if (!isStr(v.key) || !parseKey(v.key)) errs.push(`key: "${String(v.key)}" is not a key (examples: "G", "Em", "Bb")`);
  if (typeof v.bpm !== 'number' || !(v.bpm >= 20 && v.bpm <= 400)) errs.push('bpm: must be a number from 20 to 400');
  errs.push(...meterErrors(v.meter, 'meter'));
  if (!isObj(v.tuning) || !isStr(v.tuning.name) || !Array.isArray(v.tuning.notes) || !v.tuning.notes.every(isInt) || v.tuning.notes.length !== 6) {
    errs.push('tuning: must be { "name": "Standard", "notes": [40,45,50,55,59,64] } (MIDI notes, low to high)');
  }
  if (!isInt(v.capo) || v.capo < 0 || v.capo > 12) errs.push('capo: must be a whole number from 0 to 12');
  if (!isObj(v.provenance) || !['demo', 'user', 'imported', 'licensed'].includes(v.provenance.kind as string) || typeof v.provenance.verified !== 'boolean') {
    errs.push('provenance: must be { "kind": "user" | "imported" | "licensed" | "demo", "verified": false }');
  }

  const patternIds = new Set<string>();
  if (!Array.isArray(v.patterns)) errs.push('patterns: must be a list');
  else
    v.patterns.forEach((p, i) => {
      errs.push(...validatePatternData(p, `patterns[${i}]`));
      if (isObj(p) && isStr(p.id)) patternIds.add(p.id);
    });

  const sectionIds = new Set<string>();
  if (!Array.isArray(v.sections) || v.sections.length === 0) errs.push('sections: must be a non-empty list');
  else {
    v.sections.forEach((s, i) => {
      const path = `sections[${i}]`;
      if (!isObj(s)) {
        errs.push(`${path}: must be an object`);
        return;
      }
      if (!isStr(s.id) || !s.id) errs.push(`${path}.id: required`);
      else if (sectionIds.has(s.id)) errs.push(`${path}.id: "${s.id}" is used twice`);
      else sectionIds.add(s.id);
      if (!isStr(s.name)) errs.push(`${path}.name: required`);
      if (!SECTION_KINDS.includes(s.kind as never)) errs.push(`${path}.kind: must be one of ${SECTION_KINDS.join(', ')}`);
      if (!isInt(s.bars) || s.bars < 0 || s.bars > 512) errs.push(`${path}.bars: must be a whole number from 0 to 512`);
      if (s.pickup !== undefined && (!isInt(s.pickup) || s.pickup < 0)) errs.push(`${path}.pickup: must be a whole number of ticks`);
      let meterOk = true;
      if (s.meter !== undefined) {
        const me = meterErrors(s.meter, `${path}.meter`);
        meterOk = me.length === 0;
        errs.push(...me);
      }
      if (s.patternId !== undefined && (!isStr(s.patternId) || !patternIds.has(s.patternId))) {
        errs.push(`${path}.patternId: "${String(s.patternId)}" is not in this song's patterns`);
      }
      const meter = (s.meter ?? v.meter) as Meter;
      const length =
        meterOk && isObj(meter) && !validateMeter(meter) && isInt(s.bars) ? (isInt(s.pickup) ? s.pickup : 0) + s.bars * barTicks(meter) : Infinity;
      if (!Array.isArray(s.chords)) errs.push(`${path}.chords: must be a list`);
      else {
        const sorted: { start: number; end: number; i: number }[] = [];
        s.chords.forEach((c, j) => {
          const cp = `${path}.chords[${j}]`;
          if (!isObj(c)) {
            errs.push(`${cp}: must be { "chord": "G", "start": 0, "duration": 3840 }`);
            return;
          }
          if (!isStr(c.chord) || !(isNoChord(c.chord) || parseChord(c.chord))) errs.push(`${cp}.chord: "${String(c.chord)}" is not a chord symbol`);
          if (!isInt(c.start) || c.start < 0) errs.push(`${cp}.start: must be a whole number of ticks ≥ 0`);
          if (!isInt(c.duration) || c.duration <= 0) errs.push(`${cp}.duration: must be a positive whole number of ticks`);
          if (isInt(c.start) && isInt(c.duration)) {
            if (c.start + c.duration > length) errs.push(`${cp}: ends after the section ends`);
            sorted.push({ start: c.start, end: c.start + c.duration, i: j });
          }
        });
        sorted.sort((a, b) => a.start - b.start);
        for (let k = 1; k < sorted.length; k++) {
          if (sorted[k].start < sorted[k - 1].end) errs.push(`${path}.chords[${sorted[k].i}]: overlaps chords[${sorted[k - 1].i}]`);
        }
      }
      if (s.lyrics !== undefined && !(Array.isArray(s.lyrics) && s.lyrics.every((l) => isObj(l) && isInt(l.start) && isStr(l.text)))) {
        errs.push(`${path}.lyrics: must be a list of { "start": ticks, "text": "..." }`);
      }
      if (s.tab !== undefined && !(Array.isArray(s.tab) && s.tab.every((n) => isObj(n) && isInt(n.start) && isInt(n.duration) && isInt(n.string) && n.string >= 0 && n.string <= 5 && isInt(n.fret) && n.fret >= 0 && n.fret <= 24))) {
        errs.push(`${path}.tab: must be a list of { "start", "duration", "string" (0–5), "fret" (0–24) }`);
      }
    });
  }
  if (v.form !== undefined) {
    if (!Array.isArray(v.form) || !v.form.every(isStr)) errs.push('form: must be a list of section ids');
    else v.form.forEach((id, i) => !sectionIds.has(id) && errs.push(`form[${i}]: no section with id "${id}"`));
  }
  return errs;
}

export type { Song };
