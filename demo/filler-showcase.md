# フィラー見本 (filler showcase)

フィラープリセット（`mid` トラック）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文を表示し、違うのはフィラーだけです。

- 1プリセット＝1キュー（3 秒/キュー）、グループごとに見出しを付けています
- フィラーは後景トラック（`mid`）のクリップです。キューは中央のサンプル文だけを持ちます
- 開くには Studio の *Help → フィラー見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | パターン (pattern) | 26 | 0–78s |
| 2 | 分割面 (split) | 16 | 78–126s |
| 3 | 図形 (shapes) | 12 | 126–162s |
| 4 | パーティクル (particles) | 8 | 162–186s |
| 5 | オーディオ (audio) | 9 | 186–213s |
| 6 | フィギュア (figures) | 29 | 213–300s |
| 7 | テキスト (text) | 10 | 300–330s |
| 8 | タイマー (timer) | 6 | 330–348s |
| 9 | コンボ (combo) | 15 | 348–393s |
| | **合計** | **131** | **393s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run filler-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/filler-showcase.js list` | セクションとキューを一覧 |
| `node scripts/filler-showcase.js list --section split` | 1 セクションだけ表示 |
| `npm run filler-showcase -- build --sections pattern,split` | セクションを絞って生成 |

## 1. パターン (pattern) (pattern)

模様レイヤーだけを出しています。1モードにつき2構成（静か・大胆）を見せます。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 1 | `fl_001` | 0–3s | `pattern-grid-calm` | pattern |
| 2 | `fl_002` | 3–6s | `pattern-grid-bold` | pattern |
| 3 | `fl_003` | 6–9s | `pattern-dots-calm` | pattern |
| 4 | `fl_004` | 9–12s | `pattern-dots-bold` | pattern |
| 5 | `fl_005` | 12–15s | `pattern-stripes-calm` | pattern |
| 6 | `fl_006` | 15–18s | `pattern-stripes-bold` | pattern |
| 7 | `fl_007` | 18–21s | `pattern-rings-calm` | pattern |
| 8 | `fl_008` | 21–24s | `pattern-rings-bold` | pattern |
| 9 | `fl_009` | 24–27s | `pattern-triangles-calm` | pattern |
| 10 | `fl_010` | 27–30s | `pattern-triangles-bold` | pattern |
| 11 | `fl_011` | 30–33s | `pattern-diamonds-calm` | pattern |
| 12 | `fl_012` | 33–36s | `pattern-diamonds-bold` | pattern |
| 13 | `fl_013` | 36–39s | `pattern-hexes-calm` | pattern |
| 14 | `fl_014` | 39–42s | `pattern-hexes-bold` | pattern |
| 15 | `fl_015` | 42–45s | `pattern-rain-calm` | pattern |
| 16 | `fl_016` | 45–48s | `pattern-rain-bold` | pattern |
| 17 | `fl_017` | 48–51s | `pattern-checks-calm` | pattern |
| 18 | `fl_018` | 51–54s | `pattern-checks-bold` | pattern |
| 19 | `fl_019` | 54–57s | `pattern-polka-calm` | pattern |
| 20 | `fl_020` | 57–60s | `pattern-polka-bold` | pattern |
| 21 | `fl_021` | 60–63s | `pattern-sinecurve-calm` | pattern |
| 22 | `fl_022` | 63–66s | `pattern-sinecurve-bold` | pattern |
| 23 | `fl_023` | 66–69s | `pattern-waves-calm` | pattern |
| 24 | `fl_024` | 69–72s | `pattern-waves-bold` | pattern |
| 25 | `fl_025` | 72–75s | `pattern-randomfill-calm` | pattern |
| 26 | `fl_026` | 75–78s | `pattern-randomfill-bold` | pattern |

## 2. 分割面 (split) (split)

色の分割面だけを出しています。動きの違いを見せます。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 27 | `fl_027` | 78–81s | `split-halves-slide` | split |
| 28 | `fl_028` | 81–84s | `split-diagonal-still` | split |
| 29 | `fl_029` | 84–87s | `split-diagonal-swap` | split |
| 30 | `fl_030` | 87–90s | `split-thirds-still` | split |
| 31 | `fl_031` | 90–93s | `split-thirds-slide` | split |
| 32 | `fl_032` | 93–96s | `split-bands-drift` | split |
| 33 | `fl_033` | 96–99s | `split-quads-rotate` | split |
| 34 | `fl_034` | 99–102s | `split-grid-breathe` | split |
| 35 | `fl_035` | 102–105s | `split-chevron-still` | split |
| 36 | `fl_036` | 105–108s | `split-chevron-swap` | split |
| 37 | `fl_037` | 108–111s | `split-radial-still` | split |
| 38 | `fl_038` | 111–114s | `split-radial-rotate` | split |
| 39 | `fl_039` | 114–117s | `split-mondrian-drift` | split |
| 40 | `fl_040` | 117–120s | `split-frame-still` | split |
| 41 | `fl_041` | 120–123s | `split-frame-breathe` | split |
| 42 | `fl_042` | 123–126s | `split-shards-swap` | split |

## 3. 図形 (shapes) (shapes)

図形レイヤーだけを出しています。1セットにつき2構成（少数・多数）を見せます。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 43 | `fl_043` | 126–129s | `shapes-circles-few` | shapes |
| 44 | `fl_044` | 129–132s | `shapes-circles-many` | shapes |
| 45 | `fl_045` | 132–135s | `shapes-polygons-few` | shapes |
| 46 | `fl_046` | 135–138s | `shapes-polygons-many` | shapes |
| 47 | `fl_047` | 138–141s | `shapes-lines-few` | shapes |
| 48 | `fl_048` | 141–144s | `shapes-lines-many` | shapes |
| 49 | `fl_049` | 144–147s | `shapes-burst-few` | shapes |
| 50 | `fl_050` | 147–150s | `shapes-burst-many` | shapes |
| 51 | `fl_051` | 150–153s | `shapes-grid-few` | shapes |
| 52 | `fl_052` | 153–156s | `shapes-grid-many` | shapes |
| 53 | `fl_053` | 156–159s | `shapes-orbit-few` | shapes |
| 54 | `fl_054` | 159–162s | `shapes-orbit-many` | shapes |

## 4. パーティクル (particles) (particles)

パーティクルだけを出しています。1流れにつき2構成（細か・やわらか）を見せます。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 55 | `fl_055` | 162–165s | `particles-rise-fine` | particles |
| 56 | `fl_056` | 165–168s | `particles-rise-soft` | particles |
| 57 | `fl_057` | 168–171s | `particles-fall-fine` | particles |
| 58 | `fl_058` | 171–174s | `particles-fall-soft` | particles |
| 59 | `fl_059` | 174–177s | `particles-drift-fine` | particles |
| 60 | `fl_060` | 177–180s | `particles-drift-soft` | particles |
| 61 | `fl_061` | 180–183s | `particles-vortex-fine` | particles |
| 62 | `fl_062` | 183–186s | `particles-vortex-soft` | particles |

## 5. オーディオ (audio) (audio)

音声連動（波形・スペクトラム・サイン波）だけを出しています。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 63 | `fl_063` | 186–189s | `audio-wave-line` | waveform |
| 64 | `fl_064` | 189–192s | `audio-wave-mirror` | waveform |
| 65 | `fl_065` | 192–195s | `audio-wave-circle` | waveform |
| 66 | `fl_066` | 195–198s | `audio-spectrum-bars` | spectrum |
| 67 | `fl_067` | 198–201s | `audio-spectrum-radial` | spectrum |
| 68 | `fl_068` | 201–204s | `audio-spectrum-blob` | spectrum |
| 69 | `fl_069` | 204–207s | `audio-sine-1` | sineWave |
| 70 | `fl_070` | 207–210s | `audio-sine-3` | sineWave |
| 71 | `fl_071` | 210–213s | `audio-sine-5` | sineWave |

## 6. フィギュア (figures) (figures)

フィギュア（図形アニメーション）だけを出しています。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 72 | `fl_072` | 213–216s | `figures-orbit` | figures |
| 73 | `fl_073` | 216–219s | `figures-burst` | figures |
| 74 | `fl_074` | 219–222s | `figures-bars` | figures |
| 75 | `fl_075` | 222–225s | `figures-rings` | figures |
| 76 | `fl_076` | 225–228s | `figures-confetti` | figures |
| 77 | `fl_077` | 228–231s | `figures-frame` | figures |
| 78 | `fl_078` | 231–234s | `figures-underlinesweep` | figures |
| 79 | `fl_079` | 234–237s | `figures-bracketspop` | figures |
| 80 | `fl_080` | 237–240s | `figures-polymorph` | figures |
| 81 | `fl_081` | 240–243s | `figures-ribbon` | figures |
| 82 | `fl_082` | 243–246s | `figures-ticker` | figures |
| 83 | `fl_083` | 246–249s | `figures-halftone` | figures |
| 84 | `fl_084` | 249–252s | `figures-cracks` | figures |
| 85 | `fl_085` | 252–255s | `figures-spikes` | figures |
| 86 | `fl_086` | 255–258s | `figures-eyes` | figures |
| 87 | `fl_087` | 258–261s | `figures-scratches` | figures |
| 88 | `fl_088` | 261–264s | `figures-drips` | figures |
| 89 | `fl_089` | 264–267s | `figures-lattice` | figures |
| 90 | `fl_090` | 267–270s | `figures-waves` | figures |
| 91 | `fl_091` | 270–273s | `figures-comets` | figures |
| 92 | `fl_092` | 273–276s | `figures-proc` | figures |
| 93 | `fl_093` | 276–279s | `figures-orbit-spin` | figures |
| 94 | `fl_094` | 279–282s | `figures-burst-pop-burstout` | figures |
| 95 | `fl_095` | 282–285s | `figures-rings-pulse` | figures |
| 96 | `fl_096` | 285–288s | `figures-ribbon-draw-fade` | figures |
| 97 | `fl_097` | 288–291s | `figures-frame-wipe` | figures |
| 98 | `fl_098` | 291–294s | `figures-confetti-scatter` | figures |
| 99 | `fl_099` | 294–297s | `figures-polymorph-morph` | figures |
| 100 | `fl_100` | 297–300s | `figures-halftone-drift` | figures |

## 7. テキスト (text) (text)

テキストアニメだけを出しています。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 101 | `fl_101` | 300–303s | `text-title` | textAnim |
| 102 | `fl_102` | 303–306s | `text-artist` | textAnim |
| 103 | `fl_103` | 306–309s | `text-next` | textAnim |
| 104 | `fl_104` | 309–312s | `text-note` | textAnim |
| 105 | `fl_105` | 312–315s | `text-title-artist` | textAnim |
| 106 | `fl_106` | 315–318s | `text-intro` | textAnim |
| 107 | `fl_107` | 318–321s | `text-interlude` | textAnim |
| 108 | `fl_108` | 321–324s | `text-outro` | textAnim |
| 109 | `fl_109` | 324–327s | `text-prev` | textAnim |
| 110 | `fl_110` | 327–330s | `text-thanks` | textAnim |

## 8. タイマー (timer) (timer)

カウントダウン・プログレスだけを出しています。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 111 | `fl_111` | 330–333s | `timer-countdown-digits` | countdown |
| 112 | `fl_112` | 333–336s | `timer-countdown-ring` | countdown |
| 113 | `fl_113` | 336–339s | `timer-countdown-bar` | countdown |
| 114 | `fl_114` | 339–342s | `timer-countdown-dots` | countdown |
| 115 | `fl_115` | 342–345s | `timer-progress-bar` | progress |
| 116 | `fl_116` | 345–348s | `timer-progress-ring` | progress |

## 9. コンボ (combo) (combo)

複数レイヤーの組み合わせを出しています。

| # | キュー | 時間 | 値 | 仕様 |
|---:|---|---|---|---|
| 117 | `fl_117` | 348–351s | `combo-dots-calm-orbit` | combo |
| 118 | `fl_118` | 351–354s | `combo-diagonal-still-title` | combo |
| 119 | `fl_119` | 354–357s | `combo-rise-fine-countdown-ring` | combo |
| 120 | `fl_120` | 357–360s | `combo-spectrum-radial-artist` | combo |
| 121 | `fl_121` | 360–363s | `combo-rain-bold-ticker` | combo |
| 122 | `fl_122` | 363–366s | `combo-frame-still-bracketspop-next` | combo |
| 123 | `fl_123` | 366–369s | `combo-stripes-bold-burst` | combo |
| 124 | `fl_124` | 369–372s | `combo-waves-calm-rings` | combo |
| 125 | `fl_125` | 372–375s | `combo-grid-calm-halftone` | combo |
| 126 | `fl_126` | 375–378s | `combo-vortex-soft-polymorph` | combo |
| 127 | `fl_127` | 378–381s | `combo-sine-3-rings-pulse` | combo |
| 128 | `fl_128` | 381–384s | `combo-diamonds-bold-confetti` | combo |
| 129 | `fl_129` | 384–387s | `combo-checks-calm-underlinesweep` | combo |
| 130 | `fl_130` | 387–390s | `combo-spectrum-blob-bars` | combo |
| 131 | `fl_131` | 390–393s | `combo-orbit-many-progress-bar` | combo |

