# カラー見本 (color showcase)

配色スキーム・ムードのパレット・線パターンを 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのは色だけです。

- 配色スキーム・パレットは1項目＝1キュー（4 秒/キュー）、線パターンは1種類＝1キュー（3 秒/キュー）
- 配色スキームとパレットは後景トラック（`mid`）の分割プレーン、線パターンは文字の縁取り（`outline`）です。キューは中央のサンプル文だけを持ちます
- 開くには Studio の *Help → カラー見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 配色スキーム (scheme) | 6 | 0–24s |
| 2 | パレット (palette) | 14 | 24–80s |
| 3 | 線パターン (pattern) | 20 | 80–140s |
| | **合計** | **40** | **140s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run color-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/color-showcase.js list` | セクションとキューを一覧 |
| `node scripts/color-showcase.js list --section pattern` | 1 セクションだけ表示 |
| `npm run color-showcase -- build --sections scheme,palette` | セクションを絞って生成 |

## 1. 配色スキーム (scheme) (scheme)

分割プレーンの配色スキームだけを変えています。配置は halves（3面・60%）に、動きは none に固定し、違うのはスキームだけです。

配置 halves・3面・60%・動き none・4 秒/キュー

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 1 | `color_001` | 0–4s | `tonal` | tonal |
| 2 | `color_002` | 4–8s | `analogous` | analogous |
| 3 | `color_003` | 8–12s | `complementary` | complementary |
| 4 | `color_004` | 12–16s | `triad` | triad |
| 5 | `color_005` | 16–20s | `splitComplementary` | splitComplementary |
| 6 | `color_006` | 20–24s | `neutralAccent` | neutralAccent |

## 2. パレット (palette) (palette)

ムードのパレットを1種類ずつ。同じ halves の面に、そのパレットの先頭3色を載せています。動きは none に固定しています。

配置 halves・3面・60%・動き none・スキーム tonal 固定・4 秒/キュー

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 7 | `color_007` | 24–28s | `night` | night |
| 8 | `color_008` | 28–32s | `mono` | mono |
| 9 | `color_009` | 32–36s | `gold` | gold |
| 10 | `color_010` | 36–40s | `pastel` | pastel |
| 11 | `color_011` | 40–44s | `warm` | warm |
| 12 | `color_012` | 44–48s | `neon` | neon |
| 13 | `color_013` | 48–52s | `rose` | rose |
| 14 | `color_014` | 52–56s | `ocean` | ocean |
| 15 | `color_015` | 56–60s | `blood` | blood |
| 16 | `color_016` | 60–64s | `ash` | ash |
| 17 | `color_017` | 64–68s | `blush` | blush |
| 18 | `color_018` | 68–72s | `sunset` | sunset |
| 19 | `color_019` | 72–76s | `rain` | rain |
| 20 | `color_020` | 76–80s | `festival` | festival |

## 3. 線パターン (pattern) (pattern)

文字の縁取り（outline）の線パターンだけを変えています。塗りは同じ明るい単色で、テキストは静止表示です。

塗り `#f4f7ff`・縁取り幅 4・テキスト静止表示

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 21 | `color_021` | 80–83s | `solid` | solid |
| 22 | `color_022` | 83–86s | `dashed` | dashed |
| 23 | `color_023` | 86–89s | `dotted` | dotted |
| 24 | `color_024` | 89–92s | `dashDot` | dashDot |
| 25 | `color_025` | 92–95s | `double` | double |
| 26 | `color_026` | 95–98s | `triple` | triple |
| 27 | `color_027` | 98–101s | `stripes` | stripes |
| 28 | `color_028` | 101–104s | `checker` | checker |
| 29 | `color_029` | 104–107s | `diamond` | diamond |
| 30 | `color_030` | 107–110s | `zigzag` | zigzag |
| 31 | `color_031` | 110–113s | `wave` | wave |
| 32 | `color_032` | 113–116s | `random` | random |
| 33 | `color_033` | 116–119s | `railroad` | railroad |
| 34 | `color_034` | 119–122s | `hatch` | hatch |
| 35 | `color_035` | 122–125s | `crosshatch` | crosshatch |
| 36 | `color_036` | 125–128s | `sketch` | sketch |
| 37 | `color_037` | 128–131s | `doubleDashed` | doubleDashed |
| 38 | `color_038` | 131–134s | `squareChain` | squareChain |
| 39 | `color_039` | 134–137s | `chain` | chain |
| 40 | `color_040` | 137–140s | `ornament` | ornament |

