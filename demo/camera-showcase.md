# カメラ見本 (camera showcase)

フレーム全体を動かすカメラワーク（`post` の camera エフェクトの 10 ムーブ）を 1 キューずつ並べた見本プロジェクトです。どのキューも同じサンプル文・同じ出入りで始まり、違うのはカメラの動きだけです。

- 1ムーブ＝1キュー（4 秒）、量 (amount) 0.3・速さ (speed) 0.6 に固定
- 各キューは2ビート構成です：ムーブ名だけのタイトルビートを画面上部（`upperThird`）に、サンプル文ビートを中央に置くので、名前と本文が重なりません
- 開くには Studio の *Help → カメラ見本*、または *File → Open project…* を使います
- 全キューの背後には濃色プレート（`#0d1220`）を敷いています

| # | セクション | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | 寄り・引き (push) | 3 | 0–12s |
| 2 | パン (pan) | 4 | 12–28s |
| 3 | 傾き・揺れ (tilt) | 3 | 28–40s |
| | **合計** | **10** | **40s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run camera-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/camera-showcase.js list` | セクションとキューを一覧 |
| `node scripts/camera-showcase.js list --section pan` | 1 セクションだけ表示 |
| `npm run camera-showcase -- build --sections push,pan` | セクションを絞って生成 |

## 1. 寄り・引き (push) (push)

フレーム全体に寄る・引く動き。pushIn / pullOut / zoomPunch。量 (amount) と速さ (speed) は全キュー固定。

| # | キュー | 時間 | 動き |
|---:|---|---|---|
| 1 | `cm_001` | 0–4s | `pushIn` |
| 2 | `cm_002` | 4–8s | `pullOut` |
| 3 | `cm_003` | 8–12s | `zoomPunch` |

## 2. パン (pan) (pan)

上下左右への平行移動。panLeft / panRight / panUp / panDown。向きだけが違う。

| # | キュー | 時間 | 動き |
|---:|---|---|---|
| 4 | `cm_004` | 12–16s | `panLeft` |
| 5 | `cm_005` | 16–20s | `panRight` |
| 6 | `cm_006` | 20–24s | `panUp` |
| 7 | `cm_007` | 24–28s | `panDown` |

## 3. 傾き・揺れ (tilt) (tilt)

傾き・旋回・手持ちの揺れ。tilt / orbit / handheld。動きの質だけが違う。

| # | キュー | 時間 | 動き |
|---:|---|---|---|
| 8 | `cm_008` | 28–32s | `tilt` |
| 9 | `cm_009` | 32–36s | `orbit` |
| 10 | `cm_010` | 36–40s | `handheld` |

