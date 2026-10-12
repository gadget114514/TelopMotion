'use strict';

const test = require('node:test');
const assert = require('node:assert');

global.window = global.window || global;
require('../../renderer/js/i18n');

const i18n = global.SA.i18n;

test('languages contains supported languages', () => {
  assert.ok(Array.isArray(i18n.languages));
  assert.ok(i18n.languages.length >= 5);
  assert.ok(i18n.languages.some((lang) => lang.code === 'en'));
  assert.ok(i18n.languages.some((lang) => lang.code === 'ja'));
});

test('t returns translated strings and interpolates variables', () => {
  i18n.set('en');
  assert.strictEqual(i18n.t('app.title'), 'TelopMotion');
  assert.strictEqual(i18n.t('profile.memberSince', { date: '2026-01-01' }), 'Since 2026-01-01');
  assert.strictEqual(i18n.t('nonexistent.key.test'), 'nonexistent.key.test');
});

test('t falls back to English if key is missing in active language', () => {
  i18n.set('ja');
  assert.strictEqual(i18n.t('app.title'), 'TelopMotion');
});

test('tPlural handles singular and plural keys', () => {
  i18n.set('en');
  assert.strictEqual(i18n.tPlural('achievements.songsCount', 1), '1 song');
  assert.strictEqual(i18n.tPlural('achievements.songsCount', 5), '5 songs');
});

test('set, lang, and locale switch current language and locale string', () => {
  i18n.set('ja');
  assert.strictEqual(i18n.lang(), 'ja');
  assert.strictEqual(i18n.locale(), 'ja-JP');

  i18n.set('fr');
  assert.strictEqual(i18n.lang(), 'fr');
  assert.strictEqual(i18n.locale(), 'fr-FR');

  // Setting invalid language keeps current language
  i18n.set('invalid_lang_code');
  assert.strictEqual(i18n.lang(), 'fr');

  // Reset back to English
  i18n.set('en');
  assert.strictEqual(i18n.lang(), 'en');
  assert.strictEqual(i18n.locale(), 'en-US');
});

test('detect selects matching language from navigator or defaults to en', () => {
  const origNav = Object.getOwnPropertyDescriptor(global, 'navigator');
  try {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['ja-JP', 'en-US'] },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(i18n.detect(), 'ja');

    Object.defineProperty(global, 'navigator', {
      value: { languages: ['fr-CA'] },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(i18n.detect(), 'fr');

    Object.defineProperty(global, 'navigator', {
      value: { languages: ['de-DE'] },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(i18n.detect(), 'en');
  } finally {
    if (origNav) Object.defineProperty(global, 'navigator', origNav);
  }
});

test('registerStrings registers new translation keys or overrides existing ones', () => {
  i18n.registerStrings({
    en: { custom: { greeting: 'Hello {name}!' } },
    ja: { custom: { greeting: 'こんにちは {name}様!' } },
  });

  i18n.set('en');
  assert.strictEqual(i18n.t('custom.greeting', { name: 'World' }), 'Hello World!');

  i18n.set('ja');
  assert.strictEqual(i18n.t('custom.greeting', { name: 'World' }), 'こんにちは World様!');

  i18n.set('en');
});
