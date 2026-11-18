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

// The page centres a 928px box (880px column plus 24px padding each side) in the space beside the sidebar.
function page(view, sidebar, margin = false, max = 1240) {
  const cellLeft = sidebar;
  const cellRight = view;
  const box = Math.min(928, cellRight - cellLeft);
  const left = cellLeft + (cellRight - cellLeft - box) / 2 + 24;
  return { left, right: left + box - 48, cellLeft, cellRight, edge: 24, margin, max };
}

test('at 1080p beside the sidebar a wide block grows evenly to the width cap', () => {
  assert.deepEqual(json(wide.span(page(1920, 260))), { left: 180, right: 180 });
  // A hidden sidebar leaves the same growth; a wider one still fits the cap.
  assert.deepEqual(json(wide.span(page(1920, 0))), { left: 180, right: 180 });
  assert.deepEqual(json(wide.span(page(1920, 480))), { left: 180, right: 180 });
});

test('margin content keeps the right side clear and growth moves toward the sidebar', () => {
  const p = page(1920, 260, true);
  assert.deepEqual(json(wide.span(p)), { left: 360, right: 0 });
  // At 1080p the column leaves room for both margin notes and peek panels.
  assert.ok(notes.fits(1920, p.right, notes.width, notes.gap, notes.edge));
  assert.equal(bubble.layout(1920, p.right).mode, 'panel');
  // A wide sidebar limits the left side to its free space, a page gutter short of the sidebar.
  const wideNav = page(1920, 480, true);
  assert.deepEqual(json(wide.span(wideNav)), { left: wideNav.left - 480 - 24, right: 0 });
});

test('limited room is shared or moved to the sidebar side, and no room keeps the reading width', () => {
  // 1366px with the sidebar: 89px free on each side of the column.
  assert.deepEqual(json(wide.span(page(1366, 260))), { left: 89, right: 89 });
  assert.deepEqual(json(wide.span(page(1366, 260, true))), { left: 89, right: 0 });
  // Narrow windows and drawers leave only the page padding.
  assert.deepEqual(json(wide.span(page(1100, 260))), { left: 0, right: 0 });
  assert.deepEqual(json(wide.span(page(800, 0))), { left: 0, right: 0 });
});

test('the cap is the whole block width, and a cap at or below the column turns growth off', () => {
  assert.deepEqual(json(wide.span(page(1920, 260, false, 1000))), { left: 60, right: 60 });
  assert.deepEqual(json(wide.span(page(1920, 260, false, 880))), { left: 0, right: 0 });
  assert.deepEqual(json(wide.span(page(1920, 260, false, 600))), { left: 0, right: 0 });
});
