# モーションFX見本 (objfx showcase)

動きに反応する7種（時間遅延・カラーシフト・フリッカー・エコー・塗りと線・時間置換・ベンド）の見本プロジェクトです。タイトルに続き、1種につき2〜3キュー（代表的な値の組み合わせ）で並べています。

- タイトル 6 秒、各キュー 6 秒。入場スライド＋漂流ホールドの上に審査対象を重ねているので、静止では何も起きません
- 各キューは2ビート（上部のタイトル＋中央の本文句）で、ラベルと本文が重なりません
- 各区間は固有色の背景クリップ付き。本文は区間ごとの句・色です
- 開くには Studio の *Help → モーションFX見本*、または *File → Open project…* を使います

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | モーションFX 7種 (intro) | 1 | 0–6s |
| 2 | 時間遅延 (timeDelay) | 3 | 6–24s |
| 3 | カラーシフト (colorShift) | 2 | 24–36s |
| 4 | フリッカー (motionFlicker) | 2 | 36–48s |
| 5 | エコー (motionEcho) | 2 | 48–60s |
| 6 | 塗りと線 (strokeTrail) | 2 | 60–72s |
| 7 | 時間置換 (timeDisplacement) | 3 | 72–90s |
| 8 | ベンド (motionBend) | 2 | 90–102s |
| | **合計** | **17** | **102s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run objfx-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/objfx-showcase.js list` | セクションとキューを一覧 |
| `node scripts/objfx-showcase.js list --section echo` | 1 セクションだけ表示 |
| `npm run objfx-showcase -- build --sections intro,timeDelay` | セクションを絞って生成 |

## 1. モーションFX 7種 (intro) (intro)

タイトルキュー。動きに反応する7種の見本です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 1 | `ox_001` | 0–6s | `intro` | モーションFX 7種 |

## 2. 時間遅延 (timeDelay) (timeDelay)

動き反応 `timeDelay` の見本です。本文は「遅れて追いかける」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 2 | `ox_002` | 6–12s | `timeDelay/letter` | 時間遅延・文字ごと |
| 3 | `ox_003` | 12–18s | `timeDelay/word` | 時間遅延・語ごと |
| 4 | `ox_004` | 18–24s | `timeDelay/region` | 時間遅延・帯 |

## 3. カラーシフト (colorShift) (colorShift)

動き反応 `colorShift` の見本です。本文は「動けば色が巡る」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 5 | `ox_005` | 24–30s | `colorShift/distance` | カラーシフト・距離・色相 |
| 6 | `ox_006` | 30–36s | `colorShift/speed` | カラーシフト・速度・勾配 |

## 4. フリッカー (motionFlicker) (motionFlicker)

動き反応 `motionFlicker` の見本です。本文は「動く間だけ瞬く」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 7 | `ox_007` | 36–42s | `motionFlicker/random` | フリッカー・ランダム |
| 8 | `ox_008` | 42–48s | `motionFlicker/strobe` | フリッカー・ストロボ |

## 5. エコー (motionEcho) (motionEcho)

動き反応 `motionEcho` の見本です。本文は「過去の位置に影」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 9 | `ox_009` | 48–54s | `motionEcho/trail` | エコー・残像 |
| 10 | `ox_010` | 54–60s | `motionEcho/add` | エコー・加算 |

## 6. 塗りと線 (strokeTrail) (strokeTrail)

動き反応 `strokeTrail` の見本です。本文は「線だけがついてくる」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 11 | `ox_011` | 60–66s | `strokeTrail/line` | 塗りと線・線の影 |
| 12 | `ox_012` | 66–72s | `strokeTrail/add` | 塗りと線・加算 |

## 7. 時間置換 (timeDisplacement) (timeDisplacement)

動き反応 `timeDisplacement` の見本です。本文は「軸がずれてねじれる」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 13 | `ox_013` | 72–78s | `timeDisplacement/shear` | 時間置換・せん断 |
| 14 | `ox_014` | 78–84s | `timeDisplacement/velocity` | 時間置換・進行方向 |
| 15 | `ox_015` | 84–90s | `timeDisplacement/block` | 時間置換・行 |

## 8. ベンド (motionBend) (motionBend)

動き反応 `motionBend` の見本です。本文は「先頭が引っ張るゴム」です。

| # | キュー | 時間 | 値 | 内容 |
|---:|---|---|---|---|
| 16 | `ox_016` | 90–96s | `motionBend/auto` | ベンド・自動 |
| 17 | `ox_017` | 96–102s | `motionBend/left` | ベンド・左固定 |

