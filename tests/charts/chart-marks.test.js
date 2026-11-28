const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Node, setup, draw, byClass, legendButton, legendInput, toggleLegend, click, chartClock, nums, xsOf, ysOf, shapeOf
} = require('../support/mounted-chart');

test('pie slices interpolate their angles and update the visible shares, with stable keys across updates', () => {
  const clock = chartClock();
  const spec = { type: 'pie', toggles: true, data: [
    { label: 'North', value: 3, key: 'n' }, { label: 'South', value: 1, key: 's' }
  ] };
  const c = draw(spec, clock);
  c.fire('pointermove', { clientX: 200, clientY: 50 });
  assert.match(c.tip().textContent, /North.*75%/);
  const pathOf = () => byClass(c, 'op-chart-slice').at(-1).getAttribute('d');
  const north = byClass(c, 'op-chart-slice')[0].getAttribute('d');
  toggleLegend(legendButton(c, 'South'));
  assert.equal(pathOf(), north);
  clock.tick(0);
  clock.tick(120);
  const middle = pathOf();
  assert.notEqual(middle, north);
  clock.tick(240);
  assert.notEqual(pathOf(), middle);
  assert.equal(byClass(c, 'op-chart-slice').length, 1);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /North.*100%/);
  click(byClass(c, 'op-chart-toggle')[0]);
  const table = byClass(c, 'op-chart-table')[0];
  assert.match(table.textContent, /North3100%/);
  assert.doesNotMatch(table.textContent, /South/);
  assert.ok(c.api.update({ ...spec, data: [{ label: 'South updated', key: 's', value: 4 }] }));
  assert.match(table.textContent, /Every slice is hidden/);
  assert.equal(legendInput(legendButton(c, 'South updated')).checked, false);
});

test('pie markup and mapped sources both use slice labels and opt-in legend controls', () => {
  const authored = new Node('div');
  const mapped = new Node('div');
  mapped.id = 'mapped-pie';
  mapped.setAttribute('data-op-source', 'counts');
  for (const host of [authored, mapped]) host.setAttribute('data-op-chart', 'pie');
  authored.setAttribute('data-op-toggles', '');
  const table = new Node('table');
  for (const values of [['Region', 'Count'], ['West', '1'], ['East', '3']]) {
    const row = table.insertRow();
    values.forEach((value) => { row.insertCell().textContent = value; });
  }
  authored.appendChild(table);
  const env = setup({ modules: ['data'], enhance(op, document, boot) {
    op.data.define('counts', { type: 'csv', text: 'area,count,code\nWest,1,w\nEast,3,e' });
    boot.optionLayers = (feature, id) => feature === 'chart' && id === mapped.id ? [{
      mapping: { x: 'area', series: [{ field: 'count', key: 'count', label: 'Count' }], pointKey: 'code' }
    }] : [];
    document.body.appendChild(authored);
    document.body.appendChild(mapped);
  } });
  assert.equal(byClass({ host: authored }, 'op-chart-series-toggle').length, 2);
  assert.equal(byClass({ host: mapped }, 'op-chart-series-toggle').length, 0);
  assert.deepEqual(Array.from(env.chart.get(mapped).model().series, (s) => [s.key, s.name]), [['w', 'West'], ['e', 'East']]);
  assert.equal(env.chart.get(mapped).model().y.label, 'Count');
});

test('horizontal bars list categories down the left with wrapped labels and read and select along y', () => {
  const long = 'a very long model name that wraps';
  const c = draw({ type: 'bar', orientation: 'horizontal', selectionGroup: 'g', y: 'Score',
    referenceLines: [{ axis: 'y', value: 3, label: 'Target' }, { axis: 'x', value: 'b' }],
    series: [{ name: 'Runs', data: [{ x: long, y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] }] });
  assert.ok(c.host.classList.contains('is-horizontal'));
  assert.match(c.plot.getAttribute('aria-label'), /^Horizontal bar chart of Runs\./);
  const [a, b] = ['a', 'b'].map((key) => c.mark(key).getAttribute('d'));
  assert.ok(Math.min(...ysOf(b)) > Math.max(...ysOf(a)), 'categories run down in order');
  assert.ok(Math.max(...xsOf(b)) > Math.max(...xsOf(a)) && Math.min(...xsOf(a)) === Math.min(...xsOf(b)),
    'values grow across from one baseline');
  const labels = byClass(c, 'op-chart-category');
  assert.ok(labels[0].children.filter((el) => el.tag === 'tspan').length > 1, 'the long label wraps');
  assert.ok(Math.max(...labels[0].children.map((el) => el.textContent.length)) < long.length);
  const [value, category] = byClass(c, 'op-chart-ref');
  assert.equal(value.getAttribute('x1'), value.getAttribute('x2'), 'value guides cross the plot vertically');
  assert.equal(category.getAttribute('y1'), category.getAttribute('y2'), 'category guides run across');

  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^a very long/);
  c.fire('keydown', { key: 'ArrowDown' });
  assert.match(c.tip().textContent, /^b6/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('g').get(), 'b');
  const middle = (ys) => (Math.min(...ys) + Math.max(...ys)) / 2;
  c.fire('pointermove', { clientX: Math.min(...xsOf(a)) + 2, clientY: middle(ysOf(a)) });
  assert.match(c.tip().textContent, /^a very long/, 'the pointer reads the nearest row');
  const at = c.api.coords(Math.max(...xsOf(b)), middle(ysOf(b)));
  assert.deepEqual([at.x, Math.round(at.y), at.yText.length > 0], ['b', 6, true]);
});

test('stacked bars restack after legend toggles while the readout and table follow the visible series', () => {
  const clock = chartClock();
  const c = draw({ type: 'bar', stack: 'percent', toggles: true, series: [
    { name: 'A', data: [['x', 1], ['y', 3]] }, { name: 'B', data: [['x', 3], ['y', 1]] }
  ] }, clock);
  assert.ok(c.host.classList.contains('is-stacked'));
  assert.match(c.plot.getAttribute('aria-label'), /^100% stacked bar chart of A, B\./);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /1 · 25%A3 · 75%B4Total/);
  const before = byClass(c, 'op-chart-series')[1].children[0].getAttribute('d');
  toggleLegend(legendButton(c, 'A'));
  const series = byClass(c, 'op-chart-series').filter((g) => !g.getAttribute('pointer-events'));
  assert.equal(series.length, 1);
  const moving = series[0].children[0];
  const round = (d) => nums(d).map((v) => +v.toFixed(3));
  assert.deepEqual(round(moving.getAttribute('d')), round(before), 'B starts where it sat on top of A');
  clock.tick(0);
  clock.tick(120);
  const mid = moving.getAttribute('d');
  assert.notEqual(mid, before);
  assert.equal(shapeOf(mid), shapeOf(before));
  clock.tick(400);
  assert.ok(Math.max(...ysOf(moving.getAttribute('d'))) > Math.max(...ysOf(before)), 'B now reaches down to the baseline');
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /3 · 100%B/);
  assert.doesNotMatch(c.tip().textContent, /Total/, 'one series has no total');
  click(c.host.querySelector('.op-chart-toggle'));
  const table = c.host.querySelector('.op-chart-table').textContent;
  assert.match(table, /BTotalx3 \(100%\)3y1 \(100%\)1/);
  assert.doesNotMatch(table, /A/);
});

test('switching orientation or stacking morphs keyed bars in place and keeps their selection', () => {
  const clock = chartClock();
  const spec = { type: 'bar', selectionGroup: 'g', series: [
    { name: 'Runs', data: [{ x: 'a', y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] },
    { name: 'Cost', data: [{ x: 'a', y: 1, key: 'ca' }, { x: 'b', y: 2, key: 'cb' }] }
  ] };
  const c = draw(spec, clock);
  c.fire('keydown', { key: 'Home' });
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('g').get(), 'a');
  const upright = c.mark('b').getAttribute('d');
  assert.ok(c.api.update({ ...spec, orientation: 'horizontal' }));
  assert.equal(c.mark('b').getAttribute('d'), upright, 'the bar starts upright');
  assert.equal(c.host.all().filter((el) => el.classList.contains('op-chart-bar')).length, 4, 'no cross-fade copies');
  clock.tick(0);
  clock.tick(120);
  const turning = c.mark('b').getAttribute('d');
  assert.notEqual(turning, upright);
  assert.equal(shapeOf(turning), shapeOf(upright));
  clock.tick(400);
  const flat = c.mark('b').getAttribute('d');
  assert.ok(Math.max(...xsOf(flat)) - Math.min(...xsOf(flat)) > Math.max(...ysOf(flat)) - Math.min(...ysOf(flat)));
  assert.ok(c.mark('a').hasAttribute('data-op-selection-active'), 'the selection survives the switch');

  assert.ok(c.api.update({ ...spec, orientation: 'horizontal', stack: 'stacked' }));
  clock.tick(0);
  clock.tick(400);
  const runs = xsOf(c.mark('b').getAttribute('d'));
  const cost = xsOf(c.mark('cb').getAttribute('d'));
  assert.equal(Math.min(...cost), Math.max(...runs), 'Cost starts where Runs ends');
  assert.ok(c.mark('a').hasAttribute('data-op-selection-active'));
  assert.equal(c.api.update({ ...spec, stack: 'percent', series: [{ name: 'Net', data: [['a', -1]] }] }), false);
  assert.equal(c.mark('b').getAttribute('d') !== null, true, 'a rejected update keeps the chart');
});

test('data-op-orientation and data-op-stack lay out bars from markup and leave the source table for a generated one', () => {
  const env = setup();
  const host = env.document.body.appendChild(new Node('div'));
  host.setAttribute('data-op-chart', 'bar');
  host.setAttribute('data-op-orientation', 'horizontal');
  host.setAttribute('data-op-stack', 'stacked');
  const table = host.appendChild(new Node('table'));
  [['Run', 'Train', 'Eval'], ['a', '2', '1'], ['b', '3', '4']].forEach((cells) => {
    const tr = table.appendChild(new Node('tr'));
    cells.forEach((text) => Object.assign(tr.appendChild(new Node('td')), { text }));
  });
  const api = env.chart.mount(host);
  assert.deepEqual([api.model().orientation, api.model().stack], ['horizontal', 'stacked']);
  host.querySelector('.op-chart-toggle').dispatchEvent(new Event('click'));
  assert.equal(host.querySelector('.op-chart-table').textContent, 'RunTrainEvalTotala213b347');
});
