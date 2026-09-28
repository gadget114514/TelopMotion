window.SA = window.SA || {};

SA.overlay = (() => {
  'use strict';

  const HANDLE = 7;
  const SNAP = 6;

  const el = {};
  let ctx = null;
  let frameInfo = { cues: [] };
  let size = { width: 1920, height: 1080 };
  let drag = null;
  let pathEdit = null;
  let guides = [];
  let depth = 0;

  function t(key) {
    return SA.i18n.t(key);
  }

  function init() {
    el.canvas = document.getElementById('preview-overlay');
    if (!el.canvas) return;
    ctx = el.canvas.getContext('2d');
    el.canvas.addEventListener('pointerdown', onPointerDown);
    el.canvas.addEventListener('pointermove', onPointerMove);
    el.canvas.addEventListener('pointerup', onPointerUp);
    el.canvas.addEventListener('pointercancel', onPointerCancel);
    el.canvas.addEventListener('dblclick', onDoubleClick);
    SA.store.subscribe('overlay', () => draw());
  }

  function setFrame(info) {
    frameInfo = info || { cues: [] };
    const project = SA.store.state.project;
    if (project) {
      const aspect = project.output ? project.output.aspect : '16:9';
      draw();
      void aspect;
    } else {
      draw();
    }
  }

  function setSize(width, height) {
    size = { width: Math.max(1, width), height: Math.max(1, height) };
    if (el.canvas) {
      el.canvas.width = size.width;
      el.canvas.height = size.height;
    }
    draw();
  }

  function cssScale() {
    if (!el.canvas) return 1;
    const rect = el.canvas.getBoundingClientRect();
    return rect.width > 0 ? size.width / rect.width : 1;
  }

  function toEngine(event) {
    const rect = el.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * size.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * size.height,
    };
  }

  function lettersFor(path) {
    const letters = [];
    for (const cue of frameInfo.cues || []) {
      for (const letter of cue.letters || []) {
        if (!path || letter.path.startsWith(path)) letters.push(letter);
      }
    }
    return letters;
  }

  function bboxOf(letters) {
    if (!letters.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const letter of letters) {
      for (let i = 0; i < letter.quad.length; i += 2) {
        x0 = Math.min(x0, letter.quad[i]);
        y0 = Math.min(y0, letter.quad[i + 1]);
        x1 = Math.max(x1, letter.quad[i]);
        y1 = Math.max(y1, letter.quad[i + 1]);
      }
    }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  function handles(box) {
    return [
      { id: 'nw', x: box.x, y: box.y, cursor: 'nwse-resize' },
      { id: 'ne', x: box.x + box.w, y: box.y, cursor: 'nesw-resize' },
      { id: 'se', x: box.x + box.w, y: box.y + box.h, cursor: 'nwse-resize' },
      { id: 'sw', x: box.x, y: box.y + box.h, cursor: 'nesw-resize' },
      { id: 'n', x: box.x + box.w / 2, y: box.y, cursor: 'ns-resize' },
      { id: 's', x: box.x + box.w / 2, y: box.y + box.h, cursor: 'ns-resize' },
      { id: 'w', x: box.x, y: box.y + box.h / 2, cursor: 'ew-resize' },
      { id: 'e', x: box.x + box.w, y: box.y + box.h / 2, cursor: 'ew-resize' },
    ];
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const scale = cssScale();
    if (SA.store.state.view.guides) drawGuides();
    for (const line of guides) drawGuideLine(line, scale);
    if (pathEdit) drawPathEdit(scale);
    const sel = SA.inspector ? SA.inspector.selectionInfo() : { kind: 'none', path: '' };
    if (sel.kind === 'none') return;
    const box = bboxOf(lettersFor(sel.path));
    if (!box) return;
    ctx.save();
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    const handleSize = HANDLE * scale;
    ctx.save();
    ctx.fillStyle = '#ff8a3d';
    ctx.strokeStyle = '#1a1005';
    ctx.lineWidth = 1 * scale;
    for (const handle of handles(box)) {
      ctx.beginPath();
      ctx.rect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      ctx.fill();
      ctx.stroke();
    }
    const rotateY = box.y - 24 * scale;
    ctx.beginPath();
    ctx.moveTo(box.x + box.w / 2, box.y);
    ctx.lineTo(box.x + box.w / 2, rotateY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(box.x + box.w / 2, rotateY, handleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawGuides() {
    const { width, height } = size;
    const scale = cssScale();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 138, 61, 0.25)';
    ctx.lineWidth = 1 * scale;
    const thirds = [width / 3, (2 * width) / 3];
    for (const x of thirds) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (const y of [height / 3, (2 * height) / 3]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([8 * scale, 6 * scale]);
    const safe = 0.08;
    ctx.strokeRect(width * safe, height * safe, width * (1 - safe * 2), height * (1 - safe * 2));
    ctx.restore();
  }

  function drawGuideLine(line, scale) {
    ctx.save();
    ctx.strokeStyle = '#ff4d8d';
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    if (line.axis === 'x') {
      ctx.moveTo(line.value, 0);
      ctx.lineTo(line.value, size.height);
    } else {
      ctx.moveTo(0, line.value);
      ctx.lineTo(size.width, line.value);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPathEdit(scale) {
    const points = pathEdit.points;
    ctx.save();
    ctx.strokeStyle = '#4dc8ff';
    ctx.fillStyle = '#4dc8ff';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x * size.width;
      const y = point.y * size.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x * size.width, point.y * size.height, HANDLE * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function pick(event) {
    const point = toEngine(event);
    for (const cue of frameInfo.cues || []) {
      for (let i = (cue.letters || []).length - 1; i >= 0; i -= 1) {
        const letter = cue.letters[i];
        if (pointInQuad(point, letter.quad)) return letter;
      }
    }
    return null;
  }

  function pointInQuad(point, quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return point.x >= Math.min(...xs) && point.x <= Math.max(...xs) && point.y >= Math.min(...ys) && point.y <= Math.max(...ys);
  }

  function handleAt(point) {
    const sel = SA.inspector.selectionInfo();
    const box = bboxOf(lettersFor(sel.path));
    if (!box) return null;
    const scale = cssScale();
    const maxDistance = (HANDLE / 2 + 3) * scale;
    const rotateY = box.y - 24 * scale;
    if (Math.hypot(point.x - (box.x + box.w / 2), point.y - rotateY) <= maxDistance * 1.4) {
      return { id: 'rotate', box };
    }
    for (const handle of handles(box)) {
      if (Math.abs(point.x - handle.x) <= maxDistance && Math.abs(point.y - handle.y) <= maxDistance) {
        return { id: handle.id, box };
      }
    }
    if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) {
      return { id: 'move', box };
    }
    return null;
  }

  function startValue(propPath, fallback) {
    const value = SA.inspector ? SA.inspector.readEffective(propPath) : undefined;
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const point = toEngine(event);
    if (pathEdit) {
      const scale = cssScale();
      for (let index = 0; index < pathEdit.points.length; index += 1) {
        const px = pathEdit.points[index].x * size.width;
        const py = pathEdit.points[index].y * size.height;
        if (Math.hypot(point.x - px, point.y - py) <= HANDLE * scale) {
          pathEdit.index = index;
          try { el.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
          if (SA.store.beginTransaction) {
            SA.store.beginTransaction('edit path');
            pathEdit.transaction = true;
          }
          return;
        }
      }
      pathEdit = null;
      draw();
      return;
    }
    const hit = handleAt(point);
    if (!hit) {
      const letter = pick(event);
      if (letter) SA.inspector.selectAt(letter.path);
      else SA.store.setSelection([], null);
      return;
    }
    try { el.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    depth = 0;
    drag = {
      id: hit.id,
      box: hit.box,
      start: point,
      base: {
        x: startValue('transform.x', 0),
        y: startValue('transform.y', 0),
        scale: startValue('transform.scale', 1),
        rotate: startValue('transform.rotate', 0),
      },
      startAngle: Math.atan2(point.y - (hit.box.y + hit.box.h / 2), point.x - (hit.box.x + hit.box.w / 2)),
    };
    if (SA.store.beginTransaction) {
      SA.store.beginTransaction('transform');
      drag.transaction = true;
    }
  }

  function applyTransform(propPath, value) {
    const sel = SA.inspector.selectionInfo();
    const coalesceKey = `${sel.path}|${propPath}|drag`;
    if (sel.kind === 'letter' || sel.kind === 'word' || sel.kind === 'line') {
      SA.store.commands.setProp(sel.path, propPath, value, { coalesceKey });
    } else {
      SA.store.commands.setStyleProp(SA.inspector.scopeOf(sel), propPath, value, { coalesceKey });
    }
  }

  function onPointerMove(event) {
    if (pathEdit && pathEdit.index != null) {
      const point = toEngine(event);
      const next = pathEdit.points.map((entry, index) =>
        index === pathEdit.index ? { x: Math.max(0, Math.min(1, point.x / size.width)), y: Math.max(0, Math.min(1, point.y / size.height)) } : entry
      );
      pathEdit.points = next;
      if (pathEdit.onChange) pathEdit.onChange(next, true);
      draw();
      return;
    }
    if (!drag) return;
    const point = toEngine(event);
    guides = [];
    if (drag.id === 'move') {
      let nextX = drag.base.x + (point.x - drag.start.x);
      let nextY = drag.base.y + (point.y - drag.start.y);
      if (SA.store.state.view.snapping !== false) {
        const centerX = drag.box.x + drag.box.w / 2;
        const centerY = drag.box.y + drag.box.h / 2;
        const snapped = snapMove(
          centerX + (nextX - drag.base.x),
          centerY + (nextY - drag.base.y),
          drag,
          nextX,
          nextY
        );
        nextX = snapped.x;
        nextY = snapped.y;
      }
      if (Math.abs(nextX - drag.base.x) > 0.001) applyTransform('transform.x', round2(nextX));
      if (Math.abs(nextY - drag.base.y) > 0.001) applyTransform('transform.y', round2(nextY));
    } else if (drag.id === 'rotate') {
      const angle = Math.atan2(point.y - (drag.box.y + drag.box.h / 2), point.x - (drag.box.x + drag.box.w / 2));
      let degrees = drag.base.rotate + ((angle - drag.startAngle) * 180) / Math.PI;
      if (Math.abs(degrees % 15) < 4 || Math.abs((degrees % 15) - 15) < 4) degrees = Math.round(degrees / 15) * 15;
      applyTransform('transform.rotate', round2(degrees));
    } else {
      const centerX = drag.box.x + drag.box.w / 2;
      const centerY = drag.box.y + drag.box.h / 2;
      const startDistance = Math.hypot(drag.start.x - centerX, drag.start.y - centerY) || 1;
      const distance = Math.hypot(point.x - centerX, point.y - centerY);
      let factor = distance / startDistance;
      const vertical = drag.id === 'n' || drag.id === 's';
      const horizontal = drag.id === 'w' || drag.id === 'e';
      if (vertical) factor = Math.max(0.05, Math.abs(point.y - centerY) / Math.max(1, Math.abs(drag.start.y - centerY)));
      if (horizontal) factor = Math.max(0.05, Math.abs(point.x - centerX) / Math.max(1, Math.abs(drag.start.x - centerX)));
      const scaleValue = Math.max(0.05, drag.base.scale * factor);
      if (vertical) applyTransform('transform.scaleY', round3(scaleValue));
      else if (horizontal) applyTransform('transform.scaleX', round3(scaleValue));
      else applyTransform('transform.scale', round3(scaleValue));
    }
    draw();
  }

  function snapMove(centerX, centerY, dragState, nextX, nextY) {
    const targetsX = [size.width / 2, size.width / 3, (2 * size.width) / 3];
    const targetsY = [size.height / 2, size.height / 3, (2 * size.height) / 3];
    for (const target of targetsX) {
      if (Math.abs(centerX - target) <= SNAP) {
        nextX += target - centerX;
        guides.push({ axis: 'x', value: target });
        break;
      }
    }
    for (const target of targetsY) {
      if (Math.abs(centerY - target) <= SNAP) {
        nextY += target - centerY;
        guides.push({ axis: 'y', value: target });
        break;
      }
    }
    void dragState;
    return { x: nextX, y: nextY };
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function round3(value) {
    return Math.round(value * 1000) / 1000;
  }

  function onPointerUp(event) {
    try { if (el.canvas && el.canvas.hasPointerCapture(event.pointerId)) el.canvas.releasePointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    if (pathEdit) {
      pathEdit.index = null;
      if (pathEdit.onChange) pathEdit.onChange(pathEdit.points, false);
      if (pathEdit.transaction && SA.store.endTransaction) SA.store.endTransaction();
      pathEdit.transaction = false;
    }
    if (drag && drag.transaction && SA.store.endTransaction) SA.store.endTransaction();
    drag = null;
    guides = [];
    draw();
  }

  function onPointerCancel(event) {
    try { if (el.canvas && el.canvas.hasPointerCapture(event.pointerId)) el.canvas.releasePointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    if (pathEdit) {
      pathEdit.index = null;
      if (pathEdit.transaction && SA.store.cancelTransaction) SA.store.cancelTransaction();
      pathEdit.transaction = false;
    }
    if (drag && drag.transaction && SA.store.cancelTransaction) SA.store.cancelTransaction();
    drag = null;
    guides = [];
    draw();
  }

  function onDoubleClick(event) {
    const letter = pick(event);
    if (!letter) {
      SA.inspector.cycleLevel(-1);
      return;
    }
    const parts = letter.path.split('/');
    depth = Math.min(parts.length - 1, depth + 1);
    SA.inspector.selectAt(parts.slice(0, depth + 1).join('/'));
  }

  function beginPathEdit(points, onChange) {
    pathEdit = { points: points.map((point) => ({ ...point })), onChange, index: null };
    draw();
  }

  function nudge(dx, dy) {
    const sel = SA.inspector.selectionInfo();
    if (sel.kind === 'none') return;
    const x = startValue('transform.x', 0) + dx;
    const y = startValue('transform.y', 0) + dy;
    if (dx) applyTransform('transform.x', round2(x));
    if (dy) applyTransform('transform.y', round2(y));
  }

  return { init, setFrame, setSize, draw, beginPathEdit, nudge, pick: (event) => pick(event) };
})();
