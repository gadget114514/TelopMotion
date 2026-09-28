# demo — 生成済みのデモ

ここにあるのは全部生成物です。`.telopmotion.json` は Studio の
*File → Open project…* でそのまま開けます。プロジェクトは 1 キュー 3 秒
（demo30 は 3〜3.5 秒）で並んでいて、タイムラインを再生（またはスクラブ）
すると各番号のルックが順に出ます。

## FX 800 — No.1–800（4 プロジェクト、各 200 キュー）

| デモ | 番号 | プロジェクト | プレビュー |
|---:|---|---|---|
| 1 | No.1–200 | `fx800-1.telopmotion.json` | `fx800-preview-1.png` |
| 2 | No.201–400 | `fx800-2.telopmotion.json` | `fx800-preview-2.png` |
| 3 | No.401–600 | `fx800-3.telopmotion.json` | `fx800-preview-3.png` |
| 4 | No.601–800 | `fx800-4.telopmotion.json` | `fx800-preview-4.png` |

各デモは主役の効果に、登場・退場・保持・塗り・縁取り・後処理・配置・文字背景・
リピート・背景・書体・配色を組み合わせた完成形のルックです。**文字サイズは
5 段のはっきりしたラダー（56 / 70 / 88 / 110 / 138、約 1.3 倍刻み）、文字色は
パレットの読みやすい 6 役を巡回**するので、隣り合うデモが同じ大きさ・同じ色に
なることはありません。番号・名前・組み合わせの一覧は `fx800.md`、全レシピは
`fx800.catalog.json` にあります。

```bash
npm run fx800 -- build              # カタログ・一覧・4 プロジェクトを再生成
npm run fx800 -- show 642           # 642 番の名前とレシピ
npm run fx800 -- list --part 3      # No.401–600 の一覧
```

## FX 400 MIX — No.1–400

`fx400mix.telopmotion.json`（+ `fx400mix.srt`）のキュー n が n 番のデモです。
一覧は `fx400mix.md`、レシピは `fx400mix.catalog.json`。

```bash
node scripts/fx400mix.js build
node scripts/fx400mix.js show 42
```

## 30 秒ショーケース（demo30）

`demo30-A`〜`demo30-D` の 4 本。1 本 30 秒で、ムード（ホラー・ラブ…）と
スタイル（ロック・バラード…）の切り方を混ぜたショーリールです。プレビューは
`demo30-<A|B|C|D>.preview.jpg`。

```bash
npm run demo30                       # 4 本を再生成（--reels A,B で絞り込み）
node scripts/demo30.js list          # 各リールの並びを表示
```

## プレビュー画像の作り方

`fx800-preview-*.png` は FX 800 の各プロジェクトの先頭 16 キューを 4×4 に
並べたコンタクトシートです（1 枚 1920×1080）。既定ではフル解像度で描いた
フレームをタイルへ縮小しています。`SA_SMOKE_FXDEMO_SCALE=half|quarter` を
渡すとその解像度で描いてからタイルへ合わせます（縮小プレビューの座標系は
修正済み。`SA_SMOKE=1 SA_SMOKE_QUALITY=1` で full / half / quarter が同じ
絵になることを確認できます）。

```bash
SA_SMOKE=1 SA_SMOKE_FXDEMO=1 npx electron .   # demo/fx800-preview-1.png
```

`SA_SMOKE_FXDEMO_FILE`（開くプロジェクト）、`SA_SMOKE_FXDEMO_FROM`（開始
キュー位置）、`SA_SMOKE_FXDEMO_LABEL`（左上の番号の開始値）、
`SA_SMOKE_FXDEMO_COUNT`（枚数）、`SA_SMOKE_FXDEMO_COLUMNS`（列数）、
`SA_SMOKE_FXDEMO_TILE`（1 枚の幅）、`SA_SMOKE_FXDEMO_SCALE`（描画解像度）、
`SA_SMOKE_FXDEMO_OUT`（出力先）で変えられます。
