# 部分文字列の演出（slice / local / reflow / stretch / Generate）

このファイルはセッションをまたぐ引き継ぎ用です。仕様の本体は `doc/app-design.md`、全体の進捗は `doc/progress.md`。

**状態: 実装完了・自動検証通過（未コミット）**

---

## 1. 何を作ったか

`style.scoped`（部分演出）は実装済みだったが、Generate は `scoped` を一度も書かず、scope も「絶対位置の range」しか表現できなかった。この作業で **汎用的な部分文字列の指定** と **部分文字列を独立した 1 つの文字列として扱う仕組み** と **それを使う自動生成** を入れた。

| 段階 | 内容 | 場所 |
|---|---|---|
| A | 汎用 scope kind `slice`（文頭 / 文末 / 行頭 / 行末から N 文字目・M 文字分） | `renderer/js/lyrics/scope.js` |
| B | scoped エントリの **ローカルモード**（部分文字列を独立したテキストとして info を差し替え、ワープの原点も部分中心にする） | `renderer/js/lyrics/motion.js` |
| C | **リフロー**（横伸びした分だけ同じ行の外側の文字を押し出す） | `renderer/js/lyrics/motion.js` + `effects/registry.js` |
| D | 単体の伸縮エフェクト `stretch`（縦横伸縮・字間が一緒に伸びる） | `renderer/js/lyrics/effects/selector.js` |
| E | Generate からの抽選（scope・効果ファミリー・2 個目のエントリ） | `renderer/js/studio/direct.js`、`lyrics/gen-params.js` |
| F | Inspector（`slice` の行と `local` のトグル） | `renderer/js/studio/inspector.js` |
| G | テスト | `scripts/test/{scope,selector,direct,scene-scale}.test.js` |

### A. scope kind `slice`

```js
{ kind: 'slice', anchor: 'text' | 'line', from: 'start' | 'end', offset: N, length: M, skipSpaces: true }
```

- `anchor:'text'` = 文頭 / 文末、`'line'` = 各行の行頭 / 行末。`from:'end'` は末尾から数える。
- `offset` は 0 始まり、`length` 0 / 未指定 = 端まで。範囲が尽きていたら何も立てない（折り返さない）。
- 数えるのは `nth` と同じ「スキップしない文字」（既存 `isSkippable`）。範囲内のスキップ文字にはフラグを立てない。
- `markSlice` は `lineDataOf(scene)` の行ごとに列挙 → スキップ文字を除く → `from:'end'` なら反転 → 範囲にフラグ。
- `maskForText` は同じ規則。`anchor:'line'` は `String(text).split(/\r\n|\r|\n/)` の**段落**単位で解決する。折り返し行はここでは分からないので `nth` の word / line と同じ扱いとし、コード内にコメント明記。

### B. ローカルモード（`entry.local === true`）

既存のエントリは `local` を持たないので見た目は変わらない（後方互換）。Generate が書くエントリだけが `local: true`。

- **幾何はシーン単位**（フレームごとではない）。走査単位は「同じ行（`letter.lineIdx`）で連続した、マスクが立った文字列」の連なり（run）。`slice anchor:'line'` や `nth` は複数の run になる。`nth`（N 文字おき）は 1 文字ずつの run になり、各文字がそこで伸縮する（全体の nth と同じ見た目）。
- 各 run は `members` / `rank` / `count` / `center`（`targetFormation` の点の平均。`kwCenters` と同じ作り方）/ `half` / `bbox` / `lineIdx` を持つ。
- `localInfo(def, index, info)` が `{ ...info, i: rank, N: count, units, blockCenter: 部分中心, blockBBox, blockHalf }` を返す。enter / exit / hold の cpu に渡す info だけを差し替えるので、`rangeSelector` / `tracking` / `sineWave` / `letterWarp` / `squashStretch` などの既存効果は **変更なしで**「部分文字列だけが 1 つの文字列」として動く。
- ブロック変形（warp / letterWarp / fontSize / squashStretch）は `warpOrigin` と `blockHalf` を部分中心和にする。ベースのブロック変形とローカルの両方が同じ文字に乗る場合は **ローカル側を優先**（コード内にコメント。Generate 側はこの組合せを避ける）。

### C. リフロー

descriptor に任意フック `spread(h, env, params, info) → { x, y }` を追加（値は部分文字列の伸び率。0 = 変化なし、0.5 = 半幅の 1.5 倍）。

- フレームの冒頭、文字ループの前に計算する。`local` の hold def のうち `spread` を持つものだけ。
- タイミングは run の先頭文字の `offsets[first]` と `motionDef(instance,'hold',duration)` で、`rigidAt` と同じ式で `h` と `env` を出す（run 内で共通の値にする）。
- 同じ行で run より行方向の座標が大きい文字は `+run.half.* * g`、小さい文字は `-run.half.* * g`（run は中心から伸びるので左右対称に押す）。run 内の文字は効果自身が中心から広げるので対象外。
- `spread` を実装したのは **`tracking`（hold）と新設の `stretch`** の 2 つ。`tracking` は `amount * trackingWave * env` をその軸へ報告する。

### D. 新エフェクト `stretch`

- group `hold`、type `stretch`、tags `['pro','selector','text']`、pack `pro`、cost 1。
- params: `amount`（-0.6..2, default 0.3）、`stretchAxis`（x / y / both）、`mode`（pulse / breathe / beat / **hold**。`trackingWave` を流用し、hold は常に 1）、`freq`。
- cpu: `s = 1 + amount * wave * env` → 軸ごとに `state.scaleX/Y *= s`。位置も `info.blockCenter` 中心に `(letterX - cx) * (s-1)` 動かす（`applyTracking` と同じ式）。文字の形も字間も一緒に伸び、部分文字列が 1 枚の絵のように伸縮する。
- `spread`: `{ x: axis∋x ? s-1 : 0, y: axis∋y ? s-1 : 0 }`。
- enter / exit 版も同じループで登録（伸びた状態から 1 へ戻る / 1 から伸びる）。
- staged preset 3 種: `stretchBreathX` / `stretchBeatY` / `stretchPopIn`。
- i18n 5 言語に type ラベルと param ラベル `stretchAxis` を追加。

### E. Generate からの抽選

- **パラメータ**（`gen-params.js`、新 group `scoped`、tab `axis`）:

  | key | kind | derive |
  |---|---|---|
  | `scopedChance` | chance | `0.35 * a.t`（weird 0 → 0、バイト一致を保つ） |
  | `scopedSecondChance` | chance | `0.3 * a.t * a.e` |
  | `scopedStretch` | weight | `1` |
  | `scopedTracking` | weight | `0.6 + 0.6 * a.e` |
  | `scopedWave` | weight | `0.4 + 0.8 * a.soft` |
  | `scopedDeco` | weight | `1` |
  | `scopedEnter` | weight | `0.8` |

- **対象の抽選** `pickScope`: ヒーロー語（compose かつ `analysis.hero` が全体でない時、重み 3）、文頭 M / 文末 M（1）、行頭 / 行末 M（`\n` を含むビートのみ、1）、N 文字目から M（1）、N 文字おき（0.7）。
  - `SA.scope.maskForText` で実測し、**0 文字、または可視文字の全部を覆うものは捨てて引き直す**（最大 4 回）。`length` は可視文字数の半分を上限にする。
- **効果ファミリーの抽選** `pickScopedEffect`: stretch / tracking / wave / deco / enter。
  - wave はベースの `patch.hold` にブロック変形系（warp / letterWarp / fontSize / fillScreen / squashStretch）があるときは `sineWave` を外す（B3 の原点競合回避）。fear > 0.5 なら `shiver` を候補に足す。
  - deco は `text` span / `fill`（既存 `fillEffectFor` の可読性検証済みプール）/ `edge`（`outline` / `neonGlow`）のいずれか。色は `ctx.accentHexes`。
  - smartness > 0.5 のときは `mode:'beat'` / `'pulse'` を除く（`smartHold` と同じ考え方）。
- **組み込み**: `varyBeat` は `stream('beat-scoped')`、`directBeat` は専用ストリーム（下記参照）。どちらも新しいストリームしか消費しないので既存の抽選結果は変わらない。
- `scoped` を `AUTO_DIRECT_BEAT_GROUPS` に追加したので、再生成で前回の `scoped` は上書きされる。

---

## 2. 計画から変更した点（重要）

### 2-1. `scene.js` が `textOffset` を運んでいなかった（バグ修正）

`scope.js` の `range` scope は `letter.textOffset` を読むが、`scene.js` の letter オブジェクトはその値を**コピーしていなかった**。結果、レンダラーでは `range` scope が常に空マスクになり、`maskForText` を使う `text` グループだけが動いていた。ヒーロー語の scope は `range` なので、Generate が書いても死んだエントリになっていた。

`scene.js` に `textOffset: source.textOffset` を追加し、`scene-scale.test.js` に回帰テストを足した。

### 2-2. 非 compose 経路は `weird` ストリームではなく専用ストリーム

計画では `directBeat` の `w > 0` ブロック内で `wr` を使っていたが、それでは既存の抽選のストリームがずれる。`SA.rng.rngFor(beatSeed, beat.id, 'scoped')` を専用に用意した。

### 2-3. 書字方向はビート自身のテンプレートを優先

計画では `ctx.direction` をそのまま使っていたが、縦書きの run でもテンプレの大部分は `direction: 'horizontal'`（`compositions.js` の一覧を参照）。そのままだと横書きのビートが縦に伸縮していた。`verticalOf(patch, ctx)` で `patch.text.direction` を優先するようにした。

---

## 3. 検証

### 自動（すべて通過）

```bash
npm run check                    # check: 220 files ok
npm test                         # tests 1023 / pass 1023 / fail 0
node scripts/fx-axes-build.js --check   # 431 types / unchanged
```

注意: この作業ツリーには**別件の未コミット変更**（ビデオトラック、プロジェクトの version 5 へのマイグレーション、`engine.js` / `store.js` / `timeline.js` / `layers-dialog.js` / `README.md` / `doc/*` など）が混在している。全体テスト数は作業の途中で 1004 → 1021 → 1023 と増えているが、それは自分の追加ではなく並行している作業の反映で、自分の追加分は §3 に列挙した分だけ。触れたファイルは §4 の表だけ。

追加したテスト:

- `scope.test.js`: `slice` の text/line × start/end × offset/length、スキップ文字、`maskForText` と `maskFor` の一致。加えて `local` の motion テスト（下記）。
- `selector.test.js`: `stretch` の cpu・enter/exit・spread、軸、負の amount、`mode:hold`、`tracking` の新 spread フック。
- `direct.test.js`: weird 0 で `scoped` が出ない（バイト一致の既存テストも通る）、weird 1 の固定シードで一部ビートに付き、全エントリが `local`（`text` deco を除く）、scope が空でも全体でもないこと、smartness 0.9 で metronome 一族を落とす、キーワードと重ならない、縦書きが横方向に使わない。
- `motion` 系の新テスト（`scope.test.js` 内の `makeWideScene` を使う。7 文字 × 100px の広いシーンにして、run の中心と半幅を手計算で突き合わせている）:
  - local `tracking` が run 中心から広がる（local なしではブロック中心から）
  - local `stretch` のリフローが同じ行の外の文字を `half * g` だけ押す / 負成長で引き寄せる / 0 成長で動かない / **別の行には触れない**
  - local `fontSize`（ブロック変形）の `warpOrigin` が部分中心、`blockHalf` が run の半幅、run 外には変形が無い
  - local な scoped enter（`stretch` 入り）が部分中心を中心にスケールする
- `scene-scale.test.js`: 実際に組んだシーンが `range` scope のアドレスとして使う `textOffset` を持ち、`slice` も同じマスクになること。

### 手動（未実施＝要チェック）

1. Studio: Inspector で手動の scoped を作り、`slice`（行末 2 文字）+ `stretch` local で、その 2 文字だけが伸縮し隣の文字が押し出されることを見る。`tracking` / `sineWave` / `letterRipple` も同様に確認する。
2. テーマ編集で weird 0.6 → 生成。複数ビートの Inspector「部分演出」に自動エントリがあり、プレビューでヒーロー語・文頭・行末などの一部だけが伸縮・字間・波・装飾・遅れ登場していること。スクラブで前後しても見た目が飛ばないこと。
3. weird 0 で生成したプロジェクト JSON が変更前と同一であること（同シードで diff）。※ `direct.test.js` の w=0 フィクスチャ比較がこれの代替になっている。
4. mp4 書き出しを 2 回行い、フレームが一致すること（決定論）。

ヘッドレスで代替した検証: 生成プロジェクトが実際に scene をビルドし、サンプルした全フレームで `warpOrigin` / `blockHalf` も含めて有限値、書き込まれた scope は可視文字の 1..n-1 文字に収まっていること、縦書きビートが横方向に伸縮しないことを確認済み（テストコードとしてではなく一時スクリプトで確認後、`direct.test.js` の縦書きアサーションとして残した）。

---

## 4. 変更ファイル一覧（未コミット）

| ファイル | 内容 |
|---|---|
| `renderer/js/lyrics/scope.js` | `slice` scope（`markSlice` / `maskForText` の `slice` 分岐、先頭コメントに kind を追記） |
| `renderer/js/lyrics/motion.js` | `local` モード（run 幾何・`localInfo`・`rigid.localRun`・`warpOrigin`）、リフロー、`holdInstances` を `{instance, def}` に |
| `renderer/js/lyrics/scene.js` | `textOffset` を letter に載せる（**バグ修正**、1 行 + コメント） |
| `renderer/js/lyrics/effects/registry.js` | descriptor の任意フック `spread` |
| `renderer/js/lyrics/effects/selector.js` | `stretch`（hold / enter / exit）、`tracking` の `hold` モードと `spread` フック、export 追加 |
| `renderer/js/lyrics/effects/staged-presets.js` | `stretchBreathX` / `stretchBeatY` / `stretchPopIn` |
| `renderer/js/lyrics/gen-params.js` | `scoped` グループ 7 キー、`SCOPED_KEYS` export |
| `renderer/js/studio/direct.js` | `pickScope` / `pickScopedEffect` / `scopedFor` / `verticalOf` / `blockDeformOf`、`varyBeat` と `directBeat` への組み込み、`AUTO_DIRECT_BEAT_GROUPS` に `scoped` |
| `renderer/js/studio/inspector.js` | `SCOPE_KINDS` に `slice`、slice の行（anchor / from / offset / length / skipSpaces）、motion グループの `local` トグル |
| `renderer/js/studio/theme-editor.js` | `GROUP_LABEL` に `scoped` |
| `renderer/js/studio/fx-strings.js` | type / param ラベル 5 言語、Inspector の slice キー 5 言語 |
| `renderer/js/i18n.js` | `themeEditor.param.scoped*` 7 キーと `themeEditor.group.scoped` を 5 言語 |
| `renderer/data/fx-axes.json` / `fx-axes-table.js` | 新 6 type の行を再生成（`fx-axes-build.js`） |
| `scripts/test/{scope,selector,direct,scene-scale}.test.js` | 上のテスト |

既存エントリの見た目は変わっていない（`local` を持たないものは従来どおり）。w=0 のバイト一致は `direct.test.js` のフィクスチャ比較が担保している。
