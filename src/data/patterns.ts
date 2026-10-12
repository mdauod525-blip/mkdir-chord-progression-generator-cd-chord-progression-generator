/**
 * Built-in strumming patterns. These are generic practice patterns, not
 * transcriptions of any particular recording.
 */
import { NOTE, type Meter } from '../music/meter';
import type { Stroke, StrumPattern } from '../music/strum';

const m = (num: number, den: number, grouping?: number[]): Meter => (grouping ? { num, den, grouping } : { num, den });
const s = (text: string): Stroke[] => text.split(/\s+/).filter(Boolean).map((c) => (c === '–' ? '-' : c) as Stroke);

export const BUILT_IN_PATTERNS: StrumPattern[] = [
  {
    id: 'p-quarters-44', name: 'Four downs', meter: m(4, 4), step: NOTE.quarter, steps: s('D D D D'), accents: [0],
    difficulty: 'beginner', description: 'A downstroke on every beat. Start every new song with this.',
  },
  {
    id: 'p-whole-44', name: 'Let it ring', meter: m(4, 4), step: NOTE.quarter, steps: s('D - - -'), accents: [0],
    difficulty: 'beginner', description: 'One strum per bar; let the chord ring for four beats.',
  },
  {
    id: 'p-eighths-44', name: 'Steady eighths', meter: m(4, 4), step: NOTE.eighth, steps: s('D U D U D U D U'), accents: [0, 4],
    difficulty: 'beginner', description: 'Down on the numbers, up on the "&"s. Keep your arm moving like a pendulum.',
  },
  {
    id: 'p-folk-44', name: 'Campfire', meter: m(4, 4), step: NOTE.eighth, steps: s('D - D U - U D U'), accents: [0],
    difficulty: 'beginner', description: 'The classic folk-pop strum. On the "-" cells your hand still moves but misses the strings.',
  },
  {
    id: 'p-ballad-44', name: 'Steady ballad', meter: m(4, 4), step: NOTE.eighth, steps: s('D - D U D - D U'), accents: [0, 4],
    difficulty: 'beginner', description: 'Gentle pattern for slower songs.',
  },
  {
    id: 'p-dotted-44', name: 'Island 3-3-2', meter: m(4, 4), step: NOTE.sixteenth, steps: s('D - - U - - D - D - - U - - D -'), accents: [0, 6, 8],
    difficulty: 'intermediate', description: 'Dotted-eighth groupings (3+3+2 sixteenths) give a bouncing, tropical feel.',
  },
  {
    id: 'p-syncopated-16', name: 'Funk push', meter: m(4, 4), step: NOTE.sixteenth, steps: s('D - - U x - D U - U D - x - D U'), accents: [0, 4, 12],
    difficulty: 'advanced', description: 'Syncopated sixteenths with muted "chucks" (x) on beats 2 and 4. Keep your hand moving in sixteenths.',
  },
  {
    id: 'p-shuffle-44', name: 'Swing shuffle', meter: m(4, 4), step: NOTE.eighth, steps: s('D U D U D U D U'), accents: [2, 6], feel: 'swing', swingRatio: 2 / 3,
    difficulty: 'intermediate', description: 'Swung eighths: long–short, long–short. Accents on 2 and 4.',
  },
  {
    id: 'p-triplet-44', name: 'Triplet shuffle', meter: m(4, 4), step: NOTE.tripletEighth, steps: s('D - U D - U D - U D - U'), accents: [0, 6],
    difficulty: 'intermediate', description: 'Eighth-note triplets with the middle note skipped — the shuffle written out.',
  },
  {
    id: 'p-rock-8ths', name: 'Driving downs', meter: m(4, 4), step: NOTE.eighth, steps: s('D D D D D D D D'), accents: [0, 2, 4, 6],
    difficulty: 'intermediate', description: 'All downstrokes in eighths for a punchy rock feel.',
  },
  {
    id: 'p-waltz-34', name: 'Waltz', meter: m(3, 4), step: NOTE.eighth, steps: s('D - D U D U'), accents: [0],
    difficulty: 'beginner', description: 'Strong first beat, lighter beats 2 and 3: ONE two three.',
  },
  {
    id: 'p-waltz-bass-34', name: 'Waltz downs', meter: m(3, 4), step: NOTE.quarter, steps: s('D D D'), accents: [0],
    difficulty: 'beginner', description: 'Three downstrokes, accent on one.',
  },
  {
    id: 'p-polka-24', name: 'Two-step', meter: m(2, 4), step: NOTE.eighth, steps: s('D - D U'), accents: [0],
    difficulty: 'beginner', description: 'Quick two-beat feel for marches, polkas and country two-steps.',
  },
  {
    id: 'p-54', name: '3 + 2', meter: m(5, 4), step: NOTE.eighth, steps: s('D - D U D U D - D U'), accents: [0, 6],
    difficulty: 'advanced', description: 'Five beats felt as 3 + 2.',
  },
  {
    id: 'p-68-simple', name: '6/8 pulse', meter: m(6, 8), step: NOTE.eighth, steps: s('D - - D - -'), accents: [0],
    difficulty: 'beginner', description: 'Two big beats per bar, each split into three: ONE two three FOUR five six.',
  },
  {
    id: 'p-68-ballad', name: '6/8 ballad', meter: m(6, 8), step: NOTE.eighth, steps: s('D D U D D U'), accents: [0, 3],
    difficulty: 'intermediate', description: 'Down–down–up in each group of three.',
  },
  {
    id: 'p-78', name: '7/8 (2+2+3)', meter: m(7, 8, [2, 2, 3]), step: NOTE.eighth, steps: s('D - D - D - U'), accents: [0, 2, 4],
    difficulty: 'advanced', description: 'Count 1-2, 1-2, 1-2-3. The last group is longer.',
  },
  {
    id: 'p-98', name: '9/8 lilt', meter: m(9, 8), step: NOTE.eighth, steps: s('D - U D - U D U U'), accents: [0, 3, 6],
    difficulty: 'intermediate', description: 'Three dotted beats per bar.',
  },
  {
    id: 'p-128', name: '12/8 slow blues', meter: m(12, 8), step: NOTE.eighth, steps: s('D - U D - U D - U D - U'), accents: [0, 3, 6, 9],
    difficulty: 'intermediate', description: 'Four dotted beats, each a triplet.',
  },
];

export const builtInPattern = (id: string): StrumPattern | undefined => BUILT_IN_PATTERNS.find((p) => p.id === id);
