/**
 * Built-in demonstration arrangements.
 *
 * Every song here is an ORIGINAL exercise written for StrumFlow (fictional
 * titles, original lyrics where present). None of them is a transcription of a
 * commercial recording. Each one exercises a feature of the engine:
 *
 *   first-light     4/4 beginner, repeated sections, user-style lyrics
 *   harbor-waltz    3/4 waltz
 *   lantern-road    6/8 compound meter, two chords in a 6/8 bar
 *   island-steps    two chord changes inside a bar, dotted 3-3-2 strum
 *   slow-tide       chords sustained across several bars, pickup bar
 *   porch-swing     swing feel, 12-bar blues, split bars
 *   neon-bounce     syncopated 16th strum, anticipated chord change
 *   campfire-changes capo 2, borrowed ♭VII — a transposition exercise
 *   odd-weather     7/8 (2+2+3) with a 5/4 bridge (meter change)
 *   drop-anchor     Drop D tuning, custom chord shapes and tab
 */
import type { Difficulty, LyricFragment, Provenance, Section, SectionKind, Song, TabNote } from './song';
import { parseChart } from './chart';
import { BUILT_IN_PATTERNS } from './patterns';
import { type Meter, barTicks, beatsOfBar, NOTE } from '../music/meter';
import { STANDARD, TUNINGS, type ChordShape } from '../music/guitar';

const DEMO: Provenance = {
  kind: 'demo',
  verified: false,
  source: 'StrumFlow original demonstration',
  note: 'Original practice arrangement written for StrumFlow. It is not a transcription of any recording.',
};

const pats = (...ids: string[]) => ids.map((id) => BUILT_IN_PATTERNS.find((p) => p.id === id)!);

interface SecSpec {
  id: string;
  name: string;
  kind: SectionKind;
  chart: string;
  pattern: string;
  meter?: Meter;
  /** pickup length in beats */
  pickupBeats?: number;
  /** pickup chart (one bar's worth of chord tokens, fitted to the pickup) */
  pickupChord?: string;
  /** One lyric line per bar (empty string for none). */
  lyrics?: string[];
  tab?: TabNote[];
  notes?: string;
}

function section(spec: SecSpec, songMeter: Meter): Section {
  const meter = spec.meter ?? songMeter;
  const beat = beatsOfBar(meter)[0].length;
  const pickup = spec.pickupBeats ? Math.round(spec.pickupBeats * beat) : 0;
  const parsed = parseChart(spec.chart, meter, pickup);
  if (parsed.errors.length) throw new Error(`Demo ${spec.id}: ${parsed.errors.join('; ')}`);
  const chords = pickup ? [{ chord: spec.pickupChord ?? 'N.C.', start: 0, duration: pickup }, ...parsed.chords] : parsed.chords;
  const bar = barTicks(meter);
  const lyrics: LyricFragment[] | undefined = spec.lyrics
    ?.map((text, i) => ({ start: pickup + i * bar, text }))
    .filter((l) => l.text);
  const out: Section = { id: spec.id, name: spec.name, kind: spec.kind, bars: parsed.bars, chords, patternId: spec.pattern };
  if (pickup) out.pickup = pickup;
  if (spec.meter) out.meter = spec.meter;
  if (lyrics?.length) out.lyrics = lyrics;
  if (spec.tab) out.tab = spec.tab;
  if (spec.notes) out.notes = spec.notes;
  return out;
}

interface SongSpec {
  id: string;
  title: string;
  difficulty: Difficulty;
  genre: string;
  key: string;
  bpm: number;
  meter: Meter;
  capo?: number;
  tuning?: (typeof TUNINGS)[number];
  patterns: string[];
  sections: SecSpec[];
  form?: string[];
  shapes?: Record<string, ChordShape>;
  notes: string;
  tags?: string[];
}

function song(spec: SongSpec): Song {
  return {
    id: `demo-${spec.id}`,
    title: spec.title,
    artist: 'StrumFlow Originals',
    difficulty: spec.difficulty,
    genre: spec.genre,
    key: spec.key,
    bpm: spec.bpm,
    meter: spec.meter,
    tuning: spec.tuning ?? STANDARD,
    capo: spec.capo ?? 0,
    // Songs are self-contained: embed every pattern a section uses.
    patterns: pats(...new Set([...spec.patterns, ...spec.sections.map((x) => x.pattern)])),
    sections: spec.sections.map((s) => section(s, spec.meter)),
    form: spec.form,
    shapes: spec.shapes,
    notes: spec.notes,
    tags: spec.tags,
    provenance: DEMO,
  };
}

/** Eighth-note riff on one string: frets separated by spaces, "-" = rest. */
function riff(stringIndex: number, frets: string, startBar: number, meter: Meter, step = NOTE.eighth): TabNote[] {
  const bar = barTicks(meter);
  const out: TabNote[] = [];
  frets.split(/\s+/).forEach((f, i) => {
    if (f === '-' || f === '') return;
    out.push({ start: startBar * bar + i * step, duration: step, string: stringIndex, fret: Number(f) });
  });
  return out;
}

const m44: Meter = { num: 4, den: 4 };

export const DEMO_SONGS: Song[] = [
  song({
    id: 'first-light',
    title: 'First Light',
    difficulty: 'beginner',
    genre: 'Folk pop',
    key: 'G',
    bpm: 80,
    meter: m44,
    patterns: ['p-quarters-44', 'p-folk-44'],
    notes: 'Four open chords — G, D, Em and C — in the order used by countless pop songs (I–V–vi–IV). Start at 60 BPM with "Four downs", then switch to the Campfire strum.',
    tags: ['four-chord', 'open chords'],
    sections: [
      { id: 'intro', name: 'Intro', kind: 'intro', chart: '| G | D | Em | C |', pattern: 'p-quarters-44' },
      {
        id: 'verse', name: 'Verse', kind: 'verse', chart: '| G | D | Em | C | G | D | Em | C |', pattern: 'p-folk-44',
        lyrics: ['Morning comes in slow', 'over the hill', 'coffee on the stove', 'the house is still', 'I pick up the old guitar', 'and count to four', 'every chord a little star', "I'm learning more"],
      },
      {
        id: 'chorus', name: 'Chorus', kind: 'chorus', chart: '| C | G | D | Em | C | G | D | D |', pattern: 'p-folk-44',
        lyrics: ['Strum it down', 'strum it up', 'let the changes', 'fill your cup', 'one more time', 'from the top', 'keep it steady', 'never stop'],
      },
      { id: 'outro', name: 'Outro', kind: 'outro', chart: '| C | G |', pattern: 'p-quarters-44' },
    ],
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
  }),
  song({
    id: 'harbor-waltz',
    title: 'Harbor Waltz',
    difficulty: 'beginner',
    genre: 'Folk',
    key: 'C',
    bpm: 108,
    meter: { num: 3, den: 4 },
    patterns: ['p-waltz-bass-34', 'p-waltz-34'],
    notes: 'A 3/4 waltz: three beats per bar with the weight on beat one. Count "ONE two three" out loud.',
    tags: ['waltz'],
    sections: [
      { id: 'intro', name: 'Intro', kind: 'intro', chart: '| C | G | C | C |', pattern: 'p-waltz-bass-34' },
      { id: 'a', name: 'Verse', kind: 'verse', chart: '| C | C | Am | Am | F | G | C | C |', pattern: 'p-waltz-34' },
      { id: 'b', name: 'Chorus', kind: 'chorus', chart: '| F | F | C | C | Dm | G | C | G |', pattern: 'p-waltz-34' },
    ],
    form: ['intro', 'a', 'b', 'a'],
  }),
  song({
    id: 'lantern-road',
    title: 'Lantern Road',
    difficulty: 'intermediate',
    genre: 'Ballad',
    key: 'D',
    bpm: 58,
    meter: { num: 6, den: 8 },
    patterns: ['p-68-simple', 'p-68-ballad'],
    notes: '6/8 is compound meter: two strong beats per bar, each made of three eighth notes. The BPM counts the dotted-quarter beat (♩.), so 58 BPM means 174 eighth notes per minute. The last bar of the chorus changes chord halfway (G on beat 1, A on beat 2).',
    tags: ['compound meter'],
    sections: [
      { id: 'intro', name: 'Intro', kind: 'intro', chart: '| D | Bm | G | A |', pattern: 'p-68-simple' },
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| D | Bm | G | A | D | Bm | G | A |', pattern: 'p-68-ballad' },
      { id: 'chorus', name: 'Chorus', kind: 'chorus', chart: '| G | D | A | Bm | G | D | Em | G A |', pattern: 'p-68-ballad' },
    ],
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus'],
  }),
  song({
    id: 'island-steps',
    title: 'Island Steps',
    difficulty: 'intermediate',
    genre: 'Reggae pop',
    key: 'C',
    bpm: 100,
    meter: m44,
    patterns: ['p-eighths-44', 'p-dotted-44'],
    notes: 'Two chords in every bar: change on beat 3. The 3-3-2 strum uses dotted-eighth notes, so the change lands on a downstroke.',
    tags: ['two chords per bar', 'dotted rhythm'],
    sections: [
      { id: 'warmup', name: 'Warm-up', kind: 'intro', chart: '| C G | Am F | C G | F F |', pattern: 'p-eighths-44' },
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| C G | Am F | C G | F C | C G | Am F | Dm G | C C |', pattern: 'p-dotted-44' },
    ],
  }),
  song({
    id: 'slow-tide',
    title: 'Slow Tide',
    difficulty: 'beginner',
    genre: 'Ambient',
    key: 'Em',
    bpm: 66,
    meter: m44,
    patterns: ['p-whole-44', 'p-ballad-44'],
    notes: 'Long chords: Em rings for four bars, Cmaj7 for two. The song starts with a one-beat pickup before bar 1, and the last bar of each phrase splits Dsus4 → D.',
    tags: ['sustained chords', 'pickup'],
    sections: [
      { id: 'intro', name: 'Intro', kind: 'intro', chart: '| Em | % | % | % | Cmaj7 | % | G | Dsus4 D |', pattern: 'p-whole-44', pickupBeats: 1, pickupChord: 'N.C.' },
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| Em | % | Cmaj7 | % | G | % | Dsus4 D | D |', pattern: 'p-ballad-44' },
      { id: 'outro', name: 'Outro', kind: 'outro', chart: '| Em | % | % | % |', pattern: 'p-whole-44' },
    ],
  }),
  song({
    id: 'porch-swing',
    title: 'Porch Swing Blues',
    difficulty: 'intermediate',
    genre: 'Blues',
    key: 'E',
    bpm: 92,
    meter: m44,
    patterns: ['p-shuffle-44', 'p-triplet-44'],
    notes: 'A 12-bar blues with a swing feel: each pair of eighth notes is played long–short. Bars 11 and 12 (the turnaround) hold two chords each.',
    tags: ['12-bar blues', 'swing'],
    sections: [
      { id: 'chorus1', name: '12-bar (swing)', kind: 'verse', chart: '| E7 | A7 | E7 | E7 | A7 | A7 | E7 | E7 | B7 | A7 | E7 A7 | E7 B7 |', pattern: 'p-shuffle-44' },
      { id: 'chorus2', name: '12-bar (triplets)', kind: 'verse', chart: '| E7 | A7 | E7 | E7 | A7 | A7 | E7 | E7 | B7 | A7 | E7 A7 | E7 B7 |', pattern: 'p-triplet-44', notes: 'Same chords, rhythm written as triplets.' },
      { id: 'end', name: 'Ending', kind: 'outro', chart: '| E7 |', pattern: 'p-whole-44' },
    ],
  }),
  song({
    id: 'neon-bounce',
    title: 'Neon Bounce',
    difficulty: 'advanced',
    genre: 'Funk pop',
    key: 'Am',
    bpm: 96,
    meter: m44,
    patterns: ['p-eighths-44', 'p-syncopated-16'],
    notes: 'Syncopated sixteenth-note strumming with muted chucks on 2 and 4. In the chorus, G is "pushed": it arrives on the "&" of beat 4, half a beat before the bar line.',
    tags: ['syncopation', 'anticipation'],
    sections: [
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| Am7 | Am7 | Fmaj7 | G | Am7 | Am7 | Fmaj7 | G |', pattern: 'p-syncopated-16' },
      { id: 'chorus', name: 'Chorus', kind: 'chorus', chart: '| C:3.5 G:0.5 | % | Am7 | Fmaj7 | C:3.5 G:0.5 | % | Fmaj7 | E7 |', pattern: 'p-syncopated-16' },
    ],
    form: ['verse', 'chorus', 'verse', 'chorus'],
  }),
  song({
    id: 'campfire-changes',
    title: 'Campfire Changes',
    difficulty: 'intermediate',
    genre: 'Folk rock',
    key: 'G',
    bpm: 100,
    meter: m44,
    capo: 2,
    patterns: ['p-folk-44', 'p-eighths-44'],
    notes: 'Capo on fret 2: you play G-shapes, the song sounds in A. Try the transpose buttons — the F chord is the borrowed ♭VII and stays ♭VII in every key (B♭ in C, C in D, D♭ in E♭).',
    tags: ['capo', 'transpose', 'borrowed chord'],
    sections: [
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| G | D | Em | C | G | D | C | C |', pattern: 'p-folk-44' },
      { id: 'chorus', name: 'Chorus', kind: 'chorus', chart: '| G | F | C | G | G | F | C D |  G |', pattern: 'p-eighths-44' },
    ],
    form: ['verse', 'chorus', 'verse', 'chorus'],
  }),
  song({
    id: 'odd-weather',
    title: 'Odd Weather',
    difficulty: 'advanced',
    genre: 'Prog folk',
    key: 'Dm',
    bpm: 200,
    meter: { num: 7, den: 8, grouping: [2, 2, 3] },
    patterns: ['p-78', 'p-54'],
    notes: '7/8 grouped 2+2+3: count "1-2, 1-2, 1-2-3". The BPM counts eighth notes (♪ = 200). The bridge switches to 5/4 at the same eighth-note speed.',
    tags: ['odd meter', 'meter change'],
    sections: [
      { id: 'verse', name: 'Verse (7/8)', kind: 'verse', chart: '| Dm | Dm | C | C | Bb | Bb | A | A |', pattern: 'p-78' },
      { id: 'bridge', name: 'Bridge (5/4)', kind: 'bridge', chart: '| Gm | Dm | Bb | A |', pattern: 'p-54', meter: { num: 5, den: 4 } },
    ],
    form: ['verse', 'bridge', 'verse'],
  }),
  song({
    id: 'drop-anchor',
    title: 'Drop Anchor',
    difficulty: 'intermediate',
    genre: 'Rock',
    key: 'D',
    bpm: 112,
    meter: m44,
    tuning: TUNINGS.find((t) => t.name === 'Drop D')!,
    patterns: ['p-rock-8ths', 'p-quarters-44'],
    notes: 'Drop D tuning: tune the low E string down to D. Power chords on the three lowest strings become one-finger shapes. The riff section includes an original demonstration tab.',
    tags: ['drop D', 'power chords', 'tab'],
    shapes: {
      D5: { frets: [0, 0, 0, null, null, null], fingers: [0, 0, 0, null, null, null], barres: [], source: 'song', label: 'Drop D open' },
      F5: { frets: [3, 3, 3, null, null, null], fingers: [1, 1, 1, null, null, null], barres: [{ fret: 3, from: 0, to: 2, finger: 1 }], source: 'song', label: 'Drop D · fret 3' },
      G5: { frets: [5, 5, 5, null, null, null], fingers: [1, 1, 1, null, null, null], barres: [{ fret: 5, from: 0, to: 2, finger: 1 }], source: 'song', label: 'Drop D · fret 5' },
      C5: { frets: [null, 3, 5, 5, null, null], fingers: [null, 1, 3, 4, null, null], barres: [], source: 'song', label: 'Root on A string' },
    },
    sections: [
      {
        id: 'riff', name: 'Riff', kind: 'intro', chart: '| D5 | F5 G5 | D5 | C5 G5 |', pattern: 'p-rock-8ths',
        tab: [
          ...riff(0, '0 0 3 0 5 0 3 0', 0, m44),
          ...riff(0, '3 3 3 3 5 5 5 5', 1, m44),
          ...riff(0, '0 0 3 0 5 0 3 0', 2, m44),
          ...riff(1, '3 3 3 3', 3, m44),
          ...riff(0, '- - - - 5 5 5 5', 3, m44),
        ],
        notes: 'Original demonstration riff (not from any recording).',
      },
      { id: 'verse', name: 'Verse', kind: 'verse', chart: '| D5 | D5 | F5 | G5 | D5 | D5 | C5 | G5 |', pattern: 'p-rock-8ths' },
      { id: 'end', name: 'Ending', kind: 'outro', chart: '| D5 |', pattern: 'p-quarters-44' },
    ],
    form: ['riff', 'verse', 'riff', 'end'],
  }),
];

export const isDemoId = (id: string): boolean => id.startsWith('demo-');
