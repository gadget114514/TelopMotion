'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Helper to create a minimal DOM mock for testing debugConsole in Node.js environment
function createMockDOM() {
  class Element {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.childNodes = [];
      this.attributes = {};
      this._textContent = '';
      this._innerHTML = '';
      this.className = '';
      this.type = '';
      this.hidden = false;
      this.scrollTop = 0;
      this.scrollHeight = 100;
      this.eventListeners = {};
    }

    get textContent() {
      if (this.childNodes.length > 0) {
        return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
      }
      return this._textContent;
    }

    set textContent(val) {
      this._textContent = String(val);
      this.childNodes = [];
      this.children = [];
      if (val !== '') {
        this.childNodes.push(String(val));
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = String(val);
    }

    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      return child;
    }

    addEventListener(event, fn) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(fn);
    }

    dispatchEvent(event) {
      const listeners = this.eventListeners[event.type || event] || [];
      listeners.forEach((fn) => fn(event));
    }
  }

  const elementsById = {};

  const document = {
    createElement(tagName) {
      return new Element(tagName);
    },
    getElementById(id) {
      return elementsById[id] || null;
    },
    registerElement(id, el) {
      elementsById[id] = el;
    }
  };

  const window = {
    SA: {
      i18n: {
        t: (key) => key
      }
    },
    document,
    addEventListener() {},
    removeEventListener() {}
  };
  window.window = window;

  return { window, document, Element };
}

test('debugConsole clears elements safely using textContent and escapes output', () => {
  const { window, document, Element } = createMockDOM();

  const previewConsole = new Element('div');
  previewConsole.id = 'preview-console';
  document.registerElement('preview-console', previewConsole);

  // Load debug-console.js inside virtual context with mock DOM
  const code = fs.readFileSync(path.join(__dirname, '../../renderer/js/studio/debug-console.js'), 'utf8');
  const context = vm.createContext(window);
  vm.runInContext(code, context);

  const debugConsole = window.SA.debugConsole;

  // Initialize debugConsole
  debugConsole.init();

  // Test push & open console
  const maliciousString = '<img src=x onerror=alert(1)>';
  debugConsole.push('log', maliciousString);
  debugConsole.setOpen(true);

  // Verify panel structure built safely
  assert.equal(previewConsole.children.length, 2); // head & listNode
  const listNode = previewConsole.children[1];
  assert.equal(listNode.className, 'console-list');

  // Verify row text content contains exact string without HTML interpretation
  assert.equal(listNode.children.length, 1);
  const row = listNode.children[0];
  const textSpan = row.children[1];
  assert.equal(textSpan.textContent, maliciousString);
  assert.equal(textSpan.innerHTML, ''); // innerHTML should remain untouched / empty

  // Test clear
  debugConsole.clear();
  assert.equal(debugConsole.entries.length, 0);
  // Re-render check empty notice
  assert.equal(listNode.children.length, 1);
  assert.equal(listNode.children[0].className, 'console-empty');
  assert.equal(listNode.children[0].textContent, 'studio.console.empty');
});
