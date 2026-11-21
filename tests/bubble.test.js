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
const bubble = context.DocForm._peekBubbles;
const json = (value) => JSON.parse(JSON.stringify(value));

// Boxes are anchor rectangles in a 1000px-tall viewport.
const box = (top, height = 60, skip = false) => ({ top, bottom: top + height, skip });

test('a bubble opens near the centre, stays open in a wider band, and closes once scrolled past', () => {
  assert.deepEqual(json(bubble.pick([box(700)], 1000, [])), []);
  assert.deepEqual(json(bubble.pick([box(500)], 1000, [])), [0]);
  assert.deepEqual(json(bubble.pick([box(700)], 1000, [0])), [0]);
  assert.deepEqual(json(bubble.pick([box(800)], 1000, [0])), []);
  assert.deepEqual(json(bubble.pick([box(20)], 1000, [0])), []);
});

test('an enlarged bubble stays open until its bottom is scrolled past', () => {
  assert.deepEqual(json(bubble.pick([box(-300, 400)], 1000, [0])), [0]);
  assert.deepEqual(json(bubble.pick([box(-300, 380)], 1000, [0])), []);
});

test('nearby bubbles open together in page order, capped at the nearest few, skipping dismissed ones', () => {
  assert.deepEqual(json(bubble.pick([box(380), box(460)], 1000, [])), [0, 1]);
  assert.deepEqual(json(bubble.pick([box(380), box(460, 60, true)], 1000, [])), [0]);
  const many = [box(150), box(250), box(350), box(450), box(540)];
  assert.deepEqual(json(bubble.pick(many, 1000, [])), [2, 3, 4]);
});
