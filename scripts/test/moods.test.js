'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/animation.js');
require('../../renderer/js/lyrics/effects/layout.js');
require('../../renderer/js/lyrics/effects/enter.js');
require('../../renderer/js/lyrics/effects/exit.js');
require('../../renderer/js/lyrics/effects/hold.js');
require('../../renderer/js/lyrics/effects/location.js');
require('../../renderer/js/lyrics/effects/fill.js');
require('../../renderer/js/lyrics/effects/edge.js');
require('../../renderer/js/lyrics/effects/post.js');
require('../../renderer/js/lyrics/effects/background.js');
const moods = require('../../renderer/js/lyrics/moods.js');
const color = require('../../renderer/js/color.js');
const rng = require('../../renderer/js/lyrics/rng.js');

const SINGLE = ['animation', 'layout', 'enter', 'exit', 'location', 'fill'];
const STACK = ['hold', 'edge', 'post'];

function instancesOf(style) {
  const list = [];
  for (const group of SINGLE) {
    if (style[group] && style[group].type) list.push([group, style[group]]);
  }
  for (const group of STACK) {
    for (const instance of style[group] || []) list.push([group, instance]);
  }
  return list;
}

test('generated numeric parameters stay in the recommended range or default', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const axes = moods.randomAxes().axes;
    const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: true, hasPrevious: true, aspect: '16:9' } }).style;
    for (const [group, instance] of instancesOf(style)) {
      const descriptor = fx.get(group, instance.type);
      assert.ok(descriptor, `${group}.${instance.type} is registered`);
      const params = new Map((descriptor.params || []).map((param) => [param.key, param]));
      for (const [key, value] of Object.entries(instance.params || {})) {
        const param = params.get(key);
        if (!param || (param.kind !== 'number' && param.kind !== 'int')) continue;
        if (Array.isArray(param.random) && param.random.length >= 2) {
          assert.ok(
            value >= param.random[0] - 1e-9 && value <= param.random[1] + 1e-9,
            `seed ${seed}: ${group}.${instance.type}.${key}=${value} outside [${param.random}]`
          );
        } else {
          const fallback = param.default == null ? 0 : param.default;
          assert.ok(
            Math.abs(value - fallback) < 1e-9,
            `seed ${seed}: ${group}.${instance.type}.${key}=${value} should stay at the default (${fallback})`
          );
        }
      }
      if (['dropShadow', 'longShadow', 'extrude'].includes(instance.type)) continue;
      for (const [key, value] of Object.entries(instance.params || {})) {
        const param = params.get(key);
        if (!param || param.kind !== 'color' || !value || typeof value !== 'string' || !/^#/.test(value)) continue;
        const hsv = color.rgbToHsv(color.parse(value));
        assert.ok(hsv.v >= 0.25, `seed ${seed}: ${group}.${instance.type}.${key} is too dark (${value})`);
      }
    }
  }
});

test('themes stay restrained: stacks small, holds follow the energy axis', () => {
  let holds = 0;
  let biggest = 0;
  const count = 300;
  for (let seed = 1; seed <= count; seed += 1) {
    const axes = moods.randomAxes().axes;
    const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
    holds += (style.hold || []).length;
    biggest = Math.max(biggest, (style.edge || []).length, (style.post || []).length);
  }
  assert.ok(holds / count <= 0.6, `holds ${holds}/${count}`);
  assert.ok(biggest <= 2, `stacks up to ${biggest}`);
});

test('softness picks the fill and edge family', () => {
  const softFamily = new Set(['solid', 'glass', 'caustics', 'gradientSweep', 'categoryColor']);
  const hardFamily = new Set(['chrome', 'goldFoil', 'fire', 'holographic', 'rainbowFlow']);
  const sample = (axes) => {
    let soft = 0;
    let hard = 0;
    let glow = 0;
    let outline = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
      if (softFamily.has(style.fill.type)) soft += 1;
      if (hardFamily.has(style.fill.type)) hard += 1;
      for (const edge of style.edge || []) {
        if (['innerGlow', 'neonGlow', 'dropShadow'].includes(edge.type)) glow += 1;
        if (['outline', 'longShadow', 'extrude', 'bevel'].includes(edge.type)) outline += 1;
      }
    }
    return { soft, hard, glow, outline };
  };
  const soft = sample({ speed: 0.4, energy: 0.4, softness: 0.95, density: 0.4, brightness: 0.4 });
  const hard = sample({ speed: 0.8, energy: 0.9, softness: 0.05, density: 0.7, brightness: 0.7 });
  assert.ok(soft.soft > hard.soft * 2, `soft fill ${soft.soft} vs ${hard.soft}`);
  assert.ok(hard.hard > hard.soft, `hard fill ${hard.hard} vs soft ${hard.soft}`);
  assert.ok(soft.glow > hard.glow, `soft glow ${soft.glow} vs hard ${hard.glow}`);
  assert.ok(hard.outline > soft.outline, `hard outline ${hard.outline} vs soft ${soft.outline}`);
});

test('project-scope randomization uses the restrained mood generator', () => {
  const random = require('../../renderer/js/lyrics/random.js');
  const project = {
    style: {},
    cues: [],
    script: { cues: [{ id: 'c1', text: 'hello world', kind: 'lyric' }] },
    beatStyles: {},
    cueStyles: {},
    overrides: {},
  };
  let stacks = 0;
  let count = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const result = random.randomize({ project, scope: 'project', seed, intensity: 2, colors: ['#eef2ff', '#ffd7a8', '#7ce0ff'] });
    const style = result.patches[0].style;
    count += 1;
    stacks += Math.max((style.edge || []).length, (style.post || []).length);
    assert.ok(fx.get('fill', style.fill.type), `fill.${style.fill.type} is registered`);
    for (const entry of style.post || []) {
      if (entry.params && entry.params.posterize != null) assert.equal(entry.params.posterize, 0);
    }
  }
  assert.ok(stacks / count <= 1.8, `average stacks ${stacks / count}`);
});

test('cue-scope randomization only rerolls one or two safe groups', () => {
  const random = require('../../renderer/js/lyrics/random.js');
  const project = {
    style: {},
    cues: [],
    script: { cues: [{ id: 'c1', text: 'hello world', kind: 'lyric' }] },
    beatStyles: {},
    cueStyles: { c1: {} },
    overrides: {},
  };
  for (let seed = 1; seed <= 50; seed += 1) {
    const result = random.randomize({ project, scope: 'cues', seed, intensity: 1 });
    const style = result.patches[0].style;
    const groups = Object.keys(style);
    assert.ok(groups.length >= 1 && groups.length <= 2, `groups ${groups.join(',')}`);
    for (const group of groups) {
      assert.ok(!['layout', 'location', 'background'].includes(group), `must not reroll ${group}`);
    }
  }
});

test('auto direct keeps the theme fixed and only breathes per beat', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../renderer/js/studio/app.js'), 'utf8');
  const start = source.indexOf('// 2) per-cue motion inside the same theme');
  const end = source.indexOf('// gaps between the lyrics');
  assert.ok(start > 0 && end > start, 'auto direct section found');
  const block = source.slice(start, end);
  for (const group of ['layout', 'location', 'edge', 'post', 'color', 'palette', 'background', 'transform']) {
    assert.ok(!new RegExp(`beatPatch\\.${group}\\s*=`).test(block), `beat patch must not set ${group}`);
  }
  assert.ok(/beatPatch = \{ text: \{ size \} \}/.test(block), 'beats only change the text size');
  assert.ok(/cueStyles\[cue\.id\][\s\S]*enter: generated\.enter/.test(block), 'enter/exit are per cue');
  assert.ok(/bpm: Math\.round\(bpm\)/.test(block), 'pulse uses the audio BPM');
});

test('every axis drives its own parameters and leaves the others alone', () => {
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  const measure = (overrides) => {
    const axes = { ...base, ...overrides };
    let inDur = 0;
    let holds = 0;
    let solids = 0;
    let stacks = 0;
    let size = 0;
    let bgv = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed += 1) {
      const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
      inDur += style.enter.motion.in.duration;
      holds += (style.hold || []).length;
      if (style.fill.type === 'solid') solids += 1;
      stacks += Math.max((style.edge || []).length, (style.post || []).length);
      size += style.text.size;
      bgv += color.rgbToHsv(color.parse(style.palette.colors[0])).v;
    }
    return { inDur: inDur / n, holds: holds / n, solids: solids / n, stacks: stacks / n, size: size / n, bgv: bgv / n };
  };
  const middle = measure({});
  const fast = measure({ speed: 1 });
  const strong = measure({ energy: 1 });
  const soft = measure({ softness: 1 });
  const hard = measure({ softness: 0 });
  const dense = measure({ density: 1 });
  const sparse = measure({ density: 0 });
  const bright = measure({ brightness: 1 });
  const dark = measure({ brightness: 0 });

  // speed: durations and stagger only
  assert.ok(middle.inDur > fast.inDur * 1.3, `speed ${middle.inDur} vs ${fast.inDur}`);
  assert.ok(Math.abs(middle.bgv - fast.bgv) < 0.08, `speed moved the palette (${middle.bgv} vs ${fast.bgv})`);
  // energy: strength gates and hold frequency; it must not flip the text family
  assert.ok(strong.holds > middle.holds + 0.15, `hold probability ${strong.holds} vs ${middle.holds}`);
  assert.ok(Math.abs(strong.bgv - middle.bgv) < 0.12, `energy moved the palette`);
  // softness: texture families
  assert.ok(soft.solids > hard.solids + 0.2, `soft solids ${soft.solids} vs hard ${hard.solids}`);
  assert.ok(Math.abs(soft.inDur - hard.inDur) < soft.inDur * 0.4, `softness moved durations`);
  // density: amount
  assert.ok(dense.stacks > sparse.stacks + 0.3, `density stacks ${dense.stacks} vs ${sparse.stacks}`);
  assert.ok(dense.size < sparse.size, `density size ${dense.size} vs ${sparse.size}`);
  // brightness: the palette only
  assert.ok(bright.bgv > dark.bgv + 0.4, `brightness palette ${bright.bgv} vs ${dark.bgv}`);
  assert.ok(Math.abs(bright.inDur - dark.inDur) < bright.inDur * 0.4, `brightness moved durations`);
});

test('presets produce clearly different distributions', () => {
  const sample = (axes) => {
    let inDur = 0;
    let holds = 0;
    let softFills = 0;
    let hardFills = 0;
    let bgv = 0;
    const n = 200;
    const soft = new Set(['solid', 'glass', 'caustics', 'gradientSweep', 'categoryColor']);
    const hard = new Set(['chrome', 'goldFoil', 'fire', 'holographic', 'rainbowFlow']);
    for (let seed = 1; seed <= n; seed += 1) {
      const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
      inDur += style.enter.motion.in.duration;
      holds += (style.hold || []).length;
      if (soft.has(style.fill.type)) softFills += 1;
      if (hard.has(style.fill.type)) hardFills += 1;
      bgv += color.rgbToHsv(color.parse(style.palette.colors[0])).v;
    }
    return { inDur: inDur / n, holds: holds / n, softFills: softFills / n, hardFills: hardFills / n, bgv: bgv / n };
  };
  const preset = (id) => moods.PRESETS.find((entry) => entry.id === id).axes;
  const ballad = sample(preset('ballad'));
  const cute = sample(preset('cute'));
  const rock = sample(preset('rock'));
  assert.ok(ballad.inDur > rock.inDur * 1.4, `ballad enter ${ballad.inDur} vs rock ${rock.inDur}`);
  assert.ok(cute.bgv > ballad.bgv + 0.3, `cute background ${cute.bgv} vs ballad ${ballad.bgv}`);
  assert.ok(rock.holds > ballad.holds + 0.2, `rock holds ${rock.holds} vs ballad ${ballad.holds}`);
  assert.ok(rock.hardFills > ballad.hardFills, `rock hard fills ${rock.hardFills} vs ballad ${ballad.hardFills}`);
});

test('every generated palette keeps text contrast at 4.5 or better', () => {
  for (const preset of moods.PRESETS) {
    for (let seed = 1; seed <= 100; seed += 1) {
      const style = moods.generate({ axes: preset.axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
      const colors = style.palette.colors;
      const ratio = color.contrastRatio(color.parse(colors[2]), color.parse(colors[0]));
      assert.ok(ratio >= 4.5, `${preset.id} seed ${seed}: contrast ${ratio.toFixed(2)} (${colors[2]} on ${colors[0]})`);
    }
  }
  for (let seed = 1; seed <= 200; seed += 1) {
    const axes = moods.randomAxes().axes;
    const palette = moods.generatePalette(rng.mulberry32(seed), axes);
    const ratio = color.contrastRatio(color.parse(palette.colors[2]), color.parse(palette.colors[0]));
    assert.ok(ratio >= 4.5, `random seed ${seed}: contrast ${ratio.toFixed(2)}`);
  }
});

test('ballad and rock pick clearly different effects', () => {
  const gritty = new Set(['rgbShift', 'crt', 'lensDistortion', 'heatHaze', 'zoomBlur', 'rainbowFlow', 'holographic', 'fire', 'jitter', 'twist', 'wobbleWarp']);
  const sample = (axes) => {
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
      for (const [, instance] of instancesOf(style)) {
        total += 1;
        if (gritty.has(instance.type)) hits += 1;
      }
    }
    return hits / Math.max(1, total);
  };
  const ballad = moods.PRESETS.find((preset) => preset.id === 'ballad').axes;
  const rock = moods.PRESETS.find((preset) => preset.id === 'rock').axes;
  const balladRate = sample(ballad);
  const rockRate = sample(rock);
  assert.ok(rockRate > balladRate * 2, `rock ${rockRate} vs ballad ${balladRate}`);
});

test('weird is a sixth axis that defaults to 0 and stays out of look matching', () => {
  assert.deepEqual(moods.AXES, ['speed', 'energy', 'softness', 'density', 'brightness', 'weird']);
  assert.deepEqual(moods.MATCH_AXES, ['speed', 'energy', 'softness', 'density', 'brightness']);
  const axes = moods.normalizeAxes({ energy: 0.9 });
  assert.equal(axes.weird, 0); // existing projects keep one look per song
  assert.equal(axes.speed, 0.5);
  assert.equal(moods.normalizeAxes({ weird: 2 }).weird, 1);
});

test('recolor moves every hex colour onto the new palette and keeps the rest', () => {
  const from = ['#101018', '#202838', '#ffffff', '#ff0000', '#000000'];
  const to = ['#0a1a10', '#12301c', '#f0fff0', '#00c060', '#001008'];
  const style = {
    palette: { id: 'old', colors: from.slice() },
    edge: [{ type: 'glow', params: { color: '#ff0000', size: 3, highlight: '#FF000080' } }],
    fill: { type: 'tint', params: { tint: '#800000', mode: 'multiply' } },
    color: { fill: { kind: 'palette', index: 2 } },
    name: 'not #a colour',
  };
  const out = moods.recolor(style, from, to);
  assert.equal(out.edge[0].params.color, '#00c060'); // exact palette colour -> same role
  assert.equal(out.edge[0].params.highlight, '#00c06080'); // alpha survives, case ignored
  assert.equal(out.edge[0].params.size, 3);
  assert.deepEqual(out.palette.colors, to);
  assert.deepEqual(out.color, style.color); // palette references are untouched
  assert.equal(out.name, 'not #a colour');
  // an off-palette colour keeps its offset: a darker red becomes a darker green
  const tint = color.rgbToHsv(color.parse(out.fill.params.tint));
  const accent = color.rgbToHsv(color.parse('#00c060'));
  assert.ok(Math.abs(tint.h - accent.h) < 2, `hue ${tint.h} vs ${accent.h}`);
  assert.ok(tint.v < accent.v, 'stays darker than the accent');
  assert.equal(style.edge[0].params.color, '#ff0000'); // the input is not mutated
  // nothing to map from: a plain copy
  assert.deepEqual(moods.recolor(style, [], to), style);
});
