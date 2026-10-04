'use strict';

// Contact sheet of procedural figure seeds as inline SVG, for eyeballing the
// variety: node scripts/proc-sheet.js [out.html] [count] [firstSeed] [time]
// FIGURES_FILE=figures.base.js picks another figures module to compare against.

const fs = require('node:fs');
const path = require('node:path');
const figures = require(path.join(__dirname, '..', 'renderer', 'js', 'lyrics', process.env.FIGURES_FILE || 'figures.js'));

const FRAME = { width: 1920, height: 1080 };
const SPAN = { start: 2, end: 14 };
const PALETTES = [
  ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'],
  ['#f8f9fa', '#adb5bd', '#e63946', '#457b9d', '#1d3557'],
  ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
  ['#2ec4b6', '#e71d36', '#ff9f1c', '#cbf3f0', '#011627'],
];

function esc(value) {
  return value == null ? 'none' : value;
}

function svgOf(shape) {
  const op = shape.opacity == null ? 1 : Math.max(0, Math.min(1, shape.opacity));
  if (shape.kind === 'circle') return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${esc(shape.color)}" opacity="${op}"/>`;
  if (shape.kind === 'ring') return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="none" stroke="${esc(shape.color)}" stroke-width="${shape.thickness || 2}" opacity="${op}"/>`;
  if (shape.kind === 'rect') {
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const stroke = shape.stroke ? ` stroke="${esc(shape.strokeColor)}" stroke-width="${shape.stroke}"` : '';
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.radius || 0}" fill="${esc(shape.color)}"${stroke} opacity="${op}" transform="rotate(${shape.angle || 0} ${cx} ${cy})"/>`;
  }
  if (shape.kind === 'capsule') return `<line x1="${shape.x0}" y1="${shape.y0}" x2="${shape.x1}" y2="${shape.y1}" stroke="${esc(shape.color)}" stroke-width="${shape.width || 2}" stroke-linecap="round" opacity="${op}"/>`;
  if (shape.kind === 'polygon') {
    const pts = [];
    const sides = Math.max(3, Math.min(12, Math.round(shape.sides || 6)));
    for (let i = 0; i < sides; i += 1) {
      const a = ((shape.rotation || 0) * Math.PI) / 180 + (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push(`${shape.x + Math.cos(a) * shape.r},${shape.y + Math.sin(a) * shape.r}`);
    }
    const stroke = shape.stroke ? ` stroke="${esc(shape.strokeColor)}" stroke-width="${shape.stroke}"` : '';
    return `<polygon points="${pts.join(' ')}" fill="${esc(shape.color)}"${stroke} opacity="${op}"/>`;
  }
  if (shape.kind === 'convex') return `<polygon points="${shape.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="${esc(shape.color)}" opacity="${op}"/>`;
  return '';
}

function main() {
  const out = process.argv[2] || path.join(__dirname, 'proc-sheet.html');
  const count = Number(process.argv[3]) || 48;
  const first = Number(process.argv[4]) || 1;
  const time = Number(process.argv[5]) || 5;
  const tiles = [];
  for (let i = 0; i < count; i += 1) {
    const seed = (first + i) * 7919 + 13;
    const palette = PALETTES[i % PALETTES.length];
    const MOTIF = process.env.MOTIF || 'proc';
    const motif = MOTIF === 'scenes' ? figures.SCENE_MOTIFS[i % figures.SCENE_MOTIFS.length] : MOTIF === 'geos' ? figures.GEO_MOTIFS[i % figures.GEO_MOTIFS.length] : MOTIF;
    const spec = figures.generate({ span: SPAN, motif, seed, id: `sheet_${seed}`, axes: { weird: 1, energy: 0.6 } });
    spec.params.colors = palette;
    const shapes = figures.drawList(spec, {
      time,
      frame: FRAME,
      clip: { key: 'fig_0', start: SPAN.start, end: SPAN.end },
      seed: 7,
      colors: palette,
      beats: [{ start: 2, end: 14 }],
      textBox: { x0: 520, y0: 440, x1: 1400, y1: 640 },
    }).shapes;
    tiles.push(`<div class="tile"><svg viewBox="0 0 ${FRAME.width} ${FRAME.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#10131c"/><rect x="520" y="440" width="880" height="200" fill="none" stroke="#333a4d" stroke-dasharray="12 10" stroke-width="4"/>${shapes.map(svgOf).join('')}</svg><span>${i + first}</span></div>`);
  }
  fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>proc sheet</title><style>body{margin:0;background:#05060a;display:grid;grid-template-columns:repeat(${process.env.COLS || 6},1fr);gap:4px;padding:4px}.tile{position:relative}svg{width:100%;display:block}span{position:absolute;left:4px;top:2px;color:#8a93ad;font:11px monospace}</style>${tiles.join('')}`);
  console.log(out);
}

main();
