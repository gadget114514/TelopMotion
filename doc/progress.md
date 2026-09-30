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
| フィラーライブラリ | （このコミット） | **プリセット122種**: `lyrics/filler-presets.js`（pattern 26 / split 16 / shapes 12 / particles 8 / audio 9 / figures 20 / text 10 / timer 6 / combo 15、en/ja ラベル、id は kebab-case、`list/get/groups/labelFor/specOf`）。**レイヤースタック**: `filler-render.js` に `layersOf`/`fromLayers`/`validate`/`expandTokens`、`combo` は編集可能な list、新タイプ `textAnim`（engine が text トラックと同じ beat 評価で描画。`theme`/`enter`/`hold`/`exit`/`size`/`y`/`color`、`{title}`/`{artist}`/`{next}`/`{prev}` 展開）。**figures 拡張**: in/hold/out の強制（乱数列は不変）、scale/x/y の配置、単色 color、`transformShapes` を figures へ抽出し filler-render と共用、`assignMoves` の force。**ユーザーライブラリ**: `studio/filler-library.js`（localStorage `sa.fillerPresets`、保存/改名/削除/JSON 入出力/`sa:filler-library` イベント）。**UI**: インスペクターにプリセット絞り込み＋optgroup＋レイヤー編集（追加/並替/削除/型変更/パラメータ、textAnim はテーマ・fx 名を動的選択）、タイムライン右クリックに Presets（グループ→プリセット、My fillers）と Change type、クリップ名はプリセット名 / レイヤー連結 / 展開テキスト。**自動演出**: `direct.fillerSettings` が seed 決定的にプリセットを選び（interlude/longGap は pattern|split|figures|combo|particles、intro/outro は credits+figures）、ジャンルの `filler.exclude` を尊重、`rerollClip` は `usePresets` でライブラリを探索。**バグ修正**: `module` 未定義で死んでいた `figures.js`/`split.js`/`filler-render.js` の UMD ラッパーと、`gl/shapes.js drawShape` の const 再代入（`count += 1`）を修正し、フィラーが初めて実描画されるように。i18n は en/ja 追加（es/fr/ru は en 値をコピー）、`filler-presets.test.js` と figures/direct テスト拡張 |

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
                                    #     インスペクターの両セクションを確認。
                                    #     フィラーライブラリ: combo プリセット適用（presetInk）と
                                    #     3レイヤー自作（pattern+figures+textAnim）の描画・PNG バイト・
                                    #     ユーザー保存/再読込（savedFillerOk/userListOk）も確認。
                                    #     %TEMP%/suno-fillers-smoke.png を出力
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
- **演出改善プラン（11項目）の決定**:
  - **テキストサイズは10段のラダーで管理し、weird の結果を画面上の比率で読む**: ビート単位の `text.size`（フォント書体のサイズではない）が、そのビートの可読下限（`legibility.MIN_SIZE_RATIO` 0.045 × フレーム高、最低24px）から、そのビートの行がブロック上限（`text.maxWidth` × 枠幅、`text.maxHeight` × 枠高）いっぱいに収まる「全画面」サイズまでの10段を取る。変化値 `v = 1 − (1 − weird)(1 − energy)` が次のビートで段を移る確率。0 は曲全体で1つのサイズのまま（従来の倍率変動はラダーに置き換わった）。
  - **折り返しが結果としてのフォントサイズを決める**: ビートごとの行数・`maxWidth`・`fit:'fill'`（fillCoverage）の選択を weird が大きく変え、その折り返しからサイズが決まる。突き抜けは frame-guard が「可視 50% 以上」を保証する。
  - "後景" = **mid（backdrop）トラック**。**背景（bg）はユーザー設定**で自動演出は触れない。mid の画面支配度は weird で決まり、w=1 で 100%。
  - 図形アニメーションは**新トラック `figure`**（後景と字幕の間）。

| 演出改善 P0 演出ロジックの抽出 | （このコミット） | `renderer/js/studio/direct.js`（`SA.direct`: `prepare` / `directCue` / `directBeat` / `backgroundClip` / `backdropClipFor` / `backdropClips` / `fillerSettings` / `fillerClips` / `run`）。`autoDirect` は `prepare` → `store.dispatch(SA.direct.run)` だけになった。生成クリップに `auto:true` を付け、store の update/move/trim/split/duplicate で剥がす（＝pinned）。w=0 の出力は抽出前スナップショット（HEAD の dispatch 本文を Node で実行して採取した `scripts/test/fixtures/direct-w0.json`）と一致（`direct.test.js`）。 |
| 演出改善 P1 SRT 後に全体表示 | （このコミット） | `store` に名前付きイベント `on`/`fire` を追加し、`commands.importSrt` が `script-imported` を発火。`timeline.fitToCues()`（`end*1.02` を timeViewWidth に収める。MIN_ZOOM 未満も許す）を追加し、`minZoom()` を `min(MIN_ZOOM, fitZoom, cueFitZoom)` に変更（スライダーで戻れる）。`init` が `script-imported` を購読して rAF で `fitToCues`。`timeline-fit.test.js`（DOM スタブ） |
| 演出改善 P2 はみ出し対策 | （このコミット） | ①`scene.js`: layout 後に `limitW=maxWidth/0.94W`・`limitH=(0.8→weirdで1.2)H` を超えたら 1回だけ `size*k` で再レイアウト（`maxWidth:Infinity` で折り返し維持）。②`motion.js`: アンカーを safeArea と blockHalf でクランプ（ブロックが大きい軸は中央）。③`frame-guard.js`（新規・純関数）: 可視率 50% 未満のとき (a) zoomBlock を二分探索で縮小、(b) 完全入場中のみ平行移動、(c) それでも足りなければ一様縮小。`effects/camera.js` に `maxExtent`、engine が post のカメラを最悪値で motion に渡す。`textflow.js`: `fitCheck`/`fitLinesScale` に高さ検査、`fillBleed` 上限 0.5。`frame-guard.test.js`（純関数13件）。**fx400/looks カタログを再生成**（ガードが motion 評価を変えるため。見た目は「可視50%保証」以外は不変の意図） |
| 演出改善 P3 リズム多様化＋トラック表示チェック | （このコミット） | `lyrics/rhythm.js`（新規・純関数）: 10パターン（1小節、hold2のみ2小節）、energy/w/文字数で重み付け、8小節ごとの溜め、3連続回避、倍速/半速、0.35秒未満の吸収、`rngFor(seed,'rhythm',id)` で決定的。`textflow` は `settings.chunkPlan`（時間配列）があれば等間隔グリッドの代わりに使い、単語境界へ±0.5拍で寄せる（無ければ従来グリッド）。`direct.prepare` が w>0 のときだけ `plan` を作り、`run` が `cue.textFlow.chunkPlan` と `longHold.interval=4*(0.75+rnd*0.5)` を設定（w=0 は完全不変、前回の chunkPlan は消す）。weird の pulse BPM は ×[0.5,1,1,2]。`rhythm.test.js`。あわせて**タイムラインのトラックに表示/非表示チェックボックス**（目のアイコンをチェックボックス描画に置換、`track-check` ヒット、layer トラックは全レイヤー一括、`updateTrack` で1 undo。`timeline-fit.test.js` にポインタ統合テスト）。 |
| 演出改善 P4a-c 後景(mid)の支配度・分割・色・動き | （このコミット） | `lyrics/split.js`（新規・純関数）: 11レイアウト（halves/diagonal/thirds/bands/quads/grid/chevron/radial/mondrian/frame/shards）を凸切断だけで構築。coverage（塗る面積）は線レイアウト=線位置、grid=最後のセル、frame=額縁の内寸で**厳密**、その他は面積順+最後の領域を切断して一致。`motion`（slide/rotate/breathe/swap/drift）と `SA.moods.splitColors`（tonal/analogous/complementary/triad/splitComplementary/neutralAccent、60-30-10、w で色相差が増える）。`moods.weirdClipColors` で後景色が weird で色相±180w・彩度・明度幅 0.25+0.5w に広がる（w=0 は従来の [3,5] のまま）。`clipSpec('backdrop')` は w>0 で `combo[split, アクセント]` を作り、opacity 下限 0.35+0.4energy+0.2w、`animate`（拍脈動・ドリフト・wipe/scale/rotate/iris 0.35s）。`gl/shapes.js` に凸多角形 SDF（shape code 5、u_points[8]）、`engine.drawPrimitives` に convex、`clipShapeColor` は色リストを返し `filler-render.colorAt` が循環。`direct`: coverage=w、w≥0.5 で mid は [0 or cue.start, 次 cue.start] の全張り・opacity 1・fade 0、bg はユーザー設定を壊さず weirdBg を撤去（weird の拡張は mid へ）。i18n 5言語（分割面+パラメータ+値）。`split.test.js`（幾何/被覆/色/動き） |
| 演出改善 P5 図形トラック＋手動キュー | （このコミット） | **figure トラック**（`fg, sub1, fig, mid, filler, bg` の順で既定追加、旧プロジェクトは migrate で空トラックを補完）。`lyrics/figures.js`（新規）: 12モチーフ（orbit/burst/bars/rings/confetti/frame/underlineSweep/bracketsPop/polyMorph/ribbon/ticker/halftone）、サブビートごとの in/hold/out（in は pop/draw/wipe/scatterIn、hold は spin/pulse/drift/morph、out は shrink/fade/burstOut）、`sync`=beat/free/text（±0.5拍）、隣接で同じ in/out を避ける、`rngFor` で決定的。`direct.figureClipFor` が w>0 でキューごとに1本生成（sync は text/beat/free、density は energy/w）。フィラーは item 8 対応で `figures` に統一（intro/outro は combo[credits, figures]）— **w=0 の既知の例外**（フィラー種別のみ。fx800 はフィラー非使用）。**textAnim トラック**（専用テキストを自前の enter/hold/exit で描画。engine が figure → textAnim → 字幕の順に描画）。タイムラインに「テキストトラック追加」「図形トラック追加」ボタン、figure/textAnim/filler は**ドラッグ/ダブルクリック/「キューを追加」で手動クリップ作成**（重複可・`auto` なし・1操作1undo）。インスペクタは figure=motif/sync/density、textAnim=テキスト本文を編集（`appendClipCommon` に共通部を抽出）。i18n 5言語（トラック名/ボタン/モチーフ/同期/フィラー図形）。`figures.test.js`、`timeline-fit.test.js` にドラッグ/クリック/Add cue/undo/保持のテスト |





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

## 追加: 後景パターンの1404種ライブラリ（このコミット）

後景（backdrop）トラックの `pattern` のモードが4種類だけで、長い曲や FX 400/800 のデモで同じタイルに見える問題への対応。**大きさ・本数の段階差を別のパターンとして数え、全種類をアニメーションさせる**。

- `renderer/js/lyrics/pattern-variants.js`（新規・UMD・依存なし）: 決定的なパターン種ライブラリ。`mode`（grid / dots / stripes / rings / triangles / diamonds / hexes / rain / checks / polka / sineCurve / waves / randomFill）× `size`（log1.4 の9段階 0.2–2.95）× `count`（4–120 の12段階）= **1404種類**。`at(n)` / `count()` / `variants()` / `keyOf` を公開。速度は 0.25 / 0.5 / 0.9 / 1.6 のみで**静止する種類を作らない**（後景が必ず動く）。不透明度は署名には含めず、隣の種類が同じに見えないよう巡回させる。
- `renderer/js/lyrics/filler-render.js` の `patternShapes`: `size` を全モードで効かせる（grid/checks/randomFill はタイルの塗り比率、stripes はデューティ比、dots は半径、polka は水玉の半径、rings は太さ、triangles/diamonds/hexes は多角形の半径、rain は筋の長さ、sineCurve/waves は振幅と線・帯の太さ）。`count` は要素数。新モードはチェッカー（明滅が走る）、水玉（横に流れる）、サインカーブ（位相が流れる）、ウェーブ（太い帯がうねる）、ランダムフィル（セルごとに明滅するモザイク）。どの段階でも潰れず、大きさを変えるだけでも別のパターンに見える。
- `renderer/js/lyrics/moods.js`: 後景の `pattern` はライブラリから選ぶ。`rerollClipSpec(kind, { index })` に通し番号を渡すと重複なしに巡回し、番号なし（手動再抽選）はライブラリからランダムに1つ選ぶ。
- `renderer/js/studio/app.js`: おまかせの後景クリップ生成でキュー番号＋seed オフセットを渡す（400キューの曲で1404種から一巡）。
- `scripts/fx400mix.js` / `scripts/fx800.js`: デモの背景パターンにも同じライブラリを適用（背景プールの pattern は1エントリに統合。支えの背景はデモ n が `at(n)` の mode/size/count/speed を取り、見本（headline）の pattern は実演するモード＋既定値で固定）。400デモ全体でも、800デモ全体でも同じ背景が出ない（各200デモ区切りの中も重複0）。md 一覧は `背景:パターン(ひし形 0.2x4)` のように段階を表示する。
- `scripts/distinct-count.js`: `background.pattern` を「1404種＋基本形」= 1405 シグネチャとして数える。`test/distinct-count.md` は **background 1450 / 合計 2412**。受け入れ条件に「後景パターン400以上」を追加（`doc/repeat-design.md` §8.1 / §8.4）。
- テスト: `scripts/test/pattern-variants.test.js`（1404種・宣言レンジ内・巡回・**全モードが正の速度で動くこと**・描画の段階差・後景生成の重複なし）、`fx400mix.test.js` / `fx800.test.js` に背景パターンの重複なし、`distinct-count.test.js` に `background >= 400`。
- 検証: `npm run check`（116 files）、`npm test`（300 tests）、`npm run distinct`（background 1450 / total 2412 / acceptance ok）。`node scripts/fx400mix.js build` / `node scripts/fx800.js build` でカタログとプロジェクトを再生成（出力先 `demo/`、最小ペア距離 6.7、背景パターンの重複0）。

## 追加: デモの文字サイズ・文字色のはっきりした段階（このコミット）

FX 400 MIX / FX 800 のデモで「色とフォントサイズの違いが見えない」問題への対応。デモの文字サイズが 84–96 に固まり、文字色もほぼ白（パレットのテキスト役）ばかりだった。

- `scripts/fx400mix.js`: `SIZE_STOPS = [56, 70, 88, 110, 138]`（約 1.3 倍刻み。`doc/repeat-design.md` §2 と同じ間隔）と `FILL_STEPS`（アクセント色 / テキスト色 / アクセント色2 と各グラデ、計 6 役）を追加。デモ番号 n で巡回し、`SIZE_STRIDE=2` なので隣のデモとは最低 2 段（1.56 倍）違う大きさになる。`keepOnScreen` は自由値を丸めるのをやめ、収まらないときはラダーの 1 段下へ落とす（前のデモと同じ大きさになるときだけもう 1 段下げる）。背景パレットも前のデモと同じ名前なら再抽選する。
- 署名に `size` / `color` スロットを追加（`SLOT_WEIGHTS.size = 1.2`、`.color = 0.9`）。md 一覧の「組み合わせ」に `サイズ` と `色` を表示。
- テスト: `fx400mix.test.js` / `fx800.test.js` に「サイズはラダーの段のみ・5 段すべて出る・隣はサイズと色の両方は同じにならない」を追加（400 デモで隣接同サイズ 8/399・同色 0）。
- 生成物の置き場: FX 400 MIX / FX 800 のプロジェクト・SRT・カタログ・一覧・プレビューは `demo/`（`demo/README.md` に索引）。`main.js` に `SA_SMOKE_FXDEMO` を追加し、デモの先頭 16 キューをフル解像度で撮って 4×4 のコンタクトシート `demo/fx800-preview-<part>.png` を書き出す。
- 分かった問題（修正済み）: Studio のプレビュー品質 half / quarter では、テキストが出力解像度の座標のまま縮小フレームに描かれて 2〜4 倍に拡大されていた（同じキューでも full と quarter で大きさが違った）。
- 修正: `renderer/js/lyrics/scene.js` の `buildScene` に `scale` を追加し、シーン全体（文字サイズ・行送り・`maxWidth`・各レターの `local`）を「実際に描くフレームの画素」で組むようにした。シーンはスケールごとにキャッシュする。`engine.js` と `canvas2d-fallback.js` は `state.width / project.output.width` を渡す（出力解像度の書き出しでは 1 のままで従来どおり）。これでモーション評価の frame・GL の `u_resolution`・オーバーレイの当たり判定がすべて同じ座標系になる。
- 検証: `SA_SMOKE=1 SA_SMOKE_QUALITY=1` を追加（同一キューを full / half / quarter で撮り、縮小フレームを full の縮小コピーと画素比較）。修正前は mismatch 3.5%（half）/ 7.1%（quarter）・インク量 3.5〜6 倍で不合格、修正後は 0.2% / 0.5% で合格。`scripts/test/scene-scale.test.js` でシーンのスケール（全寸法が比例・スケールごとのキャッシュ・不正値は 1）を単体テスト。
- 検証: `npm run check`（115 files）、`npm test`（293 tests）、`node scripts/fx400mix.js build` / `node scripts/fx800.js build`（出力 `demo/`、最小ペア距離 6.7）、`SA_SMOKE=1 SA_SMOKE_FXDEMO=1`（4 プロジェクト分のプレビュー、glError 0）。縮小プレビューの座標ずれもこの作業で修正（`scene.js` の `scale`、`SA_SMOKE_QUALITY`）。

## 追加: 縮小プレビュー（half / quarter）の座標系を修正（このコミット）

プレビュー品質を half / quarter にすると、テキストだけ出力解像度（1920×1080 など）の座標で組まれ、縮小フレームに 2〜4 倍の大きさで描かれていた（ハンドル・オーバーレイ・グリッドも同様にずれる）。

- `renderer/js/lyrics/scene.js`: `buildScene(project, beat, fonts, { scale })` を追加。文字サイズ・行送り・`maxWidth`・`blockBBox`・各レターの `local` を、実際に描くフレームの画素で組む。スケールはシーンキャッシュのキーに含め、非正の値は 1 に落とす。
- `renderer/js/lyrics/engine.js` / `canvas2d-fallback.js`: `state.width / project.output.width` を `scale` として渡す（出力解像度の書き出しは従来どおり 1）。これでモーション評価の `frame`・GL の `u_resolution`・オーバーレイの座標が一致する。**画面収録の 720p / 1440p 書き出しも同じ式で正しくなる**（エクスポート用エンジンは出力解像度と別のサイズで作られるため）。
- `main.js`: `SA_SMOKE_QUALITY` を追加。同じキューを full / half / quarter で撮り、縮小フレームを full の縮小コピーと画素比較して `SMOKE_QUALITY=` に出す（mismatch < 2%、インク量差 < 1% で合格）。修正前は half 3.5% / quarter 7.1% で不合格、修正後は 0.2% / 0.5% で合格。`SA_SMOKE_LYRICS` の画素サンプリングも capture 座標 1:1 に合わせた（縮小プレビューでも正しくサンプルできる）。
- テスト: `scripts/test/scene-scale.test.js`（全寸法が比例・スケールごとにキャッシュ・不正値は 1）。
- 検証: `npm run check`（118 files）、`npm test`（302 tests）、`SA_SMOKE=1 SA_SMOKE_QUALITY=1`（full/half/quarter 合格、glError 0）、`SA_SMOKE=1 SA_SMOKE_LYRICS=1`（quarter サイズの capture でもグリフと穴が一致）、`SA_SMOKE=1 SA_SMOKE_FXDEMO=1 SA_SMOKE_FXDEMO_SCALE=quarter`（コンタクトシートが full と同配置）。

## 追加: 800ルックのおまかせ（このコミット）

FX 800 の800デモを**動きの大きさ**で分類し、**テーマと5軸**に結びつけて、`おまかせ` の抽選プールにする。流れは「5軸とテーマを決める → 800から1ルックを抽選 → 見た目の構造はそのまま適用 → パレットと文字を軸で微調整」。

- `scripts/looks-classify.js`（新規）: 各デモを `SA.motion` の実測にかけ、ビートの9フレーム標本からレターの移動・拡大縮小・回転・奥行き・変形の**最大振幅**を測る（基準状態に依存しない総当たり比較なので、円形配置のような「静止しているが位置が違う」見た目を動きと誤認しない）。振幅は `MOTION_REF = 1.6` で 0–1 に正規化し、**静止 / 小 / 中 / 大 / 特大**の5段階に分類（800デモで各バケットに十分な数が入る）。5軸は、タイプ特性（`moods.TRAITS`）・登場/退場/保持の時間・構造（repeat の本数、文字背景、スタック数、配置、文字サイズ）・背景パレットの明度から導出。テーマ（ジャンル10種）への適合度は軸距離の指数＋元がそのジャンルのデモなら重み1。
- `renderer/js/lyrics/looks.js`（新規・UMD）: 実行時プール。`load()` が `renderer/data/fx800.looks.json` を読む（Electron は `platform.readAsset('data/…')`、Web は fetch。`main.js` の `ASSET_ROOTS` に `data` を追加）。`pick({axes, genre, seed, exclude})` は「energy は実測の動き、残り4軸は特性、テーマは倍率」の重み付き抽選。`compose(entry, {axes, seed, genre})` は構造をデモのままにし、**色パレットと文字（サイズ/字間/太さ）を軸から生成**したスタイルと背景クリップを返す（フォントはデモのものを残す）。`stripDefaults` / `expand` は効果グループをレジストリ既定値との**差分**で保存・復元する（`type` は既定と同じでも保持。落とすと復元時に別タイプの既定が当たる）。
- `scripts/fx800.js build`: カタログ生成後に分類を実行し、`renderer/data/fx800.looks.json`（差分エンコード、約1.9MB）を書き出す。差分の基準は「型だけのレジストリ既定値」で、デモのパラメータ（例: repeat の本数や variationPreset）も欠落なく復元される（入れ子パラメータ `offset` などはオブジェクト単位で保存）。`demo/fx800.md` には各デモの動きの段階（例: 中 (0.87)）と凡例を追加。
- `renderer/js/studio/app.js` のおまかせ: 抽選の単位は**曲全体で1ルック**。キューごとの enter/exit 生成はやめて見た目の一貫性を守り、ビートのサイズ揺らぎと稀な拍の脈動だけ残す。再ロールは直前のルックを除外して引き直す。プールが読めないときは従来の生成のみにフォールバック。トーストは `studio.toast.autoDirectedLook`（5言語）でルック番号と名前を表示し、`styleMode.look` に番号・名前・動きバケットを保存する。
- テスト: `scripts/test/looks.test.js`（800件の分類・全バケット使用・軸/テーマの範囲とソート・カタログとの差分同期と再分類の一致・expand の復元・seed 再現性と多様性・軸とテーマへの追従・除外と全除外・compose の微調整）。
- 検証: `npm run check`（117 files）、`npm test`（300 tests）、`SA_SMOKE=1 SA_SMOKE_RANDOM=1`（look No.252 `enter.flip3D`、autoLookCount 800、autoLookMatch true、autoEnterKinds 1 / autoExitKinds 1、glError 0）。`node scripts/fx800.js build` は出力先を一時ディレクトリにして、looks と動き列つき md の生成を確認。

## 追加: 起動ロード画面（このコミット）

起動に時間がかかるため、暗いウィンドウのまま待たせず、全画面のロード画面（ブランド＋状態テキスト＋進捗バー）を出し、準備完了でアプリ表示に切り替える。

- `renderer/studio.html` / `renderer/css/studio.css`: `#boot` オーバーレイ（ブランド、`#boot-status`、`#boot-bar`）を body 直下に追加。スクリプト解釈前に描画されるので起動直後から見え、完了時は `is-done` で 260ms フェードして `hidden` になる。
- `renderer/js/studio/boot.js`（新規）: `SA.boot.set(percent, key)` / `SA.boot.busy(on)` / `SA.boot.finish()` / `SA.boot.progress()`。進捗は単調増加・0〜100 クランプ、最短 400ms 表示。`busy` は幅を保ったままシマーさせる不確定表示（フォント解析のような長い工程用）。
- `renderer/js/studio/app.js` の `startup()`: 画面 6% → インターフェース 16% → プレビュー 34% → プロジェクト 58% → フォント 74% → 96% → finish（100%）。フォントは `preview.whenFontsReady()` が**安定するまで**（textflow が次の要求を始めたらそれも）待ってから表示し、解析中のメトリクスが画面に出ないようにした。上限は 30 秒（ハング時の保険。失敗はその場で解決する）。待機中は `busy(true)` でバーが動く。
- `renderer/js/studio/preview.js`: `ensureFonts()` を `loadFonts()`＋Promise 保持に分け、`whenFontsReady()` を公開。
- i18n: `studio.boot.*`（loading / interface / preview / project / fonts / ready）を5言語に追加。
- テスト: `scripts/test/boot.test.js`（studio.html のマークアップと boot.js → app.js の読み込み順、5言語のキー、進捗の単調性・クランプ・busy・フェード）。`SA_SMOKE_STUDIO` に boot の hidden / progress / status を追加。
- 検証: `npm run check`（120 files）、`npm test`（304 tests）、`SA_SMOKE=1 SA_SMOKE_STUDIO=1`（boot hidden true / progress 100 / status 準備完了、langMissing 0、glError 0）。日本語デモ（`fx800-1`、200キュー・日本語フォント8種）で `platform.readAsset` に 1.5 秒/フォントの遅延を入れて計測し、**全8フォントの解析が終わる 14.3 秒までロード画面（busy シマー付き）が残り**、その後にフェードすることを確認（旧実装は 6 秒上限で解析途中にアプリを出していた）。

## 追加: undo/redo の実用化（このコミット）

履歴の土台（プロジェクト全体のスナップショット、最大200件、coalesce）はそのままに、ドラッグ・選択・dirty・UI を実用レベルに引き上げた。

- `renderer/js/studio/store.js`:
  - **トランザクション API** `beginTransaction(label)` / `endTransaction()` / `cancelTransaction()`。begin で before を1回だけ clone し、中の `dispatch` は do と bump/emit だけ（スナップショットなし）。end で after と比較して変わっていれば1件積む。ネストはカウンタで最外だけ確定。
  - **no-op の除外**: dispatch / endTransaction で before/after の JSON を比較し、同じなら履歴に積まない。
  - **選択の保存と復元**: エントリに `selectionBefore` / `selectionAfter`。undo/redo 時に復元し、存在しないパス（cue / beat / clip / layer / track）は `pathExists` で剪定する。
  - **undo/redo は全 AREA を bump**（プロジェクト全体が差し替わるため）。
  - **dirty の id 管理**: エントリに連番 id を振り、`markClean()` が保存位置の id を記憶、`isDirty()` は先頭 id と比較。coalesce で先頭を更新したら id を振り直す。
  - `undoLabel()` / `redoLabel()` を公開。
- **ドラッグのトランザクション化**: `timeline.js`（cue / clip / beat エッジ、キーフレーム、レイヤー。pointercancel は cancel）、`overlay.js`（移動・回転・スケール、パス編集）、`controls.js`（range スライダーは pointerdown で begin、change / pointerup で end）。時間ベースの coalesce は数値入力用に残す。
- `app.js`: Ctrl+Z / Ctrl+Y はテキスト入力（text / search / number / textarea / contentEditable）ではネイティブに任せ、range / checkbox / color / SELECT / ボタンではアプリの undo に回す。編集メニュー用の `undoEdit` / `redoEdit` ハンドラ。
- `menu.js`: File と Generate の間に **Edit メニュー**（「元に戻す: {ラベル}」「やり直す」、Ctrl+Z / Ctrl+Y、履歴がなければ無効）。
- `i18n.js`: `studio.menu.edit` と `studio.edit.*`（undo / redo / undoWith / redoWith）を5言語。
- 生成ダイアログの `setOutput` + `generateScript` + fit-to-duration を1トランザクションにまとめ、1回の undo で戻るようにした。
- テスト: `scripts/test/store.test.js` に8件（トランザクションのまとめ・分離・cancel・ネスト、no-op 除外、選択の剪定と復元、markClean と undo/redo、ラベル）。
- 検証: `npm test`（320 tests）、`npm run check`（120 files）、`SA_SMOKE=1 SA_SMOKE_STUDIO=1`（editMenu「元に戻す: output」/ dirtyAfterRedo true / cleanAfterUndo true / langMissing 0）、`SA_SMOKE_EDIT=1`（overlay ドラッグ・undo、glError 0）、`SA_SMOKE_TIMELINE=1`（キーフレームのドラッグ/コピー/削除、glError 0）、`SA_SMOKE_BEATS=1`（moveBeatEdge + undo、split/merge の undo）。

## 追加: フォントサイズのダイナミクスと文字変形（このコミット）

「フォントが画面いっぱいになる」ような**文字サイズの大きな動き**が無い問題への対応。文字ごとの `scaleX/scaleY`（`pulse` / `kenBurns`）はグリフがその場で膨らむだけで、字間は広がらないため画面を埋められない。**ブロック中心まわりにテキスト全体を拡大する**本物のフォントサイズ変形を頂点シェーダに追加した。

- `renderer/js/lyrics/effects/warp.js`: 変形コード表に letter `stretch`(15) / `skew`(16) / `swirl`(17)、block `zoomBlock`(31) を追加。`zoomBlock` は `q *= factor`（`q = p + ブロック中心オフセット`）で、文字と字間をまとめて拡大する唯一のコード。ブロックワープの style ドロップダウンからは除外（`BLOCK_WARP_STYLES`）。
- `renderer/js/lyrics/motion.js`: ブロック変形が使う `warpOrigin` / `blockHalf` を state に設定（従来は未配線で block ワープが機能していなかった）。**符号が重要**: 変形は letter の平行移動より前に走るため、原点は `letter.pos - blockCenter`（`blockCenter = anchor`）。`anchor - pos` にすると逆に中心へ引き寄せられる（スモークで発見・修正済み）。hold/enter/exit/custom motion の info に `blockBBox` / `blockHalf` を追加。
- `renderer/js/lyrics/effects/hold.js`（pack `font`）:
  - `hold.fontSize`: `from`→`to` を `pulse` / `grow` / `shrink` で動かす（`period`・`ease`・`sync: free|beat`、beat は解析 BPM に同期）。
  - `hold.fillScreen`: `fill`（既定 0.95）× `min(frameW/blockW, frameH/blockH)` を解き、文字ブロックが画面いっぱいになる倍率まで拡大（`max` で上限、`pulse`/`grow`/`shrink`）。
  - `hold.squashStretch`: 縦伸び／横縮みの伸縮変形（文字ごとの `phase` 可）。
  - `hold.swirl`: 半径方向に回転波を通す渦変形。
- `renderer/js/lyrics/effects/enter.js` / `exit.js`（pack `font`）: `enter.megaZoomIn`（巨大なブロック倍率から着地＝カメラが引く）と `exit.megaZoomOut`（画面いっぱいまで拡大して消える）。`fade` の有無を選べる。
- `renderer/js/lyrics/gl/shaders.js`: 新コードの分岐（`stretch` / `skew` / `swirl` / `zoomBlock`）。`zoomBlock` は歪みペアを掛けず early return。
- `renderer/js/lyrics/gl/passes.js`: 変形スロットは最大3のまま、**block 変形が1枠を予約**する（letter の強い変形がフォントサイズを隠せない）。シンプルテキストパス（パイプライン不可時のフォールバック）も 9 行の state テクスチャに揃え、`packStateRows` を共有（従来は 5 行のままシェーダが 9 行を読んでいた）。
- Studio UI: `hold` / `enter` / `exit` のタイプ一覧に `pack: 'font'` を含める（`inspector.js` / `theme-editor.js`。拡張パックは別作業のため含めない）。`fx-strings.js` に型・パラメータ・値の en/ja ラベルを追加（es/fr/ru は英語へフォールバック）。
- `main.js`: `SA_SMOKE_FONT` を追加。同時刻の同時再生（`animation.simultaneous`）で `fontSize` / `fillScreen` の谷と山、`megaZoomIn` の初期と収束、`squashStretch`+`swirl` を撮り、明部画素のバウンディングボックス幅で判定（size 630→1768px=枠の92%、fill 576→1764px、megaZoom は初期が全幅クリップ→620px、glError 0）。
- テスト: `scripts/test/font-anim.test.js`（コード表・各 CPU の倍率・beam 同期・`warpOrigin`/`blockHalf` の配線・シェーダ分岐、8件）。`fx-i18n.test.js` に font パックの全型・全パラメータ・全値 × 5言語の検査を追加。
- 検証: `npm run check`（128 files）、`npm test`（335 tests、全パス）、`SA_SMOKE=1 SA_SMOKE_FONT=1`（sizeOk / fillOk / enterOk / deformOk / glError 0）、`SA_SMOKE_MOTION=1`・`SA_SMOKE_QUALITY=1`（回帰なし）。なお `post.js` の拡張タイプがテーブルで `pack: 'pro'` を宣言しているのに登録へ渡っていなかったため、登録に `pack: entry.pack` を追加した（拡張パックを既定リストから外す意図を通すため）。

## 追加: レンジセレクター・シェイプレイヤー・6軸ゲート・演出プリセット（このコミット）

- `renderer/js/lyrics/effects/selector.js`（新規・pack `pro`）: レンジセレクター。`hold.rangeSelector`（選択帯に入った文字だけを移動・拡大・回転・チルト・傾斜・不透明度・ぼかし・ハイライト混色・字間・ワイプ・マスクで動かす）、`enter/exit.rangeReveal`（帯を進捗で滑らせて順に登場／退場させる）、`enter/exit/hold.tracking`（ブロック中心からの距離で字間を開閉。縦組みは `trackAxis: y`）。shape 6種・sweep 4種（once / loop / pingpong / beat）・easeHigh/Low・width・offset・randomize（決定的な並べ替え）。
- `renderer/js/lyrics/motion.js`: info に `units`（letter / word / line の順位と総数）を追加。
- `renderer/js/lyrics/gl/passes.js` + `engine.js`: `letterBlur` を3か所（フォント違いコピー・本表・メイン）で `pipeline.text` の直後・`sdf()` の前に接続（blurIn / blurOut / フォーカスが実際に画面へ出る）。`deformSlots` / `packStateRows` / `STATE_ROWS` を `SA.glPasses._test` に公開し、twist は度→`|amount|/90` で比較。
- `renderer/js/lyrics/effects/shape-layer.js`（新規・pack `pro`・post code 46）: フレームにストロークを描くシェイプレイヤー。形9種（下線・取り消し線・枠・カギ括弧・円・リング・集中線・十字・斜め）、弧長トリム（`drive: enter / exit / hold / beat`）、リピーター（≤12、外側ほど短く・薄く）、グロー。`engine.textBoxOf` が可視文字の bbox を uv で渡す。
- `renderer/js/lyrics/effects/{warp,animator}.js`: テンポを `beatRate`（Hz・既定2）に統一、`letterWarp` の `perLetterPhase` を独立した位相（rad）に。
- `renderer/js/lyrics/effects/{background,post,shape-layer}.js`: 拡張プリミティブ（背景7種・ポスト8種・シェイプレイヤー）を pack `pro` で登録。post は `u_params2/3`・`u_colorC/D`・`u_mode/mode2`・`u_camera` と `fx.postExtensions` を追加。
- `renderer/js/lyrics/presets.js`: 演出プリセット 24種（`movieTitle` / `trailerGlitch` / `lofiDream` / … / `trackingTitle` / `karaokeSweep` / `beatStrike`）。`list({packs})` の既定は pack 無しのみ（FX400/800 のプールは不変）、`{packs:'all'}` で一覧表示。
- `renderer/js/lyrics/moods.js` + `random.js` + `scripts/looks-classify.js`: 第6軸 `weird`。拡張プールは `weird ≥ 0.5` でのみ開き、`minWeird` / `minEnergy` でゲート、数値パラメータは両端へ振れる（`weird = 0` の生成は完全不変）。`renderer/data/fx800.looks.json` を再生成（800件に `weird`、デモ本体は不変）。
- Studio: `inspector.js` / `theme-editor.js` は `UI_PACKS = { packs: ['font', 'pro'] }`。`studio.html` は hold → warp → animator → selector → camera → shape-layer → staged-presets の順で読み込み。`staged-presets.js` に selector 系プリセット10種。
- テスト: `scripts/test/{selector,shape-layer,axes,ae-primitives,staged-looks}.test.js`。`fx-i18n` は `packs: 'all'` で全パックを検査。全 362 件パス。
- 検証: `npm run check`（134ファイル）、`npm test`（362件）、`SA_SMOKE=1 SA_SMOKE_AESTAGE=1`（glError 0・trackingOk・drawOk・コンタクトシート `snapshot/aestage-sheet.png`）、`npm run fx800` のカタログ不変、`node scripts/effects-csv.js`（275型・説明の欠け0）。
- 残り: Phase 3 の残り（`shape-ops.js` のリピーター/パス変形、`background.shapeLayer` のクリップ化と `followText`、文字背景の trim/dash、`gl/shapes.js` の弧長パラメータ）。

## 追加: シェイプクリップと文字背景の描画モーション（このコミット）

Phase 3 の残りのうち、ユーザーがタイムラインから置けるシェイプクリップと、文字背景の線が描かれて現れる動き。

- `renderer/js/lyrics/shape-ops.js`: `expand` に名前付きシェイプ（`SHAPES`: underline / strike / box / brackets / circle / ring / burst / cross / diagonal）を追加。`followText: block` はブロックの文字 bbox、`line` は行ごとの bbox に合わせ、`padding`（短辺比）・`corner`・`stroke` を反映して低レベルプリミティブへ展開する。`dashOn / dashOff / dashOffset` を正規化し、`drive`（enter / exit / hold / beat）でトリムを進捗へ写す。画面に文字が無いときは空を返す。
- `renderer/js/lyrics/effects/shape-layer.js`: `background.shapeLayer`（pack `pro`）を登録。post と同じ形9種に `followText`・`dash*`・`pathOp*`・`corner`・`repeatOffset` を加えたパラメータを持つ。`followText`・`SHAPES`・`PATH_OPS` は shape-ops と共有。
- `renderer/js/lyrics/engine.js`: `drawShapeClip` が `spec.type === 'shapeLayer'` のとき `SA.shapeOps.expand` でクリップを展開し、シェイプパスでテキストの背後へ描く。`textBoxesPx` / `textBoxesForClip` が可視文字の bbox（px・行ごと）を評価して渡す（フレーム内で1回だけ評価するメモ化つき）。`drawPrimitives` は ring 太さ付きの circle を `ring` として描き、`gl/shapes.js` の各ラッパー（rect / circle / ring / capsule / polygon）は `trim / dash / cap / pathOp` を `drawShape` へ転送する。`drawBackgroundClip` は `shapeLayer` もシェイプ経路へ回す。
- Studio: 背景クリップの種類に拡張パック（`UI_PACKS`）を含め、タイムラインの右クリック「種類を変更」を背景／後景クリップにも追加（背景は background プリミティブ全種、後景はフィラータイプ＋シェイプクリップ）。`fx-strings.js` に型・パラメータ・値のラベルを5言語で追加。
- `renderer/js/lyrics/effects/text-bg.js`: `bgShape` に `stroke`（輪郭の太さ）・`fill`（内部の塗り）・`trimStart / trimEnd / trimOffset`・`dashOn / dashOff / dashOffset` を追加し、状態（bgState 5→7行目）へ載せる。`bgMotion.draw`（pack `pro`）はトリムの終端を進捗で伸ばして輪郭を描き、線が引き終わったら内部を埋める（`fill` は 60% から）。輪郭が未指定でも線が見えるよう最小の太さを入れる。
- `renderer/js/lyrics/gl/{passes,shaders}.js`: bgState を7行へ拡張（行5 = trim/線幅、行6 = dash/fill）。`BG_FRAG` は `shapeParam`（閉じた形は中心角、帯は長軸）で弧長位置を出し、トリム・破線で輪郭と塗りを切り、`stroke` の帯を合成する。既定値は恒等なので既存の描画は不変。
- テスト: `shape-ops` に名前付きシェイプ／followText／drive・dash の展開、`shape-layer` に background 登録とエンジン／Studio の配線、`text-bg` に trim/dash/stroke の状態と draw（輪郭→塗り）・bgState 7行とシェーダの検査を追加。全 377 件パス。
- 検証: `npm run check`（135ファイル）、`npm test`（377件）、`node scripts/effects-csv.js`（277型・説明の欠け0）。`test/fx400.catalog.json` / `test/fx400.telopmotion.json` は bgShape の新パラメータの既定値（恒等）を反映して再生成（既定値は従来と同じなので見た目は不変）。Electron スモーク（`SA_SMOKE_AESTAGE` など）は未実施。

## 追加: テキストの画面占有率からフォントサイズを決める（fill サイジング）（このコミット）

これまでのサイズ決定は「固定 px（`style.text.size`）→ `maxWidth` に収まらなければ縮小（最小 `minFontScale` 0.8）」だけで、`fontScale > 1` になる経路が無かった。折り返し候補（1〜maxLines 行）をすべて試し、ブロックが画面面積の何％を占めるかからサイズを逆算する `text.fit = 'fill'` を追加した。既定は `'fixed'`（従来どおり）で、既存プロジェクトの見た目は変わらない。

- 設定（`style.text`、project / cue スコープで上書き可）: `fit`（'fixed' / 'fill'）、`fillCoverage`（16:9 0.14 / 9:16 0.2）、`fillMaxWidth` 0.94、`fillMaxHeight` 0.6、`fillBleed` 0.04、`fillMinSize` 0.045（短辺比、1080p で 48.6px）、`fillMaxSize` 0.32（同 345.6px）、`fillConsistency`（'page' / 'cue'）。決定サイズは `fontScale = サイズ / text.size` で表し、描画側の計算式は変えない。
- `renderer/js/lyrics/textflow.js`: `fillOptions` / `sizeForLines` / `narrowestWidth` / `fillFit` / `fitLinesScale` を追加。`fillFit` は k=1..maxLines 行ごとに「k 行に収まる最小幅」を二分探索（greedy が行数上限で最適）し、`dpLines`（禁則・ハード改行・バランス）で折り返しを決め、`Σ行幅 × 行高 × s² = coverage × 画面面積` からサイズを逆算する。大きく読める候補を優先し、行数増・悪い改行・はみ出しには減点。最大行幅・ブロック高さ・最小/最大サイズでクランプし、最小サイズで収まらないときだけ `fillBleed` 分のはみ出しを許す（`bleed` 警告）。収まらない長文は最小サイズで折って `dpPages` でページ分割し、ページごとに再フィットして大きくする。`fillConsistency: 'cue'` は cue 内の全ページを最小 scale に揃える。recap・chunk（phrase / targetChunkDuration）・repeat 経路にも `fit` / `bleed` を伝搬する。
- `renderer/js/lyrics/scene.js`: fill beat は行が確定済みなので `maxWidth: Infinity` で再折り返しを止め、拡大・はみ出しした行が切られないようにする。キャッシュキーに `beat.fit` を追加。
- `renderer/js/studio/store.js`: `restructureOneCue` を切り出し、`setStyleProp` が fill に関係する style 変更（`text.fit`・`text.fill*`、fill 時の size / maxWidth / letterSpacing / lineHeight / fontId / direction）で再フローする（areas に 'script' を足し、1 undo で戻る）。`editBeatText` はユーザーの改行を保ったまま `fitLinesScale` でサイズだけ合わせる。
- `renderer/js/studio/inspector.js` / `fx-strings.js`: テキストセクションに fit セレクトと fill パラメータを追加。5 言語のラベルを追加（`value.fill` は repeat の「敷き詰め」で使用済みのため、fit のラベルは `value.fitScreen` を使う）。
- テスト: `textflow.test.js` に 11 件（短文拡大・2 行選択・bleed・overflow・禁則・ページ分割・consistency・縦書き・fixed 不変・fitLinesScale・chunk）、`store.test.js` に再フロー／editBeatText の 3 件、`scene-scale.test.js` に fill beat の再折り返しなし 1 件を追加。全 392 件パス。
- 検証: `npm test`（392件）、`npm run check`（135ファイル）。Electron スモーク（`SA_SMOKE_LYRICS` など）は未実施。

## 追加: 第7軸「スマートさ」・色だけ引き直し・パレット編集ダイアログ（このコミット）

パルス・ビネット・リボン・中央だけ明るいマスクのような「安っぽい」演出を減らすための新しい軸 `smartness`（大きいほど上品。片側軸で、安っぽい型を足すことはない）を追加した。エンジンの既定は 0（未指定 = フィルタなし）で、既存プロジェクト・`direct-w0.json`・fx400/800 のカタログはバイト単位で不変。UI と新しい生成は `SMART_DEFAULT = 0.6` で開く。

- `renderer/js/lyrics/smartness.js`（新規・依存なし・`SA.smartness`）: 全エフェクトの評価表 `RATINGS`（hold.pulse 0.15 / post.vignette 0.1 / figureMotif.ribbon 0.1 / backdropMotion.pulse 0.1 / background.rays 0.15 など。表に無い型は 0.5）。`rate` / `weight`（s=0 は常に 1、`rating < s - 0.45` は 0、以降は `max(0.05, 1 - 1.4(s - rating))`）/ `ok` / `pickWeighted`（s=0 は従来の一様 `pick` と同じ乱数消費）/ `rateSpec`（combo / split motion / figures motif・hold / pattern mode / 背景型の最小値）/ `rateStyle`（min・mean・offenders）/ `prune`（hold / edge / post / bgEdge の山から床下を落とす）。
- `renderer/js/lyrics/moods.js`: `AXES` に `smartness`（`AXIS_DEFAULTS.smartness = 0`）、`smartOf` / `projectSmartness` / `SMART_DEFAULT` を公開。`allowed` の末尾で `ok` による除外（ジャンルの hero グループだけは重みのみで残す）、`scoreEntry` / `weightedFromTraits` に重み。`splitSpec` は splitMotion / splitScheme を重み付けし `push` を追加、`breathe` に `every`（s>0 のとき 1/2/4）。`backdropMotion` は backdropMotion / transition（`cut` を含む）を重み付けし duration を 0.2/0.35/0.6 から抽選。`clipSpec('background')` は glow（中央の明るみ）を `0.22 × max(0, 1 - s/0.5)` で薄め、gradient/solid を noiseGradient より優先。`generatePalette` は色相ジッタとアクセントの衝突を `(1 - 0.6 s)` に。`jitterPalette` に spread を追加（省略時は従来と同一）。`pickEntry` / `backdropMotion` / `BACKDROP_MOTIONS` / `SPLIT_SCHEMES` をテスト用に公開。
- 描画: `effects/background.js` の gradient / noiseGradient に `glow`（0〜0.5、既定 null = `u_params.z` に -1）を追加。`gl/shaders.js` は `u_params.z < 0` のとき従来の 0.22 / 0.25 をそのまま使う（未設定の描画は完全不変）。`catalog:false` を付けたパラメータは fx400 のカタログ候補から除外（fx400/800 は不変）。
- 生成各所: `figures.js` は motif / in / hold / out を、`direct.js` はビートの hold（pulse → opacityPulse / heartbeat / breathing / floatBob / sway / drift / kenBurns）とフィラープリセットを重み付け。中景は 4 キューごとに `jitterPalette(seed, 'mid-section', ⌊i/4⌋, spread = 1+3w)` で色をずらし、ギャップは前のプリセットを避けて1つずつ抽選する。`looks.js` は `weightFor` に look の最小評価、`compose` で `prune`。`random.js` の cue / element は保存済みの軸があるときだけ重み付け（未保存なら従来どおり）。
- 色だけ引き直し: `moods.rerollClipColors(kind, clip, ...)` はレイアウト・モーション・タイミングを保ったまま、spec 内のリテラル色を古いパレットから新しいパレットへ移し、split の色と scheme だけ引き直す（`auto` は消さない）。`store.commands.rerollColors({ style, kinds, palette, perClip, clipIds })` は 1 回の dispatch = 1 undo。`store.commands.paletteCandidates(n)` は候補を履歴に残さずに返す。
- パレット編集ダイアログ `renderer/js/studio/palette-dialog.js`（新規・`SA.paletteDialog.open(scope)`）: 役割ごとの色（背景 / 背景2 / 文字 / アクセント / 縁 / 追加N）、スウォッチ・hex・↻（spread 2.5 の引き直し）・✕（5番目以降）・色の追加（最大12）・名前、文字と背景のコントラスト警告（4.5 未満で ⚠）。候補カード（`paletteCandidates(8)` / 引き直し / ライブラリの select）。ライブプレビューはストアのトランザクションで行い、キャンセルで復元・閉じると 1 undo（開いている間だけ store を購読して描き直す）。適用先（文字とスタイル / 背景 / 中景 / 図形 / フィラー）・「クリップごとに別の色」・「選択中のクリップのみ」。色だけ引き直し / 適用先に適用 / ライブラリ保存 / 読み書き（旧パレットダイアログから移設）。文字列はファイル先頭で5言語を `registerStrings`。`SA.colors.paletteDialog` は薄いラッパーに。
- UI: `app.js` のジャンルダイアログと `theme-editor.js` にスマートさスライダー（既定 0.6、`autoDirect` / `run` が `styleMode.axes.smartness` に保存、ジャンルや音楽からは導出しない）。`themes.js` / テーマエディターは weird と同様に未保存時の既定を補う。`controls.typeLabel` は評価の4段階マーク（○ / ◔ / ◕ / ●）を付ける。Generate メニューとインスペクターのパレット節に「パレット…」、クリップ節・タイムライン右クリックに「色だけ引き直す」を追加。`studio.html` は smartness.js を figures/moods より先、palette-dialog.js を colors.js の後に読み込み。`studio.css` にパレットダイアログのスタイルを追加。
- ドキュメント: `doc/effects.csv` に「スマート度」列（`scripts/effects-csv.js` が `smartness.rate` を出力、277型・説明の欠け0）。`doc/app-design.md` に 7.19「Mood axes」を追加。
- テスト: `smartness.test.js`（10件: 重みの単調性と床・s=0 の乱数消費一致・s=0.9 で post/hold/figures/backdrop/split/背景glow から安っぽい型が消える・rateSpec/rateStyle/prune・評価表の名前検査）、`palette-reroll.test.js`（4件: 色だけ変わる・背景の2ロール・split scheme のスマート化・jitterPalette の spread 省略一致）、`store.test.js` に4件（種別限定と1 undo・style のみ・clipIds・paletteCandidates が履歴を汚さない）、`split.test.js` に6件（cut・mode none = pulse・accent の減衰・swell の周期・sway/drift/still・breathe の every）、`direct.test.js` に1件（スマートさ 0.9 の自動演出が pulse / ビネット / リボン / 中央マスクを出さない）。床は `rating < s - 0.45`。全 522 件パス。
- 検証: `npm run check`（159ファイル）、`npm test`（522件）、`node scripts/effects-csv.js`（277型）、`npm run fx400` 相当のカタログ同一性（fx400 テストで確認）・`direct.test`（w=0 スナップショット）・`fx800` / `looks` / `staged-looks` は無変更で緑。Electron スモーク `SA_SMOKE=1 SA_SMOKE_STUDIO=1`（ブート・5言語で raw key 0・undo/redo・パレットダイアログの開閉/候補8/色の追加と削除/ライブ編集/色だけ引き直し/キャンセル復元）を確認。デモでの目視（スマートさ 0.9 の見た目、パレットダイアログの操作感）は未実施。

## 追加: weird のチャンネル分割（テキスト/後景/可読性）と後景の拍同期（このコミット）

`weird` の生値（`styleMode.axes.weird`、UI・保存はそのまま）から用途別の値を作る純関数 `renderer/js/lyrics/weird.js`（`SA.weird`、依存なし）を追加した。テキストは `text(v) = 0.7v`（旧 0.7 が新 1.0）、後景は `bg(v) = min(1, v/0.4)`（生 0.4 で完成）、可読性は `paletteContrast = 4.5 + 2.5v`（文字と背景）と `backdropContrast = 3 + 2.5v`（後景と文字）、グローは `glowScale = 1 - 0.45v`。どれも v=0 で恒等なので `direct-w0.json` と fx400/800 のカタログはバイト単位で不変。

- `moods.js`: テキスト側の全 `weirdOf` を `textWeirdOf` に、後景側（`sampleClipParams` / `splitSpec` / `clipSpec` / `rerollClipColors`）を `bgWeirdOf` に切り替え（`textWeirdOf` / `bgWeirdOf` を公開）。`generatePalette` / `jitterPalette` のコントラスト目標を `paletteContrast` に上げ、文字だけでは 7:1 に届かない背景（中間の明度）は背景の明度も動かすようにした。`weirdDecoration` の neonGlow / innerGlow は生値の `glowScale` で縮む（1+0.8w の成長を撤去）。`enforceReadability` の最低比は `3 + 1.5×生値`。保存ルック用の `tameGlow(style, raw)` を新設（グローを間引き、outline / dropShadow が無ければ palette 輪郭を追加。インスタンス単位で冪等）。`backdropMotion` は w>0.5 で `still` を外し、`sync = 0.05 + 0.10w` を追加（w=0 では欠落＝保存クリップ不変）。
- 配線: `direct.js`（`prepare` が生の `axes.weird` を保ち `w` / `wb` を返す。テキストは `ctx.w`、後景は `ctx.wb`、`tameGlow`、`weirdPalette` 後の `repairContrast`）、`looks.js`（`motionTarget` / `axisDistance` は text、`compose` で tameGlow）、`app.js`（`drawCueLooks`）、`motion.js`（`keywords.strength` に text、UMD に weird）、`scene.js`（高さ予算）、`figures.js`（bg）、`random.js`（`weirdOfProject` = text、彩度バンプと pack 解放が新スケールに追随）。`studio.html` は `weird.js` を smartness の直前に読み込む。
- 後景の拍同期: `filler-render.animate` に `kicks`（絶対時刻）と `motion.sync` を追加。各 kick で `exp(-dt*6)` の減衰バウンスを `pulse` に足し、隣り合う分割面を逆方向に少し回す。`sync` の無い保存クリップは完全不変。`engine.js` はキュー/カットの開始時刻をクリップ単位でメモ化して渡し、`clipShapeColor` の後景コントラストを `backdropContrast(project)` に。
- テスト: `weird.test.js`（各写像の境界値）、`axes.test.js`（文字 7:1・グローの縮小・tameGlow・ゲート・w=0 不変・split coverage）、`direct.test.js`（wb の全張りとテキスト帯）、`split.test.js`（kick の減衰・無視・面の逆回転）、`motion.test.js`（キーワードの生しきい値）、`scene-scale.test.js`。全 537 件パス。fx400/800 のカタログ再生成は不要だった（weird 0 不変）。
- 注意: `text(1) = 0.7` のため、旧軸の 0.75 以上にあったゲート（`EXT_TRAITS` の echoTrail / glitchSlice / godRays / lensFlare と degrade/overlap の緩和）は自動抽選では開かない。最大 weird でも自動演出が重なり・溶解系を出さない意図の結果。
- 検証: `npm run check`（160ファイル）、`npm test`（537件）。`test/distinct-count.*` は `npm run distinct` の再生成（背景 1448 / 合計 2410。weird とは独立）。Electron スモーク（`SA_SMOKE_STUDIO` など）と目視は未実施。

## 追加: フォントサイズの10段ラダーと density → 字間（このコミット）

「画面いっぱいから読める最小までのサイズを10段で行き来し、同じサイズが連続しない。0 では1つのサイズのまま」を自動演出（Auto direct）のサイズ決定にした。字間（density）も同時に軸へ組み込んだ。

- **サイズ範囲**（`direct.sizeRangeFor`）: 下限 = `max(24px, ceil(0.045 × フレーム高))`（`legibility.MIN_SIZE_RATIO`。しきい値ちょうど〜上なので size 警告は出ない）。上限 = そのビートの行がレンダラーのブロック上限（`text.maxWidth` 0.94 × 枠幅、`text.maxHeight` 0.8 × 枠高）に収まる最大サイズ（`textflow.maxSizeForLines`。シーンが描画時に縮め返さない）。10段はこの区間の等分（`sizeLevels`）。行が長すぎて下限に届かないビートはラダー全体が上限へ縮退する。compose のヒーロー（span scale 2× など）は最大 span 倍率で割って収める。
- **変化値**（`weird.sizeChange`）: `v = 1 − (1 − weird)(1 − energy)`。`v = 1` は次のビートが必ず別の段、`v = 0` は曲全体で `baseSize` 1つ（乱数も引かない）、中間は確率 `1 − v` で段を保つ。
- **バランス**（`direct.createSizeLadder`）: 各段の累積表示時間（ビート長）を追い、移る先は「これまでで最も使われていない段」から抽選（同点はランダム）。直前の段は禁止なので、`v = 1` で隣接ビートが同じ段にならない。曲頭はテーマサイズに最も近い段で開く。
- **density → 字間**（`direct.densitySpacing`）: `0.5` はテーマの `letterSpacing` のまま、`0` で +0.18em（ゆるい）、`1` で −0.03em（詰めた）。テーマ `text` への一曲単位の設定なので、全キュー・ビートが継承する。字間は `maxSizeForLines` の幅に含まれる（推定計測は字間を無視するため、`makeMeasurer` に `includesSpacing` を付けて二重加算を防ぐ）。
- **compose モードの例外**: `v = 0` の compose はテンプレート自身のサイズのまま（構図が絵そのもの）。`v > 0` では compose のビートにも同じラダーが乗る。
- **再ロール**（`direct.resizeBeats`）: 他のビートの実サイズ（beatStyles の解決値 × fontScale）で段の時間をシードし、対象だけ引き直す。対象は前後のビートの段（ときには片側だけ）を禁止される。プレーン経路のキュー再ロールはラダーを丸ごと引き直し、ビート再ロールは1ビートだけ。compose の再ロールは `v > 0` のときだけラダーを更新する。
- 注意（既知の例外）: `direct.test.js` の w=0 スナップショットは、energy が 0 でない限り「サイズ1つ」にならないため、比較から `beatStyles[*].text.size` を除外した（記録済みの例外。他はバイト単位で一致）。`weird.sizeChange` の引き金は生の `weird` と `energy` で、テキスト側の tamed な `w` では動かない。`v = 1` の不変条件は「別の段」であり px 一致ではない（狭い範囲では2段が同じ px へ丸まることがある）。
- テスト: `scripts/test/size-ladder.test.js`（15件: sizeChange の境界と単調性・density 非依存、densitySpacing と密度1の字間、maxSizeForLines の枠上限と字間込みの縮小、`change 1` の段の非連続と時間バランス±15%、`change 0` の乱数非消費、`change 0.5` の保持率 0.4〜0.6 と ±25%、weird 1 の run・weird 0/energy 0 の単一サイズ・下限が legibility しきい値を下回らないこと・resizeBeats の前後回避と他ビート不変、実フォント（NotoSans-Regular）で字間を二重加算しないこと）。`direct.test.js` はスナップショットの size 除外と、compose テストの隣接段の非連続を追加。全 614 件パス。
- 検証: `npm test`（614件）、`npm run check`（175ファイル）、`SA_SMOKE=1 SA_SMOKE_RANDOM=1`（2回: autoSizeRange [49, 346] / [49, 280] = 下限〜全画面、autoStyled 全ビート（34/34・36/36）、autoLook 734・動き「特大」、autoFontStable true、deterministic true、glError 0）。Web 版 Studio（静的配信・実フォント8書体・ブラウザ実行）でも確認: weird 0/energy 0 は全12ビート同サイズ（94・change 0）、weird 1 は px 49〜565 で隣接段の一致0・全ビートが自範囲内・下限比 0.04537 ≥ 0.045、density 0 は字間 0.18 で全画面ビートの blockW 1362/limit 1805 に収まり（density 1 は −0.03・565px）、ビート再ロールは前後段 3/7/6 で回避・他ビート不変、キュー再ロールは段の非連続・外側の前後回避・他キュー不変、glError 0。
