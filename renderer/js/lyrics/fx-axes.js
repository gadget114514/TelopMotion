(function (root, factory) {
  let table = null;
  if (typeof module === 'object' && module.exports) {
    try {
      table = require('./fx-axes-table.js');
    } catch {
      table = null;
    }
    module.exports = factory(table);
  } else {
    root.SA = root.SA || {};
    root.SA.fxAxes = factory(root.SA.fxAxesTable || null);
  }
})(typeof self !== 'undefined' ? self : this, function (table) {
  'use strict';

  // The eighth axis: `fear`. It rates every effect from 0 (harmless) to 1
  // (frightening) and lets the generators prefer the horror side of the pool.
  // The table (`renderer/js/lyrics/fx-axes-table.js`, generated from
  // `scripts/fx-axes-overrides.json` + the existing trait / smartness tables)
  // carries the full 8-axis vector of every effect group / type and of the
  // pseudo groups the timeline vocabulary uses (figure motifs and moves, split
  // motions, transitions, patterns...).
  //
  //   { speed, energy, softness, density, brightness, weird, smartness, fear }
  //
  // The engine default is fear 0 = "not specified": every consumer multiplies
  // the drawn weight by 1 and consumes the random stream exactly as before.

  const AXES = ['speed', 'energy', 'softness', 'density', 'brightness', 'weird', 'smartness', 'fear'];
  // the five placed axes drive the distance term of `affinity`
  const BASE_AXES = ['speed', 'energy', 'softness', 'density', 'brightness'];
  const NEUTRAL = 0.5;
  const FEAR_NEUTRAL = 0.2;
  // every axis is quantised to 4 bits: the 8-axis vector of a direction is one
  // 32-bit integer (4 bytes), axis i in bits 4i..4i+3, 0..15
  const AXIS_BITS = 4;
  const AXIS_MAX = 15;
  // fear above this opens the horror side: the extended primitives, the
  // readable degrade / overlap tags and the genre-only blood / ash / rain
  // palettes
  const FEAR_REVEAL = 0.5;
  // a target this far above an effect's own fear is a hard exclusion
  const FEAR_GAP = 0.6;

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function has(value) {
    return value != null && value !== '' && Number.isFinite(Number(value));
  }

  // --- 4-bit packing ---------------------------------------------------------
  // `pack(vector)` -> unsigned 32-bit integer, `unpack(n)` -> vector. Both
  // accept the other form and pass it through, so old data (arrays) and the
  // packed directions can coexist.

  function stepOf(value, axis) {
    const fallback = axis === 'fear' ? FEAR_NEUTRAL : NEUTRAL;
    return Math.max(0, Math.min(AXIS_MAX, Math.round(clamp01(value == null ? fallback : value) * AXIS_MAX)));
  }

  function pack(vector) {
    if (typeof vector === 'number' && Number.isFinite(vector)) return vector >>> 0;
    if (Array.isArray(vector)) return pack(vectorFromArray(vector));
    const source = vector || {};
    let packed = 0;
    for (let i = 0; i < AXES.length; i += 1) {
      packed += stepOf(source[AXES[i]], AXES[i]) << (AXIS_BITS * i);
    }
    return packed >>> 0;
  }

  function unpack(packed) {
    if (Array.isArray(packed)) return vectorFromArray(packed);
    if (packed == null || !Number.isFinite(Number(packed))) return of(null, null);
    const number = Number(packed) >>> 0;
    const out = {};
    for (let i = 0; i < AXES.length; i += 1) {
      out[AXES[i]] = ((number >>> (AXIS_BITS * i)) & AXIS_MAX) / AXIS_MAX;
    }
    return out;
  }

  // the packed integer of a vector: `packed(vector)` / `packed(group, type)`
  function packed(value, type) {
    if (typeof value === 'string' && type != null) {
      const entry = tableEntry(value, type);
      if (entry != null) return pack(entry);
      return pack(of(value, type));
    }
    return pack(value);
  }

  function vectorFromArray(items) {
    const out = {};
    for (let i = 0; i < AXES.length; i += 1) out[AXES[i]] = clamp01(items[i] == null ? (AXES[i] === 'fear' ? FEAR_NEUTRAL : NEUTRAL) : items[i]);
    return out;
  }

  // The rating provider: smartness.js registers its own `rate` so the
  // smartness column has a single source and never goes stale.
  let rateProvider = null;
  function setRateProvider(fn) {
    if (typeof fn === 'function') rateProvider = fn;
  }

  function tableEntry(group, type) {
    if (!table || type == null) return null;
    const groups = table.groups || {};
    // the ornament groups mirror the text-background groups: the legacy `bg*`
    // names carry the vectors
    const list = groups[TABLE_GROUP[group] || group];
    return (list && list[type]) || null;
  }

  function vectorFromArray(items) {
    const out = {};
    for (let i = 0; i < AXES.length; i += 1) out[AXES[i]] = clamp01(items[i] == null ? (AXES[i] === 'fear' ? FEAR_NEUTRAL : NEUTRAL) : items[i]);
    return out;
  }

  function neutralVector() {
    return { speed: NEUTRAL, energy: NEUTRAL, softness: NEUTRAL, density: NEUTRAL, brightness: NEUTRAL, weird: NEUTRAL, smartness: NEUTRAL, fear: FEAR_NEUTRAL };
  }

  // The ornament groups are the old text-background shapes under a second
  // name; their axis vectors stay in the `bg*` rows of the table.
  const TABLE_GROUP = { ornShape: 'bgShape', ornFill: 'bgFill', ornEdge: 'bgEdge', ornMotion: 'bgMotion' };

  // One effect's vector. Unknown types read neutral; fear 0.2 is the neutral
  // value the plan pins for unregistered effects. Table entries are packed
  // 32-bit integers (or the older 8-number arrays).
  function of(group, type) {
    const entry = tableEntry(group, type);
    let out;
    if (typeof entry === 'number') out = unpack(entry);
    else if (Array.isArray(entry)) out = vectorFromArray(entry);
    else out = neutralVector();
    if (rateProvider && group && type != null) {
      const rating = Number(rateProvider(group, type));
      if (Number.isFinite(rating)) out.smartness = clamp01(rating);
    }
    return out;
  }

  function fearOf(axes) {
    return axes && has(axes.fear) ? clamp01(axes.fear) : 0;
  }

  function projectFear(project) {
    const axes = project && project.styleMode && project.styleMode.axes;
    return axes && has(axes.fear) ? clamp01(axes.fear) : 0;
  }

  // The weighted mean of a list of vectors. `maxBlend` (0..1) pulls the result
  // towards the strongest entry: fear and weird read high because one chilling
  // effect is enough to make the whole look frightening.
  function blend(vectors, weights, maxBlend) {
    const out = {};
    for (const axis of AXES) out[axis] = 0;
    let total = 0;
    for (let i = 0; i < vectors.length; i += 1) {
      const weight = weights && weights[i] != null ? Math.max(0, Number(weights[i])) : 1;
      if (!(weight > 0) || !vectors[i]) continue;
      total += weight;
      for (const axis of AXES) out[axis] += clamp01(vectors[i][axis]) * weight;
    }
    if (!(total > 0)) return { speed: NEUTRAL, energy: NEUTRAL, softness: NEUTRAL, density: NEUTRAL, brightness: NEUTRAL, weird: NEUTRAL, smartness: NEUTRAL, fear: FEAR_NEUTRAL };
    for (const axis of AXES) out[axis] /= total;
    const pull = maxBlend == null ? 0 : Math.max(0, Math.min(1, Number(maxBlend)));
    if (pull > 0) {
      for (const axis of ['weird', 'fear']) {
        let max = 0;
        for (const vector of vectors) if (vector) max = Math.max(max, clamp01(vector[axis]));
        out[axis] = out[axis] * (1 - pull) + max * pull;
      }
    }
    return out;
  }

  // Weight of a style slot: the hero groups carry the look, so a look's vector
  // follows them first.
  const STYLE_WEIGHTS = {
    animation: 0.6, layout: 0.6, enter: 1.5, exit: 1.5, hold: 1.5, location: 0.5,
    fill: 1.2, edge: 1.2, post: 1.4, background: 0.4, color: 0.3, clones: 0.3,
    bgShape: 1, bgFill: 1, bgEdge: 1, bgMotion: 1,
    ornShape: 1, ornFill: 1, ornEdge: 1, ornMotion: 1, repeat: 1.2,
  };
  const STACK_GROUPS = new Set(['hold', 'edge', 'post', 'bgEdge', 'ornEdge']);

  function instancesOf(style) {
    const out = [];
    if (!style || typeof style !== 'object') return out;
    for (const [group, value] of Object.entries(style)) {
      const weight = STYLE_WEIGHTS[group];
      if (weight == null) continue;
      const list = Array.isArray(value) ? value : value && typeof value === 'object' && value.type ? [value] : [];
      for (const instance of list) {
        if (!instance || typeof instance !== 'object' || !instance.type) continue;
        out.push({ group, type: instance.type, weight });
      }
    }
    return out;
  }

  // The composite vector of a complete style: weighted mean, with weird / fear
  // pulled towards the strongest slot and smartness at the minimum (the tacky
  // end defines how cheap the look reads).
  function ofStyle(style) {
    const found = instancesOf(style);
    if (!found.length) return of(null, null);
    const vectors = found.map((entry) => of(entry.group, entry.type));
    const weights = found.map((entry) => entry.weight);
    const out = blend(vectors, weights, 0.5);
    let min = 1;
    for (const vector of vectors) min = Math.min(min, vector.smartness);
    out.smartness = min;
    return out;
  }

  // The vector of a figure spec (motif + the moves its sub-beats carry). The
  // figure track and the `figures` filler both route through here.
  function ofFigure(spec) {
    const params = (spec && spec.params) || spec || {};
    const found = [];
    if (params.motif) found.push({ group: 'figureMotif', type: params.motif, weight: 1.5 });
    for (const beat of Array.isArray(params.beats) ? params.beats : []) {
      const move = (beat && beat.move) || {};
      if (move.in) found.push({ group: 'figureIn', type: move.in, weight: 1 });
      if (move.hold) found.push({ group: 'figureHold', type: move.hold, weight: 1 });
      if (move.out) found.push({ group: 'figureOut', type: move.out, weight: 1 });
    }
    if (!found.length) {
      if (params.in) found.push({ group: 'figureIn', type: params.in, weight: 1 });
      if (params.hold) found.push({ group: 'figureHold', type: params.hold, weight: 1 });
      if (params.out) found.push({ group: 'figureOut', type: params.out, weight: 1 });
    }
    if (!found.length) return of(null, null);
    const out = blend(found.map((entry) => of(entry.group, entry.type)), found.map((entry) => entry.weight), 0.5);
    let min = 1;
    for (const entry of found) min = Math.min(min, of(entry.group, entry.type).smartness);
    out.smartness = min;
    return out;
  }

  // The vector of a filler / backdrop clip spec: combo layers recurse, figures
  // route through ofFigure, split through its motion + scheme and patterns
  // through their mode.
  function ofFiller(spec, depth) {
    const node = spec || {};
    if (depth == null) depth = 0;
    if (depth > 4) return of(null, null);
    if (node.type === 'combo') {
      const list = (node.params && node.params.list) || [];
      const vectors = list.map((part) => ofFiller(part, depth + 1));
      return vectors.length ? blend(vectors, vectors.map(() => 1), 0.5) : of(null, null);
    }
    if (node.type === 'figures' || node.type === 'figure') return ofFigure(node);
    if (node.type === 'split') {
      const params = node.params || {};
      const found = [];
      if (params.motion) found.push({ group: 'splitMotion', type: params.motion, weight: 1 });
      if (params.scheme) found.push({ group: 'splitScheme', type: params.scheme, weight: 1 });
      if (!found.length) return of('background', node.type);
      return blend(found.map((entry) => of(entry.group, entry.type)), found.map((entry) => entry.weight), 0.5);
    }
    if (node.type === 'pattern') return of('pattern', (node.params && node.params.mode) || 'grid');
    if (node.type === 'textAnim' || node.type === 'none' || !node.type) return of(null, null);
    return of('background', node.type);
  }

  // A stored look: the runtime pools carry the packed 32-bit axis integer
  // (P-D's looks500 and P-C's figures500 store it as `axes`); the old fx800
  // entries have no axes and fall back to their style.
  function ofLook(entry) {
    const axes = (entry && entry.axes) || null;
    if (typeof axes === 'number') return unpack(axes);
    if (axes && typeof axes === 'object') {
      const out = {};
      for (const axis of AXES) out[axis] = clamp01(axes[axis] == null ? (axis === 'fear' ? FEAR_NEUTRAL : NEUTRAL) : axes[axis]);
      return out;
    }
    return ofStyle(entry && entry.style);
  }

  // The fear multiplier of one effect at a target: at fear 0 the target does
  // not filter (1), a target far above the effect's own fear drops it to 0 and
  // a scary effect gains weight as the axis rises.
  function fearFactor(vector, axes) {
    const f = fearOf(axes);
    if (!(f > 0)) return 1;
    const own = clamp01(vector && vector.fear != null ? vector.fear : FEAR_NEUTRAL);
    const gap = f - own;
    if (gap > FEAR_GAP && f >= 0.5) return 0;
    if (gap > 0) return Math.max(0.03, 1 - 1.6 * gap * (0.5 + f));
    return 1 + 3 * f * own;
  }

  function hardExclude(vector, axes) {
    return fearFactor(vector, axes) <= 0;
  }

  // The extraction weight of `vector` at `axes`. With fear 0 it is exactly 1
  // (the legacy draw); above it the placed axes pull the draw towards the
  // target and the fear factor does the horror selection. The smartness
  // factor is applied by the caller.
  function affinity(vector, axes, options) {
    const opts = options || {};
    const f = fearOf(axes);
    if (!(f > 0) && !opts.force) return 1;
    const fear = fearFactor(vector, axes);
    if (!(fear > 0)) return 0;
    let sum = 0;
    let count = 0;
    for (const key of BASE_AXES) {
      const target = axes ? axes[key] : null;
      if (target == null || !Number.isFinite(Number(target))) continue;
      sum += (clamp01(vector && vector[key]) - clamp01(target)) ** 2;
      count += 1;
    }
    const distance = count ? Math.sqrt(sum / count) : 0;
    return Math.exp(-4.2 * distance) * fear;
  }

  // Smartness-weighted, fear-weighted pick over `list`. `group` names a table
  // group or is a `(item) => vector` function; `options.getVector` overrides
  // how an item's vector is read (figures use ofFigure, fillers ofFiller...).
  // At fear 0 and smartness 0 it consumes the random stream exactly like the
  // plain uniform pick, so the old draws stay byte-identical.
  function pickWeighted(random, group, list, axes, options) {
    if (!Array.isArray(list) || !list.length) return undefined;
    const opts = options || {};
    const s = opts.smartness != null ? clamp01(opts.smartness) : 0;
    const fearOn = fearOf(axes) > 0;
    if (!(s > 0) && !fearOn) return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    const vectorOf = typeof group === 'function' ? group : opts.getVector ? opts.getVector : (item) => of(group, typeof item === 'string' ? item : item && item.type);
    const ratingOf = typeof opts.rating === 'function' ? opts.rating : (item) => {
      if (rateProvider) {
        const groupName = opts.ratingGroup || (typeof group === 'string' ? group : null);
        const type = typeof item === 'string' ? item : item && item.type;
        const value = Number(rateProvider(groupName, type));
        if (Number.isFinite(value)) return clamp01(value);
      }
      if (typeof group !== 'string') return NEUTRAL;
      return NEUTRAL;
    };
    let total = 0;
    const weights = list.map((item) => {
      const smart = s > 0 ? smartWeight(ratingOf(item), s) : 1;
      const weight = smart * affinity(vectorOf(item), axes);
      total += weight;
      return weight;
    });
    if (!(total > 0)) return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    let roll = random() * total;
    for (let i = 0; i < list.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  // the smartness weight without requiring smartness.js (the provider path
  // keeps the two in sync; this is the same curve)
  function smartWeight(rating, s) {
    const value = clamp01(rating);
    if (!(s > 0)) return 1;
    if (value < s - 0.45) return 0;
    return Math.max(0.05, 1 - 1.4 * Math.max(0, s - value));
  }

  function listGroups() {
    return table ? Object.keys(table.groups || {}) : [];
  }

  return {
    AXES,
    BASE_AXES,
    NEUTRAL,
    FEAR_NEUTRAL,
    FEAR_REVEAL,
    FEAR_GAP,
    AXIS_BITS,
    AXIS_MAX,
    TABLE: table,
    setRateProvider,
    pack,
    unpack,
    packed,
    of,
    ofStyle,
    ofFigure,
    ofFiller,
    ofLook,
    fearOf,
    projectFear,
    fearFactor,
    hardExclude,
    affinity,
    pickWeighted,
    listGroups,
  };
});
