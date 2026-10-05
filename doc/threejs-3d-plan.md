# three.js 導入: 3D後景 + 3D字幕 (同一シーン合成)

## Context
TelopMotion は自前の WebGL2 パイプライン (`renderer/js/lyrics/engine.js`, `gl/passes.js`, `gl/layers.js`) で字幕と背景を描画する。
- 目的: three.js を導入し、(1) 3D後景、(2) 字幕トラック単位の「3Dモード」、(3) 両者を同一 three シーンに置いて奥行き合成 (字幕が背景の中に埋まる/奥で隠れる) を可能にする。
- 制約: 書き出し(mp4/webm)は `t` の純関数で決定的であること。three 自身のクロックは使わない。

## 方針 (推奨アプローチ)
1. **three は別 offscreen canvas / 別 WebGLRenderer で動かす。** 既存GLコンテキストは共有しない (three の状態管理と `layerPass.draw` の `useProgram`/VAO前提が衝突するため)。結果をテクスチャとして既存パイプラインへ `texImage2D` で渡す。
2. **ブリッジは1つ: `SA.three3d`** (新規 `renderer/js/lyrics/three/scene3d.js`)。フレームごとに `render(project, t, beatStates)` → canvas を返す。シーン構成: 背景3Dオブジェクト群 + 3Dモード字幕トラックの文字メッシュ + 共通カメラ/ライト。
3. **3D字幕はパイプラインに2経路で接続**
   - 3Dモードの字幕トラックは既存の `pipeline.text()` 経路をスキップし、three で描画した RGBA を `targets.layer` に合成。
   - 同シーン合成のため、three 出力は「背景3D + 3D字幕」を1枚にした **scene3d レイヤー** として `layerPass.draw` の背景スロット (z順は background clips の後) に出す。2D字幕トラックは従来通りその上に重なる。
   - テキストマスク (`buildFrameTextMask`) は 3Dトラックでは three 出力のアルファから作る (knockout/frame post を壊さない)。2D専用機能 (deform, SDF縁取り, fill, letterBlur, representation) は3Dトラックでは無効化し UI でも非表示。
4. **グリフ→3Dメッシュ**: `lyrics/scene.js:meshOf(letter)` の `mesh.groups` (外周+穴) から `THREE.Shape` → `ExtrudeGeometry` (深さ・bevel をスタイルパラメータ化)。`mesh.scale` でpx換算、y反転、bbox中心に原点。文字×フォントでキャッシュ。フォールバック文字 (`letter.raster.contours`) も同じ経路。
5. **per-letter状態の適用**: `evaluateBeatState` の `result.letters[]` (x,y,z,rot,tiltX,tiltY,scaleX/Y,opacity,color 等) を Mesh の position/rotation/scale/material.opacity に写す。現在未使用の `state.z` を3Dモードで有効化し、tiltX/Y は実回転として扱う (2Dの擬似perspective 1200 と見た目が近づくよう FOV を合わせる)。
6. **three の同梱**: `package.json` devDependencies に `three` 追加、`scripts/vendor.js` の VENDORS に登録。現行 three は classic `three.min.js` が無いので、`<script type="module">` の小さなローダ (または esbuild で単一ファイル化) で `SA.THREE` を公開。CSP `script-src 'self'` のまま可。`LICENSES.txt` 更新。
7. **背景3D**: `layers.js` に `type: 'scene3d'` を追加 (`isVideo` と並ぶ分岐)。プリセット: 星空/トンネル/ワイヤーグリッド地形/浮遊ジオメトリ。音声解析 (`audio-driver`) 値でカメラ・色を駆動可能に。
8. **UI**: `studio/layers-dialog.js` に scene3d レイヤー追加、字幕トラックのインスペクタ (`studio/inspector.js`) に「3Dモード」トグル + 押し出し深さ/ベベル/ライト/カメラ。`i18n.js` に文言追加。プロジェクト保存形式 (`project.layers`, track プロパティ) とマイグレーション (`studio/project.js`) を更新。
9. **フォールバック**: three/WebGL 初期化失敗時は 3D を無効化し 2D経路のまま継続 (`canvas2d-fallback.js` 経路と同様に壊さない)。

## 2D/3D の切替単位: キュー (トラック既定 + キュー上書き)
- `style.mode3d` (`'2d'|'3d'`, 既定 `'2d'`) を追加。`resolveStyle(project, "cue:<id>/beat:<id>")` (`studio/project.js:734`) の継承 (トラック→キュー→ビート) にそのまま乗せる。
- `renderFrameExtended` の `activeBeats` 構築時に `style.mode3d==='3d'` のビートを three 側へ振り分け、2Dビートは従来経路。同時刻に混在可。2Dキューは常に three 出力の手前。
- インスペクタに「2D/3D」スイッチ (トラック既定 + キュー単位の上書き)。3Dキューでは 2D専用項目 (deform/SDF縁取り/fill/letterBlur/representation) を無効表示。
- 3D文字の寿命はキュー内に収まるため、モード切替時の状態引き継ぎは不要。

## 主な変更ファイル
- 新規: `renderer/js/lyrics/three/scene3d.js`, `three/glyph-geometry.js`, `three/loader` (module), `renderer/vendor/three*.js`
- 変更: `package.json`, `scripts/vendor.js`, `renderer/studio.html` (script追加)
- 変更: `renderer/js/lyrics/engine.js` (`renderFrameExtended` に 3Dトラック分岐・scene3d描画・マスク生成), `gl/layers.js` (scene3d 分岐), `studio/layers-dialog.js`, `studio/inspector.js`, `studio/project.js`, `i18n.js`, `video-export.js` (prepareFrame で scene3d を `t` に同期)
- 再利用: `SA.lyricsScene.meshOf`, `SA.motion.evaluateBeat`/`evaluateBeatState`, `layerPass.prepare/draw` の仕組み, `buildFrameTextMask`

## 検証
- 単体: `scripts/test/` に純関数テスト追加 (glyph→Shape変換、状態→Mesh変換、スキーマ移行)。既存の `text-mask.test.js` 流儀 (純ヘルパー + シェーダ/配線の文字列検証)。`npm test`, `npm run check`。
- 実機: `npm start` で Electron 起動 → 3Dレイヤー追加、字幕トラックを3Dモード化、プレビューで再生/シークして描画を確認 (スクリーンショット)。
- 決定性: 同一 `t` を2回書き出して同一フレームになること、mp4 書き出しで 3D背景+3D字幕が出ること。
- 退行: 3Dモード未使用プロジェクト (`renderer/data/showcase.json` 等) の表示が変わらないこと。WebGL失敗時のフォールバック。

## 段階 (推奨実装順)
1. three 同梱 + scene3d 背景レイヤー (プリセット2つ) + 書き出し決定性
2. グリフ押し出しメッシュ + 字幕トラック3Dモード (単独)
3. 同一シーン合成 (奥行き隠蔽) + マスク連携 + 音声駆動
