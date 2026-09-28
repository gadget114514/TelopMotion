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
    };
    if (!groups.has(entry.group)) groups.set(entry.group, new Map());
    groups.get(entry.group).set(entry.type, entry);
    types.set(`${entry.group}.${entry.type}`, entry);
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

  function list(group) {
    const direct = groups.get(group);
    if (direct) return [...direct.values()];
    const base = aliases.get(group);
    if (!base) return [];
    return [...(groups.get(base) || new Map()).values()].map((entry) => ({ ...entry, group }));
  }

  function paramDefaults(group, type) {
    const entry = get(group, type);
    const params = {};
    for (const param of (entry && entry.params) || []) params[param.key] = param.default;
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
    return {
      type: source.type,
      enabled: source.enabled !== false,
      params: { ...paramDefaults(group, source.type), ...(entry && entry.defaults.params ? entry.defaults.params : {}), ...(source.params || {}) },
      motion: { ...((entry && entry.defaults.motion) || {}), ...(source.motion || {}) },
    };
  }

  function costOf(style) {
    let cost = 0;
    if (!style) return cost;
    for (const group of ['animation', 'layout', 'enter', 'exit', 'location', 'fill', 'background', 'color']) {
      const instance = withDefaults(style[group], group);
      const entry = instance && get(group, instance.type);
      if (entry) cost += entry.cost;
    }
    // the text background costs nothing until a shape is selected
    const bgInstance = withDefaults(style.bgShape, 'bgShape');
    const bgActive = !!(bgInstance && bgInstance.type && bgInstance.type !== 'none');
    if (bgActive) {
      for (const group of ['bgShape', 'bgFill', 'bgMotion']) {
        const entry = get(group, (withDefaults(style[group], group) || {}).type);
        if (entry) cost += entry.cost;
      }
    }
    for (const group of ['hold', 'edge', 'post', 'bgEdge']) {
      if (group === 'bgEdge' && !bgActive) continue;
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
    alias,
    baseOf,
    get,
    list,
    paramDefaults,
    defaultsFor,
    withDefaults,
    costOf,
    types,
    groups,
    aliases,
  };
});
