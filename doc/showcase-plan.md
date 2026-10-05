# showcase.json — 効果・紙面レイアウトの見本プロジェクトを Help から開く

## Context
効果(約190タイプ)と紙面レイアウト(page 19種)を一括で目視確認できる見本プロジェクトが欲しい。
Help メニューから開ければ、ユーザーはファイルを探さずに効果の見え方を確認できる。結論: **Help から開く案は妥当**で、既存の仕組みでほぼ追加コードなしに実現できる。

- `renderer/data/` は既に `ASSET_ROOTS`(main.js:41)に含まれ、`SA.platform.readAsset('data/…')` で sandbox 越しに読める → **main.js / preload.js の変更不要**。
- `package.json` の build.files は `renderer/**/*` → パッケージにも自動で同梱される。
- 読み込みは既存の `SA.io.loadFromObject()`(io.js:40)をそのまま使う（recent 経由の openRecent と同じ経路）。

## 方針
1. **生成スクリプト `scripts/showcase.js`**（`fx400.js` と同じ流儀の `build` コマンド。手書きJSONにせず再生成可能にする）
   - 効果: `fx400.buildCatalog()`（export 済み）から各 `group.type` の **variant 1 のみ**を採用し、`fx400.applyEntry()` で cue に適用（background は clip 経路も既存処理が面倒を見る）。対象グループ: enter / exit / hold / animation / layout / location / fill / edge / post / background / bgShape / bgFill / bgEdge / bgMotion。カタログに無い **repeat グループ**（同じ文字列を複数回描く）はレジストリから直接レシピを作る。
   - **ステージング**（`stagedEntry`）: 効果だけ・静止した白文字では「何も起きない」効果がある（データスミアは動きが必要、スプリングは跳ねる対象が必要、タイミング系は動く入口が必要、0.25秒の入口は目に入らない）。そこで各 cue に以下を足す:
     - `animation` … 見える入口（slide）+ 出口。タイミング効果を乗せる対象を作る。
     - `fill` / `edge` / `background` / `bgShape` / `bgFill` / `bgEdge` / `bgMotion` / `repeat` … 円運動（`hold.orbit2D`）+ 短い入口 / 出口。にじみ・ぼかし・ブルーム・ディゾルブが作用できる pixels を作る。
     - `post` … 共有の周回（`POST_HOLD`: radius 0.08 / speed 0.6）+ 短い入口 / 出口に加え、6家族（`POST_FAMILIES`: グリッチ / ディゾルブ / ブラー・残像 / 変形・反転 / 光 / 色・質感）ごとにマーカーを切る。cue テキストは `後処理［家族/文字|画面］ 名前 / type`（文字＝歌詞層、画面＝完成画）。画面系が真っ黒では見えないため、post 区間全体に共有の対角3色グラデ板（`POST_BG`）を bg クリップで敷く。カタログ variant 1 の約25%段は見本には弱いため、特徴ノブだけ `POST_OVERRIDES` で可視帯に上げる（例: colorGrade は duotone が type 24 シェーダに未配線なので lift/saturation/posterize で grade を作る、heatHaze/displacement/chromatic は 0.65、filmGrain 0.55、mirror offset 0.25、dissolve の edge/ember 色を付ける）。
     - `hold` / `location` … 入口 / 出口のみ（本身就是動き）。
     - `enter` / `exit` … 効果の入口を 1.1 秒に伸ばす（3 秒 cue の中で肉眼で追える長さ）。自前のイージングを持つ種類（elasticPop など）は ease を linear にして二重イージングを避ける。
   - 紙面: `fx.list('page')` の `none` を除く 19 種を先頭セクションに置き、各プリセットの役割構成（見出し/本文/価格 等）に合った**専用サンプル文**を持たせて `style.page = { type, params }` を設定。**1 行目をロールとして読むプリセット**（newspaper の見出し、cafeSign の看板、cafeMenu のタイトル）は 1 行目を実物の見出しにして、プリセット名は末尾のクレジット行に移す。
   - cue 構成: 1効果＝1 cue（効果3秒／紙面4秒）、テキストは「グループ名 / 効果名(ja) / type」を表示して何を見ているか分かるようにする（post のみ `後処理［家族/文字|画面］ 名前 / type`）。セクション境界は `markers` を使えるなら章マーカーを付ける（post は家族ごとに `後処理［家族］ (post/家族id)`）。生成ファイルの cue テキストは日本語だが、各 effect cue は `meta: { kind: 'showcase', group, type, family?, target? }` を持ち、Help から開く際 `app.js` の `localizeShowcase` が画面言語（5言語）の `fx.*`＋`studio.showcase.*`（`fx-strings.js` の `SHOWCASE_UI`）で cue テキストとマーカーを作り直す（図形見本の `localizeFigureShowcase` と同じ流儀）。日本語では生成時と1バイト一致する。
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
- 約209 cue × 3〜4秒 ≒ 11分（現状は 215 cue）。長すぎる場合は variant・グループを絞れるよう `--groups` オプションを用意。

## 検証
- `npm run showcase` で生成 → `node --test scripts/test/showcase.test.js`（新規: migrate が ok／cue 数がカタログのタイプ数＋紙面19と一致／全 cue に style か clip がある／全 page type が使われている／post 6家族の網羅・順序・マーカー／post cue テキストの家族・対象表示／post 共有グラデ板／弱い post の可視帯ブースト）。
- 既存の `npm test` が緩まないこと（特に i18n 5言語キー整合テスト、fx400 系）。
- `npm start` で Help > Showcase を開き、プレビューで数 cue（紙面 newspaper / score、効果 enter / post 各家族の先頭: glitchBlocks / noiseDissolve / shockwave / kaleidoscope / godRays / colorGrade）を再生して表示を目視確認。post 区間は背後にグラデ板が見え、ディゾルブは進行で文字が消えること。
