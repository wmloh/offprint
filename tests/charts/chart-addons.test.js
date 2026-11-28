const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChartModules } = require('../support/chart-modules');
const { Node, setup } = require('../support/mounted-chart');

test('add-ons register types on a core base, scales, and legends, and an unregistered add-on type names its feature', () => {
  const { OffPrint, chart } = loadChartModules(['core.js', 'chart.js']);
  const addOns = OffPrint.chart;
  const lollipop = {
    base: 'bar',
    legend: 'swatch',
    normalize(model, spec, kit) {
      if (spec.stem === false) throw new Error('Lollipops need stems.');
      assert.equal(kit.scale('sqrt'), addOns.scale('sqrt'));
      model.stem = true;
      return model;
    },
    describe: () => 'Lollipop chart.'
  };
  assert.equal(addOns.addon('test-lollipops', { types: { lollipop }, scales: { sqrt: () => {} }, legends: { swatch: () => {} } }), true);
  const model = chart.normalize({ type: 'lollipop', series: [{ data: [['a', 1]] }] });
  assert.deepEqual([model.type, model.addon, model.stem, Array.from(model.categories)], ['bar', 'lollipop', true, ['a']]);
  assert.match(chart.validate({ type: 'lollipop', stem: false, data: [1] }).join(' '), /need stems/);
  assert.equal(typeof addOns.scale('sqrt'), 'function');
  assert.equal(addOns.scale('linear'), chart.linear);
  assert.equal(addOns.scale('nope'), null);
  assert.deepEqual(Array.from(addOns.addons()), ['test-lollipops']);

  const rejected = [
    ['test-lollipops', { types: {} }],
    ['Bad ID', {}],
    ['test-core', { types: { bar: { base: 'bar' } } }],
    ['test-base', { types: { ring: { base: 'donut' } } }],
    ['test-hook', { types: { ring: { base: 'pie', draw: 'yes' } } }],
    ['test-legend', { types: { ring: { base: 'pie', legend: 'missing' } } }],
    ['test-scale', { scales: { linear: () => {} } }]
  ];
  rejected.forEach(([id, parts]) => assert.equal(addOns.addon(id, parts), false, id));
  assert.equal(addOns.scale('ring'), null);
  assert.deepEqual(Array.from(addOns.addons()), ['test-lollipops'], 'rejected add-ons register nothing');

  OffPrint._boot = { chartFeature: (type) => type === 'heatmap' ? 'chart-heatmap' : null };
  try {
    assert.match(chart.validate({ type: 'heatmap', data: [1, 2] }).join(' '), /needs the "chart-heatmap" feature/);
    assert.equal(addOns.addon('test-thief', { types: { heatmap: { base: 'bar' } } }), false, 'types belong to their loader feature');
    assert.equal(chart.normalize({ type: 'mystery', data: [1] }).type, 'line', 'unknown types still fall back to line');
  } finally {
    delete OffPrint._boot;
  }
});

test('add-on types draw through the core with their own description, legend, readout, and table', () => {
  const env = setup();
  const lollipop = {
    base: 'bar',
    legend: 'note',
    describe: (model) => 'Lollipop chart of ' + model.series.length + ' series.',
    readout(chart, spot, tip, kit) { kit.html('div', 'op-chart-tip-head', tip, 'Lollipop ' + spot.x); },
    table(model, kit) {
      const table = kit.html('table');
      model.series[0].points.forEach((p) => kit.html('td', '', kit.html('tr', '', table), p.x + '=' + p.y));
      return table;
    }
  };
  assert.ok(env.OffPrint.chart.addon('test-lollipops', { types: { lollipop }, legends: {
    note(chart, legend, kit) { kit.html('span', 'op-test-note', legend, 'stems'); }
  } }));
  const host = new Node('div');
  env.document.body.appendChild(host);
  env.chart(host, { type: 'lollipop', series: [{ data: [['a', 1], ['b', 3]] }] });
  assert.ok(host.classList.contains('is-bar') && host.classList.contains('is-lollipop'));
  const plot = host.querySelector('.op-chart-plot');
  assert.match(plot.getAttribute('aria-label'), /^Lollipop chart of 1 series\./);
  assert.equal(host.querySelector('.op-test-note').textContent, 'stems');
  plot.dispatchEvent(Object.assign(new Event('keydown'), { key: 'End' }));
  assert.equal(host.querySelector('.op-chart-tip').textContent, 'Lollipop b');
  host.querySelector('.op-chart-toggle').dispatchEvent(new Event('click'));
  assert.equal(host.querySelector('.op-chart-table').textContent, 'a=1b=3');
  env.chart(host, { type: 'bar', data: [1] });
  assert.ok(!host.classList.contains('is-lollipop'));
});
