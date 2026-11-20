const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
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

test('bars round only their data end and share one path shape in both orientations', () => {
  assert.equal(chart.barPath(0, 10, 100, 40, 4), 'M0,100L0,44Q0,40 4,40L6,40Q10,40 10,44L10,100Z');
  assert.equal(chart.barPath(0, 10, 100, 102, 4), 'M0,100L0,100Q0,102 2,102L8,102Q10,102 10,100L10,100Z');
  assert.equal(chart.barPath(0, 10, 20, 80, 4, true), 'M20,0L76,0Q80,0 80,4L80,6Q80,10 76,10L20,10Z');
  const shape = (d) => d.replace(/[-\d.]+/g, '#');
  assert.equal(shape(chart.barPath(5, 8, 0, 30, 4, true)), shape(chart.barPath(5, 8, 100, 30, 4)), 'orientation morphs');
});

test('stacked bars run end to end per category and percent stacks scale each category to 100', () => {
  const series = [
    { name: 'A', data: [['x', 2], ['y', -1]] },
    { name: 'B', data: [['x', 3], ['y', 4]] },
    { name: 'C', data: [['x', -2], ['y', 0]] }
  ];
  const model = chart.normalize({ type: 'bar', stack: 'stacked', series });
  const layout = chart.stackLayout(model);
  const at = (si, i) => plain(layout.bars.get(model.series[si].points[i]));
  assert.deepEqual([at(0, 0), at(1, 0), at(2, 0)].map((b) => [b.from, b.to, b.outer]),
    [[0, 2, false], [2, 5, true], [0, -2, true]]);
  assert.deepEqual([at(0, 1).to, at(1, 1).from, at(1, 1).to, at(2, 1).outer], [-1, 0, 4, false]);
  assert.deepEqual(plain(layout.totals.get('x')), { sum: 3, pos: 5, neg: -2 });
  assert.deepEqual(plain([layout.lo, layout.hi]), [-2, 5]);
  const span = chart.extent(model);
  assert.deepEqual([span.yLo, span.yHi], [-2, 5], 'the value axis covers the stacks, not single bars');

  const shares = chart.normalize({ type: 'bar', stack: 'percent', y: { min: 10, max: 50 }, series: [
    { name: 'A', data: [['x', 1], ['y', 0]] }, { name: 'B', data: [['x', 3], ['y', 0]] }
  ] });
  const pct = chart.stackLayout(shares);
  const bar = (si, i) => pct.bars.get(shares.series[si].points[i]);
  assert.deepEqual([bar(0, 0).to, bar(1, 0).from, bar(1, 0).to, bar(0, 0).share], [25, 25, 100, 0.25]);
  assert.deepEqual([bar(1, 1).to, bar(1, 1).share], [0, null], 'an all-zero category stays empty');
  assert.deepEqual([shares.y.min, chart.extent(shares).yHi], [null, 100], 'percent stacks ignore y bounds');
  const visible = chart.stackLayout(chart.view(shares, { A: true }, null));
  assert.equal(visible.bars.get(shares.series[1].points[0]).to, 100, 'hidden series leave the stack');
});

test('bar orientation and stacking validate their values and reject what they cannot draw', () => {
  const ok = chart.normalize({ type: 'bar', orientation: 'horizontal', stack: 'none', series: [{ data: [['a', 1], ['b', 2]] }] });
  assert.deepEqual([ok.orientation, ok.stack, ok.errors.length], ['horizontal', null, 0]);
  assert.ok(ok.height >= 120 && ok.height < 260, 'horizontal bars size to their rows');
  assert.equal(chart.normalize({ type: 'bar', orientation: 'horizontal', height: 400, data: [1] }).height, 400);
  const errors = (spec) => chart.validate(Object.assign({ type: 'bar' }, spec)).join(' ');
  assert.match(errors({ orientation: 'sideways', data: [1] }), /orientation must be "vertical" or "horizontal"/);
  assert.match(errors({ stack: 'pile', data: [1] }), /stack must be "stacked", "percent", or "none"/);
  assert.match(errors({ stack: 'percent', series: [{ name: 'Net', data: [['q1', 2], ['q2', -1]] }] }),
    /Percent stacked bars need values of zero or more; series "Net" at "q2" is -1/);
  assert.equal(errors({ stack: 'stacked', series: [{ data: [['q2', -1]] }] }), '', 'stacked bars allow negatives');
  assert.match(errors({ stack: 'stacked', series: [{ data: [{ x: 'a', y: 2, interval: { lower: 1, upper: 3 } }] }] }),
    /Stacked bars cannot show intervals/);
  const line = chart.normalize({ orientation: 'horizontal', stack: 'stacked', data: [1, 2] });
  assert.deepEqual([line.orientation, line.stack, line.errors.length], ['vertical', null, 0]);
  assert.ok(warnings.some((w) => /Orientation and stacking apply to bar charts/.test(w)));
});

test('long category labels wrap at word breaks and end in an ellipsis past their line limit', () => {
  assert.deepEqual(plain(chart.wrapLabel('Mean absolute error', 10, 3)), { lines: ['Mean', 'absolute', 'error'], cut: false });
  assert.deepEqual(plain(chart.wrapLabel('Supercalifragilistic', 8, 3)), { lines: ['Supercal', 'ifragili', 'stic'], cut: false });
  assert.deepEqual(plain(chart.wrapLabel('one two three four', 7, 2)), { lines: ['one two', 'three…'], cut: true });
  assert.deepEqual(plain(chart.wrapLabel('', 5, 2)), { lines: [''], cut: false });
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

const MINUTE = 6e4;
const HOUR = 36e5;
const t0 = Date.UTC(2026, 10, 17);

test('time axes read epoch milliseconds and zoned ISO timestamps and reject the rest', () => {
  for (const v of ['2026-11-17T00:00:00Z', '2026-11-17 00:00z', '2026-11-16T19:00:00-05:00', '2026-11-17T09:00+09:00',
    '2026-11-17T05:30:00+0530', '2026-11-17T01:00+01', t0, String(t0)]) {
    assert.equal(chart.toTime(v), t0, String(v));
  }
  assert.equal(chart.toTime('2026-11-17T00:00:01.2509Z'), t0 + 1250);
  for (const v of ['2026-11-17T00:00:00', '2026-11-17', '2026-13-01T00:00Z', '2026-02-29T00:00Z', '2026-11-17T24:00Z',
    '2026-11-17T00:00:60Z', '2026-11-17T00:00+25:00', 'yesterday', '', null, true, 1e16]) {
    assert.equal(chart.toTime(v), null, String(v));
  }
});

test('time points are placed by elapsed time across offsets, keep missing readings, and skip invalid timestamps', () => {
  warnings.length = 0;
  const model = chart.normalize({ gaps: 'break', x: { type: 'time', label: 'Arrival' }, series: [{ data: [
    ['2026-11-17T00:10:00Z', 4], ['2026-11-16T19:00:00-05:00', 2], ['2026-11-17T09:01:00+09:00', 3],
    ['2026-11-17T00:40:00Z', null], ['2026-11-17T01:00:00Z', 6], ['2026-11-17T00:20:00', 9], ['soon', 1]
  ] }] });
  const s = model.series[0];
  assert.equal(model.categories, null);
  assert.deepEqual(plain(s.points.map((p) => (p.x - t0) / MINUTE)), [0, 1, 10, 60]);
  assert.deepEqual(plain(s.missing.map((x) => (x - t0) / MINUTE)), [40]);
  const x = chart.linear(t0, t0 + HOUR, 0, 600);
  assert.deepEqual(plain(s.points.map((p) => x(p.x))), [0, 10, 100, 600], 'uneven intervals keep their spacing');
  assert.deepEqual(plain(chart.segments(s.points, s.missing, (v) => v).map((run) => run.length)), [3, 1]);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((w) => /offset/.test(w)));
  assert.equal(chart.format(s.points[1].x, model.x), '2026-11-17 00:01 UTC');
});

test('time bounds, reference lines, and readouts share one UTC format; other charts keep text x values', () => {
  const model = chart.normalize({
    type: 'scatter',
    x: { type: 'time', min: '2026-11-16T18:00:00-05:00', max: 'later' },
    referenceLines: [{ axis: 'x', value: '2026-11-17T00:00:30Z', label: 'Cutoff' }, { axis: 'x', value: '2026-11-17T00:00' }],
    series: [{ data: [[t0, 1], [t0 + 90e3, 2]] }]
  });
  assert.equal(model.x.min, t0 - HOUR);
  assert.equal(model.x.max, null);
  assert.deepEqual(plain(model.referenceLines), [{ axis: 'x', value: t0 + 30e3, label: 'Cutoff' }]);
  assert.equal(chart.format(t0, model.x), '2026-11-17 00:00:00 UTC', 'seconds appear on every value once one needs them');
  const fine = chart.normalize({ type: 'scatter', x: { type: 'time' }, series: [{ data: [[t0 + 5, 1]] }] });
  assert.equal(chart.format(t0 + 5, fine.x), '2026-11-17 00:00:00.005 UTC');

  warnings.length = 0;
  const bars = chart.normalize({ type: 'bar', x: { type: 'time' }, series: [{ data: [['2026-11-17T00:00Z', 1]] }] });
  assert.deepEqual(plain(bars.categories), ['2026-11-17T00:00Z']);
  assert.equal(warnings.length, 1);
  const text = chart.normalize({ series: [{ data: [['2026-11-17T00:00Z', 1], ['2026-11-17T01:00Z', 2]] }] });
  assert.deepEqual(plain(text.categories), ['2026-11-17T00:00Z', '2026-11-17T01:00Z']);
});

test('time ticks fall on round UTC steps with labels sized to the step', () => {
  const start = Date.UTC(2026, 10, 16, 22, 2);
  const labels = (info) => plain(info.ticks.map(chart.timeTickFormat(info)));
  const hours = chart.timeTicks(start, start + 4 * HOUR + 8 * MINUTE, 5, true, true);
  assert.equal(hours.min, start, 'line charts keep their exact ends');
  assert.deepEqual(labels(hours), ['23:00', 'Nov 17', '01:00', '02:00']);
  assert.deepEqual(labels(chart.timeTicks(start, start + 50e3, 5)).slice(0, 2), ['22:02:00', '22:02:10']);
  assert.equal(labels(chart.timeTicks(start, start + 400, 4))[1], '22:02:00.100');
  const weeks = chart.timeTicks(Date.UTC(2026, 10, 1), Date.UTC(2026, 11, 20), 7);
  assert.ok(weeks.min <= Date.UTC(2026, 10, 1) && weeks.ticks.every((v) => new Date(v).getUTCDay() === 1), 'weeks start on Monday');
  assert.deepEqual(labels(chart.timeTicks(Date.UTC(2026, 0, 15), Date.UTC(2026, 9, 1), 4)), ['Jan 2026', 'Apr 2026', 'Jul 2026', 'Oct 2026']);
  assert.deepEqual(labels(chart.timeTicks(Date.UTC(2020, 0, 1), Date.UTC(2040, 0, 1), 5)), ['2020', '2025', '2030', '2035', '2040']);
});

test('log scales give each decade equal length and tick by decades or 1-2-5 steps', () => {
  const x = chart.log(1, 1000, 0, 300);
  assert.deepEqual([1, 10, 100, 1000].map((v) => Math.round(x(v) * 1e9) / 1e9), [0, 100, 200, 300]);
  assert.ok(Math.abs(x.invert(150) - Math.sqrt(1000)) < 1e-9);
  const labels = (info) => plain(info.ticks.map(chart.logTickFormat()));
  const wide = chart.logTicks(0.0003, 4200, 4);
  assert.deepEqual([wide.min, wide.max], [1e-4, 1e4]);
  assert.deepEqual(labels(wide), ['0.0001', '0.01', '1', '100', '10K'], 'many decades keep every other one');
  assert.deepEqual(labels(chart.logTicks(0.3, 420, 4)), ['0.1', '1', '10', '100', '1,000']);
  assert.deepEqual(labels(chart.logTicks(0.004, 0.03, 5)), ['0.002', '0.005', '0.01', '0.02', '0.05']);
  assert.deepEqual(labels(chart.logTicks(1, 1e12, 5)), ['1', '1,000', '1M', '1B', '1T']);
  const fixed = chart.logTicks(2e-5, 0.3, 8, true, true);
  assert.deepEqual([fixed.min, fixed.max], [2e-5, 0.3], 'fixed bounds keep their exact values');
  assert.deepEqual(labels(fixed), ['0.00003', '0.0001', '0.0003', '0.001', '0.003', '0.01', '0.03', '0.1', '0.3']);
  assert.deepEqual(plain(chart.logTicks(2.1, 2.9, 4, true, true).ticks), [2.2, 2.4, 2.6, 2.8], 'narrow ranges fall back to linear ticks');
});

test('log axes keep original values for readouts and tables, and reference lines use the same scale', () => {
  const model = chart.normalize({
    type: 'scatter',
    x: { type: 'log', label: 'Learning rate', min: '1e-5', max: 0.1 },
    y: { type: 'log' },
    referenceLines: [{ axis: 'y', value: 1.79, label: 'Uniform' }, { axis: 'x', value: 3e-4 }],
    series: [{ data: [['0.00003', 1.46], [3e-4, 0.58]] }]
  });
  assert.deepEqual(plain(model.errors), []);
  assert.deepEqual([model.x.log, model.y.log, model.x.min, model.x.max], [true, true, 1e-5, 0.1]);
  assert.deepEqual(plain(model.series[0].points.map((p) => [p.x, p.y])), [[3e-5, 1.46], [3e-4, 0.58]]);
  assert.equal(chart.format(3e-5, model.x), '0.00003');
  assert.equal(chart.format(1e-7, model.x), '1e-7');
  const info = chart.logTicks(0.58, 1.46, 4);
  const y = chart.log(info.min, info.max, 200, 0);
  assert.ok(1.79 >= info.min && 1.79 <= info.max);
  assert.ok(Math.abs(y(1.79) - 200 * (1 - (Math.log10(1.79) - Math.log10(info.min)) / Math.log10(info.max / info.min))) < 1e-9);
  assert.ok(chart.extent(model).yHi < 1.79, 'reference lines still leave the data domain alone');
});

test('log axes reject nonpositive values and bounds, and other charts ignore the option', () => {
  const spec = (extra) => Object.assign({ x: { type: 'log' }, y: { type: 'log' }, series: [{ data: [[1, 2], [10, 3]] }] }, extra);
  assert.deepEqual(plain(chart.validate(spec())), []);
  const errors = (extra) => plain(chart.validate(spec(extra)));
  assert.match(errors({ series: [{ data: [[1, 0], [10, -3], [100, 2]] }] })[0], /log y axis needs positive values; 2 are zero or negative, such as 0/);
  assert.match(errors({ series: [{ data: [[0, 1], [10, 2]] }] })[0], /log x axis needs positive values/);
  assert.match(errors({ gaps: 'break', series: [{ data: [[-1, null], [10, 2]] }] })[0], /log x axis/, 'missing x positions count');
  assert.match(errors({ y: { type: 'log', min: 0 } })[0], /log y axis min must be a positive number, not 0/);
  assert.match(errors({ y: { type: 'log', max: 'lots' } })[0], /max must be a positive number, not "lots"/);
  assert.match(errors({ x: { type: 'log', min: 50, max: 5 } })[0], /min must be below its max/);
  assert.match(errors({ referenceLines: [{ axis: 'y', value: 0, label: 'Zero' }] })[0], /reference line on the log y axis is at 0/);
  assert.match(errors({ series: [{ data: [['a', 1]] }] })[0], /needs numeric x values/);
  assert.deepEqual(plain(chart.validate({ y: { min: 'lots' }, series: [{ data: [[0, -1]] }] })), [], 'linear axes are unchanged');

  warnings.length = 0;
  const bars = chart.normalize({ type: 'bar', y: { type: 'log' }, series: [{ data: [['a', 0]] }] });
  assert.deepEqual([bars.y.log, bars.errors.length, warnings.length], [false, 0, 1]);
});

test('views hide series by name and keep line readings just beyond a narrowed range', () => {
  const model = chart.normalize({
    gaps: 'break',
    toggles: true,
    series: [{ name: 'A', data: [[1, 1], [2, 2], [3, null], [4, 4], [5, 5], [6, 6]] }, { name: 'B', data: [[1, 9], [6, 9]] }]
  });
  assert.equal(model.toggles, true);
  const view = chart.view(model, { B: true }, [2.5, 4.5]);
  assert.deepEqual(plain(view.series.map((s) => s.name)), ['A']);
  assert.equal(view.hiddenCount, 1);
  const a = view.series[0];
  assert.deepEqual(plain(a.points.map((p) => p.x)), [4]);
  assert.deepEqual(plain(a.line.map((p) => p.x)), [2, 4, 5], 'paths reach the readings beyond each end');
  assert.deepEqual(plain(a.missing), [3]);
  assert.deepEqual(plain(chart.segments(a.line, a.breaks, (x) => x).map((run) => run.map((p) => p.x))), [[2], [4, 5]]);
  assert.equal(chart.view(model, {}, null).series[1].points.length, 2);
  assert.equal(chart.normalize({ series: [{ data: [1, 2] }] }).toggles, false);
  assert.equal(chart.normalize({ series: [{ data: [1] }, { data: [2] }] }).toggles, false);
  assert.equal(chart.normalize({ toggles: false, series: [{ data: [1] }, { data: [2] }] }).toggles, false);
});

test('pie tables and specs validate labels, keys, and finite nonnegative values', () => {
  const spec = chart.fromTable([['Group', 'Count'], ['North', 3], ['South', '0']], 'pie');
  const model = chart.normalize(spec);
  assert.deepEqual(plain(model.errors), []);
  assert.deepEqual(plain(model.series.map((s) => [s.key, s.points[0].y])), [['North', 3], ['South', 0]]);
  assert.equal(model.y.label, 'Count');
  assert.equal(model.toggles, false);
  assert.equal(chart.domain(model), null);
  assert.match(chart.validate({ type: 'pie', data: [{ label: 'A', value: '1e400' }] })[0], /finite value/);
  assert.match(chart.validate({ type: 'pie', data: [{ label: 'A', value: -1 }] })[0], /nonnegative/);
  assert.match(chart.validate({ type: 'pie', data: [{ label: 'A', value: 1 }, { label: 'A', value: 2 }] })[0], /unique/);
});

test('ranges clamp to the data, zoom around a value, and pan to the ends on linear, time, and log axes', () => {
  const linear = chart.normalize({ brush: true, series: [{ data: [[0, 1], [100, 2]] }] });
  assert.deepEqual(plain(chart.domain(linear)), [0, 100]);
  assert.deepEqual(plain(chart.clampRange(linear, 80, -20)), [0, 80]);
  assert.equal(chart.clampRange(linear, -5, 120), null, 'the whole domain is no range at all');
  assert.equal(chart.clampRange(linear, 10, 10.01), false, 'too narrow to read');
  assert.deepEqual(plain(chart.zoomRange(linear, null, 20, 0.5)), [10, 60], 'the centre keeps its place');
  assert.deepEqual(plain(chart.zoomRange(linear, [10, 60], null, 0.5)), [22.5, 47.5]);
  assert.equal(chart.zoomRange(linear, [10, 60], null, 2), null, 'widening past the data resets');
  assert.deepEqual(plain(chart.panRange(linear, [70, 90], 0.25)), [75, 95]);
  assert.deepEqual(plain(chart.panRange(linear, [70, 90], 1)), [80, 100], 'stops at the end');

  const start = Date.UTC(2026, 10, 1);
  const hour = 36e5;
  const time = chart.normalize({ x: { type: 'time' }, series: [{ data: [[start, 1], [start + 24 * hour, 2]] }] });
  assert.deepEqual(plain(chart.zoomRange(time, null, null, 0.5)), [start + 6 * hour, start + 18 * hour]);
  assert.deepEqual(plain(chart.panRange(time, [start, start + 6 * hour], -1)), [start, start + 6 * hour]);

  const logModel = chart.normalize({ x: { type: 'log' }, series: [{ data: [[1e-5, 1], [1e-1, 2]] }] });
  const zoomed = chart.zoomRange(logModel, null, 1e-3, 0.5);
  assert.deepEqual(plain(zoomed.map((v) => +Math.log10(v).toFixed(9))), [-4, -2], 'log ranges narrow by ratios');
  const moved = chart.panRange(logModel, zoomed, 0.5);
  assert.deepEqual(plain(moved.map((v) => +Math.log10(v).toFixed(9))), [-3, -1]);
  assert.equal(chart.clampRange(logModel, 0, 1e-3), false, 'a log range needs positive ends');

  warnings.length = 0;
  const bars = chart.normalize({ type: 'bar', brush: true, series: [{ data: [['a', 1], ['b', 2]] }] });
  assert.equal(bars.brush, false);
  assert.equal(chart.domain(bars), null);
  assert.match(warnings.join(' '), /Range brushing needs a numeric or time x axis/);
});

test('readAt turns plot pixels into data values rounded to a pixel, bands into categories, and misses into null', () => {
  const geom = (x, y) => ({ left: 40, right: 440, top: 10, bottom: 210, band: 0, x, y });
  const lines = chart.normalize({ series: [{ data: [[0, 0], [10, 100]] }] });
  const g = geom(chart.linear(0, 10, 40, 440), chart.linear(0, 100, 210, 10));
  assert.deepEqual(plain(chart.readAt(lines, g, 140, 110)), { x: 2.5, y: 50, xText: '2.5', yText: '50' });
  // 0.025 x units and 0.5 y units per pixel: two decimals for x, one for y.
  assert.deepEqual(plain(chart.readAt(lines, g, 142, 109)), { x: 2.55, y: 50.5, xText: '2.55', yText: '50.5' });
  assert.equal(chart.readAt(lines, g, 39, 110), null);
  assert.equal(chart.readAt(lines, g, 140, 211), null);

  const bars = chart.normalize({ type: 'bar', series: [{ data: [['a', 1], ['b', 2]] }] });
  const bg = Object.assign(geom(null, chart.linear(0, 2, 210, 10)), { band: 200 });
  assert.equal(chart.readAt(bars, bg, 239, 110).x, 'a');
  assert.equal(chart.readAt(bars, bg, 241, 110).xText, 'b');

  const start = Date.UTC(2026, 10, 1);
  const time = chart.normalize({ x: { type: 'time' }, series: [{ data: [[start, 1], [start + 4e5, 2]] }] });
  const tg = geom(chart.linear(start, start + 4e5 * 6, 40, 440), chart.linear(1, 1000, 210, 10));
  assert.equal(chart.readAt(time, tg, 240, 110).xText, '2026-11-01 00:20:00 UTC', 'readings to the second read to the second');

  const logs = chart.normalize({ y: { type: 'log' }, series: [{ data: [[0, 1], [1, 1000]] }] });
  const lg = geom(chart.linear(0, 1, 40, 440), chart.log(1, 1000, 210, 10));
  assert.equal(chart.readAt(logs, lg, 40, 110).y, 31.6, 'log values keep the digits a pixel can show');
});

test('motion tweens move numbers inside matching attribute text and blend colours, ending exactly on the target', () => {
  const { between, ease, parseColor } = chart.motion;
  const bar = between('M10,200V190Q10,180 14,180H26', 'M10,200V110Q10,100 14,100H26');
  assert.equal(bar(0), 'M10,200V190Q10,180 14,180H26');
  assert.equal(bar(0.5), 'M10,200V150Q10,140 14,140H26');
  assert.equal(bar(1), 'M10,200V110Q10,100 14,100H26');
  assert.equal(between('4', '4'), null);
  assert.equal(between(null, '4'), null);
  assert.equal(between('M0,0L1,1', 'M0,0L1,1L2,2'), null, 'paths with different commands cross-fade instead');
  assert.deepEqual(plain(parseColor('#f80')), [255, 136, 0, 1]);
  assert.deepEqual(plain(parseColor('rgb(10 20 30 / 50%)')), [10, 20, 30, 0.5]);
  assert.equal(parseColor('var(--df-chart-1)'), null);
  const tint = between('rgb(0, 0, 0)', '#ffffff');
  assert.equal(tint(0.5), 'rgba(128, 128, 128, 1)');
  assert.equal(tint(1), '#ffffff');
  assert.deepEqual([ease(0), ease(1)], [0, 1]);
  assert.ok(ease(0.5) > 0.5, 'eases out');
});

test('marks match across drawings by series, kind, and point key or x, with repeats kept apart', () => {
  const { markId, addMark, match } = chart.motion;
  assert.equal(markId('loss', 'dot', { key: 'r1', x: 3 }), markId('loss', 'dot', { key: 'r1', x: 9 }), 'keys win over x');
  assert.notEqual(markId('loss', 'dot', { x: 3 }), markId('loss', 'bar', { x: 3 }));
  assert.notEqual(markId('a', 'dot', { x: 3 }), markId('b', 'dot', { x: 3 }));
  const before = new Map();
  const after = new Map();
  ['a', 'b', 'c'].forEach((x) => addMark(before, markId('s', 'bar', { x }), { el: x }));
  ['c', 'a', 'd'].forEach((x) => addMark(after, markId('s', 'bar', { x }), { el: x }));
  addMark(after, markId('s', 'bar', { x: 'd' }), { el: 'd again' });
  assert.equal(after.size, 4, 'a repeated key is numbered rather than replaced');
  const result = plain(match(before, after));
  assert.deepEqual(result.kept.map((k) => before.get(k).el), ['c', 'a']);
  assert.deepEqual(result.entering.map((k) => after.get(k).el), ['d', 'd again']);
  assert.deepEqual(result.leaving.map((k) => before.get(k).el), ['b']);
});

test('motion opt-outs resolve from the attribute, then the spec, then configured layers, and bypass reduced motion and print', () => {
  const { resolve, allowed } = chart.motion;
  assert.equal(resolve(null, {}, []), true, 'on by default');
  assert.equal(resolve(null, {}, [{ motion: false }]), false, 'site option');
  assert.equal(resolve(null, {}, [{ motion: false }, { motion: true }]), true, 'later layers win');
  assert.equal(resolve(null, { motion: true }, [{ motion: false }]), true, 'the spec wins over options');
  assert.equal(resolve(false, { motion: true }, []), false, 'data-df-animate wins over everything');
  assert.equal(resolve(null, { motion: 'no' }, [{ motion: 0 }]), true, 'non-boolean values are ignored');
  assert.equal(chart.normalize({ motion: false, data: [1] }).motion, false);
  assert.equal(chart.normalize({ type: 'pie', motion: false, data: [{ label: 'a', value: 1 }] }).motion, false);

  const on = { motion: true };
  const env = { reduced: false, print: false, zoomed: false, frames: true };
  assert.equal(allowed(on, env), true);
  for (const key of ['reduced', 'print', 'zoomed']) assert.equal(allowed(on, { ...env, [key]: true }), false, key);
  assert.equal(allowed(on, { ...env, frames: false }), false, 'no frame scheduling');
  assert.equal(allowed({ motion: false }, env), false);
});

test('add-ons register types on a core base, scales, and legends, and an unregistered add-on type names its feature', () => {
  const lollipop = {
    base: 'bar',
    legend: 'swatch',
    normalize(model, spec) {
      if (spec.stem === false) throw new Error('Lollipops need stems.');
      model.stem = true;
      return model;
    },
    describe: () => 'Lollipop chart.'
  };
  assert.equal(chart.addon('test-lollipops', { types: { lollipop }, scales: { sqrt: () => {} }, legends: { swatch: () => {} } }), true);
  const model = chart.normalize({ type: 'lollipop', series: [{ data: [['a', 1]] }] });
  assert.deepEqual(plain([model.type, model.addon, model.stem, model.categories]), ['bar', 'lollipop', true, ['a']]);
  assert.match(chart.validate({ type: 'lollipop', stem: false, data: [1] }).join(' '), /need stems/);
  assert.equal(typeof chart.scale('sqrt'), 'function');
  assert.equal(chart.scale('linear'), chart.linear);
  assert.equal(chart.scale('nope'), null);
  assert.deepEqual(Array.from(chart.addons()), ['test-lollipops']);

  const rejected = [
    ['test-lollipops', { types: {} }],
    ['Bad ID', {}],
    ['test-core', { types: { bar: { base: 'bar' } } }],
    ['test-base', { types: { ring: { base: 'donut' } } }],
    ['test-hook', { types: { ring: { base: 'pie', draw: 'yes' } } }],
    ['test-legend', { types: { ring: { base: 'pie', legend: 'missing' } } }],
    ['test-scale', { scales: { linear: () => {} } }]
  ];
  rejected.forEach(([id, parts]) => assert.equal(chart.addon(id, parts), false, id));
  assert.equal(chart.scale('ring'), null);
  assert.deepEqual(Array.from(chart.addons()), ['test-lollipops'], 'rejected add-ons register nothing');

  context.DocForm._boot = { chartFeature: (type) => type === 'histogram' ? 'chart-histogram' : null };
  try {
    assert.match(chart.validate({ type: 'histogram', data: [1, 2] }).join(' '), /needs the "chart-histogram" feature/);
    assert.equal(chart.addon('test-thief', { types: { histogram: { base: 'bar' } } }), false, 'types belong to their loader feature');
    assert.equal(chart.normalize({ type: 'mystery', data: [1] }).type, 'line', 'unknown types still fall back to line');
  } finally {
    delete context.DocForm._boot;
  }
});
