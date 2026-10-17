'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Extract validateFilters implementation or function logic for testing
const mainContent = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8');

// Use Function evaluator to isolate validateFilters function from main.js without requiring Electron modules
const match = mainContent.match(/(const DEFAULT_FILTERS = [\s\S]*?function validateFilters[\s\S]*?^})/m);
assert.ok(match, 'validateFilters definition found in main.js');

const evaluateValidateFilters = new Function(`${match[0]}; return validateFilters;`);
const validateFilters = evaluateValidateFilters();

test('validateFilters returns default filters on missing, empty, or non-array inputs', () => {
  const expectedDefault = [{ name: 'All files', extensions: ['*'] }];
  assert.deepEqual(validateFilters(null), expectedDefault);
  assert.deepEqual(validateFilters(undefined), expectedDefault);
  assert.deepEqual(validateFilters([]), expectedDefault);
  assert.deepEqual(validateFilters('invalid'), expectedDefault);
  assert.deepEqual(validateFilters(123), expectedDefault);
  assert.deepEqual(validateFilters({ name: 'test' }), expectedDefault);
});

test('validateFilters handles valid filters correctly', () => {
  const input = [
    { name: 'JSON files', extensions: ['json'] },
    { name: 'Subtitle files', extensions: ['srt', 'lrc'] },
  ];
  const expected = [
    { name: 'JSON files', extensions: ['json'] },
    { name: 'Subtitle files', extensions: ['srt', 'lrc'] },
  ];
  assert.deepEqual(validateFilters(input), expected);
});

test('validateFilters cleans extension prefixes like *. and .', () => {
  const input = [
    { name: 'Media', extensions: ['*.mp4', '.mkv', '  *.webm  ', '   .mov'] },
  ];
  const expected = [
    { name: 'Media', extensions: ['mp4', 'mkv', 'webm', 'mov'] },
  ];
  assert.deepEqual(validateFilters(input), expected);
});

test('validateFilters auto-generates name if name is missing or empty', () => {
  const input = [
    { extensions: ['json', 'txt'] },
    { name: '   ', extensions: ['*'] },
  ];
  const expected = [
    { name: 'JSON, TXT files', extensions: ['json', 'txt'] },
    { name: 'All files', extensions: ['*'] },
  ];
  assert.deepEqual(validateFilters(input), expected);
});

test('validateFilters filters out malformed or invalid filter items and extensions', () => {
  const input = [
    null,
    123,
    'not an object',
    { name: 'No extensions' },
    { name: 'Bad extensions', extensions: 'not-an-array' },
    { name: 'Invalid ext chars', extensions: ['js; rm -rf /', 'valid_123', 'a/b', '<script>'] },
  ];
  const expected = [
    { name: 'Invalid ext chars', extensions: ['valid_123'] },
  ];
  assert.deepEqual(validateFilters(input), expected);
});

test('validateFilters deduplicates extensions and enforces max limits and truncation', () => {
  const longName = 'A'.repeat(200);
  const input = [
    { name: longName, extensions: ['png', 'PNG', 'png', 'jpg'] },
  ];
  const result = validateFilters(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].name.length, 128);
  assert.deepEqual(result[0].extensions, ['png', 'PNG', 'jpg']);
});

test('validateFilters falls back to default if no valid filters remain after sanitization', () => {
  const input = [
    { name: 'Hacks', extensions: ['../../etc/passwd', 'invalid/ext'] },
  ];
  const expectedDefault = [{ name: 'All files', extensions: ['*'] }];
  assert.deepEqual(validateFilters(input), expectedDefault);
});
