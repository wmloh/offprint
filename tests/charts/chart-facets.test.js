const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setupChartModules } = require('../support/chart-modules');

function setup(modules = []) {
  const env = setupChartModules(['core.js', 'choices.js', 'chart.js', ...modules, 'chart-facets.js']);
  const { OffPrint, document } = env;
  function facets(spec, attrs = {}) {
    const host = new Node('div');
    Object.entries({ 'data-op-facets': '', ...attrs }).forEach(([name, value]) => host.setAttribute(name, value));
    const script = new Node('script');
    script.setAttribute('type', 'application/json');
    script.text = JSON.stringify(spec);
    host.appendChild(script);
    document.body.appendChild(host);
    const api = OffPrint._chartFacets.mount(host);
    const find = (cls, root = host) => root.all().filter((el) => el.classList.contains(cls));
    const panels = () => api.panels();
    const chartOf = (panel) => OffPrint._chart.get(panel);
    return { host, api, find, panels, chartOf };
  }
  return { ...env, facets, lib: OffPrint._chartFacets };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const key = (name) => Object.assign(new Event('keydown', { cancelable: true }), { key: name });
const pointer = (type, x, y) => Object.assign(new Event(type), { clientX: x, clientY: y, button: 0 });
const sales = (extra = {}) => Object.assign({
  type: 'line', brush: true, toggles: true, x: { label: 'Week' }, y: { label: 'Sales' },
  series: [
    { key: 'web', name: 'Web', data: [
      { x: 1, y: 4, region: 'North' }, { x: 2, y: 6, region: 'North' }, { x: 3, y: 5, region: 'North' },
      { x: 1, y: 12, region: 'South' }, { x: 2, y: 18, region: 'South' }, { x: 4, y: 21, region: 'South' }] },
    { key: 'shop', name: 'Shop', data: [
      { x: 1, y: 2, region: 'North' }, { x: 2, y: 3, region: 'North' }, { x: 3, y: 2, region: 'North' }] }
  ],
  facet: { field: 'region', columns: 2 }
}, extra);

test('facets split a spec by field or series into panels and reject bad splits', () => {
  const { lib } = setup();
  const panels = lib.split(sales());
  assert.deepEqual(plain(panels.map((p) => p.title)), ['North', 'South']);
  assert.deepEqual(plain(panels[1].spec.series.map((s) => [s.key, s.data.length])), [['web', 3], ['shop', 0]],
    'every panel keeps every series, empty where it has no points, so colours and toggles line up');
  assert.deepEqual(lib.split(sales({ facet: { field: 'region', order: ['South'], labels: { North: 'North region' } } }))
    .map((p) => p.title).join(), 'South,North region');
  const bySeries = lib.split(sales({ facet: { series: true, columns: 3 } }));
  assert.deepEqual(plain(bySeries.map((p) => [p.key, p.spec.series.length])), [['web', 1], ['shop', 1]]);
  const pie = lib.split({ type: 'pie', data: [{ label: 'A', value: 2, year: 1 }, { label: 'B', value: 3, year: 2 }], facet: { field: 'year' } });
  assert.deepEqual(plain(pie[0].spec.data.map((d) => [d.label, d.value])), [['A', 2], ['B', 0]], 'pie panels list every slice');
  assert.throws(() => lib.split(sales({ facet: { field: 'region', columns: 5 } })), /columns must be 2, 3, or 4/);
  assert.throws(() => lib.split(sales({ facet: { field: 'region', series: true } })), /not both/);
  assert.throws(() => lib.split(sales({ facet: { field: 'site' } })), /"site" is missing in point 1 of series "web"/);
  const many = { series: [{ data: Array.from({ length: 25 }, (_, i) => ({ x: i, y: i, g: i })) }], facet: { field: 'g' } };
  assert.throws(() => lib.split(many), /at most 24 panels/);
});

test('panels share scales from combined extents unless y is free', () => {
  const { lib } = setup(['chart-heatmap.js']);
  const shared = lib.layout(sales());
  shared.panels.forEach((p) => {
    assert.deepEqual(plain([p.spec.x.min, p.spec.x.max]), [1, 4], 'line x spans the data of all panels exactly');
    assert.deepEqual(plain([p.spec.y.min, p.spec.y.max]), [0, 25], 'y rounds out the combined range');
  });
  const free = lib.layout(sales({ facet: { field: 'region', scales: 'free-y' } }));
  assert.equal(free.panels[0].spec.y.min, undefined);
  assert.equal(free.panels[0].spec.x.min, 1, 'free-y still shares x');
  const fixed = lib.layout(sales({ y: { min: -5 } }));
  assert.equal(fixed.panels[0].spec.y.min, -5, 'author bounds win');
  const bars = lib.layout({ type: 'bar', data: [{ x: 'a', y: 1, g: 1 }, { x: 'b', y: 3, g: 2 }], facet: { field: 'g' } });
  assert.deepEqual(plain(bars.panels.map((p) => p.spec.categories)), [['a', 'b'], ['a', 'b']], 'categories are the union');
  const heat = lib.layout({ type: 'heatmap', data: [{ x: 'a', y: 'r', z: 2, t: 1 }, { x: 'a', y: 'r', z: 9, t: 2 }], facet: { field: 't' } });
  assert.deepEqual(plain(heat.panels.map((p) => [p.spec.scale.min, p.spec.scale.max])), [[2, 9], [2, 9]], 'heatmaps share one colour scale');
});

test('panels link the brushed range, legend toggles, table view, and x position', () => {
  const env = setup();
  const view = env.facets(sales(), { 'data-op-x-group': 'weeks', 'data-op-selection-group': 'week' });
  const [north, south] = view.panels();
  assert.deepEqual(view.find('op-facets-title').map((el) => el.textContent), ['North', 'South']);
  assert.equal(north.getAttribute('data-op-x-group'), 'weeks');
  assert.equal(view.chartOf(north).model().selectionGroup, 'week');
  view.find('op-chart-plot', north)[0].dispatchEvent(key('+'));
  assert.deepEqual(plain(view.chartOf(south).range()), plain(view.chartOf(north).range()), 'a brushed range follows across panels');
  assert.deepEqual(plain(view.api.range()), [1.75, 3.25]);
  const chips = view.find('op-chart-series-toggle');
  assert.equal(chips.length, 2, 'one shared legend for all panels');
  const input = chips[1].all().find((el) => el.tag === 'input');
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  assert.deepEqual([view.chartOf(north).visible('shop'), view.chartOf(south).visible('shop')], [false, false]);
  const shared = view.find('op-facets-tools')[0];
  shared.all().find((el) => el.classList.contains('op-chart-reset')).click();
  assert.deepEqual([view.chartOf(north).range(), view.chartOf(south).range()], [null, null]);
  shared.all().find((el) => el.classList.contains('op-chart-toggle')).click();
  assert.deepEqual([north.classList.contains('is-table'), south.classList.contains('is-table')], [true, true]);
  assert.equal(view.api.setSeriesVisible('shop', true), true);
  assert.equal(view.chartOf(south).visible('shop'), true);
});

const records = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, a: i, b: i * 2 + (i % 3), c: 10 - i, kind: i % 2 ? 'odd' : 'even' }));

test('the matrix caps its fields, derives diagonal counts, and goes compact past four fields', () => {
  const { lib, warnings } = setup(['chart-histogram.js']);
  assert.throws(() => lib.layout({ fields: ['a'], data: records }), /2 to 6 fields; it has 1/);
  assert.throws(() => lib.layout({ fields: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], data: records }), /2 to 6 fields; it has 7/);
  assert.throws(() => lib.layout({ fields: ['a', 'b'], key: 'kind', data: records }), /keys must be unique; "even" repeats/);
  assert.throws(() => lib.layout({ fields: [{ field: 'a', type: 'log' }, 'b'], data: records }), /log axis and needs positive values; record 1/);
  const layout = lib.layout({ fields: ['a', 'b', 'c'], key: 'id', group: 'kind', diagonal: 'histogram', bins: 4, data: records });
  assert.deepEqual(plain(layout.series.map((s) => [s.key, s.records.length])), [['even', 6], ['odd', 6]]);
  assert.equal(warnings.length, 0);
  const env = setup(['chart-histogram.js']);
  const view = env.facets({ fields: ['a', 'b', 'c'], key: 'id', group: 'kind', diagonal: 'histogram', bins: 5, data: records },
    { 'data-op-facets': 'matrix' });
  assert.equal(view.find('op-facets-cell').length, 9);
  const diagonal = view.chartOf(view.panels()[0]).spec();
  assert.equal(diagonal.type, 'histogram');
  assert.deepEqual(plain(diagonal.series.map((s) => s.counts)), [[2, 1, 2, 1, 0], [1, 2, 1, 2, 0]],
    'diagonal histograms count records into [lo, hi) bins over the shared field scale, 0 to 15');
  assert.equal(view.find('op-facets-field-range')[1].textContent, '0 – 24', 'the diagonal names the data range, not the rounded axis');
  assert.equal(view.host.classList.contains('is-compact'), false);
  assert.equal(view.host.classList.contains('has-histograms'), true);
  const plotBounds = view.find('op-chart-grid').map((grid) => {
    const line = grid.querySelector('line');
    return [line.getAttribute('x1'), line.getAttribute('x2')].join(',');
  });
  assert.equal(new Set(plotBounds).size, 1, 'scatter and histogram plots share both horizontal insets');
  const wide = env.facets({ fields: ['a', 'b', 'c', 'a2', 'e'],
    data: records.map((r) => ({ ...r, a2: r.a * 3, e: r.b - r.c })) }, { 'data-op-facets': 'matrix' });
  assert.equal(wide.host.classList.contains('is-compact'), true, 'five fields drop ticks and axis titles inline');
  assert.equal(wide.chartOf(wide.panels()[0]).spec().x.label, '');
  env.document.dispatchEvent(Object.assign(new Event('op:zoom:change'), { detail: { current: { target: wide.host } } }));
  assert.equal(wide.host.classList.contains('is-compact'), false, 'the zoom view shows full panels');
  assert.equal(wide.chartOf(wide.panels()[0]).spec().x.label, 'b');
});

test('a rectangle brush dims records outside it in every panel by key and reports the brush', () => {
  const env = setup();
  const view = env.facets({ fields: ['a', 'b', 'c'], key: 'id', data: records }, { 'data-op-facets': 'matrix' });
  const events = [];
  view.host.addEventListener('op:chart:facets-brush', (event) => events.push(event.detail));
  const panel = view.panels()[0];
  const plot = view.find('op-chart-plot', panel)[0];
  plot.dispatchEvent(pointer('pointerdown', 80, 30));
  env.document.dispatchEvent(pointer('pointermove', 300, 150));
  assert.equal(events.length, 0, 'dragging previews without reporting');
  env.document.dispatchEvent(pointer('pointerup', 300, 150));
  const brush = view.api.brush();
  assert.deepEqual([brush.x.field, brush.y.field], ['b', 'a']);
  const inside = records.filter((r) => r.b >= brush.x.range[0] && r.b <= brush.x.range[1] &&
    r.a >= brush.y.range[0] && r.a <= brush.y.range[1]).map((r) => r.id);
  assert.deepEqual(plain(brush.keys), inside);
  assert.ok(inside.length > 0 && inside.length < records.length);
  const dots = view.find('op-chart-dot');
  const out = view.find('is-facets-out');
  assert.equal(dots.length, 6 * records.length);
  assert.equal(out.length, 6 * (records.length - inside.length), 'every panel dims the same records');
  assert.equal(view.find('op-facets-brush').filter((r) => r.getAttribute('display') === 'inline').length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].origin, 'user');
  assert.equal(view.find('op-facets-status')[0].textContent, inside.length + ' of 12 records in the brushed area');
  assert.equal(view.api.brush({ x: { field: 'a', range: [0, 3] }, y: { field: 'a', range: [0, 3] } }), false, 'a brush needs two fields');
  assert.equal(view.api.brush({ x: { field: 'c', range: [8, 10] }, y: { field: 'a', range: [0, 11] } }), true);
  assert.deepEqual(plain(view.api.brush().keys), ['p0', 'p1', 'p2']);
  view.find('op-facets-clear')[0].click();
  assert.equal(view.api.brush(), null);
  assert.equal(view.find('is-facets-out').length, 0);
  assert.equal(events.at(-1).current, null);
});

test('named-source facets map each panel’s records and redraw on new records', () => {
  const env = setup(['data.js']);
  env.OffPrint.data.define('sales', { type: 'json', text: JSON.stringify([
    { week: 1, web: 4, region: 'North' }, { week: 2, web: 6, region: 'North' },
    { week: 1, web: 12, region: 'South' }, { week: 2, web: 18, region: 'South' }]) });
  const host = env.document.createElement('div');
  host.setAttribute('data-op-facets', '');
  host.setAttribute('data-op-source', 'sales');
  const script = env.document.createElement('script');
  script.setAttribute('type', 'application/json');
  script.text = JSON.stringify({ type: 'bar', facet: { field: 'region', order: ['South'] } });
  host.appendChild(script);
  env.document.body.appendChild(host);
  const api = env.lib.mount(host, { mapping: { x: 'week', series: [{ key: 'web', field: 'web', label: 'Web' }] } });
  assert.deepEqual(plain(api.panels().map((p) => [env.chart.get(p).spec().categories, env.chart.get(p).model().y.max])),
    [[['1', '2'], 20], [['1', '2'], 20]]);
  assert.deepEqual(plain(host.all().filter((el) => el.classList.contains('op-facets-title')).map((el) => el.textContent)), ['South', 'North']);
  assert.equal(api.update([{ week: 1, web: 40, region: 'East' }]), true);
  assert.equal(api.panels().length, 1);
  assert.equal(env.warnings.length, 0);
});
