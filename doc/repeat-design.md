# Repeat 設計書：知覚的に区別できる効果を800種類にする

## 0. 目的・範囲

| 項目 | 内容 |
|---|---|
| 目標 | 知覚的に区別できる効果（§2 の定義による）を **800種類以上** にする |
| 現状 | 約500種類（見積もり。§8 の計測で確定させる） |
| 手段 | 新しい効果グループ `repeat` を追加する。Arrangement（並べ方）、Sequence（時間の使い方）、Variation（複製ごとの属性変化）からなる |
| 本数 | 2つのモードを持つ（下の表） |
| 追加目標 | **+300以上**（計画値は約590） |
| 範囲外 | 既存グループの変更（§9 の「不足したときの調整手段」を除く） |

| モード | 複製の数 | 画面上の本数（元を含む） | 知覚のされ方 | Variation の効き方 |
|---|---|---|---|---|
| **通常**（`copies: 1〜3`） | 1〜3 | 2〜4 | 1本ずつ数えて読める（サビタイジングの範囲） | 複製ごとの違いがそのまま読み取れる |
| **多数**（`copies: 'many'`） | 5〜11、`fill` は画面を埋める | 6以上 | 模様・壁・質感として見える | 規則は「質感の性質」として知覚される（例：縞・濃淡・コラージュ） |

既存の [app-design.md](app-design.md) のルールはすべて適用する：独自実装、決定論的な描画、seed 付き RNG、`SA.tween` の使用、UI 文字列は5言語。

## 1. 用語

| 用語（コード） | 日本語 | 定義 |
|---|---|---|
| **Repeat** | 複製配置 | 本体の文字列を複製して並べる効果グループ `repeat` |
| **Copy** | 複製 | Repeat が描く1本分。本体（main）も Copy 列の1要素として index を持つ |
| **copies** | 複製数 | `1 \| 2 \| 3 \| 'many'`。通常モードの本数は `n = copies + 1`（2〜4） |
| **CountBin** | 本数ビン | Signature 上の本数の区分：`pair`（2本）/ `few`（3〜4本・直線系）/ `tri`・`quad`（grid・radial の3本・4本）/ `many` |
| **Arrangement** | 並べ方 | Repeat の type |
| **Sequence** | 時間の使い方 | `static`・`cascade`・`counterSlide`・`counterScroll`・`wave` |
| **Variation** | 属性変化 | 1つの Attr と1つの Rule の組。最大2つまで |
| **Attr** | 属性 | `size`・`color`・`font`・`decor` |
| **Rule** | 規則 | `progress`・`alternate`・`random`・`oddOne` |
| **Signature** | 知覚シグネチャ | 効果を知覚境界で量子化したキー。キーが同じなら「同じ効果」とみなす（§8） |
| Echo / Clone | （既存） | `animation.echo`（重なる残像）と `style.clones`（手動の複製）。Repeat とは別物として扱う |

## 2. 知覚カテゴリ境界（すべての設計判断の基準）

| 次元 | 量子化の方法 | 同じとみなす範囲 |
|---|---|---|
| 速度・時間 | log2 バケット（<0.15s / 0.15–0.35 / 0.35–0.8 / >0.8） | 比が2倍未満 |
| 方向 | 90°単位の4方向 ＋ 回転の向き | 90°未満 |
| イージング | 6系統：linear / smooth / back / elastic / bounce / steps | 同じ系統内 |
| **本数** | `pair` / `few`（直線系の3〜4本）/ `tri`・`quad`（grid・radial）/ `many`（5本以上） | 直線系の3本と4本は同じ。5本以上は何本でも同じ |
| 重なり | Copy 間の間隔が 1em 未満なら「影・残像」扱い（既存の echo・extrude と同じ） | — |
| 大きさ | log(1.4) のバケット | 比が1.4倍未満 |
| 色 | 11の基本色名 × 明度3段階 | 色名と明度段階が同じ |
| グラデーション | 色に吸収される。例外は向きの反転と、単色かグラデーションかの違い | 同じ構造 |
| フォント | 系統クラス（§5.3） | 同じ系統クラス |
| 装飾 | `solid` / `hollow` / `glow` / `shadow` | — |

**設計原則**：パラメータは、境界と1対1に対応する段階値（select）で持つ。ランダム生成や手動編集で「境界の内側だけの差」が生まれないことを、仕様上の保証とする。

## 3. 現状の仕組みと再利用する部分

| 既存の仕組み | 場所 | Repeat での扱い |
|---|---|---|
| 効果レジストリ | `lyrics/effects/registry.js` | `repeat` を `GROUP_DEFAULTS` に追加し、`fx.register` で登録する |
| `animation.echo` | `lyrics/engine.js:191` `echoPlan` | そのまま残す（tag `overlap` のため、ランダム生成からは除外されている） |
| `style.clones` の描画 | `engine.js:216-275`（`cloneEnvelope` / `cloneTransform` / `cloneColors`）、`engine.js:970-991` | **Copy の描画はこの経路を再利用する**（`beginLayer → fill → commitLayer`） |
| edge の描画 | `engine.js:995-1030`（`SA.fx.edgeUniforms` → `pipeline.edge`、SDF が必要） | `decor` の実現に使う |
| 字ごとの fontId | `lyrics/scene.js:46-50`（`geometry.cacheKey(fontId, glyph, size)`） | `font` Variation の別メッシュ生成に使う |
| ランダム生成 | `lyrics/random.js`（`GROUPS` / `SINGLE_GROUPS` / `candidatesFor` / `sampleParam`） | `repeat` を追加し、出現確率と除外表を加える |
| 字ごとの変化の先例 | `lyrics/effects/vary.js` | Rule の実装パターンを参考にする |
| フォント | `lyrics/font.js` `BUILTINS`（日本語対応は3書体） | 書体を追加し、系統クラスを持たせる |

## 4. `repeat` グループの仕様

### 4.1 データ形式（`style.repeat`）
```js
style.repeat = {
  type: 'grid',                  // Arrangement（'none' のときは1本だけ）
  enabled: true,
  params: {
    copies: 3,                   // 1 | 2 | 3 | 'many'
    dir: 'down',                 // 伸ばす方向（§4.3。type ごとに有効な値が違う）
    mainIndex: 'end',            // 'end' | 'center'
    gap: 'normal',               // 'tight'(1.0em) | 'normal'(1.5em) | 'wide'(2.5em)
    fit: 'shrink',               // 'shrink' | 'overflow'（brick・fill・counterScroll では overflow が既定）
    sequence: 'cascade',         // 'static' | 'cascade' | 'counterSlide' | 'counterScroll' | 'wave'
    seqSpeed: 'fast',            // 'fast' | 'slow'
    seqOrder: 'fromMain',        // 'fromMain' | 'toMain'
    copyOpacity: 'flat',         // 'flat' | 'fade'（値は §6.6）
    var1Attr: 'size',  var1Rule: 'progress', var1Level: 'strong',   // 'none' で無効
    var2Attr: 'none',  var2Rule: 'alternate', var2Level: 'normal',
    variationPreset: 'custom',
    seedShift: 0,
  },
};
```
- Variation は平坦なキーで持つ。既存の Inspector の自動 UI と `sampleParam` がそのまま使えるため。
- 解決順序は他のグループと同じ。

### 4.2 本数
| copies | 本数 | CountBin |
|---|---|---|
| 1 | 2 | `pair` |
| 2 | 3 | 直線系は `few`、grid・radial は `tri` |
| 3 | 4 | 直線系は `few`、grid・radial は `quad` |
| `'many'` | type ごとの既定値（下表）。`brick`・`fill` は画面を埋める数（上限40） | `many` |

`many` の既定本数：stackV 6、rowH 6、diagonal 6、grid 9（3×3）、radial 8、fan 7、tunnel 7、scatter 10。

### 4.3 Arrangement（配置の計算式）
`w` と `h` は本体の外接矩形の幅と高さ、`em = h`、`g` は gap、`k` は本体からの相対 index。

| type | 位置・変形 | 有効な copies | dir | 補足 |
|---|---|---|---|---|
| `none` | — | — | — | 1本だけ |
| `stackV` | `(0, ±k·h(1+g))` | 1–3, many | `down` / `up` / `both` | 9:16 に向く |
| `rowH` | `(±k·(w+g·em), 0)` | 1–3, many | `right` / `left` / `both` | はみ出す場合は `fit` に従う |
| `diagonal` | `k·(0.5w+g·em, ±h(1+g))` | 1–3, many | `downRight` / `upRight` | |
| `grid` | 2×2（3本は L 字）、many は3×3 | 2–3, many | — | |
| `radial` | 半径 `R = w/2+g·em`、角度 `360/n·k`。本体は上 | 2–3, many | `upright` / `tangent` | 3本は三角、4本は十字 |
| `fan` | 本体の下端を支点に回転。spread は narrow 40° / wide 110° | 2–3, many | `narrow` / `wide` | |
| `tunnel` | `scale = r^k`（r=0.8 / 0.65）で消失点に向かって縮める | 2–3, many | `center` / `up` / `down` | 意図的に重ねる唯一の type |
| `scatter` | seed 付きの Poisson-disk 配置。最小距離 1em、回転 0 / ±15° | 2–3, many | — | |
| `brick` | stackV の各行に Copy を横に並べ、奇数行を `w/2` ずらして画面を埋める | many のみ | — | 本体は中央の行 |
| `fill` | 画面全体に格子状に敷き詰め、フレーム端で切る。本体は中央の最前面 | many のみ | — | 本体の視認性は §6.6 |

- `mainIndex: 'center'` は `dir: both` のときと、radial・brick・fill でだけ意味を持つ。
- `tunnel` 以外では、Copy 同士の外接矩形が重ならないことを `plan()` で保証する。重なる場合は gap を広げ、それでも無理なら全体を縮小する。

### 4.4 Sequence
| sequence | 挙動 | seqSpeed：fast / slow | 有効な組み合わせ |
|---|---|---|---|
| `static` | 全 Copy が本体の enter に合わせて出る（0.25s のフェード） | — | すべて |
| `cascade` | Copy k の遅延 = `k·step`。出方は fade ＋ scale 0.9→1（easeOutCubic） | step：通常 0.08s / 0.2s、many 0.04s / 0.1s | すべて |
| `counterSlide` | 行ごとに逆向きへ横にずらし続ける（端でつなげない） | v = 0.12 / 0.04 frame/s | stackV・grid、通常モードのみ |
| `counterScroll` | 行ごとに逆向きに流し、端でつなげて循環させる（マーキー） | v = 0.15 / 0.05 frame/s | stackV・rowH・grid・brick・fill、many のみ |
| `wave` | 位相をずらして上下に動く：`dy = A·sin(2π(t/P − k/n))` | P = 1.2s / 2.5s、A = 0.25em | 本数3以上 |

- exit：全 Copy が本体の exit の envelope（強度の時間変化）に従う。cascade では逆順に消える。
- 第1版では、Copy は本体の LetterState を共有する。Copy ごとに字の enter を時間差で再生する機能（time-shift）は §10 の拡張とする。

### 4.5 組み合わせの正規化（`normalize(params)`）
| 無効な入力 | 正規化後 |
|---|---|
| copies=1 で Rule が `progress` / `alternate` / `random` | `oddOne`（2本では「違う」としか読めないため） |
| copies=2 で Rule が `alternate` | `oddOne`（ABA は「真ん中だけ違う」と同じ見え方になるため） |
| `grid` / `radial` / `fan` / `tunnel` / `scatter` で copies=1 | copies=2 |
| `brick` / `fill` で copies が many 以外 | `many` |
| `counterSlide` かつ many | `counterScroll` |
| `counterScroll` かつ通常モード | `counterSlide` |
| Sequence が有効でない type | `cascade` |
| `wave` かつ copies=1 | `static` |
| many で `oddOne` の対象が `last` | `main`（多数の中の「最後」は特定できないため） |
| var1 と var2 の Attr が同じ | var2 を `none` |
| `mainIndex: center` を使えない組み合わせ | `end` |

Inspector は、正規化で変わる選択肢をグレー表示する。`random.js` は正規化した後の値を保存する。

## 5. Variation（複製ごとの属性変化）

### 5.1 Rule の定義
Copy の index を `i`（0..n-1、本体を含む）とし、`u = i/(n-1)` とする。grid・brick・fill では、`i` は本体からの距離の順に振る。

| Rule | 値の計算 | 有効な本数 | many での見え方 |
|---|---|---|---|
| `progress` | `v(u)`：属性ごとの単調な系列 | 3以上 | 濃淡・遠近のグラデーション |
| `alternate` | 偶奇で A / B を切り替える（grid・brick・fill では市松） | 4以上 | 縞・市松 |
| `random` | seed 付き RNG で候補から選ぶ。隣と同じ値は選ばない | 3以上 | コラージュ |
| `oddOne` | 1本だけ違う。対象は `main` または `last` | 2以上 | 本体だけが際立つ（ポップアウト） |

### 5.2 属性ごとの値
| Attr | progress | alternate | random の候補 | oddOne | Level：normal / strong |
|---|---|---|---|---|---|
| `size` | `scale = r^k`（many では `r^u·(n-1)` を下限0.3で止める） | 1.0 / 0.6 | {0.5, 0.75, 1, 1.4} | ×1.6 | r = 0.8 / 0.65 |
| `color` | 色相を段階的にずらす（`hue`）、または明度を下げる（`light`） | パレットの A / B（ΔL ≥ 20 または色相差 ≥ 60°） | パレット | アクセント色 | 色相ステップ 30° / 60°（many では全体で 120° / 360°） |
| `color`（グラデーション） | fill2 も同じ規則で変える。alternate では `gradient: invert` | ← | ← | ← | — |
| `font` | 系統クラスを「強さ」の順に並べる（§5.3） | 2系統 | 系統プール | 別の系統 | — |
| `decor` | solid → shadow → glow → hollow | solid / hollow | 4種類 | 本体が solid、他が hollow | — |

色は既存の `SA.color.resolve` と `cloneColors` の経路で解決する。コントラストが足りない組み合わせは、候補から外す。

### 5.3 フォントの系統クラス
| クラス | 日本語フォント | 欧文フォント | 強さの順位 |
|---|---|---|---|
| 明朝 | **Noto Serif JP**（追加） | Noto Serif | 1 |
| ゴシック（細） | Noto Sans JP Regular | Noto Sans Regular | 2 |
| 丸ゴシック | **Zen Maru Gothic**（追加） | — | 3 |
| 手書き | **Klee One**（追加） | — | 3 |
| ゴシック（太） | Noto Sans JP Bold | Noto Sans Bold | 4 |
| ポップ | **RocknRoll One**（追加） | — | 5 |
| 極太・ディスプレイ | Dela Gothic One | Bebas Neue | 6 |

- すべて OFL ライセンス。日本語フォントはサブセット版を使い、出典を `fonts/SOURCES.md` に追記する。
- 本文に日本語が含まれるときは、欧文専用の書体を候補から外す。
- **1ビートで使う書体は最大4つ**。many では4書体を周期的に割り当てる（別書体のマスクは4つまでで済む）。
- `font.js` の `BUILTINS` に `fontClass` と `rank` を追加する。

### 5.4 同時に変える属性の上限
- Variation は最大2つ。3属性以上をランダムに変えると、どれも「コラージュ風」という1つの Signature に落ちるため禁止する。
- var1 と var2 が同じ Rule のときは、2つの変化が1つの流れとして知覚される。数えるときに割り引く（§7）。

### 5.5 厳選プリセット（`variationPreset`）
| id | 内容 | 必要な本数 |
|---|---|---|
| `perspectiveFade` | size progress ＋ color light progress | 3以上 |
| `popAlternate` | color alternate ＋ decor alternate | 4以上 |
| `ransomNote` | size random ＋ font random | 3以上 |
| `heroOutline` | decor oddOne（main）＋ color progress | 3以上 |
| `rainbowStep` | color hue progress（60°、many では 360°） | 3以上 |
| `loudQuiet` | size alternate ＋ font alternate | 4以上 |

## 6. 実装

### 6.1 新しいモジュール `lyrics/effects/repeat.js`
既存の effects ファイルと同じ dual パターンで書き、DOM と WebGL には触れない。

```js
fx.register({ group: 'repeat', type: 'grid', params: [...], cost: 2, tags: ['repeat'],
              normalize(params) {...}, costOf(params) {...} });
SA.repeat = {
  plan(instance, beat, t, dims, rng) -> Copy[],  // dims: { width, height, box:{w,h,cx,cy}, aspect, safeArea }
  normalize(params) -> params,
  signature(instance) -> string,
};
// Copy = { index, isMain, dx, dy, scale, rotate, opacity,
//          color|null, hueShift, gradientInvert, fontClass|null, decor, envelope }
```
- `plan` は純関数で、決定論的に動く。
- `brick` / `fill` は、フレームと交差する Copy だけを返す（カリング）。
- 値の時間変化はすべて `SA.tween` / `SA.easing` を通す。

### 6.2 レジストリの拡張（`effects/registry.js`）
- `GROUP_DEFAULTS.repeat = { type: 'none', params: {} }` を追加する。
- descriptor に任意のフック `normalize` と `costOf` を追加する。`withDefaults` の最後で `normalize` を呼ぶ。
- `costOf(style)` の single グループのループに `repeat` を加える。descriptor に `costOf(params)` があれば、そちらを優先する。

### 6.3 engine への統合（`lyrics/engine.js` の clones ループ付近）
1. `result.letters` から本体の外接矩形 `box` を求める。
2. `SA.repeat.plan(...)` で Copy 列を得る（本体の Copy は除く）。
3. 各 Copy について `beginLayer` → `fill`（Copy の色を反映した colors を渡す）→ decor 用の `edge` → `commitLayer(opacity·envelope, transform)` の順に描く。
4. **decor の実現方法**：`sdfTarget` を共有する。
   - `hollow`：fill の α を 0 にして `outline` を描く。
   - `glow`：`neonGlow` を描く。
   - `shadow`：`dropShadow` を描く。
5. **font の実現方法**：Copy の書体が本体と違う場合は、`scene.js` で fontId を置き換えた別のシーンを作り、別マスクと別 SDF で描く。キャッシュキーは `(beat.id, text, fontId, size)` で、ビートが切り替わるときに破棄する。
6. **many の最適化**：同じ書体・同じ decor の Copy は、変換だけを変えてマスクを使い回す（1回のマスク生成で N 回 commit）。
7. 描画順：Copy は本体の背面に描く。

### 6.4 ランダム生成（`lyrics/random.js`）
- `GROUPS` と `SINGLE_GROUPS` に `repeat` を追加する。`none` 以外が選ばれる確率は30%。
- copies の割合：1 : 2 : 3 : many ＝ 35% : 30% : 20% : 15%。
- `brick` / `fill` が選ばれる割合は、Repeat 全体の10%以下にする（画面を支配するため）。
- Variation を1つにする確率を60%、2つにする確率を25%、プリセットを使う確率を15%とする。
- 除外表（互いに組み合わせない）：
  - `repeat ∈ {grid, radial, scatter, brick, fill}` と、layout の `circle` / `spiral` / `path` / `scatter`
  - Repeat と `enter.morphFromPrevious`
  - `repeat=fill` と、post の dissolve 系・`kaleidoscope`・`mirror`
- 9:16 のとき、`rowH` の copies は1までにする。
- 最後に `normalize` を通す。

### 6.5 負荷
- `costOf = 1 + ceil(描画本数/4) + (decor が solid 以外なら +1) + (別の書体の数 × 2)`
- `brick` / `fill` では、描画本数はフレーム内に見える本数とする（最大40）。
- プレビュー予算（上限24）を超えるときは、プレビュー中だけ次の順に軽くする。書き出しには影響させない。
  1. many の本数を半分にする
  2. 別書体の Copy を本体と同じ書体で描く
  3. decor を solid にする

### 6.6 可読性の保証
- 本体は最前面に描き、不透明度は1。
- `copyOpacity`：通常モードは flat 0.7 / fade 0.7→0.3。many は flat 0.45 / fade 0.45→0.1。
- Variation が `none` のときは、`copyOpacity: fade` を既定値にする。
- `fill` / `brick` のとき、本体に次のいずれかを自動で付ける（`autoContrast`）：
  - bgShape（帯）
  - outline
  - 本体の周囲 1em にある Copy の不透明度を下げる

### 6.7 UI と i18n
- Inspector：`repeat` セクションは descriptor から自動で作られる。Variation の項目は「変化」という小見出しにまとめる。clones セクションはそのまま残す。
- `studio/fx-strings.js`：type、各パラメータ名、Rule、Attr、プリセット名を5言語で用意する。
- 追加・更新する主なファイル：`effects/repeat.js`、`effects/registry.js`、`engine.js`、`random.js`、`font.js`、`studio/fx-strings.js`、`studio/inspector.js`、`renderer/studio.html`、`fonts/`、`fonts/SOURCES.md`。

## 7. 種類数の予算

### 7.1 通常モード（2〜4本）：Arrangement × 本数 × Sequence × 方向
| type | pair（2本） | few / tri / quad（3〜4本） | dir の数 | 小計 |
|---|---|---|---|---|
| stackV | 3（static・cascade・counterSlide） | few：4 | ×3 | (3+4)×3 = 21 |
| rowH | 2 | few：3（static・cascade・wave） | ×3 | (2+3)×3 = 15 |
| diagonal | 2 | few：3 | ×2 | (2+3)×2 = 10 |
| grid | — | tri：4、quad：4 | ×1 | 8 |
| radial | — | tri：3、quad：3 | ×2 | 12 |
| fan | — | few：3 | ×2 | 6 |
| tunnel | — | few：3 | ×3 | 9 |
| scatter | — | few：3 | ×1 | 3 |
| **合計** | **19** | **65** | | **84** |

### 7.2 多数モード（many）：Arrangement × Sequence
many では、方向の違い（上下・左右の鏡像）は質感に埋もれるため、掛けない。

| type | Sequence | 数 |
|---|---|---|
| stackV・rowH・grid | static・cascade・counterScroll・wave | 4 × 3 = 12 |
| diagonal・radial・fan・tunnel・scatter | static・cascade・wave | 3 × 5 = 15 |
| brick・fill | static・cascade・counterScroll・wave | 4 × 2 = 8 |
| **合計** | | **35** |

### 7.3 Variation パターン数
| 本数 | パターン数 | 内訳 |
|---|---|---|
| 2本 | 5 | none ＋ 4つの Attr それぞれの oddOne |
| 3本（tri） | 17 | none ＋ 4 Attr × {progress, random, oddOne} ＋ 3本で使えるプリセット4 |
| 4本（quad）、および直線系の few | 23 | none ＋ 4 Attr × 4 Rule ＋ プリセット6 |
| many | 12 | 数が多いと規則が質感に溶ける（縞・濃淡・コラージュ・ポップアウトなど）ため、実効値として見積もる |

### 7.4 合計
| 項目 | 素の組み合わせ | 割引 | 区別できる数 |
|---|---|---|---|
| 通常 pair：19 × 5 | 95 | | |
| 通常 直線系 few：45 × 23 | 1,035 | | |
| 通常 grid：4×17 ＋ 4×23 | 160 | | |
| 通常 radial：6×17 ＋ 6×23 | 240 | | |
| **通常モード 小計** | **1,530** | ×0.29 ＝ 0.8（Rule と配置の重複）× 0.7（Sequence が Variation に隠れる）× 0.75（鏡像の差は弱い）× 0.7（注意が向く特徴は3つ程度まで） | **約450** |
| **多数モード**：35 × 12 | **420** | ×0.34 ＝ 0.8（重複）× 0.7（Sequence が隠れる）× 0.6（細部が質感に埋もれる） | **約140** |
| **Repeat による追加分** | | | **約590（下限300）** |
| 既存分 | | | 約500 |
| **合計** | | | **約1,090（目標800）** |

- 通常モードは、複製ごとの違いが読み取れる本数に収まるので、Variation がそのまま区別できる種類の数になる。
- 多数モードは数こそ少ないが、印象の強い「模様・背景的」な効果を担う。
- 割引係数は §8 の計測で置き換える。

## 8. 検証：`scripts/distinct-count.js`

### 8.1 考え方
クラスタリングは使わず、**知覚シグネチャが何種類あるか**を数える。

1. **候補の列挙**
   - Repeat：§4 と §5 の全段階値の直積を列挙し、`normalize` で重複をまとめる。
   - 既存グループ：descriptor ごとに、`random` の範囲と選択肢を §2 の境界で量子化した代表値を列挙する。
2. **シグネチャの計算**：描画はせず、純関数（`motion.js` の LetterState、`SA.repeat.plan`）から計算する。
   - enter / hold / exit の各区間から4フレームずつ、計12フレームを標本化する。
   - 次の量を §2 の境界で量子化し、連結する：本数ビン、外接矩形の縦横比、放射分布8ビン、速度（log2）、方向（4方向）、大きさ（log1.4）、Copy ごとの色名、書体クラスの並び、decor の並び、Rule の型。
   - many では、Copy ごとの並びの代わりに「質感の特徴量」を使う：色名ヒストグラム、大きさの分散のバケット、市松か縞かの判定。
   - fill・edge・post は type と主要な select 値をカテゴリ値として使う。
3. **既知の重複の統合**：`merge-table.json` で統合する（例：`tunnel` ≈ `stackV + size.progress`、many の `fill` ≈ many の `brick` + static）。この表は人手確認で更新する。
4. **出力**：グループごと・モードごとのシグネチャ数と合計を JSON と Markdown で出す。

### 8.2 較正用のテスト（`scripts/test/distinct-count.test.js`）
- 速度 ±10% → 同じ Signature、2倍 → 違う
- `quadOut` と `cubicOut` → 同じ、`quadOut` と `backOut` → 違う
- scale 1.2倍 → 同じ、1.6倍 → 違う
- 直線系の3本と4本 → 同じ、grid の3本と4本 → 違う、4本と many → 違う
- many の 6本と 9本 → 同じ
- copies=2 で alternate → oddOne と同じ Signature
- Copy の gap 0.8em → echo と同じ扱い

### 8.3 人手による確認
- 1つの境界だけが違う Signature の組を40組（通常30組、many 10組）選び、3人に「同じ／違う」を判定してもらう。
- 「同じ」と答えた割合が30%を超えた次元は、バケットを統合したうえで数え直す。

### 8.4 受け入れ条件
- Repeat の Signature 数が300以上
- 全体の Signature 数が **800以上**

## 9. フェーズ（各フェーズ1コミット。`npm test` と `npm run check` が通ること）

| # | 内容 | 受け入れ条件 |
|---|---|---|
| 1 | `repeat.js`（全 Arrangement・Sequence・`normalize`、brick と fill のカリング）、レジストリの拡張、engine への統合（同一書体・Variation なし・マスクの使い回し）、`repeat.test.js` | 決定論的に動く。本数が仕様どおり。tunnel 以外で重なりがない。fill・brick でフレーム外の Copy を描かない。Studio で表示できる |
| 2 | Variation（size・color/グラデーション・decor）、プリセット、`autoContrast` | progress が単調、alternate が偶奇・市松で切り替わる、oddOne がちょうど1本、の各性質をテストで確認。decor 4種類が描ける |
| 3 | font の Variation、書体4つの追加、書体ごとのキャッシュ、`costOf`、プレビュー中の段階的な軽量化 | 日本語の文章で書体クラスを切り替えられる。プレビュー予算を守る |
| 4 | ランダム生成・Inspector・i18n 5言語・moods/genres の優先度（任意） | `random.test.js`（出現率・除外表・Variation 2つ以下・brick と fill の比率）と `fx-i18n.test.js` が通る |
| 5 | `distinct-count.js`、較正テスト、人手確認、レポート | §8.4 を満たす |

**不足したときの調整手段（効果の大きい順）**
1. 書体をさらに追加する
2. Sequence を追加する（`time-shift` での再生、`swap`：Copy 同士が位置を入れ替える）
3. Arrangement を追加する（`staircase`、`mirror`：上下反転の複製）

## 10. リスクと未決事項

| 項目 | 内容 | 対応 |
|---|---|---|
| 書体のファイルサイズ | 日本語のサブセット書体4つで十数MB増える | 使うときだけ読み込む。上限サイズは要判断 |
| 描画負荷 | fill の40本 ＋ decor ＋ 別書体の組み合わせ | マスクの使い回し、カリング、`costOf`、プレビュー中の段階的な軽量化 |
| 可読性 | fill・brick で本体の文字が埋もれる | `autoContrast` と、ランダム生成での低い出現率 |
| 9:16 と rowH | 画面幅に収まらない | `fit: shrink`。9:16 でのランダム生成では、rowH の copies を1までにする |
| time-shift | LetterState を複数回評価する必要がある | 第1版では扱わず、調整手段とする |
| 割引係数・既存分500 | どちらも見積もり | フェーズ5で実測する |
