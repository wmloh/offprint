const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const name of ['core', 'detail', 'diagram', 'timeline']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../offprint/js', name + '.js'), 'utf8'), context);
}
const { scale, ticks, layout } = context.OffPrint._timeline;

test('timeline scales numeric and UTC date domains, including a single point', () => {
  const numeric = scale(-10, 30, 100, 500);
  assert.deepEqual([-10, 0, 30].map(numeric), [100, 200, 500]);
  assert.equal(scale(9, 9, 100, 500)(9), 300);
  assert.equal(scale(-Number.MAX_VALUE, Number.MAX_VALUE, 100, 500)(0), 300);
  assert.deepEqual(Array.from(ticks(-10, 30, false), (tick) => tick.value), [-10, 0, 10, 20, 30]);
  assert.deepEqual(Array.from(ticks(9, 9, false), (tick) => tick.label), ['9']);

  const leap = ['2028-02-28', '2028-02-29', '2028-03-01'];
  const [start, middle, end] = leap.map(Date.parse);
  assert.equal(scale(start, end, 100, 500)(middle), 300);
  assert.deepEqual(Array.from(ticks(start, end, true), (tick) => tick.label), leap);
});

test('timeline lanes pack overlapping spans and point labels and reuse free rows', () => {
  const scene = layout([
    { key: 'during', lane: 'Build', start: 2, end: 2 },
    { key: 'span', lane: 'Build', start: 0, end: 5 },
    { key: 'near', lane: 'Build', start: 3, end: 3 },
    { key: 'later', lane: 'Build', start: 8, end: 8 },
    { key: 'review', lane: 'Review', start: 3, end: 4 }
  ], scale(0, 10, 100, 600));
  assert.deepEqual(Array.from(scene.lanes, (lane) => lane.label), ['Build', 'Review']);
  assert.deepEqual(Array.from(scene.events, (entry) => [entry.event.key, entry.row, entry.span]), [
    ['span', 0, 250], ['during', 1, 0], ['near', 2, 0], ['later', 0, 0], ['review', 0, 50]
  ]);
  assert.equal(scene.lanes[0].bottom, scene.lanes[1].top);
});
