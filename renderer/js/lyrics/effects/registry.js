(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.fx = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const types = new Map();
  const groups = new Map();
  // group aliases: bgFill -> fill, bgEdge -> edge. The base entry is reused
  // with the alias group name patched in, so type lists never drift apart.
  const aliases = new Map();

  const DEFAULT_MOTION = {
    in: { duration: 0.6, delay: 0, ease: 'easeOutCubic' },
    out: { duration: 0.5, delay: 0, ease: 'easeInCubic' },
    stagger: { each: 0.035, order: 'ltr', ease: 'linear', unit: 'letter', from: 0.5 },
    loop: { period: 0, yoyo: false, ease: 'easeInOutSine' },
  };

  const GROUP_DEFAULTS = {
    animation: { type: 'stagger', params: {} },
    layout: { type: 'row', params: {} },
    enter: { type: 'fade', params: {}, motion: { in: { duration: 0.5, ease: 'easeOutCubic' } } },
    exit: { type: 'fade', params: {}, motion: { out: { duration: 0.4, ease: 'easeInCubic' } } },
    hold: null,
    location: { type: 'center', params: {} },
    fill: { type: 'solid', params: {} },
    edge: null,
    post: null,
    background: { type: 'none', params: {} },
    color: { params: {} },
    bgShape: { type: 'none', params: {} },
    bgFill: { type: 'solid', params: {} },
    bgEdge: null,
    bgMotion: { type: 'follow', params: {} },
    ornShape: { type: 'none', params: {} },
    ornFill: { type: 'solid', params: {} },
    ornEdge: null,
    ornMotion: { type: 'follow', params: {} },
    repeat: { type: 'none', params: {} },
    page: { type: 'none', params: {} },
  };

  function alias(group, baseGroup) {
    aliases.set(group, baseGroup);
    return aliases.get(group);
  }

  function baseOf(group) {
    return aliases.get(group) || group;
  }

  function register(descriptor) {
    const entry = {
      group: descriptor.group,
      type: descriptor.type,
      label: descriptor.label || `fx.${descriptor.group}.${descriptor.type}`,
      params: descriptor.params || [],
      defaults: descriptor.defaults || {},
      tags: descriptor.tags || [],
      cost: descriptor.cost || 0,
      stackable: !!descriptor.stackable,
      cpu: descriptor.cpu || null,
      gpu: descriptor.gpu || null,
      anchor: descriptor.anchor || null,
      fixedDuration: descriptor.fixedDuration == null ? null : Number(descriptor.fixedDuration),
      // optional per-type hooks: `normalize(params)` clamps a params object to
      // the valid combinations of the type, `costOf(params)` overrides the
      // static cost with a value derived from the params.
      normalize: typeof descriptor.normalize === 'function' ? descriptor.normalize : null,
      costOf: typeof descriptor.costOf === 'function' ? descriptor.costOf : null,
      // `physics(params, phase)` provides the soft body simulation config; the
      // descriptor's cpu is a no-op when the hook is present (motion.js runs
      // the lattice instead of the cpu).
      physics: typeof descriptor.physics === 'function' ? descriptor.physics : null,
      // `spread(h, env, params, info)` reports how much wider / narrower this
      // effect makes a substring (`{ x, y }` growth factors, 0 = unchanged).
      // motion.js uses it to reflow the letters outside a `local` scoped run, so
      // a stretched substring pushes its line aside instead of overlapping it.
      spread: typeof descriptor.spread === 'function' ? descriptor.spread : null,
      // `pack` groups the extended primitives and presets so
      // the earlier catalogs keep the exact type list they were built on.
      pack: descriptor.pack || null,
      // presets carry the primitive they expand to; the params schema, cpu,
      // normalize and cost all come from that primitive.
      preset: descriptor.preset || null,
    };
    if (!groups.has(entry.group)) groups.set(entry.group, new Map());
    groups.get(entry.group).set(entry.type, entry);
    types.set(`${entry.group}.${entry.type}`, entry);
    return entry;
  }

  function registerPreset(descriptor) {
    const group = descriptor.group;
    // `get` follows the group aliases, so a preset can sit in an aliased group
    // (`bgFill` -> `fill`) and still inherit its primitive's schema
    const source = get(group, descriptor.primitive);
    if (!source) return null;
    const params = { ...(descriptor.params || {}) };
    const entry = register({
      group,
      type: descriptor.type,
      label: descriptor.label || `fx.${group}.${descriptor.type}`,
      params: source.params,
      defaults: {
        // defaults.params is the middle layer of withDefaults: primitive
        // defaults -> preset params -> instance params
        params,
        motion: descriptor.motion ? JSON.parse(JSON.stringify(descriptor.motion)) : source.defaults.motion,
        // a scoped preset (a letter-wise attribute) pins the scope it needs, so
        // picking the type writes a ready-to-see entry instead of an unscoped one
        scope: descriptor.scope ? JSON.parse(JSON.stringify(descriptor.scope)) : undefined,
      },
      tags: descriptor.tags || source.tags,
      cost: source.cost,
      stackable: source.stackable,
      cpu: source.cpu,
      gpu: source.gpu,
      anchor: source.anchor,
      fixedDuration: source.fixedDuration,
      normalize: source.normalize,
      costOf: source.costOf,
      physics: source.physics,
      spread: source.spread,
      pack: descriptor.pack || 'pro',
      preset: { primitive: descriptor.primitive, params },
    });
    return entry;
  }

  function get(group, type) {
    const entry = types.get(`${group}.${type}`);
    if (entry) return entry;
    const base = aliases.get(group);
    if (!base) return null;
    const source = types.get(`${base}.${type}`);
    return source ? { ...source, group } : null;
  }

  // `options.packs` filters by pack ('all' includes everything). The default is
  // the unpacked entries, so the catalogs built before the extended pack existed keep
  // exactly the type list they were sampled from.
  function packMatches(entry, packs) {
    if (packs === 'all') return true;
    if (!packs) return !entry.pack;
    const list = Array.isArray(packs) ? packs : [packs];
    if (list.includes('all')) return true;
    return list.includes(entry.pack);
  }

  function list(group, options) {
    const packs = options && options.packs;
    // An aliased group keeps the base group's types and may add its own on top
    // (a preset registered under `bgFill` must not hide the `fill` types behind
    // the alias), so both sets are merged, base first, without duplicates.
    const base = aliases.get(group);
    const out = [];
    const seen = new Set();
    for (const source of [groups.get(group), base && base !== group ? groups.get(base) : null]) {
      for (const entry of source ? source.values() : []) {
        if (!packMatches(entry, packs)) continue;
        const key = `${base && entry.group === base ? group : entry.group}.${entry.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entry.group === group ? entry : { ...entry, group });
      }
    }
    return out;
  }

  function packOf(group, type) {
    const entry = get(group, type);
    return entry ? entry.pack : null;
  }

  // Instance of a preset -> the equivalent instance of its primitive (params
  // resolved, motion kept). Non-presets pass through unchanged.
  function expandPreset(instance, group) {
    if (!instance || !instance.type) return instance;
    const entry = get(group, instance.type);
    if (!entry || !entry.preset) return instance;
    const resolved = withDefaults(instance, group);
    return {
      type: entry.preset.primitive,
      enabled: resolved.enabled !== false,
      params: resolved.params,
      motion: resolved.motion,
      ...(resolved.scope == null ? {} : { scope: resolved.scope }),
    };
  }

  function isPreset(group, type) {
    const entry = get(group, type);
    return !!(entry && entry.preset);
  }

  function paramDefaults(group, type) {
    const entry = get(group, type);
    const params = {};
    for (const param of (entry && entry.params) || []) {
      // `optional: true` params are omitted from the resolved defaults: the
      // older catalogs / fixtures never saw them, and the inspector falls back
      // to each param's own `default` when the key is missing
      if (param.optional === true) continue;
      params[param.key] = param.default;
    }
    return params;
  }

  function defaultsFor(group) {
    const defaults = GROUP_DEFAULTS[group];
    return defaults ? JSON.parse(JSON.stringify(defaults)) : null;
  }

  function withDefaults(instance, group) {
    const fallback = defaultsFor(group);
    const source = instance && instance.type ? instance : fallback;
    if (!source) return null;
    const entry = get(group, source.type);
    let params = { ...paramDefaults(group, source.type), ...(entry && entry.defaults.params ? entry.defaults.params : {}), ...(source.params || {}) };
    if (entry && entry.normalize) {
      // presets resolve through their primitive, so a normalize hook that
      // switches on the type always sees the type it was written for
      const type = entry.preset ? entry.preset.primitive : source.type;
      params = entry.normalize(params, { type, group });
    }
    return {
      type: source.type,
      enabled: source.enabled !== false,
      params,
      motion: { ...((entry && entry.defaults.motion) || {}), ...(source.motion || {}) },
      // a scoped preset carries its scope; an explicit one on the instance wins
      ...(source.scope != null || (entry && entry.defaults.scope) ? { scope: source.scope != null ? source.scope : entry.defaults.scope } : {}),
    };
  }

  function costOf(style) {
    let cost = 0;
    if (!style) return cost;
    for (const group of ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'color', 'repeat']) {
      const instance = withDefaults(style[group], group);
      const entry = instance && get(group, instance.type);
      if (entry) cost += entry.costOf ? entry.costOf(instance.params, instance) : entry.cost;
    }
    // the text background costs nothing until a shape is selected; the
    // ornaments are the same deal behind their own groups
    const bgInstance = withDefaults(style.bgShape, 'bgShape');
    const bgActive = !!(bgInstance && bgInstance.type && bgInstance.type !== 'none');
    if (bgActive) {
      for (const group of ['bgShape', 'bgFill', 'bgMotion']) {
        const entry = get(group, (withDefaults(style[group], group) || {}).type);
        if (entry) cost += entry.cost;
      }
    }
    const ornInstance = withDefaults(style.ornShape, 'ornShape');
    const ornActive = !!(ornInstance && ornInstance.type && ornInstance.type !== 'none');
    if (ornActive) {
      for (const group of ['ornShape', 'ornFill', 'ornMotion']) {
        const entry = get(group, (withDefaults(style[group], group) || {}).type);
        if (entry) cost += entry.cost;
      }
    }
    for (const group of ['hold', 'edge', 'post', 'bgEdge', 'ornEdge']) {
      if (group === 'bgEdge' && !bgActive) continue;
      if (group === 'ornEdge' && !ornActive) continue;
      for (const instance of style[group] || []) {
        const entry = get(group, instance.type);
        if (entry) cost += entry.cost;
      }
    }
    return cost;
  }

  return {
    DEFAULT_MOTION,
    GROUP_DEFAULTS,
    register,
    registerPreset,
    alias,
    baseOf,
    get,
    list,
    packOf,
    isPreset,
    expandPreset,
    paramDefaults,
    defaultsFor,
    withDefaults,
    costOf,
    types,
    groups,
    aliases,
  };
});
