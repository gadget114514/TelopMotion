# Claude Code との進め方

> English: [README.claude.md](README.claude.md) ｜ 日本語版（このファイル）

[Claude Code](https://claude.com/claude-code) に TelopMotion のプロジェクトを編集させ、結果を Studio に戻す手順です。プロジェクトはただの JSON ファイル（`.telopmotion.json`）なので、Claude がファイルを編集し、**読み込みはあなたが手動で**行います。両者の間にリアルタイムの接続はありません。

```
 Studio（Web / Electron）             Claude Code（このリポジトリ）
 ────────────────────────            ───────────────────────────
 File → Save  ──────────►  work/song.telopmotion.json
                                     │  編集 + 検証
 File → Open project…  ◄────────────┘
```

## 1. 基本の流れ

1. Studio から**保存**します（*File → Save*、`Ctrl+S`）。保存先は `work/` など作業用フォルダにします。
2. **Claude Code に編集を依頼**します（依頼例は §4）。
3. **検証**します。Claude が `node scripts/validate-project.js <file>` を実行します（§3）。
4. Studio で**開きます**（*File → Open project…*、`Ctrl+O`）。タイムラインを再生・スクラブして確認します。
5. 繰り返します。大きな編集の前に git で commit しておくと、いつでも戻せます。

同じプロジェクトを Studio と Claude Code で同時に編集しないでください。最後に保存した方が勝ちます。一方で 1 ラウンドを終えてから切り替えます。

## 2. Claude に伝えておくこと

編集を頼むときに次を指し示します（`CLAUDE.md` に書いておくのも有効です）。

| 内容 | 場所 |
| --- | --- |
| プロジェクトファイルのスキーマ | [app-design.md](app-design.md) §4.5、`renderer/js/studio/project.js`（`migrate` が既定値の補完と旧版のアップグレードを行う） |
| 動作する実例 | `demo/*.telopmotion.json`、`test/fx400.telopmotion.json` |
| エフェクト名・パラメータ | [effects.csv](effects.csv)、[text-effects-en.csv](text-effects-en.csv)、`demo/*-showcase.md` |
| ページレイアウトのプリセット | [page-layout.md](page-layout.md) |
| レイヤー順序 | [text-layer-design.md](text-layer-design.md) |
| デモの生成方法 | `scripts/demo30.js`、`scripts/fx400.js`、`scripts/showcase.js`（`project.create` → `textflow.apply` → `project.migrate` で構築） |

明示しておくと良い点:

- レンダラーは決定的です。乱数はすべてシード付きなので、同じ JSON・同じ時刻なら必ず同じ絵になります。見た目を変えたいときは `seed` を変えます。
- 音声・動画・画像・フォントの実データは**埋め込まれません**。`media.*.dataRef` はアプリ内ストレージを指します。これらのエントリはそのままにし、必要なら開いた後に Studio でメディアを再リンクします。
- `version` はアプリが上げます。下げないでください。`migrate` は古いファイルをアップグレードし、新しすぎるファイルは `newer-version` で拒否します。

## 3. 編集結果の検証

```bash
node scripts/validate-project.js work/song.telopmotion.json
```

Studio がファイルを開くときと同じ `project.migrate` を通し、version とキュー数を表示します。失敗時は終了コード `1` です。壊れた JSON、`format` の誤り、アプリより新しいファイルを検出できます。一方で、エフェクト名やパラメータが見た目として意味があるかは判定しません。それは Studio で確認します。

歌詞だけの変更なら、JSON を直接編集せず SRT から再生成する方法もあります。`.srt` とレシピからプロジェクトを組み立てる例は `scripts/demo30.js build` を参照してください。

## 4. 依頼の例

```
work/song.telopmotion.json のサビ（60〜90秒）のキューに、強調用の fx を足して。
編集後は scripts/validate-project.js で検証して。
```

```
セクション2のすべてのキューを最初のキューと同じパレットにして、
キュー5のキーフレームを全部 +0.5 秒ずらして。それ以外は触らないで。
```

```
demo/demo30-A.telopmotion.json を読んで、work/lyrics.srt から似た構成の
30 秒プロジェクトを、落ち着いた雰囲気で作って。work/calm.telopmotion.json に書いて検証して。
```

「全部やり直して」より、小さく具体的な依頼の方が安全です。差分を確認しやすく、ファイルも読み込める状態に保てます。

## 5. 任意: Claude に Web 版を操作させる

Web 版は <https://gadget114514.github.io/TelopMotion/>（main ブランチは `/dev/`）で動いています。Claude Code は組み込みブラウザまたは Claude in Chrome で開き、クリック・再生・スクリーンショットができるため、自分の編集結果を目視で確認できます。ファイルの取り込みはファイル選択ダイアログ経由なので、編集した JSON の読み込みは手動（または Claude in Chrome のファイルアップロード）が確実です。描画には WebGL2 が必要なので、ヘッドレスではなく実ブラウザを使ってください。

ローカルで確認する場合は、`.claude/launch.json` の `web` 設定が `renderer/` をポート 8765 で配信します。
