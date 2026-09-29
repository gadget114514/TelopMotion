(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fillerPresets = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The built-in filler preset library. Every preset is a plain filler spec
  // (the primitive vocabulary of filler-render) with a stable kebab-case id, a
  // group and an en / ja label. The tables below generate the library from a
  // handful of loops so 120+ variations stay consistent.

  const GROUP_ORDER = ['pattern', 'split', 'shapes', 'particles', 'audio', 'figures', 'text', 'timer', 'combo'];

  // --- label tables -----------------------------------------------------------

  const VARIANT_LABELS = {
    calm: { en: 'Calm', ja: '静か' },
    bold: { en: 'Bold', ja: '大胆' },
    few: { en: 'Few', ja: '少数' },
    many: { en: 'Many', ja: '多数' },
    fine: { en: 'Fine', ja: '細か' },
    soft: { en: 'Soft', ja: 'やわらか' },
  };

  const PATTERN_LABELS = {
    grid: { en: 'Grid', ja: 'グリッド' },
    dots: { en: 'Dots', ja: 'ドット' },
    stripes: { en: 'Stripes', ja: 'ストライプ' },
    rings: { en: 'Rings', ja: 'リング' },
    triangles: { en: 'Triangles', ja: 'トライアングル' },
    diamonds: { en: 'Diamonds', ja: 'ダイヤ' },
    hexes: { en: 'Hexes', ja: 'ヘックス' },
    rain: { en: 'Rain', ja: 'レイン' },
    checks: { en: 'Checks', ja: 'チェック' },
    polka: { en: 'Polka dots', ja: '水玉' },
    sineCurve: { en: 'Sine curve', ja: 'サインカーブ' },
    waves: { en: 'Waves', ja: 'ウェーブ' },
    randomFill: { en: 'Random fill', ja: 'ランダムフィル' },
  };

  const SPLIT_LABELS = {
    halves: { en: 'Halves', ja: '半分' },
    diagonal: { en: 'Diagonal', ja: '斜め' },
    thirds: { en: 'Thirds', ja: '三分割' },
    bands: { en: 'Bands', ja: '帯' },
    quads: { en: 'Quads', ja: '四分割' },
    grid: { en: 'Grid', ja: 'グリッド' },
    chevron: { en: 'Chevron', ja: '山形' },
    radial: { en: 'Radial', ja: '放射' },
    mondrian: { en: 'Mondrian', ja: 'モンドリアン' },
    frame: { en: 'Frame', ja: '額縁' },
    shards: { en: 'Shards', ja: 'シャード' },
  };

  const MOTION_LABELS = {
    still: { en: 'Still', ja: '静止' },
    slide: { en: 'Slide', ja: 'スライド' },
    rotate: { en: 'Rotate', ja: '回転' },
    breathe: { en: 'Breathe', ja: '呼吸' },
    swap: { en: 'Swap', ja: '入替' },
    drift: { en: 'Drift', ja: '漂流' },
  };

  const SHAPE_LABELS = {
    circles: { en: 'Circles', ja: '円' },
    polygons: { en: 'Polygons', ja: '多角形' },
    lines: { en: 'Lines', ja: '線' },
    burst: { en: 'Burst', ja: 'バースト' },
    grid: { en: 'Grid', ja: 'グリッド' },
    orbit: { en: 'Orbit', ja: '軌道' },
  };

  const PARTICLE_LABELS = {
    rise: { en: 'Rise', ja: '上昇' },
    fall: { en: 'Fall', ja: '落下' },
    drift: { en: 'Drift', ja: '漂流' },
    vortex: { en: 'Vortex', ja: '渦' },
  };

  const FIGURE_LABELS = {
    orbit: { en: 'Orbit', ja: '軌道' },
    burst: { en: 'Burst', ja: 'バースト' },
    bars: { en: 'Bars', ja: 'バー' },
    rings: { en: 'Rings', ja: 'リング' },
    confetti: { en: 'Confetti', ja: '紙吹雪' },
    frame: { en: 'Frame', ja: '額縁' },
    underlineSweep: { en: 'Underline', ja: 'アンダーライン' },
    bracketsPop: { en: 'Brackets', ja: 'ブラケット' },
    polyMorph: { en: 'Poly morph', ja: 'ポリモーフ' },
    ribbon: { en: 'Ribbon', ja: 'リボン' },
    ticker: { en: 'Ticker', ja: 'ティッカー' },
    halftone: { en: 'Halftone', ja: 'ハーフトーン' },
  };

  const MOVE_LABELS = {
    spin: { en: 'Spin', ja: 'スピン' },
    'pop-burstout': { en: 'Pop burst', ja: 'ポップ＋バースト' },
    pulse: { en: 'Pulse', ja: 'パルス' },
    'draw-fade': { en: 'Draw fade', ja: 'ドロー＋フェード' },
    wipe: { en: 'Wipe', ja: 'ワイプ' },
    scatter: { en: 'Scatter', ja: 'スキャッター' },
    morph: { en: 'Morph', ja: 'モーフ' },
    drift: { en: 'Drift', ja: 'ドリフト' },
  };

  const AUDIO_LABELS = {
    'wave-line': { en: 'Waveform line', ja: '波形ライン' },
    'wave-mirror': { en: 'Waveform mirror', ja: '波形ミラー' },
    'wave-circle': { en: 'Waveform circle', ja: '波形サークル' },
    'spectrum-bars': { en: 'Spectrum bars', ja: 'スペクトラムバー' },
    'spectrum-radial': { en: 'Spectrum radial', ja: 'スペクトラム放射' },
    'spectrum-blob': { en: 'Spectrum blob', ja: 'スペクトラムブロブ' },
    'sine-1': { en: 'Sine 1 wave', ja: 'サイン波1本' },
    'sine-3': { en: 'Sine 3 waves', ja: 'サイン波3本' },
    'sine-5': { en: 'Sine 5 waves', ja: 'サイン波5本' },
  };

  const TIMER_LABELS = {
    'countdown-digits': { en: 'Countdown digits', ja: 'カウントダウン数字' },
    'countdown-ring': { en: 'Countdown ring', ja: 'カウントダウンリング' },
    'countdown-bar': { en: 'Countdown bar', ja: 'カウントダウンバー' },
    'countdown-dots': { en: 'Countdown dots', ja: 'カウントダウンドット' },
    'progress-bar': { en: 'Progress bar', ja: 'プログレスバー' },
    'progress-ring': { en: 'Progress ring', ja: 'プログレスリング' },
  };

  // --- spec tables ------------------------------------------------------------

  const PATTERN_MODES = ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'];
  const PATTERN_VARIANTS = {
    calm: { speed: 0.2, opacity: 0.35, size: 1 },
    bold: { speed: 0.9, opacity: 0.8, size: 1.6, count: 48 },
  };

  // live motion per split layout (a fixed table, so every layout moves in its
  // own way); six weak still pairs are skipped
  const SPLIT_LAYOUTS = [
    ['halves', 'slide'],
    ['diagonal', 'swap'],
    ['thirds', 'slide'],
    ['bands', 'drift'],
    ['quads', 'rotate'],
    ['grid', 'breathe'],
    ['chevron', 'swap'],
    ['radial', 'rotate'],
    ['mondrian', 'drift'],
    ['frame', 'breathe'],
    ['shards', 'swap'],
  ];
  const SPLIT_SKIP = new Set(['halves:still', 'quads:still', 'bands:still', 'mondrian:still', 'shards:still', 'grid:still']);

  const SHAPE_SETS = ['circles', 'polygons', 'lines', 'burst', 'grid', 'orbit'];
  const SHAPE_VARIANTS = { few: { count: 6, speed: 0.6 }, many: { count: 32, speed: 1.6 } };

  const PARTICLE_FLOWS = ['rise', 'fall', 'drift', 'vortex'];
  const PARTICLE_VARIANTS = { fine: { size: 1.2, count: 80 }, soft: { size: 5, count: 18 } };

  const FIGURE_MOTIFS = ['orbit', 'burst', 'bars', 'rings', 'confetti', 'frame', 'underlineSweep', 'bracketsPop', 'polyMorph', 'ribbon', 'ticker', 'halftone'];
  const FIGURE_MOVES = [
    { motif: 'orbit', tag: 'spin', move: { hold: 'spin' } },
    { motif: 'burst', tag: 'pop-burstout', move: { in: 'pop', out: 'burstOut' } },
    { motif: 'rings', tag: 'pulse', move: { hold: 'pulse' } },
    { motif: 'ribbon', tag: 'draw-fade', move: { in: 'draw', out: 'fade' } },
    { motif: 'frame', tag: 'wipe', move: { in: 'wipe' } },
    { motif: 'confetti', tag: 'scatter', move: { in: 'scatterIn' } },
    { motif: 'polyMorph', tag: 'morph', move: { hold: 'morph' } },
    { motif: 'halftone', tag: 'drift', move: { hold: 'drift' } },
  ];

  // every enter / exit name exists in both packs (effects/enter.js / exit.js)
  const TEXT_PRESETS = [
    { id: 'text-title', label: { en: 'Title centre', ja: 'タイトル中央' }, params: { text: '{title}', enter: 'zoomIn', hold: 'auto', exit: 'fade', size: 0.12, y: 0.5, color: '#eef2ff' } },
    { id: 'text-artist', label: { en: 'Artist low', ja: 'アーティスト下' }, params: { text: '{artist}', enter: 'fade', hold: 'floatBob', exit: 'none', size: 0.05, y: 0.78, color: '#c8d2ff' } },
    { id: 'text-next', label: { en: 'Next line teaser', ja: '次の行を予告' }, params: { text: '{next}', enter: 'slide', hold: 'none', exit: 'fade', size: 0.06, y: 0.72, color: '#cbd3ff' } },
    { id: 'text-note', label: { en: 'Music note', ja: '音符' }, params: { text: '♪', enter: 'elasticPop', hold: 'pulse', exit: 'shrinkToCenter', size: 0.14, y: 0.5, color: '#ffd166' } },
    { id: 'text-title-artist', label: { en: 'Title + artist', ja: 'タイトル＋アーティスト' }, params: { text: '{title}\n{artist}', enter: 'typewriter', hold: 'none', exit: 'blurOut', size: 0.07, y: 0.52, color: '#eef2ff' } },
    { id: 'text-intro', label: { en: 'INTRO caption', ja: 'INTRO字幕' }, params: { text: 'INTRO', enter: 'dropBounce', hold: 'jitter', exit: 'zoomOut', size: 0.16, y: 0.5, color: '#8a7cff' } },
    { id: 'text-interlude', label: { en: 'INTERLUDE caption', ja: 'INTERLUDE字幕' }, params: { text: 'INTERLUDE', enter: 'waveRise', hold: 'sineWave', exit: 'dissolve', size: 0.12, y: 0.5, color: '#4dc8ff' } },
    { id: 'text-outro', label: { en: 'OUTRO caption', ja: 'OUTRO字幕' }, params: { text: 'OUTRO', enter: 'flip3D', hold: 'breathing', exit: 'gravityFall', size: 0.14, y: 0.5, color: '#ff8a3d' } },
    { id: 'text-prev', label: { en: 'Previous line echo', ja: '前の行のエコー' }, params: { text: '{prev}', enter: 'blurIn', hold: 'drift', exit: 'creepOut', size: 0.05, y: 0.3, color: '#8d96ab' } },
    { id: 'text-thanks', label: { en: 'Thanks for listening', ja: 'ご視聴ありがとう' }, params: { text: 'Thanks for listening', enter: 'strokeDrawOn', hold: 'none', exit: 'burnAway', size: 0.06, y: 0.6, color: '#eef2ff' } },
  ];

  const TIMER_PRESETS = [
    { id: 'timer-countdown-digits', label: { en: 'Countdown digits', ja: 'カウントダウン数字' }, params: { style: 'digits', from: 5 } },
    { id: 'timer-countdown-ring', label: { en: 'Countdown ring', ja: 'カウントダウンリング' }, params: { style: 'ring', from: 5 } },
    { id: 'timer-countdown-bar', label: { en: 'Countdown bar', ja: 'カウントダウンバー' }, params: { style: 'bar', from: 5 } },
    { id: 'timer-countdown-dots', label: { en: 'Countdown dots', ja: 'カウントダウンドット' }, params: { style: 'dots', from: 3 } },
    { id: 'timer-progress-bar', label: { en: 'Progress bar', ja: 'プログレスバー' }, params: { style: 'bar', position: 'bottom' } },
    { id: 'timer-progress-ring', label: { en: 'Progress ring', ja: 'プログレスリング' }, params: { style: 'ring', position: 'bottom' } },
  ];

  // curated layer stacks: [preset id, ...] -> combo
  const COMBO_STACKS = [
    ['pattern-dots-calm', 'figures-orbit'],
    ['split-diagonal-still', 'text-title'],
    ['particles-rise-fine', 'timer-countdown-ring'],
    ['audio-spectrum-radial', 'text-artist'],
    ['pattern-rain-bold', 'figures-ticker'],
    ['split-frame-still', 'figures-bracketspop', 'text-next'],
    ['pattern-stripes-bold', 'figures-burst'],
    ['pattern-waves-calm', 'figures-rings'],
    ['pattern-grid-calm', 'figures-halftone'],
    ['particles-vortex-soft', 'figures-polymorph'],
    ['audio-sine-3', 'figures-rings-pulse'],
    ['pattern-diamonds-bold', 'figures-confetti'],
    ['pattern-checks-calm', 'figures-underlinesweep'],
    ['audio-spectrum-blob', 'figures-bars'],
    ['shapes-orbit-many', 'timer-progress-bar'],
  ];

  // --- build ------------------------------------------------------------------

  function build() {
    const items = [];
    const built = new Map();

    const add = (id, group, label, spec) => {
      const entry = { id, group, label, spec };
      items.push(entry);
      built.set(id, entry);
      return entry;
    };
    const part = (id) => JSON.parse(JSON.stringify(built.get(id).spec));
    const comboSpec = (ids) => ({ type: 'combo', params: { list: ids.map((id) => part(id)) } });
    const comboLabel = (ids) => ({
      en: ids.map((id) => built.get(id).label.en).join(' + '),
      ja: ids.map((id) => built.get(id).label.ja).join(' + '),
    });

    // pattern: 13 modes x calm / bold
    for (const mode of PATTERN_MODES) {
      for (const [variant, patch] of Object.entries(PATTERN_VARIANTS)) {
        add(`pattern-${mode.toLowerCase()}-${variant}`, 'pattern', {
          en: `${PATTERN_LABELS[mode].en} ${VARIANT_LABELS[variant].en.toLowerCase()}`,
          ja: `${PATTERN_LABELS[mode].ja}・${VARIANT_LABELS[variant].ja}`,
        }, { type: 'pattern', params: { mode, count: 24, size: 1, speed: 0.4, opacity: 0.6, color: '#8d96ab', ...patch } });
      }
    }

    // split: 11 layouts x still / live, minus six weak still pairs
    for (const [layout, motion] of SPLIT_LAYOUTS) {
      const variants = [
        { key: 'still', params: { layout, parts: 3, coverage: 0.6, motion: 'none', speed: 0.4 } },
        { key: motion, params: { layout, parts: 3, coverage: 0.6, motion, speed: 0.6, amp: 0.06 } },
      ];
      for (const variant of variants) {
        if (SPLIT_SKIP.has(`${layout}:${variant.key}`)) continue;
        add(`split-${layout}-${variant.key}`, 'split', {
          en: `${SPLIT_LABELS[layout].en} ${MOTION_LABELS[variant.key].en.toLowerCase()}`,
          ja: `${SPLIT_LABELS[layout].ja}・${MOTION_LABELS[variant.key].ja}`,
        }, { type: 'split', params: { ...variant.params, colors: null } });
      }
    }

    // shapes: 6 sets x few / many
    for (const set of SHAPE_SETS) {
      for (const [variant, patch] of Object.entries(SHAPE_VARIANTS)) {
        add(`shapes-${set}-${variant}`, 'shapes', {
          en: `${SHAPE_LABELS[set].en} ${VARIANT_LABELS[variant].en.toLowerCase()}`,
          ja: `${SHAPE_LABELS[set].ja}・${VARIANT_LABELS[variant].ja}`,
        }, { type: 'shapes', params: { set, count: 8, speed: 1, color: '#ff8a3d', ...patch } });
      }
    }

    // particles: 4 flows x fine / soft
    for (const flow of PARTICLE_FLOWS) {
      for (const [variant, patch] of Object.entries(PARTICLE_VARIANTS)) {
        add(`particles-${flow}-${variant}`, 'particles', {
          en: `${PARTICLE_LABELS[flow].en} ${VARIANT_LABELS[variant].en.toLowerCase()}`,
          ja: `${PARTICLE_LABELS[flow].ja}・${VARIANT_LABELS[variant].ja}`,
        }, { type: 'particles', params: { flow, count: 24, size: 2.4, color: '#d6dbe9', ...patch } });
      }
    }

    // audio: waveform / spectrum / sine wave variants
    for (const mode of ['line', 'mirror', 'circle']) {
      add(`audio-wave-${mode}`, 'audio', AUDIO_LABELS[`wave-${mode}`], { type: 'waveform', params: { mode, thickness: 2.5, amp: 1, color: '#4dc8ff' } });
    }
    for (const mode of ['bars', 'radial', 'blob']) {
      add(`audio-spectrum-${mode}`, 'audio', AUDIO_LABELS[`spectrum-${mode}`], { type: 'spectrum', params: { mode, bars: 48, falloff: 1, color: '#7ce0a4' } });
    }
    for (const waves of [1, 3, 5]) {
      add(`audio-sine-${waves}`, 'audio', AUDIO_LABELS[`sine-${waves}`], { type: 'sineWave', params: { waves, amp: 1, speed: 1, color: '#9db2ff' } });
    }

    // figures: 12 motifs with automatic moves + 8 move-locked variants
    for (const motif of FIGURE_MOTIFS) {
      add(`figures-${motif.toLowerCase()}`, 'figures', FIGURE_LABELS[motif], {
        type: 'figures',
        params: { motif, sync: 'beat', density: 0.55, in: 'auto', hold: 'auto', out: 'auto' },
      });
    }
    for (const entry of FIGURE_MOVES) {
      add(`figures-${entry.motif.toLowerCase()}-${entry.tag}`, 'figures', {
        en: `${FIGURE_LABELS[entry.motif].en} ${MOVE_LABELS[entry.tag].en.toLowerCase()}`,
        ja: `${FIGURE_LABELS[entry.motif].ja}・${MOVE_LABELS[entry.tag].ja}`,
      }, {
        type: 'figures',
        params: { motif: entry.motif, sync: 'beat', density: 0.55, in: 'auto', hold: 'auto', out: 'auto', ...entry.move },
      });
    }

    // text: beat-evaluated animated texts
    for (const preset of TEXT_PRESETS) {
      add(preset.id, 'text', preset.label, { type: 'textAnim', params: { theme: '', ...preset.params } });
    }

    // timer: countdowns and progress
    for (const preset of TIMER_PRESETS) {
      add(preset.id, 'timer', preset.label, { type: preset.id.startsWith('timer-countdown') ? 'countdown' : 'progress', params: { ...preset.params, color: '#ffd166' } });
    }

    // combo: curated stacks over the presets above
    for (const stack of COMBO_STACKS) {
      const id = `combo-${stack.map((partId) => partId.replace(/^(pattern|split|shapes|particles|audio|figures|text|timer)-/, '')).join('-')}`;
      add(id, 'combo', comboLabel(stack), comboSpec(stack));
    }

    return items;
  }

  const LIST = build();
  const BY_ID = new Map(LIST.map((preset) => [preset.id, preset]));

  function list() {
    return LIST.map((preset) => ({ ...preset }));
  }

  function get(id) {
    return BY_ID.get(id) || null;
  }

  function groups() {
    return [...GROUP_ORDER];
  }

  function labelFor(preset, lang) {
    if (!preset || !preset.label) return '';
    return preset.label[lang] || preset.label.en || '';
  }

  function specOf(id) {
    const preset = get(id);
    if (!preset) return null;
    const spec = JSON.parse(JSON.stringify(preset.spec));
    spec.presetId = id;
    return spec;
  }

  return { list, get, groups, labelFor, specOf };
});
