# Habiba — a birthday film

A 68-second, 1080×1920 (9:16) 60 fps birthday film, built entirely from code:

- **Concept — "Every star has a story."** Midnight-velvet sky, champagne gold and neon pink
  (the palette of her own birthday party). Intro → gold-foil title reveal → three chapters
  (*The sweetest heart*, *The adventurer*, *The silly one*) → polaroid wall → "dear Habiba" finale → outro.
- **Score** (`tools/music.py`): an original arrangement of *Happy Birthday to You* (public-domain melody),
  synthesized from scratch with numpy/scipy — music box, FM electric piano, pads, strings, waltz groove,
  a key change into the last chorus, and sound design (impact, risers, whooshes, neon buzz, polaroid drops).
  3/4 at 100 BPM; every cut lands on a bar line and the on-screen lyric "dear… Habiba" lands on the sung beat.
- **Picture** (`src/film.js`): a deterministic Canvas 2D engine — every frame is a pure function of time —
  with parallax star field, aurora, bokeh, particle bursts, gold-foil typography with shimmer, neon text,
  Ken Burns moves, framed cards, a choreographed polaroid wall and seven transition types.
- **Render** (`tools/render.cjs`): headless Chromium (Playwright) renders frames in parallel; ffmpeg encodes.

```
./build.sh   # needs the 12 photos in private/photos/
```

`private/` (photos, intermediate plates, frames) and `out/` (the rendered film) are git-ignored on purpose:
this repository is public and the photos are of children.
