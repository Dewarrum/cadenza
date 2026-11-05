# Cadenza

A browser piano rhythm game: classical pieces, falling notes over four piano-key lanes, real
piano sound from the note data. See [DESIGN.md](DESIGN.md) for the product decisions.

Status: slice S3. Two pieces (Chopin, Nocturne Op. 9 No. 2; Rachmaninoff, Prelude Op. 3 No. 2) on
Easy, Normal and Hard, touch and desktop keys, portrait phone layout, pause and resume, how-to
card. No settings yet.

## Run

```sh
npm install
npm run dev        # http://127.0.0.1:5184
```

Tap or click the title screen (this unlocks audio), wait for the piano to load, pick a tier. Tap
anywhere in a lane, top to bottom; one finger per lane, so chords take several fingers. On a
keyboard **D F J K** are the four lanes and on Easy **Space** hits whichever lane has the next
note. Hold the finger or key down for notes with a tail.

**Esc** or the pause button (top right) pauses; so do switching apps, locking the phone, a call
or anything else that suspends audio. Resume rewinds about 2 s (longer when three beats of the
piece take longer) and counts in three beats; notes already judged stay judged and silent.
Landscape on a phone shows "rotate your phone" and pauses.

## Phone testing

The dev server listens on 127.0.0.1:5184 only (fixed port, `strictPort`). `tailscale serve`
publishes it on the tailnet as https://studio.tail4d4c2e.ts.net:8444.

```sh
npm run dev:tailnet
```

Then open https://studio.tail4d4c2e.ts.net:8444 on a phone that is on the tailnet. HMR works
through that proxy: `dev:tailnet` sets `CADENZA_TAILNET=1`, which pins the HMR socket to
`wss://studio.tail4d4c2e.ts.net:8444` (`server.ws` in `vite.config.ts`), so pages opened on
127.0.0.1:5184 on this Mac also connect through the tailnet. Plain `npm run dev` works through
the proxy too, since Vite takes the socket host and port from the page URL. On iOS the title
screen shows "If you hear nothing, check the mute switch".

`npm run build` writes the static site to `dist/`; `npm run preview` serves it.

URL switches for testing: `?keysound=off` plays the whole piece by itself (hits only score);
`?clock=manual` hands the song clock to `window.__cadenza.advance(ms)` (used by the e2e bot).

## Test

```sh
npm test           # unit tests (node --test): judge, score, lanes, tier rules, overrides, resume
                   # point, and that regenerating the pieces is deterministic and matches pieces/
npm run test:e2e   # builds, serves dist/ with vite preview, then bots play against the built site
```

The e2e run has two projects against the built site: `desktop` plays the Nocturne on Easy with
keys and timing error, and the Rachmaninoff on Hard with a perfect bot (every note must be
Perfect, which proves the chart is hittable: chords, holds next to other lanes' notes, lanes
never struck closer than the judge can separate); `phone` (Pixel 7 viewport, touch) checks the
canvas fills the phone at device resolution, plays the Nocturne on Normal with fingers sent as
CDP touch points, presses its first chord with two fingers, pauses and resumes mid-piece and
checks nothing is judged twice. Both use Playwright's Chromium (`npx playwright install
chromium` if it is missing).

## Add a piece

1. Put the MIDI in `sources/` and next to it a `<name>.meta.json` with the source facts the piece
   file copies: `id` (the piece id), `title`, `composer`, `opus`, `page`, `url`, `engraver`,
   `license`. Record the source in `sources/README.md`.
2. Create `pieces/<id>.overrides.json` for the musical decisions (at least `pickup` if the piece
   starts with an anacrusis), see below.
3. `npm run piece:add -- sources/<name>.mid --id <id>` writes `pieces/<id>.json` and prints the
   report: hands found, notes per tier, average and peak notes/s, chords, holds, lanes histogram,
   level, and warnings (notes dropped for a lane collision, pins struck too soon). Add
   `--show 12-14` to list the chart notes of bars 12-14 per tier with their ids, lanes and holds.
4. Commit `pieces/<id>.json`. Never edit it by hand; fix rules or overrides and regenerate.

`npm run pieces:build` regenerates every piece in `sources/` (the meta file names its id), so a
rule change updates all charts; `npm test` fails while a committed piece file is stale.

### Chart rules (tools/lib/tiers.ts)

All tiers: notes under 80 ms (grace notes, ornaments) are never charted; notes starting within
30 ms form one chord onset. What a tier may chart at each onset, most important note first:

- **Easy**: the right hand's top voice (no higher note sounding at its onset); one note.
- **Normal**: the top two right-hand notes; the lowest left-hand note on bar lines (before the
  second right-hand note) and on the middle beat (beat 3 of 4/4 and 12/8; only when the right
  hand is single). Chords of 2 on beats, single notes between beats.
- **Hard**: the top two right-hand notes and the lowest left-hand note, or the top three
  right-hand notes when the left hand rests. Chords of 3 on beats, 2 between beats.

Thinning to the density cap (Easy 2 notes per 1 s, onsets 300 ms apart; Normal 8 per 2 s, 180 ms;
Hard 13 per 2 s, 100 ms; chord notes count singly, measured in played time) is greedy note by
note: first notes on bar lines, middle beats, beats; then chord notes on bar lines and middle
beats; then first notes on halves and thirds of beats; then the rest. Inside a class the note
farthest from everything already chosen goes next, so dense passages keep an even spread.

Lanes: the top note of an onset takes the rank of its pitch among the pitches within ±1 s, spread
over the four lanes; the rest of a chord takes the adjacent lanes to its left. Rising notes move
right and falling notes left, a repeated pitch keeps its lane, within 1 s a step of n semitones
moves at most ⌈n/3⌉ lanes, and a line that has sat in an edge lane for 2 s takes its rank lane
again. No lane is struck twice within 120 ms: the onset shifts sideways, or the blocked note is
dropped. A note of at least one beat (and 500 ms) is a hold, ending 150 ms before the next note
of its hand or in its lane; a chord plus the holds still down never needs more than 1 (Easy),
2 (Normal) or 3 (Hard) fingers, older holds are cut first.

Level 1-10, in played time: `round(1.3 × (0.35 × average n/s + 0.65 × peak n/s over 4 s) +
2 × chord-note share + hold share)`, clamped.

### Overrides (pieces/<id>.overrides.json)

Musical decisions the rules cannot make; the meta file keeps the facts about the source. Note ids
are `<track>:<tick>:<pitch>` from the MIDI, stable across regenerations (`--show` lists them).
Bars count from the first full bar (the pickup is bar 0), beats from 1, fractions allowed.

```json
{
  "comment": ["why each override below exists"],
  "pickup": "1/8",
  "tempoMap": [
    { "bar": 58, "ratio": 1 },
    { "bar": 61, "beat": 3, "ratio": 0.7, "ramp": true },
    { "bar": 61, "beat": 3, "bpm": 30 }
  ],
  "laneOverrides": { "1:71616:95": 3 },
  "drop": ["1:17236:80"],
  "forceHold": ["2:384:51"],
  "tiers": { "easy": { "tempoFactor": 0.85, "exclude": ["1:2496:73"], "include": ["2:768:39"] } }
}
```

- `pickup`: anacrusis before bar 1 as a note value.
- `tempoMap`: from bar.beat on, the MIDI tempo times `ratio`, or `bpm` beats per minute (dotted
  quarters in compound meters); `ramp` gets there gradually from the previous point. A step
  written after a ramp to the same point takes over there (ritardando, then fermata).
- `laneOverrides`: pin a note's lane on every tier that charts it; its chord moves with it.
- `drop`: never chart these notes (they still sound by themselves).
- `forceHold`: make these notes holds even when shorter than a beat.
- `tiers.<tier>`: `tempoFactor` (default 1.0), `exclude` (never on this tier), `include` (always
  on this tier, before thinning).

## Piano samples

`public/samples/` holds a subset of smplr's SplendidGrandPiano: two velocity layers (PP, MF),
29 roots about every third semitone, opus (`.ogg`) and AAC (`.m4a`, used on Safari).
`npm run samples:fetch` downloads them again (`-- --force` to overwrite).

## Licenses

- Code: MIT, see [LICENSE](LICENSE).
- Music: the MIDI files in `sources/` come from the [Mutopia Project](https://www.mutopiaproject.org).
  Chopin, Nocturne Op. 9 No. 2, engraved by Renato Biolcati Rinaldi, is licensed
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); Rachmaninoff, Prelude Op. 3
  No. 2, engraved by Petro Kostandy, is licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Charts, piece files and
  overrides derived from them (`pieces/`) are under the same licenses.
- Piano samples: Splendid Grand Piano, public-domain Steinway samples released by Akai, SFZ
  edition by [sfzinstruments](https://github.com/sfzinstruments/SplendidGrandPiano), encoded
  for [smplr](https://github.com/danigb/smplr) (MIT).
