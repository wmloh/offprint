const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');
const context = vm.createContext({ console });
context.window = context;
['core.js', 'detail.js', 'diagram.js', 'pipeline.js'].forEach((file) => vm.runInContext(read(file), context));
const P = context.OffPrint._pipeline;
const D = context.OffPrint._diagram;
const edges = (pairs) => pairs.map(([from, to]) => ({ from, to }));
const none = (n) => Array(n).fill(null);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('ranks follow the longest path, break cycles at back edges, and honour pinned columns', () => {
  const chain = P.ranks(4, edges([[0, 1], [1, 2], [2, 0], [0, 3]]), none(4));
  assert.deepEqual(plain(chain.rank), [0, 1, 2, 1]);
  assert.deepEqual([...chain.back], [2]);

  // A late source moves next to its successor instead of waiting in the first column.
  const merge = P.ranks(4, edges([[0, 1], [1, 2], [3, 2]]), none(4));
  assert.deepEqual(plain(merge.rank), [0, 1, 2, 1]);

  const pinned = P.ranks(3, edges([[0, 1], [1, 2]]), [null, 3, null]);
  assert.deepEqual(plain(pinned.rank), [2, 3, 4]);
});

test('rows centre forks and merges on half rows and keep pinned rows clear', () => {
  const fork = edges([[0, 1], [0, 2]]);
  assert.deepEqual(plain(P.rows(3, fork, [0, 1, 1], none(3))), [1, 0, 2]);

  const merge = edges([[0, 2], [1, 2]]);
  assert.deepEqual(plain(P.rows(3, merge, [0, 0, 1], none(3))), [0, 2, 1]);

  // A chain into a fork stays straight while both ends of the fork split around it.
  const chain = edges([[0, 1], [1, 2], [1, 3]]);
  assert.deepEqual(plain(P.rows(4, chain, [0, 1, 2, 2], none(4))), [1, 1, 0, 2]);

  const pinned = P.rows(3, edges([[0, 1], [0, 2]]), [0, 1, 1], [null, 0, null]);
  assert.equal(pinned[1], 0);
  assert.ok(Math.abs(pinned[2] - pinned[1]) >= 2);
});

test('centres give neighbours their gap, share the space across half rows, and start at the edge', () => {
  const c = D.centers([0, 2, 1], [0, 0, 1], [40, 60, 30], 20);
  assert.equal(c[2] - c[0], 40 / 2 + 20 + 60 / 2);
  assert.equal(c[1], (c[0] + c[2]) / 2);
  assert.equal(c[0], 20);

  const b = D.bands([0, 1, 1, 3], [100, 80, 120, 10], 50);
  assert.deepEqual(plain(b.center), [50, 210, 320, 375]);
  assert.equal(b.total, 380);
  assert.equal(D.interpolate([0, 10, 30], 1.5), 20);
  assert.equal(D.interpolate([0, 10, 30], 3), 50);
});

test('curves run straight between aligned ports and gaps are found only where lines cross', () => {
  const straight = D.curve([[0, 0], [100, 0]], [1, 0], [1, 0]);
  assert.ok(D.sample(straight, 10).every(([, y]) => y === 0));
  assert.match(D.pathData(straight), /^M0 0C/);

  const a = D.sample(D.curve([[0, 0], [100, 100]], [1, 0], [1, 0]), 20);
  const b = D.sample(D.curve([[0, 100], [100, 0]], [1, 0], [1, 0]), 20);
  const c = D.sample(D.curve([[0, 200], [100, 200]], [1, 0], [1, 0]), 20);
  const hits = D.crossings(a, b, 5);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0][0] - 50) < 1 && Math.abs(hits[0][1] - 50) < 1);
  assert.equal(D.crossings(a, c, 5).length, 0);

  const via = D.curve([[0, 0], [50, 40], [100, 0]], [1, 0], [1, 0]);
  assert.equal(via.length, 2);
  assert.deepEqual(plain(via[0][3]), [50, 40]);
});

test('via points and empty fields are parsed strictly', () => {
  assert.deepEqual(plain(P.parseVia('2.5 1; 3 1.5')), [[1.5, 0], [2, 1]]);
  assert.deepEqual(plain(P.parseVia('')), []);
  assert.equal(P.parseVia('2'), null);
  assert.equal(P.parseVia('a b'), null);

  const field = (text, media = false) => ({ textContent: text, querySelector: () => media || null });
  assert.equal(P.isEmpty(field('  \n ')), true);
  assert.equal(P.isEmpty(field('Clean')), false);
  assert.equal(P.isEmpty(field('', {})), false);
});
