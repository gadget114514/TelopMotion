'use strict';

// Perceptual look-alike measure for the procedural figure motif. Every seed is
// drawn at a few moments and reduced to a small feature vector (what the eye
// groups by: kind mix, coverage, where the mass sits, size spread, colour
// spread, tilt, filled share, motion). Two seeds "look alike" when their
// standardised vectors are close. Used by scripts/test/proc-variety.test.js and
// runnable by hand: node scripts/proc-variety.js [count]

const path = require('node:path');
const figures = require(path.join(__dirname, '..', 'renderer', 'js', 'lyrics', process.env.FIGURES_FILE || 'figures.js'));

const FRAME = { width: 1920, height: 1080 };
const SPAN = { start: 2, end: 14 };
const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'];
const KINDS = ['circle', 'ring', 'rect', 'capsule', 'polygon', 'convex'];

function ctxAt(time) {
  return { time, frame: FRAME, clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end }, seed: 7, colors: COLORS, beats: [{ start: 2, end: 14 }] };
}

function hueOf(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { l: (max + min) / 2, c: max - min, h: max === min ? 0 : max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4 };
}

function boxOf(shape) {
  if (shape.points) {
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), a: 0 };
  }
  if (shape.kind === 'rect') return { x0: shape.x, x1: shape.x + shape.w, y0: shape.y, y1: shape.y + shape.h, a: shape.angle || 0 };
  if (shape.kind === 'capsule') {
    const half = (shape.width || 0) / 2;
    return { x0: Math.min(shape.x0, shape.x1) - half, x1: Math.max(shape.x0, shape.x1) + half, y0: Math.min(shape.y0, shape.y1) - half, y1: Math.max(shape.y0, shape.y1) + half, a: (Math.atan2(shape.y1 - shape.y0, shape.x1 - shape.x0) * 180) / Math.PI };
  }
  const r = shape.r || 0;
  return { x0: shape.x - r, x1: shape.x + r, y0: shape.y - r, y1: shape.y + r, a: shape.rotation || 0 };
}

function frameFeatures(spec, time) {
  const shapes = figures.drawList(spec, ctxAt(time)).shapes;
  const f = new Array(KINDS.length).fill(0);
  let cx = 0;
  let cy = 0;
  let area = 0;
  let cover = 0;
  const sizes = [];
  const hues = [];
  let alpha = 0;
  let filled = 0;
  let tilt = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const k = KINDS.indexOf(shape.kind);
    if (k >= 0) f[k] += 1;
    const b = boxOf(shape);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const size = Math.sqrt(Math.max(1, w * h));
    sizes.push(Math.log(size));
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    cx += mx * size;
    cy += my * size;
    area += size;
    cover += w * h;
    minX = Math.min(minX, b.x0);
    maxX = Math.max(maxX, b.x1);
    minY = Math.min(minY, b.y0);
    maxY = Math.max(maxY, b.y1);
    alpha += shape.opacity == null ? 1 : shape.opacity;
    if (shape.kind === 'ring' || (shape.kind === 'polygon' && !shape.color)) filled += 0;
    else filled += 1;
    tilt += Math.abs(Math.cos(((b.a || 0) * Math.PI) / 90)) * (w > h * 1.5 || h > w * 1.5 ? 1 : 0.3);
    hues.push(shape.color || shape.strokeColor || '#888888');
  }
  const cells = new Set();
  const used = new Set();
  for (const shape of shapes) {
    const b = boxOf(shape);
    cells.add(`${Math.floor(((b.x0 + b.x1) / 2 / FRAME.width) * 8)}:${Math.floor(((b.y0 + b.y1) / 2 / FRAME.height) * 6)}`);
    used.add(shape.kind + (shape.color ? 'f' : 'o'));
  }
  const n = Math.max(1, shapes.length);
  const mean = sizes.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sizes.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  const hs = hues.map(hueOf);
  const distinct = new Set(hues).size;
  return {
    mix: f.map((v) => v / n),
    count: Math.log(1 + shapes.length),
    cx: area ? cx / area / FRAME.width : 0.5,
    cy: area ? cy / area / FRAME.height : 0.5,
    spreadX: shapes.length ? (maxX - minX) / FRAME.width : 0,
    spreadY: shapes.length ? (maxY - minY) / FRAME.height : 0,
    cover: Math.log(1 + cover / (FRAME.width * FRAME.height) * 20),
    size: mean,
    sizeSd: sd,
    colors: distinct,
    hueMean: hs.reduce((a, b) => a + b.h, 0) / n,
    alpha: alpha / n,
    filled: filled / n,
    tilt: tilt / n,
    occupancy: cells.size / 48,
    variety: used.size,
  };
}

function featuresOf(seed) {
  const spec = figures.generate({ span: SPAN, motif: 'proc', seed, id: `var_${seed}`, palette: [], axes: { weird: 1, energy: 0.6 } });
  spec.params.colors = COLORS;
  const a = frameFeatures(spec, 5.0);
  const b = frameFeatures(spec, 5.5);
  const c = frameFeatures(spec, 9.0);
  const move = Math.abs(a.cx - b.cx) * 20 + Math.abs(a.cy - b.cy) * 20 + Math.abs(a.count - b.count) + Math.abs(a.size - b.size);
  const out = [...a.mix, a.count, a.cx, a.cy, a.spreadX, a.spreadY, a.cover, a.size, a.sizeSd, a.colors, a.hueMean, a.alpha, a.filled, a.tilt, move, c.count, c.cover, c.cx, c.cy, a.occupancy, a.variety];
  return out;
}

function standardise(rows) {
  const dims = rows[0].length;
  const mean = new Array(dims).fill(0);
  const sd = new Array(dims).fill(0);
  for (const row of rows) row.forEach((v, i) => { mean[i] += v / rows.length; });
  for (const row of rows) row.forEach((v, i) => { sd[i] += (v - mean[i]) ** 2 / rows.length; });
  return rows.map((row) => row.map((v, i) => (v - mean[i]) / (Math.sqrt(sd[i]) || 1)));
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

// share of seeds whose nearest neighbour is closer than `tau`, plus how many
// draws a user needs on average before two of a batch of `batch` look alike
function measure(count, options) {
  const opts = options || {};
  const tau = opts.tau == null ? 0.2 : opts.tau;
  const batch = opts.batch || 30;
  const raw = [];
  for (let seed = 1; seed <= count; seed += 1) raw.push(featuresOf(seed * 7919 + 13));
  const rows = standardise(raw);
  let near = 0;
  for (let i = 0; i < rows.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < rows.length; j += 1) {
      if (i === j) continue;
      const d = distance(rows[i], rows[j]);
      if (d < best) best = d;
    }
    if (best < tau) near += 1;
  }
  // batches of `batch` consecutive draws: how many contain a look-alike pair
  let batches = 0;
  let hit = 0;
  for (let start = 0; start + batch <= rows.length; start += batch) {
    batches += 1;
    let found = false;
    for (let i = start; i < start + batch && !found; i += 1) {
      for (let j = i + 1; j < start + batch; j += 1) {
        if (distance(rows[i], rows[j]) < tau) {
          found = true;
          break;
        }
      }
    }
    if (found) hit += 1;
  }
  return { count, tau, nearShare: near / count, batch, batchHit: batches ? hit / batches : 0 };
}

// The coarse impression of a seed: what a person calls "that picture again".
// Quantised into a handful of buckets per cue; two seeds with the same label
// read as the same picture.
function gestalt(row) {
  const mix = row.slice(0, 6);
  const [count, cx, cy, spreadX, spreadY, cover, size, sizeSd, colors, hue, alpha, filled, tilt, move] = row.slice(6, 20);
  const [, , , , occupancy, variety] = row.slice(20);
  const dominant = mix.indexOf(Math.max(...mix));
  const bucket = (v, cuts) => cuts.filter((c) => v >= c).length;
  return [
    dominant,
    bucket(count, [Math.log(12), Math.log(40)]),
    bucket(size, [Math.log(26), Math.log(60)]),
    bucket(sizeSd, [0.45]),
    bucket(cover, [0.5, 1.4]),
    Math.abs(cx - 0.5) < 0.12 && Math.abs(cy - 0.5) < 0.12 ? 0 : 1,
    bucket(spreadX, [0.55]),
    bucket(colors, [2, 3]),
    bucket(filled, [0.5]),
    bucket(move, [0.4]),
    bucket(alpha, [0.6]),
    bucket(tilt, [0.35]),
    bucket(occupancy, [0.12, 0.3]),
    bucket(variety, [2, 3]),
    bucket(hue, [1.2, 2.4, 3.6, 4.8]),
  ].join('.');
}

// how often two of `batch` consecutive Generate presses share a gestalt
function measureGestalt(count, batch) {
  const labels = [];
  for (let seed = 1; seed <= count; seed += 1) labels.push(gestalt(featuresOf(seed * 7919 + 13)));
  const size = batch || 30;
  let batches = 0;
  let hit = 0;
  for (let start = 0; start + size <= labels.length; start += size) {
    batches += 1;
    if (new Set(labels.slice(start, start + size)).size < size) hit += 1;
  }
  const freq = new Map();
  labels.forEach((l) => freq.set(l, (freq.get(l) || 0) + 1));
  const top = [...freq.values()].sort((a, b) => b - a)[0];
  return { count, distinct: freq.size, topShare: top / count, batch: size, batchHit: hit / batches };
}

module.exports = { measureGestalt, gestalt, measure, featuresOf, distance, standardise };

if (require.main === module) {
  const count = Number(process.argv[2]) || 2000;
  console.log(JSON.stringify(measureGestalt(count, 30)));
  console.log(JSON.stringify(measureGestalt(count, 10)));
}
