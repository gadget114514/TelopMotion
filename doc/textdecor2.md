# テキスト演出の分解とソフトボディ（textdecor2）

`doc/app-design.md` §7 のエフェクトカタログを、**要素の軸**に分解して棚卸しし、空白の大きいところから実装していくための設計文書。
本書は最初に「分解軸」と「全エフェクトの対応表」を定義し、次に既存の部分演出（部分文字列の装飾）を整理し、最後にロードマップ（P1〜P6）の仕様を置く。

- 対象コード: `renderer/js/lyrics/effects/*.js`、`renderer/js/lyrics/gl/shaders.js`、`renderer/js/lyrics/gl/passes.js`、`renderer/js/lyrics/motion.js`、`renderer/js/lyrics/engine.js`
- 全 type の一覧は `fx.list(group, { packs: 'all' })`（Node から `registry.js` + 各 effects を require して取得）を正とする。

---

## 1. 分解軸

演出を「どの軸の操作か」で分解する。1 つのエフェクトは複数の軸にまたがってよい（対応表の「主軸」は代表を 1 つ選ぶ）。

### A. 字形ソース（glyph source）

どの字形データからマスクを作るか。

| 実装 | 場所 |
|---|---|
| opentype.js のグリフ輪郭（`buildLetter` → `letter.src='font'`） | `renderer/js/lyrics/font.js:488` |
| Canvas2D ラスタライズ + 輪郭トレース（`rasterLetter`、フォントに無い字形のフォールバック） | `renderer/js/lyrics/font.js:431` |
| フォントセットの選択・並べ替え（`fontset.js` / `orderFonts`） | `renderer/js/lyrics/font.js:501`, `renderer/js/lyrics/fontset.js` |
| composition の span ごとのフォント / サイズ | `renderer/js/lyrics/font.js:593`, `renderer/js/lyrics/scene.js:128` |
| スクランブル中の文字差し替え（`enter.scramble`） | `renderer/js/lyrics/effects/enter.js` |
| 現状のデフォルト | 1 ビート 1 フォント（span 以外は同一） |

**空白**: 文字ごとの任意フォント・任意グリフ・任意輪郭ソース（手描きストローク、SVG パス、図形）。`A` 軸の操作は `enter.scramble` と composition span しか無い。

### B. 輪郭操作（contour ops）

輪郭線そのものを加工する（オフセット、膨張、収縮、平滑化、角丸、波打ち）。

| 実装 | 場所 |
|---|---|
| ストロークリボンの生成（輪郭の平行移動で作る帯） | `renderer/js/lyrics/geometry.js`（`strokeRibbon`）, `renderer/js/lyrics/scene.js:65` |
| ダッシュ / トリム（`text-bg.js` の `trim` / `dash`） | `renderer/js/lyrics/effects/text-bg.js` |
| shape layer のパス変形（背景側の輪郭操作） | `renderer/js/lyrics/shape-ops.js`, `renderer/js/lyrics/effects/shape-layer.js` |
| 画面全体の歪み（レンズ / 波 / 渦） | `renderer/js/lyrics/effects/post.js`（`lensDistortion` ほか） |

**空白**: 文字輪郭に対する幾何オフセット（アウトラインの膨張・収縮・平滑化・角丸）は存在しない。太らせる表現はすべて edge / text-bg の SDF 距離場で代用しており、**輪郭の幾何そのものは動かない**。`B` 軸の実装（次の例: `hold.outlinePulse` = 輪郭の半径を時間変化させる）がロードマップの 3 番目。

### C. 形状変形（shape deformation）

空間のどのスコープで座標を動かすか。4 段階。

| スコープ | 実装 | 場所 |
|---|---|---|
| 剛体（移動・回転・拡大） | motion の formation / `state.x/y/rot/scaleX/scaleY` | `renderer/js/lyrics/motion.js:598` |
| letter 変形（字形ローカル、bbox 中心） | deform code 1–19（jelly, bend, bulge, ...） | `renderer/js/lyrics/effects/warp.js:31`, GLSL `deformOne` `renderer/js/lyrics/gl/shaders.js:134` |
| block 変形（ブロック中心、字間ごと） | deform code 20–31（arc, waveBlock, …, zoomBlock） | `renderer/js/lyrics/effects/warp.js:50`, `renderer/js/lyrics/gl/shaders.js:204` |
| 画面空間（合成後） | post の warp 系（`lensDistortion` / `waveWarp` / `twirl` / `displacementMap` など） | `renderer/js/lyrics/effects/post.js` |

- deform は 1 文字あたり 3 スロット。block 変形が 1 枠を予約する（`deformSlots`）: `renderer/js/lyrics/gl/passes.js:31`。
- vertex shader での合成は `applyDeformStack`: `renderer/js/lyrics/gl/shaders.js:256`、`TEXT_VERT` 内の適用は `renderer/js/lyrics/gl/shaders.js:321`。
- block 変形の原点は motion が `state.warpOrigin` / `state.blockHalf` に書き、state texture の行 7 に載る: `renderer/js/lyrics/motion.js:774`, `renderer/js/lyrics/gl/passes.js:85`。

**空白**: **物理**。すべての変形が「関数で形を決める」もので、時間発展する内部状態（速度・慣性・ばね）を持たない。本計画の主役（P1〜P4）はここ。

### D. 表現（representation）

マスクをどう描くか。

| 表現 | 実装 | 場所 |
|---|---|---|
| mesh（塗り） | 三角形メッシュ（earcut + 細分化） | `renderer/js/lyrics/scene.js:42`, `renderer/js/lyrics/gl/passes.js:104` |
| stroke（輪郭リボン） | 頂点に `(s, side)` を持つ帯 | `renderer/js/lyrics/effects/repeat.js`, `enter.strokeDrawOn`, `exit.strokeErase` |
| pieces（断片） | 三角形単位で飛ばす（`shatterRebuild` / `particlesDisperse`） | `renderer/js/lyrics/gl/shaders.js:1986` |
| particles（粒子） | 内点サンプル + モーフ | `renderer/js/lyrics/gl/shaders.js:1995`, `renderer/js/lyrics/gl/layers.js` |
| コード表 | `REP_CODES = { mesh, stroke, pieces, particles }` | `renderer/js/lyrics/gl/passes.js:7` |

**空白**: **pixels（ドット / ピクセルグリッド / ハーフトーン変調）**。post の `pixelate` は合成後の見た目だけで、文字のサンプリング自体はメッシュのまま。ロードマップの 2 番目は `REP_CODES` に `pixels` を足すこと。

### E. 質感（surface / texture）

塗り・縁・画面後処理。

| 層 | 実装 | 場所 |
|---|---|---|
| fill（文字の内側） | `FILL_FRAG`、14 type | `renderer/js/lyrics/effects/fill.js`, `renderer/js/lyrics/gl/shaders.js` |
| edge（文字の縁） | `EDGE_FRAG`、8 type、SDF 距離場を使う | `renderer/js/lyrics/effects/edge.js`, `renderer/js/lyrics/gl/shaders.js` |
| post（画面全体） | 54 type | `renderer/js/lyrics/effects/post.js` |
| 背景（クリップの後ろ） | background / bgShape / bgFill / bgEdge / bgMotion | `renderer/js/lyrics/effects/background.js`, `text-bg.js` |
| color グループ | パレット解決（fill の色参照） | `renderer/js/lyrics/effects/color.js`, `renderer/js/lyrics/scene.js:23` |

**空白**: fill / edge / post の **適用範囲**（1 文字だけ別の質感、部分文字列だけ別の fill）が無い（→ L 軸・P5）。質感そのものの種類は十分。

### F. 可視範囲（visibility / mask）

文字のどこを見せるか。

| 実装 | 場所 |
|---|---|
| opacity（fade / opacityPulse / neonFlicker） | `renderer/js/lyrics/effects/enter.js`, `hold.js` |
| ワイプ（`state.wipeMode` / `state.wipeSoft`） | `renderer/js/lyrics/gl/shaders.js:351`（`TEXT_FRAG` の閾値判定） |
| `visibleFrac`（typewriter / strokeErase / wipe） | `renderer/js/lyrics/effects/enter.js`, `exit.js:112` |
| マスク（`state.maskFrac`、text-bg の fill 量） | `renderer/js/lyrics/gl/shaders.js:367` |
| dissolve（乱数しきい値で不連続に消す） | `renderer/js/lyrics/effects/exit.js:99` |

**空白**: 可視範囲の「形」（任意のパスで切り抜く、文字ごとに違うワイプ方向、しきい値マップ）は未実装。ワイプは直線 / 放射 / 斜めの 6 モード固定（`TEXT_FRAG` の `wipeMode`）。

### G. 駆動源（driver）

何が時間変化を決めるか。

| 駆動 | 実装 | 場所 |
|---|---|---|
| キーフレーム | `project.keyframes[path][prop]`、`transform.*` と `*.params.*` | `renderer/js/lyrics/motion.js:232`, `scripts/studio/timeline.js` |
| イージング | `MotionDef.in/out`、33 curve + spring / elastic | `renderer/js/lyrics/easing.js`, `renderer/js/lyrics/motion.js:74` |
| ループ | `animation.loop` / `hold` の `loop.period`（yoyo） | `renderer/js/lyrics/motion.js:431` |
| 音（ビート / レベル） | `audioFeatures.bpm`、`audioDriver.frameAt` / `sample` | `renderer/js/lyrics/audio-analysis.js:139`, `renderer/js/lyrics/audio-driver.js:18` |
| 乱数 | seed 付き RNG（`rng.rngFor`）— 決定論的 | `renderer/js/lyrics/rng.js` |
| **物理・内在力** | **なし** | **—（P1〜P4 で追加）** |

**空白**: 力・慣性・衝突・内部状態。既存の「跳ねる」は easing の形であり、速度の積分ではない。順番の落下（`exit.gravityFall`）は `k²` イージングなので、`animation.stagger` と重ねると実効 `k⁶` になる（→ 4 章）。

### H. 配置（placement）

テキストの位置をどこに決めるか。

| 実装 | 場所 |
|---|---|
| formation（row / circle / spiral / scatter / …） | `renderer/js/lyrics/layout.js`, `renderer/js/lyrics/effects/layout.js` |
| location（center / lowerThird / karaoke / grid / …） | `renderer/js/lyrics/effects/location.js` |
| drift / pathFollow / marquee（保持中の移動） | `renderer/js/lyrics/effects/hold.js:137,234,160` |
| frame guard（画面外に出しすぎない） | `renderer/js/lyrics/frame-guard.js:83` |
| スタック（複数行の縦積み） | `renderer/js/lyrics/motion.js`（`stackOffset`）、engine のトラック描画 |

**空白**: 文字同士の衝突・押しのけ合い・重力で積み上がる配置。物理配置は P1 の後（「文字同士の衝突」をロードマップ末尾に置く）。

### I. 時間構造（timing structure）

複数の文字 / 複数グループの時間の組み方。

| 実装 | 場所 |
|---|---|
| stagger（ltr / rtl / center-out / word / line / strokeLength / oddEven / vertical-reading） | `renderer/js/lyrics/motion.js:87` |
| animation group（simultaneous / cascade / spring / followThrough / stopMotion / timeWarp / loop / echo） | `renderer/js/lyrics/effects/animation.js`, `renderer/js/lyrics/motion.js:410-444` |
| per-group envelope（enter/hold/exit の重なり、`offMax`） | `renderer/js/lyrics/motion.js:537-549` |
| ビート境界（cue → beat の入れ替え、クロマキー） | `renderer/js/lyrics/effects/background.js`, `renderer/js/lyrics/engine.js:1569` |

**空白**: 文字ごとに独立した時計（部分演出の enter/exit の置き換えは P5）。物理は**ビート開始からの固定 dt 再計算**という別の時間構造を導入する（P1）。

### J. 複製（duplication）

| 実装 | 場所 | 内容 |
|---|---|---|
| 空間複製 `repeat`（stackV / grid / radial / tunnel / …） | `renderer/js/lyrics/effects/repeat.js`, `renderer/js/lyrics/engine.js:493` | 配置を増やす |
| 時間複製 `echo` / `echoTrail` / `motionBlur` | `renderer/js/lyrics/effects/animation.js`, `renderer/js/lyrics/effects/post.js` | 過去フレームを重ねる |
| clones（`style.clones`） | `renderer/js/lyrics/engine.js:1680` | 同一文字列を別 transform / 色で重ねる（repeat の特殊形） |

**空白**: 複製先ごとの**別演出**（コピーごとに違う type の hold を載せる）。現状は repeat の decor と色だけ。

### K. 多重化（layering）

同じ位置・同じ軸に複数の装飾を重ねる。

| 実装 | 場所 |
|---|---|
| hold / edge / post / bgEdge が配列で stackable | `renderer/js/lyrics/effects/registry.js:220`, `motion.js:629` |
| deform 3 スロット（合議制: 振幅の大きい 2〜3 個が勝つ） | `renderer/js/lyrics/gl/passes.js:31` |
| fill / edge の描画順（`edge.top` で上か下か） | `renderer/js/lyrics/engine.js:1720-1737` |
| `colorMix`（fill を colorB へ混ぜる） | `renderer/js/lyrics/gl/passes.js:97`, `FILL_FRAG` |

**空白**: 同じ軸の中で**種類の違う層**を共存させる仕組み（例: 1 文字に outline と neonGlow を別色で）。edge は配列で重ねられるが、同じ SDF に同じ色で描かれる。`style.scoped`（P5）がこの穴を埋める。

### L. 適用範囲（scope）

「どの文字に効かせるか」。全軸を横断する関心事。

| 実装 | 場所 | 単位 |
|---|---|---|
| override（transform） | `renderer/js/lyrics/motion.js:170` | cue / beat / line / word / letter |
| keyframe のパス | `renderer/js/lyrics/motion.js:232` | cue / beat / line / word / letter |
| span（composition） | `renderer/js/lyrics/font.js:593`, `scene.js:243` | コードポイント範囲（サイズ / フォント / paletteIndex のみ） |
| rangeSelector / rangeReveal / tracking | `renderer/js/lyrics/effects/selector.js` | letter / word / line のランク + 空間形状 |
| keyword（weird の強調） | `renderer/js/lyrics/keywords.js`, `motion.js:29` | 行内の部分一致 |

**空白**: 任意のエフェクトを任意の範囲に適用する仕組み（**P5 の `scope`**）。既存の 4 系統は「できること」がそれぞれ固定で、種類を替えられない（→ 3 章）。

---

## 2. 対応表

`fx.list(g, { packs: 'all' })` の全 type。`*` は preset（primitive に展開される）、`[font]` / `[pro]` は pack。
主軸は A–L、駆動は「キーフレーム / イージング / ループ / ビート / 乱数 / なし」から選ぶ。

### animation（9）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| stagger | I 時間構造 | キーフレーム / 乱数順 | 8 種の順序 + unit |
| simultaneous | I 時間構造 | なし | each = 0 |
| echo | J 複製（時間） | ループ | 過去フレームの重ね |
| cascade | I 時間構造 | イージング | 語ごとの overlap |
| spring | I 時間構造 | なし | in/out の ease を spring に差し替え |
| followThrough | C 剛体 | イージング | 停止時の行き過ぎ |
| stopMotion | I 時間構造 | なし | fps 量子化 |
| timeWarp | I 時間構造 | イージング | 全体の局所時間 |
| loop | I 時間構造 | ループ | hold の周期リピート |

### layout（12）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| row | H 配置 | イージング |  |
| vertical | H 配置 | イージング |  |
| circle | H 配置 | イージング |  |
| arc | H 配置 | イージング |  |
| spiral | H 配置 | イージング |  |
| wave | H 配置 | イージング |  |
| diagonal | H 配置 | イージング |  |
| staircase | H 配置 | イージング |  |
| grid | H 配置 | イージング |  |
| stackedWords | H 配置 | イージング |  |
| scatter | H 配置 | イージング |  |
| path | H 配置 | イージング |  |

### enter（36）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| fade | F 可視範囲 | イージング |  |
| typewriter | F 可視範囲 | イージング | visibleFrac（文字単位） |
| slide | C 剛体 | イージング |  |
| dropBounce | C 剛体 | イージング | Bounce |
| zoomIn | C 剛体 | イージング |  |
| blurIn | E 質感 | イージング | letter blur |
| flip3D | C 剛体 | イージング | tiltX/Y |
| rotateIn | C 剛体 | イージング |  |
| scatterIn | C 剛体 | 乱数 | 位置のばらつき |
| waveRise | C 剛体 | イージング |  |
| elasticPop | C 剛体 | イージング | easeOutElastic |
| scramble | A 字形ソース | 乱数 | 文字の差し替え |
| glitchIn | E 質感 | 乱数 | post へ渡す |
| neonFlicker | F 可視範囲 | 乱数 |  |
| flickerIn | F 可視範囲 | 乱数 |  |
| strokeDrawOn | D 表現 | イージング | stroke リボン → fill |
| particlesAssemble | D 表現 | 乱数 | particles |
| shatterRebuild | D 表現 | 乱数 | pieces |
| morphFromPrevious | D 表現 | イージング | 前ビートのメッシュからモーフ |
| noiseDissolveIn | F 可視範囲 | 乱数 |  |
| megaZoomIn[font] | C block / 画面 | イージング | zoomBlock |
| animator[pro] | C 剛体 + E + F | イージング | param の一般化 |
| rangeReveal[pro] | F + L 適用範囲 | イージング | selector の空間選択 |
| tracking[pro] | C 剛体 + L | イージング | 行単位の追従 |
| gravityDrop[pro] | C 剛体 + C 物理 | 物理 | P4 追加・rest 位置へ落下 + 着地スクワッシュ |
| riseIn*animator[pro] | G 進行 p | イージング | preset → animator |
| fallIn*animator[pro] | G 進行 p | イージング | preset → animator |
| popIn*animator[pro] | G 進行 p | イージング | preset → animator |
| spinIn*animator[pro] | G 進行 p | イージング | preset → animator |
| focusIn*animator[pro] | G 進行 p | イージング | preset → animator |
| driftIn*animator[pro] | G 進行 p | イージング | preset → animator |
| tiltIn*animator[pro] | G 進行 p | イージング | preset → animator |
| revealSweep*rangeReveal[pro] | G 進行 p | イージング | preset → rangeReveal |
| revealSoft*rangeReveal[pro] | G 進行 p | イージング | preset → rangeReveal |
| revealRandom*rangeReveal[pro] | G 進行 p | イージング | preset → rangeReveal |
| trackIn*tracking[pro] | G 進行 p | イージング | preset → tracking |

### exit（26）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| fade | G 進行 p | イージング |  |
| slide | G 進行 p | イージング |  |
| zoomOut | G 進行 p | イージング |  |
| blurOut | G 進行 p | イージング |  |
| explode | C 剛体 | 乱数 |  |
| gravityFall | C 剛体（+ C 物理） | 物理（ground 時）/ イージング | floor が none なら従来の k² 式のまま |
| dissolve | F 可視範囲 | 乱数 |  |
| wipe | F 可視範囲 | イージング |  |
| typewriterReverse | G 進行 p | イージング |  |
| shrinkToCenter | G 進行 p | イージング |  |
| particlesDisperse | D 表現 | 乱数 | particles |
| melt | C-letter | イージング |  |
| burnAway | E 質感 + F | 乱数 |  |
| strokeErase | D 表現 + F | イージング |  |
| creepOut | C 剛体 | イージング | fixedDuration 0.12 |
| megaZoomOut[font] | C block / 画面 | イージング | zoomBlock |
| animator[pro] | G 進行 p | イージング |  |
| rangeReveal[pro] | G 進行 p | イージング |  |
| tracking[pro] | G 進行 p | イージング |  |
| fallLinear*gravityFall[pro] | C 剛体 | イージング | preset → gravityFall |
| riseOut*animator[pro] | G 進行 p | イージング | preset → animator |
| fallOut*animator[pro] | G 進行 p | イージング | preset → animator |
| zoomOutSoft*animator[pro] | G 進行 p | イージング | preset → animator |
| spinOut*animator[pro] | G 進行 p | イージング | preset → animator |
| focusOut*animator[pro] | G 進行 p | イージング | preset → animator |
| trackOut*tracking[pro] | G 進行 p | イージング | preset → tracking |

### hold（62）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| none | G 保持 | ループ |  |
| floatBob | C 剛体 | ループ |  |
| sineWave | C 剛体 | ループ | 文字 x で位相 |
| jitter | C 剛体 | 乱数 | ステップ量子化 |
| pulse | C 剛体 | ビート / ループ | bpm または audio |
| opacityPulse | F 可視範囲 | ループ |  |
| kenBurns | C 剛体 | 進行 | hold 時間に比例 |
| drift | H 配置 | なし | hold 時間に比例 |
| sway | C 剛体 | ループ |  |
| marquee | H 配置 | ループ |  |
| jelly | C-letter | ループ | deform code 1 |
| wobbleWarp | C-letter | ループ | deform code 2 |
| twist | C-letter | ループ | deform code 3 |
| breathing | C-letter | ループ | deform code 4 |
| orbit3D | C 剛体 | ループ | tilt |
| pathFollow | H 配置 | ループ |  |
| heartbeat | C 剛体 | ビート | 2 連打 |
| shiver | C 剛体 | 乱数 |  |
| fontSize[font] | C block | ループ / ビート | zoomBlock |
| fillScreen[font] | C block | ループ / ビート | zoomBlock |
| squashStretch[font] | C-letter | ループ | deform code 15 |
| swirl[font] | C-letter | ループ | deform code 17 |
| warp[pro] | C block | ループ / ビート | deform code 20–30 |
| letterWarp[pro] | C-letter | ループ / ビート | deform code 5–16 |
| animator[pro] | C 剛体 + E + F | ループ | param の一般化 |
| rangeSelector[pro] | L 適用範囲 + K 多重 | ループ / ビート | 空間選択スイープ |
| tracking[pro] | C 剛体 + L | ループ / ビート |  |
| softBody[pro] | C 物理（内在力） | 物理 | P4 追加・5×5 格子の内在力 |
| gravityHang[pro] | C 物理（内在力） | 物理 | P4 追加・上端固定で吊る |
| breathe*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → pressure |
| crawl*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → muscle |
| heartThrob*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → pulse |
| quiver*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → tremor |
| jellyFollow*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → shapeTarget |
| beatBounce*softBody[pro] | C 物理（内在力） | 物理 | softBody preset → 慣性 + kick |
| warpArc*warp[pro] | G 保持 | ループ | preset → warp |
| warpArch*warp[pro] | G 保持 | ループ | preset → warp |
| warpBulge*warp[pro] | G 保持 | ループ | preset → warp |
| warpFlag*warp[pro] | G 保持 | ループ | preset → warp |
| warpWave*warp[pro] | G 保持 | ループ | preset → warp |
| warpFish*warp[pro] | G 保持 | ループ | preset → warp |
| warpFisheye*warp[pro] | G 保持 | ループ | preset → warp |
| warpInflate*warp[pro] | G 保持 | ループ | preset → warp |
| warpRise*warp[pro] | G 保持 | ループ | preset → warp |
| warpSqueeze*warp[pro] | G 保持 | ループ | preset → warp |
| warpTwist*warp[pro] | G 保持 | ループ | preset → warp |
| letterBend*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| letterBulge*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| letterRipple*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| letterFlag*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| letterZigzag*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| letterTaper*letterWarp[pro] | G 保持 | ループ | preset → letterWarp |
| boil*animator[pro] | G 保持 | ループ | preset → animator |
| floatLoop*animator[pro] | G 保持 | ループ | preset → animator |
| breatheLoop*animator[pro] | G 保持 | ループ | preset → animator |
| swayLoop*animator[pro] | G 保持 | ループ | preset → animator |
| beatPulse*animator[pro] | G 保持 | ループ | preset → animator |
| highlightSweep*rangeSelector[pro] | G 保持 | ループ | preset → rangeSelector |
| waveLoop*rangeSelector[pro] | G 保持 | ループ | preset → rangeSelector |
| beatHighlight*rangeSelector[pro] | G 保持 | ループ | preset → rangeSelector |
| trackBreath*tracking[pro] | G 保持 | ループ | preset → tracking |
| trackBeat*tracking[pro] | G 保持 | ループ | preset → tracking |

### location（11）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| center | H 配置 | なし |  |
| lowerThird | H 配置 | なし |  |
| upperThird | H 配置 | なし |  |
| left | H 配置 | なし |  |
| right | H 配置 | なし |  |
| karaoke | H 配置 | なし |  |
| stacked | H 配置 | なし |  |
| randomSafe | H 配置 | なし |  |
| badgeAnchored | H 配置 | なし |  |
| custom | H 配置 | なし |  |
| grid[pro] | H 配置 | なし |  |

### fill（14）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| solid | E 質感 | 時間 t / 進行 |  |
| categoryColor | E 質感 | 時間 t / 進行 |  |
| gradientSweep | E 質感 | 時間 t / 進行 |  |
| rainbowFlow | E 質感 | 時間 t / 進行 |  |
| holographic | E 質感 | 時間 t / 進行 |  |
| chrome | E 質感 | 時間 t / 進行 |  |
| goldFoil | E 質感 | 時間 t / 進行 |  |
| fire | E 質感 | 時間 t / 進行 |  |
| caustics | E 質感 | 時間 t / 進行 |  |
| marble | E 質感 | 時間 t / 進行 |  |
| glass | E 質感 | 時間 t / 進行 |  |
| textureFill | E 質感 | 時間 t / 進行 |  |
| karaokeWipe | E 質感 | 時間 t / 進行 |  |
| ink | E 質感 | 時間 t / 進行 |  |

### edge（9）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| outline | E 質感 | 時間 t / 進行 | P6 で内側半径（u_params2.w）が使えるようになった |
| neonGlow | E 質感 | 時間 t / 進行 |  |
| innerGlow | E 質感 | 時間 t / 進行 |  |
| bevel | E 質感 | 時間 t / 進行 |  |
| extrude | E 質感 | 時間 t / 進行 |  |
| longShadow | E 質感 | 時間 t / 進行 |  |
| dropShadow | E 質感 | 時間 t / 進行 |  |
| drip | E 質感 | 時間 t / 進行 |  |
| multiLine[pro] | E 質感 + K 多重 | 時間 t | P6 追加・count 本のリングへ展開 |

### post（54）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| glitchBlocks | E 質感（画面） | 時間 t |  |
| rgbShift | E 質感（画面） | 時間 t |  |
| scanTear | E 質感（画面） | 時間 t |  |
| vhsTracking | E 質感（画面） | 時間 t |  |
| dataSmear | E 質感（画面） | 時間 t |  |
| digitalNoise | E 質感（画面） | 時間 t |  |
| glitchSlice | E 質感（画面） | 時間 t |  |
| noiseDissolve | E 質感（画面） | 時間 t |  |
| directionalDissolve | E 質感（画面） | 時間 t |  |
| pixelDissolve | E 質感（画面） | 時間 t |  |
| burnDissolve | E 質感（画面） | 時間 t |  |
| halftoneDissolve | E 質感（画面） | 時間 t |  |
| particleDissolve | E 質感（画面） | 時間 t |  |
| shockwave | E 質感（画面） | 時間 t |  |
| zoomBlur | E 質感（画面） | 時間 t |  |
| motionBlur | J 複製（時間） | 時間 t |  |
| echoTrail | J 複製（時間） | 時間 t |  |
| godRays | E 質感（画面） | 時間 t |  |
| lightSweep | E 質感（画面） | 時間 t |  |
| kaleidoscope | J 複製（空間） | なし | 画面の鏡映 |
| mirror | J 複製（空間） | なし |  |
| pixelSort | E 質感（画面） | 時間 t |  |
| lensDistortion | C 画面空間 | 時間 t |  |
| colorGrade | E 質感（画面） | 時間 t |  |
| displacementMap | C 画面空間 | 時間 t |  |
| bloom | E 質感（画面） | 時間 t |  |
| chromaticAberration | E 質感（画面） | 時間 t |  |
| crt | E 質感（画面） | 時間 t |  |
| filmGrain | E 質感（画面） | 時間 t |  |
| halftone | D 表現（pixels の近似） | なし |  |
| pixelate | D 表現（pixels の近似） | なし | 合成後のみ・ロードマップで本実装 |
| heatHaze | E 質感（画面） | 時間 t |  |
| lightLeak | E 質感（画面） | 時間 t |  |
| vignette | E 質感（画面） | 時間 t |  |
| sparkles | E 質感（画面） | 時間 t |  |
| lensFlare | E 質感（画面） | 時間 t |  |
| waveWarp[pro] | C 画面空間 | 時間 t |  |
| twirl[pro] | C 画面空間 | 時間 t |  |
| turbulentDisplace[pro] | C 画面空間 | 乱数 |  |
| spinBlur[pro] | C 画面空間 | 時間 t |  |
| strobeFlash[pro] | E 質感（画面） | 時間 t |  |
| anamorphicStreak[pro] | E 質感（画面） | 時間 t |  |
| radialWipe[pro] | E 質感（画面） | 時間 t |  |
| venetianBlinds[pro] | E 質感（画面） | 時間 t |  |
| camera[pro] | C 画面空間 | ループ / ビート | transform の集約 |
| shapeLayer[pro] | E 質感（背景） | なし | shape-ops の図形 |
| cameraPushIn*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraPullOut*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraPanLeft*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraPanRight*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraTilt*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraHandheld*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraOrbit*camera[pro] | E 質感（画面） | 時間 t | preset → camera |
| cameraPunch*camera[pro] | E 質感（画面） | 時間 t | preset → camera |

### background（17）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| none | E 質感（背景） | 時間 t |  |
| solid | E 質感（背景） | 時間 t |  |
| gradient | E 質感（背景） | 時間 t |  |
| noiseGradient | E 質感（背景） | 時間 t |  |
| card | E 質感（背景） | 時間 t |  |
| cover | E 質感（背景） | 時間 t |  |
| image | E 質感（背景） | 時間 t |  |
| pattern | E 質感（背景） | 時間 t |  |
| shapes | E 質感（背景） | 時間 t |  |
| fractalNoise[pro] | E 質感（背景） | 時間 t |  |
| rays[pro] | E 質感（背景） | 時間 t |  |
| gradient4[pro] | E 質感（背景） | 時間 t |  |
| cellPattern[pro] | E 質感（背景） | 時間 t |  |
| particleField[pro] | E 質感（背景） | 時間 t |  |
| perspectiveGrid[pro] | E 質感（背景） | 時間 t |  |
| tunnel[pro] | E 質感（背景） | 時間 t |  |
| shapeLayer[pro] | E 質感（背景） | 時間 t |  |

### bgShape（16）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| none | E 質感（背景） | 時間 t |  |
| square | E 質感（背景） | 時間 t |  |
| rounded | E 質感（背景） | 時間 t |  |
| circle | E 質感（背景） | 時間 t |  |
| diamond | E 質感（背景） | 時間 t |  |
| ring | E 質感（背景） | 時間 t |  |
| bar | E 質感（背景） | 時間 t |  |
| star | E 質感（背景） | 時間 t |  |
| blob | E 質感（背景） | 時間 t |  |
| heart | E 質感（背景） | 時間 t |  |
| splatter | E 質感（背景） | 時間 t |  |
| scratch | E 質感（背景） | 時間 t |  |
| drop | E 質感（背景） | 時間 t |  |
| bracket | E 質感（背景） | 時間 t |  |
| paper | E 質感（背景） | 時間 t |  |
| cloud | E 質感（背景） | 時間 t |  |

### bgFill（14）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| solid | E 質感（背景） | 時間 t |  |
| categoryColor | E 質感（背景） | 時間 t |  |
| gradientSweep | E 質感（背景） | 時間 t |  |
| rainbowFlow | E 質感（背景） | 時間 t |  |
| holographic | E 質感（背景） | 時間 t |  |
| chrome | E 質感（背景） | 時間 t |  |
| goldFoil | E 質感（背景） | 時間 t |  |
| fire | E 質感（背景） | 時間 t |  |
| caustics | E 質感（背景） | 時間 t |  |
| marble | E 質感（背景） | 時間 t |  |
| glass | E 質感（背景） | 時間 t |  |
| textureFill | E 質感（背景） | 時間 t |  |
| karaokeWipe | E 質感（背景） | 時間 t |  |
| ink | E 質感（背景） | 時間 t |  |

### bgEdge（9）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| outline | E 質感（背景） | 時間 t |  |
| neonGlow | E 質感（背景） | 時間 t |  |
| innerGlow | E 質感（背景） | 時間 t |  |
| bevel | E 質感（背景） | 時間 t |  |
| extrude | E 質感（背景） | 時間 t |  |
| longShadow | E 質感（背景） | 時間 t |  |
| dropShadow | E 質感（背景） | 時間 t |  |
| drip | E 質感（背景） | 時間 t |  |
| multiLine[pro] | E 質感（背景） | 時間 t |  |

### bgMotion（13）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| follow | E 質感（背景） | 時間 t |  |
| fade | E 質感（背景） | 時間 t |  |
| pop | E 質感（背景） | 時間 t |  |
| stamp | E 質感（背景） | 時間 t |  |
| wipe | E 質感（背景） | 時間 t |  |
| spin | E 質感（背景） | 時間 t |  |
| grow | E 質感（背景） | 時間 t |  |
| none | E 質感（背景） | 時間 t |  |
| flicker | E 質感（背景） | 時間 t |  |
| bleed | E 質感（背景） | 時間 t |  |
| float | E 質感（背景） | 時間 t |  |
| fall | E 質感（背景） | 時間 t |  |
| draw[pro] | E 質感（背景） | 時間 t |  |

### repeat（10）

| type | 主軸 | 駆動 | 備考 |
|---|---|---|---|
| stackV | J 複製（空間） | なし |  |
| rowH | J 複製（空間） | なし |  |
| diagonal | J 複製（空間） | なし |  |
| grid | J 複製（空間） | なし |  |
| radial | J 複製（空間） | なし |  |
| fan | J 複製（空間） | なし |  |
| tunnel | J 複製（空間） | 進行 | 奥行きスケール |
| scatter | J 複製（空間） | なし |  |
| brick | J 複製（空間） | なし |  |
| fill | J 複製（空間） | なし | 敷き詰め |

> 注: `bgFill` / `bgEdge` は `fill` / `edge` の alias で、同じ descriptor を背景用の group 名で読む（`registry.js:43`）。`color` グループは type を持たず、fill の色参照だけを持つ。

---

## 3. 既存の部分演出 4 系統

部分文字列を装飾する仕組みは 4 つあり、それぞれ別の場所で別のことをする。

| 系統 | スキーマ | できること | できないこと |
|---|---|---|---|
| **span**（composition） | `style.text.compose.spans[] = { from, to, scale, fontSet, paletteIndex }` | 範囲のサイズ・フォント・パレット色 | 任意の色、fill / edge の種類、enter / hold / exit の種類、動きの transform |
| **override** | `project.overrides[path] = { transform: {x,y,rotate,scale,opacity,tiltX,tiltY} }` | 範囲の transform（位置・回転・拡大・opacity・tilt） | 効果の種類、質感、時間構造 |
| **keyframe** | `project.keyframes[path][prop]`（`transform.*`, `color.fill`, `(animation\|layout\|enter\|exit\|hold\|location).params.*`） | 範囲の transform と既存エフェクトの**パラメータ上書き**、`color.fill` → `colorMix` | 効果の**種類**（type そのもの）の差し替え、質感（fill/edge）の差し替え |
| **keyword** | `style.text.weird` の強さ × `keywords.mark(letters, words)` | キーワードの強調（拡大・colorMix・揺れ）— 演出ではなく階層づけ | ユーザー指定の範囲、任意の type |

- どの系統も「type を替える」ことができない。rangeSelector は 1 つの hold の内部で空間選択するだけで、enter と exit の種類はビート全体で 1 つ。
- fill / edge はビート（style）単位。1 文字だけ金箔、1 単語だけ二重縁取り、は表現できない。
- span は `paletteIndex` でパレット参照のみ。`span.color`（直接色）はスキーマに無い（P5 で追加）。

---

## 4. 既知の問題

1. **順番の落下が k² より速くならない…の逆**
   `exit.gravityFall` は `y += g·k²`（`exit.js:93`）。`animation.stagger` は `each` ごとに `k` の開始を遅らせるだけなので、実時間の進みに対して位置は `k²` のまま。`timeWarp` や spring と重ねると実効的に `k⁶` 級の鈍さになり、「順番に落ちる」が「順番に加速して消える」に見える。物理で実時間積分にすればこの問題は消える（P2 の `exit.gravityFall floor:'ground'`）。

2. **fill の文字 ID のデコードが誤っている**
   `TEXT_FRAG` / `BG_FRAG` は `id` を `x = floor(id/255)`, `y = fract(id/255)` で書き（`shaders.js:380`, `shaders.js:1525` 付近）、`FILL_FRAG` は `round(x*255)*255 + round(y*255)` で読む。`fract` は float 精度で 255 分の 1 を保持できず、大きい ID（255 以上）で復元がずれる。P5 でエンコードを `x = floor(id/255)/255`, `y = mod(id,255)/255` に変えて修正する（別コミット）。

3. **Studio の型選択に `UI_PACKS` に出てこない効果がある**
   `pack:'pro'` / `pack:'font'` の付いた primitive と preset は `UI_PACKS` に含めないと Inspector の選択肢に出ない（`renderer/js/studio/inspector.js:8` 付近）。今後追加する型（`hold.softBody` など）は必ず pack を付ける。

4. **物理の駆動源が無い**
   この文書の主題。既存の 29 deform code はすべて `deformOne(p, d)` の純関数で、内部状態を持たない。衝突・慣性・内在力はゼロ。

---

## 5. ロードマップ

| 順 | 内容 | 対応 |
|---|---|---|
| P0 | 本書（分解軸・対応表・既知の問題・設計） | 完了 |
| P1 | 物理コア `renderer/js/lyrics/physics.js`（純関数、UMD、格子 + ばね + 内在力 + 床 + 決定論） | 本書 §6.1 |
| P2 | motion 統合（`rigidAt` の切り出し、物理エントリ、`softLattice`、frame-guard / legibility） | §6.2 |
| P3 | GPU（state texture 23 行化、`latticeDisp`、TEXT_VERT / REP_VERT / BLUR_FIELD_VERT） | §6.3 |
| P4 | エフェクト・プリセット・UI（`hold.softBody` / `hold.gravityHang` / `enter.gravityDrop` / `exit.gravityFall` 拡張） | §6.4 |
| P5 | 部分演出 `scope`（`style.scoped`、scope mask、fill/edge の部分描画、ID 修正、Inspector） | §6.5 |
| P6 | `edge.multiLine`（多層縁取り、RGB ずれ、内側半径） | §6.6 |
| 次 | ラスタライズ表現（`REP_CODES` に `pixels`） | — |
| 次 | 輪郭操作（B 軸: 幾何オフセット / 平滑化） | — |
| 次 | 文字同士の衝突（格子間の接触、積み上げ） | — |

リリースは P0〜P4 を 1 セット、その後 P5、P6 と続ける（コミットは分ける）。

> 実装状況: P0〜P6 は実装済み。コミットは「Add the text decoration axes and the soft body physics」（P0〜P4）、「Fix the per-letter id decode in the fill pass」、「Add scoped partial decorations」（P5）、「Add the multi-line edge」（P6）の 4 本。

---

## 6. 設計

### 6.1 P1 物理コア `renderer/js/lyrics/physics.js`

描画にも registry にも依存しない純関数モジュール（UMD、Node でテスト可能）。`warp.js` と同じ流儀で、GLSL 側には一切依存しない。

#### 状態（1 文字分）

```js
{
  t: 0,                             // シミュレーション時刻（秒、ビート開始からの固定 dt の積み上げ）
  steps: 0,                         // 整数ステップ数（t = steps * DT）
  com: { x, y, vx, vy, rot, vrot }, // 剛体の変位（px, deg）と速度
  nodes: Float32Array(N*N*2),       // 現在位置（正規化、half-size = 1）
  prev: Float32Array(N*N*2),        // 1 ステップ前の位置
  rest: Float32Array(N*N*2),        // 目標形状（初期は -1..1 の等間隔格子）
}
```

- 初期格子 `N=5`。`rest[k] = (u, v)`、`u, v ∈ {-1, -0.5, 0, 0.5, 1}`。
- 単位は half-size（`letter.local.w/2`, `h/2`）。px との換算は `drive.unit = {x, y}` で行う。

#### `step(sim, cfg, drive, dt)`

1. **外力の集計**（各ノードの加速度 `a(u,v)`、正規化単位）
   - 重力: `a.y += cfg.gravity`（画面下向きが正）。
   - 慣性: `a -= cfg.inertia · (drive.accel.x / unit.x, drive.accel.y / unit.y)`。
   - 回転慣性: `a += cfg.inertia · ar · (-v·unit.y, u·unit.x) / (unit.x, unit.y)`（`ar` は rad/s²）。
   - ビートキック: `drive.kick > 0` のとき、外向き（中心から放射）のインパルス。
2. **Verlet 積分**（`x' = x + (x - prev)·(1 - damping) + a·dt²`）。
3. **PBD 拘束 4 反復**（`stiffness` を `k = 1-(1-stiffness)^(1/4)` に分配）
   - 構造ばね: 上下左右の隣接（`L0 = 2/(N-1)` に正規化）。
   - せん断ばね: 斜めの隣接（`L0·√2`）。
   - 曲げばね: 1 つ飛ばし（`2·L0`、剛性は構造の 1/4）。
   - 面積保存: 外周 16 点の多角形（`shoelace`）の面積 `A` を、目標 `A0·(1 + s·sin(2πft))`（`pressure`）または `A0`（他）へ向け、重心まわりに `sqrt(A_target/A)` を `k_area` で部分適用する（外周点を法線方向へ動かすのと等価）。
4. **内在力**（各 `drive`、時間 `t` の決定論的な関数）
   - `pressure`: 面積目標を `A0·(1 + s·sin 2πft)` にする（呼吸・膨張・脈動）。
   - `muscle`: ばねの自然長を `L0·(1 + s·sin 2π(ft − k·c))` で進行波にする。`c` は `dir: 'u' | 'v' | 'radial'` に応じて `u` / `v` / `hypot(u,v)`。
   - `pulse`: 周期 `1/f` で心拍の 2 連打（強・弱）の放射インパルス。`imp(t)` は gaussian バンプ 2 つの和。
   - `tremor`: ノードと時刻の value noise（`seed` 固定）による力。`noise(seed, k, t·f)`。
   - `shapeTarget`: CPU 版 `bend / bulge / squash / stretch / twist` の目標位置へ、`stiffness` に比例する位置ブレンドで引き戻す。時間変化は `warp.animateWarp` を使う（`sync` と `freq`）。
5. **床**
   - ノード: `floorY`（正規化、文字中心基準）より下の点を床の上に戻し、Verlet の前位置を反射させる。
   - com: `floorCom`（px、文字中心基準）より下に出たら `vy = −restitution·vy`、`vx *= 1 − friction`、`vrot` を `vx` から転がりとして導く。
6. **安全策**: 各ノードの変位（rest からの差）をベクトル長 `0.8` でクランプ。`NaN` を検出したら `rest` と `com=0` に戻す。

`drive` 引数は motion 側から渡す:

```js
{
  accel: { x, y, rot },        // 剛体の加速度（px/s², deg/s²）
  gravity: cfg.gravity,        // half-size/s²
  floor: { nodeY, comY } | null,
  kick: 0..1,
  unit: { x, y },              // px per normalized unit
}
```

#### 内在力の見え方

| 名前 | 仕組み | 見え方 |
|---|---|---|
| `pressure` | 内圧が振動し、目標面積を周期的に変える | 呼吸・膨張・脈動 |
| `muscle` | ばねの自然長を進行波で縮める・伸ばす | 蠕動、這う、うねる |
| `pulse` | 中心からの放射インパルスを周期的に与える | 心拍、ドクン |
| `tremor` | 各点に内部ノイズの力を加える（seed 固定） | 震え、ぷるぷる |
| `shapeTarget` | 既存 warp の目標形状へばねで引き戻す | 既存の変形が柔らかく追従する |

#### 決定論とスクラブ

- 積分は `DT = 1/120` 固定。`sim.t = sim.steps · DT` と定義し、浮動小数の積み上げ誤差を排除する。
- `simulateTo(cache, key, t, cfg, { driveAt, maxT, dt })`:
  - キャッシュは `scene.__phys`（Map、`scene.__kw` と同じ流儀）。
  - キーは `beatId|letterIdx|paramsHash|frameW×H|seed`。
  - 前進: 続きから `t` まで step。
  - 後退: 直近のチェックポイント（30 ステップ = 0.25 s ごと）へ戻して計算し直す。
  - `maxT`（ビート長 + exit 分）で打ち切る。
- `onsetTimes(analysis)`: `frames[].rms` の差分（flux）のピークを拾う。WeakMap にキャッシュ。analysis が無ければ `audioFeatures.bpm`（無ければ 120）の格子で代用。`SA.audioDriver.frameAt` を併用する。

#### 出力

- `com` のオフセット（px、`{dx, dy, rot}`）
- `lattice`: `Float32Array(N*N*2)`（rest からの変位、正規化）
- `active`: 変位の最大値が `1e-4` を超えているか

### 6.2 P2 motion への統合

- **剛体評価の関数化**: 手順 2〜5（formation → enter → hold → exit）を `rigidAt(index, local)` に切り出す（`motion.js:581-688`）。挙動は変えない。物理を使う文字だけ、各ステップでこれを呼んで加速度を差分で求める。物理を使わない文字は従来の経路のままで、性能は変わらない。
- **物理エントリの収集**: registry の descriptor に `physics(params, phase) => cfg | null` を持たせる。これを持つ entry では `cpu` を呼ばない（no-op）。
  - hold 配列から `physics` を持つものを集め、最初の 1 つを採る。`drive` は合成しない。
  - `enter.gravityDrop`: enter 開始（`beat.start + enterStart`）から com を上方 `height` から落とす。床は rest 位置。
  - `exit.gravityFall`（`params.floor === 'ground'`）: `timing.exitStart` で解放し、イージングを通さず実時間で積分する。床は block の下端 + `floor`·em。opacity は `px` で下げる。
- **適用位置**: 手順 5（exit）の直後、custom motions（`motion.js:692`）の前。
  - `state.x += com.dx`, `state.y += com.dy`, `state.rot += com.rot`
  - `state.softLattice = lattice`, `state.physActive = true`
- **half-size**: `letter.local.w/2`, `h/2`（メッシュは作らない）。
- **frame-guard**（`frame-guard.js:31`）と **legibility**（`legibility.js:207`）は `softLattice` の最大変位を deform と同じように扱う。
- `legibility.js:300` は scene を shallow copy してキャッシュを共有するが、キャッシュキーに params を含むので問題ない。

### 6.3 P3 GPU（格子 FFD）

- `gl/passes.js`
  - `STATE_ROWS` を 9 → 23 にする。
    - 行 9〜21: 格子 25 点。1 texel に 2 点（xy が偶数番、zw が奇数番）。
    - 行 22: `x = latticeOn`、`y = decorMask`（P5 で使う）、zw は予約。
  - `packStateRows` を拡張。`softLattice` が無い文字は行 9〜22 にゼロを書く（バッファ再利用のため）。
  - `createTextPass`（`passes.js:1073`）も `STATE_ROWS` を参照しているので揃える。
- `gl/shaders.js` COMMON: `vec2 latticeDisp(sampler2D s, int letter, vec2 q)` を追加。
  - `q` は -1..1。**Catmull-Rom**（4×4、C1、節点で補間）で 16 点を読む。行 22 の `x < 0.5` なら 0。
- `TEXT_VERT`（`shaders.js:320`）: `p = (a_pos + latticeDisp(u_state, id, a_pos/max(a_bbox,1)) * a_bbox) * vec2(s0.w, s1.x);`
- `REP_VERT`（`shaders.js:2002`）: `applyTransform` の先頭に同じ加算。
- `BLUR_FIELD_VERT`（`shaders.js:389`）: `latticeOn` のとき quad を 1.8 倍に広げる。
- テスト: `scripts/test/ae-primitives.test.js:125` の `STATE_ROWS === 9` を 23 に更新。
- Canvas2D フォールバックは変更しない（格子は無視される）。

### 6.4 P4 エフェクト・プリセット・UI

`renderer/js/lyrics/effects/softbody.js`（新規、UMD）。すべて `pack:'pro'`（`UI_PACKS` 対策）。

- `hold.softBody`
  - params: `drive`（select: pressure / muscle / pulse / tremor / shapeTarget）、`strength`、`freq`、`sync`（free / beat）、`stiffness`、`damping`、`inertia`、`gravity`、`floor`、`beatKick`、`target`（select: bend / bulge / squash / stretch / twist）
  - `grid` は 5 固定（UI には出さない）。
  - `cpu` は no-op、`physics(params, 'hold')` が cfg を返す。
- `hold.gravityHang`: 上端の行を固定し、重力と慣性を受ける（`pinTop`）。
- `enter.gravityDrop`: `height`、`gravity`、`restitution`、`squash`。
- `exit.gravityFall` 拡張（`exit.js:86`）
  - 追加 params: `floor`（none / ground）、`restitution`、`friction`。
  - `physics` は `floor === 'ground'` のときだけ有効。`none` のときは従来の式のままで互換を保つ。
- **プリセット**（`registerPreset`）
  - softBody の派生: `breathe`（pressure）、`crawl`（muscle）、`heartThrob`（pulse）、`quiver`（tremor）、`jellyFollow`（shapeTarget）、`beatBounce`（慣性 + kick）
  - `gravityFall` の派生: `fallLinear`（`floor:'none'` + `motion.out.ease:'linear'`）
  - `fallInOrder`: preset の `motion.stagger` は効かない（stagger は animation group だけが持つ）。`animation.stagger`（ltr、each 0.1）+ `exit.gravityFall`（ground）の**複合ルック**として `looks.js` に登録する。
- **読み込み**
  - `renderer/studio.html`: `hold.js` / `exit.js` の後、`staged-presets.js` の前（`boot.test.js:52-71` の順序制約）。`physics.js` は `warp.js` の後。
  - Node 側の require 一覧: `fx-axes.test.js:17`、`fx-i18n.test.js:9`、`smartness.test.js:15`、`legibility.test.js:16`、`ae-primitives.test.js:14`、`axes.test.js:15`、`staged-looks.test.js:15`、`scripts/fx-axes-build.js:32`、`scripts/fx400mix.js:27`、`scripts/effects-csv.js:22`。`physics.js` も同様。
- **i18n**: `renderer/js/studio/fx-strings.js` の en / ja / es / fr / ru すべてに type・param・選択肢を追加（`fx-i18n.test.js` がキー集合の一致を要求）。
- **軸テーブル**: `node scripts/fx-axes-build.js` で `renderer/data/fx-axes.json` と `fx-axes-table.js` を再生成。
- **random**: params に `random:[lo,hi]` を付ける。強い値は legibility で落ちる範囲に収める。

### 6.5 P5 部分演出（scope）

- **scope のスキーマ**

```js
{ kind: 'range' | 'word' | 'keyword' | 'span', from, to, words: [idx], match: '文字列', spanIndex }
```

`range` はコードポイントのオフセット、`keyword` は行内の部分一致。
- 新規 `renderer/js/lyrics/scope.js`: `scopeMask(scene, scope) → Uint8Array(letters)`。結果は `scene.__scope` にキャッシュ。
  - `range` 用に `font.js` の `buildItems`（`font.js:565`）へ `letter.textOffset`（コードポイント）を追加。
- スタイルへの保存: `style.scoped = [{ group, type, params, motion, enabled, scope }]`。既存の単一 / 配列グループには手を入れない。`mergeDeep` は配列を丸ごと置き換えるので cue / beat の上書きも自然に効く。
- registry: `withDefaults` / `expandPreset`（`registry.js:151,183`）で `scope` を素通しする。
- motion.js での意味
  - enter / exit: scope 内の文字では scoped のインスタンスがベースを**置き換える**（`enterDef` / `exitDef` / timing を文字ごとに解決）。
  - hold: scope 内の文字に**追加**する。
  - `physics` を持つ entry も同じ規則。
- fill / edge（`engine.js:1706-1736`）
  - scope ごとに部分集合のマスクを描き直す。範囲外の文字の opacity を 0 にして `text()` → `sdf()`。
  - scoped の edge を**追加**し、scoped の fill を**上書き描画**する。
  - 最後に全文字のマスクと state を元に戻す（`drawRepeatCopies` の復元手順、`engine.js:575` を流用）。
  - 同じ scope の効果はまとめて描き、パス数を抑える。
- **ID バグの修正（別コミット）**: encode（`TEXT_FRAG:380`, `BG_FRAG:1525`）を `x = floor(id/255)/255`, `y = mod(id,255)/255`、decode（`FILL_FRAG:606`）を `round(x*255)*255 + round(y*255)`。
- **span の任意色**: `span.color` があれば `scene.js:243` でパレットより優先する。
- **UI**: Inspector に「部分演出」セクション（一覧 + 追加、group / type、scope エディタ）。`renderStackGroup`（`inspector.js:994-1045`）の流儀。i18n は 5 言語。

### 6.6 P6 多重化 `edge.multiLine`

- params: `count`（2〜4）、`width`、`gap`、`widthDecay`、`colorRule`（same / alternate / gradient）、`colorA`、`colorB`、`layerOffset`（vec2、RGB ずれ）、`layerDelay`。
- 描画: engine で N 本の outline の uniform に展開する。
- 帯の内側: `EDGE_FRAG` の outline に内側半径（`u_params2` の空きチャンネル）を追加し、隙間を透明にできる。既存 outline は内側半径 0 で見た目を変えない。
- `layerDelay`: 外側の層ほど、そのエッジの in の進みを遅らせる。

---

## 7. 検証

1. `npm test`、`npm run check`
2. `node scripts/fx-axes-build.js --check`
3. `SA_SMOKE=1 SA_SMOKE_SHADERS=1` でシェーダをコンパイルする（`README.md:167-185`）
4. Studio を起動し、breathe / crawl / heartThrob / quiver / jellyFollow / beatBounce / gravityDrop / fallInOrder を順に当てて目視。スクラブで前後に動かしても見た目が飛ばないこと。
5. 1 語だけ jelly、1 語だけ金箔 + 二重縁取り（P5 / P6）。
6. 書き出し（mp4）を 2 回行い、フレームが一致すること（決定論）。
