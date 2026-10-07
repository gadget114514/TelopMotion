(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fxCompat = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // cueStyle enter/exit/hold のうち、文字(グリフ)パイプライン専用で
  // figure(形状プリミティブ群)や layers(画像シート: x/y/scale/rot/opacityのみ)
  // に移植できないものを除外する。残りは汎用変形として評価し、
  // テキスト固有フィールド (represent/dissolve/sand/wipe/deform 等) は無視する。
  //
  // 除外基準: cpu が x/y/scale/rot/opacity のいずれにも触らず、
  // visibleFrac / represent / dissolve / sand / wipe / deform のみで成立する型。
  // blur / tilt / skew / flash は無視されるが、本体に汎用成分があれば残す
  // (partial 対応)。純粋に無変化となる型のみ除外する。

  // enter: vF/represent/dissolve/sand/wipe のみで成立する型 + 実質無変化の型
  const TEXT_ENTER = new Set([
    'typewriter', // vF のみ
    'strokeDrawOn', // vF + represent:stroke
    'particlesAssemble', // represent:particles 本体
    'sandGather', // represent:sand 本体
    'shatterRebuild', // represent:pieces 本体
    'morphFromPrevious', // represent:particles + 前グリフ点群
    'noiseDissolveIn', // dissolve 本体
    'dissolve', // dissolve 本体
    'megaZoomIn', // deform:zoomBlock 本体
    'appear', // vF のみ
    'wipe', // wipeMode/vF
    'blind', // wipeMode/vF
    'box', // wipeMode/vF
    'checkerboard', // wipeMode/vF 本体
    'maskReveal', // wipeMode/vF
    'multiIn', // cloneSpread 本体 (opacity のみ残るため除外)
    'blurIn', // blur のみ (figure/layers では無変化)
  ]);

  // exit: 同上。particlesDisperse は x/y/rot/opacity の散開が残るため残す。
  // melt/burnAway/evaporate/warpOut は y/opacity/scale が残るため残す。
  const TEXT_EXIT = new Set([
    'dissolve', // dissolve のみ (opacity すら触らない)
    'wipe', // vF のみ
    'typewriterReverse', // vF のみ
    'strokeErase', // vF + represent:stroke
    'sandCrumble', // represent:sand 本体
    'blurOut', // blur のみ
  ]);

  // hold: deform:xxx のみで成立する型 + tilt のみ (layers/figure では無変化)
  const TEXT_HOLD = new Set([
    'jelly',
    'wobbleWarp',
    'twist',
    'breathing',
    'fontSize',
    'fillScreen',
    'squashStretch',
    'swirl',
    'orbit3D', // tiltX/tiltY のみ
  ]);

  function isCompatible(group, type) {
    if (!type) return false;
    if (group === 'enter') return !TEXT_ENTER.has(type);
    if (group === 'exit') return !TEXT_EXIT.has(type);
    if (group === 'hold') return !TEXT_HOLD.has(type);
    return false;
  }

  function filterInstance(group, instance) {
    if (!instance || instance.enabled === false) return null;
    if (!isCompatible(group, instance.type)) return null;
    return instance;
  }

  function filterHold(instances) {
    const list = Array.isArray(instances) ? instances : (instances ? [instances] : []);
    return list.filter((entry) => entry && entry.enabled !== false && isCompatible('hold', entry.type));
  }

  function num(value, fallback) {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp01(value) {
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
  }

  function hashSeed(seed) {
    const text = String(seed == null ? 'fxcompat' : seed);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRng(seed) {
    let h = hashSeed(seed);
    return function rng() {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      return h / 4294967296;
    };
  }

  function easingFor(easingApi, name, fallback) {
    if (easingApi && typeof easingApi.get === 'function') {
      try {
        const curve = easingApi.get(name || fallback);
        if (typeof curve === 'function') return curve;
      } catch { /* fall through */ }
    }
    if (!name && !fallback) return (v) => v;
    return (v) => v * v * (3 - 2 * v);
  }

  function baseState() {
    return {
      x: 0, y: 0, z: 0,
      rot: 0, tiltX: 0, tiltY: 0, skewX: 0,
      scaleX: 1, scaleY: 1,
      opacity: 1, blur: 0, visibleFrac: 1,
      deform: [], represent: 'mesh', reprProgress: 1,
      colorMix: 0, fx: {},
    };
  }

  function infoFor(frame) {
    const width = (frame && frame.width) || 1920;
    const height = (frame && frame.height) || 1080;
    const shortSide = Math.min(width, height);
    return {
      i: 0, N: 1,
      frame: { width, height },
      shortSide,
      blockCenter: { x: width / 2, y: height / 2 },
      letterX: width / 2,
      letterY: height / 2,
      beatDuration: 1,
    };
  }

  // 単一アイテムとして cueStyle の enter/exit/hold を評価し、
  // figure/layers に反映できる汎用成分のみ返す。
  // style: { enter, exit, hold } (hold は配列または単体)
  // span: { start, end } (絶対秒), t: 絶対秒
  function evaluateStyleState(style, t, span, frame, seed, fxApi, easingApi) {
    const out = { x: 0, y: 0, scaleX: 1, scaleY: 1, rot: 0, opacity: 1 };
    if (!style || !fxApi || typeof fxApi.get !== 'function') return out;
    const start = num(span && span.start, 0);
    const end = Math.max(start + 0.001, num(span && span.end, start + 1));
    const duration = end - start;
    const local = t - start;
    const width = (frame && frame.width) || 1920;
    const height = (frame && frame.height) || 1080;
    const info = { ...infoFor(frame), beatDuration: duration };
    const applyCpu = (group, instance, progress, extra) => {
      const filtered = filterInstance(group, instance);
      if (!filtered) return;
      const entry = fxApi.get(group, filtered.type);
      if (!entry || typeof entry.cpu !== 'function') return;
      const defaults = fxApi.paramDefaults && typeof fxApi.paramDefaults === 'function'
        ? fxApi.paramDefaults(group, filtered.type) : {};
      const params = { ...defaults, ...(filtered.params || {}) };
      const state = baseState();
      const rng = seededRng(`${String(seed)}:${group}:${filtered.type}`);
      try {
        if (group === 'hold') {
          entry.cpu(state, num(extra && extra.h, local), num(extra && extra.env, 1), params, rng, info);
        } else {
          entry.cpu(state, clamp01(progress), params, rng, info);
        }
      } catch { return; }
      // 汎用成分のみ合成する。skew/tilt/blur/deform 等は捨てる。
      out.x += num(state.x, 0);
      out.y += num(state.y, 0);
      out.scaleX *= Number.isFinite(num(state.scaleX, 1)) ? num(state.scaleX, 1) : 1;
      out.scaleY *= Number.isFinite(num(state.scaleY, 1)) ? num(state.scaleY, 1) : 1;
      out.rot += num(state.rot, 0);
      out.opacity *= clamp01(num(state.opacity, 1));
    };

    // enter: clip/layer 開始側のワンショット
    if (style.enter) {
      const motion = (style.enter.motion && style.enter.motion.in) || {};
      const defDuration = Math.max(0.001, num(motion.duration, 0.5));
      const defDelay = num(motion.delay, 0);
      const ease = easingFor(easingApi, motion.ease, 'easeOutCubic');
      const progress = clamp01((local - defDelay) / defDuration);
      applyCpu('enter', style.enter, ease(progress));
    }
    // exit: 終了側のワンショット (開始前は progress 0 = 恒等)
    if (style.exit) {
      const motion = (style.exit.motion && style.exit.motion.out) || {};
      const defDuration = Math.max(0.001, num(motion.duration, 0.4));
      const defDelay = num(motion.delay, 0);
      const ease = easingFor(easingApi, motion.ease, 'easeInCubic');
      const exitStart = duration - defDuration - defDelay;
      const progress = clamp01((local - exitStart) / defDuration);
      applyCpu('exit', style.exit, ease(progress));
    }
    // hold: 常時 (env は enter/exit 包絡)
    const holds = filterHold(style.hold);
    if (holds.length) {
      const enterMotion = (style.enter && style.enter.motion && style.enter.motion.in) || {};
      const exitMotion = (style.exit && style.exit.motion && style.exit.motion.out) || {};
      const inDuration = Math.max(0.001, num(enterMotion.duration, 0.5));
      const inDelay = num(enterMotion.delay, 0);
      const outDuration = Math.max(0.001, num(exitMotion.duration, 0.4));
      const outDelay = num(exitMotion.delay, 0);
      const env = clamp01((local - inDelay) / inDuration)
        * (1 - clamp01((local - (duration - outDuration - outDelay)) / outDuration));
      for (const hold of holds) {
        const motion = hold.motion || {};
        void motion;
        applyCpu('hold', hold, 0, { h: Math.max(0, local), env });
      }
    }
    out.scaleX = Number.isFinite(out.scaleX) ? out.scaleX : 1;
    out.scaleY = Number.isFinite(out.scaleY) ? out.scaleY : 1;
    out.opacity = clamp01(out.opacity);
    void width;
    void height;
    return out;
  }

  // 生成用: 互換型のみに絞った enter/exit/hold インスタンスの簡易抽選。
  // moods.generate の完全な文脈抽選ではなく、figure/layer への移植用に
  // テキスト前提型を除外したプールから一様抽選する。
  // listFn(group) があればそれを使い、なければ fxApi.list(group) を使う。
  function pickCompatType(random, group, fxApi) {
    if (!fxApi || typeof fxApi.list !== 'function') return null;
    let entries = [];
    try {
      entries = fxApi.list(group) || [];
    } catch { entries = []; }
    const pool = entries.map((entry) => entry && entry.type).filter((type) => isCompatible(group, type));
    if (!pool.length) return null;
    const roll = typeof random === 'function' ? random() : Math.random();
    return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  }

  // 汎用グループ変形 (fx cpu の x/y/scale/rot/opacity 成分) を形状群に適用する。
  // origin: { x, y } (通常はフレーム中心)。rot は度。非等倍 scale 対応。
  // 透明度は乗算する。field (シェーダ場) には別途 opacity のみ掛けること。
  function applyGroupStateToShapes(shapes, state, origin) {
    if (!shapes || !shapes.length || !state) return shapes;
    const dx = num(state.x, 0);
    const dy = num(state.y, 0);
    const sx = Number.isFinite(num(state.scaleX, 1)) ? num(state.scaleX, 1) : 1;
    const sy = Number.isFinite(num(state.scaleY, 1)) ? num(state.scaleY, 1) : 1;
    const rotDeg = num(state.rot, 0);
    const opacity = clamp01(num(state.opacity, 1));
    const uniform = Math.abs(sx - sy) < 1e-9 && Math.abs(rotDeg) < 1e-9 && dx === 0 && dy === 0;
    if (uniform && opacity >= 0.999) return shapes;
    const ox = num(origin && origin.x, 0);
    const oy = num(origin && origin.y, 0);
    const rad = rotDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const mapPoint = (point) => {
      const px = (point.x - ox) * sx;
      const py = (point.y - oy) * sy;
      return { x: ox + px * cos - py * sin + dx, y: oy + px * sin + py * cos + dy };
    };
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    for (const shape of shapes) {
      if (!shape) continue;
      if (Array.isArray(shape.points)) shape.points = shape.points.map(mapPoint);
      if (shape.kind === 'rect') {
        const p0 = mapPoint({ x: shape.x, y: shape.y });
        const p1 = mapPoint({ x: shape.x + shape.w, y: shape.y + shape.h });
        shape.x = Math.min(p0.x, p1.x);
        shape.y = Math.min(p0.y, p1.y);
        shape.w = Math.abs(p1.x - p0.x);
        shape.h = Math.abs(p1.y - p0.y);
      } else if (shape.kind === 'capsule') {
        const p0 = mapPoint({ x: shape.x0, y: shape.y0 });
        const p1 = mapPoint({ x: shape.x1, y: shape.y1 });
        shape.x0 = p0.x; shape.y0 = p0.y;
        shape.x1 = p1.x; shape.y1 = p1.y;
        if (shape.width != null) shape.width = Math.max(0, shape.width * avgScale);
      } else {
        if (shape.x != null && shape.y != null) {
          const p = mapPoint({ x: shape.x, y: shape.y });
          shape.x = p.x; shape.y = p.y;
        }
        if (shape.r != null) shape.r = Math.max(0, shape.r * avgScale);
        if (shape.radius != null) shape.radius = Math.max(0, shape.radius * avgScale);
        if (shape.thickness != null) shape.thickness = Math.max(0, shape.thickness * avgScale);
        if (shape.stroke != null) shape.stroke = Math.max(0, shape.stroke * avgScale);
      }
      if (opacity < 0.999) {
        shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * opacity;
      }
    }
    return shapes;
  }

  return {
    TEXT_ENTER: [...TEXT_ENTER],
    TEXT_EXIT: [...TEXT_EXIT],
    TEXT_HOLD: [...TEXT_HOLD],
    isCompatible,
    filterInstance,
    filterHold,
    evaluateStyleState,
    pickCompatType,
    applyGroupStateToShapes,
  };
});
