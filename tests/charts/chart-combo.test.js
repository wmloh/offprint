const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, draw, byClass, chartClock, brush, nums, xsOf, ysOf, shapeOf } = require('../support/mounted-chart');

const comboSpec = (extra = {}) => ({ type: 'combo', selectionGroup: 'g',
  y: { label: 'Sales', unit: 'k' }, y2: { label: 'Margin', unit: '%' },
  series: [
    { name: 'Revenue', data: [{ x: 2023, y: 40, key: 'r23' }, { x: 2024, y: 55, key: 'r24' }] },
    { name: 'Cost', data: [{ x: 2023, y: -10, key: 'c23' }, { x: 2024, y: 20, key: 'c24' }] },
    { name: 'Margin', mark: 'line', axis: 'y2', data: [{ x: 2023, y: 12, key: 'm23' }, { x: 2024, y: 18, key: 'm24' }] }
  ], ...extra });
const axisTicks = (c, side) => byClass(c, 'op-chart-axis').find((g) => g.classList.contains(side)).children
  .filter((el) => el.classList.contains('op-chart-tick'));

test('combo series choose bar or line marks and a value axis, and both axes share a zero baseline', () => {
  const c = draw(comboSpec(), { modules: ['chart-combo'] });
  const model = c.api.model();
  assert.deepEqual(model.series.map((s) => [s.mark, s.axis]), [['bar', 'y'], ['bar', 'y'], ['line', 'y2']]);
  assert.deepEqual([...model.categories], ['2023', '2024'], 'numeric-looking x values stay categories');
  assert.equal(byClass(c, 'op-chart-bar').length, 4);
  assert.equal(byClass(c, 'op-chart-line').length, 1);
  const zero = (side) => +axisTicks(c, side).find((el) => el.textContent === '0').getAttribute('y');
  assert.equal(zero('is-y'), zero('is-y2'), 'zero sits at one height on both axes');
  assert.equal(+byClass(c, 'op-chart-base')[0].getAttribute('y1'), zero('is-y'), 'the baseline is the zero level');
  const bar = c.mark('r24');
  const dot = c.mark('m24');
  assert.equal(dot.tag, 'circle');
  const centre = (Math.min(...xsOf(bar.getAttribute('d'))) + Math.max(...xsOf(c.mark('c24').getAttribute('d')))) / 2;
  assert.ok(Math.abs(+dot.getAttribute('cx') - centre) < 0.01, 'lines run through the band centre');
  assert.ok(byClass(c, 'op-chart-axis').find((g) => g.classList.contains('is-y2')).classList.contains('is-tinted'));
  assert.ok(!byClass(c, 'op-chart-axis').find((g) => g.classList.contains('is-y')).classList.contains('is-tinted'),
    'an axis shared by several series stays neutral');
  assert.equal(c.warnings.filter((w) => /second y axis/.test(w)).length, 0, 'distinct units do not warn');

  const errors = (extra) => c.chart.validate(comboSpec(extra)).join(' ');
  assert.match(errors({ series: [{ name: 'A', axis: 'y2', data: [['a', 1]] }] }), /at least one combo series on the left/);
  assert.match(errors({ series: [{ name: 'A', mark: 'area', data: [['a', 1]] }] }), /mark of "bar" or "line"/);
  assert.match(errors({ y: { min: 5 } }), /start at zero/);
  assert.match(errors({ y2: { max: -1, unit: '%' } }), /start at zero/);
  assert.match(errors({ stack: 'percent' }), /stacked" or "none/);
  assert.match(errors({ x: { type: 'log' } }), /categorical or time x axis/);
});

test('a second axis with shared or missing units warns once and is labelled after its only series', () => {
  const env = setup({ modules: ['chart-combo'] });
  const spec = comboSpec({ y: 'Sales', y2: undefined });
  [1, 2].forEach(() => env.chart(env.document.body.appendChild(new Node('div')), spec));
  assert.equal(env.warnings.filter((w) => /second y axis/.test(w)).length, 1);
  const model = env.chart.normalize(spec);
  assert.equal(model.y2.label, 'Margin', 'an unlabelled axis with one series takes its name');
  assert.equal(env.chart.normalize(comboSpec({ series: [{ name: 'Only', data: [['a', 1]] }] })).y2, null,
    'y2 exists only when a series asks for it');
  assert.ok(env.warnings.some((w) => /y2 settings apply only/.test(w)));
});

test('combo legend, readout, table, and description name each series axis', () => {
  const c = draw(comboSpec({ toggles: true }), { modules: ['chart-combo'] });
  const chips = byClass(c, 'op-chart-series-toggle');
  assert.deepEqual(chips.map((el) => el.textContent), ['Revenueleft', 'Costleft', 'Marginright']);
  assert.deepEqual(chips.map((el) => el.all().find((k) => k.classList.contains('op-chart-key')).getAttribute('class')),
    ['op-chart-key is-bar', 'op-chart-key is-bar', 'op-chart-key']);
  c.fire('keydown', { key: 'Home' });
  const rows = c.tip().children.filter((el) => el.classList.contains('op-chart-tip-row')).map((el) => el.textContent);
  assert.deepEqual(rows, ['40kRevenueleft', '-10kCostleft', '12%Marginright']);
  assert.match(c.plot.getAttribute('aria-label'), /Combo chart with bars for Revenue and Cost and a line for Margin\. Revenue and Cost read on the left axis \(Sales, k\); Margin reads on the right axis \(Margin, %\)\. Both axes start at zero\./);
  byClass(c, 'op-chart-toggle')[0].dispatchEvent(new Event('click'));
  const table = byClass(c, 'op-chart-combo-table')[0];
  assert.deepEqual(table.all().filter((el) => el.tag === 'th' && el.parentNode.parentNode.tag === 'thead').map((th) => th.textContent),
    ['', 'RevenueLeft axis · Sales', 'CostLeft axis · Sales', 'MarginRight axis · Margin']);
  assert.ok(table.textContent.includes('2024') && table.textContent.includes('18%'));
});

test('combo bars restack per axis and keyed marks morph between layouts', () => {
  const clock = chartClock();
  const spec = comboSpec();
  const c = draw(spec, { ...clock, modules: ['chart-combo'] });
  const grouped = c.mark('c24').getAttribute('d');
  assert.ok(c.api.update({ ...spec, stack: 'stacked' }));
  assert.ok(c.host.classList.contains('is-stacked'));
  assert.equal(c.mark('c24').getAttribute('d'), grouped, 'the bar starts where it was');
  assert.equal(byClass(c, 'op-chart-bar').length, 4, 'no cross-fade copies');
  clock.tick(0);
  clock.tick(120);
  assert.equal(shapeOf(c.mark('c24').getAttribute('d')), shapeOf(grouped));
  clock.tick(400);
  const revenue = ysOf(c.mark('r24').getAttribute('d'));
  const cost = ysOf(c.mark('c24').getAttribute('d'));
  assert.ok(Math.abs(Math.max(...cost) - Math.min(...revenue)) < 0.01, 'Cost stacks on top of Revenue');
  assert.deepEqual(xsOf(c.mark('c24').getAttribute('d')).slice(0, 1), xsOf(c.mark('r24').getAttribute('d')).slice(0, 1),
    'stacked bars on one axis share a slot');
  const lineSpec = { ...spec, series: spec.series.map((s) => s.name === 'Cost' ? { ...s, mark: 'line' } : s) };
  assert.ok(c.api.update(lineSpec));
  clock.tick(0);
  clock.tick(400);
  assert.equal(c.mark('c24').tag, 'circle', 'a series switched to a line keeps its keyed points');
  assert.equal(byClass(c, 'op-chart-bar').length, 2);
});

test('time combo charts brush ranges, keep partly shown bars, and read annotations on the right axis', () => {
  const day = (d) => Date.UTC(2026, 0, d);
  const c = draw({ type: 'combo', x: { type: 'time' }, brush: true, selectionGroup: 'g', y: { label: 'Orders', unit: 'orders' },
    y2: { label: 'Conversion', unit: '%' },
    series: [
      { name: 'Orders', data: [1, 2, 3, 4, 5].map((d) => ({ x: day(d), y: d * 10, key: 'o' + d })) },
      { name: 'Conversion', mark: 'line', axis: 'y2', data: [1, 2, 3, 4, 5].map((d) => ({ x: day(d), y: d, key: 'v' + d })) }
    ],
    annotations: [{ key: 'peak', point: 'v4', text: 'Best day' }, { key: 'goal', type: 'marker', axis: 'y2', y: 3, text: 'Goal' }]
  }, { modules: ['chart-combo', 'chart-annotations'] });
  assert.ok(c.api.model().brush);
  const anchor = byClass(c, 'op-annotation-anchor')[0];
  assert.equal(anchor.getAttribute('cy'), c.mark('v4').getAttribute('cy'), 'a note on a y2 point sits on that point');
  const goal = byClass(c, 'op-annotation-line')[0];
  assert.equal(Math.round(+goal.getAttribute('y1') - 0.5), Math.round(+c.mark('v3').getAttribute('cy')), 'axis: "y2" reads on the right axis');
  const hours = 3600e3;
  c.api.setRange([day(2) + 6 * hours, day(4) - 6 * hours]);
  assert.equal(byClass(c, 'op-chart-bar').length, 3, 'bars partly inside the range stay');
  const path = byClass(c, 'op-chart-line')[0].getAttribute('d');
  assert.equal(nums(path).length / 2, 3, 'the line keeps the readings beyond each end');
  byClass(c, 'op-chart-toggle')[0].dispatchEvent(new Event('click'));
  const body = byClass(c, 'op-chart-combo-table')[0].all().filter((el) => el.tag === 'tr' && el.parentNode.tag === 'tbody');
  assert.equal(body.length, 1, 'the table lists readings inside the range');
});

test('combo series take marks and axes from table headers and named-source mappings', () => {
  const env = setup({ modules: ['chart-combo'] });
  const host = env.document.body.appendChild(new Node('div'));
  host.setAttribute('data-op-chart', 'combo');
  const table = host.appendChild(new Node('table'));
  [[['Year'], ['Units'], ['Share', { 'data-op-mark': 'line', 'data-op-axis': 'y2' }]], [['2024'], ['5'], ['30']], [['2025'], ['7'], ['35']]]
    .forEach((cells) => {
      const tr = table.appendChild(new Node('tr'));
      cells.forEach(([text, attrs = {}]) => {
        const cell = Object.assign(tr.appendChild(new Node('th')), { text });
        Object.entries(attrs).forEach(([name, value]) => cell.setAttribute(name, value));
      });
    });
  const api = env.chart.mount(host);
  assert.equal(JSON.stringify(api.model().series.map((s) => [s.name, s.mark, s.axis])), '[["Units","bar","y"],["Share","line","y2"]]');
});
