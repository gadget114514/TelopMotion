(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.easing = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BACK_C1 = 1.70158;
  const BACK_C2 = BACK_C1 * 1.525;
  const BACK_C3 = BACK_C1 + 1;
  const ELASTIC_C4 = (2 * Math.PI) / 3;
  const ELASTIC_C5 = (2 * Math.PI) / 4.5;

  function linear(t) {
    return t;
  }

  function quadIn(t) {
    return t * t;
  }

  function quadOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function quadInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function cubicIn(t) {
    return t * t * t;
  }

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function cubicInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function quartIn(t) {
    return t * t * t * t;
  }

  function quartOut(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function quartInOut(t) {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }

  function quintIn(t) {
    return t * t * t * t * t;
  }

  function quintOut(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function quintInOut(t) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  function sineIn(t) {
    return 1 - Math.cos((t * Math.PI) / 2);
  }

  function sineOut(t) {
    return Math.sin((t * Math.PI) / 2);
  }

  function sineInOut(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function expoIn(t) {
    return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
  }

  function expoOut(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function expoInOut(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  }

  function circIn(t) {
    return 1 - Math.sqrt(1 - Math.min(1, t * t));
  }

  function circOut(t) {
    return Math.sqrt(1 - Math.pow(t - 1, 2));
  }

  function circInOut(t) {
    return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  }

  function backIn(t) {
    return BACK_C3 * t * t * t - BACK_C1 * t * t;
  }

  function backOut(t) {
    return 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2);
  }

  function backInOut(t) {
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2;
  }

  function elasticIn(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ELASTIC_C4);
  }

  function elasticOut(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
  }

  function elasticInOut(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1;
  }

  function bounceOut(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
      const shifted = t - 1.5 / d1;
      return n1 * shifted * shifted + 0.75;
    }
    if (t < 2.5 / d1) {
      const shifted = t - 2.25 / d1;
      return n1 * shifted * shifted + 0.9375;
    }
    const shifted = t - 2.625 / d1;
    return n1 * shifted * shifted + 0.984375;
  }

  function bounceIn(t) {
    return 1 - bounceOut(1 - t);
  }

  function bounceInOut(t) {
    return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2;
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function hold(t) {
    return t < 1 ? 0 : 1;
  }

  const MAP = {
    linear,
    quadIn,
    quadOut,
    quadInOut,
    cubicIn,
    cubicOut,
    cubicInOut,
    quartIn,
    quartOut,
    quartInOut,
    quintIn,
    quintOut,
    quintInOut,
    sineIn,
    sineOut,
    sineInOut,
    expoIn,
    expoOut,
    expoInOut,
    circIn,
    circOut,
    circInOut,
    backIn,
    backOut,
    backInOut,
    elasticIn,
    elasticOut,
    elasticInOut,
    bounceIn,
    bounceOut,
    bounceInOut,
    smoothstep,
    smootherstep,
    hold,
  };

  const names = Object.keys(MAP);

  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;

    function solve(x) {
      let t = x;
      for (let i = 0; i < 8; i += 1) {
        const error = sampleX(t) - x;
        if (Math.abs(error) < 1e-6) return t;
        const slope = sampleDX(t);
        if (Math.abs(slope) < 1e-6) break;
        t -= error / slope;
      }
      let low = 0;
      let high = 1;
      t = x;
      for (let i = 0; i < 20; i += 1) {
        const value = sampleX(t);
        if (Math.abs(value - x) < 1e-6) return t;
        if (value > x) high = t;
        else low = t;
        t = (low + high) / 2;
      }
      return t;
    }

    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return sampleY(solve(t));
    };
  }

  function spring(options) {
    const opts = options || {};
    const stiffness = opts.stiffness == null ? 170 : opts.stiffness;
    const damping = opts.damping == null ? 26 : opts.damping;
    const mass = opts.mass == null ? 1 : opts.mass;
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    let f;
    let decay;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const a = zeta * w0;
      decay = Math.max(a, 1e-6);
      f = (t) => 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t));
    } else if (zeta === 1) {
      decay = Math.max(w0, 1e-6);
      f = (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    } else {
      const s = w0 * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * w0 + s;
      const r2 = -zeta * w0 - s;
      decay = Math.max(-r1, 1e-6);
      const c2 = -r1 / (r2 - r1);
      const c1 = 1 - c2;
      f = (t) => 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
    }
    const duration = Math.max(Math.log(1000) / decay, 1e-3);
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return f(t * duration);
    };
  }

  function steps(count, direction) {
    const n = Math.max(1, Math.floor(count || 1));
    if (direction === 'start') {
      return (t) => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return Math.min(1, Math.ceil(t * n) / n);
      };
    }
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return Math.max(0, Math.floor(t * n) / n);
    };
  }

  function parseNumbers(text) {
    return String(text || '')
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part))
      .filter((value) => !Number.isNaN(value));
  }

  // accepts the friendly "easeOutCubic" style as an alias of "cubicOut"
  const ALIAS = { ease: 'cubicInOut', easeIn: 'cubicIn', easeOut: 'cubicOut', easeInOut: 'cubicInOut' };

  function canonical(value) {
    const raw = String(value == null ? 'linear' : value).trim();
    if (MAP[raw]) return raw;
    if (ALIAS[raw]) return ALIAS[raw];
    const match = /^ease(InOut|In|Out)([A-Za-z]+)$/.exec(raw);
    if (match) {
      const candidate = match[2].charAt(0).toLowerCase() + match[2].slice(1) + match[1];
      if (MAP[candidate]) return candidate;
    }
    return raw;
  }

  function parse(value) {
    const raw = String(value == null ? 'linear' : value).trim();
    const name = canonical(raw);
    if (MAP[name]) return MAP[name];
    const bezier = raw.match(/^cubic-bezier\(\s*([^)]+)\)$/i);
    if (bezier) {
      const values = parseNumbers(bezier[1]);
      if (values.length === 4) return cubicBezier(values[0], values[1], values[2], values[3]);
    }
    const springMatch = raw.match(/^spring\(\s*([^)]*)\)$/i);
    if (springMatch) {
      const values = parseNumbers(springMatch[1]);
      return spring({ stiffness: values[0], damping: values[1], mass: values[2] });
    }
    const stepsMatch = raw.match(/^steps\(\s*([^)]+)\)$/i);
    if (stepsMatch) {
      const parts = stepsMatch[1].split(',');
      const n = Number.parseInt(parts[0], 10);
      const direction = (parts[1] || 'end').trim().toLowerCase() === 'start' ? 'start' : 'end';
      return steps(Number.isNaN(n) ? 1 : n, direction);
    }
    return linear;
  }

  function get(name) {
    if (typeof name === 'function') return name;
    return parse(name);
  }

  return { get, names, canonical, cubicBezier, spring, steps, hold, parse };
});
