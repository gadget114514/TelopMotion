# 進捗と引き継ぎメモ（P1–P6 完了）

このファイルはセッションをまたぐ引き継ぎ用です。仕様の本体は `doc/app-design.md`。実装はフェーズごとに1コミットです。

## 完了フェーズ

| Phase | コミット | 内容 |
|---|---|---|
| P1 Foundation | `ecacbac` | `scripts/check.js`、`npm test`、`renderer/js/format.js`、`renderer/js/platform.js`、`suno.js` の platform 経由化、`app.js` web モード、CSP、`.nojekyll`、Pages workflow |
| P2 Canvas card | `c5982ce` | `card/palette.js`、`card/canvas-card.js`（16:9/9:16、Path2D アイコン、OffscreenCanvas）、`file:save`/`image:fetch` IPC、分割保存ボタン、DOM snapshot 一式削除 |
| P3 SRT/script/tween | `b9de9a8` | `srt.js`、`script-gen.js`、`color.js`、`lyrics/rng.js`、`lyrics/easing.js`、`lyrics/tween.js` ＋ テスト6本とフィクスチャ |
| P4 Studio shell | `f0af872` | `studio.html`/`css`、`studio/project.js`、`store.js`、`io.js`、`menu.js`、`app.js`、`file:open`/`studio:open`/autosave/recent IPC、IndexedDB ハンドオフ、`studio.*` i18n 5言語 |
| P5 Text → vector → GL | `f060363` | `lyrics/font.js`、`lyrics/geometry.js`（+テスト）、`lyrics/scene.js`、`lyrics/gl/{context,shaders,passes}.js`、`lyrics/engine.js`、`lyrics/canvas2d-fallback.js`、`studio/preview.js`（トランスポート）、`asset:read` IPC、`scripts/vendor.js`＋`renderer/vendor/`、`renderer/fonts/`（OFL 7書体）、音声読込・同期、フォールバックバナー |
| P5b Restructure → beats | `e2b81d8` | `lyrics/textflow.js`（+テスト16本）、Beat モデル、エンジンのビート描画、`studio/timeline.js`（キャンバス製タイムライン＋ビート副ブロック）、インスペクターのビート編集と「速すぎ」警告、`\N`/`\P`/`\h` |
| P6 Motion system | `c2389d0` | `lyrics/layout.js`（+テスト12本）、`lyrics/motion.js`（+テスト16本）、`effects/{registry,animation,layout,enter,exit,hold,location}.js`（全66タイプのCPU実装）、状態テクスチャの4行目（deform）と頂点/フラグメントの変形・ワイプ、オーバーライド/キーフレーム解決、horizontal/vertical の自動判定 |
| P7 Shaders | `9c164c8` | `gl/sdf.js`（jump flooding）、`gl/passes.js` のフルパイプライン（MRT テキストパス／SDF／fill／edge／post／bloom／背景／commit）、fill 13・edge 7・post 36・background 6 の各シェーダと REP（stroke/pieces/particles）表現、`effects/{fill,edge,post,background,color}.js`（ユニフォーム解決つき記述子、+テスト8本）、状態テクスチャ5行目（represent/reprProgress/colorMix/seed） |
| P8 Inspector and manual editing | `15348dc` | `studio/controls.js`（number/select/bool/vec2/color/text/ease/points/font の生成器）、`studio/inspector.js`（パンくず、Cue/Beat/Transform/Text/各効果グループ/Color のセクション、◆ キーフレーム、override マーカー＋↺、orphan 警告）、`studio/overlay.js`（選択クアッド、8ハンドル＋回転、ドラッグで移動/回転/スケール、スナップ、ガイド、`layout.path` の点編集）、store の `setStyleProp`/`setKeyframe`/`deleteKeyframeAt`/`discardOrphans`/`setAutoKey`、editCueText の orphan 剪定（overrides+keyframes）、View→Auto key |
| P9 Timeline | `9c398da` | `studio/timeline.js` 全面改訂: ルーラー／オーディオ波形（`preview.getPeaks` のデコード）／キュー行（twisty・移動・トリム・スナップ）／エレメントレーン（path×prop ごとのキーフレームトラック、ドラッグ・ボックス選択・コピー/ペースト・ease・削除）、マーカー、フレーム単位スクラブ、＋プロパティ、`preview.js` のピーク計算、i18n 5言語 |
| P12 Polish（部分） | （このコミット） | i18n: Motion パネルのラベルを5言語化し、スタジオのスモークがメニュー／`data-i18n`／タイムライン／インスペクター／プロパティ選択を全言語で走査して**欠落0**。README 刷新（Studio 概要＋`snapshot/studio-overview.png`、効果グループ、テキスト再構成、書き出し形式、Web 版と Pages 設定、フォントライセンス、テスト一覧）。`npm run dist` で NSIS/Portable（約115MB）を生成し、`dist/win-unpacked` のパッケージ版で `SA_SMOKE_LYRICS` を実行（asar 内フォント・vendor 読込、ベクター描画、音声同期、glError 0）。のちに `npm run dist` を再実行し、パッケージ版の `SA_SMOKE_EXPORT`（MP4+AAC / WebM+Opus / 透過PNG-ZIP、glError 0）も確認 |
| P10 Color and random | `（P10 のコミット）` | `lyrics/presets.js`（14プリセット）、`lyrics/random.js`（seed/locks/intensity/allowTags/avoidRepeats・fit ルール・MotionDef ランダム化・色生成、`randomize` は純関数で determinism テスト付き）、`studio/colors.js`（SV+色相ピッカー、グラデーションエディタ、6組み込み＋自作パレットの localStorage 保存と JSON 入出力、カードテーマエディタ）、Generate メニューの Random style・Random settings・Re-roll・Apply preset、Output→Card theme、Settings→Palettes、inspector の色/グラデーション接続 |
| P11 Export | （このコミット） | `js/video-export.js`（`VideoEncoder`/`AudioEncoder`、MP4 avc1.640028/2A→Main、WebM vp09→vp8、AAC→Opus、StreamTarget/ArrayBufferTarget、進捗とキャンセル、透過はストア方式 ZIP の PNG 連番）、`js/studio/export-dialog.js`（形式・解像度・fps・ビットレート・音声・透過・品質、進捗/ETA/キャンセル）、`file:stream-*` IPC と `platform.openStream`（Web は File System Access API）、Ctrl+E、`export.*` i18n 5言語 |
| P10c（コア） | （このコミット） | `lyrics/duration.js`（§7.17: 自然長＝キュー/クレジット終端、`output.maxDuration`、overflow=compress/drop/cut。compress は MIN_CUE を守るよう係数スケール、drop は手動/カスタムを保護し低優先（stat→song→bronze→silver→gold→completion）から削除、cut は厳密に最大長。キーフレーム/マーカーもスケール）、`lyrics/fillers.js`（ギャップ検出: intro/interlude/outro、minGap/margin、longGap で shapes、クリップのピン留め）、`lyrics/credits.js`（{title}/{artist}/{handle}/{extra}/{year} テンプレート、element/always/end モード、`extendsDuration`）、`lyrics/audio-analysis.js`（自前 radix-2 FFT、128 対数バンド＋Hann 窓、attack/release 平滑、512 波形、ステレオ平均、`bandPeak`/`dominantBandForFrequency`、決定的）。書き出し範囲に `SA.duration.computeDuration` を適用、スクリプト生成後に `maxDuration` を反映。テスト9本。加えて Generate ダイアログに「最大長/超過時（compress/drop/cut）」を追加して `store.commands.setOutput` で保存、タイムラインに最大長マーカー（オレンジの破線）を表示。書き出し範囲は `computeDuration` に従う。※トラックUI・音声リアクティブ効果は未実装 |
| P10b（コア） | （このコミット） | `lyrics/gl/layers.js`（追加型の GL パス: テクスチャ/単色クアッド、`fitRect`（cover/contain/stretch/actual）、normal/add/multiply/screen ブレンド、不透明度、角丸 SDF、位置/拡大/回転、`SA.platform.loadImage`＋`createImageBitmap` による遅延テクスチャ読込・キャッシュ、`preload`）。エンジンは `state.project.layers` を読み、背景レイヤーは最初の有効ビートの背景描画直後に1回、前景レイヤーは `commitLayer` 直後に1回描画（既存パスに手を入れない追加のみの実装）。`studio/layers-dialog.js`（Settings→Layers…: 追加/削除/並び替え、単色/画像、画像はファイル選択または URL、スロット、ブレンド、フィット、不透明度、角丸、位置/拡大/回転、適用で1コマンド）、`layers.*` i18n 5言語、書き出しも同一エンジン経由。スモーク `SA_SMOKE_LAYERS`（背景=緑、前景=赤PNGがテキスト上に合成、単色前景=青、解除で復帰、glError 0）と `fitRect`/`parseColor`/スタブGL のテスト3本。続けて **動画レイヤー**: `<video>` をテクスチャとして更新（同一フレームは再アップロードしない）、プレビューは再生＋0.3秒超のドリフト補正、書き出しはフレーム毎に `currentTime` をシークして `seeked` を待つ決定的方式（`prepareLayers(t, { playback: 'export' })` を書き出しループが await）。編集ダイアログに動画タイプ（速度/オフセット/プレビュー再生、ローカル動画はセッション用 blob URL）、`layers.*` の動画キー5言語。スモークは canvas から WebM を録画して動画レイヤーを合成（videoMarker 緑・glError 0） |
| P10c（音声リアクティブ） | （このコミット） | `lyrics/audio-driver.js`（`{ audio: { band: 'low'|'mid'|'high'|'rms'|番号, gain, offset, min, max } }` 形式のパラメータを描画時に数値へ解決。`resolveStyle` は単一/スタック両グループを走査し入力を破壊しない。`reactiveParams` で一覧取得）、プレビューが音声デコード時に `audio-analysis`（自前FFT）を実行して `renderer.setAudio` で共有（書き出しエンジンも同じ解析を使用）、`studio/audio-dialog.js`（Settings→Audio reactive…: 選択スコープの数値パラメータに ♪ で帯域/量をバインド、× で解除、適用は1コマンド）、`audio.*` i18n 5言語。スモーク `SA_SMOKE_AUDIO`（2秒WAV: 前半440Hz/後半無音 → アウトライン幅を rms で駆動、loudInk 3972 vs silentInk 857 = 反応を確認、glError 0）とテスト6本 |
| P10c（仕上げ） | （このコミット） | フィラー/クレジットの仕上げ: `gl/shapes.js` の uniform 名修正とフォントメッシュのキャッシュ（`geometry.bucket` スケール・raster 文字対応）、`filler-render.js` に型/パラメータ記述子（`types`/`paramsOf`/`paramDefaults`/`defaults`）、`engine.js` の `renderFillerAndCredits` を本配線（`renderFrameExtended` から呼び、`always` は前景レイヤーの後に描画、クレジットの二重描画を防止、`shapesPass` の dispose/capture も）、`preview.duration` を `SA.duration.computeDuration` に統一、タイムラインにフィラー行/クレジット行（ピン留め表示、選択、右クリックでピン・型変更・種類へ適用・編集）、`studio/credits-dialog.js`（Generate→Credits…: ソース/テンプレート/3モード/プレビュー）、インスペクターのフィラーセクション（型・パラメータ・ピン・ギャップへ移動）とクレジットセクション（モード別編集）、store の `fillers`/`credits` エリアと `setFillers`/`setFillerClip`/`setCredits`、`filler.*`/`credits.*` i18n 5言語、`SA_SMOKE_FILLERS`（shapes/countdown のインク、`sineWave` ピンの追随、element/always/end の描画、行とインスペクター、glError 0） |
| P10b（UI 仕上げ） | （このコミット） | レイヤーの UI 一式: `layers-dialog.js` に開始/終了（`start`/`end`、未設定=∞）、動画ループ、enter/exit モーション（type/duration/delay/ease/params）、フィルター（色収差/rgbShift/グリッチブロック、パラメータ付き）、ブレンド 9 種追加（overlay/softLight/hardLight/lighten/darken/difference/exclusion/colorDodge/colorBurn）。`gl/layers.js` は `evaluateLayerMotion`（enter/exit 効果の CPU を単一要素へ適用、純関数）、ブレンドは `copyTexImage2D` で背景を退避してシェーダ合成（GL 固定機能で不能な mode 用）、フィルターはレイヤー自身のテクスチャへ FRAG 内で適用、動画時間は `(t−start)·speed+trimIn` を loop/trimOut でラップ。エンジンは `draw(layers, viewport, t)` に時刻を渡し、ビートが無いときも前景レイヤーを描画。タイムラインは前景レイヤー行（キュー行の上）と背景レイヤー行（下）を描画し、目アイコンで有効切替・ドラッグ移動・端トリム・選択・右クリックメニュー（表示/隠す・編集・削除）。インスペクターにレイヤー要約セクション。Media パネルは Info/Video/Audio タブになり、動画の読込（1秒位置のサムネイル付き）、背景/前景レイヤーへの追加、タイムラインへのドラッグ&ドロップ、音声タブに波形＋スペクトログラム（`audio-analysis` の 128 バンドと peaks を使用）を表示。store は `layers` エリアと `setLayers`/`setLayer`/`addLayer`/`removeLayer` を追加。`layers.*`/`studio.media.*` i18n 5言語。スモーク `SA_SMOKE_LAYERS` にモーション（フェード/時間窓）、カスタムブレンド（difference で緑+青=シアン）、フィルター（glError 0）、タイムライン行、レイヤー選択のインスペクター、Media パネルの動画追加を追加。テストは `evaluateLayerMotion`/`blendCode`/`filterState`/`videoTargetFor` を追加 |
| P13 Studio-first + lyrics files | （このコミット） | **Studio をメイン**に: Electron の起動ページを `studio.html` に変更（スモークは従来どおり index 起点、`SA_SMOKE_HOME` のみ Studio 起点）。Suno JSON なしでも開始できるよう welcome に「データなしで始める」を追加（`welcomeDismissed`、再読込で復帰）し、空プロジェクトのまま手動編集・取込できる。**リリック取込 SRT / LRC / JSON**: `js/lrc.js`（`[mm:ss.xx]`/`[h:mm:ss.xx]`、複数タグ、メタ `ti/ar/al/by/offset/length`、offset 適用、テキストなしタグ=インストマーカー、enhanced `<mm:ss.xx>` を `cue.words` に保持、終端=次のタグ・最終行は読了時間）、`js/lyrics-json.js`（配列 / `cues` / Whisper `segments` / `lines`、`start|startTime|from|time`＋`end|endTime|to|duration`、秒・`mm:ss.xx` 文字列・ms 自動判定と `unit`、words 配列）、`js/lyrics-file.js`（拡張子→内容スニッフの検出と振り分け、Studio プロジェクト判定）。`io.readLyrics`/`io.exportLyrics` と File/Output メニュー（Export lyrics → SRT/LRC/JSON）、タイムラインに「キューを追加」（データなしでも作成可）、`lyrics.*` トースト i18n 5言語。**Achievement は従**に: Studio の File →「TelopMotion（静止画）…」で `home:open`（Electron は `?home=1`＋データ受け渡し、Web は IndexedDB ハンドオフ）、カード側はデータが無くても Studio を開ける。utils: `preload.openHome`、`platform.openHome`。テスト3本（lrc / lyrics-json / lyrics-file）、`SA_SMOKE_HOME` |
| P12 仕上げ | （このコミット） | `studio/fx-strings.js`（効果タイプ 140・パラメータ 152・select 値 49 を 5 言語、`i18n.registerStrings` で `DICT` にディープマージ）、`controls.valueLabel`（新設）と inspector の align/direction/stagger order/unit の統一、`scripts/test/fx-i18n.test.js`（全タイプ・全パラメータ・全値 × 5 言語＋言語間キー一致）、`SA_SMOKE_STUDIO` に `fxLabels` を追加。`SA_SMOKE_SHOT` で `snapshot/studio-overview.png` を再生成（WebGL プレビューは `captureRGBA` で合成）。Media パネルの `[hidden]` CSS バグ（3 ペイン常時表示）を修正 |

## 検証コマンド

```bash
npm run check                       # lib/, scripts/, renderer/js/ + main.js/preload.js、vendor は除外
npm test                            # 170 tests（node --test の glob 指定）
npm run vendor                      # node_modules → renderer/vendor/ の UMD と LICENSES.txt
SA_SMOKE=1 npx electron .           # 基本フロー（@suno 取得、32バッジ、5言語）
SA_SMOKE=1 SA_SMOKE_SNAPSHOT=1 SA_SNAPSHOT_LANG=en npx electron .
                                    # 両アスペクトのカードを %TEMP%/suno-card-smoke-16x9.jpg / 9x16.jpg に出力
SA_SMOKE=1 SA_SMOKE_STUDIO=1 npx electron .
                                    # Studio: ハンドオフ、メニュー、undo/redo、台本生成、autosave 復元、studio i18n（data-i18n も検査）
SA_SMOKE=1 SA_SMOKE_LYRICS=1 npx electron .
                                    # P5: フォント読込→O/8/A/あ/愛 を描画（穴あきの画素検査・gl.getError）、
                                    #     音声マスタークロックの同期（delta）、WebGL2 無効時のバナー
                                    #     %TEMP%/suno-lyrics-smoke.png にフレームを出力
SA_SMOKE=1 SA_SMOKE_BEATS=1 npx electron .
                                    # P5b: 英日ページ分割、longHold repeat、recap、tooFast 警告、
                                    #     ビートの端ドラッグ→pin→再構成で維持、分割/統合/undo、
                                    #     repeat/recap のフレームを描画。%TEMP%/suno-beats-smoke.png と
                                    #     %TEMP%/suno-studio-smoke.png（タイムラインとインスペクター）
SA_SMOKE=1 SA_SMOKE_MOTION=1 npx electron .
                                    # P6: circle/vertical/wave/spiral/grid/stackedWords/scatter/path/hold の
                                    #     9スタイルを描画し、NaN なし・インクあり・gl.getError=0 を確認。
                                    #     %TEMP%/suno-motion-{m_circle,m_vertical,m_path}.png を出力
SA_SMOKE=1 SA_SMOKE_SHADERS=1 npx electron .
                                    # P7: fill 13 / edge 7 / post 36 / background 6 / 表現4 の全タイプを
                                    #     1フレームずつ描画し、gl.getError=0 とインクを確認（SDF は float target 必須）。
                                    #     %TEMP%/suno-shader-{chrome,fire,glitch,card,particles,bounce}.png を出力
SA_SMOKE=1 SA_SMOKE_EDIT=1 npx electron .
                                    # P8: 文字を選択→ドラッグで scale/rotate、nudge で移動が override になる、
                                    #     override マーカー/リセットの数、キーフレーム2点で位置が変わる、undo、
                                    #     テキスト短縮で orphan が増える+警告行。%TEMP%/suno-edit-smoke.png を出力
SA_SMOKE=1 SA_SMOKE_TIMELINE=1 npx electron .
                                    # P9: キュー移動/トリムと SRT 反映、スプリット/マージ、マーカー、
                                    #     ＋プロパティでキーフレーム追加→ドラッグ→コピー/ペースト→ease→削除、
                                    #     スナップ（秒/フレーム）、WAV を読み込んで波形ピーク生成（188 ブロック）。
                                    #     %TEMP%/suno-timeline-smoke.png を出力
npm run dist && "dist\win-unpacked\TelopMotion.exe"   # パッケージ版（SA_SMOKE=1 などを付けて検証可）
SA_SMOKE=1 SA_SMOKE_RANDOM=1 npx electron .
                                    # P10: 14プリセット適用、seed 固定の再現性、Re-roll、ロック、
                                    #     手動 override 不変/上書き、パレット往復、グラデーション描画
SA_SMOKE=1 SA_SMOKE_EXPORT=1 npx electron .
                                    # P11: MP4(avc1.640028)+音声 / WebM(vp09)+音声 / 透過PNG-ZIP を
                                    #     %TEMP%/suno-export-smoke.{mp4,webm,zip} に出力しマジックを確認
SA_SMOKE=1 SA_SMOKE_FILLERS=1 npx electron .
                                    # P10c: フィラー（shapes/countdown）とクレジット（element/always/end）を
                                    #     描画してインク量を比較（none との差・要素/常時の表示・エンドカード）、
                                    #     ピン留めがキュー移動に追随、タイムラインのフィラー/クレジット行、
                                    #     インスペクターの両セクションを確認。%TEMP%/suno-fillers-smoke.png を出力
SA_SMOKE=1 SA_SMOKE_HOME=1 npx electron .
                                    # Studio-first: 起動ページが studio.html、データなしプロジェクト、
                                    #     welcome の「データなしで始める」、LRC/Whisper JSON/SRT の取込と
                                    #     ビート生成・プレビュー描画（ink>0, glError 0）。
                                    #     そのまま index.html に遷移して既存の基本フローも検証する
SA_SMOKE=1 SA_SMOKE_SHOT=1 npx electron .
                                    # README 用スクリーンショットを snapshot/studio-overview.png に再生成。
                                    #     WebGL プレビューは preview.captureRGBA をページ画像へ合成する
```

ヘッドレス web 検証（P1/P2/P4/P5 で使用。スクリプトは temp に都度作成して削除）:
1. `http.createServer` で `renderer/` を配信（例: 127.0.0.1:8123）
2. preload なしの `BrowserWindow`（`contextIsolation: true, sandbox: true`）で `http://127.0.0.1:8123/index.html` を読む
3. `SA.app.importFile(new File([JSON], 'x.json'))` → `#btn-studio` クリック → `studio.html#handoff` へ遷移
4. `SA.scriptGen.build` → `store.commands.generateScript` → `SA.preview.captureRGBA(t)`、`SA.lyricsFont.load`、`console-message` のエラー0 を確認（P5 では fonts の fetch 読込と WebGL 描画、P5b では `project.beats` の生成・タイムライン canvas のサイズ・描画を確認済み）

注意: `SA_SMOKE_STUDIO` は `studio.html` へ遷移するため、`SA_SMOKE_ERRORS` と同時に使うと ERRORS が Studio ページ上で走る（順序の都合。片方ずつ使う）。`SA_SMOKE_LYRICS` は最初にウィンドウを可視化（透明）して rAF を動かす（音声同期の計測のため）。

## 実装上の決定・仕様との差分

- **check 対象**: 仕様の3ディレクトリに加えて `main.js` / `preload.js` も対象（旧 check の範囲を維持）
- **test コマンド**: `node --test "scripts/test/**/*.test.js"`。Node 24 + Windows ではディレクトリ引数が壊れるため（doc §2 更新済み）
- **ドキュメント修正**: §7.11–7.17 の番号整理、§14/§15 入れ替え、elementPath 文法（beat 必須）、`evaluateBeat` に統一、`srt.parse` は `{cues, warnings}`、spans に `underline` 追加、フォントは `asset:read` IPC 方式、VP9 alpha は best-effort、`preserveDrawingBuffer` 注意、`previousCue` は end 時刻で再評価、es/fr/ru は v1 フォールバック
- **Tween**: 33 カーブ + `hold`（`names.length` は 34）。`tween.value(kind,a,b,p,ease)` / `tween.segment(track,t)`。色は OKLab。Elastic の定数は `2π/3` と `2π/4.5`（= 仕様の period 0.3 に相当）
- **Color**: Oklab の `a` 軸と alpha の名前衝突を避けるため、`rgbToOklab` は `{L,a,b,alpha}` を返す
- **カード**: snapshot.css の実測値に一致。9:16 はヘッダー 580
- **アイコン**: 11個を `Path2D` 化
- **handoff**: Web は IndexedDB、Electron は `studio:open` → `studio:data`
- **autosave / recent / レイアウト永続化**: 既存どおり（Electron は userData、Web は IndexedDB / localStorage）
- **P5 のテキスト経路（決定）**:
  - フォントは `renderer/fonts/` の OFL 静的書体（OFL.txt / SOURCES.md 同梱）。`SA.lyricsFont.load` は `SA.platform.readAsset` → `opentype.parse`。`NotoSansJP-*` はテキストに CJK があるときだけ追加読込（フォールバック: 選択書体 → NotoSans → NotoSansJP → ラスタ文字）
  - **opentype.js v2 の注意**: `font.getPath(text)` / `font.stringToGlyphs` は NotoSans の GSUB (substFormat 2) で例外になるため使わない。1文字ずつ `glyph.getPath(0, 0, size)` を使う（カーニングは `getKerningValue`）
  - ラスタ文字は 256px の 2D 描画 → 境界の画素辺をたどって輪郭化 → Douglas-Peucker(0.75px)。穴は `groupContours` の偶奇判定で処理
  - `layoutText` は横組み（折返し・align・カーニング）と縦組み（縦置換・tate-chu-yoko）に対応。禁則は P5b の textflow で本格化
  - ジオメトリは bucket 単位（`bucket(size)=round(log2(size)*4)`）でキャッシュし、実サイズへスケール
- **GL（P5 の範囲）**: コンテキスト（WebGL2 + `EXT_color_buffer_float` 検出）、文字パス（メッシュ＋レター状態テクスチャ RGBA32F 4行＋色テクスチャ RGBA8）→ `textRT` → 合成。SDF/フィル/エッジ/ポスト/背景/パーティクル/モーフは P7
  - 属性ロケーションは `bindAttribLocation` で 0/1 に固定。状態テクスチャは「行ストライド = レター数」で詰める（容量と別）
  - ビートごとの `scene` は `(cueId, beatId, text, style, aspect, fonts)` でキャッシュ。メッシュは scene の不変オブジェクトに遅延構築
  - キャンバスの drawing buffer は `createEngine` で出力サイズに設定（リサイズ時も追随）
- **プレビュー/トランスポート**: `studio/preview.js` が再生・シーク・前後キュー・ループ・速度（0.25–2×）・時間入力・プレビュー倍率（Auto/Full/Half/Quarter、Auto は 30 フレーム平均 >20ms で 0.5→0.25）を担当。`app.js` の再生ロジックは撤去して preview に委譲
  - 音声は `<audio>` がマスタークロック（`File → Import audio…`、実行時のみの blob URL。P10c で media storage に置き換え）。音声が無い/開始できないときは `performance.now()`
  - 既定のアンカーはブロック中心をフレーム中心に置く簡易版（Location グループの `center` 相当。P6/P7 で本実装に置換）
  - WebGL2 が無いときは `canvas2d-fallback.js`（Path2D 塗り・縦回転）＋ バナー `studio.warn.noWebGL`。`?no-webgl2=1` / `#no-webgl2` で強制フォールバック（検証用）
  - `engine.captureRGBA()` は検証用（readPixels → 上下反転）。`SA.preview.captureRGBA(t)` 経由
- **vendor**: `npm run vendor` が opentype.js / earcut / mp4-muxer / webm-muxer の UMD を `renderer/vendor/` へコピー（LICENSES.txt 同梱、コミット対象）。studio.html は opentype/earcut のみ読み込む（muxer は P11）
- **P5b のテキスト再構成（決定）**:
  - `lyrics/textflow.js` は純モジュール。`measure(text, size)` を注入でき、テストは固定幅の擬似測定、実機は `SA.lyricsFont.measureLine`（アクティブフォントは `SA.lyricsFont.setActive`、プレビューが読込後に設定）＋推定フォールバック。計測はメモ化
  - 行分割は DP（slack² バランス + 改行ペナルティ + 文末ボーナス）。`。、` 後の改行、助詞後、字種変化、禁則（行頭/行末）、数詞＋助数詞の不可分、英語の冠詞/前置詞/結合詞、記号直前の不可分に対応。ページは「文末優先」の DP
  - 時間割り当ては既定で仕様どおり cueDur 比例（`minPageDuration` で下限・足りなければ圧縮して `tooFast` 警告）。`longHold.mode` が repeat/pulse/filler で自然長より閾値以上長い場合は自然長で置き、残りを repeat/pulse に使う
  - repeat は interval ごとにページ列を再演（kind `repeat`、cycle 番号付き）。pulse は kind `emphasis`（テキストなし。動きは P6）。filler は末尾を自然長で止める（フィラー本体は P10c）
  - recap は `mode=end|both` で末尾に時間を予約し、`duration:'auto'`=max(1.5, 0.5×読了時間)、`maxLines`/`fontScale:'auto'` で全文を再レイアウト。エレメントパスは `cue:<id>/beat:<cueId>:recap0`（P4 で統一した beat 付き文法）
  - pin されたビートは再構成で保持（テキストが本文に含まれる場合）。含まれなくなったら `project.orphanBeats` へ
  - **gather 遷移は未実装**（P6 の layout `previousCue` 待ち）。recap は通常のビートフェードで表示し、`transition:'gather'` はビートに記録だけする
  - エンジンのビート表示は暫定のフェード（beat 端で min(0.25s, 1/3) のランプ）。P6 の MotionDef 評価に置き換える
  - タイムラインは P9 の本実装までの最小版: キャンバス＋ルーラー＋キュー行＋ビート副ブロック＋再生ヘッド、ズーム（10–800 px/s、localStorage 保存）、Fit、ビート端ドラッグ（隣接ビートと同時に伸縮・pin）、ダブルクリックでテキスト編集、右クリックメニュー（pin/分割/統合/再構成/複製/削除）、Shift+ホイール横スクロール・Ctrl+ホイールズーム。キーフレームレーンやスナップは P9
- **P6 のモーション（決定）**:
  - 「`lyrics/motion.js`」はモジュール名 `SA.motion`（純モジュールは `SA.*` 接頭辞なしの既存規則に合わせた）。`lyrics/layout.js` は `SA.layout`、効果は `SA.fx` にグループ別ファイルで登録（`effects/{registry,animation,layout,enter,exit,hold,location}.js`。fill/edge/post/background/color の実体は P7）
  - **タイプ数**: enter 19・exit 14・hold 15・animation 8・location 10（仕様の 9 + custom）・layout 12 フォーメーション。すべて descriptor（params/tags/cost/cpu）を持ち、テストで全タイプを NaN なしで評価
  - `StyleSet` に無いグループはレジストリの既定（enter=fade 0.5s、exit=fade 0.4s、layout=row、location=center、animation=stagger 0.035s ltr）を使う。`Animation` の params（order/each/ease/from/unit/exitOrder）は `motion.stagger` より優先
  - **場所・座標**: フォーメーションはブロック中心を原点とする相対座標を返し、Location のアンカー（フレーム px）+ オフセットで世界座標になる。スタックは後続ビートの数×行高を加算（`stacked` 用に engine が `stackOffset` を渡す）
  - **previousCue / morphFromPrevious**: engine が直前ビートの scene を作り、end 時刻で再評価した位置を `previousPositions` として渡す（P5b で保留した gather もこの経路。recap の gather は P7 の morph/particle 実装で仕上げる）
  - **P7 に送る近似**（CPU では状態値を正しく出し、見た目は P7 のパスで完成）: blurIn/blurOut のボケ、dissolve/burnAway/noiseDissolveIn のノイズ閾値、glitch 系の RGB 分離、neonGlow/bloom、particles/shatter/stroke の各表現、scramble のランダム文字置換（現在はジッター＋点滅）、typewriter/strokeDrawOn のワイプは mesh の visibleFrac クリップで表現（stroke リボンは P7）
  - **deform**: hold の jelly/wobbleWarp/twist/breathing/melt は状態テクスチャ4行目（type/amount/time/param）に載せ、頂点シェーダで適用。複数の deform は先頭のみ（P7 で拡張）
  - **オーバーライド/キーフレーム**: `motion.applyOverrides` が cue→beat→line→word→letter を解決（親レベルは親中心まわりの回転、位置は加算、scale/opacity は乗算）。キーフレームは変換を加算・乗算、`<group>.params.*` は効果パラメータを置換、`color.fill` は `colorMix`（実色は P7）
  - **vertical 自動判定**: `style.layout.type === 'vertical'` のとき scene を縦組みで作り直す（`scene.buildScene(project, beat, fonts, {direction})`）。縦フォーメーションは列を右→左、ASCII は `vertRotate` で 90° 回転
- **P7 のレンダリング（決定）**:
  - パイプラインは `gl/passes.js` の `createPipeline`（シェーダが1つでもコンパイル失敗したら `null` を返し、エンジンは P5 の簡易テキストパスへフォールバックする。フォールバックは表現/フィル/ポストなし）
  - **MRT**: テキストパスは `location=0` = premultiplied カラー、`location=1` = `(idLo, idHi, u, v)`。マスクはカラーの alpha。状態テクスチャは **5行**（仕様の4行＋P7 の `represent/reprProgress/colorMix/seed`）
  - **SDF**: jump flooding（seed → log2 ステップ → resolve）を half 解像度 RG16F で。`EXT_color_buffer_float` が無いと SDF が nil になり、fill は基本色・edge はスキップ（バナーではなく通常表示）
  - **fill 13種**: 1シェーダ内の分岐。gradientSweep/holographic/chrome/goldFoil/fire/caustics/marble/glass/textureFill（画像未指定時はテキスト色の屈折近似）/karaokeWipe。カテゴリ色・パレットは `effects/color.js` の `resolveColorSet` が解決
  - **edge 7種**: outline/neonGlow（bloom 連動）/innerGlow/bevel/extrude/longShadow/dropShadow。behind（外側 4 種）→ fill → top（bevel/innerGlow）の順に合成
  - **post 36種**: 1シェーダ内の分岐。`target: text` はビート層、`frame` は全ビート合成後に適用（タイプ毎にエンベロープ最大の1件へ統合）。temporal な実装が必要な motionBlur/echoTrail は単一フレーム近似、pixelSort/displacementMap/godRays/bloom も近似（**P12 の品質見直し対象**）
  - **bloom**: bright → 5ミップ down → additive up。neonGlow（bloom 有効時）と post の bloom/godRays で自動発動
  - **背景**: none/solid/noiseGradient/card/cover/image。card は `SA.card.draw` を OffscreenCanvas に描いてテクスチャ化し、badge キューのとき badgeRect をカメラでズーム（縦フリップ補正あり）。cover/image はメディア保存（P10c）まで card にフォールバック
  - **表現**: stroke（リボンの `a_s > visibleFrac` で discard）、pieces（三角形ごとに centroid から飛散＋スピン）、particles（interior サンプルの POINTS＋カール）。morph は直前ビートのサンプルを index 比例で再サンプルして source にする（仕様の atan2 対応付けは近似）
  - **blur**（blurIn/blurOut）は状態値のみで、描画は未実装（分離ブラーは後続）。`colorMix` も同様に状態のみ
  - シーンのキャッシュキーを「テキストスタイル」から「解決済みスタイル全体」へ変更（style 変更が即反映されるように）
- **P8 の手動編集（決定）**:
  - コントロールは `studio/controls.js` に集約（仕様の `controls/*.js` 分割は P10 の colors.js 追加時に必要なら再編）。色は hex 入力＋スウォッチ、グラデーションはテキスト入力（本格ピッカーは P10）、ease は 33 カーブの選択（カスタムベジェ編集は P10）
  - **編集スコープ**: cue 選択 → `cueStyles`、beat 選択 → `beatStyles`、line/word/letter → `overrides[path]`（`setStyleProp` / `setProp`）。`resolveStyle` の値を表示し、そのスコープに値があれば override マーカー＋↺
  - **override は入れ子**で保存（`overrides[path].transform.x`）。P8 で `setProp` が平坦キーを書いていたのを修正（motion の解決と一致）
  - キーフレームは propPath ごとの ◆ ボタン（playhead にキーがあれば ◆、無ければ ◇。値は解決済みスタイルから取得）。`setKeyframe`/`deleteKeyframeAt`
  - オーバーレイ: クリックでクアッド選択（`FrameInfo`）、ダブルクリックで1階層下る、Esc/↑で上がる、8ハンドル＋回転ハンドル、移動は中心/三分割にスナップ（6px、マゼンタ線）、パスは青色の点をドラッグ、Shift+矢印で10px nudge（選択があるときは素の矢印も nudge）
  - orphan 剪定: `editCueText` が `project.beats` の lines と Intl.Segmenter で line/word/letter の存在を判定し、無効な overrides/keyframes を `project.orphans[cueId]` へ移す（undo は overrides/keyframes/beats も復元）。インスペクターに「孤立した編集 N件／破棄」
  - `fx.*` のタイプ名とパラメータ名は i18n キーが無い場合キャメルケースを整形して表示（翻訳表の整備は P12）。インスペクターの主要 UI 文言は 5言語追加済み
  - 未実装（後続）: 複数選択・ボックス選択、スタイルのコピー/ペースト、コンテキストメニュー、他レターへの吸着、カスタムベジェ/スプリング編集 UI、アンカーの9点ピッカー
  - 注意: 合成 pointer イベントによる「移動ドラッグ」の検証は空の override になった（scale/rotate/nudge は成功）。実ポインタでの手動確認を P12 のポリッシュで行う
- **P9 のタイムライン（決定）**:
  - 行構成: ルーラー → オーディオ波形 → キュー行（左ガターに ▸ twisty・時刻・本文）→ 展開時は「エレメントレーン」（path × propPath ごとに1行、キーは ◆、値は cue/beat 始点からの相対秒）
  - キュー操作: 本体ドラッグで移動、左右端でトリム、スナップは 0 / 再生ヘッド / 他のキューの端 / マーカー / 秒 / フレーム（7px 閾値）。右クリックで分割・統合・複製・削除・再構成。ダブルクリックで本文インライン編集
  - スクラブ: ルーラー/波形のクリックとドラッグで `snapFrame`（1/fps）に量子化してシーク
  - キーフレーム: ドラッグ（フレームスナップ）、Shift+ドラッグでボックス選択、Ctrl+C/V、Del、右クリックで ease（hold＋33カーブ）/コピー/削除。ヘッダのプロパティ選択＋「プロパティ追加」で再生ヘッドにキーを追加（未設定プロパティは transform の既定値や descriptor の default を使う）
  - 波形: `File → Import audio…` した音声を `preview` が `AudioContext.decodeAudioData` でデコードし、512 サンプルごとの最大振幅をピークとして保持（エクスポート時も同じ配列）。タイムラインはそれを描画（Media パネルの波形 UI は P10c）
  - マーカー: ヘッダの「マーカー追加」で `project.markers` に `{t,label}` を追加（スナップ対象・旗を描画）
  - 未実装（後続）: in/out レンジのハンドル（P11 の書き出しレンジ）、最大長マーカー（P10c §7.17）、キー間の曲線プレビュー（現在は直線）、エレメントレーンのツリー折りたたみ（path×prop のフラット表示）
  - スモークのデータ取得を `SA.app` が無いページ（Studio 上で動くスモーク）でも動くようにフォールバック化
- **P12 のポリッシュ（決定）**:
  - i18n スモークを拡張: `#menubar`・`[data-i18n]`・`.timeline-head`（ボタン含む）・`#tl-prop option`・インスペクターの summary/label/ボタン/パンくずを全5言語で走査し、生キー（`a.b.c` 形式）が0件であることを確認。Motion パネルは入れ子の折りたたみにし、in/out・stagger・loop のラベルを5言語化
  - **fx.\*（効果タイプ・パラメータ）の翻訳表は未整備**: `SA.controls` がキャメルケースを整形して表示するフォールバックで生キーは出ない（P10 以降で翻訳表を追加する）
  - **注意（作業方法）**: 非 ASCII を含むファイルの一括置換を PowerShell の `Get-Content -Raw` + `WriteAllText` で行うと文字化けする（このセッションで i18n.js と inspector.js を破損→`git checkout` で復旧）。今後は Node スクリプトか edit ツールを使う
  - README は Studio 前提に刷新。動画書き出し（P11）は未実装のため「later phase」と明記し、画像/SRT/プロジェクトの形式のみ記載
  - `npm run dist`（NSIS + Portable, 約115MB）と `dist/win-unpacked` のパッケージ版スモークまで確認





- **Studio のプレースホルダ**: すべて解消済み（media/inspector/timeline の本編集 UI、random/presets は P10、動画書き出しは P11、フィラー/クレジットは P10c 仕上げ）
- **platform.js の未実装分**: media put/get のみ（P10c のトラック UI では未使用のまま）。`openStream`（P11）・`readAsset`/`loadImage`/`readFile`/`saveFile`/`openStudio`/autosave/recent は実装済み

## 主なファイル

- 共有: `renderer/js/{format,platform,suno,srt,script-gen,color}.js`
- カード: `renderer/js/card/{palette,canvas-card}.js`
- 純ロジック: `renderer/js/lyrics/{rng,easing,tween,geometry,textflow,layout,motion}.js`、`renderer/js/lyrics/{duration,fillers,credits,filler-render,audio-analysis,audio-driver}.js`
- 効果: `renderer/js/lyrics/effects/{registry,animation,layout,enter,exit,hold,location,fill,edge,post,background,color}.js`
- 歌詞エンジン: `renderer/js/lyrics/{font,scene,engine}.js`、`renderer/js/lyrics/gl/{context,shaders,sdf,passes}.js`、`renderer/js/lyrics/canvas2d-fallback.js`
- Studio: `renderer/js/studio/{project,store,io,menu,preview,timeline,controls,inspector,overlay,colors,layers-dialog,audio-dialog,credits-dialog,app}.js`、`renderer/studio.html`、`renderer/css/studio.css`
- アセット: `renderer/fonts/`（7書体＋OFL.txt＋SOURCES.md）、`renderer/vendor/`（UMD＋LICENSES.txt）
- テスト: `scripts/test/*.test.js`、`scripts/test/fixtures/{dataset.json,basic.srt,japanese.srt,fx.srt}`
- Electron: `main.js`（IPC: suno/cache/file:save・open/image:fetch/asset:read/studio:open・autosave/recent）、`preload.js`

## テーマと自動演出（このコミット）

**5軸のムード → テーマ生成 → 個別演出** の3層で自動演出する基盤。

- `renderer/js/lyrics/moods.js`（新規・UMD）: 軸 `speed / energy / softness / density / brightness`（0–1）と気分プリセット6種（ゆったりバラード/シネマティック/かわいいポップ/エレクトロ/激しいロック/和風・縦書き）。効果タイプを `[energy, softness]` の特性表＋制約フラグ（`maxLetters` / `needsPrevious` / `needsBadge` / `needsCard` / vertical）で持ち、軸への適合度の重み付き抽選でタイプを選ぶ。パラメータ（数値は中庸〜両端を避ける・select/bool/vec2/color）、モーション時間（speed軸）、stagger、配色（色相は自由、彩度/明度は brightness軸）、書体/サイズ/太さ/字間まで生成する純関数 `generate({axes, seed, direction, context})`（`rngFor` で決定的）。`randomAxes()`（プリセット＋揺らぎ）、`axesFromAudio(features)`（音楽から軸を推定）、`contextFor(project)`。
- `renderer/js/lyrics/audio-analysis.js`: `features(analysis)` を追加。平均RMS・ダイナミクス（分位差）・スペクトル重心（低域/高域比）・オンセット密度・**BPM（オンセット包絡の自己相関、30fps / 60–200 BPM）**。
- `renderer/js/studio/themes.js`（新規）: テーマ＝データ。内蔵14（既存プリセット）＋ユーザテーマを localStorage `sa.themes` に保存し、一覧/適用/複製/改名/削除/JSON入出力。`apply` は対象グループを**置換**（前テーマの残骸が残らない）、`capture` はテキスト込みで現在の見た目を保存。設定メニュー「テーマ…」と、生成メニュー「テーマを適用…」（内蔵/自分のテーマを optgroup で表示）。
- `renderer/js/studio/theme-editor.js`（新規）: テーマ編集ダイアログ。気分チップ／5軸スライダー／シード＋「軸をランダム」「音楽から」「5軸から生成」「別案を生成」、テキスト・全効果グループ・カラーの詳細手動設定（`SA.controls` のコントロールを再利用）、保存/適用。保存テーマには axes/seed/direction も入る。
- お任せボタンは `SA.moods` のテーマ生成＋キューごとの演出ランダム（`SA.random`、レイアウト/塗り/背景/縁/位置はテーマでロック）に変更。音声があれば音楽から軸を推定する。
- **バグ修正（重要）**: イージング名の不整合。`presets.js`・`random.js` が書いていた `easeOutCubic` 等は `easing.parse` の MAP に無く、**全プリセット/ランダムの ease が linear に落ちていた**。`easing.canonical` に別名解決を追加（既存プロジェクト互換）し、書き出し側を正規名（`cubicOut` / `quartOut` / `backOut` 等）に統一。`easing.test.js` に別名テストを追加。
- あわせて修正済み: タイムライン高さのクランプ（大きくしても player が隠れない）、`#preview-overlay` の透明化（プレビューが覆われて見えない）。

残り（テーマ関連）:
1. 個別演出の生成強化: 同じタイプの連続回避の徹底、曲の起伏（セクション）に応じた energy 変調、入場を拍に寄せる（`features.bpm` を使う）。
2. ムード（軸）のユーザー編集・保存（軸ベクトルをプリセットとして保存）と、テーマのバリエーション（variance: 側面ごとの自由度）のスライダー化。
3. `styleMode.seed` が既定 `12345` のまま（全プロジェクト共通）なので、プロジェクト生成時に人ごとのソルト＋乱数で振る。

検証済み: `npm run check`（99 files ok）、`npm test`（171 tests）、`SA_SMOKE=1 SA_SMOKE_STUDIO=1`（langMissing 0）、Web 配信のブラウザで テーマの保存/適用/複製/改名/削除/入出力、編集ダイアログの5軸・気分チップ・軸ランダム・音楽から（合成120BPM/エネルギーで検証）・適用/保存、お任せの music-aware 生成（calm→blurIn / loud→neonFlicker、ink>0、glError 0）を確認。

### 追加: プレビューを覆う問題とデバッグコンソール（このコミット）

- **バグ修正**: Suno データのないプロジェクト（リリックのみ）では、リロードのたびに `#welcome` オーバーレイが復活して**プレビューを覆っていた**。`renderPreview()` の条件を「プロジェクトに中身があるか（dataset / キュー / メディア / レイヤー）」に変更し、内容のあるプロジェクトでは出ないようにした。
- **デバッグコンソール**: `renderer/js/studio/debug-console.js` を追加。`console.log/info/warn/error` と `window.onerror` / `unhandledrejection` をリングバッファ（400件）に取り込み、**インスペクタの右横の独立カラム**（グリッド7列目 `#preview-console`）に表示する。表示メニュー→「デバッグコンソール」で開閉（チェック付き）、スプリッターで幅調整（`layout.consoleW`、最小200px）、既定360px。プレビューが狭くなりすぎないよう自動クランプ。クリア／✕付き。i18n 5言語。

### 追加: パレット（テーマ / キュー / ビート / エレメント）

- **`style.palette = { id, name, colors: [...] }`**（役割順: 0 背景 / 1 背景2 / 2 文字 / 3 アクセント / 4 縁 / 5+ 追加色）。`resolveStyle` の連鎖（project → cue → beat → line/word/letter）にそのまま乗るので、スコープごとに定義できる。
- **レンダラー**: `color.resolve` が `{ kind: 'palette', index }` とグラデーション stop の `paletteIndex` を **ローカルパレット**（`context.palette`）から解決。背景も `backgroundUniforms` がスコープのパレットから既定色を取る（明示指定があればそちらが優先）。engine が `style.palette` を `resolveColorSet` / `backgroundUniforms` に渡す。
- **生成**: `SA.moods.generatePalette(random, axes, name)` が気分に合う内蔵テンプレ（7種）を重み付き抽選し、色相 ±43°／彩度・明度を揺らして新しいパレットを作る（`jitterPalette` は既存パレットの揺らぎ版）。テーマは `style.palette` と `color: { fill: palette index 2 or gradient 2→3, stroke: 4 }` を持ち、背景の色はパレットから取る。
- **UI**: テーマ編集に「パレット」セクション（スウォッチの追加/削除/色編集（`SA.colors.openPicker`）、パレットをランダム生成、既存のパレットから適用）。インスペクタにも「パレット」セクション（現在のパレット表示、既存から適用、テーマに合わせてランダム、継承に戻す）があり、**キュー/ビート/ライン/ワード/レターの各スコープ**に書き込める。i18n 5言語。
- **バグ修正**:
  - `setStyleProp` / `setStyle` が `scope.cueId` を `scope.beatId` より先に見ていたため、**ビートスコープへの書き込みがキューに落ちていた**（ビート単位の設定が効かない）。
  - パレット生成の色相シフトが `rgbToHsv`/`hsvToRgb` の度数とタンの取り違えで**全色が赤に潰れていた**。
  - テーマ生成が `location` の `offsetX/offsetY`（フレーム単位、±1）を全レンジでサンプルし、**文字が画面外に出ていた**（0付近の小さな揺らぎに変更、`location` は中央寄せ系のみに）。

## 次: 品質見直し（P7 の近似・タイル並列）

P1–P13 と P12 の残り（fx 翻訳表・スクリーンショット・メディアタブ修正）まで完了。

**P12 仕上げ（このコミット）**:
- `renderer/js/studio/fx-strings.js`（新規・UMD）: 効果タイプ 140（animation/layout/enter/exit/hold/location/fill/edge/post/background）＋ パラメータ 152 ＋ select 値 49 の翻訳を 5 言語で収録。`SA.i18n.registerStrings`（新設のディープマージ）で `DICT` に登録し、`SA.controls.typeLabel` / `labelFor` / `valueLabel`（新設）が引く。inspector の align/direction/stagger order/unit も `valueLabel` に統一。
- 選択値の翻訳漏れを機械的に防ぐテスト `scripts/test/fx-i18n.test.js`（全タイプ・全パラメータ・全 select 値 × 5 言語、言語間のキー集合一致）。`SA_SMOKE_STUDIO` に `fxLabels`（5 言語の type/param/value の実表示）を追加。
- README のスクリーンショットを `SA_SMOKE_SHOT` で撮り直し（`snapshot/studio-overview.png`）。ショットは WebGL プレビューを `captureRGBA` で取り込んでページ画像に合成する（`capturePage` はアクセラレーションされた canvas を含まないため）。
- **バグ修正**: `.media-pane[hidden] { display: none }` が無く、`.media-pane { display: flex }` が `hidden` を上書きしていたため、Media パネルで Info/Video/Audio の 3 ペインが常に全部表示されていた（P10b から）。撮影時に発見して修正。

残り:
1. 品質見直し（P7 の近似: motionBlur/echoTrail/pixelSort/displacementMap/godRays/bloom、blur の実描画、`colorMix` の実色反映）は未着手。
2. 参考: タイル並列処理は仕様書（`doc/app-design.md`）に定義が無く、コミット履歴にも存在しないため未着手（別途仕様を決める必要あり）。動画レイヤーの音声は仕様どおり v1 ではミュート。

検証済み: `npm run check`（96 files ok）、`npm test`（170 tests）、`SA_SMOKE=1 SA_SMOKE_HOME=1`（Studio-first / データなし / LRC・Whisper JSON・SRT 取込、ink 961、glError 0、home:open の受け渡し）、`SA_SMOKE=1 SA_SMOKE_STUDIO=1`（langMissing 0、fxLabels 5 言語分を出力）、`SA_SMOKE=1 SA_SMOKE_FILLERS=1`・`SA_SMOKE_LAYERS=1`（回帰なし、glError 0）、Web 静的配信（ルート→Studio、Studio→カードのハンドオフ、コンソールエラー0）。

## GitHub Pages（このコミット）

公開 URL は「Deploy from a branch（main / root）」の Jekyll ビルドで README を表示しており、`Deploy Pages` ワークフローは `actions/configure-pages@v5` で失敗していた。ユーザーが標準の「Static HTML」ワークフロー（`.github/workflows/static.yml`、リポジトリ全体をアップロード）を追加し、Pages は GitHub Actions ソースに切り替わって成功するようになったため、重複していた `pages.yml` は削除した。設定を触らなくても動くように、リポジトリ直下に以下を追加:

- `index.html`: `renderer/studio.html` へリダイレクト（hash 維持）。Studio がメインのため。Actions の全体アップロードでも、ブランチ配信（main / root）でも `https://<user>.github.io/<repo>/` でアプリが動く。ローカルの静的配信（サブパス相当）で index→Studio ハンドオフ、フォント、WebGL2、文字描画、glError 0 を確認。
- `.nojekyll`: ブランチ配信時に Jekyll を通さない。
- README の Pages 節を static.yml 方式に更新。

新セッション開始時の指示例: 「`doc/app-design.md` と `doc/progress.md` を読んで、P10b を実装して。完了したら npm run check / npm test / Electron smoke で検証し、1コミットにまとめて」。

なお、作業上の注意（重要）: 非 ASCII を含むファイルを PowerShell の文字列置換で編集しないこと（文字化けする）。Node のスクリプトか edit/write ツールを使う。
