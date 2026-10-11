# Working with Claude Code

> 日本語版: [README.claude.ja.md](README.claude.ja.md) ｜ English (this file)

How to let [Claude Code](https://claude.com/claude-code) edit a TelopMotion project and bring the result back into the Studio. A project is a plain JSON file (`.telopmotion.json`), so Claude edits the file and **you load it into the app by hand**. There is no live connection between the two.

```
 Studio (Web or Electron)            Claude Code (this repo)
 ───────────────────────            ───────────────────────
 File → Save  ──────────►  work/song.telopmotion.json
                                     │  edit + validate
 File → Open project…  ◄────────────┘
```

## 1. The loop

1. **Save** the project from the Studio (*File → Save*, `Ctrl+S`) into a working folder, e.g. `work/`.
2. **Ask Claude Code** to change the file (see the examples below).
3. **Validate** — Claude runs `node scripts/validate-project.js <file>` (see §3).
4. **Open** the file in the Studio (*File → Open project…*, `Ctrl+O`), play or scrub the timeline, and review.
5. Repeat. Commit to git before a large edit so you can go back.

Do not edit the same project in the Studio and in Claude Code at the same time: whichever saves last wins. Finish a round in one place, then switch.

## 2. What Claude needs to know

Point Claude at these when you ask for edits (or put them in a `CLAUDE.md`):

| What | Where |
| --- | --- |
| Project file schema | [app-design.md](app-design.md) §4.5, and `renderer/js/studio/project.js` (`migrate` fills defaults and upgrades old versions) |
| Working examples | `demo/*.telopmotion.json`, `test/fx400.telopmotion.json` |
| Effect names and parameters | [effects.csv](effects.csv), [text-effects-en.csv](text-effects-en.csv), `demo/*-showcase.md` |
| Page layout presets | [page-layout.md](page-layout.md) |
| Layer order | [text-layer-design.md](text-layer-design.md) |
| How the demos are generated | `scripts/demo30.js`, `scripts/fx400.js`, `scripts/showcase.js` (build projects with `project.create` → `textflow.apply` → `project.migrate`) |

Things worth telling Claude explicitly:

- The renderer is deterministic: all randomness is seeded, so the same JSON at the same time always looks the same. Change a `seed` to change a look.
- Audio, video, image and font data are **not** inlined — `media.*.dataRef` points into the app's own storage. Keep those entries as they are, and relink media in the Studio after opening if needed.
- `version` is bumped by the app. Do not lower it; `migrate` upgrades older files and rejects newer ones (`newer-version`).

## 3. Validating an edit

```bash
node scripts/validate-project.js work/song.telopmotion.json
```

It runs the same `project.migrate` pass the Studio applies when opening a file, prints the version and cue count, and exits `1` on failure. This catches broken JSON, a wrong `format`, or a file newer than the app. It does **not** judge whether an effect name or parameter makes visual sense — check that in the Studio.

For lyrics-only changes you can also regenerate from SRT instead of editing JSON: see `scripts/demo30.js build` for how a project is composed from an `.srt` and a recipe.

## 4. Example requests

```
In work/song.telopmotion.json, add an emphasis fx to the cues in the chorus (60-90 s).
Validate with scripts/validate-project.js after editing.
```

```
Make every cue in section 2 use the same palette as the first cue,
and shift all keyframes of cue 5 by +0.5 s. Keep everything else untouched.
```

```
Read demo/demo30-A.telopmotion.json and build a similar 30-second project from
work/lyrics.srt, with a calmer look. Write it to work/calm.telopmotion.json and validate it.
```

Small, specific requests are safer than "redo everything": the diff stays reviewable and the file stays loadable.

## 5. Optional: let Claude operate the Web version

The Web version runs at <https://gadget114514.github.io/TelopMotion/> (`/dev/` for the main branch). Claude Code can open it with its built-in browser or with Claude in Chrome to click, play and take screenshots, so it can check its own edits visually. Importing files goes through a file picker, so loading the edited JSON is still easiest by hand (or with Claude in Chrome's file upload). Rendering needs WebGL2, so use a real browser rather than a headless one.

For a local copy, `.claude/launch.json` defines a `web` server that serves `renderer/` on port 8765.
