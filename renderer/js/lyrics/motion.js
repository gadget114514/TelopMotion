(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rng'), require('./easing'), require('./tween'), require('./layout'), require('./effects/registry'));
  } else {
    root.SA = root.SA || {};
    root.SA.motion = factory(root.SA.rng, root.SA.easing, root.SA.tween, root.SA.layout, root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, easing, tween, layout, fx) {
  'use strict';

  const TAU = Math.PI * 2;
  const MAX_DEPTH = 4;

  const GROUPS = ['animation', 'layout', 'enter', 'exit', 'location'];

  function clamp01(value) {
    if (Number.isNaN(value)) return 0;
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback == null ? 0 : fallback;
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
      if (transform.scaleX != null) state.scaleX *= num(transform.scaleX, 1);
      else state.scaleX *= scale;
      if (transform.scaleY != null) state.scaleY *= num(transform.scaleY, 1);
      else state.scaleY *= scale;
      if (transform.opacity != null) state.opacity *= num(transform.opacity, 1);
      state.tiltX += num(transform.tiltX);
      state.tiltY += num(transform.tiltY);
    }
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

    const animation = groupInstance(style, 'animation');
    const layoutInstance = groupInstance(style, 'layout');
    const enter = groupInstance(style, 'enter');
    const exit = groupInstance(style, 'exit');
    const location = groupInstance(style, 'location');
    const holds = groupInstance(style, 'hold');
    const customMotions = Array.isArray(style.motions) ? style.motions : [];

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
    const anchorX = anchorPoint.x;
    const anchorY = anchorPoint.y + num(options.stackOffset, 0);
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
    const states = [];
    const envelopes = { layoutIn: 0, layoutOut: 0, enter: 0, exit: 0, hold: 0 };

    for (let index = 0; index < N; index += 1) {
      const letter = letters[index];
      const offset = offsets[index];
      const letterRandom = {
        enter: rng.rngFor(seed, letter.path, 'enter'),
        exit: rng.rngFor(seed, letter.path, 'exit'),
        hold: rng.rngFor(seed, letter.path, 'hold'),
        layout: rng.rngFor(seed, letter.path, 'layout'),
      };

      let local = Math.max(0, t - beat.start);
      if (animation.timeWarpEase && duration > 0) {
        const warped = easing.get(animation.timeWarpEase)(clamp01(local / duration)) * duration;
        local = warped;
      }
      if (animation.stopFps) local = Math.floor(local * animation.stopFps) / animation.stopFps;
      const holdLocal = Math.max(0, local - (enterDef.in.delay + enterDef.in.duration + offset));

      const pe = clamp01((local - enterDef.in.delay - offset) / enterDef.in.duration);
      const exitStart = duration - exitDef.out.duration - exitDef.out.delay - (exitOrderReverse ? offset : offMax - offset);
      const px = clamp01((local - exitStart) / exitDef.out.duration);
      const enterEase = easing.get(enterDef.in.ease || 'easeOutCubic');
      const exitEase = easing.get(exitDef.out.ease || 'easeInCubic');

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
        local,
        pe,
        px,
      };

      const target = targetFormation[index] || { x: 0, y: 0, rot: 0, scale: 1 };
      const paramOverrides = {};
      const keyframeDeltas = collectKeyframes(letter, project, local, paramOverrides);
      const enterParamsResolved = { ...enterParams, ...(paramOverrides.enter || {}) };
      const exitParamsResolved = { ...exitParams, ...(paramOverrides.exit || {}) };

      let base = target;
      const sequenceActive = activeSequenceFormation(layoutParams, sequenceCache, holdLocal, Math.max(0.001, duration - enterDef.in.duration - offMax));
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
      state.scaleX *= formationPoint.scale == null ? 1 : formationPoint.scale;
      state.scaleY *= formationPoint.scale == null ? 1 : formationPoint.scale;
      if (drift.x || drift.y) {
        state.x += num(drift.x) * shortSide * holdLocal * 0.1;
        state.y += num(drift.y) * shortSide * holdLocal * 0.1;
      }

      const enterEntry = fx.get('enter', enterType);
      if (enterEntry && enterEntry.cpu) {
        enterEntry.cpu(state, enterEase(pe), enterParamsResolved, letterRandom.enter, {
          i: index,
          N,
          letter,
          frame,
          shortSide,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
        });
      }

      const holdEntryList = [];
      for (let holdIndex = 0; holdIndex < holds.length; holdIndex += 1) {
        const holdInstance = holds[holdIndex];
        const holdEntry = fx.get('hold', holdInstance.type);
        if (!holdEntry || !holdEntry.cpu || holdInstance.enabled === false) continue;
        const holdDef = motionDef(holdInstance, 'hold', duration);
        const env = clamp01((local - holdDef.in.delay - offset) / holdDef.in.duration) * (1 - clamp01((local - (duration - holdDef.out.duration - holdDef.out.delay)) / holdDef.out.duration));
        let h = holdLocal;
        if (holdDef.loop && holdDef.loop.period > 0) {
          h = h % holdDef.loop.period;
          if (holdDef.loop.yoyo) {
            const period = holdDef.loop.period;
            const half = Math.floor(holdLocal / period) % 2 === 1;
            h = half ? period - h : h;
          }
        }
        holdEntryList.push({ instance: holdInstance, entry: holdEntry, env, h, rng: letterRandom.hold });
      }
      for (const hold of holdEntryList) {
        hold.entry.cpu(state, hold.h, hold.env, { ...(hold.instance.params || {}), ...(paramOverrides.hold || {}) }, hold.rng, {
          i: index,
          N,
          letter,
          frame,
          shortSide,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
          env: hold.env,
        });
      }

      const exitEntry = fx.get('exit', exitType);
      if (exitEntry && exitEntry.cpu && px > 0) {
        exitEntry.cpu(state, exitEase(px), exitParamsResolved, letterRandom.exit, {
          i: index,
          N,
          letter,
          frame,
          shortSide,
          blockCenter: { x: anchorX, y: anchorY },
          letterX: state.x,
          letterY: state.y,
          beatDuration: duration,
        });
      }

      // Custom animations added by hand from the Motion gallery. Each entry
      // runs its own effect over its own window, on top of the built-in ones.
      for (const motion of customMotions) {
        if (!motion || !motion.type || motion.enabled === false) continue;
        const phase = motion.phase === 'exit' ? 'exit' : motion.phase === 'hold' ? 'hold' : 'enter';
        const entry = fx.get(phase, motion.type);
        if (!entry || !entry.cpu) continue;
        const motionDuration = Math.max(0.001, num(motion.duration, 0.6));
        const motionDelay = num(motion.delay, 0);
        const startAt = (motion.from === 'end' ? duration : 0) + motionDelay;
        const motionRng = rng.rngFor(seed, `${beat.id || scene.beatId}|${motion.id || motion.type}`, phase);
        const info = {
          i: index,
          N,
          letter,
          frame,
          shortSide,
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
          entry.cpu(state, localHold, env, motion.params || {}, motionRng, { ...info, env });
        } else {
          const localPhase = local - startAt;
          if (localPhase < 0) continue;
          const progress = clamp01(localPhase / motionDuration);
          const easeFn = easing.get(motion.ease || (phase === 'enter' ? 'easeOutCubic' : 'easeInCubic'));
          entry.cpu(state, easeFn(progress), motion.params || {}, motionRng, info);
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
      applyKeyframeDeltas(state, keyframeDeltas);

      state.opacity = clamp01(state.opacity);
      state.visibleFrac = clamp01(state.visibleFrac);
      envelopes.enter = Math.max(envelopes.enter, pe);
      envelopes.exit = Math.max(envelopes.exit, px);
      envelopes.layoutIn = Math.max(envelopes.layoutIn, layoutIn);
      envelopes.layoutOut = Math.max(envelopes.layoutOut, layoutOut);
      if (holdEntryList.length) envelopes.hold = Math.max(envelopes.hold, holdEntryList[0].env);
      states.push(state);
    }

    return {
      active: true,
      envelopes,
      letters: states,
      meta: { beatId: beat.id, kind: beat.kind, anchor: { x: anchorX, y: anchorY } },
    };
  }

  function evaluateScene(scene, t, ctx) {
    return evaluateBeat(scene, t, ctx);
  }

  // PowerPoint-like gallery of text animations built from the existing effect
  // types. "entrance" runs at the beat start, "emphasis" during the beat and
  // "exit" ends at the beat end.
  const MOTION_PRESETS = [
    { id: 'fadeIn', group: 'entrance', phase: 'enter', type: 'fade', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: {} },
    { id: 'flyIn', group: 'entrance', phase: 'enter', type: 'slide', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: { dir: 'up', distance: 0.25 } },
    { id: 'floatIn', group: 'entrance', phase: 'enter', type: 'slide', from: 'start', delay: 0, duration: 0.9, ease: 'easeOutCubic', params: { dir: 'down', distance: 0.08 } },
    { id: 'zoomIn', group: 'entrance', phase: 'enter', type: 'zoomIn', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: {} },
    { id: 'growTurn', group: 'entrance', phase: 'enter', type: 'rotateIn', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'blurIn', group: 'entrance', phase: 'enter', type: 'blurIn', from: 'start', delay: 0, duration: 0.5, ease: 'easeOutCubic', params: {} },
    { id: 'bounceIn', group: 'entrance', phase: 'enter', type: 'dropBounce', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'popIn', group: 'entrance', phase: 'enter', type: 'elasticPop', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: {} },
    { id: 'waveIn', group: 'entrance', phase: 'enter', type: 'waveRise', from: 'start', delay: 0, duration: 0.7, ease: 'easeOutCubic', params: {} },
    { id: 'typewriter', group: 'entrance', phase: 'enter', type: 'typewriter', from: 'start', delay: 0, duration: 0.9, ease: 'linear', params: {} },
    { id: 'flipIn', group: 'entrance', phase: 'enter', type: 'flip3D', from: 'start', delay: 0, duration: 0.6, ease: 'easeOutCubic', params: {} },
    { id: 'glitchIn', group: 'entrance', phase: 'enter', type: 'glitchIn', from: 'start', delay: 0, duration: 0.6, ease: 'linear', params: {} },
    { id: 'pulse', group: 'emphasis', phase: 'hold', type: 'pulse', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'sway', group: 'emphasis', phase: 'hold', type: 'sway', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'bob', group: 'emphasis', phase: 'hold', type: 'floatBob', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'breathe', group: 'emphasis', phase: 'hold', type: 'breathing', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'jelly', group: 'emphasis', phase: 'hold', type: 'jelly', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'shake', group: 'emphasis', phase: 'hold', type: 'jitter', from: 'start', delay: 0.4, duration: 1, ease: 'linear', params: {} },
    { id: 'twist', group: 'emphasis', phase: 'hold', type: 'twist', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'drift', group: 'emphasis', phase: 'hold', type: 'drift', from: 'start', delay: 0.4, duration: 1.6, ease: 'linear', params: {} },
    { id: 'wave', group: 'emphasis', phase: 'hold', type: 'sineWave', from: 'start', delay: 0.4, duration: 1.2, ease: 'linear', params: {} },
    { id: 'fadeOut', group: 'exit', phase: 'exit', type: 'fade', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'flyOut', group: 'exit', phase: 'exit', type: 'slide', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: { dir: 'down', distance: 0.3 } },
    { id: 'zoomOut', group: 'exit', phase: 'exit', type: 'zoomOut', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'shrinkOut', group: 'exit', phase: 'exit', type: 'shrinkToCenter', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'blurOut', group: 'exit', phase: 'exit', type: 'blurOut', from: 'end', delay: -0.5, duration: 0.5, ease: 'easeInCubic', params: {} },
    { id: 'dissolve', group: 'exit', phase: 'exit', type: 'dissolve', from: 'end', delay: -0.6, duration: 0.6, ease: 'linear', params: {} },
    { id: 'wipe', group: 'exit', phase: 'exit', type: 'wipe', from: 'end', delay: -0.6, duration: 0.6, ease: 'easeInCubic', params: {} },
    { id: 'explode', group: 'exit', phase: 'exit', type: 'explode', from: 'end', delay: -0.6, duration: 0.6, ease: 'easeInCubic', params: {} },
    { id: 'melt', group: 'exit', phase: 'exit', type: 'melt', from: 'end', delay: -0.8, duration: 0.8, ease: 'linear', params: {} },
    { id: 'burn', group: 'exit', phase: 'exit', type: 'burnAway', from: 'end', delay: -0.7, duration: 0.7, ease: 'linear', params: {} },
  ];

  function motionPresets() {
    return MOTION_PRESETS.map((preset) => ({ ...preset, params: { ...preset.params } }));
  }

  return {
    GROUP_NAMES: GROUPS,
    evaluateBeat,
    evaluateScene,
    MOTION_PRESETS,
    motionPresets,
    motionDef,
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
