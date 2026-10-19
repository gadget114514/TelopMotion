const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('welcome screen overlay z-index is higher than preview-overlay', () => {
  const cssPath = path.join(__dirname, '../../renderer/css/studio.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Parse z-index for #preview-overlay
  const overlayMatch = css.match(/#preview-overlay\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(overlayMatch, '#preview-overlay must have a z-index in studio.css');
  const overlayZIndex = parseInt(overlayMatch[1], 10);

  // Parse z-index for .welcome
  const welcomeMatch = css.match(/\.welcome\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(welcomeMatch, '.welcome must have a z-index in studio.css');
  const welcomeZIndex = parseInt(welcomeMatch[1], 10);

  assert.ok(
    welcomeZIndex > overlayZIndex,
    `.welcome z-index (${welcomeZIndex}) must be higher than #preview-overlay z-index (${overlayZIndex}) so buttons are clickable`
  );
});

test('studio.html contains welcome screen buttons', () => {
  const htmlPath = path.join(__dirname, '../../renderer/studio.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="welcome"'), 'studio.html must contain #welcome');
  assert.ok(html.includes('id="welcome-start"'), 'studio.html must contain #welcome-start button');
  assert.ok(html.includes('id="welcome-lyrics"'), 'studio.html must contain #welcome-lyrics button');
  assert.ok(html.includes('id="welcome-open"'), 'studio.html must contain #welcome-open button');
});
