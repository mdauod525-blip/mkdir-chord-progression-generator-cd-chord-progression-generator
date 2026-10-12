/**
 * Import / export.
 *
 * JSON format (documented in docs/ARRANGEMENT_FORMAT.md):
 *   { "format": "strumflow.song", "version": 1, "song": { ...Song } }
 *   { "format": "strumflow.library", "version": 1, "songs": [...], "patterns": [...] }
 * A bare Song object or an array of songs is accepted too.
 *
 * Plain-text chord sheets are also accepted (see parseChordSheet).
 * Imported material is always marked "imported" and unverified: StrumFlow
 * cannot check a file's claims about where an arrangement came from.
 */
import type { Section, SectionKind, Song } from './song';
import { newId } from './song';
import { validateSong, validatePatternData } from './validate';
import { parseChart } from './chart';
import { BUILT_IN_PATTERNS } from './patterns';
import { type StrumPattern, defaultPatternFor } from '../music/strum';
import { type Meter, barTicks, parseMeter, sameMeter } from '../music/meter';
import { isNoChord, parseChord } from '../music/chords';
import { parseKey } from '../music/keys';
import { STANDARD, TUNINGS } from '../music/guitar';

export const FORMAT_VERSION = 1;

export function exportSongJson(song: Song): string {
  return JSON.stringify({ format: 'strumflow.song', version: FORMAT_VERSION, exportedAt: new Date().toISOString(), song }, null, 2);
}

export function exportLibraryJson(songs: Song[], patterns: StrumPattern[]): string {
  return JSON.stringify({ format: 'strumflow.library', version: FORMAT_VERSION, exportedAt: new Date().toISOString(), songs, patterns }, null, 2);
}

export interface ImportResult {
  songs: Song[];
  patterns: StrumPattern[];
  errors: string[];
  warnings: string[];
}

/** Import JSON or a plain-text chord sheet. Never throws. */
export function importText(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { songs: [], patterns: [], errors: ['The file is empty.'], warnings: [] };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return importJson(trimmed);
  return parseChordSheet(trimmed);
}

export function importJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { songs: [], patterns: [], errors: [`Not valid JSON: ${(e as Error).message}`], warnings: [] };
  }
  const result: ImportResult = { songs: [], patterns: [], errors: [], warnings: [] };
  let songs: unknown[] = [];
  let patterns: unknown[] = [];
  if (Array.isArray(data)) songs = data;
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (o.format === 'strumflow.song') songs = [o.song];
    else if (o.format === 'strumflow.library') {
      songs = Array.isArray(o.songs) ? o.songs : [];
      patterns = Array.isArray(o.patterns) ? o.patterns : [];
    } else if (typeof o.format === 'string') {
      return { ...result, errors: [`Unknown format "${o.format}". Expected "strumflow.song" or "strumflow.library".`] };
    } else songs = [o];
    if (typeof o.version === 'number' && o.version > FORMAT_VERSION) {
      result.warnings.push(`This file was made by a newer version of StrumFlow (format v${o.version}); some details may be ignored.`);
    }
  }
  songs.forEach((s, i) => {
    const label = songs.length > 1 ? `Song ${i + 1}` : 'Song';
    const errs = validateSong(s);
    if (errs.length) {
      const title = s && typeof s === 'object' && typeof (s as Song).title === 'string' ? ` "${(s as Song).title}"` : '';
      result.errors.push(`${label}${title}: ${errs.slice(0, 5).join('; ')}${errs.length > 5 ? ` (+${errs.length - 5} more)` : ''}`);
      return;
    }
    result.songs.push(markImported(s as Song));
  });
  patterns.forEach((p, i) => {
    const errs = validatePatternData(p, `patterns[${i}]`);
    if (errs.length) result.errors.push(errs[0]);
    else result.patterns.push(p as StrumPattern);
  });
  if (!songs.length && !patterns.length) result.errors.push('No songs found in this file.');
  return result;
}

function markImported(s: Song): Song {
  const original = s.provenance;
  const claimedVerified = original.verified;
  return {
    ...s,
    provenance: {
      kind: original.kind === 'licensed' ? 'licensed' : 'imported',
      verified: false,
      source: original.source,
      license: original.license,
      note: claimedVerified
        ? 'The file claimed this arrangement was verified; StrumFlow cannot confirm that, so it is shown as unverified.'
        : original.note,
    },
  };
}

// ---------------------------------------------------------------------------
// Plain-text chord sheets
// ---------------------------------------------------------------------------

const META = /^(title|artist|by|key|bpm|tempo|time|meter|time signature|capo|tuning|difficulty|genre)\s*[:=]\s*(.+)$/i;
const HEADER = /^\s*(?:\[([^\]]+)\]|(intro|verse|pre-?chorus|chorus|bridge|solo|interlude|outro|instrumental)(\s*\d+)?\s*:?)\s*$/i;

function kindFromName(name: string): SectionKind {
  const n = name.toLowerCase();
  if (n.startsWith('intro')) return 'intro';
  if (n.startsWith('pre')) return 'pre-chorus';
  if (n.startsWith('chorus') || n.startsWith('refrain')) return 'chorus';
  if (n.startsWith('verse')) return 'verse';
  if (n.startsWith('bridge')) return 'bridge';
  if (n.startsWith('solo') || n.startsWith('instrumental')) return 'solo';
  if (n.startsWith('interlude')) return 'interlude';
  if (n.startsWith('outro') || n.startsWith('ending')) return 'outro';
  return 'other';
}

const isChordToken = (t: string) => isNoChord(t) || Boolean(parseChord(t)) || t === '%' || t === '.';

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordToken) && tokens.some((t) => t !== '.' && t !== '%');
}

export function patternForMeter(meter: Meter): StrumPattern {
  return BUILT_IN_PATTERNS.find((p) => sameMeter(p.meter, meter)) ?? defaultPatternFor(meter);
}

/**
 * Parse a plain-text chord sheet:
 *
 *   Title: Morning Song
 *   Key: G
 *   BPM: 90
 *   Time: 3/4
 *   [Verse]
 *   | G | D | Em C | C |
 *   G         D
 *   words under the chords
 *
 * Bar-line rows ("| G | D |") carry exact timing. Chord-over-lyric rows do
 * not, so each chord is assumed to last one bar (reported as a warning).
 */
export function parseChordSheet(text: string): ImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta: Record<string, string> = {};
  let meter: Meter = { num: 4, den: 4 };

  // First pass: metadata (meter needed before parsing bars).
  for (const line of lines) {
    const m = META.exec(line.trim());
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  const meterText = meta['time'] ?? meta['meter'] ?? meta['time signature'];
  if (meterText) {
    const parsed = parseMeter(meterText);
    if (parsed) meter = parsed;
    else warnings.push(`Time signature "${meterText}" not understood; using 4/4.`);
  }
  const bar = barTicks(meter);

  interface Draft {
    name: string;
    chords: Section['chords'];
    lyrics: NonNullable<Section['lyrics']>;
    bars: number;
    notes: string[];
  }
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  const ensure = () => {
    if (!current) {
      current = { name: 'Song', chords: [], lyrics: [], bars: 0, notes: [] };
      drafts.push(current);
    }
    return current;
  };
  let assumedTiming = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || META.test(line)) continue;
    const h = HEADER.exec(line);
    if (h) {
      const name = (h[1] ?? `${h[2]}${h[3] ?? ''}`).trim();
      current = { name: name.charAt(0).toUpperCase() + name.slice(1), chords: [], lyrics: [], bars: 0, notes: [] };
      drafts.push(current);
      continue;
    }
    const d = ensure();
    if (line.includes('|')) {
      const r = parseChart(line, meter, d.bars * bar);
      r.errors.forEach((e) => errors.push(`Line ${i + 1}: ${e}`));
      d.chords.push(...r.chords);
      d.bars += r.bars;
      continue;
    }
    if (isChordLine(line)) {
      // Chord-over-lyric row: one bar per chord, lyrics split at chord columns.
      assumedTiming = true;
      const positions: { col: number; sym: string }[] = [];
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) positions.push({ col: m.index, sym: m[0] });
      const next = lines[i + 1];
      const hasLyric = next !== undefined && next.trim() && !isChordLine(next) && !HEADER.test(next.trim()) && !next.includes('|') && !META.test(next.trim());
      // Split points snap back to the start of the word under each chord.
      const lyricLine = hasLyric ? next! : '';
      const snap = (col: number) => {
        let c = Math.min(col, lyricLine.length);
        while (c > 0 && /\S/.test(lyricLine[c - 1] ?? '') && /\S/.test(lyricLine[c] ?? '')) c--;
        return c;
      };
      positions.forEach((p, k) => {
        const start = d.bars * bar;
        if (p.sym === '%' || p.sym === '.') {
          const last = d.chords[d.chords.length - 1];
          if (last) last.duration += bar;
        } else d.chords.push({ chord: isNoChord(p.sym) ? 'N.C.' : p.sym, start, duration: bar });
        if (hasLyric) {
          const from = k === 0 ? 0 : snap(p.col);
          const to = k + 1 < positions.length ? snap(positions[k + 1].col) : undefined;
          const fragment = lyricLine.slice(from, to).trim();
          if (fragment) d.lyrics.push({ start, text: fragment });
        }
        d.bars += 1;
      });
      if (hasLyric) i++;
      continue;
    }
    d.notes.push(line);
  }

  const usable = drafts.filter((d) => d.bars > 0);
  if (!usable.length) {
    return { songs: [], patterns: [], errors: errors.length ? errors : ['No chords found. Use bar lines like "| G | D | Em | C |" or chord names above lyrics.'], warnings };
  }
  if (assumedTiming) warnings.push('Chords written above lyrics have no rhythm information, so each chord was given one bar. Adjust the lengths in the editor.');

  const pattern = patternForMeter(meter);
  const keyText = meta['key'] ?? '';
  const firstChord = usable[0].chords.find((c) => !isNoChord(c.chord))?.chord ?? 'C';
  const key = parseKey(keyText) ? keyText : guessKey(firstChord);
  if (!parseKey(keyText)) warnings.push(`No key given; assumed ${key} from the first chord.`);
  const bpmText = meta['bpm'] ?? meta['tempo'];
  const bpm = bpmText && Number.isFinite(parseFloat(bpmText)) ? Math.round(parseFloat(bpmText)) : 90;
  const capo = meta['capo'] ? parseInt(meta['capo'], 10) || 0 : 0;
  const tuning = TUNINGS.find((t) => t.name.toLowerCase() === (meta['tuning'] ?? '').toLowerCase()) ?? STANDARD;

  const sections: Section[] = usable.map((d, i) => {
    const s: Section = { id: `s${i + 1}`, name: d.name, kind: kindFromName(d.name), bars: d.bars, chords: d.chords, patternId: pattern.id };
    if (d.lyrics.length) s.lyrics = d.lyrics;
    if (d.notes.length) s.notes = d.notes.join('\n');
    return s;
  });

  const song: Song = {
    id: newId('song'),
    title: meta['title'] ?? 'Imported song',
    artist: meta['artist'] ?? meta['by'] ?? '',
    difficulty: (['beginner', 'intermediate', 'advanced'].includes((meta['difficulty'] ?? '').toLowerCase()) ? meta['difficulty'].toLowerCase() : 'beginner') as Song['difficulty'],
    genre: meta['genre'] ?? 'Other',
    key,
    bpm: Math.max(20, Math.min(400, bpm)),
    meter,
    tuning,
    capo: Math.max(0, Math.min(12, capo)),
    patterns: [pattern],
    sections,
    provenance: { kind: 'imported', verified: false, source: 'Plain-text chord sheet' },
  };
  const errs = validateSong(song);
  if (errs.length) return { songs: [], patterns: [], errors: [...errors, ...errs], warnings };
  return { songs: [song], patterns: [], errors, warnings };
}

function guessKey(chord: string): string {
  const c = parseChord(chord);
  if (!c) return 'C';
  const root = chord.match(/^[A-G][#b♯♭]?/)![0];
  return c.quality.startsWith('m') && !c.quality.startsWith('maj') ? `${root}m` : root;
}
