(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null, require('./rng'), require('./effects/registry'), require('./moods'), require('./smartness'), require('./weird'), require('./fx-axes'), require('./gen-params'), require('./legibility'), require('./effects/text-bg'));
  else {
    root.SA = root.SA || {};
    root.SA.looks = factory(root, root.SA.rng, root.SA.fx, root.SA.moods, root.SA.smartness, root.SA.weird, root.SA.fxAxes, root.SA.genParams, root.SA.legibility, root.SA.textBg);
  }
})(typeof self !== 'undefined' ? self : this, function (runtime, rng, fx, moods, smartness, weird, fxAxes, genParams, legibility, textBg) {
  'use strict';

  // FX 800 runtime pool: 800 complete looks classified by motion magnitude and
  // bound to the five mood axes and the genre themes. The build script writes
  // renderer/data/fx800.looks.json with each style stored as a delta against the
  // effect registry defaults; `expand` restores the full style here.
  const SOURCE = 'data/fx800.looks.json';
  const INSTANCE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion', 'repeat'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge', 'ornEdge'];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  // ---------------------------------------------------------------------------
  // delta encoding (build writes deltas, runtime expands them)

  function delta(value, base, depth) {
    if (value === undefined) return undefined;
    if (value === null) return base === null ? undefined : null;
    if (Array.isArray(value)) {
      // arrays are kept whole when they differ (they are small and their
      // holes would not survive a JSON round trip)
      if (Array.isArray(base) && JSON.stringify(value) === JSON.stringify(base)) return undefined;
      return clone(value);
    }
    if (typeof value === 'object') {
      const level = depth || 0;
      // inside `params` / `motion` (depth 2+) an object is kept whole: the
      // runtime merges parameters shallowly, so a partial nested object such as
      // `offset: { y: 0.28 }` would lose the defaulted `x` when expanded
      if (level >= 2) {
        return JSON.stringify(value) === JSON.stringify(base) ? undefined : clone(value);
      }
      const out = {};
      for (const key of Object.keys(value)) {
        // `enabled: true` is the runtime default only on the instance itself;
        // inside `params` a key named `enabled` is an ordinary parameter
        if (level === 0 && key === 'enabled' && value[key] === true) continue;
        const next = delta(value[key], base ? base[key] : undefined, level + 1);
        if (next !== undefined) out[key] = next;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return value === base ? undefined : value;
  }

  // a stored style holds only what differs from the registry defaults; `type`
  // is kept even when it equals the default, because it selects which registry
  // descriptor the runtime must use to restore the missing parameters.
  // The delta base is the default of the type alone: using the instance itself
  // (withDefaults(instance)) would merge the drawn parameters into the base and
  // every value would compare equal, dropping the demo's parameters entirely.
  // A stored look may still carry its ornament under the old `bgShape` name:
  // those entries take the ornament registration as their base (the full
  // parameter set), exactly as before the split.
  function baseGroupOf(group, instance) {
    if (group === 'bgShape' && instance && instance.type && fx.get('ornShape', instance.type)) return 'ornShape';
    return group;
  }

  function defaultInstance(instance, group) {
    const base = baseGroupOf(group, instance);
    if (instance && instance.type) return fx.withDefaults({ type: instance.type }, base);
    return fx.withDefaults(instance, base);
  }

  function stripDefaults(style) {
    const out = {};
    if (!style) return out;
    for (const key of Object.keys(style)) {
      if (INSTANCE_GROUPS.includes(key)) {
        const value = style[key];
        if (Array.isArray(value)) {
          out[key] = value.map((instance) => {
            const base = defaultInstance(instance, key);
            const entry = delta(instance, base) || {};
            if (instance && instance.type) entry.type = instance.type;
            return entry;
          });
        } else if (value && typeof value === 'object') {
          const base = defaultInstance(value, key) || { type: value.type, params: {} };
          const entry = delta(value, base) || {};
          if (value.type) entry.type = value.type;
          out[key] = entry;
        } else {
          out[key] = value;
        }
      } else {
        out[key] = clone(style[key]);
      }
    }
    return out;
  }

  function expandGroup(key, value) {
    if (STACK_GROUPS.includes(key)) {
      return (Array.isArray(value) ? value : value ? [value] : []).map((instance) => fx.withDefaults(instance, baseGroupOf(key, instance))).filter(Boolean);
    }
    return fx.withDefaults(value, baseGroupOf(key, value));
  }

  function expand(style) {
    const out = {};
    if (!style) return out;
    for (const key of Object.keys(style)) {
      if (INSTANCE_GROUPS.includes(key)) out[key] = expandGroup(key, style[key]);
      else out[key] = clone(style[key]);
    }
    // a stored look may predate the background / ornament split: its `bg*`
    // groups move to the group the shape belongs to before anyone reads them
    if (textBg && typeof textBg.splitStyle === 'function') {
      return textBg.splitStyle(out, { shadow: false }).style;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // classification

  function stackLength(value) {
    if (Array.isArray(value)) return value.length;
    return value ? 1 : 0;
  }

  // target motion magnitude of the five axes: energy owns most of it, speed
  // leans the same way (fast moods usually travel further per beat). A weird
  // song expects the louder looks too, judged on the tamed text channel.
  function motionTarget(axes) {
    const source = axes || {};
    return clamp01(
      0.05 +
        0.75 * clamp01(source.energy == null ? 0.5 : source.energy) +
        0.2 * clamp01(source.speed == null ? 0.5 : source.speed) +
        0.35 * weird.text(source.weird)
    );
  }

  function axisDistance(entry, axes) {
    const a = (entry && entry.axes) || {};
    const target = axes || {};
    // the weird distance weighs more when the target itself is weird, so a
    // weird draw is judged mostly on how weird the look is. The target is read
    // through the tamed text channel; the stored entry axis stays raw.
    const ww = 0.9 + 0.9 * weird.text(target.weird);
    let sum = 0;
    let norm = 0;
    for (const [key, weight] of [['speed', 1], ['softness', 1.4], ['density', 0.8], ['brightness', 0.6], ['weird', ww]]) {
      const targetValue = key === 'weird' ? weird.text(target[key]) : target[key];
      sum += Math.abs(clamp01(a[key] == null ? 0.5 : a[key]) - clamp01(targetValue == null ? 0.5 : targetValue)) * weight;
      norm += weight;
    }
    // the fear axis joins the distance only while it is on (0 keeps every
    // existing draw byte-identical); the factor itself is applied by weightFor
    const f = fxAxes.fearOf(target);
    if (f > 0) {
      const own = a.fear == null ? fxAxes.FEAR_NEUTRAL : a.fear;
      const weight = 1 + 2 * f;
      sum += Math.abs(clamp01(own) - f) * weight;
      norm += weight;
    }
    return sum / norm;
  }

  function themeWeight(entry, genre) {
    if (!genre || !entry || !Array.isArray(entry.themes)) return 0;
    const hit = entry.themes.find((theme) => theme && theme.id === genre);
    return hit ? clamp01(hit.w) : 0;
  }

  // the smartness of a stored look: rateStyle walks the expanded stack groups
  // once per entry and is cached, so the pool pick stays cheap
  const smartCache = new Map();

  function entrySmartness(entry) {
    const n = entry && entry.n;
    if (n != null && smartCache.has(n)) return smartCache.get(n);
    const rated = smartness.rateStyle(expand(entry && entry.style));
    if (n != null) {
      if (smartCache.size > 4000) smartCache.clear();
      smartCache.set(n, rated);
    }
    return rated;
  }

  function weightFor(entry, options) {
    const opts = options || {};
    const axes = opts.axes || {};
    // the profile's type weights: a look built around a weighted-out type is
    // removed from the automatic draw (missing weights stay 1)
    if (opts.typeWeights && genParams && typeof genParams.lookTypeWeight === 'function') {
      if (!(genParams.lookTypeWeight({ typeWeights: opts.typeWeights }, entry && entry.style) > 0)) return 0;
    }
    const target = opts.motion == null ? motionTarget(axes) : clamp01(opts.motion);
    const motionNorm = entry.motion && entry.motion.norm != null ? clamp01(entry.motion.norm) : 0.5;
    // energy travels through the measured motion; the other four axes through
    // their traits. Theme affinity multiplies, so a themed draw stays on theme.
    // The seventh axis demotes the looks whose stack carries tacky effects.
    const distance = axisDistance(entry, axes) + 0.8 * Math.abs(motionNorm - target);
    const theme = themeWeight(entry, opts.genre);
    const smart = smartness.weight(entrySmartness(entry).min, smartness.smartOf(axes));
    // the eighth axis: 1 while fear is 0 (the legacy draw), 0 for a look far
    // too harmless for a horror target and > 1 for the frightening side
    const fear = fxAxes.fearFactor(fxAxes.ofLook(entry), axes);
    if (!(fear > 0)) return 0;
    return Math.exp(-4.2 * distance) * (0.1 + 1.4 * theme) * smart * fear;
  }

  function pickFrom(list, options) {
    const opts = options || {};
    const exclude = opts.exclude instanceof Set ? opts.exclude : new Set(opts.exclude || []);
    const candidates = list.filter((entry) => !exclude.has(entry.n));
    if (!candidates.length) return null;
    const random = rng.rngFor(opts.seed == null ? 1 : opts.seed, 'looks', opts.genre || 'any');
    let total = 0;
    const weights = candidates.map((entry) => {
      const weight = weightFor(entry, opts);
      total += weight;
      return weight;
    });
    if (!(total > 0)) return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    let roll = random() * total;
    for (let i = 0; i < candidates.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  // ---------------------------------------------------------------------------
  // composition (draw a look, then adjust the fine parameters)

  function recolorClip(clip, palette) {
    if (!clip || !clip.type) return null;
    const colors = (palette && palette.colors) || [];
    const spec = clone(clip);
    spec.params = spec.params || {};
    if (spec.type === 'solid' || spec.type === 'plain') spec.params.color = colors[0] || '#101018';
    else if (spec.type === 'gradient' || spec.type === 'noiseGradient') spec.params.colors = [colors[0] || '#101018', colors[1] || colors[4] || '#202838'];
    else if (spec.type === 'pattern' || spec.type === 'shapes') spec.params.color = colors[3] || '#4d8dff';
    return spec;
  }

  // A composed style must not keep an instance the profile zeroed: stacks lose
  // the entry, single groups fall back to a plain type (or disappear).
  const TYPE_WEIGHT_STACKS = ['hold', 'edge', 'post', 'bgEdge', 'ornEdge'];
  const TYPE_WEIGHT_SINGLES = ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'bgShape', 'bgFill', 'bgMotion', 'ornShape', 'ornFill', 'ornMotion', 'repeat'];

  function dropWeightedTypes(style, typeWeights) {
    if (!style || !typeWeights || !genParams || typeof genParams.typeWeight !== 'function') return style;
    const profile = { typeWeights };
    const out = { ...style };
    for (const group of TYPE_WEIGHT_STACKS) {
      const value = out[group];
      if (Array.isArray(value)) {
        const kept = value.filter((instance) => !instance || !instance.type || genParams.typeWeight(profile, group, instance.type) > 0);
        if (kept.length) out[group] = kept;
        else delete out[group];
      } else if (value && value.type && genParams.typeWeight(profile, group, value.type) <= 0) {
        delete out[group];
      }
    }
    for (const group of TYPE_WEIGHT_SINGLES) {
      const value = out[group];
      if (!value || !value.type) continue;
      if (genParams.typeWeight(profile, group, value.type) > 0) continue;
      const fallback = legibility && legibility.SAFE_FALLBACKS ? legibility.SAFE_FALLBACKS[group] : null;
      if (fallback) out[group] = { ...value, type: fallback, params: {} };
      else delete out[group];
    }
    return out;
  }

  // the drawn 800 demo supplies the motion structure; the axes regenerate the
  // palette, the text metrics and (when the demo has none) the colour roles
  function compose(entry, options) {
    if (!entry) return null;
    const opts = options || {};
    // the seventh axis drops the tacky effects from the look's stacks and
    // steers the generator (palette, background, text)
    const s = smartness.smartOf(opts.axes);
    let style = smartness.prune(expand(entry.style), s);
    // the stored look keeps frozen glow params; the raw axis tames them
    moods.tameGlow(style, weird.raw(opts.axes && opts.axes.weird));
    const generated = moods.generate({
      axes: opts.axes,
      seed: opts.seed,
      genre: opts.genre,
      direction: opts.direction,
      context: opts.context,
      typeWeights: opts.typeWeights,
    }).style;
    if (generated.palette) style.palette = clone(generated.palette);
    if (!style.color && generated.color) style.color = clone(generated.color);
    if (generated.text) {
      const text = clone(generated.text);
      if (style.text && style.text.fontId) text.fontId = style.text.fontId;
      style.text = { ...(style.text || {}), ...text };
    }
    // the profile's zeroed types leave the stacks / single groups
    style = dropWeightedTypes(style, opts.typeWeights);
    // the legibility contract applies to the composed style (the drawn part
    // plus the generated palette / text); weird 0 / fear 0 is a no-op
    const repaired = moods.repairLegibility(style, opts.axes, { ...(opts.context || {}), duration: opts.duration }, style.palette);
    if (repaired && repaired !== style) style = repaired;
    return {
      style,
      clip: recolorClip(entry.clip, style.palette),
      palette: style.palette || null,
      look: {
        n: entry.n,
        name: entry.name,
        group: entry.group,
        type: entry.type,
        motion: entry.motion || null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // instance + loading

  function create(data) {
    const effects = (data && data.effects) || [];
    return {
      data,
      count: () => effects.length,
      list: () => effects,
      get(n) {
        return effects.find((entry) => entry.n === n) || null;
      },
      pick: (options) => pickFrom(effects, options),
      weightFor: (entry, options) => weightFor(entry, options),
      compose,
      expand,
      stripDefaults,
    };
  }

  let loaded = null;
  let loading = null;

  async function readSource() {
    const platform = runtime && runtime.SA && runtime.SA.platform;
    if (platform && typeof platform.readAsset === 'function') {
      const buffer = await platform.readAsset(SOURCE);
      return new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    }
    const response = await fetch(SOURCE);
    if (!response.ok) throw Object.assign(new Error(`looks-http-${response.status}`), { code: 'looks-fetch-failed' });
    return await response.text();
  }

  async function load(options) {
    const opts = options || {};
    if (loaded && !opts.force) return loaded;
    if (loading && !opts.force) return loading;
    loading = (async () => {
      try {
        const text = await readSource();
        const data = JSON.parse(text);
        loaded = create(data);
        return loaded;
      } catch (error) {
        loaded = null;
        return null;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function current() {
    return loaded;
  }

  function requireLoaded() {
    if (!loaded) throw Object.assign(new Error('looks-not-loaded'), { code: 'looks-not-loaded' });
    return loaded;
  }

  return {
    SOURCE,
    INSTANCE_GROUPS,
    STACK_GROUPS,
    stripDefaults,
    expand,
    create,
    load,
    current,
    motionTarget,
    axisDistance,
    themeWeight,
    weightFor,
    recolorClip,
    compose,
    count: () => requireLoaded().count(),
    list: () => requireLoaded().list(),
    get: (n) => requireLoaded().get(n),
    pick: (options) => requireLoaded().pick(options),
  };
});
