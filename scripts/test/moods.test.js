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

test('themes stay restrained: fills mostly solid, holds rare, stacks small', () => {
  let solids = 0;
  let holds = 0;
  let biggest = 0;
  const count = 300;
  for (let seed = 1; seed <= count; seed += 1) {
    const axes = moods.randomAxes().axes;
    const style = moods.generate({ axes, seed, context: { letterCount: 10, cjk: false, aspect: '16:9' } }).style;
    if (style.fill && style.fill.type === 'solid') solids += 1;
    holds += (style.hold || []).length;
    biggest = Math.max(biggest, (style.edge || []).length, (style.post || []).length);
  }
  assert.ok(solids / count >= 0.6, `solid fills ${solids}/${count}`);
  assert.ok(holds / count <= 0.45, `holds ${holds}/${count}`);
  assert.ok(biggest <= 2, `stacks up to ${biggest}`);
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
  let solids = 0;
  let count = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const result = random.randomize({ project, scope: 'project', seed, intensity: 2, colors: ['#eef2ff', '#ffd7a8', '#7ce0ff'] });
    const style = result.patches[0].style;
    count += 1;
    stacks += Math.max((style.edge || []).length, (style.post || []).length);
    if (style.fill.type === 'solid') solids += 1;
    for (const entry of style.post || []) {
      if (entry.params && entry.params.posterize != null) assert.equal(entry.params.posterize, 0);
    }
  }
  assert.ok(stacks / count <= 1.5, `average stacks ${stacks / count}`);
  assert.ok(solids / count >= 0.5, `solid fills ${solids}/${count}`);
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
