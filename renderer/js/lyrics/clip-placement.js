(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SA = root.SA || {};
    root.SA.clipPlacement = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // One placement model for every clip effect: backdrop / background shader
  // clips, filler layers (waveform, spectrum, shapes, pattern, ...) and figure
  // clips. `x` / `y` are frame fractions (-0.5 .. 0.5, +x right, +y down),
  // `scale` is the uniform zoom kept for backwards compatibility (figures
  // clips already store it), `scaleX` / `scaleY` the per-axis zoom and
  // `rotation` the in-plane tilt in degrees (clockwise-positive, matching the
  // CPU shape transform and the `split.angle` convention).
  const DEFAULTS = { enabled: true, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };

  // The shared inspector descriptors. Filler types spread a subset of these
  // into their own PARAMS so every layer edits the same keys; background
  // shader clips (whose `scale` means something effect-local, e.g. the
  // gradient ramp length) keep the placement in the `spec.placement` sidecar
  // and the inspector renders this same list against it.
  const PARAMS = [
    { key: 'enabled', kind: 'bool', default: true },
    { key: 'x', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'y', kind: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'scale', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: 'scaleX', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: 'scaleY', kind: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: 'rotation', kind: 'number', min: -180, max: 180, step: 1, default: 0 },
  ];

  function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function params(keys) {
    const wanted = keys == null ? null : new Set(keys);
    return PARAMS.filter((param) => !wanted || wanted.has(param.key)).map((param) => ({ ...param }));
  }

  function paramsExcept(keys) {
    const dropped = new Set(keys || []);
    return PARAMS.filter((param) => !dropped.has(param.key)).map((param) => ({ ...param }));
  }

  // Placement from a params object (filler layers, figure clips). Missing keys
  // read as the identity so old presets without placement render unchanged.
  function fromParams(source) {
    const input = source || {};
    return {
      enabled: input.enabled !== undefined ? input.enabled !== false : true,
      x: num(input.x, 0),
      y: num(input.y, 0),
      scale: num(input.scale, 1),
      scaleX: num(input.scaleX, 1),
      scaleY: num(input.scaleY, 1),
      rotation: num(input.rotation, 0),
    };
  }

  // Placement from a clip spec sidecar (background shader clips, hand-written
  // per-clip overrides). Missing sidecar reads as the identity.
  function fromSpec(spec) {
    const source = (spec && spec.placement) || {};
    return {
      enabled: source.enabled !== undefined ? source.enabled !== false : true,
      x: num(source.x, 0),
      y: num(source.y, 0),
      scale: num(source.scale, 1),
      scaleX: num(source.scaleX, 1),
      scaleY: num(source.scaleY, 1),
      rotation: num(source.rotation, 0),
    };
  }

  // Every level that can switch a layer off: the clip, the sidecar and the
  // effect params. `false` anywhere wins; anything missing counts as on.
  function isEnabled(spec) {
    if (!spec) return true;
    if (spec.enabled === false || spec.disabled === true) return false;
    const sidecar = spec.placement;
    if (sidecar && (sidecar.enabled === false || sidecar.disabled === true)) return false;
    const effect = spec.params;
    if (effect && (effect.enabled === false || effect.disabled === true)) return false;
    return true;
  }

  // True when the placement draws exactly where the effect drew before:
  // `enabled` never counts as a visual change here (the gate handles it).
  function isIdentity(placement) {
    if (!placement) return true;
    return !num(placement.x, 0) && !num(placement.y, 0)
      && num(placement.scale, 1) === 1
      && num(placement.scaleX, 1) === 1
      && num(placement.scaleY, 1) === 1
      && !num(placement.rotation, 0);
  }

  // The CPU shape transform (figures.transformShapes options): uniform scale
  // rides in `scale`, per-axis zoom in `scaleX` / `scaleY`, the tilt in
  // `rotate` (radians), the frame-fraction offsets in pixels.
  function toTransform(placement, frame) {
    const input = placement || {};
    const size = frame || { width: 1920, height: 1080 };
    return {
      originX: size.width / 2,
      originY: size.height / 2,
      scale: num(input.scale, 1),
      scaleX: num(input.scaleX, 1),
      scaleY: num(input.scaleY, 1),
      dx: num(input.x, 0) * size.width,
      dy: num(input.y, 0) * size.height,
      rotate: (num(input.rotation, 0) * Math.PI) / 180,
    };
  }

  // The background-shader camera for the same placement. The shader samples
  // `uv + offset`, so a pattern moved right needs a negative offset; `y` maps
  // straight through (uv y is up, screen y is down, and the two flips cancel
  // for the offset direction). Rotation matches the CPU transform
  // (clockwise-positive on screen). Uniform zoom rides in `u_camera.z`, the
  // per-axis ratios in `u_place` (see toPlaceScale).
  function toCamera(placement) {
    const input = placement || {};
    // (+ 0 normalises -0 to 0 so uniform comparisons stay stable)
    return [
      -num(input.x, 0) + 0,
      num(input.y, 0) + 0,
      num(input.scale, 1),
      (num(input.rotation, 0) * Math.PI) / 180,
    ];
  }

  // The non-uniform half of the shader placement (`u_place`).
  function toPlaceScale(placement) {
    const input = placement || {};
    return [num(input.scaleX, 1), num(input.scaleY, 1)];
  }

  return {
    DEFAULTS,
    PARAMS,
    params,
    paramsExcept,
    fromParams,
    fromSpec,
    isEnabled,
    isIdentity,
    toTransform,
    toCamera,
    toPlaceScale,
  };
});
