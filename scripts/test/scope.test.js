'use strict';

// Partial decorations (`style.scoped`): the scope masks and the motion rules
// (enter / exit replace, hold adds).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const fx = require(path.join(FX_DIR, 'registry.js'));
// `staged-presets` carries the presets Generate picks by name (`popIn`,
// `stretchPopIn`, ...), so the registry has to know them
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const scope = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'scope.js'));
const motion = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'motion.js'));

const FRAME = { width: 1920, height: 1080 };
const SIZE = 96;

// 'HELLO WORLD' as letters: word 0 is HELLO, word 1 is WORLD
function makeScene(text, styles) {
  const letters = [];
  let pen = 0;
  let word = 0;
  for (let i = 0; i < text.length; i += 1) {
    const width = SIZE * 0.6;
    letters.push({
      path: `cue:c1/beat:c1:single0/line:0/word:${word}/letter:${i}`,
      cueId: 'c1',
      beatId: 'c1:single0',
      lineIdx: 0,
      wordIdx: word,
      letterIdx: 0,
      globalIdx: i,
      char: text[i],
      textOffset: i,
      local: { x: pen, y: SIZE, w: width, h: SIZE, cx: pen + width / 2, cy: SIZE * 0.7, penX: pen, penY: SIZE },
      bbox: { x1: 0, y1: -SIZE, x2: width, y2: 0 },
      outlineLength: 400 + i * 10,
    });
    pen += width;
    if (text[i] === ' ') word += 1;
  }
  return {
    cueId: 'c1',
    beatId: 'c1:single0',
    kind: 'single',
    start: 0,
    end: 10,
    text,
    style: styles || {},
    letters,
    blockBBox: { x1: 0, y1: 0, x2: pen, y2: SIZE },
    size: SIZE,
    direction: 'horizontal',
  };
}

function maskOf(text, scopeSpec) {
  const scene = makeScene(text);
  return Array.from(scope.scopeMask(scene, scopeSpec), (value) => (value ? 1 : 0)).join('');
}

test('range masks select the code-point offsets', () => {
  assert.equal(maskOf('ABCDE', { kind: 'range', from: 1, to: 3 }), '01100');
  assert.equal(maskOf('ABCDE', { kind: 'range', from: 3 }), '00011');
  assert.equal(maskOf('ABCDE', null), '11111');
});

test('word masks select whole words', () => {
  assert.equal(maskOf('HELLO WORLD', { kind: 'word', words: [0] }), '11111100000');
  assert.equal(maskOf('HELLO WORLD', { kind: 'word', words: [1] }), '00000011111');
});

test('keyword masks select every occurrence inside a line', () => {
  assert.equal(maskOf('HELLO WORLD', { kind: 'keyword', match: 'WORLD' }), '00000011111');
  assert.equal(maskOf('ABAB', { kind: 'keyword', match: 'AB' }), '1111');
  assert.equal(maskOf('HELLO', { kind: 'keyword', match: 'XYZ' }), '00000');
});

test('span masks follow the composition span identity', () => {
  const scene = makeScene('ABCD');
  const span = { from: 1, to: 3, scale: 1.2 };
  scene.style.text = { compose: { spans: [span] } };
  scene.letters[1].span = span;
  scene.letters[2].span = span;
  assert.equal(Array.from(scope.scopeMask(scene, { kind: 'span', spanIndex: 0 }), (v) => (v ? 1 : 0)).join(''), '0110');
});

test('nth masks take every Nth letter, word or line', () => {
  // every other letter
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 2, offset: 0 }), '10101');
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 2, offset: 1 }), '01010');
  // every third letter, and the offset wraps with the period
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 3, offset: 0 }), '10010');
  assert.equal(maskOf('ABCDE', { kind: 'nth', unit: 'letter', every: 3, offset: 3 }), '10010');
  // every 1 is everything
  assert.equal(maskOf('ABC', { kind: 'nth', unit: 'letter', every: 1, offset: 0 }), '111');
  // whole words (the space belongs to the word before it, like the `word` scope)
  assert.equal(maskOf('HELLO WORLD', { kind: 'nth', unit: 'word', every: 2, offset: 0 }), '11111000000');
  assert.equal(maskOf('HELLO WORLD', { kind: 'nth', unit: 'word', every: 2, offset: 1 }), '00000011111');
  // a single line is line 0
  assert.equal(maskOf('HELLO', { kind: 'nth', unit: 'line', every: 1, offset: 0 }), '11111');
});

test('nth counts the letters the background variation counts', () => {
  // the spaces and the punctuation do not join the running index, so the mask
  // lines up with vary: alternate
  const spaced = maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 0 });
  assert.equal(spaced, '10001', 'A and C take the even slots');
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 1 }), '00100');
  // skipSpaces: false counts every code point instead
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 0, skipSpaces: false }), '10101');
  assert.equal(maskOf('A B！C', { kind: 'nth', unit: 'letter', every: 2, offset: 1, skipSpaces: false }), '01010');
});

// two paragraphs of 'ABC DE' and 'FG': the '\n' is its own letter here (the
// test scene builds one letter per code point), on line 0
function makeTwoLineScene() {
  const scene = makeScene('ABC DE\nFG');
  const lineIdx = [0, 0, 0, 0, 0, 0, 0, 1, 1];
  scene.letters.forEach((letter, i) => {
    letter.lineIdx = lineIdx[i];
    letter.globalIdx = i;
  });
  return scene;
}

test('slice masks take N letters from the head or the tail of the text', () => {
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 2 }), '11000');
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 2 }), '00011');
  // an offset walks in from the chosen end: offset 1 is D counting back from E
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 2, length: 2 }), '00110');
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'end', offset: 1, length: 2 }), '00110');
  // no length (or 0) runs to the end
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 3 }), '00011');
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 3, length: 0 }), '00011');
  // past the end flags nothing rather than wrapping
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 9, length: 2 }), '00000');
  assert.equal(maskOf('ABCDE', { kind: 'slice', anchor: 'text', from: 'end', offset: 9, length: 2 }), '00000');
  // a missing anchor / from is the text head
  assert.equal(maskOf('ABCDE', { kind: 'slice', length: 1 }), '10000');
});

test('slice masks count the letters the background variation counts', () => {
  // 'A B！C': the space and the full stop take no slot, so a window of 3
  // reaches the C at the far end
  assert.equal(maskOf('A B！C', { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3 }), '10101');
  assert.equal(maskOf('A B！C', { kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 1 }), '00001');
  // skipSpaces: false counts every code point instead, so the same window stops
  // at the B
  assert.equal(maskOf('A B！C', { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3, skipSpaces: false }), '11100');
});

test('slice masks on the line anchor resolve per wrapped line', () => {
  const scene = makeTwoLineScene();
  const mask = (spec) => Array.from(scope.scopeMask(scene, spec), (value) => (value ? 1 : 0)).join('');
  // every line's own head: 'AB' of line 0 and 'FG' of line 1
  assert.equal(mask({ kind: 'slice', anchor: 'line', from: 'start', offset: 0, length: 2 }), '110000011');
  // every line's own tail: 'DE' of line 0 and 'FG' of line 1
  assert.equal(mask({ kind: 'slice', anchor: 'line', from: 'end', offset: 0, length: 2 }), '000011011');
  // the text anchor stays one window over the whole beat
  assert.equal(mask({ kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 2 }), '110000000');
});

test('maskForText decides slice the way the scene mask does', () => {
  const show = (text, spec) => Array.from(scope.maskForText(text, spec), (value) => (value ? 1 : 0)).join('');
  assert.equal(show('ABCDE', { kind: 'slice', anchor: 'text', from: 'start', offset: 1, length: 2 }), '01100');
  assert.equal(show('ABCDE', { kind: 'slice', anchor: 'text', from: 'end', offset: 1, length: 2 }), '00110');
  // the line anchor splits on the paragraph break: 'AB' of 'ABC' and of 'DE'
  assert.equal(show('ABC\nDE', { kind: 'slice', anchor: 'line', from: 'start', offset: 0, length: 2 }), '11011');
  assert.equal(show('ABC\nDE', { kind: 'slice', anchor: 'line', from: 'end', offset: 0, length: 1 }), '00101');
  for (const spec of [
    { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 2 },
    { kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 3 },
    { kind: 'slice', anchor: 'text', from: 'start', offset: 1, length: 1 },
  ]) {
    const scene = makeScene('ABCDE FGH');
    const fromScene = Array.from(scope.scopeMask(scene, spec), (value) => (value ? 1 : 0)).join('');
    assert.equal(show('ABCDE FGH', spec), fromScene, `${JSON.stringify(spec)} differs`);
  }
});

test('maskForText decides the scopes that do not need the layout', () => {
  const text = 'HELLO WORLD';
  const mask = (spec, compose) => Array.from(scope.maskForText(text, spec, compose), (value) => (value ? 1 : 0)).join('');
  assert.equal(mask(null), '11111111111');
  assert.equal(mask({ kind: 'range', from: 1, to: 3 }), '01100000000');
  assert.equal(mask({ kind: 'keyword', match: 'WORLD' }), '00000011111');
  assert.equal(mask({ kind: 'keyword', match: 'LL' }), '00110000000');
  // the space is skipped, so it takes no slot and the parity flips after it
assert.equal(mask({ kind: 'nth', unit: 'letter', every: 2, offset: 0 }), '10101001010');
  assert.equal(mask({ kind: 'span', spanIndex: 0 }, { spans: [{ from: 6, to: 11 }] }), '00000011111');
  assert.equal(mask({ kind: 'span', spanIndex: 3 }, { spans: [{ from: 6, to: 11 }] }), '00000000000');
  // word / line units are not decidable before the wrap
  assert.equal(mask({ kind: 'nth', unit: 'word', every: 2, offset: 0 }), '00000000000');
  assert.equal(mask({ kind: 'nth', unit: 'line', every: 1, offset: 0 }), '00000000000');
});

test('maskForText and scopeMask agree where both can decide', () => {
  // the scene mask needs the built letters; the layout mask counts the text
  for (const spec of [
    { kind: 'range', from: 1, to: 4 },
    { kind: 'keyword', match: 'WORLD' },
    { kind: 'nth', unit: 'letter', every: 2, offset: 1 },
    { kind: 'nth', unit: 'letter', every: 3, offset: 2 },
  ]) {
    const scene = makeScene('ABCDE FGH');
    const fromScene = Array.from(scope.scopeMask(scene, spec), (value) => (value ? 1 : 0)).join('');
    const fromText = Array.from(scope.maskForText('ABCDE FGH', spec), (value) => (value ? 1 : 0)).join('');
    assert.equal(fromText, fromScene, `${JSON.stringify(spec)} differs`);
  }
});

test('a scoped enter replaces the base enter only for the covered letters', () => {
  const scene = makeScene('ABCDE', {
    animation: { type: 'simultaneous' },
    enter: { type: 'fade', motion: { in: { duration: 0.4, ease: 'linear' } } },
    scoped: [
      {
        group: 'enter',
        type: 'slide',
        params: { dir: 'up', distance: 0.5 },
        motion: { in: { duration: 0.4, delay: 0, ease: 'linear' } },
        scope: { kind: 'range', from: 1, to: 2 },
      },
    ],
  });
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: scene.text };
  const result = motion.evaluateBeat(scene, 0.2, { frame: FRAME, seed: 42, beat });
  // letter 1 slides up, its neighbours only fade
  assert.ok(result.letters[1].y < result.letters[0].y - 50, `scoped letter did not move (${result.letters[1].y})`);
  assert.equal(result.letters[0].y, result.letters[2].y);
  // the base fade still runs for everyone
  assert.ok(result.letters[0].opacity > 0 && result.letters[0].opacity < 1);
});

test('a scoped hold is appended for the covered letters only', () => {
  const base = { animation: { type: 'simultaneous' }, enter: { type: 'fade' } };
  const plainScene = makeScene('ABCDE', base);
  const scopedScene = makeScene('ABCDE', {
    ...base,
    scoped: [{ group: 'hold', type: 'drift', params: { vx: 0.5, vy: 0 }, scope: { kind: 'range', from: 2, to: 4 } }],
  });
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: 'ABCDE' };
  const plain = motion.evaluateBeat(plainScene, 2, { frame: FRAME, seed: 42, beat });
  const scoped = motion.evaluateBeat(scopedScene, 2, { frame: FRAME, seed: 42, beat });
  assert.equal(scoped.letters[0].x, plain.letters[0].x);
  assert.equal(scoped.letters[1].x, plain.letters[1].x);
  assert.equal(scoped.letters[4].x, plain.letters[4].x);
  assert.ok(scoped.letters[2].x > plain.letters[2].x + 50, `letter 2 did not drift (${scoped.letters[2].x})`);
  assert.ok(scoped.letters[3].x > plain.letters[3].x + 50, `letter 3 did not drift (${scoped.letters[3].x})`);
});

// 'ABCDEFG' as letters, wide enough that a run's centre and half size are
// readable by hand: every letter is 100 px wide.
const WIDE = 100;

function makeWideScene(text, styles) {
  const scene = makeScene(text, styles);
  scene.letters.forEach((letter) => {
    letter.advance = WIDE;
    letter.local.w = WIDE;
    letter.local.cx = letter.globalIdx * WIDE + WIDE / 2;
  });
  scene.blockBBox = { x1: 0, y1: 0, x2: WIDE * text.length, y2: SIZE };
  return scene;
}

const LOCAL_BEAT = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: 'ABCDEFG' };

// The evaluated letters of a wide scene, without any scoped entry.
function plainWide() {
  return motion.evaluateBeat(makeWideScene('ABCDEFG', { animation: { type: 'simultaneous' }, enter: { type: 'fade' } }), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
}

// 'ABCDEFG' split over two lines (ABC D / EFG), as a real wrap would lay it out
function makeTwoLineWideScene(styles) {
  const scene = makeWideScene('ABCDEFG', styles);
  scene.letters.forEach((letter, i) => {
    letter.lineIdx = i < 4 ? 0 : 1;
  });
  scene.blockBBox = { x1: 0, y1: 0, x2: WIDE * 4, y2: SIZE * 2 };
  return scene;
}

test('a local scoped tracking spreads the substring around its own centre', () => {
  // the run is ABC, centred on B: not the block's centre, so `local` shows
  const style = (localFlag) => ({
    animation: { type: 'simultaneous' },
    enter: { type: 'fade' },
    scoped: [
      {
        group: 'hold',
        type: 'tracking',
        params: { amount: 1, mode: 'hold', trackAxis: 'x' },
        local: localFlag,
        scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3 },
      },
    ],
  });
  const run = (localFlag) => motion.evaluateBeat(makeWideScene('ABCDEFG', style(localFlag)), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  const rest = plainWide();
  const plain = run(false);
  const local = run(true);
  // the block is 700 px wide and centred on the anchor at 960, so D (index 3) is
  // the block centre and A / B / C sit 300 / 200 / 100 px left of it
  assert.ok(Math.abs(rest[3].x - 960) < 1e-6, `the block centre is D (${rest[3].x})`);
  // without `local` the tracking spreads the run from the *block* centre, so all
  // three letters of the run move (by -300, -200, -100)
  assert.ok(Math.abs(plain[0].x - (rest[0].x - 300)) < 1e-6, `plain A (${plain[0].x})`);
  assert.ok(Math.abs(plain[1].x - (rest[1].x - 200)) < 1e-6, `plain B (${plain[1].x})`);
  assert.ok(Math.abs(plain[2].x - (rest[2].x - 100)) < 1e-6, `plain C (${plain[2].x})`);
  // with `local` the run is a string of its own, centred on B: B stays put and
  // A / C move one letter width each way
  assert.ok(Math.abs(local[1].x - rest[1].x) < 1e-6, `the run centre B stays put (${local[1].x})`);
  assert.ok(Math.abs(local[0].x - (rest[0].x - WIDE)) < 1e-6, `local A (${local[0].x})`);
  assert.ok(Math.abs(local[2].x - (rest[2].x + WIDE)) < 1e-6, `local C (${local[2].x})`);
  // the letters outside the substring are not tracked themselves, but the local
  // run makes room for itself: they step aside by the run's half width (150 px)
  for (let i = 3; i < 7; i += 1) assert.ok(Math.abs(local[i].x - (rest[i].x + 150)) < 1e-6, `letter ${i} made room (${local[i].x} vs ${rest[i].x + 150})`);
  // and the run stays symmetric about its centre
  assert.ok(Math.abs((local[0].x + local[2].x) / 2 - local[1].x) < 1e-6, 'the run stays symmetric');
  // the plain mode spreads about the block centre and never reflows, so the same
  // letters keep their place there
  for (let i = 3; i < 7; i += 1) assert.ok(Math.abs(plain[i].x - rest[i].x) < 1e-6, `plain letter ${i} stays put`);
});

test('a local stretch pushes the rest of the line aside (the reflow)', () => {
  const style = (localFlag, amount) => ({
    animation: { type: 'simultaneous' },
    enter: { type: 'fade' },
    scoped: [
      {
        group: 'hold',
        type: 'stretch',
        params: { stretchAxis: 'x', mode: 'hold', amount },
        local: localFlag,
        scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3 },
      },
    ],
  });
  const run = (localFlag, amount) => motion.evaluateBeat(makeWideScene('ABCDEFG', style(localFlag, amount)), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  const rest = plainWide();
  const local = run(true, 1);
  const plain = run(false, 1);
  // the run ABC is 300 px wide, so its half size is 150: a growth of 1 adds
  // exactly 150 px of room on each side, and the letters outside the run step
  // into it
  const push = 150;
  assert.ok(Math.abs(local[4].x - (rest[4].x + push)) < 1e-6, `letter 4 was not pushed (${local[4].x} vs ${rest[4].x + push})`);
  assert.ok(Math.abs(local[6].x - (rest[6].x + push)) < 1e-6, 'letter 6 too');
  // the run itself grows about its own centre (B at 760): A and C each move one
  // letter width out and the glyphs double with them
  assert.ok(Math.abs(local[0].x - (rest[0].x - WIDE)) < 1e-6, `the run grows about its centre (${local[0].x})`);
  assert.ok(Math.abs(local[2].x - (rest[2].x + WIDE)) < 1e-6, 'and stays symmetric');
  assert.ok(Math.abs(local[1].x - rest[1].x) < 1e-6, 'the run centre itself stays put');
  assert.ok(local[0].scaleX > 1.9, `the glyphs grow with it (${local[0].scaleX})`);
  assert.ok(Math.abs((local[0].x + local[2].x) / 2 - local[1].x) < 1e-6, 'the run stays symmetric');
  // without `local` the growth is measured around the block centre and nothing is
  // reflowed, so the letters outside the run keep their place
  for (let i = 3; i < 7; i += 1) assert.ok(Math.abs(plain[i].x - rest[i].x) < 1e-6, `no reflow without local (${i})`);
  // a zero growth reflows nothing
  const flat = run(true, 0);
  for (let i = 0; i < 7; i += 1) assert.ok(Math.abs(flat[i].x - rest[i].x) < 1e-6, `a zero growth pushes nothing (${i})`);
  // a negative growth pulls the line inward
  const shrunk = run(true, -0.5);
  assert.ok(Math.abs(shrunk[4].x - (rest[4].x - 75)) < 1e-6, `a squash pulls the line in (${shrunk[4].x})`);
});

test('the reflow only touches the line the run sits on', () => {
  // two wrapped lines: the run is the head of line 0, so line 1 never moves
  const style = {
    animation: { type: 'simultaneous' },
    enter: { type: 'fade' },
    scoped: [
      {
        group: 'hold',
        type: 'stretch',
        params: { stretchAxis: 'x', mode: 'hold', amount: 1 },
        local: true,
        scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3 },
      },
    ],
  };
  const before = motion.evaluateBeat(makeTwoLineWideScene({ animation: { type: 'simultaneous' }, enter: { type: 'fade' } }), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  const withRun = motion.evaluateBeat(makeTwoLineWideScene(style), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  // letters 3..6 live on line 1, so they keep their place even though the run on
  // line 0 grew
  for (let i = 4; i < 7; i += 1) assert.ok(Math.abs(withRun[i].x - before[i].x) < 1e-6, `letter ${i} is on the other line (${withRun[i].x} vs ${before[i].x})`);
  // and the run itself still grew
  assert.ok(Math.abs((withRun[0].x + withRun[2].x) / 2 - withRun[1].x) < 1e-6, 'the run stays symmetric on its own line');
});

test('a local hold warps around the substring centre, not the block centre', () => {
  // `fontSize` is a block deformation: it pushes a deform entry, and the engine
  // scales the letter around `warpOrigin` / `blockHalf`. Under `local` those come
  // from the run, so the substring's edges move and its centre does not.
  const style = (localFlag) => ({
    animation: { type: 'simultaneous' },
    enter: { type: 'fade' },
    scoped: [
      {
        group: 'hold',
        type: 'fontSize',
        params: { from: 1, to: 2, period: 1, mode: 'hold' },
        local: localFlag,
        scope: { kind: 'slice', anchor: 'text', from: 'start', offset: 0, length: 3 },
      },
    ],
  });
  const run = (localFlag) => motion.evaluateBeat(makeWideScene('ABCDEFG', style(localFlag)), 5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  const plain = run(false);
  const local = run(true);
  // the run is ABC, centred on B at 760, half width 150. The warp origin of each
  // letter is its distance to that centre
  for (const [index, distance] of [[0, -100], [1, 0], [2, 100]]) {
    assert.ok(local[index].deform.length > 0, `letter ${index} carries the deformation`);
    assert.ok(Math.abs(local[index].warpOrigin.x - distance) < 1e-6, `local warp origin ${index} (${local[index].warpOrigin.x} vs ${distance})`);
    assert.ok(Math.abs(local[index].blockHalf.x - 150) < 1e-6, `the half size is the run's (${local[index].blockHalf.x})`);
  }
  // without `local` the same deformation measures around the whole block: origin
  // -300 / -200 / -100 and a half width of 350
  assert.ok(Math.abs(plain[0].warpOrigin.x + 300) < 1e-6, `the plain warp origin is the block's (${plain[0].warpOrigin.x})`);
  assert.ok(Math.abs(plain[0].blockHalf.x - 350) < 1e-6, `and its half size (${plain[0].blockHalf.x})`);
  // the letters outside the run carry no deformation at all under either mode
  for (let i = 3; i < 7; i += 1) {
    assert.equal(local[i].deform.length, 0, `letter ${i} is outside the run`);
    assert.equal(local[i].warpOrigin, undefined, `and has no warp origin (${i})`);
  }
});

test('a local scoped entrance scales the substring about its own centre', () => {
  // `stretch` (enter) reads the block centre, so a local entry moves the letters
  // of the substring by their distance to *its* centre instead
  const style = (localFlag) => ({
    animation: { type: 'simultaneous' },
    enter: { type: 'fade', motion: { in: { duration: 0.4, ease: 'linear' } } },
    scoped: [
      {
        group: 'enter',
        type: 'stretch',
        params: { amount: 1, stretchAxis: 'x' },
        motion: { in: { duration: 1, delay: 0, ease: 'linear' } },
        local: localFlag,
        scope: { kind: 'slice', anchor: 'text', from: 'end', offset: 0, length: 2 },
      },
    ],
  });
  const run = (localFlag) => motion.evaluateBeat(makeWideScene('ABCDEFG', style(localFlag)), 0.5, { frame: FRAME, seed: 42, beat: LOCAL_BEAT }).letters;
  const rest = plainWide();
  const plain = run(false);
  const local = run(true);
  // the run is FG, centred at 1210. Halfway through the entrance the factor is
  // 1.5, so F and G move a quarter of a letter width each way about that centre
  // (a scale about the centre: the offset is the distance times factor - 1)
  assert.ok(Math.abs(local[5].x - (rest[5].x - WIDE / 4)) < 1e-6, `local F (${local[5].x})`);
  assert.ok(Math.abs(local[6].x - (rest[6].x + WIDE / 4)) < 1e-6, `local G (${local[6].x})`);
  assert.ok(Math.abs(local[5].scaleX - 1.5) < 1e-6, `the glyph grows (${local[5].scaleX})`);
  // without `local` the same entrance measures around the block centre at 960: F
  // is 200 px right of it and G 300 px, so they travel four and six times as far
  assert.ok(Math.abs(plain[5].x - (rest[5].x + 100)) < 1e-6, `plain F (${plain[5].x})`);
  assert.ok(Math.abs(plain[6].x - (rest[6].x + 150)) < 1e-6, `plain G (${plain[6].x})`);
  // the rest of the line is untouched under both modes
  for (let i = 0; i < 5; i += 1) assert.ok(Math.abs(local[i].x - rest[i].x) < 1e-6, `letter ${i} is outside the run`);
});

test('substringReveal times the matched substring apart from the rest', () => {
  // enter 0..1s, exit 9..10s; the rest leads, the keyword follows half a phase later
  const style = {
    animation: { type: 'simultaneous' },
    enter: { type: 'substringReveal', params: { matchText: 'CD', lag: 0.5 }, motion: { in: { duration: 1, ease: 'linear' } } },
    exit: { type: 'substringReveal', params: { matchText: 'CD', lag: 0.5 }, motion: { out: { duration: 1, ease: 'linear' } } },
  };
  const beat = { id: 'c1:single0', cueId: 'c1', kind: 'single', start: 0, end: 10, text: 'ABCDE' };
  const at = (t, params) => {
    const scene = makeScene('ABCDE', params ? { ...style, enter: { ...style.enter, params: { ...style.enter.params, ...params } } } : style);
    return motion.evaluateBeat(scene, t, { frame: FRAME, seed: 42, beat }).letters;
  };
  // halfway through the enter the rest has landed, the keyword has not started
  const mid = at(0.5);
  assert.ok(mid[0].opacity > 0.99 && mid[4].opacity > 0.99, `rest not landed (${mid[0].opacity})`);
  assert.ok(mid[2].opacity < 0.01 && mid[3].opacity < 0.01, `keyword already in (${mid[2].opacity})`);
  // on the way out the rest leaves first and the keyword lingers
  const out = at(9.5);
  assert.ok(out[0].opacity < 0.01, `rest still visible (${out[0].opacity})`);
  assert.ok(out[2].opacity > 0.99, `keyword already gone (${out[2].opacity})`);
  // the keyword can lead instead
  const lead = at(0.5, { lead: 'match' });
  assert.ok(lead[2].opacity > 0.99 && lead[0].opacity < 0.01);
  // animate: match keeps the rest in place from the start
  const only = at(0.1, { animate: 'match' });
  assert.equal(only[0].opacity, 1);
  assert.ok(only[2].opacity < 0.2);
  // no match: every letter runs the whole phase together
  const none = at(0.5, { matchText: 'XYZ' });
  assert.ok(Math.abs(none[0].opacity - none[2].opacity) < 1e-9 && none[0].opacity > 0.3 && none[0].opacity < 0.7);
});

test('substringReveal splits several substrings on , 、 and /', () => {
  const selector = require(path.join(FX_DIR, 'selector.js'));
  assert.deepEqual(selector.substringsOf('愛, 夢、光 /空'), ['愛', '夢', '光', '空']);
  assert.deepEqual(selector.substringsOf(''), []);
});
