# フォント見本 (font showcase)

同梱フォント 11 書体を 1 キューずつ並べた見本プロジェクトです。各キューは同じ欧文・数字・和文サンプルを大きなサイズ（150px）で表示し、書体ごとの色とシンプルな装飾（縁取り・影）も付けています（欧文専用書体の和文は Noto Sans JP へのフォールバックで表示されます）。

- 1 書体 = 1 キュー（4 秒）、全文を1ビートで静止表示します
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

サイズ 150px・装飾 outline

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 1 | `font_01` | 0–4s | Noto Sans `NotoSans-Regular` | なし（フォールバック） | `#f4f7ff` |
| 2 | `font_02` | 4–8s | Noto Sans JP `NotoSansJP-Regular` | あり | `#ffe600` |

## 2. ゴシック太字 (sansBold)

同じゴシックの太字。見出しや強調の読みやすさを見ます。

サイズ 150px・装飾 dropShadow

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 3 | `font_03` | 8–12s | Noto Sans `NotoSans-Bold` | なし（フォールバック） | `#00e5ff` |
| 4 | `font_04` | 12–16s | Noto Sans JP `NotoSansJP-Bold` | あり | `#ff5cd0` |

## 3. 明朝・セリフ (serif)

うろこのあるセリフ体。欧文のみと和文を見比べます。

サイズ 150px・装飾 outline

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 5 | `font_05` | 16–20s | Noto Serif `NotoSerif-Regular` | なし（フォールバック） | `#7dff8a` |
| 6 | `font_06` | 20–24s | Noto Serif JP `NotoSerifJP-Regular` | あり | `#ff8a3d` |

## 4. ディスプレイ (display)

見出し向けの強い書体。和文のデラゴシックと欧文のコンデンス体です。

サイズ 150px・装飾 dropShadow

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 7 | `font_07` | 24–28s | Dela Gothic One `DelaGothicOne-Regular` | あり | `#ff4d5e` |
| 8 | `font_08` | 28–32s | Bebas Neue `BebasNeue-Regular` | なし（フォールバック） | `#c77dff` |

## 5. 丸ゴシック (round)

角の丸い柔らかい書体。

サイズ 150px・装飾 outline

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 9 | `font_09` | 32–36s | Zen Maru Gothic `ZenMaruGothic-Regular` | あり | `#8ef6ff` |

## 6. 手書き (hand)

手書き風の書体。

サイズ 150px・装飾 dropShadow

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 10 | `font_10` | 36–40s | Klee One `KleeOne-Regular` | あり | `#d0ff4d` |

## 7. ポップ (pop)

勢いのあるポップ体。

サイズ 150px・装飾 outline

| # | キュー | 時間 | 書体 | 和文 | 色 |
|---:|---|---|---|---|---|
| 11 | `font_11` | 40–44s | RocknRoll One `RocknRollOne-Regular` | あり | `#4dd6c1` |

