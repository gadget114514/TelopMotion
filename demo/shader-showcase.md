# シェーダ分解見本 (shader showcase)

シェーダ分解5種（モザイク・霧・風分解・風なびき・布なびき）を入場・保持・退場の3キューずつ並べた見本プロジェクトです。1家族の3相が連続再生されます。

- 1 キュー＝4 秒。開くには Studio の *Help → シェーダ見本*、または *File → Open project…* を使います
- 入場キューは該当enterのみ1.2秒、退場キューは該当exitのみ1.0秒、保持キューは該当holdのみ。それ以外は短いフェードです

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | モザイク分解 (mosaicBreak) | 3 | 0–12s |
| 2 | 霧分解 (fogBreak) | 3 | 12–24s |
| 3 | 風分解 (windBreak) | 3 | 24–36s |
| 4 | 風なびき (windNoBreak) | 3 | 36–48s |
| 5 | 布なびき (cloth) | 3 | 48–60s |
| | **合計** | **15** | **60s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run shader-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/shader-showcase.js list` | セクションとキューを一覧 |
| `node scripts/shader-showcase.js list --section wind` | 1 セクションだけ表示 |
| `npm run shader-showcase -- build --sections mosaic,fog` | セクションを絞って生成 |

## 1. モザイク分解 (mosaicBreak) (mosaicBreak)

シェーダ分解 `mosaicBreak` を入場・保持・退場の3キューで並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 1 | `sh_001` | 0–4s | `mosaicBreak/enter` | モザイク分解・入場 |
| 2 | `sh_002` | 4–8s | `mosaicBreak/hold` | モザイク分解・保持 |
| 3 | `sh_003` | 8–12s | `mosaicBreak/exit` | モザイク分解・退場 |

## 2. 霧分解 (fogBreak) (fogBreak)

シェーダ分解 `fogBreak` を入場・保持・退場の3キューで並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 4 | `sh_004` | 12–16s | `fogBreak/enter` | 霧分解・入場 |
| 5 | `sh_005` | 16–20s | `fogBreak/hold` | 霧分解・保持 |
| 6 | `sh_006` | 20–24s | `fogBreak/exit` | 霧分解・退場 |

## 3. 風分解 (windBreak) (windBreak)

シェーダ分解 `windBreak` を入場・保持・退場の3キューで並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 7 | `sh_007` | 24–28s | `windBreak/enter` | 風分解・入場 |
| 8 | `sh_008` | 28–32s | `windBreak/hold` | 風分解・保持 |
| 9 | `sh_009` | 32–36s | `windBreak/exit` | 風分解・退場 |

## 4. 風なびき (windNoBreak) (windNoBreak)

シェーダ分解 `windNoBreak` を入場・保持・退場の3キューで並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 10 | `sh_010` | 36–40s | `windNoBreak/enter` | 風なびき・入場 |
| 11 | `sh_011` | 40–44s | `windNoBreak/hold` | 風なびき・保持 |
| 12 | `sh_012` | 44–48s | `windNoBreak/exit` | 風なびき・退場 |

## 5. 布なびき (cloth) (cloth)

シェーダ分解 `cloth` を入場・保持・退場の3キューで並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 13 | `sh_013` | 48–52s | `cloth/enter` | 布なびき・入場 |
| 14 | `sh_014` | 52–56s | `cloth/hold` | 布なびき・保持 |
| 15 | `sh_015` | 56–60s | `cloth/exit` | 布なびき・退場 |

