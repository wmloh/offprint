const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChartModules } = require('../support/chart-modules');
const { Node, setup, draw, byClass, legendButton, toggleLegend, click, chartClock, nums } = require('../support/mounted-chart');

const { chart } = loadChartModules(['core.js', 'chart.js', 'chart-intervals.js']);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('interval plots rank by estimate or label with stable ties and missing values last', () => {
  const spec = { type: 'interval', categories: ['Zulu', 'Alpha', 'Bravo', 'Missing'], series: [
    { key: 'first', data: [['Alpha', -2], ['Bravo', 4], ['Zulu', 4]] },
    { key: 'second', data: [['Missing', 8], ['Alpha', 5]] }
  ] };
  const labels = (options) => plain(chart.normalize({ ...spec, ...options }).categories);
  assert.deepEqual(labels(), ['Zulu', 'Bravo', 'Alpha', 'Missing']);
  assert.deepEqual(labels({ sortSeries: 'second' }), ['Missing', 'Alpha', 'Zulu', 'Bravo']);
  assert.deepEqual(labels({ sort: 'label' }), ['Alpha', 'Bravo', 'Missing', 'Zulu']);
  assert.deepEqual(labels({ sort: 'none' }), spec.categories);
  assert.match(chart.validate({ ...spec, sortSeries: 'unknown' })[0], /series key/);
});

test('interval plots validate supplied bounds and include them on the value axis', () => {
  const spec = { type: 'interval', data: [{ x: 'A', y: 4, interval: { lower: 5, upper: 8, count: 0 } }] };
  const span = chart.extent(chart.normalize(spec));
  assert.deepEqual([span.yLo, span.yHi], [4, 8], 'bounds may be disjoint from the estimate');
  assert.equal(chart.extent(chart.normalize({ ...spec, mark: 'lollipop' })).yLo, 0);
  assert.equal(chart.validate(spec).length, 0);
  for (const interval of [{ lower: 8, upper: 5 }, { lower: 1, upper: Infinity }, { lower: 1, upper: 8, count: -1 }]) {
    assert.match(chart.validate({ ...spec, data: [{ x: 'A', y: 4, interval }] })[0], /interval (bounds|count)/);
  }
  assert.match(chart.validate({ ...spec, data: [['A', 1], ['A', 2]] })[0], /more than one value/);
  assert.match(chart.validate({ ...spec, mark: 'line' })[0], /mark must be/);
  assert.match(chart.validate({ ...spec, sort: 'random' })[0], /sort must be/);
});

test('direct intervals handle disjoint bounds, missing intervals, fixed scales, and invalid updates', () => {
  const interval = { lower: 3, upper: 5, label: 'Supplied bounds', count: 0 };
  const spec = { type: 'line', data: [
    { x: 1, y: 2, interval }, { x: 2, y: 2 }, { x: 3, y: 2, interval }, { x: 4, y: 4, interval }
  ] };
  const env = draw(spec);
  assert.equal(env.plot.querySelectorAll('.op-chart-whisker').length, 1);
  assert.equal(env.plot.querySelector('.op-chart-band-interval').getAttribute('d').match(/M/g).length, 1);
  assert.equal(env.api.model().series[0].points[1].interval, undefined);
  const band = env.plot.querySelector('.op-chart-band-interval');
  for (const invalid of [{ lower: 1 }, { lower: 3, upper: 2 }, { lower: 0, upper: Infinity }, { ...interval, count: 1.2 }]) {
    assert.equal(env.api.update({ data: [{ x: 1, y: 2, interval: invalid }] }), false);
  }
  assert.equal(env.api.update({ data: [{ x: 1, y: null, interval }] }), false);
  assert.equal(env.api.update({ y: { type: 'log' }, data: [
    { x: 1, y: 2, interval: { lower: 0, upper: 3 } }
  ] }), false);
  assert.equal(env.plot.querySelector('.op-chart-band-interval'), band);
  for (const type of ['bar', 'scatter']) {
    const { plot, tip, fire } = draw({ type, y: { min: 0, max: 4 }, data: [{ x: 1, y: 2, interval }] });
    assert.equal(plot.querySelectorAll('.op-chart-whisker').length, 1);
    const clip = plot.all().find((el) => el.tag === 'clipPath' && el.id.endsWith('-interval')).firstChild;
    assert.ok(+clip.getAttribute('height') > 0);
    assert.ok(plot.querySelectorAll('.op-chart-tick').some((tick) => tick.textContent === '4'));
    assert.ok(!plot.querySelectorAll('.op-chart-tick').some((tick) => tick.textContent === '5'));
    fire('keydown', { key: 'End' });
    assert.match(tip().textContent, /Supplied bounds \[3, 5\] \(n = 0\)/);
  }
});

test('interval plots dodge, draw bounds and references in both orientations, and keep selection through tweens', () => {
  const clock = chartClock();
  const spec = { type: 'interval', orientation: 'horizontal', mark: 'lollipop', selectionGroup: 'interval-demo',
    x: 'Group', y: 'Score', toggles: true, referenceLines: [{ axis: 'y', value: 5 }, { axis: 'x', value: 'Alpha' }],
    series: [
      { name: 'Baseline', data: [{ x: 'Alpha', y: 3, key: 'a' }, { x: 'Bravo', y: 8, key: 'b',
        interval: { lower: 7, upper: 9, label: 'Example bounds', count: 12 } }] },
      { name: 'Follow-up', data: [{ x: 'Bravo', y: 8, key: 'b-follow' }] }
    ] };
  const c = draw(spec, { ...clock, modules: ['chart-intervals'] });
  const at = (key, coordinate) => Number(c.mark(key).getAttribute(coordinate));
  assert.match(c.plot.getAttribute('aria-label'), /^Horizontal lollipop plot/);
  assert.equal(at('b', 'cx'), at('b-follow', 'cx'));
  assert.ok(at('b', 'cy') < at('b-follow', 'cy') && at('b-follow', 'cy') < at('a', 'cy'));
  const bound = () => byClass(c, 'op-chart-whisker')[0].getAttribute('d');
  const horizontal = bound();
  const [lowerX, lowerY, upperX, upperY] = nums(horizontal);
  assert.equal(lowerY, upperY);
  assert.ok(lowerX < at('b', 'cx') && upperX > at('b', 'cx'));
  assert.equal(byClass(c, 'op-chart-interval-stem').length, 3);
  const valueRef = () => byClass(c, 'op-chart-ref')[0];
  assert.equal(valueRef().getAttribute('x1'), valueRef().getAttribute('x2'));
  c.point(c.mark('b'), 'pointermove');
  assert.match(c.tip().textContent, /Bravo.*Example bounds \[7, 9\] \(n = 12\)/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('interval-demo').get(), 'b');
  const oldX = at('b', 'cx');
  assert.ok(c.api.update({ ...spec, orientation: 'vertical' }));
  assert.equal(at('b', 'cx'), oldX);
  assert.equal(bound(), horizontal, 'the whisker starts from its horizontal coordinates');
  clock.tick(0);
  clock.tick(120);
  assert.notEqual(bound(), horizontal, 'the whisker moves with the dot');
  clock.tick(400);
  assert.equal(at('b', 'cy'), at('b-follow', 'cy'));
  assert.ok(at('b', 'cx') < at('b-follow', 'cx') && at('b-follow', 'cx') < at('a', 'cx'));
  assert.equal(valueRef().getAttribute('y1'), valueRef().getAttribute('y2'));
  assert.ok(c.mark('b').hasAttribute('data-op-selection-active'));
  const before = at('b', 'cx');
  toggleLegend(legendButton(c, 'Follow-up'));
  assert.equal(at('b', 'cx'), before);
  clock.tick(400);
  clock.tick(800);
  assert.ok(at('b', 'cx') > before, 'the remaining series recentres');
  assert.equal(c.mark('b-follow'), undefined);
  click(c.host.querySelector('.op-chart-toggle'));
  const table = c.host.querySelector('.op-chart-table');
  assert.deepEqual(table.querySelectorAll('tr').map((row) => row.textContent), [
    'GroupBaseline', 'Bravo8Example bounds [7, 9] (n = 12)', 'Alpha3'
  ]);
  assert.ok(table.querySelector('[data-op-key="b"]').hasAttribute('data-op-selection-active'));
});

test('interval markup ranks the interactive table while retaining the authored fallback', () => {
  const env = setup({ modules: ['chart-intervals'] });
  const host = env.document.body.appendChild(new Node('div'));
  host.setAttribute('data-op-chart', 'interval');
  const table = host.appendChild(new Node('table'));
  [['Group', 'Score'], ['Alpha', '2'], ['Bravo', '4']].forEach((cells) => {
    const tr = table.appendChild(new Node('tr'));
    cells.forEach((text) => Object.assign(tr.appendChild(new Node('td')), { text }));
  });
  const api = env.chart.mount(host);
  assert.equal(api.model().intervalMark, 'dot');
  assert.equal(host.querySelectorAll('.op-chart-dot').length, 2);
  assert.equal(host.querySelectorAll('.op-chart-interval-stem').length, 0);
  click(host.querySelector('.op-chart-toggle'));
  assert.equal(host.querySelector('.op-chart-table').textContent, 'GroupScoreBravo4Alpha2');
  assert.equal(table.textContent, 'GroupScoreAlpha2Bravo4');
});
