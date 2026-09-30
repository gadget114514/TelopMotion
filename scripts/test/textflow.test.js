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

test('apply keeps pinned (edited) beats even when the cue text changes', () => {
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

  const pinnedText = kept.text;
  project.script.cues[0].text = 'Completely different text now.';
  textflow.apply(project, { measure, style: project.style.text });
  // a pinned beat carries its own text (the cue owns only the timing), so it
  // survives restructures instead of being orphaned
  const survived = project.beats.c1.find((beat) => beat.pinned && beat.text === pinnedText);
  assert.ok(survived, 'edited beat was lost after the cue text changed');
  assert.ok(!project.orphanBeats.c1 || project.orphanBeats.c1.length === 0, 'edited beat was orphaned');
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

test('Japanese words come from TinySegmenter', () => {
  const units = textflow.buildUnits([['東京都に行く']], 'ja');
  assert.deepEqual(units.map((unit) => unit.text), ['東京都', 'に', '行く']);
  const sentence = textflow.buildUnits([['今日は晴れです。公園へ行きます。']], 'ja');
  assert.ok(sentence.some((unit) => unit.text === '公園'));
});

test('targetChunkDuration splits the cue into about three second beats', () => {
  const result = flow('one two three four five six seven eight nine ten eleven twelve', {
    start: 0,
    end: 12,
    settings: { chunk: 'phrase', targetChunkDuration: 3 },
  });
  assert.equal(result.pages.length, 4, `beats ${result.pages.length}`);
  const durations = result.pages.map((page) => page.to - page.from);
  for (const duration of durations) assert.ok(Math.abs(duration - 3) < 1.2, `beat ${duration}s`);
  const sum = durations.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 12) < 1e-6, `beats cover ${sum}s`);
  assert.ok(result.pages.every((page) => page.chunk === 'word'));
  assert.ok(result.pages.every((page) => page.text.trim().length > 0));
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

// ---------------------------------------------------------------------------
// fill sizing (fit: 'fill')
// ---------------------------------------------------------------------------

function fillFlow(text, style, options) {
  const opts = options || {};
  return textflow.flow(
    { text, start: 0, end: opts.end == null ? 12 : opts.end, aspect: opts.aspect || '16:9' },
    {
      style: { size: 96, lineHeight: 1.2, maxWidth: 0.9, fit: 'fill', ...(style || {}) },
      frame: { width: opts.frameWidth || 1920, height: opts.frameHeight || 1080 },
      measure,
      settings: opts.settings,
    }
  );
}

test('fill sizing grows a short cue to the target screen coverage', () => {
  const result = fillFlow('愛してる');
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].kind, 'single');
  assert.equal(result.pages[0].lines.length, 1);
  const size = result.pages[0].fontScale * 96;
  assert.ok(Math.abs(result.pages[0].fontScale - 2.56) < 0.05, `fontScale ${result.pages[0].fontScale}`);
  const coverage = (4 * size * (1.2 * size)) / (1920 * 1080);
  assert.ok(Math.abs(coverage - 0.14) < 0.005, `coverage ${coverage}`);
});

test('fill sizing prefers two lines when they read bigger than one', () => {
  const result = fillFlow('the quick brown fox jumps over the lazy dog again');
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].lines.length, 2, `lines ${JSON.stringify(result.pages[0].lines)}`);
  assert.ok(result.pages[0].fontScale * 96 > 90, `size ${result.pages[0].fontScale * 96}`);
});

test('fill sizing allows a little bleed for an unbreakable word', () => {
  const result = fillFlow('Supercalifragilisticexpialidociousness', { fillMinSize: 0.1, fillBleed: 0.2 });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].lines.length, 1);
  assert.ok(Math.abs(result.pages[0].fontScale * 96 - 108) < 0.001, `size ${result.pages[0].fontScale * 96}`);
  assert.equal(result.pages[0].bleed, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'bleed'), JSON.stringify(result.warnings));
});

test('fill sizing reports overflow when the bleed budget is exhausted', () => {
  const result = fillFlow('Supercalifragilisticexpialidociousness', { fillMinSize: 0.1, fillBleed: 0 });
  assert.equal(result.pages.length, 1);
  assert.ok(Math.abs(result.pages[0].fontScale - (0.1 * 1080) / 96) < 1e-6, `fontScale ${result.pages[0].fontScale}`);
  assert.ok(result.warnings.some((warning) => warning.code === 'overflow'), JSON.stringify(result.warnings));
});

test('fill sizing keeps the Japanese line-start and line-end rules', () => {
  const result = fillFlow('今日は晴れです。公園へ行きます。', { aspect: '9:16', frameWidth: 1080, frameHeight: 1920 });
  assert.ok(result.pages.length >= 1);
  for (const page of result.pages) {
    for (const line of page.lines) {
      assert.ok(!JA_NO_START.includes(line[0]), `line starts with a prohibited character: ${line}`);
      assert.ok(!JA_NO_END.includes(line[line.length - 1]), `line ends with an opener: ${line}`);
    }
  }
});

test('fill sizing pages a long text and keeps every page above the minimum size', () => {
  const text = Array.from({ length: 100 }, (_, index) => `word${index % 10}`).join(' ');
  const result = fillFlow(text, {}, { end: 12 });
  assert.ok(result.pages.length >= 2, `pages ${result.pages.length}`);
  assert.ok(result.pages.every((page) => page.lines.length <= 2), 'a page has too many lines');
  for (const page of result.pages) {
    assert.ok(page.fontScale * 96 >= 0.045 * 1080 - 1e-6, `page size ${page.fontScale * 96}`);
  }
  const sum = result.pages.reduce((total, page) => total + (page.to - page.from), 0);
  assert.ok(Math.abs(sum - 12) < 1e-6, `page times sum ${sum}`);
});

test("fill sizing with consistency 'cue' uses one size across the pages", () => {
  const text = Array.from({ length: 100 }, (_, index) => `word${index % 10}`).join(' ');
  const result = fillFlow(text, { fillConsistency: 'cue' }, { end: 12 });
  assert.ok(result.pages.length >= 2, `pages ${result.pages.length}`);
  const sizes = new Set(result.pages.map((page) => page.fontScale));
  assert.equal(sizes.size, 1, `sizes ${[...sizes].join(', ')}`);
});

test('fill sizing measures vertical writing along the frame height', () => {
  const style = { direction: 'vertical', fillMaxWidth: 0.3 };
  const vertical = fillFlow('今日は晴れ', style);
  assert.ok(vertical.pages.length >= 1);
  const size = vertical.pages[0].fontScale * 96;
  for (const page of vertical.pages) {
    for (const line of page.lines) {
      assert.ok(measure(line, size) <= 0.3 * 1080 + 1e-6, `line wider than the vertical budget: ${line} (${measure(line, size)})`);
    }
  }
  // without the axis swap the line budget would be 0.3 * 1920 and the text
  // would come out the same size as the horizontal version
  const horizontal = fillFlow('今日は晴れ', { fillMaxWidth: 0.3 });
  assert.ok(vertical.pages[0].fontScale < horizontal.pages[0].fontScale, `vertical ${size} vs horizontal ${horizontal.pages[0].fontScale * 96}`);
});

test('fixed sizing keeps the previous behavior when fit is unset', () => {
  const result = flow('愛してる', { end: 6 });
  assert.equal(result.pages[0].kind, 'single');
  assert.deepEqual(result.pages[0].lines, ['愛してる']);
  assert.equal(result.pages[0].fontScale, 1);
  assert.equal(result.pages[0].fit, undefined);
  assert.equal(result.pages[0].bleed, undefined);
});

test('fitLinesScale sizes fixed lines without re-wrapping them', () => {
  const fit = textflow.fitLinesScale(['愛して', 'る'], {
    style: { size: 96, lineHeight: 1.2, fit: 'fill' },
    frame: { width: 1920, height: 1080 },
    measure,
  });
  assert.ok(fit.scale > 1, `scale ${fit.scale}`);
  assert.equal(fit.bleed, false);
});

test('fill sizing sizes every chunk in chunk mode', () => {
  const result = fillFlow('one two three four five six seven eight nine ten eleven twelve', {}, { settings: { chunk: 'phrase' } });
  assert.ok(result.pages.length >= 2, `chunks ${result.pages.length}`);
  assert.ok(result.pages.every((page) => page.fit === 'fill'), 'fill flag missing on a chunk');
  assert.ok(result.pages.every((page) => page.fontScale > 0), 'chunk without a size');
});

// ---------------------------------------------------------------------------
// automatic recap (smartness)
// ---------------------------------------------------------------------------

const AUTO_TEXT = 'alpha\\Pbeta\\Pgamma';

function autoProject(axes) {
  const project = {
    output: { width: 1920, height: 1080, aspect: '16:9' },
    meta: { lang: 'en' },
    textFlow: {},
    script: { cues: [] },
    beats: {},
    orphanBeats: {},
  };
  if (axes) project.styleMode = { axes };
  return project;
}

function autoOptions(settings) {
  return {
    style: { size: 96, lineHeight: 1.2, maxWidth: 0.9 },
    frame: { width: 1920, height: 1080 },
    measure,
    recapAuto: { smartness: 1 },
    settings: settings || {},
  };
}

test('automatic recap at smartness 1 covers every cue with 3+ beats', () => {
  const forced = textflow.restructure({ id: 'auto1', start: 0, end: 12, text: AUTO_TEXT }, autoOptions());
  assert.equal(forced.beats.filter((beat) => beat.kind === 'recap').length, 1);
  // with chunking the base count is the count after chunking
  const chunked = textflow.restructure(
    { id: 'auto2', start: 0, end: 8, text: 'one two three four five six seven eight nine ten' },
    autoOptions({ chunk: 'phrase', maxChunkDuration: 1 })
  );
  assert.ok(chunked.beats.filter((beat) => beat.kind === 'page').length >= 3);
  assert.equal(chunked.beats.filter((beat) => beat.kind === 'recap').length, 1);
});

test('automatic recap at smartness 0 or a missing axis draws nothing', () => {
  for (const project of [autoProject({ smartness: 0 }), autoProject(undefined)]) {
    project.script.cues = [{ id: 'zero1', start: 0, end: 12, text: AUTO_TEXT }];
    textflow.apply(project, { measure });
    assert.ok(!project.beats.zero1.some((beat) => beat.kind === 'recap'));
    assert.equal(textflow.cueOptions(project, project.script.cues[0], { measure }).recapAuto.smartness, 0);
  }
});

test('automatic recap needs at least 3 beats', () => {
  const two = textflow.restructure({ id: 'two', start: 0, end: 12, text: 'alpha\\Pbeta' }, autoOptions());
  assert.ok(!two.beats.some((beat) => beat.kind === 'recap'));
  const one = textflow.restructure({ id: 'one', start: 0, end: 12, text: 'alpha beta' }, autoOptions());
  assert.ok(!one.beats.some((beat) => beat.kind === 'recap'));
});

test('an explicit recap mode always beats the automatic draw', () => {
  const cue = { id: 'explicit', start: 0, end: 12, text: AUTO_TEXT };
  // 'off' wins over smartness 1
  const projectOff = autoProject({ smartness: 1 });
  projectOff.textFlow = { recap: { mode: 'off' } };
  const off = textflow.cueOptions(projectOff, cue, { measure });
  assert.equal(off.recapAuto, undefined);
  assert.ok(!textflow.restructure(cue, off).beats.some((beat) => beat.kind === 'recap'));
  // 'end' wins over smartness 0
  const projectEnd = autoProject({ smartness: 0 });
  projectEnd.textFlow = { recap: { mode: 'end' } };
  const end = textflow.cueOptions(projectEnd, cue, { measure });
  assert.equal(end.recapAuto, undefined);
  assert.equal(textflow.restructure(cue, end).beats.filter((beat) => beat.kind === 'recap').length, 1);
  // the cue's own mode wins too
  const cueOff = { ...cue, textFlow: { recap: { mode: 'off' } } };
  const cueOptions = textflow.cueOptions(autoProject({ smartness: 1 }), cueOff, { measure });
  assert.equal(cueOptions.recapAuto, undefined);
  assert.ok(!textflow.restructure(cueOff, cueOptions).beats.some((beat) => beat.kind === 'recap'));
});

test('the automatic draw scales with smartness and is stable across applies', () => {
  const project = autoProject({ smartness: 0.5 });
  for (let i = 0; i < 40; i += 1) {
    project.script.cues.push({ id: `half-${i}`, start: 0, end: 12, text: `${AUTO_TEXT} ${i}` });
  }
  const recapped = () => project.script.cues.filter((cue) => (project.beats[cue.id] || []).some((beat) => beat.kind === 'recap')).length;
  const beatIds = () => project.script.cues.map((cue) => (project.beats[cue.id] || []).map((beat) => beat.id).join(','));
  textflow.apply(project, { measure });
  const first = recapped();
  assert.ok(first > 10 && first < 30, `recap share ${first}/40`);
  const ids = beatIds();
  textflow.apply(project, { measure });
  assert.equal(recapped(), first);
  assert.deepEqual(beatIds(), ids);
});

test('autoRecapDraw is a stable 0..1 hash of the cue', () => {
  const value = textflow.autoRecapDraw({ id: 'draw1', text: 'alpha' });
  assert.ok(value >= 0 && value < 1, `draw ${value}`);
  assert.equal(textflow.autoRecapDraw({ id: 'draw1', text: 'alpha' }), value);
  assert.notEqual(textflow.autoRecapDraw({ id: 'draw2', text: 'alpha' }), value);
});

