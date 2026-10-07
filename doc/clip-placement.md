# Clip placement & enabled

クリップ効果の配置 (`clip-placement.js`) と on/off (`enabled`) の共有仕様。
`waveform` に `enabled` がなかったのは歴史的経緯 (後付けで `pattern/split/figures`
にだけ生えた) で、ランタイムのゲート自体は最初から汎用だった。本書のモデルに統一済み。

## 配置モデル

| key | 意味 | 単位/範囲 | 既定 |
|---|---|---|---|
| `enabled` | 層の on/off (描画ゲート用、変形量ではない) | bool | `true` |
| `x`, `y` | 配置オフセット | 画面比 (-0.5〜0.5、+x右、+y下) | `0` |
| `scale` | 等倍ズーム (figures の既存キーと同一) | 0.2〜3 | `1` |
| `scaleX`, `scaleY` | 軸別ズーム (最終倍率 = `scale` × `scaleX/Y`) | 0.2〜3 | `1` |
| `rotation` | 面内 tilt | 度 (-180〜180、時計回り正) | `0` |

- 格納場所は2種。filler/figure は効果 `params` 直下 (従来の `figures.scale/x/y`
  の延長)。背景シェーダ系 (`gradient` の `scale` 等、効果固有の意味と衝突する)
  は `spec.placement` サイドカー。読み側 (`fromParams`/`fromSpec`) と
  変形 (`toTransform`/`toCamera`/`toPlaceScale`) は共通。
- CPU 図形は `figures.transformShapes` で適用 (角丸以外の矩形・点列は完全対応、
  円/カプセルは幾何平均で拡縮し円形を保つ)。シェーダ背景は `u_camera` +
  `u_place` で適用 (拡縮→回転→平行移動の順)。恒等配置は描画不変。
- クリップ単位のサイドカーは層単位の params 配置に**合成**される (両方使える)。

## enabled の優先順位

`false` が1つでもあれば消える (OR)。上ほど強い:

1. `clip.disabled` / `clip.enabled === false` (タイムライン右クリック、figure の
   `enabled` ミラー)
2. `spec.enabled === false` / `spec.disabled` (背景クリップ等の spec 直書き)
3. `spec.placement.enabled === false` (背景シェーダの配置サイドカー)
4. `spec.params.enabled === false` / `params.disabled` (filler 層・combo 構成層)
5. 拍単位: backdrop/filler は `clip.segments[i].disabled`、figure は
   `spec.params.beats[i].disabled` (その区間だけ無音化)
6. 外側: `track.hidden` / `track.enabled === false`、post 系は
   `instance.enabled` + `params.enabled` (`postOn`)

判定の正本は `clipPlacement.isEnabled` + `engine.isClipDisabled`。
タイムラインの `isClipDisabled` は engine に委譲する (表示と描画の乖離防止)。

## 種類別の enabled 所在

- background シェーダ全種: sidecar の `enabled` (inspector 配置欄)。`params`
  に `enabled` を書いても効くが UI は sidecar が正。
- backdrop/filler/figure の視覚層: `params.enabled` (inspector 欄に自動表示)。
- text 系 (`countdown/progress/textAnim` 等): `params.enabled` のみ
  (位置は各固有 param が担当)。
- `credits`/`cardPeek`/`none`: 描画物がないため対象外
  (`credits` は設定側 `modes.*.enabled` を使う)。

## 手書き JSON 例

```json
{ "type": "waveform",
  "params": { "mode": "mirror", "rotation": 15, "scaleY": 0.6, "y": 0.2 } }
{ "type": "gradient",
  "params": { "direction": "toRight" },
  "placement": { "enabled": true, "rotation": -10, "scaleX": 1.5 } }
{ "type": "figure",
  "params": { "beats": [{ "start": 0, "end": 2, "disabled": true }] } }
{ "trackId": "filler-track", "start": 4, "end": 12,
  "spec": { "type": "waveform", "params": {} },
  "segments": [{ "start": 4, "end": 8, "disabled": true }] }
```

## リセット注意

- backdrop の全体 reroll は `segments` を消す。figure の全体 reroll は
  `beats` を作り直す (サブビート mute も消える)。`vary`/単層操作は保つ。
- 最初の mute 操作が暗黙 span を `segments` として実体化する
  (filler も同様)。全 span を有効に戻すと `segments` 自体が消える。
