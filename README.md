# StrumFlow

A mobile-first guitar song learning app. Open a song and see exactly **which chord to play, when it
changes, what the time signature is, and how to strum** — with a synchronized practice player,
metronome, looping and transposition. Runs entirely in the browser: no account, no server.

The repository also contains **ChordLab**, the earlier chord progression generator, served at
`/chordlab/` and linked from StrumFlow.

> **PositionScope** — a separate, self-contained Next.js stock-research app for position trading
> (scanner, charts, support/resistance, valuation, alerts, paper trading) — lives in
> [`positionscope/`](positionscope/README.md). It has its own `package.json` and does not affect StrumFlow.

## What works

- **Home**: search, recently played, favorites, levels, suggestions by difficulty and style, quick practice, create a song.
- **Library**: search plus filters for difficulty, style, key, time signature, tempo range, standard/alternate tuning, beginner-friendly and source. Every song is labelled *Original demo*, *Your arrangement* or *Imported · unverified*.
- **Learning screen**: title/artist, difficulty, key (and sounding key with capo), BPM, meter, tuning, capo, length, provenance. Three views:
  - *Chord sheet*: sections, bars, chords sized by duration (two chords in a bar, chords held over several bars, pickups), beat ticks, lyrics when present.
  - *Beat by beat*: big current chord + diagram, next chord and how many beats until it changes, tappable beats, the strum pattern, upcoming bars.
  - *Tab*: only when the arrangement contains real tab data (the Drop D demo has an original riff); otherwise disabled and labelled.
- **Practice controls** (fixed bottom bar): play/pause, restart, tempo −/+ with % of song tempo, metronome, loop, full-screen practice (keeps the screen awake where supported). Plus transpose, chord/strum/Roman-numeral toggles, shapes vs sounding names with a capo, count-in, subdivision clicks, per-beat accents, generated practice guitar on/off, volumes, and a speed trainer that raises the tempo after every N loops.
- **Looping**: a section, a bar and the next, any bar range (tap first and last bar), or the whole song. Tap any bar or beat to start from there.
- **Chord diagrams** from structured shape data: strings, frets, finger numbers, open/muted markers, barres, fret position. Tap for a large view with alternative voicings, notes, step-by-step fingering, an explanation, and audio.
- **Strumming patterns**: ↓ / ↑ / ✕ / · on a beat grid with counts (1 & 2 &, 1 e & a, 1 & a 2 & a), accents, swing, triplets, dotted rhythms; animated in sync; "Hear it" preview; a library of built-in patterns; create/edit/save your own; change a section's pattern without touching its chords.
- **Editor**: title, artist, key, BPM, time signature (with 2+2+3 style groupings), tuning, capo, difficulty, sections with chord lists and lengths, measure view, diatonic chord palette, progression ideas computed in your key (I–V–vi–IV, vi–IV–I–V…), bar-chart text entry, Roman numerals, pickups, per-section meters, lyrics, play order with repeats, preview, save, duplicate, delete.
- **Import/export**: JSON ([format](docs/ARRANGEMENT_FORMAT.md)) and plain-text chord sheets, with clear error messages. Library export from Settings.
- **Installable PWA** with offline caching, dark practice theme and a light theme.

## Timing model

- Musical time is **integer ticks** (960 per quarter note), so there is no floating-point drift.
- Meters have a numerator, denominator and beat grouping: 6/8 is two dotted-quarter beats, 7/8 is 2+2+3.
  BPM counts the felt beat (♩ in 4/4, ♩. in 6/8, ♪ in 7/8).
- A song is flattened once into a **timeline** (bars, sections, chords in absolute ticks). The audio
  scheduler, chord highlighting, strum animation and bar counter all read from it.
- The **transport** schedules audio ahead of time on the Web Audio clock (look-ahead scheduling,
  driven by a Web Worker timer). Time→tick is a list of anchors added at the scheduling frontier on
  start, tempo change and loop wrap, so the UI and audio share one map and cannot drift. When the
  tab is hidden it schedules further ahead; if the timer still falls behind, it skips stale notes
  instead of playing a burst, and the position stays correct.
- Audio starts only after a tap (iOS/Chrome autoplay rules). The practice guitar is synthesized from
  the chord shapes on screen; it is **not** a recording of any song.

## Songs and copyright

StrumFlow ships **ten original demo arrangements** with fictional titles (4/4, 3/4 waltz, 6/8, two
chords per bar, multi-bar chords and a pickup, swing blues, syncopated 16ths with an anticipation,
capo + borrowed ♭VII for transposing, 7/8 with a 5/4 bridge, Drop D with an original tab riff). None of
them is a transcription of a commercial recording, and nothing is marked verified.
There is no song catalog or online search; add songs you have the right to use. Imports are always
marked unverified. User data is stored separately from the built-in demos.

## Project structure

```
src/
  music/      pure theory & timing: meter, notes, chords, keys (transpose, Roman numerals),
              guitar (tunings, shape library, movable forms, fretboard search), strum, timeline
  data/       song model, demos, patterns, chart notation, validation, import/export, library filters
  audio/      Web Audio engine, plucked-string synth, look-ahead transport, worker ticker
  player/     Player: timeline + transport + settings → snapshots for React
  storage/    key-value store interface, localStorage backend, repositories
  editor/     editor draft model (chord list ⇄ timed events)
  state/      app store, hash router
  practice/   learning-screen components
  screens/    Home, Library, SongScreen, Editor, Patterns, Settings
  ui/         chord diagram, strum pattern, sheets, glossary, icons
tests/        Vitest suites (StrumFlow)
chordlab/     ChordLab app and its tests
```

The storage layer is an interface (`KeyValueStore` + repositories), so a database and accounts can be
added later without touching the UI.

## Development

Requires Node 20.19+ (22 recommended).

```bash
npm install
npm run dev        # dev server, also reachable from your phone on the same Wi-Fi
npm test           # unit tests (StrumFlow + ChordLab)
npm run typecheck
npm run build      # typecheck + production build → dist/
npm run preview
```

## Publishing from a phone (GitHub Pages)

1. In the GitHub app or mobile browser: **Settings → Pages → Source: GitHub Actions** (once).
2. Merge the branch into `main` (open a pull request and tap **Merge**).
3. The *Test, build & deploy* workflow tests, builds and publishes. Open
   `https://<your-username>.github.io/<repository-name>/` in Safari, then **Share → Add to Home Screen**.

## Planned (not built yet)

- Tab editing in the editor (tab data is displayed and preserved, not edited).
- Accounts / cloud sync and licensed catalog integrations (the storage and provenance model are ready for them).
