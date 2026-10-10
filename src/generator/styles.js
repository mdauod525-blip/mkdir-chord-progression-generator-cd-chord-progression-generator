/**
 * Genre and mood definitions that steer the generator.
 *
 * Tokens are Roman numerals relative to the MAJOR scale (see theory/roman.js).
 *
 * Genre fields
 *   templates   – idiomatic progressions (cycled to fill the requested length)
 *   templateProb– chance of starting from a template instead of a Markov walk
 *   bias        – multipliers applied to Markov transition targets
 *   seventh     – base probability of 7th chords; seventhStep adds per complexity level
 *   ninth, sus, add9, six – colour-tone probabilities
 *   borrowed, secondary, tritone – substitution probabilities (scaled by complexity)
 *   modal       – allow borrowed chords in the walk even at low complexity
 *   allDominant – blues: major chords become dominant 7ths
 *   endings     – weights for cadence types at the end of a Markov walk
 *   split       – chance of two chords in a bar when harmonic rhythm is "auto"
 */

export const TRANSITIONS = {
  major: {
    I:    { IV: 3, V: 3, vi: 3, ii: 2, iii: 1, bVII: 0.4, iv: 0.2, bVI: 0.3, bIII: 0.15 },
    ii:   { V: 5, viio: 0.6, IV: 1, I: 0.4, iii: 0.5 },
    iii:  { vi: 4, IV: 3, ii: 1 },
    IV:   { V: 4, I: 3, ii: 1, vi: 1.5, iii: 0.5, iv: 0.6, bVII: 0.4 },
    V:    { I: 6, vi: 2.5, IV: 1, iii: 0.4 },
    vi:   { IV: 4, ii: 3, V: 2, iii: 1, I: 1 },
    viio: { I: 5, iii: 1 },
    bVII: { I: 3, IV: 2, bVI: 1 },
    bVI:  { bVII: 3, V: 1, IV: 1, I: 1.5 },
    iv:   { I: 3, V: 2, bVII: 1 },
    bIII: { IV: 2, bVI: 1, bVII: 1, I: 1 },
  },
  minor: {
    i:    { iv: 3, bVI: 3, bVII: 3, v: 1.5, bIII: 2, iio: 1, V: 1, IV: 0.3 },
    iio:  { V: 5, i: 1, v: 1 },
    bIII: { bVI: 3, iv: 2, bVII: 2, i: 1 },
    iv:   { V: 3, i: 2, bVII: 2, bVI: 1, v: 1 },
    v:    { i: 4, bVI: 2, iv: 1 },
    V:    { i: 6, bVI: 2 },
    bVI:  { bVII: 4, iv: 2, bIII: 2, i: 1, iio: 1, V: 1 },
    bVII: { i: 3, bIII: 3, bVI: 2 },
    IV:   { i: 2, bVII: 2, V: 1 },
    viio: { i: 5 },
  },
};

const base = {
  templateProb: 0.5,
  bias: {},
  seventh: 0.05,
  seventhStep: 0.08,
  ninth: 0.2,
  sus: 0.1,
  add9: 0.1,
  six: 0,
  borrowed: 0.15,
  secondary: 0.2,
  tritone: 0,
  modal: false,
  allDominant: false,
  endings: { authentic: 1, plagal: 0.5, half: 0.5, loop: 2 },
  split: 0.2,
  tempo: 100,
};

export const GENRES = {
  pop: {
    ...base,
    label: 'Pop',
    templateProb: 0.65,
    bias: { vi: 1.4, IV: 1.3, V: 1.2, iii: 0.7 },
    sus: 0.15,
    add9: 0.15,
    templates: {
      major: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V'], ['I', 'IV', 'vi', 'V'], ['IV', 'I', 'V', 'vi'], ['I', 'iii', 'vi', 'IV']],
      minor: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVI', 'bVII'], ['i', 'bIII', 'bVII', 'iv']],
    },
    tempo: 104,
  },
  rock: {
    ...base,
    label: 'Rock',
    templateProb: 0.55,
    bias: { IV: 1.4, V: 1.2, bVII: 4, bIII: 2, bVI: 1.5, ii: 0.6, iii: 0.5 },
    seventh: 0,
    seventhStep: 0.04,
    sus: 0.2,
    add9: 0.05,
    borrowed: 0.3,
    secondary: 0.1,
    modal: true,
    endings: { authentic: 1, plagal: 1.5, half: 0.5, loop: 2 },
    templates: {
      major: [['I', 'IV', 'V', 'IV'], ['I', 'bVII', 'IV', 'I'], ['I', 'V', 'bVII', 'IV'], ['I', 'bIII', 'IV', 'V'], ['vi', 'IV', 'I', 'V']],
      minor: [['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bIII', 'bVII', 'iv'], ['i', 'bVI', 'bIII', 'bVII']],
    },
    tempo: 120,
  },
  jazz: {
    ...base,
    label: 'Jazz',
    templateProb: 0.55,
    bias: { ii: 2, V: 1.4, vi: 1.3, iii: 1.2, iio: 2 },
    seventh: 0.9,
    seventhStep: 0.03,
    ninth: 0.45,
    sus: 0.05,
    add9: 0,
    six: 0.25,
    borrowed: 0.15,
    secondary: 0.45,
    tritone: 0.35,
    endings: { authentic: 3, plagal: 0.2, half: 1, loop: 1.5 },
    split: 0.45,
    templates: {
      major: [['ii', 'V', 'I', 'vi'], ['I', 'vi', 'ii', 'V'], ['iii', 'vi', 'ii', 'V'], ['I', 'IV', 'iii', 'vi', 'ii', 'V', 'I', 'V'], ['ii', 'V', 'iii', 'vi']],
      minor: [['iio', 'V', 'i', 'bVI'], ['i', 'iv', 'iio', 'V'], ['i', 'bVI', 'iio', 'V'], ['iv', 'bVII', 'bIII', 'bVI', 'iio', 'V', 'i', 'V']],
    },
    tempo: 132,
  },
  blues: {
    ...base,
    label: 'Blues',
    templateProb: 0.8,
    bias: { IV: 2, V: 1.5, I: 1.2, iv: 2, v: 1.5, ii: 0.3, iii: 0.2, vi: 0.4 },
    seventh: 1,
    seventhStep: 0,
    ninth: 0.3,
    sus: 0,
    add9: 0,
    borrowed: 0.05,
    secondary: 0.15,
    allDominant: true,
    endings: { authentic: 2, plagal: 1, half: 2, loop: 1 },
    templates: {
      major: [['I', 'IV', 'I', 'V'], ['I', 'IV', 'V', 'IV']],
      minor: [['i', 'iv', 'i', 'v'], ['i', 'iv', 'v', 'iv']],
    },
    tempo: 92,
  },
  rnb: {
    ...base,
    label: 'R&B / Soul',
    templateProb: 0.55,
    bias: { ii: 1.5, iii: 1.4, IV: 1.3, vi: 1.2 },
    seventh: 0.65,
    seventhStep: 0.07,
    ninth: 0.45,
    sus: 0.12,
    add9: 0.1,
    borrowed: 0.25,
    secondary: 0.3,
    tritone: 0.1,
    split: 0.3,
    templates: {
      major: [['IV', 'iii', 'ii', 'I'], ['ii', 'iii', 'IV', 'V'], ['I', 'vi', 'ii', 'V'], ['IV', 'V', 'iii', 'vi'], ['vi', 'ii', 'V', 'I']],
      minor: [['i', 'iv', 'bVII', 'bIII'], ['i', 'bVI', 'iv', 'V'], ['iv', 'v', 'bVI', 'bVII']],
    },
    tempo: 84,
  },
  folk: {
    ...base,
    label: 'Folk / Country',
    templateProb: 0.55,
    bias: { IV: 1.6, V: 1.5, I: 1.2, ii: 0.8, iii: 0.5, bVII: 1.2 },
    seventh: 0,
    seventhStep: 0.04,
    sus: 0.2,
    add9: 0.1,
    six: 0.08,
    borrowed: 0.1,
    secondary: 0.25,
    endings: { authentic: 3, plagal: 1, half: 0.5, loop: 1 },
    templates: {
      major: [['I', 'IV', 'I', 'V'], ['I', 'V', 'vi', 'IV'], ['I', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V'], ['I', 'ii', 'IV', 'V']],
      minor: [['i', 'bVII', 'bVI', 'bVII'], ['i', 'bIII', 'bVII', 'iv'], ['i', 'bVII', 'i', 'v']],
    },
    tempo: 96,
  },
  classical: {
    ...base,
    label: 'Classical',
    templateProb: 0.35,
    bias: { ii: 1.3, V: 1.4, IV: 1.2, viio: 1.5, iio: 1.5, v: 0.3, bVII: 0.3 },
    seventh: 0,
    seventhStep: 0.05,
    ninth: 0,
    sus: 0.05,
    add9: 0,
    borrowed: 0.12,
    secondary: 0.4,
    endings: { authentic: 5, plagal: 1, half: 1.5, loop: 0 },
    split: 0.35,
    templates: {
      major: [['I', 'vi', 'IV', 'V'], ['I', 'ii', 'V', 'vi'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], ['I', 'IV', 'viio', 'iii', 'vi', 'ii', 'V', 'I']],
      minor: [['i', 'iv', 'V', 'i'], ['i', 'bVI', 'iv', 'V'], ['i', 'bVII', 'bVI', 'V'], ['i', 'iv', 'bVII', 'bIII', 'bVI', 'iio', 'V', 'i']],
    },
    tempo: 88,
  },
  lofi: {
    ...base,
    label: 'Lo-fi / Neo-soul',
    templateProb: 0.5,
    bias: { ii: 1.6, iii: 1.3, IV: 1.3, vi: 1.3, iv: 1.5 },
    seventh: 0.85,
    seventhStep: 0.03,
    ninth: 0.55,
    sus: 0.08,
    add9: 0.15,
    borrowed: 0.3,
    secondary: 0.3,
    tritone: 0.1,
    split: 0.25,
    templates: {
      major: [['ii', 'V', 'I', 'vi'], ['IV', 'iii', 'vi', 'ii'], ['I', 'iii', 'IV', 'iv'], ['vi', 'ii', 'V', 'I'], ['IV', 'iii', 'ii', 'I']],
      minor: [['i', 'iv', 'bVII', 'bIII'], ['iv', 'bVII', 'i', 'bVI'], ['i', 'bVI', 'iv', 'V']],
    },
    tempo: 78,
  },
  edm: {
    ...base,
    label: 'EDM',
    templateProb: 0.75,
    bias: { vi: 1.6, IV: 1.4, I: 1.1, V: 1.2, bVI: 1.4, bVII: 1.4 },
    seventh: 0,
    seventhStep: 0.03,
    sus: 0.2,
    add9: 0.12,
    borrowed: 0.15,
    secondary: 0.05,
    modal: true,
    endings: { authentic: 0.5, plagal: 0.5, half: 1, loop: 4 },
    split: 0.1,
    templates: {
      major: [['vi', 'IV', 'I', 'V'], ['I', 'V', 'vi', 'IV'], ['vi', 'V', 'IV', 'V'], ['IV', 'V', 'vi', 'I']],
      minor: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVII', 'bVI', 'bVII'], ['bVI', 'bVII', 'i', 'v'], ['i', 'bVI', 'bVII', 'v']],
    },
    tempo: 126,
  },
  cinematic: {
    ...base,
    label: 'Cinematic',
    templateProb: 0.5,
    bias: { bVI: 2, bVII: 1.8, iv: 1.6, IV: 1.3, iii: 1.2, bIII: 1.5 },
    seventh: 0.05,
    seventhStep: 0.05,
    sus: 0.25,
    add9: 0.2,
    borrowed: 0.35,
    secondary: 0.15,
    modal: true,
    endings: { authentic: 1.5, plagal: 2, half: 1, loop: 1 },
    templates: {
      major: [['I', 'bVI', 'bVII', 'I'], ['I', 'iii', 'IV', 'iv'], ['vi', 'IV', 'I', 'V'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']],
      minor: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVI', 'iv', 'V'], ['i', 'bIII', 'bVII', 'bVI'], ['i', 'v', 'bVI', 'bIII', 'iv', 'i', 'iv', 'V']],
    },
    tempo: 80,
  },
};

/**
 * Mood fields
 *   bias      – token multipliers (applied to Markov targets and template scoring)
 *   seventh, sus, add9, borrowed – additive probability adjustments
 *   prefer    – optional preferred colour ('maj7' makes major 7ths more likely, etc.)
 */
export const MOODS = {
  neutral:  { label: 'Balanced', bias: {}, seventh: 0, sus: 0, add9: 0, borrowed: 0 },
  happy:    { label: 'Happy', bias: { I: 1.3, IV: 1.4, V: 1.3, vi: 0.8, iii: 0.7, iv: 0.5, bVI: 0.7 }, seventh: 0, sus: 0.05, add9: 0.08, borrowed: -0.05 },
  sad:      { label: 'Sad / melancholic', bias: { vi: 1.6, ii: 1.3, iii: 1.3, iv: 1.8, bVI: 1.5, I: 0.8, i: 1.2 }, seventh: 0.1, sus: 0, add9: 0.05, borrowed: 0.15 },
  dreamy:   { label: 'Dreamy', bias: { IV: 1.5, vi: 1.2, iii: 1.3, ii: 1.2, bVI: 1.3, bIII: 1.3 }, seventh: 0.3, sus: 0.1, add9: 0.2, borrowed: 0.05, prefer: 'maj7' },
  tense:    { label: 'Tense / dark', bias: { V: 1.4, viio: 2, iio: 2, bVI: 1.4, iv: 1.4, v: 1.3, I: 0.8 }, seventh: 0.1, sus: 0.05, add9: 0, borrowed: 0.15 },
  epic:     { label: 'Epic / triumphant', bias: { bVI: 2, bVII: 2, IV: 1.4, I: 1.2, i: 1.2, ii: 0.6, iii: 0.6 }, seventh: -0.1, sus: 0.15, add9: 0.05, borrowed: 0.2 },
  chill:    { label: 'Chill / mellow', bias: { ii: 1.4, vi: 1.3, IV: 1.3, iii: 1.2 }, seventh: 0.35, sus: 0.05, add9: 0.1, borrowed: 0.05 },
};

export const GENRE_IDS = Object.keys(GENRES);
export const MOOD_IDS = Object.keys(MOODS);
