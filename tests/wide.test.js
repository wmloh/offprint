const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console: { warn() {} } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('notes.js'), context);
vm.runInContext(read('bubble.js'), context);
vm.runInContext(read('wide.js'), context);
const { wide, notes, bubble } = context.DocForm;
const json = (value) => JSON.parse(JSON.stringify(value));

// A desktop page uses the same width in either navigation state and stops at the visible sidebar.
function page(view, sidebar, { shown = true, margin = false, max = 1240 } = {}) {
  const box = Math.min(1168, view - sidebar);
  const cellLeft = shown ? sidebar : 0;
  const left = Math.max(cellLeft, (view - box) / 2) + 24;
  return { left, right: left + box - 48, cellLeft, cellRight: view, edge: 24, margin, max };
}

test('at 1080p beside the sidebar a wide block grows evenly to the width cap', () => {
  assert.deepEqual(json(wide.span(page(1920, 260))), { left: 60, right: 60 });
  assert.deepEqual(json(wide.span(page(1920, 260, { shown: false }))), { left: 60, right: 60 });
  // A sidebar flush with the page box leaves space only on the right.
  assert.deepEqual(json(wide.span(page(1920, 480))), { left: 0, right: 120 });
});

test('margin content lets a wide block use only the space between the column and the sidebar', () => {
  const p = page(1920, 260, { margin: true });
  assert.deepEqual(json(wide.span(p)), { left: 116, right: 0 });
  // At 1080p the column leaves room for both margin notes and peek panels.
  assert.ok(notes.fits(1920, p.right, notes.width, notes.gap, notes.edge));
  assert.equal(bubble.layout(1920, p.right).mode, 'panel');
  assert.deepEqual(json(wide.span(page(1920, 480, { margin: true }))), { left: 0, right: 0 });
});

test('wide blocks can use the room left by a hidden sidebar or a nearly full window', () => {
  assert.deepEqual(json(wide.span(page(1440, 260))), { left: 0, right: 12 });
  assert.deepEqual(json(wide.span(page(1366, 260))), { left: 0, right: 0 });
  assert.deepEqual(json(wide.span(page(1366, 260, { shown: false }))), { left: 91, right: 91 });
  assert.deepEqual(json(wide.span(page(800, 0))), { left: 0, right: 0 });
});

test('wide layout uses the desktop grid gutters when the page end margin reads as zero', () => {
  const margins = new Map();
  const block = {
    classList: { toggle() {} },
    style: { setProperty: margins.set.bind(margins), removeProperty: margins.delete.bind(margins) }
  };
  let sidebarRight = 0;
  const sidebar = { getBoundingClientRect: () => ({ right: sidebarRight }) };
  const body = { querySelector: () => sidebar, getBoundingClientRect: () => ({ left: 0, right: 1560 }) };
  const pageLeft = () => Math.max(196, sidebarRight);
  const gridPage = {
    parentElement: body,
    getBoundingClientRect: () => ({ left: pageLeft(), right: pageLeft() + 1168 })
  };
  const document = { body, documentElement: { clientWidth: 1560 }, querySelector: () => gridPage, addEventListener() {} };
  const DocForm = { all: () => [block], register: (_name, init) => init() };
  vm.runInNewContext(read('wide.js'), {
    DocForm, document, addEventListener() {}, requestAnimationFrame() {},
    getComputedStyle(el) {
      if (el === sidebar) return { position: 'sticky' };
      if (el === gridPage) return { paddingLeft: '24px', paddingRight: '24px', marginLeft: `${pageLeft()}px`, marginRight: '0px' };
      return { getPropertyValue: () => '' };
    }
  });

  assert.deepEqual(Object.fromEntries(margins), { '--df-wide-left': '60px', '--df-wide-right': '60px' });
  sidebarRight = 260;
  DocForm.wide.layout();
  assert.deepEqual(Object.fromEntries(margins), { '--df-wide-left': '0px', '--df-wide-right': '120px' });
});

test('the cap is the whole block width, and a cap at or below the column turns growth off', () => {
  assert.deepEqual(json(wide.span(page(1920, 260, { max: 1200 }))), { left: 40, right: 40 });
  assert.deepEqual(json(wide.span(page(1920, 260, { max: 1120 }))), { left: 0, right: 0 });
  assert.deepEqual(json(wide.span(page(1920, 260, { max: 600 }))), { left: 0, right: 0 });
});
