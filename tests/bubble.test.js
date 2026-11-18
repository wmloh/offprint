const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console: { warn() {} } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('bubble.js'), context);
const bubble = context.DocForm.bubble;
const json = (value) => JSON.parse(JSON.stringify(value));

// Boxes are anchor rectangles in a 1000px-tall viewport.
const box = (top, height = 60, skip = false) => ({ top, bottom: top + height, skip });

test('a 1080p screen fits the side panel centred in the gutter; a narrow gutter expands in place', () => {
  // 1920px wide with the sidebar: the text column's content edge sits near 1450px.
  assert.deepEqual(json(bubble.layout(1920, 1450)), { mode: 'panel', width: 422, right: 24 });
  assert.deepEqual(json(bubble.layout(2400, 1450)), { mode: 'panel', width: 460, right: 245 });
  assert.equal(bubble.layout(1366, 1150).mode, 'inline');
  assert.equal(bubble.layout(800, 790).mode, 'inline');
});

test('a bubble opens near the centre, stays open in a wider band, and closes once scrolled past', () => {
  assert.deepEqual(json(bubble.pick([box(700)], 1000, [])), []);
  assert.deepEqual(json(bubble.pick([box(500)], 1000, [])), [0]);
  assert.deepEqual(json(bubble.pick([box(700)], 1000, [0])), [0]);
  assert.deepEqual(json(bubble.pick([box(800)], 1000, [0])), []);
  assert.deepEqual(json(bubble.pick([box(20)], 1000, [0])), []);
});

test('nearby bubbles open together in page order, capped at the nearest few, skipping dismissed ones', () => {
  assert.deepEqual(json(bubble.pick([box(380), box(460)], 1000, [])), [0, 1]);
  assert.deepEqual(json(bubble.pick([box(380), box(460, 60, true)], 1000, [])), [0]);
  const many = [box(150), box(250), box(350), box(450), box(540)];
  assert.deepEqual(json(bubble.pick(many, 1000, [])), [2, 3, 4]);
});

test('stacked panels share the height and centre as a group', () => {
  assert.equal(bubble.cap(1, 1000), 800);
  assert.equal(bubble.cap(2, 1000), 392);
  assert.deepEqual(json(bubble.stack([200, 300], 1000)), [242, 458]);
  assert.deepEqual(json(bubble.stack([], 1000)), []);
});
