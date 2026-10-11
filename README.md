# ChordLab

ChordLab is a mobile-friendly **chord progression generator** for musicians and songwriters. Pick a key, scale, meter, tempo, genre and mood. ChordLab writes a progression based on music theory, plays it back with a metronome, and exports it as a text chart or a MIDI file.

It is a fully client-side web app: no account, no server, and it works offline once loaded. Favorites are stored on your device.

## Features

| Area | What you get |
| --- | --- |
| **Key & scale** | All 12 keys, major or (natural/harmonic) minor, with correct letter spelling (B♭, not A♯, in F major) |
| **Meters** | 2/4, 3/4, 4/4, 5/4, 6/8, 7/8 (2+2+3), 9/8 and 12/8, each with a beat ruler that shows how the bar is grouped |
| **Generator** | Genre templates plus weighted Markov chains of chord functions, with cadences (authentic, plagal, half, loop) |
| **Controls** | 10 genres, 7 moods, complexity 1–5, length 4/8/12/16 bars, 1, 2 or Auto chords per bar |
| **Harmony** | 7ths, 9ths, 6ths, sus2/sus4/7sus4, add9, inversions (slash chords) that smooth the bass line, borrowed chords (iv, ♭VI, ♭VII, ♭III…), secondary dominants (V7/ii), tritone subs, a 12-bar blues form |
| **Notes & shapes** | Notes under every chord, or switch the grid to mini **guitar chord diagrams** or **piano keyboards**; tapping a chord shows a full keyboard of the exact voicing (bass highlighted) and up to three guitar shapes found by a fretboard search (open chords first, barre chords when needed) |
| **Voicings** | Close, Drop 2, or Open/spread, voice-led from chord to chord |
| **Sounds** | Grand piano and acoustic guitar (physical models of struck and plucked strings: no samples, works offline), electric piano, warm pad, organ, with a light room reverb |
| **Play styles** | Sustain, On the beat, Strum (down-strums on beats, up-strums following the meter's grouping) and Arpeggio (Up, Down, Up & down, Fingerpicked, in 8ths or 16ths) |
| **Playback** | Accented metronome with optional subdivisions and count-in; loop; live tempo changes and tap tempo |
| **Editing** | Tap any chord to hear it, regenerate just that chord, change its inversion or chord type, or **lock** it so it survives the next *Generate* |
| **Keep & share** | Save favorites, copy a text chart (with notes and guitar shapes), download `.txt` or a multi-track `.mid` (tempo, time signature, key signature, chord-name markers) |
| **Mobile** | Designed for iPhone: big tap targets, bottom transport bar, bottom sheets, safe-area aware, dark/light mode, *Add to Home Screen* support |

### Tempo convention

| Meter | BPM counts |
| --- | --- |
| 2/4, 3/4, 4/4, 5/4 | quarter notes ♩ |
| 6/8, 9/8, 12/8 | dotted quarters (the felt beat) |
| 7/8 | quarter notes; the final 3-eighth group is 1½ beats long |

## Tech stack

- **Vite** for the dev server and build, plain **JavaScript ES modules** (no framework), and plain CSS
- **Vitest** for unit tests
- **Web Audio API** for sound, so there are no samples to download
- **GitHub Actions** to test, build, and deploy to **GitHub Pages**

## Project structure

```
src/
  theory/         pure music theory (no DOM)
    notes.js          note names, spelling, MIDI ↔ frequency
    scales.js         scales, diatonic triads & sevenths
    chords.js         chord qualities, symbols, Roman numerals, inversions
    roman.js          functional tokens ("bVII", "viio") ↔ chords
    timeSignature.js  meters, beat groups, durations, MIDI meta data
    voicing.js        close / drop-2 / open voicings with voice leading
    guitar.js         guitar chord-shape finder (standard tuning)
  generator/      progression generation (no DOM)
    styles.js         genre & mood tables, Markov transitions
    progression.js    slots → tokens → substitutions → colours → inversions
    random.js         seeded RNG (reproducible tests)
  audio/          playback
    engine.js         AudioContext, iOS unlock, master bus
    models.js         piano (additive struck string) & guitar (Karplus-Strong) renderers
    synth.js          instrument playback, note cache, oscillator synths, metronome click
    patterns.js       arpeggio and strum patterns (pure)
    timeline.js       pure per-eighth-note event timeline
    transport.js      look-ahead scheduler, playhead callbacks
  export/         text.js (chord chart), midi.js (Standard MIDI File writer)
  storage/        favorites.js (localStorage with safe fallbacks)
  ui/             DOM views: controls, progression grid, sheets, toasts
  main.js         app controller that wires everything together
tests/            Vitest suites for theory, meters, generator, exports
```

The theory, generator, timeline and export modules never touch the DOM, so they are tested directly in Node.

## Development

Requires Node 20.19+ (22 recommended).

```bash
npm install
npm run dev        # dev server (also reachable on your LAN for phone testing)
npm test           # run the unit tests once
npm run build      # production build → dist/
npm run preview    # serve the production build
```

## Previewing and publishing from a phone

**Option 1: GitHub Pages (recommended, free, automatic)**

1. In the GitHub app or mobile browser, open the repository, go to **Settings → Pages**, and set **Source** to **GitHub Actions**. You only do this once.
2. Merge the feature branch into `main`, for example by opening a pull request and tapping **Merge**.
3. The *Test, build & deploy* workflow runs the tests, builds the site and publishes it. Track it under the **Actions** tab.
4. Open `https://<your-username>.github.io/<repository-name>/` in Safari.
5. Optional: tap **Share → Add to Home Screen** to install ChordLab like an app.

Every later push to `main` redeploys automatically. Pushes to other branches and pull requests still run the tests and the build, so you can see whether a change is safe before merging.

**Option 2: any static host.** Run `npm run build` and upload the `dist/` folder to Netlify, Vercel or Cloudflare Pages. Asset paths are relative, so it works from any sub-path.

### iPhone audio tips

- Audio starts on your first tap, because iOS requires a user gesture.
- On iOS 17 and later ChordLab asks Safari to play even when the ring/silent switch is on. On older versions, flip the switch off if you hear nothing.
- Exports open the iOS share sheet, so you can save to Files, AirDrop the file, or open the `.mid` in GarageBand.

## Testing

`npm test` covers:

- **Time signatures**: eighths per bar, beat grouping, durations at a given tempo, mid-bar split points, accents, counting labels and MIDI meta bytes for every meter
- **Theory**: spelling, every chord quality, inversions, Roman numerals with figured bass, borrowed and secondary chords, voicing ranges and voice leading
- **Generator**: reproducibility, every genre × mode × meter combination producing valid chords, no back-to-back repeats, diatonic-only output at complexity 1, cadences, the 12-bar blues form, secondary dominants that resolve, locked chords surviving regeneration, single-chord regeneration, refitting to a new meter
- **Guitar shapes**: familiar open chords (C = x32010, Am = x02210, D = xx0232…), barre chords, slash chords, and a playable shape with the right bass note for every chord type in every key
- **Instruments and patterns**: every modelled piano and guitar note is in tune within 12 cents, stays below clipping and decays; arpeggio and strum patterns; the General MIDI program for each sound
- **Exports, storage and timeline**: a parsed round-trip of the MIDI file (headers, tempo, meter, notes, ticks), the text chart, favorites with broken storage, and the playback timeline

## Ideas for later

- Melody and bass-line generator over the progression
- A drum groove
- Exporting arpeggio and strum patterns into the MIDI file
- Shareable links that encode a progression in the URL
- Offline caching with a service worker
