# テーマ見本 (theme showcase)

テーマプリセットを 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのはテーマ（`cueStyles`）だけです。

- 1テーマ = 1キュー（4 秒）
- 各キューはプリセットのスタイルをそのまま持ちます
- 開くには Studio の *Help → テーマ見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 定番 (standard) | 14 | 0–56s |
| 2 | 背景・装飾 (background) | 7 | 56–84s |
| 3 | ジャンル (genre) | 7 | 84–112s |
| 4 | プロ (pro) | 25 | 112–212s |
| | **合計** | **53** | **212s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run theme-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/theme-showcase.js list` | セクションとキューを一覧 |
| `node scripts/theme-showcase.js list --section pro` | 1 セクションだけ表示 |
| `npm run theme-showcase -- build --sections standard,pro` | セクションを絞って生成 |

## 1. 定番 (standard) (standard)

基本のテーマプリセットです。1プリセット＝1キューで見せます。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 1 | `th_001` | 0–4s | `pop` |
| 2 | `th_002` | 4–8s | `cinematic` |
| 3 | `th_003` | 8–12s | `neon` |
| 4 | `th_004` | 12–16s | `typewriter` |
| 5 | `th_005` | 16–20s | `glitch` |
| 6 | `th_006` | 20–24s | `karaoke` |
| 7 | `th_007` | 24–28s | `chrome` |
| 8 | `th_008` | 28–32s | `fire` |
| 9 | `th_009` | 32–36s | `hologram` |
| 10 | `th_010` | 36–40s | `handwritten` |
| 11 | `th_011` | 40–44s | `particleStorm` |
| 12 | `th_012` | 44–48s | `circleBuild` |
| 13 | `th_013` | 48–52s | `tategaki` |
| 14 | `th_014` | 52–56s | `achievementFanfare` |

## 2. 背景・装飾 (background) (background)

文字背景・オーナメントのプリセットです。1プリセット＝1キューで見せます。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 15 | `th_015` | 56–60s | `varietyBox` |
| 16 | `th_016` | 60–64s | `marker` |
| 17 | `th_017` | 64–68s | `badgeDots` |
| 18 | `th_018` | 68–72s | `bubbleLetters` |
| 19 | `th_019` | 72–76s | `confetti` |
| 20 | `th_020` | 76–80s | `dashedFrame` |
| 21 | `th_021` | 80–84s | `typewriterCursor` |

## 3. ジャンル (genre) (genre)

ジャンルから生成したプリセットです。ホラー・恋愛・失恋・パーティを見せます。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 22 | `th_022` | 84–88s | `horrorBlood` |
| 23 | `th_023` | 88–92s | `horrorRansom` |
| 24 | `th_024` | 92–96s | `horrorScratch` |
| 25 | `th_025` | 96–100s | `loveHeartbeat` |
| 26 | `th_026` | 100–104s | `loveHearts` |
| 27 | `th_027` | 104–108s | `heartbreakTears` |
| 28 | `th_028` | 108–112s | `partyConfetti` |

## 4. プロ (pro) (pro)

ステージング済みのプロ向けルックです。1ルック＝1キューで見せます。

| # | キュー | 時間 | 値 |
|---:|---|---|---|
| 29 | `th_029` | 112–116s | `movieTitle` |
| 30 | `th_030` | 116–120s | `trailerGlitch` |
| 31 | `th_031` | 120–124s | `lofiDream` |
| 32 | `th_032` | 124–128s | `synthwave` |
| 33 | `th_033` | 128–132s | `idolPop` |
| 34 | `th_034` | 132–136s | `documentary` |
| 35 | `th_035` | 136–140s | `cyberTunnel` |
| 36 | `th_036` | 140–144s | `winterBallad` |
| 37 | `th_037` | 144–148s | `festival` |
| 38 | `th_038` | 148–152s | `poster` |
| 39 | `th_039` | 152–156s | `neonPulse` |
| 40 | `th_040` | 156–160s | `inkPoem` |
| 41 | `th_041` | 160–164s | `epicWide` |
| 42 | `th_042` | 164–168s | `vhsRewind` |
| 43 | `th_043` | 168–172s | `springDance` |
| 44 | `th_044` | 172–176s | `deepSpace` |
| 45 | `th_045` | 176–180s | `trackingTitle` |
| 46 | `th_046` | 180–184s | `karaokeSweep` |
| 47 | `th_047` | 184–188s | `waveThrough` |
| 48 | `th_048` | 188–192s | `randomFlicker` |
| 49 | `th_049` | 192–196s | `beatStrike` |
| 50 | `th_050` | 196–200s | `impactBurst` |
| 51 | `th_051` | 200–204s | `frameDraw` |
| 52 | `th_052` | 204–208s | `bracketCallout` |
| 53 | `th_053` | 208–212s | `fallInOrder` |

