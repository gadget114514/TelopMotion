# TelopMotion

A desktop app for **lyric videos**, with a Suno achievement card generator as a secondary mode. The app opens in the **Studio**: import lyrics (SRT, LRC or JSON), restructure them into beats, render vector text with WebGL2 shaders, animate every group, and export a video. **Suno profile JSON is optional** — start a project without any data, or open *File → TelopMotion (static image)…* for the achievement showcase.

![Electron](https://img.shields.io/badge/Electron-44-47848f) ![Platform](https://img.shields.io/badge/platform-Windows-0078d4) ![License](https://img.shields.io/badge/license-MIT-green)

**[Web version → https://gadget114514.github.io/TelopMotion/](https://gadget114514.github.io/TelopMotion/)**

## Features

- **Studio (main)**: turn lyrics into a video project — SRT / LRC / JSON import, text restructuring into beats (pages, recap, repeats), vector text rendering with WebGL2 shaders, motion and effect groups, a timeline with keyframes, an inspector with manual editing, and playback in sync with an audio track
- **Achievement card (secondary)**: 32 achievements with locked/unlocked states and live progress bars, one-click cards in 16:9 (1920x1080) and 9:16 (1080x1920) as JPG or PNG, saved from the Studio's Output menu or the achievement page
- Lyrics import formats: **SRT** (tags, `{fx:}`, spans), **LRC** (metadata, offset, multiple tags, instrumental markers, enhanced word tags) and **JSON** (arrays, `cues`, Whisper `segments`, seconds/ms/time strings)
- Lyrics export in SRT (with optional `{fx:}` tags), LRC and JSON
- Condensed panel layout tuned for 1920x1080 — all 32 badges visible without scrolling
- Profile stats: songs, total plays, likes, comments, catalog length, followers
- Sortable, searchable song list with inline audio preview and links to Suno
- Five languages: English, Japanese, Spanish, French, Russian (auto-detected, switchable)
- Local cache per profile — instant load on next launch, then refreshes in the background
- All network access happens in the Electron main process, so there are no CORS issues and no proxy needed

## Studio overview

![Studio overview](snapshot/studio-overview.png)

The app opens directly in the Studio. Suno data is optional: click **Start without data**, import lyrics (SRT / LRC / JSON), or import a Suno profile JSON to generate a script from the achievements. The achievement card page is a secondary mode (*File → TelopMotion (static image)…*), and it can open the Studio again without losing the current project.

The Studio turns lyrics into a video project:

- **Media** (left): profile data (info tab), video imports with thumbnails and background/foreground layer actions (video tab), and the audio tab with waveform and spectrogram once a track is loaded
- **Preview** (center): the rendered frame at output resolution; the overlay shows selection handles, guides and the `path` layout points
- **Preview quality** (*Settings → Quality*, auto/full/half/quarter): the scene is laid out at the size of the frame actually rendered, so a reduced quality draws the same picture smaller and faster instead of a differently-scaled one (the same rule covers video exports at 720p/1440p and the 2D fallback)
- **Inspector** (right): cue/beat text and timing, text style, transform, overrides, every effect group with its parameters and motion (in/out easing, stagger, loop), colors, and ◆ keyframe buttons
- **Timeline** (bottom): ruler, audio waveform, cue blocks with beat sub-blocks, element lanes with keyframes (drag, copy/paste, ease, delete), markers, snapping to seconds and frames

Text is laid out with `Intl.Segmenter`, converted to glyph outlines with opentype.js, triangulated with earcut, and drawn on WebGL2; every motion runs through the same tween system (`SA.tween`) so preview and export behave identically. The renderer is deterministic: all randomness comes from seeded generators, so the same project at the same time always looks the same.

### Effect groups

Animation · Layout · Enter · Exit · Hold · Location · Fill · Edge · Post · Background · Color

Each group has its own easing (in/out), and Fill/Edge/Post have many types (gradients, chrome, fire, marble, holographic, outline, neon glow, bevel, extrude, drop shadow, glitch and dissolve families, bloom, film grain, vignette, and more).

### Text restructuring

One SRT cue becomes **beats**: split into pages that fit the safe area (with language-aware line breaking for Japanese and English), a full-text recap, repeats for long holds, and emphasis moments. Beats can be edited by hand (drag dividers, split, merge, edit text, pin) and the rest gets restructured around them.

### Export formats

- **Achievement card**: 16:9 JPG/PNG and 9:16 JPG/PNG (Output menu)
- **Lyrics**: SRT (with or without `{fx:}` tags), LRC and JSON (Output → Export lyrics)
- **Project**: `.telopmotion.json`
- **Video**: MP4 (H.264 + AAC; Opus fallback) and WebM (VP9 + Opus) via WebCodecs, with a streaming save target in Electron and the File System Access API on the web. Choose format, resolution (720p/1080p/1440p), fps (30/60), bitrate, audio, and quality in the export dialog (Ctrl+E); the progress bar shows the ETA and cancels cleanly
- **Transparent export**: a store-only PNG-sequence `.zip` (guaranteed) for alpha output; VP9-alpha WebM is best-effort and depends on the platform
- **Layers**: background and foreground layers (solid colours and images with alpha), each with opacity, blend (normal/add/multiply/screen), fit (cover/contain/stretch/actual), corner radius and transform (position/scale/rotation); edit them in Settings → Layers…, images are embedded as data URLs so they travel with the project, and layers render in the preview and in video exports identically; **video layers** (MP4/WebM) add speed/offset and playback in the preview, and exports seek them frame-accurately so the rendered frames match
- **Audio reactive**: bind any numeric effect parameter to the music (low/mid/high bands or the overall level) with an amount, from Settings → Audio reactive…; the in-house FFT analysis runs when the audio is decoded and both the preview and the video export resolve the same data per frame, so what you see is what you export

## Web version (GitHub Pages)

The same `renderer/` folder is served as a static site. In the web build:

- Opening `studio.html` directly works without any profile JSON: start without data or import lyrics (SRT / LRC / JSON). Project files and autosave live in IndexedDB.
- There is **no network fetch to Suno** — the achievement page (`index.html`) only imports JSON
- Get a JSON file with the desktop app (Load, then *Export profile data*) or with the CLI scraper below
- Drop the JSON on the achievement page to build the badges; **Open Studio** hands the data over to the Studio

### Pages setup

The site is deployed from the repository root by `.github/workflows/static.yml` (the standard GitHub Pages "Static HTML" workflow), which uploads the whole repository on every push to `main`. The committed root `index.html` redirects to `renderer/studio.html` (the Studio is the main mode), so the app is served at `https://<user>.github.io/<repo>/`.

GitHub Pages must use the **GitHub Actions** source once (Settings → Pages → Build and deployment → **Source: GitHub Actions**). A branch deployment also works: with Source `main` / `(root)`, the same root `index.html` serves the app without any workflow. The root `.nojekyll` keeps Pages from running Jekyll over the repository.

## Font licenses

The Studio ships with static OFL fonts in `renderer/fonts/` (Noto Sans Regular/Bold, Noto Serif Regular, Noto Sans JP Regular/Bold, Dela Gothic One, Bebas Neue). They are licensed under the SIL Open Font License 1.1; see `renderer/fonts/OFL.txt` and `renderer/fonts/SOURCES.md` for versions and source URLs. The vendored libraries (`opentype.js`, `earcut`, `mp4-muxer`, `webm-muxer`) keep their own licenses in `renderer/vendor/LICENSES.txt`.


## Requirements

- Windows 10/11 (x64)
- Node.js 18+ for development (tested with Node 24)

## Getting started

```bash
npm install
npm start
```

The app opens in the Studio. Import lyrics with *File → Import lyrics (SRT / LRC / JSON)…*, or press **Start without data** to build a project by hand. To use the achievement card, open *File → TelopMotion (static image)…*, paste a profile URL in the format `suno.com/@handle` (or just `@handle`) and press Load; **Open Studio** brings the profile data back into the Studio.

## Building Windows installers

```bash
npm run dist
```

Outputs to `dist/`:

- `TelopMotion-Setup-1.0.0.exe` — NSIS installer (choose install directory)
- `TelopMotion-Portable-1.0.0.exe` — portable, no installation needed

Builds are unsigned, so Windows SmartScreen may show a warning. `dist/win-unpacked/` contains the unpacked app; the smoke tests (`SA_SMOKE=1 SA_SMOKE_LYRICS=1 "dist\win-unpacked\TelopMotion.exe"`) verify that fonts and vendor files load from the packaged bundle.

## Command-line scraper

The same fetch core is available without the GUI:

```bash
node scripts/scrape.js --handle @suno --out suno.json
node scripts/scrape.js --handle https://suno.com/@suno --max-pages 5 --compact
```

Useful for bulk exports; the JSON can be imported into the app later.

## Achievements

| Category | Badges |
| --- | --- |
| Catalog | First Note, Getting Started, Prolific, Centurion, Legend |
| Plays | First Thousand, Ten Thousand, Hundred Thousand, Millionaire |
| Likes | First Like, Appreciated, Adored, Beloved |
| Song Tiers | Hit, Chart Topper, Viral, Anthem |
| Superlatives | Most Played, Muse, Conversation Starter |
| Time | Anniversary, Marathon Month, Creator Streak, Early Bird, Night Owl |
| Diversity | Genre Hopper, Model Collector, Contestant |
| Community | Followed, Rising Star, Influencer |
| Hidden Gems | Hidden Gem |

## How it works

- The main process calls Suno's public profile endpoint (`studio-api.prod.suno.com/api/profiles/{handle}`), paginating 20 songs per page with polite delays and exponential backoff on HTTP 429.
- Data is normalized, cached under `%APPDATA%/TelopMotion/cache/`, and passed to the sandboxed renderer over a `contextBridge` IPC API.
- The renderer is plain HTML/CSS/JS with a strict CSP and no network access of its own.

## Project layout

```
main.js                 Electron main process: window, IPC, dialogs, cache, autosave, asset:read
preload.js              contextBridge API exposed to the renderer
lib/suno-core.js        Fetching, pagination, normalization (shared with the CLI)
scripts/scrape.js       Command-line scraper
scripts/fx400.js        FX 400: deterministic catalog of representative effects + test project
scripts/fx400mix.js     FX 400 MIX: 400 complete-look demos (headline effect + supporting kit)
scripts/fx800.js        FX 800: 800 numbered, named demos split into four 200-effect projects
scripts/looks-classify.js  Classifies the 800 demos (motion magnitude, five axes, themes) for Random look
scripts/check.js        node --check over lib/, scripts/, renderer/js/, main.js, preload.js
scripts/vendor.js       Copies opentype/earcut/mp4-muxer/webm-muxer into renderer/vendor
demo/                   Generated demo projects, cue lists, indexes and preview sheets
renderer/               UI: index.html (achievement card, secondary), studio.html (Studio, main), css/, js/
renderer/js/            Shared: format, platform, suno, srt, lrc, lyrics-json, lyrics-file, script-gen, color, achievements
renderer/js/lyrics/     Lyrics engine: font, geometry, textflow, layout, motion, scene, engine, looks, pattern-variants
renderer/js/lyrics/effects/  Effect descriptors + CPU implementations per group
renderer/js/lyrics/gl/  WebGL2: context, shaders, SDF, passes
renderer/js/studio/     Studio: project, store, io, menu, preview, timeline, controls, inspector, overlay
renderer/data/          Generated runtime pool: fx800.looks.json (800 classified looks for Random look)
renderer/fonts/         OFL fonts + SOURCES.md + OFL.txt
renderer/vendor/        Vendored libraries + LICENSES.txt
```

## Testing

```bash
npm run check                       # syntax check every script
npm test                            # unit tests (node --test)
SA_SMOKE=1 npx electron .           # fetch @suno, render badges, check the 5 languages
SA_SMOKE=1 SA_SMOKE_LYRICS=1 npx electron .   # fonts, vector text, holes, audio sync, WebGL fallback
SA_SMOKE=1 SA_SMOKE_BEATS=1 npx electron .    # SRT restructuring: pages, repeats, recap, orphans
SA_SMOKE=1 SA_SMOKE_MOTION=1 npx electron .   # formations, enter/exit/hold types, deform
SA_SMOKE=1 SA_SMOKE_SHADERS=1 npx electron .  # every fill/edge/post/background type (gl.getError)
SA_SMOKE=1 SA_SMOKE_EDIT=1 npx electron .     # selection, overrides, keyframes, orphans
SA_SMOKE=1 SA_SMOKE_TIMELINE=1 npx electron . # cue edits + SRT, keyframe editing, waveform, snapping
SA_SMOKE=1 SA_SMOKE_STUDIO=1 npx electron .   # Studio shell: menus, undo, autosave, i18n coverage
SA_SMOKE=1 SA_SMOKE_RANDOM=1 npx electron .   # presets, seeded re-roll, locks, palettes, 800-look draw
SA_SMOKE=1 SA_SMOKE_EXPORT=1 npx electron .   # MP4 + AAC, WebM + Opus, transparent PNG zip
SA_SMOKE=1 SA_SMOKE_LAYERS=1 npx electron .   # image/solid/video layers, motion, blends, filters
SA_SMOKE=1 SA_SMOKE_HOME=1 npx electron .     # Studio-first boot without data + lyrics import (SRT/LRC/JSON)
SA_SMOKE=1 SA_SMOKE_SHOT=1 npx electron .     # regenerate snapshot/studio-overview.png (README)
SA_SMOKE=1 SA_SMOKE_QUALITY=1 npx electron .  # full / half / quarter previews render the same frame
SA_SMOKE=1 SA_SMOKE_AUDIO=1 npx electron .    # audio-reactive bindings and the Media audio tab
SA_SMOKE=1 SA_SMOKE_FILLERS=1 npx electron .  # filler clips, credits modes, timeline and inspector
```

### FX 400 (representative effects)

`test/test_1_to_400.srt` has 400 numbered two-second cues. `scripts/fx400.js` builds a deterministic, numbered catalog of 400 representative effects and a project where cue n carries effect n, so the effects can be checked visually in the Studio:

```bash
npm run fx400 -- build                    # writes test/fx400.catalog.json, test/fx400.md and test/fx400.telopmotion.json
npm run fx400 -- build --text raw         # keep the SRT text (default is a longer sample so letter effects are visible)
npm run fx400 -- show 42                  # prints the recipe for effect 42
npm run fx400 -- apply 42 --project <file> --cue 12 --out <file>   # applies effect 42 to one cue
```

Motion-driven groups (animation, layout, enter, exit, hold, location) are measured with the real motion evaluator against the plain default look: candidates below the perceptual threshold are dropped and near-identical variants are de-duplicated, so the catalog only contains effects that can be told apart. Shader groups keep type identity and only add strong parameter steps. The MD index records the measured score, the verification method and the types that could not produce a visible effect (`hold.none`, `fill.solid`, …).

Open `test/fx400.telopmotion.json` from *File → Open project…* and play the timeline (or scrub) to review the effects. Background effects are applied as clips on the bg track (project version 2 has no cue-level screen background).

### FX 800 (four 200-effect demos)

`scripts/fx800.js` extends the FX MIX sampler to **800 numbered, named demos** — one complete look each (a headline effect plus a supporting kit drawn from the whole registry), sampled so that no two demos are close and each demo differs from the one before it in almost every slot — and splits them into four Studio projects of 200 cues:

| Demo | Numbers | Project | Cue list |
|---:|---|---|---|
| 1 | No.1–200 | `demo/fx800-1.telopmotion.json` | `demo/fx800-1.srt` |
| 2 | No.201–400 | `demo/fx800-2.telopmotion.json` | `demo/fx800-2.srt` |
| 3 | No.401–600 | `demo/fx800-3.telopmotion.json` | `demo/fx800-3.srt` |
| 4 | No.601–800 | `demo/fx800-4.telopmotion.json` | `demo/fx800-4.srt` |

Each project runs 10 minutes at 3 seconds per cue; the cue text carries the demo number and name. `demo/fx800.md` is the numbered index (number, name, supporting kit) and `demo/fx800.catalog.json` stores the full recipes. Every demo's text size steps through the five-look ladder (56 / 70 / 88 / 110 / 138, about 1.3× apart) and its colour cycles through the six readable palette roles, so no two neighbours share both. `SA_SMOKE=1 SA_SMOKE_FXDEMO=1 npx electron .` renders a contact sheet of the first 16 cues to `demo/fx800-preview-1.png` (`_FILE`, `_FROM`, `_COUNT`, `_COLUMNS`, `_TILE`, `_OUT` override).

Pattern backgrounds come from a **1404-kind library** (`renderer/js/lyrics/pattern-variants.js`: 13 animated modes — grid, dots, stripes, rings, triangles, diamonds, hexes, rain, checker, polka, sine curves, waves and random fill — × 9 size steps × 12 element counts) and each demo takes its own step, so a 400/800 demo run never shows the same tiling twice. The same library feeds the backdrop pattern clips that *Random* (auto-direct) creates on the backdrop track; no variant is static, so a backdrop always moves.

```bash
npm run fx800 -- build                     # writes the catalog, index, four projects and the looks pool
npm run fx800 -- show 642                  # prints demo 642 (name, part, recipe)
npm run fx800 -- list --part 3             # lists No.401–600
npm run fx800 -- apply 642 --project <file> --cue 12 --out <file>   # reuse one demo
```

### Random look (おまかせ)

`npm run fx800 -- build` also classifies every demo and writes the runtime pool
`renderer/data/fx800.looks.json`: each of the 800 looks carries its measured
**motion magnitude** (the SA.motion evaluator samples nine frames of a two-second
beat and takes the largest travel / scale / rotation / deform amplitude, bucketed
as still / small / medium / large / extreme), a **five-axis profile** (speed,
energy, softness, density, brightness) and **theme affinities** (the genre
profiles). The styles are stored as deltas against the effect registry defaults,
which keeps the whole pool at ~1.9 MB.

The Studio's *Random look* button (Generate menu, timeline ✨, or the Re-roll
button) loads the pool and:

1. draws one of the 800 by the song's theme and the five axes — a high `energy` /
   `speed` target prefers big-motion looks, `softness` the texture, `density` the
   busyness, `brightness` the tone; a themed draw weights looks that fit that genre
2. applies that look to the whole song (entrance, exit, hold, fill, edge, post,
   repeat, text background, background clip), so the demo's headline effect stays
   the face of the song
3. adjusts the fine parameters from the same axes — the palette is regenerated,
   the text size / spacing follow the density and softness axes, and the demo's
   typeface survives

Re-rolling excludes the look that is on screen and draws another one. If the pool
cannot be loaded, the button falls back to the generator-only theme as before.
`demo/fx800.md` lists the motion class of every demo.

## Notes

- Suno's API is undocumented and may change; all coupling is isolated in `lib/suno-core.js`.
- This project is unofficial and not affiliated with Suno.
- Only public profile data is read; no accounts, tokens, or credentials are used.

## License

MIT
