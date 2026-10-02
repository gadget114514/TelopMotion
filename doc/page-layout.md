# Page Layout (紙面レイアウト) 機能仕様書

## 1. 概要 (Overview)

TelopMotion の既存の `layout` グループ (`lyrics/layout.js`, `effects/layout.js`) は、組み終えた文字を円・螺旋・円弧・波形などの幾何学的な隊列（formation）に再配置する機能であり、折り返し領域（region）、多段組、背景装飾などを持ちません。

これに対し、新たに導入された **`page`** グループ（UI表記: **紙面 / Page**）は、雑誌、新聞、原稿用紙、二段/三段組、SNS風カード、チャット吹き出し、カフェ看板/メニュー、ブティック説明、楽譜、ポスターといった「紙面構造」を実現するレイアウトエンジンです。

### 主な特徴
- **領域分割 (Region flow)**: テキストを役割（headline, deck, body, caption, byline, price など）に応じて領域に割り当て、各領域のスタイル（サイズ倍率、揃え位置、行間、字間、縦横方向）で個別に組版。
- **背景装飾 (Decor)**: 罫線（実線・二重線・点線）、枠、用紙色面（paper）、吹き出し、マス目、五線譜などの装飾を文字の背面に自動生成。
- **既存アニメーション・モーションとの完全な両立**: 全ての文字（letter）を同一のページ空間（左上原点）に配置し、`blockBBox` をページ全体に設定することで、既存の `motion.js`（enter / exit / hold）、`engine.js`、アンカー位置制御、文字色解決とそのまま共存。

---

## 2. アーキテクチャとパイプライン

```
style.page ──► page-layout.compose()   (純粋計算: DOM/フォント非依存の幾何配置)
                  │  regions[], decor[]
                  ▼
           page-scene.build()          (layoutText 注入: region ごとに組版・フィッティング・合成)
                  │  合成 layout (lines, words, letters, blockBBox, regions, decor)
                  ▼
           scene.js 平坦化             letters / lines / words / blockBBox
                  │
        motion.js                     state.rot += letter.baseRot
                  │
        engine.js                     pipeline.beginLayer → drawPageDecor → shapesPass → pipeline.text
```

### 1) `renderer/js/lyrics/page-layout.js` (UMD, 純粋計算)
- 入力: `compose(type, params, ctx)`
  - `ctx = { lines[], text, frame:{w,h}, size, direction, lang, rng, aspect }`
- 出力: `{ page:{w,h}, regions[], decor[] }`
- 20種類のプリセット計算ロジックおよび共通ヘルパー (`splitColumns`, `splitMenuLine`, `staffPitch`, `createRng` など) を提供。

### 2) `renderer/js/lyrics/page-scene.js` (UMD, 組版・合成)
- `build({ compose, layoutText, fonts, textStyle, source, composeLayout, size, lang, frame, style, rng })`
- 各 region に対してフォント・サイズ・行間・字間を適用し `layoutText` を呼び出し。
- 高さが region を超える場合はフォントスケールで自動 fit（最小 0.6倍）。
- 特殊 flow の後処理:
  - `justify`: 最終行および1文字行を除き、行末を揃える均等割り付け。
  - `cells`: マス目中心への文字吸着（原稿用紙など）。
  - `path`: 楽譜などのパス追従配置および音高による傾き (`baseRot`) の付与。
  - `bubble`: 行幅に合わせた吹き出し矩形と装飾の動的計算。
- 各 letter に `regionId`, `role`, `baseRot` を付与し、全 region の lines を通し番号で合成。
- `bbox` はページ全体の矩形を返すため、アンカー基準やセーフエリア計算がページ全体を対象に行われます。

### 3) `renderer/js/lyrics/shape-ops.js` (`decorPrimitives`)
- 高水準の装飾仕様 (`decor[]`) を低水準の描画プリミティブ (`rect`, `circle`, `capsule`, `polygon`, `cells`, `staff` 等) へ展開。
- カラーパレットに基づき、`ink`, `paper`, `accent`, `rule`, `muted` などの役割色を適用。

### 4) `renderer/js/lyrics/engine.js` (`drawPageDecor`)
- `pipeline.beginLayer()` 直後、テキスト描画 (`pipeline.text`) の前に `drawPrimitives(prims)` で装飾を描画。
- 文字の enter / exit 進行（`pe`, `px`）に連動しつつ、`decorLead`（既定 0.15s）により文字が出る前に背景が現れ、文字が消えた後に装飾がフェードアウトする自然なアニメーションを実現。

---

## 3. プリセット一覧 (20種 + none)

| カテゴリ | プリセット名 (`type`) | 役割構成 (Roles) | 背景装飾 (Decor) | 特徴・挙動 |
|---|---|---|---|---|
| **汎用 (Generic)** | `flushLeft` | body | なし | 左寄せ、幅制限 (75%) で端に整然と配置 |
| | `center` | body | なし | 中央寄せ、幅制限 (80%) |
| | `flushRight` | body | なし | 右寄せ、幅制限 (75%) |
| | `justify` | body | なし | 最終行以外の行末を揃える均等割り付け |
| | `vertical` | body | なし | 縦書き、右端から左へ行配置 |
| | `grid` | body (cells) | なし | 列数 `cols` 等分のマスに文字を1字ずつ流し込み |
| **紙面・出版 (Editorial)** | `magazine` | hero, deck, body, byline | 縦罫線、見出し下太横罫、accent ページ番号 | 雑誌の特集ページ。大見出しとリード文、2段組の本文 |
| | `fashion` | headline, body | 四隅の L 字罫、中央の細い縦線 | 余白を大きく取ったモード誌。大文字化・超広字間 |
| | `newspaper` | headline, columns (N段), dateline | 二重横罫、段間縦罫、ドロップキャップ | 新聞記事。指定列数 (`columns`) に本文を均等流し込み |
| | `twoColumn` | columns (2段) | 段間の細い縦罫線 | シンプルな二段組（見出しなし本文中心） |
| | `threeColumn` | columns (3段) | 段間の細い縦罫線 | 三段組（縦長アスペクト時は自動で2段にフォールバック） |
| | `manuscript` | title, cells (20×20マス) | 外枠、マス目格子線、中央魚尾 (fishTail) | 原稿用紙。縦書き/横書き対応。マス目中心に文字吸着 |
| **画面 UI (Screen UI)** | `xCard` | name, handle, body, time | 角丸カード、細枠、アバター円、右上の「×」、下部アクションアイコン | SNS（X風）ポストカード。ユーザー名・本文・時刻 |
| | `chatBubble` | bubble (行ごと) | 奇数行=左（paper色）、偶数行=右（accent色）角丸吹き出し | メッセージチャット。話者ごとに吹き出しとしっぽを交互配置 |
| **店舗・看板 (Shop)** | `cafeSign` | headline, sub, est | 黒板色背景、チョーク風二重枠、コーヒー豆/星の装飾、下部波線 | カフェやベーカリーの店頭黒板看板風デザイン |
| | `cafeMenu` | title, name / price (行ごと) | 点線リーダー線、タイトル飾り罫、メニュー外枠 | カフェのメニュー表。区切り文字から品名と価格を自動分離 |
| | `boutique` | title, body, sign | 細い横罫線、ミニマルロゴ円、大きな余白枠 | ハイブランドやブティックの洗練された商品説明プレート |
| **音楽 (Music)** | `score` | staves (五線譜), notes | 5本線五線譜、小節線、音符符頭・符幹 | 文字を決定論的な音高カーブで五線譜上に配置、音高差で文字が傾く |
| **ポスター (Poster)** | `poster` | hero, captions | ランダム幾何色面、細罫線、トンボ十字マーク | Pinterest風グラフィックポスター。巨大主役語＋散らばるキャプション |
| **解除** | `none` | — | — | 紙面レイアウト無効（通常の1ブロック組版） |

---

## 4. パラメータ仕様

### 共通パラメータ
- `margin` (number, 既定: 0.06): 画面短辺に対するページ余白率。
- `gutter` (number, 既定: 0.03): カラム間や見出し間の間隔率。
- `columns` (int, 既定: 2 or 3): 新聞や段組プリセットの段数。
- `ruleStyle` (select, 既定: `solid`): 罫線スタイル (`solid`, `double`, `dotted`, `none`)。
- `paper` (select, 既定: `auto`): 用紙背景 (`auto`: 文字色と反転明度, `none`: なし, `accent`: アクセント色)。
- `decor` (bool, 既定: `true`): 背景装飾の描画フラグ。
- `decorLead` (number, 既定: 0.15s): 文字の登場に対する装飾の先行時間（前倒し秒数）。
- `seed` (int, 既定: 1): ポスター等の乱数シード。

### プリセット固有パラメータ
- `dropCap` (`newspaper`): 1段目の冒頭1文字をドロップキャップ（巨大頭文字）にするか。
- `vertical` (`manuscript`): 原稿用紙の縦書き・横書き切り替え。
- `typing` (`chatBubble`): 最終行の下に入力中（3点ドット）インジケーターを表示するか。
- `align` (`vertical`): 縦書き行の揃え位置 (`top`, `center`, `bottom`)。
- `rows` (`grid`): グリッドの行数指定（0で自動）。

---

## 5. UI と操作方法

### 1) インスペクタ (Inspector)
- 選択中の cue または beat をインスペクタで開くと、最上部に新設された **「紙面」 (Page layout)** セクションが表示されます。
- タイプ選択ドロップダウンのほか、**「✦ プリセットを選択…」** ボタンからモーダルを開いて視覚的に選択できます。
- 紙面レイアウトが有効な場合、後続の「レイアウト」グループには「※ 紙面レイアウト有効中」の注記が表示されます。

### 2) プリセット選択ダイアログ (Page Dialog)
- インスペクタの「プリセットを選択…」ボタン、またはタイムライン上の cue / beat 右クリックメニュー「紙面プリセット…」から開きます。
- **Canvas2D リアルタイムサムネイル**:
  - 全20プリセットの領域と背景装飾をワイヤーフレーム描画。
  - **16:9**（横長）と **9:16**（縦長）のサムネイル切り替えトグルを搭載。
- **タグ・カテゴリ絞り込み**:
  - 「すべて」「紙面・出版」「画面UI」「店舗・メニュー」「楽譜」「ポスター」「汎用」のタブで素早くフィルタリング。
  - キーワード検索バーによる即時絞り込み。
- **適用と解除**:
  - カードクリックまたは「適用」ボタンで選択中の cue に適用。
  - フッターの「紙面を解除」ボタンで即座に `{ type: 'none' }` にリセット可能。

---

## 6. 既知の制限事項 (Known Limitations)

1. **縦中横・ルビの非対応**:
   - `vertical` および `manuscript`（縦書き）において、英数字2文字を1マスに収める「縦中横」や「ルビ（ふりがな）」は現在サポートされていません。
2. **禁則処理の範囲**:
   - 行頭の句読点（、。）や閉じ括弧を前行末にぶら下げる簡易的な禁則処理は `lyricsFont.layoutText` の折り返し機構に準拠します。追い出し・追い込みの高度な段落最適化は行われません。
3. **長文時の縮小 fit**:
   - region の高さに対してテキストが溢れる場合、`page-scene.js` が自動でフォントサイズを縮小（最小 0.6倍）して収めますが、それでも溢れる極端な長文は後続の `frame-guard` により安全域内にクリップまたは収容されます。
