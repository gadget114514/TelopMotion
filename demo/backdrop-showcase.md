# 後景見本 (backdrop showcase)

歌詞の後ろに敷く後景（`mid` トラック）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのは後景だけです。

- 1 層・1 配置・1 モーション = 1 キュー（4 秒）
- 後景は後景トラック（`mid`）のクリップです。キューは中央のサンプル文だけを持ちます
- モーションのセクションは参照コンボ（halves + burst）を使い、隣り合うキューで違うのはクリップの動きだけです
- 開くには Studio の *Help → 後景見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | アクセント (accent) | 6 | 0–24s |
| 2 | 分割プレーン (split) | 11 | 24–68s |
| 3 | クリップモーション (motion) | 9 | 68–104s |
| | **合計** | **26** | **104s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run backdrop-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/backdrop-showcase.js list` | セクションとキューを一覧 |
| `node scripts/backdrop-showcase.js list --section split` | 1 セクションだけ表示 |
| `npm run backdrop-showcase -- build --sections accent,split` | セクションを絞って生成 |

## 1. アクセント (accent) (accent)

後景の質感レイヤーだけを1層で出しています。分割プレーンはありません。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 1 | `bd_001` | 0–4s | `shapes` |
| 2 | `bd_002` | 4–8s | `pattern` |
| 3 | `bd_003` | 8–12s | `particles` |
| 4 | `bd_004` | 12–16s | `spectrum` |
| 5 | `bd_005` | 16–20s | `waveform` |
| 6 | `bd_006` | 20–24s | `figures` |

## 2. 分割プレーン (split) (split)

色の面だけを出しています。質感レイヤーはありません。動きは breathe に固定しています。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 7 | `bd_007` | 24–28s | `halves` |
| 8 | `bd_008` | 28–32s | `diagonal` |
| 9 | `bd_009` | 32–36s | `thirds` |
| 10 | `bd_010` | 36–40s | `bands` |
| 11 | `bd_011` | 40–44s | `quads` |
| 12 | `bd_012` | 44–48s | `grid` |
| 13 | `bd_013` | 48–52s | `chevron` |
| 14 | `bd_014` | 52–56s | `radial` |
| 15 | `bd_015` | 56–60s | `mondrian` |
| 16 | `bd_016` | 60–64s | `frame` |
| 17 | `bd_017` | 64–68s | `shards` |

## 3. クリップモーション (motion) (motion)

参照コンボ（halves + burst）を固定し、クリップ全体のモーション（animate.mode）だけを変えています。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 18 | `bd_018` | 68–72s | `accent` |
| 19 | `bd_019` | 72–76s | `swell` |
| 20 | `bd_020` | 76–80s | `sway` |
| 21 | `bd_021` | 80–84s | `drift` |
| 22 | `bd_022` | 84–88s | `still` |
| 23 | `bd_023` | 88–92s | `pulse` |
| 24 | `bd_024` | 92–96s | `travel` |
| 25 | `bd_025` | 96–100s | `zoom` |
| 26 | `bd_026` | 100–104s | `tilt` |

