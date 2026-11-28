const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChartModules } = require('../support/chart-modules');
const { Node, draw, byClass, legendButton, toggleLegend, click, chartClock } = require('../support/mounted-chart');

const { chart } = loadChartModules(['core.js', 'chart.js', 'chart-histogram.js']);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('histogram rules derive common edges and count interior and final boundaries once', () => {
  const spec = { type: 'histogram', data: [0, 1, 2, 3, 4, 5, 6, 7] };
  const histogram = (bins, data = spec.data) => chart.normalize({ ...spec, data, bins });
  const counts = (model) => Array.from(model.series[0].points, (point) => point.y);
  assert.deepEqual(plain(histogram('fd').histogramEdges), [0, 3.5, 7]);
  assert.deepEqual(counts(histogram('fd')), [4, 4]);
  assert.deepEqual(plain(histogram('sturges').histogramEdges), [0, 1.75, 3.5, 5.25, 7]);
  assert.deepEqual(counts(histogram('sturges')), [2, 2, 2, 2]);
  assert.deepEqual(counts(histogram(2, [0, 2, 4])), [1, 2]);
  assert.deepEqual(plain(histogram({ width: 3 }).histogramEdges), [0, 3, 6, 9]);
  assert.deepEqual(counts(histogram({ edges: [0, 1, 6, 7] })), [1, 5, 2]);
  assert.deepEqual(counts(histogram('fd', [0, 0, 0, 0, 8])), [4, 0, 0, 1], 'zero IQR uses Sturges');
  assert.deepEqual(counts(histogram('fd', [5, 5, 5])), [3]);
  assert.deepEqual(counts(histogram(3, [])), [0, 0, 0]);
});

test('log histogram bins use transformed spacing and a positive y floor while storing zeros', () => {
  const spec = { type: 'histogram', bins: 3, x: { type: 'log' }, y: { type: 'log' }, data: [1, 8, 100, 1000] };
  const model = chart.normalize(spec);
  assert.deepEqual(plain(model.errors), []);
  assert.deepEqual(plain(model.histogramEdges), [1, 10, 100, 1000]);
  assert.deepEqual(plain(model.series[0].points.map((point) => point.y)), [2, 0, 2]);
  assert.deepEqual(plain(chart.domain(model)), [1, 1000]);
  assert.equal(chart.extent(model).yLo, 1);
  const width = chart.normalize({ ...spec, data: [2, 200], bins: { width: 1 } });
  width.histogramEdges.forEach((v, i) => assert.ok(Math.abs(v / (2 * 10 ** i) - 1) < 1e-12));
  const edges = chart.normalize({ type: 'histogram', edges: [1, 2, 3], counts: [0, 0], y: { type: 'log' } });
  assert.deepEqual([chart.extent(edges).yLo, chart.extent(edges).yHi], [0.5, 1]);
});

test('histogram density integrates over original widths and percent follows the selected layout', () => {
  const spec = { type: 'histogram', edges: [1, 2, 10, 20], x: { type: 'log' },
    series: [{ key: 'a', counts: [1, 0, 3] }, { key: 'b', counts: [1, 4, 1] }] };
  const area = (series) => series.points.reduce((total, point) => total + point.y * (point.xSpan[1] - point.xSpan[0]), 0);
  const overlay = chart.normalize({ ...spec, measure: 'density' });
  const areas = (model) => Array.from(model.series, (series) => Number(area(series).toFixed(12)));
  assert.deepEqual(areas(overlay), [1, 1]);
  const stacked = chart.normalize({ ...spec, measure: 'density', stack: 'stacked' });
  assert.deepEqual(areas(stacked), [0.4, 0.6]);
  assert.equal(chart.extent(stacked).yHi, 0.2);
  const percent = chart.normalize({ ...spec, measure: 'percent', stack: 'stacked' });
  assert.deepEqual(Array.from(percent.series, (series) => series.points.reduce((sum, p) => sum + p.y, 0)), [40, 60]);
  const visible = chart.view(percent, { a: true });
  assert.equal(chart.extent(visible).yHi, 40);
  assert.equal(visible.y.unit, '%');
});

test('histogram validation rejects malformed bins, counts and log inputs', () => {
  const raw = { type: 'histogram', data: [1, 2] };
  const preBinned = { type: 'histogram', edges: [1, 2, 3], counts: [1, 0] };
  for (const [input, error] of [
    [{ ...raw, bins: 0 }, /bins must/],
    [{ ...raw, bins: 1.5 }, /bins must/],
    [{ ...raw, bins: { width: 0 } }, /bins must/],
    [{ ...raw, bins: { width: 0.001 } }, /more than 500/],
    [{ ...raw, bins: { edges: [1.5, 3] } }, /cover every observation/],
    [{ ...raw, data: [1, Infinity] }, /finite numbers/],
    [{ ...raw, data: [0, 1], x: { type: 'log' } }, /log x.*positive/],
    [{ ...raw, y: { type: 'log', min: 0 } }, /log y axis min/],
    [{ ...preBinned, counts: [1] }, /integer per bin/],
    [{ ...preBinned, counts: [-1, 1.5] }, /integer per bin/],
    [{ ...preBinned, edges: [1, 1, 3] }, /strictly increasing/],
    [{ ...preBinned, edges: [0, 1, 3], x: { type: 'log' } }, /positive histogram edges/],
    [{ ...preBinned, bins: 2 }, /supplied edges/],
    [{ ...raw, stack: 'percent' }, /stack must/],
    [{ ...raw, measure: 'rate' }, /measure must/]
  ]) assert.match(chart.validate(input)[0], error);
});

test('log histogram renders zero bins empty and reads them by their actual edges in the plot and table', () => {
  const c = draw({ type: 'histogram', x: { type: 'log' }, y: { type: 'log' },
    edges: [1, 2, 100, 1000], counts: [2, 0, 4] }, { modules: ['chart-histogram', 'data'] });
  const [first, zero, last] = byClass(c, 'op-chart-histogram-bar');
  assert.equal(Number(zero.getAttribute('height')), 0);
  assert.ok(Number(first.getAttribute('height')) > 0 && Number(last.getAttribute('height')) > 0);
  const x = Number(zero.getAttribute('x')) + 2;
  const y = Number(zero.getAttribute('y')) - 20;
  c.fire('pointermove', { clientX: x, clientY: y });
  assert.equal(c.tip().textContent, '[2, 100)0', 'the pointer enters the bin at its edge even far from its midpoint');
  assert.ok(c.api.coords(x, y).y > 0);
  click(c.host.querySelector('.op-chart-toggle'));
  assert.deepEqual(c.host.querySelector('.op-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinCount', '[1, 2)2', '[2, 100)0', '[100, 1,000]4']);
  assert.equal(c.api.update({ ...c.api.spec(), counts: [1, -2, 3] }), false);
  assert.equal(c.api.update({ ...c.api.spec(), counts: [1, 0, 3] }), true);
  assert.match(c.host.querySelector('.op-chart-table').textContent, /\[100, 1,000\]3$/);
});

test('a live bin slider tweens existing histogram slots and preserves exact-edge selection', () => {
  const clock = chartClock();
  let slider, scope;
  const c = draw({ type: 'histogram', bins: 2, y: { max: 6 }, data: [0, 1, 2, 3, 4], selectionGroup: 'bins' }, {
    ...clock, modules: ['chart-histogram', 'params', 'data'],
    enhance(OP, document) {
      scope = OP._parameters.define('histogram', { bins: { type: 'range', min: 1, max: 6, step: 1, default: 2 } });
      const controls = document.body.appendChild(new Node('div'));
      controls.setAttribute('data-op-parameter-scope', 'histogram');
      controls.setAttribute('data-op-parameter', 'bins');
      slider = controls;
    }
  });
  scope.subscribe((values) => c.api.update({ ...c.api.spec(), bins: values.bins }), { keys: ['bins'] });
  const first = () => byClass(c, 'op-chart-histogram-bar').find((bar) => bar.getAttribute('data-op-bin') === '0');
  const width = () => Number(first().getAttribute('width'));
  const before = width();
  c.fire('keydown', { key: 'Home' });
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('bins').get(), 'bin:0:2');
  const input = slider.querySelector('input');
  input.valueAsNumber = 4;
  input.dispatchEvent(new Event('input'));
  assert.equal(c.api.spec().bins, 4);
  assert.equal(width(), before);
  clock.tick(0);
  clock.tick(120);
  assert.ok(width() < before && width() > before / 2);
  clock.tick(400);
  assert.equal(width(), before / 2);
  assert.equal(c.selection.group('bins').get(), 'bin:0:2');
  assert.equal(c.marks().filter((el) => el.hasAttribute('data-op-selection-active')).length, 0);
  input.valueAsNumber = 2;
  input.dispatchEvent(new Event('input'));
  clock.tick(400);
  clock.tick(800);
  assert.equal(byClass(c, 'op-chart-histogram-bar').length, 2);
  assert.ok(first().hasAttribute('data-op-selection-active'));
});

test('stacked histogram bars restack and retain shared bin widths and counts after legend filtering', () => {
  const c = draw({ type: 'histogram', stack: 'stacked', toggles: true, edges: [0, 1, 3],
    series: [{ name: 'A', counts: [1, 1] }, { name: 'B', counts: [2, 2] }] }, { modules: ['chart-histogram'] });
  const [a, , b] = byClass(c, 'op-chart-histogram-bar');
  const coord = (el, attr) => Number(el.getAttribute(attr));
  assert.equal(coord(a, 'width'), coord(b, 'width'));
  assert.equal(coord(a, 'y'), coord(b, 'y') + coord(b, 'height'));
  c.fire('keydown', { key: 'Home' });
  assert.equal(c.tip().textContent, '[0, 1)1A2B');
  c.fire('keydown', { key: 'ArrowRight' });
  assert.equal(c.tip().textContent, '[1, 3]1A2B');
  toggleLegend(legendButton(c, 'A'));
  const [visible, wider] = byClass(c, 'op-chart-histogram-bar');
  assert.equal(coord(visible, 'y') + coord(visible, 'height'), coord(a, 'y') + coord(a, 'height'));
  assert.ok(Math.abs(coord(wider, 'width') / coord(visible, 'width') - 2) < 1e-12);
  click(c.host.querySelector('.op-chart-toggle'));
  assert.deepEqual(c.host.querySelector('.op-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinB', '[0, 1)2', '[1, 3]2']);
  assert.ok(c.api.setRange([2.5, 3]));
  assert.deepEqual(c.host.querySelector('.op-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinB', '[1, 3]2'], 'narrowing into the edge of a bin keeps its original interval and count');
});
