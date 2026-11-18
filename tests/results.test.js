const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console, Intl });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('results.js'), context);
const results = context.DocForm.results;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('result cells parse numbers with spreads, units, and marks', () => {
  const cells = ['92.1 ± 0.3', '1,204 ms', '−3.5%', '$12', '0.81*', '4.2 GB', '7 +/- 1', 'ResNet-50', 'v2', '', '—'];
  assert.deepEqual(cells.map(results.parseCell), [92.1, 1204, -3.5, 12, 0.81, 4.2, 7, null, null, null, null]);
  assert.equal(results.numericColumn(['1.5', '—', '', '2']), true);
  assert.equal(results.numericColumn(['1.5', 'Adam']), false);
  assert.equal(results.numericColumn(['—', '']), false);
});

test('sorting keeps empties last and ties in written order', () => {
  assert.deepEqual(plain(results.sortOrder([3, null, 1, 3, 2], 'desc', true)), [0, 3, 4, 2, 1]);
  assert.deepEqual(plain(results.sortOrder([3, null, 1, 3, 2], 'asc', true)), [2, 4, 0, 3, 1]);
  assert.deepEqual(plain(results.sortOrder(['b10', 'B2', '', 'a'], 'asc', false)), [3, 1, 0, 2]);
});

test('best values and heat follow the column direction', () => {
  assert.deepEqual(plain(results.best([0.3, null, 0.1, 0.1], 'min')), [2, 3]);
  assert.deepEqual(plain(results.best([0.3, null, 0.1, 0.3], 'max')), [0, 3]);
  assert.deepEqual(plain(results.heat([10, 20, null, 30], 'max')), [0, 0.5, null, 1]);
  assert.deepEqual(plain(results.heat([10, 20, 30], 'min')), [1, 0.5, 0]);
  assert.deepEqual(plain(results.heat([5, 5], 'max')), [0, 0]);
});
