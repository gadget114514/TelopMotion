# モーション見本 (motion showcase)

モーションギャラリーのプリセットを1キューずつ並べた見本です。各キューは同じサンプル文に1モーションだけを載せています（`cueStyles.motions`）。443件を16ファイルに分け、1ファイルが約80秒です。

- 1モーション = 1キュー（3秒）、1ファイル = 27〜28キュー
- cue名末尾の `[key:value …]` は設定値（デフォルト以外）。タイピング系5件は base enter の typewriter＋stagger、バックスペースは base exit の typewriterReverse＋stagger で順次動作を見せている
- 開くには Studio の *Help → モーション見本 → Motion 01/16 … 16/16*、または *File → Open project…* を使います
- すべて通しで見るには *Help → モーション見本 → すべて連続再生* を使います（中断可）

| # | ファイル | キュー数 | 時間 | 内容 |
|---:|---|---:|---|---|
| 01 | `motion-showcase-01.json` | 28 | 0–84s | enter entrance … enter タイピング |
| 02 | `motion-showcase-02.json` | 28 | 0–84s | enter タイピング … enter 出現 |
| 03 | `motion-showcase-03.json` | 28 | 0–84s | enter 出現 … hold 3D |
| 04 | `motion-showcase-04.json` | 28 | 0–84s | hold 3D … hold イージング |
| 05 | `motion-showcase-05.json` | 28 | 0–84s | hold イージング … hold マスク |
| 06 | `motion-showcase-06.json` | 28 | 0–84s | hold マスク … hold 基本技法 |
| 07 | `motion-showcase-07.json` | 28 | 0–84s | hold 基本技法 … hold 常時動作 |
| 08 | `motion-showcase-08.json` | 28 | 0–84s | hold 常時動作 … hold 強調 |
| 09 | `motion-showcase-09.json` | 28 | 0–84s | hold 強調 … hold 文字単位 |
| 10 | `motion-showcase-10.json` | 28 | 0–84s | hold 文字単位 … hold 歌詞動画 |
| 11 | `motion-showcase-11.json` | 28 | 0–84s | hold 歌詞動画 … hold 物理 |
| 12 | `motion-showcase-12.json` | 27 | 0–81s | hold 物理 … hold 質感 |
| 13 | `motion-showcase-13.json` | 27 | 0–81s | hold 質感 … hold 質感 |
| 14 | `motion-showcase-14.json` | 27 | 0–81s | hold 質感 … hold 質感 |
| 15 | `motion-showcase-15.json` | 27 | 0–81s | hold 質感 … exit exit |
| 16 | `motion-showcase-16.json` | 27 | 0–81s | exit exit … exit 破壊 |
| | **合計** | **443** | | |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run motion-showcase -- build` | 16ファイルとこの一覧を再生成 |
| `node scripts/motion-showcase.js list` | パートと件数を一覧 |
| `npm run motion-showcase -- build --parts 01,02` | パートを絞って生成 |

## Motion 01/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 1 | `mo01_01` | `anticipationIn` | enter | entrance | `anticipation` |
| 2 | `mo01_02` | `blurIn` | enter | entrance | `blurIn` |
| 3 | `mo01_03` | `bounceIn` | enter | entrance | `dropBounce` |
| 4 | `mo01_04` | `boxDrawIn` | enter | entrance | `boxDrawOn` |
| 5 | `mo01_05` | `bulletHolesIn` | enter | entrance | `bulletHoles` |
| 6 | `mo01_06` | `checkerboardIn` | enter | entrance | `checkerboard` |
| 7 | `mo01_07` | `circleDrawIn` | enter | entrance | `circleDrawOn` |
| 8 | `mo01_08` | `ditherIn` | enter | entrance | `dither` |
| 9 | `mo01_09` | `doubleBounceIn` | enter | entrance | `doubleBounce` |
| 10 | `mo01_10` | `fadeGlow` | enter | entrance | `fade` |
| 11 | `mo01_11` | `fadeIn` | enter | entrance | `fade` |
| 12 | `mo01_12` | `flipIn` | enter | entrance | `flip3D` |
| 13 | `mo01_13` | `floatIn` | enter | entrance | `slide` |
| 14 | `mo01_14` | `flyIn` | enter | entrance | `slide` |
| 15 | `mo01_15` | `geometryIn` | enter | entrance | `geometry` |
| 16 | `mo01_16` | `glitchIn` | enter | entrance | `glitchIn` |
| 17 | `mo01_17` | `growTurn` | enter | entrance | `rotateIn` |
| 18 | `mo01_18` | `irisIn` | enter | entrance | `irisOpen` |
| 19 | `mo01_19` | `lineDrawIn` | enter | entrance | `lineDrawOn` |
| 20 | `mo01_20` | `pageCurlIn` | enter | entrance | `pageCurl` |
| 21 | `mo01_21` | `particlesOnTextIn` | enter | entrance | `particlesOnText` |
| 22 | `mo01_22` | `popIn` | enter | entrance | `elasticPop` |
| 23 | `mo01_23` | `scanIn` | enter | entrance | `scanline` |
| 24 | `mo01_24` | `stealthIn` | enter | entrance | `stealth` |
| 25 | `mo01_25` | `typewriter` | enter | entrance | `typewriter` |
| 26 | `mo01_26` | `waveIn` | enter | entrance | `waveRise` |
| 27 | `mo01_27` | `zoomIn` | enter | entrance | `zoomIn` |
| 28 | `mo01_28` | `te_100` | enter | タイピング | `typewriter` |

## Motion 02/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 29 | `mo02_01` | `te_101` | enter | タイピング | `typewriter` |
| 30 | `mo02_02` | `te_102` | enter | タイピング | `typewriter` |
| 31 | `mo02_03` | `te_104` | enter | タイピング | `typewriter` |
| 32 | `mo02_04` | `te_1` | enter | 出現 | `fade` |
| 33 | `mo02_05` | `te_10` | enter | 出現 | `zoomIn` |
| 34 | `mo02_06` | `te_11` | enter | 出現 | `zoomIn` |
| 35 | `mo02_07` | `te_121` | enter | 出現 | `zoomIn` |
| 36 | `mo02_08` | `te_122` | enter | 出現 | `zoomIn` |
| 37 | `mo02_09` | `te_13` | enter | 出現 | `slide` |
| 38 | `mo02_10` | `te_15` | enter | 出現 | `wipe` |
| 39 | `mo02_11` | `te_158` | enter | 出現 | `box` |
| 40 | `mo02_12` | `te_159` | enter | 出現 | `slide` |
| 41 | `mo02_13` | `te_17` | enter | 出現 | `maskReveal` |
| 42 | `mo02_14` | `te_18` | enter | 出現 | `blind` |
| 43 | `mo02_15` | `te_19` | enter | 出現 | `split` |
| 44 | `mo02_16` | `te_20` | enter | 出現 | `circleIn` |
| 45 | `mo02_17` | `te_22` | enter | 出現 | `blurIn` |
| 46 | `mo02_18` | `te_24` | enter | 出現 | `depthBlurIn` |
| 47 | `mo02_19` | `te_26` | enter | 出現 | `dropBounce` |
| 48 | `mo02_20` | `te_260` | enter | 出現 | `maskReveal` |
| 49 | `mo02_21` | `te_271` | enter | 出現 | `strokeDrawOn` |
| 50 | `mo02_22` | `te_272` | enter | 出現 | `stretch` |
| 51 | `mo02_23` | `te_273` | enter | 出現 | `box` |
| 52 | `mo02_24` | `te_28` | enter | 出現 | `riseUp` |
| 53 | `mo02_25` | `te_280` | enter | 出現 | `zoomIn` |
| 54 | `mo02_26` | `te_282` | enter | 出現 | `fade` |
| 55 | `mo02_27` | `te_29` | enter | 出現 | `slide` |
| 56 | `mo02_28` | `te_30` | enter | 出現 | `slide` |

## Motion 03/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 57 | `mo03_01` | `te_309` | enter | 出現 | `dropBounce` |
| 58 | `mo03_02` | `te_31` | enter | 出現 | `flip3D` |
| 59 | `mo03_03` | `te_310` | enter | 出現 | `dropBounce` |
| 60 | `mo03_04` | `te_33` | enter | 出現 | `rotateIn` |
| 61 | `mo03_05` | `te_35` | enter | 出現 | `rotateIn` |
| 62 | `mo03_06` | `te_365` | enter | 出現 | `noiseDissolveIn` |
| 63 | `mo03_07` | `te_37` | enter | 出現 | `rotateIn` |
| 64 | `mo03_08` | `te_38` | enter | 出現 | `rotateIn` |
| 65 | `mo03_09` | `te_4` | enter | 出現 | `elasticPop` |
| 66 | `mo03_10` | `te_40` | enter | 出現 | `blind` |
| 67 | `mo03_11` | `te_42` | enter | 出現 | `stretch` |
| 68 | `mo03_12` | `te_43` | enter | 出現 | `scatterIn` |
| 69 | `mo03_13` | `te_44` | enter | 出現 | `scatterIn` |
| 70 | `mo03_14` | `te_47` | enter | 出現 | `neonFlicker` |
| 71 | `mo03_15` | `te_48` | enter | 出現 | `flickerIn` |
| 72 | `mo03_16` | `te_6` | enter | 出現 | `dropBounce` |
| 73 | `mo03_17` | `te_9` | enter | 出現 | `zoomIn` |
| 74 | `mo03_18` | `te_127` | hold | 3D | `orbit3D` |
| 75 | `mo03_19` | `te_128` | hold | 3D | `orbit3D` |
| 76 | `mo03_20` | `te_129` | hold | 3D | `orbit3D` |
| 77 | `mo03_21` | `te_130` | hold | 3D | `orbit3D` |
| 78 | `mo03_22` | `te_131` | hold | 3D | `orbit3D` |
| 79 | `mo03_23` | `te_132` | hold | 3D | `kenBurns` |
| 80 | `mo03_24` | `te_133` | hold | 3D | `kenBurns` |
| 81 | `mo03_25` | `te_135` | hold | 3D | `sway` |
| 82 | `mo03_26` | `te_136` | hold | 3D | `drift` |
| 83 | `mo03_27` | `te_137` | hold | 3D | `drift` |
| 84 | `mo03_28` | `te_210` | hold | 3D | `opacityPulse` |

## Motion 04/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 85 | `mo04_01` | `te_274` | hold | 3D | `orbit3D` |
| 86 | `mo04_02` | `bob` | hold | emphasis | `floatBob` |
| 87 | `mo04_03` | `breathe` | hold | emphasis | `breathing` |
| 88 | `mo04_04` | `ditherLoop` | hold | emphasis | `dither` |
| 89 | `mo04_05` | `drift` | hold | emphasis | `drift` |
| 90 | `mo04_06` | `fadeBreathe` | hold | emphasis | `fade` |
| 91 | `mo04_07` | `geometryLoop` | hold | emphasis | `geometry` |
| 92 | `mo04_08` | `growShrink` | hold | emphasis | `pulse` |
| 93 | `mo04_09` | `jelly` | hold | emphasis | `jelly` |
| 94 | `mo04_10` | `nudgeLoop` | hold | emphasis | `nudgeImpulse` |
| 95 | `mo04_11` | `opacityPulse` | hold | emphasis | `opacityPulse` |
| 96 | `mo04_12` | `pendulumLoop` | hold | emphasis | `pendulumSwing` |
| 97 | `mo04_13` | `pulse` | hold | emphasis | `pulse` |
| 98 | `mo04_14` | `scanLoop` | hold | emphasis | `scanline` |
| 99 | `mo04_15` | `shake` | hold | emphasis | `jitter` |
| 100 | `mo04_16` | `stealthLoop` | hold | emphasis | `stealth` |
| 101 | `mo04_17` | `sway` | hold | emphasis | `sway` |
| 102 | `mo04_18` | `twist` | hold | emphasis | `twist` |
| 103 | `mo04_19` | `wave` | hold | emphasis | `sineWave` |
| 104 | `mo04_20` | `te_283` | hold | イージング | `jelly` |
| 105 | `mo04_21` | `te_284` | hold | イージング | `breathing` |
| 106 | `mo04_22` | `te_285` | hold | イージング | `breathing` |
| 107 | `mo04_23` | `te_286` | hold | イージング | `breathing` |
| 108 | `mo04_24` | `te_287` | hold | イージング | `jelly` |
| 109 | `mo04_25` | `te_288` | hold | イージング | `jelly` |
| 110 | `mo04_26` | `te_289` | hold | イージング | `drift` |
| 111 | `mo04_27` | `te_290` | hold | イージング | `drift` |
| 112 | `mo04_28` | `te_291` | hold | イージング | `sineWave` |

## Motion 05/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 113 | `mo05_01` | `te_8` | hold | イージング | `jelly` |
| 114 | `mo05_02` | `te_234` | hold | カラオケ | `pulse` |
| 115 | `mo05_03` | `te_235` | hold | カラオケ | `pulse` |
| 116 | `mo05_04` | `te_236` | hold | カラオケ | `pulse` |
| 117 | `mo05_05` | `te_237` | hold | カラオケ | `opacityPulse` |
| 118 | `mo05_06` | `te_238` | hold | カラオケ | `jelly` |
| 119 | `mo05_07` | `te_239` | hold | カラオケ | `pulse` |
| 120 | `mo05_08` | `te_240` | hold | カラオケ | `breathing` |
| 121 | `mo05_09` | `te_241` | hold | カラオケ | `opacityPulse` |
| 122 | `mo05_10` | `te_189` | hold | グリッチ・ノイズ | `shiver` |
| 123 | `mo05_11` | `te_190` | hold | グリッチ・ノイズ | `jitter` |
| 124 | `mo05_12` | `te_191` | hold | グリッチ・ノイズ | `jitter` |
| 125 | `mo05_13` | `te_192` | hold | グリッチ・ノイズ | `jitter` |
| 126 | `mo05_14` | `te_193` | hold | グリッチ・ノイズ | `jitter` |
| 127 | `mo05_15` | `te_194` | hold | グリッチ・ノイズ | `shiver` |
| 128 | `mo05_16` | `te_195` | hold | グリッチ・ノイズ | `jitter` |
| 129 | `mo05_17` | `te_196` | hold | グリッチ・ノイズ | `jitter` |
| 130 | `mo05_18` | `te_197` | hold | グリッチ・ノイズ | `wobbleWarp` |
| 131 | `mo05_19` | `te_198` | hold | グリッチ・ノイズ | `jitter` |
| 132 | `mo05_20` | `te_165` | hold | パーティクル | `drift` |
| 133 | `mo05_21` | `te_166` | hold | パーティクル | `shiver` |
| 134 | `mo05_22` | `te_167` | hold | パーティクル | `pulse` |
| 135 | `mo05_23` | `te_168` | hold | パーティクル | `dissolve` |
| 136 | `mo05_24` | `te_169` | hold | パーティクル | `dissolve` |
| 137 | `mo05_25` | `te_170` | hold | パーティクル | `dissolve` |
| 138 | `mo05_26` | `te_176` | hold | パーティクル | `drift` |
| 139 | `mo05_27` | `te_177` | hold | パーティクル | `drift` |
| 140 | `mo05_28` | `te_261` | hold | マスク | `marquee` |

## Motion 06/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 141 | `mo06_01` | `te_262` | hold | マスク | `opacityPulse` |
| 142 | `mo06_02` | `te_263` | hold | マスク | `drift` |
| 143 | `mo06_03` | `te_264` | hold | マスク | `breathing` |
| 144 | `mo06_04` | `te_265` | hold | マスク | `opacityPulse` |
| 145 | `mo06_05` | `te_275` | hold | 切り替え | `sway` |
| 146 | `mo06_06` | `te_276` | hold | 切り替え | `sway` |
| 147 | `mo06_07` | `te_277` | hold | 切り替え | `sway` |
| 148 | `mo06_08` | `te_278` | hold | 切り替え | `orbit3D` |
| 149 | `mo06_09` | `te_279` | hold | 切り替え | `drift` |
| 150 | `mo06_10` | `te_3` | hold | 切り替え | `opacityPulse` |
| 151 | `mo06_11` | `te_39` | hold | 切り替え | `drift` |
| 152 | `mo06_12` | `te_46` | hold | 切り替え | `dissolve` |
| 153 | `mo06_13` | `te_90` | hold | 切り替え | `floatBob` |
| 154 | `mo06_14` | `te_91` | hold | 切り替え | `orbit3D` |
| 155 | `mo06_15` | `te_92` | hold | 切り替え | `floatBob` |
| 156 | `mo06_16` | `te_93` | hold | 切り替え | `opacityPulse` |
| 157 | `mo06_17` | `te_114` | hold | 単語・行単位 | `opacityPulse` |
| 158 | `mo06_18` | `te_115` | hold | 単語・行単位 | `opacityPulse` |
| 159 | `mo06_19` | `te_116` | hold | 単語・行単位 | `drift` |
| 160 | `mo06_20` | `te_117` | hold | 単語・行単位 | `sineWave` |
| 161 | `mo06_21` | `te_118` | hold | 基本技法 | `sineWave` |
| 162 | `mo06_22` | `te_119` | hold | 基本技法 | `sineWave` |
| 163 | `mo06_23` | `te_120` | hold | 基本技法 | `sineWave` |
| 164 | `mo06_24` | `te_230` | hold | 基本技法 | `floatBob` |
| 165 | `mo06_25` | `te_231` | hold | 基本技法 | `floatBob` |
| 166 | `mo06_26` | `te_232` | hold | 基本技法 | `drift` |
| 167 | `mo06_27` | `te_233` | hold | 基本技法 | `breathing` |
| 168 | `mo06_28` | `te_258` | hold | 基本技法 | `drift` |

## Motion 07/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 169 | `mo07_01` | `te_268` | hold | 基本技法 | `breathing` |
| 170 | `mo07_02` | `te_269` | hold | 基本技法 | `pulse` |
| 171 | `mo07_03` | `te_270` | hold | 基本技法 | `drift` |
| 172 | `mo07_04` | `te_314` | hold | 基本技法 | `drift` |
| 173 | `mo07_05` | `te_125` | hold | 変形 | `pulse` |
| 174 | `mo07_06` | `te_126` | hold | 変形 | `twist` |
| 175 | `mo07_07` | `te_315` | hold | 変形 | `twist` |
| 176 | `mo07_08` | `te_316` | hold | 変形 | `twist` |
| 177 | `mo07_09` | `te_317` | hold | 変形 | `wobbleWarp` |
| 178 | `mo07_10` | `te_318` | hold | 変形 | `twist` |
| 179 | `mo07_11` | `te_319` | hold | 変形 | `wobbleWarp` |
| 180 | `mo07_12` | `te_320` | hold | 変形 | `wobbleWarp` |
| 181 | `mo07_13` | `te_321` | hold | 変形 | `wobbleWarp` |
| 182 | `mo07_14` | `te_322` | hold | 変形 | `wobbleWarp` |
| 183 | `mo07_15` | `te_323` | hold | 変形 | `wobbleWarp` |
| 184 | `mo07_16` | `te_324` | hold | 変形 | `jelly` |
| 185 | `mo07_17` | `te_325` | hold | 変形 | `wobbleWarp` |
| 186 | `mo07_18` | `te_326` | hold | 変形 | `breathing` |
| 187 | `mo07_19` | `te_327` | hold | 変形 | `shiver` |
| 188 | `mo07_20` | `te_328` | hold | 変形 | `pathFollow` |
| 189 | `mo07_21` | `te_329` | hold | 変形 | `breathing` |
| 190 | `mo07_22` | `te_330` | hold | 変形 | `breathing` |
| 191 | `mo07_23` | `te_331` | hold | 変形 | `opacityPulse` |
| 192 | `mo07_24` | `te_148` | hold | 常時動作 | `opacityPulse` |
| 193 | `mo07_25` | `te_149` | hold | 常時動作 | `opacityPulse` |
| 194 | `mo07_26` | `te_150` | hold | 常時動作 | `opacityPulse` |
| 195 | `mo07_27` | `te_66` | hold | 常時動作 | `floatBob` |
| 196 | `mo07_28` | `te_67` | hold | 常時動作 | `floatBob` |

## Motion 08/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 197 | `mo08_01` | `te_68` | hold | 常時動作 | `floatBob` |
| 198 | `mo08_02` | `te_69` | hold | 常時動作 | `sway` |
| 199 | `mo08_03` | `te_70` | hold | 常時動作 | `breathing` |
| 200 | `mo08_04` | `te_71` | hold | 常時動作 | `sway` |
| 201 | `mo08_05` | `te_72` | hold | 常時動作 | `orbit3D` |
| 202 | `mo08_06` | `te_73` | hold | 常時動作 | `orbit3D` |
| 203 | `mo08_07` | `te_123` | hold | 強調 | `breathing` |
| 204 | `mo08_08` | `te_124` | hold | 強調 | `breathing` |
| 205 | `mo08_09` | `te_151` | hold | 強調 | `opacityPulse` |
| 206 | `mo08_10` | `te_152` | hold | 強調 | `opacityPulse` |
| 207 | `mo08_11` | `te_153` | hold | 強調 | `opacityPulse` |
| 208 | `mo08_12` | `te_154` | hold | 強調 | `opacityPulse` |
| 209 | `mo08_13` | `te_155` | hold | 強調 | `opacityPulse` |
| 210 | `mo08_14` | `te_156` | hold | 強調 | `opacityPulse` |
| 211 | `mo08_15` | `te_157` | hold | 強調 | `breathing` |
| 212 | `mo08_16` | `te_199` | hold | 強調 | `opacityPulse` |
| 213 | `mo08_17` | `te_25` | hold | 強調 | `breathing` |
| 214 | `mo08_18` | `te_292` | hold | 強調 | `pulse` |
| 215 | `mo08_19` | `te_293` | hold | 強調 | `orbit2D` |
| 216 | `mo08_20` | `te_49` | hold | 強調 | `opacityPulse` |
| 217 | `mo08_21` | `te_50` | hold | 強調 | `opacityPulse` |
| 218 | `mo08_22` | `te_51` | hold | 強調 | `opacityPulse` |
| 219 | `mo08_23` | `te_52` | hold | 強調 | `pulse` |
| 220 | `mo08_24` | `te_53` | hold | 強調 | `heartbeat` |
| 221 | `mo08_25` | `te_54` | hold | 強調 | `jelly` |
| 222 | `mo08_26` | `te_55` | hold | 強調 | `jelly` |
| 223 | `mo08_27` | `te_56` | hold | 強調 | `jelly` |
| 224 | `mo08_28` | `te_57` | hold | 強調 | `jitter` |

## Motion 09/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 225 | `mo09_01` | `te_58` | hold | 強調 | `jitter` |
| 226 | `mo09_02` | `te_59` | hold | 強調 | `wobbleWarp` |
| 227 | `mo09_03` | `te_60` | hold | 強調 | `wobbleWarp` |
| 228 | `mo09_04` | `te_61` | hold | 強調 | `sway` |
| 229 | `mo09_05` | `te_62` | hold | 強調 | `jelly` |
| 230 | `mo09_06` | `te_63` | hold | 強調 | `jelly` |
| 231 | `mo09_07` | `te_64` | hold | 強調 | `jelly` |
| 232 | `mo09_08` | `te_65` | hold | 強調 | `orbit3D` |
| 233 | `mo09_09` | `te_212` | hold | 描画 | `pathFollow` |
| 234 | `mo09_10` | `te_213` | hold | 描画 | `pathFollow` |
| 235 | `mo09_11` | `te_214` | hold | 描画 | `pathFollow` |
| 236 | `mo09_12` | `te_215` | hold | 描画 | `marquee` |
| 237 | `mo09_13` | `te_216` | hold | 描画 | `pathFollow` |
| 238 | `mo09_14` | `te_217` | hold | 描画 | `sineWave` |
| 239 | `mo09_15` | `te_218` | hold | 描画 | `jitter` |
| 240 | `mo09_16` | `te_219` | hold | 描画 | `jitter` |
| 241 | `mo09_17` | `te_220` | hold | 描画 | `shiver` |
| 242 | `mo09_18` | `te_300` | hold | 数値 | `pulse` |
| 243 | `mo09_19` | `te_301` | hold | 数値 | `pulse` |
| 244 | `mo09_20` | `te_302` | hold | 数値 | `marquee` |
| 245 | `mo09_21` | `te_94` | hold | 数値 | `pulse` |
| 246 | `mo09_22` | `te_95` | hold | 数値 | `pulse` |
| 247 | `mo09_23` | `te_96` | hold | 数値 | `pulse` |
| 248 | `mo09_24` | `te_105` | hold | 文字単位 | `opacityPulse` |
| 249 | `mo09_25` | `te_106` | hold | 文字単位 | `opacityPulse` |
| 250 | `mo09_26` | `te_107` | hold | 文字単位 | `drift` |
| 251 | `mo09_27` | `te_108` | hold | 文字単位 | `jelly` |
| 252 | `mo09_28` | `te_109` | hold | 文字単位 | `pulse` |

## Motion 10/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 253 | `mo10_01` | `te_110` | hold | 文字単位 | `orbit3D` |
| 254 | `mo10_02` | `te_111` | hold | 文字単位 | `jitter` |
| 255 | `mo10_03` | `te_112` | hold | 文字単位 | `sineWave` |
| 256 | `mo10_04` | `te_113` | hold | 文字単位 | `sineWave` |
| 257 | `mo10_05` | `te_332` | hold | 文字単位 | `opacityPulse` |
| 258 | `mo10_06` | `te_333` | hold | 文字単位 | `jitter` |
| 259 | `mo10_07` | `te_334` | hold | 文字単位 | `breathing` |
| 260 | `mo10_08` | `te_335` | hold | 文字単位 | `sineWave` |
| 261 | `mo10_09` | `te_336` | hold | 文字単位 | `jitter` |
| 262 | `mo10_10` | `te_337` | hold | 文字単位 | `sineWave` |
| 263 | `mo10_11` | `te_338` | hold | 文字単位 | `breathing` |
| 264 | `mo10_12` | `te_339` | hold | 文字単位 | `drift` |
| 265 | `mo10_13` | `te_97` | hold | 文字単位 | `jitter` |
| 266 | `mo10_14` | `te_98` | hold | 文字単位 | `jitter` |
| 267 | `mo10_15` | `te_99` | hold | 文字単位 | `jitter` |
| 268 | `mo10_16` | `te_242` | hold | 歌詞動画 | `sineWave` |
| 269 | `mo10_17` | `te_243` | hold | 歌詞動画 | `sineWave` |
| 270 | `mo10_18` | `te_244` | hold | 歌詞動画 | `sineWave` |
| 271 | `mo10_19` | `te_245` | hold | 歌詞動画 | `pulse` |
| 272 | `mo10_20` | `te_246` | hold | 歌詞動画 | `heartbeat` |
| 273 | `mo10_21` | `te_247` | hold | 歌詞動画 | `pulse` |
| 274 | `mo10_22` | `te_248` | hold | 歌詞動画 | `sineWave` |
| 275 | `mo10_23` | `te_249` | hold | 歌詞動画 | `pulse` |
| 276 | `mo10_24` | `te_250` | hold | 歌詞動画 | `pulse` |
| 277 | `mo10_25` | `te_251` | hold | 歌詞動画 | `shiver` |
| 278 | `mo10_26` | `te_252` | hold | 歌詞動画 | `breathing` |
| 279 | `mo10_27` | `te_253` | hold | 歌詞動画 | `sineWave` |
| 280 | `mo10_28` | `te_254` | hold | 歌詞動画 | `marquee` |

## Motion 11/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 281 | `mo11_01` | `te_255` | hold | 歌詞動画 | `opacityPulse` |
| 282 | `mo11_02` | `te_256` | hold | 歌詞動画 | `sway` |
| 283 | `mo11_03` | `te_257` | hold | 歌詞動画 | `drift` |
| 284 | `mo11_04` | `te_74` | hold | 波・流れ | `sineWave` |
| 285 | `mo11_05` | `te_75` | hold | 波・流れ | `sineWave` |
| 286 | `mo11_06` | `te_76` | hold | 波・流れ | `sineWave` |
| 287 | `mo11_07` | `te_77` | hold | 波・流れ | `sineWave` |
| 288 | `mo11_08` | `te_78` | hold | 波・流れ | `pathFollow` |
| 289 | `mo11_09` | `te_221` | hold | 漫画・TV風 | `sway` |
| 290 | `mo11_10` | `te_222` | hold | 漫画・TV風 | `jitter` |
| 291 | `mo11_11` | `te_223` | hold | 漫画・TV風 | `shiver` |
| 292 | `mo11_12` | `te_224` | hold | 漫画・TV風 | `jelly` |
| 293 | `mo11_13` | `te_225` | hold | 漫画・TV風 | `opacityPulse` |
| 294 | `mo11_14` | `te_226` | hold | 漫画・TV風 | `jelly` |
| 295 | `mo11_15` | `te_227` | hold | 漫画・TV風 | `jelly` |
| 296 | `mo11_16` | `te_228` | hold | 漫画・TV風 | `jelly` |
| 297 | `mo11_17` | `te_229` | hold | 漫画・TV風 | `opacityPulse` |
| 298 | `mo11_18` | `te_303` | hold | 漫画・TV風 | `sway` |
| 299 | `mo11_19` | `te_304` | hold | 漫画・TV風 | `sway` |
| 300 | `mo11_20` | `te_305` | hold | 漫画・TV風 | `sway` |
| 301 | `mo11_21` | `te_306` | hold | 漫画・TV風 | `marquee` |
| 302 | `mo11_22` | `te_307` | hold | 漫画・TV風 | `marquee` |
| 303 | `mo11_23` | `te_308` | hold | 漫画・TV風 | `jelly` |
| 304 | `mo11_24` | `te_340` | hold | 物理 | `drift` |
| 305 | `mo11_25` | `te_341` | hold | 物理 | `jelly` |
| 306 | `mo11_26` | `te_342` | hold | 物理 | `drift` |
| 307 | `mo11_27` | `te_343` | hold | 物理 | `drift` |
| 308 | `mo11_28` | `te_344` | hold | 物理 | `drift` |

## Motion 12/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 309 | `mo12_01` | `te_345` | hold | 物理 | `sway` |
| 310 | `mo12_02` | `te_346` | hold | 物理 | `jelly` |
| 311 | `mo12_03` | `te_347` | hold | 物理 | `sway` |
| 312 | `mo12_04` | `te_348` | hold | 物理 | `drift` |
| 313 | `mo12_05` | `te_349` | hold | 物理 | `drift` |
| 314 | `mo12_06` | `te_350` | hold | 物理 | `jelly` |
| 315 | `mo12_07` | `te_351` | hold | 物理 | `drift` |
| 316 | `mo12_08` | `te_79` | hold | 移動 | `pathFollow` |
| 317 | `mo12_09` | `te_84` | hold | 移動 | `marquee` |
| 318 | `mo12_10` | `te_85` | hold | 移動 | `marquee` |
| 319 | `mo12_11` | `te_86` | hold | 移動 | `marquee` |
| 320 | `mo12_12` | `te_87` | hold | 移動 | `drift` |
| 321 | `mo12_13` | `te_88` | hold | 移動 | `marquee` |
| 322 | `mo12_14` | `te_89` | hold | 移動 | `marquee` |
| 323 | `mo12_15` | `te_134` | hold | 質感 | `breathing` |
| 324 | `mo12_16` | `te_138` | hold | 質感 | `breathing` |
| 325 | `mo12_17` | `te_139` | hold | 質感 | `breathing` |
| 326 | `mo12_18` | `te_140` | hold | 質感 | `breathing` |
| 327 | `mo12_19` | `te_141` | hold | 質感 | `opacityPulse` |
| 328 | `mo12_20` | `te_142` | hold | 質感 | `opacityPulse` |
| 329 | `mo12_21` | `te_143` | hold | 質感 | `opacityPulse` |
| 330 | `mo12_22` | `te_144` | hold | 質感 | `breathing` |
| 331 | `mo12_23` | `te_145` | hold | 質感 | `breathing` |
| 332 | `mo12_24` | `te_146` | hold | 質感 | `breathing` |
| 333 | `mo12_25` | `te_147` | hold | 質感 | `opacityPulse` |
| 334 | `mo12_26` | `te_160` | hold | 質感 | `breathing` |
| 335 | `mo12_27` | `te_161` | hold | 質感 | `opacityPulse` |

## Motion 13/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 336 | `mo13_01` | `te_162` | hold | 質感 | `breathing` |
| 337 | `mo13_02` | `te_163` | hold | 質感 | `opacityPulse` |
| 338 | `mo13_03` | `te_164` | hold | 質感 | `opacityPulse` |
| 339 | `mo13_04` | `te_178` | hold | 質感 | `wobbleWarp` |
| 340 | `mo13_05` | `te_179` | hold | 質感 | `wobbleWarp` |
| 341 | `mo13_06` | `te_180` | hold | 質感 | `drift` |
| 342 | `mo13_07` | `te_181` | hold | 質感 | `drift` |
| 343 | `mo13_08` | `te_182` | hold | 質感 | `drift` |
| 344 | `mo13_09` | `te_183` | hold | 質感 | `sineWave` |
| 345 | `mo13_10` | `te_184` | hold | 質感 | `sineWave` |
| 346 | `mo13_11` | `te_185` | hold | 質感 | `wobbleWarp` |
| 347 | `mo13_12` | `te_186` | hold | 質感 | `jitter` |
| 348 | `mo13_13` | `te_187` | hold | 質感 | `opacityPulse` |
| 349 | `mo13_14` | `te_188` | hold | 質感 | `jitter` |
| 350 | `mo13_15` | `te_200` | hold | 質感 | `opacityPulse` |
| 351 | `mo13_16` | `te_201` | hold | 質感 | `jitter` |
| 352 | `mo13_17` | `te_202` | hold | 質感 | `drift` |
| 353 | `mo13_18` | `te_203` | hold | 質感 | `breathing` |
| 354 | `mo13_19` | `te_204` | hold | 質感 | `shiver` |
| 355 | `mo13_20` | `te_205` | hold | 質感 | `breathing` |
| 356 | `mo13_21` | `te_206` | hold | 質感 | `breathing` |
| 357 | `mo13_22` | `te_207` | hold | 質感 | `opacityPulse` |
| 358 | `mo13_23` | `te_208` | hold | 質感 | `shiver` |
| 359 | `mo13_24` | `te_209` | hold | 質感 | `jitter` |
| 360 | `mo13_25` | `te_211` | hold | 質感 | `breathing` |
| 361 | `mo13_26` | `te_259` | hold | 質感 | `opacityPulse` |
| 362 | `mo13_27` | `te_266` | hold | 質感 | `opacityPulse` |

## Motion 14/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 363 | `mo14_01` | `te_267` | hold | 質感 | `opacityPulse` |
| 364 | `mo14_02` | `te_294` | hold | 質感 | `sway` |
| 365 | `mo14_03` | `te_295` | hold | 質感 | `drift` |
| 366 | `mo14_04` | `te_296` | hold | 質感 | `jitter` |
| 367 | `mo14_05` | `te_297` | hold | 質感 | `drift` |
| 368 | `mo14_06` | `te_298` | hold | 質感 | `drift` |
| 369 | `mo14_07` | `te_299` | hold | 質感 | `opacityPulse` |
| 370 | `mo14_08` | `te_311` | hold | 質感 | `breathing` |
| 371 | `mo14_09` | `te_312` | hold | 質感 | `breathing` |
| 372 | `mo14_10` | `te_313` | hold | 質感 | `opacityPulse` |
| 373 | `mo14_11` | `te_352` | hold | 質感 | `wobbleWarp` |
| 374 | `mo14_12` | `te_353` | hold | 質感 | `wobbleWarp` |
| 375 | `mo14_13` | `te_354` | hold | 質感 | `wobbleWarp` |
| 376 | `mo14_14` | `te_355` | hold | 質感 | `shiver` |
| 377 | `mo14_15` | `te_356` | hold | 質感 | `shiver` |
| 378 | `mo14_16` | `te_357` | hold | 質感 | `shiver` |
| 379 | `mo14_17` | `te_358` | hold | 質感 | `breathing` |
| 380 | `mo14_18` | `te_359` | hold | 質感 | `breathing` |
| 381 | `mo14_19` | `te_360` | hold | 質感 | `breathing` |
| 382 | `mo14_20` | `te_361` | hold | 質感 | `breathing` |
| 383 | `mo14_21` | `te_362` | hold | 質感 | `breathing` |
| 384 | `mo14_22` | `te_363` | hold | 質感 | `breathing` |
| 385 | `mo14_23` | `te_364` | hold | 質感 | `shiver` |
| 386 | `mo14_24` | `te_366` | hold | 質感 | `jelly` |
| 387 | `mo14_25` | `te_367` | hold | 質感 | `jelly` |
| 388 | `mo14_26` | `te_368` | hold | 質感 | `breathing` |
| 389 | `mo14_27` | `te_369` | hold | 質感 | `breathing` |

## Motion 15/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 390 | `mo15_01` | `te_370` | hold | 質感 | `breathing` |
| 391 | `mo15_02` | `te_371` | hold | 質感 | `breathing` |
| 392 | `mo15_03` | `te_372` | hold | 質感 | `opacityPulse` |
| 393 | `mo15_04` | `te_373` | hold | 質感 | `marquee` |
| 394 | `mo15_05` | `te_374` | hold | 質感 | `opacityPulse` |
| 395 | `mo15_06` | `te_375` | hold | 質感 | `jitter` |
| 396 | `mo15_07` | `te_376` | hold | 質感 | `opacityPulse` |
| 397 | `mo15_08` | `te_80` | hold | 配置 | `pathFollow` |
| 398 | `mo15_09` | `te_81` | hold | 配置 | `pathFollow` |
| 399 | `mo15_10` | `te_82` | hold | 配置 | `orbit2D` |
| 400 | `mo15_11` | `te_83` | hold | 配置 | `orbit2D` |
| 401 | `mo15_12` | `blurOut` | exit | exit | `blurOut` |
| 402 | `mo15_13` | `boxEraseOut` | exit | exit | `boxErase` |
| 403 | `mo15_14` | `bulletHolesOut` | exit | exit | `bulletHoles` |
| 404 | `mo15_15` | `burn` | exit | exit | `burnAway` |
| 405 | `mo15_16` | `checkerboardOut` | exit | exit | `checkerboard` |
| 406 | `mo15_17` | `circleEraseOut` | exit | exit | `circleErase` |
| 407 | `mo15_18` | `dissolve` | exit | exit | `dissolve` |
| 408 | `mo15_19` | `ditherOut` | exit | exit | `dither` |
| 409 | `mo15_20` | `explode` | exit | exit | `explode` |
| 410 | `mo15_21` | `fadeGlowOut` | exit | exit | `fade` |
| 411 | `mo15_22` | `fadeOut` | exit | exit | `fade` |
| 412 | `mo15_23` | `flyOut` | exit | exit | `slide` |
| 413 | `mo15_24` | `geometryOut` | exit | exit | `geometry` |
| 414 | `mo15_25` | `lineEraseOut` | exit | exit | `lineErase` |
| 415 | `mo15_26` | `melt` | exit | exit | `melt` |
| 416 | `mo15_27` | `pageCurlOut` | exit | exit | `pageCurl` |

## Motion 16/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 417 | `mo16_01` | `particlesOnTextOut` | exit | exit | `particlesOnText` |
| 418 | `mo16_02` | `scanOut` | exit | exit | `scanline` |
| 419 | `mo16_03` | `shrinkOut` | exit | exit | `shrinkToCenter` |
| 420 | `mo16_04` | `stealthOut` | exit | exit | `stealth` |
| 421 | `mo16_05` | `wipe` | exit | exit | `wipe` |
| 422 | `mo16_06` | `zoomOut` | exit | exit | `zoomOut` |
| 423 | `mo16_07` | `te_103` | exit | タイピング | `typewriterReverse` |
| 424 | `mo16_08` | `te_12` | exit | 消去 | `zoomOut` |
| 425 | `mo16_09` | `te_14` | exit | 消去 | `slide` |
| 426 | `mo16_10` | `te_16` | exit | 消去 | `wipe` |
| 427 | `mo16_11` | `te_2` | exit | 消去 | `fade` |
| 428 | `mo16_12` | `te_21` | exit | 消去 | `radialOut` |
| 429 | `mo16_13` | `te_23` | exit | 消去 | `blurOut` |
| 430 | `mo16_14` | `te_27` | exit | 消去 | `gravityFall` |
| 431 | `mo16_15` | `te_281` | exit | 消去 | `shrinkToCenter` |
| 432 | `mo16_16` | `te_32` | exit | 消去 | `rotateOut` |
| 433 | `mo16_17` | `te_34` | exit | 消去 | `rotateOut` |
| 434 | `mo16_18` | `te_36` | exit | 消去 | `rotateOut` |
| 435 | `mo16_19` | `te_41` | exit | 消去 | `wipe` |
| 436 | `mo16_20` | `te_45` | exit | 消去 | `dissolve` |
| 437 | `mo16_21` | `te_5` | exit | 消去 | `shrinkToCenter` |
| 438 | `mo16_22` | `te_7` | exit | 消去 | `gravityFall` |
| 439 | `mo16_23` | `te_171` | exit | 破壊 | `explode` |
| 440 | `mo16_24` | `te_172` | exit | 破壊 | `dissolve` |
| 441 | `mo16_25` | `te_173` | exit | 破壊 | `explode` |
| 442 | `mo16_26` | `te_174` | exit | 破壊 | `explode` |
| 443 | `mo16_27` | `te_175` | exit | 破壊 | `gravityFall` |

