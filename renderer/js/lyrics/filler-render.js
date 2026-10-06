(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const fillerRender = factory(require('./split'), require('./figures'), require('./adsr'));
    if (root.SA) root.SA.fillerRender = root.SA.fillerRender || fillerRender;
    module.exports = fillerRender;
  } else {
    root.SA = root.SA || {};
    root.SA.fillerRender = factory(root.SA.split, root.SA.figures, root.SA.adsr);
  }
})(typeof self !== 'undefined' ? self : this, function (split, figures, adsrApi) {
  'use strict';

  const TAU = Math.PI * 2;

  function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp01(value) {
    return value <= 0 ? 0 : value >= 1 ? 1 : value;
  }

  function hashString(text) {
    let hash = 2166136261;
    const source = String(text == null ? '' : text);
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function colorOf(params, ctx, fallback) {
    return (params && (params.color || params.stroke)) || (ctx && ctx.color) || fallback || '#eef2ff';
  }

  // Multi-colour clips cycle through `params.colors`; anything else keeps the
  // single colour contract of `colorOf`.
  function colorAt(params, ctx, index, fallback) {
    const list = params && params.colors;
    if (Array.isArray(list) && list.length) {
      const at = Math.abs(Math.round(num(index, 0))) % list.length;
      return list[at];
    }
    return colorOf(params, ctx, fallback);
  }

  function frameAt(analysis, time) {
    if (!analysis || !analysis.frames || !analysis.frames.length) return null;
    const index = Math.max(0, Math.min(analysis.frames.length - 1, Math.floor(time * (analysis.fps || 30))));
    return analysis.frames[index] || null;
  }

  function waveSample(frame, index, fallbackTime) {
    if (frame && frame.wave && frame.wave.length) {
      const at = Math.max(0, Math.min(frame.wave.length - 1, Math.round(index)));
      return frame.wave[at];
    }
    return Math.sin((index / 32 + fallbackTime * 2.4) * TAU) * 0.55;
  }

  function bandValue(frame, band, bandCount) {
    if (!frame || !frame.bands || !frame.bands.length) return 0;
    const count = bandCount || frame.bands.length;
    const lo = Math.floor((band * frame.bands.length) / count);
    const hi = Math.max(lo + 1, Math.floor(((band + 1) * frame.bands.length) / count));
    let sum = 0;
    for (let i = lo; i < hi && i < frame.bands.length; i += 1) sum += frame.bands[i];
    return sum / (hi - lo);
  }

  // Without an audio track there is no analysis frame; synthesize a moving
  // spectrum so level meters still animate.
  function synthesizedBand(index, count, time) {
    const shape = 0.25 + 0.6 * Math.pow(Math.sin(((index + 0.5) / count) * Math.PI), 0.7);
    const wobble = 0.55 + 0.45 * Math.sin(time * 2.1 + index * 0.55);
    const pulse = 0.6 + 0.4 * Math.sin(time * 3.4 + index * 0.23);
    return Math.max(0.06, Math.min(1, shape * wobble * pulse));
  }

  function arcShapes(parts, options) {
    const { x, y, r, from, to, thickness, color, opacity } = options;
    const steps = Math.max(6, Math.round(Math.abs(to - from) * 48));
    for (let i = 0; i < steps; i += 1) {
      const a0 = from + ((to - from) * i) / steps;
      const a1 = from + ((to - from) * (i + 1)) / steps;
      parts.push({
        kind: 'capsule',
        x0: x + Math.cos(a0) * r,
        y0: y + Math.sin(a0) * r,
        x1: x + Math.cos(a1) * r,
        y1: y + Math.sin(a1) * r,
        width: thickness,
        color,
        opacity,
      });
    }
  }

  function countdownShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#ffd166');
    const remaining = Math.max(0, (ctx.nextStart == null ? ctx.clip.to : ctx.nextStart) - ctx.time);
    if (remaining <= 0) return { shapes: [], texts: [] };
    const from = Math.max(0.2, num(params.from, 3));
    if (params.showOnlyLast && remaining > from) return { shapes: [], texts: [] };
    const digit = String(Math.max(1, Math.ceil(remaining)));
    const progress = clamp01(1 - remaining / from);
    const shapes = [];
    const texts = [{ text: digit, x: width / 2, y: height / 2, size: height * 0.22, color, opacity: 1 }];
    const style = params.style || 'digits';
    if (style === 'ring') {
      arcShapes(shapes, { x: width / 2, y: height / 2, r: height * 0.17, from: -Math.PI / 2, to: -Math.PI / 2 + TAU * progress, thickness: height * 0.012, color, opacity: 0.9 });
    } else if (style === 'bar') {
      const w = width * 0.46;
      shapes.push({ kind: 'rect', x: (width - w) / 2, y: height * 0.72, w, h: height * 0.012, radius: height * 0.006, color, opacity: 0.25 });
      shapes.push({ kind: 'rect', x: (width - w) / 2, y: height * 0.72, w: w * progress, h: height * 0.012, radius: height * 0.006, color, opacity: 0.95 });
    } else if (style === 'dots') {
      const dots = 8;
      for (let i = 0; i < dots; i += 1) {
        shapes.push({
          kind: 'circle',
          x: width / 2 + (i - (dots - 1) / 2) * height * 0.035,
          y: height * 0.72,
          r: height * 0.009,
          color,
          opacity: progress * dots > i ? 1 : 0.25,
        });
      }
    }
    return { shapes, texts };
  }

  function waveformShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#4dc8ff');
    const mode = params.mode || 'line';
    const thickness = Math.max(0.5, num(params.thickness, 2.5)) * (height / 1080);
    const frame = frameAt(ctx.analysis, ctx.time);
    const points = 72;
    const shapes = [];
    const sample = (i) => waveSample(frame, ((i / points) * 512 + ctx.time * 220) % 512, ctx.time);
    if (mode === 'circle') {
      const radius = Math.min(width, height) * 0.2;
      const amp = radius * 0.28;
      for (let i = 0; i < points; i += 1) {
        const a0 = (i / points) * TAU - Math.PI / 2;
        const a1 = ((i + 1) / points) * TAU - Math.PI / 2;
        const r0 = radius + sample(i) * amp;
        const r1 = radius + sample(i + 1) * amp;
        shapes.push({
          kind: 'capsule',
          x0: width / 2 + Math.cos(a0) * r0,
          y0: height / 2 + Math.sin(a0) * r0,
          x1: width / 2 + Math.cos(a1) * r1,
          y1: height / 2 + Math.sin(a1) * r1,
          width: thickness,
          color,
          opacity: 0.95,
        });
      }
      return { shapes, texts: [] };
    }
    const margin = width * 0.08;
    const span = width - margin * 2;
    const amp = height * 0.12 * Math.max(0.2, num(params.amp, 1));
    const middle = height / 2;
    for (let i = 0; i < points; i += 1) {
      const x0 = margin + (span * i) / points;
      const x1 = margin + (span * (i + 1)) / points;
      const y0 = middle + sample(i) * amp;
      const y1 = middle + sample(i + 1) * amp;
      shapes.push({ kind: 'capsule', x0, y0, x1, y1, width: thickness, color, opacity: 0.95 });
      if (mode === 'mirror') shapes.push({ kind: 'capsule', x0, y0: middle * 2 - y0, x1, y1: middle * 2 - y1, width: thickness, color, opacity: 0.6 });
    }
    return { shapes, texts: [] };
  }

  function spectrumShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#7ce0a4');
    const mode = params.mode || 'bars';
    const bars = Math.max(8, Math.min(128, Math.round(num(params.bars, 48))));
    const falloff = Math.max(0.05, num(params.falloff, 1));
    const frame = frameAt(ctx.analysis, ctx.time);
    const spectrum = (index) => (frame ? bandValue(frame, index, bars) : synthesizedBand(index, bars, ctx.time) * 0.9);
    const shapes = [];
    if (mode === 'radial') {
      for (let i = 0; i < bars; i += 1) {
        const angle = (i / bars) * TAU - Math.PI / 2;
        const value = Math.pow(clamp01(spectrum(i) * 2.4 * falloff), 1.2);
        const r0 = height * 0.12;
        const r1 = r0 + height * 0.22 * value;
        shapes.push({
          kind: 'capsule',
          x0: width / 2 + Math.cos(angle) * r0,
          y0: height / 2 + Math.sin(angle) * r0,
          x1: width / 2 + Math.cos(angle) * r1,
          y1: height / 2 + Math.sin(angle) * r1,
          width: Math.max(1.5, (TAU * r0 * 0.55) / bars),
          color,
          opacity: 0.9,
        });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'blob') {
      for (let i = 0; i < bars; i += 1) {
        const angle = (i / bars) * TAU - Math.PI / 2;
        const value = clamp01(spectrum(i) * 2.6 * falloff);
        const r = height * 0.08 + height * 0.16 * value;
        shapes.push({ kind: 'circle', x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r, r: height * 0.012 + value * height * 0.02, color, opacity: 0.7 });
      }
      return { shapes, texts: [] };
    }
    const margin = width * 0.08;
    const span = width - margin * 2;
    const barWidth = (span / bars) * 0.72;
    for (let i = 0; i < bars; i += 1) {
      const value = Math.pow(clamp01(spectrum(i) * 2.4 * falloff), 1.2);
      const h = Math.max(height * 0.004, height * 0.34 * value);
      shapes.push({
        kind: 'rect',
        x: margin + (span * i) / bars,
        y: height * 0.78 - h,
        w: barWidth,
        h,
        radius: barWidth * 0.3,
        color,
        opacity: 0.9,
      });
    }
    return { shapes, texts: [] };
  }

  function sineWaveShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#9db2ff');
    const waves = Math.max(1, Math.min(5, Math.round(num(params.waves, 2))));
    const amp = height * 0.08 * Math.max(0.1, num(params.amp, 1));
    const speed = num(params.speed, 1);
    const points = 64;
    const margin = width * 0.08;
    const span = width - margin * 2;
    const shapes = [];
    for (let w = 0; w < waves; w += 1) {
      const phase = ctx.time * speed * TAU + (w / waves) * TAU;
      const offset = (w - (waves - 1) / 2) * height * 0.07;
      for (let i = 0; i < points; i += 1) {
        const x0 = margin + (span * i) / points;
        const x1 = margin + (span * (i + 1)) / points;
        const y0 = height / 2 + offset + Math.sin((i / points) * TAU * 2 + phase) * amp;
        const y1 = height / 2 + offset + Math.sin(((i + 1) / points) * TAU * 2 + phase) * amp;
        shapes.push({ kind: 'capsule', x0, y0, x1, y1, width: Math.max(1, height * 0.0025), color, opacity: 0.8 });
      }
    }
    return { shapes, texts: [] };
  }

  function shapesShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const set = params.set || 'circles';
    const count = Math.max(1, Math.min(48, Math.round(num(params.count, 8))));
    const speed = num(params.speed, 1);
    const rng = seededRandom(hashString(`${ctx.clip.key}|${set}|${count}`) ^ num(ctx.seed, 0));
    const shapes = [];
    const short = Math.min(width, height);
    const baseColor = colorOf(params, ctx, '#ff8a3d');
    for (let i = 0; i < count; i += 1) {
      const color = colorAt(params, ctx, i, baseColor);
      const rx = rng();
      const ry = rng();
      const rr = rng();
      if (set === 'circles') {
        const progress = ((ctx.time * speed * 0.4 + i / count) % 1 + 1) % 1;
        shapes.push({ kind: 'ring', x: rx * width, y: ry * height, r: progress * short * 0.22, thickness: Math.max(1, short * 0.003), color, opacity: (1 - progress) * 0.8 });
      } else if (set === 'polygons') {
        shapes.push({
          kind: 'polygon',
          x: rx * width,
          y: ry * height,
          r: short * (0.03 + rr * 0.06),
          sides: 3 + Math.round(rr * 4),
          rotation: ctx.time * speed * 30 * (rr > 0.5 ? 1 : -1) + rr * 360,
          stroke: Math.max(1, short * 0.002),
          strokeColor: color,
          color,
          opacity: 0.7,
        });
      } else if (set === 'lines') {
        const travel = ((ctx.time * speed * 0.15 + rx) % 1 + 1) % 1;
        const x = travel * width;
        shapes.push({ kind: 'capsule', x0: x, y0: ry * height, x1: x + width * 0.12, y1: ry * height, width: Math.max(1, short * 0.0025), color, opacity: 0.5 + rr * 0.5 });
      } else if (set === 'burst') {
        const angle = (i / count) * TAU + ctx.time * speed * 0.3;
        const reach = short * 0.18 * (0.5 + 0.5 * Math.sin(ctx.time * speed * 1.6 + i));
        shapes.push({ kind: 'capsule', x0: width / 2, y0: height / 2, x1: width / 2 + Math.cos(angle) * reach, y1: height / 2 + Math.sin(angle) * reach, width: Math.max(1, short * 0.0025), color, opacity: 0.8 });
      } else if (set === 'grid') {
        const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
        const rows = Math.max(2, Math.ceil(count / cols));
        const gx = Math.floor(i % cols);
        const gy = Math.floor(i / cols);
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * speed * 2 + (gx + gy) * 0.8);
        shapes.push({ kind: 'circle', x: width * 0.15 + ((width * 0.7) / (cols - 1 || 1)) * gx, y: height * 0.2 + ((height * 0.6) / (rows - 1 || 1)) * gy, r: short * (0.006 + 0.008 * pulse), color, opacity: 0.5 + 0.5 * pulse });
      } else if (set === 'orbit') {
        const radius = short * (0.08 + rr * 0.18);
        const angle = ctx.time * speed * (0.4 + rr) + rr * TAU;
        shapes.push({ kind: 'circle', x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, r: short * (0.008 + rr * 0.012), color, opacity: 0.85 });
      }
    }
    return { shapes, texts: [] };
  }

  // Animated background patterns (grid / dots / stripes / rings / triangles /
  // diamonds / hexes / rain / checks / polka / sineCurve / waves / randomFill).
  // Every mode moves, and `size` drives the drawn element in every mode (tile
  // fill, dot radius, stripe duty, ring thickness, polygon radius, rain drop
  // length, checker fill, sine amplitude / ribbon thickness, mosaic tile size)
  // so a size step alone reads as another backdrop pattern; `count` drives how
  // many elements there are. pattern-variants.js enumerates the steps that are
  // far enough apart to be told apart and never picks a static speed.
  function shapeCenter(shape) {
    if (shape.kind === 'rect') return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
    if (shape.kind === 'capsule') return { x: (shape.x0 + shape.x1) / 2, y: (shape.y0 + shape.y1) / 2 };
    return { x: shape.x, y: shape.y };
  }

  // Knock-outs (`params.hole`): drop the elements that fall inside a region so
  // the same pattern reads differently - a clear middle for the lyrics, a clear
  // band, a checkered thinning or a seeded scatter of missing cells. `holeSize`
  // (0.1..0.9) is the share of the frame the hole takes.
  const HOLES = ['none', 'center', 'band', 'sides', 'corners', 'diagonal', 'thin', 'scatter'];

  function applyHole(list, params, ctx) {
    const hole = params.hole;
    if (!hole || hole === 'none' || !list.shapes.length) return list;
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const amount = Math.max(0.1, Math.min(0.9, num(params.holeSize, 0.4)));
    const seeds = seededRandom(hashString(`${(ctx.clip && ctx.clip.key) || 'hole'}|${hole}|${amount}`));
    const cut = (shape, index) => {
      const c = shapeCenter(shape);
      const nx = c.x / width - 0.5;
      const ny = c.y / height - 0.5;
      if (hole === 'center') return (nx / (amount * 0.9)) ** 2 + (ny / amount) ** 2 < 0.25;
      if (hole === 'band') return Math.abs(ny) < amount * 0.35;
      if (hole === 'sides') return Math.abs(nx) > 0.5 - amount * 0.35;
      if (hole === 'corners') return Math.abs(nx) > 0.5 - amount * 0.4 && Math.abs(ny) > 0.5 - amount * 0.4;
      if (hole === 'diagonal') return Math.abs(nx * height - ny * width * 0.6) < amount * 0.3 * width * 0.5;
      if (hole === 'thin') return index % Math.max(2, Math.round(1 / amount)) === 0;
      if (hole === 'scatter') return seeds() < amount * 0.8;
      return false;
    };
    return { ...list, shapes: list.shapes.filter((shape, index) => !cut(shape, index)) };
  }

  // A second colour for part of the elements (`params.accent` + `accentEvery`):
  // every n-th element takes it, so one backdrop carries two tones.
  function applyAccent(list, params) {
    const accent = params.accent;
    if (!accent) return list;
    const every = Math.max(2, Math.round(num(params.accentEvery, 5)));
    list.shapes.forEach((shape, index) => {
      if (index % every !== 0) return;
      shape.color = accent;
      if (shape.strokeColor) shape.strokeColor = accent;
    });
    return list;
  }

  function patternShapes(params, ctx) {
    return applyAccent(applyHole(patternBase(params, ctx), params, ctx), params);
  }

  function patternBase(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#8d96ab');
    const mode = params.mode || 'grid';
    const count = Math.max(4, Math.min(120, Math.round(num(params.count, 24))));
    const scale = Math.max(0.2, Math.min(3, num(params.size, 1)));
    const size = scale * (height / 1080);
    const speed = num(params.speed, 0.4);
    const opacity = num(params.opacity, 0.5);
    const shapes = [];
    const short = Math.min(width, height);
    if (mode === 'stripes') {
      // the duty cycle grows with size, so the bars thicken without ever
      // merging into a solid field (which would erase the size difference)
      const gap = (width * 1.2) / count;
      const duty = Math.max(0.06, Math.min(0.7, 0.06 + 0.2 * scale));
      const bar = Math.max(1, gap * duty);
      for (let i = 0; i < count; i += 1) {
        const phase = ((ctx.time * speed * 0.1 + i / count) % 1 + 1) % 1;
        shapes.push({ kind: 'rect', x: phase * width * 1.2 - width * 0.1, y: 0, w: bar, h: height, radius: bar / 2, color, opacity: opacity * (0.45 + 0.55 * ((i % 3) / 2)) });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'dots') {
      const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
      const rows = Math.max(2, Math.ceil(count / cols));
      for (let i = 0; i < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * speed * 2 + (gx - gy) * 0.6);
        shapes.push({
          kind: 'circle',
          x: (width * (gx + 0.5)) / cols,
          y: (height * (gy + 0.5)) / rows,
          r: short * 0.004 * size * (0.6 + 0.9 * pulse),
          color,
          opacity: opacity * (0.4 + 0.6 * pulse),
        });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'rings') {
      for (let i = 0; i < count; i += 1) {
        const phase = ((ctx.time * speed * 0.25 + i / count) % 1 + 1) % 1;
        shapes.push({ kind: 'ring', x: width / 2, y: height / 2, r: phase * short * 0.7, thickness: Math.max(1, short * 0.002 * size), color, opacity: opacity * (0.5 + 0.5 * (1 - phase)) });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'triangles' || mode === 'diamonds' || mode === 'hexes') {
      // a grid of regular polygons; the radius grows with the size step
      const sides = mode === 'triangles' ? 3 : mode === 'diamonds' ? 4 : 6;
      const base = mode === 'triangles' ? 0.011 : mode === 'diamonds' ? 0.01 : 0.0095;
      const spin = mode === 'diamonds' ? 45 : mode === 'hexes' ? 30 : 0;
      const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
      const rows = Math.max(2, Math.ceil(count / cols));
      for (let i = 0; i < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * speed * 1.4 + (gx + gy) * 0.7);
        shapes.push({
          kind: 'polygon',
          x: (width * (gx + 0.5)) / cols,
          y: (height * (gy + 0.5)) / rows,
          r: short * base * size * (0.7 + 0.5 * pulse),
          sides,
          rotation: spin + ctx.time * speed * 14 * (i % 2 ? 1 : -1),
          color,
          opacity: opacity * (0.4 + 0.6 * pulse),
        });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'rain') {
      // falling streaks: count is the number of drops, size their length
      const len = short * 0.05 * size;
      const thickness = Math.max(1, short * 0.0016 * size);
      const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
      const rows = Math.max(2, Math.ceil(count / cols));
      for (let i = 0; i < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        const travel = ((ctx.time * (0.05 + speed * 0.12) + i / count + (gy % 3) * 0.21) % 1 + 1) % 1;
        const x = (width * (gx + 0.5)) / cols;
        const y = travel * (height + len) - len;
        shapes.push({ kind: 'capsule', x0: x, y0: y, x1: x, y1: y + len, width: thickness, color, opacity: opacity * (0.35 + 0.65 * (1 - travel)) });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'checks') {
      // checkerboard: `count` tiles on alternate cells, brightness travelling
      const cells = Math.max(4, count * 2);
      const cols = Math.max(2, Math.round(Math.sqrt(cells * (width / height))));
      const rows = Math.max(2, Math.ceil(cells / cols));
      const fill = Math.max(0.1, Math.min(0.98, scale <= 1 ? 0.7 * Math.sqrt(scale) : 0.7 + (0.2 * (scale - 1)) / 2));
      const cellW = width / cols;
      const cellH = height / rows;
      let drawn = 0;
      for (let i = 0; i < cols * rows && drawn < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        if ((gx + gy) % 2 !== 0) continue;
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * speed * 1.7 + (gx + gy) * 0.55);
        shapes.push({
          kind: 'rect',
          x: gx * cellW + cellW * (1 - fill) * 0.5,
          y: gy * cellH + cellH * (1 - fill) * 0.5,
          w: cellW * fill,
          h: cellH * fill,
          radius: Math.min(cellW, cellH) * fill * 0.1,
          color,
          opacity: opacity * (0.25 + 0.75 * pulse),
        });
        drawn += 1;
      }
      return { shapes, texts: [] };
    }
    if (mode === 'polka') {
      // staggered polka dots scrolling sideways; size sets the dot radius
      const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
      const rows = Math.max(2, Math.ceil(count / cols));
      const radius = short * 0.006 * size;
      const drift = ctx.time * (0.03 + speed * 0.05);
      for (let i = 0; i < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        const x = ((((gx + 0.5 + (gy % 2) * 0.5) / cols + drift) % 1) + 1) % 1 * width;
        const pulse = 0.85 + 0.15 * Math.sin(ctx.time * speed * 1.8 + (gx + gy) * 0.5);
        shapes.push({ kind: 'circle', x, y: (height * (gy + 0.5)) / rows, r: radius * pulse, color, opacity: opacity * (0.55 + 0.45 * pulse) });
      }
      return { shapes, texts: [] };
    }
    if (mode === 'sineCurve' || mode === 'waves') {
      // stacked sine lines (sineCurve) or thick travelling ribbons (waves)
      const band = mode === 'waves';
      const segments = 32;
      const amp = short * (band ? 0.045 : 0.035) * size;
      const thickness = band ? Math.max(2, (height / count) * 0.42) : Math.max(1, short * 0.0016 * size);
      const freq = band ? 1.5 : 2.5;
      for (let i = 0; i < count; i += 1) {
        const lineY = (height * (i + 0.5)) / count;
        const phase = ctx.time * (0.3 + speed * 0.5) + i * 0.7;
        const lineOpacity = opacity * (0.35 + 0.65 * (1 - i / Math.max(1, count - 1)));
        for (let s = 0; s < segments; s += 1) {
          const x0 = (width * s) / segments;
          const x1 = (width * (s + 1)) / segments;
          shapes.push({
            kind: 'capsule',
            x0,
            y0: lineY + Math.sin(phase + (s / segments) * TAU * freq) * amp,
            x1,
            y1: lineY + Math.sin(phase + ((s + 1) / segments) * TAU * freq) * amp,
            width: thickness,
            color,
            opacity: lineOpacity,
          });
        }
      }
      return { shapes, texts: [] };
    }
    if (mode === 'randomFill') {
      // seeded mosaic: every cell fades in and out on its own phase, so the
      // filled look keeps changing while the tiles stay put
      const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
      const rows = Math.max(2, Math.ceil(count / cols));
      const fill = Math.max(0.1, Math.min(0.98, scale <= 1 ? 0.7 * Math.sqrt(scale) : 0.7 + (0.2 * (scale - 1)) / 2));
      const cellW = width / cols;
      const cellH = height / rows;
      const seeds = seededRandom(hashString(`${(ctx.clip && ctx.clip.key) || 'randomFill'}|${count}|${scale}`));
      const threshold = 0.35;
      for (let i = 0; i < count; i += 1) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        const base = seeds();
        const phase = seeds() * TAU;
        const amount = 0.5 + 0.5 * Math.sin(ctx.time * speed * (0.4 + base * 1.2) + phase);
        if (amount < threshold) continue;
        const grow = (amount - threshold) / (1 - threshold);
        shapes.push({
          kind: 'rect',
          x: gx * cellW + cellW * (1 - fill * grow) * 0.5,
          y: gy * cellH + cellH * (1 - fill * grow) * 0.5,
          w: cellW * fill * grow,
          h: cellH * fill * grow,
          radius: Math.min(cellW, cellH) * fill * grow * 0.12,
          color,
          opacity: opacity * (0.25 + 0.75 * grow),
        });
      }
      return { shapes, texts: [] };
    }
    // grid: size scales the tile inside its cell (0.34x at 0.2 up to 0.95x at 3)
    const fill = Math.max(0.1, Math.min(0.98, scale <= 1 ? 0.76 * Math.sqrt(scale) : 0.76 + (0.19 * (scale - 1)) / 2));
    const cols = Math.max(2, Math.round(Math.sqrt(count * (width / height))));
    const rows = Math.max(2, Math.ceil(count / cols));
    const cellW = width / cols;
    const cellH = height / rows;
    for (let i = 0; i < count; i += 1) {
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const pulse = 0.5 + 0.5 * Math.sin(ctx.time * speed * 1.6 + (gx + gy) * 0.7);
      shapes.push({
        kind: 'rect',
        x: gx * cellW + cellW * (1 - fill) * 0.5,
        y: gy * cellH + cellH * (1 - fill) * 0.5,
        w: cellW * fill,
        h: cellH * fill,
        radius: Math.min(cellW, cellH) * fill * 0.16,
        color,
        opacity: opacity * (0.3 + 0.7 * pulse),
      });
    }
    return { shapes, texts: [] };
  }

  function particlesShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#d6dbe9');
    const count = Math.max(1, Math.min(120, Math.round(num(params.count, 24))));
    const size = Math.max(0.5, num(params.size, 2.4)) * (height / 1080);
    const flow = params.flow || 'rise';
    const rng = seededRandom(hashString(ctx.clip.key) ^ 0x51ed);
    const shapes = [];
    for (let i = 0; i < count; i += 1) {
      const rx = rng();
      const ry = rng();
      const speed = 0.04 + rx * 0.08;
      let x = rx * width;
      let y = ry * height;
      if (flow === 'rise') y = ((ry + ctx.time * speed) % 1) * height;
      else if (flow === 'fall') y = (1 - ((ry + ctx.time * speed) % 1)) * height;
      else if (flow === 'drift') x = ((rx + ctx.time * speed * 0.5) % 1) * width;
      else {
        const angle = ry * TAU + ctx.time * speed;
        const radius = (0.05 + rx * 0.4) * Math.min(width, height);
        x = width / 2 + Math.cos(angle) * radius;
        y = height / 2 + Math.sin(angle) * radius;
      }
      shapes.push({ kind: 'circle', x, y, r: size * (0.5 + ry), color, opacity: 0.25 + rx * 0.5 });
    }
    return { shapes, texts: [] };
  }

  function progressShapes(params, ctx) {
    const width = ctx.frame.width;
    const height = ctx.frame.height;
    const color = colorOf(params, ctx, '#ffd166');
    const progress = clamp01(num(ctx.progress, 0));
    const style = params.style || 'bar';
    const position = params.position || 'bottom';
    const shapes = [];
    if (style === 'ring') {
      const r = height * 0.05;
      const x = position === 'top' ? width - r * 2 : width - r * 2;
      const y = position === 'top' ? r * 2 : height - r * 2;
      shapes.push({ kind: 'ring', x, y, r, thickness: height * 0.006, color, opacity: 0.25 });
      arcShapes(shapes, { x, y, r, from: -Math.PI / 2, to: -Math.PI / 2 + TAU * progress, thickness: height * 0.006, color, opacity: 0.9 });
      return { shapes, texts: [] };
    }
    const w = width * 0.86;
    const x = (width - w) / 2;
    const y = position === 'top' ? height * 0.03 : height * 0.94;
    shapes.push({ kind: 'rect', x, y, w, h: height * 0.006, radius: height * 0.003, color, opacity: 0.25 });
    shapes.push({ kind: 'rect', x, y, w: w * progress, h: height * 0.006, radius: height * 0.003, color, opacity: 0.95 });
    return { shapes, texts: [] };
  }

  function textOnly(spec, ctx, options) {
    const params = spec.params || {};
    const text = options.text || '';
    if (!text) return { shapes: [], texts: [] };
    return {
      shapes: [],
      texts: [
        {
          text,
          x: options.x == null ? ctx.frame.width * (options.xRatio == null ? 0.5 : options.xRatio) : options.x,
          y: options.y == null ? ctx.frame.height * (options.yRatio == null ? 0.5 : options.yRatio) : options.y,
          size: options.sizeRatio * ctx.frame.height,
          color: colorOf(params, ctx, options.color || '#eef2ff'),
          opacity: options.opacity == null ? 1 : options.opacity,
        },
      ],
    };
  }

  // Token expansion for text layers: {title} / {artist} come from the project
  // credits, {next} / {prev} from the neighbouring lyric line.
  function expandTokens(text, ctx) {
    const meta = (ctx && ctx.meta) || {};
    return String(text == null ? '' : text)
      .replace(/\{title\}/g, meta.title == null ? '' : String(meta.title))
      .replace(/\{artist\}/g, meta.artist == null ? '' : String(meta.artist))
      .replace(/\{next\}/g, (ctx && ctx.nextText) || '')
      .replace(/\{prev\}/g, (ctx && ctx.prevText) || '');
  }

  // The editable layer stack behind a filler spec: a combo is its list, `none`
  // has no layers, every other type is a stack of one.
  function layersOf(spec) {
    const source = spec || {};
    if (source.type === 'combo') {
      const list = source.params && source.params.list;
      return Array.isArray(list) ? list : [];
    }
    if (!source.type || source.type === 'none') return [];
    return [source];
  }

  // Rebuilds a spec from a layer list. 0 layers -> none, 1 -> the layer itself,
  // more -> a combo. presetId / name metadata lands on the outer spec.
  function fromLayers(list, meta) {
    const layers = Array.isArray(list) ? list.filter(Boolean) : [];
    const spec =
      layers.length === 0
        ? { type: 'none', params: {} }
        : layers.length === 1
          ? JSON.parse(JSON.stringify(layers[0]))
          : { type: 'combo', params: { list: layers.map((layer) => JSON.parse(JSON.stringify(layer))) } };
    if (meta && meta.presetId) spec.presetId = meta.presetId;
    if (meta && meta.name) spec.name = meta.name;
    return spec;
  }

  // Validates a stored / imported filler spec: known primitive types only,
  // combo nesting at most 2 deep and at most 8 layers in total.
  function validate(spec) {
    const errors = [];
    const known = new Set(TYPE_ORDER);
    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        errors.push('invalid layer');
        return 0;
      }
      if (!known.has(node.type)) {
        errors.push(`unknown type: ${String(node.type)}`);
        return 0;
      }
      if (!node.params || typeof node.params !== 'object' || Array.isArray(node.params)) {
        errors.push(`invalid params: ${node.type}`);
        return 0;
      }
      if (node.type !== 'combo') return 1;
      if (depth > 2) {
        errors.push('combo nesting too deep');
        return 1;
      }
      const list = node.params.list;
      if (!Array.isArray(list)) {
        errors.push('combo list must be an array');
        return 1;
      }
      let total = 0;
      for (const child of list) total += walk(child, depth + 1);
      return total;
    };
    const layers = walk(spec, 1);
    if (layers > 8) errors.push('too many layers');
    return { ok: errors.length === 0, errors };
  }

  function comboParts(spec, ctx) {
    const list = (spec.params && spec.params.list) || [];
    const shapes = [];
    const texts = [];
    const textAnims = [];
    for (const part of list) {
      const result = drawList(part, ctx);
      shapes.push(...result.shapes);
      texts.push(...result.texts);
      if (result.textAnims) textAnims.push(...result.textAnims);
    }
    return { shapes, texts, textAnims };
  }

  // The figures clip type: the same motif library the figure track uses, with
  // the params carrying the generated figure (or generated here for an empty
  // hand-made gap clip).
  function figuresShapes(params, ctx) {
    if (params && (params.disabled || params.enabled === false)) return { shapes: [], texts: [] };
    if (!figures || typeof figures.drawList !== 'function') return { shapes: [], texts: [] };
    // an empty hand-made clip gets its sub-beats generated in drawList from the
    // context (the clip's own from / to or start / end); pass every tuning
    // param through
    const source = params && params.beats && params.beats.length ? params : { ...(params || {}), beats: [] };
    const list = figures.drawList({ type: 'figure', params: source }, ctx);
    // an optional clip-level opacity lets a figure sit quiet behind the lyrics
    const quiet = params && params.opacity != null ? clamp01(num(params.opacity, 1)) : 1;
    if (quiet < 1 && list && Array.isArray(list.shapes)) {
      for (const shape of list.shapes) shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * quiet;
    }
    return list;
  }

  // The painted colour planes (item 9). Only the painted regions are drawn: the
  // rest of the frame shows the background through, and at coverage 1 the whole
  // frame is covered.
  function darkenHex(hex, amount) {
    const match = /^#([0-9a-f]{6})/i.exec(String(hex || ''));
    if (!match) return hex;
    const value = parseInt(match[1], 16);
    const mix = (channel) => Math.max(0, Math.min(255, Math.round(channel * (1 - amount))));
    const out = (mix((value >> 16) & 255) << 16) | (mix((value >> 8) & 255) << 8) | mix(value & 255);
    return `#${out.toString(16).padStart(6, '0')}`;
  }

  function splitShapes(params, ctx) {
    if (!split || typeof split.regions !== 'function') return { shapes: [], texts: [] };
    const frame = ctx.frame || { width: 1920, height: 1080 };
    const bpm = num(ctx.bpm, 0);
    const beatPhase = ctx.beatPhase != null ? num(ctx.beatPhase, 0) : bpm > 0 ? (((num(ctx.time, 0) * bpm) / 60) % 1 + 1) % 1 : 0;
    const regions = split.regions(
      {
        layout: params.layout,
        parts: params.parts,
        angle: params.angle,
        offset: params.offset,
        coverage: params.coverage,
        motion: params.motion,
        speed: params.speed,
        amp: params.amp,
        colors: Array.isArray(params.colors) ? params.colors : ctx.colors || null,
        cuts: Array.isArray(params.cuts) ? params.cuts : null,
      },
      {
        frame,
        time: ctx.time,
        progress: ctx.progress,
        beatPhase,
        seed: ctx.seed,
        clipKey: ctx.clip && ctx.clip.key,
      }
    );
    const opacity = params.opacity == null ? 1 : num(params.opacity, 1);
    const shapes = [];
    // `depth` (optional, 0 = flat) lifts each plane above the one under it: a
    // soft drop shadow offset down-right and a slightly darker inset panel
    const depth = clamp01(num(params.depth, 0));
    const short = Math.min(frame.width, frame.height);
    let layer = 0;
    for (const region of regions) {
      if (!region.painted) continue;
      if (depth > 0 && layer > 0) {
        const offset = short * 0.014 * depth;
        shapes.push({
          kind: 'convex',
          points: region.points.map((point) => ({ x: point.x + offset, y: point.y + offset * 1.4 })),
          color: '#000000',
          opacity: opacity * 0.3 * depth,
          plane: true,
        });
      }
      // `plane: true` marks the split planes: the engine keeps them whole when
      // it knocks the accent layer out under the subtitle glyphs
      shapes.push({ kind: 'convex', points: region.points, color: region.color, opacity, plane: true });
      if (depth > 0 && region.points.length >= 3) {
        const cx = region.points.reduce((sum, point) => sum + point.x, 0) / region.points.length;
        const cy = region.points.reduce((sum, point) => sum + point.y, 0) / region.points.length;
        const inset = 1 - 0.07 * depth;
        shapes.push({
          kind: 'convex',
          points: region.points.map((point) => ({ x: cx + (point.x - cx) * inset, y: cy + (point.y - cy) * inset })),
          color: darkenHex(region.color, 0.06 * depth),
          opacity,
          plane: true,
        });
      }
      layer += 1;
    }
    return { shapes, texts: [] };
  }

  // Clip-level animation: a beat pulse, a drift and an enter / exit transition
  // (wipe / scale / rotate / iris / slide / stagger) over the first and last
  // 0.35 s. The one-way `travel` / `zoom` / `tilt` modes read the clip's own
  // progress instead of the beat sine.
  function animate(list, options) {
    const opts = options || {};
    const shapes = list && Array.isArray(list.shapes) ? list.shapes : [];
    const motion = opts.motion;
    if (!motion || !shapes.length) return list;
    const clip = opts.clip || {};
    const start = num(clip.start, 0);
    const end = num(clip.end, start + 1);
    const time = num(opts.t, start);
    const duration = Math.max(1e-3, end - start);
    const span = Math.min(Math.max(0.05, num(motion.duration, 0.35)), duration * 0.25);
    const enter = clamp01((time - start) / span);
    const leave = clamp01((end - time) / span);
    const env = Math.min(enter, leave);
    const adsr = opts.adsr && adsrApi ? adsrApi.def(opts.adsr, duration) : null;
    const adsrLevel = adsr ? adsrApi.clipLevel(opts.adsr, time, start, end, clip.fadeIn, clip.fadeOut) : null;
    const bpm = num(opts.bpm, 0) || 120;
    const beat = 60 / bpm;
    const beats = (time - start) / beat;
    const frame = opts.frame || { width: 1920, height: 1080 };
    const short = Math.min(frame.width, frame.height);
    // the beat motion: `pulse` (the legacy default) swells on every beat;
    // `accent` hits on the downbeat of every `every` beats and decays;
    // `swell` breathes over `every` beats; `sway` rocks instead of scaling;
    // `drift` floats; `travel` pans across the clip; `zoom` is a Ken Burns
    // push; `tilt` turns slowly; `still` keeps only the planes' own motion
    const mode = motion.mode || 'pulse';
    const every = Math.max(1, num(motion.every, mode === 'accent' ? 4 : 8));
    const group = (((beats / every) % 1) + 1) % 1;
    let amount = num(motion.pulse, 0);
    const progress = clamp01((time - start) / duration);
    let pulse = 1;
    let sway = 0;
    let tilt = 0;
    let travelX = 0;
    let travelY = 0;
    let driftAmount = num(motion.drift, 0);
    if (adsrLevel != null) {
      amount *= adsrLevel;
      driftAmount *= adsrLevel;
    }
    if (mode === 'pulse') pulse = 1 + amount * Math.sin(TAU * beats);
    else if (mode === 'accent') pulse = 1 + amount * 1.6 * Math.exp(-group * every * 3.5);
    else if (mode === 'swell') pulse = 1 + amount * 1.2 * (0.5 - 0.5 * Math.cos(TAU * group));
    else if (mode === 'sway') sway = num(motion.sway, 0.03) * Math.sin(TAU * group) * (adsrLevel != null ? adsrLevel : 1);
    else if (mode === 'travel') {
      // a slow one-way pan; the clip is scaled past the frame so the moving
      // corner never shows the empty stage
      const dir = motion.dir || 'right';
      const distance = num(motion.travel, 0.06) * short * (progress - 0.5);
      if (dir === 'left') travelX = -distance;
      else if (dir === 'right') travelX = distance;
      else if (dir === 'up') travelY = -distance;
      else travelY = distance;
    } else if (mode === 'zoom') {
      pulse = 1 + num(motion.zoom, 0.12) * progress;
    } else if (mode === 'tilt') {
      tilt = num(motion.tilt, 0.02) * (2 * progress - 1) * (adsrLevel != null ? adsrLevel : 1);
    }
    // text kicks: every `kicks` time (a cue start or a rhythm cut) adds a short
    // decaying bounce on top of the mode, so the mid layer answers the lyrics.
    // `sync` is absent on saved clips, which keeps their draw unchanged.
    let kick = 0;
    const sync = num(motion.sync, 0);
    if (sync > 0 && Array.isArray(opts.kicks)) {
      for (const at of opts.kicks) {
        const dt = time - num(at, 0);
        if (dt < 0) continue;
        const decay = Math.exp(-dt * 6);
        if (decay > kick) kick = decay;
      }
    }
    let kickPulse = sync * kick;
    if (adsrLevel != null) kickPulse *= adsrLevel;
    pulse += kickPulse;
    // drift is a share of the short side here (the legacy pulse drift stays
    // in its raw units so saved clips keep their look)
    if (mode === 'drift' || mode === 'still') driftAmount *= short * (mode === 'still' ? 0.4 : 1);
    const dx = driftAmount * Math.sin(TAU * 0.17 * (time - start)) + travelX;
    const dy = driftAmount * 0.6 * Math.sin(TAU * 0.23 * (time - start) + 1.3) + travelY;
    // full-frame planes must not show their corners while they rock, drift,
    // pan or turn
    const cover =
      1 +
      1.8 * Math.abs(num(motion.sway, 0.03) * (mode === 'sway' ? 1 : 0)) +
      (mode === 'drift' || mode === 'still' ? (2.2 * Math.abs(driftAmount)) / short : 0) +
      (mode === 'travel' ? 2.2 * Math.abs(num(motion.travel, 0.06)) : 0) +
      (mode === 'tilt' ? 1.8 * Math.abs(num(motion.tilt, 0.02)) : 0);
    if (adsr && adsrLevel != null && adsrLevel > 0) {
      pulse *= 1 + adsr.punch * Math.max(0, adsrLevel - adsr.sustain);
    }
    const kind = motion.transition || 'scale';
    // a `cut` has no enter / exit transition: the clip is simply on. `slide`
    // carries the transition as an offset, so it keeps its full size.
    const env2 = kind === 'cut' ? 1 : env;
    const originX = kind === 'wipe' ? 0 : frame.width / 2;
    const originY = frame.height / 2;
    const dirName = motion.dir || 'right';
    const slideX = kind === 'slide' ? (dirName === 'left' ? -1 : dirName === 'right' ? 1 : 0) * (1 - env2) * frame.width : 0;
    const slideY = kind === 'slide' ? (dirName === 'up' ? -1 : dirName === 'down' ? 1 : 0) * (1 - env2) * frame.height : 0;
    // the point mapping lives in figures so a figure's own scale / x / y can
    // reuse it; filler-render always has figures available
    if (kind === 'stagger' && figures && typeof figures.transformShapes === 'function') {
      // one shape after another: every shape eases in on its own slice of the
      // transition window (the kick-rotation shape loop's sibling)
      const step = span / Math.max(1, shapes.length);
      for (let i = 0; i < shapes.length; i += 1) {
        const shape = shapes[i];
        if (!shape) continue;
        const shapeEnv = Math.min(clamp01((time - start - i * step) / span), leave);
        const shapeScale = Math.max(0.001, pulse * cover * (shapeEnv === 0 ? 0.001 : shapeEnv));
        figures.transformShapes([shape], { originX, originY, scale: shapeScale, dx, dy, rotate: sway + tilt });
        shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * clamp01(shapeEnv * 1.5);
      }
    } else {
      const transitionScale = kind === 'rotate' ? Math.max(0.05, env2) : kind === 'cut' || kind === 'slide' ? 1 : env2 === 0 ? 0.001 : env2;
      const scale = Math.max(0.001, pulse * cover * transitionScale);
      const rotate = (kind === 'rotate' ? (1 - env2) * (Math.PI / 4) : 0) + sway + tilt;
      if ((kind === 'wipe' || rotate || scale !== 1 || dx || dy || slideX || slideY) && figures && typeof figures.transformShapes === 'function') {
        figures.transformShapes(shapes, { originX, originY, scale, dx: dx + slideX, dy: dy + slideY, rotate });
      }
    }
    // the kick also shakes the planes apart: neighbouring planes rotate a hair
    // in opposite directions so the backdrop flashes with the text
    if (kickPulse > 0 && figures && typeof figures.transformShapes === 'function') {
      const spin = 0.6 * kickPulse;
      for (let i = 0; i < shapes.length; i += 1) {
        if (!shapes[i]) continue;
        figures.transformShapes([shapes[i]], { originX, originY, scale: 1, dx: 0, dy: 0, rotate: (i % 2 === 0 ? 1 : -1) * spin });
      }
    }
    for (const shape of shapes) {
      if (!shape) continue;
      if (kind === 'stagger') continue; // the per-shape pass already faded it
      const fade = kind === 'scale' || kind === 'iris' ? clamp01(env * 1.5) : 1;
      shape.opacity = (shape.opacity == null ? 1 : shape.opacity) * fade;
    }
    return list;
  }

  const LAYER_OF = {
    figures: 'foreground', shapes: 'foreground', waveform: 'foreground', spectrum: 'foreground',
    countdown: 'foreground', progress: 'foreground',
    instrumental: 'foreground', nextLinePreview: 'foreground', previousLineGhost: 'foreground',
    split: 'background', pattern: 'background', particles: 'background', sineWave: 'background',
  };

  function layerOf(type) {
    return LAYER_OF[type] || null;
  }

  function drawList(spec, ctx) {
    const source = spec || { type: 'none', params: {} };
    const type = source.type || 'none';
    const params = source.params || {};
    if (type === 'none') return { shapes: [], texts: [] };
    const layer = layerOf(type);
    if (layer && ctx && ctx.layers && ctx.layers[layer] === false) return { shapes: [], texts: [] };
    if (type === 'countdown') return countdownShapes(params, ctx);
    if (type === 'waveform') return waveformShapes(params, ctx);
    if (type === 'spectrum') return spectrumShapes(params, ctx);
    if (type === 'sineWave') return sineWaveShapes(params, ctx);
    if (type === 'shapes') return shapesShapes(params, ctx);
    if (type === 'pattern') return patternShapes(params, ctx);
    if (type === 'particles') return particlesShapes(params, ctx);
    if (type === 'split') return splitShapes(params, ctx);
    if (type === 'figures') return figuresShapes(params, ctx);
    if (type === 'progress') return progressShapes(params, ctx);
    if (type === 'instrumental') {
      return textOnly(source, ctx, { text: expandTokens(params.text || '♪ Instrumental ♪', ctx), sizeRatio: num(params.size, 0.05), color: colorOf(params, ctx, '#cbd3ff') });
    }
    if (type === 'nextLinePreview') {
      return textOnly(source, ctx, { text: ctx.nextText || '', sizeRatio: 0.055, yRatio: 0.72, opacity: num(params.opacity, 0.35), color: colorOf(params, ctx, '#cbd3ff') });
    }
    if (type === 'previousLineGhost') {
      return textOnly(source, ctx, { text: ctx.prevText || '', sizeRatio: 0.06, yRatio: 0.28, opacity: num(params.opacity, 0.25), color: colorOf(params, ctx, '#cbd3ff') });
    }
    if (type === 'credits') return { shapes: [], texts: [] };
    if (type === 'cardPeek') return { shapes: [], texts: [] };
    if (type === 'textAnim') {
      // the animated text is rendered by the engine (the text track pipeline);
      // this pass only hands the params over
      return { shapes: [], texts: [], textAnims: [{ params: { ...params } }] };
    }
    if (type === 'combo') return comboParts(source, ctx);
    return { shapes: [], texts: [] };
  }

  const TYPE_ORDER = ['none', 'countdown', 'waveform', 'spectrum', 'sineWave', 'shapes', 'pattern', 'particles', 'split', 'figures', 'nextLinePreview', 'previousLineGhost', 'progress', 'credits', 'cardPeek', 'instrumental', 'textAnim', 'combo'];

  const PARAMS = {
    none: [],
    countdown: [
      { key: 'style', kind: 'select', options: ['digits', 'ring', 'bar', 'dots'], default: 'digits' },
      { key: 'from', kind: 'number', min: 0.2, max: 30, step: 0.5, default: 3 },
      { key: 'showOnlyLast', kind: 'bool', default: false },
    ],
    waveform: [
      { key: 'mode', kind: 'select', options: ['line', 'mirror', 'circle'], default: 'line' },
      { key: 'thickness', kind: 'number', min: 0.5, max: 12, step: 0.5, default: 2.5 },
      { key: 'amp', kind: 'number', min: 0.2, max: 3, step: 0.1, default: 1 },
      { key: 'color', kind: 'color', default: '#4dc8ff' },
    ],
    spectrum: [
      { key: 'mode', kind: 'select', options: ['bars', 'radial', 'blob'], default: 'bars' },
      { key: 'bars', kind: 'int', min: 8, max: 128, step: 1, default: 48 },
      { key: 'falloff', kind: 'number', min: 0.05, max: 3, step: 0.05, default: 1 },
      { key: 'color', kind: 'color', default: '#7ce0a4' },
    ],
    sineWave: [
      { key: 'waves', kind: 'int', min: 1, max: 5, step: 1, default: 2 },
      { key: 'amp', kind: 'number', min: 0.1, max: 3, step: 0.1, default: 1 },
      { key: 'speed', kind: 'number', min: 0, max: 4, step: 0.1, default: 1 },
      { key: 'color', kind: 'color', default: '#9db2ff' },
    ],
    shapes: [
      { key: 'set', kind: 'select', options: ['circles', 'polygons', 'lines', 'burst', 'grid', 'orbit'], default: 'circles' },
      { key: 'count', kind: 'int', min: 1, max: 48, step: 1, default: 8 },
      { key: 'speed', kind: 'number', min: 0, max: 4, step: 0.1, default: 1 },
      { key: 'color', kind: 'color', default: '#ff8a3d' },
    ],
    pattern: [
      { key: 'mode', kind: 'select', options: ['grid', 'dots', 'stripes', 'rings', 'triangles', 'diamonds', 'hexes', 'rain', 'checks', 'polka', 'sineCurve', 'waves', 'randomFill'], default: 'grid' },
      { key: 'count', kind: 'int', min: 4, max: 120, step: 1, default: 24 },
      { key: 'size', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
      { key: 'speed', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.4 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 0.6 },
      { key: 'color', kind: 'color', default: '#8d96ab' },
      { key: 'hole', kind: 'select', options: HOLES, default: 'none' },
      { key: 'holeSize', kind: 'number', min: 0.1, max: 0.9, step: 0.05, default: 0.4 },
      { key: 'accent', kind: 'color', default: '' },
      { key: 'accentEvery', kind: 'int', min: 2, max: 12, step: 1, default: 5 },
    ],
    particles: [
      { key: 'count', kind: 'int', min: 1, max: 120, step: 1, default: 24 },
      { key: 'flow', kind: 'select', options: ['rise', 'fall', 'drift', 'vortex'], default: 'rise' },
      { key: 'size', kind: 'number', min: 0.5, max: 12, step: 0.1, default: 2.4 },
      { key: 'color', kind: 'color', default: '#d6dbe9' },
    ],
    split: [
      { key: 'layout', kind: 'select', options: ['halves', 'diagonal', 'thirds', 'bands', 'quads', 'grid', 'chevron', 'radial', 'mondrian', 'frame', 'shards'], default: 'halves' },
      { key: 'parts', kind: 'int', min: 2, max: 8, step: 1, default: 3 },
      { key: 'angle', kind: 'number', min: -90, max: 90, step: 1, default: 0 },
      { key: 'offset', kind: 'number', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'coverage', kind: 'number', min: 0.02, max: 1, step: 0.01, default: 0.6 },
      { key: 'scheme', kind: 'select', options: ['tonal', 'analogous', 'complementary', 'triad', 'splitComplementary', 'neutralAccent'], default: 'tonal' },
      { key: 'motion', kind: 'select', options: ['none', 'slide', 'rotate', 'breathe', 'swap', 'drift', 'push', 'sweep', 'turn', 'zoom', 'step'], default: 'none' },
      { key: 'speed', kind: 'number', min: 0, max: 3, step: 0.05, default: 0.4 },
      { key: 'amp', kind: 'number', min: 0, max: 0.4, step: 0.005, default: 0.05 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 1 },
      { key: 'depth', kind: 'number', min: 0, max: 1, step: 0.05, default: 0, optional: true },
    ],
    figures: [
      { key: 'enabled', kind: 'bool', default: true },
      { key: 'motif', kind: 'select', options: ['orbit', 'burst', 'bars', 'rings', 'confetti', 'frame', 'underlineSweep', 'bracketsPop', 'polyMorph', 'ribbon', 'ticker', 'halftone', 'cracks', 'spikes', 'eyes', 'scratches', 'drips', 'lattice', 'waves', 'comets', 'slabWipe', 'cornerBlocks', 'ringDraw', 'stripeRun', 'dotGrid', 'sideBars', 'proc', 'solarSystem', 'nbody', 'pendulum', 'pendulumWave', 'newtonCradle', 'chain', 'gravityWell', 'polyhedra', 'attractor', 'knot', 'starfield', 'kdTree', 'voronoi', 'delaunay', 'proximity', 'lsystem', 'spaceFilling', 'circlePack', 'treemap', 'colonization', 'stringArt', 'domainWarp', 'voronoiCells', 'contour', 'sdfKaleido', 'chladni', 'quasicrystal', 'fractal', 'moire', 'hyperbolic', 'truchet', 'gyroid', 'complexColor', 'curl', 'lissajousGlow', 'ripple', 'cellTiling', 'reactionDiffusion', 'wave2d', 'fluid', 'cellular'], default: 'orbit' },
      { key: 'sync', kind: 'select', options: ['beat', 'free', 'text'], default: 'beat' },
      { key: 'density', kind: 'number', min: 0.15, max: 1, step: 0.05, default: 0.5 },
      { key: 'count', kind: 'int', min: 3, max: 24, step: 1, default: 8 },
      { key: 'radius', kind: 'number', min: 0.3, max: 1.2, step: 0.05, default: 1 },
      { key: 'aspect', kind: 'number', min: 0.5, max: 2, step: 0.05, default: 1 },
      { key: 'spinRate', kind: 'number', min: 0, max: 2, step: 0.05, default: 1 },
      { key: 'stroke', kind: 'stroke', options: ['hair', 'thin', 'med', 'bold', 'heavy'], min: 0.1, max: 256, step: 0.1, default: 'med' },
      { key: 'lineStyle', kind: 'select', options: ['auto', ...((figures && figures.LINE_STYLES) || ['solid'])], default: 'auto' },
      { key: 'lineCap', kind: 'select', options: (figures && figures.LINE_CAPS) || ['round'], default: 'round' },
      { key: 'weightVar', kind: 'number', min: 0, max: 1, step: 0.05, default: 0 },
      { key: 'inEase', kind: 'ease', default: 'cubicOut' },
      { key: 'outEase', kind: 'ease', default: 'cubicIn' },
      { key: 'inDur', kind: 'number', min: 0.05, max: 2, step: 0.05, default: 0.3, optional: true },
      { key: 'outDur', kind: 'number', min: 0.05, max: 2, step: 0.05, default: 0.3, optional: true },
      { key: 'holdEase', kind: 'ease', default: 'linear' },
      { key: 'cameraEase', kind: 'ease', default: 'cubicInOut' },
      { key: 'camera', kind: 'select', options: ['none', 'push', 'pull', 'pan', 'roll', 'shake', 'whip', 'orbit'], default: 'none' },
      { key: 'in', kind: 'select', options: ['auto', 'pop', 'draw', 'wipe', 'scatterIn'], default: 'auto' },
      { key: 'hold', kind: 'select', options: ['auto', 'spin', 'pulse', 'drift', 'morph'], default: 'auto' },
      { key: 'out', kind: 'select', options: ['auto', 'shrink', 'fade', 'burstOut'], default: 'auto' },
      { key: 'color', kind: 'color', default: '#c86bff' },
      { key: 'scale', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
      { key: 'x', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      { key: 'y', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      { key: 'opacity', kind: 'number', min: 0.05, max: 1, step: 0.05, default: 1, optional: true },
    ],
    nextLinePreview: [
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.35 },
      { key: 'color', kind: 'color', default: '#cbd3ff' },
    ],
    previousLineGhost: [
      { key: 'opacity', kind: 'number', min: 0, max: 1, step: 0.05, default: 0.25 },
      { key: 'color', kind: 'color', default: '#cbd3ff' },
    ],
    progress: [
      { key: 'style', kind: 'select', options: ['bar', 'ring'], default: 'bar' },
      { key: 'position', kind: 'select', options: ['bottom', 'top'], default: 'bottom' },
      { key: 'color', kind: 'color', default: '#ffd166' },
    ],
    credits: [],
    cardPeek: [],
    instrumental: [
      { key: 'text', kind: 'text', default: '' },
      { key: 'size', kind: 'number', min: 0.02, max: 0.15, step: 0.005, default: 0.05 },
      { key: 'color', kind: 'color', default: '#cbd3ff' },
    ],
    textAnim: [
      { key: 'text', kind: 'text', default: '{title}' },
      { key: 'theme', kind: 'select', options: [], default: '' },
      { key: 'enter', kind: 'select', options: ['auto'], default: 'auto' },
      { key: 'hold', kind: 'select', options: ['auto'], default: 'auto' },
      { key: 'exit', kind: 'select', options: ['auto'], default: 'auto' },
      { key: 'size', kind: 'number', min: 0.02, max: 0.25, step: 0.005, default: 0.08 },
      { key: 'y', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'color', kind: 'color', default: '#eef2ff' },
    ],
    combo: [],
  };

  function types() {
    return [...TYPE_ORDER];
  }

  function paramDefaults(type) {
    const params = {};
    for (const param of PARAMS[type] || []) params[param.key] = param.default;
    return params;
  }

  function defaults(type) {
    return { type: type || 'none', params: paramDefaults(type || 'none') };
  }

  // The registered effect types of one group, for the text-animation selects.
  // In the browser the registry is already loaded; in Node it is required
  // lazily so tooling stays usable.
  function registryTypes(group) {
    const fxApi = typeof SA !== 'undefined' && SA && SA.fx ? SA.fx : null;
    if (fxApi && typeof fxApi.list === 'function') return fxApi.list(group, { packs: 'all' }).map((descriptor) => descriptor.type);
    try {
      const registry = require('./effects/registry');
      return registry.list(group, { packs: 'all' }).map((descriptor) => descriptor.type);
    } catch {
      return [];
    }
  }

  const TEXT_ANIM_GROUPS = { enter: 'enter', hold: 'hold', exit: 'exit' };

  function paramsOf(type) {
    return (PARAMS[type] || []).map((param) => {
      // the stateful figures (simulations) are only offered while the setting allows them
      if (type === 'figures' && param.key === 'motif' && figures && figures.SIM_MOTIFS && typeof figures.isStatefulAllowed === 'function' && !figures.isStatefulAllowed()) {
        return { ...param, options: param.options.filter((name) => !figures.SIM_MOTIFS.has(name)) };
      }
      // a text-animation clip can define how the string appears: the select
      // offers every registered enter / hold / exit effect plus `auto`, and
      // the saved themes for the theme slot
      if (type === 'textAnim' && TEXT_ANIM_GROUPS[param.key]) {
        return { ...param, options: ['auto', ...registryTypes(TEXT_ANIM_GROUPS[param.key])] };
      }
      if (type === 'textAnim' && param.key === 'theme') {
        const themes = typeof SA !== 'undefined' && SA && SA.themes && typeof SA.themes.list === 'function'
          ? SA.themes.list().map((theme) => theme.name || theme.id)
          : [];
        return { ...param, options: ['auto', ...themes] };
      }
      return { ...param };
    });
  }

  return {
    drawList,
    animate,
    colorOf,
    colorAt,
    hashString,
    seededRandom,
    types,
    paramsOf,
    paramDefaults,
    defaults,
    layersOf,
    fromLayers,
    validate,
    expandTokens,
    layerOf,
  };
});
