'use strict';

// Section sheet: run the automatic direction over a demo project once per
// section setting and write the documents next to the source, so the block
// boundaries can be compared (and rendered with the FxDemo contact sheet):
//
//   node scripts/sections-sheet.js demo/demo30-A.telopmotion.json
//   SA_SMOKE_FXDEMO=1 SA_SMOKE_FXDEMO_FILE=demo/demo30-A.sections.telopmotion.json \
//     SA_SMOKE_FXDEMO_OUT=demo/demo30-A.sections.png electron .
//
// Options: --seed N, --out DIR, --gap S, --max-cues N, --strength S.
// The plan (the blocks, their loudness and their chorus marks) is logged, which
// is the quickest way to see how a real song was cut up.

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
  audioDriver: requirePart('renderer/js/lyrics/audio-driver.js'),
  sections: requirePart('renderer/js/lyrics/sections.js'),
  figures: requirePart('renderer/js/lyrics/figures.js'),
  fillerRender: requirePart('renderer/js/lyrics/filler-render.js'),
  fillerPresets: requirePart('renderer/js/lyrics/filler-presets.js'),
  keywords: requirePart('renderer/js/lyrics/keywords.js'),
  compositions: requirePart('renderer/js/lyrics/compositions.js'),
  paletteRoles: requirePart('renderer/js/lyrics/palette-roles.js'),
  legibility: requirePart('renderer/js/lyrics/legibility.js'),
  genres: requirePart('renderer/js/lyrics/genres.js'),
  random: requirePart('renderer/js/lyrics/random.js'),
  direct: requirePart('renderer/js/studio/direct.js'),
};
globalThis.SA = SA;

function parseArgs(argv) {
  const args = { file: null, seed: null, out: null, gap: null, maxCues: null, strength: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--seed') args.seed = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--gap') args.gap = Number(argv[++i]);
    else if (arg === '--max-cues') args.maxCues = Number(argv[++i]);
    else if (arg === '--strength') args.strength = Number(argv[++i]);
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
  const themeStyle = SA.project.mergeDeep(SA.moods.generate({ axes, seed, direction, genre, context }).style, doc.style || {});
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
    compose: true,
    sections: options.sections,
  });
  if (ctx.sections) {
    console.log(`blocks (gap ${ctx.sectionConfig.gap}s, max ${ctx.sectionConfig.maxCues} cues, strength ${ctx.sectionConfig.strength}):`);
    for (const section of ctx.sections) {
      const energy = section.energy == null ? 'no audio' : section.energy.toFixed(3);
      console.log(
        `  #${section.index} ${section.start.toFixed(2)}-${section.end.toFixed(2)}s ` +
          `cues ${section.cueIds.join(',')} energy ${energy}` +
          `${section.chorus ? ' CHORUS' : ''} boost ${section.boost.toFixed(3)}`
      );
    }
  }
  SA.direct.run(doc, ctx);
  return doc;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('usage: node scripts/sections-sheet.js <project.telopmotion.json> [--seed N] [--out DIR] [--gap S] [--max-cues N] [--strength S]');
    process.exit(1);
  }
  const file = path.resolve(args.file);
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = path.basename(file, '.telopmotion.json');
  const outDir = args.out ? path.resolve(args.out) : path.dirname(file);
  fs.mkdirSync(outDir, { recursive: true });
  for (const on of [false, true]) {
    const doc = JSON.parse(JSON.stringify(source));
    const sections = on
      ? {
          gap: args.gap == null ? SA.sections.DEFAULT_GAP : args.gap,
          maxCues: args.maxCues == null ? SA.sections.DEFAULT_MAX_CUES : args.maxCues,
          strength: args.strength == null ? 1 : args.strength,
        }
      : null;
    console.log(`--- sections: ${on ? sections.gap + 's / ' + sections.maxCues + ' cues' : 'off'}`);
    run(doc, { seed: args.seed, sections });
    const suffix = on ? 'sections' : 'plain';
    const out = path.join(outDir, `${base}.${suffix}.telopmotion.json`);
    fs.writeFileSync(out, JSON.stringify(doc, null, 2));
    console.log(`${on ? 'sections' : 'plain   '} -> ${out}`);
  }
}

main();
