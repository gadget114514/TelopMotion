window.SA = window.SA || {};

SA.canvas2dFallback = (() => {
  'use strict';

  function pathForLetter(letter) {
    if (letter.path2d) return letter;
    const mesh = SA.lyricsScene.meshOf(letter);
    const path = new Path2D();
    const scale = mesh.scale || 1;
    for (const contour of mesh.contours) {
      const points = contour.points;
      path.moveTo(points[0] * scale, points[1] * scale);
      for (let i = 2; i < points.length; i += 2) path.lineTo(points[i] * scale, points[i + 1] * scale);
      path.closePath();
    }
    letter.path2d = path;
    return letter;
  }

  function createRenderer(options) {
    const canvas = options.canvas;
    const ctx = canvas.getContext('2d');
    const state = {
      canvas,
      width: options.width || 1920,
      height: options.height || 1080,
      project: null,
      assets: { fonts: [] },
      quality: options.quality || 'preview',
    };

    function resize(width, height) {
      state.width = Math.max(1, Math.round(width));
      state.height = Math.max(1, Math.round(height));
      if (canvas.width !== state.width) canvas.width = state.width;
      if (canvas.height !== state.height) canvas.height = state.height;
    }

    function setProject(project) {
      state.project = project || null;
    }

    function setAssets(assets) {
      state.assets = assets || { fonts: [] };
    }

    function renderFrame(t) {
      resize(state.width, state.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, state.width, state.height);
      const frame = { cues: [], time: t };
      const project = state.project;
      if (!project) return frame;
      const fonts = state.assets.fonts || [];
      // Same rule as the WebGL engine: build the scene at the frame being
      // rendered, so reduced preview qualities do not draw output-size text.
      const output = project.output || null;
      const sceneScale = output && output.width ? state.width / output.width : 1;
      for (const beat of SA.lyricsEngine.activeBeats(project, t)) {
        const style = SA.project && SA.project.resolveStyle ? SA.project.resolveStyle(project, `cue:${beat.cueId}/beat:${beat.id}`) : {};
        const direction = style && style.layout && style.layout.type === 'vertical' ? 'vertical' : undefined;
        const scene = SA.lyricsScene.buildScene(project, beat, fonts, { direction, scale: sceneScale });
        if (!scene.letters.length) continue;
        let result = null;
        if (typeof SA.motion !== 'undefined' && SA.motion) {
          result = SA.motion.evaluateBeat(scene, t, {
            project,
            beat,
            frame: { width: state.width, height: state.height },
            seed: (project.styleMode && project.styleMode.seed) || 12345,
          });
        }
        if (!result) {
          result = { active: true, letters: scene.letters.map((letter) => ({ x: letter.local.cx, y: letter.local.cy, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1 })) };
        }
        if (!result.active) continue;
        const entry = { cueId: beat.cueId, beatId: beat.id, letters: [] };
        for (let i = 0; i < scene.letters.length; i += 1) {
          const letter = scene.letters[i];
          const letterState = result.letters[i] || { x: letter.local.cx, y: letter.local.cy, rot: 0, scaleX: 1, scaleY: 1, opacity: 1, visibleFrac: 1 };
          const mesh = SA.lyricsScene.meshOf(letter);
          pathForLetter(letter);
          const color = letter.color || { r: 1, g: 1, b: 1, a: 1 };
          const centerX = ((mesh.bbox.x0 + mesh.bbox.x1) / 2) * (mesh.scale || 1);
          const centerY = ((mesh.bbox.y0 + mesh.bbox.y1) / 2) * (mesh.scale || 1);
          ctx.save();
          ctx.translate(letterState.x, letterState.y);
          ctx.rotate(((letterState.rot || 0) * Math.PI) / 180);
          ctx.scale(letterState.scaleX == null ? 1 : letterState.scaleX, letterState.scaleY == null ? 1 : letterState.scaleY);
          ctx.translate(-centerX, -centerY);
          ctx.globalAlpha = Math.max(0, Math.min(1, color.a * (letterState.opacity == null ? 1 : letterState.opacity)));
          if (letterState.visibleFrac != null && letterState.visibleFrac < 0.999) {
            const halfW = Math.max(1, ((mesh.bbox.x1 - mesh.bbox.x0) / 2) * (mesh.scale || 1));
            const threshold = (letterState.visibleFrac * 2 - 1) * halfW;
            ctx.beginPath();
            ctx.rect(centerX - halfW, centerY - halfW * 2, threshold + halfW, halfW * 4);
            ctx.clip();
          }
          ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
          ctx.fill(letter.path2d);
          ctx.restore();
          entry.letters.push({
            path: letter.path,
            char: letter.char,
            quad: [letterState.x - letter.local.w / 2, letterState.y - letter.local.h / 2, letterState.x + letter.local.w / 2, letterState.y - letter.local.h / 2, letterState.x + letter.local.w / 2, letterState.y + letter.local.h / 2, letterState.x - letter.local.w / 2, letterState.y + letter.local.h / 2],
            bbox: { x: letterState.x - letter.local.w / 2, y: letterState.y - letter.local.h / 2, w: letter.local.w, h: letter.local.h },
            center: { x: letterState.x, y: letterState.y },
          });
        }
        frame.cues.push(entry);
      }
      return frame;
    }

    function dispose() {
      /* nothing GPU-side to release */
    }

    return {
      canvas,
      isWebGL2: false,
      state,
      resize,
      setProject,
      setAssets,
      renderFrame,
      dispose,
      debugError: () => 0,
    };
  }

  return { createRenderer };
})();
