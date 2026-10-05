# スタイル8軸の整理案（ユーザー案 / 現状コード / AI案）

## Context
ユーザーが8軸（Tempo, Energy, Softness, Density, Brightness, Weird, Smartness, Fear）の意味を整理した。
現状コード（`renderer/js/lyrics/moods.js` の `AXES`、`rhythm.js`、`figures.js`、`smartness.js`、`fx-axes.js`）での実際の効き方と突き合わせて、
**各軸が「1つの次元だけを持つ」**ように整理し直す。この段階は整理案であり、実装は合意後。

実装レベルの詳細は [style-axes-impl.md](style-axes-impl.md) を参照。

## 整理の原則（AI案）
各軸に担当する次元を1つずつ割り当て、2軸が同じ見た目の変化を引き起こさないようにする。

| 次元 | 軸 |
|---|---|
| 時間（どのくらい速く・細かく刻むか） | Tempo |
| 変化量（どのくらい大きく・遠くへ動くか） | Energy |
| 形（直線か曲線か） | Softness |
| 空間（画面をどのくらい埋めるか） | Density |
| 色（明るさ） | Brightness |
| 予測しやすさ（どのくらい予想外か） | Weird |
| 品の良さ（どのくらい抑えるか） | Smartness |
| ジャンルの味付け | Fear |

## 対照表

| 軸 (内部名) | ユーザー案 | 現状コードの実際の効き方 | ズレ・重なり | AI案（推奨定義） |
|---|---|---|---|---|
| **Tempo** (`speed`) | ビートの細かさ ＋ **filler 内で演出が切り替わる細かさ** | 登場の長さ (`inBase`, `motionParams.duration/lead`)、文字ごとの時差 (`stagger.each`)、hold ループの周期、背景パターンの scale（moods.js:708-745, 2626）。filler 内の切り替え位置は `figures.js` の `subBeats`（L105-128）が beats/cuts からそのまま作っていて、Tempo は関わっていない | ビートの分割（`rhythm.js` の even/halves/stutter など）は **Energy と Weird** が決めている。filler の切り替え間隔も軸とつながっていない | **時間の細かさ**：①歌詞のビート分割の細かさ ②filler 内の sub-beat 切り替えの間隔 ③1回の動きの短さ。「ゆっくり」も Tempo の低い側が受け持つ |
| **Energy** | 演出間の距離 | 派手なエフェクトの解放条件 (`minEnergy`)、エフェクトの強さ合わせ、bouncy、hold ループの有無、rhythm の build/stutter、figure の密度、**直前の figure からの距離**（figures.js:592-667）、パレットの選び方 | 役割を抱えすぎている。「距離」は figures にしか入っていない。rhythm と density も兼ねている | **変化量（振れ幅）**：演出どうしの距離＋1回の動きの振幅（スケール・移動量・強いエフェクト）。刻みの細かさは Tempo に、要素の数は Density に渡す |
| **Softness** | 動きのゆっくりさ・曲線の多用 | エフェクトの質感合わせ (`texture`)、丸い/硬いフォントの選択、ウェイト、字間（moods.js:489, 1410-1440） | 「ゆっくりさ」を入れると Tempo と重なる | **形・質感**：曲線、イージング（ease/elastic か linear/step か）、丸ゴシックか角か、ぼかしかシャープか。**速さは持たない** |
| **Density** | fg 要素の大きさ | 文字サイズのベース（density が高いほど**小さい**: moods.js:1434）、letter か word の単位、エフェクトの重ね数、backdrop の数・動く確率・トラックの有無 | ユーザー案は「大きさ」だが、コードは「数が多く、1つ1つは小さい」＝情報量になっている | **画面の充填率**：要素の数 × 大きさ ＝ どのくらい埋まって見えるか。「大きさ」はこの軸の結果として出てくる。figure の density も energy から外してこちらへ移す |
| **Brightness** | 色要素の明るさ | パレットの明度、背景の明暗（moods.js:879） | 一致している | **明度**（現状のまま）。彩度は持たせない（Weird や Fear が使う余地を残す） |
| **Weird** | 演出のランダムさ・要素のランダムさ・パルス的な動きの追加 | エフェクト解放 (`minWeird`)、新しさの重み、縦横レイアウトの越境、rhythm の synco/triplet、backdrop の数・速度の増加 | 「パルス」は Smartness が抑えている安っぽい文法（毎拍のパルス）とぶつかる | **予測しにくさ**：選択のばらつき・崩し・シンコペーション。パルスは**持たない**（Tempo×Energy の結果、または Smartness が低いときに許可されるもの） |
| **Smartness** | 洗練された都会的な演出への志向 | 安っぽい文法（毎拍パルスなど）の重みを下げる・除外する（smartness.js） | ほぼ一致している | **抑制と余白**：安っぽい文法の除外、ミニマル、タイポグラフィ寄り。パルスを許すかどうかはここで決める |
| **Fear** | ホラー要素の追加 | ホラー寄りのエフェクトの重み (`fearFactor`)、blood/ash/rain パレット、フォントのプレーン化 | 一致している | **ジャンルの味付け**（現状のまま）。他の軸の値は上書きせず、プールの重み付けだけを変える |

## 主な変更点（合意したら実装）
1. **rhythm の分割を Tempo に移す**：`rhythm.js` `weightsFor` の halves/stutter/even/hold2 の重みを `axes.speed` で決める。Energy は build/fall（盛り上がり）だけに残す。
1b. **filler 内の切り替えも Tempo で決める**：`figures.js` `subBeats` で、beats/cuts から作った edges を Tempo に応じて間引く。Tempo が低いと 4 拍（1 小節）や 2 小節ごと、高いと 1 拍ごと（最高値では半拍に細分）で切り替える。`minSpan = lerp(2小節, 半拍, speed)` より短い区間は隣とまとめる。fillers から figures へ axes が渡っているかを確認し、渡っていなければ engine/direct の filler 生成の経路で `axes.speed` を渡す。
2. **Energy＝距離を全体に広げる**：今は figures だけにある「直前からの距離」の考え方を、エフェクト選び（直前と同じ系統を避ける強さ）にも使う。
3. **Softness から速さを切り離す**：Softness ではイージングの曲線とフォントだけを決める（今もほぼそうなっているので、定義と UI の説明を揃えるだけ）。
4. **Density の定義を「充填率」にする**：figures.js:268 の density の初期値を energy から density へ移す。
5. **パルスの持ち主をはっきりさせる**：Weird からはパルスを足さない。Smartness が低いときに許すもの、とする。
6. **テーマダイアログの軸 hover テキストに追記**（下記）。

## テーマダイアログの hover テキスト追記
- 表示元：`renderer/js/studio/theme-editor.js:304` が `row.title = t('studio.themeEditor.axisHint.<axis>')` を設定し、`renderer/js/studio/app.js:1184-1194`（ジャンル選択ダイアログ）でも同じキーを使っている。
- 文字列：`renderer/js/i18n.js` の `axisHint`。en（L149）と ja（L403）には8軸すべてがある。es/fr/ru（L639/875/1111）には weird/smartness/fear しかなく、残りは en にフォールバックする。
- 方針：**既存の文はそのまま残し、後ろに「どの次元を担当するか」と新しく効くようになる要素を1〜2文足す**。足す文は実装した変更と合わせて入れる。先に入れると hover の説明が実際の動作より先走ってしまうため。
- en と ja を更新する。es/fr/ru は既存の3キーの末尾に同じ趣旨の訳を足す。

| 軸 | ja 追記案 | en 追記案 |
|---|---|---|
| speed | 時間の細かさを担当：歌詞のビートの刻み方と、フィラー内で演出が切り替わる間隔も変わります（低いと小節単位、高いと拍・半拍単位）。 | Owns time: also sets how finely lyric beats are cut and how often a filler switches its figure (bars when low, beats or half-beats when high). |
| energy | 変化量を担当：前の演出からどれだけ離れた演出を選ぶか、1回の動きの振れ幅も変わります。 | Owns change: also sets how far each staging moves away from the previous one and how big each motion is. |
| softness | 形を担当：曲線的なイージングや丸い書体か、直線的・硬い書体かを選びます。速さは変えません。 | Owns shape: curved easing and round type vs linear motion and hard type. It does not change speed. |
| density | 画面の埋まり具合を担当：要素の数が増えるほど、1つ1つは小さくなります。 | Owns screen fill: more elements, each one smaller. |
| brightness | 明度だけを担当します（彩度は変えません）。 | Owns lightness only (saturation is left alone). |
| weird | 予測しにくさを担当：演出の選び方や要素のパラメータのばらつき、シンコペーションも増えます。 | Owns unpredictability: also adds spread to staging picks and element parameters, and syncopation. |
| smartness | 抑制と余白を担当：ビートのパルスを許すかどうかもこの軸で決まります。 | Owns restraint: it also decides whether per-beat pulses are allowed. |
| fear | 味付けだけを担当：他の軸の値は変えず、選ばれやすさだけを変えます。 | Flavour only: it reweights the draw without changing the other axes. |

## Verification
- `scripts/test/` の既存テスト（figures-distance, figures-randomness, backdrop-variety, proc-variety など）を `node --test scripts/test` で実行する。
- 軸を1本ずつ 0→1 に動かしたときに変わるものが、その軸の次元だけになっているかを確かめるテストを足す。例：speed だけを動かすと rhythm の分割と filler 内の sub-beat の数が変わり、energy だけを動かすとどちらも変わらない。
- Studio でプリセット（ballad / rock / electro）を生成し、プレビューで見た目を確認する。


---

# 軸同士の競合（Weird と他の軸）

## 今のコードでの扱い（`moods.js` の `allowed`、L444-475）
| 種類 | 例 | Weird はどう効くか |
|---|---|---|
| 必須の条件（越えられない） | `needsCard` / `needsBadge`、Smartness の `smartness.ok`、Fear の `hardExclude`（gap が大きすぎると重み 0）、legibility（文字と重ならないこと） | 効かない。Weird がいくら高くても除外されたものは出ない |
| 緩められる条件（ソフト） | `minEnergy`（`axes.energy < minEnergy - 0.4*w` で緩む）、`maxLetters*(1+w)`、縦横レイアウトの越境（w ≥ 0.7） | **w に比例して条件の幅を広げる** |
| 重み | texture / force の一致度、novelty、`breaks(random, w)`（確率 w で「定石」を外す） | 重みを平らにし、外れた候補が当たる確率を上げる |

→ 今でも暗黙に **「必須の条件 ＞ Weird ＞ ソフトな条件」** の順になっている。

## ルールとして明文化する（AI案）
**他の軸は「中心」を決め、Weird は「中心のまわりのばらつき」を決める。Weird は中心を動かさず、必須の条件も越えない。**

1. **必須の条件**（Weird は越えない）：文字の可読性、物理的に置けるか（カードやバッジがあるか）、Smartness の除外、Fear の除外、ユーザーが固定（pin）したもの。
2. **ソフトな条件**（Weird が幅を広げる）：Energy・Tempo・Density・Softness・Brightness のしきい値。幅は `しきい値 ± k·w` に揃える（今の `0.4*w` を k の標準値にする）。
3. **重み**（Weird が平らにする）：候補が絞られても、残った候補の中でのばらつきは Weird が決める。

**候補が少なすぎるとき**：Smartness や Fear で候補が 2 個未満になったら、Weird は除外を解かない。そのかわり、残った候補のパラメータ（速さ、量、色の揺れ）のばらつきに回す。「何を選ぶか」ではなく「どう動かすか」でランダムさを出す。

## 今回の変更への当てはめ（実装の詳細は style-axes-impl.md）
- **Tempo の filler の刻み**：`TEMPO_STEPS` の段を、確率 `0.3*w` で ±1 段ずらす（rhythm.js の double/half speed と同じやり方）。乱数は `figure-beat` とは別のストリーム `rng.rngFor(seed, 'figure-tempo', id)` を使い、w = 0 のときは乱数を消費しない（今の出力が変わらないように）。
- **Density の figure 密度**：`density ± 0.3*w` の範囲で揺らす（`breaks` と同じく、w = 0 では乱数を消費しない）。
- **Smartness ＞ Weird**：Weird からパルスを足さない。Smartness が許したときだけパルスが候補に入る（今の動作どおり）。
- テスト：w = 0 で出力が変わらないこと。w = 1 でも Smartness の除外対象と Fear の hardExclude 対象が一度も出ないこと（seed を 50 通り回す）。
