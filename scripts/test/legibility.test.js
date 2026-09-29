'use strict';

// The legibility contract: every automatically generated look must keep the
// lyrics readable while the weird / fear axes are on. `check` reports what
// breaks, `repair` returns the closest passing style. At weird 0 / fear 0 the
// generator is a no-op (the direct-w0 fixture pins the bytes in direct.test).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));
const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const legibility = requirePart('renderer/js/lyrics/legibility.js');
const moods = requirePart('renderer/js/lyrics/moods.js');
const genres = requirePart('renderer/js/lyrics/genres.js');
const rng = requirePart('renderer/js/lyrics/rng.js');

const FRAME = { width: 1920, height: 1080 };
const CONTEXT = { letterCount: 12, cjk: false, hasPrevious: true, badgeId: false, hasCard: false, aspect: '16:9' };
const AXES = ['speed', 'energy', 'softness', 'density', 'brightness', 'smartness', 'fear'];
const PALETTE = {
  id: 't', name: 't',
  colors: ['#101018', '#202838', '#eef2ff', '#ff8a3d', '#05060a', '#ffc247', '#4dc8ff'],
};

function plainStyle(overrides) {
  return {
    palette: JSON.parse(JSON.stringify(PALETTE)),
    color: { fill: { kind: 'palette', index: 2 }, stroke: { kind: 'palette', index: 4 } },
    text: { fontId: 'NotoSans-Regular', size: 96, weight: 400, letterSpacing: 0, lineHeight: 1.2, align: 'center', maxWidth: 0.86 },
    enter: { type: 'fade', params: {}, enabled: true, motion: { in: { duration: 0.25, delay: 0, ease: 'cubicOut' }, stagger: { each: 0.005, order: 'ltr', unit: 'letter' } } },
    exit: { type: 'fade', params: {}, enabled: true, motion: { out: { duration: 0.2, delay: 0, ease: 'cubicIn' }, stagger: { each: 0.005, order: 'ltr', unit: 'letter' } } },
    ...(overrides || {}),
  };
}

test('check reports the contrast, size, tag and background issues it fixes', () => {
  // a dark text on a dark background
  const bad = plainStyle({ color: { fill: { kind: 'solid', value: '#151520' } } });
  const result = legibility.check(bad, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.startsWith('contrast')));
  // the text background decides when one is on
  const shapeBad = plainStyle({
    bgShape: { type: 'square', params: { unit: 'cell', width: 1, height: 1, opacity: 1, varyColors: ['#ffffff'] } },
  });
  assert.ok(legibility.check(shapeBad, { frame: FRAME, duration: 3 }).reasons.some((reason) => reason.startsWith('contrast')));
  // a tiny size
  const small = plainStyle({ text: { size: 20 } });
  assert.ok(legibility.check(small, { frame: FRAME, duration: 3, motion: false }).reasons.includes('size'));
  // an oversized text background
  const bigBg = plainStyle({ bgShape: { type: 'square', params: { unit: 'cell', width: 2, height: 2, opacity: 1 } } });
  assert.ok(legibility.check(bigBg, { frame: FRAME, duration: 3, motion: false }).reasons.some((reason) => reason.startsWith('bg-size')));
  // an unreadable tag without an allow entry
  const tagged = plainStyle({ post: [{ type: 'pixelate', params: { size: 8 }, enabled: true }] });
  assert.ok(legibility.check(tagged, { frame: FRAME, duration: 3, motion: false }).reasons.includes('tag:post.pixelate'));
  // an allow-listed tag passes
  const allowed = plainStyle({ post: [{ type: 'glitchSlice', params: { slices: 4, offset: 0.2 }, enabled: true }] });
  assert.ok(!legibility.check(allowed, { frame: FRAME, duration: 3, motion: false }).reasons.some((reason) => reason.startsWith('tag')));
  // a post over its cap
  const capped = plainStyle({ post: [{ type: 'pixelate', params: { size: 64 }, enabled: true }] });
  assert.ok(legibility.check(capped, { frame: FRAME, duration: 3, motion: false }).reasons.some((reason) => reason.startsWith('post-cap')));
});

test('the static window accepts a settled look and rejects a warping one', () => {
  const calm = plainStyle();
  assert.equal(legibility.staticWindow(calm, { frame: FRAME, duration: 3, letterCount: 12 }).ok, true);
  const warping = plainStyle({ hold: [{ type: 'wobbleWarp', params: { amount: 0.5, speed: 2 }, enabled: true }] });
  assert.equal(legibility.staticWindow(warping, { frame: FRAME, duration: 3, letterCount: 12 }).ok, false);
  // a static formation (a large spiral scale) reads as settled...
  const spiral = plainStyle({ layout: { type: 'spiral', params: {}, enabled: true } });
  assert.equal(legibility.check(spiral, { frame: FRAME, duration: 3, letterCount: 12 }).reasons.some((reason) => reason.startsWith('motion')), false);
});

test('repair fixes contrast, tags and motion without touching a passing style', () => {
  const good = plainStyle();
  const untouched = legibility.repair(good, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(untouched.changed, false);
  assert.equal(untouched.style, good);
  const broken = plainStyle({
    color: { fill: { kind: 'solid', value: '#151520' } },
    post: [{ type: 'pixelate', params: { size: 64 }, enabled: true }],
    hold: [{ type: 'wobbleWarp', params: { amount: 0.5, speed: 2 }, enabled: true }],
  });
  const repaired = legibility.repair(broken, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(repaired.changed, true);
  const after = legibility.check(repaired.style, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(after.ok, true, after.reasons.join(' / '));
  // the original is never mutated
  assert.equal(broken.post[0].type, 'pixelate');
  assert.equal(broken.hold[0].type, 'wobbleWarp');
});

test('the background shape hands the contrast to fgAutoContrast instead of flattening the fill', () => {
  const style = plainStyle({
    bgShape: { type: 'bracket', params: { unit: 'em', width: 0.4, height: 0.4, opacity: 1, varyColors: ['#00bbf9', '#081dff'] } },
  });
  const before = legibility.check(style, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(before.ok, false);
  const repaired = legibility.repair(style, { frame: FRAME, duration: 3, letterCount: 12 });
  assert.equal(repaired.style.bgShape.params.fgAutoContrast, true);
  assert.equal(repaired.style.color.fill.kind, 'palette', 'the fill role survives');
  assert.equal(repaired.style.color.fill.index, 2);
  assert.equal(legibility.check(repaired.style, { frame: FRAME, duration: 3, letterCount: 12 }).ok, true);
});

test('the figure gate recolours and then dims a figure over the text', () => {
  const palette = PALETTE.colors;
  const spec = {
    type: 'figure',
    params: { motif: 'halftone', sync: 'beat', density: 1, color: '#eef2ff', beats: [{ start: 0, end: 3, move: { in: 'pop', hold: 'pulse', out: 'fade' }, variant: 0, accent: false }] },
  };
  const ctx = { frame: FRAME, duration: 3, palette, textColors: [palette[2]], textBox: { x0: FRAME.width * 0.2, y0: FRAME.height * 0.38, x1: FRAME.width * 0.8, y1: FRAME.height * 0.62 } };
  const ratio = legibility.figureOverlap(spec, ctx);
  assert.ok(ratio > legibility.FIGURE_OVERLAP, `overlap ${ratio}`);
  const repaired = legibility.repairFigureSpec(spec, ctx);
  assert.ok(repaired !== spec);
  const after = legibility.figureOverlap(repaired, ctx);
  assert.ok(after <= legibility.FIGURE_OVERLAP, `after ${after} vs ${ratio}`);
  assert.equal(repaired.params.opacity, 0.35);
  // the source spec is untouched
  assert.equal(spec.params.color, '#eef2ff');
});

test('the fully-displayed hold follows the weird axis (0.1 s at 0.6)', () => {
  assert.equal(legibility.holdMinFor(0, 0), 0);
  assert.ok(Math.abs(legibility.holdMinFor(0.6, 0) - 0.1) < 1e-9);
  assert.ok(legibility.holdMinFor(0.4, 0) > 0.1, 'lower weird wants a longer hold');
  assert.ok(legibility.holdMinFor(0.8, 0) < 0.1 && legibility.holdMinFor(0.8, 0) > 0, 'higher weird wants a shorter hold');
  assert.equal(legibility.holdMinFor(1, 0), 0);
  assert.equal(legibility.holdMinFor(0, 0.5), 0.1, 'a fear-only draw keeps the floor');
  // a cue whose enter and exit leave almost no fully shown window fails...
  const rushed = plainStyle({
    enter: { type: 'fade', params: {}, enabled: true, motion: { in: { duration: 1.5, delay: 0, ease: 'linear' }, stagger: { each: 0.01, order: 'ltr', unit: 'letter' } } },
    exit: { type: 'fade', params: {}, enabled: true, motion: { out: { duration: 1.45, delay: 0, ease: 'linear' }, stagger: { each: 0.01, order: 'ltr', unit: 'letter' } } },
  });
  const ctx = { frame: FRAME, duration: 3, letterCount: 12, holdMin: legibility.holdMinFor(0.6, 0) };
  const before = legibility.staticWindow(rushed, ctx);
  assert.equal(before.ok, false);
  assert.ok(before.fullSeconds < 0.1, `full ${before.fullSeconds}`);
  // ... and the repair guarantees it
  const repaired = legibility.repair(rushed, ctx);
  const after = legibility.staticWindow(repaired.style, ctx);
  assert.equal(after.ok, true, JSON.stringify(after));
  assert.ok(after.fullSeconds >= 0.1 - 1e-9, `full after ${after.fullSeconds}`);
});

test('the axis grid always generates a passing look (weird 0.6-0.8, all axes)', () => {
  const random = rng.mulberry32(90210);
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  let checked = 0;
  for (let i = 0; i < 160; i += 1) {
    const axes = { weird: pick([0.6, 0.7, 0.8]) };
    for (const key of AXES) if (random() < 0.35) axes[key] = pick([0, 0.5, 1]);
    const genre = random() < 0.5 ? pick(genres.LIST).id : null;
    const seed = 1000 + i;
    const style = moods.generate({ axes, seed, genre, context: CONTEXT }).style;
    const result = legibility.check(style, { frame: FRAME, duration: 3, letterCount: 12 });
    assert.equal(result.ok, true, `seed ${seed} axes ${JSON.stringify(axes)} genre ${genre}: ${result.reasons.join(' / ')}`);
    checked += 1;
  }
  assert.equal(checked, 160);
});

test('the grid holds for every genre with the horror axes at their strongest', () => {
  for (const genre of genres.LIST) {
    for (const fear of [0, 0.5, 1]) {
      const style = moods.generate({
        axes: { speed: 0.5, energy: 0.6, softness: 0.5, density: 0.6, brightness: 0.4, weird: 0.7, smartness: 0.6, fear },
        seed: 777,
        genre: genre.id,
        context: CONTEXT,
      }).style;
      const result = legibility.check(style, { frame: FRAME, duration: 3, letterCount: 12 });
      assert.equal(result.ok, true, `${genre.id} fear ${fear}: ${result.reasons.join(' / ')}`);
    }
  }
});
