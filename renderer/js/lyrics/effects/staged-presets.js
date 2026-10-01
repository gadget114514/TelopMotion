(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.stagedPresets = factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  // Representative lyric-video staging, stored as staged presets over the
  // primitives (warp / letterWarp / animator / camera). A preset keeps the
  // primitive's parameter schema and CPU, so every one of them stays editable
  // in the inspector and exports exactly like the primitive it expands to.

  const PRESETS = [
    // --- block warps (hold.warp) --------------------------------------------
    { group: 'hold', primitive: 'warp', type: 'warpArc', params: { style: 'arc', bend: 0.35 } },
    { group: 'hold', primitive: 'warp', type: 'warpArch', params: { style: 'arch', bend: 0.4 } },
    { group: 'hold', primitive: 'warp', type: 'warpBulge', params: { style: 'bulgeBlock', bend: 0.4 } },
    { group: 'hold', primitive: 'warp', type: 'warpFlag', params: { style: 'flagBlock', bend: 0.45, animate: 'sway', speed: 0.8 } },
    { group: 'hold', primitive: 'warp', type: 'warpWave', params: { style: 'waveBlock', bend: 0.3, animate: 'travel', speed: 0.6 } },
    { group: 'hold', primitive: 'warp', type: 'warpFish', params: { style: 'fish', bend: 0.4 } },
    { group: 'hold', primitive: 'warp', type: 'warpFisheye', params: { style: 'fisheye', bend: 0.45 } },
    { group: 'hold', primitive: 'warp', type: 'warpInflate', params: { style: 'inflate', bend: 0.35 } },
    { group: 'hold', primitive: 'warp', type: 'warpRise', params: { style: 'rise', bend: 0.4 } },
    { group: 'hold', primitive: 'warp', type: 'warpSqueeze', params: { style: 'squeeze', bend: 0.35 } },
    { group: 'hold', primitive: 'warp', type: 'warpTwist', params: { style: 'twistBlock', bend: 0.3, animate: 'sway', speed: 0.4 } },

    // --- letter warps (hold.letterWarp) -------------------------------------
    { group: 'hold', primitive: 'letterWarp', type: 'letterBend', params: { style: 'bend', amount: 0.3 } },
    { group: 'hold', primitive: 'letterWarp', type: 'letterBulge', params: { style: 'bulge', amount: 0.3 } },
    { group: 'hold', primitive: 'letterWarp', type: 'letterRipple', params: { style: 'ripple', amount: 0.25, freq: 2, animate: 'travel', speed: 0.6 } },
    { group: 'hold', primitive: 'letterWarp', type: 'letterFlag', params: { style: 'flag', amount: 0.35, animate: 'sway', speed: 0.7 } },
    { group: 'hold', primitive: 'letterWarp', type: 'letterZigzag', params: { style: 'zigzag', amount: 0.3, freq: 2 } },
    { group: 'hold', primitive: 'letterWarp', type: 'letterTaper', params: { style: 'taper', amount: 0.35 } },

    // --- entrance animators (enter.animator) --------------------------------
    { group: 'enter', primitive: 'animator', type: 'riseIn', params: { dy: 0.9, opacity: 0, blur: 3 }, motion: { in: { duration: 0.6, ease: 'cubicOut' } } },
    { group: 'enter', primitive: 'animator', type: 'fallIn', params: { dy: -0.9, opacity: 0, blur: 4 }, motion: { in: { duration: 0.55, ease: 'backOut' } } },
    { group: 'enter', primitive: 'animator', type: 'popIn', params: { scale: 0.25, opacity: 0, flash: 0.25 }, motion: { in: { duration: 0.45, ease: 'backOut' } } },
    { group: 'enter', primitive: 'animator', type: 'spinIn', params: { rotate: -42, dy: 0.4, opacity: 0 }, motion: { in: { duration: 0.6, ease: 'quintOut' } } },
    { group: 'enter', primitive: 'animator', type: 'focusIn', params: { blur: 18, scale: 1.08, opacity: 0 }, motion: { in: { duration: 0.7, ease: 'expoOut' } } },
    { group: 'enter', primitive: 'animator', type: 'driftIn', params: { dx: -1.2, dy: 0.3, blur: 6, opacity: 0 }, motion: { in: { duration: 0.7, ease: 'cubicOut' } } },
    { group: 'enter', primitive: 'animator', type: 'tiltIn', params: { tilt: 75, axis: 'y', scale: 0.85, opacity: 0 }, motion: { in: { duration: 0.55, ease: 'backOut' } } },

    // --- exit animators (exit.animator) -------------------------------------
    { group: 'exit', primitive: 'animator', type: 'riseOut', params: { dy: -1.0, opacity: 0, blur: 3 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
    { group: 'exit', primitive: 'animator', type: 'fallOut', params: { dy: 1.0, rotate: 12, opacity: 0 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
    { group: 'exit', primitive: 'animator', type: 'zoomOutSoft', params: { scale: 1.4, opacity: 0 }, motion: { out: { duration: 0.45, ease: 'sineIn' } } },
    { group: 'exit', primitive: 'animator', type: 'spinOut', params: { rotate: 55, opacity: 0 }, motion: { out: { duration: 0.5, ease: 'cubicIn' } } },
    { group: 'exit', primitive: 'animator', type: 'focusOut', params: { blur: 20, opacity: 0 }, motion: { out: { duration: 0.45, ease: 'quadIn' } } },

    // --- hold animators (hold.animator) -------------------------------------
    { group: 'hold', primitive: 'animator', type: 'boil', params: { mode: 'wiggle', dx: 0.03, dy: 0.05, rotate: 1.5, freq: 6, phase: 1 } },
    { group: 'hold', primitive: 'animator', type: 'floatLoop', params: { mode: 'float', dx: 0.02, dy: 0.12, freq: 0.35 } },
    { group: 'hold', primitive: 'animator', type: 'breatheLoop', params: { mode: 'sine', scale: 0.05, freq: 0.25 } },
    { group: 'hold', primitive: 'animator', type: 'swayLoop', params: { mode: 'sine', dy: 0.03, rotate: 2.5, freq: 0.2 } },
    { group: 'hold', primitive: 'animator', type: 'beatPulse', params: { mode: 'pulse', scale: 0.09, freq: 0.5, sync: 'beat' } },

    // --- camera moves (post.camera) -----------------------------------------
    { group: 'post', primitive: 'camera', type: 'cameraPushIn', params: { move: 'pushIn', amount: 0.2, speed: 0.5 } },
    { group: 'post', primitive: 'camera', type: 'cameraPullOut', params: { move: 'pullOut', amount: 0.2, speed: 0.5 } },
    { group: 'post', primitive: 'camera', type: 'cameraPanLeft', params: { move: 'panLeft', amount: 0.15, speed: 0.4 } },
    { group: 'post', primitive: 'camera', type: 'cameraPanRight', params: { move: 'panRight', amount: 0.15, speed: 0.4 } },
    { group: 'post', primitive: 'camera', type: 'cameraTilt', params: { move: 'tilt', amount: 0.12, speed: 0.4 } },
    { group: 'post', primitive: 'camera', type: 'cameraHandheld', params: { move: 'handheld', amount: 0.35, shake: 0.25, speed: 0.8 } },
    { group: 'post', primitive: 'camera', type: 'cameraOrbit', params: { move: 'orbit', amount: 0.25, speed: 0.3 } },
    { group: 'post', primitive: 'camera', type: 'cameraPunch', params: { move: 'zoomPunch', amount: 0.3, speed: 0.8 } },

    // --- range selector / tracking (selector.js) -----------------------------
    { group: 'hold', primitive: 'rangeSelector', type: 'highlightSweep', params: { selBasedOn: 'letter', selShape: 'smooth', selStart: 0, selEnd: 0.18, selSweep: 'loop', selSpeed: 0.25, selEaseHigh: 60, selEaseLow: 60, colorMix: 1, scale: 1.06 } },
    { group: 'hold', primitive: 'rangeSelector', type: 'waveLoop', params: { selBasedOn: 'letter', selShape: 'smooth', selStart: 0, selEnd: 0, selWidth: 0.3, selSweep: 'loop', selSpeed: 0.3, selEaseHigh: 40, selEaseLow: 40, dy: -0.6, scale: 1.1, blur: 3 } },
    { group: 'hold', primitive: 'rangeSelector', type: 'beatHighlight', params: { selBasedOn: 'letter', selShape: 'triangle', selStart: 0, selEnd: 0, selWidth: 0.35, selSweep: 'beat', selEaseHigh: 40, selEaseLow: 40, scale: 1.25, flash: 0.3, colorMix: 0.8 } },
    { group: 'enter', primitive: 'rangeReveal', type: 'revealSweep', params: { selBasedOn: 'letter', selShape: 'rampUp', dy: 0.8, opacity: 0, blur: 12, selEaseHigh: 70, selEaseLow: 20 }, motion: { in: { duration: 0.7, ease: 'quartOut' } } },
    { group: 'enter', primitive: 'rangeReveal', type: 'revealSoft', params: { selBasedOn: 'word', selShape: 'round', dy: 0.4, opacity: 0, blur: 14 }, motion: { in: { duration: 0.9, ease: 'cubicOut' } } },
    { group: 'enter', primitive: 'rangeReveal', type: 'revealRandom', params: { selBasedOn: 'letter', selShape: 'square', selRandom: true, selSeed: 0.4, opacity: 0, blur: 20, flash: 0.3 }, motion: { in: { duration: 0.8, ease: 'linear' } } },
    { group: 'enter', primitive: 'tracking', type: 'trackIn', params: { amount: 1.4, trackAxis: 'x' }, motion: { in: { duration: 1.2, ease: 'expoOut' } } },
    { group: 'exit', primitive: 'tracking', type: 'trackOut', params: { amount: 1.1, trackAxis: 'x' }, motion: { out: { duration: 0.7, ease: 'expoIn' } } },
    { group: 'hold', primitive: 'tracking', type: 'trackBreath', params: { amount: 0.06, mode: 'breathe', freq: 0.2, trackAxis: 'x' } },
    { group: 'hold', primitive: 'tracking', type: 'trackBeat', params: { amount: 0.08, mode: 'beat', trackAxis: 'x' } },

    // --- letter-wise attributes (style.scoped) --------------------------------
    // These are the scoped groups, so each preset pins the scope that makes the
    // attribute letter-wise: picking the type writes a ready-to-see entry (every
    // other letter, every third, every other word) instead of an unscoped one.
    // `text` sets the size / weight / colour of the letter itself, `bgFill`
    // paints its background square and `bgShape none` hides it.
    { group: 'text', primitive: 'span', type: 'spanEveryOther', params: { scale: 1.3 }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } },
    { group: 'text', primitive: 'span', type: 'spanEveryOtherAlt', params: { scale: 1.3 }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 1 } },
    { group: 'text', primitive: 'span', type: 'spanEveryThird', params: { scale: 1.45 }, scope: { kind: 'nth', unit: 'letter', every: 3, offset: 0 } },
    { group: 'text', primitive: 'span', type: 'spanEveryWord', params: { scale: 1.2 }, scope: { kind: 'nth', unit: 'word', every: 2, offset: 0 } },
    { group: 'text', primitive: 'span', type: 'spanColorEveryOther', params: { color: '#ff8a3d' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } },
    { group: 'text', primitive: 'span', type: 'spanColorEveryLine', params: { color: '#4dc8ff' }, scope: { kind: 'nth', unit: 'line', every: 2, offset: 0 } },
    { group: 'bgFill', primitive: 'solid', type: 'bgEveryOther', params: { color: '#ff8a3d' }, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 0 } },
    { group: 'bgFill', primitive: 'solid', type: 'bgEveryThird', params: { color: '#4dc8ff' }, scope: { kind: 'nth', unit: 'letter', every: 3, offset: 0 } },
    { group: 'bgShape', primitive: 'none', type: 'bgHideEveryOther', params: {}, scope: { kind: 'nth', unit: 'letter', every: 2, offset: 1 } },
    { group: 'bgShape', primitive: 'none', type: 'bgHideEveryThird', params: {}, scope: { kind: 'nth', unit: 'letter', every: 3, offset: 0 } },
  ];

  const registered = [];
  for (const preset of PRESETS) {
    const entry = fx.registerPreset(preset);
    if (entry) registered.push(entry.type);
  }

  return {
    PRESETS,
    registered,
  };
});
