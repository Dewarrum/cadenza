# Cadenza

A browser piano rhythm game: classical pieces, falling notes over four piano-key lanes, real
piano sound from the note data. See [DESIGN.md](DESIGN.md) for the product decisions.

Status: slice S5. Two pieces (Chopin, Nocturne Op. 9 No. 2; Rachmaninoff, Prelude Op. 3 No. 2) on
Easy, Normal and Hard, touch and desktop keys, portrait phone layout, pause and resume, how-to
card, settings with audio offset calibration, best results, installable PWA that plays offline,
and the visual design (see Look).

## Run

```sh
npm install
npm run dev        # http://127.0.0.1:5184
```

Tap or click the title screen (this unlocks audio), wait for the piano to load, pick a tier. Tap
anywhere in a lane, top to bottom; one finger per lane, so chords take several fingers. On a
keyboard **D F J K** are the four lanes (rebind them in Settings) and on Easy **Space** hits whichever lane has the next
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

URL switches for testing: `?keysound=off` plays the whole piece by itself (hits only score),
whatever the Key sound setting says; `?clock=manual` hands the song clock to
`window.__cadenza.advance(ms)` (used by the e2e bot).

## Settings

**Settings** on the piece list or in the pause overlay. Every change is saved at once in
localStorage under `cadenza.settings.v1` (one JSON object; a missing or broken value falls back
to its default, unknown fields are dropped):

- **Audio offset**: see Calibration below. The − / + buttons step it by 5 ms (±400 ms around the
  device latency).
- **Approach time**: how long a note takes to fall to the line. **Per tier** (the default): Easy
  1.5 s, Normal and Hard 1.2 s. **Same for all**: one time for every tier, set with the slider
  (0.8-2.5 s), which starts from the time in effect for the tier being played (from the pause
  overlay) or last played, else Easy's. The slider only shows in that mode; the value next to the
  label is the time in effect.
- **Volume**: master volume, applies at once, also to a paused piece.
- **Key sound**: off = the whole piece plays by itself and hits only score. From the next play.
- **Keys**: click a lane, press a key. A key already on another lane is refused, and so are Space
  (any lane on Easy), Esc (pause), Enter, Tab and the modifier keys. Defaults D F J K.
- **Show how-to card again**, **Clear all results** (asks first, in an in-app dialog).

Best results live under `cadenza.results.v1`: per piece and tier the best accuracy, its grade
and date, whether any run was a full combo, the max combo and the play count. The piece list
shows the best grade on each tier button (`· FC` for a full combo); the results screen says
"New best" (with the previous best) or shows the best to beat, and offers Retry and Back to
pieces.

## Calibration

Settings → **Calibrate** → tap the pad (or press a key) to start. Four clicks count in, then
sixteen clicks at 100 bpm; tap the pad, or press any key, on each click. The clicks go through
the same Web Audio output path as the piano, and each tap's time is its event timestamp mapped
onto the audio clock, as during play. The result is the median of the tap delays after
dropping strays (more than three robust standard deviations, at least 30 ms, from the median;
at least 8 taps must remain). Apply, Retry or Cancel. Leaving the app, locking the phone or the
audio context stopping ends a run at once and measures nothing.

Sign convention: **a positive offset means your taps land late (after the sound), and the
judge subtracts the offset from every tap**, so with +40 ms a tap 40 ms after a note's time is
Perfect. The offset moves the judgement windows only; notes are drawn where they always are.

The game clock already compensates the output latency the browser reports
(`AudioContext.outputLatency`, or `baseLatency`), so the offset shown in the settings is that
reported latency (the starting value before any calibration) plus what calibration or the
stepper measured on top of it. Only the measured part is stored (`audioOffsetMs`, `null` until
calibrated), so a device that reports a different latency later (other headphones) keeps the
right total.

## Offline and updates (PWA)

`npm run build` also writes a web manifest (Cadenza, portrait, standalone, dark theme) and a
Workbox service worker (vite-plugin-pwa, configured in `vite.config.ts`):

- The app shell and both piece files are precached. Piece files are separate assets (the
  `virtual:pieces` catalogue in `vite.config.ts` carries only titles and levels), fetched when a
  tier is picked.
- Piano samples are cached at runtime, cache-first, for a year, in the Cache Storage cache
  `SAMPLES_CACHE` (`src/audio/samples.ts`); only the format the browser plays is stored. The
  piano loader writes that cache itself as well, so one complete load is enough to play offline
  even on a first visit, before the service worker controls the page. The piece list says
  "Piano ready · works offline" once the full set is cached.
- A new version waits until the app is next launched. When one turns up while the app is open
  (checked at load and whenever the app returns to the foreground), an "Update available ·
  Reload" toast offers to switch now. The toast never shows over the play screen.

Bumping caches: the precache is revisioned by the build, so app code and piece changes reach
players with the next deploy without any manual step. When the sample files change, bump
`SAMPLES_CACHE` (e.g. `cadenza-samples-v2`); the page deletes older `cadenza-samples-*` caches
on start. The dev server has no service worker and does not cache samples.

Icons in `public/icons/` are drawn by `npm run icons`, see Look.

## Look

Dark lacquer with a warm light low in the middle, ivory keys, gilt for what is earned (the
judgement line, Perfect, an S, a full combo, the mark, keyboard focus). The tokens are CSS custom
properties at the top of `src/style.css` (palette, a type scale stepping by a major third,
spacing, radii, shadows); the play screen's colours are at the top of `src/render/playfield.ts`.
Judgements: Perfect gilt, Great moonlight blue, Good pewter, Miss felt red.

- **Fonts**, self-hosted from `@fontsource` (latin subset, woff2 only, precached by the service
  worker, 58 KB in all), both under the SIL Open Font License 1.1:
  [Bodoni Moda](https://github.com/indestructible-type/Bodoni) (The Bodoni Moda Project
  Authors), regular and italic, for titles, composers, grades and the play screen's words;
  [Hanken Grotesk](https://github.com/marcologous/hanken-grotesk) (The Hanken Grotesk Project
  Authors), regular and semibold, for everything else (its figures are tabular). `src/fonts.css` declares
  them straight from the packages so no woff fallbacks are built.
- **Play screen**, top to bottom: a header band (combo, count-in, pause), the highway with a bar
  and beat grid scrolling with the notes, the gilt judgement line, the fallboard strip where the
  judgement word shows, and four ivory keys that light on press with a glow up the lane. A
  note's gilt bottom edge meets the line on the beat; chord notes are linked by a thin bar.
  Static parts are painted once per size into offscreen canvases; a frame creates no gradients
  and uses no shadow blur. With `prefers-reduced-motion` the glow goes out at once on release
  instead of fading (and the title screen does not fade in).
- **Icons**: `npm run icons` (`tools/make-icons.ts`) draws the gilt fermata of the title screen
  (the `<symbol id="fermata">` in `index.html`, same geometry) on lacquer into `public/icons/`:
  192 and 512 px, a maskable 512 px with the mark inside the safe zone, and the 180 px Apple
  touch icon. Plain Node, no image tools; commit the PNGs.
- **Wide screens**: the phone-shaped column is lifted off the dark surround by a faint edge and
  a soft shadow.

## Test

```sh
npm test           # unit tests (node --test): judge, score, lanes, tier rules, overrides, resume
                   # point, calibration maths, settings parsing, best-result merge, and that
                   # regenerating the pieces is deterministic and matches pieces/
npm run test:e2e   # builds, serves dist/ with vite preview, then bots play against the built site
```

The e2e run has two projects against the built site: `desktop` plays the Nocturne on Easy with
keys and timing error, and the Rachmaninoff on Hard with a perfect bot (every note must be
Perfect, which proves the chart is hittable: chords, holds next to other lanes' notes, lanes
never struck closer than the judge can separate); rebinds lane 1 to S in the settings (F is
refused, it is lane 2's), plays a perfect Easy run with S and checks the new best on the
results screen and the piece list; and loads the app once, goes offline
(`context.setOffline`, which also cuts the service worker off: an uncached sample fails),
reloads and plays the Prelude on Normal. `phone` (Pixel 7 viewport, touch) checks the
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

`public/samples/` holds a subset of SplendidGrandPiano as smplr maps it: two velocity layers
(PP, MF), 29 roots about every third semitone, opus (`.ogg`, 3.94 MB) and AAC (`.m4a`, used on
Safari, 4.05 MB). `npm run samples:fetch` rebuilds them from the lossless FLAC masters
(sfzinstruments repository, pinned commit, cached in the OS temp dir): opus at 80 kbps VBR
through ffmpeg/libopus, AAC at 80 kbps constrained VBR through macOS `afconvert`, full-length
tails. It skips files that exist; `-- --force` re-encodes all. Needs ffmpeg and macOS.

## Licenses

- Code: MIT, see [LICENSE](LICENSE).
- Music: the MIDI files in `sources/` come from the [Mutopia Project](https://www.mutopiaproject.org).
  Chopin, Nocturne Op. 9 No. 2, engraved by Renato Biolcati Rinaldi, is licensed
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); Rachmaninoff, Prelude Op. 3
  No. 2, engraved by Petro Kostandy, is licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Charts, piece files and
  overrides derived from them (`pieces/`) are under the same licenses.
- Fonts: Bodoni Moda and Hanken Grotesk, SIL Open Font License 1.1 (see Look).
- Piano samples: Splendid Grand Piano, public-domain Steinway samples released by Akai, SFZ
  edition by [sfzinstruments](https://github.com/sfzinstruments/SplendidGrandPiano), encoded
  for [smplr](https://github.com/danigb/smplr) (MIT).
