/** Beginner-friendly explanations, opened by tapping a term. */
import { useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

export const GLOSSARY: Record<string, { title: string; body: string[] }> = {
  bpm: {
    title: 'Tempo (BPM)',
    body: [
      'BPM means beats per minute — how fast the song goes. 60 BPM is one beat per second.',
      'StrumFlow counts the beat you feel: a quarter note (♩) in 4/4, a dotted quarter (♩.) in 6/8, and an eighth note (♪) in odd meters like 7/8.',
      'Practise slowly first. Lower the tempo until every chord change feels easy, then speed up a few BPM at a time.',
    ],
  },
  meter: {
    title: 'Time signature',
    body: [
      'The time signature tells you how beats are grouped into bars (measures).',
      'The top number is how many counts are in a bar; the bottom number is which note gets one count (4 = quarter note, 8 = eighth note).',
      '4/4: count 1 2 3 4. 3/4: count 1 2 3 (a waltz). 6/8: count 1 2 3 4 5 6 but feel two big beats (1 and 4).',
    ],
  },
  compound: {
    title: 'Compound meter (6/8, 9/8, 12/8)',
    body: [
      'In compound meters each beat is split into three, not two.',
      '6/8 has six eighth notes per bar felt as two beats: ONE-and-a TWO-and-a. Tap your foot twice per bar, not six times.',
    ],
  },
  irregular: {
    title: 'Odd meters (5/4, 7/8…)',
    body: [
      'Odd meters have beats of different lengths. 7/8 is usually counted 1-2, 1-2, 1-2-3: two short groups and one long one.',
      'The metronome clicks at the start of each group, with the first one accented.',
    ],
  },
  capo: {
    title: 'Capo',
    body: [
      'A capo is a clamp across all strings that raises the pitch of the guitar.',
      'With a capo on fret 2 you still play the same chord shapes, but they sound two semitones (one whole step) higher.',
      'The chords shown are the shapes you play. Switch to "Sounding" to see the real pitch.',
    ],
  },
  key: {
    title: 'Key',
    body: [
      'The key is the home note and scale a song is built around. Songs usually start and end on the home chord.',
      'Knowing the key helps you predict which chords will appear: in G major, G, C, D and Em are the most common.',
    ],
  },
  tuning: {
    title: 'Tuning',
    body: [
      'Standard tuning, from the thickest string to the thinnest, is E A D G B E.',
      'Alternate tunings change one or more strings. Drop D lowers the thick E string to D for a deeper sound and easy power chords.',
    ],
  },
  strum: {
    title: 'Strumming pattern',
    body: [
      '↓ D = downstroke: brush the strings from the thickest to the thinnest.',
      '↑ U = upstroke: brush back up, usually catching just the thinner strings.',
      '✕ x = muted strum ("chuck"): lightly rest your fretting hand on the strings so they make a percussive click.',
      '· – = no strum: keep your hand moving, but miss the strings. This keeps your rhythm steady.',
      'Tip: your hand moves down on the numbers (1 2 3 4) and up on the "&"s, even when you skip a strum.',
    ],
  },
  swing: {
    title: 'Swing',
    body: [
      'Swing makes pairs of notes uneven: long–short, long–short, like "hump-ty dump-ty".',
      'The second note of each pair lands two-thirds of the way through the beat instead of halfway.',
    ],
  },
  syncopation: {
    title: 'Syncopation',
    body: [
      'Syncopation means accenting or changing chords off the main beats — on an "&" or an "e"/"a".',
      'It gives music a pushing, funky feel. Count the subdivisions out loud ("1 e & a") while you learn it.',
    ],
  },
  barre: {
    title: 'Barre chord',
    body: [
      'In a barre chord one finger (usually the index) presses several strings at the same fret.',
      'Roll the finger slightly onto its bony side, keep it close to the fret wire, and press with your arm’s weight rather than squeezing with your thumb.',
    ],
  },
  diagram: {
    title: 'Reading a chord diagram',
    body: [
      'Vertical lines are the strings: thickest (low E) on the left, thinnest (high e) on the right.',
      'Horizontal lines are frets. The thick line at the top is the nut; a number like "5fr" means the diagram starts at fret 5.',
      'Dots show where to press, with the finger number inside: 1 index, 2 middle, 3 ring, 4 pinky, T thumb.',
      'O above a string = play it open. ✕ = don’t play it.',
    ],
  },
  pickup: {
    title: 'Pickup',
    body: ['A pickup is a short partial bar before the first full bar — like the "and" before "one". The count starts in the middle of the bar.'],
  },
  transpose: {
    title: 'Transpose',
    body: [
      'Transposing moves every chord up or down by the same number of semitones so the song fits your voice.',
      'StrumFlow keeps each chord’s role in the key, so the harmony stays the same — only the pitch changes.',
      'Tip: instead of transposing to hard chords, keep easy shapes and move a capo.',
    ],
  },
  roman: {
    title: 'Roman numerals',
    body: [
      'Roman numerals describe chords by their position in the key, so a progression works in any key.',
      'Upper case = major (I, IV, V), lower case = minor (ii, iii, vi), ° = diminished. ♭VII is a chord borrowed from outside the key.',
      'I–V–vi–IV is G–D–Em–C in G, and C–G–Am–F in C.',
    ],
  },
  countin: {
    title: 'Count-in',
    body: ['Before playback starts, the metronome clicks one full bar so you can get ready, like a drummer counting "1, 2, 3, 4".'],
  },
  verified: {
    title: 'Where arrangements come from',
    body: [
      'Original demo: an exercise written for StrumFlow. It is not a transcription of any recording.',
      'Your arrangement: something you made in the editor.',
      'Imported: loaded from a file. StrumFlow cannot check where it came from, so it is unverified.',
      'StrumFlow does not include a commercial song catalog. Only add lyrics, chords or tabs you have the right to use.',
    ],
  },
};

export function Term({ id, children, className }: { id: keyof typeof GLOSSARY | string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[id];
  if (!entry) return <span className={className}>{children}</span>;
  return (
    <>
      <button type="button" className={`term ${className ?? ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>
      <Sheet open={open} title={entry.title} onClose={() => setOpen(false)}>
        {entry.body.map((p, i) => (
          <p key={i} className="glossary-p">
            {p}
          </p>
        ))}
      </Sheet>
    </>
  );
}
