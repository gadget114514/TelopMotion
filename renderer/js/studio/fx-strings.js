(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fxStrings = api;
    if (root.SA.i18n && typeof root.SA.i18n.registerStrings === 'function') root.SA.i18n.registerStrings(api);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const en = {
    animation: {
      stagger: 'Stagger', simultaneous: 'Simultaneous', cascade: 'Cascade', spring: 'Spring', followThrough: 'Follow-through',
      stopMotion: 'Stop motion', timeWarp: 'Time warp', loop: 'Loop', echo: 'Echo',
    },
    layout: {
      row: 'Row', vertical: 'Vertical', circle: 'Circle', arc: 'Arc', spiral: 'Spiral', wave: 'Wave', diagonal: 'Diagonal',
      staircase: 'Staircase', grid: 'Grid', stackedWords: 'Stacked words', scatter: 'Scatter', path: 'Path',
    },
    enter: {
      fade: 'Fade', typewriter: 'Typewriter', slide: 'Slide', dropBounce: 'Drop bounce', zoomIn: 'Zoom in', blurIn: 'Blur in',
      flip3D: '3D flip', rotateIn: 'Rotate in', scatterIn: 'Scatter in', waveRise: 'Wave rise', elasticPop: 'Elastic pop',
      scramble: 'Scramble', glitchIn: 'Glitch in', neonFlicker: 'Neon flicker', strokeDrawOn: 'Stroke draw-on',
      particlesAssemble: 'Particles assemble', shatterRebuild: 'Shatter rebuild', morphFromPrevious: 'Morph from previous',
      noiseDissolveIn: 'Noise dissolve in',
    },
    exit: {
      fade: 'Fade', slide: 'Slide', zoomOut: 'Zoom out', blurOut: 'Blur out', explode: 'Explode', gravityFall: 'Gravity fall',
      dissolve: 'Dissolve', wipe: 'Wipe', typewriterReverse: 'Typewriter reverse', shrinkToCenter: 'Shrink to center',
      particlesDisperse: 'Particles disperse', melt: 'Melt', burnAway: 'Burn away', strokeErase: 'Stroke erase',
    },
    hold: {
      none: 'None', floatBob: 'Float bob', sineWave: 'Sine wave', jitter: 'Jitter', pulse: 'Pulse', opacityPulse: 'Opacity pulse', kenBurns: 'Ken Burns',
      drift: 'Drift', sway: 'Sway', marquee: 'Marquee', jelly: 'Jelly', wobbleWarp: 'Wobble warp', twist: 'Twist',
      breathing: 'Breathing', orbit3D: '3D orbit', pathFollow: 'Path follow',
    },
    location: {
      center: 'Center', lowerThird: 'Lower third', upperThird: 'Upper third', left: 'Left', right: 'Right', karaoke: 'Karaoke',
      stacked: 'Stacked', randomSafe: 'Random (safe area)', badgeAnchored: 'Badge anchored', custom: 'Custom',
    },
    fill: {
      solid: 'Solid', categoryColor: 'Category color', gradientSweep: 'Gradient sweep', rainbowFlow: 'Rainbow flow',
      holographic: 'Holographic', chrome: 'Chrome', goldFoil: 'Gold foil', fire: 'Fire', caustics: 'Caustics', marble: 'Marble',
      glass: 'Glass', textureFill: 'Texture fill', karaokeWipe: 'Karaoke wipe',
    },
    edge: {
      outline: 'Outline', neonGlow: 'Neon glow', innerGlow: 'Inner glow', bevel: 'Bevel', extrude: 'Extrude',
      longShadow: 'Long shadow', dropShadow: 'Drop shadow',
    },
    post: {
      glitchBlocks: 'Glitch blocks', rgbShift: 'RGB shift', scanTear: 'Scan tear', vhsTracking: 'VHS tracking',
      dataSmear: 'Data smear', digitalNoise: 'Digital noise', glitchSlice: 'Glitch slice', noiseDissolve: 'Noise dissolve',
      directionalDissolve: 'Directional dissolve', pixelDissolve: 'Pixel dissolve', burnDissolve: 'Burn dissolve',
      halftoneDissolve: 'Halftone dissolve', particleDissolve: 'Particle dissolve', shockwave: 'Shockwave', zoomBlur: 'Zoom blur',
      motionBlur: 'Motion blur', echoTrail: 'Echo trail', godRays: 'God rays', lightSweep: 'Light sweep',
      kaleidoscope: 'Kaleidoscope', mirror: 'Mirror', pixelSort: 'Pixel sort', lensDistortion: 'Lens distortion',
      colorGrade: 'Color grade', displacementMap: 'Displacement map', bloom: 'Bloom', chromaticAberration: 'Chromatic aberration',
      crt: 'CRT', filmGrain: 'Film grain', halftone: 'Halftone', pixelate: 'Pixelate', heatHaze: 'Heat haze', lightLeak: 'Light leak',
      vignette: 'Vignette', sparkles: 'Sparkles', lensFlare: 'Lens flare',
    },
    background: {
      none: 'None', solid: 'Solid', gradient: 'Gradient', noiseGradient: 'Noise gradient', card: 'Achievement card', cover: 'Song cover', image: 'Image', shapes: 'Shapes', pattern: 'Pattern',
    },
    param: {
      order: 'Order', each: 'Interval', ease: 'Ease', from: 'Start', unit: 'Unit', exitOrder: 'Exit order', overlap: 'Overlap',
      stiffness: 'Stiffness', damping: 'Damping', amount: 'Amount', decay: 'Decay', fps: 'FPS', period: 'Period', yoyo: 'Yoyo',
      fromFormation: 'Start formation', curve: 'Curve', curveDir: 'Curve direction', to: 'End', columnGap: 'Column gap',
      radius: 'Radius', startAngle: 'Start angle', clockwise: 'Clockwise', faceOut: 'Face outward', sweep: 'Sweep', bulge: 'Bulge',
      r0: 'Inner radius', r1: 'Outer radius', turns: 'Turns', amp: 'Amplitude', wavelength: 'Wavelength', phase: 'Phase',
      angle: 'Angle', followAngle: 'Follow angle', step: 'Step', cols: 'Columns', gap: 'Gap', fillWidth: 'Row width',
      spread: 'Spread', safeArea: 'Safe area', points: 'Points', smooth: 'Smooth', cursor: 'Cursor', cursorColor: 'Cursor color',
      dir: 'Direction', distance: 'Distance', height: 'Height', axis: 'Axis', charset: 'Character set', rate: 'Rate',
      intensity: 'Intensity', flickers: 'Flickers', width: 'Width', fillDelay: 'Fill delay', count: 'Count', kind: 'Kind', set: 'Set', mode: 'Mode', min: 'Minimum', delay: 'Delay',
      turbulence: 'Turbulence', spin: 'Spin', scale: 'Scale', edgeColor: 'Edge color', edgeWidth: 'Edge width', gravity: 'Gravity',
      drift: 'Drift', drip: 'Drip', emberColor: 'Ember color', charColor: 'Character color', speed: 'Speed', freq: 'Frequency',
      bpm: 'BPM', zoom: 'Zoom', pan: 'Pan', vx: 'X speed', vy: 'Y speed', tilt: 'Tilt', offsetX: 'X offset', offsetY: 'Y offset',
      x: 'X', y: 'Y', saturation: 'Saturation', lightness: 'Lightness', perLetter: 'Per letter', iridescence: 'Iridescence',
      fresnel: 'Fresnel', envColors: 'Environment colors', sharpness: 'Sharpness', grain: 'Grain', sparkle: 'Sparkle',
      colors: 'Colors', colorA: 'Color A', colorB: 'Color B', veins: 'Veins', refraction: 'Refraction', blur: 'Blur', tint: 'Tint',
      imageId: 'Image', colorBefore: 'Color before', colorAfter: 'Color after', softness: 'Softness', color: 'Color', bloom: 'Bloom',
      depth: 'Depth', lightAngle: 'Light angle', highlight: 'Highlight', shadow: 'Shadow', colorNear: 'Near color',
      colorFar: 'Far color', length: 'Length', fade: 'Fade', offset: 'Offset', opacity: 'Opacity', blockSize: 'Block size',
      rgbSplit: 'RGB split', enabled: 'Enabled', in: 'Envelope in', out: 'Envelope out', jitter: 'Jitter', lines: 'Lines',
      noise: 'Noise', rollSpeed: 'Roll speed', direction: 'Direction', threshold: 'Threshold', density: 'Density',
      slices: 'Slices', noiseMix: 'Noise mix', cellSize: 'Cell size', dotSize: 'Dot size', center: 'Center', strength: 'Strength',
      samples: 'Samples', shutter: 'Shutter', copies: 'Copies', spacing: 'Spacing', weight: 'Weight', segments: 'Segments',
      rotation: 'Rotation', k1: 'Distortion K1', k2: 'Distortion K2', chroma: 'Chroma', lift: 'Lift', posterize: 'Posterize',
      duotone: 'Duotone', scroll: 'Scroll', radial: 'Radial', scanlines: 'Scanlines', curvature: 'Curvature', vignette: 'Vignette',
      size: 'Size', position: 'Position', dim: 'Dim', focusBadge: 'Focus badge', parallax: 'Parallax', songId: 'Song',
      zoomSpeed: 'Zoom speed', fit: 'Fit',
    },
    value: {
      alternate: 'Alternate', arc: 'Arc', 'center-out': 'Center out', center: 'Center', circle: 'Circle', contain: 'Contain', corners: 'Corners',
      cover: 'Cover', depth: 'Depth', diagonal: 'Diagonal', digits: 'Digits', down: 'Down', 'edges-in': 'Edges in',
      formation: 'Formation', grid: 'Grid', horizontal: 'Horizontal', katakana: 'Katakana', latin: 'Latin', left: 'Left', letter: 'Letter', line: 'Line',
      ltr: 'Left to right', mirror: 'Mirror', none: 'None', oddEven: 'Odd / even', offscreenEdges: 'Offscreen edges', path: 'Path',
      point: 'Point', previousCue: 'Previous cue', random: 'Random', reverse: 'Reverse', right: 'Right', ring: 'Ring', row: 'Row',
      rtl: 'Right to left', same: 'Same', scatter: 'Scatter', spiral: 'Spiral', stackedWords: 'Stacked words', staircase: 'Staircase',
      strokeLength: 'Stroke length', symbols: 'Symbols', up: 'Up', vertical: 'Vertical', 'vertical-reading': 'Vertical writing',
      wave: 'Wave', word: 'Word', x: 'X', y: 'Y', shapes: 'Shapes', particles: 'Particles', waveform: 'Waveform', spectrum: 'Spectrum',
      sineWave: 'Sine wave', progress: 'Progress', circles: 'Circles', polygons: 'Polygons', lines: 'Lines', burst: 'Burst', orbit: 'Orbit',
      dots: 'Dots', stripes: 'Stripes', rings: 'Rings',
    },
  };

  const ja = {
    animation: {
      stagger: 'スタッガー', simultaneous: '同時', cascade: 'カスケード', spring: 'スプリング', followThrough: 'フォロースルー',
      stopMotion: 'ストップモーション', timeWarp: 'タイムワープ', loop: 'ループ', echo: 'エコー',
    },
    layout: {
      row: '行', vertical: '縦組み', circle: '円', arc: '円弧', spiral: '渦巻き', wave: '波', diagonal: '斜め',
      staircase: '階段', grid: 'グリッド', stackedWords: '積み重ね語', scatter: '散布', path: 'パス',
    },
    enter: {
      fade: 'フェード', typewriter: 'タイプライター', slide: 'スライド', dropBounce: '落下バウンド', zoomIn: 'ズームイン',
      blurIn: 'ブラーイン', flip3D: '3Dフリップ', rotateIn: '回転イン', scatterIn: '散布イン', waveRise: '波立ち',
      elasticPop: 'エラスティックポップ', scramble: 'スクランブル', glitchIn: 'グリッチイン', neonFlicker: 'ネオンフリッカー',
      strokeDrawOn: 'ストローク描画', particlesAssemble: 'パーティクル集合', shatterRebuild: '粉砕再構築',
      morphFromPrevious: '前ビートからモーフ', noiseDissolveIn: 'ノイズディゾルブイン',
    },
    exit: {
      fade: 'フェード', slide: 'スライド', zoomOut: 'ズームアウト', blurOut: 'ブラーアウト', explode: '爆発',
      gravityFall: '重力落下', dissolve: 'ディゾルブ', wipe: 'ワイプ', typewriterReverse: 'タイプライター逆再生',
      shrinkToCenter: '中心へ収縮', particlesDisperse: 'パーティクル拡散', melt: '溶解', burnAway: '燃え尽き',
      strokeErase: 'ストローク消去',
    },
    hold: {
      none: 'なし', floatBob: '浮遊', sineWave: 'サイン波', jitter: 'ジッター', pulse: 'パルス', opacityPulse: '透明度パルス', kenBurns: 'ケン・バーンズ',
      drift: 'ドリフト', sway: 'スウェイ', marquee: 'マーキー', jelly: 'ゼリー', wobbleWarp: 'うねりワープ', twist: 'ツイスト',
      breathing: 'ブリージング', orbit3D: '3Dオービット', pathFollow: 'パス追従',
    },
    location: {
      center: '中央', lowerThird: '下三分の一', upperThird: '上三分の一', left: '左', right: '右', karaoke: 'カラオケ',
      stacked: '積み重ね', randomSafe: 'ランダム（安全領域）', badgeAnchored: 'バッジ固定', custom: 'カスタム',
    },
    fill: {
      solid: '単色', categoryColor: 'カテゴリ色', gradientSweep: 'グラデーションスイープ', rainbowFlow: 'レインボーフロー',
      holographic: 'ホログラフィック', chrome: 'クローム', goldFoil: '金箔', fire: '炎', caustics: 'コースティクス',
      marble: '大理石', glass: 'ガラス', textureFill: 'テクスチャ', karaokeWipe: 'カラオケワイプ',
    },
    edge: {
      outline: '縁取り', neonGlow: 'ネオン', innerGlow: '内側グロー', bevel: 'ベベル', extrude: '押し出し',
      longShadow: 'ロングシャドウ', dropShadow: 'ドロップシャドウ',
    },
    post: {
      glitchBlocks: 'グリッチブロック', rgbShift: 'RGBシフト', scanTear: 'スキャンティア', vhsTracking: 'VHSトラッキング',
      dataSmear: 'データスミア', digitalNoise: 'デジタルノイズ', glitchSlice: 'グリッチスライス',
      noiseDissolve: 'ノイズディゾルブ', directionalDissolve: '方向ディゾルブ', pixelDissolve: 'ピクセルディゾルブ',
      burnDissolve: '燃焼ディゾルブ', halftoneDissolve: 'ハーフトーンディゾルブ', particleDissolve: 'パーティクルディゾルブ',
      shockwave: '衝撃波', zoomBlur: 'ズームブラー', motionBlur: 'モーションブラー', echoTrail: 'エコートレイル',
      godRays: 'ゴッドレイ', lightSweep: 'ライトスイープ', kaleidoscope: '万華鏡', mirror: 'ミラー',
      pixelSort: 'ピクセルソート', lensDistortion: 'レンズ歪み', colorGrade: 'カラーグレード', displacementMap: '変位マップ',
      bloom: 'ブルーム', chromaticAberration: '色収差', crt: 'CRT', filmGrain: 'フィルムグレイン', halftone: 'ハーフトーン',
      pixelate: 'ピクセル化', heatHaze: '陽炎', lightLeak: 'ライトリーク', vignette: 'ビネット', sparkles: 'スパークル',
      lensFlare: 'レンズフレア',
    },
    background: {
      none: 'なし', solid: '単色', gradient: 'グラデーション', noiseGradient: 'ノイズグラデーション', card: '実績カード', cover: '楽曲カバー', image: '画像', shapes: '図形', pattern: 'パターン',
    },
    param: {
      order: '順序', each: '間隔', ease: 'イージング', from: '開始位置', unit: '単位', exitOrder: '退場順序', overlap: '重なり',
      stiffness: '剛性', damping: '減衰', amount: '量', decay: '減衰量', fps: 'FPS', period: '周期', yoyo: '往復',
      fromFormation: '開始フォーメーション', curve: 'カーブ', curveDir: 'カーブ方向', to: '終了位置', columnGap: '列間隔',
      radius: '半径', startAngle: '開始角度', clockwise: '時計回り', faceOut: '外向き', sweep: 'スイープ', bulge: '膨らみ',
      r0: '内側半径', r1: '外側半径', turns: '巻き数', amp: '振幅', wavelength: '波長', phase: '位相', angle: '角度',
      followAngle: '追従角度', step: '段差', cols: '列数', gap: '間隔', fillWidth: '行幅', spread: '広がり',
      safeArea: '安全領域', points: 'ポイント', smooth: 'なめらか', cursor: 'カーソル', cursorColor: 'カーソル色',
      dir: '方向', distance: '距離', height: '高さ', axis: '軸', charset: '文字セット', rate: '頻度', intensity: '強度',
      flickers: '明滅回数', width: '幅', fillDelay: '塗り開始', count: '数', kind: '種類', set: 'セット', mode: 'モード', min: '最小', delay: '遅延', turbulence: '乱流', spin: 'スピン', scale: 'スケール',
      edgeColor: '縁の色', edgeWidth: '縁の幅', gravity: '重力', drift: '漂流', drip: '滴り', emberColor: '火の粉の色',
      charColor: '文字の色', speed: '速度', freq: '周波数', bpm: 'BPM', zoom: 'ズーム', pan: 'パン', vx: '横速度', vy: '縦速度',
      tilt: '傾き', offsetX: 'Xオフセット', offsetY: 'Yオフセット', x: 'X', y: 'Y', saturation: '彩度', lightness: '明度',
      perLetter: '文字ごと', iridescence: '虹彩', fresnel: 'フレネル', envColors: '環境色', sharpness: 'シャープネス',
      grain: '粒子', sparkle: 'きらめき', colors: '色セット', colorA: '色A', colorB: '色B', veins: '脈理', refraction: '屈折',
      blur: 'ブラー', tint: '色味', imageId: '画像', colorBefore: '前の色', colorAfter: '後の色', softness: 'ぼかし',
      color: '色', bloom: 'ブルーム', depth: '深さ', lightAngle: '光の角度', highlight: 'ハイライト', shadow: '影',
      colorNear: '手前の色', colorFar: '奥の色', length: '長さ', fade: 'フェード', offset: 'オフセット',
      opacity: '不透明度', blockSize: 'ブロックサイズ', rgbSplit: 'RGB分離', enabled: '有効', in: 'エンベロープ開始',
      out: 'エンベロープ終了', jitter: 'ジッター', lines: 'ライン数', noise: 'ノイズ', rollSpeed: 'ロール速度',
      direction: '方向', threshold: 'しきい値', density: '密度', slices: 'スライス数', noiseMix: 'ノイズ混合',
      cellSize: 'セルサイズ', dotSize: 'ドットサイズ', center: '中心', strength: '強さ', samples: 'サンプル数',
      shutter: 'シャッター', copies: 'コピー数', spacing: '間隔', weight: '重み', segments: '分割数', rotation: '回転',
      k1: '歪みK1', k2: '歪みK2', chroma: '色収差', lift: 'リフト', posterize: 'ポスタライズ', duotone: 'デュオトーン',
      scroll: 'スクロール', radial: 'ラジアル', scanlines: '走査線', curvature: '湾曲', vignette: 'ビネット', size: 'サイズ',
      position: '位置', dim: '暗さ', focusBadge: 'バッジに注目', parallax: '視差', songId: '楽曲', zoomSpeed: 'ズーム速度',
      fit: 'フィット',
    },
    value: {
      alternate: '交互', arc: '円弧', 'center-out': '中央から外へ', center: '中央', circle: '円', contain: '収める', corners: '四隅',
      cover: '覆う', depth: '奥行き', diagonal: '斜め', digits: '数字', down: '下', 'edges-in': '端から内へ',
      formation: 'フォーメーション', grid: 'グリッド', horizontal: '横組み', katakana: 'カタカナ', latin: 'ラテン', left: '左', letter: '文字',
      line: '行', ltr: '左から右', mirror: 'ミラー', none: 'なし', oddEven: '奇数偶数', offscreenEdges: '画面外の端',
      path: 'パス', point: '点', previousCue: '前のキュー', random: 'ランダム', reverse: '逆', right: '右', ring: 'リング',
      row: '行', rtl: '右から左', same: '同じ', scatter: '散布', spiral: '渦巻き', stackedWords: '積み重ね語',
      staircase: '階段', strokeLength: 'ストローク長', symbols: '記号', up: '上', vertical: '縦組み',
      'vertical-reading': '縦書き', wave: '波', word: '単語', x: 'X', y: 'Y', shapes: '図形', particles: 'パーティクル', waveform: '波形',
      spectrum: 'スペクトラム', sineWave: 'サイン波', progress: '進捗', circles: '円', polygons: '多角形', lines: '線', burst: 'バースト', orbit: '軌道',
      dots: 'ドット', stripes: 'ストライプ', rings: 'リング',
    },
  };

  const es = {
    animation: {
      stagger: 'Escalonado', simultaneous: 'Simultáneo', cascade: 'Cascada', spring: 'Resorte', followThrough: 'Continuación',
      stopMotion: 'Stop motion', timeWarp: 'Distorsión temporal', loop: 'Bucle', echo: 'Eco',
    },
    layout: {
      row: 'Fila', vertical: 'Vertical', circle: 'Círculo', arc: 'Arco', spiral: 'Espiral', wave: 'Onda', diagonal: 'Diagonal',
      staircase: 'Escalera', grid: 'Cuadrícula', stackedWords: 'Palabras apiladas', scatter: 'Dispersión', path: 'Trayectoria',
    },
    enter: {
      fade: 'Fundido', typewriter: 'Máquina de escribir', slide: 'Deslizar', dropBounce: 'Caída con rebote',
      zoomIn: 'Acercar', blurIn: 'Desenfoque de entrada', flip3D: 'Giro 3D', rotateIn: 'Rotación de entrada',
      scatterIn: 'Dispersión de entrada', waveRise: 'Ola ascendente', elasticPop: 'Estallido elástico',
      scramble: 'Mezcla de letras', glitchIn: 'Glitch de entrada', neonFlicker: 'Parpadeo de neón',
      strokeDrawOn: 'Trazo progresivo', particlesAssemble: 'Ensamblaje de partículas', shatterRebuild: 'Fragmentar y reconstruir',
      morphFromPrevious: 'Morph desde el anterior', noiseDissolveIn: 'Disolución con ruido',
    },
    exit: {
      fade: 'Fundido', slide: 'Deslizar', zoomOut: 'Alejar', blurOut: 'Desenfoque de salida', explode: 'Explosión',
      gravityFall: 'Caída por gravedad', dissolve: 'Disolución', wipe: 'Barrido', typewriterReverse: 'Máquina de escribir inversa',
      shrinkToCenter: 'Encoger al centro', particlesDisperse: 'Dispersión de partículas', melt: 'Derretir',
      burnAway: 'Consumir por fuego', strokeErase: 'Borrado de trazo',
    },
    hold: {
      none: 'Ninguno', floatBob: 'Flotación', sineWave: 'Onda senoidal', jitter: 'Vibración', pulse: 'Pulso', opacityPulse: 'Pulso de opacidad',
      kenBurns: 'Ken Burns', drift: 'Deriva', sway: 'Balanceo', marquee: 'Marquesina', jelly: 'Gelatina',
      wobbleWarp: 'Deformación ondulante', twist: 'Torsión', breathing: 'Respiración', orbit3D: 'Órbita 3D',
      pathFollow: 'Seguir trayectoria',
    },
    location: {
      center: 'Centro', lowerThird: 'Tercio inferior', upperThird: 'Tercio superior', left: 'Izquierda', right: 'Derecha',
      karaoke: 'Karaoke', stacked: 'Apilado', randomSafe: 'Aleatorio (zona segura)', badgeAnchored: 'Anclado al logro',
      custom: 'Personalizado',
    },
    fill: {
      solid: 'Sólido', categoryColor: 'Color de categoría', gradientSweep: 'Barrido de degradado', rainbowFlow: 'Flujo arcoíris',
      holographic: 'Holográfico', chrome: 'Cromo', goldFoil: 'Pan de oro', fire: 'Fuego', caustics: 'Cáusticas', marble: 'Mármol',
      glass: 'Cristal', textureFill: 'Textura', karaokeWipe: 'Barrido karaoke',
    },
    edge: {
      outline: 'Contorno', neonGlow: 'Brillo de neón', innerGlow: 'Brillo interior', bevel: 'Bisel', extrude: 'Extrusión',
      longShadow: 'Sombra larga', dropShadow: 'Sombra paralela',
    },
    post: {
      glitchBlocks: 'Bloques glitch', rgbShift: 'Desplazamiento RGB', scanTear: 'Desgarro de escaneo',
      vhsTracking: 'Seguimiento VHS', dataSmear: 'Arrastre de datos', digitalNoise: 'Ruido digital', glitchSlice: 'Corte glitch',
      noiseDissolve: 'Disolución con ruido', directionalDissolve: 'Disolución direccional', pixelDissolve: 'Disolución de píxeles',
      burnDissolve: 'Disolución por fuego', halftoneDissolve: 'Disolución de semitono', particleDissolve: 'Disolución de partículas',
      shockwave: 'Onda expansiva', zoomBlur: 'Desenfoque de zoom', motionBlur: 'Desenfoque de movimiento', echoTrail: 'Estela',
      godRays: 'Rayos de luz', lightSweep: 'Barrido de luz', kaleidoscope: 'Caleidoscopio', mirror: 'Espejo',
      pixelSort: 'Orden de píxeles', lensDistortion: 'Distorsión de lente', colorGrade: 'Etalonaje',
      displacementMap: 'Mapa de desplazamiento', bloom: 'Resplandor', chromaticAberration: 'Aberración cromática', crt: 'CRT',
      filmGrain: 'Grano de película', halftone: 'Semitono', pixelate: 'Pixelar', heatHaze: 'Calima', lightLeak: 'Fuga de luz',
      vignette: 'Viñeta', sparkles: 'Destellos', lensFlare: 'Reflejo de lente',
    },
    background: {
      none: 'Ninguno', solid: 'Sólido', gradient: 'Degradado', noiseGradient: 'Degradado con ruido', card: 'Tarjeta de logros', shapes: 'Formas', pattern: 'Patrón',
      cover: 'Portada de la canción', image: 'Imagen',
    },
    param: {
      order: 'Orden', each: 'Intervalo', ease: 'Facilidad', from: 'Inicio', unit: 'Unidad', exitOrder: 'Orden de salida',
      overlap: 'Solapamiento', stiffness: 'Rigidez', damping: 'Amortiguación', amount: 'Cantidad', decay: 'Caída', fps: 'FPS',
      period: 'Periodo', yoyo: 'Yoyó', fromFormation: 'Formación inicial', curve: 'Curva', curveDir: 'Dirección de la curva',
      to: 'Fin', columnGap: 'Separación de columnas', radius: 'Radio', startAngle: 'Ángulo inicial', clockwise: 'Sentido horario',
      faceOut: 'Hacia fuera', sweep: 'Barrido', bulge: 'Abultamiento', r0: 'Radio interior', r1: 'Radio exterior', turns: 'Vueltas',
      amp: 'Amplitud', wavelength: 'Longitud de onda', phase: 'Fase', angle: 'Ángulo', followAngle: 'Ángulo de seguimiento',
      step: 'Escalón', cols: 'Columnas', gap: 'Separación', fillWidth: 'Ancho de fila', spread: 'Dispersión',
      safeArea: 'Zona segura', points: 'Puntos', smooth: 'Suavizado', cursor: 'Cursor', cursorColor: 'Color del cursor',
      dir: 'Dirección', distance: 'Distancia', height: 'Altura', axis: 'Eje', charset: 'Juego de caracteres', rate: 'Frecuencia',
      intensity: 'Intensidad', flickers: 'Parpadeos', width: 'Ancho', fillDelay: 'Retardo de relleno', count: 'Cantidad', kind: 'Clase', set: 'Conjunto', mode: 'Modo', min: 'Mínimo', delay: 'Retardo',
      turbulence: 'Turbulencia', spin: 'Giro', scale: 'Escala', edgeColor: 'Color del borde', edgeWidth: 'Ancho del borde',
      gravity: 'Gravedad', drift: 'Deriva', drip: 'Goteo', emberColor: 'Color de brasas', charColor: 'Color del texto',
      speed: 'Velocidad', freq: 'Frecuencia', bpm: 'BPM', zoom: 'Zoom', pan: 'Desplazamiento', vx: 'Velocidad X', vy: 'Velocidad Y',
      tilt: 'Inclinación', offsetX: 'Desplaz. X', offsetY: 'Desplaz. Y', x: 'X', y: 'Y', saturation: 'Saturación',
      lightness: 'Luminosidad', perLetter: 'Por letra', iridescence: 'Iridiscencia', fresnel: 'Fresnel',
      envColors: 'Colores de entorno', sharpness: 'Nitidez', grain: 'Grano', sparkle: 'Destello', colors: 'Colores',
      colorA: 'Color A', colorB: 'Color B', veins: 'Vetas', refraction: 'Refracción', blur: 'Desenfoque', tint: 'Matiz',
      imageId: 'Imagen', colorBefore: 'Color anterior', colorAfter: 'Color posterior', softness: 'Suavidad', color: 'Color',
      bloom: 'Resplandor', depth: 'Profundidad', lightAngle: 'Ángulo de luz', highlight: 'Brillo', shadow: 'Sombra',
      colorNear: 'Color cercano', colorFar: 'Color lejano', length: 'Longitud', fade: 'Fundido', offset: 'Desplazamiento',
      opacity: 'Opacidad', blockSize: 'Tamaño de bloque', rgbSplit: 'Separación RGB', enabled: 'Activado',
      in: 'Inicio de envolvente', out: 'Fin de envolvente', jitter: 'Vibración', lines: 'Líneas', noise: 'Ruido',
      rollSpeed: 'Velocidad de rodillo', direction: 'Dirección', threshold: 'Umbral', density: 'Densidad', slices: 'Cortes',
      noiseMix: 'Mezcla de ruido', cellSize: 'Tamaño de celda', dotSize: 'Tamaño de punto', center: 'Centro', strength: 'Fuerza',
      samples: 'Muestras', shutter: 'Obturador', copies: 'Copias', spacing: 'Espaciado', weight: 'Peso', segments: 'Segmentos',
      rotation: 'Rotación', k1: 'Distorsión K1', k2: 'Distorsión K2', chroma: 'Croma', lift: 'Elevación',
      posterize: 'Posterizar', duotone: 'Duotono', scroll: 'Desplazamiento', radial: 'Radial', scanlines: 'Líneas de escaneo',
      curvature: 'Curvatura', vignette: 'Viñeta', size: 'Tamaño', position: 'Posición', dim: 'Atenuación',
      focusBadge: 'Enfocar logro', parallax: 'Paralaje', songId: 'Canción', zoomSpeed: 'Velocidad de zoom', fit: 'Ajuste',
    },
    value: {
      alternate: 'Alterno', arc: 'Arco', 'center-out': 'Del centro hacia fuera', center: 'Centro', circle: 'Círculo', contain: 'Contener',
      corners: 'Esquinas', cover: 'Cubrir', depth: 'Profundidad', diagonal: 'Diagonal', digits: 'Dígitos', down: 'Abajo',
      'edges-in': 'De los bordes hacia dentro', formation: 'Formación', grid: 'Cuadrícula', horizontal: 'Horizontal', katakana: 'Katakana', latin: 'Latino',
      left: 'Izquierda', letter: 'Letra', line: 'Línea', ltr: 'De izquierda a derecha', mirror: 'Espejo', none: 'Ninguno',
      oddEven: 'Par / impar', offscreenEdges: 'Bordes fuera de pantalla', path: 'Trayectoria', point: 'Punto',
      previousCue: 'Cue anterior', random: 'Aleatorio', reverse: 'Inverso', right: 'Derecha', ring: 'Anillo', row: 'Fila',
      rtl: 'De derecha a izquierda', same: 'Igual', scatter: 'Dispersión', spiral: 'Espiral', stackedWords: 'Palabras apiladas',
      staircase: 'Escalera', strokeLength: 'Longitud del trazo', symbols: 'Símbolos', up: 'Arriba', vertical: 'Vertical',
      'vertical-reading': 'Escritura vertical', wave: 'Onda', word: 'Palabra', x: 'X', y: 'Y', shapes: 'Formas', particles: 'Partículas',
      waveform: 'Forma de onda', spectrum: 'Espectro', sineWave: 'Onda senoidal', progress: 'Progreso', circles: 'Círculos',
      polygons: 'Polígonos', lines: 'Líneas', burst: 'Estallido', orbit: 'Órbita', dots: 'Puntos', stripes: 'Rayas', rings: 'Anillos',
    },
  };

  const fr = {
    animation: {
      stagger: 'Décalage', simultaneous: 'Simultané', cascade: 'Cascade', spring: 'Ressort', followThrough: 'Continuité',
      stopMotion: 'Stop motion', timeWarp: 'Distorsion temporelle', loop: 'Boucle', echo: 'Écho',
    },
    layout: {
      row: 'Ligne', vertical: 'Vertical', circle: 'Cercle', arc: 'Arc', spiral: 'Spirale', wave: 'Vague', diagonal: 'Diagonale',
      staircase: 'Escalier', grid: 'Grille', stackedWords: 'Mots empilés', scatter: 'Dispersion', path: 'Chemin',
    },
    enter: {
      fade: 'Fondu', typewriter: 'Machine à écrire', slide: 'Glissement', dropBounce: 'Chute rebondissante', zoomIn: 'Zoom avant',
      blurIn: 'Flou d’entrée', flip3D: 'Retournement 3D', rotateIn: 'Rotation d’entrée', scatterIn: 'Dispersion d’entrée',
      waveRise: 'Vague montante', elasticPop: 'Pop élastique', scramble: 'Brouillage', glitchIn: 'Glitch d’entrée',
      neonFlicker: 'Scintillement néon', strokeDrawOn: 'Tracé progressif', particlesAssemble: 'Assemblage de particules',
      shatterRebuild: 'Briser et reconstruire', morphFromPrevious: 'Morph depuis le précédent',
      noiseDissolveIn: 'Dissolution par bruit',
    },
    exit: {
      fade: 'Fondu', slide: 'Glissement', zoomOut: 'Zoom arrière', blurOut: 'Flou de sortie', explode: 'Explosion',
      gravityFall: 'Chute gravitaire', dissolve: 'Dissolution', wipe: 'Balayage', typewriterReverse: 'Machine à écrire inversée',
      shrinkToCenter: 'Rétrécir au centre', particlesDisperse: 'Dispersion de particules', melt: 'Fonte', burnAway: 'Combustion',
      strokeErase: 'Effacement du tracé',
    },
    hold: {
      none: 'Aucun', floatBob: 'Flottement', sineWave: 'Onde sinusoïdale', jitter: 'Tremblement', pulse: 'Pulsation', opacityPulse: "Pulsation d'opacité",
      kenBurns: 'Ken Burns', drift: 'Dérive', sway: 'Balancement', marquee: 'Marquise', jelly: 'Gelée',
      wobbleWarp: 'Déformation ondulante', twist: 'Torsion', breathing: 'Respiration', orbit3D: 'Orbite 3D',
      pathFollow: 'Suivi de chemin',
    },
    location: {
      center: 'Centre', lowerThird: 'Tiers inférieur', upperThird: 'Tiers supérieur', left: 'Gauche', right: 'Droite',
      karaoke: 'Karaoké', stacked: 'Empilé', randomSafe: 'Aléatoire (zone sûre)', badgeAnchored: 'Ancré au succès',
      custom: 'Personnalisé',
    },
    fill: {
      solid: 'Uni', categoryColor: 'Couleur de catégorie', gradientSweep: 'Balayage dégradé', rainbowFlow: 'Flux arc-en-ciel',
      holographic: 'Holographique', chrome: 'Chrome', goldFoil: 'Feuille d’or', fire: 'Feu', caustics: 'Caustiques',
      marble: 'Marbre', glass: 'Verre', textureFill: 'Texture', karaokeWipe: 'Balayage karaoké',
    },
    edge: {
      outline: 'Contour', neonGlow: 'Lueur néon', innerGlow: 'Lueur interne', bevel: 'Biseau', extrude: 'Extrusion',
      longShadow: 'Ombre longue', dropShadow: 'Ombre portée',
    },
    post: {
      glitchBlocks: 'Blocs glitch', rgbShift: 'Décalage RVB', scanTear: 'Déchirure de balayage', vhsTracking: 'Suivi VHS',
      dataSmear: 'Traînée de données', digitalNoise: 'Bruit numérique', glitchSlice: 'Tranche glitch',
      noiseDissolve: 'Dissolution par bruit', directionalDissolve: 'Dissolution directionnelle', pixelDissolve: 'Dissolution en pixels',
      burnDissolve: 'Dissolution par le feu', halftoneDissolve: 'Dissolution en demi-teintes',
      particleDissolve: 'Dissolution en particules', shockwave: 'Onde de choc', zoomBlur: 'Flou de zoom',
      motionBlur: 'Flou de mouvement', echoTrail: 'Traînée d’écho', godRays: 'Rayons de lumière', lightSweep: 'Balayage lumineux',
      kaleidoscope: 'Kaléidoscope', mirror: 'Miroir', pixelSort: 'Tri de pixels', lensDistortion: 'Distorsion de lentille',
      colorGrade: 'Étalonnage', displacementMap: 'Carte de déplacement', bloom: 'Halo', chromaticAberration: 'Aberration chromatique',
      crt: 'CRT', filmGrain: 'Grain de film', halftone: 'Demi-teintes', pixelate: 'Pixelliser', heatHaze: 'Brume de chaleur',
      lightLeak: 'Fuite de lumière', vignette: 'Vignettage', sparkles: 'Étincelles', lensFlare: 'Reflet de lentille',
    },
    background: {
      none: 'Aucun', solid: 'Uni', gradient: 'Dégradé', noiseGradient: 'Dégradé bruité', card: 'Carte de succès', cover: 'Pochette du titre', shapes: 'Formes', pattern: 'Motif',
      image: 'Image',
    },
    param: {
      order: 'Ordre', each: 'Intervalle', ease: 'Courbe', from: 'Début', unit: 'Unité', exitOrder: 'Ordre de sortie',
      overlap: 'Chevauchement', stiffness: 'Raideur', damping: 'Amortissement', amount: 'Quantité', decay: 'Décroissance', fps: 'FPS',
      period: 'Période', yoyo: 'Aller-retour', fromFormation: 'Formation de départ', curve: 'Courbe',
      curveDir: 'Direction de la courbe', to: 'Fin', columnGap: 'Écart de colonnes', radius: 'Rayon',
      startAngle: 'Angle de départ', clockwise: 'Sens horaire', faceOut: 'Vers l’extérieur', sweep: 'Balayage', bulge: 'Renflement',
      r0: 'Rayon interne', r1: 'Rayon externe', turns: 'Tours', amp: 'Amplitude', wavelength: 'Longueur d’onde', phase: 'Phase',
      angle: 'Angle', followAngle: 'Angle de suivi', step: 'Marche', cols: 'Colonnes', gap: 'Écart', fillWidth: 'Largeur de ligne',
      spread: 'Dispersion', safeArea: 'Zone sûre', points: 'Points', smooth: 'Lissage', cursor: 'Curseur',
      cursorColor: 'Couleur du curseur', dir: 'Direction', distance: 'Distance', height: 'Hauteur', axis: 'Axe',
      charset: 'Jeu de caractères', rate: 'Fréquence', intensity: 'Intensité', flickers: 'Scintillements', width: 'Largeur',
      fillDelay: 'Délai de remplissage', count: 'Nombre', kind: 'Sorte', set: 'Ensemble', mode: 'Mode', min: 'Minimum', delay: 'Délai', turbulence: 'Turbulence', spin: 'Rotation', scale: 'Échelle',
      edgeColor: 'Couleur du bord', edgeWidth: 'Largeur du bord', gravity: 'Gravité', drift: 'Dérive', drip: 'Coulure',
      emberColor: 'Couleur des braises', charColor: 'Couleur du texte', speed: 'Vitesse', freq: 'Fréquence', bpm: 'BPM', zoom: 'Zoom',
      pan: 'Panoramique', vx: 'Vitesse X', vy: 'Vitesse Y', tilt: 'Inclinaison', offsetX: 'Décalage X', offsetY: 'Décalage Y',
      x: 'X', y: 'Y', saturation: 'Saturation', lightness: 'Luminosité', perLetter: 'Par lettre', iridescence: 'Iridescence',
      fresnel: 'Fresnel', envColors: 'Couleurs d’environnement', sharpness: 'Netteté', grain: 'Grain', sparkle: 'Éclat',
      colors: 'Couleurs', colorA: 'Couleur A', colorB: 'Couleur B', veins: 'Veines', refraction: 'Réfraction', blur: 'Flou',
      tint: 'Teinte', imageId: 'Image', colorBefore: 'Couleur avant', colorAfter: 'Couleur après', softness: 'Douceur',
      color: 'Couleur', bloom: 'Halo', depth: 'Profondeur', lightAngle: 'Angle de lumière', highlight: 'Reflet', shadow: 'Ombre',
      colorNear: 'Couleur proche', colorFar: 'Couleur lointaine', length: 'Longueur', fade: 'Fondu', offset: 'Décalage',
      opacity: 'Opacité', blockSize: 'Taille de bloc', rgbSplit: 'Séparation RVB', enabled: 'Activé',
      in: 'Début d’enveloppe', out: 'Fin d’enveloppe', jitter: 'Tremblement', lines: 'Lignes', noise: 'Bruit',
      rollSpeed: 'Vitesse de défilement', direction: 'Direction', threshold: 'Seuil', density: 'Densité', slices: 'Tranches',
      noiseMix: 'Mélange de bruit', cellSize: 'Taille de cellule', dotSize: 'Taille de point', center: 'Centre', strength: 'Force',
      samples: 'Échantillons', shutter: 'Obturateur', copies: 'Copies', spacing: 'Espacement', weight: 'Poids', segments: 'Segments',
      rotation: 'Rotation', k1: 'Distorsion K1', k2: 'Distorsion K2', chroma: 'Chroma', lift: 'Rehaussement',
      posterize: 'Postériser', duotone: 'Duotone', scroll: 'Défilement', radial: 'Radial', scanlines: 'Lignes de balayage',
      curvature: 'Courbure', vignette: 'Vignettage', size: 'Taille', position: 'Position', dim: 'Atténuation',
      focusBadge: 'Cibler le succès', parallax: 'Parallaxe', songId: 'Titre', zoomSpeed: 'Vitesse de zoom', fit: 'Ajustement',
    },
    value: {
      alternate: 'Alterné', arc: 'Arc', 'center-out': 'Du centre vers l’extérieur', center: 'Centre', circle: 'Cercle', contain: 'Contenir',
      corners: 'Coins', cover: 'Couvrir', depth: 'Profondeur', diagonal: 'Diagonale', digits: 'Chiffres', down: 'Bas',
      'edges-in': 'Des bords vers l’intérieur', formation: 'Formation', grid: 'Grille', horizontal: 'Horizontal', katakana: 'Katakana', latin: 'Latin',
      left: 'Gauche', letter: 'Lettre', line: 'Ligne', ltr: 'De gauche à droite', mirror: 'Miroir', none: 'Aucun',
      oddEven: 'Pair / impair', offscreenEdges: 'Bords hors écran', path: 'Chemin', point: 'Point', previousCue: 'Cue précédent',
      random: 'Aléatoire', reverse: 'Inversé', right: 'Droite', ring: 'Anneau', row: 'Ligne', rtl: 'De droite à gauche',
      same: 'Identique', scatter: 'Dispersion', spiral: 'Spirale', stackedWords: 'Mots empilés', staircase: 'Escalier',
      strokeLength: 'Longueur du tracé', symbols: 'Symboles', up: 'Haut', vertical: 'Vertical', 'vertical-reading': 'Écriture verticale',
      wave: 'Vague', word: 'Mot', x: 'X', y: 'Y', shapes: 'Formes', particles: 'Particules', waveform: "Forme d'onde", spectrum: 'Spectre',
      sineWave: 'Onde sinusoïdale', progress: 'Progression', circles: 'Cercles', polygons: 'Polygones', lines: 'Lignes', burst: 'Éclat', orbit: 'Orbite',
      dots: 'Points', stripes: 'Rayures', rings: 'Anneaux',
    },
  };

  const ru = {
    animation: {
      stagger: 'Каскадная задержка', simultaneous: 'Одновременно', cascade: 'Каскад', spring: 'Пружина',
      followThrough: 'Инерция', stopMotion: 'Стоп-моушен', timeWarp: 'Искажение времени', loop: 'Цикл', echo: 'Эхо',
    },
    layout: {
      row: 'Строка', vertical: 'Вертикально', circle: 'Круг', arc: 'Дуга', spiral: 'Спираль', wave: 'Волна',
      diagonal: 'Диагональ', staircase: 'Лестница', grid: 'Сетка', stackedWords: 'Стопка слов', scatter: 'Разброс', path: 'Путь',
    },
    enter: {
      fade: 'Растворение', typewriter: 'Печатная машинка', slide: 'Сдвиг', dropBounce: 'Падение с отскоком',
      zoomIn: 'Приближение', blurIn: 'Размытие при входе', flip3D: '3D-переворот', rotateIn: 'Вращение при входе',
      scatterIn: 'Разлёт при входе', waveRise: 'Волновой подъём', elasticPop: 'Упругий скачок', scramble: 'Перемешивание',
      glitchIn: 'Глитч при входе', neonFlicker: 'Мерцание неона', strokeDrawOn: 'Рисование обводки',
      particlesAssemble: 'Сборка из частиц', shatterRebuild: 'Разрушение и сборка', morphFromPrevious: 'Морфинг из прошлого бита',
      noiseDissolveIn: 'Растворение шумом',
    },
    exit: {
      fade: 'Растворение', slide: 'Сдвиг', zoomOut: 'Отдаление', blurOut: 'Размытие при выходе', explode: 'Взрыв',
      gravityFall: 'Падение', dissolve: 'Диссолюция', wipe: 'Шторка', typewriterReverse: 'Печатная машинка наоборот',
      shrinkToCenter: 'Сжатие к центру', particlesDisperse: 'Разлёт частиц', melt: 'Таяние', burnAway: 'Выгорание',
      strokeErase: 'Стирание обводки',
    },
    hold: {
      none: 'Нет', floatBob: 'Покачивание', sineWave: 'Синусоида', jitter: 'Дрожание', pulse: 'Пульсация', opacityPulse: 'Пульс прозрачности',
      kenBurns: 'Кен Бёрнс', drift: 'Дрейф', sway: 'Качание', marquee: 'Бегущая строка', jelly: 'Желе',
      wobbleWarp: 'Волнистая деформация', twist: 'Скручивание', breathing: 'Дыхание', orbit3D: '3D-орбита',
      pathFollow: 'Движение по пути',
    },
    location: {
      center: 'Центр', lowerThird: 'Нижняя треть', upperThird: 'Верхняя треть', left: 'Слева', right: 'Справа',
      karaoke: 'Караоке', stacked: 'Стопкой', randomSafe: 'Случайно (безопасная зона)', badgeAnchored: 'Привязка к награде',
      custom: 'Своя позиция',
    },
    fill: {
      solid: 'Сплошной', categoryColor: 'Цвет категории', gradientSweep: 'Градиентный проход', rainbowFlow: 'Радужный поток',
      holographic: 'Голограмма', chrome: 'Хром', goldFoil: 'Золотая фольга', fire: 'Огонь', caustics: 'Каустика',
      marble: 'Мрамор', glass: 'Стекло', textureFill: 'Текстура', karaokeWipe: 'Караоке-заливка',
    },
    edge: {
      outline: 'Обводка', neonGlow: 'Неоновое свечение', innerGlow: 'Внутреннее свечение', bevel: 'Фаска', extrude: 'Объём',
      longShadow: 'Длинная тень', dropShadow: 'Тень',
    },
    post: {
      glitchBlocks: 'Глитч-блоки', rgbShift: 'Сдвиг RGB', scanTear: 'Разрыв развёртки', vhsTracking: 'VHS-трекинг',
      dataSmear: 'Смазывание данных', digitalNoise: 'Цифровой шум', glitchSlice: 'Глитч-полосы', noiseDissolve: 'Растворение шумом',
      directionalDissolve: 'Направленная диссолюция', pixelDissolve: 'Пиксельная диссолюция', burnDissolve: 'Выгорание',
      halftoneDissolve: 'Полутоновая диссолюция', particleDissolve: 'Растворение на частицы', shockwave: 'Ударная волна',
      zoomBlur: 'Размытие зума', motionBlur: 'Размытие движения', echoTrail: 'Шлейф', godRays: 'Лучи света',
      lightSweep: 'Световой проход', kaleidoscope: 'Калейдоскоп', mirror: 'Зеркало', pixelSort: 'Сортировка пикселей',
      lensDistortion: 'Дисторсия объектива', colorGrade: 'Цветокоррекция', displacementMap: 'Карта смещения', bloom: 'Свечение',
      chromaticAberration: 'Хроматическая аберрация', crt: 'CRT', filmGrain: 'Зерно плёнки', halftone: 'Полутон',
      pixelate: 'Пикселизация', heatHaze: 'Марево', lightLeak: 'Засветка', vignette: 'Виньетка', sparkles: 'Искры',
      lensFlare: 'Блик объектива',
    },
    background: {
      none: 'Нет', solid: 'Сплошной', gradient: 'Градиент', noiseGradient: 'Шумный градиент', card: 'Карточка достижений', shapes: 'Фигуры', pattern: 'Узор',
      cover: 'Обложка трека', image: 'Изображение',
    },
    param: {
      order: 'Порядок', each: 'Интервал', ease: 'Сглаживание', from: 'Начало', unit: 'Единица', exitOrder: 'Порядок выхода',
      overlap: 'Перекрытие', stiffness: 'Жёсткость', damping: 'Затухание', amount: 'Величина', decay: 'Затухание', fps: 'FPS',
      period: 'Период', yoyo: 'Туда-обратно', fromFormation: 'Начальная формация', curve: 'Кривая', curveDir: 'Направление кривой',
      to: 'Конец', columnGap: 'Отступ колонок', radius: 'Радиус', startAngle: 'Начальный угол', clockwise: 'По часовой',
      faceOut: 'Наружу', sweep: 'Развёртка', bulge: 'Выпуклость', r0: 'Внутренний радиус', r1: 'Внешний радиус', turns: 'Витки',
      amp: 'Амплитуда', wavelength: 'Длина волны', phase: 'Фаза', angle: 'Угол', followAngle: 'Угол следования', step: 'Шаг',
      cols: 'Колонки', gap: 'Отступ', fillWidth: 'Ширина строки', spread: 'Разлёт', safeArea: 'Безопасная зона', points: 'Точки',
      smooth: 'Сглаживание', cursor: 'Курсор', cursorColor: 'Цвет курсора', dir: 'Направление', distance: 'Расстояние',
      height: 'Высота', axis: 'Ось', charset: 'Набор символов', rate: 'Частота', intensity: 'Интенсивность',
      flickers: 'Мерцания', width: 'Ширина', fillDelay: 'Задержка заливки', count: 'Количество', kind: 'Вид', set: 'Набор', mode: 'Режим', min: 'Минимум', delay: 'Задержка', turbulence: 'Турбулентность',
      spin: 'Вращение', scale: 'Масштаб', edgeColor: 'Цвет края', edgeWidth: 'Ширина края', gravity: 'Гравитация', drift: 'Дрейф',
      drip: 'Стёк', emberColor: 'Цвет искр', charColor: 'Цвет текста', speed: 'Скорость', freq: 'Частота', bpm: 'BPM',
      zoom: 'Зум', pan: 'Панорама', vx: 'Скорость X', vy: 'Скорость Y', tilt: 'Наклон', offsetX: 'Смещение X',
      offsetY: 'Смещение Y', x: 'X', y: 'Y', saturation: 'Насыщенность', lightness: 'Яркость', perLetter: 'По буквам',
      iridescence: 'Иризация', fresnel: 'Френель', envColors: 'Цвета окружения', sharpness: 'Резкость', grain: 'Зерно',
      sparkle: 'Искры', colors: 'Цвета', colorA: 'Цвет A', colorB: 'Цвет B', veins: 'Прожилки', refraction: 'Преломление',
      blur: 'Размытие', tint: 'Тон', imageId: 'Изображение', colorBefore: 'Цвет до', colorAfter: 'Цвет после',
      softness: 'Мягкость', color: 'Цвет', bloom: 'Свечение', depth: 'Глубина', lightAngle: 'Угол света', highlight: 'Блик',
      shadow: 'Тень', colorNear: 'Ближний цвет', colorFar: 'Дальний цвет', length: 'Длина', fade: 'Затухание',
      offset: 'Смещение', opacity: 'Непрозрачность', blockSize: 'Размер блока', rgbSplit: 'Разделение RGB',
      enabled: 'Включено', in: 'Начало огибающей', out: 'Конец огибающей', jitter: 'Дрожание', lines: 'Линии', noise: 'Шум',
      rollSpeed: 'Скорость прокрутки', direction: 'Направление', threshold: 'Порог', density: 'Плотность', slices: 'Полосы',
      noiseMix: 'Смешивание шума', cellSize: 'Размер ячейки', dotSize: 'Размер точки', center: 'Центр', strength: 'Сила',
      samples: 'Сэмплы', shutter: 'Затвор', copies: 'Копии', spacing: 'Шаг', weight: 'Вес', segments: 'Сегменты',
      rotation: 'Поворот', k1: 'Дисторсия K1', k2: 'Дисторсия K2', chroma: 'Хрома', lift: 'Подъём', posterize: 'Постеризация',
      duotone: 'Дуотон', scroll: 'Прокрутка', radial: 'Радиально', scanlines: 'Строки развёртки', curvature: 'Кривизна',
      vignette: 'Виньетка', size: 'Размер', position: 'Позиция', dim: 'Затемнение', focusBadge: 'Фокус на награде',
      parallax: 'Параллакс', songId: 'Трек', zoomSpeed: 'Скорость зума', fit: 'Вписывание',
    },
    value: {
      alternate: 'Поочерёдно', arc: 'Дуга', 'center-out': 'Из центра наружу', center: 'Центр', circle: 'Круг', contain: 'Вписать',
      corners: 'Углы', cover: 'Заполнить', depth: 'Глубина', diagonal: 'Диагональ', digits: 'Цифры', down: 'Вниз',
      'edges-in': 'От краёв внутрь', formation: 'Формация', grid: 'Сетка', horizontal: 'Горизонтально', katakana: 'Катакана', latin: 'Латиница',
      left: 'Слева', letter: 'Буква', line: 'Строка', ltr: 'Слева направо', mirror: 'Зеркало', none: 'Нет',
      oddEven: 'Чёт / нечет', offscreenEdges: 'За экраном', path: 'Путь', point: 'Точка', previousCue: 'Предыдущий cue',
      random: 'Случайно', reverse: 'Обратный', right: 'Справа', ring: 'Кольцо', row: 'Строка', rtl: 'Справа налево',
      same: 'Такой же', scatter: 'Разброс', spiral: 'Спираль', stackedWords: 'Стопка слов', staircase: 'Лестница',
      strokeLength: 'Длина обводки', symbols: 'Символы', up: 'Вверх', vertical: 'Вертикально',
      'vertical-reading': 'Вертикальное письмо', wave: 'Волна', word: 'Слово', x: 'X', y: 'Y', shapes: 'Фигуры', particles: 'Частицы',
      waveform: 'Волновая форма', spectrum: 'Спектр', sineWave: 'Синусоида', progress: 'Прогресс', circles: 'Круги',
      polygons: 'Многоугольники', lines: 'Линии', burst: 'Вспышка', orbit: 'Орбита', dots: 'Точки', stripes: 'Полосы', rings: 'Кольца',
    },
  };

  // Text background + genre additions. All five languages receive the same key
  // set; non-Japanese languages fall back to the English strings.
  const ADD_EN = {
    types: {
      bgShape: {
        none: 'None', square: 'Square', rounded: 'Rounded', circle: 'Circle', diamond: 'Diamond', ring: 'Ring', bar: 'Bar',
        star: 'Star', blob: 'Blob', heart: 'Heart', splatter: 'Splatter', scratch: 'Scratch', drop: 'Drop', bracket: 'Bracket',
        paper: 'Paper', cloud: 'Cloud',
      },
      bgMotion: {
        follow: 'Follow', fade: 'Fade', pop: 'Pop', stamp: 'Stamp', wipe: 'Wipe', spin: 'Spin', grow: 'Grow', none: 'None',
        flicker: 'Flicker', bleed: 'Bleed', float: 'Float', fall: 'Fall',
      },
      edge: { drip: 'Drip' },
      fill: { ink: 'Ink' },
      enter: { flickerIn: 'Flicker in' },
      exit: { creepOut: 'Creep out' },
      hold: { heartbeat: 'Heartbeat', shiver: 'Shiver' },
    },
    params: {
      unit: 'Unit', lockAspect: 'Lock aspect', rotateWithLetter: 'Rotate with letter', scaleWithLetter: 'Scale with letter',
      knockout: 'Knockout', layer: 'Layer', skipSpaces: 'Skip spaces', skipRate: 'Skip rate',
      fgAutoContrast: 'Auto text contrast', vary: 'Vary', varyColors: 'Vary colors', varyShape: 'Vary shape',
      varyShapes: 'Shape candidates', varySize: 'Size wobble', varyOffset: 'Offset wobble', varyRotation: 'Rotation wobble',
      seedShift: 'Seed shift', spikes: 'Spikes', jag: 'Jaggedness', lead: 'Lead', exit: 'Exit', exitDuration: 'Exit duration',
      holdAmount: 'Hold amount', overshoot: 'Overshoot', turns: 'Turns', axis: 'Axis', roughness: 'Roughness', rise: 'Rise',
      pattern: 'Pattern', dashLength: 'Dash length', gapRatio: 'Gap ratio', flow: 'Flow', cursorShape: 'Cursor shape',
      blink: 'Blink', cursorAfter: 'Cursor after', interval: 'Interval', shift: 'Shift', height: 'Height', points: 'Points',
      thickness: 'Thickness', wobble: 'Wobble', skip: 'Skip', grow: 'Grow', shape: 'Shape', fade: 'Fade', duration: 'Duration', pulse: 'Pulse', hold: 'Hold',
    },
    values: {
      cell: 'Cell', em: 'Em', behind: 'Behind', front: 'Front', cycle: 'Cycle', charClass: 'Character class',
      first: 'First', last: 'Last', withText: 'With text', shrink: 'Shrink', wobble: 'Wobble', beat: 'Beat',
      heartbeat: 'Heartbeat', shiver: 'Shiver', drift: 'Drift', bar: 'Bar', block: 'Block', underscore: 'Underscore',
      hide: 'Hide', blink: 'Blink', stay: 'Stay', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', double: 'Double',
      sketch: 'Sketch', dot: 'Dot', heart: 'Heart', square: 'Square', rounded: 'Rounded', diamond: 'Diamond',
      blob: 'Blob', splatter: 'Splatter', scratch: 'Scratch', drop: 'Drop', bracket: 'Bracket', paper: 'Paper', cloud: 'Cloud',
      star: 'Star', fade: 'Fade', pulse: 'Pulse', spin: 'Spin',
    },
  };
  const ADD_JA = {
    types: {
      bgShape: {
        none: 'なし', square: '四角', rounded: '角丸', circle: '円', diamond: 'ひし形', ring: 'リング', bar: '帯',
        star: '星', blob: '不定形', heart: 'ハート', splatter: '血しぶき', scratch: 'ひっかき傷', drop: 'しずく',
        bracket: 'カギ括弧', paper: '紙片', cloud: '雲',
      },
      bgMotion: {
        follow: '文字に追従', fade: 'フェード', pop: 'ポップ', stamp: 'スタンプ', wipe: 'ワイプ', spin: '回転', grow: '伸びる',
        none: 'なし', flicker: 'ちらつき', bleed: 'にじみ', float: '浮かぶ', fall: '落下',
      },
      edge: { drip: '滴り' },
      fill: { ink: '墨' },
      enter: { flickerIn: 'ちらつき登場' },
      exit: { creepOut: '這い出し退場' },
      hold: { heartbeat: '鼓動', shiver: '震え' },
    },
    params: {
      unit: '単位', lockAspect: '縦横比を固定', rotateWithLetter: '文字の回転に追従', scaleWithLetter: '文字の拡大に追従',
      knockout: '抜き文字', layer: 'レイヤー', skipSpaces: '空白を飛ばす', skipRate: '間引き率',
      fgAutoContrast: '文字色を自動調整', vary: '文字ごとの変化', varyColors: '変化に使う色', varyShape: '形を変える',
      varyShapes: '形の候補', varySize: '大きさの揺らぎ', varyOffset: '位置の揺らぎ', varyRotation: '回転の揺らぎ',
      seedShift: '乱数シフト', spikes: 'トゲ', jag: 'ギザギザ', lead: '先行', exit: '消え方', exitDuration: '消える長さ',
      holdAmount: 'ゆらぎ量', overshoot: '行き過ぎ', turns: '回転数', axis: '軸', roughness: '粗さ', rise: '浮き上がり',
      pattern: '線種', dashLength: '破線の長さ', gapRatio: '隙間の割合', flow: '流れ', cursorShape: 'カーソルの形',
      blink: '点滅', cursorAfter: '完了後', interval: '間隔', shift: 'ずれ', height: '高さ', points: '頂点数',
      thickness: '太さ', wobble: '揺れ', skip: '間引き', grow: '伸び', shape: '形', fade: 'フェード', duration: '長さ', pulse: 'パルス', hold: '保持',
    },
    values: {
      cell: 'セル', em: 'em', behind: '文字の後ろ', front: '文字の前', cycle: '巡回', charClass: '文字種',
      first: '行頭', last: '行末', withText: '文字と一緒', shrink: '縮小', wobble: '揺れ', beat: 'ビート',
      heartbeat: '鼓動', shiver: '震え', drift: '漂流', bar: '縦棒', block: 'ブロック', underscore: '下線',
      hide: '隠す', blink: '点滅', stay: '表示', solid: '実線', dashed: '破線', dotted: '点線', double: '二重線',
      sketch: '手描き', dot: '点', heart: 'ハート', square: '四角', rounded: '角丸', diamond: 'ひし形',
      blob: '不定形', splatter: '血しぶき', scratch: 'ひっかき傷', drop: 'しずく', bracket: 'カギ括弧', paper: '紙片', cloud: '雲',
      star: '星', fade: 'フェード', pulse: 'パルス', spin: '回転',
    },
  };

  const ADD_EN_REPEAT = {
    types: {
      repeat: {
        stackV: 'Vertical stack', rowH: 'Horizontal row', diagonal: 'Diagonal', grid: 'Grid', radial: 'Radial',
        fan: 'Fan', tunnel: 'Tunnel', scatter: 'Scatter', brick: 'Brick', fill: 'Fill',
      },
    },
    params: {
      mainIndex: 'Main position', sequence: 'Sequence', seqSpeed: 'Sequence speed', seqOrder: 'Sequence order',
      copyOpacity: 'Copy opacity', var1Attr: 'Variation 1', var1Rule: 'Rule 1', var1Level: 'Strength 1',
      var1ColorMode: 'Colour mode 1', var1Target: 'Target 1', var2Attr: 'Variation 2', var2Rule: 'Rule 2',
      var2Level: 'Strength 2', var2ColorMode: 'Colour mode 2', var2Target: 'Target 2', variationPreset: 'Variation preset',
    },
    values: {
      stackV: 'Vertical stack', rowH: 'Horizontal row', radial: 'Radial', fan: 'Fan', tunnel: 'Tunnel',
      brick: 'Brick', fill: 'Fill', end: 'End', tight: 'Tight', normal: 'Normal', wide: 'Wide', static: 'Static',
      cascade: 'Cascade', counterSlide: 'Counter slide', counterScroll: 'Counter scroll', fromMain: 'From main',
      toMain: 'To main', flat: 'Flat', hue: 'Hue', light: 'Lightness', oddOne: 'Odd one out', main: 'Main',
      strong: 'Strong', custom: 'Custom', overflow: 'Overflow', size: 'Size', color: 'Colour', font: 'Typeface',
      decor: 'Decoration', perspectiveFade: 'Perspective fade', popAlternate: 'Popup checker', ransomNote: 'Ransom note',
      heroOutline: 'Hero outline', rainbowStep: 'Rainbow step', loudQuiet: 'Loud / quiet',
    },
  };
  const ADD_JA_REPEAT = {
    types: {
      repeat: {
        stackV: '縦積み', rowH: '横並び', diagonal: '斜め', grid: 'グリッド', radial: '放射',
        fan: '扇', tunnel: 'トンネル', scatter: '散らし', brick: 'レンガ', fill: '敷き詰め',
      },
    },
    params: {
      mainIndex: '本体の位置', sequence: '時間の使い方', seqSpeed: '速さ', seqOrder: '順序',
      copyOpacity: '複製の不透明度', var1Attr: '変化1', var1Rule: '規則1', var1Level: '強さ1',
      var1ColorMode: '色の変化1', var1Target: '対象1', var2Attr: '変化2', var2Rule: '規則2',
      var2Level: '強さ2', var2ColorMode: '色の変化2', var2Target: '対象2', variationPreset: 'プリセット',
    },
    values: {
      stackV: '縦積み', rowH: '横並び', radial: '放射状', fan: '扇状', tunnel: 'トンネル',
      brick: 'レンガ', fill: '敷き詰め', end: '端', tight: '狭い', normal: '標準', wide: '広い', static: '静止',
      cascade: 'カスケード', counterSlide: '逆スライド', counterScroll: '逆スクロール', fromMain: '本体から',
      toMain: '本体へ', flat: '一定', hue: '色相', light: '明度', oddOne: '1つだけ違う', main: '本体',
      strong: '強', custom: 'カスタム', overflow: 'はみ出し', size: '大きさ', color: '色', font: '書体',
      decor: '装飾', perspectiveFade: 'パースフェード', popAlternate: 'ポップ市松', ransomNote: '切り抜き文字',
      heroOutline: 'ヒーロー縁取り', rainbowStep: '虹色ステップ', loudQuiet: '強弱',
    },
  };
  const ADD_ES_REPEAT = {
    types: {
      repeat: {
        stackV: 'Pila vertical', rowH: 'Fila horizontal', diagonal: 'Diagonal', grid: 'Cuadrícula', radial: 'Radial',
        fan: 'Abanico', tunnel: 'Túnel', scatter: 'Dispersión', brick: 'Ladrillo', fill: 'Relleno',
      },
    },
    params: {
      mainIndex: 'Posición principal', sequence: 'Secuencia', seqSpeed: 'Velocidad', seqOrder: 'Orden',
      copyOpacity: 'Opacidad de copias', var1Attr: 'Variación 1', var1Rule: 'Regla 1', var1Level: 'Intensidad 1',
      var1ColorMode: 'Modo de color 1', var1Target: 'Objetivo 1', var2Attr: 'Variación 2', var2Rule: 'Regla 2',
      var2Level: 'Intensidad 2', var2ColorMode: 'Modo de color 2', var2Target: 'Objetivo 2', variationPreset: 'Preset de variación',
    },
    values: {
      stackV: 'Pila vertical', rowH: 'Fila horizontal', radial: 'Radial', fan: 'Abanico', tunnel: 'Túnel',
      brick: 'Ladrillo', fill: 'Relleno', end: 'Final', tight: 'Ajustado', normal: 'Normal', wide: 'Amplio', static: 'Estático',
      cascade: 'Cascada', counterSlide: 'Deslizamiento opuesto', counterScroll: 'Desplazamiento opuesto', fromMain: 'Desde el principal',
      toMain: 'Hacia el principal', flat: 'Plano', hue: 'Tono', light: 'Luminosidad', oddOne: 'El diferente', main: 'Principal',
      strong: 'Fuerte', custom: 'Personalizado', overflow: 'Desbordar', size: 'Tamaño', color: 'Color', font: 'Tipografía',
      decor: 'Decoración', perspectiveFade: 'Fundido en perspectiva', popAlternate: 'Damero pop', ransomNote: 'Nota anónima',
      heroOutline: 'Contorno del héroe', rainbowStep: 'Paso de arcoíris', loudQuiet: 'Fuerte / suave',
    },
  };
  const ADD_FR_REPEAT = {
    types: {
      repeat: {
        stackV: 'Empilement vertical', rowH: 'Ligne horizontale', diagonal: 'Diagonale', grid: 'Grille', radial: 'Radial',
        fan: 'Éventail', tunnel: 'Tunnel', scatter: 'Dispersion', brick: 'Brique', fill: 'Remplissage',
      },
    },
    params: {
      mainIndex: 'Position principale', sequence: 'Séquence', seqSpeed: 'Vitesse', seqOrder: 'Ordre',
      copyOpacity: 'Opacité des copies', var1Attr: 'Variation 1', var1Rule: 'Règle 1', var1Level: 'Intensité 1',
      var1ColorMode: 'Mode couleur 1', var1Target: 'Cible 1', var2Attr: 'Variation 2', var2Rule: 'Règle 2',
      var2Level: 'Intensité 2', var2ColorMode: 'Mode couleur 2', var2Target: 'Cible 2', variationPreset: 'Préréglage',
    },
    values: {
      stackV: 'Empilement vertical', rowH: 'Ligne horizontale', radial: 'Radial', fan: 'Éventail', tunnel: 'Tunnel',
      brick: 'Brique', fill: 'Remplissage', end: 'Fin', tight: 'Serré', normal: 'Normal', wide: 'Large', static: 'Statique',
      cascade: 'Cascade', counterSlide: 'Glissement opposé', counterScroll: 'Défilement opposé', fromMain: 'Depuis le principal',
      toMain: 'Vers le principal', flat: 'Uniforme', hue: 'Teinte', light: 'Luminosité', oddOne: 'L’intrus', main: 'Principal',
      strong: 'Fort', custom: 'Personnalisé', overflow: 'Débordement', size: 'Taille', color: 'Couleur', font: 'Police',
      decor: 'Décoration', perspectiveFade: 'Fondu perspective', popAlternate: 'Damier pop', ransomNote: 'Note anonyme',
      heroOutline: 'Contour héros', rainbowStep: 'Pas arc-en-ciel', loudQuiet: 'Fort / doux',
    },
  };
  const ADD_RU_REPEAT = {
    types: {
      repeat: {
        stackV: 'Вертикальная стопка', rowH: 'Горизонтальный ряд', diagonal: 'Диагональ', grid: 'Сетка', radial: 'Радиально',
        fan: 'Веер', tunnel: 'Туннель', scatter: 'Разброс', brick: 'Кирпич', fill: 'Заполнение',
      },
    },
    params: {
      mainIndex: 'Позиция основы', sequence: 'Последовательность', seqSpeed: 'Скорость', seqOrder: 'Порядок',
      copyOpacity: 'Прозрачность копий', var1Attr: 'Вариация 1', var1Rule: 'Правило 1', var1Level: 'Сила 1',
      var1ColorMode: 'Режим цвета 1', var1Target: 'Цель 1', var2Attr: 'Вариация 2', var2Rule: 'Правило 2',
      var2Level: 'Сила 2', var2ColorMode: 'Режим цвета 2', var2Target: 'Цель 2', variationPreset: 'Пресет вариации',
    },
    values: {
      stackV: 'Вертикальная стопка', rowH: 'Горизонтальный ряд', radial: 'Радиально', fan: 'Веер', tunnel: 'Туннель',
      brick: 'Кирпич', fill: 'Заполнение', end: 'Конец', tight: 'Плотно', normal: 'Обычно', wide: 'Широко', static: 'Статично',
      cascade: 'Каскад', counterSlide: 'Встречное скольжение', counterScroll: 'Встречная прокрутка', fromMain: 'От основы',
      toMain: 'К основе', flat: 'Ровно', hue: 'Оттенок', light: 'Яркость', oddOne: 'Один отличается', main: 'Основная',
      strong: 'Сильно', custom: 'Свой', overflow: 'За края', size: 'Размер', color: 'Цвет', font: 'Шрифт',
      decor: 'Декор', perspectiveFade: 'Перспективное затухание', popAlternate: 'Поп-шахматка', ransomNote: 'Анонимная записка',
      heroOutline: 'Контур героя', rainbowStep: 'Радужный шаг', loudQuiet: 'Громко / тихо',
    },
  };

  function applyFxAdditions(target, additions) {
    for (const [group, table] of Object.entries(additions.types || {})) {
      target[group] = { ...(target[group] || {}), ...table };
    }
    Object.assign(target.param, additions.params || {});
    Object.assign(target.value, additions.values || {});
  }

  applyFxAdditions(en, ADD_EN);
  applyFxAdditions(ja, ADD_JA);
  applyFxAdditions(es, ADD_EN);
  applyFxAdditions(fr, ADD_EN);
  applyFxAdditions(ru, ADD_EN);
  applyFxAdditions(en, ADD_EN_REPEAT);
  applyFxAdditions(ja, ADD_JA_REPEAT);
  applyFxAdditions(es, ADD_ES_REPEAT);
  applyFxAdditions(fr, ADD_FR_REPEAT);
  applyFxAdditions(ru, ADD_RU_REPEAT);

  return { en: { fx: en }, ja: { fx: ja }, es: { fx: es }, fr: { fx: fr }, ru: { fx: ru } };
});
