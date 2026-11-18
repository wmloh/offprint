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
