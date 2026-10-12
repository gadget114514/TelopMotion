'use strict';

const test = require('node:test');
const assert = require('node:assert');

const credits = require('../../renderer/js/lyrics/credits');

test('settingsFor returns defaults merged with project credits settings', () => {
  const settings = credits.settingsFor({});
  assert.strictEqual(settings.title.source, 'song');
  assert.strictEqual(settings.artist.source, 'profile');
  assert.strictEqual(settings.template, '{title}\n{artist}');
  assert.strictEqual(settings.modes.element.duration, 4);

  const custom = credits.settingsFor({
    credits: {
      template: '{title} - {artist}',
      title: { source: 'custom', text: 'Custom Song' },
    },
  });
  assert.strictEqual(custom.template, '{title} - {artist}');
  assert.strictEqual(custom.title.source, 'custom');
  assert.strictEqual(custom.title.text, 'Custom Song');
  assert.strictEqual(custom.artist.source, 'profile');
});

test('titleText resolves title from song dataset, informed song settings, or custom text', () => {
  const projectWithDataset = {
    dataset: {
      songs: [{ id: 's1', title: 'Dataset Song' }],
    },
    song: { title: 'Informed Song' },
  };
  const settingsSong = credits.settingsFor({ credits: { title: { source: 'song', songId: 's1' } } });
  assert.strictEqual(credits.titleText(projectWithDataset, settingsSong), 'Dataset Song');

  const settingsCustom = credits.settingsFor({ credits: { title: { source: 'custom', text: 'Custom Title' } } });
  assert.strictEqual(credits.titleText(projectWithDataset, settingsCustom), 'Custom Title');

  const settingsCustomEmpty = credits.settingsFor({ credits: { title: { source: 'custom', text: '' } } });
  assert.strictEqual(credits.titleText(projectWithDataset, settingsCustomEmpty), 'Informed Song');
});

test('artistText resolves artist from profile, informed author settings, or custom text', () => {
  const projectWithProfile = {
    dataset: {
      profile: { displayName: 'Artist Name', handle: 'artisthandle' },
    },
    song: { author: 'Informed Author' },
  };
  const settingsProfile = credits.settingsFor({ credits: { artist: { source: 'profile', showHandle: true } } });
  assert.strictEqual(credits.artistText(projectWithProfile, settingsProfile), 'Artist Name @artisthandle');

  const settingsCustom = credits.settingsFor({ credits: { artist: { source: 'custom', text: 'Custom Artist' } } });
  assert.strictEqual(credits.artistText(projectWithProfile, settingsCustom), 'Custom Artist');

  const settingsCustomEmpty = credits.settingsFor({ credits: { artist: { source: 'custom', text: '' } } });
  assert.strictEqual(credits.artistText(projectWithProfile, settingsCustomEmpty), 'Informed Author');
});

test('fontId getters return specified font IDs or empty string', () => {
  const project = {
    song: { titleFontId: 'font_title_1', authorFontId: 'font_author_1' },
  };
  assert.strictEqual(credits.titleFontIdOf(project), 'font_title_1');
  assert.strictEqual(credits.authorFontIdOf(project), 'font_author_1');
  assert.strictEqual(credits.fontIdForRole(project, 'title'), 'font_title_1');
  assert.strictEqual(credits.fontIdForRole(project, 'artist'), 'font_author_1');
  assert.strictEqual(credits.fontIdForRole(project, 'other'), '');
  assert.strictEqual(credits.titleFontIdOf({}), '');
});

test('expandTemplate and expandTemplateDetailed replace placeholders with values', () => {
  const project = {
    song: { title: 'My Song', author: 'My Artist' },
  };
  const settings = credits.settingsFor({
    credits: {
      template: '{title}\n{artist}\n{extra}',
      extra: { text: '2026 Special' },
    },
  });

  const lines = credits.expandTemplate(project, settings, { year: '2026' });
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[0], 'My Song');
  assert.strictEqual(lines[1], 'My Artist');
  assert.strictEqual(lines[2], '2026 Special');

  const detailed = credits.expandTemplateDetailed(project, settings, { year: '2026' });
  assert.strictEqual(detailed.length, 3);
  assert.deepStrictEqual(detailed[0].roles, ['title']);
  assert.deepStrictEqual(detailed[1].roles, ['artist']);
  assert.deepStrictEqual(detailed[2].roles, ['extra']);
});

test('elements generates intro and end credit elements', () => {
  const project = {
    song: { title: 'Test Song', author: 'Test Author' },
    script: {
      cues: [
        { start: 0, end: 5 },
        { start: 5, end: 12 },
      ],
    },
  };

  const elems = credits.elements(project);
  assert.strictEqual(elems.length, 2);

  const intro = elems.find((e) => e.mode === 'element');
  assert.ok(intro);
  assert.strictEqual(intro.start, 0);
  assert.strictEqual(intro.end, 4);
  assert.ok(intro.text.includes('Test Song'));

  const end = elems.find((e) => e.mode === 'end');
  assert.ok(end);
  assert.strictEqual(end.start, 12);
  assert.strictEqual(end.end, 17);
});

test('extendsDuration calculates extra duration for end credits', () => {
  const project = {
    script: {
      cues: [{ start: 0, end: 20 }],
    },
    credits: {
      modes: {
        end: { enabled: true, duration: 6, afterLastCue: true },
      },
    },
  };

  assert.strictEqual(credits.extendsDuration(project), 26);

  const disabledEnd = {
    ...project,
    credits: {
      modes: {
        end: { enabled: false },
      },
    },
  };
  assert.strictEqual(credits.extendsDuration(disabledEnd), 0);
});

test('alwaysOn returns credit watermark object when enabled within timeframe', () => {
  const project = {
    song: { title: 'Watermark Title', author: 'Watermark Author' },
    credits: {
      modes: {
        always: { enabled: true, from: 2, to: 10, position: 'topRight', opacity: 0.8 },
      },
    },
  };

  assert.strictEqual(credits.alwaysOn(project, 1), null);
  assert.strictEqual(credits.alwaysOn(project, 11), null);

  const active = credits.alwaysOn(project, 5);
  assert.ok(active);
  assert.strictEqual(active.mode, 'always');
  assert.strictEqual(active.position, 'topRight');
  assert.strictEqual(active.opacity, 0.8);
  assert.ok(active.text.includes('Watermark Title'));
});
