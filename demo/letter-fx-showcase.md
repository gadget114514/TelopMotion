# 文字装飾見本 (letter-fx showcase)

文字単位の装飾3種（上下2色 `fill.splitTone`・一文字取り消し線 `style.strike`・一文字ずらし重ね `clones[].perLetter`）を 1 キューずつ並べた見本プロジェクトです。

- 1 キュー＝4 秒。開くには Studio の *Help → 文字装飾見本*、または *File → Open project…* を使います
- split セクションは塗りだけ、strike セクションは取り消し線だけ、shift セクションは重ねだけを変えています
- combo は3つの効果をすべて組み合わせた例です

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 上下2色 (split) | 6 | 0–24s |
| 2 | 取り消し線 (strike) | 8 | 24–56s |
| 3 | ずらし重ね (shift) | 6 | 56–80s |
| 4 | 組み合わせ (combo) | 1 | 80–84s |
| | **合計** | **21** | **84s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run letter-fx-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/letter-fx-showcase.js list` | セクションとキューを一覧 |
| `node scripts/letter-fx-showcase.js list --section strike` | 1 セクションだけ表示 |
| `npm run letter-fx-showcase -- build --sections split,strike` | セクションを絞って生成 |

## 1. 上下2色 (split) (split)

1文字の上半分と下半分で色を変える塗り（`fill.splitTone`）です。glyph基準とem基準、ぼかし・傾き・帯・交互を並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 1 | `lf_001` | 0–4s | `glyph` | 基準=glyph |
| 2 | `lf_002` | 4–8s | `em` | 基準=em |
| 3 | `lf_003` | 8–12s | `soft` | softness 0.12 |
| 4 | `lf_004` | 12–16s | `angle` | angle 20° |
| 5 | `lf_005` | 16–20s | `band` | band 0.06 |
| 6 | `lf_006` | 20–24s | `alternate` | alternate on |

## 2. 取り消し線 (strike) (strike)

文字ごとに独立した取り消し線（`style.strike`）です。線は文字の回転・移動・拡大に追従します。種類・ばらつき・色分け・描き込み・背面を並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 7 | `lf_007` | 24–28s | `line` | line |
| 8 | `lf_008` | 28–32s | `double` | double |
| 9 | `lf_009` | 32–36s | `wave` | wave |
| 10 | `lf_010` | 36–40s | `slash` | slash |
| 11 | `lf_011` | 40–44s | `jitter` | angleJitter 20° + random |
| 12 | `lf_012` | 44–48s | `colors` | colors alternate |
| 13 | `lf_013` | 48–52s | `stagger` | drawIn stagger |
| 14 | `lf_014` | 52–56s | `under` | layer under |

## 3. ずらし重ね (shift) (shift)

重ね（クローン）を一文字ずつずらします（`clones[].perLetter`）。位置・色・透明度・傾き・書体を並べています。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 15 | `lf_015` | 56–60s | `dx` | dx alternate |
| 16 | `lf_016` | 60–64s | `dy` | dy wave |
| 17 | `lf_017` | 64–68s | `color` | colors cycle |
| 18 | `lf_018` | 68–72s | `opacity` | opacity ramp |
| 19 | `lf_019` | 72–76s | `skew` | skew random |
| 20 | `lf_020` | 76–80s | `font` | fonts cycle |

## 4. 組み合わせ (combo) (combo)

3つの効果をすべて組み合わせた例です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 21 | `lf_021` | 80–84s | `combo` | split + strike + shift |

