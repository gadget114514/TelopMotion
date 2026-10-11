# AI Assistant (desktop app only)

The Electron app has an **AI** menu (AI Assistant…, AI settings…). The web build (GitHub Pages) has no AI menu and no AI UI at all.

## How it works

1. You describe a change. The model (Anthropic Messages API) works through four tools: `get_overview`, `read_json`, `list_effects`, `apply_patch`, plus `capture_frame` (an image of the current preview) when WebGL2 is available.
2. `apply_patch` edits a **working copy**. Every patch must pass `project.migrate`, the same check as *File → Open*; `format`, `version`, `media` and `dataset` are read-only.
3. Nothing changes in the open project until you press **Apply changes**. It is then one undo step labelled "AI Assistant". **Discard** drops the pending patch.

Code: `renderer/js/studio/ai-tools.js` (pure, tested in `scripts/test/ai-tools.test.js`), `renderer/js/studio/ai-assistant.js` (dialog and agent loop), `main.js` (`ai:*` IPC).

## API key and privacy

- The key is entered in *AI settings…*, encrypted with Electron `safeStorage` (OS credential store: DPAPI / Keychain / libsecret) and written to `ai-key.bin` in the app's `userData` folder - **outside any project**. If encryption is unavailable the key is not saved; set `ANTHROPIC_API_KEY` instead.
- The key stays in the main process: the renderer can only ask whether one is set. It is never written to project files, autosave, logs or `localStorage`.
- The only network destination is `https://api.anthropic.com/v1/messages` (fixed in `main.js`; the renderer CSP still has no outside `connect-src`).
- What you ask about is sent to the API: project JSON subtrees, and frame images when `capture_frame` is used. Do not use it on material you cannot share.

## Evaluation

`npm run ai-eval` runs the assistant on a case file with the **real API** (paid; set `ANTHROPIC_API_KEY`; not part of `npm test`).

```bash
npm run ai-eval -- --list                       # show the cases
npm run ai-eval -- --id beat-brighten --repeat 3
npm run ai-eval -- --model claude-opus-5-5
```

- **Cases**: `scripts/eval/cases.json` - a prompt, a fixture project, the `view` (cue / selection the user would have) and the `scope` plus `expect` items. The seed prompts are placeholders: replace them with the loose phrases you actually use. A failing case is where the guide / tools need to grow.
- **Same code as the app**: the runner uses `ai-agent.js` (prompt + loop) and `ai-tools.js`, so what is measured is what ships.
- **Checks** (`renderer/js/studio/ai-eval.js`): the patch is valid (`migrate`), protected keys and lyrics (text / timing) are untouched, every write stays inside the scope, and the measured direction is right - fill luminance (`luminance up/down`) or an fx-axes value (`axis energy up`). Other elements must stay `unchanged`; `noOps` for requests the assistant should decline; `maxOps` against sprawling patches.
- **Results**: written to `scripts/eval/results/<time>.json` (git-ignored) with ops, trace, token usage and the model's reply, to compare two runs (a prompt or guide change).
- The harness itself is tested without the API (`scripts/test/ai-eval.test.js`) with scripted models.

Limits: luminance reads the *fill colour*, not the rendered pixels, and the axes score the chosen effect types, not their parameters. They say whether a change went in the right direction, not whether it looks good - that stays a human judgement.
