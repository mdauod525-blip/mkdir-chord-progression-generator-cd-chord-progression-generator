# StrumFlow arrangement format (v1)

StrumFlow imports and exports songs as JSON. The TypeScript source of truth is
[`src/data/song.ts`](../src/data/song.ts); validation lives in
[`src/data/validate.ts`](../src/data/validate.ts).

## File wrappers

```jsonc
{ "format": "strumflow.song", "version": 1, "song": { /* Song */ } }
{ "format": "strumflow.library", "version": 1, "songs": [ /* Song */ ], "patterns": [ /* StrumPattern */ ] }
```

A bare `Song` object or an array of songs is also accepted.

## Musical time: ticks

All positions and lengths are **integer ticks**, 960 per quarter note:

| Note | Ticks |
| --- | --- |
| whole | 3840 |
| half | 1920 |
| quarter | 960 |
| dotted quarter | 1440 |
| eighth | 480 |
| eighth triplet | 320 |
| sixteenth | 240 |

A bar of 4/4 is 3840 ticks, 3/4 is 2880, 6/8 is 2880, 7/8 is 3360.
Integers never drift, however long the song is.

## Song

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | unique |
| `title`, `artist`, `genre` | string | |
| `difficulty` | `"beginner"` \| `"intermediate"` \| `"advanced"` | |
| `key` | string | key of the chord **shapes as written**, e.g. `"G"`, `"Em"`, `"Bb"` |
| `bpm` | number | counted in the meter's beat: ♩ in 4/4, ♩. in 6/8/9/8/12/8, ♪ in 5/8 and 7/8 |
| `meter` | `{ "num": 6, "den": 8, "grouping"?: [3,3] }` | `grouping` splits the bar into beats in units of 1/den (e.g. 7/8 = `[2,2,3]`) |
| `tuning` | `{ "name": "Drop D", "notes": [38,45,50,55,59,64] }` | MIDI note numbers, low string first |
| `capo` | 0–12 | chords are written as shapes relative to the capo; the sounding key is `key` + `capo` semitones |
| `patterns` | StrumPattern[] | every pattern a section uses (songs are self-contained) |
| `sections` | Section[] | |
| `form` | string[] (optional) | play order by section id; repeats allowed, e.g. `["intro","verse","chorus","verse","chorus"]` |
| `shapes` | `{ [chord]: ChordShape }` (optional) | custom shapes, e.g. for alternate tunings |
| `notes`, `tags` | optional | |
| `provenance` | `{ "kind": "user" \| "imported" \| "licensed" \| "demo", "verified": false, "source"?, "license"?, "note"? }` | imports are always stored as unverified |

## Section

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `name` | string | |
| `kind` | `intro` `verse` `pre-chorus` `chorus` `bridge` `solo` `interlude` `outro` `other` | |
| `bars` | integer | full bars, excluding any pickup |
| `pickup` | ticks (optional) | anacrusis before bar 1; tick 0 is the start of the pickup |
| `meter` | Meter (optional) | overrides the song meter (tempo stays the same in quarter notes) |
| `chords` | `{ "chord": "D/F#", "start": 0, "duration": 1920 }[]` | starts are relative to the section; gaps mean "no chord"; `"N.C."` is allowed; chords may not overlap |
| `patternId` | string | id in `song.patterns` |
| `lyrics` | `{ "start": ticks, "text": "..." }[]` (optional) | only your own or licensed lyrics |
| `tab` | `{ "start", "duration", "string" (0 = low E … 5 = high e), "fret" }[]` (optional) | only real tab data you have rights to |

## StrumPattern

```json
{
  "id": "my-folk",
  "name": "Campfire",
  "meter": { "num": 4, "den": 4 },
  "step": 480,
  "steps": ["D", "-", "D", "U", "-", "U", "D", "U"],
  "accents": [0],
  "feel": "straight"
}
```

`D` downstroke, `U` upstroke, `x` muted/percussive strum, `-` no strum (the chord keeps ringing).
`step` is the grid (960 quarter, 480 eighth, 240 sixteenth, 320 eighth triplet); dotted rhythms are
written on a finer grid (`D - - U` on sixteenths = dotted eighth + sixteenth). `feel: "swing"` delays
every second cell of a pair to the triplet position. The pattern length must fill whole bars (or divide
a bar evenly); it repeats from bar 1 of each section.

## Plain-text chord sheets

The importer also reads text like:

```
Title: Paper Boats
Key: D
BPM: 72
Time: 3/4
Capo: 2

[Verse]
| D | A | Bm G | G |

[Chorus]
G         D
words under the chords
```

Bar-line rows carry exact timing: chords in a bar share it equally, `.` holds the previous chord for one
share, `%` holds it for a bar, and `Am:3.5 F:0.5` gives lengths in beats. Chords written above lyrics have
no rhythm, so each one gets a bar (you are told, and can fix it in the editor).
