'use strict';

// doc/effects.csv: every registered effect with its Japanese UI name and a
// one-line description of what it does on screen.
//
//   node scripts/effects-csv.js
//
// The type list comes straight from the effect registry, so a newly registered
// effect shows up here (and is reported as missing a description) without
// editing the enumeration by hand.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');

const fx = require(path.join(FX_DIR, 'registry.js'));
const CORE_FILES = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat'];
// extended primitives / presets; a file that does not exist yet is skipped so
// the catalogue always reflects what the build actually has
const EXTRA_FILES = ['warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets'];
for (const name of [...CORE_FILES, ...EXTRA_FILES]) {
  const file = path.join(FX_DIR, `${name}.js`);
  if (fs.existsSync(file)) require(file);
}
const strings = require(path.join(ROOT, 'renderer', 'js', 'studio', 'fx-strings.js'));
const smartness = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'smartness.js'));
const fxAxes = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'fx-axes.js'));

// alias groups are documented under their base group (bgFill -> fill)
const GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgMotion', 'repeat'];
const GROUP_LABELS = {
  animation: 'アニメーション（時間配分）',
  layout: '配置（レイアウト）',
  enter: '登場（テキストイン）',
  exit: '退場（テキストアウト）',
  hold: '保持（ループ／常時演出）',
  location: '位置（画面内の置き場所）',
  fill: '塗り',
  edge: '縁取り・影',
  post: '後処理（画面効果）',
  background: '背景',
  bgShape: '文字背景の形',
  bgMotion: '文字背景の動き',
  repeat: 'リピート（複製配置）',
};

// One line per effect. Keep the wording about what the viewer sees.
const DESCRIPTIONS = {
  'animation.cascade': '単語ごとに間隔をあけ、波が流れるように順番に登場させる。',
  'animation.echo': '同じ文字列を少しずつずらして重ね、残像のように見せる。',
  'animation.followThrough': '後ろの文字ほど遅れて追従し、しなりや残身を出す。',
  'animation.loop': '保持の動きを一定周期でループ（往復）させる。',
  'animation.simultaneous': '全文字を同時に動かす。一斉に現れ、一斉に消える。',
  'animation.spring': 'バネのように行き過ぎて戻る動きを全体のタイミングに与える。',
  'animation.stagger': '文字ごとに時間差をつけて順番に動かす、リズム設計の基本。',
  'animation.stopMotion': '動きを一定コマ数で打ち切り、コマ撮りアニメ風に見せる。',
  'animation.timeWarp': 'ビート内の時間の進み方をイージングで伸縮させる。',
  'background.card': '実績カードを背景に敷く。',
  'background.cellPattern': 'セルパターン（ボロノイ細胞・ひび・プレート・きらめき・泡）。',
  'background.cover': '楽曲カバー画像を背景に敷く。',
  'background.fractalNoise': 'フラクタルノイズ（種類・オクターブ・サブ設定・進化・ドリフト・ドメインワープ）。',
  'background.gradient': '2色のグラデーション。',
  'background.gradient4': '4隅が動く4色グラデーション。',
  'background.image': '指定画像を背景に敷く。',
  'background.noiseGradient': 'ノイズでゆらぐグラデーション。',
  'background.none': '背景なし。',
  'background.particleField': 'パーティクル（ボケ・星・雪・塵・火の粉・雨・ハイパースペース）。',
  'background.pattern': 'グリッド・ドット・ストライプなどの幾何パターンを敷く。',
  'background.perspectiveGrid': 'パースグリッド（シンセウェーブの定番）。',
  'background.rays': '光線（サンバースト／光芒／スポットライト）。',
  'background.shapes': '図形・パーティクル・波形などを背景に描く。',
  'background.shapeLayer': 'ユーザーが置けるシェイプクリップ。下線・枠・カギ括弧・リングなどを文字ブロック／行に合わせて描き、トリム（弧長）・破線・パス変形で動かす。',
  'background.solid': '単色で塗る。',
  'background.tunnel': 'トンネル（円・四角・六角、縞とねじれ）。',
  'bgMotion.bleed': 'にじみ出る。',
  'bgMotion.draw': '輪郭線が弧長に沿って描かれ、引き終わると内部が現れる。',
  'bgMotion.fade': 'ふわっと現れて消える。',
  'bgMotion.fall': '落下する。',
  'bgMotion.flicker': '点滅する。',
  'bgMotion.float': '浮遊する。',
  'bgMotion.follow': '文字に追従させる（基本）。',
  'bgMotion.grow': '伸びながら現れる（軸を選べる）。',
  'bgMotion.none': '文字背景を動かさない。',
  'bgMotion.pop': 'ポンと弾んで出る。',
  'bgMotion.spin': '回転しながら出る。',
  'bgMotion.stamp': 'スタンプのように押される。',
  'bgMotion.wipe': 'ワイプで現れる。',
  'bgShape.bar': '帯状の下地を敷く（マーカー）。',
  'bgShape.blob': '不定形の塊で囲む。',
  'bgShape.bracket': 'カッコで挟む。',
  'bgShape.circle': '円で囲む。',
  'bgShape.cloud': '雲形で囲む。',
  'bgShape.diamond': 'ひし形で囲む。',
  'bgShape.drop': 'しずく型の下地。',
  'bgShape.heart': 'ハートで囲む。',
  'bgShape.none': '文字背景なし。',
  'bgShape.paper': '紙切れのような下地。',
  'bgShape.ring': '輪で囲む。',
  'bgShape.rounded': '角丸の四角で囲む。',
  'bgShape.scratch': '引っかき傷のような下地。',
  'bgShape.splatter': '飛び散ったインクのような下地。',
  'bgShape.square': '四角で囲む。',
  'bgShape.star': '星形で囲む。',
  'edge.bevel': '面取りしたように立体感を出す。',
  'edge.drip': '輪郭からしずくが垂れる。',
  'edge.dropShadow': 'ぼかした影を落とす。',
  'edge.extrude': '奥行きをつけて押し出す。',
  'edge.innerGlow': '文字の内側を発光させる。',
  'edge.longShadow': '斜めに伸びる長い影を落とす。',
  'edge.multiLine': '文字の輪郭を平行な複数の線で囲む（色・太さ・間隔・レイヤー遅延を調整）。',
  'edge.neonGlow': 'ネオンのように外側へ発光させる。',
  'edge.outline': '縁取り線を引く（破線・点線・点線ダッシュ・二重／三重線・ストライプ・チェッカー・ダイヤ・ジグザグ・波・ランダム・梯子・ハッチ・スケッチ）。',
  'enter.animator': '移動・拡大・回転・傾き・傾斜・不透明度・ぼかし・閃光を1つにまとめたトランスフォーム登場。',
  'enter.blurIn': 'ピンボケの状態からピントが合うように現れる（文字ごとのぼかし）。',
  'enter.driftIn': '横から流れ込みながら現れる。',
  'enter.dropBounce': '上から落ちてバウンドしながら着地する。',
  'enter.elasticPop': '弾けすぎて戻るポップな拡大登場。',
  'enter.fade': '透明度が上がって静かに現れる。最も基本のフェードイン。',
  'enter.fallIn': '上から落ちて現れる。',
  'enter.flickerIn': '明滅を繰り返しながら現れる。',
  'enter.flip3D': 'カードがめくれるように3D回転して現れる。',
  'enter.focusIn': 'ぼけた状態からピントが合う。',
  'enter.glitchIn': 'デジタルノイズのようにずれながら現れる。',
  'enter.megaZoomIn': '画面いっぱいの巨大文字から寄っていく導入。',
  'enter.morphFromPrevious': '前のキューの文字の形から変形して現れる。',
  'enter.neonFlicker': 'ネオン管のように点滅しながら点灯する。',
  'enter.noiseDissolveIn': 'ノイズのしきい値で溶けながら現れる。',
  'enter.particlesAssemble': '粒子が集まって文字の形になる。',
  'enter.popIn': '小さな状態から弾んで現れる。',
  'enter.riseIn': '下から持ち上がりながら現れる。',
  'enter.rotateIn': '回転しながら現れる。',
  'enter.scatterIn': '散らばった位置から集まって整列する。',
  'enter.scramble': '文字がランダムに入れ替わってから確定する。',
  'enter.shatterRebuild': '破片が回転しながら集まり、文字が再構築される。',
  'enter.slide': '画面の外側から指定方向へ滑り込ませる。',
  'enter.spinIn': '回転しながら位置に収まる。',
  'enter.strokeDrawOn': '輪郭線が描かれてから塗りが乗る。',
  'enter.tiltIn': '3Dで傾いた状態から正面を向く。',
  'enter.typewriter': '1文字ずつキーボードで打ち込まれるように順番に現れる。',
  'enter.waveRise': '波を打つように上下しながら現れる。',
  'enter.zoomIn': '小さい状態から拡大して飛び出す。',
  'exit.animator': '移動・拡大・回転・傾き・傾斜・不透明度・ぼかし・閃光を1つにまとめたトランスフォーム退場。',
  'exit.blurOut': 'ぼけながら消える（文字ごとのぼかし）。',
  'exit.burnAway': '端から燃え尽きる。',
  'exit.creepOut': 'ゆっくりとフレームの外へ滑り出る。',
  'exit.dissolve': '粒子状に溶けて消える。',
  'exit.explode': '破裂して飛び散る。',
  'exit.fade': '透明度が下がって静かに消える。最も基本のフェードアウト。',
  'exit.fallOut': '下へ落ちながら消える。',
  'exit.focusOut': 'ぼけながら消える。',
  'exit.gravityFall': '重力で落下していく。',
  'exit.megaZoomOut': '巨大文字から引いていく退場。',
  'exit.melt': '溶けて下へ垂れる。',
  'exit.particlesDisperse': '粒子になって散り消える。',
  'exit.riseOut': '上へ抜けながら消える。',
  'exit.shrinkToCenter': '中心へ縮んで消える。',
  'exit.slide': '指定方向へ滑り去る。',
  'exit.spinOut': '回転しながら消える。',
  'exit.strokeErase': '輪郭線が消えていく。',
  'exit.typewriterReverse': '打ち込まれた文字が逆順に消えていく。',
  'exit.wipe': '指定方向へ拭き取るように消える。',
  'exit.zoomOut': '縮小しながら消える。',
  'exit.zoomOutSoft': 'ゆっくり縮みながら消える。',
  'fill.categoryColor': '実績カテゴリの色で塗る。',
  'fill.caustics': '水面の光のゆらぎ（コースティクス）。',
  'fill.chrome': 'クロームメッキのような金属光沢。',
  'fill.fire': '炎が揺らめく質感。',
  'fill.glass': 'ガラスのように透けて光る。',
  'fill.goldFoil': '金箔のような質感。',
  'fill.gradientSweep': 'グラデーションを流しながら塗る。',
  'fill.holographic': 'ホログラムのように玉虫色に輝く。',
  'fill.ink': '筆で書いたような墨の質感。',
  'fill.karaokeWipe': '歌詞の進行に合わせて色が切り替わる（カラオケワイプ）。',
  'fill.marble': '大理石の模様。',
  'fill.stripes': '斜線ストライプの柄で塗る（色・角度・太さ・割合・流れを調整）。',
  'fill.checker': '市松（チェッカー）柄で塗る。',
  'fill.diamondGrid': 'ダイヤ格子の柄で塗る。',
  'fill.halftone': '網点（ハーフトーン）で塗る。',
  'fill.hatch': '片方向のハッチング（斜線）で塗る。',
  'fill.randomSpeckle': 'ランダムな斑点ノイズで塗る。',
  'fill.rainbowFlow': '虹色が流れるように塗る。',
  'fill.solid': '単色で塗る。',
  'fill.textureFill': '画像テクスチャを貼る（未設定時は手続き模様）。',
  'hold.animator': 'サイン／ウィグル／パルス／浮遊で、保持中にトランスフォームを揺らし続ける。',
  'hold.beatPulse': 'ビートに合わせて脈打つ。',
  'hold.boil': 'コマ撮りのように微かに揺れ続ける。',
  'hold.breatheLoop': '呼吸するように拡大縮小を繰り返す。',
  'hold.breathing': '呼吸するようにふくらみ続ける。',
  'hold.drift': '一定方向へ流れ続ける。',
  'hold.fillScreen': '文字ブロックが画面いっぱいになるまで拡大する。',
  'hold.floatBob': 'ゆらゆらと浮遊する。',
  'hold.floatLoop': 'ゆっくり浮遊し続ける。',
  'hold.fontSize': 'ブロックごと文字サイズを変える（文字も字間も一緒に拡大縮小）。',
  'hold.heartbeat': '鼓動のように2段階で脈打つ。',
  'hold.jelly': 'ゼリーのように歪んで弾む。',
  'hold.jitter': '細かく震え続ける。',
  'hold.kenBurns': '写真のケンバーンズのようにゆっくり拡大・パンする。',
  'hold.letterBend': '1文字ずつ弧に曲げる。',
  'hold.letterBulge': '1文字ずつ中央を膨らませる。',
  'hold.letterFlag': '1文字ずつ旗のように揺らす。',
  'hold.letterRipple': '1文字の輪郭に波紋を通す。',
  'hold.letterTaper': '1文字を上すぼまり／下すぼまりにする。',
  'hold.letterWarp': '1文字ごとに曲げ・膨張・しぼみ・テーパー・波・リップル・伸縮・旗・ジグザグのワープをかける。',
  'hold.letterZigzag': '1文字の輪郭をジグザグに刻む。',
  'hold.marquee': '電光掲示板のように横へ流れ続ける。',
  'hold.none': '保持中の動きなし。',
  'hold.opacityPulse': '明滅（点滅）し続ける。',
  'hold.orbit3D': '3Dで回り込むように傾き続ける。',
  'hold.orbit2D': '一文字ずつ角度をずらしながら円を描いて公転する。',
  'hold.pathFollow': 'パスに沿って移動し続ける。',
  'hold.pulse': 'BPMに合わせて拡大縮小し、鼓動のように脈打つ。',
  'hold.shiver': '一定間隔でブルッと震える。',
  'hold.sineWave': '文字ごとに位相をずらしたサイン波で揺れる。',
  'hold.squashStretch': '文字ごとに伸び縮みを繰り返す（スクワッシュ＆ストレッチ）。',
  'hold.sway': 'ゆっくり傾いて揺れる。',
  'hold.swayLoop': 'ゆっくり傾いて揺れ続ける。',
  'hold.swirl': '文字を渦状にねじり続ける。',
  'hold.twist': '上下でねじれさせる。',
  'hold.warp': '行全体を円弧・アーチ・膨張・旗・波・魚型・魚眼・インフレート・ライズ・スクイーズ・ツイストにワープさせる。',
  'hold.warpArc': '行全体を円弧に巻く。',
  'hold.warpArch': '行全体をアーチ状に持ち上げる。',
  'hold.warpBulge': '行全体を中央から膨らませる。',
  'hold.warpFish': '行全体を魚のようにしならせる。',
  'hold.warpFisheye': '行全体を魚眼レンズのように歪ませる。',
  'hold.warpFlag': '行全体を旗のように揺らす。',
  'hold.warpInflate': '行全体を縦横に膨らませる。',
  'hold.warpRise': '行全体を斜めに持ち上げる。',
  'hold.warpSqueeze': '行全体を横に絞る。',
  'hold.warpTwist': '行全体を渦状にねじる。',
  'hold.warpWave': '行全体に波を通す。',
  'hold.wobbleWarp': '波打つように輪郭を歪ませる。',
  'layout.arc': '円弧に沿って並べる。',
  'layout.circle': '文字を円周上に並べる。',
  'layout.diagonal': '斜めのラインに沿って並べる。',
  'layout.grid': '格子状に並べる。',
  'layout.path': '任意のパスに沿って配置する。',
  'layout.row': '1行の横組みに整列させる（基準のレイアウト）。',
  'layout.scatter': 'ランダムな位置に散らす。',
  'layout.spiral': '渦巻き状に配置する。',
  'layout.stackedWords': '単語ごとに改行して積み重ねる。',
  'layout.staircase': '階段状にずらして並べる。',
  'layout.vertical': '縦書きに整列させる（日本語の縦組み）。',
  'layout.wave': '波打つように上下させて並べる。',
  'location.badgeAnchored': '実績バッジの横に寄り添わせる。',
  'location.center': '画面中央に置く。',
  'location.custom': 'X/Yを直接指定して置く。',
  'location.karaoke': 'カラオケ字幕のように下寄りに置く。',
  'location.left': '画面の左寄りに置く。',
  'location.lowerThird': '画面下三分の一に置く（字幕の定番位置）。',
  'location.randomSafe': 'セーフエリア内のランダムな位置に置く。',
  'location.right': '画面の右寄りに置く。',
  'location.stacked': '重ならないよう下へ積み重ねて置く。',
  'location.upperThird': '画面上三分の一に置く。',
  'post.anamorphicStreak': '明部から横一直線の光条を伸ばす。',
  'post.bloom': '明部をにじませて発光させる。',
  'post.burnDissolve': '焼き切れるように消す。',
  'post.camera': 'カメラワーク（寄り・引き・パン・ティルト・手持ち・旋回・パンチ）。',
  'post.cameraHandheld': '手持ちのように細かく揺れる。',
  'post.cameraOrbit': '被写体の周りを旋回する。',
  'post.cameraPanLeft': '左へパンする。',
  'post.cameraPanRight': '右へパンする。',
  'post.cameraPullOut': 'ゆっくり引く。',
  'post.cameraPunch': 'ビートに合わせてズームで殴る。',
  'post.cameraPushIn': 'ゆっくり寄る。',
  'post.cameraTilt': '上下にティルトする。',
  'post.chromaticAberration': '色収差を強める。',
  'post.colorGrade': '明度・彩度・ポスタライズを調整する。',
  'post.crt': 'ブラウン管風の走査線・湾曲・周辺減光。',
  'post.dataSmear': 'データが引き延ばされたように伸びる。',
  'post.digitalNoise': 'デジタルノイズを散らす。',
  'post.directionalDissolve': '指定方向から溶かす。',
  'post.displacementMap': 'ノイズで座標をずらす。',
  'post.echoTrail': '残像を重ねる。',
  'post.filmGrain': 'フィルムの粒子ノイズを乗せる。',
  'post.glitchBlocks': '画面をブロック単位でずらしてグリッチさせる。',
  'post.glitchSlice': '横スライス単位でずらす。',
  'post.godRays': '光条（ゴッドレイ）を放射する。',
  'post.halftone': '網点（ハーフトーン）に変換する。',
  'post.halftoneDissolve': '網点に変換しながら消す。',
  'post.heatHaze': '陽炎のようにゆらゆら歪ませる。',
  'post.kaleidoscope': '万華鏡のように鏡映する。',
  'post.lensDistortion': 'レンズ歪みと色収差を与える。',
  'post.lensFlare': 'レンズフレアを入れる。',
  'post.lightLeak': 'フィルムの光漏れを加える。',
  'post.lightSweep': '光の帯が横切る。',
  'post.mirror': '上下または左右に鏡映する。',
  'post.motionBlur': '指定方向へぶらす（モーションブラー）。',
  'post.noiseDissolve': 'ノイズで溶かしながら消す／現す。',
  'post.particleDissolve': '粒子になって散る。',
  'post.pixelDissolve': 'ピクセル単位で溶かす。',
  'post.pixelSort': '明るさでピクセルを並べ替える。',
  'post.pixelate': 'モザイク状に粗くする。',
  'post.radialWipe': '放射状にワイプする（時計回り／反時計回り）。',
  'post.rgbShift': 'RGBをずらして色ずれを起こす。',
  'post.scanTear': '走査線のように横へちぎる。',
  'post.shockwave': '衝撃波のリングで歪ませる。',
  'post.sparkles': 'きらめき（星・ハート）を散らす。',
  'post.spinBlur': '中心の周りを回転ぶれさせる。',
  'post.strobeFlash': 'BPMに合わせて閃光を焚く（音声テンポにも追従）。',
  'post.turbulentDisplace': '乱流ノイズで座標をずらす。',
  'post.twirl': '中心の周りに渦巻きを作る。',
  'post.venetianBlinds': 'ブラインド状の帯で画面を覆う。',
  'post.vhsTracking': 'VHSのトラッキングずれとノイズ。',
  'post.vignette': '周辺を暗く落とす。',
  'post.waveWarp': '波で映像を揺らす（波長・振幅・波形・端の固定を選べる）。',
  'post.zoomBlur': '中心から放射状にぶれさせる。',
  'repeat.brick': 'レンガ積みのように複製する。',
  'repeat.diagonal': '斜め方向へ複製する。',
  'repeat.fan': '扇状に複製する。',
  'repeat.fill': '画面を埋めるように複製する。',
  'repeat.grid': '格子状に複製する。',
  'repeat.radial': '放射状に複製する。',
  'repeat.rowH': '文字列を横に並べて複製する。',
  'repeat.scatter': 'ランダムに散らして複製する。',
  'repeat.stackV': '文字列を縦に積み重ねて複製する。',
  'repeat.tunnel': '奥へ続くトンネルのように複製する。',

  // --- selector pack -----------------------------------------------------------
  'enter.rangeReveal': 'レンジセレクターの帯を進捗で滑らせ、選択中の文字だけを変化前の状態に残して順に登場させる。',
  'exit.rangeReveal': '帯を進捗で滑らせ、選択中の文字から順に退場させる。',
  'enter.tracking': '文字間を広げた状態から詰めて着地させる（映画タイトルの定番）。',
  'exit.tracking': '文字間を開きながら退場させる。',
  'hold.rangeSelector': '選択帯に入った文字だけを、移動・拡大・回転・不透明度・ぼかし・ハイライト色・字間で動かし続ける（レンジセレクター）。',
  'hold.tracking': '保持中に文字間を開閉させ続ける（パルス／呼吸／ビート同期）。',

  // --- shape layer -------------------------------------------------------------
  'post.shapeLayer': 'テキストの周囲に下線・枠・カギ括弧・リング・集中線・十字を描く。トリム（弧長）で描き進み、登場・退場・保持ループ・ビートに同期。',
  'enter.revealSweep': '選択範囲をスイープさせながら文字を登場させる。',
  'enter.revealSoft': 'やわらかい形状の選択範囲で文字を登場させる。',
  'enter.revealRandom': 'ランダム順に文字を登場させる。',
  'enter.trackIn': '字間を詰めながら登場させる。',
  'exit.trackOut': '字間を開きながら退場させる。',
  'hold.highlightSweep': 'ハイライトが文字列を流れ続ける。',
  'hold.waveLoop': '選択帯がループして波のように流れる。',
  'hold.beatHighlight': 'ビートに合わせてハイライトが弾ける。',
  'hold.trackBreath': '呼吸のように字間が開閉する。',
  'hold.trackBeat': 'ビートに合わせて字間が弾む。',
};

function lookup(table, key) {
  return String(key)
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);
}

function nameOf(group, type) {
  const label = lookup(strings.ja.fx, `${fx.baseOf(group)}.${type}`);
  if (typeof label === 'string' && label.trim()) return label;
  return type;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function rows() {
  const out = [];
  for (const group of GROUPS) {
    // the extended pack lives in the same groups; include it too
    for (const descriptor of fx.list(group, { packs: 'all' })) {
      const vector = fxAxes.of(fx.baseOf(group), descriptor.type);
      out.push({
        group,
        groupLabel: GROUP_LABELS[group] || group,
        name: nameOf(group, descriptor.type),
        id: `${group}.${descriptor.type}`,
        description: DESCRIPTIONS[`${group}.${descriptor.type}`] || '',
        smartness: smartness.rate(fx.baseOf(group), descriptor.type),
        axes: vector,
      });
    }
  }
  return out;
}

function toCsv(list) {
  const lines = ['グループ,名前,ID,スマート度,速度,激しさ,やわらかさ,情報量,明るさ,ヘンさ,恐怖,説明'];
  for (const row of list) {
    const axes = row.axes || {};
    const cells = [
      row.groupLabel,
      row.name,
      row.id,
      Number(row.smartness.toFixed(2)),
      Number((axes.speed == null ? 0.5 : axes.speed).toFixed(2)),
      Number((axes.energy == null ? 0.5 : axes.energy).toFixed(2)),
      Number((axes.softness == null ? 0.5 : axes.softness).toFixed(2)),
      Number((axes.density == null ? 0.5 : axes.density).toFixed(2)),
      Number((axes.brightness == null ? 0.5 : axes.brightness).toFixed(2)),
      Number((axes.weird == null ? 0.5 : axes.weird).toFixed(2)),
      Number((axes.fear == null ? 0.2 : axes.fear).toFixed(2)),
      row.description,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  // the BOM keeps Excel from showing the Japanese text as mojibake
  return `\ufeff${lines.join('\n')}\n`;
}

function main() {
  const list = rows();
  const missing = list.filter((row) => !row.description);
  const file = path.join(ROOT, 'doc', 'effects.csv');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv(list), 'utf8');
  console.log(`effects: ${file} (${list.length} types)`);
  for (const row of missing) console.log(`  missing description: ${row.id} (${row.name})`);
  return missing.length ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { GROUPS, GROUP_LABELS, DESCRIPTIONS, rows, toCsv, main };
