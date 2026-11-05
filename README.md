# Cadenza

A browser piano rhythm game: classical pieces, falling notes over four piano-key lanes, real
piano sound from the note data. See [DESIGN.md](DESIGN.md) for the product decisions.

Status: slice S1. One piece (Chopin, Nocturne Op. 9 No. 2) on Easy, desktop keys, no settings,
pause or touch yet.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
```

Click the title screen (this unlocks audio), wait for the piano to load, pick Easy. Keys
**D F J K** are the four lanes; on Easy **Space** hits whichever lane has the next note. Hold
the key for notes with a tail.

`npm run build` writes the static site to `dist/`; `npm run preview` serves it.

URL switches for testing: `?keysound=off` plays the whole piece by itself (hits only score);
`?clock=manual` hands the song clock to `window.__cadenza.advance(ms)` (used by the e2e bot).

## Test

```sh
npm test           # unit tests: judge, score, lane assignment, Easy rule (node --test)
npm run test:e2e   # builds, serves dist/ with vite preview, a bot plays the Nocturne on Easy
```

The e2e test uses Playwright's Chromium (`npx playwright install chromium` if it is missing).

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
