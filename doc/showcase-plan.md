# showcase.json — 効果・紙面レイアウトの見本プロジェクトを Help から開く

## Context
効果(約190タイプ)と紙面レイアウト(page 19種)を一括で目視確認できる見本プロジェクトが欲しい。
Help メニューから開ければ、ユーザーはファイルを探さずに効果の見え方を確認できる。結論: **Help から開く案は妥当**で、既存の仕組みでほぼ追加コードなしに実現できる。

- `renderer/data/` は既に `ASSET_ROOTS`(main.js:41)に含まれ、`SA.platform.readAsset('data/…')` で sandbox 越しに読める → **main.js / preload.js の変更不要**。
- `package.json` の build.files は `renderer/**/*` → パッケージにも自動で同梱される。
- 読み込みは既存の `SA.io.loadFromObject()`(io.js:40)をそのまま使う（recent 経由の openRecent と同じ経路）。

## 方針
1. **生成スクリプト `scripts/showcase.js`**（`fx400.js` と同じ流儀の `build` コマンド。手書きJSONにせず再生成可能にする）
   - 効果: `fx400.buildCatalog()`（export 済み）から各 `group.type` の **variant 1 のみ**を採用し、`fx400.applyEntry()` で cue に適用（background は clip 経路も既存処理が面倒を見る）。対象グループ: enter / exit / hold / animation / layout / location / fill / edge / post / background / bgShape / bgFill / bgEdge / bgMotion。
   - 紙面: `fx.list('page')` の `none` を除く 19 種を先頭セクションに置き、各プリセットの役割構成（見出し/本文/価格 等）に合った**専用サンプル文**を持たせて `style.page = { type }` を設定。
   - cue 構成: 1効果＝1 cue（効果3秒／紙面4秒）、テキストは「グループ名 / 効果名(ja) / type」を表示して何を見ているか分かるようにする。セクション境界は `markers` を使えるなら章マーカーを付ける。
   - 出力: `renderer/data/showcase.json`（`project.create` → `textflow.apply` → `project.migrate` で検証してから書く。`writeFileIfChanged` 相当で差分時のみ書き込み）。
   - `package.json` に `"showcase": "node scripts/showcase.js"` を追加。
2. **Help メニュー**: `menu.js:175` の items に `Showcase` 項目（action: `showcase`）を About の上に追加。
3. **ハンドラ** `app.js`: `showcaseProject()` を追加し `handlers` に `showcase:` を登録（app.js:1735 付近）。
   - `SA.platform.readAsset('data/showcase.json')` → JSON.parse → `SA.io.loadFromObject()`。
   - 未保存の変更がある場合の確認は、`newProject`/`openProject` が既にどう扱っているかに合わせる（実装時に確認し同じ挙動にする）。成功/失敗は既存 toast キー（`studio.toast.opened` / `invalidProject`）を再利用。
4. **i18n** `i18n.js`: `studio.help.showcase`（メニュー項目）を 5 言語(en/ja/es/fr/ru)に追加。
5. **doc**: `doc/app-design.md` に Help > Showcase と生成コマンドを数行追記。

## 注意点
- 作業ツリーに未コミットの WIP（fx400 系・shader-fx・motion 等）があるため、それらは触らない。showcase は fx400 カタログを**読むだけ**。カタログ側が更新されたら `npm run showcase` で再生成。
- 約209 cue × 3〜4秒 ≒ 11分。長すぎる場合は variant・グループを絞れるよう `--groups` オプションを用意。

## 検証
- `npm run showcase` で生成 → `node --test scripts/test/showcase.test.js`（新規: migrate が ok／cue 数がカタログのタイプ数＋紙面19と一致／全 cue に style か clip がある／全 page type が使われている）。
- 既存の `npm test` が緩まないこと（特に i18n 5言語キー整合テスト、fx400 系）。
- `npm start` で Help > Showcase を開き、プレビューで数 cue（紙面 newspaper / score、効果 enter / post）を再生して表示を目視確認。
