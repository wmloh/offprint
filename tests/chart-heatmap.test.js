const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
context.window = context;
['core.js', 'chart.js', 'chart-heatmap.js'].forEach((file) => vm.runInContext(read(file), context));
const chart = context.DocForm.chart;
const heatmap = chart.heatmap;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('colour scales map sequential, diverging, and log values to a hue and strength', () => {
  const seq = heatmap.scale('sequential', [2, 4, 12]);
  assert.deepEqual([seq.lo, seq.hi, seq.pos(7), seq.pos(40)], [2, 12, 0.5, 1]);
  assert.deepEqual(plain([seq.paint(2), seq.paint(12)]), [{ hue: 'high', alpha: 0.1 }, { hue: 'high', alpha: 0.95 }]);
  assert.equal(seq.invert(0.5), 7);

  const div = heatmap.scale({ type: 'diverging', mid: 1 }, [-2, 1, 2]);
  assert.deepEqual([div.lo, div.hi], [-2, 4], 'both arms reach the farthest value from the midpoint');
  assert.deepEqual(plain([div.paint(1), div.paint(-2), div.paint(2.5)]),
    [{ hue: 'high', alpha: 0 }, { hue: 'low', alpha: 0.9 }, { hue: 'high', alpha: 0.45 }]);
  const fixed = heatmap.scale({ type: 'diverging', mid: 0, min: -1, max: 4 }, [0]);
  assert.equal(fixed.paint(-1).alpha, fixed.paint(4).alpha, 'author bounds scale each arm to its own end');

  const log = heatmap.scale({ type: 'log', color: 'green' }, [1, 10, 1000]);
  assert.equal(log.pos(10), 1 / 3);
  assert.ok(Math.abs(log.invert(2 / 3) - 100) < 1e-9);
  assert.deepEqual(plain(log.colors), ['green']);

  assert.match(chart.validate({ type: 'heatmap', scale: 'log', z: [[0, 1]] })[0], /positive values/);
  assert.match(chart.validate({ type: 'heatmap', scale: { color: 'teal' }, z: [[1]] })[0], /palette names/);
  assert.match(chart.validate({ type: 'heatmap', scale: { type: 'diverging', mid: 9, min: 0, max: 4 }, z: [[1]] })[0], /mid must lie/);
  assert.match(chart.validate({ type: 'heatmap', scale: { mid: 1 }, z: [[1]] })[0], /Only a diverging/);
});

test('records pivot into a grid in first-appearance or listed order with missing cells', () => {
  const grid = heatmap.pivot([
    { x: 'Tue', y: 'AM', z: 2 }, { x: 'Mon', y: 'PM', z: '1,200', key: 'pm-mon' }, { x: 'Mon', y: 'AM', z: null }
  ], {}, chart.toNumber);
  assert.deepEqual(plain(grid), { columns: ['Tue', 'Mon'], rows: ['AM', 'PM'], z: [[2, null], [null, 1200]],
    keys: [[null, null], [null, 'pm-mon']] });
  const listed = heatmap.pivot([{ x: 3, y: 1, z: 5 }], { columns: [1, 3], rows: [2, 1] });
  assert.deepEqual(plain(listed.z), [[null, null], [null, 5]]);
  assert.throws(() => heatmap.pivot([{ x: 'a', y: 'b', z: 1 }], { columns: ['c'] }), /not in the listed columns/);
  assert.throws(() => heatmap.pivot([{ x: 'a', y: 'b', z: 'n/a' }], {}, chart.toNumber), /finite numbers/);

  const model = chart.normalize({ type: 'heatmap', data: [{ x: 'a', y: 'r', z: 1 }, { x: 'b', y: 'r', z: 3 }] });
  assert.deepEqual(plain(model.series[0].points.map((p) => [p.key, p.row, p.col, p.y])),
    [['cell:r:a', 0, 0, 1], ['cell:r:b', 0, 1, 3]]);
  assert.match(chart.validate({ type: 'heatmap', data: [{ x: 'a', y: 'r', z: 1 }, { x: 'a', y: 'r', z: 2 }] })[0], /repeat/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1]], data: [] })[0], /not both/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2], [3]] })[0], /same length/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2]], columns: ['a', 'a'] })[0], /unique/);
});

test('heatmaps reject grids above the cell cap', () => {
  const row = (n) => Array(n).fill(1);
  assert.equal(chart.validate({ type: 'heatmap', z: Array.from({ length: 100 }, () => row(50)) }).length, 0);
  assert.match(chart.validate({ type: 'heatmap', z: Array.from({ length: 101 }, () => row(50)) })[0], /at most 5000 cells/);
  const records = Array.from({ length: 5001 }, (_, i) => ({ x: i, y: 0, z: 1 }));
  assert.match(chart.validate({ type: 'heatmap', data: records })[0], /5001/);
});

test('marching squares traces known grids and resolves saddles by the cell mean', () => {
  assert.deepEqual(plain(heatmap.contourSegments([[0, 0], [0, 2]], 1)), [[[0.5, 1], [1, 0.5]]]);
  assert.deepEqual(plain(heatmap.contourSegments([[0, 2], [0, 2]], 1)), [[[0.5, 0], [0.5, 1]]]);
  assert.deepEqual(plain(heatmap.contourSegments([[1, 1], [1, 1]], 1)), [], 'a flat grid at the level is all inside');
  assert.deepEqual(plain(heatmap.contourSegments([[2, 0], [0, 2]], 1.5)), [[[0, 0.25], [0.25, 0]], [[0.75, 1], [1, 0.75]]],
    'a low mean keeps the two high corners apart');
  assert.equal(heatmap.contourSegments([[2, 0], [0, 2]], 0.5).length, 2);
  const ring = [[0, 0, 0], [0, 4, 0], [0, 0, 0]];
  const segments = heatmap.contourSegments(ring, 2);
  assert.equal(segments.length, 4, 'a peak gives a closed loop of four segments');
  segments.flat().forEach(([x, y]) => assert.equal(Math.abs(x - 1) + Math.abs(y - 1), 0.5));
});

test('contour levels come from ticks, counts, or lists, and skip unsuitable grids with a warning', () => {
  const scale = heatmap.scale('sequential', [0, 10]);
  assert.deepEqual(plain(heatmap.contourLevels(true, scale, [0, 10])), [2, 4, 6, 8]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: 3 }, scale, [0, 10])), [2.5, 5, 7.5]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: [9, 0, 4, 4] }, scale, [0, 10])), [4, 9], 'levels on the edge draw nothing');
  const log = heatmap.scale('log', [1, 1000]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: 2 }, log, [1, 1000]).map((v) => +v.toPrecision(6))), [10, 100]);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2], [3, 4]], contours: { levels: 0 } })[0], /integer from 1/);

  const numeric = chart.normalize({ type: 'heatmap', columns: [0, 1], rows: [5, 10], z: [[0, 4], [4, 8]],
    contours: { levels: [2], labels: true } });
  assert.deepEqual(plain(numeric.heatmap.contours), { levels: [2], labels: true });
  warnings.length = 0;
  const named = chart.normalize({ type: 'heatmap', columns: ['a', 'b'], rows: [1, 2], z: [[0, 4], [4, 8]], contours: true });
  const sparse = chart.normalize({ type: 'heatmap', columns: [1, 2], rows: [1, 2], z: [[0, null], [4, 8]], contours: true });
  assert.equal(named.heatmap.contours, null);
  assert.equal(sparse.heatmap.contours, null);
  assert.equal(named.errors.length + sparse.errors.length, 0, 'unsuitable grids still draw without contours');
  assert.deepEqual(warnings.map((w) => w.replace(/^.*because /, '')),
    ['its row and column labels are not ordered numbers.', 'it has missing cells.']);
});
