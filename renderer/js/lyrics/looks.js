(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null, require('./rng'), require('./effects/registry'), require('./moods'), require('./smartness'));
  else {
    root.SA = root.SA || {};
    root.SA.looks = factory(root, root.SA.rng, root.SA.fx, root.SA.moods, root.SA.smartness);
  }
})(typeof self !== 'undefined' ? self : this, function (runtime, rng, fx, moods, smartness) {
  'use strict';

  // FX 800 runtime pool: 800 complete looks classified by motion magnitude and
  // bound to the five mood axes and the genre themes. The build script writes
  // renderer/data/fx800.looks.json with each style stored as a delta against the
  // effect registry defaults; `expand` restores the full style here.
  const SOURCE = 'data/fx800.looks.json';
  const INSTANCE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'repeat'];
  const STACK_GROUPS = ['hold', 'edge', 'post', 'bgEdge'];

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
  function defaultInstance(instance, group) {
    if (instance && instance.type) return fx.withDefaults({ type: instance.type }, group);
    return fx.withDefaults(instance, group);
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
      return (Array.isArray(value) ? value : value ? [value] : []).map((instance) => fx.withDefaults(instance, key)).filter(Boolean);
    }
    return fx.withDefaults(value, key);
  }

  function expand(style) {
    const out = {};
    if (!style) return out;
    for (const key of Object.keys(style)) {
      if (INSTANCE_GROUPS.includes(key)) out[key] = expandGroup(key, style[key]);
      else out[key] = clone(style[key]);
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
  // song expects the louder looks too.
  function motionTarget(axes) {
    const source = axes || {};
    return clamp01(
      0.05 +
        0.75 * clamp01(source.energy == null ? 0.5 : source.energy) +
        0.2 * clamp01(source.speed == null ? 0.5 : source.speed) +
        0.35 * clamp01(source.weird)
    );
  }

  function axisDistance(entry, axes) {
    const a = (entry && entry.axes) || {};
    const target = axes || {};
    // the weird distance weighs more when the target itself is weird, so a
    // weird draw is judged mostly on how weird the look is
    const ww = 0.9 + 0.9 * clamp01(target.weird);
    let sum = 0;
    let norm = 0;
    for (const [key, weight] of [['speed', 1], ['softness', 1.4], ['density', 0.8], ['brightness', 0.6], ['weird', ww]]) {
      sum += Math.abs(clamp01(a[key] == null ? 0.5 : a[key]) - clamp01(target[key] == null ? 0.5 : target[key])) * weight;
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
    const target = opts.motion == null ? motionTarget(axes) : clamp01(opts.motion);
    const motionNorm = entry.motion && entry.motion.norm != null ? clamp01(entry.motion.norm) : 0.5;
    // energy travels through the measured motion; the other four axes through
    // their traits. Theme affinity multiplies, so a themed draw stays on theme.
    // The seventh axis demotes the looks whose stack carries tacky effects.
    const distance = axisDistance(entry, axes) + 0.8 * Math.abs(motionNorm - target);
    const theme = themeWeight(entry, opts.genre);
    const smart = smartness.weight(entrySmartness(entry).min, smartness.smartOf(axes));
    return Math.exp(-4.2 * distance) * (0.1 + 1.4 * theme) * smart;
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
    if (spec.type === 'solid') spec.params.color = colors[0] || '#101018';
    else if (spec.type === 'gradient' || spec.type === 'noiseGradient') spec.params.colors = [colors[0] || '#101018', colors[1] || colors[4] || '#202838'];
    else if (spec.type === 'pattern' || spec.type === 'shapes') spec.params.color = colors[3] || '#4d8dff';
    return spec;
  }

  // the drawn 800 demo supplies the motion structure; the axes regenerate the
  // palette, the text metrics and (when the demo has none) the colour roles
  function compose(entry, options) {
    if (!entry) return null;
    const opts = options || {};
    // the seventh axis drops the tacky effects from the look's stacks and
    // steers the generator (palette, background, text)
    const s = smartness.smartOf(opts.axes);
    const style = smartness.prune(expand(entry.style), s);
    const generated = moods.generate({
      axes: opts.axes,
      seed: opts.seed,
      genre: opts.genre,
      direction: opts.direction,
      context: opts.context,
    }).style;
    if (generated.palette) style.palette = clone(generated.palette);
    if (!style.color && generated.color) style.color = clone(generated.color);
    if (generated.text) {
      const text = clone(generated.text);
      if (style.text && style.text.fontId) text.fontId = style.text.fontId;
      style.text = { ...(style.text || {}), ...text };
    }
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
