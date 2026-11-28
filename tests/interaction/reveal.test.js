const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../../offprint/js', file), 'utf8');
const context = vm.createContext({ URL, console: { warn() {} } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('reveal.js'), context);
const reveal = context.OffPrint._reveal;

test('a block enters the centre band, stays through a narrower edge, and replays after leaving', () => {
  const v = (top, bottom, shown) => reveal.revealVisible(top, bottom, 800, 400, 400, shown);
  assert.equal(v(700, 760, false), false);
  assert.equal(v(660, 720, false), true);
  assert.equal(v(700, 760, true), true);
  assert.equal(v(780, 840, true), false);
  assert.equal(v(-40, 40, true), true);
  assert.equal(v(-40, 20, true), false);
  assert.equal(v(-40, 100, false), false);
  assert.equal(v(-300, 1100, false), true);
});

test('blocks at the page ends can still reach the reveal band', () => {
  assert.equal(reveal.revealVisible(20, 60, 800, 0, 400, false), true);
  assert.equal(reveal.revealVisible(740, 790, 800, 400, 0, false), true);
  assert.equal(reveal.revealVisible(740, 790, 800, 400, 400, false), false);
});

test('a callout enters and exits the middle half of the viewport on repeated passes', () => {
  const positions = [[600, 660], [599, 659], [140, 200], [141, 201], [601, 661]];
  assert.deepEqual(positions.map(([top, bottom]) => reveal.calloutVisible(top, bottom, 800, 400, 400)),
    [false, true, false, true, false]);
  assert.equal(reveal.calloutVisible(-300, 1100, 800, 400, 400), true);
});

test('callouts can stay visible at the start and end of the page', () => {
  assert.equal(reveal.calloutVisible(100, 160, 800, 0, 400), true);
  assert.equal(reveal.calloutVisible(620, 680, 800, 400, 0), true);
  assert.equal(reveal.calloutVisible(620, 680, 800, 0, 400), false);
});

test('split column shares follow the spec and default to equal panes', () => {
  assert.equal(reveal.splitColumns('2:1', 2), 'minmax(0, 2fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('3 2', 3), 'minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('x:0', 2), 'minmax(0, 1fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('', 1), 'minmax(0, 1fr)');
});
