# イージング見本 (ease showcase)

tween の 34 カーブとパラメトリック形、そして ease が効く場所を 1 キューずつ並べた見本プロジェクトです。どのキューも同じスライド登場で始まり、違うのはカーブか効かせる場所だけです。

- パターン＝1カーブ1キュー（3 秒）、使いどころ＝1スロット1キュー（4 秒）
- 開くには Studio の *Help → イージング見本*、または *File → Open project…* を使います
- パラメトリック形（`cubic-bezier(...)` / `spring(...)` / `steps(...)`）はインスペクターのドロップダウンには出ません。見本の値をコピーして使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 基本 (basic) | 2 | 0–6s |
| 2 | 二次 (quad) | 3 | 6–15s |
| 3 | 三次 (cubic) | 3 | 15–24s |
| 4 | 四次 (quart) | 3 | 24–33s |
| 5 | 五次 (quint) | 3 | 33–42s |
| 6 | サイン (sine) | 3 | 42–51s |
| 7 | 指数 (expo) | 3 | 51–60s |
| 8 | 円 (circ) | 3 | 60–69s |
| 9 | バック (back) | 3 | 69–78s |
| 10 | エラスティック (elastic) | 3 | 78–87s |
| 11 | バウンス (bounce) | 3 | 87–96s |
| 12 | なめらか (smooth) | 2 | 96–102s |
| 13 | パラメトリック (parametric) | 6 | 102–120s |
| 14 | 使いどころ (use cases) | 9 | 120–156s |
| | **合計** | **49** | **156s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run ease-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/ease-showcase.js list` | セクションとキューを一覧 |
| `node scripts/ease-showcase.js list --section parametric` | 1 セクションだけ表示 |
| `npm run ease-showcase -- build --sections basic,quad` | セクションを絞って生成 |

## 1. 基本 (basic) (basic)

止まらずに進む linear と、終わるまで待つ hold。すべての基準になる2種。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 1 | `ez_001` | 0–3s | `linear` |
| 2 | `ez_002` | 3–6s | `hold` |

## 2. 二次 (quad) (quad)

ゆるやかな加速・減速。字幕の出入りに無難。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 3 | `ez_003` | 6–9s | `quadIn` |
| 4 | `ez_004` | 9–12s | `quadOut` |
| 5 | `ez_005` | 12–15s | `quadInOut` |

## 3. 三次 (cubic) (cubic)

既定の出入り（easeOutCubic / easeInCubic）と同じ仲間。まず試すならここ。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 6 | `ez_006` | 15–18s | `cubicIn` |
| 7 | `ez_007` | 18–21s | `cubicOut` |
| 8 | `ez_008` | 21–24s | `cubicInOut` |

## 4. 四次 (quart) (quart)

三次よりキビキビした出入り。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 9 | `ez_009` | 24–27s | `quartIn` |
| 10 | `ez_010` | 27–30s | `quartOut` |
| 11 | `ez_011` | 30–33s | `quartInOut` |

## 5. 五次 (quint) (quint)

さらに強い加速・減速。短い尺でキレを出す。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 12 | `ez_012` | 33–36s | `quintIn` |
| 13 | `ez_013` | 36–39s | `quintOut` |
| 14 | `ez_014` | 39–42s | `quintInOut` |

## 6. サイン (sine) (sine)

柔らかい出入り。ゆったりした保持の往復にも。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 15 | `ez_015` | 42–45s | `sineIn` |
| 16 | `ez_016` | 45–48s | `sineOut` |
| 17 | `ez_017` | 48–51s | `sineInOut` |

## 7. 指数 (expo) (expo)

立ち上がり・吸い込みが鋭い。短い尺の強調に。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 18 | `ez_018` | 51–54s | `expoIn` |
| 19 | `ez_019` | 54–57s | `expoOut` |
| 20 | `ez_020` | 57–60s | `expoInOut` |

## 8. 円 (circ) (circ)

円弧の出入り。expo より少し穏やか。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 21 | `ez_021` | 60–63s | `circIn` |
| 22 | `ez_022` | 63–66s | `circOut` |
| 23 | `ez_023` | 66–69s | `circInOut` |

## 9. バック (back) (back)

行き過ぎて戻る。登場の跳ね返りに。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 24 | `ez_024` | 69–72s | `backIn` |
| 25 | `ez_025` | 72–75s | `backOut` |
| 26 | `ez_026` | 75–78s | `backInOut` |

## 10. エラスティック (elastic) (elastic)

弾んで収まる。ポップな登場に。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 27 | `ez_027` | 78–81s | `elasticIn` |
| 28 | `ez_028` | 81–84s | `elasticOut` |
| 29 | `ez_029` | 84–87s | `elasticInOut` |

## 11. バウンス (bounce) (bounce)

跳ねて止まる。落下物の登場・退場に。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 30 | `ez_030` | 87–90s | `bounceIn` |
| 31 | `ez_031` | 90–93s | `bounceOut` |
| 32 | `ez_032` | 93–96s | `bounceInOut` |

## 12. なめらか (smooth) (smooth)

両端の加減速が滑らか。ループのつなぎ目に。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 33 | `ez_033` | 96–99s | `smoothstep` |
| 34 | `ez_034` | 99–102s | `smootherstep` |

## 13. パラメトリック (parametric) (parametric)

数値で形を作る cubic-bezier / spring / steps。CSS の ease、バネ、コマ送り。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 35 | `ez_035` | 102–105s | `cubic-bezier(0.25, 0.1, 0.25, 1)` |
| 36 | `ez_036` | 105–108s | `cubic-bezier(0.68, -0.55, 0.27, 1.55)` |
| 37 | `ez_037` | 108–111s | `spring(170, 26, 1)` |
| 38 | `ez_038` | 111–114s | `spring(100, 10, 1)` |
| 39 | `ez_039` | 114–117s | `steps(4, end)` |
| 40 | `ez_040` | 117–120s | `steps(5, start)` |

## 14. 使いどころ (use cases) (usecase)

ease が効く場所を1キューずつ。同じカーブでも効く場所で役割が違う。

| # | キュー | 時間 | カーブ / スロット |
|---:|---|---|---|
| 41 | `ez_041` | 120–124s | `enter.motion.in.ease = bounceOut` |
| 42 | `ez_042` | 124–128s | `exit.motion.out.ease = backIn` |
| 43 | `ez_043` | 128–132s | `animation stagger.ease = cubicInOut` |
| 44 | `ez_044` | 132–136s | `motion.loop.ease = sineInOut` |
| 45 | `ez_045` | 136–140s | `layout.motion.in.ease = backOut` |
| 46 | `ez_046` | 140–144s | `layout sequence[].ease = elasticOut` |
| 47 | `ez_047` | 144–148s | `animation timeWarp.ease = sineInOut` |
| 48 | `ez_048` | 148–152s | `animation adsr.ease = bounceOut` |
| 49 | `ez_049` | 152–156s | `keyframes[].ease = bounceOut` |

## 使いどころ一覧（ease が効く場所）

見本の後半（usecase セクション）は歌詞トラックの代表 9 スロットを実演します。全スロットの一覧は以下です。

| スロット | 役割 | 触る場所 |
|---|---|---|
| `enter.motion.in.ease` | 登場の進行 pe | インスペクター → モーション → In → イージング |
| `exit.motion.out.ease` | 退場の進行 px | インスペクター → モーション → Out → イージング |
| `animation stagger.ease` | 文字ごとの開始ずれ | インスペクター → モーション → Stagger → イージング（each / order / unit / from と併用） |
| `motion.loop.ease` | 保持の周回（period + yoyo） | インスペクター → モーション → Loop → イージング |
| `animation timeWarp.ease` | 1キューの局所時間の伸縮 | animation タイプ timeWarp の ease パラメータ |
| `layout.motion.in/out.ease` | 配置の合流・分離 | layout のモーション In / Out → イージング（from: scatter 等と併用） |
| `layout sequence[].ease` | ホールド中の formation 遷移 | layout パラメータ sequence の各エントリの ease |
| `hold ease パラメータ` | 保持エフェクトの波形（fontSize / fillScreen の mode pulse 等） | hold タイプの ease パラメータ |
| `bgMotion ease` | 文字背景の追従モーション | bgMotion タイプの ease パラメータ |
| `animation adsr.ease` | ADSR の attack / decay / release | インスペクター → モーション → ADSR → 各イージング |
| `keyframes[].ease` | タイムラインの区間補間（開始キーの ease） | タイムライン → キーフレーム右クリック → イージング… |
| `motions[].ease` | 追加モーション（PowerPoint 式） | インスペクター → アニメーション → 追加モーションのイージング |
| `figure inEase / outEase / holdEase / cameraEase` | 図形トラックの出入り・保持・カメラ | figure クリップのパラメータ（inDur / outDur と併用） |
| `filler figures inEase / outEase / holdEase / cameraEase` | フィラーの図形レイヤー | フィラープリセット figures のパラメータ |
| `layer motion in/out.ease` | 背景・前景レイヤーの出入り | 設定 → レイヤー → Motion in / Motion out → イージング |
| `color transition` | 前キュー色からの遷移（in.ease で混ぜる） | color パラメータ transition（OKLab ブレンド） |

