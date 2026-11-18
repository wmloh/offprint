const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('chart.js'), context);
const chart = context.DocForm.chart;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('ticks are round, cover the data, and keep fixed ends', () => {
  assert.deepEqual(plain(chart.ticks(3, 97, 5)), { min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] });
  assert.deepEqual(plain(chart.ticks(0.12, 0.31, 4).ticks), [0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  assert.deepEqual(plain(chart.ticks(-7, 12, 4).ticks), [-10, -5, 0, 5, 10, 15]);
  assert.deepEqual(plain(chart.ticks(5, 5, 2).ticks), [4.5, 5, 5.5]);
  const fixed = chart.ticks(1, 9, 4, true, true);
  assert.equal(fixed.min, 1);
  assert.equal(fixed.max, 9);
  assert.deepEqual(plain(fixed.ticks), [2, 4, 6, 8]);
});

test('scales, nearest lookup, and tick labels', () => {
  const y = chart.linear(0, 100, 200, 0);
  assert.equal(y(25), 150);
  assert.equal(y.invert(50), 75);
  assert.equal(chart.nearest([0, 10, 20, 40], 14), 1);
  assert.equal(chart.nearest([0, 10, 20, 40], 31), 3);
  assert.equal(chart.nearest([], 3), -1);
  const big = chart.tickFormat(chart.ticks(0, 48000, 4));
  assert.deepEqual([0, 10000, 20000].map(big), ['0', '10K', '20K']);
  const small = chart.tickFormat(chart.ticks(0, 1, 4));
  assert.deepEqual([0, 0.25, 1].map(small), ['0', '0.25', '1.00']);
  assert.equal(chart.format(1234.56789, { digits: null, unit: ' ms' }), '1,234.57 ms');
});

test('specs normalize into categorical or numeric series', () => {
  const bars = plain(chart.normalize({ type: 'bar', series: [{ name: 'A', data: [['b', 2], ['a', '1,200']] }, { data: [['c', 'x']] }] }));
  assert.deepEqual(bars.categories, ['b', 'a']);
  assert.deepEqual(bars.series[0].points.map((p) => p.y), [2, 1200]);
  assert.equal(bars.series[1].name, 'Series 2');
  assert.equal(bars.series[1].points.length, 0);

  const lines = plain(chart.normalize({ series: [{ name: 'loss', data: [[3, 0.2], ['1', 0.9], { x: 2, y: 0.5 }] }] }));
  assert.equal(lines.type, 'line');
  assert.equal(lines.categories, null);
  assert.deepEqual(lines.series[0].points.map((p) => p.x), [1, 2, 3]);

  const named = plain(chart.normalize({ categories: ['Q1', 'Q2'], series: [{ data: [4, 5] }] }));
  assert.deepEqual(named.series[0].points.map((p) => [p.x, p.y]), [['Q1', 4], ['Q2', 5]]);

  const fromTable = plain(chart.normalize(chart.fromTable([['n', 'loop', 'numpy'], ['10', '1.5', '0.2'], ['100', '14', '−']], 'line')));
  assert.equal(fromTable.x.label, 'n');
  assert.deepEqual(fromTable.series.map((s) => [s.name, s.points.length]), [['loop', 2], ['numpy', 1]]);
});

test('bars round only their data end', () => {
  assert.equal(chart.barPath(0, 10, 100, 40, 4), 'M0,100V44Q0,40 4,40H6Q10,40 10,44V100Z');
  assert.equal(chart.barPath(0, 10, 100, 102, 4), 'M0,100V100Q0,102 2,102H8Q10,102 10,100V100Z');
});

test('gap mode keeps explicit missing values and breaks lines at interior gaps', () => {
  const data = [[1, 2], [2, null], [3, 4], [4, 5], [5, ''], [6, 'n/a'], [7, 6], [9, 3], [8, null], [8, 1]];
  const model = chart.normalize({ gaps: 'break', series: [{ data }] });
  const s = model.series[0];
  assert.deepEqual(plain(s.points.map((p) => p.x)), [1, 3, 4, 7, 8, 9]);
  assert.deepEqual(plain(s.missing), [2, 5]);
  const runs = chart.segments(s.points, s.missing, (x) => x);
  assert.deepEqual(plain(runs.map((run) => run.map((p) => p.x))), [[1], [3, 4], [7, 8, 9]]);
  assert.deepEqual(plain(chart.extent(chart.normalize({ gaps: 'break', series: [{ data: [[0, 1], [10, null]] }] })).xs), [0, 10]);

  const table = chart.normalize(Object.assign(chart.fromTable([['t', 'q'], ['a', '1'], ['b', ''], ['c', '3']], 'line'), { gaps: 'break' }));
  assert.deepEqual(plain(table.categories), ['a', 'b', 'c']);
  const cats = table.categories;
  assert.equal(chart.segments(table.series[0].points, table.series[0].missing, (x) => cats.indexOf(x)).length, 2);
});

test('legacy charts drop missing values and ignore gap mode outside line charts', () => {
  const data = [[1, 2], [2, null], [3, 4]];
  const plainLine = chart.normalize({ series: [{ data }] });
  assert.deepEqual(plain(plainLine.series[0].missing), []);
  assert.equal(plainLine.gaps, false);
  assert.equal(chart.segments(plainLine.series[0].points, plainLine.series[0].missing, (x) => x).length, 1);
  assert.deepEqual(plain(chart.extent(plainLine).xs), [1, 3]);
  const bars = chart.normalize({ type: 'bar', gaps: 'break', series: [{ data: [['a', 1], ['b', null]] }] });
  assert.deepEqual(plain(bars.categories), ['a']);
});

test('reference lines normalize per axis without widening the data domain', () => {
  const spec = { y: { unit: ' ms' }, series: [{ data: [[0, 10], [5, 14]] }] };
  const base = plain(chart.extent(chart.normalize(spec)));
  const model = chart.normalize(Object.assign({}, spec, {
    referenceLines: [{ axis: 'y', value: 16.7, label: 'Frame budget' }, { axis: 'x', value: '12' }, { axis: 'z', value: 1 }, { axis: 'y' }]
  }));
  assert.deepEqual(plain(model.referenceLines), [{ axis: 'y', value: 16.7, label: 'Frame budget' }, { axis: 'x', value: 12, label: '' }]);
  assert.deepEqual(plain(chart.extent(model)), base);
  const info = chart.ticks(base.yLo, base.yHi, 4);
  assert.ok(16.7 > info.max, 'an out-of-range line stays off the plotted scale');
  const cats = chart.normalize({ type: 'bar', series: [{ data: [['v1', 1]] }], referenceLines: [{ axis: 'x', value: 'v1', label: 'Release' }] });
  assert.equal(cats.referenceLines[0].value, 'v1');
});
