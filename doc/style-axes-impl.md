# 詳細実装計画（→ `doc/style-axes-impl.md` として保存）

## 調査で分かった前提
- 歌詞の rhythm plan（`direct.js:458-471` → `SA.rhythm.plan`）は **weird > 0 のときだけ**作られる。weird 0 では cuts は null。
- filler の figure は `direct.js:2245` の `regenerate()` で `SA.figures.generate` を呼ぶ。このとき `beats` を渡していない。そのため sync が `beat`/`text` だと `subBeats` が区間を1つしか作らず、**filler 内で演出が一度も切り替わらない**。sync が `free` で rhythm がある場合だけ cuts で切り替わる。
- 手動で再抽選する経路（`store.js:2153`）も `figures.generate` を使っている。ここは beats を渡している。
- figure の density の初期値は energy から作られていて、場所が3つある：`figures.js:268`、`direct.js:2308`、`gen-params.js:157`（`figureDensity` の derive が `0.25 + 0.6*a.e + 0.2*a.b`）。
- `ctx.bpm` は direct の ctx に入っている（`direct.js:2476` で使われている）。

## Phase 1（今回実装する）

### 1. rhythm の分割を Tempo に移す — `renderer/js/lyrics/rhythm.js`
`weightsFor(axes, charCount)` を次のように変える。
```js
const tempo = clamp01(axes.speed);
const energy = clamp01(axes.energy);
even:    1 + 2 * (1 - tempo),
halves:  1 + 1.5 * tempo,
build:   1 + 2.2 * energy,          // 盛り上がりは energy に残す
fall:    1 + 0.8 * energy,
hold2:   0.8 + 1.8 * (1 - tempo),
stutter: 0.4 + 2.2 * (0.5 * tempo + 0.5 * w),
// push / pull / synco / triplet は今のまま（weird）
```
- テスト用に、返り値に `weightsFor` を足す：`return { PATTERNS, MIN_FRAGMENT, plan, weightsFor }`。
- 既存テスト `calm songs hold more than loud ones`（rhythm.test.js:73）はそのまま通る想定（calm の speed 0.3 / loud の speed 0.9）。

### 2. filler 内の切り替え間隔を Tempo で決める — `renderer/js/lyrics/figures.js`
- 新しい定数：`const TEMPO_STEPS = [8, 4, 2, 1, 0.5]; // beats per switch, slow → fast`
- `subBeats(options, random)` で `edges` を作った直後に追加する。
```js
if (options.tempoGrid) {
  const beat = Math.max(0.05, num(options.beatSeconds, 0.5));
  const speed = clamp01((options.axes || {}).speed);
  const step = beat * TEMPO_STEPS[Math.min(TEMPO_STEPS.length - 1, Math.floor(speed * TEMPO_STEPS.length))];
  if (!edges.length) {
    for (let t = start + step; t < end - 0.05; t += step) edges.push(t);
  } else {
    // cuts から来た edges は step より短い間隔のものを間引く
    edges.sort((a, b) => a - b);
    const kept = [];
    let last = start;
    for (const e of edges) if (e - last >= step - 1e-6) { kept.push(e); last = e; }
    edges = kept;
  }
}
```
- `random` は使わない（乱数列の消費が変わらないようにする）。区間が増えると `assignMoves` が使う乱数は増えるが、`figure-beat` ストリームの中なので他の抽選には影響しない。
- `clamp01` は欠けた値に 0.5 を返す → step 2 拍。
- 呼び出し側 `renderer/js/studio/direct.js:2247` の `regenerate()` に次を足す：
  `tempoGrid: true, beatSeconds: 60 / (Number(ctx.bpm) > 0 ? Number(ctx.bpm) : 120),`
- `store.js:2153`（手動の再抽選）は、target が filler 由来の figure のとき（`target.trackId` が filler トラック、または id が `clip_filler` で始まるとき）だけ同じ2つを渡す。bpm は `projectDoc.features?.bpm` を見て、無ければ 120 を使う（実装のときに保存場所を確認する）。歌詞キューの figure clip（`figureClipFor`）には渡さない。歌詞のビートに合わせる今の動きを保つため。

### 3. figure の density を Density 軸へ移す
- `figures.js:268`：`0.4 + 0.5 * clamp01(axes.energy)` → `0.4 + 0.5 * clamp01(axes.density)`
- `direct.js:2307-2308`：fallback の `0.25 + 0.6 * energy + 0.2 * w` → `0.25 + 0.6 * density軸 + 0.2 * w`（`axes.density` が無ければ 0.5）。`energy` 変数は L2352 で distance に使うので残す。
- `gen-params.js:157`：`figureDensity` の derive を `a.e` から密度のキーに変える。derive の引数 `a` の密度のキー名（`a.d` など）は実装のときに確認する。

### 4. hover テキスト — `renderer/js/i18n.js`
- en（L149）と ja（L403）の `axisHint` の8キーそれぞれの末尾に、上の追記案の表の文を足す（既存の文は消さない）。
- es（L639）/ fr（L875）/ ru（L1111）は weird/smartness/fear の3キーだけ、末尾に同じ趣旨の訳を足す。
- weird の追記文は「パルスを足さない」方針に合わせて、ばらつき・シンコペーションだけを書く。smartness の文に「パルスを許すかどうか」を書く（今の動作どおり。コードの変更はいらない）。

### 5. Softness / Brightness / Smartness / Fear / Weird
- コードの変更はしない（定義を hover の説明に揃えるだけ）。今の動作はすでに AI案の範囲に収まっている。

## Phase 2（今回は実装しない。メモとして残す）
- Energy＝距離をエフェクト選びに広げる。`moods.js` の `pickEntry`（L522）には今、直前のキューの type が渡っていない。context に `previousType` を足し、同じ系統の重みに `lerp(1, 0.15, energy)` を掛ける案。

## テスト
- `scripts/test/rhythm.test.js` に追加：
  - weird 0、energy 0.5 固定で speed を 0.1 / 0.9 にしたとき、`weightsFor` の even と hold2 が下がり、halves と stutter が上がる。
  - speed 固定で energy を 0.1 / 0.9 にしたとき、even・halves・hold2・stutter が変わらない（build と fall だけが変わる）。
- `scripts/test/figures.test.js` に追加：
  - `generate({ span:{0,16}, axes:{speed:0.05}, tempoGrid:true, beatSeconds:0.5, sync:'beat', seed:1, id:'f' })` の beats が 2 個（8拍 = 4秒刻み → 4区間になるので、正しい期待値は実装のときに計算して固定する）。speed 0.95 では細かく（0.25秒刻み）なり、beats の数が単調に増えることを確かめる。
  - `tempoGrid` なしの場合は今の出力と同じになる（beats が1個）。
- 全体：`npm test`（`node --test "scripts/test/**/*.test.js"`）。figures-distance / figures-randomness / backdrop-variety / proc-variety / direct / moods が通ること。出力の値を固定したスナップショット系のテストが落ちたら、理由を確認してから更新する。
- アプリで確認：Studio で ballad（speed 0.15）と rock（speed 0.9）を生成し、filler の figure の切り替え回数が違うことをプレビューで見る。テーマダイアログの軸 hover に追記した文が出ることも確認する。
