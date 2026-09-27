'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const textflow = require('../../renderer/js/lyrics/textflow.js');

const EN_ARTICLES = ['a', 'an', 'the', 'this', 'that', 'my', 'your', 'his', 'her', 'its', 'our', 'their'];
const JA_NO_START = '、。，．・：；！？ー―〜…‥）」』】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ';
const JA_NO_END = '「『（【〔〈《';

function measure(text, size) {
  let width = 0;
  for (const character of Array.from(String(text))) {
    width += (/[\u3000-\u9fff\uff00-\uffef]/.test(character) ? 1 : 0.55) * size;
  }
  return width;
}

function flow(text, options) {
  const opts = options || {};
  return textflow.flow(
    { text, start: opts.start == null ? 0 : opts.start, end: opts.end == null ? 12 : opts.end, aspect: opts.aspect || '16:9' },
    {
      style: { size: 96, lineHeight: 1.2, maxWidth: opts.maxWidth == null ? 0.9 : opts.maxWidth },
      frame: { width: opts.frameWidth || 1920, height: opts.frameHeight || 1080 },
      measure,
      settings: opts.settings,
    }
  );
}

function lastWord(line) {
  return line.trim().split(/\s+/).pop().replace(/[^A-Za-z']+$/, '').toLowerCase();
}

test('English text splits into pages that fill the cue and stay readable', () => {
  const result = flow('A journey of a thousand miles begins with a single step but every step is a story worth telling to someone.', { end: 14 });
  assert.ok(result.pages.length >= 2, `pages ${result.pages.length}`);
  assert.ok(result.pages.every((page) => ['page', 'single'].includes(page.kind)));
  const sum = result.pages.reduce((total, page) => total + (page.to - page.from), 0);
  assert.ok(Math.abs(sum - 14) < 1e-6, `page times sum ${sum}`);
  assert.ok(result.pages.every((page) => page.to - page.from >= 1.2 - 1e-6));
  assert.ok(result.pages.every((page) => page.lines.length <= 2));
  for (const page of result.pages) {
    for (const line of page.lines) {
      assert.ok(!EN_ARTICLES.includes(lastWord(line)), `line ends with an article: ${line}`);
    }
  }
});

test('English pages prefer sentence ends for page breaks', () => {
  const result = flow('The first sentence fills up two lines of text here. This is the second sentence of the test.', { end: 12 });
  assert.ok(result.pages.length >= 2, `pages ${result.pages.length}`);
  const firstPageLastLine = result.pages[0].lines[result.pages[0].lines.length - 1];
  assert.ok(/[.!?]$/.test(firstPageLastLine), `first page ends with: ${firstPageLastLine}`);
});

test('English avoids a single-word last line when a balanced break exists', () => {
  const result = flow('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii', {
    aspect: '9:16',
    frameWidth: 1080,
    frameHeight: 1920,
    maxWidth: 1,
    end: 20,
  });
  const lines = result.pages.flatMap((page) => page.lines);
  assert.ok(lines.length >= 3);
  const last = lines[lines.length - 1];
  assert.ok(last.trim().split(/\s+/).length >= 2, `single-word last line: ${last}`);
});

test('Japanese breaks respect line-start and line-end rules', () => {
  const result = flow('今日は晴れです。公園へ行きます。写真を撮ります。明日も晴れるといいですね。', {
    aspect: '9:16',
    frameWidth: 1080,
    frameHeight: 1920,
    end: 16,
  });
  assert.ok(result.pages.length >= 2, `pages ${result.pages.length}`);
  for (const page of result.pages) {
    for (const line of page.lines) {
      assert.ok(!JA_NO_START.includes(line[0]), `line starts with a prohibited character: ${line}`);
      assert.ok(!JA_NO_END.includes(line[line.length - 1]), `line ends with an opener: ${line}`);
    }
  }
  const breakEnds = result.pages.slice(0, -1).map((page) => page.lines[page.lines.length - 1]);
  assert.ok(breakEnds.some((line) => /[、。]$/.test(line)), `no clause boundary used: ${breakEnds.join(' / ')}`);
});

test('Japanese keeps a number with its counter', () => {
  const result = flow('合計100曲を達成しました', {
    aspect: '9:16',
    frameWidth: 400,
    frameHeight: 800,
    maxWidth: 1,
    end: 8,
  });
  const lines = result.pages.flatMap((page) => page.lines);
  assert.ok(lines.some((line) => line.includes('100') && line.includes('曲')), `100 split from 曲: ${lines.join(' / ')}`);
  assert.ok(!lines.some((line) => /\d$/.test(line)), `line ends with a number: ${lines.join(' / ')}`);
});

test('forced line and page breaks are respected', () => {
  const result = flow('one\\Ntwo\\Pthree\\Nfour', { end: 8 });
  assert.equal(result.pages.length, 2);
  assert.deepEqual(result.pages[0].lines, ['one', 'two']);
  assert.deepEqual(result.pages[1].lines, ['three', 'four']);
});

test('long holds repeat the pages deterministically', () => {
  const options = { start: 0, end: 40, settings: { longHold: { mode: 'repeat', threshold: 6, interval: 4 } } };
  const first = flow('Hello world', options);
  const repeats = first.pages.filter((page) => page.kind === 'repeat');
  assert.ok(repeats.length >= 5, `repeat pages ${repeats.length}`);
  assert.equal(first.repeats.length, 5 + (repeats.length - 5));
  assert.equal(first.repeats[0].kind, 'repeat');
  assert.ok(first.repeats[0].t >= first.pages[0].to - 1e-6);
  const second = flow('Hello world', options);
  assert.deepEqual(second.pages, first.pages);
  assert.deepEqual(second.repeats, first.repeats);
});

test('recap reserves its time at the end of the cue', () => {
  const text = 'The first sentence ends here. The second sentence continues with more words to fill another page and a bit more.';
  const result = flow(text, { start: 0, end: 20, settings: { recap: { mode: 'end', minPages: 2 } } });
  assert.ok(result.recap, 'recap missing');
  assert.ok(Math.abs(result.recap.to - 20) < 1e-6);
  const basePages = result.pages.filter((page) => page.kind !== 'recap');
  const pageSum = basePages.reduce((total, page) => total + (page.to - page.from), 0);
  assert.ok(Math.abs(pageSum - result.recap.from) < 1e-6, `pages end at ${pageSum}, recap starts at ${result.recap.from}`);
  assert.ok(result.pages.some((page) => page.kind === 'recap'));
  assert.ok(result.recap.lines.length <= 6);
  const off = flow(text, { start: 0, end: 20, settings: { recap: { mode: 'off' } } });
  assert.equal(off.recap, null);
});

test('recap is skipped when the cue is too short', () => {
  const text = 'The first sentence ends here. The second sentence continues with more words to fill another page and a bit more.';
  const result = flow(text, { start: 0, end: 3.2, settings: { recap: { mode: 'end', minPages: 2 }, minPageDuration: 1.2 } });
  assert.equal(result.recap, null);
  assert.ok(result.warnings.some((warning) => warning.code === 'recap-skipped' || warning.code === 'recap-shortened'));
});

test('the tooFast warning appears when pages cannot keep the minimum duration', () => {
  const result = flow('The first sentence ends here. The second sentence continues with more words to fill another page and a bit more.', {
    start: 0,
    end: 2.5,
  });
  assert.ok(result.pages.length >= 2);
  assert.ok(result.warnings.some((warning) => warning.code === 'tooFast'), JSON.stringify(result.warnings));
});

test('text that only fits when shrunk uses a fontScale and stays one page', () => {
  const result = flow('abcdefghijkl'.repeat(3), { end: 10 });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].kind, 'single');
  assert.ok(result.pages[0].fontScale < 1 && result.pages[0].fontScale >= 0.8, `fontScale ${result.pages[0].fontScale}`);
});

test('an unbreakable word wider than the frame shrinks below minFontScale with a warning', () => {
  const result = flow('abcdefghij'.repeat(6), { start: 0, end: 10 });
  assert.equal(result.pages.length, 1);
  assert.ok(result.pages[0].fontScale < 0.8, `fontScale ${result.pages[0].fontScale}`);
  assert.ok(result.warnings.some((warning) => warning.code === 'overflow'));
});

test('gatherPlan maps every recap grapheme to one source or to the comes-in set', () => {
  const plan = textflow.gatherPlan('abcd', 'ab');
  assert.deepEqual(plan.sources, [0, 1, null, null]);
  const plan2 = textflow.gatherPlan('abab', 'ab');
  assert.deepEqual(plan2.sources, [0, 1, null, null]);
  const plan3 = textflow.gatherPlan('あい愛', 'あい');
  assert.deepEqual(plan3.sources, [0, 1, null]);
});

test('restructure creates stable beat ids and kinds', () => {
  const cue = { id: 'c1', start: 0, end: 14, text: 'A journey of a thousand miles begins with a single step but every step is a story worth telling to someone.' };
  const options = {
    style: { size: 96, lineHeight: 1.2, maxWidth: 0.9 },
    frame: { width: 1920, height: 1080 },
    measure,
  };
  const first = textflow.restructure(cue, options);
  assert.ok(first.beats.length >= 2);
  assert.equal(first.beats[0].id, 'c1:page1');
  assert.equal(first.beats[0].kind, 'page');
  assert.equal(first.beats[1].id, 'c1:page2');
  assert.ok(first.beats.every((beat) => beat.start >= cue.start && beat.end <= cue.end));
  const again = textflow.restructure(cue, options);
  assert.deepEqual(again.beats.map((beat) => beat.id), first.beats.map((beat) => beat.id));
});

test('apply keeps pinned beats and reports orphans', () => {
  const project = {
    output: { width: 1920, height: 1080, aspect: '16:9' },
    meta: { lang: 'en' },
    style: { text: { size: 96, lineHeight: 1.2, maxWidth: 0.9 } },
    script: {
      cues: [{ id: 'c1', start: 0, end: 14, text: 'A journey of a thousand miles begins with a single step but every step is a story worth telling to someone.' }],
    },
    beats: {},
    orphanBeats: {},
  };
  textflow.apply(project, { measure, style: project.style.text });
  const beats = project.beats.c1;
  assert.ok(beats.length >= 2);
  beats[0].pinned = true;
  beats[0].start = 0.2;
  beats[0].end = 3.4;
  textflow.apply(project, { measure, style: project.style.text });
  const kept = project.beats.c1.find((beat) => beat.pinned);
  assert.ok(kept, 'pinned beat lost');
  assert.equal(kept.start, 0.2);
  assert.equal(kept.end, 3.4);
  assert.ok(!project.beats.c1.some((beat) => !beat.pinned && beat.start < kept.end - 1e-4 && beat.end > kept.start + 1e-4), 'overlapping beat kept');

  project.script.cues[0].text = 'Completely different text now.';
  textflow.apply(project, { measure, style: project.style.text });
  assert.ok(project.orphanBeats.c1 && project.orphanBeats.c1.length === 1, 'orphan not reported');
  assert.ok(!project.beats.c1.some((beat) => beat.pinned), 'orphan kept in the beats');
});

test('line chunks keep every chunk under the max duration and inside the cue', () => {
  const result = flow('Hello world this is a test of the telop motion engine', {
    start: 0,
    end: 8,
    settings: { chunk: 'line', maxChunkDuration: 1 },
  });
  assert.ok(result.pages.length >= 2, `chunks ${result.pages.length}`);
  assert.ok(result.pages.every((chunk) => chunk.kind === 'page'));
  assert.ok(result.pages.every((chunk) => ['line', 'phrase', 'word'].includes(chunk.chunk)));
  for (const chunk of result.pages) {
    const duration = chunk.to - chunk.from;
    assert.ok(duration > 0 && duration < 1, `chunk "${chunk.text}" lasts ${duration}`);
    assert.ok(chunk.from >= -1e-6 && chunk.to <= 8 + 1e-6, `chunk outside the cue: ${chunk.from}..${chunk.to}`);
  }
});

test('phrase chunks split Japanese lines into short telop units', () => {
  const result = flow('今日は晴れです。公園へ行きます。写真を撮ります。', {
    start: 0,
    end: 6,
    settings: { chunk: 'phrase', maxChunkDuration: 1 },
  });
  assert.ok(result.pages.length >= 3, `chunks ${result.pages.length}`);
  assert.ok(result.pages.every((chunk) => chunk.to - chunk.from < 1));
  assert.ok(result.pages.every((chunk) => chunk.text.trim().length > 0));
  assert.ok(result.pages.map((chunk) => chunk.text).join('').includes('公園'));
});

test('a chunk whose reading estimate exceeds the cap is divided into words', () => {
  const result = flow('one two three four five six seven eight', {
    start: 0,
    end: 4,
    settings: { chunk: 'phrase', maxChunkDuration: 1 },
  });
  assert.ok(result.pages.length >= 3, `chunks ${result.pages.length}`);
  assert.ok(result.pages.every((chunk) => chunk.to - chunk.from < 1));
  assert.ok(result.pages.some((chunk) => chunk.chunk === 'word'));
});

test('restructure keeps chunk levels on the beats and stable ids', () => {
  const cue = { id: 'c1', start: 0, end: 5, text: 'Hello world this is the telop engine' };
  const options = {
    style: { size: 96, lineHeight: 1.2, maxWidth: 0.9 },
    frame: { width: 1920, height: 1080 },
    measure,
    settings: { chunk: 'phrase', maxChunkDuration: 1 },
  };
  const first = textflow.restructure(cue, options);
  assert.ok(first.beats.length >= 3, `beats ${first.beats.length}`);
  for (const beat of first.beats) {
    assert.equal(beat.kind, 'page');
    assert.ok(['phrase', 'word'].includes(beat.chunk));
    assert.ok(beat.end - beat.start < 1);
    assert.ok(beat.start >= 0 && beat.end <= 5);
  }
  const again = textflow.restructure(cue, options);
  assert.deepEqual(again.beats.map((beat) => beat.id), first.beats.map((beat) => beat.id));
});

test('beatCues flattens beats into SRT-ready cues', () => {
  const project = {
    script: {
      cues: [
        { id: 'c1', start: 0, end: 4, text: 'Hello world' },
        { id: 'c2', start: 5, end: 7, text: 'No beats here' },
      ],
    },
    beats: {
      c1: [
        { id: 'c1:page1', start: 0.5, end: 1.1, text: '', lines: [], kind: 'emphasis' },
        { id: 'c1:page2', start: 0, end: 0.5, text: 'Hello', lines: ['Hello'], kind: 'page' },
        { id: 'c1:page3', start: 1.1, end: 1.7, text: 'world', lines: ['world'], kind: 'page' },
      ],
    },
  };
  const cues = textflow.beatCues(project);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues.map((cue) => cue.text), ['Hello', 'world', 'No beats here']);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[2].start, 5);
});

test('chunk mode still produces the full-text recap at the end', () => {
  const result = flow('one two three four five six seven eight nine ten', {
    start: 0,
    end: 8,
    settings: { chunk: 'phrase', maxChunkDuration: 1, recap: { mode: 'end', minPages: 1 } },
  });
  assert.ok(result.recap, 'recap missing');
  assert.ok(Math.abs(result.recap.to - 8) < 1e-6);
  assert.ok(result.pages.some((page) => page.kind === 'recap'));
  const recapText = result.recap.lines.join(' ');
  assert.ok(recapText.includes('one') && recapText.includes('ten'), `recap text: ${recapText}`);
});

test('chunkThemes expose a valid level and copy their styles', () => {
  const themes = textflow.chunkThemes();
  assert.ok(themes.length >= 3);
  for (const theme of themes) {
    assert.ok(['page', 'line', 'phrase'].includes(theme.chunk));
    assert.ok(theme.style == null || typeof theme.style === 'object');
  }
  const styled = themes.find((theme) => theme.style);
  const copy = textflow.chunkThemes();
  const same = copy.find((theme) => theme.id === styled.id);
  assert.notEqual(same.style, styled.style);
  assert.deepEqual(same.style, styled.style);
});

test('detectLang picks Japanese for CJK text and the fallback otherwise', () => {
  assert.equal(textflow.detectLang('こんにちは世界', 'en'), 'ja');
  assert.equal(textflow.detectLang('Hello world', 'en'), 'en');
  assert.equal(textflow.detectLang('Hello world', 'fr'), 'fr');
  assert.equal(textflow.detectLang('Привет мир', 'en'), 'ru');
});
