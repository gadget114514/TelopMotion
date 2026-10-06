# TelopMotion

> English version: [README.md](README.md) ｜ 日本語版（このファイル）

**歌詞動画**のためのデスクトップアプリです。アプリは **Studio** で起動します：歌詞をインポート（SRT / LRC / JSON）し、ビートに再構成し、WebGL2 シェーダーでベクターテキストを描画し、すべてのグループをアニメーションさせ、動画として書き出します。データなしでプロジェクトを開始して手動で構築することも、歌詞をインポートして始めることもできます。

![Electron](https://img.shields.io/badge/Electron-44-47848f) ![Platform](https://img.shields.io/badge/platform-Windows-0078d4) ![License](https://img.shields.io/badge/license-MIT-green) ![Tests](https://img.shields.io/badge/tests-1025%20passed-brightgreen)

**[Web 版 → https://gadget114514.github.io/TelopMotion/](https://gadget114514.github.io/TelopMotion/)**

## 機能

- **Studio（メイン）**: 歌詞を映像プロジェクトに変換 — SRT / LRC / JSON インポート、ビートへのテキスト再構成（ページ、リキャップ、リピート）、WebGL2 シェーダーによるベクターテキスト描画、12 のモーション・エフェクトグループ、20 のページレイアウトプリセット、キーフレーム対応マルチトラックタイムライン、手動編集用インスペクタ、音声・映像の同期再生
- **マルチトラックタイムライン**: 字幕トラック、手続き型 Figure トラック、カスタマイズ可能な Backdrop トラック（`+ Backdrop`）、Video トラック（`+ Video`）、パターンフィラー、映像・画像レイヤー、クレジット
- **ビデオトラックとクロマキー**: ビデオトラックはトラックリスト内の任意の位置に配置でき、その下のトラックは映像の背後に描画されます。クロマキー（キーカラー、類似度、滑らかさ、スピル除去）でキーカラーをくり抜き、背後のトラックをその部分から見せられます
- **楽曲設定**（*Settings → Song*）: 曲名を付けてテンポを指定 — タイトルと作者名は最初のフィラー（イントロの空白）とクレジットに表示され、BPM に応じて各キューが小節グリッド（4/4）上でビートに分割され、フィラーの空白も小節ごとに分割されます（0 は読み込んだ音声に追従）
- **きめ細かい無効化スイッチ**: キュー、ビート、クリップ、字幕テキストをデータやスタイルを失わずに非破壊で有効・無効化できます（例：テキスト背景やフレームグラフィックを残したまま歌詞テキストだけ消音）
- **音声・映像の同時再生**: Studio プレビューで音声トラックとインポートした映像レイヤー（MP4/WebM）をリアルタイム同期再生し、フレーム精度のスクラブと WebCodecs 書き出しに対応
- **ページレイアウトエンジン**: 雑誌風・ファッション誌風・新聞風・twoColumn・原稿用紙・xCard・chatBubble・cafeMenu・score・poster など出版スタイルのレイアウトプリセット 20 種。自動リージョンフロー、背景デコ、ペーパースタイリング付き
- **検索可能なテキストエフェクトカタログ**: 日英の名前・説明で検索できる 376 以上の厳選テキストエフェクト、手続き型シェイプ装飾、0.1×〜10× に拡縮可能なフレームグラフィック、動的フォント変形
- **テーマ・ディレクション操作**: 楽曲セクションに追従する AI 支援の自動演出、スケールランダム化用テーマダイアログ、weird 閾値（`>= 0.6`）付きリピート拡縮、独立した背景クロック、分類済み 800 ルックのランタイムプール
- **歌詞のインポートとエクスポート**: SRT（タグ、`{fx:}`、スパン）、LRC（メタデータ、オフセット、複数タグ、インストゥルメンタルマーカー、拡張ワードタグ）、JSON（配列、`cues`、Whisper `segments`、秒 / ms / 時刻文字列）
- **5 言語対応**: 英語、日本語、スペイン語、フランス語、ロシア語（自動検出・切り替え可能）

## Studio 概要

![Studio overview](snapshot/studio-overview.png)

アプリは直接 Studio で起動します。**Start without data** をクリックして手動でプロジェクトを構築するか、歌詞をインポート（SRT / LRC / JSON）して始めます。

Studio は歌詞を映像プロジェクトに変換します：

- **Media**（左）: プロジェクト情報とビートが追従するテンポ（info タブ）、サムネイル付き映像インポートと背景／前景レイヤー操作（video タブ）、トラック読み込み後の波形・スペクトログラム付き音声タブ（audio タブ）
- **Preview**（中央）: 出力解像度でのレンダリング結果。オーバーレイに選択ハンドル、ガイド、`path` レイアウト点を表示し、音声と映像レイヤーの同時再生に対応
- **プレビュー品質**（*Settings → Quality*、auto / full / half / quarter）: シーンは実際にレンダリングされるフレームサイズでレイアウトされるため、品質を下げると異なるスケールではなく、同じ絵を小さく高速に描画します（720p / 1440p の映像書き出しや 2D フォールバックも同じ規則）
- **Inspector**（右）: キュー／ビートのテキストとタイミング、有効／無効スイッチ、ヘッダーの削除ボタン、テキストスタイル、トランスフォーム、ページレイアウトダイアログ、モーションプリセット検索ダイアログ、テキスト背景／フレームグラフィック操作、各エフェクトグループのパラメータとモーション（in / out イージング、スタッガー、ループ）、カラー、◆ キーフレームボタン
- **Timeline**（下）: マルチトラックレイアウト（subtitle、figure、backdrop、filler、background）、ルーラー、音声波形、ビートサブブロック付きキューブロック、キーフレーム付き要素レーン（ドラッグ、コピー／ペースト、イーズ、削除）、マーカー、秒・フレームへのスナップ、FG / BG レイヤーの独立トグル、トラック作成（`+ Track`、`+ Figure`、`+ Backdrop`）

テキストは `Intl.Segmenter` でレイアウトし、opentype.js でグリフアウトラインに変換、earcut で三角分割して WebGL2 で描画します。すべてのモーションは同一のトゥイーンシステム（`SA.tween`）を通るため、プレビューと書き出しは同一に動作します。レンダラーは決定的です：乱数はすべてシード付き生成器由来のため、同じプロジェクトの同じ時刻は常に同じ見た目になります。

### マルチトラックタイムラインとレイヤー構成

Studio タイムラインは独立したレイヤー表示を持つリッチなマルチトラック構成に対応します：

- **Subtitle トラック**: ビートに分解された歌詞キューを保持します。各トラックはミュート、字幕テキスト非表示、テキスト背景非表示、フレームグラフィック非表示の操作を備えます。字幕テキストの無効化は、テキスト背景や装飾フレームを残したまま歌詞だけを消音します。
- **Figure トラック**: 歌詞を引き立てる生成的手続きモチーフやベクターシェイプ用。前景（FG）と背景（BG）の独立トグルで、図形をテキストの前にも後ろにも配置できます。
- **Backdrop トラック**: スプリットスクリーン構成、幾何学パターン、色面のための専用ビジュアルレイヤー。タイムライン toolbar の `+ Backdrop` ボタンで追加します。FG / BG の独立した表示・有効トグルを備えます。
- **Background / Filler トラック**: キュー間の器楽ブレイクや無音を埋めるパターンフィラーと生成ギャップクリップ。テンポ指定時（*Settings → Song*）は空白が小節ごとに分割され、1 小節に 1 クリップが載ります。クレジットレイヤーは最初の小節に残るため、曲名は一度だけ示され、後続小節は動き続けます。
- **レイヤー描画順**（[doc/text-layer-design.md](doc/text-layer-design.md)）:
  1. Background クリップ → Background レイヤー（image / solid / video）
  2. Backdrop クリップ → Filler クリップ → Figure / Text-animation クリップ
  3. Subtitle トラックレイヤー:
     - オーナメントとテキスト背景（cell squares / em ornaments）
     - グリフマスクとブラー
     - 背景くり抜きと確定
     - リピートコピーと SDF
     - クローンと表現ストローク
     - 内側／外側エッジとフィル
     - スコープ付き装飾
     - テキスト後処理
  4. 前景レイヤー
  5. フレーム後処理、ブルーム、最終合成

  **Video トラック**はこの順序を分割します：トラックリスト内の位置で描画されるため、それより上のものは手前に、下のものは映像の背後に描画されます。クロマキー使用時は映像からキーカラーがくり抜かれ、背後のトラックがそこから透けて見えます。

### ページレイアウトエンジン

直線テキストや幾何学フォーメーションに加え、TelopMotion は出版スタイル・編集スタイル・画面 UI タイポグラフィ用の **Page Layout** エンジン（[doc/page-layout.md](doc/page-layout.md)）を備えています。

テキストは異なる機能ロール（headline、deck、body、caption、byline、price）に分割され、専用リージョンを自動折り返し・フォント拡縮・背景装飾（罫線、境界、紙の地色、吹き出し、グリッド、五線）付きで流れます：

| カテゴリ | プリセット（`type`） | ロール | 装飾 | 説明 |
|---|---|---|---|---|
| **汎用** | `flushLeft` | body | なし | 左揃え、幅 75% 境界 |
| | `center` | body | なし | 中央揃え、幅 80% 境界 |
| | `flushRight` | body | なし | 右揃え、幅 75% 境界 |
| | `justify` | body | なし | 両端揃え、バランスの取れたマージン |
| | `vertical` | body | なし | 伝統的な縦書き（日本語／回転ラテン） |
| | `grid` | body（cells） | なし | 1 文字ずつのグリッド配置 |
| **編集スタイル** | `magazine` | hero、deck、body、byline | 縦罫、太い見出しバー、アクセントのページ番号 | デッキ＋複数段組み本文付きの特集誌面 |
| | `fashion` | headline、body | コーナー L 括弧、ヘアライン縦罫 | 余白とトラッキングを活かしたモード誌レイアウト |
| | `newspaper` | headline、columns、dateline | 二重横罫、段間罫、ドロップキャップ | 複数段テキストフローのクラシック新聞記事 |
| | `twoColumn` | columns（2 段） | ヘアライン縦ディバイダ | ナレーション・朗読歌詞向け 2 段組み |
| | `threeColumn` | columns（3 段） | ヘアライン縦ディバイダ | 3 段組みスプレッド（縦長では 2 段に自動フォールバック） |
| | `manuscript` | title、cells（20×20） | 外枠、升目罫、中央の魚尾マーク | 伝統的な日本の原稿用紙 |
| **画面 UI** | `xCard` | name、handle、body、time | 角丸カード、境界、アバター円、X マーク、アクションアイコン | ソーシャル投稿カードレイアウト |
| | `chatBubble` | bubble（行ごと） | 左右交互のしっぽ付き吹き出し | メッセージアプリ風の対話バブル |
| **店舗** | `cafeSign` | headline、sub、est | チョークボード地、二重境界、コーヒー／星モチーフ | カフェ・ベーカリーのチョークボード看板 |
| | `cafeMenu` | title、name / price | ドットリーダー、装飾境界 | 品目と価格を自動分離するカフェメニュー |
| | `boutique` | title、body、sign | ヘアライン罫、ミニマルなロゴ円、広い余白 | 上品な高級ブティックの商品説明カード |
| **音楽** | `score` | staves、notes | 5 線の譜表、小節線、符幹 | ピッチカーブに沿って歌詞を配置する譜面 |
| **ポスター** | `poster` | hero、captions | 幾何学色面、ヘアライン罫、クロスヘアのトンボ | 巨大ヒーローワード＋散らしキャプションのグラフィックポスター |
| **なし** | `none` | — | — | 標準の単一ブロックレイアウト |

ページレイアウトは Inspector の **Page** セクションまたは専用ダイアログ（*Inspector → Page Layout…*）で設定します。

### エフェクトグループと検索カタログ

TelopMotion は視覚スタイルを 12 のエフェクトグループで整理しています：

Animation · Layout · Page · Enter · Exit · Hold · Location · Fill · Edge · Post · Background · Color

- **検索可能なエフェクトカタログ**: 376 以上の厳選テキストエフェクト（[doc/text-effects-en.csv](doc/text-effects-en.csv））をモーションプリセットダイアログ（*Inspector → Search Presets*）で日英の名前・視覚説明から検索できます。
- **分解軸**: 詳細は [doc/textdecor2.md](doc/textdecor2.md)（グリフ源、輪郭操作、変形、表現、テクスチャ、可視性、ドライバ、配置、タイミング、複製、重ね合わせ、スコープ）。
- **動的フォントサイズと頂点変形**: 文字ブロックは自身の中心を基準に滑らかに拡縮します（`hold.fontSize`、`hold.fillScreen`、`enter.megaZoomIn`、`exit.megaZoomOut`）。3 つの頂点シェーダー変形スロットで `jelly`、`wobbleWarp`、`twist`、`breathing`、`squashStretch`、`swirl`、`hold.warp` を文字変形のクリップなしで実行します。
- **テキスト背景とフレームグラフィック**: 0.1×〜10× に滑らかに拡縮し、ビートごとのランダム化と基準スケールをテーマダイアログで設定できます。
- **リピート配置**: weird 係数による決定的リピートパターン（`weird >= 0.6` でリピート配置を保証。[doc/repeat-design.md](doc/repeat-design.md) 参照）。
- **スコープ付き属性と文字単位カラー**: 特定文字スコープ（`first`、`last`、`alternate`、`nth`）への適用、文字単位テキストカラー（`fgColors`）、日本語縦書き／英語 90° 回転カラムに対応。

### 音声・映像の同時再生

- **同期再生**: Media パネルで音声（MP3、WAV、AAC など）を読み込み、Settings → Layers で映像レイヤー（MP4、WebM）を追加すると、タイムライン再生時に映像レイヤーが音声トラックとリアルタイム同期します。
- **スクラブとシーク**: 再生ヘッドのスクラブで音声・映像の両方をフレーム精度でシークします。
- **Media パネル解析**: 読み込んだ音声トラックの波形・スペクトログラムをリアルタイム表示します。
- **オーディオリアクティブ束縛**: 任意の数値エフェクトパラメータを周波数帯域（low、mid、high、RMS）にゲイン・クランプ付きで束縛できます（*Settings → Audio reactive…*）。

### テキスト再構成

1 つの SRT キューは **beats** になります：セーフエリアに収まるページ分割（日英の言語対応改行）、全文リキャップ、ロングホールド用リピート、強調モーメントに分かれます。テンポ指定時（*Settings → Song*）は音楽の小節グリッド上でビート分割（4/4 で 1 小節 1 ビート）され、読み重みで単語が分配されてビートに乗ります。テンポ変更で全キューが再フローします。ビートは手動編集可能（区切りドラッグ、分割、結合、テキスト編集、ピン留め、無効化）で、残りはその周りで再構成されます。

### 書き出し形式

- **動画**: WebCodecs による MP4（H.264 + AAC。Opus フォールバック）と WebM（VP9 + Opus）。Electron ではストリーミング保存先、Web では File System Access API を使用。書き出しダイアログ（Ctrl+E）で形式、解像度（720p / 1080p / 1440p）、fps（30 / 60）、ビットレート、音声、品質を選択。進捗バーに ETA 表示、クリーンにキャンセル可能
- **透過書き出し**: アルファ出力用にストア専用 PNG シーケンス `.zip`（保証）。VP9 アルファ WebM はベストエフォートで環境依存
- **レイヤー**: 背景・前景レイヤー（単色、アルファ付き画像、映像レイヤー）。不透明度、ブレンドモード（normal / add / multiply / screen）、フィット（cover / contain / stretch / actual）、角丸、トランスフォーム（位置／拡縮／回転）付き。Settings → Layers… で編集
- **プロジェクト**: `.telopmotion.json`
- **歌詞**: SRT（`{fx:}` タグあり／なし）、LRC、JSON（Output → Export lyrics）

## Web 版（GitHub Pages）

同じ `renderer/` フォルダを静的サイトとして配信します。Web ビルドでは：

- `studio.html` を直接開けば動作します：データなしで開始するか、歌詞をインポート（SRT / LRC / JSON）します。プロジェクトファイルと自動保存は IndexedDB に格納されます。

### Pages 設定

サイトは `.github/workflows/static.yml`（標準の GitHub Pages「Static HTML」ワークフロー）によりリポジトリルートからデプロイされ、`main` へのプッシュごとにリポジトリ全体がアップロードされます。コミット済みルート `index.html` は `renderer/studio.html` にリダイレクトします（Studio がメインモード）。そのため `https://<user>.github.io/<repo>/` でアプリが配信されます。

GitHub Pages は一度だけ **GitHub Actions** ソースを使う必要があります（Settings → Pages → Build and deployment → **Source: GitHub Actions**）。ブランチデプロイも動作します：Source `main` / `(root)` の場合、同じルート `index.html` がワークフローなしでアプリを配信します。ルート `.nojekyll` により Pages がリポジトリに Jekyll を実行しません。

## フォントライセンス

Studio は `renderer/fonts/` に静的 OFL フォントを同梱します（Noto Sans Regular / Bold、Noto Serif Regular、Noto Sans JP Regular / Bold、Dela Gothic One、Bebas Neue）。SIL Open Font License 1.1 の下でライセンスされます。バージョンと取得元 URL は `renderer/fonts/OFL.txt` と `renderer/fonts/SOURCES.md` を参照ください。同梱ライブラリ（`opentype.js`、`earcut`、`mp4-muxer`、`webm-muxer`）のライセンスは `renderer/vendor/LICENSES.txt` に保持されます。

## 動作環境

- Windows 10/11（x64）
- 開発用 Node.js 18+（Node 24 でテスト）

## はじめに

```bash
npm install
npm start
```

アプリは Studio で開きます。*File → Import lyrics (SRT / LRC / JSON)…* で歌詞をインポートするか、**Start without data** を押して手動でプロジェクトを構築します。

## Windows インストーラーのビルド

```bash
npm run dist
```

`dist/` に出力されます：

- `TelopMotion-Setup-1.0.0.exe` — NSIS インストーラー（インストール先を選択可）
- `TelopMotion-Portable-1.0.0.exe` — ポータブル版、インストール不要

ビルドは無署名のため、Windows SmartScreen の警告が出る場合があります。`dist/win-unpacked/` に展開済みアプリが入ります。スモークテスト（`SA_SMOKE=1 SA_SMOKE_LYRICS=1 "dist\win-unpacked\TelopMotion.exe"`）でパッケージ済みバンドルからフォントとベンダーファイルが読み込まれることを検証します。

## プロジェクト構成

```
doc/                    アーキテクチャ・設計ドキュメント：page-layout、text-layer、repeat、textdecor2、app-design
main.js                 Electron メインプロセス：ウィンドウ、IPC、ダイアログ、キャッシュ、自動保存、asset:read
preload.js              レンダラーに公開する contextBridge API
scripts/demo30.js       DEMO 30：ルック試聴用の 30 秒ショーケースリール
scripts/distinct-count.js 知覚的に異なるエフェクト署名のカウント
scripts/fx400.js        FX 400：代表エフェクトの決定的カタログ＋テストプロジェクト
scripts/fx400mix.js     FX 400 MIX：400 の完全ルックデモ（主役エフェクト＋支援キット）
scripts/fx800.js        FX 800：800 の番号・名前付きデモを 4 つの 200 エフェクトプロジェクトに分割
scripts/figure-showcase.js Figure ショーケース：全 figure モチーフ＋モーション軸を 1 プロジェクトに
scripts/looks-classify.js 800 デモを分類（モーション量、5 軸、テーマ）。Random look 用
scripts/check.js        lib/、scripts/、renderer/js/、main.js、preload.js の node --check（223 ファイル）
scripts/vendor.js       opentype / earcut / mp4-muxer / webm-muxer を renderer/vendor にコピー
scripts/test/           単体テストスイート（node --test で 91 テストファイル、1025 テスト）
demo/                   生成デモプロジェクト、キューリスト、索引、プレビューシート
renderer/               UI：studio.html（Studio）、css/、js/
renderer/js/            共有：format、platform、srt、lrc、lyrics-json、lyrics-file、color
renderer/js/lyrics/     歌詞エンジン：font、geometry、textflow、layout、page-layout、page-scene、motion、scene、engine、looks、shape-ops、pattern-variants、text-effects-data
renderer/js/lyrics/effects/  グループ別エフェクト記述子＋ CPU 実装（animation、layout、page、enter、exit、hold、location、fill、edge、post、background、color、text-bg、vary、repeat）
renderer/js/lyrics/gl/  WebGL2：context、shaders、SDF、passes、layers
renderer/js/studio/     Studio：project、store、io、menu、preview、timeline、controls、inspector、overlay、page-dialog、motion-dialog、song-dialog、theme-editor、direct
renderer/data/          生成ランタイムプール：fx800.looks.json（Random look 用 800 分類ルック）
renderer/fonts/         OFL フォント＋ SOURCES.md ＋ OFL.txt
renderer/vendor/        同梱ライブラリ＋ LICENSES.txt
```

## テストとツール

```bash
npm run check                       # 全スクリプトの構文チェック（223 ファイル ok）
npm test                            # 単体テストスイート（91 テストファイルで 1025 テスト）
npm run demo30                      # 30 秒ショーケースリール生成（scripts/demo30.js）
npm run distinct                    # 知覚的に異なるエフェクト署名のカウント
SA_SMOKE=1 npx electron .           # 起動チェック：Studio がコンソールエラーなしで読み込まれること
SA_SMOKE=1 SA_SMOKE_LYRICS=1 npx electron .   # フォント、ベクターテキスト、穴、音声同期、WebGL フォールバック
SA_SMOKE=1 SA_SMOKE_BEATS=1 npx electron .    # SRT 再構成：ページ、リピート、リキャップ、孤児
SA_SMOKE=1 SA_SMOKE_MOTION=1 npx electron .   # フォーメーション、enter / exit / hold タイプ、変形
SA_SMOKE=1 SA_SMOKE_FONT=1 npx electron .     # 動的フォントサイズ：fillScreen / fontSize / megaZoom ブロック拡縮、squash と swirl
SA_SMOKE=1 SA_SMOKE_SHADERS=1 npx electron .  # 全 fill / edge / post / background タイプ（gl.getError）
SA_SMOKE=1 SA_SMOKE_EDIT=1 npx electron .     # 選択、オーバーライド、キーフレーム、孤児
SA_SMOKE=1 SA_SMOKE_TIMELINE=1 npx electron . # キュー編集＋ SRT、キーフレーム編集、波形、スナップ
SA_SMOKE=1 SA_SMOKE_STUDIO=1 npx electron .   # Studio シェル：メニュー、undo、自動保存、i18n カバレッジ
SA_SMOKE=1 SA_SMOKE_RANDOM=1 npx electron .   # プリセット、シード付き再ロール、ロック、パレット、800 ルック抽選
SA_SMOKE=1 SA_SMOKE_EXPORT=1 npx electron .   # MP4 + AAC、WebM + Opus、透過 PNG zip
SA_SMOKE=1 SA_SMOKE_LAYERS=1 npx electron .   # 画像／単色／映像レイヤー、モーション、ブレンド、フィルター
SA_SMOKE=1 SA_SMOKE_HOME=1 npx electron .     # データなし Studio 初回起動＋歌詞インポート（SRT / LRC / JSON）
SA_SMOKE=1 SA_SMOKE_SHOT=1 npx electron .     # snapshot/studio-overview.png 再生成（README 用）
SA_SMOKE=1 SA_SMOKE_QUALITY=1 npx electron .  # full / half / quarter プレビューは同一フレーム描画
SA_SMOKE=1 SA_SMOKE_AUDIO=1 npx electron .    # オーディオリアクティブ束縛、音声／映像同時再生
SA_SMOKE=1 SA_SMOKE_FILLERS=1 npx electron .  # フィラークリップ、クレジットモード、タイムラインとインスペクタ
```

### FX 400（代表エフェクト）

`test/test_1_to_400.srt` は 400 個の番号付き 2 秒キューです。`scripts/fx400.js` は 400 の代表エフェクトの決定的・番号付きカタログと、キュー n がエフェクト n を持つプロジェクトを構築し、Studio で視覚確認できます：

```bash
npm run fx400 -- build                    # test/fx400.catalog.json、test/fx400.md、test/fx400.telopmotion.json を書き出し
npm run fx400 -- build --text raw         # SRT テキスト保持（既定は文字エフェクトが見やすい長めサンプル）
npm run fx400 -- show 42                  # エフェクト 42 のレシピ表示
npm run fx400 -- apply 42 --project <file> --cue 12 --out <file>   # エフェクト 42 を 1 キューに適用
```

モーション駆動グループ（animation、layout、enter、exit、hold、location）は実モーション評価器で素の既定ルックと比較測定します：知覚閾値未満の候補は除外し、ほぼ同一の亜種は重複除去するため、カタログには見分けられるエフェクトのみが残ります。シェーダーグループはタイプ同一性を保持し、強めのパラメータ刻みのみ追加します。MD 索引には測定スコア、検証方法、可視効果を生まなかったタイプ（`hold.none`、`fill.solid` など）を記録します。

`test/fx400.telopmotion.json` を *File → Open project…* で開き、タイムライン再生（またはスクラブ）でエフェクトを確認します。背景エフェクトは bg トラック上のクリップとして適用されます（プロジェクト version 2 にキュー単位の画面背景はありません）。

### FX 800（4 つの 200 エフェクトデモ）

`scripts/fx800.js` は FX MIX サンプラーを拡張した **800 の番号・名前付きデモ**です — 各 1 完全ルック（主役エフェクト＋レジストリ全体からの支援キット）で、隣接デモがほぼすべてのスロットで異なり、2 デモが近接しないようサンプリングされ、200 キューずつの Studio プロジェクト 4 つに分割されます：

| デモ | 番号 | プロジェクト | キューリスト |
|---:|---|---|---|
| 1 | No.1–200 | `demo/fx800-1.telopmotion.json` | `demo/fx800-1.srt` |
| 2 | No.201–400 | `demo/fx800-2.telopmotion.json` | `demo/fx800-2.srt` |
| 3 | No.401–600 | `demo/fx800-3.telopmotion.json` | `demo/fx800-3.srt` |
| 4 | No.601–800 | `demo/fx800-4.telopmotion.json` | `demo/fx800-4.srt` |

各プロジェクトは 1 キュー 3 秒で 10 分です。キューテキストにデモ番号と名前が入ります。`demo/fx800.md` は番号索引（番号、名前、支援キット）、`demo/fx800.catalog.json` に全レシピを格納します。各デモの文字サイズは 5 段階ラダー（56 / 70 / 88 / 110 / 138、約 1.3× 刻み）を巡回し、色は読みやすい 6 パレットロールを巡回するため、隣接同士で両方が一致しません。`SA_SMOKE=1 SA_SMOKE_FXDEMO=1 npx electron .` で先頭 16 キューのコンタクトシートを `demo/fx800-preview-1.png` に描画します（`_FILE`、`_FROM`、`_COUNT`、`_COLUMNS`、`_TILE`、`_OUT` で上書き可）。

パターン背景は **1404 種ライブラリ**由来です（`renderer/js/lyrics/pattern-variants.js`：grid、dots、stripes、rings、triangles、diamonds、hexes、rain、checker、polka、正弦曲線、waves、random fill の 13 アニメーションモード × 9 サイズ刻み × 12 要素数）。各デモは独自の刻みを取るため、400 / 800 デモ実行で同じタイリングは二度出ません。同じライブラリは *Random*（自動演出）が backdrop トラックに作る背景パターンクリップにも供給されます。静止バリアントは存在しないため、背景は常に動きます。

```bash
npm run fx800 -- build                     # カタログ、索引、4 プロジェクト、ルックプールを書き出し
npm run fx800 -- show 642                  # デモ 642 を表示（名前、パート、レシピ）
npm run fx800 -- list --part 3             # No.401–600 を一覧
npm run fx800 -- apply 642 --project <file> --cue 12 --out <file>   # 1 デモを再利用
```

### Figure ショーケース（モチーフとモーション）

`figure` トラック専用のレビュープロジェクトがあります。`scripts/figure-showcase.js` は **`figures.MOTIFS` の全モチーフ**を 1 モチーフ 3 秒キューで巡回し、生成元ファミリー別（`base`、`bold`、`proc`、`scene3d.js` 由来 `scene`、`figure-geo.js` 由来 `geo`、`gl/fields.js` 由来シェーダー・シミュレーションフィールド `field`）にグルーピングした上で、クリップが持てる**各モーション軸**を基準モチーフ（`burst`）に固定し、隣接キューが評価軸のみ異なるようにします：

| 軸 | 値 |
|---|---|
| `in` / `hold` / `out` | 4 / 4 / 3 モーション |
| `sync` | `beat`、`free`、`text` |
| 2D `camera` | 8 モーション、クリップ全体に適用 |
| 手続きモーション | 17 レイヤーモーション規則（ゲノムはシードからのみ成長するため、各規則はそれを描く最初のシードを取得） |

全 107 キュー、約 6 分です。**Help → Figure showcase**（ファイル探索不要）または *File → Open project…* で開けます。各セクションのキューは [demo/figure-showcase.md](demo/figure-showcase.md) にあります。キュー名は 5 言語の `studio.figure.*` 由来のため、Studio の言語設定でラベル表示されます。4 つの GPU シミュレーションモチーフは *Settings → Allow stateful effects* の背後にあります（既定 off）。ショーケースを開くとセッション限定でゲートが on になり、実際に表示されます。

```bash
npm run figure-showcase -- build                          # renderer/data/figure-showcase.json と索引を書き出し
node scripts/figure-showcase.js list                      # セクションと全キューを表示
node scripts/figure-showcase.js list --section camera
npm run figure-showcase -- build --sections base,field    # 一部モチーフファミリーのみ再構築
```

### Random look

`npm run fx800 -- build` は全デモを分類してランタイムプール `renderer/data/fx800.looks.json` も書き出します：800 ルック各々に測定済み**モーション量**（SA.motion 評価器が 2 秒ビートの 9 フレームを標本化し、最大の移動／拡縮／回転／変形振幅を取得。still / small / medium / large / extreme に分類）、**5 軸プロファイル**（speed、energy、softness、density、brightness）、**テーマ親和性**（ジャンルプロファイル）を持ちます。スタイルはエフェクトレジストリ既定値との差分で格納され、プール全体で約 1.9 MB です。

Studio の *Random look* ボタン（Generate メニュー、タイムライン ✨、Re-roll ボタン）はプールを読み込み：

1. 楽曲テーマと 5 軸で 800 から 1 つ抽選 — 高 `energy` / `speed` 目標は大モーションルック優先、`softness` は質感、`density` は賑やかさ、`brightness` はトーン。テーマ付き抽選はそのジャンルに合うルックを重み付け
2. そのルックを曲全体に適用（entrance、exit、hold、fill、edge、post、repeat、テキスト背景、背景クリップ）。デモの主役エフェクトが曲の顔として残ります
3. 同じ軸から細部パラメータを調整 — パレット再生成、文字サイズ／間隔は density・softness 軸に追従、デモの書体は維持

再ロールは表示中ルックを除外して別物を抽選します。プール読み込み不可時は従来の生成器のみテーマにフォールバックします。`demo/fx800.md` に全デモのモーション分類を記載しています。

## ドキュメント

アーキテクチャ・設計・エフェクトの包括ドキュメント：

- [doc/page-layout.md](doc/page-layout.md) — ページレイアウトエンジン仕様、20 プリセット、リージョンフロー、装飾描画
- [doc/text-layer-design.md](doc/text-layer-design.md) — レイヤー描画パイプライン、背景くり抜き、後処理境界、レイヤー分離
- [doc/textdecor2.md](doc/textdecor2.md) — 12 軸での完全エフェクト分解、タイプレジストリ、ロードマップ
- [doc/text-effects-en.csv](doc/text-effects-en.csv) — 日英名・カテゴリ・説明付き 376 以上のテキストエフェクトカタログ
- [doc/repeat-design.md](doc/repeat-design.md) — リピート配置設計と固有署名カウント
- [doc/app-design.md](doc/app-design.md) — Studio・歌詞動画エンジン全体アーキテクチャ

## ライセンス

MIT
