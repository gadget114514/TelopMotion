(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./effects/registry'), require('./moods'), require('./effects/repeat'), require('./smartness'), require('./weird'), require('./fx-axes'));
  else {
    root.SA = root.SA || {};
    root.SA.random = factory(root.SA.rng, root.SA.fx, root.SA.moods, root.SA.repeat, root.SA.smartness, root.SA.weird, root.SA.fxAxes);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx, moods, repeat, smartness, weird, fxAxes) {
  'use strict';

  const GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion', 'repeat'];
  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'bgShape', 'bgFill', 'bgMotion', 'ornShape', 'ornFill', 'ornMotion', 'repeat'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge', 'ornEdge'];
  const BG_GROUPS = ['bgShape', 'bgFill', 'bgEdge', 'bgMotion'];
  const ORN_GROUPS = ['ornShape', 'ornFill', 'ornEdge', 'ornMotion'];

  // the "bg" lock covers the text background, the "orn" lock the text
  // ornaments: each switch stays on its own side of the split
  function expandLocks(locks) {
    const set = new Set(locks || []);
    if (set.has('bg')) for (const group of BG_GROUPS) set.add(group);
    if (set.has('orn')) for (const group of ORN_GROUPS) set.add(group);
    return set;
  }
  const EASE_POOL = {
    animation: ['linear', 'cubicOut', 'cubicInOut', 'quartOut', 'backOut'],
    layout: ['cubicOut', 'quartOut', 'cubicInOut', 'backOut'],
    enter: ['cubicOut', 'quartOut', 'backOut', 'elasticOut', 'spring(170,26,1)'],
    exit: ['cubicIn', 'quartIn', 'backIn', 'cubicInOut'],
    hold: ['sineInOut', 'linear'],
    location: ['cubicOut', 'sineInOut'],
    fill: ['linear', 'cubicOut'],
    edge: ['linear', 'cubicOut'],
    post: ['linear', 'cubicInOut'],
  };
  const COLOR_POOL = ['#ff8a3d', '#ff4d8d', '#4d8dff', '#5fd44d', '#ffc247', '#b06bff', '#4dc8ff', '#ff5cd0', '#2ee6c0'];

  function pick(random, list) {
    if (!Array.isArray(list) || !list.length) return undefined;
    return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  }

  function sampleParam(param, random, intensity, colors, variety) {
    const level = Math.max(1, Math.min(3, intensity || 1));
    if (param.kind === 'number' || param.kind === 'int') {
      const min = param.min == null ? 0 : param.min;
      const max = param.max == null ? min + 1 : param.max;
      const fallback = param.default == null ? min : param.default;
      // stay inside the author's recommended range; without one keep the default
      const range = Array.isArray(param.random) && param.random.length >= 2 ? param.random : null;
      if (!range) {
        const value = moods.extremeStroke ? moods.extremeStroke(random, fallback, min, max, variety) : fallback;
        return param.kind === 'int' ? Math.round(value) : value;
      }
      const bias = ((level - 1) / 2) * 0.6;
      let value = Math.max(min, Math.min(max, range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, bias + random() * 0.4))));
      if (moods.extremeStroke) value = moods.extremeStroke(random, value, min, max, variety);
      if (param.kind === 'int') return Math.round(value);
      const factor = Math.pow(10, Math.abs(value) < 0.1 ? 4 : 2);
      return Math.round(value * factor) / factor;
    }
    if (param.kind === 'select') return pick(random, param.options || [param.default]);
    if (param.kind === 'bool') return random() < 0.5;
    if (param.kind === 'color') {
      if (colors && colors.length) return pick(random, colors);
      return pick(random, COLOR_POOL);
    }
    if (param.kind === 'vec2') {
      return param.default && typeof param.default === 'object' ? { ...param.default } : { x: 0, y: 0 };
    }
    if (param.kind === 'ease') return pick(random, EASE_POOL.enter);
    if (param.kind === 'points') return param.default;
    return param.default;
  }

  function allowedFor(group, type, context) {
    if (!context) return true;
    if (group === 'layout') {
      const letters = context.letterCount || 0;
      if (type === 'vertical') return context.cjk ? letters <= 16 : letters <= 10;
      if (type === 'circle' || type === 'spiral') return letters <= 24;
      if (type === 'path') return true;
    }
    if (group === 'enter' && type === 'morphFromPrevious') return !!context.hasPrevious;
    if (group === 'location' && type === 'badgeAnchored') return !!context.badgeId;
    return true;
  }

  function candidatesFor(group, allowTags, context) {
    // the extended primitives join the pool only when the sixth axis opens them
    // up (`weird`), so a plain look draws from the classic list alone
    const weird = context && Number.isFinite(context.weird) ? context.weird : 0;
    const list = fx.list(group, weird >= 0.5 ? { packs: 'all' } : undefined);
    // an un-packed primitive that the mood generator counts as extended (marble)
    // stays out until the reveal
    const extended = moods && moods.EXT_TRAITS ? moods.EXT_TRAITS[group] : null;
    const reveal = moods && moods.EXT_REVEAL != null ? moods.EXT_REVEAL : 0.5;
    const filtered = list.filter((descriptor) => {
      if (extended && extended[descriptor.type] && weird < reveal) return false;
      // never pick glyph-destroying or text-overlapping effects automatically
      // (pixelate, halftone, dissolves, scatter, echo trails...). They stay
      // available for manual use in the inspector, and a weird enough look may
      // draw the readable ones (WEIRD_TAG_OK).
      const tagOk = weird >= 0.75 && moods.WEIRD_TAG_OK && moods.WEIRD_TAG_OK.has(descriptor.type);
      if (!tagOk && (descriptor.tags.includes('degrade') || descriptor.tags.includes('overlap'))) return false;
      // fills that need an image or hard-coded colors break automatic looks
      if (group === 'fill' && (descriptor.type === 'textureFill' || descriptor.type === 'karaokeWipe')) return false;
      if (allowTags && allowTags.length && !descriptor.tags.some((tag) => allowTags.includes(tag))) return false;
      return allowedFor(group, descriptor.type, context);
    });
    return filtered.length ? filtered : list;
  }

  function pickType(group, baseType, random, allowTags, context) {
    const candidates = candidatesFor(group, allowTags, context);
    if (!candidates.length) return null;
    // the seventh axis demotes the tacky end of the pool (0 = the old uniform
    // pick, byte for byte); the eighth prefers the horror end
    const s = context && Number.isFinite(context.smartness) ? context.smartness : 0;
    const fear = context && Number.isFinite(context.fear) ? context.fear : 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const descriptor =
        s > 0 || fear > 0
          ? fxAxes.pickWeighted(random, group, candidates, context, {
              smartness: s,
              rating: (item) => smartness.rate(group, item && item.type),
            })
          : candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
      if (!descriptor) return null;
      if (!baseType || descriptor.type !== baseType || candidates.length === 1) return descriptor;
    }
    return candidates[0];
  }

  function sampleMotion(group, descriptor, baseMotion, random, intensity) {
    const level = Math.max(1, Math.min(3, intensity || 1));
    const defaults = (descriptor && descriptor.defaults && descriptor.defaults.motion) || {};
    const base = { ...(defaults.in || {}), ...((baseMotion && baseMotion.in) || {}) };
    const out = { ...(defaults.out || {}), ...((baseMotion && baseMotion.out) || {}) };
    const inDuration = (Number(base.duration) || 0.55) * (0.7 + random() * 0.5);
    const outDuration = (Number(out.duration) || 0.45) * (0.7 + random() * 0.5);
    return {
      in: { duration: Math.round(inDuration * 100) / 100, delay: 0, ease: pick(random, EASE_POOL[group] || EASE_POOL.enter) },
      out: { duration: Math.round(outDuration * 100) / 100, delay: 0, ease: pick(random, EASE_POOL[group] || EASE_POOL.exit) },
      // keep the stagger small so a phrase appears together instead of letter by letter
      stagger: {
        each: Math.round((0.006 + random() * 0.014 * level) * 1000) / 1000,
        order: pick(random, ['ltr', 'ltr', 'word', 'line']),
        ease: 'linear',
        unit: random() < 0.6 ? 'word' : 'letter',
        from: 0.5,
      },
      loop: { period: random() < 0.3 ? Math.round((1 + random() * 3) * 10) / 10 : 0, yoyo: random() < 0.6, ease: 'sineInOut' },
    };
  }

  // textenter2 §2.3: a weird look separates the scale origin from the motion
  // origin; a tame look shares it (and draws no extra randomness, so tame
  // draws stay byte-identical to the pre-pivot pool).
  function applyEnterOrigin(params, descriptor, random, context) {
    if (!descriptor || !Array.isArray(descriptor.params) || !descriptor.params.some((param) => param.key === 'pivot')) return;
    const weirdLevel = context && Number.isFinite(context.weird) ? context.weird : 0;
    if (weirdLevel >= 0.5) {
      const anchors = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br', 'baseline'].filter((anchor) => anchor !== (params.pivotAnchor || 'c'));
      params.scaleOriginSeparate = true;
      params.scaleOrigin = params.pivot || 'letter';
      params.scaleOriginAnchor = anchors[Math.floor(random() * anchors.length)];
    } else {
      params.scaleOriginSeparate = false;
    }
  }

  function instanceFor(group, descriptor, base, random, intensity, colors, context) {
    if (group === 'repeat') return repeatInstance(descriptor, random, context);
    const params = {};
    for (const param of descriptor.params || []) {
      if (param.random === undefined && param.kind !== 'bool') continue;
      const variety =
        context && context.strokeVariety && moods.isStrokeKey && moods.isStrokeKey(group, descriptor.type, param.key)
          ? context.strokeVariety
          : 0;
      params[param.key] = sampleParam(param, random, intensity, colors, variety);
    }
    applyEnterOrigin(params, descriptor, random, context);
    const entry = { type: descriptor.type, params, enabled: true };
    if (SINGLE_GROUPS.includes(group)) {
      entry.motion = sampleMotion(group, descriptor, base && base.motion, random, intensity);
    } else {
      entry.motion = sampleMotion(group, descriptor, null, random, intensity);
    }
    return entry;
  }

  // Repeat is sampled with its own distribution instead of sampleParam: copies
  // follow 1:2:3:many = 35/30/20/15, variation is capped at two attributes and
  // brick/fill stay rare because they take over the frame (§6.4).
  function repeatInstance(descriptor, random, context) {
    const type = descriptor.type;
    const params = {};
    const copiesRoll = random();
    let copies = copiesRoll < 0.35 ? 1 : copiesRoll < 0.65 ? 2 : copiesRoll < 0.85 ? 3 : 'many';
    if (context && context.aspect === '9:16' && type === 'rowH') copies = 1;
    params.copies = copies;
    const dirParam = (descriptor.params || []).find((param) => param.key === 'dir');
    if (dirParam) params.dir = pick(random, dirParam.options || [dirParam.default]);
    params.mainIndex = random() < 0.25 ? 'center' : 'end';
    params.gap = pick(random, ['tight', 'normal', 'wide']);
    params.sequence = pick(random, ['static', 'cascade', 'counterSlide', 'counterScroll', 'wave']);
    params.seqSpeed = random() < 0.5 ? 'fast' : 'slow';
    params.seqOrder = random() < 0.7 ? 'fromMain' : 'toMain';
    params.copyOpacity = random() < 0.5 ? 'flat' : 'fade';
    params.fit = random() < 0.75 ? 'shrink' : 'overflow';
    const variationRoll = random();
    if (variationRoll < 0.15) {
      params.variationPreset = pick(random, ['perspectiveFade', 'popAlternate', 'ransomNote', 'heroOutline', 'rainbowStep', 'loudQuiet']);
    } else {
      const attrs = ['size', 'color', 'font', 'decor'];
      const rules = ['progress', 'alternate', 'random', 'oddOne'];
      params.var1Attr = pick(random, attrs);
      params.var1Rule = pick(random, rules);
      params.var1Level = random() < 0.3 ? 'strong' : 'normal';
      params.var1ColorMode = random() < 0.5 ? 'hue' : 'light';
      params.var1Target = random() < 0.7 ? 'main' : 'last';
      if (variationRoll < 0.15 + 0.25) {
        params.var2Attr = pick(random, attrs);
        params.var2Rule = pick(random, rules);
        params.var2Level = random() < 0.3 ? 'strong' : 'normal';
        params.var2ColorMode = random() < 0.5 ? 'hue' : 'light';
        params.var2Target = random() < 0.7 ? 'main' : 'last';
      }
    }
    params.seedShift = Math.floor(random() * 1000);
    const normalized = repeat.normalize(type, params);
    return { type, params: normalized, enabled: true };
  }

  // Repeat never combines with a layout that already duplicates the string,
  // with morphFromPrevious, or (fill only) with dissolves and mirrors.
  const REPEAT_LAYOUT_CONFLICTS = ['circle', 'spiral', 'path', 'scatter'];
  const REPEAT_FILL_POST = ['kaleidoscope', 'mirror'];

  function repeatConflicts(style) {
    const instance = style && style.repeat;
    if (!instance || !instance.type || instance.type === 'none') return false;
    const layoutType = style.layout && style.layout.type;
    if (layoutType && REPEAT_LAYOUT_CONFLICTS.includes(layoutType)) return true;
    if (style.enter && style.enter.type === 'morphFromPrevious') return true;
    if (instance.type === 'fill') {
      for (const post of style.post || []) {
        const type = post && post.type;
        if (!type) continue;
        if (REPEAT_FILL_POST.includes(type) || /dissolve/i.test(type)) return true;
      }
    }
    return false;
  }

  // One repeat instance for the automatic rolls and for おまかせ's per-cue
  // patches: the same distribution groupPatch used, exposed on its own.
  function repeatPatch(random, context) {
    const ctx = context || {};
    const all = candidatesFor('repeat', ctx.allowTags, ctx);
    if (!all.length) return null;
    const rare = all.filter((entry) => entry.type !== 'brick' && entry.type !== 'fill');
    const pool = rare.length ? rare : all;
    const descriptor =
      random() < 0.1 && all.length > rare.length ? pick(random, all.filter((entry) => entry.type === 'brick' || entry.type === 'fill')) : pick(random, pool);
    return descriptor ? repeatInstance(descriptor, random, ctx) : null;
  }

  function groupPatch(group, base, random, options, context) {
    if (group === 'repeat') {
      const instance = repeatPatch(random, { ...(context || {}), allowTags: options.allowTags });
      return instance ? { repeat: instance } : null;
    }
    const descriptor = pickType(group, base && base.type, random, options.allowTags, context);
    if (!descriptor) return null;
    const colors = options.colors || [];
    if (STACK_GROUPS.includes(group)) {
      // at most two effects per stack: restraint is what makes it look designed
      const count = group === 'post' ? (random() < 0.7 ? 1 : 2) : random() < 0.75 ? 1 : 2;
      const stack = [];
      for (let i = 0; i < count; i += 1) {
        const item = pickType(group, null, random, options.allowTags, context);
        if (!item) continue;
        stack.push(instanceFor(group, item, null, random, options.intensity, colors, context));
      }
      return { [group]: stack };
    }
    return { [group]: instanceFor(group, descriptor, base, random, options.intensity, colors, context) };
  }

  function mergeDeep(base, patch) {
    const result = { ...(base || {}) };
    if (!patch || typeof patch !== 'object') return result;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = mergeDeep(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function resolveStyle(project, path) {
    if (typeof SA !== 'undefined' && SA.project && SA.project.resolveStyle) return SA.project.resolveStyle(project, path);
    const cueId = String(path).split('/')[0].replace('cue:', '');
    return mergeDeep(project.style, (project.cueStyles || {})[cueId] || {});
  }

  // cue / element rolls only touch one or two groups, staying inside the mood
  const REROLL_GROUPS = ['animation', 'enter', 'exit', 'hold', 'fill', 'edge', 'post'];
  // vary keeps every type and only re-samples params / motion ("same style,
  // new seed"). Layout / location join the re-roll set here because their
  // parameters (radius, offset, …) are part of the look too.
  const VARY_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'repeat'];

  function chooseRerollGroups(random, locks) {
    const pool = REROLL_GROUPS.filter((group) => !locks.has(group));
    const count = 1 + Math.floor(random() * 2);
    const picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    return picked;
  }

  function randomize(options) {
    const opts = options || {};
    const project = opts.project;
    if (!project) return { patches: [], seed: 0 };
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 12345;
    const locks = expandLocks(opts.locks);
    // the axes drive how loud the picks are: a high-energy, fast mood reaches
    // for the strong end of every parameter range, a calm one stays low
    const styleAxes = project.styleMode ? project.styleMode.axes : null;
    let axisIntensity = styleAxes
      ? 1 + Math.max(0, Math.min(1, Number(styleAxes.energy) || 0)) * 1.2 + Math.max(0, Math.min(1, Number(styleAxes.speed) || 0)) * 0.6
      : 1;
    // G13: a weird project rolls at a louder intensity (an explicit user value
    // still wins)
    if (weirdOfProject(project) >= 0.5) axisIntensity = Math.min(3, axisIntensity + 1);
    const intensity = opts.intensity == null ? axisIntensity : opts.intensity;
    const colors = opts.colors || [];
    const targets = [];
    // the stroke-variety chance of the project: a weird song may draw hairlines
    // or very heavy outlines / shape strokes; weird 0 leaves the draw untouched
    const styleParams = project.styleMode ? project.styleMode.params || {} : {};
    const resolvedStyleParams = moods.resolveParams ? moods.resolveParams(styleAxes, styleParams) : null;
    const strokeVariety = moods.strokeVarietyOf ? moods.strokeVarietyOf(styleAxes, resolvedStyleParams) : 0;
    const withVariety = (context) => ({ ...context, strokeVariety });

    if (opts.scope === 'project') {
      targets.push({ key: 'project', scope: 'project', base: project.style, context: withVariety(contextForProject(project)) });
    } else if (opts.scope === 'cues') {
      for (const cue of project.script.cues) {
        targets.push({ key: `cue:${cue.id}`, scope: { cueId: cue.id }, base: resolveStyle(project, `cue:${cue.id}`), context: withVariety(contextForCue(project, cue)) });
      }
    } else if (opts.scope === 'elements') {
      for (const path of opts.paths || []) {
        targets.push({ key: path, scope: 'element', path, base: resolveStyle(project, path), context: withVariety(contextForPath(project, path)), manual: !!(project.overrides || {})[path] });
      }
    }

    const patches = [];
    for (const target of targets) {
      if (target.manual && !opts.overwriteManual) continue;
      let style = {};
      if (target.scope === 'project' && moods && moods.generate) {
        // the whole look comes from the mood generator: restrained, coherent
        const mode = (project.styleMode || {});
        const axisRun = mode.axes ? { axes: mode.axes, direction: mode.direction } : moods.randomAxes ? moods.randomAxes(rng.rngFor(seed, target.key, 'axes')) : null;
        const axes = moods.normalizeAxes(axisRun ? axisRun.axes : {});
        if (intensity >= 2) axes.energy = Math.min(1, axes.energy * 1.12);
        style = moods.generate({
          axes,
          seed,
          context: target.context,
          direction: axisRun && axisRun.direction,
          genre: mode.genre || null,
          params: moods.resolveParams ? moods.resolveParams(axes, mode.params) : null,
          paramsSource: (mode && mode.params) || null,
        }).style;
        for (const group of locks) delete style[group];
        if (!locks.has('repeat') && rng.rngFor(seed, target.key, 'repeat')() < 0.3) {
          const repeatPatch = groupPatch('repeat', target.base && target.base.repeat, rng.rngFor(seed, target.key, 'repeatParams'), { ...opts, colors }, target.context);
          if (repeatPatch) Object.assign(style, repeatPatch);
        }
      } else {
        const groups = target.scope === 'project' ? GROUPS : chooseRerollGroups(rng.rngFor(seed, target.key, 'groups'), locks);
        // repeat is rolled for every target and replaces one of the two picks
        if (!locks.has('repeat') && !groups.includes('repeat') && rng.rngFor(seed, target.key, 'repeat')() < 0.3) {
          if (groups.length >= 2) groups.pop();
          groups.push('repeat');
        }
        for (const group of groups) {
          if (locks.has(group)) continue;
          const random = rng.rngFor(seed, target.key, group === 'repeat' ? 'repeatParams' : group);
          const patch = groupPatch(group, target.base && target.base[group], random, { ...opts, colors }, target.context);
          if (patch) Object.assign(style, patch);
        }
      }
      if (Object.keys(style).length) {
        let merged = mergeDeep(target.base || {}, style);
        if (repeatConflicts(merged)) style = { ...style, repeat: { type: 'none', params: {} } };
        // the legibility contract: a re-roll may adjust the groups it touched
        // (and only those) when the effective style would not read
        const axes = project.styleMode && project.styleMode.axes;
        if (moods.legibilityActive(axes)) {
          const before = mergeDeep(target.base || {}, style);
          const repaired = moods.repairLegibility(before, axes, target.context, before.palette, contrastExtra(project));
          if (repaired && repaired !== before) {
            const next = { ...style };
            for (const key of Object.keys(repaired)) {
              if (JSON.stringify(repaired[key]) !== JSON.stringify(before[key])) next[key] = repaired[key];
            }
            style = next;
          }
        }
        patches.push({ scope: target.scope, path: target.path || null, style });
      }
    }
    return { patches, seed };
  }

  // The legibility hold counts words: the longest cue is the one the repair
  // has to keep on screen, so the project scopes take its word count.
  function wordsOfProject(project) {
    const cues = (project && project.script && project.script.cues) || [];
    return cues.reduce((max, cue) => Math.max(max, moods.countWords(cue && cue.text)), 0);
  }

  function contextForProject(project) {
    const cues = project.script.cues;
    const text = cues.map((cue) => cue.text || '').join('');
    return { letterCount: countLetters(text), wordCount: wordsOfProject(project), cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(text), hasPrevious: cues.length > 1, badgeId: cues.some((cue) => cue.meta && cue.meta.badgeId), aspect: project.output ? project.output.aspect : '16:9', weird: weirdOfProject(project), smartness: smartnessOfProject(project), fear: fearOfProject(project) };
  }

  function contextForCue(project, cue) {
    const beats = project.beats && project.beats[cue.id];
    return {
      letterCount: countLetters(cue.text),
      wordCount: moods.countWords(cue.text),
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(cue.text || ''),
      hasPrevious: !!(beats && beats.length > 1),
      badgeId: !!(cue.meta && cue.meta.badgeId),
      aspect: project.output ? project.output.aspect : '16:9',
      weird: weirdOfProject(project),
      smartness: smartnessOfProject(project),
      fear: fearOfProject(project),
    };
  }

  function contextForPath(project, path) {
    const cueId = String(path).split('/')[0].replace('cue:', '');
    const cue = project.script.cues.find((entry) => entry.id === cueId);
    return {
      letterCount: countLetters((cue && cue.text) || ''),
      wordCount: moods.countWords(cue && cue.text),
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test((cue && cue.text) || ''),
      hasPrevious: true,
      badgeId: !!(cue && cue.meta && cue.meta.badgeId),
      aspect: project.output ? project.output.aspect : '16:9',
      weird: weirdOfProject(project),
      smartness: smartnessOfProject(project),
      fear: fearOfProject(project),
    };
  }

  // the theme's pinned text-contrast floor for legibility repairs, or null
  // when the theme follows the weird axis.
  function contrastExtra(project) {
    const raw = project && project.styleMode && project.styleMode.params ? project.styleMode.params.contrast : null;
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? { contrast: Math.max(1, Math.min(7, value)) } : null;
  }

  // the sixth axis of the project's look: how far the automatic picks may stray.
  // A project without a saved value opens at the UI default (0.7). The value is
  // read through the tamed text channel, so the picks match the text side.
  function weirdOfProject(project) {
    return weird.text(moods.projectWeird(project));
  }

  // the seventh axis: only a project that saved a value filters (the engine
  // default stays 0, so old projects randomize exactly as before)
  function smartnessOfProject(project) {
    return moods.smartOf(project && project.styleMode && project.styleMode.axes);
  }

  // the eighth axis: 0 while the project never chose one
  function fearOfProject(project) {
    return moods.projectFear(project);
  }

  function countLetters(text) {
    return Array.from(String(text || '')).filter((char) => !/\s/.test(char)).length;
  }

  // Type-preserving re-sample ("same style, new seed"): every group keeps its
  // current type and only params / motion are re-drawn. Paths that resolve to
  // no instance for a group are left alone. Returns patches in the same shape
  // as randomize() with scope 'elements', so callers can write them back the
  // same way.
  function vary(options) {
    const opts = options || {};
    const project = opts.project;
    if (!project) return { patches: [], seed: 0 };
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 12345;
    const locks = expandLocks(opts.locks);
    const styleAxes = project.styleMode ? project.styleMode.axes : null;
    let axisIntensity = styleAxes
      ? 1 + Math.max(0, Math.min(1, Number(styleAxes.energy) || 0)) * 1.2 + Math.max(0, Math.min(1, Number(styleAxes.speed) || 0)) * 0.6
      : 1;
    if (weirdOfProject(project) >= 0.5) axisIntensity = Math.min(3, axisIntensity + 1);
    const intensity = opts.intensity == null ? axisIntensity : opts.intensity;
    const colors = opts.colors || [];
    const styleParams = project.styleMode ? project.styleMode.params || {} : {};
    const resolvedStyleParams = moods.resolveParams ? moods.resolveParams(styleAxes, styleParams) : null;
    const strokeVariety = moods.strokeVarietyOf ? moods.strokeVarietyOf(styleAxes, resolvedStyleParams) : 0;
    const paths = opts.paths || (opts.path ? [opts.path] : []);
    const groups = (Array.isArray(opts.groups) && opts.groups.length ? opts.groups : VARY_GROUPS).filter((group) => !locks.has(group));
    const patches = [];
    for (const path of paths) {
      const base = resolveStyle(project, path);
      const cueId = String(path).split('/')[0].replace('cue:', '');
      const cue = (project.script && project.script.cues || []).find((entry) => entry.id === cueId);
      if (!cue) continue;
      const context = { ...contextForPath(project, path), strokeVariety };
      const style = {};
      for (const group of groups) {
        if (locks.has(group)) continue;
        const current = base && base[group];
        if (!current) continue;
        if (STACK_GROUPS.includes(group)) {
          if (!Array.isArray(current) || !current.length) continue;
          const stack = [];
          current.forEach((entry, index) => {
            if (!entry || !entry.type || entry.type === 'none') return;
            const descriptor = fx.get(group, entry.type);
            if (!descriptor) return;
            stack.push(instanceFor(group, descriptor, entry, rng.rngFor(seed, path, group, String(index)), intensity, colors, context));
          });
          if (stack.length) style[group] = stack;
          continue;
        }
        if (!current.type || current.type === 'none') continue;
        const descriptor = fx.get(group, current.type);
        if (!descriptor) continue;
        style[group] = instanceFor(group, descriptor, current, rng.rngFor(seed, path, group), intensity, colors, context);
      }
      if (!Object.keys(style).length) continue;
      const merged = mergeDeep(base || {}, style);
      if (repeatConflicts(merged)) continue;
      const axes = project.styleMode && project.styleMode.axes;
      if (moods.legibilityActive(axes)) {
        const before = mergeDeep(base || {}, style);
        const repaired = moods.repairLegibility(before, axes, context, before.palette, contrastExtra(project));
        if (repaired && repaired !== before) {
          const next = { ...style };
          for (const key of Object.keys(repaired)) {
            if (JSON.stringify(repaired[key]) !== JSON.stringify(before[key])) next[key] = repaired[key];
          }
          if (!Object.keys(next).length) continue;
          patches.push({ scope: 'element', path, style: next });
          continue;
        }
      }
      patches.push({ scope: 'element', path, style });
    }
    return { patches, seed };
  }

  function apply(project, options) {
    const result = randomize({ ...options, project });
    const byScope = result.patches;
    if (!byScope.length) return result;
    SA.store.dispatch({
      label: 'randomize',
      areas: ['style', 'overrides'],
      do(projectDoc) {
        for (const patch of byScope) {
          if (patch.scope === 'project') {
            // replace the whole group: stale params from a previous effect type
            // must not linger behind the new one
            for (const group of Object.keys(patch.style)) delete projectDoc.style[group];
            projectDoc.style = SA.project.mergeDeep(projectDoc.style, patch.style);
          } else if (patch.scope === 'element' && patch.path) {
            const overrides = projectDoc.overrides[patch.path] || (projectDoc.overrides[patch.path] = {});
            for (const [group, instance] of Object.entries(patch.style)) overrides[group] = JSON.parse(JSON.stringify(instance));
          } else if (patch.scope && patch.scope.cueId) {
            const container = projectDoc.cueStyles[patch.scope.cueId] || (projectDoc.cueStyles[patch.scope.cueId] = {});
            for (const group of Object.keys(patch.style)) delete container[group];
            projectDoc.cueStyles[patch.scope.cueId] = SA.project.mergeDeep(container, patch.style);
          }
        }
      },
    });
    return result;
  }

  return {
    GROUPS,
    EASE_POOL,
    REROLL_GROUPS,
    VARY_GROUPS,
    randomize,
    vary,
    apply,
    applyEnterOrigin,
    countLetters,
    sampleParam,
    pickType,
    repeatPatch,
    repeatConflicts,
  };
});
