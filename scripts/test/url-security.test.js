'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Module = require('node:module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') {
    class BrowserWindow {
      static getAllWindows() { return []; }
      constructor() {}
      loadURL() {}
      loadFile() {}
    }
    return {
      app: {
        getPath: () => '',
        whenReady: () => new Promise(() => {}), // never resolve so main doesn't do stuff
        on: () => {},
        quit: () => {},
      },
      BrowserWindow,
      ipcMain: { handle: () => {}, on: () => {} },
      dialog: {},
      shell: {},
      session: { defaultSession: { webRequest: { onBeforeSendHeaders: () => {} } } },
      nativeImage: {},
      safeStorage: {},
    };
  }
  return originalRequire.apply(this, arguments);
};

process.env.NODE_ENV = 'test';
const { isSafeExternalUrl } = require('../../main.js');

test('isSafeExternalUrl validates URLs correctly', async (t) => {
  await t.test('accepts valid suno.com URLs', () => {
    assert.strictEqual(isSafeExternalUrl('https://suno.com/'), true);
    assert.strictEqual(isSafeExternalUrl('https://www.suno.com/foo'), true);
    assert.strictEqual(isSafeExternalUrl('https://suno.com/some/path?query=1'), true);
  });

  await t.test('rejects non-https URLs', () => {
    assert.strictEqual(isSafeExternalUrl('http://suno.com/'), false);
    assert.strictEqual(isSafeExternalUrl('ftp://suno.com/'), false);
    assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false);
  });

  await t.test('rejects malicious subdomains and similar domains', () => {
    assert.strictEqual(isSafeExternalUrl('https://suno.com.evil.com/'), false);
    assert.strictEqual(isSafeExternalUrl('https://www.suno.com.evil.com/'), false);
    assert.strictEqual(isSafeExternalUrl('https://evil.com/suno.com/'), false);
    assert.strictEqual(isSafeExternalUrl('https://suno.com@evil.com/'), false);
  });

  await t.test('handles backslash safely', () => {
    // node's new URL normalizes \ to / before the authority is parsed if it's in the path,
    // or errors. Let's just make sure it doesn't return true for a bypass.
    assert.strictEqual(isSafeExternalUrl('https://evil.com\\suno.com/'), false);
  });

  await t.test('rejects non-string inputs', () => {
    assert.strictEqual(isSafeExternalUrl(null), false);
    assert.strictEqual(isSafeExternalUrl(undefined), false);
    assert.strictEqual(isSafeExternalUrl({}), false);
  });

  await t.test('rejects malformed URLs', () => {
    assert.strictEqual(isSafeExternalUrl('not a url'), false);
    assert.strictEqual(isSafeExternalUrl('https://'), false);
  });
});
