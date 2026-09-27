(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng'), require('./effects/registry'));
  else {
    root.SA = root.SA || {};
    root.SA.random = factory(root.SA.rng, root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (rng, fx) {
  'use strict';

  const GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background'];
  const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background'];
  const STACK_GROUPS = ['hold', 'edge', 'post'];
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

  function sampleParam(param, random, intensity, colors) {
    const level = Math.max(1, Math.min(3, intensity || 1));
    if (param.kind === 'number' || param.kind === 'int') {
      const min = param.min == null ? 0 : param.min;
      const max = param.max == null ? min + 1 : param.max;
      const value = min + (max - min) * Math.pow(random(), 1 / level);
      return param.kind === 'int' ? Math.round(value) : Math.round(value * 100) / 100;
    }
    if (param.kind === 'select') return pick(random, param.options || [param.default]);
    if (param.kind === 'bool') return random() < 0.5;
    if (param.kind === 'color') {
      if (colors && colors.length) return pick(random, colors);
      return pick(random, COLOR_POOL);
    }
    if (param.kind === 'vec2') {
      return { x: Math.round((random() * 2 - 1) * 100) / 100, y: Math.round((random() * 2 - 1) * 100) / 100 };
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
    const list = fx.list(group);
    const filtered = list.filter((descriptor) => {
      // never pick glyph-destroying effects automatically (pixelate, halftone,
      // dissolves...). They stay available for manual use in the inspector.
      if (descriptor.tags.includes('degrade')) return false;
      if (allowTags && allowTags.length && !descriptor.tags.some((tag) => allowTags.includes(tag))) return false;
      return allowedFor(group, descriptor.type, context);
    });
    return filtered.length ? filtered : list;
  }

  function pickType(group, baseType, random, allowTags, context) {
    const candidates = candidatesFor(group, allowTags, context);
    if (!candidates.length) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const descriptor = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
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

  function instanceFor(group, descriptor, base, random, intensity, colors) {
    const params = {};
    for (const param of descriptor.params || []) {
      if (param.random === undefined && param.kind !== 'bool') continue;
      params[param.key] = sampleParam(param, random, intensity, colors);
    }
    const entry = { type: descriptor.type, params, enabled: true };
    if (SINGLE_GROUPS.includes(group)) {
      entry.motion = sampleMotion(group, descriptor, base && base.motion, random, intensity);
    } else {
      entry.motion = sampleMotion(group, descriptor, null, random, intensity);
    }
    return entry;
  }

  function groupPatch(group, base, random, options, context) {
    const descriptor = pickType(group, base && base.type, random, options.allowTags, context);
    if (!descriptor) return null;
    const colors = options.colors || [];
    if (STACK_GROUPS.includes(group)) {
      const count = 1 + Math.floor(random() * (group === 'post' ? 2 : 1.5));
      const stack = [];
      for (let i = 0; i < count; i += 1) {
        const item = pickType(group, null, random, options.allowTags, context);
        if (!item) continue;
        stack.push(instanceFor(group, item, null, random, options.intensity, colors));
      }
      return { [group]: stack };
    }
    return { [group]: instanceFor(group, descriptor, base, random, options.intensity, colors) };
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

  function randomize(options) {
    const opts = options || {};
    const project = opts.project;
    if (!project) return { patches: [], seed: 0 };
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 12345;
    const locks = new Set(opts.locks || []);
    const intensity = opts.intensity || 1;
    const colors = opts.colors || [];
    const targets = [];

    if (opts.scope === 'project') {
      targets.push({ key: 'project', scope: 'project', base: project.style, context: contextForProject(project) });
    } else if (opts.scope === 'cues') {
      for (const cue of project.script.cues) {
        targets.push({ key: `cue:${cue.id}`, scope: { cueId: cue.id }, base: resolveStyle(project, `cue:${cue.id}`), context: contextForCue(project, cue) });
      }
    } else if (opts.scope === 'elements') {
      for (const path of opts.paths || []) {
        targets.push({ key: path, scope: 'element', path, base: resolveStyle(project, path), context: contextForPath(project, path), manual: !!(project.overrides || {})[path] });
      }
    }

    const patches = [];
    for (const target of targets) {
      if (target.manual && !opts.overwriteManual) continue;
      const style = {};
      for (const group of GROUPS) {
        if (locks.has(group)) continue;
        const random = rng.rngFor(seed, target.key, group);
        const patch = groupPatch(group, target.base && target.base[group], random, { ...opts, colors }, target.context);
        if (patch) Object.assign(style, patch);
      }
      if (Object.keys(style).length) patches.push({ scope: target.scope, path: target.path || null, style });
    }
    return { patches, seed };
  }

  function contextForProject(project) {
    const cues = project.script.cues;
    const text = cues.map((cue) => cue.text || '').join('');
    return { letterCount: countLetters(text), cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(text), hasPrevious: cues.length > 1, badgeId: cues.some((cue) => cue.meta && cue.meta.badgeId) };
  }

  function contextForCue(project, cue) {
    const beats = project.beats && project.beats[cue.id];
    return {
      letterCount: countLetters(cue.text),
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test(cue.text || ''),
      hasPrevious: !!(beats && beats.length > 1),
      badgeId: !!(cue.meta && cue.meta.badgeId),
    };
  }

  function contextForPath(project, path) {
    const cueId = String(path).split('/')[0].replace('cue:', '');
    const cue = project.script.cues.find((entry) => entry.id === cueId);
    return {
      letterCount: countLetters((cue && cue.text) || ''),
      cjk: /[\u3000-\u9fff\uff00-\uffef]/.test((cue && cue.text) || ''),
      hasPrevious: true,
      badgeId: !!(cue && cue.meta && cue.meta.badgeId),
    };
  }

  function countLetters(text) {
    return Array.from(String(text || '')).filter((char) => !/\s/.test(char)).length;
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
            projectDoc.style = SA.project.mergeDeep(projectDoc.style, patch.style);
          } else if (patch.scope === 'element' && patch.path) {
            const overrides = projectDoc.overrides[patch.path] || (projectDoc.overrides[patch.path] = {});
            for (const [group, instance] of Object.entries(patch.style)) overrides[group] = JSON.parse(JSON.stringify(instance));
          } else if (patch.scope && patch.scope.cueId) {
            projectDoc.cueStyles[patch.scope.cueId] = SA.project.mergeDeep(projectDoc.cueStyles[patch.scope.cueId] || {}, patch.style);
          }
        }
      },
    });
    return result;
  }

  return {
    GROUPS,
    EASE_POOL,
    randomize,
    apply,
    countLetters,
    sampleParam,
    pickType,
  };
});
