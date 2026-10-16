# ネームドエフェクト見本 (named effects showcase)

https://showheyohtaki.github.io/motion-prompt/ の 120 種の演出（5 パック × 24）を 1 キューずつ並べた見本プロジェクトです。
どのキューも同じサンプル文を表示し、レシピスタイル（`cueStyles`）が適用されています。

- 1エフェクト = 1キュー（4 秒）
- 開くには Studio の *Help → ネームドエフェクト見本*、または *File → Open project…* を使います

| # | パック | キュー数 | 時間 |
|---:|---|---:|---|
| 1 | モーショングラフィックスの動き (motion) | 24 | 0–96s |
| 2 | カメラワークと切り替え (camera) | 24 | 96–192s |
| 3 | UIパーツの名前 (ui) | 24 | 192–288s |
| 4 | LP・Webサイトの演出 (lp) | 24 | 288–384s |
| 5 | 写真の表現・光と画風 (photo) | 24 | 384–480s |
| | **合計** | **120** | **480s** |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run named-effects-showcase -- build` | このプロジェクトとこの一覧を再生成 |
| `node scripts/named-effects-showcase.js list` | パックとキューを一覧 |
| `node scripts/named-effects-showcase.js list --pack ui` | 1 パックだけ表示 |
| `npm run named-effects-showcase -- build --packs motion,ui` | パックを絞って生成 |

## 1. モーショングラフィックスの動き (motion)

| # | キュー | 時間 | No. | 名前 | 構成 |
|---:|---|---|---|---|---|
| 1 | `ne_001` | 0–4s | #001 | ポップイン (Pop-in) | enter / exit / animation |
| 2 | `ne_002` | 4–8s | #002 | スタガー (Stagger) | animation / enter / exit |
| 3 | `ne_003` | 8–12s | #003 | バースト (Burst) | enter / post / exit |
| 4 | `ne_004` | 12–16s | #004 | ラインドロー (Line draw) | enter / exit |
| 5 | `ne_005` | 16–20s | #005 | マスクリビール (Mask reveal) | enter / exit / animation |
| 6 | `ne_006` | 20–24s | #006 | タイプライター (Typewriter) | enter / exit / animation |
| 7 | `ne_007` | 24–28s | #007 | カウントアップ (Count-up) | enter / exit / animation |
| 8 | `ne_008` | 28–32s | #008 | キネティックタイポグラフィ (Kinetic typography) | enter / hold / exit |
| 9 | `ne_009` | 32–36s | #009 | イージング (Easing) | enter / exit / hold |
| 10 | `ne_010` | 36–40s | #010 | オーバーシュート (Overshoot) | enter / exit / animation |
| 11 | `ne_011` | 40–44s | #011 | スクワッシュ＆ストレッチ (Squash & stretch) | enter / hold / exit |
| 12 | `ne_012` | 44–48s | #012 | モーフィング (Shape morph) | enter / exit / animation |
| 13 | `ne_013` | 48–52s | #013 | リキッドモーション (Liquid motion) | enter / hold / exit |
| 14 | `ne_014` | 52–56s | #014 | モーショントレイル (Motion trail) | enter / post / exit |
| 15 | `ne_015` | 56–60s | #015 | パーティクル (Particles) | enter / post / exit |
| 16 | `ne_016` | 60–64s | #016 | パララックス (Parallax) | enter / hold / post / exit |
| 17 | `ne_017` | 64–68s | #017 | マスクトランジション (Mask transition) | enter / exit / animation |
| 18 | `ne_018` | 68–72s | #018 | シェイプトランジション (Shape transition) | enter / exit / post |
| 19 | `ne_019` | 72–76s | #019 | リキッドトランジション (Liquid transition) | enter / post / exit |
| 20 | `ne_020` | 76–80s | #020 | ズームスルー (Zoom through) | enter / exit / animation |
| 21 | `ne_021` | 80–84s | #021 | フリップ (Flip) | enter / hold / exit |
| 22 | `ne_022` | 84–88s | #022 | ライトスイープ (Light sweep) | enter / edge / post |
| 23 | `ne_023` | 88–92s | #023 | グリッチ (Glitch) | enter / post / exit |
| 24 | `ne_024` | 92–96s | #024 | インパクトシェイク (Impact shake) | enter / hold / post |

## 2. カメラワークと切り替え (camera)

| # | キュー | 時間 | No. | 名前 | 構成 |
|---:|---|---|---|---|---|
| 25 | `ne_025` | 96–100s | #025 | パン (Pan) | enter / post / exit |
| 26 | `ne_026` | 100–104s | #026 | ティルト (Tilt) | enter / post / exit |
| 27 | `ne_027` | 104–108s | #027 | ドリーイン (Dolly in) | animation / post |
| 28 | `ne_028` | 108–112s | #028 | ズームイン (Zoom in) | enter / post |
| 29 | `ne_029` | 112–116s | #029 | トラッキング (Tracking shot) | hold / post |
| 30 | `ne_030` | 116–120s | #030 | オービット (Orbit (Arc shot)) | hold / post |
| 31 | `ne_031` | 120–124s | #031 | クレーンアップ (Crane up) | enter / post |
| 32 | `ne_032` | 124–128s | #032 | ドリーズーム (Dolly zoom (Vertigo)) | enter / post |
| 33 | `ne_033` | 128–132s | #033 | ラックフォーカス (Rack focus) | enter / exit / post |
| 34 | `ne_034` | 132–136s | #034 | 手持ち (Handheld) | hold / post |
| 35 | `ne_035` | 136–140s | #035 | FPV (FPV drone shot) | hold / post |
| 36 | `ne_036` | 140–144s | #036 | ダッチアングル (Dutch angle) | enter / hold / post |
| 37 | `ne_037` | 144–148s | #037 | スローモーション (Slow motion) | enter / exit / animation |
| 38 | `ne_038` | 148–152s | #038 | スピードランプ (Speed ramp) | enter / exit / animation |
| 39 | `ne_039` | 152–156s | #039 | タイムラプス (Time-lapse) | enter / exit / animation |
| 40 | `ne_040` | 156–160s | #040 | フリーズフレーム (Freeze frame) | animation / post / exit |
| 41 | `ne_041` | 160–164s | #041 | ジャンプカット (Jump cut) | animation / enter / exit |
| 42 | `ne_042` | 164–168s | #042 | マッチカット (Match cut) | enter / exit |
| 43 | `ne_043` | 168–172s | #043 | ホイップパン (Whip pan) | enter / post / exit |
| 44 | `ne_044` | 172–176s | #044 | クロスディゾルブ (Cross dissolve) | enter / exit |
| 45 | `ne_045` | 176–180s | #045 | ワイプ (Wipe) | enter / exit / animation |
| 46 | `ne_046` | 180–184s | #046 | スマッシュカット (Smash cut) | enter / exit / post |
| 47 | `ne_047` | 184–188s | #047 | Jカット (J-cut) | enter / exit |
| 48 | `ne_048` | 188–192s | #048 | Lカット (L-cut) | enter / exit |

## 3. UIパーツの名前 (ui)

| # | キュー | 時間 | No. | 名前 | 構成 |
|---:|---|---|---|---|---|
| 49 | `ne_049` | 192–196s | #049 | モーダル (Modal dialog) | enter / exit / edge / post |
| 50 | `ne_050` | 196–200s | #050 | ドロワー (Drawer (Off-canvas)) | enter / exit / edge |
| 51 | `ne_051` | 200–204s | #051 | ボトムシート (Bottom sheet) | enter / exit / edge |
| 52 | `ne_052` | 204–208s | #052 | アコーディオン (Accordion) | enter / exit / animation |
| 53 | `ne_053` | 208–212s | #053 | ドロップダウン (Dropdown (select)) | enter / exit / edge |
| 54 | `ne_054` | 212–216s | #054 | ツールチップ (Tooltip) | enter / exit / edge |
| 55 | `ne_055` | 216–220s | #055 | ポップオーバー (Popover) | enter / exit / edge |
| 56 | `ne_056` | 220–224s | #056 | トースト (Toast notification) | enter / exit / edge |
| 57 | `ne_057` | 224–228s | #057 | タブ (Tabs) | enter / exit / animation |
| 58 | `ne_058` | 228–232s | #058 | カルーセル (Carousel) | enter / exit / animation |
| 59 | `ne_059` | 232–236s | #059 | トグルスイッチ (Toggle switch) | enter / exit / animation |
| 60 | `ne_060` | 236–240s | #060 | セグメントコントロール (Segmented control) | enter / exit / animation |
| 61 | `ne_061` | 240–244s | #061 | チップ (Filter chips) | enter / exit / animation |
| 62 | `ne_062` | 244–248s | #062 | レンジスライダー (Range slider) | enter / exit / strike |
| 63 | `ne_063` | 248–252s | #063 | ステッパー (Stepper (+/−)) | enter / exit / animation |
| 64 | `ne_064` | 252–256s | #064 | ページネーション (Pagination) | enter / exit / animation |
| 65 | `ne_065` | 256–260s | #065 | ハンバーガーメニュー (Hamburger menu) | enter / hold / exit |
| 66 | `ne_066` | 260–264s | #066 | パンくずリスト (Breadcrumbs) | enter / exit / animation |
| 67 | `ne_067` | 264–268s | #067 | メガメニュー (Mega menu) | enter / exit / animation |
| 68 | `ne_068` | 268–272s | #068 | ステップインジケーター (Step indicator) | enter / animation / strike |
| 69 | `ne_069` | 272–276s | #069 | スケルトン (Skeleton screen) | enter / hold / post |
| 70 | `ne_070` | 276–280s | #070 | スピナー (Spinner) | enter / hold / exit |
| 71 | `ne_071` | 280–284s | #071 | バッジ (Badge) | enter / exit / location / edge |
| 72 | `ne_072` | 284–288s | #072 | エンプティステート (Empty state) | enter / hold / exit / post |

## 4. LP・Webサイトの演出 (lp)

| # | キュー | 時間 | No. | 名前 | 構成 |
|---:|---|---|---|---|---|
| 73 | `ne_073` | 288–292s | #073 | パララックススクロール (Parallax scrolling) | enter / hold / post |
| 74 | `ne_074` | 292–296s | #074 | スクロールでフェードイン (Fade-in on scroll) | enter / exit / animation |
| 75 | `ne_075` | 296–300s | #075 | 追従ヘッダー (Sticky header) | location / enter / hold / edge |
| 76 | `ne_076` | 300–304s | #076 | ピン留め (Pinning) | enter / exit / animation |
| 77 | `ne_077` | 304–308s | #077 | 横スクロール (Horizontal scroll) | enter / hold / exit |
| 78 | `ne_078` | 308–312s | #078 | スクロールスナップ (Scroll snap) | enter / hold / exit |
| 79 | `ne_079` | 312–316s | #079 | スクロールプログレスバー (Scroll progress bar) | enter / animation / strike |
| 80 | `ne_080` | 316–320s | #080 | マーカーアニメーション (Highlighter animation) | enter / animation / strike |
| 81 | `ne_081` | 320–324s | #081 | ホバーで浮き上がる (Hover lift) | enter / hold / edge |
| 82 | `ne_082` | 324–328s | #082 | ホバーで画像ズーム (Image zoom on hover) | enter / hold / edge |
| 83 | `ne_083` | 328–332s | #083 | マウスストーカー (Cursor follower) | enter / hold / animation |
| 84 | `ne_084` | 332–336s | #084 | マグネティックボタン (Magnetic button) | enter / hold / exit |
| 85 | `ne_085` | 336–340s | #085 | リップルエフェクト (Ripple effect) | enter / exit / post |
| 86 | `ne_086` | 340–344s | #086 | 下線アニメーション (Underline animation) | enter / exit / animation |
| 87 | `ne_087` | 344–348s | #087 | ビフォーアフタースライダー (Before/after slider) | enter / exit / strike |
| 88 | `ne_088` | 348–352s | #088 | 離脱防止ポップアップ (Exit-intent popup) | enter / exit / post |
| 89 | `ne_089` | 352–356s | #089 | ローディング画面 (Preloader) | enter / hold / post |
| 90 | `ne_090` | 356–360s | #090 | 遅延読み込み (Lazy loading) | enter / exit / animation |
| 91 | `ne_091` | 360–364s | #091 | 無限スクロール (Infinite scroll) | enter / hold / repeat |
| 92 | `ne_092` | 364–368s | #092 | ページ遷移アニメーション (Page transition) | enter / exit / post |
| 93 | `ne_093` | 368–372s | #093 | スムーススクロール (Smooth scroll) | enter / hold / exit |
| 94 | `ne_094` | 372–376s | #094 | マーキー (Marquee) | enter / hold / repeat |
| 95 | `ne_095` | 376–380s | #095 | グラデーションアニメーション (Animated gradient) | enter / exit / fill |
| 96 | `ne_096` | 380–384s | #096 | ふわふわアニメーション (Floating animation) | enter / hold |

## 5. 写真の表現・光と画風 (photo)

| # | キュー | 時間 | No. | 名前 | 構成 |
|---:|---|---|---|---|---|
| 97 | `ne_097` | 384–388s | #097 | 逆光 (Backlighting) | enter / edge / post |
| 98 | `ne_098` | 388–392s | #098 | リムライト (Rim light) | edge / post |
| 99 | `ne_099` | 392–396s | #099 | シルエット (Silhouette) | fill / edge / post |
| 100 | `ne_100` | 396–400s | #100 | スプリットライティング (Split lighting) | fill / post |
| 101 | `ne_101` | 400–404s | #101 | レンブラントライティング (Rembrandt lighting) | fill / post |
| 102 | `ne_102` | 404–408s | #102 | バタフライライティング (Butterfly lighting) | fill / post |
| 103 | `ne_103` | 408–412s | #103 | ゴールデンアワー (Golden hour) | fill / post |
| 104 | `ne_104` | 412–416s | #104 | ブルーアワー (Blue hour) | fill / post |
| 105 | `ne_105` | 416–420s | #105 | ボケ (Bokeh) | post |
| 106 | `ne_106` | 420–424s | #106 | ティルトシフト (Tilt-shift) | post |
| 107 | `ne_107` | 424–428s | #107 | 長時間露光 (Long exposure) | post |
| 108 | `ne_108` | 428–432s | #108 | 流し撮り (Panning shot) | post |
| 109 | `ne_109` | 432–436s | #109 | レンズフレア (Lens flare) | post |
| 110 | `ne_110` | 436–440s | #110 | 魚眼レンズ (Fisheye lens) | post |
| 111 | `ne_111` | 440–444s | #111 | 色収差 (Chromatic aberration) | post |
| 112 | `ne_112` | 444–448s | #112 | 周辺減光（ビネット） (Vignette) | enter / post |
| 113 | `ne_113` | 448–452s | #113 | ハイキー (High-key) | post |
| 114 | `ne_114` | 452–456s | #114 | ローキー (Low-key) | post |
| 115 | `ne_115` | 456–460s | #115 | モノクロ (Black and white) | post |
| 116 | `ne_116` | 460–464s | #116 | デュオトーン (Duotone) | post |
| 117 | `ne_117` | 464–468s | #117 | ティール＆オレンジ (Teal and orange) | post |
| 118 | `ne_118` | 468–472s | #118 | フィルムグレイン (Film grain) | post |
| 119 | `ne_119` | 472–476s | #119 | ライトリーク (Light leak) | post |
| 120 | `ne_120` | 476–480s | #120 | 二重露光（多重露光） (Double exposure) | post |
