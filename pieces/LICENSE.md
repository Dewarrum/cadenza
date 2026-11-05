# Piece data license

The files in this directory are not covered by the MIT License of Cadenza's code. Each piece
file (`<id>.json`, written by `npm run piece:add`) and its overrides (`<id>.overrides.json`) are
derived from a Mutopia Project MIDI file in `sources/` and are shared under that source's
license:

| Files | Source | License |
| --- | --- | --- |
| `chopin-nocturne-op9-2.json`, `chopin-nocturne-op9-2.overrides.json` | Frédéric Chopin, Nocturne in E-flat major, Op. 9, No. 2, engraved by Renato Biolcati Rinaldi for the Mutopia Project ([id 1590](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1590)) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `rachmaninoff-prelude-op3-2.json`, `rachmaninoff-prelude-op3-2.overrides.json` | Sergei Rachmaninoff, Prelude in C-sharp minor, Op. 3, No. 2, engraved by Petro Kostandy for the Mutopia Project ([id 2033](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2033)) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The MIDI files in `sources/` are under the same licenses, unmodified (see `sources/README.md`).

## Changes made

A piece file is an adaptation of its MIDI: the notes converted to milliseconds with a tempo
map (including tempo changes the overrides add), bar and beat times, and three generated charts
(the notes each tier plays, their lanes, chords and holds, a tempo factor and a level).

## Attribution

Credit a piece file you reuse like this (Cadenza's About screen says the same):

> Frédéric Chopin, Nocturne in E-flat major, Op. 9, No. 2. Engraved by Renato Biolcati Rinaldi
> for the Mutopia Project, https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1590.
> Charts by Cadenza, https://github.com/Dewarrum/cadenza. Licensed under CC BY-SA 3.0,
> https://creativecommons.org/licenses/by-sa/3.0/.

> Sergei Rachmaninoff, Prelude in C-sharp minor, Op. 3, No. 2. Engraved by Petro Kostandy for
> the Mutopia Project, https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2033. Charts by
> Cadenza, https://github.com/Dewarrum/cadenza. Licensed under CC BY-SA 4.0,
> https://creativecommons.org/licenses/by-sa/4.0/.

## Terms

Under either license you may copy and redistribute the data in any medium or format, and remix,
transform and build upon it, for any purpose, even commercially, as long as you:

- give appropriate credit (as above), link to the license, and indicate if you made changes;
- share what you make from it under the same license (CC BY-SA 4.0 also allows a
  [compatible license](https://creativecommons.org/compatiblelicenses));
- add no legal terms or technological measures that restrict others from doing what the
  license permits.

The legal codes are the binding text:
[CC BY-SA 3.0 legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode),
[CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode).
