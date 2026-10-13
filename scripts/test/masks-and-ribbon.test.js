const test = require('node:test');
const assert = require('node:assert/strict');

const fillerRender = require('../../renderer/js/lyrics/filler-render.js');
const maskGenerator = require('../../renderer/js/lyrics/mask-generator.js');
const SA = require('../../renderer/js/studio/project.js');
const store = require('../../renderer/js/studio/store.js');

test('ribbonLine backdrop effect renders ribbon shapes', () => {
  const ctx = {
    frame: { width: 1920, height: 1080 },
    time: 1.5,
    seed: 42,
    clip: { key: 'test_clip' },
  };

  const spec = {
    type: 'ribbonLine',
    params: {
      count: 4,
      thickness: 24,
      amp: 1.2,
      speed: 1,
      style: 'wave',
      opacity: 0.9,
      color: '#ff5c8a',
    },
  };

  const result = fillerRender.drawList(spec, ctx);
  assert.ok(result, 'drawList returned a result');
  assert.ok(Array.isArray(result.shapes), 'shapes is an array');
  assert.ok(result.shapes.length > 0, 'ribbonLine produces shapes');

  const firstShape = result.shapes[0];
  assert.equal(firstShape.kind, 'convex', 'ribbon segment is a convex polygon');
  assert.equal(firstShape.points.length, 4, 'ribbon segment has 4 points');
  assert.equal(firstShape.color, '#ff5c8a', 'ribbon color matches spec');
  assert.equal(firstShape.opacity, 0.9, 'ribbon opacity matches spec');
});

test('ribbonLine supports different motion styles', () => {
  const ctx = {
    frame: { width: 1280, height: 720 },
    time: 2.0,
    seed: 123,
    clip: { key: 'ribbon_clip' },
  };

  const styles = ['wave', 'flow', 'twist', 'spiral'];
  for (const style of styles) {
    const res = fillerRender.drawList({ type: 'ribbonLine', params: { style, count: 2 } }, ctx);
    assert.ok(res.shapes.length > 0, `ribbonLine produces shapes for style ${style}`);
  }
});

test('mask generator produces valid 64x64 and 128x128 masks for all algorithms', () => {
  const algos = ['perlin', 'valueNoise', 'voronoi', 'poissonDisk', 'randomWalk', 'cellularAutomaton'];
  for (const algoId of algos) {
    const mask64 = maskGenerator.generate(algoId, { width: 64, height: 64, seed: 99 });
    assert.equal(mask64.width, 64);
    assert.equal(mask64.height, 64);
    assert.equal(mask64.pixels.length, 64 * 64);
    assert.ok(typeof mask64.data === 'string' && mask64.data.startsWith('data:image/'), 'has data URL');

    const mask128 = maskGenerator.generate(algoId, { width: 128, height: 128, seed: 99 });
    assert.equal(mask128.width, 128);
    assert.equal(mask128.height, 128);
    assert.equal(mask128.pixels.length, 128 * 128);
  }
});

test('mask generator is deterministic given same seed', () => {
  const maskA = maskGenerator.generate('perlin', { width: 64, height: 64, seed: 54321 });
  const maskB = maskGenerator.generate('perlin', { width: 64, height: 64, seed: 54321 });
  assert.deepEqual(maskA.pixels, maskB.pixels, 'same seed generates identical pixels');
});

test('mask generator batch produces up to 10 masks', () => {
  const batch = maskGenerator.generateRandomBatch(10);
  assert.equal(batch.length, 10);
  for (const m of batch) {
    assert.ok(m.id && m.name && m.data && m.targets);
  }
});

test('store manages mask state with 10 max constraint', () => {
  const projectStore = globalThis.SA.store;
  projectStore.load(SA.create());
  projectStore.commands.clearMasks();

  let project = projectStore.state.project;
  assert.deepEqual(project.masks, [], 'masks starts empty');

  // Add 12 masks - should cap at 10
  for (let i = 0; i < 12; i += 1) {
    const mask = maskGenerator.generate('perlin', { name: `Mask ${i}`, seed: i });
    projectStore.commands.addMask(mask);
  }

  project = projectStore.state.project;
  assert.equal(project.masks.length, 10, 'masks capped at 10');

  // Update mask target assignment
  const targetId = project.masks[0].id;
  projectStore.commands.updateMask(targetId, { targets: { textFg: true, textBg: true, backdrop: false, background: true } });
  project = projectStore.state.project;
  assert.equal(project.masks[0].targets.textFg, true);
  assert.equal(project.masks[0].targets.textBg, true);
  assert.equal(project.masks[0].targets.background, true);

  // Remove mask
  projectStore.commands.removeMask(targetId);
  project = projectStore.state.project;
  assert.equal(project.masks.length, 9);

  // Clear masks
  projectStore.commands.clearMasks();
  project = projectStore.state.project;
  assert.equal(project.masks.length, 0);
});
