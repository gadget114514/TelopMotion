# フォント見本 (font showcase)

同梱フォント 11 書体を 1 キューずつ並べた見本プロジェクトです。各キューは同じ欧文・和文サンプルを表示し、キューの書体だけが違います（欧文専用書体の和文は Noto Sans JP へのフォールバックで表示されます）。

- 1 書体 = 1 キュー（4 秒）
- 開くには Studio の *Help → フォント見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | ゴシック (sans) | 2 | 0–8s |
| 2 | ゴシック太字 (sansBold) | 2 | 8–16s |
| 3 | 明朝・セリフ (serif) | 2 | 16–24s |
| 4 | ディスプレイ (display) | 2 | 24–32s |
| 5 | 丸ゴシック (round) | 1 | 32–36s |
| 6 | 手書き (hand) | 1 | 36–40s |
| 7 | ポップ (pop) | 1 | 40–44s |
| | **合計** | **11** | **44s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run font-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/font-showcase.js list` | セクションとキューを一覧 |

## 1. ゴシック (sans)

本文の基本となるサンセリフ。欧文のみと和文の2書体を見比べます。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 1 | `font_01` | 0–4s | Noto Sans `NotoSans-Regular` | なし（フォールバック） |
| 2 | `font_02` | 4–8s | Noto Sans JP `NotoSansJP-Regular` | あり |

## 2. ゴシック太字 (sansBold)

同じゴシックの太字。見出しや強調の読みやすさを見ます。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 3 | `font_03` | 8–12s | Noto Sans `NotoSans-Bold` | なし（フォールバック） |
| 4 | `font_04` | 12–16s | Noto Sans JP `NotoSansJP-Bold` | あり |

## 3. 明朝・セリフ (serif)

うろこのあるセリフ体。欧文のみと和文を見比べます。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 5 | `font_05` | 16–20s | Noto Serif `NotoSerif-Regular` | なし（フォールバック） |
| 6 | `font_06` | 20–24s | Noto Serif JP `NotoSerifJP-Regular` | あり |

## 4. ディスプレイ (display)

見出し向けの強い書体。和文のデラゴシックと欧文のコンデンス体です。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 7 | `font_07` | 24–28s | Dela Gothic One `DelaGothicOne-Regular` | あり |
| 8 | `font_08` | 28–32s | Bebas Neue `BebasNeue-Regular` | なし（フォールバック） |

## 5. 丸ゴシック (round)

角の丸い柔らかい書体。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 9 | `font_09` | 32–36s | Zen Maru Gothic `ZenMaruGothic-Regular` | あり |

## 6. 手書き (hand)

手書き風の書体。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 10 | `font_10` | 36–40s | Klee One `KleeOne-Regular` | あり |

## 7. ポップ (pop)

勢いのあるポップ体。

| # | キュー | 時間 | 書体 | 和文 |
|---:|---|---|---|---|
| 11 | `font_11` | 40–44s | RocknRoll One `RocknRollOne-Regular` | あり |

