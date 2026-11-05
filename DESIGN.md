# Cadenza — design (agreed 2026-11-05)

A single-player, portrait, mobile-first browser rhythm game inspired by Pianista. Classical piano
pieces, falling notes over four piano-key lanes. This file is the source of truth for product
decisions. Implementation details that are not here are the implementer's call; decisions that
are here are not to be changed without talking to the owner.

## Stack
- Vite + TypeScript, no UI framework. HTML/CSS for menus and settings, Canvas 2D for the play screen.
- PWA (installable, offline: app shell, piece data, piano samples).
- Static build, deployed to Cloudflare Pages from GitHub Actions on push to `main`
  (mirror ~/dev/pocket-tolk/.github/workflows/deploy.yml). Public GitHub repo `cadenza`, MIT code.
- Tests: Node's built-in test runner (`node --test`) for judge, scoring, generator, lane assignment;
  one Playwright smoke run against the built site (scripted bot plays a piece, results screen checked).
  Keep tests lean: pin each rule once, no per-feature bloat.
- No backend, no accounts, no analytics.

## Music and sound
- Note data is the source of truth. No recordings.
- Sources: Mutopia Project MIDI.
  - Chopin, Nocturne Op. 9 No. 2 — Mutopia id 1590, CC BY-SA 3.0.
  - Rachmaninoff, Prelude in C-sharp minor Op. 3 No. 2 — Mutopia id 2033, CC BY-SA 4.0.
  - Each generated piece file records source URL, engraver and license. An About screen credits
    Mutopia, the engravers and the piano samples. Derived chart data stays under BY-SA.
- Piano: smplr's SplendidGrandPiano (public-domain samples, MIT code), self-hosted subset in
  `public/samples/`: two velocity layers, every third semitone, opus with AAC fallback for Safari,
  roughly 4 MB. Nearest-neighbour pitch shift fills the gaps. MIDI velocity picks the layer.
  Preloading starts on the piece list screen with a progress bar; service worker caches it.
- Audio model ("key sound", on by default):
  - Chart notes sound only when hit. A hit before the target time is scheduled at the target time.
    A hit after the target (up to the Good window) sounds immediately. Misses are silent.
  - Notes not in the chart play automatically at their written time and duration.
  - A hold released early is damped (short release), like lifting a key. Held to the end rings naturally.
  - Settings toggle "Key sound" off = the full piece plays regardless of hits; hits only score.
- AudioContext clock is the master clock for notes and visuals. Taps use the event timestamp
  converted to audio time. Audio unlocks on the first tap on the title screen. iOS mute switch
  silences Web Audio; show a one-line hint when audio seems silent.

## Charts
- `npm run piece:add path/to/file.mid` converts a MIDI into `pieces/<id>.json` (committed) and
  prints note counts per tier and the numeric level. Generated output is committed; a deploy never
  needs the pipeline. A sidecar `pieces/<id>.overrides.json` can pin lanes, drop notes, force holds,
  add a tempo map (e.g. ritardando at phrase ends) and set per-tier tempo factors. Never hand-edit
  generated output.
- Piece file: metadata (id, title, composer, opus, duration, source, license), tempo map and bar
  lines, full note list in ms at tempo 1.0 (pitch, start, duration, velocity, voice/track), and
  tiers easy/normal/hard: included note ids, lane per note, chord groups, tempo factor, level 1–10.
- Tier rules (starting values, tune by playing):
  - Easy: top voice of the right hand only, max ~2 notes/s, no chords, runs faster than the cap
    thinned to notes on beats. Default tempo factor 1.0; 0.85 allowed on hard pieces.
  - Normal: right-hand chords up to 2 notes, left-hand bass on downbeats, ~4 notes/s.
  - Hard: both hands, chords up to 3, ~6–7 notes/s, holds for notes of a beat or longer.
  - Grace notes and ornaments under 80 ms dropped from all tiers.
- Lanes: 4 lanes on all tiers. Lane = pitch rank within a ~2 s sliding window (rising phrases move
  right). Chords take adjacent lanes. Same-lane repeats are fine.

## Play rules
- Note types: tap, hold (head + sustain), chord (2 on Normal, up to 3 on Hard). No slides/flicks.
- Judgement: Perfect ±50 ms, Great ±95 ms, Good ±140 ms, else Miss. A tap 140–180 ms early
  consumes the note as a Miss (anti-mash). Hold: head judged like a tap; hold scored by fraction
  held, below 80% = broken hold. A global audio offset from calibration shifts all windows.
- Score = accuracy: Perfect 100%, Great 70%, Good 40%, Miss 0, averaged over the tier's notes.
  Combo shown and tracked, no multiplier. Grades: S ≥95, A ≥90, B ≥80, C ≥65, D below.
  Full Combo flag. No health bar, no fail state. Best per piece+tier in localStorage.
- Approach time: user setting, defaults Easy 1.5 s, Normal/Hard 1.2 s. Pixel speed follows from
  screen height so it looks the same on every phone.
- Start: 4-beat count-in at the tier's tempo with the bar grid already scrolling.
  First ever play: one-screen "how to play" card (tap/hold/chord, judgement line), tap to dismiss.
- Pause: `Esc`/pause button; backgrounding (visibilitychange, lock, call) pauses at once.
  Resume = 3-beat count-in and ~2 s rewind. Unlimited pauses.
- Desktop keys: lanes D F J K (rebindable); Space hits any lane on Easy. No gamepad.

## Screens (v1)
Title · Piece list (composer, title, three tier buttons with level and best grade) · Play ·
Results (grade, accuracy, judgement counts, max combo, best comparison) · Settings (audio offset
calibration by tapping to clicks, seeded from AudioContext outputLatency; approach time; master
volume; key sound toggle; key bindings) · Pause overlay · About/credits.

## Look
Dark near-black background with a warm vignette, ivory lane keys that light on press, gold accents
for Perfect, serif display type for titles, thin bar-line grid scrolling with the notes, no particle
explosions. On wide screens the play area is a phone-shaped column centred on a dark surround.

## Support
iOS Safari 16.4+, Chrome and Samsung Internet on Android (last two years), current desktop Chrome,
Safari, Firefox. Older browsers get a plain "unsupported" message.

## Out of v1
6-lane mode, slides, health bar, unlocks, leaderboards, accounts, user MIDI import, landscape
layout, gamepad, multiplayer, piece preview on the list, speed slider, analytics, haptics.

## Delivery slices (each playable, tests green, committed)
- S1 Engine, judge, scoring, minimal MIDI→piece pipeline, Nocturne on Easy, desktop keys, piano samples.
- S2 Touch input, portrait layout, pause/resume, count-in, how-to card. Dev server on the tailnet at :8444.
- S3 Full tier generator + overrides, both pieces on all tiers, levels, `piece:add` script.
- S4 Settings, calibration, results persistence, PWA + sample caching.
- S5 Visual design pass.
- S6 About/credits, deploy workflow, public URL.
