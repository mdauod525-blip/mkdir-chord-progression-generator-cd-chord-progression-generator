/**
 * Editor draft model.
 *
 * In the editor a section is a simple ordered list of chords, each with a
 * length ("G for 1 bar, then D for 2 beats…"), which is how people think about
 * progressions. It converts losslessly to the song model's explicit start
 * positions and back. Gaps become "N.C." items.
 */
import type { LyricFragment, Section, SectionKind, Song, TabNote } from '../data/song';
import { newId } from '../data/song';
import { type Meter, barTicks, beatsOfBar, meterKind, pulseTicks, sameMeter } from '../music/meter';
import { type StrumPattern } from '../music/strum';
import { patternForMeter } from '../data/io';
import { STANDARD } from '../music/guitar';
import { isNoChord, parseChord } from '../music/chords';
import { parseKey, transposeChordSymbol, transposeKey, keyName, chordFromNumeral } from '../music/keys';
import { validateSong } from '../data/validate';

export interface DraftChord {
  key: string;
  chord: string;
  duration: number;
  lyric: string;
}

export interface DraftSection {
  id: string;
  name: string;
  kind: SectionKind;
  patternId: string;
  pickup: number;
  meter?: Meter;
  items: DraftChord[];
  notes: string;
  tab?: TabNote[];
}

export interface Draft extends Omit<Song, 'sections' | 'form'> {
  sections: DraftSection[];
  form: string[] | null;
}

const itemKey = () => Math.random().toString(36).slice(2, 10);

export function sectionMeterOf(d: Draft, s: DraftSection): Meter {
  return s.meter ?? d.meter;
}

export function songToDraft(song: Song): Draft {
  const sections: DraftSection[] = song.sections.map((s) => {
    const meter = s.meter ?? song.meter;
    const end = (s.pickup ?? 0) + s.bars * barTicks(meter);
    const items: DraftChord[] = [];
    let t = 0;
    for (const c of [...s.chords].sort((a, b) => a.start - b.start)) {
      if (c.start > t) items.push({ key: itemKey(), chord: 'N.C.', duration: c.start - t, lyric: '' });
      const dur = Math.min(c.duration, end - c.start);
      items.push({ key: itemKey(), chord: c.chord, duration: dur, lyric: '' });
      t = c.start + dur;
    }
    if (t < end) items.push({ key: itemKey(), chord: 'N.C.', duration: end - t, lyric: '' });
    // Attach lyrics to the chord that is sounding when they start.
    for (const l of s.lyrics ?? []) {
      let acc = 0;
      const target = items.find((it) => {
        const hit = l.start >= acc && l.start < acc + it.duration;
        acc += it.duration;
        return hit;
      });
      if (target) target.lyric = target.lyric ? `${target.lyric} ${l.text}` : l.text;
    }
    return {
      id: s.id, name: s.name, kind: s.kind, patternId: s.patternId ?? patternForMeter(meter).id, pickup: s.pickup ?? 0, meter: s.meter,
      items, notes: s.notes ?? '', tab: s.tab,
    };
  });
  const { sections: _s, form, ...rest } = song;
  void _s;
  return { ...rest, sections, form: form && form.length ? [...form] : null };
}

export function draftSectionToSection(d: Draft, s: DraftSection): Section {
  const meter = sectionMeterOf(d, s);
  const bar = barTicks(meter);
  const chords: Section['chords'] = [];
  const lyrics: LyricFragment[] = [];
  let t = 0;
  for (const it of s.items) {
    if (it.duration <= 0) continue;
    if (!isNoChord(it.chord)) chords.push({ chord: it.chord.trim(), start: t, duration: it.duration });
    if (it.lyric.trim()) lyrics.push({ start: t, text: it.lyric.trim() });
    t += it.duration;
  }
  const bars = Math.max(1, Math.ceil(Math.max(0, t - s.pickup) / bar));
  const end = s.pickup + bars * bar;
  // Let the last chord ring to the end of an incomplete final bar.
  const last = chords[chords.length - 1];
  if (last && last.start + last.duration === t && t < end) last.duration = end - last.start;
  const out: Section = { id: s.id, name: s.name.trim() || 'Section', kind: s.kind, bars, chords, patternId: s.patternId };
  if (s.pickup) out.pickup = s.pickup;
  if (s.meter) out.meter = s.meter;
  if (lyrics.length) out.lyrics = lyrics;
  if (s.notes.trim()) out.notes = s.notes.trim();
  if (s.tab?.length) out.tab = s.tab;
  return out;
}

/** Build a song; `library` supplies patterns the draft references but does not embed yet. */
export function draftToSong(d: Draft, library: StrumPattern[]): Song {
  const sections = d.sections.map((s) => draftSectionToSection(d, s));
  const used = new Set(sections.map((s) => s.patternId).filter(Boolean) as string[]);
  const pool = [...d.patterns, ...library];
  const patterns: StrumPattern[] = [];
  for (const id of used) {
    const p = pool.find((x) => x.id === id);
    if (p && !patterns.some((x) => x.id === id)) patterns.push(p);
  }
  // Sections pointing at a missing pattern fall back to a default for their meter.
  for (const s of sections) {
    if (!patterns.some((p) => p.id === s.patternId)) {
      const p = patternForMeter(s.meter ?? d.meter);
      s.patternId = p.id;
      if (!patterns.some((x) => x.id === p.id)) patterns.push(p);
    }
  }
  const { sections: _s, form, ...rest } = d;
  void _s;
  const song: Song = { ...rest, title: d.title.trim(), artist: d.artist.trim(), sections, patterns };
  const ids = new Set(sections.map((s) => s.id));
  const f = form?.filter((id) => ids.has(id));
  if (f && f.length) song.form = f;
  else delete song.form;
  return song;
}

export function validateDraft(d: Draft, library: StrumPattern[]): string[] {
  const errs: string[] = [];
  if (!d.title.trim()) errs.push('Give the song a title.');
  d.sections.forEach((s) => {
    s.items.forEach((it, i) => {
      if (!isNoChord(it.chord) && !parseChord(it.chord.trim())) errs.push(`${s.name}: chord ${i + 1} "${it.chord}" isn’t a chord name I know (try G, Em, F#m7, D/F#, Bb, N.C.).`);
    });
    if (!s.items.length) errs.push(`${s.name}: add at least one chord.`);
  });
  if (errs.length) return errs;
  return validateSong(draftToSong(d, library));
}

export function newDraft(): Draft {
  const meter: Meter = { num: 4, den: 4 };
  const bar = barTicks(meter);
  const pattern = 'p-folk-44';
  return {
    id: newId('song'),
    title: '',
    artist: '',
    difficulty: 'beginner',
    genre: 'Pop',
    key: 'G',
    bpm: 90,
    meter,
    tuning: STANDARD,
    capo: 0,
    patterns: [],
    sections: [
      {
        id: 'verse', name: 'Verse', kind: 'verse', patternId: pattern, pickup: 0, notes: '',
        items: ['G', 'D', 'Em', 'C'].map((chord) => ({ key: itemKey(), chord, duration: bar, lyric: '' })),
      },
    ],
    form: null,
    provenance: { kind: 'user', verified: false },
  };
}

export function copyDraft(song: Song): Draft {
  const d = songToDraft(song);
  const fromDemo = song.provenance.kind === 'demo';
  return {
    ...d,
    id: newId('song'),
    title: `${song.title} (copy)`,
    createdAt: undefined,
    updatedAt: undefined,
    provenance: {
      kind: 'user',
      verified: false,
      source: fromDemo ? `Based on the StrumFlow demo “${song.title}”` : song.provenance.source,
      license: song.provenance.license,
    },
  };
}

export function newSection(d: Draft, kind: SectionKind): DraftSection {
  const base = kind === 'pre-chorus' ? 'Pre-chorus' : kind[0].toUpperCase() + kind.slice(1);
  const sameKind = d.sections.filter((s) => s.kind === kind).length;
  const name = sameKind ? `${base} ${sameKind + 1}` : base;
  let id = kind.replace(/[^a-z]/g, '') || 'section';
  let n = 2;
  while (d.sections.some((s) => s.id === id)) id = `${kind.replace(/[^a-z]/g, '')}${n++}`;
  const bar = barTicks(d.meter);
  const key = parseKey(d.key);
  const tonic = key ? keyName(key, 'ascii') : 'G';
  return { id, name, kind, patternId: patternForMeter(d.meter).id, pickup: 0, notes: '', items: [{ key: itemKey(), chord: tonic, duration: bar, lyric: '' }] };
}

export function makeItem(chord: string, duration: number): DraftChord {
  return { key: itemKey(), chord, duration, lyric: '' };
}

/** Lengths offered for a chord in a meter (ticks), shortest first. */
export function durationOptions(meter: Meter): number[] {
  const bar = barTicks(meter);
  const beats = beatsOfBar(meter);
  const kind = meterKind(meter);
  const set = new Set<number>();
  if (kind === 'simple') {
    const b = beats[0].length;
    [0.5, 1, 1.5, 2, 3].forEach((x) => x * b <= bar && set.add(x * b));
  } else {
    const p = pulseTicks(meter);
    for (let k = 1; k * p <= bar; k++) set.add(k * p);
  }
  [1, 1.5, 2, 3, 4, 8].forEach((x) => Number.isInteger(x * bar) && set.add(x * bar));
  return [...set].sort((a, b) => a - b);
}

/** Smallest editing step for chord lengths. */
export function durationStep(meter: Meter): number {
  return meterKind(meter) === 'simple' ? beatsOfBar(meter)[0].length / 2 : pulseTicks(meter);
}

export interface EditorBar {
  number: number;
  isPickup: boolean;
  segments: { item: number; from: number; to: number; held: boolean }[];
}

/** Bars of a draft section with chord segments, for the measure visualisation. */
export function draftBars(meter: Meter, s: DraftSection): EditorBar[] {
  const bar = barTicks(meter);
  const total = s.items.reduce((a, b) => a + b.duration, 0);
  const bars = Math.max(1, Math.ceil(Math.max(0, total - s.pickup) / bar));
  const ranges: { start: number; end: number; length: number; number: number; isPickup: boolean }[] = [];
  if (s.pickup) ranges.push({ start: 0, end: s.pickup, length: s.pickup, number: 0, isPickup: true });
  for (let i = 0; i < bars; i++) ranges.push({ start: s.pickup + i * bar, end: s.pickup + (i + 1) * bar, length: bar, number: i + 1, isPickup: false });
  const spans: { item: number; start: number; end: number }[] = [];
  let t = 0;
  s.items.forEach((it, i) => {
    spans.push({ item: i, start: t, end: t + it.duration });
    t += it.duration;
  });
  // The last chord rings to the end of the final bar.
  if (spans.length) spans[spans.length - 1].end = Math.max(spans[spans.length - 1].end, ranges[ranges.length - 1].end);
  return ranges.map((r) => ({
    number: r.number,
    isPickup: r.isPickup,
    segments: spans
      .filter((sp) => sp.start < r.end && sp.end > r.start)
      .map((sp) => ({ item: sp.item, from: (Math.max(sp.start, r.start) - r.start) / r.length, to: (Math.min(sp.end, r.end) - r.start) / r.length, held: sp.start < r.start })),
  }));
}

/** Transpose every chord in the draft and its key (interval-preserving). */
export function transposeDraft(d: Draft, semis: number): Draft {
  const key = parseKey(d.key);
  if (!key) return d;
  const to = transposeKey(key, semis);
  return {
    ...d,
    key: keyName(to, 'ascii'),
    sections: d.sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, chord: isNoChord(it.chord) || !parseChord(it.chord) ? it.chord : transposeChordSymbol(it.chord, semis, key) })) })),
  };
}

/** Change the song meter; sections whose pattern no longer fits get a matching default. */
export function setDraftMeter(d: Draft, meter: Meter, library: StrumPattern[]): { draft: Draft; reassigned: number } {
  let reassigned = 0;
  const pool = [...d.patterns, ...library];
  const sections = d.sections.map((s) => {
    if (s.meter) return s;
    const p = pool.find((x) => x.id === s.patternId);
    if (p && sameMeter(p.meter, meter)) return s;
    reassigned++;
    return { ...s, patternId: patternForMeter(meter).id };
  });
  return { draft: { ...d, meter, sections }, reassigned };
}

/** Chords for a numeral preset in the draft's key. */
export function presetChords(numerals: string[], keyText: string): string[] {
  const key = parseKey(keyText);
  if (!key) return [];
  return numerals.map((n) => chordFromNumeral(n, key) ?? '?');
}
