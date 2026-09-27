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
  };

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
    };
    if (!groups.has(entry.group)) groups.set(entry.group, new Map());
    groups.get(entry.group).set(entry.type, entry);
    types.set(`${entry.group}.${entry.type}`, entry);
    return entry;
  }

  function get(group, type) {
    return types.get(`${group}.${type}`) || null;
  }

  function list(group) {
    return [...(groups.get(group) || new Map()).values()];
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
    for (const group of ['hold', 'edge', 'post']) {
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
    get,
    list,
    paramDefaults,
    defaultsFor,
    withDefaults,
    costOf,
    types,
    groups,
  };
});
