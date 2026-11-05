# Sources

Original files the pieces are generated from. They are data: `npm run piece:add` and
`npm run pieces:build` read them, nothing at runtime does. Each MIDI has a `<name>.meta.json` next
to it with the piece id and the source facts the pipeline copies into the piece file (title,
composer, opus, source, engraver, license). Musical decisions such as the pickup live in
`pieces/<id>.overrides.json`.

## chopin_nocturne_op9_n2.mid

- Piece: Frédéric Chopin, Nocturne in E-flat major, Op. 9, No. 2 (1833)
- Mutopia Project id 1590, reference Mutopia-2014/12/18-1590
- Page: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1590
- File: https://www.mutopiaproject.org/ftp/ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.mid
- Engraver (maintainer): Renato Biolcati Rinaldi, typeset with LilyPond 2.12.3 from the G. Schirmer
  edition (New York, 1881)
- License: Creative Commons Attribution-ShareAlike 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)
- Downloaded 2026-11-05, unmodified.
- Contents: tracks "upper" (right hand, 471 notes) and "lower" (left hand, 771 notes), 12/8 at
  dotted quarter = 44 (eighth = 132), an eighth-note pickup (`\partial 8`), constant note
  velocity 90 with the dynamics written as channel volume (CC7) on the upper track.

## rach-prelude-op3-no2.mid

- Piece: Sergei Rachmaninoff, Prelude in C-sharp minor, Op. 3, No. 2 (1892)
- Mutopia Project id 2033, reference Mutopia-2015/07/09-2033
- Page: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2033
- File: https://www.mutopiaproject.org/ftp/RachmaninoffS/O3/rach-prelude-op3-no2/rach-prelude-op3-no2.mid
- Engraver (maintainer): Petro Kostandy, typeset with LilyPond 2.18.2 from the Bosworth & Co.
  (1896) and Universal Edition (1910) editions
- License: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
- Downloaded 2026-11-05, unmodified.
- Contents: four note tracks, one per staff: "upA:" (887 notes) and "upB:" (60) are the right
  hand, "downA:" (710) and "downB:" (68) the left. The B staves only appear in the climax
  (bars 45-54), where each hand's chords spread over two staves. In bars 36-42 the alternating
  chords are beamed across the staves; the staff they sit on is the hand that plays them, so
  hands follow tracks. 4/4 with a half-bar pickup (`\partial 2`); tempo 60 (LilyPond's default,
  the Lento has no metronome mark), 192 from the Agitato (bar 14), 62 from Tempo primo (bar 43);
  dynamics as channel volume (CC7); no notes under 80 ms. Six notes are doubled at the same tick
  and pitch in two tracks; charts take each pitch once per onset.
