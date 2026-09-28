'use strict';

// Prints the fixed style of every genre preset. The app builds them lazily from
// the same generator, but this script keeps a stable snapshot for review.
const fx = require('../renderer/js/lyrics/effects/registry.js');
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg']) {
  require(`../renderer/js/lyrics/effects/${name}.js`);
}
const moods = require('../renderer/js/lyrics/moods.js');
const genres = require('../renderer/js/lyrics/genres.js');

const TARGETS = [
  ['horrorBlood', 'horror', 'blood'],
  ['horrorRansom', 'horror', 'ransom'],
  ['horrorScratch', 'horror', 'claw'],
  ['loveHeartbeat', 'love', 'heartbeat'],
  ['loveHearts', 'love', 'heartAccent'],
  ['heartbreakTears', 'heartbreak', 'tears'],
  ['partyConfetti', 'party', 'confetti'],
];

const out = {};
for (const [id, genreId, signatureId] of TARGETS) {
  const genre = genres.get(genreId);
  const generated = moods.generate({ genre: genreId, axes: genre.axes, seed: 1, ensureSignature: false });
  const style = JSON.parse(JSON.stringify(generated.style));
  const signature = (genre.signature || []).find((item) => item.id === signatureId);
  if (signature && signature.patch) {
    for (const [key, value] of Object.entries(signature.patch)) {
      style[key] = { ...(style[key] || {}), ...value };
    }
  }
  out[id] = style;
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
