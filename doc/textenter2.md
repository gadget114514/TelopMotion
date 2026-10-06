# テキスト入場アニメの追加（textenter2）

入場（`enter`）グループに 16 種のアニメーションを追加するための詳細設計。
16 種すべてを **A. ビート全体** と **B. 部分文字列（1 文字だけ・選んだ語だけ等）** の両方に適用できるようにする。2 つの適用単位は別章（§3 / §4）で設計する。

- 対象コード: `renderer/js/lyrics/effects/enter.js`、`renderer/js/lyrics/effects/registry.js`、`renderer/js/lyrics/motion.js`、`renderer/js/lyrics/scope.js`、`renderer/js/lyrics/engine.js`、`renderer/js/studio/inspector.js`、`renderer/js/studio/fx-strings.js`
- 関連設計: `doc/SUBSTRING-Memory.md`（部分演出 `style.scoped` とローカルモード）、`doc/textdecor2.md`
- 追加する要望（ユーザー指定順）:
  1. 一文字ずつ、拡大して
  2. 縦に伸ばしてから
  3. 横に伸ばしてから
  4. 文字背景付きで
  5. ゴムのように変形しながら
  6. 色ずれしながら
  7. 複数個ならべて
  8. 傾けながら
  9. 出たあとに傾ける
  10. 震わす
  11. 中央に円で
  12. 中央に円＋放射状
  13. 一文字ずつ異なる変形をさせて
  14. 一文字ずつ異なる点滅をしながら
  15. 文字のねじれ・もどし
  16. 部分文字の回転

---

## 1. 前提（既存の仕組み）

### 1.1 入場エフェクトの登録と呼び出し

```js
fx.register({
  group: 'enter',
  type: 'xxx',
  tags: [...],
  params: [{ key, kind, min, max, step, default, random }],
  cpu(state, p, params, rng, info) { ... },
});
```

- 登録先: `renderer/js/lyrics/effects/enter.js`（preset は `effects/staged-presets.js`）。
- `cpu` は `motion.js:775` で文字ごと・**毎フレーム**呼ばれる。`p` は入場区間でイーズ済みの進行度で、入場が終わったあとも `p = 1` で呼ばれ続ける。
  - → `p = 1` で恒等にしなければ「入場後の姿勢」を残せる（#9 で利用）。
- `info` には `i`（文字番号）、`N`（文字数）、`shortSide`、`blockCenter`、`blockHalf`、`letterX/letterY`、`local`、`letter` などが入る。
- `rng` は文字ごとに seed 済みの乱数（`letterRandom.enter`）。

### 1.2 文字ごとの時間差（スタッガー）

文字ごとの時間差は個々のエフェクトではなく、ビートのスタッガー（`motion.js:442-494`）が担う。

| キー | 意味 |
|---|---|
| `order` | `ltr` / `rtl` / `random` / `centerOut` など |
| `each` | 文字間の遅延（秒）。0 で全文字一斉 |
| `ease` | 遅延の分布カーブ |
| `from` / `unit` | 起点、単位（letter / word / line） |

文字 `index` の開始時刻は `enterStart = in.delay + offsets[index]`（`motion.js:700`）。

### 1.3 部分演出（scoped）

- `style.scoped[]` の各エントリは `{ group, type, params, scope, local, motion }`。
- `scope` は `scope.js` の kind: `range / words / keyword / span / nth / slice`。
  - 1 文字だけ: `{ kind:'slice', anchor:'text', from:'start', offset:3, length:1 }`
  - 一文字おき: `{ kind:'nth', ... }`
  - 特定の語: `{ kind:'keyword', ... }` / `{ kind:'words', ... }`
- **enter / exit の scoped は、その文字についてビートの enter を置き換える**（`motion.js:673-683` の `scopedAt(index,'enter')`）。加算ではない。
- タイミングは scoped 側の `motion`（`in.delay / duration / ease`）を使い、文字ごとのオフセットは **ビートのスタッガー `offsets[index]` をそのまま使う**（`motion.js:700`）。
- `local: true` のとき `localInfo` が `info` を差し替える: `i = rank`（部分内の順位）、`N = count`、`blockCenter = 部分文字列の中心`、`blockBBox / blockHalf = 部分の範囲`。
- 背景の scoped は `SCOPED_BG = ['bgFill','bgShape']`（`engine.js:2919`）。

### 1.4 使える state

`x, y, rot, scaleX, scaleY, skewX, tiltX, tiltY, opacity, blur, flash, colorMix, visibleFrac, wipeMode, wipeSoft, deform[]`

- `deform` の種類: `jelly / stretch / wobbleWarp / twist / swirl / breathing / flag / shearWave / melt / zoomBlock`
- 1 文字の state は色チャンネルを分けられない（`effects/shader-fx.js:372` のコメント）。色ずれは text 対象の post（`post.js` の `rgbShift` / `chromaticAberration`）を併用する。

### 1.5 背景・図形・複製

| 用途 | 既存 | 場所 |
|---|---|---|
| 文字ごとの背景 | `bgShape`（`square / rounded / circle / diamond / ...`）＋ `bgMotion`（`pop / stamp / grow / wipe / ...`） | `effects/text-bg.js` |
| 図形レイヤー | `post.shapeLayer`（shape `circle / ring / burst / ...`、`enterAnim: draw / pop / expand`、`followText: block / line / word / char / span`） | `effects/shape-layer.js`, `shape-ops.js` |
| 文字の複製 | style の `clones[].perLetter`（`planLetterVariants`） | `effects/letter-vary.js`, `registry.js:278` |

### 1.6 既存の類似エフェクトとの差分

| 既存 | 新規との違い |
|---|---|
| `zoomIn`（小→等倍、線形） | #1 はオーバーシュートして戻る |
| `stretch`（片軸の伸び→等倍） | #2/#3 は「伸びる→戻る→弾む」の二段 |
| `elasticPop`（等方の弾性） | #5 は体積保存の縦横逆相＋ jelly 変形 |
| `tiltIn`（3D の Y 軸傾き） | #8 は 2D の回転＋スキュー、#9 は入場後に傾きが残る |
| `flickerIn / neonFlicker` | #14 は文字ごとに周波数・位相・duty が違う |
| `radialIn` | #11/#12 は円図形を伴う |
| `hold.twist`（表示中ずっと Z 軸のねじれ） | #15 は入場でねじれて→ほどける（もどし）。軸を X / Y / Z から選べ、文字ごと / 帯としての両方 |
| `rotateIn` / `spinIn`（画面内 Z 軸回転）、`flip3D`（文字ごとの X/Y 傾き） | #16 は部分文字列を 1 枚の塊として X / Y / Z 軸まわりに回転させる（X/Y は位置・奥行き・遠近も計算）。正転・逆回し・往復 |

---

## 2. 適用単位の 2 系統

16 種すべてを次の 2 系統で使える。同じ type・同じ `cpu` を使い、違いは「置き場所」「info の基準」「companion の範囲」だけにする。

| | A. ビート全体 | B. 部分文字列 |
|---|---|---|
| 置き場所 | `style.enter` | `style.scoped[]` の `group:'enter'` エントリ |
| 対象 | ビートの全文字 | `scope` で選んだ文字（1 文字だけ・語・N 文字おき・範囲） |
| 基準座標 `info.blockCenter` | ビートのブロック中心 | `local:true`（既定）で部分文字列の中心。`local:false` はビート中心のまま |
| `info.i / N` | ビート内の番号 / 文字数 | `local:true` で部分内の rank / count |
| 時間 | ビートのスタッガー | 部分エントリの `motion` ＋ 部分内スタッガー（§4.3 で追加） |
| companion（背景・図形・色ずれ） | ブロック単位で 1 組 | 同じ `scope` を付けた scoped エントリとして 1 組 |
| 対象外の文字 | — | ビート全体の enter（A）がそのまま掛かる |

共通パラメータ（全 16 type に追加）:

| param | kind | 値 | 既定 | 意味 |
|---|---|---|---|---|
| `pivot` | select | `letter` / `line` / `block` | `letter` | 原点の基準。`letter` = 各文字、`line` = 行、`block` = ビート全体（B では部分文字列）。`line / block` では全体を 1 枚の板として変形する（§2.3） |
| `pivotAnchor` | select | `tl / t / tr / l / c / r / bl / b / br / baseline` | `c` | 基準の中のどこを原点にするか（9 点＋ベースライン、§2.3） |
| `pivotOffset` | vec2 | -2〜2 | `{x:0, y:0}` | 原点の微調整。基準の幅・高さに対する割合 |
| `pivotZ` | number | -2〜2 | 0 | 原点の奥行き（X / Y 軸回転用）。基準の幅に対する割合。正 = 奥 |
| `scaleFromX` | number | 0〜10 | 1 | 入場開始時の倍率（拡縮軸の X 方向）。`p` とともに 1 へ戻る |
| `scaleFromY` | number | 0〜10 | 1 | 入場開始時の倍率（拡縮軸の Y 方向）。`p` とともに 1 へ戻る |
| `scaleAxis` | number（度） | -180〜180 | 0 | 拡縮軸の傾き。0 で画面の横・縦。45 で斜め方向に伸び縮みする |
| `scaleAxisTo` | number（度）または null | -180〜180 | null | 指定時は拡縮軸の傾きが `scaleAxis → scaleAxisTo` へ入場中に回る（null = 一定） |
| `scaleEase` | select | `easeOutCubic` / `backOut` / `elasticOut` / `linear` | `easeOutCubic` | 拡縮の戻り方 |

| `scaleOriginSeparate` | bool | | false | オンで拡縮だけ別の原点を使う（§2.3）。自動生成では weird ≥ 0.5 でオン |
| `scaleOrigin` | select | `letter` / `line` / `block` | `letter` | 拡縮専用の原点の基準（`scaleOriginSeparate` がオンのときだけ） |
| `scaleOriginAnchor` | select | `pivotAnchor` と同じ | `c` | 拡縮専用の原点の位置 |
| `scaleOriginOffset` | vec2 | -2〜2 | `{x:0, y:0}` | 拡縮専用の原点の微調整 |

原点（`pivot / pivotAnchor / pivotOffset / pivotZ`）は #1, #2, #3, #5, #8, #9, #15, #16（拡縮・回転・スキュー・ねじれを伴うもの）と、`scaleFromX / scaleFromY` が 1 以外のときに意味を持つ。それ以外では UI に出さない（`params` の `visibleIf`）。

### 2.1 共通関数 `applyPivot`

```js
// O は §2.3 の resolveOrigin が返す原点（画面座標）。sx/sy/rot/skew を文字自身に掛け、
// 文字の位置も O まわりに同じ変換で動かす。シェーダは文字を外接矩形の中心で
// 変形するので、中心の位置を O まわりに動かせば「O を原点にした変形」になる
function applyPivot(state, O, t) {
  state.scaleX *= t.sx; state.scaleY *= t.sy;
  state.rot += t.rot || 0; state.skewX += Math.tan((t.skew || 0) * DEG);   // skew は度、state はせん断係数
  let dx = (state.x - O.x) * t.sx, dy = (state.y - O.y) * t.sy;
  dx += dy * Math.tan((t.skew || 0) * DEG);
  const r = (t.rot || 0) * DEG;
  state.x = O.x + dx * Math.cos(r) - dy * Math.sin(r);
  state.y = O.y + dx * Math.sin(r) + dy * Math.cos(r);
}
```

- `pivot:'letter', pivotAnchor:'c'` では O が文字の中心なので位置は動かず、従来の「その場で変形」と同じになる。
- hold の `stretch`（`selector.js`、`(letterX - cx) * (s-1)`）と同じ考え方を回転・スキューまで広げ、原点を任意の点にしたもの。
- B（`local:true`）では `block` の基準が部分文字列になるので、「選んだ語だけが板として傾く」「1 文字だけ傾く」が同じコードで成り立つ。
- `state.skewX` はシェーダで `p.x += p.y * skewX`（`gl/shaders.js:117`）として使われる **せん断係数（tan）** なので、度で指定するパラメータ（#8 の `skew` など）は `Math.tan(deg * DEG)` に変換して加える。

### 2.2 共通スケール `scaleFromX / scaleFromY / scaleAxis / scaleAxisTo`

16 種すべてに「拡大（縮小）しながら」を重ねられるよう、縦横別の開始倍率と、拡縮する軸の傾きを共通パラメータとして持たせる。

| 例 | 設定 |
|---|---|
| 拡大しながらねじれから戻る | #15 + `scaleFromX: 0.2, scaleFromY: 0.2` |
| 横から開きながら回転 | #16 + `scaleFromX: 0.05, scaleFromY: 1` |
| 縦に伸びた状態から縮みながら傾く | #8 + `scaleFromX: 1, scaleFromY: 3` |
| 斜め 45° 方向に引き伸ばされた状態から戻る | `scaleFromX: 3, scaleFromY: 1, scaleAxis: 45` |
| 伸びる方向が回りながら戻る | `scaleFromX: 2.5, scaleFromY: 0.6, scaleAxis: 0, scaleAxisTo: 90` |

#### 計算

時間:
```
e  = ease(scaleEase)(clamp01(p))
sx = max(0.001, lerp(scaleFromX, 1, e))
sy = max(0.001, lerp(scaleFromY, 1, e))
θ  = scaleAxisTo == null ? scaleAxis : lerp(scaleAxis, scaleAxisTo, e)
```

拡縮軸を θ 傾けた拡縮は、画面座標で
```
A = R(θ) · diag(sx, sy) · R(-θ)        // 対称行列。θ = 0 なら diag(sx, sy)
```
文字の変換はシェーダで「拡縮 → せん断 → 回転」の順（`gl/shaders.js:116-122`）、つまり
```
M0 = R(rot) · Sh(skewX) · diag(scaleX, scaleY),   Sh(k) = [[1, k], [0, 1]]
```
なので、type の cpu が作った M0 に画面座標で A を掛けた `M = A · M0` を、同じ形に分解し直して state に書き戻す（QR 分解。シェーダ変更なし）:
```
M = [[a, b], [c, d]]
r = hypot(a, c)
state.rot    = atan2(c, a) / DEG
state.scaleX = r
state.scaleY = (a*d - b*c) / r
state.skewX  = (a*b + c*d) / (r * state.scaleY)
```
- `sx, sy > 0` なので `det(M) > 0` で、分解は常に成り立つ（type 側の `scaleX / scaleY` が 0 のときは分解せず 0 のまま）。
- θ = 0 かつ type 側に回転・せん断が無い場合は `scaleX *= sx, scaleY *= sy` と同じ結果になる。

位置は拡縮の原点 O（§2.3。`scaleOriginSeparate` がオフなら回転・ねじれと共通の原点）まわりに同じ A で動かす:
```
(dx, dy) = (state.x - O.x, state.y - O.y)
(state.x, state.y) = O + A · (dx, dy)
```

#### 組み込み

```js
function applyScaleFrom(state, p, params, info) { ... }   // 上の計算

function registerEnter(descriptor) {
  fx.register({
    ...descriptor,
    params: [...descriptor.params, ...COMMON_ENTER_PARAMS],
    cpu(state, p, params, rng, info) {
      descriptor.cpu(state, p, params, rng, info);
      applyScaleFrom(state, p, params, info);
    },
  });
}
```
- 16 type はすべて `registerEnter` で登録する。既存の enter type には影響しない。
- 軸の傾きは **画面座標** で決める（type が文字を回していても、`scaleAxis: 0` は画面の横方向）。
- `p = 1` で `sx = sy = 1` → A は単位行列（恒等）。#9 の残留する傾きとも両立する。
- 1 より大きい値は「大きい状態から縮んで入る」。`backOut / elasticOut` の行き過ぎで負にならないよう 0.001 で下限を切る。
- B（部分文字列）でも同じ。`pivot:'block'` なら部分文字列の原点から、傾いた軸の方向に伸び縮みする。

#### UI（インスペクタ）

`scaleFromX / scaleFromY / scaleAxis / scaleAxisTo` の 4 つは **ワンセット** として 1 つのセクション「拡縮（入場開始）」にまとめる（`scaleEase` も同じセクションの末尾）。

| 行 | 内容 |
|---|---|
| 1 | `scaleFromX`・`scaleFromY` を横並び。間に縦横連動のチェーンボタン（オンで片方を動かすともう片方も同じ値。既定オン） |
| 2 | `scaleAxis`・`scaleAxisTo` を横並び。角度ダイヤル＋数値。`scaleAxisTo` は「回す」チェックで有効化（オフ = null） |
| 3 | `scaleEase` |
| 補助 | セクション見出しに小さなプレビュー（四角が開始状態 → 等倍へ変化する図。軸の傾きを線で表示）とリセットボタン（4 つを 1, 1, 0, null に戻す） |

- 4 つの param 定義に `section: 'scaleFrom'` を付け、`shape-layer.js` の `section` と同じ仕組みでまとめて描画する。
- `scaleFromX = scaleFromY`（チェーンがオン）のときは軸の傾きが見た目に影響しないので、行 2 を淡色表示にする。
- セクション末尾に「原点を別にする」（`scaleOriginSeparate`）チェック。オンで拡縮専用の原点ピッカー（§2.3 の UI と同じ部品）を表示する。
- 5 言語ラベル（ja）: 拡縮（入場開始）/ 開始倍率 X / 開始倍率 Y / 軸の傾き / 軸の傾き（終了）/ 戻り方。

### 2.3 原点（pivot）

拡縮・回転・ねじれは、原点をどこに置くかで見た目が変わる（例: Y 軸回転は原点が中央なら「その場でくるっと回る」、左端なら「扉のように開く」）。原点を **基準 × 位置 × 微調整 × 奥行き** で指定する。

#### 基準 `pivot`

| 値 | 基準の範囲 | 中心 `C` と半サイズ `H` |
|---|---|---|
| `letter` | 各文字の外接矩形 | `C = (state.x, state.y)`（シェーダが変形の中心にする外接矩形中心）、`H = letter.bbox の半幅・半高 × 現在の倍率` |
| `line` | その文字が属する行（B の `local:true` では部分文字列のうち同じ行の部分） | 新設 `info.lineBox = { center, half }`（行ごとに `targetFormation` の点から作る。`motion.js` の `centers.lines` と同じ作り方） |
| `block` | ビート全体（B の `local:true` では部分文字列） | `info.blockCenter`, `info.blockHalf` |

#### 位置 `pivotAnchor` と微調整 `pivotOffset`

```
anchor → (ax, ay):  tl(-1,-1) t(0,-1) tr(1,-1) / l(-1,0) c(0,0) r(1,0) / bl(-1,1) b(0,1) br(1,1)
baseline → ax = 0, ay = 基準のベースライン位置（下記）
O.x = C.x + ax * H.x + pivotOffset.x * 2 * H.x
O.y = C.y + ay * H.y + pivotOffset.y * 2 * H.y
O.z = pivotZ * 2 * H.x
```
- 座標は画面座標（y 下向き）。`ay = 1` が下端。
- `baseline`: `letter` は `letter.bbox`（ペン原点基準）から文字中心とベースラインの差を求める。`line / block` はその行（`line`）/ 1 行目（`block`）のベースライン。符号は実装時に `font.js:779` の bbox の向きで確認する。
- `pivotOffset` は基準の幅・高さに対する割合（`x: 0.5` で幅の半分だけ右）。範囲の外にも置ける（例: `pivotOffset.y = -1` で文字の上方に原点＝振り子のように回る）。

#### 奥行き `pivotZ`（X / Y 軸回転）

- 原点を奥（正）に置くと、文字は原点を中心とする円筒の外周を回る（看板が柱のまわりを回るような動き）。0 で文字の面上の軸で回る。
- #16 の式（§3.2）で使う。

#### 共通関数

```js
function resolveOrigin(state, info, base, anchor, offset, z) { ... }   // 上の計算で {x, y, z} を返す

function originOf(state, info, params, purpose) {   // purpose: 'motion' | 'scale'
  if (purpose === 'scale' && params.scaleOriginSeparate) {
    return resolveOrigin(state, info, params.scaleOrigin, params.scaleOriginAnchor, params.scaleOriginOffset, 0);
  }
  return resolveOrigin(state, info, params.pivot, params.pivotAnchor, params.pivotOffset, params.pivotZ);
}
```
- 原点は **type の cpu が state を動かす前** の位置（文字の基準位置）で求め、フレーム内では固定する（`registerEnter` が cpu の前に `info.origin = originOf(..., 'motion')` を用意し、各 type はそれを使う）。
- 拡縮（§2.2）は `originOf(..., 'scale')` を使う。`scaleOriginSeparate` がオフなら回転・ねじれと同じ原点。

#### ねじれ（#15）の原点

- ねじれ角が 0 になる位置が原点。原点から離れるほど角度が増える。
  - 原点が中央: 両側が逆向きにねじれる（従来）。
  - 原点が左端: 左端は固定、右端ほど大きくねじれる。
- `pivot:'line' / 'block'`（帯としてのねじれ、CPU）: `ai = a * (位置 - O) / (2 * H)`。
- `pivot:'letter'`（シェーダの `twist` / `twist3D`）: deform スロットに原点（グリフ内の正規化座標、軸方向の 1 値）を追加し、`f = (p - o) / (2 * half)` で計算する。既存 `twist`（Z 軸）も同じ扱いにする（原点未指定 = 0 で従来と同じ）。

#### 回転（#16）の原点

- 回転軸は原点 O を通る（Z 軸 = O を通る画面奥向きの軸、Y 軸 = O を通る縦線、X 軸 = O を通る横線）。

| やりたいこと | 設定 |
|---|---|
| 扉のように左端を軸に開く | `axis:'y', pivot:'block', pivotAnchor:'l'` |
| 下端を支点に起き上がる | `axis:'x', pivot:'block', pivotAnchor:'b'` |
| 振り子のように上の点から揺れて止まる | `axis:'z', pivot:'letter', pivotAnchor:'t', pivotOffset:{x:0, y:-1}` |
| 柱のまわりを回り込んで正面に来る | `axis:'y', pivot:'block', pivotZ: 0.5` |
| 各文字が自分の左下を支点に倒れて起きる | `axis:'z', pivot:'letter', pivotAnchor:'bl'` |
| 下から拡大しつつ中央の縦軸で回る | `axis:'y', pivot:'block', pivotAnchor:'c'` + `scaleOriginSeparate: true, scaleOrigin:'block', scaleOriginAnchor:'b'` |

#### ランダム生成と weird

- 自動生成（`random.js`）では、プロジェクトの weird（`weirdOfProject(project)`、0..1）が **0.5 以上のとき原点を別にする**: `scaleOriginSeparate = true` とし、拡縮の原点 `scaleOriginAnchor` を回転・ねじれの原点 `pivotAnchor` と **異なる位置** から抽選する（9 点＋ベースラインから `pivotAnchor` を除いて一様に選ぶ。`scaleOrigin` の基準は `pivot` と同じ）。
- weird が 0.5 未満のときは `scaleOriginSeparate = false`（共通の原点）。
- しきい値と weird の取得は既存の `random.js:92`（`weird >= 0.5` で全 pack を候補にする）と同じ `context.weird` を使う。抽選は enter の rng から行い、weird 0.5 未満では追加の乱数を消費しない（既存の生成結果を変えない）。
- インスペクタで手動設定する場合は weird に関係なく自由に選べる。

#### UI（インスペクタ）

「原点」セクション（拡縮セクションの前）:

| 行 | 内容 |
|---|---|
| 1 | 基準 `pivot`（文字 / 行 / 全体）のセグメントボタン |
| 2 | 9 点グリッドのピッカー（3×3 の点をクリック）＋「ベースライン」ボタン |
| 3 | 微調整 X / Y（数値＋ドラッグ）、奥行き Z（X / Y 軸回転の type のときだけ表示） |
| 補助 | プレビューで選択中の文字・行・範囲の上に原点を十字で表示。リセット（文字・中央・0・0） |

- 拡縮セクションの「原点を別にする」をオンにすると、拡縮セクション内に同じ部品（行 1〜3、Z なし）が出る。拡縮の原点も十字（別の色）で表示する。
- param 定義に `section: 'pivot'` / `section: 'scaleFrom'` を付けてまとめる。

---

## 3. A. ビート全体への適用

`style.enter = { type, params, motion }` に置く。全文字に同じ type が掛かり、文字ごとの時間差はビートのスタッガーで付く（`each = 0` なら一斉）。

### 3.1 一覧

| # | 要望 | type | tags | 既定 duration | 既定 each | pivot | companion（A） |
|---|---|---|---|---|---|---|---|
| 1 | 一文字ずつ拡大 | `charGrowIn` | basic | 0.45s | 0.07 | ○ | — |
| 2 | 縦に伸ばしてから | `stretchYIn` | deform | 0.6s | 0.05 | ○ | — |
| 3 | 横に伸ばしてから | `stretchXIn` | deform | 0.6s | 0.05 | ○ | — |
| 4 | 文字背景付き | `plateIn` | decor | 0.6s | 0.06 | — | `bgShape` + `bgMotion` |
| 5 | ゴム変形 | `rubberIn` | deform | 0.9s | 0.05 | ○ | — |
| 6 | 色ずれ | `chromaIn` | glitch | 0.6s | 0.04 | — | `post.rgbShift`（text） |
| 7 | 複数個ならべて | `multiIn` | lively | 0.9s | 0.04 | — | `repeat`（stack）/ `clones[].perLetter`（converge） |
| 8 | 傾けながら | `leanIn` | lively | 0.55s | 0.05 | ○ | — |
| 9 | 出たあと傾ける | `tiltSettleIn` | lively | 0.8s | 0.05 | ○ | — |
| 10 | 震わす | `shakeIn` | lively | 0.7s | 0.03 | — | — |
| 11 | 中央に円 | `circleIn` | decor | 0.8s | 0.03 | — | `shapeLayer circle`（block） |
| 12 | 中央に円＋放射 | `circleBurstIn` | decor | 0.9s | 0.03 | — | `shapeLayer circle + burst`（block） |
| 13 | 一文字ずつ異なる変形 | `varyDeformIn` | deform | 0.7s | 0.06 | — | — |
| 14 | 一文字ずつ異なる点滅 | `blinkVaryIn` | glow | 1.0s | 0.02 | — | — |
| 15 | ねじれ・もどし（X/Y/Z 軸） | `twistIn` | deform, 3d | 0.9s | 0.05 | ○ | — |
| 16 | 部分文字の回転（X/Y/Z 軸・逆回し） | `spinPartIn` | 3d | 0.8s | 0（塊で回す） | ○（既定 `block`） | — |

共通の約束:
- `k = 1 - clamp01(p)`（残り量）。
- 乱数は `rng`（文字ごと seed 済み）か `hash01(info.i, salt)`。時間で変わる揺れは `p` から計算し、同じフレームは常に同じ結果にする。
- `p >= 0.999` で恒等（#9 のみ例外）。
- `frame` 単位のパラメータは `info.shortSide` を掛けて px にする。

### 3.2 各仕様（cpu）

以下の式は A / B 共通。B で変わる点は §4.4 にまとめる。

#### #1 `charGrowIn` — 一文字ずつ、拡大して

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `from` | number | 0〜1 | 0 |
| `overshoot` | number | 1〜2 | 1.25 |
| `peak` | number | 0.3〜0.9 | 0.65 |

```
t = clamp01(p)
s = t < peak ? lerp(from, overshoot, easeOutCubic(t/peak))
             : lerp(overshoot, 1, easeInOutSine((t-peak)/(1-peak)))
applyPivot(state, info.origin, { sx: s, sy: s })
opacity *= clamp01(t * 3)
```
- `pivot:'letter'`（既定）で各文字がその場で膨らむ。`pivot:'block'` ではビート全体が中心から膨らむ。

#### #2 `stretchYIn` — 縦に伸ばしてから

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `amount` | number | 0〜3 | 1.4 |
| `thin` | number | 0.05〜1 | 0.35 |
| `split` | number | 0.2〜0.8 | 0.45 |
| `rise` | number (frame) | 0〜0.5 | 0.06 |

- 前半（`t < split`）: `u = t/split`。`sy = lerp(0, 1+amount, easeOutCubic(u))`、`sx = thin`、`y += rise*shortSide*(1-u)`（下から伸び上がる）。
- 後半: `v = (t-split)/(1-split)`。`sy = 1 + amount * springScale(v)`、`sx = 1 + (thin-1) * springScale(v)`（一度だけ弾んで 1 に収束）。
- `applyPivot(state, info.origin, { sx, sy })`、`opacity *= clamp01(t*4)`。

#### #3 `stretchXIn` — 横に伸ばしてから
#2 の軸を入れ替える。`rise` の代わりに `slide`（frame、既定 0.06、左から）。

#### #4 `plateIn` — 文字背景付きで

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `plateLead` | number | 0〜0.6 | 0.25 |
| `from` | number | 0〜1 | 0.6 |

- 文字: `t = clamp01((p - plateLead) / (1 - plateLead))`。scale `from→1`（`backOut`）、`opacity *= t`。背景が先に出て、文字が後から乗る。
- companion（A）:
  - `bgShape: { type: 'rounded', params: { width: 1.1, height: 1.1, radius: 0.2 } }`
  - `bgMotion: { type: 'stamp' }`
- `bgShape` は元々文字ごとの背景なので、A でも **背景は 1 文字ずつ、各文字の入場時刻に合わせて出る**（`bgMotion` は文字の入場進行に同期）。ブロック全体で 1 枚にしたい場合は `bgShape` 側の既存設定（`unit` / 形）で変える。

#### #5 `rubberIn` — ゴムのように変形しながら

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `amp` | number | 0〜1.5 | 0.6 |
| `damping` | number | 0.5〜10 | 4 |
| `freq` | number | 0.5〜8 | 3 |

```
t = clamp01(p)
s = 1 + amp * exp(-damping*t) * sin(freq * 2π * t + π/2) * k   // t=0 で最大の縦伸び
applyPivot(state, info.origin, { sx: 1 / s, sy: s })            // 体積保存
deform.push({ type: 'jelly', amount: amp * k, time: t, param: freq })
opacity *= clamp01(t * 4)
```
- `* k` で p=1 のとき厳密に 1 にする。

#### #6 `chromaIn` — 色ずれしながら

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `split` | number (frame) | 0〜0.15 | 0.04 |
| `jitter` | number | 0〜1 | 0.5 |
| `angle` | number | -180〜180 | 0 |

- 文字: `x += cos(angle) * split*shortSide*k*jitter*(rng()*2-1)`、y も同様（0.4 倍）。`flash = max(flash, 0.3*k)`、`opacity *= clamp01(p*2)`。
- companion（A）: `post.rgbShift`（target text、`amount = split`、`angle`、envelope = 入場の `k`、`drive: 'enter'`）。チャンネル分離は post 側、文字ごとのブレは cpu 側で担う。

#### #7 `multiIn` — 複数個ならべて

既定は **文字列を複数行のように並べる**（同じ歌詞が縦・横・斜めに複数本並んで出る）。別の表現として「各文字の複製が並んだ状態から 1 つに収束する」も `arrange` で選べる。

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `arrange` | select | `stack` / `converge` | `stack` |
| `layout` | select | `stackV`（縦に複数行）/ `rowH`（横に並ぶ）/ `diagonal`（斜め） | `stackV` |
| `copies` | int | 1〜3（本体を含め 2〜4 本） | 2 |
| `cascade` | number | 0〜1 | 0.35（複製 1 本ごとの出現の遅れ。入場区間に対する割合） |
| `copyOpacity` | select | `flat` / `fade` | `fade` |
| `gap` | select | repeat の `gap`（`tight / normal / wide`） | `normal` |

**`arrange:'stack'`（既定）— 複数行のように並べる**
- 既存の効果グループ `repeat`（`effects/repeat.js`、設計 `doc/repeat-design.md`）を companion として使う。
  - companion: `repeat: { type: layout, params: { copies, sequence: 'cascade', copyOpacity, gap, seqOrder: 'fromMain' } }`
  - `repeat` は本体の文字列を複製して並べ、`fit:'shrink'` で全体が画面に収まるよう縮める。
- 入場の同期: 本体は通常どおり入場し（`opacity *= clamp01(p*1.5)` ＋ 軽い slide）、複製 j（1..copies）は `p_j = clamp01((p - j*cascade) / (1 - copies*cascade))` で順に出る。
  - repeat の `cascade` シーケンスがビート時間で動く場合は、enter の進行度 `p` を repeat に渡す `drive:'enter'` を追加する（§5）。
- 複製の文字も各行で 1 文字ずつ（ビートのスタッガー）出る。

**`arrange:'converge'`（別表現）— 複製が並んだ状態から 1 つに収束**
- 各文字の複製 `copies` 個が横に並んだ状態から始まり、`p` で 1 つに重なる。
- 描画: 既存の clone perLetter（`letter-vary.js` の `planLetterVariants`）を companion で有効化し、新しい state `state.cloneSpread = k` を出す。
- `engine.js` の clone 描画で、variant の `dx` に `cloneSpread` を掛け、`copyOpacity:'fade'` のとき複製の opacity にも `cloneSpread` を掛ける。

#### #8 `leanIn` — 傾けながら

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `angle` | number | -90〜90 | -25 |
| `skew` | number | -60〜60 | 20 |
| `distance` | number (frame) | 0〜0.5 | 0.08 |

```
applyPivot(state, info.origin, { sx: 1, sy: 1, rot: angle * k, skew: skew * k })
x += -sign(angle) * distance*shortSide * k
opacity *= clamp01(p * 1.5)
```

#### #9 `tiltSettleIn` — 出たあとに傾ける

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `tilt` | number | -45〜45 | 8 |
| `appear` | number | 0.2〜0.9 | 0.55 |
| `alternate` | bool | | false |

- 前半（`t < appear`）: フェードイン＋ scale 0.9→1。回転なし。
- 後半: `v = (t-appear)/(1-appear)`、`applyPivot(state, info.origin, { sx:1, sy:1, rot: tiltSigned * backOut(v) })`。
- `tiltSigned = alternate && info.i % 2 ? -tilt : tilt`。
- **p = 1 でも `tiltSigned` を残す**（唯一の非恒等）。hold / exit は state に加算するので傾きは維持される（実装時に `motion.js` の hold / exit が `rot` を代入で上書きしていないことを確認する）。
- A で `pivot:'block'` にすると、ビート全体（行）が 1 枚の板として入場後に傾く。

#### #10 `shakeIn` — 震わす

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `amp` | number (frame) | 0〜0.1 | 0.02 |
| `rotAmp` | number | 0〜30 | 6 |
| `freq` | number | 1〜30 | 10 |

```
h = hash01(info.i, 1) * 2π
e = sqrt(k)                       // 終盤まで震えが残る
x += sin(p*freq*2π + h)       * amp*shortSide * e
y += sin(p*freq*2π*1.3 + h*2) * amp*shortSide * 0.6 * e
rot += sin(p*freq*2π*0.9 + h*3) * rotAmp * e
opacity *= clamp01(p * 2)
```

#### #11 `circleIn` — 中央に円で

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `spread` | number | 0〜2 | 0.6 |
| `circleScale` | number | 0.5〜3 | 1.3 |
| `shapeUnit` | select | `block` / `char` | `block`（A） |

- 文字: `radialIn` と同じ式（`blockCenter` から各位置へ集合）を `spread` で弱め、`opacity *= clamp01(p*1.5)`。
- companion（A）: `post.shapeLayer { shape: 'circle', followText: shapeUnit === 'char' ? 'char' : 'block', enterAnim: 'expand', scale: circleScale, fillOpacity: 1 }`。円は文字の後ろに置く。
- `shapeUnit:'char'` にすると円が各文字の中心に 1 個ずつ出る。

#### #12 `circleBurstIn` — 中央に円＋放射状

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `spread` | number | 0〜2 | 0.6 |
| `circleScale` | number | 0.5〜3 | 1.3 |
| `burstDelay` | number | 0〜0.5 | 0.15 |
| `shapeUnit` | select | `block` / `char` | `block`（A） |

- 文字: #11 と同じ。
- companion（A）: shapeLayer を 2 つ（`followText` は #11 と同じ規則）。
  - `{ shape: 'circle', enterAnim: 'expand' }`
  - `{ shape: 'burst', enterAnim: 'draw', scale: circleScale * 1.6, in: delay burstDelay }`

#### #13 `varyDeformIn` — 一文字ずつ異なる変形

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `recipes` | multiselect | `stretchY, stretchX, rubber, lean, flip, spin` | 全部 |
| `mode` | select | `cycle / random` | random |

- 文字ごとに `recipes` から 1 つ選ぶ。`cycle` は `info.i % n`、`random` は `floor(hash01(info.i, 13) * n)`（seed 依存で決定的）。
- 選んだレシピの cpu 本体（#2, #3, #5, #8 と `flip3D`, `rotateIn`）を既定パラメータ・`pivot:'letter'` で呼ぶ。
- 本体は `enter.js` 内の関数として切り出して共有する（`RECIPES` 表）。

#### #14 `blinkVaryIn` — 一文字ずつ異なる点滅

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `minHz` | number | 1〜20 | 3 |
| `maxHz` | number | 1〜30 | 9 |
| `duty` | number | 0.1〜0.9 | 0.4 |
| `dim` | number | 0〜1 | 0.05 |

```
f = lerp(minHz, maxHz, hash01(info.i, 14))      // 入場区間あたりの点滅回数
φ = hash01(info.i, 15)
d = duty + (1 - duty) * p                        // 終盤ほど点灯時間が長い
on = p >= 0.999 || frac(p*f + φ) < d
opacity *= on ? 1 : dim
```

#### #15 `twistIn` — 文字のねじれ・もどし（X / Y / Z 軸）

ねじれも回転軸（Unity の座標系: X = 横軸、Y = 縦軸、Z = 画面奥向き）を選べる。「ねじれ」は **場所によって回転角が変わる回転**（軸に沿って進むほど角度が増える）と定義する。

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `axis` | select | `x` / `y` / `z` | `x` |
| `angle` | number | -720〜720 | 180（ねじれの最大角。帯の端から端までの角度差） |
| `direction` | select | `forward` / `reverse` | `forward`（`reverse` でねじる向きを逆に） |
| `phase` | select | `in` / `inOut` | `inOut` |
| `peak` | number | 0.1〜0.9 | 0.4 |
| `bounce` | number | 0〜1 | 0.3 |
| `backface` | select | `show` / `hide` / `dim` | `dim` |
| `depth` | number | 0〜2 | 1（遠近の強さ。`u_perspective = 1200px` への倍率） |

時間（ねじれ→もどし）は軸によらず共通:
```
t = clamp01(p)
sgn = direction === 'reverse' ? -1 : 1;  以下 angle は sgn * angle
phase 'in'   : a = angle * k                                         // ねじれた状態から戻る
phase 'inOut': a = t < peak ? angle * easeOutCubic(t/peak)
                            : angle * (1 - easeOutBack((t-peak)/(1-peak), bounce))   // ほどけて少し逆にねじれ 0 へ
opacity *= clamp01(t * 3)            // p = 1 で a = 0（恒等）
```

拡大しながらねじれから戻る: `phase:'in'`, `scaleFromX: 0.2`, `scaleFromY: 0.2`（§2.2）。縦横を別々にしたり、`scaleAxis` で斜め方向に伸ばした状態からほどけたりもできる。

軸ごとの形（`pivot` で「文字 1 個ずつねじる」か「ブロック / 部分文字列を 1 本の帯としてねじる」かを選ぶ）:

| axis | 見た目 | `pivot:'letter'`（文字ごと） | `pivot:'block'`（帯として） |
|---|---|---|---|
| `z` | 画面内でねじれる（S 字に曲がる平面のねじれ） | 既存 deform `twist`（`gl/shaders.js:154`、グリフ内の高さ `p.y/halfH` に比例して Z 回転）。`deform.push({type:'twist', amount:a})` | warp の `twistBlock`（`gl/shaders.js:238`）。`deform.push({type:'twistBlock', amount:a})`、基準は `blockCenter / blockHalf` |
| `x` | 横書きの行が **横軸まわりにリボンのようにねじれる**（左端は表、中央で真横、右端は裏…） | 新 deform `twist3D`（axisCode 0）: グリフ内の `p.x/halfW` に比例した角度で X 回転 | 文字ごとの `tiltX`（既存）で実現。シェーダ変更なし（下記） |
| `y` | 縦軸まわりにねじれる（上の行と下の行が逆向きに回る、縦書きのリボン） | 新 deform `twist3D`（axisCode 1）: グリフ内の `p.y/halfH` に比例した角度で Y 回転 | 文字ごとの `tiltY`（既存）で実現（下記） |

`pivot:'block'` の X / Y 軸（CPU のみ、既存の `tiltX/tiltY` + 遠近で実現）:
```
O = info.origin, h = 基準の半サイズ H（§2.3）      // B（local）では部分文字列の基準
P = 1200 * depth
axis x: ai = a * (state.x - O.x) / (2 * h.x)        // 原点で 0、離れるほど大きい
        d = state.y - O.y                           // 複数行なら軸からの距離
        z = d * sin(ai);  w = P / (P + z)
        state.y = O.y + d * cos(ai) * w;  state.tiltX += ai;  scaleX *= w; scaleY *= w
axis y: ai = a * (state.y - O.y) / (2 * max(h.y, 1));  d = state.x - O.x
        z = d * sin(ai);  w = P / (P + z)
        state.x = O.x + d * cos(ai) * w;  state.tiltY += ai;  scaleX *= w; scaleY *= w
backface: cos(ai) < 0 の文字は hide → opacity 0 / dim → opacity *= 0.35
```
- 1 行の横書きで `axis:'y'` + `pivot:'block'` は `f ≈ 0` でほぼねじれないため、UI で注意表示（複数行・縦書き向け）。横書き 1 行の帯ねじれは `axis:'x'` を既定にする。

新 deform `twist3D`（`pivot:'letter'` の X / Y 軸、`gl/shaders.js` の deform 分岐に追加）:
```glsl
// amount = ねじれ角(度), param = axisCode (0: X 軸, 1: Y 軸)
float f  = axisCode < 0.5 ? p.x / halfW : p.y / halfH;   // 軸に沿った位置 -1..1
float ai = radians(amount * f * 0.5);
if (axisCode < 0.5) { z = p.y * sin(ai); p.y *= cos(ai); }   // X 軸まわり
else                { z = p.x * sin(ai); p.x *= cos(ai); }   // Y 軸まわり
p *= u_perspective / (u_perspective + z);                    // letterTransform と同じ遠近
```
- `deform.push({ type: 'twist3D', amount: a, param: axisCode, time: t, seed: info.i })`。CPU 側の deform 種リストと Canvas2D フォールバック（`canvas2d-fallback.js`、非対応なら `tiltX/tiltY` の平均角で近似）に追加。

#### #16 `spinPartIn` — 部分文字の回転（X / Y / Z 軸、正転・逆回し）

部分文字列（A ではビート全体）を 1 枚の看板のように回す。回転軸は Unity の座標系で選ぶ:
- **X 軸**（横軸まわり＝上下に裏返る、前転・後転）
- **Y 軸**（縦軸まわり＝左右に裏返る、くるっと振り向く）
- **Z 軸**（画面奥向きの軸まわり＝画面内で回る、時計の針）

| param | kind | 範囲 | 既定 |
|---|---|---|---|
| `axis` | select | `x` / `y` / `z` | `y` |
| `turns` | number | 0〜4 | 1（= 360°） |
| `direction` | select | `forward` / `reverse` | `forward`（`reverse` で逆回し。各軸の符号を反転） |
| `phase` | select | `in` / `inOut` | `in`（`inOut` は「回って→逆回しで戻る」） |
| `peak` | number | 0.1〜0.9 | 0.5（`inOut` の折り返し位置） |
| `settle` | number | 0〜1 | 0.2（止まる直前の行き過ぎ） |
| `backface` | select | `show` / `hide` / `dim` | `show`（X / Y 軸のみ） |
| `depth` | number | 0〜2 | 1（遠近の強さ。`u_perspective = 1200px` への倍率。X / Y 軸のみ） |

正の向き（`forward`）: X 軸 = 上端が奥へ倒れる向き、Y 軸 = 右端が奥へ行く向き、Z 軸 = 時計回り。`reverse` はすべて逆。

時間:
```
t = clamp01(p)
sgn = direction === 'reverse' ? -1 : 1
phase 'in'   : θ = sgn * 360 * turns * (1 - easeOutBack(t, settle))     // 回りながら入り、正面で止まる
phase 'inOut': θ = t < peak ? sgn * 360 * turns * easeInOutCubic(t/peak)  // 回って
                            : sgn * 360 * turns * (1 - easeOutBack((t-peak)/(1-peak), settle))   // 逆回しで戻る
opacity *= clamp01(t * 2)              // p = 1 で θ = 0（恒等）
```

既存の仕組み:
- 1 文字の 3D 傾きは state の `tiltX / tiltY`（度）で、text シェーダの `letterTransform` が `u_perspective = 1200`（`gl/passes.js:839`）で遠近を付ける（`gl/shaders.js:115-126`）。Z 軸は `rot`。
- これらは **各文字が自分の中心で** 回るだけなので、塊として回すには文字の位置と奥行きを CPU で計算する。

`pivot:'block'`（既定）— 塊としての回転:
```
O = info.origin                                          // §2.3 の原点（B では部分文字列の基準）。O.z = 原点の奥行き
P = 1200 * depth
axis z: applyPivot(state, info.origin, { sx: 1, sy: 1, rot: θ })   // 原点 O まわりに画面内回転
axis y: d = state.x - O.x;  u = d * cos(θ) + O.z * sin(θ);  z = O.z + d * sin(θ) - O.z * cos(θ);  w = P / (P + z)
        state.x = O.x + u * w;  state.tiltY += θ;  scaleX *= w;  scaleY *= w
axis x: d = state.y - O.y;  u = d * cos(θ) + O.z * sin(θ);  z = O.z + d * sin(θ) - O.z * cos(θ);  w = P / (P + z)
        state.y = O.y + u * w;  state.tiltX += θ;  scaleX *= w;  scaleY *= w
backface（X / Y）: cos(θ) < 0 の間 hide → opacity 0 / dim → opacity *= 0.35
```
- 1 行の横書きで `axis:'x'` + `pivot:'block'` は全文字が軸上（`d ≈ 0`）なので、各文字の `tiltX` だけで回る（行全体が前転して見える）。

`pivot:'letter'` — 各文字がその場で回る:
- `axis z`: `rot += θ`、`axis y`: `tiltY += θ`、`axis x`: `tiltX += θ`（位置は動かさない）。既存 `rotateIn` / `flip3D` の多回転・逆回し・往復版。

その他:
- 塊として回るよう既定スタッガーは `each: 0`（全文字同じ `p`）。`each > 0` にすると文字ごとに遅れて回る（ドミノ状）。
- 拡大しながら回転: §2.2 の `scaleFromX / scaleFromY / scaleAxis` を指定する。`pivot:'block'` なら塊ごと中心から拡大しつつ回る。
- 奥行きの前後関係（文字同士の重なり順）は描画順のまま。変えたい場合は §4.7 の `drawOrder` で決める。
- 主な使い方は B（§4）: 選んだ語・数文字だけが回転して入り、他の文字は通常の入場。

### 3.3 companion（随伴エフェクト）— A の場合

文字背景・円・色ずれ・複数個は enter の `cpu` だけでは描けない。enter エントリに **`companion`** を持たせ、type を選んだときに必要な別グループの設定を一緒に書き込む。

```js
fx.register({
  group: 'enter',
  type: 'plateIn',
  params: [...],
  cpu(state, p, params, rng, info) { ... },
  companion: {
    bgShape:  { type: 'rounded', params: { width: 1.1, height: 1.1, radius: 0.2 } },
    bgMotion: { type: 'stamp', params: {} },
  },
});
```

- registry: `register` は `companion` をエントリに保持する（`withDefaults` は変更しない）。`fx.companionOf(group, type)` を追加し、deep copy を返す。無ければ `null`。
- インスペクタ: `style.enter` の type を選んだとき、`companion` の各グループがスタイル上で **未設定（または `none`）なら** `style.<group>` に書き込む。設定済みのグループは上書きしない。
- 解除は各グループの UI で行う（enter を別 type に変えても companion は残す）。
- 自動生成（showcase / random）: スタイル生成時に companion を展開してから描画する。
- post / shapeLayer の companion は `drive: 'enter'` で、ビートの入場区間に同期する。

### 3.4 共有ヘルパー（`enter.js` 内）

| 関数 | 用途 | 使用 |
|---|---|---|
| `applyPivot(state, O, t)` / `resolveOrigin` / `originOf` | 原点まわりの変形（§2.1, §2.3） | #1, #2, #3, #5, #8, #9, #15, #16 |
| `springScale(t, damping=5, freq=1.5)` | 1→0 に一度弾んで収束する係数 | #2, #3, #13 |
| `hash01(i, salt)` | `neonFlicker` と同じ sin-hash を関数化 | #9, #10, #13, #14 |
| `RECIPES` | レシピ名 → cpu 本体 | #13 |

---

## 4. B. 部分文字列ごとの適用

`style.scoped[]` に `group:'enter'` のエントリとして置く。選んだ文字だけがその type で入場し、他の文字はビート全体の enter（A）で入場する。

```js
style.scoped = [
  {
    group: 'enter',
    type: 'tiltSettleIn',
    params: { tilt: 12, pivot: 'letter' },
    scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 3, length: 1 },
    local: true,
    motion: { in: { delay: 0, duration: 0.8, ease: 'easeOutCubic' } },
  },
];
```

### 4.1 挙動の要点

| 項目 | 内容 |
|---|---|
| 置き換え | scoped enter は対象文字のビート enter を **置き換える**（`motion.js:673-683`）。A と B を同じ文字に重ねることはしない。全体＋一部の組み合わせは §4.6 の全分割で行う |
| 基準 | `local:true`（既定）で `info.blockCenter` が部分中心、`info.i/N` が部分内の rank/count（`localInfo`） |
| pivot | `pivot:'block'` は部分中心まわり。1 文字の scope では文字中心と同じ |
| 時間 | scoped の `motion.in`（delay / duration / ease）。文字ごとのオフセットは §4.3 |
| 複数エントリ | 異なる scope に異なる type を置ける（例: 1 文字目だけ `plateIn`、最後の語だけ `shakeIn`） |

### 4.2 例

| やりたいこと | 設定 |
|---|---|
| 4 文字目だけ入場後に傾く | `tiltSettleIn` + `scope {kind:'slice', offset:3, length:1}` |
| 特定の語だけ背景付きで 1 文字ずつ出る | `plateIn` + `scope {kind:'keyword', ...}`（背景も同じ scope、部分内スタッガーで 1 文字ずつ） |
| 一文字おきに傾く | `leanIn` + `scope {kind:'nth', ...}` |
| 選んだ語が板として傾いて入る | `leanIn` + `pivot:'block'` + `scope {kind:'words', ...}` |
| 1 文字だけ中央に円 | `circleIn` + `scope {kind:'slice', length:1}`（円はその文字の中心） |
| 選んだ語だけ縦軸まわりにくるっと回って入る | `spinPartIn` + `axis:'y'` + `scope {kind:'words', ...}`（語の中心を通る縦軸） |
| 2〜4 文字目だけねじれて戻る | `twistIn` + `scope {kind:'slice', offset:1, length:3}` |
| 語の中で文字ごとに違う点滅 | `blinkVaryIn` + `scope {kind:'words', ...}`（`info.i` が部分内 rank） |

### 4.3 部分内スタッガー（追加）

現状、scoped enter の文字ごとのオフセットはビートのスタッガー `offsets[index]`（`motion.js:700`）をそのまま使う。部分文字列の中で独自に 1 文字ずつ出せるよう、scoped エントリに任意の `stagger` を追加する。

```js
{ group:'enter', type:'plateIn', scope:{...}, local:true,
  stagger: { order:'ltr', each:0.08, ease:'linear' } }
```

- `stagger` があるとき、その文字のオフセットを `rank`（`localInfo` と同じ run の順位）から `each * max * ease(rank/max)` で計算し、`offsets[index]` の代わりに使う（`staggerRanks` を run 単位で再利用）。
- `stagger.each = 0` で部分内の文字が一斉に入る。`stagger` 未指定なら従来どおりビートのオフセット（後方互換）。
- 部分全体の開始時刻は `motion.in.delay` で決める。

### 4.4 type ごとの B での振る舞い

| # | type | B での振る舞い | companion（B） |
|---|---|---|---|
| 1 | `charGrowIn` | 対象文字だけ膨らむ。`pivot:'block'` で部分中心から膨らむ | — |
| 2 | `stretchYIn` | 対象文字だけ縦伸び | — |
| 3 | `stretchXIn` | 対象文字だけ横伸び | — |
| 4 | `plateIn` | 対象文字だけ背景付き。背景も部分内スタッガーで 1 文字ずつ出る | scoped `bgShape` + scoped `bgMotion`（同じ scope） |
| 5 | `rubberIn` | 対象文字だけゴム変形 | — |
| 6 | `chromaIn` | 対象文字だけジッタ＋色ずれ | `post.rgbShift` を scope マスクに限定（§6 未確定） |
| 7 | `multiIn` | `converge`: 対象文字だけ複製が並んで収束。`stack`: repeat は文字列全体の複製なので、部分文字列だけを複数行に並べるには repeat の scope 対応が必要（§7） | `converge`: `clones[].perLetter` に scope を付与 |
| 8 | `leanIn` | 対象文字だけ傾いて入る。`pivot:'block'` で語が板として傾く | — |
| 9 | `tiltSettleIn` | 対象文字だけ入場後に傾く（1 文字だけ傾く） | — |
| 10 | `shakeIn` | 対象文字だけ震える | — |
| 11 | `circleIn` | `shapeUnit:'block'` で部分全体に円 1 個（`followText:'span'`）、`'char'` で対象文字ごとに 1 個 | shapeLayer に scope を付与 |
| 12 | `circleBurstIn` | 同上（円＋放射） | shapeLayer ×2 に scope を付与 |
| 13 | `varyDeformIn` | 部分内 rank で変形を選ぶ | — |
| 14 | `blinkVaryIn` | 部分内 rank で点滅パターンを選ぶ | — |
| 15 | `twistIn` | 対象文字だけねじれて戻る。`pivot:'block'` で部分文字列が 1 本の帯として X / Y / Z 軸まわりにねじれる（軸は部分中心を通る） | — |
| 16 | `spinPartIn` | 部分文字列が部分中心を通る X / Y / Z 軸まわりに塊で回転して入る（正転・逆回し・往復。本 type の主用途） | — |

### 4.5 companion — B の場合

- scoped enter に companion がある type を置いたとき、**同じ `scope` と `local` をコピーした scoped エントリ** として companion を書く（`style.scoped` に追加）。既に同じ scope・同じ group のエントリがあれば上書きしない。
- 背景: `bgShape / bgFill` は既存の `SCOPED_BG`（`engine.js:2919`）で描ける。`bgMotion` を scoped で読めるよう `SCOPED_BG` に `bgMotion` を加える（未対応なら §5 の変更に含む）。
- 図形: shapeLayer の scoped 対応として、`followText:'span'` の対象範囲を scope のマスクから作る（`spanFrom` / `matchText` を scope から解決）。
- 背景・図形の入場時刻は、対象文字の scoped `motion` ＋ §4.3 の部分内オフセットに同期する。

---

### 4.6 全分割（部分文字列で全部を分割する）

「全体の動き＋一部だけ別の動き」を重ねたい場合は、加算（重ねがけ）ではなく **ビートの文字列を部分文字列で全部分割** し、各部分に type を割り当てる方法で行う。scoped enter が対象文字のビート enter を置き換える現在の規則（§4.1）のままで成り立つ。

- インスペクタに「部分文字列で全分割」を追加する。分割単位: `letter`（1 文字ずつ）/ `word`（語）/ `custom`（区切り位置をユーザーが指定）。
- 実行すると、全文字を隙間なく覆う scoped enter エントリ（`scope: { kind:'slice', offset, length }`、`local:true`）を部分ごとに作る。各エントリの type / params / motion の初期値は現在の `style.enter` のコピー。
- ユーザーは部分ごとに type を変える（例: 「君の」= `plateIn`、「声が」= `spinPartIn axis:y`、「聞こえる」= `charGrowIn`）。
- 分割の解除: 全分割エントリ（印 `split:true` を持つ）をまとめて削除し、`style.enter` に戻す。
- 全分割中も部分ごとの時間は §4.3 の部分内スタッガーと `motion.in.delay` で決める。部分同士の順番（どの部分から出るか）は各エントリの `delay` で付ける。

### 4.7 描画順（ユーザー定義）

文字の描画順（重なったときにどちらが手前か）は、既定では **現在の描画順のまま**（文字番号順）とし、奥行き `z` による自動の並べ替えはしない（#16 の塊回転も同じ）。重なり方を変えたい場合のために、ユーザーが描画順を決める方法を作る。

- scoped エントリ（§4.6 の全分割エントリを含む）に `drawOrder`（int、既定 0）を追加する。大きいほど手前に描く。
- 描画時に文字を `(drawOrder, 文字番号)` で安定ソートする（`gl/passes.js` の text パスの文字並び）。`drawOrder` を誰も持たなければ従来と同じ順。
- 典型的な使い方: 全分割 → 回転させる部分の `drawOrder` を上げて、回転中に隣の文字より手前に出す。
- ビート全体の逆順（右の文字を手前）は `style.text.drawOrder: 'forward' | 'reverse'` で選べるようにする。

## 5. 変更ファイル

| ファイル | A ビート全体 | B 部分文字列 |
|---|---|---|
| `renderer/js/lyrics/effects/enter.js` | 16 type の登録（`registerEnter` で共通パラメータ `pivot / scaleFromX / scaleFromY / scaleAxis / scaleAxisTo / scaleEase` と `applyScaleFrom` を付与）、`applyPivot` 等の共有ヘルパー | （同じ cpu を使う） |
| `renderer/js/lyrics/effects/registry.js` | `companion` の保持、`fx.companionOf` | — |
| `renderer/js/lyrics/motion.js` | hold / exit が `rot` を上書きしないことの確認（#9）、`state.cloneSpread` の受け渡し（#7） | scoped `stagger` による部分内オフセット（§4.3）、全分割（§4.6）、`drawOrder`（§4.7） |
| `renderer/js/lyrics/effects/repeat.js` | `drive:'enter'`（複製の出現を enter の `p` に同期、#7） | — |
| `renderer/js/lyrics/gl/passes.js` | — | 文字の描画順を `drawOrder` で安定ソート（§4.7） |
| `renderer/js/lyrics/engine.js` | clone perLetter の `dx` / opacity に `cloneSpread`（#7 converge）、repeat の `drive:'enter'`（#7 stack） | `SCOPED_BG` に `bgMotion`、shapeLayer の scope 解決（§4.5） |
| `renderer/js/lyrics/scope.js` | — | 参照のみ（scope の mask / run を使う） |
| `renderer/js/lyrics/random.js` | 16 type の共通パラメータの抽選。weird ≥ 0.5 で `scaleOriginSeparate = true` と別原点の抽選（§2.3） | — |
| `renderer/js/studio/inspector.js` | `style.enter` 選択時の companion 書き込み、「拡縮（入場開始）」セクション（§2.2 UI：縦横連動・角度ダイヤル・プレビュー） | scoped enter 選択時の companion 書き込み（同 scope）、scoped `stagger` の UI、「部分文字列で全分割」とその解除（§4.6）、`drawOrder` の入力（§4.7） |
| `renderer/js/studio/fx-strings.js` | 5 言語（en / ja / es / fr / ru）のラベル、`pivot` / `shapeUnit` のラベル | scoped `stagger` のラベル |
| `renderer/js/lyrics/gl/shaders.js` | #15: 新 deform `twist3D`（X / Y 軸、文字ごと）、`twistBlock` を enter の deform として使えるよう登録（未対応の場合） | — |
| `renderer/js/lyrics/canvas2d-fallback.js` | #15 `twist3D` の近似（または無視） | — |
| `scripts/showcase.js` → `renderer/data/showcase.json` | 16 キュー（全体適用） | 部分適用の例キュー（§4.2 の 8 例） |
| `scripts/test/*.test.js` | §6 A | §6 B |

### 5.1 ラベル（ja / en）

| type | ja | en |
|---|---|---|
| `charGrowIn` | 一文字ずつ拡大 | Char grow in |
| `stretchYIn` | 縦伸びイン | Stretch Y in |
| `stretchXIn` | 横伸びイン | Stretch X in |
| `plateIn` | 背景付きイン | Plate in |
| `rubberIn` | ゴムイン | Rubber in |
| `chromaIn` | 色ずれイン | Chroma in |
| `multiIn` | 複数並びイン | Multi in |
| `leanIn` | 傾きイン | Lean in |
| `tiltSettleIn` | 出て傾く | Tilt settle in |
| `shakeIn` | 震えイン | Shake in |
| `circleIn` | 中央円イン | Circle in |
| `circleBurstIn` | 円＋放射イン | Circle burst in |
| `varyDeformIn` | 文字ごと変形イン | Vary deform in |
| `blinkVaryIn` | 文字ごと点滅イン | Vary blink in |
| `twistIn` | ねじれ・もどし | Twist in |
| `spinPartIn` | 部分回転イン | Part spin in |

---

## 6. テスト・検証

`npm test`（= `node --test "scripts/test/**/*.test.js"`）。

### 6.1 A. ビート全体

- 各 type: `p = 0` で非恒等、`p = 1` で恒等（`x, y, rot, scaleX, scaleY, skewX, opacity` が初期値）。
- #9: `p = 1` で `rot === tilt`、`alternate` で奇数文字が `-tilt`。
- #13: 同じ seed / `i` で同じレシピ、`cycle` で順に巡回。
- #14: `p = 1` で `opacity === 1`、文字ごとに点滅パターンが異なる。
- #15: 各 `axis` で `phase:'inOut'` の `p = peak` 付近の amount が `angle`、`p = 1` で deform amount 0・tilt 0（恒等）。`axis:'x'` + `pivot:'block'` で左端と右端の文字の `tiltX` が逆符号、中央の文字は 0。`axis:'z'` は `twist`、`x/y` + `letter` は `twist3D` が push される。
- #16: 各 `axis`（x/y/z）× `direction`（forward/reverse）で θ の符号が反転すること。`phase:'inOut'` で `p = peak` に θ = 360·turns、`p = 1` で 0。`each = 0` 既定で全文字同じ `p`。`axis:'y'`, θ=90° 相当の `p` で全文字の x が中心に集まり `tiltY ≈ 90`。`backface:'hide'` で cos θ < 0 の間 opacity 0。`p = 1` で恒等。
- `pivot:'block'`: 回転・拡縮後の文字位置が `blockCenter` まわりの変換と一致する。
- `scaleFromX / scaleFromY`: 16 type すべてで `p = 1` で恒等、既定（1, 1）では従来の結果と一致。縦横が独立に効く。
- 原点: `pivotAnchor` 9 点＋ベースラインで O が基準の端・中央に来る。`pivot:'letter', pivotAnchor:'c'` で従来と一致。Y 軸回転 + `pivotAnchor:'l'` で左端の文字の x が動かない。ねじれの原点が左端のとき左端の角度が 0。`pivotZ > 0` で回転中の文字が原点の奥行きを中心に回る。
- weird: 生成時 weird ≥ 0.5 で `scaleOriginSeparate === true` かつ `scaleOriginAnchor !== pivotAnchor`、weird < 0.5 で false。weird < 0.5 の生成結果が追加前と同一（乱数消費なし）。
- `scaleAxis`: 分解後の state（rot / skewX / scaleX / scaleY）をシェーダと同じ順で行列に戻すと `A · M0` と一致する（θ = 0, 45, 90, -30 と、type が回転・せん断を持つ場合）。`scaleAxisTo` で θ が `e` に沿って補間される。
- スタッガー: `each` を変えると文字ごとの開始時刻がずれ、`each = 0` で全文字同じ `p`。
- companion を持つ type（#4, #6, #7, #11, #12）で `fx.companionOf` が期待値を返す。

### 6.2 B. 部分文字列

`scripts/test/scope.test.js` の流儀に合わせる。

- scope 外の文字は A の enter のまま（B の type の影響を受けない）。
- `slice length:1` の `tiltSettleIn` で、その 1 文字だけ `p = 1` で `rot === tilt`、他の文字は `rot === 0`。
- `local:true` で `info.i` が部分内 rank、`info.blockCenter` が部分中心。
- 部分内スタッガー: `stagger.each` で部分内の文字の開始時刻が rank 順にずれ、`stagger` 未指定ならビートのオフセット（後方互換）。
- scoped `plateIn` を置くと、同じ scope の scoped `bgShape` / `bgMotion` が書かれ、既存があれば上書きしない。
- scoped `spinPartIn`（`local:true`）で回転軸が部分中心を通り、scope 外の文字は回らない。
- scoped `circleIn` の `shapeUnit:'char'` で対象文字の数だけ円が出る。

- 全分割: `letter` / `word` で全文字が隙間・重複なく scoped エントリに覆われる。解除で `style.enter` に戻る。
- `drawOrder`: 指定なしで従来の描画順と一致。`drawOrder` を上げた部分の文字が後（手前）に描かれる。`style.text.drawOrder:'reverse'` で逆順。
- #7 `stack`: companion の `repeat` が書かれ、複製 j の出現が `cascade` だけ遅れる。

### 6.3 目視

- showcase の A 16 キュー、B 8 例をアプリのプレビューで再生して確認。
- 既存テストの全通過（type 数を固定しているカタログ系テストがあれば更新）。

---

## 7. 未確定事項

| 項目 | 内容 |
|---|---|
| #7 の部分文字列 `stack` | repeat は文字列全体を複製する。部分文字列だけを複数行に並べるには repeat に scope 対応を追加する必要がある（それまでは B では `converge` のみ） |
| #15 の帯ねじれの解像度 | `pivot:'block'` の X / Y 軸は文字単位で角度が変わる（文字の中では一定）。文字の中まで滑らかにねじる場合は `twist3D` にブロック基準モード（`f` をブロック座標で計算）を追加する |
| #12 の放射 | 既存 `burst` で足りなければ `shape-ops.js` の `SHAPES` に `rays` を追加 |
| #6 の B | text 対象 post が scope マスクを受け取れない場合、B では cpu 側のジッタのみ（真の RGB 分離は text pass に per-letter chroma 値の追加が必要） |
| companion の解除 | enter を変えても companion を残す方針。自動で消したい場合は「companion 由来」の印をエントリに持たせる |
| 決定済み | #7 は「複数行のように並べる」を既定（`stack`）、収束は別表現（`converge`）。#16 の重なりは描画順のまま、描画順はユーザーが `drawOrder` で決める（§4.7）。全体＋一部の組み合わせは全分割で行う（§4.6） |
