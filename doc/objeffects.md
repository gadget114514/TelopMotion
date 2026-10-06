# 動きに反応する対象物の変形（objeffects）

対象物（文字・語・行）が**動いている間だけ**形・色・不透明度・複製が変わる演出 7 種の詳細設計書。
対象は 時間遅延 / カラーシフト（コロラマ）/ フリッカー / エコー / 塗りと線 / 時間置換 / ベンド。
既存の hold 系は「時間の関数」で形を決めており、「動いているかどうか」は効き方に関係しない。本書の 7 種はすべて**動きそのもの（速度・過去の位置）を入力**にする点が新しい。

- 対象コード: `renderer/js/lyrics/motion.js`、`renderer/js/lyrics/physics.js`、`renderer/js/lyrics/effects/softbody.js`、`renderer/js/lyrics/engine.js`、`renderer/js/lyrics/gl/passes.js`、`renderer/js/lyrics/gl/shaders.js`
- 新規: `renderer/js/lyrics/objfx-core.js`（純関数）、`renderer/js/lyrics/effects/objfx.js`（registry 登録）
- 用語: 「動き」= 文字の変換 `x, y, rot, scaleX, scaleY` の時間変化。「動き量」= 速度を 0..1 に正規化した `motionAmount`（§3.2）。

---

## 1. 定義と分解

### 1.1 7 種の定義

| 名前 | type | 動くときに起きること | 主軸 | 単位 |
|---|---|---|---|---|
| 時間遅延 | `hold.timeDelay` | 選んだ部分だけが**同じ軌跡を遅れて**追う。軸（回転中心・向き）はずれない | 時間 | 文字 / 語 / 行 / 文字内の帯 |
| カラーシフト（コロラマ） | `hold.colorShift` | 速度や移動距離に応じて色が巡回・変化する | 色 | 文字 |
| フリッカー | `hold.motionFlicker` | 動いている間だけ不透明度が明滅する | 不透明度 | 文字 |
| エコー | `hold.motionEcho` | 過去の位置に**色付きの影（塗り）**が遅れてついてくる | 複製 | 拍（文字ごとの state） |
| 塗りと線 | `hold.strokeTrail` | 本体は塗りのまま、遅れてついてくる影が**色付きのエッジ（線）だけ** | 複製 + 表現 | 拍 |
| 時間置換 | `hold.timeDisplacement` | 空間の位置ごとに遅れ量が連続的に変わり、**軸がずれる**（せん断・ねじれ・傾き） | 時間 + 形状 | 文字内（格子）/ ブロック |
| ベンド | `hold.motionBend` | 進行方向の先頭が先に動き出し、残りがゴムのように遅れてついてくる（softbody） | 形状（物理） | 文字内（格子） |

### 1.2 時間遅延と時間置換の違い

どちらも「一部を設定してその部分が遅れて動く」が、遅れ方と形への影響が違う。

| | 時間遅延 | 時間置換 |
|---|---|---|
| 遅れ量 | 選んだ部分に**一様**（部分ごとに段階を付けられる） | 空間位置の**連続関数** `lag(u, v)` |
| 遅れた部分の形 | 剛体のまま（平行移動のみ。`props` で回転・拡大も遅らせられる） | 部分内で遅れ量が違うので、形がせん断・ねじれる |
| 軸 | **ずれない**。遅れた部分は本体と同じ軌跡上の過去位置にあり、回転中心・アンカーは保たれる | **ずれる**。中心線や向きが進行方向に対して傾く（AE の Time Displacement に相当） |
| 静止したとき | 全部が同じ位置に戻る | 形が元に戻る |

### 1.3 `doc/textdecor2.md` の分解軸との対応

| 名前 | 軸（textdecor2 §1） | 補足 |
|---|---|---|
| 時間遅延 | I 時間構造 + C 剛体 | stagger は**開始時刻**をずらす。時間遅延は**動いている間の位置**を遅らせる（途中で止まっても遅れて追いつく） |
| カラーシフト | E 質感 | 文字ごとの tint は新設（§4.2） |
| フリッカー | F 可視範囲 | opacity のみ |
| エコー | J 複製（時間複製） | 既存の `animation.echo` / `post.echoTrail` は固定オフセット。こちらは本当の過去位置 |
| 塗りと線 | J 複製 + D 表現 | repeat の `hollow` と同じ「線だけのコピー」を時間方向に作る |
| 時間置換 | C 形状変形（letter / block） | 格子 FFD（P3）を使う |
| ベンド | C 形状変形（物理） | P1 の物理コアに `lead` 拘束を追加する |

---

## 2. 既存資産

| 実装 | 場所 | 本書での用途 |
|---|---|---|
| `rigidAt(index, beatLocal)` | `renderer/js/lyrics/motion.js:663` | 任意の時刻の剛体 state。履歴を持たない純関数なので、`t − lag` の再評価に使える |
| 拍のメインループ（reflow → physics → custom motions → follow → override → keyword → style transform → keyframe delta） | `renderer/js/lyrics/motion.js:1104-1235` | 動きの源の後半。§3.1 で `transformAt` に切り出す |
| `evaluatePhysics` と `driveAt`（`rigidAt` の 2 階差分で加速度を出す） | `renderer/js/lyrics/motion.js:934` | ベンドの駆動。速度 `vel` を追加する |
| `physics.simulateTo`（5×5 格子、Verlet + PBD、`DT = 1/120`、チェックポイント付きキャッシュ） | `renderer/js/lyrics/physics.js:509` | ベンド |
| `pinTop`（第 1 行を rest に固定） | `renderer/js/lyrics/physics.js:332` | ベンドの `lead` 拘束の手本 |
| `hold.softBody` / `hold.gravityHang` / `enter.gravityDrop` | `renderer/js/lyrics/effects/softbody.js` | descriptor の `physics(params, phase)` の書き方 |
| `state.softLattice` → state texture 行 9–21 → `latticeDisp`（Catmull-Rom） | `renderer/js/lyrics/gl/passes.js:33-36`, `gl/shaders.js` の `TEXT_VERT` | 時間置換・region 遅延・ベンドの描画 |
| `STATE_ROWS = 26`（空き行なし） | `renderer/js/lyrics/gl/passes.js:29` | カラーシフト用に 27 にする |
| `packStateRows` | `renderer/js/lyrics/gl/passes.js:74` | tint 行の書き込み |
| `drawLetterClone`（文字ごとの state と色を差し替えてマスクを再描画し、元に戻す） | `renderer/js/lyrics/engine.js:938` | エコー / 塗りと線の描画手順 |
| `drawRepeatCopies` と `hollowColors`（線だけのコピー） | `renderer/js/lyrics/engine.js:800`, `engine.js:701` | 塗りと線 |
| `evaluateBeatState` | `renderer/js/lyrics/engine.js:1124` | エコーのコピー用に過去時刻で再評価 |
| `colorOverride`（`Uint8Array(n*4)`）と `letterTint` | `pipeline.text`, `fillUniforms` | エコーのコピーを単色で塗る |
| `frameGuard.guard` | `renderer/js/lyrics/motion.js:1241` | 遅延で画面外に出た文字の救済 |
| `style.scoped` / `scope.js`（P5） | `renderer/js/lyrics/scope.js` | 「一部を設定」の範囲指定 |
| `selector.js`（rangeSelector） | `renderer/js/lyrics/effects/selector.js` | 文字のランク・空間形状による選択 |

**空白**:
- **速度を入力にする仕組みが無い**。速度を使っているのは物理の駆動だけで、エフェクトから見えない。
- **過去の位置を描く仕組みが無い**。`animation.echo` は完成したレイヤーを固定のずらしで重ねるだけ。
- **文字ごとの任意色が state に無い**。`colorMix` は fill の `colorB` に向かう 1 軸しかない。

---

## 3. 共通コア `renderer/js/lyrics/objfx-core.js`

描画にも registry にも依存しない純関数モジュール（UMD、Node でテスト可能）。`physics.js` と同じ流儀。

### 3.1 動きの源 `transformAt(index, beatLocal)`

7 種すべてが「その文字がその時刻にどこにいたか」を参照する。`rigidAt` だけでは、custom motions・keyframe・style transform の動きが入らない（keyframe で動かしたテロップに効かない）。そこで次の手順にする。

- `motion.js:1114-1203` の剛体以外の寄与（reflow、custom motions、follow、override、keyword、`applyStyleTransform`、`applyKeyframeDeltas`）を `applyPostRigid(index, rigid, state)` に切り出す。メインループはこれを呼ぶだけにし、挙動は変えない。
- `transformAt(index, beatLocal) = applyPostRigid(index, rigidAt(index, beatLocal))` から `{x, y, rot, scaleX, scaleY, opacity}` を返す。
- **物理は含めない**。物理は動きの結果であって源ではない。ベンドを動きの源に入れると、遅延がベンドを追う循環になる。
- **objfx も含めない**。再評価中は `options.objfx = false` を立てて再帰を止める。
- キャッシュ: `scene.__objfx`（Map）に置く。キーは `frameStamp|index|beatLocal`（1e-6 で丸める）。フレームが変わったら破棄する。1 フレーム中の再評価（遅延・速度・時間置換の 5 本）はこれで共有する。

### 3.2 速度と動き量

```js
velocityAt(src, i, t, h = 1/120)      // 中央差分 (P(t+h) − P(t−h)) / 2h → {vx, vy, vrot, vscale}
speedNorm(v, info)                     // hypot(vx, vy) / shortSide + |vrot|/360 + |vscale|
motionAmount(src, i, t, cfg)           // smoothstep(cfg.v0, cfg.v1, speedNorm)
```

- 単位: 画面の短辺/秒。`v0 = 0.02`、`v1 = 0.6`（既定）。「動き出し」と「全力」の閾値は各エフェクトの `sensitivity` で 1 つの値にまとめて動かす（`v1 = 0.6 / sensitivity`）。
- **release**（止まった後の余韻）: `max(motionAmount(t − k·0.025))`（k = 0..`release/0.025`）の窓最大値に、線形の減衰をかけたもの。過去を再評価するだけなので決定論的で、スクラブしても飛ばない。
- **ビート外**: `t < 0` は `t = 0` に、`t > maxT`（ビート長 + exit 長）は `maxT` にクランプする。enter 前の文字は enter 開始位置で止まっている扱いになる。

### 3.3 descriptor と適用位置

- registry の descriptor に `motionFx(params) => cfg | null` を追加する（`physics` と同じ流儀）。
- 7 種とも `group: 'hold'`、`stackable: true`、`pack: 'pro'`（`UI_PACKS` 対策、textdecor2 §4-3）で登録する。`cpu` は no-op。
- ベンドだけは `physics(params, 'hold')` を返す（§4.7）。
- 適用位置は `motion.js` のメインループで、`applyKeyframeDeltas`（`motion.js:1203`）の直後、`warpOrigin` の計算（`motion.js:1215`）の前。順序は次のとおり。
  1. `timeDelay`（位置の置き換え）
  2. `timeDisplacement`（格子・ブロック位置）
  3. `colorShift`（tint）
  4. `motionFlicker`（opacity）
- `motionEcho` / `strokeTrail` は state を変えない。`evaluateBeat` の戻り値の `meta.motionTrails = [{type, cfg}]` に積み、engine が描く（§4.4）。
- `style.scoped`（P5）の scope を持つインスタンスは、scope 内の文字にだけ適用する（hold の「追加」規則と同じ）。

### 3.4 選択 `select`

「一部を設定」を表す共通 param。時間遅延と時間置換（block 単位）、フリッカー、カラーシフトで共有する。

| 値 | 意味 |
|---|---|
| `all` | 全文字 |
| `every` | `n` 文字ごと（`n`、`offset`） |
| `oddEven` | 奇数 / 偶数 |
| `rank` | `units`（letter / word / line）のランクが `from..to` |
| `random` | `fraction` の割合（`seed` 固定） |
| `scope` | インスタンスの `scope`（P5）に任せる |

返り値は 0..1 の重み `sel(i)`。`grade: true` のときは、選択内でのランク位置 `r ∈ 0..1` を重みに掛ける（遅れを段階的にする）。

### 3.5 決定論

- すべて `t` の関数として計算する。書き出し（`video-export.js`）はフレームごとに状態を持たずに `renderFrame(t)` を呼ぶので、前フレームの状態は使わない。
- 状態を持つのはベンド（物理）とカラーシフトの `distance` だけで、どちらも固定 dt でビート開始から積分し、チェックポイント付きでキャッシュする（`physics.simulateTo` と同じ規則）。
- 乱数は `rng.rngFor(seed, beatId|type, 'hold')`。

---

## 4. 各エフェクトの設計

### 4.1 時間遅延 `hold.timeDelay`

| param | kind | 範囲 / 値 | 既定 | random |
|---|---|---|---|---|
| `unit` | select | letter / word / line / region | letter | — |
| `select` | select | §3.4 | oddEven | — |
| `lag` | number | 0–0.6 s | 0.12 | [0.06, 0.25] |
| `grade` | bool | | false | — |
| `props` | select | pos / pos+rot / all | pos | — |
| `band` | select | top / bottom / left / right（region のみ） | top | — |
| `bandSize` | number | 0.1–0.9（region のみ） | 0.5 | — |
| `feather` | number | 0–1（region のみ） | 0.4 | — |

**letter / word / line**

```
L   = lag · sel(i) · (grade ? r : 1)
P0  = transformAt(i, t)
PL  = transformAt(i, t − L)
state.x += PL.x − P0.x;  state.y += PL.y − P0.y
props ⊇ rot   → state.rot    += PL.rot − P0.rot
props = all   → state.scaleX *= PL.scaleX / P0.scaleX（Y も同様）
```

- 差分で加算するので、物理や hold の揺れは残り、**動きの分だけ**が遅れる。
- word / line 単位では、単位内の全文字に同じ `L` を使う。語の形を崩さず、語ごと遅れる。
- 遅れた部分は本体と同じ軌跡上の過去位置にいるので、軸は変わらない。動きが止まれば `PL = P0` になり、自然に追いつく。

**region（文字内の帯）**

- 格子 5×5 のうち `band` 側の `bandSize` の領域を、`feather` で滑らかにつないだ重み `w(u, v)` で選ぶ。
- 変位 `Δ = R(−P0.rot) · (PL.xy − P0.xy) / (scale · half)` を格子節点に `w · Δ` として加算する。
- 帯は剛体のまま平行移動するので、軸の向きは変わらない（つなぎ目の feather 部分だけ伸びる）。

**legibility / frame-guard**: 遅延量の上限 `0.6 s` は、`allowTranslate` の判定（enter 完了後）と矛盾しない。exit 中に遅れた文字が画面外に出るのは意図どおり。

**コスト**: 選ばれた文字ごとに `transformAt` を 1 回（キャッシュあり）。

### 4.2 カラーシフト（コロラマ）`hold.colorShift`

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `driver` | select | speed / distance / progress | distance |
| `palette` | select | hueCycle / gradient / beatPalette | hueCycle |
| `colorA` / `colorB` | color | （gradient） | `#ff3b6b` / `#3bd1ff` |
| `cycles` | number | 0.1–6（1 単位あたりの周回数） | 1 |
| `phase` | number | 0–1 | 0 |
| `spread` | number | 0–1（文字ランクによる位相ずれ） | 0.3 |
| `mix` | number | 0–1 | 0.85 |
| `affect` | select | fill / fill+edge | fill |
| `select` | select | §3.4 | all |
| `release` | number | 0–1 s | 0.3 |

**入力**（AE の Colorama の「入力位相」に相当）

- `speed`: `φ = speedNorm(v) · cycles`。速いほど色相が進む。止まると元の色に戻る。
- `distance`: `φ = D(t) / shortSide · cycles`。`D(t) = ∫|v|dt` をビート開始から `DT = 1/60` で積分する（`scene.__objfx` に 0.25 s ごとのチェックポイント）。**動いた分だけ色が巡り、止まると色がその場で止まる**。コロラマらしい挙動はこれ。
- `progress`: `φ = (enter / exit の進行度) · cycles`。

文字ごとの位相 `φ_i = φ + phase + spread · r_i`。

**出力（写像）**

- `hueCycle`: fill の基準色の色相を `360° · φ_i` 回す（HSL 空間、CPU で RGB に変換）。
- `gradient`: `colorA → colorB → colorA` の三角波で `fract(φ_i)` を写す。
- `beatPalette`: ビートのパレット色を `fract(φ_i)` で巡る。

混ぜ量 `m = mix · max(motionAmount, driver === 'distance' ? 1 : 0) · sel(i)`。`distance` のときは止まっても色を保持する。ほかの 2 つは動き量に比例して元の色へ戻る。

**GPU**

- `STATE_ROWS` を 26 → 27 にし、行 26 = `tint(r, g, b, m)` を追加する（`TINT_ROW = 26`）。`packStateRows` で、tint の無い文字は 0 を書く。
- `FILL_FRAG`: 文字 ID のデコード（P5 で修正済み）の直後に `col.rgb = mix(col.rgb, tint.rgb, tint.a)` を足す。グラデーション fill でも模様（明度）を残したいときのために、`hueCycle` は CPU で「基準色の色相回転」として出す。fill の模様ごと回す GLSL の hue rotate は O2 の検討事項にする。
- `affect: fill+edge`: `EDGE_FRAG` は文字 ID を持たない（SDF 合成後）ため、O2 では fill のみ。edge は「tint の平均色をエッジ色へ混ぜる」近似を O6 で検討する。
- `createTextPass` と `scripts/test/ae-primitives.test.js` の `STATE_ROWS` の値を更新する。
- Canvas2D フォールバックは tint を無視する。

### 4.3 フリッカー `hold.motionFlicker`

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `wave` | select | random / sine / strobe | random |
| `rate` | number | 2–30 Hz | 12 |
| `depth` | number | 0–1 | 0.7 |
| `minOpacity` | number | 0–0.8 | 0.2 |
| `duty` | number | 0.1–0.9（strobe） | 0.5 |
| `spread` | number | 0–1（文字ごとの位相ずれ） | 0.5 |
| `sensitivity` | number | 0.25–4 | 1 |
| `release` | number | 0–1 s | 0.15 |
| `select` | select | §3.4 | all |

```
w(t) = random: valueNoise(seed, i, floor(t·rate))      // 段々の明滅
       sine:   0.5 + 0.5·sin(2π(t·rate + spread·r_i))
       strobe: fract(t·rate + spread·r_i) < duty ? 1 : 0
k = depth · motionAmount · sel(i) · w(t)
state.opacity = max(minOpacity · state.opacity, state.opacity · (1 − k))
```

- CPU だけで完結する。GPU の変更は無い。
- 静止中は `motionAmount = 0` なので何も起きない。
- `minOpacity` が legibility の下限。legibility の判定は静止時のサンプルで行うため、フリッカーで落ちることは無い。

### 4.4 エコー `hold.motionEcho`

既存の `animation.echo`（完成レイヤーの固定ずらし、`engine.js:526`）とは別物。こちらは**本物の過去位置**に影を描く。

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `count` | int | 1–6 | 3 |
| `spacing` | number | 0.02–0.3 s | 0.06 |
| `colorA` / `colorB` | color | 最初のコピー → 最後のコピー | `#ff3b6b` / `#3b6bff` |
| `opacity` | number | 0–1 | 0.6 |
| `decay` | number | 0–1（コピーごとの減衰率） | 0.35 |
| `scaleDecay` | number | 0–0.3 | 0 |
| `blend` | select | normal / add | normal |
| `behind` | bool | 本体の下に描く | true |
| `minGap` | number | 0–0.5 em | 0.08 |

**評価（motion 側）**

- `meta.motionTrails` に `{ type: 'echo', cfg }` を積むだけ。

**描画（engine 側）** 新関数 `drawMotionTrail(active, trail, t, colorSet, variant)`。`drawLetterClone`（`engine.js:938`）と同じ手順にする。

1. k = count..1（古い順）について `states_k = evaluateBeatState(project, beat, scene, t − k·spacing, activeList)` を `options.objfx = false` で評価する。物理は含めたまま（ベンド中の形も影に残る）。
2. 文字ごとに本体との距離 `d = hypot(Δx, Δy) / em` を測り、`fade = smoothstep(minGap, 2·minGap, d)` を opacity に掛ける。**止まっている間は本体と重なるので影を消す**（半透明の本体の下に影がにじまないように）。
3. `scaleDecay` があれば `scaleX, scaleY *= 1 − scaleDecay·k`。
4. 色 `c_k = mix(colorA, colorB, (k−1)/(count−1))` で `colorOverride` を作り、`beginLayer` → `pipeline.text(scene, states_k, variant, colorOverride)` → `fill`（solid） → `commitLayer(opacity · (1 − decay)^(k−1), …, blend)`。
5. 本体のマスクと state を元に戻す（`drawLetterClone` の復元手順）。

- 描画位置: `behind` のときは本体の `beginLayer` の前（拍の最初）、そうでなければ本体の `commitLayer` の後。
- `blend: add` は `commitLayer` に加算合成のフラグを追加する（`ONE, ONE`）。
- **コスト**: `count` 回の拍評価 + `count` 回のマスク描画。`count ≤ 6` に制限する。書き出しでは問題ないが、プレビューで重い場合は `cost` を `high` にする（`costOf` で count に比例）。

### 4.5 塗りと線 `hold.strokeTrail`

エコーと同じ経路で、コピーを**線だけ**で描く。本体は通常の fill のまま。

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `count` | int | 1–6 | 4 |
| `spacing` | number | 0.02–0.3 s | 0.05 |
| `width` | number | 0.5–8 px（em 比で正規化） | 2 |
| `colorA` / `colorB` | color | | `#00e5ff` / `#ff00c8` |
| `opacity` | number | 0–1 | 0.9 |
| `decay` | number | 0–1 | 0.25 |
| `widthDecay` | number | 0–1 | 0.3 |
| `dash` | number | 0–1（0 = 実線） | 0 |
| `behind` | bool | | true |
| `minGap` | number | 0–0.5 em | 0.08 |

**描画**: `drawMotionTrail` の `trail.type === 'stroke'` 分岐。各コピーで次を行う。

1. `pipeline.text(scene, states_k, variant)` でマスクを描く。
2. `sdf()` で距離場を作る。
3. `edge.outline` の uniform（色 `c_k`、幅 `width · (1 − widthDecay)^(k−1)`、`dash`）で edge パスだけを描き、fill は描かない。repeat の `hollow` が使う `drawDecor`（`engine.js:841`）の「edge のみ」設定をそのまま流用する。
4. `commitLayer`。

- コピーの数だけ SDF を作り直すのがいちばん重い。`count ≤ 6` とし、SDF の解像度は本体の 1/2 にする（線の太さが 8px 以下なので見た目は変わらない）。
- 本体を線にしたい場合は、既存の edge / fill の設定で行う（本エフェクトの範囲外）。

### 4.6 時間置換 `hold.timeDisplacement`

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `unit` | select | letter / block | letter |
| `map` | select | linearX / linearY / radial / alongVelocity / noise | alongVelocity |
| `maxLag` | number | 0–0.5 s | 0.15 |
| `invert` | bool | 遅れる側を反転 | false |
| `noiseScale` | number | 0.5–4（noise） | 1.5 |
| `select` | select | §3.4 | all |
| `amount` | number | 0–1（変位のかかり具合） | 1 |

**遅れ量の写像 `lag(u, v)`**（`u, v ∈ −1..1` は文字ローカル、block 単位では block 内の正規化位置）

| map | `s(u, v)`（0..1） | 見え方 |
|---|---|---|
| `linearX` | `(u + 1)/2` | 右側ほど遅れる（横にせん断） |
| `linearY` | `(v + 1)/2` | 下側ほど遅れる |
| `radial` | `hypot(u, v)/√2` | 外側ほど遅れる（ねじれ・膨らみ） |
| `alongVelocity` | `(1 − dot((u, v), v̂))/2`、`v̂` は現在速度の向き（ローカル） | 進行方向の後ろ側ほど遅れる |
| `noise` | `valueNoise(seed, u·noiseScale, v·noiseScale)` | ゆらぎ |

`lag = maxLag · (invert ? 1 − s : s) · sel(i)`

**letter 単位（格子）**

- 25 節点それぞれで `Δ(u, v) = M(t)⁻¹ · (Q(t − lag) − Q(t))`。`Q(τ)` は節点 `(u, v)` を時刻 τ の変換（位置・回転・拡大）で画面に写した点、`M(t)⁻¹` は現在の変換の逆で、変位をローカル正規化単位に戻す。
  - 回転中の文字では、遅れた節点が過去の角度の位置にあるので、**文字の軸が回転方向と逆に傾く**。平行移動だけなら、せん断になる。
- 評価回数を抑えるため、遅れ量を 5 段階（`lag · j/4`、j = 0..4）に量子化して `transformAt` を 5 回呼び、各節点は隣の 2 段階の間を線形補間する。
- `state.softLattice` に `amount · Δ` を加算する（§5 の合成規則）。

**block 単位**

- 各文字の中心の block 内位置 `(u_i, v_i)` で `lag_i` を決め、時間遅延の letter 単位と同じ式で文字ごとに位置を遅らせる。
- 行全体がせん断・湾曲して見える（「軸がずれる」の行レベル版）。格子は使わない。

**frame-guard / legibility**: 格子の最大変位は物理と同じく `0.8`（§5）でクランプされ、`frame-guard.js:31` / `legibility.js:207` は `softLattice` の最大変位を deform と同じように扱う（P2 で実装済み）。

### 4.7 ベンド `hold.motionBend`（softbody）

| param | kind | 範囲 / 値 | 既定 |
|---|---|---|---|
| `leadSide` | select | auto / left / right / top / bottom | auto |
| `leadWidth` | number | 0.1–0.8（先頭として固定する厚み） | 0.3 |
| `stiffness` | number | 0.05–0.9 | 0.25 |
| `damping` | number | 0–0.5 | 0.08 |
| `inertia` | number | 0–3 | 1.4 |
| `maxStretch` | number | 0.4–1.2 | 0.9 |
| `rotLag` | number | 0–1（回転による遅れ） | 0.5 |

**仕組み**

物理の格子は「剛体の枠（文字の現在の変換）」の中で動く。枠が加速すると、慣性で格子が枠に対して後ろへ取り残される（`drive.accel` 項、textdecor2 §6.1）。ここに**先頭側の節点を枠にピン留め**する拘束を足すと、次のようになる。

1. 動き出し: 枠と一緒に先頭が即座に動き、残りの節点は慣性で取り残される → 進行方向に引き伸ばされる。
2. 等速中: 弱いばね（`stiffness`）で徐々に追いつく → ゴムのように遅れてついてくる。
3. 停止: 先頭は即座に止まり、残りが慣性で先頭を追い越してから戻る → オーバーシュートとぷるん。

**physics.js の変更**

- `drive.vel = {x, y, rot}` を追加する。`evaluatePhysics` の `driveAt`（`motion.js:984`）で、加速度を求めているのと同じサンプル `s0` を使って `(current − s0)/DT` で出す。
- cfg に `lead = { side, width, rotLag }` を追加する。`step` の拘束反復の後、`pinTop`（`physics.js:332`）と同じ位置で処理する。
  - 方向 `d̂`: `side === 'auto'` のとき `d̂ = R(−rot) · normalize(vel.xy)`（ローカル）。速度が `v0` 未満のときは、直前に有効だった方向を `sim.leadDir` に保持する（止まった後の揺れ戻しの向きを保つ）。固定 side はその方向の単位ベクトル。
  - 重み `w(u, v) = smoothstep(1 − 2·width, 1, dot(rest(u, v), d̂))`。先頭の辺ほど 1。
  - 節点 `nodes = mix(nodes, rest, w)`。`w = 1` は完全固定、境目は柔らかく固定する。
  - 回転: `rotLag > 0` のとき、`drive.accel.rot` による回転慣性（既存項）を `rotLag` 倍する。先頭を軸に、後ろ側が振り回される。
- 変位のクランプ `0.8`（textdecor2 §6.1-6）を `cfg.maxStretch` で可変にする（既定 0.8 のまま、ベンドだけ最大 1.2）。
- 面積保存（`solveArea`）はそのまま効くので、伸びると細くなる（ゴムらしさ）。

**softbody.js の追加**

```js
register({
  group: 'hold', type: 'motionBend', pack: 'pro', stackable: true,
  params: [...], cpu() {},
  physics(params, phase) {
    return {
      drive: 'none', stiffness: params.stiffness, damping: params.damping,
      inertia: params.inertia, gravity: 0, maxStretch: params.maxStretch,
      lead: { side: params.leadSide, width: params.leadWidth, rotLag: params.rotLag },
    };
  },
});
```

- `com`（剛体オフセット）は動かさない。文字の位置は本来の動きのままで、形だけが遅れる。
- `physicsEntryAt` は hold 配列で `physics` を持つ最初の 1 つを採る（textdecor2 §6.2）。softBody とベンドを同時に積んだ場合は**先に積んだほうだけ**が効く。Inspector に注意書きを出す（§5）。
- 決定論・スクラブ: 既存の `simulateTo` のキャッシュとチェックポイントをそのまま使う。キーに params のハッシュが入るので、`lead` を含めれば十分。

---

## 5. 合成規則と既知の制約

1. **格子の合成**: ベンド（物理）→ 時間置換 → 時間遅延 region の順に、`state.softLattice` へ**加算**する。最後に 1 回だけ、節点ごとにベクトル長 `max(maxStretch, 0.8)` でクランプする。物理の格子はキャッシュ共有なので、加算は**複製した配列**に対して行う（`Float32Array.from`）。
2. **物理は 1 つ**: `physicsEntryAt` は最初の 1 つだけを採る。ベンドと softBody / gravityHang は併用できない。Inspector の hold スタックで 2 つ目に警告バッジを出す。
3. **エコー・塗りと線と時間遅延**: エコーの再評価は `objfx = false` なので、影は時間遅延を含まない。遅延した部分の影は、遅延していない軌跡に描かれる。意図して遅延を影に含めたい場合は v2 で `includeFx` を検討する。
4. **カラーシフトと `colorMix` / keyword**: tint は fill の出力の後に混ぜるので、`colorMix`（keyword の強調、span の色）より上に乗る。keyword の文字は `mix · 0.5` に弱める（強調が消えないように）。
5. **Canvas2D フォールバック**: 格子（時間置換・region 遅延・ベンド）と tint は無視する。時間遅延（letter / word / line）、フリッカー、エコー（単色描画）は動く。
6. **media layer**（`gl/layers.js` の `evaluateLayerMotion`）は対象外。N = 1 の剛体なので、時間遅延・カラーシフト・フリッカー・エコーは同じコアで後から対応できる（v2）。
7. **legibility のサンプラー**は `options.skipPhysics` で物理を飛ばす（`motion.js:939`）。同様に `options.objfx = false` で本書のエフェクトを飛ばし、「静止時に読めるか」で判定する。

---

## 6. ロードマップ

| 順 | 内容 | 対応 |
|---|---|---|
| O0 | 本書 | 完了 |
| O1 | `objfx-core.js`、`applyPostRigid` / `transformAt` の切り出し、`motionFx` descriptor、`hold.timeDelay`（letter / word / line）、`hold.motionFlicker` | §3, §4.1, §4.3 |
| O2 | `STATE_ROWS` 27 と tint 行、`FILL_FRAG`、`hold.colorShift` | §4.2 |
| O3 | `hold.timeDisplacement`（letter 格子 / block）、`timeDelay` の region、格子の合成規則 | §4.6, §4.1, §5-1 |
| O4 | engine `drawMotionTrail`、`hold.motionEcho`、`hold.strokeTrail`、`commitLayer` の加算合成 | §4.4, §4.5 |
| O5 | physics の `drive.vel` / `lead` / `maxStretch`、`hold.motionBend` | §4.7 |
| O6 | プリセット、i18n、軸テーブル、showcase、Help メニュー | 下記 |

**O6 の詳細**

- **プリセット**（`registerPreset`）
  - `lagTail`（timeDelay、line 単位、grade）
  - `chromaWalk`（colorShift distance + hueCycle）
  - `speedStrobe`（flicker strobe）
  - `rainbowEcho`（echo、count 5、hueCycle 風の colorA → colorB）
  - `neonTrail`（strokeTrail、シアン → マゼンタ、add）
  - `shearDrag`（timeDisplacement、alongVelocity）
  - `rubberLead`（bend auto）
- **読み込み**
  - `renderer/studio.html`: `objfx-core.js` は `physics.js` の後、`effects/objfx.js` は `softbody.js` の後、`staged-presets.js` の前（`boot.test.js` の順序制約）。
  - Node 側の require 一覧（textdecor2 §6.4 に列挙されたテストとスクリプト）に `objfx-core.js` と `effects/objfx.js` を追加する。
- **i18n**: `renderer/js/studio/fx-strings.js` の en / ja / es / fr / ru に、type・param・選択肢を追加する（`fx-i18n.test.js`）。ja の名前は 時間遅延 / カラーシフト / フリッカー / エコー / 塗りと線 / 時間置換 / ベンド。
- **軸テーブル**: `node scripts/fx-axes-build.js` で `renderer/data/fx-axes.json` と `fx-axes-table.js` を再生成する。
- **showcase**: `scripts/objfx-showcase.js build|list` を作り、`renderer/data/objfx-showcase.json` と `demo/objfx-showcase.md` を出力する。
  - 7 セクション × cue（full / enter / hold / exit）。動きが無いと効果が見えないため、各 cue の enter / exit は移動量の大きい type（slide、flyIn、spin など）と組み合わせる。hold の cue には `hold.drift` など移動を伴うものを重ねる。
  - `scripts/shader-showcase.js` を手本に、`FIXED_TIME`、2 拍のタイトル、plate を付ける。
  - npm script、Help メニューの項目（`renderer/js/i18n.js` の 5 言語）、`scripts/test/objfx-showcase.test.js` も追加する。

リリースは O1〜O3 を 1 セット、O4、O5、O6 の順（コミットは分ける）。

---

## 7. 検証

1. `npm test`、`npm run check`
2. `node scripts/fx-axes-build.js --check`
3. `SA_SMOKE=1 SA_SMOKE_SHADERS=1` でシェーダをコンパイルする（tint 行、`STATE_ROWS` 27）。
4. 新規 `scripts/test/objfx.test.js`（`shader-breaks.test.js` の `freshState` / `info` の流儀）
   - **静止不変**: 動きの無い拍で 7 種どれを当てても、state（x, y, rot, opacity, softLattice, tint）が変わらない。エコー / 塗りと線は `fade = 0`。
   - **lag = 0 / depth = 0 / mix = 0** で元の state と一致する。
   - **時間遅延**: 等速の slide で、遅延文字の位置が `transformAt(t − lag)` と一致し、軌跡の直線上にある（軸がずれない）。
   - **時間置換**: 回転する文字で、格子の中心線が回転方向と逆に傾く。平行移動だけなら、せん断（中心は不動）。
   - **カラーシフト distance**: 移動中に位相が単調増加し、停止後は一定。
   - **フリッカー**: `opacity ≥ minOpacity · base`。
   - **ベンド**: 動き出しで先頭側の節点の変位が 0 付近、後ろ側が進行方向と逆。停止後にオーバーシュートし、減衰する。`simulateTo` を同じ t で 2 回呼んで一致する（決定論）。
   - `motion.test.js`: `applyPostRigid` の切り出し前後で、既存の全 type の state が一致する（回帰）。
   - `ae-primitives.test.js`: `STATE_ROWS === 27`。
5. Studio で showcase を開き、7 種を順に当てて目視する。スクラブで前後に動かしても、影・色・形が飛ばないこと。
6. 書き出し（mp4）を 2 回行い、フレームが一致すること（決定論）。
