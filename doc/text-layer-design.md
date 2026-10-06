# 字幕レイヤーの描画構造と放射ワイプの扱い（text-layer-design）

`doc/app-design.md` §7.10 のテキストバックグラウンド（`bgShape`）と、字幕レイヤーに掛かる後処理（Post 効果）の境界を固定する設計文書。
「背景」「字の上に描き足す処理」「Post 効果」を混同すると、放射ワイプが背景を削る・背景が字と一緒に加工される、といった取り違えが起きる。本書は描画の層構造と各処理の責務を 1 枚にまとめ、放射ワイプを自動選択から外す方針を記録する。

- 対象コード: `renderer/js/lyrics/engine.js`、`renderer/js/lyrics/gl/passes.js`、`renderer/js/lyrics/effects/text-bg.js`、`renderer/js/lyrics/effects/post.js`、`renderer/js/lyrics/moods.js`
- 実装状況: 層分離（§2）・背景サイズ（§5）・放射ワイプの自動選択除外（§6）は実装済み。

---

## 1. 用語

| 用語 | 実体 | データ | 描かれる層 |
|---|---|---|---|
| テキストバックグラウンド | 文字ごとのセル正方形。字の裏に描く | `style.bgShape`（`type: 'square'`、`unit` なしのみ） | 背景レイヤー |
| 装飾（オーナメント） | 円・星・帯・em の正方形などの飾り。字の裏に描く | `style.ornShape`（`square` 以外の形状、em の正方形） | 背景レイヤー（背景より下） |
| 背景トラック / backdrop クリップ | 字幕レイヤーとは別レイヤーの映像・図形 | `project.tracks` の `background` / `backdrop` / `filler` / `figure` / `textAnim` トラックのクリップ | シーン（字幕トラックより下） |
| Post 効果 | 字幕レイヤー（またはシーン全体）を後から加工する処理 | `style.post[]` の各インスタンス | `target` により字幕レイヤー / シーン |

- テキストバックグラウンドは定義上「セル正方形」だけ。セルは送り幅×フォントサイズで、`cellMetrics`（`text-bg.js:279`）が em の送り幅から返す。ランタイムの scene レターは送り幅を px で運ぶため、実行経路は `cellMetricsFor`（`text-bg.js:268`）で px を em に正規化してから `cellMetrics` へ渡す。`evaluateBg`（`text-bg.js:367`）は `bgShape` に対して `unit` / `width` / `height` / `offset` / `rotation` を無視し、常に 1×1 セル・回転なしで状態を作る（`text-bg.js:381-384`）。
- `ornShape` は旧 `bgShape` の自由形状（円・星・em 正方形など）の受け皿で、`isBackground`（`text-bg.js:311`）が「cell の正方形かどうか」で振り分ける。エンジンは装飾 → バックグラウンドの順に描く（`engine.js:1929`, `engine.js:1933`）。
- 背景トラック（`kind: 'background'` のクリップ）はフレーム全体の映像で、字幕の 1 ビートとは別の描画単位。`backdrop` clip は文字の背後に置く図形レイヤー。どちらも `activeClips`（`engine.js:140`）で字幕トラックより前に描かれる（`engine.js:1901-1908`）。
- Post 効果は「テクスチャを入力に取り、加工して書き戻す」処理。ジオメトリを足すのではなく、既に描かれた字幕レイヤー/シーンをサンプリングして色とアルファを作り直す（`passes.js:1002`, `passes.js:1033`）。

---

## 2. 描画順（層分離後）

フレーム全体は奥から手前に次の順で描く（`engine.js:1897-1908` のクリップ列 → `engine.js:1922-2094` の字幕 → `engine.js:2111-2119` の前景・フレーム後処理）。

1. background clip → background layers → backdrop clip → filler → figure / textAnim（`engine.js:1901-1908`）

> **ビデオトラックは上の列を分割する。** `kind: 'video'` のトラックは `project.tracks` の並びのその位置に描かれる。`engine.drawSegments(tracks)` はトラックの末尾（タイムラインでは最下段の行）から先頭へ走査し、ビデオトラックを通るたびに「通常トラック群 → ビデオ」のセグメントを吐く。従ってビデオより下に並ぶトラックは先に描かれ、ビデオがその上を覆う。ビデオトラックが無ければ全トラックが 1 群（＝従来の順序）になる。複数のビデオトラックは複数のセグメント、隣接する 2 本は続けて描かれる。
>
> クロマキーは `track.chroma`（`enabled` / `color` / `similarity` / `smoothness` / `spill`）で、`gl/layers.js` のレイヤー用フラグメントシェーダ内で CbCr 平面の距離として計算する。抜いた箇所のアルファは 0 なので、後ろの字幕・図形・後景がそのまま透ける。CPU 側の実装は `SA.glLayers.chromaState` / `chromaAlpha`（テスト用）。なお可視な字幕より手前に来るクリップはテキストマスクを受けない（`maskFor`）：動画が既に覆っている字をくり抜く穴になるだけなので。
2. 字幕トラック（下のトラックから順に）。1 ビートごとに:
   1. `beginLayer`（`engine.js:1932`）
   2. **装飾 → バックグラウンド**（`engine.js:1929`, `engine.js:1933` → `drawBackgroundPass` `engine.js:1677`）。どちらも字の裏。`pipeline.textBackground`（`passes.js:887`）でセル/装飾を描き、`pipeline.fill` / `pipeline.edge` で背景レイヤーに色を乗せる。
   3. 字のマスク（`pipeline.text` `engine.js:1963` / `passes.js:666`）と per-letter blur（`pipeline.letterBlur` `engine.js:1966`）。
   4. **`knockout`（`engine.js:1973` / `passes.js:940`）で字の部分を背景レイヤーからくり抜き、`commitLayer(1)`（`engine.js:1974` / `passes.js:1059`）で背景レイヤーをシーンへ先に確定。** 続けて `beginLayer`（`engine.js:1975`）で空のレイヤーを取り直す。
   5. repeat コピー（`drawRepeatCopies` `engine.js:1996`）と `sdf()`（`engine.js:1997`）。コピーはシーンへ直接 commit され、字の裏に回る。
   6. clones（`engine.js:2000-2020`）。こちらもシーンへ直接 commit。
   7. 表現（stroke / pieces / particles、`engine.js:2021`）。
   8. 裏エッジ → fill → 前面エッジ（`innerGlow` / `bevel`）。エッジは `top` の有無で前後に分かれる（`engine.js:2045`, `engine.js:2047`, `engine.js:2060` / `edge.js:11` の `TOP`）。
   9. 部分装飾（`drawScopedDecor` `engine.js:2062`）。scope ごとにマスクを切り直して字の上に描く。
   10. `post(target:'text')`（`engine.js:2067-2089`）。字レイヤーだけを加工する。
   11. typewriter のカーソル（`drawTypewriterCursor` `engine.js:2092` / 定義 `engine.js:1787`）。
   12. echo の commit（`engine.js:2093`）→ `commitLayer(1)`（`engine.js:2094`）。
3. 前景レイヤー（`engine.js:2112`）
4. `postFrame`（`target:'frame'` の Post。`engine.js:2117` / `passes.js:1033`）→ bloom（`engine.js:2118`）→ `finish`（`engine.js:2119`）

分離の要点は 2-4。以前は背景・装飾・字・エッジ・Post がすべて同じ `targets.layer` に載っていたため、`post(target:'text')` は字だけでなく背景も加工し、repeat / clones の `beginLayer` が背景を消すこともあった。今は背景レイヤーが先にシーンへ確定するので、後段の処理は字だけを見る。

---

## 3. 「描き足す処理」と「加工する処理」

字の上に重なるものは 2 種類ある。**描き足す処理**はジオメトリやピクセルを追加し、**加工する処理**は既存テクスチャをサンプリングして作り直す。

| 処理 | 種類 | 場所 | 対象 |
|---|---|---|---|
| 前面エッジ（`innerGlow` / `bevel`） | 描き足す | `engine.js:2060`、`edge.js:11` | 字の形に沿って上へ重ねる |
| 部分装飾（`drawScopedDecor`） | 描き足す | `engine.js:2062`、`drawScopedDecor` `engine.js:592` | scope 内の字だけマスクを切り直して上へ重ねる |
| typewriter のカーソル | 描き足す | `engine.js:2092` | 字のセルに矩形を足す |
| repeat / clones | 描き足す | `engine.js:1996`, `engine.js:2000` | 同じ字をずらして足す（字の裏、背景の表） |
| text post | 加工する | `engine.js:2067-2089` / `passes.js:1002` | 字幕レイヤーのテクスチャ全体 |
| frame post | 加工する | `engine.js:2117` / `passes.js:1033` | シーン全体（マスクで字を戻す） |
| 前景レイヤー | 描き足す（別レイヤー） | `engine.js:2112` | シーンの一番上に画像・映像を足す |

- 描き足す処理はブレンド（`ONE, ONE_MINUS_SRC_ALPHA`）で加算合成される。Post 効果だけがブレンドを切り、入力テクスチャをサンプリングして書き戻す（`passes.js:1005-1026`）。
- 背景（`bgShape` / `ornShape`）は「字の裏に描き足す」側だが、字本体とは別のレイヤーとして先にシーンへ確定する。そのため text post の対象に**含まれない**（§2-4 の分離）。

---

## 4. Post 効果の位置づけ

Post 効果は `target` で 2 つに分かれる（`postTarget` `post.js:99`）。既定は `target:'text'`。

### `target:'text'`（字幕レイヤーだけ）

- そのビートのレイヤーテクスチャ（字・エッジ・部分装飾・カーソル、そして layer に残っている直近のコピー）を入力にし、加工して書き戻す（`passes.js:1002`）。`source = targets.layer` → 描画先 `targets.postA` → 最後に `layer` と `postA` を入れ替える（`passes.js:1003-1026`）。
- `u_maskAmount = 0`。テキスト対象の Post は字と一緒に動くものとして、テキストマスクで保護しない（`passes.js:1019-1020` のコメント）。
- 背景（`bgShape` / `ornShape`）とシーン内の他レイヤーは、このとき既にシーンへ確定済みなので**加工されない**。

### `target:'frame'`（シーン全体）

- 1 ビート分の Post ループでは実行せず、`framePosts` に type ごとの最大エンベロープだけを集める（`engine.js:2084-2087`）。全トラック・前景・クレジットを描いたあと、1 回だけ `pipeline.postFrame`（`engine.js:2117`）でシーン全体に掛ける。
- `source = targets.scene` を加工して `targets.postB` へ書き、`u_maskAmount = opts.mask`（`passes.js:1033-1057`）。`mask` が立っていると、事前に焼いたテキストマスク（`buildFrameTextMask` `engine.js:1895`）から `src` を混ぜ戻し、グリフ（+パディング）を元に戻す（`shaders.js:1492-1497`）。
- `maskOn` は字幕に重なるクリップ（figure / backdrop / filler）か frame グラフィックがあるフレームだけ立てる（`engine.js:1892-1895`）。

---

## 5. 背景の大きさの決め方

**背景は常に 1 セル正方形で、フォントの大きさにそのまま追従する。** `project.styleMode.seed` や `beat.id` から引く大きさの抽選は行わない（背景スケールは廃止。`text-bg.backgroundScale` と `params.maxScale` は削除）。2.5 セルまでのランダム拡大が「背景だけが字の大きさと合わない」原因だったので取り除いた。

セルは `cellMetrics`（`text-bg.js:279`）が送り幅×フォントサイズから作る。セルの送り幅は em 単位が契約だが、scene のレターは px で運ぶため、実行経路は `cellMetricsFor`（`text-bg.js:268`）で px を em に正規化する。旧実装は px の送り幅に `size` を掛けてセルが `送り幅(px)×size²` に膨らみ、正方形が字の右へ大きくずれていた。

- **基準**: `bgShape` の `evaluateBg` は `sizeX = sizeY = 1` セルを返す（`text-bg.js:381-384`）。`unit` や `width` は `bgShape` では読まれない。`BG_PARAM_KEYS`（`text-bg.js:105`）にもサイズの項目は無いので、Studio のインスペクタに大きさのノブは出ない。
- **エンジン**: `drawBackgroundPass`（`engine.js:1677`）は `evaluateBg` の状態をそのまま `pipeline.textBackground`（`engine.js:1716`）へ渡す。サイズを求める乱数を引かないので、スクラブでも書き出しでも同じ絵になる。
- **自動演出**: `applyGenreBackground`（`moods.js:2369`）は `bgShape` に色・`vary`・`skipSpaces` だけを書く（`moods.js:2467-2477`）。`square × enclose` の判定と乱数の引き方は変えていないので、同じ seed の絵は従来どおり再現される。
- **上限**: `capBackground`（`text-bg.js:234`）は装飾の安全網として残す。セルの上限は装飾 1.25、em は「テキストボックス + 0.6 em」（`engine.js:1705-1709`）。背景は 1 セルなので上限には当たらない。背景側の `cell` は 2.5 のままにして、`bgMotion` の `pop` / `stamp` などの動きスケールを潰させない。
- **安全性**: 背景は字より下の層にあり、字の部分は `knockout` でくり抜かれる（§2-4）。大きさを変えても字を覆い隠さない。`bgHidden`（トラックの背景オフ）は従来どおり背景だけを止め、装飾は残る（`engine.js:1917-1919`）。
- **3 つの行スイッチ**: 字幕トラックは Text Foreground（字本体、`textHidden`）・Text BG（定義背景、`bgHidden`）・Text Graphics（装飾と字付きエクストラ、`fgHidden`）の 3 行で ON/OFF する。`knockout` は Text Foreground がオフでも行われ、背景は字形の穴を保つ。knockout される処理は形状パスだけで、Text BG（`bgShape`）か Text Graphics（`ornShape`）に属する。

---

## 6. radialWipe の扱い

### 実体

- `radialWipe` は Post の画面効果で、`target:'text'`（`post.js:54`）。放射ワイプは角度スイープで、`startAngle` / `direction` / `feather` だけを持つ（`post.js:227-233`）。進行は `context.progress`（ビート進捗、`engine.js:1988`）に `envelope` を掛けた値。
- シェーダは `alpha = smoothstep(progress - feather, progress + feather, t)` を掛け、`color = vec4(src.rgb * alpha, src.a * alpha)` とする消去型（`shaders.js:1316-1326`）。テキストバックグラウンドとは無関係の処理で、以前は同じ層にいた背景も巻き込んで削っていた。

### 問題点

1. **消去型**: アルファを削るだけで、ワイプの縁が閉じると字が消える。ビートの出口トランジションとして作られている。
2. **進行がビート全体**: `progress` はビート開始〜終了の線形。専用の duration / delay を持たず、再生中ずっと角度が進み、ビート末尾には文字がほぼ残らない。
3. **角速度が一定**: 進行にイージングが無く、等角速度でスイープする。速さ・タイミングを変えるパラメータが無い。
4. **自動で選ばれやすい**: `EXT_TRAITS.post` にのみ登録され（旧 `moods.js:323`）、weird ≥ 0.35 でプールが開き、`minWeird 0.55` を通ると weird 特性 0.8 でスコアされる。weird が高い曲ほど頻繁に引かれる。

### 決定

- **効果本体は残す**（`post.js` の descriptor、`shaders.js` の type 43、`fx-strings.js:813-985` の i18n）。手動で選べば従来どおり使える。
- **自動選択から外す**。`moods.EXT_TRAITS.post` の `radialWipe` エントリを削除した（旧 `moods.js:323`）。自動演出（moods / direct / fx400 / fx800）は今後この type を引かない。
- 軸評価は低減した: `scripts/fx-axes-overrides.json` の `post.radialWipe` を fear 0.45 → 0.2、speed 0.6 → 0.3 に変更し、`node scripts/fx-axes-build.js` で `renderer/data/fx-axes.json` と `renderer/js/lyrics/fx-axes-table.js` を再生成した。
- `smartness.js:67` の 0.35（安っぽい側）と `looks-classify.js:206` の weird 0.7 は据え置き。自動では出ないので、既に手で持っているルックの分類と重みにだけ効く。
- `doc/effects.csv` と Studio の型一覧は効果本体が残るため変更なし。

---

## 7. 未解決事項

1. **テキストバックグラウンドの概念が狙いと合っているか（大きさの部分は解決）**
   「大きさはフォントに合わせる」は §5 のとおり解決（背景 = 1 セル正方形）。残る論点は定義そのもので、ユーザーが求める「帯・下敷き・囲み」のどれを指すのか、そもそも別概念（背景トラックの図形 / backdrop clip）に寄せるべきかは未確認。狙いを確認したうえで、この設計書に章を追加する。
2. **repeat / clones と背景の前後関係**
   分離前は repeat / clones が背景レイヤーの下に沈むことがあった。分離後は「背景 → repeat / clones → 字」の順になり、コピーが背景の上に出る。意図した前後関係かを目視で確認する。
3. **部分装飾（scope）と背景**
   `drawScopedDecor` は字レイヤーに描くため、scope 付きの fill / edge は背景の上に出る。背景に掛かる scope は現状サポートしない。
