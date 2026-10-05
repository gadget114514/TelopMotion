'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pageLayout = require(path.join(ROOT, 'renderer', 'js', 'lyrics', 'page-layout.js'));

test('compose returns bounded page and regions for generic presets', () => {
  const genericTypes = ['none', 'flushLeft', 'center', 'flushRight', 'justify', 'vertical', 'grid'];
  const frame = { w: 1920, h: 1080 };
  const text = 'Hello world\nThis is a test line\nAntigravity page layout';

  for (const type of genericTypes) {
    const res = pageLayout.compose(type, {}, { frame, text });
    assert.ok(res.page, `${type} must have page`);
    assert.equal(res.page.w, 1920);
    assert.equal(res.page.h, 1080);
    assert.ok(Array.isArray(res.regions), `${type} must have regions array`);
    assert.ok(res.regions.length >= 1, `${type} must have at least one region`);
    for (const r of res.regions) {
      assert.ok(Number.isFinite(r.rect.x), `${type} region x is finite`);
      assert.ok(Number.isFinite(r.rect.y), `${type} region y is finite`);
      assert.ok(Number.isFinite(r.rect.w), `${type} region w is finite`);
      assert.ok(Number.isFinite(r.rect.h), `${type} region h is finite`);
      assert.ok(r.rect.x >= 0, `${type} region x >= 0`);
      assert.ok(r.rect.y >= 0, `${type} region y >= 0`);
      assert.ok(r.rect.x + r.rect.w <= res.page.w + 0.001, `${type} region fits horizontally`);
      assert.ok(r.rect.y + r.rect.h <= res.page.h + 0.001, `${type} region fits vertically`);
    }
  }
});

test('handles edge case inputs: empty, 1 char, long, CJK, emoji', () => {
  const edgeCases = [
    { text: '' },
    { text: 'A' },
    { text: 'あいうえお\nかきくけこ\nさしすせそ' },
    { text: '🎉 🚀 🌟 ✨ \n 💖 🔥 🌈' },
    { text: 'A'.repeat(1000) },
  ];
  const types = ['none', 'flushLeft', 'center', 'flushRight', 'justify', 'vertical', 'grid'];

  for (const tc of edgeCases) {
    for (const type of types) {
      assert.doesNotThrow(() => {
        const res = pageLayout.compose(type, {}, { frame: { w: 1280, h: 720 }, text: tc.text });
        assert.ok(res.regions.length >= 1);
        for (const r of res.regions) {
          assert.ok(Number.isFinite(r.rect.w));
          assert.ok(Number.isFinite(r.rect.h));
        }
      }, `Failed on type=${type} with text snippet "${tc.text.slice(0, 15)}"`);
    }
  }
});

test('splitMenuLine parses all 5 delimiter types correctly', () => {
  // 1. Tab
  const tab = pageLayout.splitMenuLine('Caramel Macchiato\t¥650');
  assert.equal(tab.name, 'Caramel Macchiato');
  assert.equal(tab.price, '¥650');

  // 2. Pipe delimiter
  const pipe = pageLayout.splitMenuLine('Espresso Con Panna | $4.50');
  assert.equal(pipe.name, 'Espresso Con Panna');
  assert.equal(pipe.price, '$4.50');

  // 3. Slash delimiter
  const slash = pageLayout.splitMenuLine('Cafe Latte / €5.00');
  assert.equal(slash.name, 'Cafe Latte');
  assert.equal(slash.price, '€5.00');

  // 4. Two or more spaces
  const multiSpace = pageLayout.splitMenuLine('Iced Americano    500円');
  assert.equal(multiSpace.name, 'Iced Americano');
  assert.equal(multiSpace.price, '500円');

  // 5. Ending currency sign and number without spaces
  const curEnd = pageLayout.splitMenuLine('Matcha Latte・¥580');
  assert.equal(curEnd.name, 'Matcha Latte');
  assert.equal(curEnd.price, '¥580');

  // Fallback: no price
  const noPrice = pageLayout.splitMenuLine('Today Special Roast');
  assert.equal(noPrice.name, 'Today Special Roast');
  assert.equal(noPrice.price, '');
});

test('staffPitch is deterministic for characters and index', () => {
  const p1 = pageLayout.staffPitch('A', 0);
  const p2 = pageLayout.staffPitch('A', 0);
  assert.equal(p1, p2);
  const p3 = pageLayout.staffPitch('B', 1);
  assert.ok(Number.isFinite(p3));
});

test('createRng generates deterministic sequence', () => {
  const rng1 = pageLayout.createRng(42);
  const rng2 = pageLayout.createRng(42);
  const s1 = [rng1(), rng1(), rng1()];
  const s2 = [rng2(), rng2(), rng2()];
  assert.deepEqual(s1, s2);
});

test('paper presets compose bounded regions and decor', () => {
  const paperTypes = ['magazine', 'fashion', 'newspaper', 'twoColumn', 'threeColumn', 'manuscript'];
  const frame = { w: 1920, h: 1080 };
  const text = 'Headline Title Here\nSubheading or deck line\nFirst body paragraph goes here.\nSecond paragraph continues with details.\nFinal conclusion line.';

  for (const type of paperTypes) {
    const res = pageLayout.compose(type, {}, { frame, text });
    assert.ok(res.page, `${type} must have page`);
    assert.equal(res.page.w, 1920);
    assert.equal(res.page.h, 1080);
    assert.ok(Array.isArray(res.regions), `${type} must have regions`);
    assert.ok(res.regions.length >= 1, `${type} must have regions`);

    for (const r of res.regions) {
      assert.ok(Number.isFinite(r.rect.x), `${type} region x finite`);
      assert.ok(Number.isFinite(r.rect.y), `${type} region y finite`);
      assert.ok(Number.isFinite(r.rect.w), `${type} region w finite`);
      assert.ok(Number.isFinite(r.rect.h), `${type} region h finite`);
      assert.ok(r.rect.x + r.rect.w <= res.page.w + 0.001, `${type} region fits horizontally`);
      assert.ok(r.rect.y + r.rect.h <= res.page.h + 0.001, `${type} region fits vertically`);
    }

    assert.ok(Array.isArray(res.decor), `${type} has decor array`);
    for (const d of res.decor) {
      assert.ok(d.kind, `${type} decor has kind`);
      assert.ok(d.role, `${type} decor has role`);
    }
  }
});

test('newspaper creates columns and manuscript creates grid cells', () => {
  const text = 'Head\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
  const news = pageLayout.compose('newspaper', { columns: 3 }, { frame: { w: 1280, h: 720 }, text });
  // Headline + 3 columns = 4 regions
  assert.equal(news.regions.length, 4);
  assert.equal(news.regions[0].role, 'headline');

  const manu = pageLayout.compose('manuscript', { cols: 20, rows: 20, vertical: true }, { frame: { w: 1000, h: 1000 }, text: '夏目漱石吾輩は猫である' });
  assert.equal(manu.regions.length, 1);
  assert.equal(manu.regions[0].flow, 'cells');
  assert.equal(manu.regions[0].cells.cols, 20);
  assert.equal(manu.regions[0].cells.rows, 20);
  assert.equal(manu.regions[0].cells.vertical, true);
  // Manuscript has decor cells
  assert.ok(manu.decor.some((d) => d.kind === 'cells' && d.fishTail));
});

test('UI and shop presets compose bounded regions and decor', () => {
  const uiShopTypes = ['xCard', 'chatBubble', 'cafeSign', 'cafeMenu', 'boutique'];
  const frame = { w: 1920, h: 1080 };
  const text = 'Cafe Del Mar\nCaramel Macchiato | $5.50\nIced Americano | $4.00\nGreen Tea Latte | $4.80\nToday Special Roast';

  for (const type of uiShopTypes) {
    const res = pageLayout.compose(type, {}, { frame, text });
    assert.ok(res.page, `${type} must have page`);
    assert.equal(res.page.w, 1920);
    assert.equal(res.page.h, 1080);
    assert.ok(Array.isArray(res.regions), `${type} must have regions`);
    assert.ok(res.regions.length >= 1, `${type} must have regions`);

    for (const r of res.regions) {
      assert.ok(Number.isFinite(r.rect.x), `${type} region x finite`);
      assert.ok(Number.isFinite(r.rect.y), `${type} region y finite`);
      assert.ok(Number.isFinite(r.rect.w), `${type} region w finite`);
      assert.ok(Number.isFinite(r.rect.h), `${type} region h finite`);
      assert.ok(r.rect.x + r.rect.w <= res.page.w + 0.001, `${type} region fits horizontally`);
      assert.ok(r.rect.y + r.rect.h <= res.page.h + 0.001, `${type} region fits vertically`);
    }

    assert.ok(Array.isArray(res.decor), `${type} has decor array`);
  }
});

test('cafeMenu creates name and price pairs and chatBubble alternates sides', () => {
  const menuText = 'DRINKS\nEspresso\t$3.00\nCappuccino\t$4.50';
  const menuRes = pageLayout.compose('cafeMenu', {}, { frame: { w: 1280, h: 720 }, text: menuText });
  assert.equal(menuRes.regions[0].role, 'headline');
  assert.equal(menuRes.regions[1].role, 'name');
  assert.equal(menuRes.regions[2].role, 'price');
  assert.equal(menuRes.regions[1].text, 'Espresso');
  assert.equal(menuRes.regions[2].text, '$3.00');

  const chatText = 'Hey what is up?\nNot much, working on TelopMotion!\nNice!';
  const chatRes = pageLayout.compose('chatBubble', {}, { frame: { w: 1000, h: 800 }, text: chatText });
  assert.equal(chatRes.regions.length, 3);
  // Bubble 0 is left side, Bubble 1 is right side
  assert.ok(chatRes.regions[0].rect.x < chatRes.regions[1].rect.x);
});

test('score preset generates deterministic path and decor', () => {
  const scoreText = 'DO RE MI FA SO LA TI DO';
  const res1 = pageLayout.compose('score', {}, { frame: { w: 1280, h: 720 }, text: scoreText });
  const res2 = pageLayout.compose('score', {}, { frame: { w: 1280, h: 720 }, text: scoreText });

  assert.equal(res1.regions.length, 1);
  assert.equal(res1.regions[0].flow, 'path');
  assert.equal(typeof res1.regions[0].path, 'function');

  // Both runs yield identical coordinates for letters
  const pt1 = res1.regions[0].path(0, 8, 'D');
  const pt2 = res2.regions[0].path(0, 8, 'D');
  assert.deepEqual(pt1, pt2);
  assert.ok(res1.decor.length > 0);
  assert.ok(res1.decor.some((d) => d.kind === 'line' && d.role === 'rule'));
});

test('poster preset responds deterministically to seed and randomizes placement', () => {
  const posterText = 'CREATIVE\nGraphic Design\nTypography Showcase\nTokyo Japan';
  const resA1 = pageLayout.compose('poster', { seed: 100 }, { frame: { w: 1920, h: 1080 }, text: posterText });
  const resA2 = pageLayout.compose('poster', { seed: 100 }, { frame: { w: 1920, h: 1080 }, text: posterText });
  const resB = pageLayout.compose('poster', { seed: 999 }, { frame: { w: 1920, h: 1080 }, text: posterText });

  // Same seed produces same hero position and scale
  assert.equal(resA1.regions[0].rect.x, resA2.regions[0].rect.x);
  assert.equal(resA1.regions[0].rect.y, resA2.regions[0].rect.y);
  assert.equal(resA1.regions[0].style.sizeScale, resA2.regions[0].style.sizeScale);

  // Different seed produces different placement
  const isDifferent = (resA1.regions[0].rect.x !== resB.regions[0].rect.x) || (resA1.regions[0].style.sizeScale !== resB.regions[0].style.sizeScale);
  assert.ok(isDifferent, 'Different seeds should vary hero placement/size');
});

test('exhaustive test: all PRESETS compose without error on multiple aspect ratios', () => {
  const allTypes = Object.keys(pageLayout.PRESETS);
  const frames = [
    { w: 1920, h: 1080 }, // 16:9
    { w: 1080, h: 1920 }, // 9:16
    { w: 1000, h: 1000 }, // 1:1
  ];
  const sampleTexts = [
    'Single line',
    'Two lines\nSecond line here',
    'Headline\nSubhead\nFirst paragraph text\nSecond paragraph text\nFinal footnote',
    '日本語の歌詞\n二行目のテキスト\n三行目の長い文章がここに入ります\n四行目',
  ];

  for (const type of allTypes) {
    for (const frame of frames) {
      for (const text of sampleTexts) {
        assert.doesNotThrow(() => {
          const res = pageLayout.compose(type, {}, { frame, text });
          assert.ok(res.page);
          assert.ok(Array.isArray(res.regions));
          assert.ok(res.regions.length >= 1);
          for (const r of res.regions) {
            assert.ok(Number.isFinite(r.rect.x));
            assert.ok(Number.isFinite(r.rect.y));
            assert.ok(Number.isFinite(r.rect.w));
            assert.ok(Number.isFinite(r.rect.h));
            assert.ok(r.rect.x >= 0);
            assert.ok(r.rect.y >= 0);
            assert.ok(r.rect.x + r.rect.w <= res.page.w + 0.001);
            assert.ok(r.rect.y + r.rect.h <= res.page.h + 0.001);
          }
        }, `Failed on type=${type} frame=${frame.w}x${frame.h}`);
      }
    }
  }
});




test('poster preset draws no placeholder caption for a one-line page', () => {
  for (const seed of [1, 2, 3, 100, 999]) {
    const res = pageLayout.compose('poster', { seed }, { frame: { w: 1920, h: 1080 }, text: 'ONLY ONE LINE' });
    assert.ok(res.regions.length >= 1);
    for (const r of res.regions) assert.ok(!/^CAPTION/i.test(r.text), `seed ${seed}: no placeholder text`);
    assert.equal(res.regions.filter((r) => r.role === 'caption').length, 0);
  }
});
