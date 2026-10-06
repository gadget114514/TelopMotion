(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rng'), require('./easing'), require('./tween'), require('./layout'), require('./effects/registry'), require('./keywords'), require('./frame-guard'), require('./weird'), require('./physics'), require('./scope'), require('./text-effects-data'), require('./adsr'), require('./objfx-core'));
  } else {
    root.SA = root.SA || {};
    root.SA.motion = factory(root.SA.rng, root.SA.easing, root.SA.tween, root.SA.layout, root.SA.fx, root.SA.keywords, root.SA.frameGuard, root.SA.weird, root.SA.physics, root.SA.scope, root.SA.textEffectsData, root.SA.adsr, root.SA.objfxCore);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, easing, tween, layout, fx, keywords, frameGuard, weird, physics, scope, textEffectsData, adsrApi, objfxCore) {
  'use strict';

  const TAU = Math.PI * 2;
  const MAX_DEPTH = 4;
  const PHYSICS_DT = physics && physics.DT ? physics.DT : 1 / 120;

  const GROUPS = ['animation', 'layout', 'enter', 'exit', 'location'];

  function clamp01(value) {
    if (Number.isNaN(value)) return 0;
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
  }

  // weird-only emphasis of preset key words (keywords.js): pop, accent, wobble
  const KEYWORD_LOOK = { scale: 0.55, colorMix: 0.85, wobbleDeg: 8, wobbleLift: 0.07, wobbleRate: 1.1 };

  function keywordMarks(scene, project) {
    if (!keywords || !project || !project.styleMode) return null;
    // a composition already decides which word is the hero; the keyword pop
    // would put a second hierarchy on top of it
    if (scene.style && scene.style.text && scene.style.text.compose) return null;
    const axes = project.styleMode.axes || {};
    const s = keywords.strength(weird.text(axes.weird));
    if (!(s > 0)) return null;
    const cfg = keywords.listFor(project.styleMode);
    if (!cfg.enabled) return null;
    const sig = cfg.words.join('\u0001');
    if (!scene.__kw || scene.__kw.sig !== sig) scene.__kw = { sig, ...keywords.mark(scene.letters || [], cfg.words) };
    return scene.__kw.runs ? { strength: s, runOf: scene.__kw.runOf, runs: scene.__kw.runs } : null;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeDeep(base, ...patches) {
    let result = Array.isArray(base) ? [...base] : { ...base };
    for (const patch of patches) {
      if (!isPlainObject(patch)) continue;
      for (const [key, value] of Object.entries(patch)) {
        if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeDeep(result[key], value);
        else result[key] = value;
      }
    }
    return result;
  }

  function resolveDuration(value, duration) {
    if (typeof value === 'string' && value.trim().endsWith('%')) return (parseFloat(value) / 100) * duration;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function groupInstance(style, group) {
    const source = style ? style[group] : null;
    if (group === 'hold') {
      return (Array.isArray(source) ? source : []).map((instance) => fx.withDefaults(instance, 'hold')).filter(Boolean);
    }
    return fx.withDefaults(source, group);
  }

  function motionDef(instance, group, duration) {
    const entry = instance ? fx.get(group, instance.type) : null;
    const base = (entry && entry.defaults && entry.defaults.motion) || {};
    const merged = mergeDeep(fx.DEFAULT_MOTION, base, (instance && instance.motion) || {});
    for (const phase of ['in', 'out']) {
      merged[phase] = { ...merged[phase] };
      merged[phase].duration = Math.max(0.001, resolveDuration(merged[phase].duration, duration));
      merged[phase].delay = resolveDuration(merged[phase].delay, duration);
    }
    if (merged.loop && merged.loop.period != null) merged.loop.period = Math.max(0, resolveDuration(merged.loop.period, duration));
    return merged;
  }

  // ADSR envelope (animation.motion.adsr): attack = enter, decay = the settle
  // from `peak` to `sustain` after it, sustain = hold level, release = exit.
  function adsrDef(animationInstance, duration) {
    const raw = animationInstance && animationInstance.motion && animationInstance.motion.adsr;
    return adsrApi ? adsrApi.def(raw, duration) : null;
  }

  // Envelope level at beat-local time `local` for one letter. `enterEase` /
  // `exitEase` are easing functions. The release starts from the level reached
  // at exitStart, so a beat shorter than A+D+R never jumps.
  function adsrLevel(adsr, local, enterStart, enterDur, exitStart, exitDur, enterEase, exitEase) {
    return adsrApi ? adsrApi.level(adsr, local, enterStart, enterDur, exitStart, exitDur, enterEase, exitEase) : 0;
  }

  function staggerRanks(letters, order, from, random) {
    const count = letters.length;
    const values = new Array(count);
    const center = (count - 1) * clamp01(from == null ? 0.5 : from);
    for (let i = 0; i < count; i += 1) values[i] = i;
    if (order === 'rtl') {
      for (let i = 0; i < count; i += 1) values[i] = count - 1 - i;
    } else if (order === 'center-out') {
      for (let i = 0; i < count; i += 1) values[i] = Math.abs(i - center);
    } else if (order === 'edges-in') {
      const max = Math.max(center, count - 1 - center, 1);
      for (let i = 0; i < count; i += 1) values[i] = max - Math.abs(i - center);
    } else if (order === 'random') {
      const indices = [...new Array(count).keys()];
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      for (let rank = 0; rank < count; rank += 1) values[indices[rank]] = rank;
    } else if (order === 'word') {
      for (let i = 0; i < count; i += 1) values[i] = letters[i].wordIdx || 0;
    } else if (order === 'line') {
      for (let i = 0; i < count; i += 1) values[i] = letters[i].lineIdx || 0;
    } else if (order === 'strokeLength') {
      const lengths = letters.map((letter) => num(letter.outlineLength, letter.local ? letter.local.w : 0));
      const sorted = letters.map((letter, index) => ({ index, length: lengths[index] })).sort((a, b) => a.length - b.length);
      sorted.forEach((entry, rank) => {
        values[entry.index] = rank;
      });
    } else if (order === 'oddEven') {
      let next = 0;
      const limit = Math.ceil(count / 2);
      for (let i = 0; i < count; i += 1) {
        if (i % 2 === 0) values[i] = next++;
        else values[i] = limit + Math.floor((i - 1) / 2);
      }
    } else if (order === 'vertical-reading') {
      for (let i = 0; i < count; i += 1) {
        const letter = letters[i];
        values[i] = (letter.columnIdx || 0) * 1000 + (letter.rowIdx == null ? i : letter.rowIdx);
      }
    }
    const list = values.filter((value) => Number.isFinite(value));
    const min = list.length ? Math.min(...list) : 0;
    const shifted = values.map((value) => num(value) - min);
    const max = shifted.length ? Math.max(...shifted) : 0;
    return { ranks: shifted, max };
  }

  function rankOrder(letters, order, from, random) {
    const { ranks, max } = staggerRanks(letters, order, from, random);
    return { ranks, max: Math.max(1, max) };
  }

  function levelCenters(positions, letters) {
    const words = new Map();
    const lines = new Map();
    for (let i = 0; i < letters.length; i += 1) {
      const letter = letters[i];
      const point = positions[i] || { x: 0, y: 0 };
      const wordKey = `${letter.lineIdx}:${letter.wordIdx}`;
      if (!words.has(wordKey)) words.set(wordKey, { x: 0, y: 0, n: 0 });
      const word = words.get(wordKey);
      word.x += point.x;
      word.y += point.y;
      word.n += 1;
      const lineKey = String(letter.lineIdx);
      if (!lines.has(lineKey)) lines.set(lineKey, { x: 0, y: 0, n: 0 });
      const line = lines.get(lineKey);
      line.x += point.x;
      line.y += point.y;
      line.n += 1;
    }
    const finish = (map) => {
      for (const value of map.values()) {
        value.x /= value.n;
        value.y /= value.n;
      }
      return map;
    };
    return { words: finish(words), lines: finish(lines) };
  }

  function applyOverrides(state, letter, project, centers) {
    if (!project) return;
    const cuePath = `cue:${letter.cueId}`;
    const beatPath = `${cuePath}/beat:${letter.beatId}`;
    const linePath = `${beatPath}/line:${letter.lineIdx}`;
    const wordPath = `${linePath}/word:${letter.wordIdx}`;
    const levels = [
      [cuePath, null],
      [beatPath, null],
      [linePath, centers.lines.get(String(letter.lineIdx)) || null],
      [wordPath, centers.words.get(`${letter.lineIdx}:${letter.wordIdx}`) || null],
      [letter.path, null],
    ];
    for (const [path, center] of levels) {
      const override = project.overrides && project.overrides[path];
      if (!override || !override.transform) continue;
      const transform = override.transform;
      const x = num(transform.x);
      const y = num(transform.y);
      if (center && (x || y)) {
        state.x += x;
        state.y += y;
      } else {
        state.x += x;
        state.y += y;
      }
      const rotate = num(transform.rotate);
      if (center && rotate) {
        const dx = state.x - center.x;
        const dy = state.y - center.y;
        const rad = (rotate * Math.PI) / 180;
        state.x = center.x + dx * Math.cos(rad) - dy * Math.sin(rad);
        state.y = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
      }
      state.rot += rotate;
      const scale = transform.scale == null ? 1 : num(transform.scale, 1);
      if (transform.scaleX != null) state.scaleX *= scale * num(transform.scaleX, 1);
      else state.scaleX *= scale;
      if (transform.scaleY != null) state.scaleY *= scale * num(transform.scaleY, 1);
      else state.scaleY *= scale;
      if (transform.opacity != null) state.opacity *= num(transform.opacity, 1);
      state.tiltX += num(transform.tiltX);
      state.tiltY += num(transform.tiltY);
    }
  }

  // Applies the scope style transform (cue / beat level) to a letter state.
  function applyStyleTransform(state, transform) {
    if (!transform) return;
    state.x += num(transform.x);
    state.y += num(transform.y);
    state.rot += num(transform.rotate);
    const scale = transform.scale == null ? 1 : num(transform.scale, 1);
    if (transform.scaleX != null) state.scaleX *= scale * num(transform.scaleX, 1);
    else state.scaleX *= scale;
    if (transform.scaleY != null) state.scaleY *= scale * num(transform.scaleY, 1);
    else state.scaleY *= scale;
    if (transform.opacity != null) state.opacity *= num(transform.opacity, 1);
    state.tiltX += num(transform.tiltX);
    state.tiltY += num(transform.tiltY);
  }

  function collectKeyframes(letter, project, local, paramOverrides) {
    const deltas = { dx: 0, dy: 0, rot: 0, tiltX: 0, tiltY: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, colorMix: null };
    if (!project || !project.keyframes) return deltas;
    const cuePath = `cue:${letter.cueId}`;
    const beatPath = `${cuePath}/beat:${letter.beatId}`;
    const linePath = `${beatPath}/line:${letter.lineIdx}`;
    const wordPath = `${linePath}/word:${letter.wordIdx}`;
    const levels = [cuePath, beatPath, linePath, wordPath, letter.path];
    for (const path of levels) {
      const tracks = project.keyframes[path];
      if (!tracks) continue;
      for (const [prop, keys] of Object.entries(tracks)) {
        if (!Array.isArray(keys) || !keys.length) continue;
        const kind = prop.startsWith('color.') ? 'color' : 'number';
        const value = tween.segment({ kind, keys: keys.map((key) => ({ t: key.t, value: key.value, ease: key.ease })) }, local);
        if (value == null) continue;
        if (prop === 'transform.x') deltas.dx += num(value);
        else if (prop === 'transform.y') deltas.dy += num(value);
        else if (prop === 'transform.rotate') deltas.rot += num(value);
        else if (prop === 'transform.tiltX') deltas.tiltX += num(value);
        else if (prop === 'transform.tiltY') deltas.tiltY += num(value);
        else if (prop === 'transform.scale') deltas.scale *= num(value, 1);
        else if (prop === 'transform.scaleX') deltas.scaleX *= num(value, 1);
        else if (prop === 'transform.scaleY') deltas.scaleY *= num(value, 1);
        else if (prop === 'transform.opacity') deltas.opacity *= num(value, 1);
        else if (prop === 'color.fill') deltas.colorMix = clamp01(num(value, 0));
        else {
          const match = prop.match(/^(animation|layout|enter|exit|hold|location)\.params\.([\w.]+)$/);
          if (match) {
            paramOverrides[match[1]] = paramOverrides[match[1]] || {};
            paramOverrides[match[1]][match[2]] = value;
          }
        }
      }
    }
    return deltas;
  }

  function applyKeyframeDeltas(state, deltas) {
    if (!deltas) return;
    state.x += deltas.dx;
    state.y += deltas.dy;
    state.rot += deltas.rot;
    state.tiltX += deltas.tiltX;
    state.tiltY += deltas.tiltY;
    state.scaleX *= deltas.scale * deltas.scaleX;
    state.scaleY *= deltas.scale * deltas.scaleY;
    state.opacity *= deltas.opacity;
    if (deltas.colorMix != null) state.colorMix = Math.max(state.colorMix, deltas.colorMix);
  }

  function resolveLayoutFrom(ctx, params, targets, frame, random, anchor) {
    const from = params.from || 'none';
    if (from === 'none') return null;
    if (from === 'previousCue') {
      if (ctx.previousPositions && ctx.previousPositions.length) {
        return ctx.previousPositions.map((point) => ({
          x: point.x - anchor.x,
          y: point.y - anchor.y,
          rot: point.rot || 0,
          scale: point.scale == null ? 1 : point.scale,
        }));
      }
      return layout.startFormation('point', params, targets, frame, random);
    }
    if (from === 'formation') {
      return layout.formation(params.fromFormation || 'row', params, ctx.letters || [], ctx.blockBBox, frame, random);
    }
    return layout.startFormation(from, params, targets, frame, random);
  }

  function activeSequenceFormation(params, sequenceCache, holdTime, duration) {
    const sequence = Array.isArray(params.sequence) ? params.sequence : null;
    if (!sequence || !sequence.length) return null;
    let active = null;
    for (let index = 0; index < sequence.length; index += 1) {
      const entry = sequence[index];
      const at = clamp01(num(entry.at, 0)) * duration;
      if (holdTime >= at) active = { entry, index, at };
    }
    if (!active) return null;
    const blendDuration = Math.max(0.001, num(active.entry.duration, 0.8));
    const progress = clamp01((holdTime - active.at) / blendDuration);
    return {
      index: active.index,
      progress,
      ease: active.entry.ease || 'easeInOutCubic',
      formation: sequenceCache[active.index],
    };
  }

  function evaluateBeat(scene, t, ctx) {
    const options = ctx || {};
    const beat = options.beat || {
      id: scene.beatId,
      cueId: scene.cueId,
      kind: scene.kind,
      start: scene.start,
      end: scene.end,
      text: scene.text,
    };
    const style = scene.style || {};
    const frame = options.frame || { width: 1920, height: 1080 };
    const project = options.project || null;
    const seed = num(options.seed, 12345);
    const duration = Math.max(0.001, beat.end - beat.start);
    const letters = scene.letters || [];
    const N = letters.length;
    const shortSide = Math.min(frame.width, frame.height);
    // Block-space deformations (warps, the dynamic font size) measure around
    // the layout centre, which is the anchor. The half-size comes from the
    // layout bbox; the per-letter origin is filled in at the end of the loop.
    const blockBBox = scene.blockBBox || null;
    const blockHalf = blockBBox
      ? { x: Math.max(1, (blockBBox.x2 - blockBBox.x1) / 2), y: Math.max(1, (blockBBox.y2 - blockBBox.y1) / 2) }
      : null;
    // Unit ranks for the selector-based effects: every letter carries its rank
    // among the letters / words / lines of the beat, so a range selector can
    // sweep the string without knowing the scene itself.
    const wordRanks = new Map();
    const lineRanks = new Map();
    for (let index = 0; index < letters.length; index += 1) {
      const letter = letters[index];
      const lineKey = letter.lineIdx == null ? 0 : letter.lineIdx;
      if (!lineRanks.has(lineKey)) lineRanks.set(lineKey, lineRanks.size);
      const wordKey = `${lineKey}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
      if (!wordRanks.has(wordKey)) wordRanks.set(wordKey, wordRanks.size);
    }
    const unitsFor = (index, letter) => {
      const lineKey = letter.lineIdx == null ? 0 : letter.lineIdx;
      const wordKey = `${lineKey}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
      return {
        letter: { rank: index, count: N },
        word: { rank: wordRanks.get(wordKey) || 0, count: Math.max(1, wordRanks.size) },
        line: { rank: lineRanks.get(lineKey) || 0, count: Math.max(1, lineRanks.size) },
      };
    };

    const animation = groupInstance(style, 'animation');
    const layoutInstance = groupInstance(style, 'layout');
    const enter = groupInstance(style, 'enter');
    const exit = groupInstance(style, 'exit');
    const location = groupInstance(style, 'location');
    const holds = groupInstance(style, 'hold');
    const customMotions = Array.isArray(style.motions) ? style.motions : [];
    // Partial decorations (`style.scoped`): each entry carries its own scope
    // mask. Enter / exit replace the base instance for the covered letters,
    // hold entries are appended to the hold stack.
    const scopedDefs = [];
    if (Array.isArray(style.scoped)) {
      for (const raw of style.scoped) {
        if (!raw || raw.enabled === false || !raw.group || !raw.type) continue;
        const instance = fx.withDefaults({ type: raw.type, params: raw.params, motion: raw.motion, enabled: true }, raw.group);
        if (!instance) continue;
        const mask = scope && scope.scopeMask ? scope.scopeMask(scene, raw.scope) : null;
        if (!mask) continue;
        // `local: true` treats the substring as a string of its own: the entry
        // gets its own per-run info below, so its effects measure around the
        // substring instead of the whole beat (and the block deformations it
        // pushes move around the substring's centre).
        scopedDefs.push({ group: raw.group, instance, mask, scope: raw.scope || null, local: raw.local === true,
          stagger: raw.stagger && typeof raw.stagger === 'object' ? { ...raw.stagger } : null,
          drawOrder: Number.isFinite(Number(raw.drawOrder)) ? Number(raw.drawOrder) : 0 });
      }
    }
    const scopedAt = (index, group) => scopedDefs.find((entry) => entry.group === group && entry.mask[index]) || null;

    const animationType = (animation && animation.type) || 'stagger';
    const layoutParams = (layoutInstance && layoutInstance.params) || {};
    const enterType = (enter && enter.type) || 'fade';
    const exitType = (exit && exit.type) || 'fade';
    const locationType = (location && location.type) || 'center';
    const enterParams = (enter && enter.params) || {};
    const exitParams = (exit && exit.params) || {};
    const locationParams = (location && location.params) || {};

    const animationDef = motionDef(animation, 'animation', duration);
    const layoutDef = motionDef(layoutInstance, 'layout', duration);
    const enterDef = motionDef(enter, 'enter', duration);
    const exitDef = motionDef(exit, 'exit', duration);
    const locationDef = motionDef(location, 'location', duration);
    const adsr = adsrDef(animation, duration);
    const applyAdsrTiming = (enterD, exitD) => {
      if (!adsr) return;
      if (adsr.attack != null) enterD.in.duration = adsr.attack;
      if (adsr.release != null) exitD.out.duration = adsr.release;
    };
    applyAdsrTiming(enterDef, exitDef);
    // a few effects (creepOut) define their own fixed timing
    const exitDescriptor = fx.get('exit', exitType);
    if (exitDescriptor && Number.isFinite(exitDescriptor.fixedDuration)) {
      exitDef.out.duration = Math.max(0.001, exitDescriptor.fixedDuration);
      exitDef.out.delay = 0;
    }
    const analysis = options.analysis || null;
    const audioFeatures = options.audioFeatures || null;

    const staggerParams = (animation && animation.params) || {};
    const staggerCfg = {
      order: staggerParams.order || animationDef.stagger.order || 'ltr',
      each: staggerParams.each != null ? staggerParams.each : animationDef.stagger.each,
      ease: staggerParams.ease || animationDef.stagger.ease || 'linear',
      from: staggerParams.from != null ? staggerParams.from : animationDef.stagger.from,
      unit: staggerParams.unit || animationDef.stagger.unit || 'letter',
    };

    // Animation type adjustments
    if (animationType === 'simultaneous') staggerCfg.each = 0;
    if (animationType === 'spring') {
      const entry = fx.get('animation', 'spring');
      const params = (animation && animation.params) || {};
      const springEase = easing.spring({ stiffness: num(params.stiffness, 170), damping: num(params.damping, 26), mass: 1 });
      enterDef.in.ease = springEase;
      exitDef.out.ease = springEase;
    }
    if (animationType === 'followThrough') {
      const params = (animation && animation.params) || {};
      animation.follow = { amount: num(params.amount, 0.35), decay: num(params.decay, 3) };
    }
    if (animationType === 'stopMotion') {
      const params = (animation && animation.params) || {};
      animation.stopFps = Math.max(1, num(params.fps, 12));
    }
    if (animationType === 'timeWarp') {
      const params = (animation && animation.params) || {};
      animation.timeWarpEase = params.ease || 'easeInOutSine';
    }
    if (animationType === 'loop') {
      const params = (animation && animation.params) || {};
      animationDef.loop = { ...animationDef.loop, ...params };
    }
    // `animation.loop` repeats the hold effects over its period (§7.1): it
    // wraps the hold-local time, falling back to the hold instance's own loop.
    const animationLoop = animationType === 'loop' && num(animationDef.loop && animationDef.loop.period, 0) > 0 ? animationDef.loop : null;
    if (animationType === 'cascade') {
      const params = (animation && animation.params) || {};
      const overlap = clamp01(num(params.overlap, 0.5));
      const wordCount = Math.max(1, letters.reduce((max, letter) => Math.max(max, (letter.wordIdx || 0) + 1), 1));
      staggerCfg.unit = 'word';
      staggerCfg.each = (enterDef.in.duration * (1 - overlap)) / Math.max(1, wordCount - 1);
    }

    const staggerRandom = rng.rngFor(seed, beat.id || scene.beatId, 'stagger');
    let order = staggerCfg.order;
    if (staggerCfg.unit === 'word') order = 'word';
    else if (staggerCfg.unit === 'line') order = 'line';
    const { ranks, max } = rankOrder(letters, order, staggerCfg.from, staggerRandom);
    const staggerEase = easing.get(staggerCfg.ease);
    const each = num(staggerCfg.each, 0.035);
    const offsets = ranks.map((rank) => each * max * staggerEase(max ? rank / max : 0));
    const offMax = offsets.length ? Math.max(...offsets) : 0;
    const exitOrderReverse = animation && animation.params && animation.params.exitOrder === 'reverse';

    // Anchor
    const locationEntry = fx.get('location', locationType);
    const locationRandom = rng.rngFor(seed, beat.id || scene.beatId, 'location');
    const anchorPoint = locationEntry && typeof locationEntry.anchor === 'function'
      ? locationEntry.anchor(locationParams, frame, { rng: locationRandom, badgeRect: options.badgeRect || null })
      : { x: frame.width / 2, y: frame.height / 2 };
    let anchorX = anchorPoint.x;
    let anchorY = anchorPoint.y + num(options.stackOffset, 0);
    // A grid location can name an edge of the block instead of its centre:
    // edge -1 puts the block's left / top edge on the point, +1 the right /
    // bottom edge. Locations without `edge` are untouched.
    const anchorEdge = anchorPoint.edge;
    if (blockHalf && anchorEdge) {
      anchorX -= num(anchorEdge.x) * blockHalf.x;
      anchorY -= num(anchorEdge.y) * blockHalf.y;
    }
    // Keep the block inside the location's safe area when it fits. A block
    // larger than the frame is centred on that axis: the extra size is
    // intentional (a weird beat fills the screen) and frameGuard keeps at
    // least half of it visible.
    if (blockHalf) {
      const safeRatio = num(anchorPoint.safe, 0.04);
      const safeX = Math.max(0, safeRatio) * frame.width;
      const safeY = Math.max(0, safeRatio) * frame.height;
      const minX = safeX + blockHalf.x;
      const maxX = frame.width - safeX - blockHalf.x;
      const minY = safeY + blockHalf.y;
      const maxY = frame.height - safeY - blockHalf.y;
      anchorX = minX > maxX ? frame.width / 2 : Math.max(minX, Math.min(maxX, anchorX));
      anchorY = minY > maxY ? frame.height / 2 : Math.max(minY, Math.min(maxY, anchorY));
    }
    const drift = locationParams.drift || { x: 0, y: 0 };

    // Formations (relative to the anchor)
    const layoutRandom = rng.rngFor(seed, beat.id || scene.beatId, 'layout');
    const targetFormation = layout.formation(layoutInstance ? layoutInstance.type : 'row', layoutParams, letters, scene.blockBBox, frame, layoutRandom);
    const startFormation = resolveLayoutFrom({ ...options, letters, blockBBox: scene.blockBBox }, layoutParams, targetFormation, frame, layoutRandom, { x: anchorX, y: anchorY });
    const toType = layoutParams.to && layoutParams.to !== 'none' ? layoutParams.to : null;
    const exitFormation = toType ? layout.formation(toType, layoutParams, letters, scene.blockBBox, frame, layoutRandom) : null;
    const curve = num(layoutParams.curve, 0);
    const curveSigns = letters.map((letter, index) => layout.curveSign(layoutParams.curveDir, index, layoutRandom));
    const sequenceCache = [];
    if (Array.isArray(layoutParams.sequence)) {
      for (const entry of layoutParams.sequence) {
        sequenceCache.push(layout.formation(entry.type || 'row', { ...layoutParams, ...(entry.params || {}) }, letters, scene.blockBBox, frame, layoutRandom));
      }
    }

    const centers = levelCenters(targetFormation, letters);
    const kw = keywordMarks(scene, project);
    let kwCenters = null;
    if (kw) {
      kwCenters = Array.from({ length: kw.runs }, () => ({ x: 0, y: 0, n: 0 }));
      for (let i = 0; i < N; i += 1) {
        const r = kw.runOf[i];
        if (r < 0) continue;
        const p = targetFormation[i] || { x: 0, y: 0 };
        kwCenters[r].x += p.x; kwCenters[r].y += p.y; kwCenters[r].n += 1;
      }
      for (const c of kwCenters) { c.x /= c.n; c.y /= c.n; }
    }

    // --- local substring geometry (B) -------------------------------------------
    // A `local` scoped entry sees its substring as a string of its own, so the
    // run carries its own ranks, centre, bbox and half size. The walk unit is a
    // *run*: the contiguous flagged letters of one line. A `slice` on a line
    // anchor, and an `nth` at every N, both split into several runs - and an
    // `nth` at every 2 becomes one run per letter, so each letter squashes on
    // its own (the same look the whole-beat `nth` gives).
    //
    // The geometry is scene-level (the formation points only move with the
    // layout, not per frame), so it is built once per def and reused.
    const runCache = new Map();
    function runsOf(def) {
      if (runCache.has(def)) return runCache.get(def);
      const runs = [];
      const runOf = new Int32Array(N).fill(-1);
      let current = null;
      for (let i = 0; i < N; i += 1) {
        if (!def.mask[i]) {
          current = null;
          continue;
        }
        const lineIdx = letters[i].lineIdx == null ? 0 : letters[i].lineIdx;
        if (!current || current.lineIdx !== lineIdx) {
          current = { lineIdx, members: [], rank: new Map() };
          runs.push(current);
        }
        runOf[i] = runs.length - 1;
        current.rank.set(i, current.members.length);
        current.members.push(i);
      }
      for (const run of runs) {
        let cx = 0;
        let cy = 0;
        let x1 = Infinity;
        let x2 = -Infinity;
        for (const index of run.members) {
          const point = targetFormation[index] || { x: 0, y: 0, scale: 1 };
          cx += point.x;
          cy += point.y;
          const letter = letters[index];
          const scale = point.scale == null ? 1 : point.scale;
          const w = Math.max(1, num(letter.advance, 0)) * scale;
          const h = Math.max(1, num(letter.size, 0)) * 0.5;
          x1 = Math.min(x1, point.x - w / 2);
          x2 = Math.max(x2, point.x + w / 2);
        }
        run.count = run.members.length;
        run.center = { x: cx / run.count, y: cy / run.count };
        run.half = { x: Math.max(1, (x2 - x1) / 2), y: Math.max(1, num(letters[run.members[0]].size, 24) * 0.5) };
        run.bbox = { x1: -run.half.x, y1: -run.half.y, x2: run.half.x, y2: run.half.y };
      }
      const value = { runs, runOf };
      runCache.set(def, value);
      return value;
    }

    // The info of one letter of a local run: same letters, same scene, but the
    // substring stands in for the beat. Every selector effect reads only `i`,
    // `N`, `units`, `blockCenter`, `blockBBox` and `blockHalf`, so they behave
    // as if the substring were a string on its own (tracking spreads from the
    // substring centre, a sine wave takes its phase over the substring, a
    // range selector sweeps the substring).
    function localInfo(def, index, info) {
      if (!def || !def.local) return info;
      const geometry = runsOf(def);
      const r = geometry.runOf[index];
      if (r < 0) return info;
      const run = geometry.runs[r];
      // the run's own words, renumbered from zero inside the run
      const words = new Map();
      for (const member of run.members) {
        const letter = letters[member];
        const key = `${letter.lineIdx == null ? 0 : letter.lineIdx}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
        if (!words.has(key)) words.set(key, words.size);
      }
      const letter = letters[index];
      const wordKey = `${letter.lineIdx == null ? 0 : letter.lineIdx}:${letter.wordIdx == null ? 0 : letter.wordIdx}`;
      const rank = run.rank.get(index) || 0;
      return {
        ...info,
        i: rank,
        N: run.count,
        units: {
          letter: { rank, count: run.count },
          word: { rank: words.get(wordKey) || 0, count: Math.max(1, words.size) },
          line: { rank: 0, count: 1 },
        },
        blockCenter: { x: anchorX + run.center.x, y: anchorY + run.center.y },
        blockBBox: run.bbox,
        blockHalf: run.half,
        run,
      };
    }

    const states = [];
    const envelopes = { layoutIn: 0, layoutOut: 0, enter: 0, exit: 0, hold: 0 };
    const enterEntry = fx.get('enter', enterType);
    const exitEntry = fx.get('exit', exitType);

    // Steps 2-5 of the letter evaluation (formation -> enter -> hold -> exit)
    // as a function of the beat-local time. Every letter calls it once; the
    // physics letters call it again at earlier times to measure the rigid
    // acceleration that drives the soft body.
    function rigidAt(index, beatLocal) {
      const letter = letters[index];
      let offset = offsets[index];
      // textenter2 §4.3: a scoped enter may carry its own stagger, measured by
      // rank inside its local run instead of the beat stagger.
      let scopedRank = null;
      const letterRandom = {
        enter: rng.rngFor(seed, letter.path, 'enter'),
        exit: rng.rngFor(seed, letter.path, 'exit'),
        hold: rng.rngFor(seed, letter.path, 'hold'),
        layout: rng.rngFor(seed, letter.path, 'layout'),
      };

      // a scoped enter / exit replaces the base instance for this letter
      const enterOverride = scopedAt(index, 'enter');
      const exitOverride = scopedAt(index, 'exit');
      if (enterOverride && enterOverride.stagger) {
        const st = enterOverride.stagger;
        const each = Number(st.each) || 0;
        if (each === 0) {
          offset = 0;
        } else {
          const geometry = runsOf(enterOverride);
          const r = geometry.runOf[index];
          if (r >= 0) {
            const run = geometry.runs[r];
            const rank = run.rank.get(index) || 0;
            scopedRank = rank;
            const max = Math.max(1, run.count - 1);
            const ease = easing.get(st.ease || 'linear');
            offset = each * max * ease(max ? rank / max : 0);
          } else {
            offset = 0;
          }
        }
      }
      // textenter2 §4.7: user-defined paint order; larger draws later (on top).
      let drawOrder = 0;
      for (const def of scopedDefs) {
        if (def.mask[index] && Number.isFinite(Number(def.drawOrder)) && Number(def.drawOrder) !== 0) {
          drawOrder = Math.max(drawOrder, Number(def.drawOrder));
          if (Number(def.drawOrder) < 0) drawOrder = Math.min(drawOrder, Number(def.drawOrder));
        }
      }
      const enterInstance = enterOverride ? enterOverride.instance : enter;
      const exitInstance = exitOverride ? exitOverride.instance : exit;
      const enterDefLocal = enterInstance === enter ? enterDef : motionDef(enterInstance, 'enter', duration);
      const exitDefLocal = exitInstance === exit ? exitDef : motionDef(exitInstance, 'exit', duration);
      const enterParamsLocal = (enterInstance && enterInstance.params) || {};
      const exitParamsLocal = (exitInstance && exitInstance.params) || {};
      const enterEntryLocal = enterInstance === enter ? enterEntry : fx.get('enter', (enterInstance && enterInstance.type) || 'fade');
      const exitEntryLocal = exitInstance === exit ? exitEntry : fx.get('exit', (exitInstance && exitInstance.type) || 'fade');
      if (enterInstance !== enter || exitInstance !== exit) {
        applyAdsrTiming(enterDefLocal, exitDefLocal);
      }
      if (exitOverride && exitEntryLocal && Number.isFinite(exitEntryLocal.fixedDuration)) {
        exitDefLocal.out.duration = Math.max(0.001, exitEntryLocal.fixedDuration);
        exitDefLocal.out.delay = 0;
      }

      let local = Math.max(0, beatLocal);
      if (animation.timeWarpEase && duration > 0) {
        const warped = easing.get(animation.timeWarpEase)(clamp01(local / duration)) * duration;
        local = warped;
      }
      if (animation.stopFps) local = Math.floor(local * animation.stopFps) / animation.stopFps;
      const holdLocal = Math.max(0, local - (enterDefLocal.in.delay + enterDefLocal.in.duration + offset));

      const enterStart = enterDefLocal.in.delay + offset;
      const pe = clamp01((local - enterStart) / enterDefLocal.in.duration);
      const exitStart = duration - exitDefLocal.out.duration - exitDefLocal.out.delay - (exitOrderReverse ? offset : offMax - offset);
      const px = clamp01((local - exitStart) / exitDefLocal.out.duration);
      const enterEase = easing.get(enterDefLocal.in.ease || 'easeOutCubic');
      const exitEase = easing.get(exitDefLocal.out.ease || 'easeInCubic');

      const adsrValue = adsr
        ? adsrLevel(adsr, local, enterStart, enterDefLocal.in.duration, exitStart, exitDefLocal.out.duration, enterEase, exitEase)
        : null;

      const layoutIn = clamp01((local - layoutDef.in.delay - offset) / layoutDef.in.duration);
      const layoutOut = clamp01((local - (duration - layoutDef.out.duration - layoutDef.out.delay - (offMax - offset))) / layoutDef.out.duration);
      const layoutInEased = easing.get(layoutDef.in.ease || 'easeOutCubic')(layoutIn);
      const layoutOutEased = easing.get(layoutDef.out.ease || 'easeInCubic')(layoutOut);

      const state = {
        x: 0,
        y: 0,
        z: 0,
        rot: 0,
        tiltX: 0,
        tiltY: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        opacity: 1,
        blur: 0,
        visibleFrac: 1,
        deform: [],
        represent: 'mesh',
        reprProgress: clamp01(pe),
        colorMix: 0,
        fx: {},
        drawOrder,
        local,
        pe,
        px,
        timing: { enterStart, enterDur: enterDefLocal.in.duration, exitStart, exitDur: exitDefLocal.out.duration },
      };
      if (adsrValue != null) state.adsr = adsrValue;

      const target = targetFormation[index] || { x: 0, y: 0, rot: 0, scale: 1 };
      const paramOverrides = {};
      const keyframeDeltas = collectKeyframes(letter, project, local, paramOverrides);
      const enterParamsResolved = { ...enterParamsLocal, ...(paramOverrides.enter || {}) };
      const exitParamsResolved = { ...exitParamsLocal, ...(paramOverrides.exit || {}) };

      let base = target;
      const sequenceActive = activeSequenceFormation(layoutParams, sequenceCache, holdLocal, Math.max(0.001, duration - enterDefLocal.in.duration - offMax));
      if (sequenceActive) {
        const previousFormation = sequenceActive.index > 0 ? sequenceCache[sequenceActive.index - 1][index] || target : target;
        const blended = layout.blendPoint(previousFormation, sequenceActive.formation[index] || target, easing.get(sequenceActive.ease)(sequenceActive.progress), curve, curveSigns[index]);
        base = { x: blended.x, y: blended.y, rot: blended.rot, scale: blended.scale };
      }
      let formationPoint = base;
      if (startFormation) {
        const start = startFormation[index] || { x: 0, y: 0, rot: 0, scale: 1 };
        formationPoint = layout.blendPoint(start, base, layoutInEased, curve, curveSigns[index]);
      }
      if (exitFormation) {
        const exitTarget = exitFormation[index] || target;
        formationPoint = layout.blendPoint(formationPoint, exitTarget, layoutOutEased, curve, curveSigns[index]);
      }

      state.x = anchorX + formationPoint.x;
      state.y = anchorY + formationPoint.y;
      state.rot = formationPoint.rot;
      if (letter.baseRot) state.rot += letter.baseRot;
      state.scaleX *= formationPoint.scale == null ? 1 : formationPoint.scale;
      state.scaleY *= formationPoint.scale == null ? 1 : formationPoint.scale;
      if (drift.x || drift.y) {
        state.x += num(drift.x) * shortSide * holdLocal * 0.1;
        state.y += num(drift.y) * shortSide * holdLocal * 0.1;
      }

      if (enterEntryLocal && enterEntryLocal.cpu) {
        enterEntryLocal.cpu(state, enterEase(pe), enterParamsResolved, letterRandom.enter, localInfo(enterOverride, index, {
          i: index,
          N,
          analysis,
          audioFeatures,
          local,
          letter,
          frame,
          shortSide,
          blockBBox,
          blockHalf,
          units: unitsFor(index, letter),
          scene,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
        }));
      }

      if (adsr && adsr.punch > 0) {
        const boost = 1 + adsr.punch * Math.max(0, adsrValue - adsr.sustain);
        state.scaleX *= boost;
        state.scaleY *= boost;
      }

      // The hold stack keeps the scoped def next to its instance: a `local` one
      // substitutes the substring's own info for the beat's (B).
      const holdInstances = holds.map((instance) => ({ instance, def: null }));
      for (const def of scopedDefs) if (def.group === 'hold' && def.mask[index]) holdInstances.push({ instance: def.instance, def });
      const holdEntryList = [];
      for (let holdIndex = 0; holdIndex < holdInstances.length; holdIndex += 1) {
        const holdInstance = holdInstances[holdIndex].instance;
        const holdScoped = holdInstances[holdIndex].def;
        const holdEntry = fx.get('hold', holdInstance.type);
        if (!holdEntry || !holdEntry.cpu || holdInstance.enabled === false) continue;
        const holdDef = motionDef(holdInstance, 'hold', duration);
        const env = adsr
          ? adsrValue
          : clamp01((local - holdDef.in.delay - offset) / holdDef.in.duration) * (1 - clamp01((local - (duration - holdDef.out.duration - holdDef.out.delay)) / holdDef.out.duration));
        let h = holdLocal;
        const wrap = animationLoop || holdDef.loop;
        if (wrap && wrap.period > 0) {
          h = h % wrap.period;
          if (wrap.yoyo) {
            const period = wrap.period;
            const half = Math.floor(holdLocal / period) % 2 === 1;
            h = half ? period - h : h;
          }
        }
        holdEntryList.push({ instance: holdInstance, def: holdScoped, entry: holdEntry, env, h, rng: letterRandom.hold, params: { ...(holdInstance.params || {}), ...(paramOverrides.hold || {}) } });
      }
      // A `local` block deformation (a warp, a fontSize, a squash) must scale
      // around the substring's own centre, not the block's: the warp origin
      // below reads this. When the beat's own block deformation and a local one
      // both touch the same letter, the local one wins - the substring is the
      // more specific centre, and Generate avoids the pair anyway (E3).
      let localRun = null;
      for (const hold of holdEntryList) {
        const deformBefore = state.deform.length;
        hold.entry.cpu(state, hold.h, hold.env, hold.params, hold.rng, localInfo(hold.def, index, {
          i: index,
          N,
          analysis,
          audioFeatures,
          local,
          letter,
          frame,
          shortSide,
          blockBBox,
          blockHalf,
          units: unitsFor(index, letter),
          scene,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
          env: hold.env,
        }));
        if (!localRun && hold.def && hold.def.local && state.deform.length > deformBefore) {
          const geometry = runsOf(hold.def);
          const r = geometry.runOf[index];
          if (r >= 0) localRun = geometry.runs[r];
        }
      }

      if (exitEntryLocal && exitEntryLocal.cpu && px > 0) {
        exitEntryLocal.cpu(state, exitEase(px), exitParamsResolved, letterRandom.exit, localInfo(exitOverride, index, {
          i: index,
          N,
          analysis,
          audioFeatures,
          local,
          letter,
          frame,
          shortSide,
          blockBBox,
          blockHalf,
          units: unitsFor(index, letter),
          scene,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
        }));
      }

      return {
        state,
        letter,
        offset,
        local,
        holdLocal,
        pe,
        px,
        layoutIn,
        layoutOut,
        holdEnv: holdEntryList.length ? holdEntryList[0].env : 0,
        holdList: holdEntryList,
        // the run a `local` block deformation of this letter belongs to (B3)
        localRun,
        base,
        keyframeDeltas,
        enterParams: enterParamsResolved,
        exitParams: exitParamsResolved,
        enterEntry: enterEntryLocal,
        exitEntry: exitEntryLocal,
        enterStart,
        exitStart,
        adsrLevel: adsrValue,
      };
    }

    // --- soft body physics ----------------------------------------------------
    // A descriptor with a physics(params, phase) hook provides the config for
    // the lattice simulation; the hold list is searched first, then the enter
    // and the exit, so a letter never runs two independent simulations. The
    // hook contract requires the descriptor's cpu to be a no-op.
    const physicsCache = scene.__phys || (scene.__phys = new Map());
    if (physicsCache.size > 512) physicsCache.clear();

    function physicsEntryAt(rigid) {
      for (const hold of rigid.holdList) {
        if (typeof hold.entry.physics !== 'function') continue;
        const cfg = hold.entry.physics(hold.params, 'hold');
        if (cfg) return { cfg, phase: 'hold', baseTime: 0 };
      }
      if (rigid.enterEntry && typeof rigid.enterEntry.physics === 'function') {
        const cfg = rigid.enterEntry.physics(rigid.enterParams, 'enter');
        if (cfg) return { cfg, phase: 'enter', baseTime: rigid.enterStart };
      }
      if (rigid.exitEntry && typeof rigid.exitEntry.physics === 'function' && rigid.px > 0) {
        const cfg = rigid.exitEntry.physics(rigid.exitParams, 'exit');
        if (cfg) return { cfg, phase: 'exit', baseTime: rigid.exitStart };
      }
      return null;
    }

    function evaluatePhysics(index, letter, rigid) {
      if (!physics || typeof physics.simulateTo !== 'function') return null;
      // the legibility sampler skips the lattice: a style that carries a
      // physics entry is judged as "never settled" and repaired without paying
      // for a thousand simulations
      if (options.skipPhysics) return null;
      const choice = physicsEntryAt(rigid);
      if (!choice) return null;
      const cfg = choice.cfg;
      const phase = choice.phase;
      const baseTime = choice.baseTime;
      const halfW = Math.max(1, num(letter.local && letter.local.w, 0) / 2);
      const halfH = Math.max(1, num(letter.local && letter.local.h, 0) / 2);
      const em = Math.max(8, num(letter.size, 24));
      const blockBottom = anchorY + (blockHalf ? blockHalf.y : 0);
      const heightPx = num(cfg.height, 0) * em;
      // a gravity drop holds the letter above its place until the enter starts
      if (phase === 'enter' && rigid.local < baseTime) {
        return { dx: 0, dy: -heightPx, rot: 0, lattice: null };
      }
      if (phase === 'exit' && rigid.local < baseTime) return null;

      const floorWorld =
        cfg.floor === 'rest'
          ? rigid.state.y + halfH
          : cfg.floor == null
            ? null
            : blockBottom + num(cfg.floor, 0) * em;
      const maxT = Math.max(0.01, duration + exitDef.out.duration + 0.5);
      const needAccel = num(cfg.inertia, 0) > 0;
      const needSamples = needAccel || !!cfg.lead;
      // the rigid base only has to be re-sampled per step when its acceleration
      // feeds the lattice (or the lead direction follows its velocity);
      // otherwise the current frame's base is enough
      const staticBase = needSamples ? null : { x: rigid.state.x, y: rigid.state.y, rot: rigid.state.rot };
      const samples = [];
      let lastStep = -1;
      const sampleAt = (simT, sim) => {
        if (sim.steps < lastStep) samples.length = 0;
        lastStep = sim.steps;
        for (const sample of samples) if (Math.abs(sample.t - simT) < 1e-9) return sample;
        const sample = { t: simT };
        const evaluated = rigidAt(index, baseTime + simT);
        sample.x = evaluated.state.x;
        sample.y = evaluated.state.y;
        sample.rot = evaluated.state.rot;
        samples.push(sample);
        if (samples.length > 6) samples.shift();
        return sample;
      };
      const bpm = audioFeatures && num(audioFeatures.bpm, 0) > 0 ? num(audioFeatures.bpm, 120) : 120;
      const onsets = cfg.sync === 'beat' ? physics.onsetTimes(analysis) || physics.beatGrid(bpm, maxT) : null;
      const driveAt = (simT, sim) => {
        const current = staticBase || sampleAt(simT, sim);
        let ax = 0;
        let ay = 0;
        let arot = 0;
        let vx = 0;
        let vy = 0;
        let vrot = 0;
        if (needSamples) {
          const s0 = samples.find((sample) => Math.abs(sample.t - (simT - PHYSICS_DT)) < 1e-6);
          if (needAccel) {
            const s1 = samples.find((sample) => Math.abs(sample.t - (simT - PHYSICS_DT * 2)) < 1e-6);
            if (s0 && s1) {
              const dt2 = PHYSICS_DT * PHYSICS_DT;
              ax = (current.x - 2 * s0.x + s1.x) / dt2;
              ay = (current.y - 2 * s0.y + s1.y) / dt2;
              arot = (current.rot - 2 * s0.rot + s1.rot) / dt2;
            }
          }
          if (s0) {
            vx = (current.x - s0.x) / PHYSICS_DT;
            vy = (current.y - s0.y) / PHYSICS_DT;
            vrot = (current.rot - s0.rot) / PHYSICS_DT;
          }
        }
        const drive = {
          accel: { x: ax, y: ay, rot: arot },
          // lead velocity for motionBend (normalized by the letter half size;
          // velGate in shortSide units decides when the direction is trusted)
          vel: { x: vx / halfW, y: vy / halfH, rot: vrot },
          velGate: Math.hypot(vx, vy) / Math.max(1, shortSide),
          unit: { x: halfW, y: halfH },
          gravity: num(cfg.gravity, 0),
          kick: onsets && cfg.beatKick ? physics.kickAt(onsets, simT, PHYSICS_DT) * num(cfg.beatKick, 0) : 0,
        };
        if (floorWorld != null) {
          drive.floor = {
            nodeY: (floorWorld - current.y - sim.com.y) / halfH,
            comY: floorWorld - current.y - halfH,
          };
        }
        return drive;
      };

      const spinSign = rng.hash32(letter.path, 'physspin') % 2 ? 1 : -1;
      const key = [beat.id || scene.beatId, 'phys', index, phase, rng.hash32(JSON.stringify(cfg)), Math.round(frame.width), Math.round(frame.height), seed].join('|');
      const result = physics.simulateTo(physicsCache, key, rigid.local - baseTime, cfg, {
        dt: PHYSICS_DT,
        maxT,
        driveAt,
        initial: { y: phase === 'enter' ? -heightPx : 0, vrot: num(cfg.spin, 0) * spinSign },
      });
      return { dx: result.dx, dy: result.dy, rot: result.rot, lattice: result.lattice, active: result.active, halfW, halfH };
    }

    // --- reflow (C) -------------------------------------------------------------
    // A substring that grows sideways would overlap the rest of its line, so the
    // letters outside it step aside by the grown half-width. A descriptor opts
    // in with a `spread(h, env, params, info)` hook that reports the growth
    // (`{ x, y }`, 0 = unchanged, 0.5 = half again as wide); `tracking` and
    // `stretch` implement it. The push is symmetric about the run's centre,
    // because the effect itself spreads the run about its centre.
    //
    // The timing is the run's *first* letter's (the hold stack is per letter,
    // so the whole run has to agree on one value) and it reuses the same
    // formulas as `rigidAt`: the ADSR level is read on the beat's own enter /
    // exit timing, which is what a local hold sees unless a scoped enter
    // replaces it (then the two ends differ by a frame at most).
    const vertical = (style.text && style.text.direction) === 'vertical' || scene.direction === 'vertical';
    let reflow = null;
    {
      const beatLocal = Math.max(0, t - beat.start);
      const enterEase = easing.get(enterDef.in.ease || 'easeOutCubic');
      const exitEase = easing.get(exitDef.out.ease || 'easeInCubic');
      for (const def of scopedDefs) {
        if (def.group !== 'hold' || !def.local) continue;
        const entry = fx.get('hold', def.instance.type);
        if (!entry || typeof entry.spread !== 'function') continue;
        const holdDef = motionDef(def.instance, 'hold', duration);
        const geometry = runsOf(def);
        for (const run of geometry.runs) {
          const first = run.members[0];
          const offset = offsets[first];
          const env = adsr
            ? adsrLevel(adsr, beatLocal, enterDef.in.delay + offset, enterDef.in.duration, duration - exitDef.out.duration - exitDef.out.delay, exitDef.out.duration, enterEase, exitEase)
            : clamp01((beatLocal - holdDef.in.delay - offset) / holdDef.in.duration) * (1 - clamp01((beatLocal - (duration - holdDef.out.duration - holdDef.out.delay)) / holdDef.out.duration));
          const holdLocal = Math.max(0, beatLocal - (enterDef.in.delay + enterDef.in.duration + offset));
          let h = holdLocal;
          const wrap = animationLoop || holdDef.loop;
          if (wrap && wrap.period > 0) {
            h = h % wrap.period;
            if (wrap.yoyo) h = Math.floor(holdLocal / wrap.period) % 2 === 1 ? wrap.period - h : h;
          }
          const info = localInfo(def, first, {
            i: 0,
            N,
            analysis,
            audioFeatures,
            local: beatLocal,
            letter: letters[first],
            frame,
            shortSide,
            blockBBox,
            blockHalf,
            units: unitsFor(first, letters[first]),
            scene,
            blockCenter: { x: anchorX, y: anchorY },
            letterX: anchorX + run.center.x,
            letterY: anchorY + run.center.y,
            beatDuration: duration,
            env,
          });
          const growth = entry.spread(h, env, def.instance.params || {}, info);
          if (!growth || (!growth.x && !growth.y)) continue;
          const dx = num(growth.x, 0) * run.half.x;
          const dy = num(growth.y, 0) * run.half.y;
          if (!dx && !dy) continue;
          if (!reflow) reflow = new Float32Array(N * 2);
          const at = vertical ? run.center.y : run.center.x;
          for (let index = 0; index < N; index += 1) {
            if (geometry.runOf[index] >= 0) continue; // the run spreads itself
            const letter = letters[index];
            if ((letter.lineIdx == null ? 0 : letter.lineIdx) !== run.lineIdx) continue;
            const point = targetFormation[index] || { x: 0, y: 0 };
            const value = vertical ? point.y : point.x;
            if (Math.abs(value - at) < 0.5) continue; // level with the run: no clear side
            const side = value > at ? 1 : -1;
            reflow[index * 2] += side * dx;
            reflow[index * 2 + 1] += side * dy;
          }
        }
      }
    }

    // Steps after rigidAt, before physics (objeffects §3.1): reflow, custom
    // motions, follow, overrides, keyword, style transform, keyframe deltas.
    // The main loop calls it for the live state; transformAt reuses it to
    // rebuild the rigid motion at past times for motion-reactive holds.
    function applyPostRigid(index, rigid, state, reflow) {
      const letter = letters[index];
      const local = rigid.local;
      const pe = rigid.pe;
      const base = rigid.base;
      const keyframeDeltas = rigid.keyframeDeltas;
      // the reflow the local runs pushed onto this letter (C)
      if (reflow) {
        state.x += reflow[index * 2];
        state.y += reflow[index * 2 + 1];
      }

      // Custom animations added by hand from the Motion gallery. Each entry
      // runs its own effect over its own window, on top of the built-in ones.
      for (const custom of customMotions) {
        if (!custom || !custom.type || custom.enabled === false) continue;
        const phase = custom.phase === 'exit' ? 'exit' : custom.phase === 'hold' ? 'hold' : 'enter';
        const entry = fx.get(phase, custom.type);
        if (!entry || !entry.cpu) continue;
        const motionDuration = Math.max(0.001, num(custom.duration, 0.6));
        const motionDelay = num(custom.delay, 0);
        const startAt = (custom.from === 'end' ? duration : 0) + motionDelay;
        const motionRng = rng.rngFor(seed, `${beat.id || scene.beatId}|${custom.id || custom.type}`, phase);
        const info = {
          i: index,
          N,
          analysis,
          audioFeatures,
          local,
          letter,
          frame,
          shortSide,
          blockBBox,
          blockHalf,
          units: unitsFor(index, letter),
          scene,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: motionDuration,
        };
        if (phase === 'hold') {
          const localHold = local - startAt;
          if (localHold < 0 || localHold > motionDuration) continue;
          const fade = Math.min(0.15, motionDuration / 2);
          const env = clamp01(localHold / Math.max(0.001, fade)) * (1 - clamp01((localHold - (motionDuration - fade)) / Math.max(0.001, fade)));
          entry.cpu(state, localHold, env, custom.params || {}, motionRng, { ...info, env });
        } else {
          const localPhase = local - startAt;
          if (localPhase < 0) continue;
          const progress = clamp01(localPhase / motionDuration);
          const easeFn = easing.get(custom.ease || (phase === 'enter' ? 'easeOutCubic' : 'easeInCubic'));
          entry.cpu(state, easeFn(progress), custom.params || {}, motionRng, info);
        }
      }

      if (animation.follow && startFormation) {
        const amount = animation.follow.amount;
        const decay = animation.follow.decay;
        const wobble = amount * Math.sin(Math.PI * clamp01(pe)) * Math.exp(-decay * clamp01(pe));
        state.x += (state.x - (anchorX + base.x)) * wobble;
        state.y += (state.y - (anchorY + base.y)) * wobble;
      }

      applyOverrides(state, letter, project, centers);
      if (kw && kw.runOf[index] >= 0) {
        const r = kw.runOf[index];
        const s = kw.strength;
        const c = kwCenters[r];
        const p = targetFormation[index] || c;
        const k = KEYWORD_LOOK.scale * s * clamp01(pe); // grows in with the entrance
        state.x += (p.x - c.x) * k;                     // spread the run about its centre
        state.y += (p.y - c.y) * k;
        state.scaleX *= 1 + k;
        state.scaleY *= 1 + k;
        state.colorMix = Math.max(state.colorMix || 0, KEYWORD_LOOK.colorMix * s);
        const w = clamp01((s - 0.5) * 2);               // wobble only in the upper half
        if (w > 0) {
          const kwPhase = rng.rngFor(seed, `${beat.id || scene.beatId}|kw${r}`, 'hold')();
          const wave = Math.sin(TAU * (local * KEYWORD_LOOK.wobbleRate + kwPhase));
          state.rot += wave * KEYWORD_LOOK.wobbleDeg * w;
          state.y -= Math.abs(wave) * KEYWORD_LOOK.wobbleLift * (letter.size || 96) * w;
        }
      }
      applyStyleTransform(state, style.transform);
      applyKeyframeDeltas(state, keyframeDeltas);
    }

    // Motion-reactive holds (objeffects §3): transformAt rebuilds the rigid
    // motion (formation + enter/hold/exit + post-rigid, no physics, no objfx)
    // at any beat-local time; the per-frame cache is shared by the delay,
    // velocity and release evaluations of one frame.
    const objfxCache = new Map();
    function transformAt(index, beatLocal) {
      const key = `${index}|${Math.round(beatLocal * 1e6)}`;
      let hit = objfxCache.get(key);
      if (!hit) {
        const rebuilt = rigidAt(index, beatLocal);
        applyPostRigid(index, rebuilt, rebuilt.state, reflow);
        const point = rebuilt.state;
        hit = {
          x: point.x || 0, y: point.y || 0, rot: point.rot || 0,
          scaleX: point.scaleX == null ? 1 : point.scaleX,
          scaleY: point.scaleY == null ? 1 : point.scaleY,
          opacity: point.opacity == null ? 1 : point.opacity,
        };
        if (objfxCache.size > 4096) objfxCache.clear();
        objfxCache.set(key, hit);
      }
      return hit;
    }

    function objfxHash(i, salt) {
      const value = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    }

    function objfxUnitRank(i, unit) {
      if (unit === 'word') {
        const order = [];
        for (let k = 0; k < N; k += 1) {
          const key = `${letters[k].lineIdx == null ? 0 : letters[k].lineIdx}:${letters[k].wordIdx == null ? 0 : letters[k].wordIdx}`;
          if (!order.includes(key)) order.push(key);
        }
        const self = `${letters[i].lineIdx == null ? 0 : letters[i].lineIdx}:${letters[i].wordIdx == null ? 0 : letters[i].wordIdx}`;
        return { rank: order.indexOf(self), count: order.length };
      }
      if (unit === 'line') {
        const order = [];
        for (let k = 0; k < N; k += 1) {
          const key = letters[k].lineIdx == null ? 0 : letters[k].lineIdx;
          if (!order.includes(key)) order.push(key);
        }
        const self = letters[i].lineIdx == null ? 0 : letters[i].lineIdx;
        return { rank: order.indexOf(self), count: order.length };
      }
      return { rank: i, count: N };
    }

    function objfxUnitFirst(i, unit) {
      if (unit === 'word') {
        const key = `${letters[i].lineIdx == null ? 0 : letters[i].lineIdx}:${letters[i].wordIdx == null ? 0 : letters[i].wordIdx}`;
        for (let k = 0; k < N; k += 1) {
          const other = `${letters[k].lineIdx == null ? 0 : letters[k].lineIdx}:${letters[k].wordIdx == null ? 0 : letters[k].wordIdx}`;
          if (other === key) return k;
        }
        return i;
      }
      if (unit === 'line') {
        const line = letters[i].lineIdx == null ? 0 : letters[i].lineIdx;
        for (let k = 0; k < N; k += 1) {
          if ((letters[k].lineIdx == null ? 0 : letters[k].lineIdx) === line) return k;
        }
        return i;
      }
      return i;
    }

    const objfxSelCache = new Map();

    // Letter half extents for the grid effects (advance/size, else the scene
    // local box, else a fixed fallback). The grid divides by these, so they
    // must never be 0.
    function objfxHalf(index) {
      const letter = letters[index] || {};
      const adv = Number(letter.advance);
      const size = Number(letter.size);
      const local = letter.local || {};
      const w = Number.isFinite(adv) && adv > 0 ? adv : Number(local.w) > 0 ? Number(local.w) : 48;
      const h = Number.isFinite(size) && size > 0 ? size : Number(local.h) > 0 ? Number(local.h) : 48;
      return { hx: Math.max(1, w / 2), hy: Math.max(1, h / 2) };
    }

    // Grid composition (§5-1): bend (physics) first, then displacement, then
    // region delay — added onto a copy (the physics lattice is cache-shared),
    // clamped once per node to the stretch limit (0.8 until the O5 maxStretch).
    function objfxLatticeFor(state) {
      if (state.softLattice && state.softLattice.length >= 50) {
        return Float32Array.from(state.softLattice);
      }
      return new Float32Array(50);
    }

    function objfxClampLattice(grid) {
      for (let k = 0; k < 25; k += 1) {
        const x = grid[k * 2];
        const y = grid[k * 2 + 1];
        const len = Math.hypot(x, y);
        if (len > 0.8) {
          grid[k * 2] = (x / len) * 0.8;
          grid[k * 2 + 1] = (y / len) * 0.8;
        }
      }
    }

    function objfxSelection(cfg) {
      const key = `${cfg.kind}|${cfg.select}|${JSON.stringify(cfg.selParams || {})}`;
      let hit = objfxSelCache.get(key);
      if (!hit) {
        const helpers = {
          unitRank: objfxUnitRank,
          hash01: objfxHash,
          inScope: () => true,
        };
        const weights = new Array(N);
        for (let k = 0; k < N; k += 1) {
          weights[k] = objfxCore ? objfxCore.selectWeight(cfg.select, cfg.selParams || {}, k, N, helpers) : 1;
        }
        const picked = [];
        for (let k = 0; k < N; k += 1) if (weights[k] > 0) picked.push(k);
        hit = { weights, picked };
        if (objfxSelCache.size > 64) objfxSelCache.clear();
        objfxSelCache.set(key, hit);
      }
      return hit;
    }

    // Base fill colour for the hueCycle palette (§4.2): resolved from the
    // beat style without the GPU (solid / first gradient stop / palette slot /
    // badge category tint, falling back to white).
    function objfxBaseColor() {
      const color = (style && style.color) || {};
      const fill = color.fill;
      const parsed = (value) => (objfxCore && typeof value === 'string' ? objfxCore.hexToRgb(value) : null);
      if (fill && typeof fill === 'object') {
        if (fill.kind === 'gradient' && Array.isArray(fill.stops) && fill.stops.length) {
          const stop = fill.stops[0] || {};
          return parsed(stop.color) || [1, 1, 1];
        }
        if (fill.kind === 'palette' && project && Array.isArray(project.palettes)) {
          const palette = project.palettes.find((entry) => entry && entry.id === fill.paletteId) || project.palettes[0];
          const slot = palette && Array.isArray(palette.colors) ? palette.colors[fill.index || 0] : null;
          const hex = typeof slot === 'string' ? slot : slot && slot.color;
          return parsed(hex) || [1, 1, 1];
        }
        if (fill.kind === 'category' && project && project.categoryColors) {
          const cue = project.script && Array.isArray(project.script.cues)
            ? project.script.cues.find((entry) => entry && entry.id === (letters[0] && letters[0].cueId))
            : null;
          const category = cue && cue.meta && cue.meta.category;
          const tint = category && project.categoryColors[category] ? project.categoryColors[category].tint : null;
          return parsed(tint) || [1, 1, 1];
        }
        if (fill.kind === 'solid' || typeof fill.value === 'string') {
          return parsed(fill.value) || [1, 1, 1];
        }
      }
      if (typeof fill === 'string') return parsed(fill) || [1, 1, 1];
      return [1, 1, 1];
    }

    function objfxPaletteStops() {
      if (!project || !Array.isArray(project.palettes)) return [];
      const list = [];
      for (const palette of project.palettes) {
        if (!palette || !Array.isArray(palette.colors)) continue;
        for (const slot of palette.colors) {
          const hex = typeof slot === 'string' ? slot : slot && slot.color;
          const rgb = objfxCore && typeof hex === 'string' ? objfxCore.hexToRgb(hex) : null;
          if (rgb) list.push(rgb);
        }
        if (list.length) break;
      }
      return list;
    }

    function objfxCheckpoints() {
      if (!scene.__objfxDist) scene.__objfxDist = new Map();
      const key = beat.id || scene.beatId || 'beat';
      let map = scene.__objfxDist.get(key);
      if (!map) {
        map = new Map();
        if (scene.__objfxDist.size > 8) scene.__objfxDist.clear();
        scene.__objfxDist.set(key, map);
      }
      return map;
    }

    // Application order (§3.3): timeDelay, then colorShift, then flicker.
    // Skipped entirely when options.objfx === false (legibility sampling,
    // echo re-evaluation).
    function applyObjfx(index, rigid, state) {
      if (!objfxCore || options.objfx === false) return;
      const beatLocal = t - beat.start;
      const items = [];
      for (const hold of rigid.holdList) {
        if (!hold || !hold.entry || typeof hold.entry.motionFx !== 'function') continue;
        if (hold.instance && hold.instance.enabled === false) continue;
        const cfg = hold.entry.motionFx(hold.params || {});
        if (cfg) items.push(cfg);
      }
      if (!items.length) return;
      const order = { timeDelay: 0, timeDisplacement: 1, colorShift: 2, motionFlicker: 3 };
      items.sort((a, b) => (order[a.kind] == null ? 9 : order[a.kind]) - (order[b.kind] == null ? 9 : order[b.kind]));
      let objfxGrid = null;
      let objfxGridTouched = false;
      const needGrid = () => {
        if (!objfxGrid) objfxGrid = objfxLatticeFor(state);
        return objfxGrid;
      };
      for (const cfg of items) {
        if (cfg.kind === 'timeDelay') {
          const timeSel = objfxSelection(cfg);
          if ((cfg.unit || 'letter') === 'region') {
            const w = timeSel.weights[index] || 0;
            if (!(w > 0)) continue;
            let graded = w;
            if (cfg.selParams && cfg.selParams.grade && timeSel.picked.length > 1) {
              graded = w * (timeSel.picked.indexOf(index) / (timeSel.picked.length - 1));
              if (!(graded > 0)) continue;
            }
            const lag = Math.max(0, cfg.lag || 0);
            if (!(lag > 1e-6)) continue;
            const half = objfxHalf(index);
            if (objfxCore.displaceRegion(needGrid(), index, beatLocal, {
              lag, band: cfg.band, bandSize: cfg.bandSize, feather: cfg.feather,
            }, { transformAt, hx: half.hx, hy: half.hy, weight: graded })) {
              objfxGridTouched = true;
            }
            continue;
          }
          const rep = objfxUnitFirst(index, cfg.unit || 'letter');
          let w = timeSel.weights[rep] || 0;
          if (w <= 0) continue;
          if (cfg.selParams && cfg.selParams.grade && timeSel.picked.length > 1) {
            w *= timeSel.picked.indexOf(rep) / (timeSel.picked.length - 1);
            if (!(w > 0)) continue;
          }
          const lag = Math.max(0, cfg.lag || 0) * w;
          if (!(lag > 1e-6)) continue;
          objfxCore.applyTimeDelay(state, index, beatLocal, { lag, props: cfg.props }, { transformAt });
        } else if (cfg.kind === 'timeDisplacement') {
          const dispSel = objfxSelection(cfg);
          const w = dispSel.weights[index] || 0;
          if (!(w > 0)) continue;
          let graded = w;
          if (cfg.selParams && cfg.selParams.grade && dispSel.picked.length > 1) {
            graded = w * (dispSel.picked.indexOf(index) / (dispSel.picked.length - 1));
            if (!(graded > 0)) continue;
          }
          if ((cfg.unit || 'letter') === 'block') {
            // block position from the layout (formation) point, not the live
            // state: drift and holds must not shift the lag map itself
            const base = rigid.base || { x: 0, y: 0 };
            const bx = blockHalf && blockHalf.x ? base.x / blockHalf.x : 0;
            const by = blockHalf && blockHalf.y ? base.y / blockHalf.y : 0;
            const u = Math.max(-1, Math.min(1, bx));
            const v = Math.max(-1, Math.min(1, by));
            let s = objfxCore.lagMapValue(cfg.map, u, v, null, cfg.noiseScale, cfg.seed);
            if (cfg.invert) s = 1 - s;
            const lag = Math.max(0, cfg.maxLag || 0) * s * graded;
            if (!(lag > 1e-6)) continue;
            objfxCore.applyTimeDelay(state, index, beatLocal, { lag, props: 'pos' }, { transformAt });
            continue;
          }
          const half = objfxHalf(index);
          if (objfxCore.displaceGrid(needGrid(), index, beatLocal, {
            map: cfg.map, maxLag: cfg.maxLag, invert: cfg.invert,
            noiseScale: cfg.noiseScale, seed: cfg.seed, amount: cfg.amount,
          }, {
            transformAt, hx: half.hx, hy: half.hy, weight: graded,
          })) {
            objfxGridTouched = true;
          }
        } else if (cfg.kind === 'motionFlicker') {
          const sel = objfxSelection(cfg);
          let w = sel.weights[index] || 0;
          if (!(w > 0)) continue;
          if (cfg.selParams && cfg.selParams.grade && sel.picked.length > 1) {
            w *= sel.picked.indexOf(index) / (sel.picked.length - 1);
            if (!(w > 0)) continue;
          }
          const gate = w;
          const helpers = {
            unitRank: objfxUnitRank,
            hash01: objfxHash,
            inScope: () => gate > 0,
            rank01: (k) => (N > 1 ? k / (N - 1) : 0),
          };
          objfxCore.applyFlicker(state, index, beatLocal,
            { ...cfg, select: 'scope', depth: (cfg.depth == null ? 0.7 : cfg.depth) * gate }, {
              transformAt,
              velocitySrc: transformAt,
              shortSide,
              N,
              helpers,
            });
        } else if (cfg.kind === 'colorShift') {
          const sel = objfxSelection(cfg);
          let w = sel.weights[index] || 0;
          if (!(w > 0)) continue;
          if (cfg.selParams && cfg.selParams.grade && sel.picked.length > 1) {
            w *= sel.picked.indexOf(index) / (sel.picked.length - 1);
            if (!(w > 0)) continue;
          }
          const helpers = {
            unitRank: objfxUnitRank,
            hash01: objfxHash,
            inScope: () => true,
            rank01: (k) => (N > 1 ? k / (N - 1) : 0),
          };
          objfxCore.applyColorShift(state, index, beatLocal,
            { ...cfg, select: 'scope', mix: (cfg.mix == null ? 0.85 : cfg.mix) * w }, {
              transformAt,
              velocitySrc: transformAt,
              shortSide,
              N,
              helpers,
              maxT: duration,
              progress: rigid.pe,
              colorMix: state.colorMix || 0,
              base: objfxBaseColor(),
              stops: objfxPaletteStops(),
              colorA: objfxCore.hexToRgb(cfg.colorA),
              colorB: objfxCore.hexToRgb(cfg.colorB),
              checkpoints: objfxCheckpoints(),
            });
        }
      }
      if (objfxGridTouched && objfxGrid) {
        objfxClampLattice(objfxGrid);
        state.softLattice = objfxGrid;
      }
    }

    for (let index = 0; index < N; index += 1) {
      const letter = letters[index];
      const rigid = rigidAt(index, t - beat.start);
      const state = rigid.state;
      const local = rigid.local;
      const pe = rigid.pe;
      const px = rigid.px;
      applyPostRigid(index, rigid, state, reflow);
      const soft = evaluatePhysics(index, letter, rigid);
      if (soft) {
        state.x += soft.dx;
        state.y += soft.dy;
        state.rot += soft.rot;
        if (soft.lattice) {
          state.softLattice = soft.lattice;
          state.physActive = soft.active;
          state.physHalf = { x: soft.halfW, y: soft.halfH };
        }
      }

      applyObjfx(index, rigid, state);
      // a composition hero keeps its own colour: the fill shader mixes the
      // letter toward colorB when its colorMix is set (the GL path for the
      // hero span's palette colour; the 2D fallback reads letter.color).
      if (letter.span && letter.span.paletteIndex != null) state.colorMix = Math.max(state.colorMix || 0, 1);

      // Block-space deformations (warps, the dynamic font size) are evaluated
      // around the block centre in the letter's local frame. The deform runs
      // before the letter translation, so the centre must be stored relative
      // to this letter's position: the prefix sum `position - centre` is what
      // turns `f * (p + origin) - origin + position` into a scale about the
      // centre (an inverted sign would pull the letters inward instead).
      if (state.deform.length && (blockBBox || rigid.localRun)) {
        if (rigid.localRun) {
          // a local deformation scales about the substring's centre and half
          // size, so `stretch` on three letters squeezes those three only
          state.warpOrigin = { x: state.x - (anchorX + rigid.localRun.center.x), y: state.y - (anchorY + rigid.localRun.center.y) };
          state.blockHalf = rigid.localRun.half;
        } else {
          state.warpOrigin = { x: state.x - anchorX, y: state.y - anchorY };
          state.blockHalf = blockHalf;
        }
      }

      state.opacity = clamp01(state.opacity);
      state.visibleFrac = clamp01(state.visibleFrac);
      envelopes.enter = Math.max(envelopes.enter, pe);
      envelopes.exit = Math.max(envelopes.exit, px);
      envelopes.layoutIn = Math.max(envelopes.layoutIn, rigid.layoutIn);
      envelopes.layoutOut = Math.max(envelopes.layoutOut, rigid.layoutOut);
      if (rigid.holdList.length) envelopes.hold = Math.max(envelopes.hold, rigid.holdEnv);
      states.push(state);
    }

    // The last net: at least half of the block stays on screen even when a
    // weird beat, a camera move or a hand edit pushed it out. Entrance and
    // exit keep their deliberate slides (translation is only allowed once the
    // beat has fully entered and has not started to leave).
    if (frameGuard && states.length) {
      const guarded = frameGuard.guard(states, {
        frame,
        anchor: { x: anchorX, y: anchorY },
        blockHalf,
        camera: options.camera || null,
        maxOut: 0.5,
        allowTranslate: envelopes.enter >= 1 && envelopes.exit <= 0,
      });
      envelopes.guardVisible = guarded.visible;
      envelopes.guarded = guarded.corrected;
    }

    // textenter2 §4.7: beat-wide reverse paint order (right letter on top).
    if (style && style.text && style.text.drawOrder === 'reverse') {
      states._reverseDraw = true;
    }

    // objeffects §4.4/4.5: past-position shadow trails for the engine to draw.
    // Beat-level holds only (scoped trail holds ride the letter states above).
    const motionTrails = [];
    for (const instance of holds || []) {
      if (!instance || instance.enabled === false) continue;
      const entry = fx.get('hold', instance.type);
      if (!entry || typeof entry.motionFx !== 'function') continue;
      const cfg = entry.motionFx(instance.params || {});
      if (cfg && (cfg.kind === 'motionEcho' || cfg.kind === 'strokeTrail')) {
        motionTrails.push({ type: cfg.kind === 'motionEcho' ? 'echo' : 'stroke', cfg });
      }
    }

    return {
      active: true,
      envelopes,
      letters: states,
      meta: { beatId: beat.id, kind: beat.kind, anchor: { x: anchorX, y: anchorY }, trails: motionTrails },
    };
  }

  function evaluateScene(scene, t, ctx) {
    return evaluateBeat(scene, t, ctx);
  }

  // PowerPoint-like gallery of text animations built from the existing effect
  // types. "entrance" runs at the beat start, "emphasis" during the beat and
  // "exit" ends at the beat end.
  const MOTION_PRESETS = [
    { id: 'fadeIn', nameJa: 'フェードイン', nameEn: 'Fade In', group: 'entrance', phase: 'enter', type: 'fade', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: {} },
    { id: 'flyIn', nameJa: 'フライイン', nameEn: 'Fly In', group: 'entrance', phase: 'enter', type: 'slide', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: { dir: 'up', distance: 0.25 } },
    { id: 'floatIn', nameJa: 'フロートイン', nameEn: 'Float In', group: 'entrance', phase: 'enter', type: 'slide', from: 'start', delay: 0, duration: 0.9, ease: 'easeOutCubic', params: { dir: 'down', distance: 0.08 } },
    { id: 'zoomIn', nameJa: 'ズームイン', nameEn: 'Zoom In', group: 'entrance', phase: 'enter', type: 'zoomIn', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: { from: 0.2 } },
    { id: 'growTurn', nameJa: 'ターンイン', nameEn: 'Turn In', group: 'entrance', phase: 'enter', type: 'rotateIn', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'blurIn', nameJa: 'ブラーイン', nameEn: 'Blur In', group: 'entrance', phase: 'enter', type: 'blurIn', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: {} },
    { id: 'bounceIn', nameJa: 'バウンスイン', nameEn: 'Bounce In', group: 'entrance', phase: 'enter', type: 'dropBounce', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'popIn', nameJa: 'ポップイン', nameEn: 'Pop In', group: 'entrance', phase: 'enter', type: 'elasticPop', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: {} },
    { id: 'waveIn', nameJa: 'ウェーブイン', nameEn: 'Wave In', group: 'entrance', phase: 'enter', type: 'waveRise', from: 'start', delay: 0, duration: 0.9, ease: 'linear', params: { amp: 0.2 } },
    { id: 'typewriter', nameJa: 'タイプライター', nameEn: 'Typewriter', group: 'entrance', phase: 'enter', type: 'typewriter', from: 'start', delay: 0, duration: 0.9, ease: 'linear', params: {} },
    { id: 'flipIn', nameJa: 'フリップイン', nameEn: 'Flip In', group: 'entrance', phase: 'enter', type: 'flip3D', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'glitchIn', nameJa: 'グリッチイン', nameEn: 'Glitch In', group: 'entrance', phase: 'enter', type: 'glitchIn', from: 'start', delay: 0, duration: 0.6, ease: 'linear', params: {} },
    { id: 'pulse', nameJa: 'パルス', nameEn: 'Pulse', group: 'emphasis', phase: 'hold', type: 'pulse', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'opacityPulse', nameJa: '点滅', nameEn: 'Blink', group: 'emphasis', phase: 'hold', type: 'opacityPulse', from: 'start', delay: 0.3, duration: 1.4, ease: 'linear', params: {} },
    { id: 'growShrink', nameJa: '伸縮', nameEn: 'Grow Shrink', group: 'emphasis', phase: 'hold', type: 'pulse', from: 'start', delay: 0.2, duration: 1.6, ease: 'linear', params: { amount: 0.18, bpm: 90 } },
    { id: 'sway', nameJa: 'スウェイ', nameEn: 'Sway', group: 'emphasis', phase: 'hold', type: 'sway', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'bob', nameJa: 'ボブ', nameEn: 'Bob', group: 'emphasis', phase: 'hold', type: 'floatBob', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'breathe', nameJa: 'ブレス', nameEn: 'Breathe', group: 'emphasis', phase: 'hold', type: 'breathing', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'jelly', nameJa: 'ゼリー', nameEn: 'Jelly', group: 'emphasis', phase: 'hold', type: 'jelly', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'shake', nameJa: 'シェイク', nameEn: 'Shake', group: 'emphasis', phase: 'hold', type: 'jitter', from: 'start', delay: 0.4, duration: 1, ease: 'linear', params: {} },
    { id: 'twist', nameJa: 'ツイスト', nameEn: 'Twist', group: 'emphasis', phase: 'hold', type: 'twist', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'drift', nameJa: 'ドリフト', nameEn: 'Drift', group: 'emphasis', phase: 'hold', type: 'drift', from: 'start', delay: 0.4, duration: 1.6, ease: 'linear', params: {} },
    { id: 'wave', nameJa: 'ウェーブ', nameEn: 'Wave', group: 'emphasis', phase: 'hold', type: 'sineWave', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'fadeOut', nameJa: 'フェードアウト', nameEn: 'Fade Out', group: 'exit', phase: 'exit', type: 'fade', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'flyOut', nameJa: 'フライアウト', nameEn: 'Fly Out', group: 'exit', phase: 'exit', type: 'slide', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: { dir: 'down', distance: 0.3 } },
    { id: 'zoomOut', nameJa: 'ズームアウト', nameEn: 'Zoom Out', group: 'exit', phase: 'exit', type: 'zoomOut', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'shrinkOut', nameJa: 'シュリンクアウト', nameEn: 'Shrink Out', group: 'exit', phase: 'exit', type: 'shrinkToCenter', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'blurOut', nameJa: 'ブラーアウト', nameEn: 'Blur Out', group: 'exit', phase: 'exit', type: 'blurOut', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'dissolve', nameJa: 'ディゾルブ', nameEn: 'Dissolve', group: 'exit', phase: 'exit', type: 'dissolve', from: 'end', delay: -0.6, duration: 0.6, ease: 'linear', params: {} },
    { id: 'wipe', nameJa: 'ワイプ', nameEn: 'Wipe', group: 'exit', phase: 'exit', type: 'wipe', from: 'end', delay: -0.6, duration: 0.6, ease: 'easeInCubic', params: {} },
    { id: 'explode', nameJa: 'エクスプロード', nameEn: 'Explode', group: 'exit', phase: 'exit', type: 'explode', from: 'end', delay: -0.6, duration: 0.6, ease: 'easeInCubic', params: {} },
    { id: 'melt', nameJa: 'メルト', nameEn: 'Melt', group: 'exit', phase: 'exit', type: 'melt', from: 'end', delay: -0.8, duration: 0.8, ease: 'linear', params: {} },
    { id: 'burn', nameJa: 'バーン', nameEn: 'Burn', group: 'exit', phase: 'exit', type: 'burnAway', from: 'end', delay: -0.7, duration: 0.7, ease: 'linear', params: {} },
    // The shader pack (renderer/js/lyrics/effects/shader-fx.js). Each family is
    // available in all three phases, so every one of them can be picked here and
    // then reshaped with any ADSR phase and any easing curve.
    { id: 'ditherIn', nameJa: 'ディザイン', nameEn: 'Dither In', group: 'entrance', phase: 'enter', type: 'dither', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: { levels: 4, jitter: 0.3 } },
    { id: 'scanIn', nameJa: 'スキャンイン', nameEn: 'Scan In', group: 'entrance', phase: 'enter', type: 'scanline', from: 'start', delay: 0, duration: 0.7, ease: 'linear', params: { lines: 8, bandWidth: 0.3, depth: 0.85 } },
    { id: 'stealthIn', nameJa: 'ステルスイン', nameEn: 'Stealth In', group: 'entrance', phase: 'enter', type: 'stealth', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: { split: 6, glow: 0.7 } },
    { id: 'geometryIn', nameJa: 'ジオメトリーイン', nameEn: 'Geometry In', group: 'entrance', phase: 'enter', type: 'geometry', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: { shape: 'circle', feather: 0.05 } },
    { id: 'fadeGlow', nameJa: 'フェードグロー', nameEn: 'Fade Glow', group: 'entrance', phase: 'enter', type: 'fade', from: 'start', delay: 0, duration: 0.6, ease: 'easeInOutCubic', params: { softness: 0.6, glow: 0.4 } },
    { id: 'ditherLoop', nameJa: 'ディザループ', nameEn: 'Dither Loop', group: 'emphasis', phase: 'hold', type: 'dither', from: 'start', delay: 0.3, duration: 1.2, ease: 'linear', params: { levels: 3, jitter: 0.4, speed: 3 } },
    { id: 'scanLoop', nameJa: 'スキャンループ', nameEn: 'Scan Loop', group: 'emphasis', phase: 'hold', type: 'scanline', from: 'start', delay: 0.3, duration: 1.4, ease: 'linear', params: { lines: 10, bandWidth: 0.25, depth: 0.8, speed: 1.2 } },
    { id: 'stealthLoop', nameJa: 'ステルスループ', nameEn: 'Stealth Loop', group: 'emphasis', phase: 'hold', type: 'stealth', from: 'start', delay: 0.3, duration: 1.6, ease: 'linear', params: { split: 8, glow: 0.6, speed: 1.5 } },
    { id: 'geometryLoop', nameJa: 'ジオメトリーループ', nameEn: 'Geometry Loop', group: 'emphasis', phase: 'hold', type: 'geometry', from: 'start', delay: 0.3, duration: 1.6, ease: 'linear', params: { shape: 'hexagon', feather: 0.08, spin: 30 } },
    { id: 'fadeBreathe', nameJa: 'フェードブレス', nameEn: 'Fade Breathe', group: 'emphasis', phase: 'hold', type: 'fade', from: 'start', delay: 0.3, duration: 1.6, ease: 'linear', params: { softness: 0.8, glow: 0.2 } },
    { id: 'ditherOut', nameJa: 'ディザアウト', nameEn: 'Dither Out', group: 'exit', phase: 'exit', type: 'dither', from: 'end', delay: -0.6, duration: 0.6, ease: 'linear', params: { levels: 4, jitter: 0.3 } },
    { id: 'scanOut', nameJa: 'スキャンアウト', nameEn: 'Scan Out', group: 'exit', phase: 'exit', type: 'scanline', from: 'end', delay: -0.7, duration: 0.7, ease: 'linear', params: { lines: 8, bandWidth: 0.3, depth: 0.85 } },
    { id: 'stealthOut', nameJa: 'ステルスアウト', nameEn: 'Stealth Out', group: 'exit', phase: 'exit', type: 'stealth', from: 'end', delay: -0.7, duration: 0.7, ease: 'easeInCubic', params: { split: 6, glow: 0.8 } },
    { id: 'geometryOut', nameJa: 'ジオメトリーアウト', nameEn: 'Geometry Out', group: 'exit', phase: 'exit', type: 'geometry', from: 'end', delay: -0.7, duration: 0.7, ease: 'easeInCubic', params: { shape: 'circle', feather: 0.05 } },
    { id: 'fadeGlowOut', nameJa: 'フェードグローアウト', nameEn: 'Fade Glow Out', group: 'exit', phase: 'exit', type: 'fade', from: 'end', delay: -0.6, duration: 0.6, ease: 'easeInOutCubic', params: { softness: 0.6, glow: 0.4 } },
  ];

  function motionPresets() {
    const list = MOTION_PRESETS.map((preset) => ({ ...preset, params: { ...preset.params } }));
    if (textEffectsData && typeof textEffectsData.list === 'function') {
      const effects = textEffectsData.list();
      for (const item of effects) {
        list.push({ ...item, params: { ...item.params } });
      }
    }
    return list;
  }

  return {
    GROUP_NAMES: GROUPS,
    evaluateBeat,
    evaluateScene,
    MOTION_PRESETS,
    motionPresets,
    motionDef,
    adsrDef,
    adsrLevel,
    groupInstance,
    staggerRanks,
    applyOverrides,
    collectKeyframes,
    applyKeyframeDeltas,
    mergeDeep,
    resolveDuration,
    MAX_DEPTH,
  };
});
