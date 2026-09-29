'use strict';

// The sixth axis (`weird`) gates the extended primitives and makes every
// effect's parameters reach for the ends of their ranges; the five classic
// axes keep deciding durations, easing, texture and stacking. The default
// draws must stay byte-identical, so weird = 0 behaves exactly as before.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const moods = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'moods.js'));
const random = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'random.js'));
const classify = require(path.join(ROOT, 'scripts', 'looks-classify.js'));
const color = require(path.join(ROOT, 'renderer', 'js', 'color.js'));
const rng = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'rng.js'));
const looks = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'looks.js'));

const PLAIN_AXES = { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.6, brightness: 0.3 };
const PLAIN_CONTEXT = { letterCount: 12, cjk: false, aspect: '16:9' };
const SINGLE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'location', 'fill'];
const STACK_GROUPS = ['hold', 'edge', 'post'];

function instancesOf(style) {
  const list = [];
  for (const group of SINGLE_GROUPS) if (style[group] && style[group].type) list.push([group, style[group]]);
  for (const group of STACK_GROUPS) for (const instance of style[group] || []) list.push([group, instance]);
  return list;
}

function variance(list) {
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  return list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / list.length;
}

test('the sixth axis is declared and defaults to zero', () => {
  assert.deepEqual(moods.AXES, ['speed', 'energy', 'softness', 'density', 'brightness', 'weird', 'smartness', 'fear']);
  assert.deepEqual(moods.MATCH_AXES, ['speed', 'energy', 'softness', 'density', 'brightness']);
  assert.equal(moods.normalizeAxes({}).weird, 0);
  assert.equal(moods.normalizeAxes({}).smartness, 0);
  assert.equal(moods.normalizeAxes({}).fear, 0);
  assert.equal(moods.EXT_REVEAL, 0.35);
});

test('the extended pool opens with the sixth axis and stays closed at zero', () => {
  const plain = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const weird = { ...plain, weird: 1 };
  for (const group of ['enter', 'exit', 'hold', 'post', 'background']) {
    const closed = moods.poolFor(group, plain);
    const open = moods.poolFor(group, weird);
    for (const type of Object.keys(moods.EXT_TRAITS[group] || {})) {
      assert.equal(closed[type], undefined, `${group}.${type} must not be in the plain pool`);
      assert.ok(open[type], `${group}.${type} must be in the weird pool`);
    }
  }
  // the classic tables are untouched
  assert.equal(moods.poolFor('hold', plain), moods.TRAITS.hold);
});

test('flags gate an effect by the axes it needs', () => {
  const calm = { speed: 0.1, energy: 0.1, softness: 0.9, density: 0.3, brightness: 0.4, weird: 0.2 };
  const loud = { speed: 0.8, energy: 0.9, softness: 0.2, density: 0.7, brightness: 0.8, weird: 0.9 };
  const strobe = moods.EXT_TRAITS.post.strobeFlash;
  assert.equal(moods.allowed('post', strobe, { letterCount: 5 }, 'horizontal', calm), false);
  assert.equal(moods.allowed('post', strobe, { letterCount: 5 }, 'horizontal', loud), true);
  // a plain mood never allows a weird-only type even when it is loud
  const plainLoud = { ...loud, weird: 0.1 };
  assert.equal(moods.allowed('hold', moods.EXT_TRAITS.hold.fontSize, { letterCount: 5 }, 'horizontal', plainLoud), false);
});

test('the weird axis scores the effect against the mood', () => {
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 0 };
  const plainEffect = [0.5, 0.5];
  const weirdEffect = [0.5, 0.5, {}, 1];
  assert.ok(moods.score(plainEffect, axes) > moods.score(weirdEffect, axes));
  const weirdAxes = { ...axes, weird: 1 };
  assert.ok(moods.score(weirdEffect, weirdAxes) > moods.score(plainEffect, weirdAxes));
});

test('generation is identical without the sixth axis and varies with it', () => {
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  const without = moods.generate({ axes: base, seed: 7, context: { cjk: true, letterCount: 8 } });
  const zero = moods.generate({ axes: { ...base, weird: 0 }, seed: 7, context: { cjk: true, letterCount: 8 } });
  assert.equal(JSON.stringify(without.style), JSON.stringify(zero.style), 'weird 0 must not change the draw');
  const noisy = moods.generate({ axes: { ...base, weird: 1 }, seed: 7, context: { cjk: true, letterCount: 8 } });
  assert.notEqual(JSON.stringify(noisy.style), JSON.stringify(zero.style), 'the sixth axis must change the draw');
});

test('the automatic picker draws the extended pack only for weird looks', () => {
  const base = {
    script: { cues: [{ id: 'c1', text: 'テスト', start: 0, end: 2 }] },
    output: { aspect: '16:9' },
  };
  const typesOf = (patches) =>
    new Set(
      patches
        .flatMap((patch) => Object.values(patch.style))
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => value && value.type)
        .filter(Boolean)
    );
  const extended = new Set(Object.values(moods.EXT_TRAITS).flatMap((table) => Object.keys(table || {})));
  let weirdHits = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const plain = random.randomize({ project: { ...base, styleMode: { axes: { energy: 0.5, speed: 0.5, weird: 0 } } }, scope: 'cues', seed });
    for (const type of typesOf(plain.patches)) {
      assert.ok(!extended.has(type), `${type} leaked into a plain draw (seed ${seed})`);
    }
    const odd = random.randomize({ project: { ...base, styleMode: { axes: { energy: 0.9, speed: 0.9, weird: 1 } } }, scope: 'cues', seed });
    for (const type of typesOf(odd.patches)) if (extended.has(type)) weirdHits += 1;
  }
  assert.ok(weirdHits > 0, 'the sixth axis never reached the extended pack in 12 seeds');
});

test('the classifier scores the sixth axis from the look', () => {
  const plain = { group: 'enter', style: { enter: { type: 'fade' }, layout: { type: 'row' } } };
  const odd = {
    group: 'post',
    style: {
      post: [{ type: 'glitchBlocks' }, { type: 'turbulentDisplace' }],
      hold: [{ type: 'letterWarp' }, { type: 'fillScreen' }],
      edge: [{ type: 'drip' }],
      background: { type: 'tunnel' },
      enter: { type: 'scramble' },
    },
  };
  assert.ok(classify.weirdOf(plain) < 0.3, `plain scored ${classify.weirdOf(plain)}`);
  assert.ok(classify.weirdOf(odd) > 0.6, `odd scored ${classify.weirdOf(odd)}`);
  const axes = classify.axesOf(odd, 0.5);
  assert.ok(axes.weird > 0.6);
  assert.ok(classify.axesDistance(axes, { ...axes }) < 0.001);
  assert.ok(classify.axesDistance(axes, { ...axes, weird: 0 }) > 0.05);
});

// --- the parameterised weird axis -------------------------------------------

test('projectWeird opens at the UI default and honours an explicit value', () => {
  assert.equal(moods.WEIRD_DEFAULT, 0.7);
  assert.equal(moods.projectWeird(null), 0.7);
  assert.equal(moods.projectWeird({}), 0.7);
  assert.equal(moods.projectWeird({ styleMode: {} }), 0.7);
  assert.equal(moods.projectWeird({ styleMode: { axes: { weird: 0 } } }), 0);
  assert.equal(moods.projectWeird({ styleMode: { axes: { weird: 0.3 } } }), 0.3);
  assert.equal(moods.projectWeird({ styleMode: { axes: { weird: 2 } } }), 1);
  // the engine default itself stays 0 (old projects draw as before)
  assert.equal(moods.normalizeAxes({}).weird, 0);
  assert.equal(moods.weirdOf({}), 0);
  assert.equal(moods.weirdOf({ weird: 0.3 }), 0.3);
});

test('weird 0 is byte-identical to the classic draw for every generator', () => {
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  for (let seed = 1; seed <= 10; seed += 1) {
    const without = moods.generate({ axes: base, seed, context: PLAIN_CONTEXT });
    const zero = moods.generate({ axes: { ...base, weird: 0 }, seed, context: PLAIN_CONTEXT });
    assert.equal(JSON.stringify(without.style), JSON.stringify(zero.style), `generate seed ${seed}`);
    assert.deepEqual(without.axes, zero.axes);
    for (const kind of ['background', 'backdrop', 'filler']) {
      const a = moods.rerollClipSpec(kind, { axes: base, seed });
      const b = moods.rerollClipSpec(kind, { axes: { ...base, weird: 0 }, seed });
      assert.equal(JSON.stringify(a), JSON.stringify(b), `${kind} seed ${seed}`);
    }
    const palA = moods.generatePalette(rng.mulberry32(seed), base);
    const palB = moods.generatePalette(rng.mulberry32(seed), { ...base, weird: 0 });
    assert.equal(JSON.stringify(palA), JSON.stringify(palB), `palette seed ${seed}`);
  }
});

test('the weird palette raises text saturation and lifts the contrast target', () => {
  const sample = (weird) => {
    let saturation = 0;
    let worst = Infinity;
    for (let seed = 1; seed <= 30; seed += 1) {
      const style = moods.generate({ axes: { ...PLAIN_AXES, weird }, seed, context: PLAIN_CONTEXT }).style;
      const colors = style.palette.colors;
      saturation += color.rgbToHsv(color.parse(colors[2])).s;
      worst = Math.min(worst, color.contrastRatio(color.parse(colors[2]), color.parse(colors[0])));
    }
    return { saturation: saturation / 30, worst };
  };
  const plain = sample(0);
  const odd = sample(1);
  assert.ok(odd.saturation > plain.saturation * 2, `text saturation ${odd.saturation} vs ${plain.saturation}`);
  // the palette contrast climbs to 7:1 at raw 1 instead of falling to 3:1
  assert.ok(odd.worst >= 7, `weird contrast ${odd.worst}`);
  assert.ok(plain.worst >= 4.5, `classic contrast ${plain.worst}`);
});

test('a weird look lets shadows leave the dark tone', () => {
  const axes = { speed: 0.5, energy: 0.9, softness: 0.1, density: 0.9, brightness: 0.3 };
  const sample = (weird) => {
    let darkStroke = 0;
    let light = 0;
    let total = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const style = moods.generate({ axes: { ...axes, weird }, seed, context: PLAIN_CONTEXT }).style;
      const dark = String(style.palette.colors[4] || '').toLowerCase();
      for (const edge of style.edge || []) {
        if (!['dropShadow', 'longShadow', 'extrude'].includes(edge.type)) continue;
        if (!edge.params || typeof edge.params.color !== 'string') continue;
        total += 1;
        if (edge.params.color.toLowerCase() === dark) darkStroke += 1;
        if (color.rgbToHsv(color.parse(edge.params.color)).v >= 0.5) light += 1;
      }
    }
    return { darkStroke, light, total, rate: darkStroke / Math.max(1, total) };
  };
  const plain = sample(0);
  const odd = sample(1);
  assert.ok(plain.total > 0 && odd.total > 0, 'shadow edges were drawn');
  assert.ok(plain.darkStroke > 0, 'the classic pool may fall back to the dark stroke');
  // the tamed text channel keeps a 30% dark fallback at raw 1, so the weird
  // pool leaves the dark tone far more often than the classic one
  assert.ok(odd.rate < plain.rate, `weird dark rate ${odd.rate} vs classic ${plain.rate}`);
  assert.ok(odd.light > 0, 'a weird look draws bright / coloured shadows');
});

test('a weird look leaves the text role for the fill and animates gradients', () => {
  const sample = (weird) => {
    let accent = 0;
    let animated = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const style = moods.generate({ axes: { ...PLAIN_AXES, weird }, seed, context: PLAIN_CONTEXT }).style;
      const fill = style.color && style.color.fill;
      if (!fill) continue;
      if (fill.kind === 'palette' && [3, 5, 6].includes(fill.index)) accent += 1;
      if (fill.kind === 'gradient' && fill.animate) animated += 1;
    }
    return { accent, animated };
  };
  const plain = sample(0);
  const odd = sample(1);
  assert.equal(plain.accent, 0, 'the classic fill always uses the text role');
  assert.ok(odd.accent > 0, 'a weird fill may use an accent role');
  assert.equal(plain.animated, 0);
  assert.ok(odd.animated > 0, 'a weird fill may animate its gradient');
});

test('a weird look stacks more effects and may stack three edges', () => {
  const sample = (weird) => {
    let stack = 0;
    let edge3 = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const style = moods.generate({ axes: { ...PLAIN_AXES, weird }, seed, context: PLAIN_CONTEXT }).style;
      stack += (style.hold || []).length + (style.edge || []).length + (style.post || []).length;
      if ((style.edge || []).length >= 3) edge3 += 1;
    }
    return { stack, edge3 };
  };
  const plain = sample(0);
  const odd = sample(1);
  assert.ok(odd.stack > plain.stack + 20, `stacks ${odd.stack} vs ${plain.stack}`);
  assert.equal(plain.edge3, 0, 'the classic draw never stacks three edges');
  assert.ok(odd.edge3 > 0, 'a weird draw may stack three edges');
});

test('a weird look jitters the text metrics and may leave centre alignment', () => {
  const sample = (weird) => {
    const sizes = [];
    const spacings = [];
    const heights = [];
    const aligns = new Set();
    for (let seed = 1; seed <= 30; seed += 1) {
      const style = moods.generate({ axes: { ...PLAIN_AXES, weird }, seed, context: PLAIN_CONTEXT }).style;
      sizes.push(style.text.size);
      spacings.push(style.text.letterSpacing);
      heights.push(style.text.lineHeight);
      aligns.add(style.text.align);
    }
    return { sizes, spacings, heights, aligns };
  };
  const plain = sample(0);
  const odd = sample(1);
  assert.deepEqual([...plain.aligns], ['center']);
  assert.ok([...odd.aligns].some((align) => align !== 'center'), `aligns ${[...odd.aligns]}`);
  assert.ok(variance(odd.sizes) > variance(plain.sizes) * 3, `size variance ${variance(odd.sizes)} vs ${variance(plain.sizes)}`);
  assert.ok(variance(odd.spacings) > 0 && variance(plain.spacings) < 1e-12, `spacing variance ${variance(odd.spacings)} vs ${variance(plain.spacings)}`);
  assert.ok(variance(odd.heights) > 0 && variance(plain.heights) < 1e-12, `height variance ${variance(odd.heights)} vs ${variance(plain.heights)}`);
});

test('a weird look moves parameters that have no recommended range', () => {
  const count = (weird) => {
    let off = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const style = moods.generate({ axes: { ...PLAIN_AXES, weird }, seed, context: PLAIN_CONTEXT }).style;
      for (const [group, instance] of instancesOf(style)) {
        const descriptor = fx.get(group, instance.type);
        for (const [key, value] of Object.entries(instance.params || {})) {
          const param = descriptor && (descriptor.params || []).find((entry) => entry.key === key);
          if (!param || (param.kind !== 'number' && param.kind !== 'int')) continue;
          if (Array.isArray(param.random) && param.random.length >= 2) continue;
          const fallback = param.default == null ? 0 : param.default;
          if (Math.abs(value - fallback) > 1e-9) off += 1;
        }
      }
    }
    return off;
  };
  assert.equal(count(0), 0, 'classic parameters keep their default');
  assert.ok(count(1) > 0, 'a weird draw moves them');
});

test('the loosened gates of a weird look', () => {
  const axes = { ...PLAIN_AXES, energy: 0.5 };
  const twist = moods.TRAITS.hold.twist; // minEnergy 0.72
  assert.equal(moods.allowed('hold', twist, { letterCount: 5 }, 'horizontal', { ...axes, weird: 0 }), false);
  assert.equal(moods.allowed('hold', twist, { letterCount: 5 }, 'horizontal', { ...axes, weird: 1 }), true);
  const arc = moods.TRAITS.layout.arc; // maxLetters 24
  assert.equal(moods.allowed('layout', arc, { letterCount: 30 }, 'horizontal', { ...axes, weird: 0 }), false);
  assert.equal(moods.allowed('layout', arc, { letterCount: 30 }, 'horizontal', { ...axes, weird: 1 }), true);
  const vertical = moods.TRAITS.layout.vertical;
  assert.equal(moods.allowed('layout', vertical, { letterCount: 5 }, 'horizontal', { ...axes, weird: 0 }), false);
  assert.equal(moods.allowed('layout', vertical, { letterCount: 5 }, 'horizontal', { ...axes, weird: 1 }), true);
  const row = moods.TRAITS.layout.row;
  assert.equal(moods.allowed('layout', row, { letterCount: 10 }, 'vertical', { ...axes, weird: 0 }), false);
  assert.equal(moods.allowed('layout', row, { letterCount: 10 }, 'vertical', { ...axes, weird: 1 }), true);
});

test('the gates of a weird look open at raw >= threshold/0.7', () => {
  const axes = { ...PLAIN_AXES, energy: 0.5 };
  // fontSize: minWeird 0.6 -> opens when text(raw) >= 0.6
  const fontSize = moods.EXT_TRAITS.hold.fontSize;
  assert.equal(moods.allowed('hold', fontSize, { letterCount: 5 }, 'horizontal', { ...axes, weird: 0.8 }), false);
  assert.equal(moods.allowed('hold', fontSize, { letterCount: 5 }, 'horizontal', { ...axes, weird: 1 }), true);
  // echoTrail: its 0.75 gate sits above the new text maximum (0.7) and can
  // never open automatically again
  const echoTrail = moods.EXT_TRAITS.post.echoTrail;
  assert.equal(moods.allowed('post', echoTrail, { letterCount: 5 }, 'horizontal', { ...axes, weird: 1 }), false);
});

test('at max weird the automatic picker stays clear of degrade / overlap effects', () => {
  const dissolves = new Set(['noiseDissolve', 'directionalDissolve', 'pixelDissolve', 'burnDissolve', 'halftoneDissolve', 'particleDissolve']);
  let tagged = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const style = moods.generate({ axes: { ...PLAIN_AXES, weird: 1 }, seed, context: PLAIN_CONTEXT }).style;
    for (const [group, instance] of instancesOf(style)) {
      assert.ok(!dissolves.has(instance.type), `${group}.${instance.type} leaked into a weird draw`);
      const descriptor = fx.get(group, instance.type);
      if (!descriptor) continue;
      const risky = descriptor.tags.includes('degrade') || descriptor.tags.includes('overlap');
      if (!risky) continue;
      tagged += 1;
      assert.ok(moods.WEIRD_TAG_OK.has(instance.type), `${group}.${instance.type} is not a readable overlap effect`);
    }
  }
  // the relaxation threshold (0.75) is above text(1) = 0.7, so no degrade or
  // overlap effect reaches an automatic draw any more
  assert.equal(tagged, 0, 'degrade / overlap effects are past the new axis maximum');
});

test('a weird background clip rolls an extended primitive', () => {
  const extended = new Set(Object.keys(moods.EXT_TRAITS.background));
  for (let seed = 1; seed <= 10; seed += 1) {
    const result = moods.rerollClipSpec('background', { axes: { ...PLAIN_AXES, weird: 1 }, seed, weirdBg: true });
    assert.ok(result && extended.has(result.spec.type), `seed ${seed}: ${result && result.spec.type}`);
  }
  // weird 0 still rolls the classic noise gradient / gradient / solid set
  const plain = moods.rerollClipSpec('background', { axes: { ...PLAIN_AXES, weird: 0 }, seed: 1 });
  assert.ok(['noiseGradient', 'gradient', 'solid'].includes(plain.spec.type));
});

test('the backdrop channel saturates at raw 0.4', () => {
  const plane = (weird) => {
    const result = moods.rerollClipSpec('backdrop', { axes: { ...PLAIN_AXES, weird }, seed: 3 });
    assert.ok(result && result.spec.type === 'combo', 'a covered mid clip');
    return result.spec.params.list[0];
  };
  // raw 0.2 -> bg 0.5, raw 0.4 -> a fully covered frame with text sync
  assert.equal(plane(0.2).params.coverage, 0.5);
  assert.equal(plane(0.4).params.coverage, 1);
  const full = moods.rerollClipSpec('backdrop', { axes: { ...PLAIN_AXES, weird: 0.4 }, seed: 3 });
  assert.ok(full.spec.params.animate.sync > 0, `sync ${full.spec.params.animate.sync}`);
  // weird 0 keeps the classic two colours and no animate block
  const zero = moods.rerollClipSpec('backdrop', { axes: { ...PLAIN_AXES, weird: 0 }, seed: 3 });
  assert.notEqual(zero.spec.type, 'combo');
});

test('weirdPalette shifts the hues and keeps the text readable', () => {
  let changed = 0;
  let worst = Infinity;
  for (let seed = 1; seed <= 20; seed += 1) {
    const palette = moods.generatePalette(rng.mulberry32(seed), PLAIN_AXES);
    const next = moods.weirdPalette(rng.mulberry32(seed + 100), palette, 1);
    assert.ok(next && next.colors.length === palette.colors.length);
    const before = color.rgbToHsv(color.parse(palette.colors[3]));
    const after = color.rgbToHsv(color.parse(next.colors[3]));
    if (Math.abs(before.h - after.h) > 5) changed += 1;
    worst = Math.min(worst, color.contrastRatio(color.parse(next.colors[2]), color.parse(next.colors[0])));
  }
  assert.ok(changed >= 15, `hue changed for ${changed}/20 seeds`);
  assert.ok(worst >= 3, `contrast ${worst}`);
  assert.equal(moods.weirdPalette(rng.mulberry32(1), { colors: ['#000000', '#111111', '#ffffff'] }, 0), null);
});

test('weirdDecoration exaggerates an edge but tames the glow', () => {
  const outline = moods.weirdDecoration({ type: 'outline', params: { width: 3 } }, 'edge', rng.mulberry32(1), 1);
  assert.ok(outline.params.width > 3 && outline.params.width <= 20, `width ${outline.params.width}`);
  const wide = moods.weirdDecoration({ type: 'outline', params: { width: 18 } }, 'edge', rng.mulberry32(2), 1);
  assert.ok(wide.params.width <= 20, `clamped width ${wide.params.width}`);
  // the glows shrink with the raw axis (they no longer bleed over the letters)
  const glow0 = moods.weirdDecoration({ type: 'neonGlow', params: { radius: 18, intensity: 1 } }, 'edge', rng.mulberry32(3), 0.7, 0);
  assert.equal(glow0.params.radius, 18, 'raw 0 leaves the glow alone');
  assert.equal(glow0.params.intensity, 1);
  const glow1 = moods.weirdDecoration({ type: 'neonGlow', params: { radius: 18, intensity: 1 } }, 'edge', rng.mulberry32(3), 0.7, 1);
  assert.ok(Math.abs(glow1.params.radius - 18 * 0.55) < 1e-9, `radius ${glow1.params.radius}`);
  assert.ok(Math.abs(glow1.params.intensity - 0.55) < 1e-9, `intensity ${glow1.params.intensity}`);
  // weird 0 is untouched and consumes no random
  const untouched = moods.weirdDecoration({ type: 'outline', params: { width: 3 } }, 'edge', rng.mulberry32(4), 0);
  assert.deepEqual(untouched.params, { width: 3 });
  // other groups are left alone
  const other = moods.weirdDecoration({ type: 'outline', params: { width: 3 } }, 'post', rng.mulberry32(5), 1);
  assert.deepEqual(other.params, { width: 3 });
});

test('tameGlow is a no-op at 0 and separates a bare glow with an outline', () => {
  const zero = { edge: [{ type: 'neonGlow', params: { radius: 40, intensity: 2 }, enabled: true }] };
  assert.equal(moods.tameGlow(zero, 0), zero);
  assert.deepEqual(zero.edge[0].params, { radius: 40, intensity: 2 }, 'raw 0 scales nothing');
  const style = { edge: [{ type: 'neonGlow', params: { radius: 40, intensity: 2 }, enabled: true }] };
  moods.tameGlow(style, 1);
  assert.ok(Math.abs(style.edge[0].params.radius - 40 * 0.55) < 1e-9, `radius ${style.edge[0].params.radius}`);
  assert.ok(Math.abs(style.edge[0].params.intensity - 2 * 0.55) < 1e-9, `intensity ${style.edge[0].params.intensity}`);
  assert.equal(style.edge.length, 2, 'the outline joins the stack');
  assert.equal(style.edge[1].type, 'outline');
  assert.equal(style.edge[1].params.width, 2);
  assert.equal(style.edge[1].params.color, null);
  assert.equal(style.edge[1].enabled, true);
  // a shadow already separates the letters: no outline is added
  const shadowed = { edge: [{ type: 'innerGlow', params: { radius: 30, intensity: 1 } }, { type: 'dropShadow', params: {} }] };
  moods.tameGlow(shadowed, 1);
  assert.ok(shadowed.edge[0].params.radius < 30);
  assert.equal(shadowed.edge.length, 2);
  // below raw 0.3 the glow is tamed but no outline appears
  const soft = { edge: [{ type: 'innerGlow', params: { radius: 30, intensity: 1 } }] };
  moods.tameGlow(soft, 0.2);
  assert.ok(soft.edge[0].params.radius < 30);
  assert.equal(soft.edge.length, 1);
  // taming the same instance twice does not compound the scale
  const once = soft.edge[0].params.radius;
  moods.tameGlow(soft, 1);
  assert.equal(soft.edge[0].params.radius, once, 'idempotent per instance');
});

test('looks.weightFor prefers the look nearest the tamed weird target', () => {
  const axes = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5, weird: 1 };
  const base = { speed: 0.5, energy: 0.5, softness: 0.5, density: 0.5, brightness: 0.5 };
  const entry = (n, weird) => ({ n, axes: { ...base, weird }, motion: { norm: looks.motionTarget(axes) }, themes: [] });
  // the target is read through text(), so raw 1 wants a look classified ~0.7
  const mapped = entry(1, 0.7);
  const mid = entry(2, 0.5);
  const over = entry(3, 1);
  const calm = entry(4, 0);
  assert.ok(looks.weightFor(mapped, { axes }) > looks.weightFor(mid, { axes }));
  assert.ok(looks.weightFor(mid, { axes }) > looks.weightFor(over, { axes }));
  assert.ok(looks.weightFor(over, { axes }) > looks.weightFor(calm, { axes }));
  // the motion target also rises with the axis
  assert.ok(looks.motionTarget(axes) > looks.motionTarget({ ...axes, weird: 0 }));
});
