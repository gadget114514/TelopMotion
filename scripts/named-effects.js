'use strict';

// Named effects: the 120 motion-prompt catalogue entries as ready-made
// TelopMotion looks.
//
// https://showheyohtaki.github.io/motion-prompt/ lists 120 named motion
// patterns (motion graphics, camera moves, UI behaviours, landing-page
// behaviours and photographic looks) in five packs of 24. This script pairs
// every catalog entry with a hand-authored TelopMotion recipe: a style patch
// over the effect registry groups (enter / exit / hold / post / fill / edge /
// strike / location / repeat / animation ...) that expresses the same idea as
// text motion.
//
// The recipe is stored as a delta against the registry defaults (the same
// encoding scripts/looks-classify.js uses for the FX 800 pool), so
// SA.looks.expand restores the full style at apply time.
//
//   node scripts/named-effects.js build
//     writes renderer/data/named-effects.json and doc/named-effects.md
//   node scripts/named-effects.js list [--pack motion|ui|...] [--json]
//   node scripts/named-effects.js show 12
//   node scripts/named-effects.js apply 12 --project <file> --cue 3 [--beat <id>] [--out <file>]
//     applies the named effect to one cue / beat of an existing project
//
// The motion-prompt catalogue is MIT-licensed (by @showheyohtaki); the names,
// meanings and tags are copied from test/motion-prompt.catalog.json.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'renderer', 'js', 'lyrics', 'effects');
const requirePart = (relative) => require(path.join(ROOT, relative));

const fx = require(path.join(FX_DIR, 'registry.js'));
for (const name of ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'color', 'text-bg', 'vary', 'repeat', 'warp', 'animator', 'selector', 'camera', 'shape-layer', 'softbody', 'staged-presets', 'letter-strike', 'page', 'shader-fx']) {
  require(path.join(FX_DIR, `${name}.js`));
}
const looks = requirePart('renderer/js/lyrics/looks.js');
const project = requirePart('renderer/js/studio/project.js');

const CATALOG_FILE = path.join(ROOT, 'test', 'motion-prompt.catalog.json');
const OUTPUT_FILE = path.join(ROOT, 'renderer', 'data', 'named-effects.json');
const DOC_FILE = path.join(ROOT, 'doc', 'named-effects.md');
const SOURCE = 'test/motion-prompt.catalog.json';
const FORMAT = 'telopmotion-named-effects';
const VERSION = 1;
const TOTAL = 120;
// the effect registry groups a recipe may touch; `strike` is expanded by the
// engine itself (SA.looks.expand only knows the instance groups)
const RECIPE_GROUPS = ['animation', 'layout', 'enter', 'exit', 'hold', 'location', 'fill', 'edge', 'post', 'background', 'bgShape', 'bgFill', 'bgEdge', 'bgMotion', 'ornShape', 'ornFill', 'ornEdge', 'ornMotion', 'repeat', 'strike'];

// ---------------------------------------------------------------------------
// recipes: id -> style patch (types + the parameters that carry the idea)

const RECIPES = {
  // --- motion pack: motion graphics moves (001-024) -------------------------
  '001': {
    enter: { type: 'elasticPop', motion: { in: { duration: 0.5, ease: 'easeOutBack' } } },
    exit: { type: 'shrinkToCenter', motion: { out: { duration: 0.32, ease: 'easeInBack' } } },
    animation: { type: 'stagger', params: { each: 0.045 } },
  },
  '002': {
    animation: { type: 'stagger', params: { each: 0.09, order: 'ltr', unit: 'word' } },
    enter: { type: 'fade', params: { softness: 0.15 } },
    exit: { type: 'fade', params: { softness: 0.1 } },
  },
  '003': {
    enter: { type: 'circleBurstIn', params: { spread: 0.65, circleScale: 1.35, burstDelay: 0.12 } },
    post: [{ type: 'sparkles', params: { count: 22, size: 2.5 } }, { type: 'bloom', params: { threshold: 0.7, intensity: 0.3, radius: 0.4 } }],
    exit: { type: 'shrinkToCenter' },
  },
  '004': {
    enter: { type: 'strokeDrawOn', params: { width: 4, fillDelay: 0.5 }, motion: { in: { duration: 0.9, ease: 'easeInOutSine' } } },
    exit: { type: 'strokeErase', params: { width: 4 }, motion: { out: { duration: 0.5, ease: 'easeInOutSine' } } },
  },
  '005': {
    enter: { type: 'maskReveal', params: { dir: 'up', soft: 0.12, slope: 0.3 } },
    exit: { type: 'wipe', params: { dir: 'down' } },
    animation: { type: 'stagger', params: { each: 0.05 } },
  },
  '006': {
    enter: { type: 'typewriter', params: { cursor: true, cursorShape: 'bar', blink: 0.5 } },
    exit: { type: 'typewriterReverse' },
    animation: { type: 'simultaneous' },
  },
  '007': {
    enter: { type: 'scramble', params: { charset: 'latin', rate: 1.6 } },
    exit: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'simultaneous' },
  },
  '008': {
    enter: { type: 'varyDeformIn', params: { mode: 'random' } },
    hold: [{ type: 'floatLoop', params: { mode: 'float', dy: 0.05, freq: 0.5 } }],
    exit: { type: 'spinOut' },
  },
  '009': {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.3 }, motion: { in: { duration: 0.9, ease: 'easeInOutCubic' } } },
    exit: { type: 'slide', params: { dir: 'down', distance: 0.3 }, motion: { out: { duration: 0.7, ease: 'easeInOutCubic' } } },
    hold: [{ type: 'breathing', params: { amount: 0.02 } }],
  },
  '010': {
    enter: { type: 'charGrowIn', params: { overshoot: 1.3, peak: 0.6 }, motion: { in: { duration: 0.55, ease: 'easeOutBack' } } },
    exit: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'stagger', params: { each: 0.04 } },
  },
  '011': {
    enter: { type: 'rubberIn', params: { amp: 0.6, damping: 4, freq: 3 } },
    hold: [{ type: 'squashStretch', params: { amount: 0.22, speed: 0.7 } }],
    exit: { type: 'shrinkToCenter' },
  },
  '012': {
    enter: { type: 'morphFromPrevious', params: { points: 1024 } },
    exit: { type: 'dissolve', params: { scale: 8, edge: 0.16 } },
    animation: { type: 'simultaneous' },
  },
  '013': {
    enter: { type: 'fade', params: { softness: 0.35 } },
    hold: [{ type: 'warpFish', params: { style: 'fish', bend: 0.5, animate: 'sway', speed: 0.4 } }],
    exit: { type: 'dissolve', params: { scale: 12, edge: 0.2 } },
  },
  '014': {
    enter: { type: 'slideBlur', params: { dir: 'left', distance: 0.4, blur: 9 } },
    post: [{ type: 'echoTrail', params: { copies: 5, spacing: 0.07, decay: 0.55 } }],
    exit: { type: 'warpOut', params: { distance: 0.4 } },
  },
  '015': {
    enter: { type: 'particlesAssemble', params: { count: 20, spread: 0.5, turbulence: 0.35 } },
    post: [{ type: 'sparkles', params: { count: 24, size: 2.2 } }],
    exit: { type: 'particlesDisperse', params: { count: 20, drift: 0.35 } },
  },
  '016': {
    enter: { type: 'fade', params: { softness: 0.25 } },
    hold: [{ type: 'drift', params: { vx: 0.04 } }],
    post: [{ type: 'camera', params: { move: 'panRight', amount: 0.08, speed: 0.25 } }],
    exit: { type: 'fade', params: { softness: 0.25 } },
  },
  '017': {
    enter: { type: 'irisOpen', params: { soft: 0.08 } },
    exit: { type: 'circleErase', params: { circleScale: 1.4 } },
    animation: { type: 'stagger', params: { each: 0.06 } },
  },
  '018': {
    enter: { type: 'blind', params: { count: 6, dir: 'horizontal', soft: 0.1 } },
    exit: { type: 'wipe', params: { dir: 'left' } },
    post: [{ type: 'camera', params: { move: 'pushIn', amount: 0.08, speed: 0.3 } }],
  },
  '019': {
    enter: { type: 'dissolve', params: { scale: 10, edge: 0.18 } },
    post: [{ type: 'turbulentDisplace', params: { amount: 14, size: 60, octaves: 3 } }],
    exit: { type: 'dissolve', params: { scale: 12, edge: 0.2 } },
  },
  '020': {
    enter: { type: 'zoomIn', params: { from: 0.15 }, motion: { in: { duration: 0.5, ease: 'easeInExpo' } } },
    exit: { type: 'zoomOut', params: { to: 3 }, motion: { out: { duration: 0.45, ease: 'easeInCubic' } } },
    animation: { type: 'stagger', params: { each: 0.03 } },
  },
  '021': {
    enter: { type: 'flip3D', params: { axis: 'y', angle: 90 } },
    hold: [{ type: 'twist', params: { angle: 6 } }],
    exit: { type: 'spinOut' },
  },
  '022': {
    enter: { type: 'fade', params: { softness: 0.2, glow: 0.2 } },
    edge: [{ type: 'bevel', params: { depth: 0.5 } }],
    post: [{ type: 'lightSweep', params: { angle: -28, width: 0.14, speed: 0.8 } }],
  },
  '023': {
    enter: { type: 'glitchIn', params: { intensity: 0.5 } },
    post: [{ type: 'glitchBlocks', params: { blockSize: 24, rate: 6, intensity: 0.45 } }, { type: 'rgbShift', params: { amount: 4, jitter: 0.5 } }],
    exit: { type: 'dither', params: { levels: 4, jitter: 0.4, speed: 2.4 } },
  },
  '024': {
    enter: { type: 'dropBounce', params: { height: 0.5 } },
    hold: [{ type: 'jitter', params: { amp: 0.006, rate: 10 } }],
    post: [{ type: 'camera', params: { move: 'zoomPunch', amount: 0.22, shake: 0.5, speed: 0.9 } }],
  },

  // --- camera pack: camera movement & shooting style (025-048) --------------
  '025': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    post: [{ type: 'cameraPanLeft', params: { amount: 0.2, speed: 0.35 } }],
    exit: { type: 'fade', params: { softness: 0.2 } },
  },
  '026': {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.22 } },
    post: [{ type: 'cameraTilt', params: { amount: 0.15, speed: 0.35 } }],
    exit: { type: 'slide', params: { dir: 'down', distance: 0.22 } },
  },
  '027': {
    animation: { type: 'stagger', params: { each: 0.06 } },
    post: [{ type: 'cameraPushIn', params: { amount: 0.28, speed: 0.4 } }],
  },
  '028': {
    enter: { type: 'zoomIn', params: { from: 0.55 } },
    post: [{ type: 'cameraPunch', params: { amount: 0.2, speed: 0.55 } }],
  },
  '029': {
    hold: [{ type: 'pathFollow', params: { speed: 0.12 } }],
    post: [{ type: 'cameraPanRight', params: { amount: 0.32, speed: 0.5 } }],
  },
  '030': {
    hold: [{ type: 'orbit3D', params: { tilt: 12, speed: 0.5 } }],
    post: [{ type: 'cameraOrbit', params: { amount: 0.28, speed: 0.35 } }],
  },
  '031': {
    enter: { type: 'riseUp', params: { distance: 0.3, fade: true } },
    post: [{ type: 'camera', params: { move: 'panUp', amount: 0.24, speed: 0.35 } }],
  },
  '032': {
    enter: { type: 'focusIn', motion: { in: { duration: 0.7, ease: 'easeInOutCubic' } } },
    post: [{ type: 'cameraPushIn', params: { amount: 0.3, speed: 0.5 } }, { type: 'lensDistortion', params: { k1: -0.12, chroma: 0.2 } }],
  },
  '033': {
    enter: { type: 'focusIn' },
    exit: { type: 'focusOut' },
    post: [{ type: 'bloom', params: { threshold: 0.55, intensity: 0.5, radius: 0.6 } }],
  },
  '034': {
    hold: [{ type: 'jitter', params: { amp: 0.004, rate: 8 } }],
    post: [{ type: 'cameraHandheld', params: { amount: 0.35, shake: 0.25, speed: 0.8 } }],
  },
  '035': {
    hold: [{ type: 'sway', params: { angle: 5, speed: 0.8 } }],
    post: [{ type: 'camera', params: { move: 'pushIn', amount: 0.5, speed: 1.2 } }, { type: 'motionBlur', params: { samples: 10, shutter: 0.7 } }],
  },
  '036': {
    enter: { type: 'slide', params: { dir: 'right', distance: 0.25 } },
    hold: [{ type: 'twist', params: { angle: 10 } }],
    post: [{ type: 'camera', params: { move: 'tilt', amount: 0.1, speed: 0.3 } }],
  },
  '037': {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.3 }, motion: { in: { duration: 1.3, ease: 'easeInOutCubic' } } },
    exit: { type: 'slide', params: { dir: 'down', distance: 0.3 }, motion: { out: { duration: 1.2, ease: 'easeInOutCubic' } } },
    animation: { type: 'stagger', params: { each: 0.12, unit: 'word' } },
  },
  '038': {
    enter: { type: 'slide', params: { dir: 'left', distance: 0.4 }, motion: { in: { duration: 0.3, ease: 'easeInExpo' } } },
    exit: { type: 'slide', params: { dir: 'right', distance: 0.4 }, motion: { out: { duration: 0.9, ease: 'easeOutExpo' } } },
    animation: { type: 'timeWarp', params: { ease: 'easeInOutSine' } },
  },
  '039': {
    enter: { type: 'fade', params: { softness: 0.1 }, motion: { in: { duration: 0.25, ease: 'linear' } } },
    exit: { type: 'fade', params: { softness: 0.1 }, motion: { out: { duration: 0.25, ease: 'linear' } } },
    animation: { type: 'stopMotion', params: { fps: 10 } },
  },
  '040': {
    animation: { type: 'simultaneous' },
    post: [{ type: 'camera', params: { move: 'zoomPunch', amount: 0.1, speed: 1 } }],
    exit: { type: 'vanish' },
  },
  '041': {
    animation: { type: 'simultaneous' },
    enter: { type: 'appear', motion: { in: { duration: 0.08, ease: 'linear' } } },
    exit: { type: 'vanish', motion: { out: { duration: 0.1, ease: 'linear' } } },
  },
  '042': {
    enter: { type: 'morphFromPrevious', params: { points: 1024 }, motion: { in: { duration: 0.5, ease: 'easeInOutCubic' } } },
    exit: { type: 'fade', params: { softness: 0.05 }, motion: { out: { duration: 0.16, ease: 'linear' } } },
  },
  '043': {
    enter: { type: 'slideBlur', params: { dir: 'left', distance: 0.5, blur: 14 }, motion: { in: { duration: 0.35, ease: 'easeOutCubic' } } },
    post: [{ type: 'motionBlur', params: { samples: 10, shutter: 0.75, angle: 0 } }],
    exit: { type: 'warpOut', params: { distance: 0.5 } },
  },
  '044': {
    enter: { type: 'fade', params: { softness: 0.3, glow: 0.15 }, motion: { in: { duration: 0.8, ease: 'easeInOutSine' } } },
    exit: { type: 'fade', params: { softness: 0.3, glow: 0.1 }, motion: { out: { duration: 0.8, ease: 'easeInOutSine' } } },
  },
  '045': {
    enter: { type: 'wipe', params: { dir: 'left', soft: 0.06, fade: false } },
    exit: { type: 'wipe', params: { dir: 'left' } },
    animation: { type: 'stagger', params: { each: 0.05 } },
  },
  '046': {
    enter: { type: 'appear' },
    exit: { type: 'vanish' },
    post: [{ type: 'cameraPunch', params: { amount: 0.4, speed: 1.4 } }],
  },
  '047': {
    enter: { type: 'riseIn', params: { dy: 0.6, blur: 6, opacity: 0 }, motion: { in: { duration: 0.7, delay: 0.15, ease: 'easeOutSine' } } },
    exit: { type: 'fade', params: { softness: 0.2 } },
  },
  '048': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    exit: { type: 'fade', params: { softness: 0.35 }, motion: { out: { duration: 1.1, ease: 'easeOutSine' } } },
  },

  // --- ui pack: interface behaviours (049-072) ------------------------------
  '049': {
    enter: { type: 'zoomIn', params: { from: 0.55 }, motion: { in: { duration: 0.45, ease: 'easeOutBack' } } },
    exit: { type: 'zoomOut', motion: { out: { duration: 0.3, ease: 'easeInCubic' } } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 10 }, blur: 16, opacity: 0.5 } }],
    post: [{ type: 'vignette', params: { amount: 0.55, softness: 0.5 } }],
  },
  '050': {
    enter: { type: 'slide', params: { dir: 'left', distance: 0.7 }, motion: { in: { duration: 0.5, ease: 'easeOutQuart' } } },
    exit: { type: 'slide', params: { dir: 'left', distance: 0.7 }, motion: { out: { duration: 0.4, ease: 'easeInCubic' } } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 8, y: 0 }, blur: 18, opacity: 0.45 } }],
  },
  '051': {
    enter: { type: 'riseUp', params: { distance: 0.55, fade: true }, motion: { in: { duration: 0.5, ease: 'easeOutQuart' } } },
    exit: { type: 'slide', params: { dir: 'down', distance: 0.45 } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: -6 }, blur: 16, opacity: 0.45 } }],
  },
  '052': {
    enter: { type: 'stretchYIn', params: { amount: 1.3, thin: 0.3, split: 0.5, rise: 0.06 } },
    exit: { type: 'stripeShrink', params: { axis: 'y' } },
    animation: { type: 'stagger', params: { each: 0.07 } },
  },
  '053': {
    enter: { type: 'dropBounce', params: { height: 0.3 }, motion: { in: { duration: 0.4, ease: 'easeOutCubic' } } },
    exit: { type: 'fade', params: { softness: 0.1 } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 8 }, blur: 14, opacity: 0.45 } }],
  },
  '054': {
    enter: { type: 'zoomIn', params: { from: 0.82 }, motion: { in: { duration: 0.22, ease: 'easeOutCubic' } } },
    exit: { type: 'fade', params: { softness: 0.1 }, motion: { out: { duration: 0.2, ease: 'easeInCubic' } } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 4 }, blur: 8, opacity: 0.4 } }],
  },
  '055': {
    enter: { type: 'anticipation', params: { dir: 'up', distance: 0.18, pullback: 0.3 } },
    exit: { type: 'shrinkToCenter' },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 8 }, blur: 14, opacity: 0.45 } }],
  },
  '056': {
    enter: { type: 'peekIn', params: { dir: 'down', distance: 0.22 }, motion: { in: { duration: 0.35, ease: 'easeOutCubic' } } },
    exit: { type: 'floatOut', params: { dir: 'up', distance: 0.3 }, motion: { out: { duration: 0.5, ease: 'easeInCubic' } } },
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 6 }, blur: 12, opacity: 0.4 } }],
  },
  '057': {
    enter: { type: 'wipe', params: { dir: 'left', soft: 0.04 } },
    exit: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'stagger', params: { each: 0.07 } },
  },
  '058': {
    enter: { type: 'slideBlur', params: { dir: 'left', distance: 0.45, blur: 7 } },
    exit: { type: 'creepOut', params: { shift: 0.15 } },
    animation: { type: 'stagger', params: { each: 0.09 } },
  },
  '059': {
    enter: { type: 'slide', params: { dir: 'right', distance: 0.12 }, motion: { in: { duration: 0.32, ease: 'easeOutBack' } } },
    exit: { type: 'slide', params: { dir: 'left', distance: 0.12 } },
    animation: { type: 'simultaneous' },
  },
  '060': {
    enter: { type: 'peekIn', params: { dir: 'down', distance: 0.1 } },
    exit: { type: 'fade', params: { softness: 0.08 } },
    animation: { type: 'stagger', params: { each: 0.05, unit: 'word' } },
  },
  '061': {
    enter: { type: 'elasticPop' },
    exit: { type: 'shrinkToCenter' },
    animation: { type: 'stagger', params: { each: 0.08, unit: 'word' } },
  },
  '062': {
    enter: { type: 'lineDrawOn', params: { linePosition: 'underline', stroke: 5 } },
    exit: { type: 'lineErase', params: { linePosition: 'underline', stroke: 5 } },
    strike: { type: 'double', params: { thickness: 6, position: 0.5, overshoot: 0.14 } },
  },
  '063': {
    enter: { type: 'slide', params: { dir: 'up', distance: 0.1 } },
    exit: { type: 'fade', params: { softness: 0.08 } },
    animation: { type: 'stagger', params: { each: 0.16, order: 'ltr', unit: 'word' } },
  },
  '064': {
    enter: { type: 'fade', params: { softness: 0.12 } },
    exit: { type: 'fade', params: { softness: 0.12 } },
    animation: { type: 'stagger', params: { each: 0.05, order: 'center-out' } },
  },
  '065': {
    enter: { type: 'blind', params: { count: 3, dir: 'horizontal', soft: 0.08 } },
    hold: [{ type: 'breathing', params: { amount: 0.02 } }],
    exit: { type: 'wipe', params: { dir: 'up' } },
  },
  '066': {
    enter: { type: 'riseUp', params: { distance: 0.15 } },
    exit: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'stagger', params: { each: 0.08, unit: 'word' } },
  },
  '067': {
    enter: { type: 'box', params: { soft: 0.08 } },
    exit: { type: 'shrinkDir', params: { dir: 'center' } },
    animation: { type: 'stagger', params: { each: 0.05, unit: 'word' } },
  },
  '068': {
    enter: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'stagger', params: { each: 0.1, unit: 'word' } },
    strike: { type: 'line', params: { thickness: 4, position: 0.85, drawIn: 'sweep', drawTime: 0.5, overshoot: 0.1 } },
  },
  '069': {
    enter: { type: 'fade', params: { softness: 0.45 } },
    hold: [{ type: 'opacityPulse', params: { min: 0.35, period: 1.4 } }],
    post: [{ type: 'lightSweep', params: { angle: 15, width: 0.3, speed: 0.9 } }],
  },
  '070': {
    enter: { type: 'fade', params: { softness: 0.15 } },
    hold: [{ type: 'orbit2D', params: { radius: 0.03, speed: 1.1, spin: false } }],
    exit: { type: 'fade', params: { softness: 0.15 } },
  },
  '071': {
    enter: { type: 'charGrowIn', params: { overshoot: 1.3 } },
    exit: { type: 'shrinkToCenter' },
    location: { type: 'badgeAnchored' },
    edge: [{ type: 'dropShadow', params: { offset: { x: 3, y: 5 }, blur: 9, opacity: 0.55 } }],
  },
  '072': {
    enter: { type: 'fade', params: { softness: 0.5, glow: 0.2 } },
    hold: [{ type: 'breathing', params: { amount: 0.015 } }],
    exit: { type: 'fade', params: { softness: 0.3 } },
    post: [{ type: 'vignette', params: { amount: 0.3, softness: 0.6 } }],
  },

  // --- lp pack: landing-page behaviours (073-096) ---------------------------
  '073': {
    enter: { type: 'fade', params: { softness: 0.25 } },
    hold: [{ type: 'drift', params: { vx: 0.05 } }],
    post: [{ type: 'camera', params: { move: 'panRight', amount: 0.07, speed: 0.2 } }],
  },
  '074': {
    enter: { type: 'riseIn', params: { dy: 0.9, opacity: 0, blur: 3 }, motion: { in: { duration: 0.7, ease: 'easeOutCubic' } } },
    exit: { type: 'fade', params: { softness: 0.15 } },
    animation: { type: 'stagger', params: { each: 0.08, unit: 'word' } },
  },
  '075': {
    location: { type: 'upperThird' },
    enter: { type: 'wipe', params: { dir: 'down', soft: 0.08 } },
    hold: [{ type: 'drift', params: { vx: 0.02 } }],
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 6 }, blur: 12, opacity: 0.35 } }],
  },
  '076': {
    enter: { type: 'fade', params: { softness: 0.15 } },
    exit: { type: 'fade', params: { softness: 0.15 } },
    animation: { type: 'simultaneous' },
  },
  '077': {
    enter: { type: 'slideBlur', params: { dir: 'left', distance: 0.3, blur: 6 } },
    hold: [{ type: 'marquee', params: { speed: 0.3 } }],
    exit: { type: 'fade', params: { softness: 0.15 } },
  },
  '078': {
    enter: { type: 'slide', params: { dir: 'down', distance: 0.35 }, motion: { in: { duration: 0.55, ease: 'easeOutBack' } } },
    hold: [{ type: 'nudgeImpulse', params: { amount: 0.02, interval: 2 } }],
    exit: { type: 'slide', params: { dir: 'up', distance: 0.3 }, motion: { out: { duration: 0.4, ease: 'easeInCubic' } } },
  },
  '079': {
    enter: { type: 'fade', params: { softness: 0.1 } },
    animation: { type: 'stagger', params: { each: 0.04 } },
    strike: { type: 'line', params: { thickness: 5, position: 0.95, drawIn: 'sweep', drawTime: 0.9, overshoot: 0.05 } },
  },
  '080': {
    enter: { type: 'fade', params: { softness: 0.12 } },
    animation: { type: 'stagger', params: { each: 0.06, unit: 'word' } },
    strike: { type: 'wave', params: { thickness: 16, position: 0.82, opacity: 0.55, drawIn: 'sweep', drawTime: 0.5 } },
  },
  '081': {
    enter: { type: 'fade', params: { softness: 0.15 } },
    hold: [{ type: 'floatBob', params: { amp: 0.015, speed: 0.4 } }],
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 10 }, blur: 18, opacity: 0.45 } }],
  },
  '082': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    hold: [{ type: 'kenBurns', params: { zoom: 0.16, pan: { x: 0.03, y: 0 } } }],
    edge: [{ type: 'dropShadow', params: { offset: { x: 0, y: 6 }, blur: 14, opacity: 0.4 } }],
  },
  '083': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    hold: [{ type: 'pathFollow', params: { points: [{ x: 0.15, y: 0.6 }, { x: 0.5, y: 0.45 }, { x: 0.85, y: 0.6 }], speed: 0.18 } }],
    animation: { type: 'stagger', params: { each: 0.05 } },
  },
  '084': {
    enter: { type: 'elasticPop' },
    hold: [{ type: 'jelly', params: { amount: 0.14, freq: 1.8 } }],
    exit: { type: 'shrinkToCenter' },
  },
  '085': {
    enter: { type: 'irisOpen', params: { soft: 0.05 } },
    exit: { type: 'circleErase', params: { circleScale: 1.3 } },
    post: [{ type: 'shockwave', params: { radius: 0.3, width: 0.07, strength: 0.5 } }],
  },
  '086': {
    enter: { type: 'lineDrawOn', params: { linePosition: 'underline', stroke: 4 } },
    exit: { type: 'lineErase', params: { linePosition: 'underline', stroke: 4 } },
    animation: { type: 'stagger', params: { each: 0.09, unit: 'word' } },
  },
  '087': {
    enter: { type: 'split', params: { axis: 'vertical', distance: 0.35 }, motion: { in: { duration: 0.7, ease: 'easeInOutCubic' } } },
    exit: { type: 'splitOut', params: { axis: 'vertical' } },
    strike: { type: 'line', params: { thickness: 4, position: 0.5, opacity: 0.5 } },
  },
  '088': {
    enter: { type: 'dropBounce', params: { height: 0.4 } },
    exit: { type: 'floatUp', params: { distance: 0.4 } },
    post: [{ type: 'cameraPunch', params: { amount: 0.15, speed: 0.8 } }],
  },
  '089': {
    enter: { type: 'fade', params: { softness: 0.3 } },
    hold: [{ type: 'opacityPulse', params: { min: 0.4, period: 1.2 } }],
    post: [{ type: 'radialWipe', params: { feather: 0.1, direction: 'cw' } }],
  },
  '090': {
    enter: { type: 'riseIn', params: { dy: 0.8, opacity: 0, blur: 4 }, motion: { in: { duration: 0.6, ease: 'easeOutCubic' } } },
    exit: { type: 'fade', params: { softness: 0.15 } },
    animation: { type: 'stagger', params: { each: 0.2, unit: 'word' } },
  },
  '091': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    hold: [{ type: 'marquee', params: { speed: 0.15 } }],
    repeat: { type: 'rowH', params: { copies: 3, dir: 'right', sequence: 'cascade', seqSpeed: 'fast' } },
  },
  '092': {
    enter: { type: 'wipe', params: { dir: 'left', soft: 0.1 } },
    exit: { type: 'wipe', params: { dir: 'right' } },
    post: [{ type: 'cameraPunch', params: { amount: 0.12, speed: 0.7 } }],
  },
  '093': {
    enter: { type: 'slide', params: { dir: 'down', distance: 0.4 }, motion: { in: { duration: 1, ease: 'easeInOutQuart' } } },
    hold: [{ type: 'drift', params: { vx: 0.015 } }],
    exit: { type: 'slide', params: { dir: 'up', distance: 0.4 }, motion: { out: { duration: 0.9, ease: 'easeInOutQuart' } } },
  },
  '094': {
    enter: { type: 'slideBlur', params: { dir: 'right', distance: 0.35, blur: 8 } },
    hold: [{ type: 'marquee', params: { speed: 0.28 } }],
    repeat: { type: 'rowH', params: { copies: 2, dir: 'right', sequence: 'cascade' } },
  },
  '095': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    exit: { type: 'fade', params: { softness: 0.2 } },
    fill: { type: 'gradientSweep', params: { angle: 25, speed: 0.45 } },
  },
  '096': {
    enter: { type: 'fade', params: { softness: 0.2 } },
    hold: [{ type: 'floatLoop', params: { mode: 'float', dy: 0.1, dx: 0.02, freq: 0.35 } }],
  },

  // --- photo pack: photographic looks (097-120) -----------------------------
  '097': {
    enter: { type: 'fade', params: { softness: 0.3 } },
    edge: [{ type: 'neonGlow', params: { radius: 20, intensity: 0.7 } }],
    post: [{ type: 'bloom', params: { threshold: 0.5, intensity: 0.85, radius: 0.7 } }],
  },
  '098': {
    edge: [{ type: 'neonGlow', params: { radius: 13, intensity: 0.9, bloom: true } }],
    post: [{ type: 'bloom', params: { threshold: 0.7, intensity: 0.4, radius: 0.5 } }],
  },
  '099': {
    fill: { type: 'ink', params: { scale: 3, threshold: 0.4 } },
    edge: [{ type: 'outline', params: { width: 2 } }],
    post: [{ type: 'vignette', params: { amount: 0.5, softness: 0.45 } }],
  },
  '100': {
    fill: { type: 'splitTone', params: { split: 0.5, softness: 0.06, angle: 0 } },
    post: [{ type: 'colorGrade', params: { saturation: 0.95 } }],
  },
  '101': {
    fill: { type: 'splitTone', params: { split: 0.45, softness: 0.12, angle: 45 } },
    post: [{ type: 'vignette', params: { amount: 0.45, softness: 0.5 } }],
  },
  '102': {
    fill: { type: 'splitTone', params: { split: 0.62, softness: 0.2, angle: 60 } },
    post: [{ type: 'bloom', params: { threshold: 0.65, intensity: 0.35, radius: 0.45 } }],
  },
  '103': {
    fill: { type: 'goldFoil', params: { grain: 0.5, sparkle: 0.5 } },
    post: [{ type: 'lightLeak', params: { x: 0.85, y: 0.12, intensity: 0.5 } }, { type: 'colorGrade', params: { lift: 0.04, saturation: 1.15 } }],
  },
  '104': {
    fill: { type: 'chrome', params: { sharpness: 0.6 } },
    post: [{ type: 'colorGrade', params: { lift: -0.12, saturation: 0.85 } }, { type: 'vignette', params: { amount: 0.35, softness: 0.6 } }],
  },
  '105': {
    post: [{ type: 'sparkles', params: { count: 42, size: 4, shape: 'dot' } }, { type: 'bloom', params: { threshold: 0.6, intensity: 0.5, radius: 0.7 } }],
  },
  '106': {
    post: [{ type: 'lensDistortion', params: { k1: 0.18, k2: 0, chroma: 0.15 } }, { type: 'vignette', params: { amount: 0.35, softness: 0.6 } }],
  },
  '107': {
    post: [{ type: 'echoTrail', params: { copies: 6, spacing: 0.09, decay: 0.75 } }],
  },
  '108': {
    post: [{ type: 'cameraPanRight', params: { amount: 0.18, speed: 0.45 } }, { type: 'motionBlur', params: { samples: 12, shutter: 0.8 } }],
  },
  '109': {
    post: [{ type: 'lensFlare', params: { position: { x: 0.35, y: 0.3 } } }, { type: 'bloom', params: { threshold: 0.6, intensity: 0.45, radius: 0.5 } }],
  },
  '110': {
    post: [{ type: 'fisheye', params: { power: 1.25, lensRadius: 0.75, aberration: 0.2 } }],
  },
  '111': {
    post: [{ type: 'chromaticAberration', params: { amount: 0.55, radial: 0.4 } }, { type: 'rgbShift', params: { amount: 2.5, jitter: 0.4 } }],
  },
  '112': {
    enter: { type: 'fade', params: { softness: 0.3 } },
    post: [{ type: 'vignette', params: { amount: 0.65, softness: 0.45 } }],
  },
  '113': {
    post: [{ type: 'colorGrade', params: { lift: 0.15, saturation: 0.75 } }, { type: 'bloom', params: { threshold: 0.7, intensity: 0.3, radius: 0.5 } }],
  },
  '114': {
    post: [{ type: 'colorGrade', params: { lift: -0.18, saturation: 0.85 } }, { type: 'vignette', params: { amount: 0.6, softness: 0.35 } }],
  },
  '115': {
    post: [{ type: 'colorGrade', params: { saturation: 0 } }],
  },
  '116': {
    post: [{ type: 'colorGrade', params: { duotone: '#4d8dff', saturation: 0.9 } }],
  },
  '117': {
    post: [{ type: 'colorGrade', params: { duotone: '#ff9a3c', lift: -0.03, saturation: 1.05 } }, { type: 'vignette', params: { amount: 0.3, softness: 0.55 } }],
  },
  '118': {
    post: [{ type: 'filmGrain', params: { amount: 0.3, size: 1.3 } }],
  },
  '119': {
    post: [{ type: 'lightLeak', params: { x: 0.15, y: 0.8, intensity: 0.75 } }],
  },
  '120': {
    post: [{ type: 'echoTrail', params: { copies: 2, spacing: 0.22, decay: 0.85 } }],
  },
};

// ---------------------------------------------------------------------------
// validation

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function paramSchema(entry, key) {
  const fromParams = ((entry && entry.params) || []).find((param) => param.key === key);
  if (fromParams) return fromParams;
  const defaults = (entry && entry.defaults && entry.defaults.params) || {};
  if (Object.prototype.hasOwnProperty.call(defaults, key)) return { key, kind: 'preset' };
  return null;
}

// every group of the expanded style must resolve in the effect registry, and
// every parameter must exist on the type with a value inside its bounds
function validateInstance(id, group, instance) {
  const where = `#${id} ${group}`;
  if (!instance || typeof instance !== 'object' || typeof instance.type !== 'string' || !instance.type) {
    throw new Error(`${where}: missing type`);
  }
  const entry = fx.get(group, instance.type);
  if (!entry) throw new Error(`${where}: unknown type "${instance.type}"`);
  for (const [key, value] of Object.entries(instance.params || {})) {
    const schema = paramSchema(entry, key);
    if (!schema) throw new Error(`${where}.${instance.type}: unknown parameter "${key}"`);
    if (schema.kind === 'number' && !Number.isFinite(value)) throw new Error(`${where}.${instance.type}.${key}: not a number`);
    if (schema.kind === 'number' && schema.min != null && value < schema.min) throw new Error(`${where}.${instance.type}.${key}: ${value} < ${schema.min}`);
    if (schema.kind === 'number' && schema.max != null && value > schema.max) throw new Error(`${where}.${instance.type}.${key}: ${value} > ${schema.max}`);
    if (schema.kind === 'select' && Array.isArray(schema.options) && !schema.options.includes(value)) {
      throw new Error(`${where}.${instance.type}.${key}: "${value}" is not one of ${schema.options.join('|')}`);
    }
    if (schema.kind === 'bool' && typeof value !== 'boolean') throw new Error(`${where}.${instance.type}.${key}: not a boolean`);
  }
  for (const phase of ['in', 'out']) {
    const motion = instance.motion && instance.motion[phase];
    if (!motion) continue;
    if (motion.duration != null && !(Number.isFinite(motion.duration) && motion.duration > 0)) throw new Error(`${where}.${instance.type}.motion.${phase}.duration: bad value`);
    if (motion.delay != null && !Number.isFinite(motion.delay)) throw new Error(`${where}.${instance.type}.motion.${phase}.delay: bad value`);
  }
}

// the fully expanded style (SA.looks.expand plus the groups it does not know)
function expandedStyle(recipe) {
  const style = looks.expand(recipe);
  if (recipe.strike) style.strike = fx.withDefaults(recipe.strike, 'strike');
  return style;
}

function validateRecipe(id, recipe) {
  const patch = recipe || {};
  const keys = Object.keys(patch);
  if (!keys.length) throw new Error(`#${id}: empty recipe`);
  for (const key of keys) {
    if (!RECIPE_GROUPS.includes(key)) throw new Error(`#${id}: unknown group "${key}"`);
  }
  const style = expandedStyle(patch);
  for (const [group, value] of Object.entries(style)) {
    if (group === 'strike') {
      validateInstance(id, 'strike', value);
      continue;
    }
    if (looks.STACK_GROUPS.includes(group)) {
      for (const instance of value) validateInstance(id, group, instance);
    } else {
      validateInstance(id, group, value);
    }
  }
  return style;
}

// ---------------------------------------------------------------------------
// data

function readCatalog() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  if (!Array.isArray(catalog.elements) || catalog.elements.length !== TOTAL) {
    throw new Error(`catalog must hold ${TOTAL} elements (got ${catalog.elements && catalog.elements.length})`);
  }
  return catalog;
}

function buildData(options) {
  const opts = options || {};
  const catalog = opts.catalog || readCatalog();
  const ids = catalog.elements.map((entry) => entry.id);
  const missing = ids.filter((id) => !RECIPES[id]);
  if (missing.length) throw new Error(`no recipe for ${missing.join(', ')}`);
  const extra = Object.keys(RECIPES).filter((id) => !ids.includes(id));
  if (extra.length) throw new Error(`recipe without catalog entry: ${extra.join(', ')}`);

  const effects = [];
  for (const element of catalog.elements) {
    const recipe = RECIPES[element.id];
    validateRecipe(element.id, recipe);
    const style = looks.stripDefaults(recipe);
    effects.push({
      id: element.id,
      pack: element.pack,
      slug: element.slug,
      category: element.category,
      name: clone(element.name),
      meaning: clone(element.meaning),
      tags: clone(element.tags || []),
      groups: Object.keys(style).filter((key) => RECIPE_GROUPS.includes(key)),
      style,
    });
  }
  return {
    format: FORMAT,
    version: VERSION,
    source: SOURCE,
    site: catalog.site,
    repo: catalog.repo,
    license: 'MIT',
    attribution: 'Named effects and their names come from motion-prompt by @showheyohtaki (MIT).',
    count: effects.length,
    packs: catalog.packs.map((pack) => ({
      id: pack.pack,
      order: pack.order,
      title: clone(pack.title),
      count: pack.count,
      from: pack.first,
      to: pack.last,
      categories: pack.categories.map((category) => ({ slug: category.slug, ja: category.ja, en: category.en })),
    })),
    effects,
  };
}

// ---------------------------------------------------------------------------
// markdown index

function catalogMarkdown(data) {
  const lines = [];
  lines.push('# ネームドエフェクト（motion-prompt 120 種）');
  lines.push('');
  lines.push('https://showheyohtaki.github.io/motion-prompt/ の 120 種の演出（5 パック × 24）に、TelopMotion の効果レシピを 1 対 1 で割り当てた一覧です。');
  lines.push('レシピは効果レジストリのグループ（登場・退場・保持・後処理・塗り・縁取り・レター罫線・配置・リピート・アニメーション）への差分で、適用時に `SA.looks.expand` が既定値込みのスタイルへ戻します。');
  lines.push('データは `renderer/data/named-effects.json`、ビルドは `node scripts/named-effects.js build` です。');
  lines.push('');
  lines.push('```');
  lines.push('node scripts/named-effects.js list [--pack motion]');
  lines.push('node scripts/named-effects.js show 12');
  lines.push('node scripts/named-effects.js apply 12 --project <file> --cue 3 [--beat <id>] [--out <file>]');
  lines.push('```');
  lines.push('');
  lines.push('出典: motion-prompt（作者 @showheyohtaki、MIT ライセンス）。名前・意味・タグは公式カタログから取得しています。');
  lines.push('');
  for (const pack of data.packs) {
    lines.push(`## ${pack.title.ja}（${pack.id}: #${pack.from}–#${pack.to}）`);
    lines.push('');
    lines.push('| No. | 名前 | 意味 | TelopMotion の構成 |');
    lines.push('|---|---|---|---|');
    for (const effect of data.effects) {
      if (effect.pack !== pack.id) continue;
      lines.push(`| #${effect.id} | ${effect.name.ja} (${effect.name.en}) | ${effect.meaning.ja} | ${effect.groups.join(' / ')} |`);
    }
    lines.push('');
  }
  lines.push('## 適用例');
  lines.push('');
  lines.push('Studio では Inspector の「ネームドエフェクト」または Generate メニューから選ぶと、選択中のキュー／ビートのスタイルに 1 回の Undo で乗ります。');
  lines.push('同じキューへ付け直すと前のレシピのグループだけが外れ、手で足した設定は残ります。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeFileIfChanged(file, text) {
  let current = null;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = null;
  }
  if (current === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function build(options) {
  const opts = options || {};
  const data = buildData();
  const out = opts.out || OUTPUT_FILE;
  const doc = opts.doc || DOC_FILE;
  const dataChanged = writeFileIfChanged(out, `${JSON.stringify(data, null, 2)}\n`);
  const docChanged = writeFileIfChanged(doc, catalogMarkdown(data));
  return { data, written: { data: out, dataChanged, doc, docChanged } };
}

// ---------------------------------------------------------------------------
// applying to a project (CLI)

function stylePatchFor(entry) {
  const style = looks.expand(entry.style);
  // `strike` is expanded by the engine (SA.looks does not know it); the Studio
  // command applies the expanded form, so the CLI does the same
  if (entry.style.strike) style.strike = fx.withDefaults(entry.style.strike, 'strike');
  return style;
}

// merge semantics of the Studio command: the previous recipe's groups are
// removed first, then the new groups overwrite; the rest of the bag stays
function applyToBag(bag, entry) {
  const container = bag || {};
  const groups = Object.keys(entry.style).filter((key) => RECIPE_GROUPS.includes(key));
  const previous = container.namedEffect && Array.isArray(container.namedEffect.groups) ? container.namedEffect.groups : [];
  for (const group of previous) delete container[group];
  const merged = project.mergeDeep(container, stylePatchFor(entry));
  merged.namedEffect = {
    id: entry.id,
    pack: entry.pack,
    groups,
    name: clone(entry.name),
  };
  return merged;
}

function findCue(doc, value) {
  const cues = (doc.script && doc.script.cues) || [];
  if (value == null) throw new Error('--cue is required (1-based index or cue id)');
  if (/^\d+$/.test(String(value))) {
    const cue = cues[Number.parseInt(value, 10) - 1];
    if (cue) return cue;
  }
  const cue = cues.find((item) => item.id === value);
  if (!cue) throw new Error(`cue ${value} not found`);
  return cue;
}

// ---------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args.flags[key] = true;
      else {
        args.flags[key] = next;
        i += 1;
      }
    } else {
      args.positional.push(value);
    }
  }
  return args;
}

function loadData() {
  const catalog = readCatalog();
  return buildData({ catalog });
}

function commandList(args) {
  const data = loadData();
  const pack = args.flags.pack;
  const asJson = !!args.flags.json;
  const rows = data.effects.filter((effect) => !pack || pack === true || effect.pack === pack);
  if (asJson) {
    console.log(JSON.stringify(rows.map(({ id, pack: p, slug, name, meaning }) => ({ id, pack: p, slug, name, meaning })), null, 2));
    return;
  }
  for (const effect of rows) {
    console.log(`#${effect.id}\t[${effect.pack}] ${effect.name.ja} / ${effect.name.en}\t${effect.groups.join(',')}`);
  }
}

function commandShow(args) {
  const data = loadData();
  const id = String(args.positional[1] || '').padStart(3, '0');
  const effect = data.effects.find((entry) => entry.id === id);
  if (!effect) throw new Error(`named effect #${id} not found`);
  console.log(JSON.stringify({ ...effect, expanded: stylePatchFor(effect) }, null, 2));
}

function commandApply(args) {
  const id = String(args.positional[1] || '').padStart(3, '0');
  const data = loadData();
  const effect = data.effects.find((entry) => entry.id === id);
  if (!effect) throw new Error(`named effect #${id} not found`);
  const projectFile = args.flags.project;
  if (!projectFile || projectFile === true) throw new Error('--project <file> is required');
  const doc = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  const migrated = project.migrate(doc);
  if (!migrated.ok) throw new Error(`not a valid project: ${migrated.error}`);
  const target = migrated.project;
  const cue = findCue(target, args.flags.cue);
  let place = `cue ${cue.id}`;
  if (args.flags.beat && args.flags.beat !== true) {
    const beats = (target.beats && target.beats[cue.id]) || [];
    const beat = beats.find((entry) => entry.id === args.flags.beat);
    if (!beat) throw new Error(`beat ${args.flags.beat} not found in cue ${cue.id}`);
    target.beatStyles = target.beatStyles || {};
    target.beatStyles[beat.id] = applyToBag(target.beatStyles[beat.id], effect);
    place = `beat ${beat.id}`;
  } else {
    target.cueStyles = target.cueStyles || {};
    target.cueStyles[cue.id] = applyToBag(target.cueStyles[cue.id], effect);
  }
  console.log(`#${effect.id} ${effect.name.ja}（${effect.groups.join(', ')}）→ ${place}`);
  const out = args.flags.out;
  if (!out || out === true) {
    console.log('dry run (pass --out <file> to write the patched project)');
    return;
  }
  fs.writeFileSync(out, `${JSON.stringify(target, null, 2)}\n`, 'utf8');
  console.log(`written: ${path.resolve(out)}`);
}

function help() {
  console.log([
    'Named effects: the 120 motion-prompt entries as TelopMotion recipes',
    '',
    '  node scripts/named-effects.js build',
    '  node scripts/named-effects.js list [--pack motion|ui|lp|photo|camera] [--json]',
    '  node scripts/named-effects.js show <id>',
    '  node scripts/named-effects.js apply <id> --project <file> --cue <index|id> [--beat <id>] [--out <file>]',
    '',
    'build options: [--out <file>] [--doc <file>]',
  ].join('\n'));
}

function main(argv) {
  const args = parseArgs(argv);
  const command = args.positional[0] || 'help';
  try {
    if (command === 'build') {
      const result = build({ out: args.flags.out === true ? null : args.flags.out, doc: args.flags.doc === true ? null : args.flags.doc });
      console.log(`data: ${result.written.data} (${result.data.count} effects)${result.written.dataChanged ? '' : ' [unchanged]'}`);
      console.log(`doc:  ${result.written.doc}${result.written.docChanged ? '' : ' [unchanged]'}`);
      for (const pack of result.data.packs) console.log(`pack ${pack.id}: ${pack.count} (#${pack.from}-${pack.to}) ${pack.title.ja}`);
      return 0;
    }
    if (command === 'list') {
      commandList(args);
      return 0;
    }
    if (command === 'show') {
      commandShow(args);
      return 0;
    }
    if (command === 'apply') {
      commandApply(args);
      return 0;
    }
    help();
    return 0;
  } catch (error) {
    console.error(`named-effects: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  RECIPES,
  RECIPE_GROUPS,
  FORMAT,
  VERSION,
  TOTAL,
  CATALOG_FILE,
  OUTPUT_FILE,
  DOC_FILE,
  readCatalog,
  expandedStyle,
  validateRecipe,
  validateInstance,
  buildData,
  build,
  catalogMarkdown,
  applyToBag,
  stylePatchFor,
  findCue,
};
