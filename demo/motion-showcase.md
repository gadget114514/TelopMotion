# モーション見本 (motion showcase)

モーションギャラリーのプリセットを1キューずつ並べた見本です。各キューは同じサンプル文に1モーションだけを載せています（`cueStyles.motions`）。424件を16ファイルに分け、1ファイルが約80秒です。

- 1モーション = 1キュー（3秒）、1ファイル = 26〜27キュー
- cue名末尾の `[key:value …]` は設定値（デフォルト以外）。タイピング系5件は base enter の typewriter＋stagger、バックスペースは base exit の typewriterReverse＋stagger で順次動作を見せている
- 開くには Studio の *Help → モーション見本 → Motion 01/16 … 16/16*、または *File → Open project…* を使います
- すべて通しで見るには *Help → モーション見本 → すべて連続再生* を使います（中断可）

| # | ファイル | キュー数 | 時間 | 内容 |
|---:|---|---:|---|---|
| 01 | `motion-showcase-01.json` | 27 | 0–81s | enter entrance … enter 出現 |
| 02 | `motion-showcase-02.json` | 27 | 0–81s | enter 出現 … enter 出現 |
| 03 | `motion-showcase-03.json` | 27 | 0–81s | enter 出現 … hold emphasis |
| 04 | `motion-showcase-04.json` | 27 | 0–81s | hold emphasis … hold カラオケ |
| 05 | `motion-showcase-05.json` | 27 | 0–81s | hold カラオケ … hold マスク |
| 06 | `motion-showcase-06.json` | 27 | 0–81s | hold マスク … hold 基本技法 |
| 07 | `motion-showcase-07.json` | 27 | 0–81s | hold 基本技法 … hold 常時動作 |
| 08 | `motion-showcase-08.json` | 27 | 0–81s | hold 常時動作 … hold 強調 |
| 09 | `motion-showcase-09.json` | 27 | 0–81s | hold 強調 … hold 文字単位 |
| 10 | `motion-showcase-10.json` | 27 | 0–81s | hold 文字単位 … hold 歌詞動画 |
| 11 | `motion-showcase-11.json` | 27 | 0–81s | hold 歌詞動画 … hold 物理 |
| 12 | `motion-showcase-12.json` | 27 | 0–81s | hold 物理 … hold 質感 |
| 13 | `motion-showcase-13.json` | 27 | 0–81s | hold 質感 … hold 質感 |
| 14 | `motion-showcase-14.json` | 26 | 0–78s | hold 質感 … hold 質感 |
| 15 | `motion-showcase-15.json` | 26 | 0–78s | hold 質感 … exit exit |
| 16 | `motion-showcase-16.json` | 26 | 0–78s | exit exit … exit 破壊 |
| | **合計** | **429** | | |

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
| 4 | `mo01_04` | `ditherIn` | enter | entrance | `dither` |
| 5 | `mo01_05` | `doubleBounceIn` | enter | entrance | `doubleBounce` |
| 6 | `mo01_06` | `fadeGlow` | enter | entrance | `fade` |
| 7 | `mo01_07` | `fadeIn` | enter | entrance | `fade` |
| 8 | `mo01_08` | `flipIn` | enter | entrance | `flip3D` |
| 9 | `mo01_09` | `floatIn` | enter | entrance | `slide` |
| 10 | `mo01_10` | `flyIn` | enter | entrance | `slide` |
| 11 | `mo01_11` | `geometryIn` | enter | entrance | `geometry` |
| 12 | `mo01_12` | `glitchIn` | enter | entrance | `glitchIn` |
| 13 | `mo01_13` | `growTurn` | enter | entrance | `rotateIn` |
| 14 | `mo01_14` | `irisIn` | enter | entrance | `irisOpen` |
| 15 | `mo01_15` | `popIn` | enter | entrance | `elasticPop` |
| 16 | `mo01_16` | `scanIn` | enter | entrance | `scanline` |
| 17 | `mo01_17` | `stealthIn` | enter | entrance | `stealth` |
| 18 | `mo01_18` | `typewriter` | enter | entrance | `typewriter` |
| 19 | `mo01_19` | `waveIn` | enter | entrance | `waveRise` |
| 20 | `mo01_20` | `zoomIn` | enter | entrance | `zoomIn` |
| 21 | `mo01_21` | `te_100` | enter | タイピング | `typewriter` |
| 22 | `mo01_22` | `te_101` | enter | タイピング | `typewriter` |
| 23 | `mo01_23` | `te_102` | enter | タイピング | `typewriter` |
| 24 | `mo01_24` | `te_104` | enter | タイピング | `typewriter` |
| 25 | `mo01_25` | `te_1` | enter | 出現 | `fade` |
| 26 | `mo01_26` | `te_10` | enter | 出現 | `zoomIn` |
| 27 | `mo01_27` | `te_11` | enter | 出現 | `zoomIn` |

## Motion 02/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 28 | `mo02_01` | `te_121` | enter | 出現 | `zoomIn` |
| 29 | `mo02_02` | `te_122` | enter | 出現 | `zoomIn` |
| 30 | `mo02_03` | `te_13` | enter | 出現 | `slide` |
| 31 | `mo02_04` | `te_15` | enter | 出現 | `wipe` |
| 32 | `mo02_05` | `te_158` | enter | 出現 | `box` |
| 33 | `mo02_06` | `te_159` | enter | 出現 | `slide` |
| 34 | `mo02_07` | `te_17` | enter | 出現 | `maskReveal` |
| 35 | `mo02_08` | `te_18` | enter | 出現 | `blind` |
| 36 | `mo02_09` | `te_19` | enter | 出現 | `split` |
| 37 | `mo02_10` | `te_20` | enter | 出現 | `circleIn` |
| 38 | `mo02_11` | `te_22` | enter | 出現 | `blurIn` |
| 39 | `mo02_12` | `te_24` | enter | 出現 | `depthBlurIn` |
| 40 | `mo02_13` | `te_26` | enter | 出現 | `dropBounce` |
| 41 | `mo02_14` | `te_260` | enter | 出現 | `maskReveal` |
| 42 | `mo02_15` | `te_271` | enter | 出現 | `strokeDrawOn` |
| 43 | `mo02_16` | `te_272` | enter | 出現 | `stretch` |
| 44 | `mo02_17` | `te_273` | enter | 出現 | `box` |
| 45 | `mo02_18` | `te_28` | enter | 出現 | `riseUp` |
| 46 | `mo02_19` | `te_280` | enter | 出現 | `zoomIn` |
| 47 | `mo02_20` | `te_282` | enter | 出現 | `fade` |
| 48 | `mo02_21` | `te_29` | enter | 出現 | `slide` |
| 49 | `mo02_22` | `te_30` | enter | 出現 | `slide` |
| 50 | `mo02_23` | `te_309` | enter | 出現 | `dropBounce` |
| 51 | `mo02_24` | `te_31` | enter | 出現 | `flip3D` |
| 52 | `mo02_25` | `te_310` | enter | 出現 | `dropBounce` |
| 53 | `mo02_26` | `te_33` | enter | 出現 | `rotateIn` |
| 54 | `mo02_27` | `te_35` | enter | 出現 | `rotateIn` |

## Motion 03/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 55 | `mo03_01` | `te_365` | enter | 出現 | `noiseDissolveIn` |
| 56 | `mo03_02` | `te_37` | enter | 出現 | `rotateIn` |
| 57 | `mo03_03` | `te_38` | enter | 出現 | `rotateIn` |
| 58 | `mo03_04` | `te_4` | enter | 出現 | `elasticPop` |
| 59 | `mo03_05` | `te_40` | enter | 出現 | `blind` |
| 60 | `mo03_06` | `te_42` | enter | 出現 | `stretch` |
| 61 | `mo03_07` | `te_43` | enter | 出現 | `scatterIn` |
| 62 | `mo03_08` | `te_44` | enter | 出現 | `scatterIn` |
| 63 | `mo03_09` | `te_47` | enter | 出現 | `neonFlicker` |
| 64 | `mo03_10` | `te_48` | enter | 出現 | `flickerIn` |
| 65 | `mo03_11` | `te_6` | enter | 出現 | `dropBounce` |
| 66 | `mo03_12` | `te_9` | enter | 出現 | `zoomIn` |
| 67 | `mo03_13` | `te_127` | hold | 3D | `orbit3D` |
| 68 | `mo03_14` | `te_128` | hold | 3D | `orbit3D` |
| 69 | `mo03_15` | `te_129` | hold | 3D | `orbit3D` |
| 70 | `mo03_16` | `te_130` | hold | 3D | `orbit3D` |
| 71 | `mo03_17` | `te_131` | hold | 3D | `orbit3D` |
| 72 | `mo03_18` | `te_132` | hold | 3D | `kenBurns` |
| 73 | `mo03_19` | `te_133` | hold | 3D | `kenBurns` |
| 74 | `mo03_20` | `te_135` | hold | 3D | `sway` |
| 75 | `mo03_21` | `te_136` | hold | 3D | `drift` |
| 76 | `mo03_22` | `te_137` | hold | 3D | `drift` |
| 77 | `mo03_23` | `te_210` | hold | 3D | `opacityPulse` |
| 78 | `mo03_24` | `te_274` | hold | 3D | `orbit3D` |
| 79 | `mo03_25` | `bob` | hold | emphasis | `floatBob` |
| 80 | `mo03_26` | `breathe` | hold | emphasis | `breathing` |
| 81 | `mo03_27` | `ditherLoop` | hold | emphasis | `dither` |

## Motion 04/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 82 | `mo04_01` | `drift` | hold | emphasis | `drift` |
| 83 | `mo04_02` | `fadeBreathe` | hold | emphasis | `fade` |
| 84 | `mo04_03` | `geometryLoop` | hold | emphasis | `geometry` |
| 85 | `mo04_04` | `growShrink` | hold | emphasis | `pulse` |
| 86 | `mo04_05` | `jelly` | hold | emphasis | `jelly` |
| 87 | `mo04_06` | `nudgeLoop` | hold | emphasis | `nudgeImpulse` |
| 88 | `mo04_07` | `opacityPulse` | hold | emphasis | `opacityPulse` |
| 89 | `mo04_08` | `pendulumLoop` | hold | emphasis | `pendulumSwing` |
| 90 | `mo04_09` | `pulse` | hold | emphasis | `pulse` |
| 91 | `mo04_10` | `scanLoop` | hold | emphasis | `scanline` |
| 92 | `mo04_11` | `shake` | hold | emphasis | `jitter` |
| 93 | `mo04_12` | `stealthLoop` | hold | emphasis | `stealth` |
| 94 | `mo04_13` | `sway` | hold | emphasis | `sway` |
| 95 | `mo04_14` | `twist` | hold | emphasis | `twist` |
| 96 | `mo04_15` | `wave` | hold | emphasis | `sineWave` |
| 97 | `mo04_16` | `te_283` | hold | イージング | `jelly` |
| 98 | `mo04_17` | `te_284` | hold | イージング | `breathing` |
| 99 | `mo04_18` | `te_285` | hold | イージング | `breathing` |
| 100 | `mo04_19` | `te_286` | hold | イージング | `breathing` |
| 101 | `mo04_20` | `te_287` | hold | イージング | `jelly` |
| 102 | `mo04_21` | `te_288` | hold | イージング | `jelly` |
| 103 | `mo04_22` | `te_289` | hold | イージング | `drift` |
| 104 | `mo04_23` | `te_290` | hold | イージング | `drift` |
| 105 | `mo04_24` | `te_291` | hold | イージング | `sineWave` |
| 106 | `mo04_25` | `te_8` | hold | イージング | `jelly` |
| 107 | `mo04_26` | `te_234` | hold | カラオケ | `pulse` |
| 108 | `mo04_27` | `te_235` | hold | カラオケ | `pulse` |

## Motion 05/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 109 | `mo05_01` | `te_236` | hold | カラオケ | `pulse` |
| 110 | `mo05_02` | `te_237` | hold | カラオケ | `opacityPulse` |
| 111 | `mo05_03` | `te_238` | hold | カラオケ | `jelly` |
| 112 | `mo05_04` | `te_239` | hold | カラオケ | `pulse` |
| 113 | `mo05_05` | `te_240` | hold | カラオケ | `breathing` |
| 114 | `mo05_06` | `te_241` | hold | カラオケ | `opacityPulse` |
| 115 | `mo05_07` | `te_189` | hold | グリッチ・ノイズ | `shiver` |
| 116 | `mo05_08` | `te_190` | hold | グリッチ・ノイズ | `jitter` |
| 117 | `mo05_09` | `te_191` | hold | グリッチ・ノイズ | `jitter` |
| 118 | `mo05_10` | `te_192` | hold | グリッチ・ノイズ | `jitter` |
| 119 | `mo05_11` | `te_193` | hold | グリッチ・ノイズ | `jitter` |
| 120 | `mo05_12` | `te_194` | hold | グリッチ・ノイズ | `shiver` |
| 121 | `mo05_13` | `te_195` | hold | グリッチ・ノイズ | `jitter` |
| 122 | `mo05_14` | `te_196` | hold | グリッチ・ノイズ | `jitter` |
| 123 | `mo05_15` | `te_197` | hold | グリッチ・ノイズ | `wobbleWarp` |
| 124 | `mo05_16` | `te_198` | hold | グリッチ・ノイズ | `jitter` |
| 125 | `mo05_17` | `te_165` | hold | パーティクル | `drift` |
| 126 | `mo05_18` | `te_166` | hold | パーティクル | `shiver` |
| 127 | `mo05_19` | `te_167` | hold | パーティクル | `pulse` |
| 128 | `mo05_20` | `te_168` | hold | パーティクル | `dissolve` |
| 129 | `mo05_21` | `te_169` | hold | パーティクル | `dissolve` |
| 130 | `mo05_22` | `te_170` | hold | パーティクル | `dissolve` |
| 131 | `mo05_23` | `te_176` | hold | パーティクル | `drift` |
| 132 | `mo05_24` | `te_177` | hold | パーティクル | `drift` |
| 133 | `mo05_25` | `te_261` | hold | マスク | `marquee` |
| 134 | `mo05_26` | `te_262` | hold | マスク | `opacityPulse` |
| 135 | `mo05_27` | `te_263` | hold | マスク | `drift` |

## Motion 06/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 136 | `mo06_01` | `te_264` | hold | マスク | `breathing` |
| 137 | `mo06_02` | `te_265` | hold | マスク | `opacityPulse` |
| 138 | `mo06_03` | `te_275` | hold | 切り替え | `sway` |
| 139 | `mo06_04` | `te_276` | hold | 切り替え | `sway` |
| 140 | `mo06_05` | `te_277` | hold | 切り替え | `sway` |
| 141 | `mo06_06` | `te_278` | hold | 切り替え | `orbit3D` |
| 142 | `mo06_07` | `te_279` | hold | 切り替え | `drift` |
| 143 | `mo06_08` | `te_3` | hold | 切り替え | `opacityPulse` |
| 144 | `mo06_09` | `te_39` | hold | 切り替え | `drift` |
| 145 | `mo06_10` | `te_46` | hold | 切り替え | `dissolve` |
| 146 | `mo06_11` | `te_90` | hold | 切り替え | `floatBob` |
| 147 | `mo06_12` | `te_91` | hold | 切り替え | `orbit3D` |
| 148 | `mo06_13` | `te_92` | hold | 切り替え | `floatBob` |
| 149 | `mo06_14` | `te_93` | hold | 切り替え | `opacityPulse` |
| 150 | `mo06_15` | `te_114` | hold | 単語・行単位 | `opacityPulse` |
| 151 | `mo06_16` | `te_115` | hold | 単語・行単位 | `opacityPulse` |
| 152 | `mo06_17` | `te_116` | hold | 単語・行単位 | `drift` |
| 153 | `mo06_18` | `te_117` | hold | 単語・行単位 | `sineWave` |
| 154 | `mo06_19` | `te_118` | hold | 基本技法 | `sineWave` |
| 155 | `mo06_20` | `te_119` | hold | 基本技法 | `sineWave` |
| 156 | `mo06_21` | `te_120` | hold | 基本技法 | `sineWave` |
| 157 | `mo06_22` | `te_230` | hold | 基本技法 | `floatBob` |
| 158 | `mo06_23` | `te_231` | hold | 基本技法 | `floatBob` |
| 159 | `mo06_24` | `te_232` | hold | 基本技法 | `drift` |
| 160 | `mo06_25` | `te_233` | hold | 基本技法 | `breathing` |
| 161 | `mo06_26` | `te_258` | hold | 基本技法 | `drift` |
| 162 | `mo06_27` | `te_268` | hold | 基本技法 | `breathing` |

## Motion 07/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 163 | `mo07_01` | `te_269` | hold | 基本技法 | `pulse` |
| 164 | `mo07_02` | `te_270` | hold | 基本技法 | `drift` |
| 165 | `mo07_03` | `te_314` | hold | 基本技法 | `drift` |
| 166 | `mo07_04` | `te_125` | hold | 変形 | `pulse` |
| 167 | `mo07_05` | `te_126` | hold | 変形 | `twist` |
| 168 | `mo07_06` | `te_315` | hold | 変形 | `twist` |
| 169 | `mo07_07` | `te_316` | hold | 変形 | `twist` |
| 170 | `mo07_08` | `te_317` | hold | 変形 | `wobbleWarp` |
| 171 | `mo07_09` | `te_318` | hold | 変形 | `twist` |
| 172 | `mo07_10` | `te_319` | hold | 変形 | `wobbleWarp` |
| 173 | `mo07_11` | `te_320` | hold | 変形 | `wobbleWarp` |
| 174 | `mo07_12` | `te_321` | hold | 変形 | `wobbleWarp` |
| 175 | `mo07_13` | `te_322` | hold | 変形 | `wobbleWarp` |
| 176 | `mo07_14` | `te_323` | hold | 変形 | `wobbleWarp` |
| 177 | `mo07_15` | `te_324` | hold | 変形 | `jelly` |
| 178 | `mo07_16` | `te_325` | hold | 変形 | `wobbleWarp` |
| 179 | `mo07_17` | `te_326` | hold | 変形 | `breathing` |
| 180 | `mo07_18` | `te_327` | hold | 変形 | `shiver` |
| 181 | `mo07_19` | `te_328` | hold | 変形 | `pathFollow` |
| 182 | `mo07_20` | `te_329` | hold | 変形 | `breathing` |
| 183 | `mo07_21` | `te_330` | hold | 変形 | `breathing` |
| 184 | `mo07_22` | `te_331` | hold | 変形 | `opacityPulse` |
| 185 | `mo07_23` | `te_148` | hold | 常時動作 | `opacityPulse` |
| 186 | `mo07_24` | `te_149` | hold | 常時動作 | `opacityPulse` |
| 187 | `mo07_25` | `te_150` | hold | 常時動作 | `opacityPulse` |
| 188 | `mo07_26` | `te_66` | hold | 常時動作 | `floatBob` |
| 189 | `mo07_27` | `te_67` | hold | 常時動作 | `floatBob` |

## Motion 08/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 190 | `mo08_01` | `te_68` | hold | 常時動作 | `floatBob` |
| 191 | `mo08_02` | `te_69` | hold | 常時動作 | `sway` |
| 192 | `mo08_03` | `te_70` | hold | 常時動作 | `breathing` |
| 193 | `mo08_04` | `te_71` | hold | 常時動作 | `sway` |
| 194 | `mo08_05` | `te_72` | hold | 常時動作 | `orbit3D` |
| 195 | `mo08_06` | `te_73` | hold | 常時動作 | `orbit3D` |
| 196 | `mo08_07` | `te_123` | hold | 強調 | `breathing` |
| 197 | `mo08_08` | `te_124` | hold | 強調 | `breathing` |
| 198 | `mo08_09` | `te_151` | hold | 強調 | `opacityPulse` |
| 199 | `mo08_10` | `te_152` | hold | 強調 | `opacityPulse` |
| 200 | `mo08_11` | `te_153` | hold | 強調 | `opacityPulse` |
| 201 | `mo08_12` | `te_154` | hold | 強調 | `opacityPulse` |
| 202 | `mo08_13` | `te_155` | hold | 強調 | `opacityPulse` |
| 203 | `mo08_14` | `te_156` | hold | 強調 | `opacityPulse` |
| 204 | `mo08_15` | `te_157` | hold | 強調 | `breathing` |
| 205 | `mo08_16` | `te_199` | hold | 強調 | `opacityPulse` |
| 206 | `mo08_17` | `te_25` | hold | 強調 | `breathing` |
| 207 | `mo08_18` | `te_292` | hold | 強調 | `pulse` |
| 208 | `mo08_19` | `te_293` | hold | 強調 | `orbit2D` |
| 209 | `mo08_20` | `te_49` | hold | 強調 | `opacityPulse` |
| 210 | `mo08_21` | `te_50` | hold | 強調 | `opacityPulse` |
| 211 | `mo08_22` | `te_51` | hold | 強調 | `opacityPulse` |
| 212 | `mo08_23` | `te_52` | hold | 強調 | `pulse` |
| 213 | `mo08_24` | `te_53` | hold | 強調 | `heartbeat` |
| 214 | `mo08_25` | `te_54` | hold | 強調 | `jelly` |
| 215 | `mo08_26` | `te_55` | hold | 強調 | `jelly` |
| 216 | `mo08_27` | `te_56` | hold | 強調 | `jelly` |

## Motion 09/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 217 | `mo09_01` | `te_57` | hold | 強調 | `jitter` |
| 218 | `mo09_02` | `te_58` | hold | 強調 | `jitter` |
| 219 | `mo09_03` | `te_59` | hold | 強調 | `wobbleWarp` |
| 220 | `mo09_04` | `te_60` | hold | 強調 | `wobbleWarp` |
| 221 | `mo09_05` | `te_61` | hold | 強調 | `sway` |
| 222 | `mo09_06` | `te_62` | hold | 強調 | `jelly` |
| 223 | `mo09_07` | `te_63` | hold | 強調 | `jelly` |
| 224 | `mo09_08` | `te_64` | hold | 強調 | `jelly` |
| 225 | `mo09_09` | `te_65` | hold | 強調 | `orbit3D` |
| 226 | `mo09_10` | `te_212` | hold | 描画 | `pathFollow` |
| 227 | `mo09_11` | `te_213` | hold | 描画 | `pathFollow` |
| 228 | `mo09_12` | `te_214` | hold | 描画 | `pathFollow` |
| 229 | `mo09_13` | `te_215` | hold | 描画 | `marquee` |
| 230 | `mo09_14` | `te_216` | hold | 描画 | `pathFollow` |
| 231 | `mo09_15` | `te_217` | hold | 描画 | `sineWave` |
| 232 | `mo09_16` | `te_218` | hold | 描画 | `jitter` |
| 233 | `mo09_17` | `te_219` | hold | 描画 | `jitter` |
| 234 | `mo09_18` | `te_220` | hold | 描画 | `shiver` |
| 235 | `mo09_19` | `te_300` | hold | 数値 | `pulse` |
| 236 | `mo09_20` | `te_301` | hold | 数値 | `pulse` |
| 237 | `mo09_21` | `te_302` | hold | 数値 | `marquee` |
| 238 | `mo09_22` | `te_94` | hold | 数値 | `pulse` |
| 239 | `mo09_23` | `te_95` | hold | 数値 | `pulse` |
| 240 | `mo09_24` | `te_96` | hold | 数値 | `pulse` |
| 241 | `mo09_25` | `te_105` | hold | 文字単位 | `opacityPulse` |
| 242 | `mo09_26` | `te_106` | hold | 文字単位 | `opacityPulse` |
| 243 | `mo09_27` | `te_107` | hold | 文字単位 | `drift` |

## Motion 10/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 244 | `mo10_01` | `te_108` | hold | 文字単位 | `jelly` |
| 245 | `mo10_02` | `te_109` | hold | 文字単位 | `pulse` |
| 246 | `mo10_03` | `te_110` | hold | 文字単位 | `orbit3D` |
| 247 | `mo10_04` | `te_111` | hold | 文字単位 | `jitter` |
| 248 | `mo10_05` | `te_112` | hold | 文字単位 | `sineWave` |
| 249 | `mo10_06` | `te_113` | hold | 文字単位 | `sineWave` |
| 250 | `mo10_07` | `te_332` | hold | 文字単位 | `opacityPulse` |
| 251 | `mo10_08` | `te_333` | hold | 文字単位 | `jitter` |
| 252 | `mo10_09` | `te_334` | hold | 文字単位 | `breathing` |
| 253 | `mo10_10` | `te_335` | hold | 文字単位 | `sineWave` |
| 254 | `mo10_11` | `te_336` | hold | 文字単位 | `jitter` |
| 255 | `mo10_12` | `te_337` | hold | 文字単位 | `sineWave` |
| 256 | `mo10_13` | `te_338` | hold | 文字単位 | `breathing` |
| 257 | `mo10_14` | `te_339` | hold | 文字単位 | `drift` |
| 258 | `mo10_15` | `te_97` | hold | 文字単位 | `jitter` |
| 259 | `mo10_16` | `te_98` | hold | 文字単位 | `jitter` |
| 260 | `mo10_17` | `te_99` | hold | 文字単位 | `jitter` |
| 261 | `mo10_18` | `te_242` | hold | 歌詞動画 | `sineWave` |
| 262 | `mo10_19` | `te_243` | hold | 歌詞動画 | `sineWave` |
| 263 | `mo10_20` | `te_244` | hold | 歌詞動画 | `sineWave` |
| 264 | `mo10_21` | `te_245` | hold | 歌詞動画 | `pulse` |
| 265 | `mo10_22` | `te_246` | hold | 歌詞動画 | `heartbeat` |
| 266 | `mo10_23` | `te_247` | hold | 歌詞動画 | `pulse` |
| 267 | `mo10_24` | `te_248` | hold | 歌詞動画 | `sineWave` |
| 268 | `mo10_25` | `te_249` | hold | 歌詞動画 | `pulse` |
| 269 | `mo10_26` | `te_250` | hold | 歌詞動画 | `pulse` |
| 270 | `mo10_27` | `te_251` | hold | 歌詞動画 | `shiver` |

## Motion 11/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 271 | `mo11_01` | `te_252` | hold | 歌詞動画 | `breathing` |
| 272 | `mo11_02` | `te_253` | hold | 歌詞動画 | `sineWave` |
| 273 | `mo11_03` | `te_254` | hold | 歌詞動画 | `marquee` |
| 274 | `mo11_04` | `te_255` | hold | 歌詞動画 | `opacityPulse` |
| 275 | `mo11_05` | `te_256` | hold | 歌詞動画 | `sway` |
| 276 | `mo11_06` | `te_257` | hold | 歌詞動画 | `drift` |
| 277 | `mo11_07` | `te_74` | hold | 波・流れ | `sineWave` |
| 278 | `mo11_08` | `te_75` | hold | 波・流れ | `sineWave` |
| 279 | `mo11_09` | `te_76` | hold | 波・流れ | `sineWave` |
| 280 | `mo11_10` | `te_77` | hold | 波・流れ | `sineWave` |
| 281 | `mo11_11` | `te_78` | hold | 波・流れ | `pathFollow` |
| 282 | `mo11_12` | `te_221` | hold | 漫画・TV風 | `sway` |
| 283 | `mo11_13` | `te_222` | hold | 漫画・TV風 | `jitter` |
| 284 | `mo11_14` | `te_223` | hold | 漫画・TV風 | `shiver` |
| 285 | `mo11_15` | `te_224` | hold | 漫画・TV風 | `jelly` |
| 286 | `mo11_16` | `te_225` | hold | 漫画・TV風 | `opacityPulse` |
| 287 | `mo11_17` | `te_226` | hold | 漫画・TV風 | `jelly` |
| 288 | `mo11_18` | `te_227` | hold | 漫画・TV風 | `jelly` |
| 289 | `mo11_19` | `te_228` | hold | 漫画・TV風 | `jelly` |
| 290 | `mo11_20` | `te_229` | hold | 漫画・TV風 | `opacityPulse` |
| 291 | `mo11_21` | `te_303` | hold | 漫画・TV風 | `sway` |
| 292 | `mo11_22` | `te_304` | hold | 漫画・TV風 | `sway` |
| 293 | `mo11_23` | `te_305` | hold | 漫画・TV風 | `sway` |
| 294 | `mo11_24` | `te_306` | hold | 漫画・TV風 | `marquee` |
| 295 | `mo11_25` | `te_307` | hold | 漫画・TV風 | `marquee` |
| 296 | `mo11_26` | `te_308` | hold | 漫画・TV風 | `jelly` |
| 297 | `mo11_27` | `te_340` | hold | 物理 | `drift` |

## Motion 12/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 298 | `mo12_01` | `te_341` | hold | 物理 | `jelly` |
| 299 | `mo12_02` | `te_342` | hold | 物理 | `drift` |
| 300 | `mo12_03` | `te_343` | hold | 物理 | `drift` |
| 301 | `mo12_04` | `te_344` | hold | 物理 | `drift` |
| 302 | `mo12_05` | `te_345` | hold | 物理 | `sway` |
| 303 | `mo12_06` | `te_346` | hold | 物理 | `jelly` |
| 304 | `mo12_07` | `te_347` | hold | 物理 | `sway` |
| 305 | `mo12_08` | `te_348` | hold | 物理 | `drift` |
| 306 | `mo12_09` | `te_349` | hold | 物理 | `drift` |
| 307 | `mo12_10` | `te_350` | hold | 物理 | `jelly` |
| 308 | `mo12_11` | `te_351` | hold | 物理 | `drift` |
| 309 | `mo12_12` | `te_79` | hold | 移動 | `pathFollow` |
| 310 | `mo12_13` | `te_84` | hold | 移動 | `marquee` |
| 311 | `mo12_14` | `te_85` | hold | 移動 | `marquee` |
| 312 | `mo12_15` | `te_86` | hold | 移動 | `marquee` |
| 313 | `mo12_16` | `te_87` | hold | 移動 | `drift` |
| 314 | `mo12_17` | `te_88` | hold | 移動 | `marquee` |
| 315 | `mo12_18` | `te_89` | hold | 移動 | `marquee` |
| 316 | `mo12_19` | `te_134` | hold | 質感 | `breathing` |
| 317 | `mo12_20` | `te_138` | hold | 質感 | `breathing` |
| 318 | `mo12_21` | `te_139` | hold | 質感 | `breathing` |
| 319 | `mo12_22` | `te_140` | hold | 質感 | `breathing` |
| 320 | `mo12_23` | `te_141` | hold | 質感 | `opacityPulse` |
| 321 | `mo12_24` | `te_142` | hold | 質感 | `opacityPulse` |
| 322 | `mo12_25` | `te_143` | hold | 質感 | `opacityPulse` |
| 323 | `mo12_26` | `te_144` | hold | 質感 | `breathing` |
| 324 | `mo12_27` | `te_145` | hold | 質感 | `breathing` |

## Motion 13/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 325 | `mo13_01` | `te_146` | hold | 質感 | `breathing` |
| 326 | `mo13_02` | `te_147` | hold | 質感 | `opacityPulse` |
| 327 | `mo13_03` | `te_160` | hold | 質感 | `breathing` |
| 328 | `mo13_04` | `te_161` | hold | 質感 | `opacityPulse` |
| 329 | `mo13_05` | `te_162` | hold | 質感 | `breathing` |
| 330 | `mo13_06` | `te_163` | hold | 質感 | `opacityPulse` |
| 331 | `mo13_07` | `te_164` | hold | 質感 | `opacityPulse` |
| 332 | `mo13_08` | `te_178` | hold | 質感 | `wobbleWarp` |
| 333 | `mo13_09` | `te_179` | hold | 質感 | `wobbleWarp` |
| 334 | `mo13_10` | `te_180` | hold | 質感 | `drift` |
| 335 | `mo13_11` | `te_181` | hold | 質感 | `drift` |
| 336 | `mo13_12` | `te_182` | hold | 質感 | `drift` |
| 337 | `mo13_13` | `te_183` | hold | 質感 | `sineWave` |
| 338 | `mo13_14` | `te_184` | hold | 質感 | `sineWave` |
| 339 | `mo13_15` | `te_185` | hold | 質感 | `wobbleWarp` |
| 340 | `mo13_16` | `te_186` | hold | 質感 | `jitter` |
| 341 | `mo13_17` | `te_187` | hold | 質感 | `opacityPulse` |
| 342 | `mo13_18` | `te_188` | hold | 質感 | `jitter` |
| 343 | `mo13_19` | `te_200` | hold | 質感 | `opacityPulse` |
| 344 | `mo13_20` | `te_201` | hold | 質感 | `jitter` |
| 345 | `mo13_21` | `te_202` | hold | 質感 | `drift` |
| 346 | `mo13_22` | `te_203` | hold | 質感 | `breathing` |
| 347 | `mo13_23` | `te_204` | hold | 質感 | `shiver` |
| 348 | `mo13_24` | `te_205` | hold | 質感 | `breathing` |
| 349 | `mo13_25` | `te_206` | hold | 質感 | `breathing` |
| 350 | `mo13_26` | `te_207` | hold | 質感 | `opacityPulse` |
| 351 | `mo13_27` | `te_208` | hold | 質感 | `shiver` |

## Motion 14/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 352 | `mo14_01` | `te_209` | hold | 質感 | `jitter` |
| 353 | `mo14_02` | `te_211` | hold | 質感 | `breathing` |
| 354 | `mo14_03` | `te_259` | hold | 質感 | `opacityPulse` |
| 355 | `mo14_04` | `te_266` | hold | 質感 | `opacityPulse` |
| 356 | `mo14_05` | `te_267` | hold | 質感 | `opacityPulse` |
| 357 | `mo14_06` | `te_294` | hold | 質感 | `sway` |
| 358 | `mo14_07` | `te_295` | hold | 質感 | `drift` |
| 359 | `mo14_08` | `te_296` | hold | 質感 | `jitter` |
| 360 | `mo14_09` | `te_297` | hold | 質感 | `drift` |
| 361 | `mo14_10` | `te_298` | hold | 質感 | `drift` |
| 362 | `mo14_11` | `te_299` | hold | 質感 | `opacityPulse` |
| 363 | `mo14_12` | `te_311` | hold | 質感 | `breathing` |
| 364 | `mo14_13` | `te_312` | hold | 質感 | `breathing` |
| 365 | `mo14_14` | `te_313` | hold | 質感 | `opacityPulse` |
| 366 | `mo14_15` | `te_352` | hold | 質感 | `wobbleWarp` |
| 367 | `mo14_16` | `te_353` | hold | 質感 | `wobbleWarp` |
| 368 | `mo14_17` | `te_354` | hold | 質感 | `wobbleWarp` |
| 369 | `mo14_18` | `te_355` | hold | 質感 | `shiver` |
| 370 | `mo14_19` | `te_356` | hold | 質感 | `shiver` |
| 371 | `mo14_20` | `te_357` | hold | 質感 | `shiver` |
| 372 | `mo14_21` | `te_358` | hold | 質感 | `breathing` |
| 373 | `mo14_22` | `te_359` | hold | 質感 | `breathing` |
| 374 | `mo14_23` | `te_360` | hold | 質感 | `breathing` |
| 375 | `mo14_24` | `te_361` | hold | 質感 | `breathing` |
| 376 | `mo14_25` | `te_362` | hold | 質感 | `breathing` |
| 377 | `mo14_26` | `te_363` | hold | 質感 | `breathing` |

## Motion 15/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 378 | `mo15_01` | `te_364` | hold | 質感 | `shiver` |
| 379 | `mo15_02` | `te_366` | hold | 質感 | `jelly` |
| 380 | `mo15_03` | `te_367` | hold | 質感 | `jelly` |
| 381 | `mo15_04` | `te_368` | hold | 質感 | `breathing` |
| 382 | `mo15_05` | `te_369` | hold | 質感 | `breathing` |
| 383 | `mo15_06` | `te_370` | hold | 質感 | `breathing` |
| 384 | `mo15_07` | `te_371` | hold | 質感 | `breathing` |
| 385 | `mo15_08` | `te_372` | hold | 質感 | `opacityPulse` |
| 386 | `mo15_09` | `te_373` | hold | 質感 | `marquee` |
| 387 | `mo15_10` | `te_374` | hold | 質感 | `opacityPulse` |
| 388 | `mo15_11` | `te_375` | hold | 質感 | `jitter` |
| 389 | `mo15_12` | `te_376` | hold | 質感 | `opacityPulse` |
| 390 | `mo15_13` | `te_80` | hold | 配置 | `pathFollow` |
| 391 | `mo15_14` | `te_81` | hold | 配置 | `pathFollow` |
| 392 | `mo15_15` | `te_82` | hold | 配置 | `orbit2D` |
| 393 | `mo15_16` | `te_83` | hold | 配置 | `orbit2D` |
| 394 | `mo15_17` | `blurOut` | exit | exit | `blurOut` |
| 395 | `mo15_18` | `burn` | exit | exit | `burnAway` |
| 396 | `mo15_19` | `dissolve` | exit | exit | `dissolve` |
| 397 | `mo15_20` | `ditherOut` | exit | exit | `dither` |
| 398 | `mo15_21` | `explode` | exit | exit | `explode` |
| 399 | `mo15_22` | `fadeGlowOut` | exit | exit | `fade` |
| 400 | `mo15_23` | `fadeOut` | exit | exit | `fade` |
| 401 | `mo15_24` | `flyOut` | exit | exit | `slide` |
| 402 | `mo15_25` | `geometryOut` | exit | exit | `geometry` |
| 403 | `mo15_26` | `melt` | exit | exit | `melt` |

## Motion 16/16

| # | キュー | プリセット | phase | 分類 | type |
|---:|---|---|---|---|---|---|
| 404 | `mo16_01` | `scanOut` | exit | exit | `scanline` |
| 405 | `mo16_02` | `shrinkOut` | exit | exit | `shrinkToCenter` |
| 406 | `mo16_03` | `stealthOut` | exit | exit | `stealth` |
| 407 | `mo16_04` | `wipe` | exit | exit | `wipe` |
| 408 | `mo16_05` | `zoomOut` | exit | exit | `zoomOut` |
| 409 | `mo16_06` | `te_103` | exit | タイピング | `typewriterReverse` |
| 410 | `mo16_07` | `te_12` | exit | 消去 | `zoomOut` |
| 411 | `mo16_08` | `te_14` | exit | 消去 | `slide` |
| 412 | `mo16_09` | `te_16` | exit | 消去 | `wipe` |
| 413 | `mo16_10` | `te_2` | exit | 消去 | `fade` |
| 414 | `mo16_11` | `te_21` | exit | 消去 | `radialOut` |
| 415 | `mo16_12` | `te_23` | exit | 消去 | `blurOut` |
| 416 | `mo16_13` | `te_27` | exit | 消去 | `gravityFall` |
| 417 | `mo16_14` | `te_281` | exit | 消去 | `shrinkToCenter` |
| 418 | `mo16_15` | `te_32` | exit | 消去 | `rotateOut` |
| 419 | `mo16_16` | `te_34` | exit | 消去 | `rotateOut` |
| 420 | `mo16_17` | `te_36` | exit | 消去 | `rotateOut` |
| 421 | `mo16_18` | `te_41` | exit | 消去 | `wipe` |
| 422 | `mo16_19` | `te_45` | exit | 消去 | `dissolve` |
| 423 | `mo16_20` | `te_5` | exit | 消去 | `shrinkToCenter` |
| 424 | `mo16_21` | `te_7` | exit | 消去 | `gravityFall` |
| 425 | `mo16_22` | `te_171` | exit | 破壊 | `explode` |
| 426 | `mo16_23` | `te_172` | exit | 破壊 | `dissolve` |
| 427 | `mo16_24` | `te_173` | exit | 破壊 | `explode` |
| 428 | `mo16_25` | `te_174` | exit | 破壊 | `explode` |
| 429 | `mo16_26` | `te_175` | exit | 破壊 | `gravityFall` |

