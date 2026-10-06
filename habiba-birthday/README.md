# Habiba — a birthday film

A 66-second, 1080×1920 (9:16), 60 fps birthday film built entirely from code, in a modern editorial style:
off-black, ivory and champagne; a wide grotesk (Archivo Expanded) with an italic serif (Instrument Serif);
clean mask reveals with expo easing, real multi-sample motion blur, warm film halation and grain.
On-screen text is limited to the name: everything else is carried by the pictures and the cut.

**Edit** (120 BPM: every cut lands on a beat or bar of the score)

| time | shot |
|---|---|
| 0–4 | a hairline opens into a slit onto the neon "Happy Birthday" sign from her party, with a focus pull |
| 4–8 | HA / BI / BA stacked, her photos cutting on the beat inside the letters; zoom through the "I" |
| 8–32 | full-bleed shots and asymmetric split panels: slides, punch-ins, mask reveals |
| 32–36 | contact sheet: all twelve photos land one per eighth note, then a dive into one cell |
| 36–48 | the drop: aquarium, the silly duo, a four-up mosaic |
| 48–56 | exposure bloom into the hero shot under the neon sign |
| 56–66 | end title |

**Score** (`tools/music.py`): original melodic house in D major, synthesized from scratch with numpy/scipy:
felt piano, sidechained supersaw pads, plucked hook with ping-pong delay, house drums, sub bass,
impacts, risers and UI ticks for the grid.

**Picture** (`src/film.js`): a deterministic Canvas 2D engine (every frame is a pure function of time),
rendered in parallel by headless Chromium (`tools/render.cjs`) and encoded with ffmpeg.

```
./build.sh   # needs the 12 photos in private/photos/
```

`private/` (photos, intermediate plates, frames) and `out/` (the rendered film) are git-ignored on purpose:
this repository is public and the photos are of children.
