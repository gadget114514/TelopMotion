# 後景見本 (backdrop showcase)

歌詞の後ろに敷く後景（`mid` トラック）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのは後景だけです。

- 質感・配置は1項目につき複数構成（モードと幅・高さ違い）＝複数キュー（4 秒/キュー）、モーションは1動き＝1キュー
- 後景は後景トラック（`mid`）のクリップです。キューは中央のサンプル文だけを持ちます
- モーションのセクションは参照コンボ（halves + burst）を使い、隣り合うキューで違うのはクリップの動きだけです
- 開くには Studio の *Help → 後景見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | アクセント (accent) | 18 | 0–72s |
| 2 | 分割プレーン (split) | 22 | 72–160s |
| 3 | クリップモーション (motion) | 9 | 160–196s |
| | **合計** | **49** | **196s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run backdrop-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/backdrop-showcase.js list` | セクションとキューを一覧 |
| `node scripts/backdrop-showcase.js list --section split` | 1 セクションだけ表示 |
| `npm run backdrop-showcase -- build --sections accent,split` | セクションを絞って生成 |

## 1. アクセント (accent) (accent)

後景の質感レイヤーだけを1層で出しています。分割プレーンはありません。1種類につき3構成（モードと幅・高さ違い）を見せます。

| # | キュー | 時間 | 値 | 構成 |
|---:|---|---|---|---|
| 1 | `bd_001` | 0–4s | `shapes` | burst ×12 |
| 2 | `bd_002` | 4–8s | `shapes` | circles ×24 |
| 3 | `bd_003` | 8–12s | `shapes` | grid ×8 |
| 4 | `bd_004` | 12–16s | `pattern` | stripes · 24 |
| 5 | `bd_005` | 16–20s | `pattern` | dots · 48 |
| 6 | `bd_006` | 20–24s | `pattern` | grid · 12 |
| 7 | `bd_007` | 24–28s | `particles` | rise · 24 |
| 8 | `bd_008` | 28–32s | `particles` | fall · 48 |
| 9 | `bd_009` | 32–36s | `particles` | vortex · 16 |
| 10 | `bd_010` | 36–40s | `spectrum` | bars · 48 |
| 11 | `bd_011` | 40–44s | `spectrum` | radial · 64 |
| 12 | `bd_012` | 44–48s | `spectrum` | blob · 24 |
| 13 | `bd_013` | 48–52s | `waveform` | line |
| 14 | `bd_014` | 52–56s | `waveform` | mirror |
| 15 | `bd_015` | 56–60s | `waveform` | circle |
| 16 | `bd_016` | 60–64s | `figures` | orbit |
| 17 | `bd_017` | 64–68s | `figures` | rings · 14 |
| 18 | `bd_018` | 68–72s | `figures` | waves · 6 |

## 2. 分割プレーン (split) (split)

色の面だけを出しています。質感レイヤーはありません。動きは breathe に固定し、1配置につき2構成（標準の全幅と、細かく狭い分割）を見せます。

| # | キュー | 時間 | 値 | 構成 |
|---:|---|---|---|---|
| 19 | `bd_019` | 72–76s | `halves` | 2面 · 85% |
| 20 | `bd_020` | 76–80s | `halves` | 4面 · 50% |
| 21 | `bd_021` | 80–84s | `diagonal` | 2面 · 85% |
| 22 | `bd_022` | 84–88s | `diagonal` | 4面 · 50% |
| 23 | `bd_023` | 88–92s | `thirds` | 3面 · 85% |
| 24 | `bd_024` | 92–96s | `thirds` | 5面 · 50% |
| 25 | `bd_025` | 96–100s | `bands` | 3面 · 85% |
| 26 | `bd_026` | 100–104s | `bands` | 5面 · 50% |
| 27 | `bd_027` | 104–108s | `quads` | 4面 · 85% |
| 28 | `bd_028` | 108–112s | `quads` | 6面 · 50% |
| 29 | `bd_029` | 112–116s | `grid` | 4面 · 85% |
| 30 | `bd_030` | 116–120s | `grid` | 6面 · 50% |
| 31 | `bd_031` | 120–124s | `chevron` | 3面 · 85% |
| 32 | `bd_032` | 124–128s | `chevron` | 5面 · 50% |
| 33 | `bd_033` | 128–132s | `radial` | 4面 · 85% |
| 34 | `bd_034` | 132–136s | `radial` | 6面 · 50% |
| 35 | `bd_035` | 136–140s | `mondrian` | 4面 · 85% |
| 36 | `bd_036` | 140–144s | `mondrian` | 6面 · 50% |
| 37 | `bd_037` | 144–148s | `frame` | 2面 · 85% |
| 38 | `bd_038` | 148–152s | `frame` | 4面 · 50% |
| 39 | `bd_039` | 152–156s | `shards` | 4面 · 85% |
| 40 | `bd_040` | 156–160s | `shards` | 6面 · 50% |

## 3. クリップモーション (motion) (motion)

参照コンボ（halves + burst）を固定し、クリップ全体のモーション（animate.mode）だけを変えています。

| # | キュー | 時間 | 値 | 構成 |
|---:|---|---|---|---|
| 41 | `bd_041` | 160–164s | `accent` | accent |
| 42 | `bd_042` | 164–168s | `swell` | swell |
| 43 | `bd_043` | 168–172s | `sway` | sway |
| 44 | `bd_044` | 172–176s | `drift` | drift |
| 45 | `bd_045` | 176–180s | `still` | still |
| 46 | `bd_046` | 180–184s | `pulse` | pulse |
| 47 | `bd_047` | 184–188s | `travel` | travel |
| 48 | `bd_048` | 188–192s | `zoom` | zoom |
| 49 | `bd_049` | 192–196s | `tilt` | tilt |

