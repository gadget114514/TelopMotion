'use strict';

// Composition sheet: run the automatic direction over a demo project twice -
// once with the legacy per-beat jitter (compose off) and once with the
// composition templates (compose on) - and write both documents next to the
// source. Render them with the FxDemo contact sheet to compare the pictures:
//
//   node scripts/compose-sheet.js demo/demo30-A.telopmotion.json
//   SA_SMOKE_FXDEMO=1 SA_SMOKE_FXDEMO_FILE=demo/demo30-A.off.telopmotion.json \
//     SA_SMOKE_FXDEMO_OUT=demo/demo30-A.off.png electron .
//   SA_SMOKE_FXDEMO=1 SA_SMOKE_FXDEMO_FILE=demo/demo30-A.on.telopmotion.json \
//     SA_SMOKE_FXDEMO_OUT=demo/demo30-A.on.png electron .
//
// Options: --seed N, --out DIR (defaults to the source directory).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = requirePart('renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background']) {
  requirePart(`renderer/js/lyrics/effects/${name}.js`);
}

const SA = {
  fx,
  rng: requirePart('renderer/js/lyrics/rng.js'),
  color: requirePart('renderer/js/color.js'),
  moods: requirePart('renderer/js/lyrics/moods.js'),
  weird: requirePart('renderer/js/lyrics/weird.js'),
  genParams: requirePart('renderer/js/lyrics/gen-params.js'),
  fxAxes: requirePart('renderer/js/lyrics/fx-axes.js'),
  textflow: requirePart('renderer/js/lyrics/textflow.js'),
  project: requirePart('renderer/js/studio/project.js'),
  fillers: requirePart('renderer/js/lyrics/fillers.js'),
  rhythm: requirePart('renderer/js/lyrics/rhythm.js'),
  figures: requirePart('renderer/js/lyrics/figures.js'),
  fillerRender: requirePart('renderer/js/lyrics/filler-render.js'),
  fillerPresets: requirePart('renderer/js/lyrics/filler-presets.js'),
  keywords: requirePart('renderer/js/lyrics/keywords.js'),
  audioDriver: requirePart('renderer/js/lyrics/audio-driver.js'),
  compositions: requirePart('renderer/js/lyrics/compositions.js'),
  paletteRoles: requirePart('renderer/js/lyrics/palette-roles.js'),
  legibility: requirePart('renderer/js/lyrics/legibility.js'),
  direct: requirePart('renderer/js/studio/direct.js'),
};
globalThis.SA = SA;

function parseArgs(argv) {
  const args = { file: null, seed: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--seed') args.seed = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (!args.file) args.file = arg;
  }
  return args;
}

function run(doc, options) {
  const styleMode = doc.styleMode || {};
  const axes = {
    ...SA.moods.normalizeAxes(styleMode.axes || {}),
    weird: SA.moods.weirdOf({ weird: SA.moods.projectWeird(doc) }),
    smartness: SA.moods.smartOf({ smartness: SA.moods.projectSmartness(doc) }),
    fear: SA.moods.fearOf({ fear: SA.moods.projectFear(doc) }),
  };
  const seed = options.seed == null ? Number(styleMode.seed) || 12345 : options.seed;
  const genre = styleMode.genre || null;
  const direction = styleMode.direction || 'horizontal';
  const context = SA.moods.contextFor(doc);
  const generated = SA.moods.generate({ axes, seed, direction, genre, context }).style;
  const themeStyle = SA.project.mergeDeep(generated, doc.style || {});
  const ctx = SA.direct.prepare(doc, {
    axes,
    seed,
    genre,
    direction,
    look: null,
    lookClip: null,
    themeStyle,
    cueLooks: {},
    analysis: null,
    compose: options.compose,
  });
  SA.direct.run(doc, ctx);
  return doc;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('usage: node scripts/compose-sheet.js <project.telopmotion.json> [--seed N] [--out DIR]');
    process.exit(1);
  }
  const file = path.resolve(args.file);
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = path.basename(file, '.telopmotion.json');
  const outDir = args.out ? path.resolve(args.out) : path.dirname(file);
  fs.mkdirSync(outDir, { recursive: true });
  for (const compose of [false, true]) {
    const doc = JSON.parse(JSON.stringify(source));
    run(doc, { seed: args.seed, compose });
    const out = path.join(outDir, `${base}.${compose ? 'on' : 'off'}.telopmotion.json`);
    fs.writeFileSync(out, JSON.stringify(doc, null, 2));
    console.log(`${compose ? 'on ' : 'off'} -> ${out}`);
  }
}

main();
