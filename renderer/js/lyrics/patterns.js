(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SA = root.SA || {};
    root.SA.patterns = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The decoration vocabulary shared by the wire patterns (edge.outline /
  // multiLine, post + background shapeLayer) and the pattern fills. The
  // numeric codes match the GLSL `patternMask(kind, ...)` in
  // gl/shaders.js COMMON: 0 is the plain line, 1..4 keep the classic outline
  // meanings (dashed / dotted / double / sketch) and 5.. add the PowerPoint
  // and After Effects primitives. One list, so a select can never offer a
  // pattern the shader does not know.
  const PATTERNS = [
    'solid',
    'dashed',
    'dotted',
    'dashDot',
    'double',
    'triple',
    'stripes',
    'checker',
    'diamond',
    'zigzag',
    'wave',
    'random',
    'railroad',
    'hatch',
    'crosshatch',
    'sketch',
    'doubleDashed',
    'squareChain',
    'chain',
    'ornament',
  ];

  const CODES = {};
  PATTERNS.forEach((name, index) => {
    CODES[name] = index;
  });

  function codeOf(name) {
    const code = CODES[name];
    return code == null ? 0 : code;
  }

  // The values a select may offer, in vocabulary order. `withSolid` is false
  // for callers that read 0 as "no pattern" (the shape passes).
  function options() {
    return PATTERNS.slice();
  }

  return { PATTERNS, CODES, codeOf, options };
});
