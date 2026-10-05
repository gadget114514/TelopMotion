# テキスト見本 (text showcase)

文字の塗り・縁取り・背景を 1 種類ずつ並べた見本プロジェクトです。1種類につき4キュー（単体・二重・横並列・縦並列）で、違うのは重ね・並べ方だけです。

- 塗り・縁取りは1種類＝4キュー（3 秒/キュー）、背景は1種類＝4キュー（4 秒/キュー）
- 二重は本体＋1コピー（`dx +0.035 / dy -0.035`）、横並列は3コピー（`dx -0.14 / 0 / +0.14`）、縦並列は3コピー（`dy -0.12 / 0 / +0.12`＋横の広がり）です
- 背景は `bg` トラックのクリップ（`none` はクリップなし）。塗り・縁取りはキューのスタイルです
- 開くには Studio の *Help → テキスト見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 塗り (fill) | 84 | 0–252s |
| 2 | 縁取り (edge) | 36 | 252–360s |
| 3 | 背景 (background) | 68 | 360–632s |
| | **合計** | **188** | **632s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run text-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/text-showcase.js list` | セクションとキューを一覧 |
| `node scripts/text-showcase.js list --section edge` | 1 セクションだけ表示 |
| `npm run text-showcase -- build --sections fill,edge` | セクションを絞って生成 |

## 1. 塗り (fill) (fill)

文字の塗り（fill）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。並列は同じ塗りのまま、違うのはコピーだけです。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 1 | `tx_001` | 0–3s | `solid/base` | 単体 |
| 2 | `tx_002` | 3–6s | `solid/double` | 二重 |
| 3 | `tx_003` | 6–9s | `solid/dx` | 横並列 |
| 4 | `tx_004` | 9–12s | `solid/dy` | 縦並列 |
| 5 | `tx_005` | 12–15s | `categoryColor/base` | 単体 |
| 6 | `tx_006` | 15–18s | `categoryColor/double` | 二重 |
| 7 | `tx_007` | 18–21s | `categoryColor/dx` | 横並列 |
| 8 | `tx_008` | 21–24s | `categoryColor/dy` | 縦並列 |
| 9 | `tx_009` | 24–27s | `gradientSweep/base` | 単体 |
| 10 | `tx_010` | 27–30s | `gradientSweep/double` | 二重 |
| 11 | `tx_011` | 30–33s | `gradientSweep/dx` | 横並列 |
| 12 | `tx_012` | 33–36s | `gradientSweep/dy` | 縦並列 |
| 13 | `tx_013` | 36–39s | `rainbowFlow/base` | 単体 |
| 14 | `tx_014` | 39–42s | `rainbowFlow/double` | 二重 |
| 15 | `tx_015` | 42–45s | `rainbowFlow/dx` | 横並列 |
| 16 | `tx_016` | 45–48s | `rainbowFlow/dy` | 縦並列 |
| 17 | `tx_017` | 48–51s | `holographic/base` | 単体 |
| 18 | `tx_018` | 51–54s | `holographic/double` | 二重 |
| 19 | `tx_019` | 54–57s | `holographic/dx` | 横並列 |
| 20 | `tx_020` | 57–60s | `holographic/dy` | 縦並列 |
| 21 | `tx_021` | 60–63s | `chrome/base` | 単体 |
| 22 | `tx_022` | 63–66s | `chrome/double` | 二重 |
| 23 | `tx_023` | 66–69s | `chrome/dx` | 横並列 |
| 24 | `tx_024` | 69–72s | `chrome/dy` | 縦並列 |
| 25 | `tx_025` | 72–75s | `goldFoil/base` | 単体 |
| 26 | `tx_026` | 75–78s | `goldFoil/double` | 二重 |
| 27 | `tx_027` | 78–81s | `goldFoil/dx` | 横並列 |
| 28 | `tx_028` | 81–84s | `goldFoil/dy` | 縦並列 |
| 29 | `tx_029` | 84–87s | `fire/base` | 単体 |
| 30 | `tx_030` | 87–90s | `fire/double` | 二重 |
| 31 | `tx_031` | 90–93s | `fire/dx` | 横並列 |
| 32 | `tx_032` | 93–96s | `fire/dy` | 縦並列 |
| 33 | `tx_033` | 96–99s | `caustics/base` | 単体 |
| 34 | `tx_034` | 99–102s | `caustics/double` | 二重 |
| 35 | `tx_035` | 102–105s | `caustics/dx` | 横並列 |
| 36 | `tx_036` | 105–108s | `caustics/dy` | 縦並列 |
| 37 | `tx_037` | 108–111s | `marble/base` | 単体 |
| 38 | `tx_038` | 111–114s | `marble/double` | 二重 |
| 39 | `tx_039` | 114–117s | `marble/dx` | 横並列 |
| 40 | `tx_040` | 117–120s | `marble/dy` | 縦並列 |
| 41 | `tx_041` | 120–123s | `glass/base` | 単体 |
| 42 | `tx_042` | 123–126s | `glass/double` | 二重 |
| 43 | `tx_043` | 126–129s | `glass/dx` | 横並列 |
| 44 | `tx_044` | 129–132s | `glass/dy` | 縦並列 |
| 45 | `tx_045` | 132–135s | `textureFill/base` | 単体 |
| 46 | `tx_046` | 135–138s | `textureFill/double` | 二重 |
| 47 | `tx_047` | 138–141s | `textureFill/dx` | 横並列 |
| 48 | `tx_048` | 141–144s | `textureFill/dy` | 縦並列 |
| 49 | `tx_049` | 144–147s | `karaokeWipe/base` | 単体 |
| 50 | `tx_050` | 147–150s | `karaokeWipe/double` | 二重 |
| 51 | `tx_051` | 150–153s | `karaokeWipe/dx` | 横並列 |
| 52 | `tx_052` | 153–156s | `karaokeWipe/dy` | 縦並列 |
| 53 | `tx_053` | 156–159s | `ink/base` | 単体 |
| 54 | `tx_054` | 159–162s | `ink/double` | 二重 |
| 55 | `tx_055` | 162–165s | `ink/dx` | 横並列 |
| 56 | `tx_056` | 165–168s | `ink/dy` | 縦並列 |
| 57 | `tx_057` | 168–171s | `stripes/base` | 単体 |
| 58 | `tx_058` | 171–174s | `stripes/double` | 二重 |
| 59 | `tx_059` | 174–177s | `stripes/dx` | 横並列 |
| 60 | `tx_060` | 177–180s | `stripes/dy` | 縦並列 |
| 61 | `tx_061` | 180–183s | `checker/base` | 単体 |
| 62 | `tx_062` | 183–186s | `checker/double` | 二重 |
| 63 | `tx_063` | 186–189s | `checker/dx` | 横並列 |
| 64 | `tx_064` | 189–192s | `checker/dy` | 縦並列 |
| 65 | `tx_065` | 192–195s | `diamondGrid/base` | 単体 |
| 66 | `tx_066` | 195–198s | `diamondGrid/double` | 二重 |
| 67 | `tx_067` | 198–201s | `diamondGrid/dx` | 横並列 |
| 68 | `tx_068` | 201–204s | `diamondGrid/dy` | 縦並列 |
| 69 | `tx_069` | 204–207s | `halftone/base` | 単体 |
| 70 | `tx_070` | 207–210s | `halftone/double` | 二重 |
| 71 | `tx_071` | 210–213s | `halftone/dx` | 横並列 |
| 72 | `tx_072` | 213–216s | `halftone/dy` | 縦並列 |
| 73 | `tx_073` | 216–219s | `hatch/base` | 単体 |
| 74 | `tx_074` | 219–222s | `hatch/double` | 二重 |
| 75 | `tx_075` | 222–225s | `hatch/dx` | 横並列 |
| 76 | `tx_076` | 225–228s | `hatch/dy` | 縦並列 |
| 77 | `tx_077` | 228–231s | `randomSpeckle/base` | 単体 |
| 78 | `tx_078` | 231–234s | `randomSpeckle/double` | 二重 |
| 79 | `tx_079` | 234–237s | `randomSpeckle/dx` | 横並列 |
| 80 | `tx_080` | 237–240s | `randomSpeckle/dy` | 縦並列 |
| 81 | `tx_081` | 240–243s | `splitTone/base` | 単体 |
| 82 | `tx_082` | 243–246s | `splitTone/double` | 二重 |
| 83 | `tx_083` | 246–249s | `splitTone/dx` | 横並列 |
| 84 | `tx_084` | 249–252s | `splitTone/dy` | 縦並列 |

## 2. 縁取り (edge) (edge)

文字の縁取り（edge）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。本体は同じ明るい単色に固定し、違うのは縁とコピーだけです。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 85 | `tx_085` | 252–255s | `outline/base` | 単体 |
| 86 | `tx_086` | 255–258s | `outline/double` | 二重 |
| 87 | `tx_087` | 258–261s | `outline/dx` | 横並列 |
| 88 | `tx_088` | 261–264s | `outline/dy` | 縦並列 |
| 89 | `tx_089` | 264–267s | `neonGlow/base` | 単体 |
| 90 | `tx_090` | 267–270s | `neonGlow/double` | 二重 |
| 91 | `tx_091` | 270–273s | `neonGlow/dx` | 横並列 |
| 92 | `tx_092` | 273–276s | `neonGlow/dy` | 縦並列 |
| 93 | `tx_093` | 276–279s | `innerGlow/base` | 単体 |
| 94 | `tx_094` | 279–282s | `innerGlow/double` | 二重 |
| 95 | `tx_095` | 282–285s | `innerGlow/dx` | 横並列 |
| 96 | `tx_096` | 285–288s | `innerGlow/dy` | 縦並列 |
| 97 | `tx_097` | 288–291s | `bevel/base` | 単体 |
| 98 | `tx_098` | 291–294s | `bevel/double` | 二重 |
| 99 | `tx_099` | 294–297s | `bevel/dx` | 横並列 |
| 100 | `tx_100` | 297–300s | `bevel/dy` | 縦並列 |
| 101 | `tx_101` | 300–303s | `extrude/base` | 単体 |
| 102 | `tx_102` | 303–306s | `extrude/double` | 二重 |
| 103 | `tx_103` | 306–309s | `extrude/dx` | 横並列 |
| 104 | `tx_104` | 309–312s | `extrude/dy` | 縦並列 |
| 105 | `tx_105` | 312–315s | `longShadow/base` | 単体 |
| 106 | `tx_106` | 315–318s | `longShadow/double` | 二重 |
| 107 | `tx_107` | 318–321s | `longShadow/dx` | 横並列 |
| 108 | `tx_108` | 321–324s | `longShadow/dy` | 縦並列 |
| 109 | `tx_109` | 324–327s | `dropShadow/base` | 単体 |
| 110 | `tx_110` | 327–330s | `dropShadow/double` | 二重 |
| 111 | `tx_111` | 330–333s | `dropShadow/dx` | 横並列 |
| 112 | `tx_112` | 333–336s | `dropShadow/dy` | 縦並列 |
| 113 | `tx_113` | 336–339s | `drip/base` | 単体 |
| 114 | `tx_114` | 339–342s | `drip/double` | 二重 |
| 115 | `tx_115` | 342–345s | `drip/dx` | 横並列 |
| 116 | `tx_116` | 345–348s | `drip/dy` | 縦並列 |
| 117 | `tx_117` | 348–351s | `multiLine/base` | 単体 |
| 118 | `tx_118` | 351–354s | `multiLine/double` | 二重 |
| 119 | `tx_119` | 354–357s | `multiLine/dx` | 横並列 |
| 120 | `tx_120` | 357–360s | `multiLine/dy` | 縦並列 |

## 3. 背景 (background) (background)

文字の後ろの背景（background）を1種類ずつ。単体・二重・横並列・縦並列の4キューで見せます。背景は `bg` トラックのクリップ、並列はキューのクローンです。`none` はクリップなし（素の画面）です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 121 | `tx_121` | 360–364s | `none/base` | 単体 |
| 122 | `tx_122` | 364–368s | `none/double` | 二重 |
| 123 | `tx_123` | 368–372s | `none/dx` | 横並列 |
| 124 | `tx_124` | 372–376s | `none/dy` | 縦並列 |
| 125 | `tx_125` | 376–380s | `solid/base` | 単体 |
| 126 | `tx_126` | 380–384s | `solid/double` | 二重 |
| 127 | `tx_127` | 384–388s | `solid/dx` | 横並列 |
| 128 | `tx_128` | 388–392s | `solid/dy` | 縦並列 |
| 129 | `tx_129` | 392–396s | `plain/base` | 単体 |
| 130 | `tx_130` | 396–400s | `plain/double` | 二重 |
| 131 | `tx_131` | 400–404s | `plain/dx` | 横並列 |
| 132 | `tx_132` | 404–408s | `plain/dy` | 縦並列 |
| 133 | `tx_133` | 408–412s | `gradient/base` | 単体 |
| 134 | `tx_134` | 412–416s | `gradient/double` | 二重 |
| 135 | `tx_135` | 416–420s | `gradient/dx` | 横並列 |
| 136 | `tx_136` | 420–424s | `gradient/dy` | 縦並列 |
| 137 | `tx_137` | 424–428s | `noiseGradient/base` | 単体 |
| 138 | `tx_138` | 428–432s | `noiseGradient/double` | 二重 |
| 139 | `tx_139` | 432–436s | `noiseGradient/dx` | 横並列 |
| 140 | `tx_140` | 436–440s | `noiseGradient/dy` | 縦並列 |
| 141 | `tx_141` | 440–444s | `card/base` | 単体 |
| 142 | `tx_142` | 444–448s | `card/double` | 二重 |
| 143 | `tx_143` | 448–452s | `card/dx` | 横並列 |
| 144 | `tx_144` | 452–456s | `card/dy` | 縦並列 |
| 145 | `tx_145` | 456–460s | `cover/base` | 単体 |
| 146 | `tx_146` | 460–464s | `cover/double` | 二重 |
| 147 | `tx_147` | 464–468s | `cover/dx` | 横並列 |
| 148 | `tx_148` | 468–472s | `cover/dy` | 縦並列 |
| 149 | `tx_149` | 472–476s | `image/base` | 単体 |
| 150 | `tx_150` | 476–480s | `image/double` | 二重 |
| 151 | `tx_151` | 480–484s | `image/dx` | 横並列 |
| 152 | `tx_152` | 484–488s | `image/dy` | 縦並列 |
| 153 | `tx_153` | 488–492s | `pattern/base` | 単体 |
| 154 | `tx_154` | 492–496s | `pattern/double` | 二重 |
| 155 | `tx_155` | 496–500s | `pattern/dx` | 横並列 |
| 156 | `tx_156` | 500–504s | `pattern/dy` | 縦並列 |
| 157 | `tx_157` | 504–508s | `shapes/base` | 単体 |
| 158 | `tx_158` | 508–512s | `shapes/double` | 二重 |
| 159 | `tx_159` | 512–516s | `shapes/dx` | 横並列 |
| 160 | `tx_160` | 516–520s | `shapes/dy` | 縦並列 |
| 161 | `tx_161` | 520–524s | `fractalNoise/base` | 単体 |
| 162 | `tx_162` | 524–528s | `fractalNoise/double` | 二重 |
| 163 | `tx_163` | 528–532s | `fractalNoise/dx` | 横並列 |
| 164 | `tx_164` | 532–536s | `fractalNoise/dy` | 縦並列 |
| 165 | `tx_165` | 536–540s | `rays/base` | 単体 |
| 166 | `tx_166` | 540–544s | `rays/double` | 二重 |
| 167 | `tx_167` | 544–548s | `rays/dx` | 横並列 |
| 168 | `tx_168` | 548–552s | `rays/dy` | 縦並列 |
| 169 | `tx_169` | 552–556s | `gradient4/base` | 単体 |
| 170 | `tx_170` | 556–560s | `gradient4/double` | 二重 |
| 171 | `tx_171` | 560–564s | `gradient4/dx` | 横並列 |
| 172 | `tx_172` | 564–568s | `gradient4/dy` | 縦並列 |
| 173 | `tx_173` | 568–572s | `cellPattern/base` | 単体 |
| 174 | `tx_174` | 572–576s | `cellPattern/double` | 二重 |
| 175 | `tx_175` | 576–580s | `cellPattern/dx` | 横並列 |
| 176 | `tx_176` | 580–584s | `cellPattern/dy` | 縦並列 |
| 177 | `tx_177` | 584–588s | `particleField/base` | 単体 |
| 178 | `tx_178` | 588–592s | `particleField/double` | 二重 |
| 179 | `tx_179` | 592–596s | `particleField/dx` | 横並列 |
| 180 | `tx_180` | 596–600s | `particleField/dy` | 縦並列 |
| 181 | `tx_181` | 600–604s | `perspectiveGrid/base` | 単体 |
| 182 | `tx_182` | 604–608s | `perspectiveGrid/double` | 二重 |
| 183 | `tx_183` | 608–612s | `perspectiveGrid/dx` | 横並列 |
| 184 | `tx_184` | 612–616s | `perspectiveGrid/dy` | 縦並列 |
| 185 | `tx_185` | 616–620s | `tunnel/base` | 単体 |
| 186 | `tx_186` | 620–624s | `tunnel/double` | 二重 |
| 187 | `tx_187` | 624–628s | `tunnel/dx` | 横並列 |
| 188 | `tx_188` | 628–632s | `tunnel/dy` | 縦並列 |

