# ネームドエフェクト（motion-prompt 120 種）

https://showheyohtaki.github.io/motion-prompt/ の 120 種の演出（5 パック × 24）に、TelopMotion の効果レシピを 1 対 1 で割り当てた一覧です。
レシピは効果レジストリのグループ（登場・退場・保持・後処理・塗り・縁取り・レター罫線・配置・リピート・アニメーション）への差分で、適用時に `SA.looks.expand` が既定値込みのスタイルへ戻します。
データは `renderer/data/named-effects.json`、ビルドは `node scripts/named-effects.js build` です。
全 120 種を通しで確認するレビュープロジェクトは **Help → ネームドエフェクト見本** （`renderer/data/named-effects-showcase.json`、[demo/named-effects-showcase.md](named-effects-showcase.md)）から開けます。

```
node scripts/named-effects.js list [--pack motion]
node scripts/named-effects.js show 12
node scripts/named-effects.js apply 12 --project <file> --cue 3 [--beat <id>] [--out <file>]
npm run named-effects-showcase -- build
```

出典: motion-prompt（作者 @showheyohtaki、MIT ライセンス）。名前・意味・タグは公式カタログから取得しています。

## モーショングラフィックスの動き（motion: #001–#024）

| No. | 名前 | 意味 | TelopMotion の構成 |
|---|---|---|---|
| #001 | ポップイン (Pop-in) | ポンと弾んで現れる | enter / exit / animation |
| #002 | スタガー (Stagger) | 少しずつ時間をずらして順に出す | animation / enter / exit |
| #003 | バースト (Burst) | 登場に合わせて線や粒が弾ける | enter / post / exit |
| #004 | ラインドロー (Line draw) | 線が描かれるように伸びる | enter / exit |
| #005 | マスクリビール (Mask reveal) | 見えない枠の中から文字がせり上がる | enter / exit / animation |
| #006 | タイプライター (Typewriter) | 1文字ずつ打たれるように出る | enter / exit / animation |
| #007 | カウントアップ (Count-up) | 数字が勢いよく増えていく | enter / exit / animation |
| #008 | キネティックタイポグラフィ (Kinetic typography) | 言葉に合わせて文字が動き回る | enter / hold / exit |
| #009 | イージング (Easing) | 緩急をつけて気持ちよく動かす | enter / exit / hold |
| #010 | オーバーシュート (Overshoot) | 行き過ぎてから戻って止まる | enter / exit / animation |
| #011 | スクワッシュ＆ストレッチ (Squash & stretch) | つぶれて伸びて弾力を出す | enter / hold / exit |
| #012 | モーフィング (Shape morph) | 形が別の形に変わる | enter / exit / animation |
| #013 | リキッドモーション (Liquid motion) | 液体のようにぬるっと動く | enter / hold / exit |
| #014 | モーショントレイル (Motion trail) | 動いた跡に残像が尾を引く | enter / post / exit |
| #015 | パーティクル (Particles) | 粒が飛び散る | enter / post / exit |
| #016 | パララックス (Parallax) | 手前と奥をずらして動かし奥行きを出す | enter / hold / post / exit |
| #017 | マスクトランジション (Mask transition) | 形の中から次の画面が現れる | enter / exit / animation |
| #018 | シェイプトランジション (Shape transition) | 図形が画面を覆って切り替わる | enter / exit / post |
| #019 | リキッドトランジション (Liquid transition) | 液体が流れ込んで切り替わる | enter / post / exit |
| #020 | ズームスルー (Zoom through) | 物の中へ突き抜けて次へ | enter / exit / animation |
| #021 | フリップ (Flip) | カードのように裏返る | enter / hold / exit |
| #022 | ライトスイープ (Light sweep) | 光が表面を横切る | enter / edge / post |
| #023 | グリッチ (Glitch) | 映像がバグったように乱れる | enter / post / exit |
| #024 | インパクトシェイク (Impact shake) | 着地の衝撃で画面が揺れる | enter / hold / post |

## カメラワークと切り替え（camera: #025–#048）

| No. | 名前 | 意味 | TelopMotion の構成 |
|---|---|---|---|
| #025 | パン (Pan) | カメラを横に振る | enter / post / exit |
| #026 | ティルト (Tilt) | カメラを縦に振る | enter / post / exit |
| #027 | ドリーイン (Dolly in) | カメラごと被写体に近づく | animation / post |
| #028 | ズームイン (Zoom in) | レンズで寄る（位置は動かない） | enter / post |
| #029 | トラッキング (Tracking shot) | 被写体と並んで動く | hold / post |
| #030 | オービット (Orbit (Arc shot)) | 被写体の周りを回り込む | hold / post |
| #031 | クレーンアップ (Crane up) | カメラが上へ昇っていく | enter / post |
| #032 | ドリーズーム (Dolly zoom (Vertigo)) | 人物はそのまま背景だけ伸び縮み | enter / post |
| #033 | ラックフォーカス (Rack focus) | ピントを手前と奥のあいだで送る | enter / exit / post |
| #034 | 手持ち (Handheld) | 手で持って撮ったように小さく揺らす（ハンドヘルド） | hold / post |
| #035 | FPV (FPV drone shot) | ドローンで突き進む疾走感 | hold / post |
| #036 | ダッチアングル (Dutch angle) | 画面を斜めに傾ける | enter / hold / post |
| #037 | スローモーション (Slow motion) | 動きをゆっくり見せる | enter / exit / animation |
| #038 | スピードランプ (Speed ramp) | 速い→遅いと速さを変える | enter / exit / animation |
| #039 | タイムラプス (Time-lapse) | 長い時間を早送りで見せる | enter / exit / animation |
| #040 | フリーズフレーム (Freeze frame) | 動きを一瞬止める | animation / post / exit |
| #041 | ジャンプカット (Jump cut) | 同じ画角のまま時間を飛ばす | animation / enter / exit |
| #042 | マッチカット (Match cut) | 形や動きをそろえて場面を変える | enter / exit |
| #043 | ホイップパン (Whip pan) | 素早く振ってブレで次へ | enter / post / exit |
| #044 | クロスディゾルブ (Cross dissolve) | 前後の映像を重ねて溶かす | enter / exit |
| #045 | ワイプ (Wipe) | 境目が横切って画面が入れ替わる | enter / exit / animation |
| #046 | スマッシュカット (Smash cut) | 対照的な場面へ前触れなく切り替える | enter / exit / post |
| #047 | Jカット (J-cut) | 次の場面の音が先に聞こえる | enter / exit |
| #048 | Lカット (L-cut) | 前の場面の音が後まで残る | enter / exit |

## UIパーツの名前（ui: #049–#072）

| No. | 名前 | 意味 | TelopMotion の構成 |
|---|---|---|---|
| #049 | モーダル (Modal dialog) | 画面を暗くして中央に窓が出る | enter / exit / edge / post |
| #050 | ドロワー (Drawer (Off-canvas)) | 横からメニューが引き出される | enter / exit / edge |
| #051 | ボトムシート (Bottom sheet) | 下からパネルがせり上がる | enter / exit / edge |
| #052 | アコーディオン (Accordion) | 押すと中身が開閉する | enter / exit / animation |
| #053 | ドロップダウン (Dropdown (select)) | 押すと選択肢が下に広がる | enter / exit / edge |
| #054 | ツールチップ (Tooltip) | 乗せると小さな説明が出る | enter / exit / edge |
| #055 | ポップオーバー (Popover) | 押すと吹き出しの小窓が出る | enter / exit / edge |
| #056 | トースト (Toast notification) | 隅に通知が出て自動で消える | enter / exit / edge |
| #057 | タブ (Tabs) | 見出しを押して中身を切り替える | enter / exit / animation |
| #058 | カルーセル (Carousel) | 横に送って順番に見せる | enter / exit / animation |
| #059 | トグルスイッチ (Toggle switch) | オン・オフを切り替える | enter / exit / animation |
| #060 | セグメントコントロール (Segmented control) | 並んだボタンで表示を切り替える | enter / exit / animation |
| #061 | チップ (Filter chips) | 押して絞り込み条件を付け外し | enter / exit / animation |
| #062 | レンジスライダー (Range slider) | つまみ2つで範囲を選ぶ | enter / exit / strike |
| #063 | ステッパー (Stepper (+/−)) | ＋/−ボタンで数を増減する | enter / exit / animation |
| #064 | ページネーション (Pagination) | 番号でページを送る | enter / exit / animation |
| #065 | ハンバーガーメニュー (Hamburger menu) | 三本線を押すとメニューが開く | enter / hold / exit |
| #066 | パンくずリスト (Breadcrumbs) | 今いる場所を階層で示す | enter / exit / animation |
| #067 | メガメニュー (Mega menu) | 大きな一覧メニューが広がる | enter / exit / animation |
| #068 | ステップインジケーター (Step indicator) | 手続きの何番目かを示す | enter / animation / strike |
| #069 | スケルトン (Skeleton screen) | 読み込み中に灰色の枠を出す | enter / hold / post |
| #070 | スピナー (Spinner) | くるくる回って待ちを示す | enter / hold / exit |
| #071 | バッジ (Badge) | 件数を小さな丸で示す | enter / exit / location / edge |
| #072 | エンプティステート (Empty state) | 中身がないときの案内画面 | enter / hold / exit / post |

## LP・Webサイトの演出（lp: #073–#096）

| No. | 名前 | 意味 | TelopMotion の構成 |
|---|---|---|---|
| #073 | パララックススクロール (Parallax scrolling) | スクロールで奥の層ほどゆっくり動く | enter / hold / post |
| #074 | スクロールでフェードイン (Fade-in on scroll) | 画面に入った要素がふわっと現れる | enter / exit / animation |
| #075 | 追従ヘッダー (Sticky header) | スクロールしてもヘッダーが上に残る | location / enter / hold / edge |
| #076 | ピン留め (Pinning) | セクションを止めて中身だけ進める | enter / exit / animation |
| #077 | 横スクロール (Horizontal scroll) | 縦のスクロールで中身が横に流れる | enter / hold / exit |
| #078 | スクロールスナップ (Scroll snap) | スクロールが区切りの位置にピタッと止まる | enter / hold / exit |
| #079 | スクロールプログレスバー (Scroll progress bar) | 読み進めた割合を上の線で見せる | enter / animation / strike |
| #080 | マーカーアニメーション (Highlighter animation) | 大事な言葉に蛍光ペンの線が引かれる | enter / animation / strike |
| #081 | ホバーで浮き上がる (Hover lift) | カーソルを乗せると影を付けて浮く | enter / hold / edge |
| #082 | ホバーで画像ズーム (Image zoom on hover) | 枠はそのままで写真だけ拡大する | enter / hold / edge |
| #083 | マウスストーカー (Cursor follower) | カーソルを丸が遅れて追いかける | enter / hold / animation |
| #084 | マグネティックボタン (Magnetic button) | 近づいたカーソルにボタンが吸い寄せられる | enter / hold / exit |
| #085 | リップルエフェクト (Ripple effect) | 押した場所から波紋が広がる | enter / exit / post |
| #086 | 下線アニメーション (Underline animation) | 乗せたリンクの下線が左から伸びる | enter / exit / animation |
| #087 | ビフォーアフタースライダー (Before/after slider) | 境目をドラッグして前と後を見比べる | enter / exit / strike |
| #088 | 離脱防止ポップアップ (Exit-intent popup) | ページを離れそうな時に出す引き止めの小窓 | enter / exit / post |
| #089 | ローディング画面 (Preloader) | 読み込み中に出す画面 | enter / hold / post |
| #090 | 遅延読み込み (Lazy loading) | 画面に入った画像だけを読み込む | enter / exit / animation |
| #091 | 無限スクロール (Infinite scroll) | 下まで来ると続きが自動で足される | enter / hold / repeat |
| #092 | ページ遷移アニメーション (Page transition) | ページを移るときの切り替えの演出 | enter / exit / post |
| #093 | スムーススクロール (Smooth scroll) | ページ内リンクでなめらかに移動する | enter / hold / exit |
| #094 | マーキー (Marquee) | 文字や画像が帯で流れ続ける | enter / hold / repeat |
| #095 | グラデーションアニメーション (Animated gradient) | 背景の色の混ざり方が動き続ける | enter / exit / fill |
| #096 | ふわふわアニメーション (Floating animation) | 飾りがゆっくり上下に浮き沈みする | enter / hold |

## 写真の表現・光と画風（photo: #097–#120）

| No. | 名前 | 意味 | TelopMotion の構成 |
|---|---|---|---|
| #097 | 逆光 (Backlighting) | 被写体の真後ろから光を当てる | enter / edge / post |
| #098 | リムライト (Rim light) | 後ろからの光で輪郭だけを光らせる | edge / post |
| #099 | シルエット (Silhouette) | 明るい空を背に、被写体を黒い形だけで見せる | fill / edge / post |
| #100 | スプリットライティング (Split lighting) | 真横からの光で顔を半分ずつ明暗に分ける | fill / post |
| #101 | レンブラントライティング (Rembrandt lighting) | 影側の頬に三角形の光が残る斜め上からの光 | fill / post |
| #102 | バタフライライティング (Butterfly lighting) | 正面の高い位置から当て、鼻の下に蝶形の影 | fill / post |
| #103 | ゴールデンアワー (Golden hour) | 日没前・日の出後の低く赤みのある光 | fill / post |
| #104 | ブルーアワー (Blue hour) | 日没後・日の出前の、空が深い青になる時間 | fill / post |
| #105 | ボケ (Bokeh) | ピントの外の点光源が丸くやわらかくぼける | post |
| #106 | ティルトシフト (Tilt-shift) | 上下をぼかして本物の町を模型のように見せる | post |
| #107 | 長時間露光 (Long exposure) | シャッターを長く開け、動く光を線にする | post |
| #108 | 流し撮り (Panning shot) | 動く被写体を追って撮り、背景だけ流す | post |
| #109 | レンズフレア (Lens flare) | 強い光でレンズの中に光の輪や玉が出る | post |
| #110 | 魚眼レンズ (Fisheye lens) | 中心がふくらみ、直線が丸く曲がる超広角 | post |
| #111 | 色収差 (Chromatic aberration) | 明暗の境に赤や青紫の色ずれが出る | post |
| #112 | 周辺減光（ビネット） (Vignette) | 画面の四隅が暗くなり、中央に目が集まる | enter / post |
| #113 | ハイキー (High-key) | 明るい色だけで作る、白っぽく影の薄い写真 | post |
| #114 | ローキー (Low-key) | 暗い色が中心の、光の当たる所だけが浮かぶ写真 | post |
| #115 | モノクロ (Black and white) | 色を抜いて明るさだけで見せる | post |
| #116 | デュオトーン (Duotone) | 暗部と明部を2色だけで表す | post |
| #117 | ティール＆オレンジ (Teal and orange) | 影を青緑、肌や明部を橙に寄せる色調 | post |
| #118 | フィルムグレイン (Film grain) | フィルム写真のような細かい粒子を乗せる | post |
| #119 | ライトリーク (Light leak) | フィルムに光がもれたような赤橙のにじみ | post |
| #120 | 二重露光（多重露光） (Double exposure) | 2枚の写真を1枚に重ねて写し込む | post |

## 適用例

Studio では Inspector の「ネームドエフェクト」または Generate メニューから選ぶと、選択中のキュー／ビートのスタイルに 1 回の Undo で乗ります。
同じキューへ付け直すと前のレシピのグループだけが外れ、手で足した設定は残ります。

