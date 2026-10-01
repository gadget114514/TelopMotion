# Implementation spec: TelopMotion → Electron + Pages, 16:9/9:16 card, data→SRT, vector/shader lyrics-video Studio

This spec is written so that another engineer or AI can implement it without extra context. Follow the phases in §12 in order. Each phase ends with acceptance checks and one commit.

---

## 0. Goals

| # | Goal |
|---|---|
| G1 | **Electron build:** fetches suno.com (existing), exports and imports JSON (existing), and has everything below. |
| G2 | **GitHub Pages build:** the same `renderer/` served as a static site. It **imports JSON only**; there is no network fetch to Suno. |
| G3 | **Achievement card:** one page in **16:9 (1920×1080)** and **9:16 (1080×1920)**, drawn on a canvas and saved as JPG/PNG. |
| G4 | **Data → SRT:** the content is chosen with options (achievement reveal, stats, top songs, intro/outro). You can also import lyrics from **SRT, LRC or JSON** (§7.18) and edit them. |
| G5 | **SRT → lyrics video:** text is made into **vector outlines**, drawn and decorated with **WebGL2 shaders**, and moved **per line, word, letter, and part of a letter**. Many patterns are grouped as Animation, Layout, Enter, Exit, Hold, Location, Fill, Edge, Post, Background and Color. **Every group has in/out easing.** |
| G6 | **Studio editor:** menu bar at the top; Media on the left; Preview with transport controls in the center; Inspector on the right; Timeline at the bottom. You can edit every element by hand, customize colors fully, randomize with a seed, and undo/redo. |
| G7 | **Export:** WebCodecs video, **MP4 (H.264 + AAC/Opus)** with a **WebM (VP9 + Opus)** fallback, plus an optional audio track. |

### Hard rules
- **Original work.** All motion, easing, layout, effect, shader, preset, timeline and editor code is written from scratch for this project.
  - Do **not** copy, port, or imitate existing open-source lyrics-video or kinetic-typography projects.
  - Do not use animation libraries (GSAP, anime.js, Motion, Lottie, etc.). Do not mention such projects in code or docs.
  - The only allowed third-party code is low-level building blocks, vendored as files:
    - `opentype.js` (font parsing)
    - `earcut` (polygon triangulation)
    - `mp4-muxer` and `webm-muxer` (container writing)
    - OFL fonts
- **No bundler, no framework.** Plain browser scripts loaded with `<script src>`, in the same style as the existing code (§2).
- **CSP stays strict:** `script-src 'self'`. There is no `eval` and no remote scripts. GLSL is kept in JS strings.
- **Deterministic rendering.** `renderFrame(project, t)` depends only on `(project, t, loaded assets)`. All randomness uses a seeded RNG, and all value changes go through `SA.tween` (§6.2). Preview and export share the same code path and must match logically; a pixel-exact comparison is only required at the same quality and resolution.
- **Every UI string goes through `SA.i18n`, in all 5 languages** (en, ja, es, fr, ru).

---

## 0.5 Terminology (用語集)
Use these terms in code (identifiers), UI (i18n keys), docs, and commits. Don't use synonyms, e.g. don't call a Beat a "page" or "shot" in code.

### Data and content
| Term (code) | 日本語 | Definition |
|---|---|---|
| **Dataset** | データセット | The profile JSON (`profile`, `songs`, `fetchedAt`, `source`), §4.1. |
| **Evaluation** | 評価結果 | `SA.achievements.evaluate(dataset)`: the badges with their progress and unlocked state, §4.2. |
| **Badge** | バッジ／実績 | One of the 32 achievements. It has a **Category** (カテゴリ, 9 kinds) and a **Tier** (ティア: white/bronze/silver/gold). |
| **Card** | 実績カード | The one-page achievement image drawn on a canvas, §5.3. |
| **Aspect** | アスペクト | `16:9` (1920×1080) or `9:16` (1080×1920). |
| **Script** | スクリプト | The ordered list of Cues for the project, generated from the data or imported from SRT. |
| **Cue** | キュー | One SRT entry: the original text plus start and end times. It is a container for Beats, §4.3. |
| **Restructure** | 再構成 | Turning one Cue into Beats to fit its time: splitting, recap, repeats, emphasis, §7.16. |
| **Beat** | ビート | **The smallest display unit that gets effects.** It has its own text, time and style. Kinds: `single`, `page`, `recap`, `repeat`, `emphasis`. |
| **Page** | ページ | A Beat of kind `page`: one piece of a Cue's text after splitting. |
| **Recap** | 全文再表示 | A Beat of kind `recap`: the whole Cue text shown again after its Pages. |
| **Repeat** | 再表示 | A Beat of kind `repeat`: the text shown again because the hold is long (`longHold`). |
| **Emphasis** | 強調 | A Beat of kind `emphasis`: a short attention animation without leaving the screen. |
| **Gap** | ギャップ／空白 | A stretch with no Cue (`intro`, `interlude`, `outro`), §7.14. |
| **Filler** | フィラー | What plays in a Gap: countdown, waveform, spectrum, shapes, and so on. A **Filler clip** is one Filler placed in one Gap. |
| **Credits** | クレジット | The song title (作品名) and artist (作者) elements. Modes: `element` (shown once), `always` (always on screen), `end` (at the end), §7.15. |
| **Pinned** | 固定 | A Beat or Filler clip edited by hand. Regenerating or restructuring keeps it. |
| **Orphan** | 孤立編集 | An override or keyframe whose target no longer exists after a text edit. |

### Element hierarchy and addressing
| Term | 日本語 | Definition |
|---|---|---|
| **Element** | エレメント | Anything you can select and style: a Cue, Beat, Line, Word, Letter, Credit, Filler clip, or Layer. |
| **Line** | 行 | One line of a Beat, after line breaking. |
| **Word** | 語 | A word or segment from `Intl.Segmenter` (for Japanese, a group of characters). |
| **Letter** | 文字 | One grapheme; the smallest element that has a transform. |
| **Part** | パーツ | A piece of a letter that only effects and shaders see: a contour, triangle, particle, or stroke segment. It can't be selected. |
| **Element path** | エレメントパス | The address of an element, e.g. `cue:c1/beat:c1:page1/line:0/word:2/letter:1`, `credit:end/...`, `layer:<id>`. |
| **Formation** | フォーメーション | The shape the letters are arranged into: row, vertical, circle, spiral, and so on. A **Start formation** is where the letters come from, §6.6. |
| **Anchor / Location** | アンカー／配置 | Where the whole formation sits on screen. |

### Style and motion
| Term | 日本語 | Definition |
|---|---|---|
| **Effect group** | 効果グループ | Animation, Layout, Enter, Exit, Hold, Location, Fill, Edge, Post, Background, Color. |
| **Effect / Effect type** | 効果／効果タイプ | One registered pattern in a group, e.g. `enter.scramble`. |
| **Effect instance** | 効果インスタンス | `{ type, params, motion, enabled }` applied to an element. |
| **Descriptor** | 記述子 | The registry entry for a type: its params, defaults, tags, cost, and CPU/GPU parts. It drives the Inspector and random generation. |
| **StyleSet** | スタイルセット | One effect instance per group, plus text settings and a ColorSet. |
| **Preset** | プリセット | A named StyleSet, partial or full. |
| **MotionDef** | モーション定義 | Timing shared by all groups: `in` / `out` (duration, delay, ease), `stagger`, and `loop`, §4.4. |
| **Ease / Easing** | イージング | A curve from 0..1 to 0..1 (easeOutBack, spring, steps, cubic-bezier, and others). |
| **Tween** | トゥイーン／補間 | Interpolating a value from A to B with an Ease. **Every** motion (all 11 groups, keyframes, formation blends, color transitions, layer/filler/credit motion) runs through the tween system, §6.2. |
| **Ease-in / Ease-out** (fields `in.ease` / `out.ease`) | イン／アウトのイージング | The curves for the start (in) and end (out) phases of a group. Not the same thing as the easing *names* `easeIn…` / `easeOut…`. |
| **Stagger** | スタッガー | Offsetting each letter's start time according to an order (ltr, center-out, random, …). |
| **Envelope** | エンベロープ | A 0..1 intensity of a persistent group over time, made from `in` and `out`. |
| **Progress** (`pe`, `px`) | 進行度 | The eased 0..1 progress of Enter or Exit for one letter. |
| **LetterState** | 文字状態 | The per-frame values for a letter (position, rotation, scale, opacity, deform, …), §6.7. |
| **Deform** | 変形 | Movement *inside* a letter, done in the vertex shader (jelly, twist, melt, …). |
| **Representation** | 表現形態 | How a letter is drawn: `mesh`, `stroke`, `particles`, or `pieces`. |
| **Override** | オーバーライド | A manual value stored at an element path. It is the top layer before keyframes. |
| **Keyframe / Track** | キーフレーム／トラック | A time-value-ease point, and the list of them for one property. Times are relative to the element's start. |
| **Resolution order** | 解決順序 | project → cue → beat kind → beat → overrides (cue → beat → line → word → letter) → keyframes. |
| **Seed** | シード | The number that makes all randomness reproducible. |
| **Lock** | ロック | A group that random generation must not change. |
| **Audio link** | 音声連動 | A param driven by audio analysis (rms, bands). |

### Rendering and output
| Term | 日本語 | Definition |
|---|---|---|
| **Layer** | レイヤー | A media layer in the `background` or `foreground` zone (video, image, card, solid, noise), §7.11. |
| **Lyrics layer** | 歌詞レイヤー | The transparent layer where Beats, Fillers and Credits are drawn. |
| **Pass** | パス | One GPU rendering step: text, SDF, fill, edge, post, bloom, composite. |
| **Target** (post) | 対象 | `text` (only the lyrics layer) or `frame` (the whole frame). |
| **SDF** | 距離場 | The signed distance field of the text mask (computed by jump flooding). |
| **Cost / Budget** | 負荷／予算 | GPU weight units per effect, and the per-frame limit in the preview (24), §14. |
| **Max duration** | 最大時間 | The user's upper limit on video length. **Overflow** (超過処理) is compress, drop, or cut, §7.17. |
| **Preview scale** | プレビュー倍率 | The reduced render resolution in the preview. |
| **Transparent export** | 透過書き出し | Output with alpha: VP9-alpha WebM or a PNG sequence. |

### Application
| Term | 日本語 | Definition |
|---|---|---|
| **Achievements page** | 実績ページ | The existing `index.html` view. |
| **Studio** | スタジオ | The editor page `studio.html`, §10. |
| **Menu bar, Media panel, Preview, Transport, Inspector, Timeline** | メニューバー、メディアパネル、プレビュー、トランスポート、インスペクター、タイムライン | The Studio's areas (§10.2–10.7). Transport = play/pause/seek controls. |
| **Track / Clip / Lane** | トラック／クリップ／レーン | Timeline row / block on a row (cue, beat, filler, credit, layer) / per-property keyframe row. |
| **Project** | プロジェクト | The `.telopmotion.json` document, §4.5. |
| **Handoff** | 受け渡し | Passing the dataset from the Achievements page to the Studio. |
| **Platform** | プラットフォーム | `SA.platform`: the Electron or web adapter, §5.1. |
| **Electron build / Web build** | Electron版／Web版 | The same `renderer/`, run in Electron or served from GitHub Pages. |

---

## 1. Existing codebase facts (read these first)

| File | What it is / what to know |
|---|---|
| `main.js` | Electron main process. IPC handlers: `suno:fetch`, `suno:clip`, `cache:list/load/remove/export/import`, `snapshot:save`, `app:open-external`. `renderSnapshotJpeg()` opens a hidden 1920×1080 window on `renderer/snapshot.html` and runs `capturePage`. The `SA_SMOKE*` environment variables run self-tests. A `webRequest` hook adds `Referer: https://suno.com/` for `*.suno.ai` and `*.cloudfront.net`. |
| `preload.js` | Exposes `window.sunoApi` through `contextBridge`. The renderer runs sandboxed, with `contextIsolation`. |
| `lib/suno-core.js` | Node fetch core, shared with `scripts/scrape.js`. Produces the **Dataset** (§4.1). |
| `renderer/index.html` | Main UI. CSP meta: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src https:; font-src 'self'; connect-src 'none'; …`. Loads `js/config.js, i18n.js, achievements.js, suno.js, app.js`. |
| `renderer/js/app.js` | UI controller. `init()` **returns early if `window.sunoApi` is missing**; this must change for the web build. Exposes `window.SA.app = { init, openProfile, refresh, currentData }`. Has format helpers `fmtInt`, `fmtNum`, `fmtDate`, `fmtDuration`, `fmtClock`. |
| `renderer/js/achievements.js` | `SA.achievements.evaluate(dataset)` returns the **Evaluation** (§4.2). `SA.achievements.categories` lists 9 categories. There are 32 badges, each with `tier` ∈ white/bronze/silver/gold. |
| `renderer/js/i18n.js` | `SA.i18n = { languages, t(key, vars), tPlural(key, n, vars), set(code), lang(), locale(), detect() }`. `DICT` is nested by language, and `{var}` placeholders are filled in. |
| `renderer/js/suno.js` | `SA.data`: a promise wrapper over `window.sunoApi` that unwraps `{ok, data | error:{code, message}}`. |
| `renderer/js/snapshot.js`, `renderer/snapshot.html`, `renderer/css/snapshot.css` | DOM version of the 1920×1080 card. **These are the visual reference for the canvas card.** Header: avatar, name, verified, handle, description, 6 stat tiles, completion ring. Grid: 32 badges. Footer: generated date, "unofficial". |
| `renderer/js/config.js` | `SA.config = { version, songUrl(id), profileUrl(handle) }`. |
| `package.json` | `npm start`, `npm run dist` (electron-builder, Windows NSIS + portable, `files` includes `renderer/**/*`), `npm run check` (a list of `node --check` calls). |

**Colors from `snapshot.css`:**
- Base colors: `--bg #0b0d12`, `--bg-soft #10131b`, `--card #151924`, `--card-2 #1b2130`, `--line #252c3d`, `--text #e9ecf4`, `--muted #8d96ab`, `--accent #ff8a3d`, `--accent-2 #ff4d8d`.
- Tier stripe colors: white `#eef1f8`, bronze `#cd7f32`, silver `#c3cad8`, gold `#ffc247`.
- Category colors (tint, tint2):

| Category | tint | tint2 |
|---|---|---|
| catalog | `#4d8dff` | `#6f5bff` |
| plays | `#5fd44d` | `#22c07a` |
| likes | `#ff5c8a` | `#ff2d68` |
| tiers | `#ffc247` | `#ff8a3d` |
| superlatives | `#b06bff` | `#8a5cff` |
| time | `#4dc8ff` | `#2f7cf6` |
| diversity | `#ff5cd0` | `#b44dff` |
| community | `#7c8cff` | `#5566ff` |
| gem | `#2ee6c0` | `#0fb8b8` |

- Locked badges are grayed out, and so are their tier stripes.

---

## 2. Code conventions

**Browser module pattern (UI and DOM code):**
```js
window.SA = window.SA || {};
SA.foo = (() => {
  'use strict';
  // ...
  return { publicFn };
})();
```

**Pure logic modules** must also load in Node for tests. Use this dual pattern:
```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SA = root.SA || {}; root.SA.easing = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ...
  return { /* api */ };
});
```
The pure modules are: `easing`, `tween`, `rng`, `color`, `srt`, `script-gen`, `layout`, `motion`, `geometry`, `effects/registry`, and `project`. They must not touch the DOM, `window`, or WebGL.

**Other conventions:**
- 2-space indent, single quotes, semicolons, `const`/`let`, no classes unless they clearly help. Small named functions, following the existing style.
- Errors are coded, like `Object.assign(new Error('msg'), { code: 'x' })`, and IPC replies use the `{ok, data|error}` shape (see `main.js` `ok`/`fail`).
- Replace the `check` script with `scripts/check.js`, which runs `node --check` over every `.js` in `lib/`, `scripts/`, and `renderer/js/`, and skips `renderer/vendor/`.
- Tests use Node's built-in runner: `node --test "scripts/test/**/*.test.js"`. Add `"test": "node --test \"scripts/test/**/*.test.js\""` to `package.json` (a plain directory argument is broken on Node 24 + Windows).

---

## 3. Target file tree

```
main.js                         EDIT  new IPC (file:save/open, file:stream-*, image:fetch, asset:read, studio:open, studio:autosave-*, recent:*); remove snapshot window
preload.js                      EDIT  expose new IPC
package.json                    EDIT  scripts: check, test, vendor; devDeps: mp4-muxer, webm-muxer, opentype.js, earcut
scripts/check.js                NEW
scripts/vendor.js               NEW   copies vendor UMD builds + fonts into renderer/vendor, renderer/fonts
scripts/test/*.test.js          NEW   easing, tween, rng, color, srt, script-gen, layout, motion, geometry, project, textflow, fillers, credits, audio-analysis, duration
.github/workflows/pages.yml     NEW
renderer/
  index.html                    EDIT  web mode, "Open Studio" button, CSP
  studio.html                   NEW   editor page
  css/style.css                 EDIT  web-mode import drop zone
  css/studio.css                NEW
  fonts/                        NEW   NotoSans-Regular/Bold.ttf, NotoSerif-Regular.ttf, NotoSansJP-Regular/Bold.otf, DelaGothicOne-Regular.ttf, BebasNeue-Regular.ttf, OFL.txt
  vendor/                       NEW   mp4-muxer.js, webm-muxer.js, opentype.js, earcut.js, LICENSES.txt
  js/platform.js                NEW   §5.1
  js/format.js                  NEW   §5.2 (moved from app.js/snapshot.js)
  js/suno.js                    EDIT  go through SA.platform
  js/app.js                     EDIT  web mode, use SA.format, canvas snapshot, open studio
  js/card/palette.js            NEW   §5.3
  js/card/canvas-card.js        NEW   §5.3
  js/srt.js                     NEW   §5.4
  js/script-gen.js              NEW   §5.5
  js/color.js                   NEW   §5.6
  js/lyrics/rng.js              NEW   §6.1
  js/lyrics/easing.js           NEW   §6.2 (≥ 30 tween curves)
  js/lyrics/tween.js            NEW   §6.2 (value interpolation used by all motion)
  js/lyrics/font.js             NEW   §6.3
  js/lyrics/geometry.js         NEW   §6.4
  js/lyrics/scene.js            NEW   §6.5
  js/lyrics/layout.js           NEW   §6.6
  js/lyrics/motion.js           NEW   §6.7
  js/lyrics/textflow.js         NEW   §7.16 (restructure → beats)
  js/lyrics/fillers.js          NEW   §7.14 (gap fillers)
  js/lyrics/audio-analysis.js   NEW   §7.14 (FFT, waveform, determinism)
  js/lyrics/credits.js          NEW   §7.15 (title / artist elements)
  js/lyrics/duration.js         NEW   §7.17 (max duration, overflow)
  js/lyrics/effects/registry.js NEW   §7 (descriptors + CPU-side effect functions)
  js/lyrics/effects/*.js        NEW   one file per group: animation, layout, enter, exit, hold, location, fill, edge, post, background, color
  js/lyrics/presets.js          NEW   §7.13
  js/lyrics/gl/context.js       NEW   §8
  js/lyrics/gl/shaders.js       NEW   §8 (all GLSL as strings)
  js/lyrics/gl/passes.js        NEW   §8
  js/lyrics/gl/sdf.js           NEW   §8.4
  js/lyrics/gl/shapes.js        NEW   §7.14 (rounded rects, circles, rings, polylines for fillers)
  js/lyrics/engine.js           NEW   §8.6 renderFrame
  js/lyrics/canvas2d-fallback.js NEW  §8.7
  js/video-export.js            NEW   §9
  js/studio/store.js            NEW   §10.1 state, pub/sub, commands, undo/redo
  js/studio/project.js          NEW   §4.5 schema, migrate, defaults, resolve
  js/studio/app.js              NEW   §10.2 shell, panels, splitters, shortcuts
  js/studio/menu.js             NEW   §10.3
  js/studio/media.js            NEW   §10.4
  js/studio/preview.js          NEW   §10.5
  js/studio/inspector.js        NEW   §10.6
  js/studio/controls/*.js       NEW   number, select, bool, vec2, color, gradient, easing, motion-def, font, text
  js/studio/timeline.js         NEW   §10.7
  js/studio/colors.js           NEW   §10.8 picker, palettes, gradient editor
  js/studio/random.js           NEW   §10.9
  js/studio/io.js               NEW   §10.10 save/open/autosave/import
  js/studio/export-dialog.js    NEW   §9 UI
DELETED in P2: renderer/snapshot.html, renderer/js/snapshot.js, renderer/css/snapshot.css
```

---

## 4. Data schemas

### 4.1 Dataset (existing; produced by `lib/suno-core.js` `fetchAll`)
```js
{
  profile: { handle, displayName, description, avatar /*url|null*/, isVerified, followers, following, totalClips },
  songs: [{ id, title, image, imageLarge, audio, video, createdAt /*ISO*/, plays, likes, comments,
            duration /*s|null*/, tags: string[], model, caption, isContest, isPinned }],
  fetchedAt: ISO, source: string
}
```
A file is valid when `Array.isArray(songs) && profile` (the same check as in `main.js`).

### 4.2 Evaluation (existing; returned by `SA.achievements.evaluate`)
```js
{
  agg: { songCount, totalPlays, totalLikes, totalComments, totalDuration, followers, distinctTags, distinctModels,
         contestCount, marathon, streak, earlyBird, nightOwl, firstDate, topPlayed, topLiked, topCommented, hiddenGem, songs },
  badges: [{ id, category, tier, icon, kind /*metric|best|binary*/, current, target, unlocked, progress /*0..1*/,
             detail: null | {type:'song', song, stat} | {type:'count', n} | {type:'date', value} }],
  unlockedCount, total, completion /*0..1*/
}
```

### 4.3 Cue
```js
{
  id: 'c_8f3a…',          // stable random id, never reused
  start: 12.5, end: 15.0, // seconds
  text: 'Centurion\n100 songs',   // may contain \n; SRT <b><i><font color> are parsed into spans
  spans: [{ from, to, bold, italic, underline, color }],   // derived from tags, optional
  fx: { enter: 'scramble', exit: 'explode' },   // from inline {fx:...}, optional
  meta: { kind: 'intro'|'badge'|'stat'|'song'|'completion'|'outro'|'custom', badgeId, category, tier, songId }
}
```

### 4.4 MotionDef — the shared timing and easing definition used by **every** effect group
```js
{
  in:  { duration: 0.6, delay: 0, ease: 'easeOutCubic' },   // ramp at cue start (enter phase)
  out: { duration: 0.5, delay: 0, ease: 'easeInCubic' },    // ramp at cue end (exit phase)
  stagger: { each: 0.035, order: 'ltr', ease: 'linear', unit: 'letter' /*letter|word|line*/, from: 0.5 },
  loop: { period: 0 /*s, 0=off*/, yoyo: false, ease: 'easeInOutSine' }   // used by hold-type effects
}
```
`duration` may also be a string like `'40%'`, meaning a fraction of the cue length. It is resolved when the scene is built.

**Tween guarantee.** Every field above runs through `SA.tween` (§6.2); no ad-hoc interpolation anywhere:
- `ease`, `stagger.ease` and `loop.ease` accept any of the **33 named curves** (≥ 30 required), plus `cubic-bezier(a,b,c,d)`, `spring(k,c,m)`, `steps(n,dir)` and `hold`.
- The same tween functions drive Enter/Exit progress, hold envelopes, layout formation blends, `layout.sequence`, keyframes, color transitions and layer/filler/credit motion, so one ease behaves identically in every group.
- Tween value kinds: `number`, `int`, `vec2`, `vec3`, `color`, `gradient`, `points`, `bool`, `step`.
- Any param whose kind is `number`, `int`, `vec2` or `color` (including effect params, §7) can be keyframed, and is therefore tweenable.

**What in/out mean for each group:**

| Group | `in` | `out` |
|---|---|---|
| Enter | drives progress 0→1 | ignored |
| Exit | ignored | drives progress 0→1 |
| Animation, Layout, Location, Hold, Fill, Edge, Post, Background, Color | intensity envelope 0→1 at the start | 1→0 at the end |

Layout is special: the `in` progress moves letters from the start formation to the target, and the `out` progress moves them from the target to the exit formation.

### 4.5 Project (`.telopmotion.json`, handled by `js/studio/project.js`)
```js
{
  format: 'telopmotion', version: 1,
  meta: { title, createdAt, updatedAt, lang },
  output: { aspect: '16:9'|'9:16', fps: 30|60, width, height /*derived*/, durationMode: 'cues'|'audio'|'max', range: null|{from,to},
            maxDuration: null|seconds,            // §7.17 user-set upper limit (null = unlimited)
            overflow: 'compress'|'drop'|'cut',    // what to do when content is longer than maxDuration
            audioFadeOut: 1.5 },
  dataset: Dataset|null,                 // embedded copy (so the project is self-contained)
  media: {
    audio: null | { name, mime, dataRef },           // dataRef → IndexedDB/userData blob key; not inlined
    images: [{ id, name, mime, dataRef, source: 'upload'|'avatar'|'cover:<songId>' }],
    fonts:  [{ id, family, name, dataRef, builtin: bool }]
  },
  palettes: [{ id, name, colors: ['#…'], builtin: bool }],
  categoryColors: { catalog: {tint, tint2}, ... },     // overrides of §1 table; used by the card + generated cues
  cardTheme: { bg, bgSoft, card, card2, line, text, muted, accent, accent2, tiers: {white,bronze,silver,gold} },
  script: { options: ScriptOptions /*§5.5*/, cues: Cue[] },
  style: StyleSet,                        // project-level default style
  styleMode: { order: 'fixed'|'cycle'|'random', seed: 12345, locked: ['layout', ...] },
  cueStyles: { [cueId]: StyleSet /*partial*/ },
  beatKindStyle: { page, recap, repeat, emphasis, single: StyleSet /*partial*/ },   // §7.16
  beats: { [cueId]: Beat[] },            // result of restructuring; pinned beats come from manual edits
  beatStyles: { [beatId]: StyleSet /*partial*/ },
  overrides: { [elementPath]: { [propPath]: value } },
  keyframes: { [elementPath]: { [propPath]: [{ t /*s, cue-relative*/, value, ease }] } },
  markers: [{ t, label }],
  layers: Layer[],           // background and foreground media, §7.11; the lyrics layer sits between them
  fillers: FillerSettings,   // §7.14 what plays in gaps with no cue
  credits: CreditSettings    // §7.15 song title / artist elements
}
```

**Layer** (image/video layers behind and in front of the lyrics):
```js
{
  id, name, zone: 'background'|'foreground', kind: 'video'|'image'|'card'|'solid'|'noiseGradient',
  mediaId /*video or image*/, color /*solid*/, params: {…},
  start: 0, end: null /*null = whole video*/,
  video: { trimIn: 0, trimOut: null, speed: 1, loop: true, muted: true /*video audio is not used in v1*/ },
  fit: 'cover'|'contain'|'stretch'|'none', transform: { x, y, scale, rotate, anchor },
  opacity: 1, blend: 'normal'|'add'|'screen'|'multiply'|'overlay'|'softLight',
  filters: { blur: 0, dim: 0, saturation: 1, hue: 0 },
  motion: MotionDef,          // in/out envelope → fade/zoom/slide in/out using the layer's own easing
  enterFx: 'fade'|'zoom'|'slide'|'none', exitFx: …,
  visible: true, locked: false
}
```
- Layers are drawn in array order within each zone.
- Keyframes use the path `layer:<id>`, e.g. `keyframes['layer:abc']['opacity']`.

**StyleSet**: one EffectInstance per group, plus text settings.
```js
{
  text: { fontId, size /*px @1080 short side*/, weight, letterSpacing, lineHeight, align, maxWidth /*0..1*/ },
  animation: EffectInstance, layout: EffectInstance, enter: EffectInstance, exit: EffectInstance,
  hold: EffectInstance[] /*stackable*/, location: EffectInstance, fill: EffectInstance,
  edge: EffectInstance[] /*stackable*/, post: EffectInstance[] /*stackable*/, background: EffectInstance,
  color: ColorSet
}
```

**EffectInstance**:
```js
{ type: 'slide', params: { dir: 'up', distance: 0.25 }, motion: MotionDef, enabled: true }
```

**ColorSet**:
```js
{ fill: ColorValue, fill2: ColorValue, stroke: ColorValue, glow: ColorValue, shadow: ColorValue, paletteId, useCategory: bool }
```

**ColorValue**, one of:
- `{ kind: 'solid', value: '#ff8a3d', alpha: 1 }`
- `{ kind: 'gradient', type: 'linear'|'radial'|'angular', angle: 90, stops: [{ pos: 0..1, color: '#…', alpha }], space: 'element'|'line'|'screen' }`
- `{ kind: 'palette', paletteId, index }`
- `{ kind: 'category', which: 'tint'|'tint2' }`

**elementPath** grammar (canonical):
- A cue that fits without splitting has exactly one beat of kind `single`.
- `beatId` = `<cueId>:<kind><index>`, e.g. `c1:single0`, `c1:page1`, `c1:recap0`.
- Below a cue, every path goes through the beat: `cue:<cueId>/beat:<beatId>/…`.
- Full forms:
  - `cue:<cueId>`
  - `cue:<cueId>/beat:<beatId>`
  - `cue:<cueId>/beat:<beatId>/line:<i>`
  - `cue:<cueId>/beat:<beatId>/line:<i>/word:<j>`
  - `cue:<cueId>/beat:<beatId>/line:<i>/word:<j>/letter:<k>`
- Credits use the same grammar under their own root: `credit:element/…`, `credit:always/…`, `credit:end/…` (each with `beat:<beatId>`).
- Media layers are addressed as `layer:<id>`.
- Letter indices are grapheme indices within their word.

**propPath** examples:
- `transform.x`, `transform.y` (px @ output resolution)
- `transform.rotate` (deg), `transform.scale`, `transform.tiltX`, `transform.tiltY`, `transform.opacity`
- `text.size`
- `enter.type`, `enter.params.distance`, `enter.motion.in.ease`
- `fill.type`
- `color.fill`
- `hold[0].params.amp`

**Resolution order** (`project.resolveStyle(elementPath)`): each later layer overrides the earlier one:

```
project.style → cueStyles[cueId] → beatKindStyle[beat.kind] → beatStyles[beatId] → overrides[cue] → overrides[beat] → overrides[line] → overrides[word] → overrides[letter]
```

`cueStyles[cueId]` holds the cue-scope preset/random layer, and `beatStyles[beatId]` holds the beat-scope one (manual edits, random style, presets). Keyframes are applied after all of that (§6.7).

**Migration:** `project.migrate(obj)` upgrades older `version`s. Unknown fields are kept.

**Text-edit safety:** when a cue's text changes, overrides and keyframes are kept for word and letter indices that still exist. The rest are moved to `overrides['orphan:'+cueId]`, and the inspector shows "N orphaned edits — discard".

---

## 5. Shared, non-video modules

### 5.1 `js/platform.js` → `SA.platform`
```js
isElectron: boolean                                  // typeof window.sunoApi === 'object'
fetchProfile(handle, onProgress) → Promise<Dataset>  // Electron only; web → rejects {code:'unsupported'}
cache: { list, load, remove }                        // Electron only; web → [] / null / false
importJson() → Promise<{canceled, data}>             // Electron: existing cache:import; web: <input type=file accept=".json,application/json">
readAsset(path) → Promise<ArrayBuffer>               // same-origin asset (fonts): web → fetch(); Electron → IPC asset:read
readFile(accept) → Promise<{name, type, bytes: ArrayBuffer}|null>   // generic picker (audio/image/font/srt)
saveFile({ bytes|blob, name, mime, filters }) → Promise<{canceled, filePath?}>
openStream({ name, mime, filters }) → Promise<{ write(Uint8Array, position?), close(), abort() }|null>  // for large video
loadImage(url) → Promise<HTMLImageElement|ImageBitmap>   // never taints canvases (see below)
openStudio(dataset, lang) → void
```
- **`saveFile`:**
  - Electron: `ipc file:save {bytes: Uint8Array, defaultName, filters}` → `dialog.showSaveDialog` → `fs.writeFile`.
  - Web: `URL.createObjectURL(blob)` + `<a download>`, then revoke after 10 s.
- **`openStream`:**
  - Electron: `file:stream-open` returns `{id, canceled}`; then `file:stream-write {id, position, bytes}` (the main process uses `fs.write` with `position`); then `file:stream-close {id}`.
  - Web: `window.showSaveFilePicker` if it exists, otherwise `null`, and the caller falls back to `ArrayBufferTarget` + `saveFile`.
- **`loadImage`:**
  - Electron: `ipc image:fetch {url}`. The main process allows only hosts that match `/(^|\.)(suno\.ai|suno\.com|cloudfront\.net)$/`, and only `https:`. It fetches with the Referer header and a 10 MB size cap, and returns a `data:` URL; the renderer loads that into an `Image`.
  - Web: `img.crossOrigin = 'anonymous'`. On error, resolve with a generated placeholder: a canvas with a 2-color gradient from the category/accent colors plus initials, turned into an `ImageBitmap`.
  - Cache the results in a `Map` keyed by URL.
- **`openStudio`:**
  - Electron: `ipc studio:open {dataset, lang}`. The main process loads `renderer/studio.html` into the same window and sends `studio:data` after `did-finish-load`.
  - Web: put `{dataset, lang}` into IndexedDB (`sa-studio`/`handoff`), then `location.href = 'studio.html#handoff'`.

### 5.2 `js/format.js` → `SA.format`
Move these out of `app.js`/`snapshot.js` without changing behavior: `esc`, `fmtInt`, `fmtNum`, `fmtDate`, `fmtDuration`, `fmtClock`, and `detailText(badge)`. All of them use `SA.i18n.locale()`. Update `app.js` to use them.

### 5.3 `js/card/palette.js` + `js/card/canvas-card.js` → `SA.card`
- `palette.js` holds the §1 colors as defaults. `SA.card.theme(project?)` merges in `project.cardTheme` and `project.categoryColors`.
- `SA.card.draw(ctx, { dataset, evaluation, aspect, theme, images: { avatar }, lang, generatedAt })`:
  - `ctx` is a 2D context sized **exactly** to 1920×1080 or 1080×1920.
  - Draw order: background (radial glows as in `snapshot.css` `body`), header, grid, footer.
- **16:9 layout** (match `snapshot.css`; verified against `snapshot/achievement-card.jpg` with a pixel-run measurement):
  - padding 40; top 28; bottom 22; vertical gaps 15
  - header height 98: avatar 86×86 rounded square (r=20), name 34px bold, handle muted 18px, description (1 line, cut with an ellipsis), 6 stat tiles (value 30px bold, label 13px uppercase), completion ring 98 (conic gradient) with summary and brand
  - grid of 8 columns × 4 rows with 9 px gaps
  - footer height 20
- **9:16 layout:**
  - padding 40
  - header stacked vertically (580 tall): avatar 112 rounded square, name row (40px) centered, description, stat tiles in a 3×2 grid, then the ring 108 and summary centered
  - grid of 4 columns × 8 rows with 12 px gaps
  - footer
- **Badge cell** (16:9 metrics; 9:16 scales them down):
  - rounded rect r=12, fill `card-2`, border 1 px (unlocked: tint at 45% alpha; locked: `line-soft`)
  - left tier stripe 6 px (locked: `#4a5164`)
  - icon box 44×44 r=12 with a tint→tint2 gradient (locked: `card` background, tint icon)
  - name bold 17px, 2-line description 14px muted, detail line 13.5px, progress bar 8px (tint gradient) with an `a / b` label for metric/best badges
  - locked cells are drawn at an overall 74% alpha, matching `.snap-badge.is-locked`
- **Icons:** port the SVG symbol paths used by the badges plus `verified` from `snapshot.html` into `Path2D` strings (11 in total). They are 24×24 stroke icons; draw them with `stroke`, lineWidth 2, round caps.
- **Text:**
  - `ctx.font` with the same family stack as the CSS.
  - `fitText(ctx, text, maxWidth, maxLines)` wraps and adds ellipses. Use `Intl.Segmenter` (granularity `'word'`) for line breaks, and fall back to breaking per grapheme for Japanese.
- `SA.card.layout(aspect, badges?)` returns `{ badgeRects: {badgeId: {x, y, w, h}}, headerRect, ringRect }`. The video background uses it to zoom the camera. Without `badges`, `badgeRects` is empty.
- `SA.card.renderToBlob({ …, type: 'image/jpeg'|'image/png', quality: 0.92 })` returns a `Blob`, using an `OffscreenCanvas`.
- **Parity check:** the 16:9 canvas card must look the same as the old DOM snapshot: same content and colors, positions within about 8 px. This is done: the DOM snapshot files and `snapshot:save`, `renderSnapshotJpeg` and `snapshotWindow` in `main.js` were deleted in P2. The `SA_SMOKE_SNAPSHOT` hook now renders both aspects through `executeJavaScript` and writes them to temp.

### 5.4 `js/srt.js` → `SA.srt` (pure)
```js
parse(text) → { cues: Cue[], warnings: [{ code, line, message }] }   // pure; never mutates shared state
stringify(cues, { includeFx = false }) → string
formatTime(sec) → '00:01:02,345'; parseTime('00:01:02,345' | '00:01:02.345' | '1:02.3') → sec
stripTags(text) → { plain, spans }
```
- **What `parse` accepts:**
  - a UTF-8 BOM
  - `\r\n`, `\n` or `\r` line endings
  - missing or incorrect index lines
  - `,` or `.` before the milliseconds, and 1–3 digit milliseconds
  - extra blank lines
  - position suffixes after the time line (ignored)
- **Validation:**
  - Cues with `end <= start` are fixed to `start + 1`, with a warning.
  - Cues are sorted by start time.
  - Each cue gets a new `id`.
- **Inline override tag:** `{fx:enter=scramble,exit=explode,layout=circle,fill=chrome}` at the start of the text sets `cue.fx` and is removed from the text.
- **Tags:** `<b>`, `<i>`, `<u>` and `<font color="#hex">` become `spans`. Everything else is stripped.
- **Line-break escapes** inside cue text (the same rule applies to credits, fillers and inspector text input):
  - `\N` and a literal `\n` → forced line break
  - `\P` → forced page break (§7.16)
  - `\h` → non-breaking space
  - `<br>` → line break
  - Real newlines in the SRT are also line breaks.
  - `stringify` writes real newlines for line breaks and keeps `\P` as is.
- **`stringify`:** writes CRLF and indexes starting at 1. `includeFx` writes the `{fx:…}` tag back out.

### 5.5 `js/script-gen.js` → `SA.scriptGen` (pure; takes `t` as a translate function)
```js
ScriptOptions = {
  intro: true, reveal: { enabled: true, which: 'unlocked'|'all', order: 'grid'|'tier'|'category'|'date' },
  stats: { enabled: true, items: ['songs','plays','likes','comments','runtime','followers'] },
  topSongs: { enabled: true, n: 3, by: ['plays','likes'] },
  completion: true, outro: true,
  timing: { perCue: 2.8, gap: 0.3, introLen: 3.5, outroLen: 3 },
  fitToAudio: false, audioDuration: null
}
build(evaluation, dataset, options, t, format) → Cue[]
fitToDuration(cues, duration) → Cue[]   // scales starts/ends linearly, keeps gaps proportional
```
**Cue templates.** Add these i18n keys under `studio.script.*` in all 5 languages:

| Cue | Text | `meta.kind` |
|---|---|---|
| intro | `{displayName}\n@{handle}` | `intro` |
| reveal (one per badge) | `{badgeName}\n{detailText or progress a/b}` | `badge`, with `badgeId`, `category`, `tier`. Locked badges shown with which=all get the suffix `studio.script.locked`. |
| stat | `studio.script.stat.{item}` e.g. `"{value} total plays"` | `stat` |
| topSong | `studio.script.topSong` → `"#{rank} {title}\n{value} {statLabel}"` | `song`, with `songId` |
| completion | `studio.script.completion` → `"{unlocked}/{total} achievements · {percent}%"` | `completion` |
| outro | `studio.script.outro` → `"Made with TelopMotion (unofficial)"` | `outro` |

- **Timing:** cues are laid out one after another: `start(n) = end(n-1) + gap`. The intro and outro use their own lengths.
- **Fit to audio:** if `fitToAudio` and `audioDuration` are set, run `fitToDuration` at the end.

### 5.6 `js/color.js` → `SA.color` (pure)
- `parse(str)` accepts `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `hsl()`, and returns `{r, g, b, a}` in 0..1.
- `toHex`
- `rgbToHsv` and `hsvToRgb`
- `rgbToOklab` and `oklabToRgb`
- `mix(a, b, t, space = 'oklab')`
- `resolve(colorValue, ctx)` resolves a ColorValue into concrete colors or gradients:
  - `ctx = { palettes, categoryColors, category, t }`
  - the result is `{ kind: 'solid', rgba } | { kind: 'gradient', type, angle, stops: [{pos, rgba}] }`
- `sampleGradient(stops, pos)` blends in OKLab.
- `lerpColorValue(a, b, t)` is used for color keyframes. Two solids blend in OKLab. Two gradients with the same number of stops blend stop by stop. Anything else switches at t = 0.5.

---

## 6. Lyrics engine core (pure CPU parts)

### 6.1 `lyrics/rng.js`
- `mulberry32(seed)` returns `() → [0, 1)`.
- `hash32(...parts)` uses FNV-1a over the string join.
- `rngFor(seed, ...path)` = `mulberry32(hash32(seed, ...path))`. Use one per element, for example `rngFor(seed, cueId, 'letter', k, 'enter')`, so that changing one element's randomness never changes another's.
- Helpers: `range(r, a, b)`, `pick(r, arr)`, `gauss(r)`.

### 6.2 `lyrics/easing.js` + `lyrics/tween.js`
#### Easing
Export `get(name) → (t: 0..1) → number`, `names`, `cubicBezier(x1, y1, x2, y2)`, `spring({ stiffness = 170, damping = 26, mass = 1 })`, `steps(n, 'start'|'end')`, `hold()`, and `parse(str)`.

`parse` accepts:
- a name
- `'cubic-bezier(a,b,c,d)'`
- `'spring(170,26,1)'`
- `'steps(4,end)'`
- `'hold'` (no interpolation; switches at the end)

**33 named curves (the minimum is 30, and `names.length ≥ 30` is asserted in tests):**

| # | Curve |
|---|---|
| 1 | `linear` |
| 2–4 | `quadIn`, `quadOut`, `quadInOut` |
| 5–7 | `cubicIn`, `cubicOut`, `cubicInOut` |
| 8–10 | `quartIn`, `quartOut`, `quartInOut` |
| 11–13 | `quintIn`, `quintOut`, `quintInOut` |
| 14–16 | `sineIn`, `sineOut`, `sineInOut` |
| 17–19 | `expoIn`, `expoOut`, `expoInOut` |
| 20–22 | `circIn`, `circOut`, `circInOut` |
| 23–25 | `backIn`, `backOut`, `backInOut` (s = 1.70158) |
| 26–28 | `elasticIn`, `elasticOut`, `elasticInOut` (period 0.3) |
| 29–31 | `bounceIn`, `bounceOut`, `bounceInOut` |
| 32 | `smoothstep` |
| 33 | `smootherstep` |

Plus the parameterized forms `cubic-bezier(a,b,c,d)`, `spring(k,c,m)`, `steps(n,dir)` and `hold`, which all count as tween types too. Write the formulas by hand.

**`cubicBezier`:** solve x→t with Newton-Raphson (8 iterations), falling back to bisection (up to 20 iterations), with epsilon 1e-6.

**`spring`:** analytic damped harmonic oscillator. Settle time T is when the envelope drops below 0.001, and the function is normalized so that f(1) = 1 exactly (evaluate at t·T, then `f(1)` snaps to 1).

#### Tween
`tween.js` is the single place that interpolates values. All motion in the app uses it:

```js
value(kind, a, b, p, ease) → tweened value       // p is raw 0..1; ease is applied inside
segment({ kind, keys }, t) → value                // keys = [{ t, value, ease }]; before the first key → first value; after the last → last value; inside → the ease of the starting key
```

**Value kinds:** `number`, `int` (rounded), `vec2`, `vec3`, `color` (via `SA.color.lerpColorValue`, OKLab), `gradient`, `points` (pairwise; resampled if the counts differ), `bool` (switch at p ≥ 0.5), `step` (switch at p = 1).

**What is tweened (motion全般):**

| Consumer | Tweened value | Ease |
|---|---|---|
| Animation / `MotionDef.in`, `.out` | progress 0→1 | `in.ease` / `out.ease` |
| Stagger | per-letter start offsets | `stagger.ease` |
| Loop | hold-phase wrapping | `loop.ease` |
| Layout | start formation → target, `sequence` changes, `to` formation | `in.ease`, `out.ease`, per-sequence `ease` |
| Enter / Exit | effect progress `pe` / `px` | `in.ease` / `out.ease` |
| Hold | hold-local params, deformation amount | `loop.ease`, envelope |
| Location | anchor movement, `stacked` shift | `in.ease` |
| Fill / Edge / Post / Background | intensity envelope, shader params | group `in` / `out` |
| Color | fills, gradients, strokes, glows | `in.ease` + OKLab blend |
| Keyframes | any keyframed property | the starting key's `ease` |
| Layers / Fillers / Credits | their own `MotionDef` | same rules |

A tween is a pure function of `(kind, a, b, p, ease)`; it never reads wall-clock time, so preview and export stay identical.

**Tests:**
- `f(0) = 0` and `f(1) = 1` for every curve (tolerance 1e-6).
- `names.length ≥ 30`; every name resolves through `parse`.
- `cubicBezier(.25, .1, .25, 1)(0.5)` ≈ 0.8024 (±1e-3).
- InOut curves are symmetric.
- `value('number', 10, 20, 0.5, 'linear') === 15`; `segment` clamps before the first and after the last key; color tweens match OKLab blending.

### 6.3 `lyrics/font.js` → `SA.lyricsFont`
- **Built-in fonts:** `load(fontId)` gets the bytes through `SA.platform.readAsset(path)`, then `opentype.parse(arrayBuffer)`, then caches the result. On the web build `readAsset` uses `fetch()` (same origin; add `connect-src 'self'` to the studio CSP). In Electron the page is `file://`, where `fetch()` is blocked, so `readAsset` uses the IPC `asset:read` (§11.1) and returns the same bytes.
  - `NotoSans-Regular`, `NotoSans-Bold` (Latin, Cyrillic, Greek)
  - `NotoSerif-Regular`
  - `NotoSansJP-Regular`, `NotoSansJP-Bold` (loaded only when the text has CJK characters: `/[　-鿿＀-￯]/`)
  - `DelaGothicOne-Regular` (display font with Japanese)
  - `BebasNeue-Regular` (display font, Latin)
- **User fonts:** `.ttf`/`.otf`/`.woff` (not `.woff2`) loaded from the Media panel.
- **Fallback chain:** the chosen font → NotoSans → NotoSansJP. A character missing from every font becomes a **raster letter**: drawn with 2D `fillText` using the system font into a 256 px canvas, then traced to a contour with marching squares plus Douglas-Peucker (tolerance 0.75 px), so it still behaves like a vector.
- **Layout:** `layoutText(text, style, fonts, { direction: 'horizontal'|'vertical', maxWidth })` returns:
  ```js
  { lines: [{ words: [{ letters: [{ char, glyph, fontId, x, y, advance, bbox, vertRotate: bool }] }], width, height }], bbox }
  ```
  - Letters are graphemes, from `new Intl.Segmenter(lang, { granularity: 'grapheme' })`.
  - Words come from `Intl.Segmenter(lang, { granularity: 'word' })`. For CJK, groups of characters without spaces form one "word" per segment.
  - Kerning with `font.getKerningValue`. `letterSpacing` is em × size.
  - Lines break at `\n`, and wrap greedily at `maxWidth` using word boundaries (per grapheme for CJK).
  - `align`: left, center or right.
  - Positions are in px at the target font size, relative to the baseline origin of the text block.
  - **Vertical:** columns go top→bottom and right→left.
    - Full-width characters stay upright.
    - ASCII letters and digits are rotated 90° clockwise (`vertRotate`). Runs of 1–2 digits are set upright side by side (tate-chu-yoko).
    - Substitution map: `、。` → shifted to the top-right quadrant; `ー—〜…` → rotated; `「」『』（）【】` → vertical forms `﹁﹂﹃﹄︵︶︻︼` when the font has them, otherwise rotated 90°.
    - Column advance = size × lineHeight.

### 6.4 `lyrics/geometry.js` (pure; works on opentype path commands)
- `glyphContours(path, tolerance)`: flatten M/L/Q/C/Z commands into polylines, using adaptive subdivision (split until the flatness is below `tolerance`; default 0.35 px at the render size). Returns `[{ points: Float32Array, closed: true, area, length }]`.
- `groupContours(contours)`: decides outer shapes and holes without relying on winding direction (TrueType and CFF use opposite directions).
  - For each contour, depth = the number of other contours containing its first point (even-odd point-in-polygon test).
  - Even depth = outer shape. Odd depth = hole, attached to the smallest outer shape that contains it.
  - Returns `[{ outer, holes: [] }]`.
- `triangulate(groups)`: `earcut(flat, holeIndices)` per group, returning `{ positions: Float32Array, indices: Uint32Array }`. If earcut returns 0 triangles for a non-empty group, set `needsStencil = true` so the GL side falls back to stencil-then-cover for that letter.
- `strokeRibbon(contours, width)`: for each contour, build a triangle strip of quads offset by ±width/2 along smoothed normals, with a miter limit of 4.
  - Per-vertex `s` = distance along the outline so far, divided by the letter's total outline length (0..1 across all contours of the letter, in contour order).
  - Per-vertex `side` = ±1.
- `sampleInterior(tris, n, rng)`: pick triangles weighted by area, then a uniform point inside using barycentric coordinates (√r1 trick). Returns a `Float32Array` of 2n values.
- `sampleOutline(contours, n)`: points evenly spaced by length.
- `pieces(tris)`: splits the mesh into individual triangles (duplicating vertices), and returns the centroid, triangle id and area per vertex. Used by shatter.
- `bounds(points)`, and `centroid` weighted by area.
- **Cache:** results are cached per `(fontId, glyphIndex, size bucket)`. Size bucket = `round(log2(size) × 4)`. Geometry is made at the bucket size and scaled to the real size.

### 6.5 `lyrics/scene.js` → `buildScene(project, beat, fonts)`
Scenes are built **per Beat** (§7.16); the old word "CueScene" means **BeatScene**. The result is immutable and cached by `hash(beat.text, beat.lines, resolved text style, output aspect, fonts)`. Letter paths include the beat: `cue:x/beat:y/line:0/…`.
```js
{
  cueId, beatId, start, end, lines: [...], words: [...], letters: [{
    path: 'cue:x/beat:x:page1/line:0/word:1/letter:2', lineIdx, wordIdx, letterIdx, globalIdx, char,
    local: { x, y, w, h, cx, cy },           // from layoutText, relative to the text-block origin
    mesh:  { fill: {positions, indices}, stroke: {...}, pieces: {...}, needsStencil },   // lazily built
    samples: { interior: Float32Array, outline: Float32Array },                           // lazily built, 64..512 points by area
    style: ResolvedStyle                     // project.resolveStyle(letterPath)
  }],
  blockBBox
}
```
Letters are the smallest unit that gets a transform. "Parts of a letter" (contour, triangle, point) are addressed only by shaders and effects, not by the inspector.

### 6.6 `lyrics/layout.js` (pure) — formations
- `formation(type, params, letters, blockBBox, rng)` returns, per letter, `{ x, y, rot /*deg*/, scale }` relative to the anchor from Location.
- `startFormation(type, params, targets, frame, rng)` returns the per-letter start positions for build-up.

**Target formations.** `N` = letter count and `i` = letter index. Everything is in px at output resolution.

| type | params (default) | formula / behavior |
|---|---|---|
| `row` | — | Positions straight from `layoutText` (horizontal). |
| `vertical` | `columnGap: 1.2` | Uses the vertical `layoutText` result. |
| `circle` | `radius: 0.28` (× short side), `startAngle: -90`, `clockwise: true`, `faceOut: true` | θ_i = start + 360·(arcLen_i/total); pos = r(cosθ, sinθ); rot = θ + 90 if faceOut, otherwise 0. `arcLen` uses the letter advances, so spacing follows letter widths. |
| `arc` | `radius: 0.6`, `sweep: 120`, `bulge: 'up'` | Same as circle, but spread over `sweep` degrees and centered. |
| `spiral` | `r0: 0.05`, `r1: 0.35`, `turns: 2.5` | r = lerp(r0, r1, u), θ = u·turns·360, u = i/(N-1); rotation follows the tangent. |
| `wave` | `amp: 0.06`, `wavelength: 0.5`, `phase: 0` | row x; y += amp·sin(2π·x/λ + phase); rot = atan of the derivative. |
| `diagonal` | `angle: -20` | Row rotated by `angle` around the center; letters stay upright unless `followAngle`. |
| `staircase` | `step: 0.35` (× size) | row x; y = −i·step. |
| `grid` | `cols: 'auto'` | Letters fill a √N-ish grid that fits the safe area; each cell is scaled to fit. |
| `stackedWords` | `fillWidth: 0.8` | One word per line; each line is scaled to `fillWidth` × safe-area width. |
| `scatter` | `spread: 0.35` | Random positions within the safe area, with rejection sampling to keep a minimum distance of 0.8·size; rot ±15°. |
| `path` | `points: [[x, y], …]` (normalized 0..1), `smooth: true` | Letters placed by arc length along a Catmull-Rom spline through the points; rotation follows the tangent. The inspector lets you edit the points by dragging them in the preview. |

**Start formations** (`layout.params.from`), each with `curve` and `curveDir` params:

| from | Behavior |
|---|---|
| `offscreenEdges` | Each letter starts outside a random edge (per-letter RNG), at a distance of 0.6 × the frame. |
| `corners` | Letter i starts at corner (i mod 4). |
| `point` | All letters start at `{x, y}` (default: the center); `spread` adds a little noise. |
| `ring` | Letters start on a circle of radius 0.7 around their targets, at the angle toward the target plus 180°. |
| `depth` | Same x and y as the target, z = −8 (drawn with perspective scaling, so letters come from far away). |
| `mirror` | Mirrored across the center. |
| `formation:<type>` | Starts in another formation, e.g. `formation:circle`. This is the "builds up into a row" case. |
| `previousCue` | Starts where the previous beat's letter with the same index was at its end time. The previous beat is **re-evaluated at its end time** on demand (never read from the last rendered frame), so seeking backwards gives the same result. Extra letters use `point`. |

**Path from start to target:** a quadratic bezier from S to T.
- Control point = midpoint + perpendicular × `curve` × |T − S|. The direction is `curveDir`: `left`, `right`, `alternate`, or `random`.
- Progress is the Layout `in` progress, with stagger and easing applied.
- Rotation and scale blend from the start values to the target values.

**Formation change during the hold:** `layout.params.sequence = [{ at: 0.5 /*fraction of hold time*/, type: 'circle', params: {…}, duration: 0.8, ease: 'easeInOutCubic' }]`. Each letter blends between the formations with the same bezier logic, and stagger applies.

**Exit formation:** `layout.params.to`, an optional start-formation-style target. The `out` progress moves letters from the current formation to it.

### 6.7 `lyrics/motion.js` (pure) — per-letter state at time t

**LetterState:**
```js
{ x, y, z, rot, tiltX, tiltY, scaleX, scaleY, skewX, opacity, blur, visibleFrac /*typewriter/draw-on*/,
  deform: { type, amount, params }[], represent: 'mesh'|'stroke'|'particles'|'pieces', reprProgress, colorMix, fx: {...shader per-letter params} }
```

`evaluateBeat(beatScene, t, ctx) → { letters: LetterState[], envelopes: { groupName: 0..1 }, active: bool }`

**Algorithm, per letter i** (all interpolation goes through `SA.tween` / `SA.easing`, §6.2):
1. `local = t − cue.start`, `dur = cue.end − cue.start`.
2. **Stagger offsets** (Animation group, `motion.stagger`):
   1. `rank_i` depends on `order`:
      - `ltr`: i
      - `rtl`: N−1−i
      - `center-out`: |i − (N−1)·from|
      - `edges-in`: max − |…|
      - `random`: permutation from the RNG
      - `word`: word index
      - `line`: line index
      - `strokeLength`: sorted by outline length
      - `oddEven`: odd letters first
      - `vertical-reading`: column-major for vertical text
   2. `u = rank_i / maxRank` (0 if maxRank = 0).
   3. `off_i = each × maxRank × ease(stagger.ease)(u)`, so the stagger easing can speed up or slow down the letters across the line.
3. **Enter progress:** `pe = clamp01((local − in.delay − off_i) / in.duration)`, then eased with `in.ease`.
4. **Exit progress:** `exitStart = dur − out.duration − out.delay − (offMax − off_i)` by default, so letters leave in the same order they entered. Setting `Animation.params.exitOrder = 'reverse'` uses `off_i` instead. Then `px = clamp01((local − exitStart) / out.duration)`, eased with `out.ease`.
5. **Envelope** for persistent groups: `env_g = in_g(local) × (1 − out_g(local))`, with each group's own MotionDef and stagger.
6. **Base:** `formation(layout)` at blend `pLayoutIn` / `pLayoutOut`, plus `location.anchor(t)`.
7. **Enter:** `enterFx.apply(state, pe, params, rng_i)`. This works on deltas: for example slide sets `y += (1 − pe) × dist`, and fade sets `opacity *= pe`.
8. **Hold:** each hold effect runs `apply(state, localHold, env, params, rng_i)`. `localHold` is the time since the enter ended, and `loop` wraps it with the period and yoyo.
9. **Exit:** `exitFx.apply(state, px, …)`.
10. **Animation extras:**
    - `followThrough`: a small damped overshoot on position changes.
    - `stepFps`: rounds `t` down to `1/stepFps` for letter motion only, which gives a stop-motion look.
    - `timeWarp`: easing applied to the whole cue's local time.
11. **Manual layer:** `overrides` transform values are **added** to position, rotation and tilt, and **multiplied** into scale and opacity. They are applied at letter, word and line level, so a word override moves all of its letters around the word's center.
12. **Keyframes:** for each property track of the element (and its parents), interpolate the value at `local`:
    - Before the first key: first value. After the last: last value. In between: blend with the **ease of the starting key**.
    - Transform tracks are additive offsets, the same as step 11.
    - Effect parameter tracks replace the value.
    - Color tracks blend with `color.lerpColorValue`.
13. The final **world transform** is `anchor · formation · line · word · letter · state`, as a 2D affine matrix plus a small 3D tilt handled in the vertex shader with perspective 1200 px.

Every effect function is a pure `(state, p, params, rng, info) → void`, where `info = { i, N, letter, cue, frame }`, and mutates `state`. Effects must not read wall-clock time.

---

## 7. Effect catalog (`lyrics/effects/*.js`)

> **分解軸と物理の設計**: 演出を A〜L の軸に分解した棚卸し・全 type の対応表・空白の分析・ロードマップ（内在力ソフトボディ、部分演出、多重化）は [textdecor2.md](./textdecor2.md) にある。

Each effect is registered with a **descriptor**:
```js
SA.fx.register({
  group: 'enter', type: 'slide', label: 'fx.enter.slide' /*i18n key*/,
  params: [ { key: 'dir', kind: 'select', options: ['up','down','left','right'], default: 'up', random: 'any' },
            { key: 'distance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, unit: 'frame', random: [0.1, 0.5] } ],
  defaults: { motion: { in: { duration: 0.6, ease: 'easeOutCubic' } } },
  tags: ['basic'],                                   // used by random generation filters
  cpu: (state, p, params, rng, info) => { … },      // letter-level
  gpu: null | { pass: 'text'|'fill'|'edge'|'post', uniforms: (params, env, t) => ({…}), define: 'FX_SLIDE' }
});
```
- **Param kinds:** `number`, `int`, `select`, `bool`, `color` (a ColorValue), `vec2`, `ease`, `points`, `font`.
- **The inspector (§10.6) and random generation (§10.9) are driven entirely by these descriptors.**
- Every group also has the MotionDef (§4.4) with `in` and `out` easing.
- Params of kind `number`, `int`, `vec2` and `color` are keyframable and therefore tweenable (§6.2); any `ease` param accepts any of the 33 named curves or the parametric forms.

### 7.1 Animation (timing across letters)
| type | params | Effect |
|---|---|---|
| `stagger` | order (ltr, rtl, center-out, edges-in, random, word, line, strokeLength, oddEven, vertical-reading), each (0–0.3 s), ease, from (0–1), unit | Staggered timing. This is the default. |
| `simultaneous` | — | Every letter starts at the same time (each = 0). |
| `cascade` | overlap (0–1) | Sequential by word; overlap is the fraction of the previous word still running when the next starts. |
| `spring` | stiffness, damping | Replaces the enter/exit easing with a spring. |
| `followThrough` | amount, decay | Letters overshoot when they stop and settle back. |
| `stopMotion` | fps (4–24) | Choppy frame-stepped motion. |
| `timeWarp` | ease | Speeds up or slows down the whole cue's local time. |
| `loop` | period, yoyo | Repeats the hold effects over a period. |

### 7.2 Layout (§6.6)
`type` is the target formation, and `params` includes `from`, `to`, `sequence`, `curve`, `curveDir`, and the formation-specific params.

### 7.3 Enter (progress p goes 0→1; each letter's state is set to its "before" value blended by p)
| type | Main params | Behavior |
|---|---|---|
| fade | — | opacity × p |
| typewriter | cursor (bool), cursorColor | visible when p ≥ 1 per letter (stagger does the timing); optional blinking cursor quad |
| slide | dir, distance | move from the offset |
| dropBounce | height | y from −height, eased with Bounce |
| zoomIn | from (0–3) | scale from `from` |
| blurIn | radius | blur (radius × (1−p)), sent to the text pass |
| flip3D | axis (x/y), angle | tilt from `angle` |
| rotateIn | angle | rotation from `angle` |
| scatterIn | spread | position from random offsets |
| waveRise | amp | y offset with the phase depending on i |
| elasticPop | — | scale 0→1 with easeOutElastic |
| scramble | charset (latin, katakana, digits, symbols), rate | shows random characters from the charset until p crosses a per-letter threshold. Each random character is laid out through `font.js` once per charset, then cached. |
| glitchIn | intensity | random x jitter and RGB-split parameters handed to the post pass |
| neonFlicker | flickers | opacity follows a step pattern from the RNG |
| strokeDrawOn | width, fillDelay (0–1) | shows the stroke ribbon with `visibleFrac = p`, then fades the fill in from `fillDelay` onward |
| particlesAssemble | count, spread, turbulence | particles from scattered positions to interior samples; at p = 1 the mesh takes over |
| shatterRebuild | spread, spin | triangle pieces from random offsets to their places |
| morphFromPrevious | points (512–4096) | the previous cue's interior samples blend into this cue's samples; §8.5 |
| noiseDissolveIn | scale, edgeColor, edgeWidth | GPU: threshold `p` against noise; edge glow |

### 7.4 Exit (progress p goes 0→1)
fade, slide, zoomOut, blurOut, explode (pieces fly outward from the block center with spin), gravityFall (y += g·p², with random spin), dissolve (noise threshold), wipe (dir; clipped in the text pass), typewriterReverse, shrinkToCenter, particlesDisperse, melt (vertex drip: y += drip(x-noise) × p², plus a stretch), burnAway (noise threshold with an orange-hot edge), strokeErase (visibleFrac = 1 − p on the stroke, after the fill fades).

### 7.5 Hold (scaled by the envelope; `h` = hold-local time)
| type | params | Behavior |
|---|---|---|
| none | — | — |
| floatBob | amp, speed | y += amp·sin(2π·speed·h + i·0.4) |
| sineWave | amp, freq, speed | phase depends on the letter's x |
| jitter | amp, rate | noise offsets changed at `rate` Hz |
| pulse | amount, bpm | scale 1 + amount·(½ + ½cos) |
| kenBurns | zoom, pan | slow zoom and pan of the whole block over the hold |
| drift | vx, vy | constant velocity |
| sway | angle, speed | rotation |
| marquee | speed | the block scrolls horizontally and wraps |
| jelly | amount, freq | GPU vertex: squash and stretch around the letter's bottom, with a phase per letter |
| wobbleWarp | amount, scale, speed | GPU vertex: noise displacement |
| twist | angle | GPU vertex: rotation that increases with local y |
| breathing | amount | GPU vertex: radial scaling from the letter center, sine |
| orbit3D | tilt, speed | tiltX/tiltY on circular paths |
| pathFollow | points, speed | the block moves along a spline |

### 7.6 Location
Anchor presets: `center`, `lowerThird` (y = 0.78), `upperThird` (y = 0.22), `left`, `right`, `randomSafe` (a new position per cue from the RNG), `karaoke` (y = 0.88, row layout), `stacked` (the newest cue at the bottom; earlier cues still showing shift up by line height with the `in` ease), `badgeAnchored` (next to `SA.card.layout(aspect).badgeRects[cue.meta.badgeId]`, flipping side to stay in the safe area).

Params: `offsetX`, `offsetY`, `safeArea` (0.05–0.15), and `drift` (vector, applied during the hold).

### 7.7 Fill shader (pass `fill`)
| type | params |
|---|---|
| solid | uses `color.fill` |
| categoryColor | tint → tint2 vertical gradient |
| gradientSweep | uses `color.fill` (gradient), angle, speed (the gradient moves over time) |
| rainbowFlow | saturation, lightness, speed, perLetter (bool) |
| holographic | iridescence, fresnel, speed; thin-film color from the view angle, faked from the normal of the SDF gradient |
| chrome | envColors (a 3-stop gradient: sky, horizon, ground), sharpness; reflection of a procedural environment lookup |
| goldFoil | grain, sparkle |
| fire | scale, speed, colors (a 4-stop gradient) |
| caustics | scale, speed, colorA, colorB |
| marble | scale, veins, colors |
| glass | refraction, blur, tint; samples the background with an offset along the SDF gradient |
| textureFill | imageId (a Media image or song cover), scale, pan |
| karaokeWipe | colorBefore, colorAfter, softness; wipes from left to right with the cue's local progress (or top to bottom for vertical text) |

### 7.8 Edge shader (pass `edge`, using the distance field; stackable)
| type | params |
|---|---|
| outline | width, color, softness. Stackable: up to 3 layers in the list. |
| neonGlow | color, radius, intensity, bloom (bool). The bloom passes are shared. |
| innerGlow | color, radius |
| bevel | depth, lightAngle, highlight, shadow; lit from the SDF gradient normal |
| extrude | depth (px), angle, colorNear, colorFar; marches up to 32 steps of the SDF along the direction |
| longShadow | length, angle, color, fade |
| dropShadow | offset (vec2), blur, color |

### 7.9 Post shader (stackable, each with an envelope)
Each post effect has a **target**:
- `text`: only the lyrics layer, so the background stays clean
- `frame`: the whole composited frame

Default is `text`. Effects with a † are shown in the UI as "featured".

**Glitch family** (required):
| type | params | Behavior |
|---|---|---|
| glitchBlocks† | blockSize, rate, intensity, rgbSplit | Random rectangular blocks shift horizontally, with the channels split inside each block. The block pattern comes from `hash(floor(t·rate), blockId)`. |
| rgbShift† | amount, angle, jitter | Separate R/G/B offsets. |
| scanTear | lines, amount, speed | Horizontal tear bands, with sine displacement plus noise. |
| vhsTracking | amount, noise, rollSpeed | A warped band that rolls, chroma bleed, and tape noise. |
| dataSmear | amount, direction, threshold | Pixels brighter than the threshold are smeared along a direction (a datamosh-style streak, done deterministically in a single pass). |
| digitalNoise | density, blockSize | Blocks of random colored noise flash on and off. |
| glitchSlice | slices, offset, rate | Letters are cut horizontally into slices and each slice shifts (text target). |

**Dissolve family** (required):
| type | params | Behavior |
|---|---|---|
| noiseDissolve† | scale, edgeWidth, edgeColor, octaves | Fragments are removed where fbm noise < threshold; the edges glow. Driven by the enter/exit progress or the envelope. |
| directionalDissolve | angle, softness, noiseMix | A wipe with a noisy edge. |
| pixelDissolve | cellSize | Random cells disappear in hashed order. |
| burnDissolve† | scale, emberColor, charColor | Hot edge → charred → gone, with drifting ember particles. |
| halftoneDissolve | dotSize, angle | Halftone dots shrink to nothing. |
| particleDissolve | count, drift | Where the mask disappears, particles are spawned from the text samples and carried away by curl noise. Linked with the §7.4 particlesDisperse effect. |

**Other effective shaders:**
| type | params | Behavior |
|---|---|---|
| shockwave† | center (vec2 or `letter`), radius, width, strength | A ring-shaped refraction wave, triggered at the cue start or at a keyframe. Great for "Achievement unlocked!" moments. |
| zoomBlur† | center, strength | Radial blur. Punchy on enter. |
| motionBlur† | samples (4–16), shutter (0–1) | **Deterministic** temporal supersampling: the text pass is rendered at `t − shutter·k/fps` and the samples are averaged. |
| echoTrail† | copies (2–8), spacing (s), decay, tint | Afterimages: the text pass is rendered at `t − k·spacing` with fading alpha. Deterministic, since no framebuffer is fed back. |
| godRays | center, decay, density, weight | Volumetric light streaming out of the text mask. |
| lightSweep† | angle, width, speed, color | A shiny highlight band passing over the letters (masked by the text). |
| kaleidoscope | segments, rotation | For backgrounds and transitions. |
| mirror | axis, offset | |
| pixelSort | threshold, direction, length | Pixel-sort look done approximately in a few passes. |
| lensDistortion | k1, k2, chroma | |
| colorGrade | lift, gamma, gain, saturation, duotone (2 colors), posterize | |
| displacementMap | imageId, amount, scroll | Uses a Media image as the displacement texture. |
| bloom | threshold, intensity, radius | Also shared with neonGlow. |
| chromaticAberration | amount, radial | |
| crt | scanlines, curvature, vignette | |
| filmGrain | amount, size | |
| halftone | dotSize, angle | |
| pixelate | size | |
| heatHaze | amount, speed | |
| lightLeak | color, speed, intensity | |
| vignette | amount, softness | |
| sparkles | count, size, color | Point sprites placed near letter edges using the SDF. |
| lensFlare | position, color | |

**Shared shader library:** all noise is written in-house in `gl/shaders.js`:
- `hash12`, `hash22`
- value/gradient `noise`, `fbm`, `curl`
- `sdfGradient`
- `blend` modes

**Performance options:** effects that render the text pass several times (motionBlur, echoTrail) have a `cost` weight in their descriptor (§14).

### 7.10 Background (per-cue background treatment)
> **字幕レイヤーの層構造と Post の責務**: テキストバックグラウンド（`bgShape`）・装飾（`ornShape`）・Post 効果の描画順と分離、放射ワイプを自動選択から外す決定は [text-layer-design.md](./text-layer-design.md) にある。

This controls the **card camera and treatment per cue**. The media underneath comes from the layers (§7.11).

| type | params |
|---|---|
| none | Transparent: the layers behind show through. This is the default when there are background layers. |
| card | dim (0–1), blur (0–40 px), camera (`focusBadge` bool, zoom 1–3, ease), parallax. Draws the card for the project aspect; for `meta.kind === 'badge'` cues the camera zooms onto the badge rect, using the background MotionDef. |
| noiseGradient | colors (a gradient), scale, speed |
| cover | songId or imageId, blur, dim, zoomSpeed |
| solid | color, alpha |
| image | imageId, fit (cover/contain), blur, dim |

### 7.11 Layers: background video/image, foreground image, transparency
**Stack, back to front:**
1. background layers (video, image, card, solid, noise) in order
2. the per-cue Background treatment
3. **the lyrics layer**, which is **fully transparent except the text**
4. foreground layers (an image or video with alpha, e.g. a PNG frame, logo, light-leak overlay, dust texture)
5. `frame`-target post effects

**Frame base (the background track's colour):**
- The background track owns the frame base colour: the stage behind the clips and the layers. It is a saved track property (`track.color`, a ColorValue or a hex string), so the track's checkbox toggles it together with its clips and layers.
- Unset = transparent. The chroma key green is just a preset of that colour (`#00b140`), never an implicit engine default; the canvas keeps its alpha and the stage shows through between the clips. The studio preview paints a grey checkerboard behind the canvas (CSS only), so a transparent base reads as transparency; exports never include it.

**Transparency:**
- The lyrics layer is rendered into its own premultiplied-alpha RGBA target. It is cleared to (0, 0, 0, 0), not black.
- Shadows, glow and extrude write real alpha, so they blend over the video behind them.
- Text-target post effects run on this layer only.
- Image layers keep their PNG/WebP alpha: they are uploaded with `UNPACK_PREMULTIPLY_ALPHA_WEBGL`.
- Every layer has opacity, a blend mode, and in/out motion through its MotionDef.

**Background video:**
- Preview: a hidden `<video>` element (muted, `playsInline`) is uploaded to a texture each frame with `texImage2D(video)`.
- Layer time = `(t − layer.start)·speed + trimIn`. With `loop`, it wraps.
- Playback sync: during preview play, the video is kept within 1 frame of the master clock. Past 2 frames of drift, set `currentTime`.
- **Export (frame-accurate):** for each output frame, set `video.currentTime` to the layer time and wait for `requestVideoFrameCallback` (or `seeked` if that isn't available), then upload. This is slower than real time but exact. Frames are cached by timestamp while the time only moves forward.
- Formats are whatever the browser decodes (MP4 H.264, WebM VP8/VP9/AV1). Transparent WebM (VP9 alpha) keeps its alpha in Chromium; use it for foreground video overlays.
- The video's own audio track is ignored in v1.

**Transparent output:**
- **Output → Export video** has **Background: include / transparent**. With transparent, the background layers and card are skipped.
- **Transparent export formats:**
  1. **WebM VP9 with alpha (best-effort):** `VideoEncoder` config with `alpha: 'keep'`. Offer this only when `isConfigSupported({ alpha: 'keep' })` says yes **and** the muxer can carry alpha side data; plain `webm-muxer` does not, so expect this to be unavailable in v1. Never make it a required acceptance check.
  2. **PNG sequence (guaranteed):** a `.zip` written by a small in-house store-only zip writer (CRC32, no compression). This always works.
  - MP4 H.264 has no alpha, so it isn't offered in transparent mode.
- **Output → Save frame (PNG with alpha)** at the playhead.
- **Preview** shows a checkerboard behind transparent areas (View → Transparency grid).

**UI:**
- Media panel: a **Video** tab (import .mp4/.webm/.mov if the browser can decode it), with thumbnails from a frame at 1 s.
- Drag media onto the timeline's **Background** or **Foreground** track, or use the right-click menu "Set as background/foreground".
- Timeline: **Foreground layers** rows above the cue track, and **Background layers** rows below it. Clips can be dragged, trimmed and reordered, with lock and eye toggles.
- Inspector: select a layer (in the timeline or by clicking the preview with Alt) → Layer sections: Source, Time (start/end/trim/speed/loop), Fit and Transform, Opacity and Blend, Filters, Motion in/out.

### 7.12 Color group
Not its own shader, but a group in the inspector. It edits `StyleSet.color` (ColorSet §4.5) and holds the "category color" and "palette" switches.

**Envelope:** `color.params.transition = { from: ColorSet|null }` blends from the previous cue's colors with the `in` ease.

### 7.13 Presets (`lyrics/presets.js`)
Each preset is a partial StyleSet with original names and values:

| Preset | Layout | Enter | Hold | Exit | Fill | Edge | Post | Background |
|---|---|---|---|---|---|---|---|---|
| Pop | row | elasticPop | floatBob | zoomOut | categoryColor | outline | — | card |
| Cinematic | row | blurIn (slow easeOutQuart) | kenBurns | fade | solid white | dropShadow | filmGrain + vignette | cover |
| Neon | row | neonFlicker | — | — | solid | neonGlow + bloom | crt (light) | — |
| Typewriter | row | typewriter (cursor) | — | typewriterReverse | — | — | — | — |
| Glitch | row | glitchIn + scramble | jitter | dissolve | — | — | glitchBlocks + chromaticAberration | — |
| Karaoke | karaoke location | — | — | — | karaokeWipe | outline | — | — |
| Chrome | row | flip3D | orbit3D | — | chrome | bevel + extrude | — | — |
| Fire | row | noiseDissolveIn | wobbleWarp | burnAway | fire | innerGlow | heatHaze | — |
| Hologram | row | particlesAssemble | breathing | particlesDisperse | holographic | — | chromaticAberration | — |
| Handwritten | row | strokeDrawOn | — | strokeErase | solid | — | — | — |
| Particle Storm | from `offscreenEdges`, curve 0.6 | particlesAssemble | — | explode | — | sparkles | — | — |
| Circle Build | circle, from point → row via sequence | — | — | — | gradientSweep | — | — | — |
| Tategaki | vertical | slide down, word stagger | — | — | solid | outline | — | — |
| Achievement Fanfare | badgeAnchored | elasticPop | pulse | — | categoryColor | neonGlow | sparkles | card with focusBadge |

---

### 7.14 Gap fillers: what plays when no cue is showing (`lyrics/fillers.js`)
An SRT has stretches with no text: before the first line, between lines, and after the last line. The engine can compute these **gaps** and materialise them as **filler clips** on their own timeline track. Fillers are opt-in: new projects ship with `fillers.enabled = false`, so nothing is drawn until you run **Regenerate fillers** (timeline context menu), add a clip by hand, or switch the setting on; an auto-direct run only fills gaps while it is on. Each filled gap becomes a **filler clip**, and you can edit it.

**Finding gaps:** `gaps(cues, duration)` returns `[{ from, to, kind: 'intro'|'interlude'|'outro', prevCueId, nextCueId }]`.
- A gap only counts if `to − from ≥ fillers.minGap` (default 1.5 s).
- Each end is trimmed by `fillers.margin` (default 0.25 s) so it doesn't collide with the cues' enter/exit.
- Gaps are recomputed whenever cues change.
- A filler clip that you edited by hand is **pinned**: it keeps its settings, and its time follows its neighboring cues.

**FillerSettings:**
```js
{
  enabled: false, minGap: 1.5, margin: 0.25,                                  // opt-in; Regenerate fillers ignores the flag
  byKind: { intro: FillerSpec, interlude: FillerSpec, outro: FillerSpec },   // defaults per gap kind
  longGap: { threshold: 8, spec: FillerSpec },                                 // different filler for long instrumental breaks
  clips: { [gapKey]: FillerSpec & { pinned: true } }                           // manual per-gap edits; gapKey = prevCueId+'>'+nextCueId
}
FillerSpec = { type, params, motion: MotionDef, color: ColorSet, layer: 'lyrics'|'foreground', showCredits: bool }
```

**Filler types** (all written in-house; the `in`/`out` of the MotionDef fade or animate the filler in and out of the gap):

| type | Params | Behavior |
|---|---|---|
| none | — | Empty; only the background shows. |
| countdown† | style (`digits` 3-2-1 / `ring` / `bar` / `dots`), from (s, default 3), showOnlyLast (bool), sound (none) | Counts down to the next cue. The digits are vector text drawn by the lyrics engine, so any enter effect can be applied per digit. The ring or bar drains over the whole gap, or over the last `from` seconds. |
| waveform† | mode (`line`, `mirror`, `circle`), thickness, smoothing, color | **Waveform from the audio** at the current time. Without audio it falls back to a synthetic sine wave. |
| spectrum† | bars (16–128), mode (`bars`, `radial`, `blob`), falloff, color | **Spectrum (FFT) from the audio**. |
| sineWave | waves (1–5), amp, speed, color | Wave lines that don't use the audio. |
| shapes† | set (`circles`, `polygons`, `lines`, `burst`, `grid`, `orbit`), count, speed, stroke/fill, color | **Shape animation**: a generative, seeded motion-graphic pattern drawn as vector shapes (circles expanding, polygons rotating and morphing, lines sweeping, burst rays, a grid of dots pulsing, planets orbiting). |
| particles | count, flow (`rise`, `fall`, `drift`, `vortex`), size, color | Ambient particles. |
| nextLinePreview | opacity (0.35), style | Shows the next cue's text faded, as a karaoke-style "coming up" line. |
| previousLineGhost | opacity, blur | The previous line stays on screen faintly. |
| progress | style (`bar`, `ring`), position | Overall song progress. |
| credits | — | Shows the title/artist element during the gap (§7.15). |
| cardPeek | zoom, pan | Pans across the achievement card between cues. |
| instrumental | text (i18n `studio.filler.instrumental`, e.g. "♪ Instrumental ♪"), plus any hold effect | A labeled interlude. |
| combo | list of FillerSpec | Draws several together, e.g. spectrum plus countdown. |

(† = default suggestions.)

**Default gap handling:**
- intro gap: credits, then a countdown in the last 3 s
- interlude: spectrum; if longer than 8 s, shapes plus spectrum
- outro: credits (end card) plus a waveform that fades out

**Audio analysis** (deterministic, `lyrics/audio-analysis.js`, pure):
- `analyze(audioBuffer, fps)` computes, **per video frame**, the RMS, a 2048-point FFT magnitude grouped into 128 log-spaced bands, and a 512-point downsampled waveform window.
- Uses an in-house radix-2 FFT with a Hann window.
- It runs once in chunks (showing progress) and is cached in memory.
- Preview and export read the same arrays, so they match. Smoothing is applied across frames (attack/release), not in real time.
- These values are also exposed as **audio-reactive inputs**: any number param can be linked to `audio.rms`, `audio.band[i]`, or `audio.low/mid/high`, with a gain, e.g. make `pulse.amount` follow the bass. The inspector has a 🔊 link button next to the ◆ keyframe button.

**Rendering:** fillers are drawn in the lyrics layer (or the foreground), with the same GL passes. Shapes and waveforms become triangle strips or instanced quads in `gl/shapes.js`, which also does rounded rects, circles, rings and polylines with anti-aliasing via the SDF of the primitive.

**Timeline:** a **Fillers** track sits under the Cues track and shows each gap clip with its type icon.
- Click to edit it in the inspector (this pins it).
- Right-click: change type ▸ · Unpin (back to auto) · Apply to all gaps of this kind.
- Generate → Random style also randomizes filler types, except pinned ones and locked groups.

### 7.15 Song title and artist elements (`lyrics/credits.js`)
**Title** (作品名) and **artist** (作者) are real text elements. They use the same vector/shader engine and StyleSet, and can be selected, edited and keyframed like any cue.

**CreditSettings:**
```js
{
  title:  { source: 'song'|'custom', songId, text },     // song → dataset song title; custom → typed text
  artist: { source: 'profile'|'custom', text, showHandle: true },   // profile → displayName (+ @handle)
  extra:  { text: '' },                                    // optional line, e.g. "Suno v5" or a date
  template: '{title}\n{artist}',                           // editable; placeholders {title} {artist} {handle} {extra} {year}
  modes: {
    element:   { enabled: true, at: 'start'|'time', time: 0, duration: 4 },            // shown once as its own element
    always:    { enabled: false, position: 'topLeft'|'topRight'|'bottomLeft'|'bottomRight'|'lowerThird'|'custom',
                 x, y, scale: 0.45, opacity: 0.85, hideDuringCues: false, from: 0, to: null },   // stays on screen the whole time
    end:       { enabled: true, duration: 5, style: 'endCard'|'rollCredits', afterLastCue: true }  // shown at the end as an element
  },
  styles: { element: StyleSet(partial), always: StyleSet(partial), end: StyleSet(partial) }  // each mode has its own look
}
```
- **The modes can be combined.** For example, the artist in a corner the whole time plus a big end card.
- **`element`** puts a credit cue at the start, or at a given time. It is marked `meta.kind = 'credit'` and is **not written to SRT** unless "Include credits in SRT" is checked on export.
- **`always`** is a persistent element. It has in/out easing at `from`/`to`, is drawn in the foreground so it stays above the lyrics, and can fade out while cues show (`hideDuringCues`).
- **`end`** is either an end card after the last cue (title large, artist smaller, optional avatar or cover as a layer), or a vertical credit roll. Its duration can extend the video length.
- **Elements:** each mode's text becomes elements with paths like `credit:element/line:0/...`, `credit:always/...` and `credit:end/...`. They support overrides and keyframes (§4.5) and are selectable in the preview.
- **Script generation:** the `intro` option in §5.5 is replaced by a credits element when credits are enabled, so nothing appears twice.
- **UI:**
  - **Generate → Credits…** opens a dialog with the song picker (from the dataset, sorted by plays), the artist source, the template, and the three mode toggles with their settings.
  - The inspector has a **Credits** section when a credit element is selected.
  - The timeline shows a **Credits** track: element and end clips as blocks, and `always` as a long bar that can be trimmed.
- **i18n:** `studio.credits.*`.

### 7.16 Restructuring: SRT line → beats → effects per beat (`lyrics/textflow.js`, pure)
This is the core idea of the whole video engine:

```
SRT cue (one line of text + time)
   │  ① restructure by time: pages, whole-text recap, repeats, emphasis moments
   ▼
Beats  — each one is a new, separate text unit with its own time range
   │  ② give each beat its own effects (enter / hold / exit / layout / fill / edge / post / color …)
   ▼
Rendered video
```

**A Beat** is the unit that effects actually apply to. The engine animates **beats, not cues**. A cue is a container: it holds the original SRT text and time, and the default style for its beats.
```js
Beat = {
  id,                                  // stable: cueId + ':' + kind + index (kept across re-restructuring when text and kind are the same)
  cueId, kind: 'page'|'recap'|'repeat'|'emphasis'|'single',   // single = the cue fits without splitting
  index, start, end,                   // absolute seconds, inside the cue's time
  text, lines: [...],                  // text of this beat, with line breaks already chosen
  fontScale,
  pinned: false                        // true once edited by hand → restructuring keeps it
}
```

**Effects for each beat.** The style of a beat is resolved as:

```
project.style → cueStyles[cue] → beatKindStyle[kind] → beatStyles[beatId] (random or preset) → overrides[beat…] → keyframes
```

- `project.beatKindStyle` holds sensible defaults per kind:
  - `page`: quick enter and exit
  - `recap`: gather transition + lightSweep
  - `repeat`: a different enter
  - `emphasis`: pulse
- **Effect order across beats** uses `styleMode.order` (fixed, cycle or random) **per beat**, so the pages of one SRT line can each get different effects. The seed path is `(seed, cueId, beatId, group)`, so it is deterministic.
- **Random generation:**
  - Generate → Random style → **Selected beats**.
  - Locks per group still apply.
  - `avoidRepeats` also compares with the previous beat.
- **Motion:** `motion.evaluateCue` becomes `evaluateBeat(beatScene, t)`. Everything in §6.7 (the enter/exit windows, stagger, envelopes) uses **the beat's** start and end and the beat's tween curves (§6.2). Transitions between beats of the same cue follow `pageTransition` and `recap.transition`, and the Layout `previousCue` start becomes "previous beat".

**Editing beats by hand:**
- **Timeline:** the cue block is split into **beat sub-blocks**. You can:
  - drag the dividers (changes the beat times)
  - double-click to edit the beat text (e.g. move a word to the next page)
  - split a beat at the playhead or merge it with the next
  - pick it and change its effects in the inspector
- **Pinning:** any edit pins the beat. **Restructure again** (right-click on the cue, or automatically when the cue text or time changes) keeps pinned beats and redoes only the unpinned ones around them. If the cue text changed so much that a pinned beat's text no longer appears in it, the beat is moved to orphans with a warning.
- **Inspector breadcrumb:** `Cue 12 › Beat 2 (page) › Line 1 › Word 3 › "A"`.
- **SRT export options:**
  - original cues (default)
  - **beats as separate cues** (the restructured timing), useful for other players

The rest of this section describes how ① (restructuring) picks the beats. It applies to every text element: cues, credits, and the filler texts.

**TextFlow settings** are per project, and can be overridden per cue in the inspector's Text section:
```js
textFlow: {
  split: 'auto'|'off',
  maxLines: { '16:9': 2, '9:16': 3 },
  minFontScale: 0.8,              // shrink the font down to this before splitting
  balance: true,                  // make line lengths similar
  readingSpeed: { ja: 8 /*chars/s*/, en: 3.2 /*words/s*/, es: 3, fr: 3, ru: 2.8 },
  minPageDuration: 1.2,
  pageTransition: 'full'|'quick'|'crossfade',   // full = each page uses the cue's enter/exit; quick = short (0.25 s) version; crossfade
  longHold: { mode: 'hold'|'repeat'|'pulse'|'filler', threshold: 6, interval: 4, repeatEffect: 'same'|'cycle'|'random' }
}
```

**Steps for each element:**
1. **Forced breaks:** `\N`/newline are line breaks and `\P` is a page break. They are always kept.
2. **Fit check:** lay the text out at the style size with `layoutText`. If it fits in `maxLines` within `maxWidth`, stop.
3. Shrink step by step down to `minFontScale`. If it fits, stop.
4. **Choose line and page breaks by meaning.** Tokenize the text into **break candidates with penalties** (lower penalty = better place to break), per language (see below). Then run a **dynamic program** (a simplified line-breaking optimizer) that splits the text into lines that fit `maxWidth`, then groups the lines into pages of ≤ `maxLines`. It minimizes:

   ```
   Σ(width slack² when balance is on) + Σ break penalties + page-break penalties
   ```

   Page breaks strongly prefer sentence ends.

**Language detection** is per element: the share of CJK characters, then `project.meta.lang`, then the Latin/Cyrillic script.

**Japanese rules:**
- Candidates come from `Intl.Segmenter('ja', { granularity: 'word' })` word boundaries. Nothing is split inside a word.
- **Penalties**, from best to worst place to break:
  - after `。！？!?` (sentence end, lowest) → after `、，,` → after a closing bracket `」』）】` → after particles or clause endings (`は が を に で と も へ の から まで より けど ので のに ても たら ば て`) → between different kinds of characters (kana ↔ kanji ↔ katakana ↔ Latin) → other word boundaries.
- **Line-start prohibitions:** never start a line with `、。，．・：；！？ー―〜…‥）」』】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ`.
- **Line-end prohibitions:** never end a line with `「『（【〔〈《`.
- Keep a number together with its unit or counter (`100曲`, `3分`, `1,000回`).
- Never split a katakana word or an ASCII word.

**English rules** (keep sentences whole where possible):
- Sentences come from `Intl.Segmenter('en', { granularity: 'sentence' })`. A sentence end is the best page break.
- **Penalties within a sentence**, from best to worst:
  - after `, ; : — –` and closing parentheses
  - before a conjunction or relative word (`and but or so because although while when where which that who if than`)
  - before a preposition (`to of in on at for with from by about into over after before`)
  - other spaces
- **Never** break:
  - after an article, determiner or possessive (`a an the this that my your his her its our their`)
  - between a number and its unit, or inside `Mr.`/`e.g.`
  - inside hyphenated words or URLs
- Avoid a single-word last line: add a large penalty when fewer than 2 words are left over.

**es/fr/ru:** in v1, use the fallback below (word boundaries plus punctuation penalties). Their own function-word and conjunction lists, and French keeping the space before `: ; ! ?` with the punctuation, are a later refinement.

**Other languages:** fallback to word boundaries plus punctuation penalties.

**Page timing:** page `i` gets

```
cueDur × w_i / Σw,   where w_i = readingTime(page_i) + 0.3 s
```

- `readingTime` = characters ÷ chars/s for CJK, or words ÷ words/s for other languages.
- Each page gets at least `minPageDuration`.
- If the cue is too short for its pages, the cue block turns **red** in the timeline with a "too fast to read" warning, and a one-click action "Extend cue / Allow overlap into gap".
- Page timings can be adjusted by dragging dividers inside the cue block on the timeline. This is stored as `overrides[cuePath].pageTimes`.

**Page transitions:**
- `full`: every page plays the enter and exit effects.
- `quick`: only the first page gets the full enter and only the last gets the full exit. The pages between switch with 0.25 s versions.
- `crossfade`: pages overlap by 0.2 s.
- Layout `previousCue` and morph also work between pages: morph between pages is a nice default for the Hologram preset.

**Showing text again when it is on screen a long time** (`longHold`). This kicks in when an element (or its last page) would stay still for more than `threshold` seconds after its enter:
- `hold`: stays as is (current behavior).
- **`repeat`:** every `interval` seconds, the element plays its exit and then **enters again**. With several pages, the page sequence starts over from page 1. `repeatEffect` = `cycle`/`random` picks a different enter/exit each time, using the per-element RNG, so it stays deterministic.
- `pulse`: a short emphasis animation (a scale pulse plus the lightSweep shader) every `interval`, without leaving the screen.
- `filler`: the text exits early and the rest of the time becomes a gap filler (§7.14), treated as an interlude.

The repeats are visible in the timeline as tick marks inside the cue block.

**Showing the whole text again (recap).** After the text has been shown in pieces, the element can show the **whole sentence at once** again, so the viewer sees the complete meaning.

```js
textFlow.recap: {
  mode: 'off'|'end'|'onRepeat'|'both'|'interval',   // end = after the last page; onRepeat = recap is the repeat instead of restarting the pages; interval = every N seconds
  minPages: 2,                 // only when the text was actually split
  duration: 'auto',            // auto = max(1.5 s, 0.5 × readingTime(full text)); or seconds
  interval: 8,
  maxLines: 6,                 // the recap may use more lines than a page
  fontScale: 'auto',           // shrink to fit maxLines inside the safe area (no lower limit except readability: 0.45)
  layout: 'inherit'|'row'|'stacked'|'vertical',
  transition: 'gather'|'full'|'crossfade',   // gather = each letter of the last page flies to its place in the full text, and the remaining letters come in from their page positions (uses the §6.6 previousCue start-formation logic)
  highlight: 'none'|'lastPage'|'sweep',      // emphasize the last page's words, or a lightSweep across the whole text
  style: StyleSet(partial)     // separate look for the recap (e.g. smaller, dimmer, outline only)
}
```

- **Time for the recap** is set aside first:
  - `pageBudget = cueDur − recapDuration`, and the page timing uses `pageBudget`.
  - If that makes the pages shorter than `minPageDuration`, the recap is shortened down to 1 s, then skipped, with a warning.
- **Line breaks in the recap** are chosen with the same language-aware DP for `recap.maxLines`, with balancing, so the sentence stays readable as a whole.
- **Element path:** `cue:<id>/recap/line:…`. It can be edited, overridden and keyframed like a page.
- **Timeline:** the recap shows as a hatched section at the end of the cue block, and can be dragged to change its length.
- **Order of events** in one long element, e.g. with `longHold.mode = 'repeat'` and `recap.mode = 'both'`:

  ```
  page1 → page2 → page3 → RECAP(full) → (long hold) → page1… → RECAP …
  ```

- **Automatic recap (smartness).** When neither the project nor the cue set `recap.mode`, a cue whose text splits into **3 or more** base beats (`single`/`page`, counted after chunking) gets a recap with probability equal to the raw `styleMode.axes.smartness` (missing reads as the engine default 0). The draw is a fixed hash of the cue (`u = fnv1a(cue.id, cue.text) / 2^32`), so the repeated `apply` runs never flicker; when `u < s`, `flow` runs a second time with `recap: { mode: 'end', minPages: 1 }`. The decision is made on the structure without a recap, so the recap taking its time from the budget may leave the second run with fewer beats. s=1 recaps every such cue, s=0 none; an explicit mode (the timeline toggle writes `off`/`end`) always wins.

- **Tests:** the recap appears only when the text is split into ≥ `minPages`. The whole text fits in `recap.maxLines`. The time is set aside correctly. `gather` maps every letter of the full text to exactly one source letter or to the "comes in" set. The automatic recap covers every 3+-beat cue at smartness 1 and none at 0, is stable across applies, and yields to an explicit mode.

**Outputs:** `flow(element, style, fonts, frame) → { fontScale, pages: [{ from, to, lines: [...] }], repeats: [{ t, kind }] }`. It is cached per `(text, style, aspect, fonts)`. `scene.js` builds the letters per page from this result. SRT export writes the original text; there is an option to "export pages as separate cues".

**Tests** (`scripts/test/textflow.test.js`, width measured with a fixed-width fake measurer for determinism):
- Japanese breaks never violate the line-start or line-end rules, and prefer `。、` and particle boundaries.
- Numbers stay with their counters.
- English prefers sentence ends for pages, never leaves `the` at the end of a line, and avoids a single-word last line.
- `\N` and `\P` are respected.
- Page timing sums to the cue length, and each page is at least the minimum length.
- Repeats are placed at the right times and are the same across runs.

### 7.17 Maximum duration (`lyrics/duration.js`, pure)
You can set the **maximum video length**.

**Where it's set:** Settings → Output, and the export dialog. Presets: 15 s, 30 s, 60 s, 90 s, 3 min, 5 min, custom (mm:ss), unlimited.

**Final length:** `computeDuration(project)` returns

```
min(maxDuration ?? ∞, natural length)
```

where the natural length follows `durationMode`, and includes the credits end card (§7.15).

**When content is longer than the maximum** (`output.overflow`):
- **`compress`** (default for generated scripts): scales every cue, gap and keyframe in time to fit (`fitToDuration`, §5.5).
  - Each cue stays at least `minCue` long (default 1.2 s); gaps shrink first.
  - The **end card's time is reserved first**, so the credits are never cut off.
- **`drop`**: removes the lowest-priority generated cues until everything fits.
  - Priority order: completion > gold > silver > bronze > white badges > top songs > stats.
  - Cues you imported or edited by hand are never dropped. If those alone are too long, it falls back to `cut`.
- **`cut`** (default for imported SRT and audio-timed videos): cuts at the maximum. Elements still on screen play their exit effect in the last `out.duration`. The audio fades out over `audioFadeOut`.

**Script generation:** `ScriptOptions` gets `maxDuration`, taken from the output setting. `perCue` is chosen automatically when the chosen content wouldn't fit. A warning shows how many badges were dropped or how much the timing was compressed.

**UI:**
- The timeline shows a **maximum-length marker** (a red vertical line). The area past it is shaded, and drag-snapping stops at the marker.
- The export dialog shows the final length and which overflow mode applied.
- Changing the maximum length is one undoable command. With `compress`, it rewrites the cue times, so you can undo it.

**Tests:**
- `compress` never makes a cue shorter than `minCue`, and keeps the end card.
- `drop` keeps manual cues.
- `cut` gives exactly `maxDuration`.

### 7.18 Lyrics files: SRT / LRC / JSON (`srt.js`, `lrc.js`, `lyrics-json.js`, `lyrics-file.js`)

The Studio is the main mode and does **not require Suno profile data**. Lyrics can come from any of the three formats, through the welcome screen or *File → Import lyrics (SRT / LRC / JSON)…*. `lyrics-file.js` detects the format (extension first, then content sniffing) and returns `{ format, cues, warnings }`; every parser produces the same cue shape as `srt.js` (`{ id, start, end, text, meta: { kind: 'custom' } }`), so restructuring, editing and export work the same afterwards.

- **SRT** (§4.3): the existing parser. `<b>/<i>/<u>/<font color>` become `spans`, `{fx:…}` tags become `cue.fx`, `\N`/`\n`/`\h` are unescaped.
- **LRC** (new): `[mm:ss.xx]`, `[mm:ss.xxx]`, `[h:mm:ss.xx]` and multiple time tags per line are supported. Metadata tags (`[ti:]`, `[ar:]`, `[al:]`, `[by:]`, `[length:]`) land in `meta`; `[offset:+/-ms]` is applied to every tag (positive = show earlier). A time tag with no text is an **instrumental marker**: it closes the previous cue and creates nothing. Each cue ends at the next tag; the last cue gets an estimated reading length. Enhanced word tags (`<mm:ss.xx>`) are stripped from the text and kept as `cue.words` for future word-level timing.
- **JSON**: an array of entries or an object with `cues` / `segments` (Whisper) / `lines` / `lyrics`. Entry keys: `text|lyric|line|content|value`; `start|startTime|from|time|t`; `end|endTime|to` and `duration|length`. Times are seconds, `mm:ss.xx` / `hh:mm:ss.xx` strings, or milliseconds when `unit: 'ms'` is given or the file clearly uses ms (all integers and ≥ 60 000). Missing ends fall back to the next start and then to the same estimate as LRC. A Studio project file (`.telopmotion.json`) is detected and reported instead of being parsed as lyrics.

**Export:** *Output → Export lyrics* writes SRT (with optional `{fx:}` tags), LRC (`[mm:ss.xx]` + optional metadata) or JSON (`{ cues: [{ start, end, text }] }`, or ms with `unit: 'ms'`).

**Tests:** LRC metadata/multiple tags/offset/instrumental/enhanced tags/round-trip, JSON shapes (array, Whisper, camelCase, durations, time strings, ms detection, word arrays), and the `lyrics-file` dispatcher (detection, dispatch, project-file detection, stringify per format).

### 7.19 Mood axes (`lyrics/moods.js`, `lyrics/smartness.js`)

The theme generator draws every look from a small vector of axes. The first five classify the song and are the only ones the FX 800 look matcher reads (`MATCH_AXES`); the last two are user choices that stick to the project across re-rolls (`styleMode.axes`).

| Axis | Owns | Engine default | UI default |
| --- | --- | --- | --- |
| `speed` | durations, stagger intervals, loop periods | 0.5 | — |
| `energy` | effect strength, hold frequency, hero loudness | 0.5 | — |
| `softness` | texture families (fade/glow vs slide/hard shadow) | 0.5 | — |
| `density` | stack count, shape count, text size | 0.5 | — |
| `brightness` | palette light level and text contrast | 0.5 | — |
| `weird` | how far the song strays from one look (0 = one look for the song, 1 = a look per cue). It also opens the extended primitive pool at ≥ 0.5 | 0 | 0.7 |
| `smartness` | how much cheap-looking grammar is dropped (per-beat pulse, vignette, ribbon, centre spotlight...) and how often a cue that splits into 3+ beats gets an automatic recap (§7.16), with probability = the axis | 0 | 0.6 |

`smartness` is one-sided in the effect grammar: it only removes and demotes, never adds. Every effect carries a rating in `lyrics/smartness.js` (`RATINGS`, 0 = tacky, 1 = refined; unlisted types read 0.5). Below `s - 0.45` an effect is a hard exclusion, above it the picker weights it down (`max(0.05, 1 - 1.4(s - rating))`), so a low `s` never forces a tacky effect back in. `weight(rating, 0) === 1` and `pickWeighted(..., 0)` consumes the random stream exactly like the plain uniform pick, so the engine default 0 leaves every existing draw, the `direct-w0.json` fixture and the fx400/800 catalogues byte-identical. The axis also drives the automatic recap (§7.16): the share of 3+-beat cues that get one is exactly the axis value, drawn from a fixed per-cue hash rather than the random stream.

The axis reaches `moods.generate` / `rerollClipSpec` (effect pools, split motions/schemes, backdrop motion + transitions, the background centre lift and the palette jitter), the automatic direction (`studio/direct.js`: beat holds, filler presets, the per-four-cue mid palette shift), the FX 800 look pool (`lyrics/looks.js`: `weightFor` + `prune`) and the per-cue randomizer (`lyrics/random.js`, when the project saved an axis). The palette dialog (`studio/palette-dialog.js`) and the colour-only re-roll (`store.commands.rerollColors`) work on top of the same palette model.

#### 7.19.1 The two-stage profile (`lyrics/gen-params.js`, `studio/direct.js`)

The theme dialog (`studio/theme-editor.js`) is a probability editor, not a concrete-style editor. It defines what the automatic direction draws in two stages:

1. **The axes** (the table above) derive every parameter automatically.
2. **Individual parameters** the user moves are pinned in `styleMode.params` (a missing key = automatic), `styleMode.typeWeights` (per effect type, missing = 1, 0 removes the type from the automatic draws) and `styleMode.usePalettes` (the palette lottery's sources; empty = generated from the axes). The ↺ button returns a value to the axes.

`SA.genParams` owns the parameter table (`PARAMS`: key, tab, group, range, `derive(axes)`), `derive` (all automatic values), `resolve` (derived + pinned, clamped), `isPinned`, `typeWeight` / `lookTypeWeight` and `normalizeChances`. The classic formulas (`sizeChange`, `colorChange`, `basePaletteChance`, the figure density, `heroScale`) delegate to the existing functions, so a project without pinned values and raw weird 0 keeps the byte-identical output of the pre-profile generator. New random draws live on their own `rng.rngFor(seed, id, '<name>')` streams and never reorder the existing ones.

The profile reaches the generator through `direct.prepare` (`ctx.params`, `ctx.pinned`, `ctx.typeWeights`, `ctx.usePalettes`, `ctx.curve`) and is saved back by `direct.run` (only the pinned keys). `store.modeAxes()` resolves the same profile for beat / cue re-rolls. The drawing changes:

- **Sizes** (`weird.sizeWeights` + `createSizeLadder`): the ten levels carry a Gaussian weight curve (centre `sizeCenter`, spread `sizeSpread`); the ladder balances `time / weight` and the loudness of each beat (`audioDriver.rangeEnergy`) shifts the centre per beat (`sizeFollow`). At raw weird 0 the ladder pins the theme's base size on every beat — energy never moves it, in compose mode too — so only a pinned `sizeChange` varies the size again. `sizeRangeFor` raises the body floor so even a 0.55× particle span keeps the legibility minimum, and `fitComposeSpans` shrinks an over-long hero span and raises the particles after the pick.
- **Backdrop** (`moods.planeBackdropSpec`): 1–4 planes drawn from the background slot only (second plane = a lightness step, third = the scheme hue, fourth = its companion), each passed through `separatePlane` against the cue's text colours at the backdrop floor. The accent texture uses `accentColors` (±0.12 lightness) with a quiet opacity cap. The old split path stays for callers without `options.planes`.
- **Foreground / decoration** (`direct.foregroundFor` / `decorationFor`): `vivid` swaps body and hero roles, `gradient` paints the body, `effect` keeps the drawn fill or draws one; `decoOutline` … `decoGlow` build the edge stack (literal hexes follow the existing `recolor`), with a separation outline guaranteed when two or more planes sit behind a cue.
- **Figures** (`figures.js`): the six bold motifs (`slabWipe`, `cornerBlocks`, `ringDraw`, `stripeRun`, `dotGrid`, `sideBars`) draw thick shapes in the bands and corners around the text box, with the `snap` easing and a longer in window; `figureBold` picks them and the dim fallback keeps the least-covering motif.
- **Readability** (`legibility.SMEAR_POSTS`, `paletteRoles.schemes(colors, w, range)`, the `direct.run` final sweep): the smear posts are gated behind `postBlur`, a calm `schemeRange` restricts the beat colour schemes to the readable swaps, and every beat is resolved and checked at the end of a run; a failure is repaired in order (legibility repair → colour scheme off when it is the cause → plain text role → separation outline).

`fear` (`fx-axes.js`) keeps its own row as before: the extended pools open at ≥ 0.5 and the fear factor multiplies the draw weights.

## 8. WebGL2 rendering (`lyrics/gl/*`, `lyrics/engine.js`)

### 8.1 Context
- `createEngine({ canvas /*HTMLCanvasElement|OffscreenCanvas*/, width, height, quality: 'preview'|'export' })`.
- `getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })`.
- Anti-aliasing comes from rendering the text layer at 2× in export mode and down-sampling, or from a 4× MSAA render buffer that is resolved with `blitFramebuffer`.
- Required extension: `EXT_color_buffer_float`, needed for the RG16F targets used by the distance field. If it is missing, use RGBA8 with the coordinates packed in.
- Handle `webglcontextlost`/`webglcontextrestored`: rebuild all GPU resources from the scene caches.

### 8.2 GPU resources
- **Per letter-mesh VBO** (built once per CueScene, cached in a `WeakMap`). Interleaved attributes:
  - `a_pos` vec2: glyph-local px
  - `a_letter` float: global letter index
  - `a_part` float: contour or triangle id
  - `a_s` float: position along the outline, for strokes
  - `a_side` float
  - `a_centroid` vec2: for pieces
  - `a_seed` float
- **Letter state texture:** RGBA32F, width = letters, height = 4 rows, updated each frame with `texSubImage2D` from the CPU `LetterState`s:
  - row 0: x, y, rot, scale
  - row 1: scaleY, skew, opacity, blur
  - row 2: tiltX, tiltY, visibleFrac, reprProgress
  - row 3: deformType, amount, param1, param2
- **Letter color texture:** RGBA8, width = letters, height = 8. It stores the resolved fill, fill2, stroke and glow colors, plus up to 4 gradient stops for letter-space gradients.
- **Render targets:** `textRT` (RGBA8 color + an R8 mask via MRT, plus an RGBA16F `infoRT` holding letter id, u, v and fx), `sdfA`/`sdfB` (RG16F, half resolution), `sceneRT`, `postA`/`postB`, and `bloom` mip chain × 5.

### 8.3 Pipeline, per frame
The overall compositing order follows the layer stack in §7.11:

```
background layers → cue Background → lyricsRT (transparent) → foreground layers → frame post → output
```

When the export is transparent, the background steps are skipped and the output keeps its alpha. The canvas is created with `alpha: true` for transparent export.

1. **Background pass:** draw the background into `sceneRT`. The card texture is uploaded once per theme or aspect change, from `SA.card.draw` on an `OffscreenCanvas`, then sampled with a camera transform and a separable Gaussian blur.
2. **For each active cue**, in order of start time:
   1. CPU: `motion.evaluateBeat` fills the state textures.
   2. **Text pass:** draw the meshes for each representation into `textRT` + `infoRT`:
      - fill mesh: `mesh`
      - stroke ribbon: `stroke` (a fragment is discarded if `a_s > visibleFrac`)
      - `gl.POINTS` sprites: `particles`
      - pieces mesh: `pieces`
      
      The vertex shader applies the letter transform, the deformation (jelly, wobble, twist, breathing, melt), 3D tilt with perspective, and explode/shatter offsets. It writes the mask and the info.
   3. **SDF pass** (only if an edge effect or a fill effect that needs it is on): jump flooding from the mask (§8.4).
   4. **Fill pass:** full-screen, reads `textRT` mask + info + SDF, runs the chosen fill shader, then dissolve/wipe/karaoke thresholds. Output is premultiplied text color.
   5. **Edge pass:** each stacked edge effect is drawn behind or in front as appropriate (shadow, extrude, outer glow and outline behind; bevel and inner glow on top).
   6. Composite the cue layer onto `sceneRT` with premultiplied "over", multiplied by the cue opacity.
3. **Post passes:** ping-pong through `postA`/`postB`. The effect params are multiplied by their envelopes, merged across active cues (maximum intensity per type).
4. **Bloom** (if any neonGlow has `bloom` on): bright-pass → downsample chain → upsample-add → composite.
5. Final blit to the canvas default framebuffer, with sRGB-correct output (work in linear space, convert at the end).

### 8.4 SDF by jump flooding (`gl/sdf.js`)
- **Seed:** each texel on a mask edge (mask differs from a neighbor) stores its own coordinates; the rest store (−1, −1).
- **Steps** k = N/2, N/4, … 1: each texel looks at 9 neighbors ±k and keeps the nearest seed.
- **Final distance:** `d = distance(p, seed)`, signed negative inside the mask. It is packed as `d / maxDist` into R16F.
- Cost: about log₂(1024) = 10 passes at half resolution.
- `edge` shaders read `sdf(uv)` and also use its gradient (central difference) as a normal.

### 8.5 Particles and morph
- Particle VBO: interior samples per letter, with attributes `a_target`, `a_letter`, `a_seed`, and optionally `a_source` for morph.
- Vertex shader:
  ```
  pos = mix(source, target, easeP) + curlNoise(pos*scale, t)*turbulence*(1-easeP)
  point size = 1.5..3 px
  ```
- **Morph:** source = the previous cue's interior samples at its last frame (world space), and target = this cue's samples.
  - Both are resampled to the same count M.
  - Correspondence: sort both by `atan2` around the block centroid, then by radius (a cheap, stable pairing).
  - During morph, both cue meshes are hidden and only particles are drawn. Once `reprProgress` hits 1, the new cue's mesh fades in over 0.15 s.

### 8.6 `engine.js` API
```js
engine.setProject(project)            // (re)build caches as needed; diff by version counters from the store
engine.setAssets({ fonts, images, audioDuration })
engine.renderFrame(t) → FrameInfo     // FrameInfo = { cues: [{cueId, letters: [{path, quad:[x0,y0,…x3,y3], bbox}]}] } for hit-testing
engine.resize(width, height)
engine.dispose()
```
- Only cues with `start − maxLead ≤ t ≤ end + maxTail` are active. `maxLead` and `maxTail` default to 0; the exit and morph handovers fit inside each cue's own time.
- `stacked` layouts and `previousCue` starts also evaluate the previous beat at its end time (deterministic; see §6.6).
- The engine is used by three consumers: preview (canvas in the page), export (OffscreenCanvas at full resolution), and thumbnails in the Media panel.

### 8.7 Canvas 2D fallback
If WebGL2 isn't available:
- Letters are drawn as `Path2D` built from the glyph paths, with 2D transforms.
- Supported: fill (solid or gradient), outline (stroke), shadow and glow (`shadowBlur`), opacity, blur (`ctx.filter`). Shader-only effects fall back to `solid` and `outline`.
- The Studio shows the banner `studio.warn.noWebGL`.

### 8.8 Text mask (glyph knockout of the clip layers)
- `glPasses.buildTextMask(entries, { radius, feather, strength })` stacks every visible beat's mesh into `textRT` (one scene at a time, no clear in between), runs the SDF pass once, then bakes `maskRT` (RGBA8, full resolution) with `MASK_FRAG`: `a = strength * max(textAlpha, 1 - smoothstep(radius - feather, radius, max(dist, 0)))`. `radius` / `feather` arrive in px and are normalised by the SDF's `maxDistance` (the same conversion as EDGE_FRAG's outline). The empty-field sentinel (`< -900`) falls back to the glyph alpha, and without float targets the glyph alpha alone is the mask.
- `glPasses.maskLayer()` punches `maskRT` out of the current layer with the same `(ZERO, ONE_MINUS_SRC_ALPHA)` blend as the text background's `knockout()`.
- `engine.renderFrameExtended` evaluates the visible beats before the clip tracks, bakes the mask once when a figure / backdrop / filler clip opted in (`track.textMask !== false`), and knocks the figure layer, the filler shapes/texts and the backdrop accent layer out. `partitionPlanes` keeps the split planes whole (their colours already hold the text contrast) and only masks the accents above them; the subtitle background keeps its own glyph knockout.
- `maskRadius(size, height)` is the padding band: `clamp(0.16 * size, 0.008 H, 0.03 H)`, feather = radius / 2; the strength is the strongest visible letter opacity, so the mask fades with the subtitle's own entrance / exit.

### 8.9 Clip animation vocabulary
- `split.applyMotion` gains the one-way motions driven by the clip progress (`ctx.progress`) instead of a time sine: `sweep` (the eased set crosses the frame along the layout angle), `turn` (± travel × 60° once across the clip), `zoom` (the `push` inset presses in / pulls out monotonically) and `step` (one offset per rhythm cut, 0.18 s ease). `travel` (0.06..0.18) and `dir` (±1) are drawn with the new motions only; saved clips keep their exact draw.
- `filler-render.animate` gains the clip-level `travel` (slow pan, cover scale), `zoom` (Ken Burns 1 → 1 + amount) and `tilt` (−a → +a) modes, and the `slide` / `stagger` enter / exit transitions (slide from `motion.dir`, per-shape cascade). The mode and transition names are rated in `smartness.RATINGS` (0.6..0.75) and labelled in all five languages.
- The auto direction (`moods.planeBackdropSpec` / `splitSpec` / `backdropMotion`) draws the new names and hands the next backdrop an `avoid` context from the previous clip: `direct.avoidFromClip` / `avoidForClip` read the layout / plane motion / clip mode / transition, and the candidate filter only drops a name while at least two candidates remain (the random call count never changes). `rerollClipSpec` re-rolls a single clip with its neighbours' context.

---

## 9. Video export (`js/video-export.js` + `studio/export-dialog.js`)

**Dialog fields:**
- format: auto / MP4 / WebM
- resolution: 1080p (default), 720p, 1440p
- fps: 30 / 60
- bitrate: auto = 0.12 bits per pixel per frame, clamped between 4 and 40 Mbps
- audio on/off
- range: all / selection / in-out markers
- **quality: draft (preview quality) or final**

**Codec selection:**
1. MP4: try `{ codec: 'avc1.640028' (30 fps) | 'avc1.64002A' (60 fps), width, height, bitrate, framerate, hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' }, latencyMode: 'quality' }` with `VideoEncoder.isConfigSupported`. Retry with `'no-preference'`, then Main profile `avc1.4D4028`.
2. If none of those work, use WebM: `vp09.00.40.08` (profile 0, level 4.0, 8-bit), then `vp8`.
3. Audio:
   - MP4: `mp4a.40.2` (AAC-LC, 192 kbps), otherwise `opus` (mp4-muxer supports Opus in MP4).
   - WebM: `opus`.
   - Sample rate 48000; decode with `new AudioContext({ sampleRate: 48000 }).decodeAudioData`.

**Muxing:**
- `new Mp4Muxer.Muxer({ target, video: { codec: 'avc', width, height, frameRate }, audio: { codec: 'aac'|'opus', numberOfChannels, sampleRate }, fastStart: 'in-memory' | false })`
- `target` is a `StreamTarget` wired to `platform.openStream` when it is available (use `fastStart: false` with the stream). Otherwise `ArrayBufferTarget`.
- WebM: the equivalent with `WebMMuxer.Muxer`.

**Loop:**
```
for i in 0..frames-1:
  t = range.from + i/fps
  engine.renderFrame(t)
  frame = new VideoFrame(canvas, { timestamp: round(i*1e6/fps), duration: round(1e6/fps) })
  encoder.encode(frame, { keyFrame: i % (fps*2) === 0 }); frame.close()
  while (encoder.encodeQueueSize > 6) await once(encoder, 'dequeue')
  every 10 frames: report progress, yield to the UI (await new Promise(requestAnimationFrame) in the page)
audio: slice the AudioBuffer for the range into 1024-frame AudioData chunks (format 'f32-planar'), timestamp in µs → audioEncoder.encode
flush both → muxer.finalize() → save
```
**Frame capture:** read the render target with `canvas.transferToImageBitmap()` inside the same task as `renderFrame(t)` (or create the export context with `preserveDrawingBuffer: true`). With `preserveDrawingBuffer: false`, a direct `new VideoFrame(canvas)` can capture a cleared buffer.

**Cancel:** set an abort flag, call `encoder.close()`, and `stream.abort()`.

**Errors:** the encoder `error` callback rejects with `{ code: 'encode-failed', message }`. The dialog shows the i18n text for it.

**Electron:** check at startup whether H.264 and AAC encoding are supported, and log the result under `SA_SMOKE`.

---

## 10. Studio editor (`studio.html`, `css/studio.css`, `js/studio/*`)

### 10.1 `store.js` — state and undo
- **Shape:** `store = { project, selection: { paths: [], kind }, playhead, playing, view: {...}, version }`.
- **Subscribing:** `subscribe(selector, fn)`. Changes bump `version` counters per area (`project.style`, `script`, `overrides`, `keyframes`, `media`, `view`), so the engine and panels only redo what changed.
- **Commands:** `dispatch(cmd)`, where `cmd = { label, do(state), undo(state), coalesceKey? }`.
- **Undo stack:** max 200 entries. Commands with the same `coalesceKey` within 400 ms, or during one pointer drag, are merged into one.
- **Built-in commands:** `setProp(path, propPath, value)`, `setStyle(scope, group, instance)`, `addKeyframe`, `moveKeyframe`, `deleteKeyframe`, `setKeyframeEase`, `editCueText`, `moveCue`, `trimCue`, `splitCue`, `mergeCues`, `addCue`, `deleteCue`, `importSrt`, `generateScript`, `applyPreset(scope)`, `randomize(scope, locks, seed)`, `resetOverrides(path, group?)`, `setColorValue`, `setPalette`, `addMedia`, `removeMedia`, `setOutput`.
- **Shortcuts:** `Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo.

### 10.2 `app.js` — shell
- **Grid layout** in CSS: `grid-template-rows: 32px 1fr 6px var(--timeline-h)` and `grid-template-columns: var(--media-w) 6px 1fr 6px var(--inspector-w)`.
- **Splitters:** 6 px handles, dragged with pointer capture. Minimum sizes: media 200, inspector 280, timeline 140, preview 360.
- **Remembered layout:** sizes and visibility are saved in `localStorage` (`sa.studio.layout`, wrapped in try/catch).
- **Layout presets** (View menu):
  - Standard: 260 / 1fr / 340, timeline 240
  - Wide Preview: media hidden, timeline 160
  - Timeline Focus: timeline 45% of the height
- **Keyboard shortcuts** (ignored while typing in an input):

| Key | Action |
|---|---|
| Space | play/pause |
| J / K / L | shuttle −1× / stop / +1× (press again for 2×, 4×) |
| ← / → | step one frame; with Shift, 1 s |
| Home / End | jump to the start / end |
| ↑ / ↓ | jump to the previous / next cue |
| S | split the cue at the playhead |
| Del | delete the selected keyframes, or the cue |
| K (with Alt) | add a keyframe on the focused property |
| Ctrl+S | save the project |
| Ctrl+E | export video |
| Ctrl+O | open |
| Ctrl+I | import |
| F | fit the preview |
| 1 / 2 | preview zoom 50% / 100% |
| Esc | clear the selection |

- **Startup:**
  1. Read the handoff (IPC `studio:data` or IndexedDB).
  2. Otherwise restore the autosave.
  3. Otherwise start an empty project with a "Start without data / Import lyrics / Import profile JSON / Open project" welcome screen in the preview. **Suno JSON is optional** (the Studio is the main mode; the achievement page is the secondary static-image feature, reachable from *File → TelopMotion (static image)…*).

### 10.3 `menu.js` — top menu bar
A custom DOM menu bar (not the native Electron menu, so it works the same on the web). Keyboard navigation with arrows, Enter and Esc.

- **File:**
  - New project
  - Open project…
  - Save project (Ctrl+S)
  - Save project as…
  - — Import profile JSON…
  - Import lyrics (SRT / LRC / JSON)…
  - Import audio…
  - Import image…
  - Import font…
  - — Recent projects ▸ (Electron: the last 8 paths in userData `recent.json`; web: autosaved projects in IndexedDB)
  - — Back to achievements
- **Generate:**
  - Script from data… (a dialog with the `ScriptOptions` form)
  - — **Random style** ▸ Whole project / Selected cues / Selected elements
  - Random settings… (seed, locked groups, style "intensity" 1–3, allowed tags)
  - Re-roll (same scope, new seed)
  - — Apply preset ▸ (list) to Project / Selected cues
  - — Fit cues to audio
  - Distribute cues evenly
- **Output:**
  - Save achievement image ▸ 16:9 JPG / 16:9 PNG / 9:16 JPG / 9:16 PNG
  - — Export SRT…
  - Export SRT with fx tags…
  - — Export video… (Ctrl+E)
- **Settings:**
  - Language ▸ 5 languages
  - Defaults… (cue length, gap, default easing, default font)
  - Preview quality ▸ Auto / Full / Half / Quarter
  - Render quality ▸ Draft / Final
  - Autosave ▸ on/off, interval
- **View:**
  - Aspect ▸ 16:9 / 9:16
  - — Panels ▸ Media / Inspector / Timeline (checkboxes)
  - Layout ▸ Standard / Wide preview / Timeline focus / Reset
  - — Guides ▸ Safe area / Thirds grid / Center cross
  - Snapping ▸ on/off
  - Zoom ▸ Fit / 50% / 100% / 200%

### 10.4 `media.js` — Media panel (left)
- **Tabs:** Data · Audio · Images · Fonts · Subtitles.
- **Data:** the profile card (avatar, name, songs count), buttons Import JSON / Replace, and a list of top songs; dragging a song onto the preview sets it as the cover background.
- **Audio:** one active track. Shows the file name, duration and a mini waveform (from peaks computed once: max absolute per 512 samples, cached). Buttons: Replace / Remove, plus "Fit cues to audio".
- **Images:** thumbnails of the uploaded images, the avatar and song covers (loaded with `platform.loadImage`). Drag an image onto the preview background to set `background: image`, or onto the letters to set `fill: textureFill`.
- **Fonts:** the built-in and user fonts, each previewed with the sample "Aa あア 123" (drawn on a canvas). Click to apply to the selection; drag onto a letter or cue to apply to it.
- **Subtitles:** the imported .srt files; "Use" replaces the script with an undoable command.
- **Storage:** media files are kept in IndexedDB `sa-studio/blobs` (web) or `userData/studio-media/<hash>` (Electron, through new IPC `media:put`/`media:get`). The project stores only `dataRef` keys. "Save project as" can optionally save a `.telopmotion.zip`-like bundle: skip this in v1 and document it.

### 10.5 `preview.js` — Preview (center)
- **Stage:** the WebGL canvas at output resolution × preview scale. The preview scale is Auto: if the average frame time over 30 frames is above 20 ms, drop to 0.5, and then to 0.25.
- **Overlay:** a 2D canvas on top for guides, the selection and handles.
- **Transport bar** below the stage:

| Control | Behavior |
|---|---|
| ⏮ | go to the start |
| ◀◀ | previous cue |
| ▶ / ⏸ | play/pause |
| ▶▶ | next cue |
| ⏭ | go to the end |
| ⟲ | loop the selection or in-out range |
| speed | 0.25–2× |
| time display | `mm:ss.ff / mm:ss.ff`; click to type a time |
| volume | — |
| aspect | badge; click toggles 16:9 / 9:16 |

- **Playback:**
  - With audio, a hidden `<audio>` element plays from an object URL. `t = audio.currentTime` is read on every requestAnimationFrame, so the audio is the master clock.
  - Without audio, `performance.now()` is the clock.
- **Selection:**
  - A click picks the top-most letter quad from `FrameInfo` and selects at the current level. The level starts at the cue level; double-click goes down a level (cue → line → word → letter); Esc goes back up.
  - Shift adds to the selection; a drag on empty space draws a selection box.
  - The selected bounding box is drawn with 8 scale handles, 1 rotation handle, and a center point for moving.
  - Handles show only when the selection is visible at the current time.
- **Direct manipulation** (writes `overrides` through `setProp` commands; if a keyframe exists at the playhead, or "auto-key" in the timeline header is on, it writes a keyframe instead):
  - Dragging the body moves `transform.x`/`transform.y`.
  - Dragging a corner scales. Shift keeps the ratio; Alt scales from the center.
  - The rotation handle changes `transform.rotate`; Shift snaps to 15°.
  - Arrow keys nudge by 1 px (10 px with Shift).
  - While dragging, snap to guides (center lines, thirds, safe area) and to other letters' edges and centers within 6 px, and show magenta guide lines.
- **Layout `path` editing:** when the selected cue's layout is `path`, its control points are drawn and can be dragged.
- **Context menu** (right-click): Reset transform · Reset all overrides · Copy style · Paste style · Randomize this · Add keyframe for… ▸

### 10.6 `inspector.js` — Inspector (right)
- **Header:** a breadcrumb of the selection (`Cue 12 › Line 1 › Word 2 › "A"`), the selection kind, and the number selected. With several selected, it edits all of them; mixed values show "—".
- **Sections**, each collapsible and remembered:
  1. **Cue** (only when a cue is selected): text (a multi-line textarea; committing runs `editCueText`), start/end (time inputs), meta kind, the badge link (a select from the evaluation badges).
  2. **Text:** font (a font control with the list plus "Load…"), size, weight, letterSpacing, lineHeight, align, maxWidth, direction (horizontal/vertical, which is a shortcut that sets the layout type).
  3. **Transform:** x, y, rotate, scale, tiltX, tiltY, opacity, anchor (a 9-point picker).
  4. **Animation**, **Layout**, **Enter**, **Exit**, **Hold** (a stackable list with + / reorder / remove), **Location**, **Fill**, **Edge** (stackable), **Post** (stackable, project or cue only), **Background** (project or cue only). Each section has:
     - a type select (options from the registry, localized labels, with an "(inherited)" option that clears the override)
     - params, as controls generated from the descriptor
     - a **Motion** sub-panel: `in` (duration, delay, ease) and `out` (duration, delay, ease), stagger (each, order, ease, unit, from), loop (period, yoyo, ease)
     - an "enabled" toggle
  5. **Color:** fill, fill2, stroke, glow and shadow (color controls), palette select, "use category colors" toggle, and a category color map editor (project level).
- **Controls** (`controls/*.js`):
  - `number`: drag the label to scrub (Shift ×10, Alt ×0.1), type a value, a slider when min/max are set.
  - `select`, `bool`.
  - `vec2`: two numbers plus a pick-in-preview button.
  - `color`: a swatch that opens the §10.8 picker.
  - `gradient`: a swatch that opens the §10.8 gradient editor.
  - `ease`: a dropdown of names with an 80×48 curve preview canvas, plus "Custom…" opening a cubic-bezier editor with 2 draggable handles and spring/steps fields.
  - `motion-def`: the composite described above.
  - `font`, `text`.
- **Every control row has:**
  - a **◆ keyframe button**: empty = no track; filled = a key at the playhead; half = a track without a key here. Clicking adds or removes a key at the playhead.
  - an **override marker**: a colored left border when the value is set at this level, and a ↺ button to reset it to the inherited value.
- Edits dispatch commands with `coalesceKey = path + propPath` so a drag gives one undo step.

### 10.7 `timeline.js` — Timeline (bottom)
- Drawn on a canvas, redrawn only when something changes, with DOM for the header controls.
- **Header controls:** zoom slider (px per second, 10–800), fit, snapping toggle, auto-key toggle, and add-marker.
- **Rows:**
  1. **Ruler:** seconds with adaptive ticks, marker flags, in/out range.
  2. **Audio:** waveform from the cached peaks; click to seek.
  3. **Cues:** rounded blocks colored by `meta.category` (or neutral), with the first line of text inside.
     - Drag the body to move the cue (snapping to the playhead, other cue edges, markers and whole seconds).
     - Drag an edge to trim (minimum 0.2 s).
     - Double-click to edit the text inline; commits with `editCueText`.
     - Right-click menu: Split at playhead · Merge with next · Duplicate · Delete · Apply preset ▸ · Randomize.
     - Box-select several cues and move them together.
  4. **Element lanes** (expandable per selected cue, using a ▸ twisty on the cue row): Cue → Lines → Words → Letters. Each shows only the properties that have tracks, and "+ property" adds one.
     - Keyframes are diamonds, positioned relative to the cue start.
     - Drag to move (snapping to frames); Shift-drag to box-select; Ctrl+C / Ctrl+V to copy and paste at the playhead; Del to delete.
     - Right-click a key → Ease ▸ (the list plus Custom…) · Hold (step) · Delete.
     - The segment between keys is drawn as a line with a tiny curve showing its ease.
- **Playhead:** a red line you can drag across all rows. Clicking the ruler seeks.
- **Scrolling:** horizontal with Shift+wheel or a trackpad; Ctrl+wheel zooms around the cursor. Vertical scrolling for the lanes.
- Any change to cue times updates the script cues, so SRT export reflects the edits right away.

### 10.8 `colors.js` — color customization
- **Color picker popover:**
  - an SV square and hue slider (canvas), an alpha slider, a hex input, and RGB/HSL inputs
  - an eyedropper (`window.EyeDropper` if available; otherwise sample the preview canvas by clicking it)
  - 12 recent colors (in localStorage)
  - the current palette's swatches
  - "Category ▸" (9 category tints)
- **Gradient editor popover:**
  - type (linear, radial, angular) and angle (a dial)
  - a stop bar: click to add a stop, drag to move, drag off to remove (at least 2 stops), select a stop to edit its color with the embedded picker
  - space (element, line, screen)
  - "Reverse" and "Distribute" buttons
  - buttons to save it into a palette as a gradient preset
- **Palettes:**
  - Built-in: `Suno Dark` (the §1 base colors), `Neon`, `Pastel`, `Mono`, `Gold`, `Category`. Pick original hex values for each.
  - Your own palettes: create, rename, edit swatches, delete, and import/export as `.json` (`{name, colors}`).
  - Palettes are stored in the project; user palettes are also stored globally in localStorage so they can be reused.
- **Card theme editor** (Output → Save achievement image dialog, and Inspector → Background → card): the §4.5 `cardTheme` fields and the category color map, with a live thumbnail.

### 10.9 `random.js` — random generation
- `randomize({ scope: 'project'|'cues'|'elements', paths, seed, locks: Set<group>, intensity: 1..3, allowTags, avoidRepeats: true })`.
- **For each target and each group not in `locks`:**
  1. `r = rngFor(seed, targetPath, group)`.
  2. Pick a type from the registry for the group, filtered by `allowTags` and by fit rules:
     - `vertical` layout only if the text is ≤ 16 letters and mostly CJK, or ≤ 10 Latin letters
     - `circle` and `spiral` only if the text is ≤ 24 letters
     - `morphFromPrevious` only if there is a previous cue
     - `badgeAnchored` only if the cue has a `badgeId`
  3. Avoid repeating the previous cue's type when `avoidRepeats` is on.
  4. For each param with a `random` spec, sample uniformly from the range or pick an option. `intensity` scales numeric ranges toward the high end: `lerp(min, max, r^(1/intensity))`.
  5. MotionDef: durations are randomized within ±30% of the defaults, and eases are picked from a curated list per group.
  6. Colors: pick 2–3 colors from the active palette, or harmonious hues (rotations 30°/150°/180° in OKLCh) when "Generate colors" is on.
- **Results** are written to `cueStyles` (for cues and project scope) or to `overrides` at element level (elements scope), as one undoable command.
- **Manual overrides are never touched** unless the scope is elements and the user confirms "Overwrite manual edits".
- **Re-roll** = the same scope with `seed + 1`. The seed is shown in the dialog and can be edited, so results can be reproduced.

### 10.10 `io.js` — project files and autosave
- **Save:** `JSON.stringify(project)` → `platform.saveFile` (`.telopmotion.json`). Media blobs are not included in v1; the file only references them.
  - On open, missing media are listed with "Relink…" buttons.
- **Open:** `platform.readFile` → `project.migrate` → `store.load`.
- **Autosave:** every 30 s and on `visibilitychange`/`beforeunload`, when something has changed. Kept in IndexedDB `sa-studio/autosave` (web) or `userData/studio-autosave.json` (Electron, through new IPC `studio:autosave-write/read`).
- **Imports:** profile JSON (validated as in §4.1), lyrics SRT / LRC / JSON via `SA.lyricsFile.parse` (§7.18, shows warnings), audio (checked by decoding), image (`createImageBitmap`), font (checked with `opentype.parse`).

---

## 11. Electron and Pages integration

### 11.1 `main.js` / `preload.js`
- **New IPC** (all use `ok`/`fail`, and every path comes from a dialog chosen by the user):
  - `file:save`, `file:open`
  - `file:stream-open`, `file:stream-write`, `file:stream-close`, `file:stream-abort` (keep a `Map<id, fd>`, and close any leftover streams on `will-quit`)
  - `image:fetch` (host allow-list)
  - `asset:read` (reads only `renderer/fonts/` and `renderer/vendor/`; used by `SA.platform.readAsset` because `fetch()` cannot read `file://`)
  - `media:put`, `media:get`
  - `studio:open`, `studio:autosave-write`, `studio:autosave-read`
  - `recent:list`, `recent:add`
- **`will-navigate`:** allow navigation between `index.html` and `studio.html` (the file:// check already allows it).
- **Remove:** `snapshot:save`, `snapshotWindow`, `renderSnapshotJpeg`, and `saveSnapshot`/`onSnapshotData`/`snapshotReady` in preload.
- **Smoke tests:** new `SA_SMOKE_STUDIO` (§13).
- **CSP in `studio.html`:**
  ```
  default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https: blob:;
  font-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'
  ```
  `index.html`: add `blob:` to `img-src` and `media-src`.

### 11.2 `index.html` / `app.js` web mode
- `app.js init()`: don't return early without `sunoApi`. Set `document.body.classList.toggle('is-web', !SA.platform.isElectron)`.
- **In web mode:**
  - hide `#profile-form`, `#btn-refresh` and `#cache-select`
  - show `#web-import` (a drop zone plus an "Import JSON" button; text `web.importHint`, which mentions the desktop app and `node scripts/scrape.js`)
  - accept dropped `.json` files
- **Snapshot button** becomes a split button: "Save image ▾" with 16:9 JPG, 16:9 PNG, 9:16 JPG, 9:16 PNG, done through `SA.card.renderToBlob` + `platform.saveFile`.
- **New "Open Studio" button** next to it: `platform.openStudio(currentData, lang)`.

### 11.3 `.github/workflows/pages.yml`
```yaml
name: Deploy Pages
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.d.outputs.page_url }} }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: renderer }
      - id: d
        uses: actions/deploy-pages@v4
```
Add `renderer/.nojekyll`. The README tells the user to set Settings → Pages → Source to "GitHub Actions" (a one-time manual step).

### 11.4 Vendoring (`scripts/vendor.js`, `npm run vendor`)
- **Scripts:** copy from `node_modules` into `renderer/vendor/`, and write `renderer/vendor/LICENSES.txt` from their LICENSE files. Commit the output.
  - `mp4-muxer/build/mp4-muxer.js` (UMD global `Mp4Muxer`)
  - `webm-muxer/build/webm-muxer.js` (`WebMMuxer`)
  - `opentype.js/dist/opentype.min.js` (`opentype`)
  - `earcut/dist/earcut.min.js` (`earcut`)
- **Fonts:** downloaded by hand from the official Google Fonts / notofonts GitHub releases (OFL) into `renderer/fonts/`, with `OFL.txt`.
  - Use static TTF/OTF, not variable fonts.
  - The Noto Sans JP files are about 4–5 MB each; that's acceptable because they load only when needed.
  - Record the source URLs and versions in `renderer/fonts/SOURCES.md`.

### 11.5 i18n
- Add these namespaces in all 5 languages: `studio.*` (menu, panels, inspector, timeline, dialogs, warnings), `fx.<group>.<type>` labels, `fx.param.<key>` labels, `ease.<name>`, `color.*`, `export.*`, `web.*`, `studio.script.*`.
- The smoke test that checks for missing translations is extended to `studio.html`: every `[data-i18n]` and every generated control label must resolve (not come back as the raw key) in all 5 languages.
- **Japanese UI text should be natural Japanese**, not a literal translation.

### 11.6 README
Add sections:
- Web version (URL, JSON import only, how to get JSON)
- Studio overview with a screenshot
- Effect groups (list the groups only; don't mention third-party tools)
- Export formats
- Pages setup
- Font licenses

Update the feature bullets and the snapshot section (canvas, both aspect ratios).

---

## 12. Phases, each with acceptance checks and ending in one commit

| Phase | Scope | Acceptance |
|---|---|---|
| **P1 Foundation** | `scripts/check.js`, the `test` script, `format.js`, `platform.js`, `suno.js` changed to use it, `app.js` web mode, CSP updates, `.nojekyll`, Pages workflow | `npm run check` and `npm test` pass. `npm start` behaves as before. `npx http-server renderer -p 8080`, then opening `/index.html` in the browser pane and importing a JSON renders the badges, with no console errors. |
| **P2 Canvas card** | `card/palette.js`, `card/canvas-card.js`, the save-image split button, new IPC `file:save`, `image:fetch`, removing the DOM snapshot | The 16:9 output matches `snapshot/achievement-card.jpg` in content and colors (compare visually with Read). 9:16 is 1080×1920 with nothing clipped. It works in Electron and on the web. The avatar shows in both (or the placeholder on the web if CORS blocks it). |
| **P3 SRT, script and tween** | `srt.js`, `script-gen.js`, `color.js`, `rng.js`, `easing.js`, `tween.js` + tests | Round-trip tests pass (CRLF, BOM, `.` milliseconds, Japanese, fx tag). `script-gen` on `@suno` data gives the expected cue kinds and ordering. The easing tests pass, `names.length ≥ 30`, and every curve hits `f(0)=0` / `f(1)=1`. |
| **P4 Studio shell** | `studio.html`/`css`, `store.js`, `project.js` (+ tests), `app.js` shell, `menu.js`, splitters, layout presets, `io.js` save/open/autosave, handoff from index | "Open Studio" moves the data across. The menus all open, and keyboard navigation works. Panels resize and persist. Save → reload → Open restores the project. Undo/redo works for a dummy command. |
| **P5 Text → vector → GL** | `font.js`, `geometry.js` (+ tests), `scene.js`, `gl/context.js`, the basic text pass with solid fill, `engine.js`, `preview.js` transport | English and Japanese cues render as crisp vector outlines. Letters with holes (`A`, `B`, `8`, `あ`, `愛`) are correct. Play, pause and scrub are in sync with the audio. The fallback banner appears when WebGL2 is forced off. |
| **P5b Restructure → beats** | §7.16 `textflow.js` + tests, the Beat model (project.beats, beatStyles, beatKindStyle), `scene.js`/`motion.js` working per beat, beat sub-blocks in the timeline (drag, split, merge, edit, pin), restructuring again while keeping pinned beats, `\N` `\P` `\h` parsing, long-hold repeat, recap (whole text again) | Long Japanese and English lines split naturally into lines and pages. The page timing, repeats, and the full-text recap (with the gather transition) show in the preview. The "too fast to read" warning appears. |
| **P6 Motion system** | `motion.js` (+ tests), `layout.js` (+ tests), effects for Animation, Layout, Enter, Exit, Hold, Location (CPU parts), per-letter state textures, vertex deformations | Each enter/exit/hold type can be chosen and looks right. The formations row, vertical, circle, arc, spiral, wave, grid, stackedWords, scatter and path work, and so does the start formation → target "build-up", including `formation:circle` → row. Stagger orders work. |
| **P7 Shaders** | SDF (JFA), fill/edge/post passes, bloom, background pass with camera focus, the particle, stroke and pieces representations, morph | Every Fill, Edge and Post type renders with no GL errors (`gl.getError()` checked in debug mode). Draw-on, particles, shatter and morph work across cues. The preview stays ≥ 30 fps at half preview scale on the dev machine with the Neon preset. |
| **P8 Inspector and manual editing** | `inspector.js` + controls, the override model, selection and handles in the preview, the `path` point editor, keyframe buttons | Selecting a letter, then moving, rotating and scaling it, sets overrides. The inspector shows override markers and reset. Keyframes animate. Undo covers everything. Editing text keeps valid overrides and reports orphans. |
| **P9 Timeline** | `timeline.js` with all rows and interactions | Moving, trimming, splitting and merging cues updates the SRT export. Keyframes can be dragged, copied, pasted and given an ease. Snapping works. Waveform and scrub are accurate to 1 frame. |
| **P10 Color and random** | `colors.js` picker, gradient editor, palettes, card theme editor, `random.js`, presets menu | Colors and gradients apply at every level and can be keyframed (OKLab blending). Palette import/export works. Random with a fixed seed is reproducible, respects locks, and never touches manual overrides. Re-roll changes the result. |
| **P10b Layers** | §7.11: video/image layers, foreground, blend/opacity, layer timeline rows, transparency grid, the new post shaders (glitch and dissolve families first) | A background video plays in sync and matches frame-for-frame in export. A foreground PNG with alpha composites correctly. The lyrics layer is transparent over the video, and shadows and glow blend correctly. Every glitch and dissolve type renders. |
| **P10c Gaps and credits** | §7.14 `fillers.js`, `audio-analysis.js` (+ tests: the FFT of a 440 Hz sine peaks in the right band; results are deterministic), `gl/shapes.js`, the Fillers track, audio-reactive links; §7.15 `credits.js`, the Credits dialog and track | Every gap ≥ minGap gets the right default filler. Countdown reaches the next cue exactly. Spectrum and waveform match the audio in preview and export. Pinned fillers survive cue edits. The title/artist element, always-on corner credit, and end card all work alone and together, and can be edited like cues. SRT export leaves credits out by default. §7.17 maximum duration: all 3 overflow modes work, the timeline marker shows, and the export length equals the maximum. |
| **P11 Export** | `video-export.js`, the export dialog, stream saving, audio | Electron and the web both export a 10 s 1080p30 MP4 with AAC, and a 9:16 60 fps one. The file plays in the browser pane with A/V in sync. The WebM fallback works when MP4 is forced off. **The transparent export keeps alpha through the PNG-sequence zip** (check by loading it back over a checkerboard); the VP9-alpha WebM path is optional (§7.11). Cancel works. A 3-minute export doesn't run out of memory (streaming). |
| **P12 Polish** | i18n for everything in 5 languages, README, smoke tests, `npm run dist` build | The i18n smoke test reports 0 missing. The `dist` installer launches, and the Studio works in the packaged app (fonts and vendor files included). |

---

## 13. Verification tools

- **Unit tests** (`scripts/test/*.test.js`, `node --test`):
  - easing: endpoints, symmetry, bezier reference values, `names.length ≥ 30` and every name parses
  - tween: number/vec/color kinds, before-first / after-last clamping, ease applied exactly once
  - rng: determinism
  - color: hex round-trip, OKLab round-trip error < 1e-4
  - srt: fixtures in `scripts/test/fixtures/*.srt`
  - script-gen: uses a small fixture dataset `fixtures/dataset.json` (8 songs)
  - layout: circle letters are all at the radius within 0.5 px; vertical columns are ordered right→left; no NaN anywhere
  - motion: at `t = start` with a fade enter, opacity is 0; at `t = start + in.duration + staggerMax`, all letters are at opacity 1; the exit order mirrors the enter order
  - geometry: `groupContours` finds the holes in the "O" and "8" test contours; the triangle area sum equals the polygon area within 0.5%
  - project: resolution order and migration
  - fillers: `gaps()` covers the intro, interlude and outro; respects minGap and margin; pinned clips move with their cues
  - credits: the template placeholders are filled in; the three modes produce the expected elements and timing; the end mode extends the duration
  - audio-analysis: the FFT peak is in the right band; running it twice gives identical output
- **Electron smoke:** `SA_SMOKE=1 SA_SMOKE_STUDIO=1 npm start`, which:
  1. loads `@suno`
  2. renders both card aspects to temp and logs their sizes
  3. opens the Studio through the handoff, generates the script, and applies each preset once, logging `gl.getError()` = 0
  4. randomizes with seed 42 twice and logs that the results are the same
  5. exports a 3 s MP4 to temp, and logs the codec used, the size, and whether the `ftyp` magic bytes are present
  6. runs the i18n check on `studio.html` and exits
- **Web (browser pane):** `npx http-server renderer -p 8080`, then open `http://localhost:8080/`:
  1. import a JSON, open the Studio, and switch 16:9 ↔ 9:16
  2. go through the presets in English and Japanese (screenshots)
  3. select a letter, then drag, rotate, keyframe, recolor with a gradient, undo, and redo
  4. drag and trim a cue, then export the SRT and read it
  5. re-roll randomization and confirm the manual edits survive
  6. save the project, reload, and open it
  7. export a short MP4 with audio, then play the result
  8. read the console for CSP, WebGL or taint errors (there should be none)
- **Visual review:** save frames at fixed times (Output → a debug "Save frame PNG" shown only with `?debug`) for each preset, and view them with Read.

---

## 14. How big the combination space is, and the performance budget

### 15.1 Combination count
Just the **type choices**, without params, easing or colors:

| Group | Types | Stacking |
|---|---|---|
| Animation | 8 | |
| Layout | 11 target formations × 8 start formations | |
| Enter | 19 | |
| Exit | 14 | |
| Hold | 15 | up to 3 |
| Location | 9 | |
| Fill | 13 | |
| Edge | 7 | up to 3 |
| Post | about 35 | up to 4 |
| Background | 6 | |

- One layer each: 8 × 88 × 19 × 14 × 15 × 9 × 13 × 7 × 35 × 6 ≈ **5.5 × 10¹¹** combinations per cue.
- With stacking plus the 33 named tween curves and the parametric forms (`cubic-bezier`, `spring`, `steps`, `hold`) × in/out × 11 groups, the variety is effectively unlimited.
- Random generation needs guardrails so results stay tasteful: fit rules, `intensity`, `avoidRepeats`, and the presets.

### 15.2 Performance budget
- **Preview target:** 1080p at 30 fps → 33 ms per frame. CPU letter evaluation must stay within **≤ 4 ms** and the GPU within **≤ 20 ms** on a mid-range GPU.
- **Cost weights:** each descriptor has `cost` (GPU weight units; 1 unit ≈ one full-screen pass at 1080p ≈ 0.3–0.5 ms on a mid-range GPU):

| Cost | Effects |
|---|---|
| 0 | CPU-only motion |
| 1 | simple fill, outline, rgbShift, vignette, grain |
| 2 | SDF, most glitch and dissolve effects, shockwave, lightSweep |
| 4 | bloom, godRays, zoomBlur, pixelSort |
| samples × text-pass cost | motionBlur, echoTrail |

- **Budget:** default **24 units** per frame in the preview. The export has no limit, because it isn't real time.
- **Budget meter:** the inspector shows the cue's total cost, turning yellow above 24 and red above 40.
- **Preview when over budget:** the preview automatically lowers the preview scale, then sample counts, and the export is unaffected.
- **Random generation:** stays within the budget unless `intensity = 3`.
- **Export speed estimate:** frames × (render + encode). On a mid-range GPU, 1080p30 with a typical preset (≈ 10 units) is about 1.5–3× real time, so a 3-minute song takes about 5–9 minutes. The export dialog shows a measured ETA after 30 frames.

## 15. Risks and notes
- **Suno images on the web:** CORS may block drawing avatars and covers from the Suno CDN into a canvas. The placeholder fallback covers this; confirm the behavior in P2 and note it in the README.
- **Encoder support:** H.264 and AAC encoding depend on the OS and GPU. Check with `isConfigSupported` every time; never assume.
- **Japanese font size:** the Japanese font is large. It loads only when needed, and a "Loading font…" status shows in the preview.
- **Performance:** geometry is cached, and per-frame work on the CPU is limited to the letter states (≤ ~500 letters). Preview scale drops automatically.
- **Out of scope for v1:**
  - bundled project archives (with media inside)
  - right-to-left and complex-shaping scripts (Arabic, Indic)
  - more than one audio track
  - beat detection
