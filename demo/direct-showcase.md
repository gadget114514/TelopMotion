# 演出見本 (direct showcase)

構図テンプレート10種・ジャンル10種・ムード6種を 1 キューずつ並べた見本プロジェクトです。どのキューも同じ見本分を表示し、違うのは構図か演出だけです。

- 1演出＝1キュー（4 秒）
- 開くには Studio の *Help → 演出見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 構図 (comp) | 10 | 0–40s |
| 2 | ジャンル (genre) | 10 | 40–80s |
| 3 | ムード (mood) | 6 | 80–104s |
| | **合計** | **26** | **104s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run direct-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/direct-showcase.js list` | セクションとキューを一覧 |
| `node scripts/direct-showcase.js list --section genre` | 1 セクションだけ表示 |
| `npm run direct-showcase -- build --sections comp,genre` | セクションを絞って生成 |

## 1. 構図 (comp) (comp)

作画の構図テンプレートを1キューずつ。同じ見本分で、違うのは構図だけです。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 1 | `dr_001` | 0–4s | `heroCenter` |
| 2 | `dr_002` | 4–8s | `leftHeadline` |
| 3 | `dr_003` | 8–12s | `lowerBand` |
| 4 | `dr_004` | 12–16s | `bracketCenter` |
| 5 | `dr_005` | 16–20s | `posterStack` |
| 6 | `dr_006` | 20–24s | `cornerQuiet` |
| 7 | `dr_007` | 24–28s | `verticalRight` |
| 8 | `dr_008` | 28–32s | `diagonalJump` |
| 9 | `dr_009` | 32–36s | `bleedHero` |
| 10 | `dr_010` | 36–40s | `whisper` |

## 2. ジャンル (genre) (genre)

ジャンルごとの見た目を1キューずつ。同じ種で、違うのはジャンルの演出だけです。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 11 | `dr_011` | 40–44s | `horror` |
| 12 | `dr_012` | 44–48s | `love` |
| 13 | `dr_013` | 48–52s | `heartbreak` |
| 14 | `dr_014` | 52–56s | `party` |
| 15 | `dr_015` | 56–60s | `ballad` |
| 16 | `dr_016` | 60–64s | `cinematic` |
| 17 | `dr_017` | 64–68s | `cute` |
| 18 | `dr_018` | 68–72s | `electro` |
| 19 | `dr_019` | 72–76s | `rock` |
| 20 | `dr_020` | 76–80s | `washu` |

## 3. ムード (mood) (mood)

ムードプリセットの見た目を1キューずつ。軸の組み合わせで雰囲気が変わります。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 21 | `dr_021` | 80–84s | `ballad` |
| 22 | `dr_022` | 84–88s | `cinematic` |
| 23 | `dr_023` | 88–92s | `cute` |
| 24 | `dr_024` | 92–96s | `electro` |
| 25 | `dr_025` | 96–100s | `rock` |
| 26 | `dr_026` | 100–104s | `washu` |

