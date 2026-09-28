'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fx = require('../../renderer/js/lyrics/effects/registry.js');
require('../../renderer/js/lyrics/effects/repeat.js');
const repeat = require('../../renderer/js/lyrics/effects/repeat.js');
const rng = require('../../renderer/js/lyrics/rng.js');

const BEAT = { start: 0, end: 4 };
const BOX = { w: 500, h: 120, cx: 960, cy: 540 };
const DIMS = {
  width: 1920,
  height: 1080,
  aspect: 16 / 9,
  box: BOX,
  safeArea: { left: 38, top: 22, right: 38, bottom: 22 },
};

function instance(type, params) {
  return { type, params: params || {}, enabled: true };
}

function planAt(type, params, t, dims) {
  return repeat.plan(instance(type, params), BEAT, t == null ? 1 : t, dims || DIMS, rng.mulberry32(7));
}

function halfExtents(copy, w, h) {
  const scale = copy.scale == null ? 1 : copy.scale;
  const rad = ((copy.rotate || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { x: (cos * w * scale + sin * h * scale) / 2, y: (sin * w * scale + cos * h * scale) / 2 };
}

function overlap(a, b) {
  const ea = halfExtents(a, BOX.w, BOX.h);
  const eb = halfExtents(b, BOX.w, BOX.h);
  return Math.abs(a.dx - b.dx) < ea.x + eb.x - 0.5 && Math.abs(a.dy - b.dy) < ea.y + eb.y - 0.5;
}

function framesOf(copies) {
  return copies.filter((copy) => !copy.isMain);
}

test('the repeat group registers every arrangement', () => {
  const list = fx.list('repeat');
  assert.equal(list.length, repeat.TYPES.length);
  for (const type of repeat.TYPES) {
    const descriptor = fx.get('repeat', type);
    assert.ok(descriptor, `repeat.${type} registered`);
    assert.ok(descriptor.tags.includes('repeat'));
    assert.equal(typeof descriptor.normalize, 'function');
    assert.equal(typeof descriptor.costOf, 'function');
  }
  assert.equal(fx.GROUP_DEFAULTS.repeat.type, 'none');
});

test('withDefaults applies the repeat schema and normalize hook', () => {
  const grid = fx.withDefaults({ type: 'grid' }, 'repeat');
  assert.equal(grid.params.copies, 2);
  assert.equal(grid.params.sequence, 'cascade');
  const brick = fx.withDefaults({ type: 'brick' }, 'repeat');
  assert.equal(brick.params.copies, 'many');
  assert.equal(brick.params.fit, 'overflow');
  const none = fx.withDefaults(null, 'repeat');
  assert.equal(none.type, 'none');
});

test('copies drive the on-screen count', () => {
  const straight = ['stackV', 'rowH', 'diagonal'];
  for (const type of straight) {
    for (const copies of [1, 2, 3]) {
      const copiesList = framesOf(planAt(type, { copies }));
      assert.equal(copiesList.length, copies, `${type} copies=${copies}`);
    }
  }
  for (const type of ['grid', 'radial', 'fan', 'tunnel', 'scatter']) {
    assert.equal(framesOf(planAt(type, { copies: 1 })).length, 2, `${type} copies=1 normalizes to 2 copies`);
    assert.equal(framesOf(planAt(type, { copies: 3 })).length, 3, `${type} copies=3`);
  }
  for (const type of repeat.TYPES) {
    const list = framesOf(planAt(type, { copies: 'many' }));
    const expected = repeat.MANY_TOTAL[type] ? repeat.MANY_TOTAL[type] - 1 : null;
    if (expected != null) assert.equal(list.length, expected, `${type} many total`);
    assert.ok(list.length + 1 <= repeat.MAX_COPIES, `${type} respects the 40 copy cap`);
  }
});

test('normalize enforces the combination table', () => {
  const base = { copies: 2, var1Attr: 'size', var1Rule: 'progress' };
  assert.equal(repeat.normalize('stackV', { ...base, copies: 1 }).var1Rule, 'oddOne');
  assert.equal(repeat.normalize('stackV', { ...base, var1Rule: 'alternate' }).var1Rule, 'oddOne');
  assert.equal(repeat.normalize('grid', { copies: 1 }).copies, 2);
  assert.equal(repeat.normalize('radial', { copies: 1 }).copies, 2);
  assert.equal(repeat.normalize('brick', { copies: 2 }).copies, 'many');
  assert.equal(repeat.normalize('fill', { copies: 1 }).copies, 'many');
  assert.equal(repeat.normalize('stackV', { copies: 'many', sequence: 'counterSlide' }).sequence, 'counterScroll');
  assert.equal(repeat.normalize('stackV', { copies: 2, sequence: 'counterScroll' }).sequence, 'counterSlide');
  assert.equal(repeat.normalize('radial', { copies: 'many', sequence: 'counterScroll' }).sequence, 'cascade');
  assert.equal(repeat.normalize('rowH', { copies: 1, sequence: 'wave' }).sequence, 'static');
  const manyOdd = repeat.normalize('stackV', { copies: 'many', var1Attr: 'decor', var1Rule: 'oddOne', var1Target: 'last' });
  assert.equal(manyOdd.var1Target, 'main');
  const sameAttr = repeat.normalize('stackV', { copies: 3, var1Attr: 'size', var2Attr: 'size' });
  assert.equal(sameAttr.var2Attr, 'none');
  assert.equal(repeat.normalize('stackV', { dir: 'down', mainIndex: 'center' }).mainIndex, 'end');
  assert.equal(repeat.normalize('stackV', { dir: 'both', mainIndex: 'center' }).mainIndex, 'center');
  assert.equal(repeat.normalize('stackV', { copies: '2' }).copies, 2);
  assert.equal(repeat.normalize('none', {}).copies, 1);
});

test('count bins follow the design table', () => {
  assert.equal(repeat.countBin('stackV', { copies: 1 }), 'pair');
  assert.equal(repeat.countBin('stackV', { copies: 2 }), 'few');
  assert.equal(repeat.countBin('stackV', { copies: 3 }), 'few');
  assert.equal(repeat.countBin('grid', { copies: 2 }), 'tri');
  assert.equal(repeat.countBin('grid', { copies: 3 }), 'quad');
  assert.equal(repeat.countBin('radial', { copies: 2 }), 'tri');
  assert.equal(repeat.countBin('brick', {}), 'many');
  assert.equal(repeat.countBin('stackV', { copies: 'many' }), 'many');
});

test('plan is deterministic for a given rng', () => {
  for (const type of repeat.TYPES) {
    for (const copies of [1, 2, 3, 'many']) {
      const first = planAt(type, { copies }, 1.3);
      const second = planAt(type, { copies }, 1.3);
      assert.deepEqual(first, second, `${type} copies=${copies}`);
    }
  }
  const a = repeat.plan(instance('scatter', { copies: 3 }), BEAT, 1, DIMS, rng.mulberry32(11));
  const b = repeat.plan(instance('scatter', { copies: 3 }), BEAT, 1, DIMS, rng.mulberry32(12));
  assert.notDeepEqual(a, b, 'scatter reacts to the seed');
});

test('copies never overlap, except tunnel which is meant to stack', () => {
  for (const type of repeat.TYPES) {
    for (const copies of [1, 2, 3, 'many']) {
      const list = framesOf(planAt(type, { copies }, 1));
      if (type !== 'tunnel') {
        // the main string may be overlapped from behind when `fit: shrink`
        // pulls the arrangement in, but the copies never overlap each other
        for (let i = 0; i < list.length; i += 1) {
          for (let j = i + 1; j < list.length; j += 1) {
            assert.ok(!overlap(list[i], list[j]), `${type} copies=${copies} pair ${i}/${j} overlaps`);
          }
        }
      }
    }
  }
  const tunnel = planAt('tunnel', { copies: 'many' }, 1);
  assert.ok(tunnel.length > 2, 'tunnel produces copies');
  assert.ok(overlap(tunnel[1], tunnel[2]), 'tunnel copies intentionally overlap');
});

test('brick and fill fill the frame, cull outside copies and cap at 40', () => {
  for (const type of ['brick', 'fill']) {
    const list = framesOf(planAt(type, {}, 1));
    assert.ok(list.length > 4, `${type} fills the frame`);
    assert.ok(list.length + 1 <= repeat.MAX_COPIES, `${type} capped at 40`);
    for (const copy of list) {
      const box = halfExtents(copy, BOX.w, BOX.h);
      const cx = BOX.cx + copy.dx;
      const cy = BOX.cy + copy.dy;
      assert.ok(cx - box.x < DIMS.width + 0.5 && cx + box.x > -0.5, `${type} visible horizontally`);
      assert.ok(cy - box.y < DIMS.height + 0.5 && cy + box.y > -0.5, `${type} visible vertically`);
    }
  }
});

test('fit shrink keeps rowH inside a 9:16 frame', () => {
  const portrait = {
    width: 1080,
    height: 1920,
    aspect: 9 / 16,
    box: { w: 700, h: 120, cx: 540, cy: 960 },
    safeArea: { left: 22, top: 38, right: 22, bottom: 38 },
  };
  const list = framesOf(planAt('rowH', { copies: 3 }, 1, portrait));
  assert.equal(list.length, 3);
  for (const copy of list) {
    const box = halfExtents(copy, portrait.box.w, portrait.box.h);
    const cx = portrait.box.cx + copy.dx;
    const cy = portrait.box.cy + copy.dy;
    assert.ok(cx - box.x >= portrait.safeArea.left - 0.5, `left edge ${cx - box.x}`);
    assert.ok(cx + box.x <= portrait.width - portrait.safeArea.right + 0.5, `right edge ${cx + box.x}`);
    assert.ok(cy - box.y >= portrait.safeArea.top - 0.5, `top edge ${cy - box.y}`);
    assert.ok(cy + box.y <= portrait.height - portrait.safeArea.bottom + 0.5, `bottom edge ${cy + box.y}`);
  }
});

test('sequences change the copies over time', () => {
  const cascade = planAt('stackV', { copies: 3, sequence: 'cascade', seqSpeed: 'fast' }, 0.05);
  const far = cascade[cascade.length - 1];
  assert.equal(far.envelope, 0, 'the farthest copy has not appeared yet');
  const later = planAt('stackV', { copies: 3, sequence: 'cascade', seqSpeed: 'fast' }, 2);
  assert.equal(later[later.length - 1].envelope, 1, 'everything is visible mid-beat');

  const staticPlan = planAt('stackV', { copies: 3, sequence: 'static' }, 2);
  const envelopes = new Set(framesOf(staticPlan).map((copy) => copy.envelope));
  assert.deepEqual([...envelopes], [1], 'static copies share one envelope');

  const wave = planAt('stackV', { copies: 3, sequence: 'wave' }, 0.3);
  const moved = framesOf(wave).some((copy) => Math.abs(copy.dy) > 0.001);
  assert.ok(moved, 'wave moves the copies');

  const slide = planAt('stackV', { copies: 3, sequence: 'counterSlide' }, 1);
  const slideLater = planAt('stackV', { copies: 3, sequence: 'counterSlide' }, 2);
  assert.notEqual(slide[1].dx, slideLater[1].dx, 'counterSlide moves horizontally');
});

test('size progress is monotonic and alternate toggles', () => {
  const progress = planAt('stackV', { copies: 3, var1Attr: 'size', var1Rule: 'progress' }, 1);
  const scales = progress.map((copy) => copy.scale);
  for (let i = 1; i < scales.length; i += 1) {
    assert.ok(scales[i] < scales[i - 1], `scale ${i} ${scales[i]} < ${scales[i - 1]}`);
  }
  const alternate = planAt('stackV', { copies: 3, var1Attr: 'size', var1Rule: 'alternate' }, 1);
  assert.equal(alternate[0].scaleMul, 1);
  assert.equal(alternate[1].scaleMul, 0.6);
  assert.equal(alternate[2].scaleMul, 1);
  assert.equal(alternate[3].scaleMul, 0.6);
});

test('alternate is a checkerboard on grid, brick and fill', () => {
  const grid = planAt('grid', { copies: 'many', fit: 'overflow', var1Attr: 'size', var1Rule: 'alternate' }, 1);
  const keysByCell = new Map();
  for (const copy of framesOf(grid)) {
    const key = `${Math.round(copy.dx)}:${Math.round(copy.dy)}`;
    keysByCell.set(key, copy);
  }
  for (const copy of framesOf(grid)) {
    const right = keysByCell.get(`${Math.round(copy.dx + 680)}:${Math.round(copy.dy)}`);
    if (right) assert.notEqual(copy.alternateKey, right.alternateKey, 'horizontal neighbours alternate');
    const below = keysByCell.get(`${Math.round(copy.dx)}:${Math.round(copy.dy + 300)}`);
    if (below) assert.notEqual(copy.alternateKey, below.alternateKey, 'vertical neighbours alternate');
  }
  for (const type of ['brick', 'fill']) {
    const list = framesOf(planAt(type, { var1Attr: 'size', var1Rule: 'alternate' }, 1));
    assert.ok(list.some((copy) => copy.alternateKey === 0), `${type} has even cells`);
    assert.ok(list.some((copy) => copy.alternateKey === 1), `${type} has odd cells`);
  }
});

test('oddOne changes exactly one copy', () => {
  const decor = planAt('stackV', { copies: 3, var1Attr: 'decor', var1Rule: 'oddOne' }, 1);
  assert.equal(decor.filter((copy) => copy.decor === 'solid').length, 1);
  assert.equal(decor.filter((copy) => copy.decor === 'hollow').length, decor.length - 1);
  const size = planAt('stackV', { copies: 3, var1Attr: 'size', var1Rule: 'oddOne' }, 1);
  assert.equal(size.filter((copy) => copy.scaleMul > 1.5).length, 1, 'one copy stands out');
  const last = planAt('stackV', { copies: 3, var1Attr: 'size', var1Rule: 'oddOne', var1Target: 'last' }, 1);
  const oddLast = last.filter((copy) => copy.scaleMul > 1.5);
  assert.equal(oddLast.length, 1);
  assert.equal(oddLast[0].index, last.length - 1, 'the last copy is the odd one');
});

test('random variation never repeats the previous value', () => {
  const colors = planAt('stackV', { copies: 'many', var1Attr: 'color', var1Rule: 'random' }, 1);
  const indices = framesOf(colors).map((copy) => copy.colorIndex);
  for (let i = 1; i < indices.length; i += 1) assert.notEqual(indices[i], indices[i - 1], `colour ${i}`);
  const decor = planAt('stackV', { copies: 'many', var1Attr: 'decor', var1Rule: 'random' }, 1);
  const decors = framesOf(decor).map((copy) => copy.decor);
  for (let i = 1; i < decors.length; i += 1) assert.notEqual(decors[i], decors[i - 1], `decor ${i}`);
});

test('decor progress produces all four decorations', () => {
  const list = framesOf(planAt('stackV', { copies: 'many', var1Attr: 'decor', var1Rule: 'progress' }, 1));
  const kinds = new Set(list.map((copy) => copy.decor));
  assert.deepEqual([...kinds].sort(), ['glow', 'hollow', 'shadow', 'solid']);
});

test('variation presets expand into the curated combinations', () => {
  const fade = planAt('stackV', { copies: 3, variationPreset: 'perspectiveFade' }, 1);
  assert.equal(fade[0].scaleMul, 1);
  assert.ok(fade[1].scaleMul < 1 && fade[2].scaleMul < fade[1].scaleMul, 'perspective fade shrinks with distance');
  assert.ok(fade[3].lightAmount > fade[1].lightAmount, 'light grows with distance');

  const pop = planAt('stackV', { copies: 3, variationPreset: 'popAlternate' }, 1);
  assert.deepEqual(new Set(framesOf(pop).map((copy) => copy.decor)), new Set(['solid', 'hollow']));

  const hero = planAt('stackV', { copies: 3, variationPreset: 'heroOutline' }, 1);
  assert.equal(hero.filter((copy) => copy.decor === 'solid').length, 1, 'heroOutline keeps one solid');

  const rainbow = planAt('stackV', { copies: 'many', variationPreset: 'rainbowStep' }, 1);
  const hues = framesOf(rainbow).map((copy) => copy.hueShift);
  assert.ok(hues[hues.length - 1] > hues[0], 'rainbowStep hue advances');
  assert.ok(Math.abs(hues[hues.length - 1] - 360) < 1e-6 || hues[hues.length - 1] > 300, 'many reaches a full turn');
});

test('presets fall back when there are not enough copies', () => {
  const pop = planAt('stackV', { copies: 1, variationPreset: 'popAlternate' }, 1);
  assert.equal(pop.filter((copy) => copy.decor === 'solid').length, 1, 'two copies use oddOne');
});

test('fill and brick fade the copies around the main text', () => {
  const list = framesOf(planAt('fill', {}, 1));
  const near = list.find((copy) => Math.hypot(copy.dx, copy.dy) < 500);
  const far = list.find((copy) => Math.hypot(copy.dx, copy.dy) > 700);
  assert.ok(near && far, 'has near and far copies');
  assert.ok(near.opacity < far.opacity, `near ${near.opacity} < far ${far.opacity}`);
});

test('variation is deterministic per seed', () => {
  const params = { copies: 'many', var1Attr: 'decor', var1Rule: 'random', var2Attr: 'color', var2Rule: 'random' };
  const first = planAt('scatter', params, 1.3);
  const second = planAt('scatter', params, 1.3);
  assert.deepEqual(first, second);
});

test('font variation picks classes from the loaded typefaces', () => {
  const dims = { ...DIMS, mainFontClass: 'sans', fontClasses: ['sans', 'serif', 'round', 'hand', 'pop'] };
  const plan = repeat.plan(instance('stackV', { copies: 3, var1Attr: 'font', var1Rule: 'progress' }), BEAT, 1, dims, rng.mulberry32(7));
  const classes = plan.map((copy) => copy.fontClass);
  assert.equal(classes[0], null, 'the main keeps its typeface');
  assert.equal(new Set(classes.filter(Boolean)).size, 3, 'three different variant classes');
  assert.ok(classes.slice(1).every((cls) => cls && cls !== 'sans'), 'variants stay away from the main class');

  const alternate = repeat.plan(instance('stackV', { copies: 3, var1Attr: 'font', var1Rule: 'alternate' }), BEAT, 1, dims, rng.mulberry32(7));
  const alternates = new Set(alternate.map((copy) => copy.fontClass));
  assert.ok(alternates.size >= 2, 'alternate switches between two classes');

  const odd = repeat.plan(instance('stackV', { copies: 3, var1Attr: 'font', var1Rule: 'oddOne' }), BEAT, 1, dims, rng.mulberry32(7));
  assert.equal(odd.filter((copy) => copy.fontClass).length, 1, 'oddOne swaps exactly one typeface');

  const without = repeat.plan(instance('stackV', { copies: 3, var1Attr: 'font', var1Rule: 'progress' }), BEAT, 1, DIMS, rng.mulberry32(7));
  assert.ok(without.every((copy) => copy.fontClass == null), 'no loaded classes leaves the main typeface');
});

test('font variation is capped at three variant classes', () => {
  const dims = { ...DIMS, mainFontClass: 'sans', fontClasses: ['sans', 'serif', 'round', 'hand', 'pop', 'display'] };
  const plan = repeat.plan(instance('stackV', { copies: 'many', var1Attr: 'font', var1Rule: 'progress' }), BEAT, 1, dims, rng.mulberry32(7));
  const classes = new Set(framesOf(plan).map((copy) => copy.fontClass).filter(Boolean));
  assert.ok(classes.size <= 3, `classes ${classes.size}`);
});

test('costOf counts extra typefaces and decorations', () => {
  const descriptor = fx.get('repeat', 'stackV');
  const solid = descriptor.costOf({ copies: 3 }, null);
  const decorated = descriptor.costOf({ copies: 3, var1Attr: 'decor', var1Rule: 'progress' }, null);
  const fonts = descriptor.costOf({ copies: 3, var1Attr: 'font', var1Rule: 'progress' }, null);
  assert.equal(decorated, solid + 1);
  assert.equal(fonts, solid + 2);
});

test('signature distinguishes arrangements and params', () => {
  assert.equal(repeat.signature(instance('stackV', { copies: 2 })), repeat.signature(instance('stackV', { copies: '2' })));
  assert.notEqual(repeat.signature(instance('stackV', { copies: 2 })), repeat.signature(instance('rowH', { copies: 2 })));
  assert.notEqual(repeat.signature(instance('stackV', { copies: 2 })), repeat.signature(instance('stackV', { copies: 3 })));
  assert.equal(repeat.signature(instance('none', {})), 'none');
});

test('costOf uses the descriptor hook', () => {
  const descriptor = fx.get('repeat', 'grid');
  assert.ok(descriptor.costOf({ copies: 3 }) >= 2);
  const styleCost = fx.costOf({ repeat: { type: 'stackV', params: { copies: 3 } } });
  assert.equal(styleCost, fx.get('repeat', 'stackV').costOf({ copies: 3 }, null));
});
