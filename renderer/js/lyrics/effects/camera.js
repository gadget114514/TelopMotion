(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registry'));
  else {
    root.SA = root.SA || {};
    root.SA.camera = factory(root.SA.fx);
  }
})(typeof self !== 'undefined' ? self : this, function (fx) {
  'use strict';

  const TAU = Math.PI * 2;

  function num(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // Camera moves are frame posts: the finished frame (text + backgrounds +
  // layers) is pushed / panned / shaken as one picture. The list follows the
  // moves a lyric video actually uses, not a physical 3D camera.
  const MOVES = [
    'pushIn', 'pullOut', 'panLeft', 'panRight', 'panUp', 'panDown', 'tilt',
    'zoomPunch', 'handheld', 'orbit',
  ];

  const MOVE_CODES = {};
  MOVES.forEach((name, index) => {
    MOVE_CODES[name] = index;
  });

  fx.register({
    group: 'post',
    type: 'camera',
    tags: ['pro', 'camera', 'featured'],
    pack: 'pro',
    stackable: true,
    cost: 3,
    params: [
      { key: 'move', kind: 'select', options: MOVES, default: 'pushIn', section: 'camera' },
      { key: 'amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.25, random: [0.1, 0.5], section: 'camera' },
      { key: 'speed', kind: 'number', min: 0.05, max: 3, step: 0.05, default: 0.5, section: 'camera' },
      { key: 'shake', kind: 'number', min: 0, max: 1, step: 0.01, default: 0, random: [0, 0.4], section: 'camera' },
      { key: 'seed', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5, section: 'camera' },
      { key: 'enabled', kind: 'bool', default: true, section: 'camera' },
      { key: 'in', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'camera' },
      { key: 'out', kind: 'number', min: 0, max: 1, step: 0.01, default: 1, section: 'camera' },
    ],
    defaults: { target: 'frame' },
    normalize(params) {
      return {
        ...params,
        move: MOVE_CODES[params.move] == null ? 'pushIn' : params.move,
        amount: num(params.amount, 0.25),
        speed: num(params.speed, 0.5),
        shake: num(params.shake, 0),
        seed: num(params.seed, 0.5),
      };
    },
  });

  // The post shader branch reads u_type 45 and decodes the camera from
  // u_params / u_params2. `progress` (0..1 inside the beat) drives one-way
  // moves; `time` drives looped moves (handheld / orbit).
  fx.postExtensions = fx.postExtensions || {};
  fx.postExtensions.camera = {
    code: 45,
    uniforms(params, ctx) {
      const p = params || {};
      const context = ctx || {};
      const move = MOVE_CODES[p.move] == null ? 0 : MOVE_CODES[p.move];
      const envelope = context.envelope == null ? 1 : Math.max(0, context.envelope);
      const progress = context.progress == null ? 1 : Math.min(1, Math.max(0, context.progress));
      return {
        u_params: [move, num(p.amount, 0.25), num(p.speed, 0.5), envelope],
        u_params2: [progress, context.time || 0, num(p.shake, 0), num(p.seed, 0.5)],
      };
    },
  };

  // Worst-case, progress-independent camera extent for the CPU frame guard.
  // `zoom` scales the effective frame down, `ox`/`oy` are the frame-fraction
  // offsets of its centre (see the camera branch of the post shader).
  function maxExtent(params) {
    const p = params || {};
    const move = MOVE_CODES[p.move] == null ? 0 : MOVE_CODES[p.move];
    const amount = Math.max(0, num(p.amount, 0.25));
    const shake = Math.max(0, num(p.shake, 0));
    let zoom = 1;
    let ox = 0;
    let oy = 0;
    if (move === 0 || move === 1) zoom = 1 + amount; // pushIn / pullOut
    else if (move === 2 || move === 3) ox = amount / 2; // panLeft / panRight
    else if (move === 4 || move === 5) oy = amount / 2; // panUp / panDown
    else if (move === 6) zoom = 1 + 0.3 * amount; // tilt (rotation only)
    else if (move === 7) zoom = 1 + 1.4 * amount; // zoomPunch
    else if (move === 8) {
      zoom = 1 + 0.065 * amount; // handheld
      ox = 0.06 * amount;
      oy = 0.06 * amount;
    } else if (move === 9) {
      zoom = 1 + 0.25 * amount; // orbit
      ox = 0.18 * amount;
      oy = 0.18 * amount;
    }
    ox += 0.01 * shake;
    oy += 0.01 * shake;
    return { zoom, ox, oy };
  }

  return {
    MOVES,
    MOVE_CODES,
    maxExtent,
  };
});
