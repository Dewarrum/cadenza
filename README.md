# Cadenza

A browser piano rhythm game: classical pieces, falling notes over four piano-key lanes, real
piano sound from the note data. See [DESIGN.md](DESIGN.md) for the product decisions.

Status: slice S2. One piece (Chopin, Nocturne Op. 9 No. 2) on Easy, touch and desktop keys,
portrait phone layout, pause and resume, how-to card. No settings yet.

## Run

```sh
npm install
npm run dev        # http://127.0.0.1:5184
```

Tap or click the title screen (this unlocks audio), wait for the piano to load, pick Easy. Tap
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
npm test           # unit tests: judge, score, lane assignment, Easy rule, resume point (node --test)
npm run test:e2e   # builds, serves dist/ with vite preview, then two bots play the Nocturne on Easy
```

The e2e run has two projects against the built site: `desktop` plays the whole piece with keys;
`phone` (Pixel 7 viewport, touch) checks the canvas fills the phone at device resolution, plays
with fingers sent as CDP touch points, including a two-finger press, pauses and resumes mid-piece
and checks nothing is judged twice. Both use Playwright's Chromium (`npx playwright install
chromium` if it is missing).

## Add a piece

1. Put the MIDI in `sources/` and next to it a `<name>.meta.json` with `title`, `composer`,
   `opus`, `page`, `url`, `engraver`, `license` and, if the piece starts with an anacrusis,
   `pickup` as a note value (`"1/8"`). Record the source in `sources/README.md`.
2. `npm run piece:add -- sources/<name>.mid --id <piece-id>`
3. Commit `pieces/<piece-id>.json`. Never edit it by hand; rerun the pipeline instead.

The pipeline logs how it split the hands (track names first, then mean pitch) and prints note
counts per tier. In S1 only Easy is generated; Normal and Hard are copies of Easy until S3.

## Piano samples

`public/samples/` holds a subset of smplr's SplendidGrandPiano: two velocity layers (PP, MF),
29 roots about every third semitone, opus (`.ogg`) and AAC (`.m4a`, used on Safari).
`npm run samples:fetch` downloads them again (`-- --force` to overwrite).

## Licenses

- Code: MIT, see [LICENSE](LICENSE).
- Music: the MIDI files in `sources/` come from the [Mutopia Project](https://www.mutopiaproject.org).
  Chopin, Nocturne Op. 9 No. 2, engraved by Renato Biolcati Rinaldi, is licensed
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Charts and piece files
  derived from it (`pieces/`) are under the same license.
- Piano samples: Splendid Grand Piano, public-domain Steinway samples released by Akai, SFZ
  edition by [sfzinstruments](https://github.com/sfzinstruments/SplendidGrandPiano), encoded
  for [smplr](https://github.com/danigb/smplr) (MIT).
