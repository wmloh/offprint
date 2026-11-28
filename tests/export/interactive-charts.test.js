const test = require('node:test');
const assert = require('node:assert/strict');
const { library, entryURL, trustedScripts, descendants, element, page } = require('../support/offline-page');

test('Interactive charts restore linked playback, filters, and nested chart controls offline', async () => {
  const config = { profile: 'none', features: { data: true, selection: true, parameters: true,
    'chart-intervals': true, 'chart-histogram': true, 'chart-heatmap': true, 'chart-combo': true, 'chart-fits': true,
    'chart-grid': true, 'chart-sankey': true, 'chart-venn': true, 'chart-facets': true, 'chart-playback': true, 'zoom-tools': true },
    options: { chart: { instances: { trace: { mapping: {
      x: 'x', series: [{ field: 'y', key: 'observed' }], pointKey: 'key'
    } } } } },
    parameterScopes: { page: { direction: { type: 'select', choices: [
      { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }
    ] }, bins: { type: 'range', min: 2, max: 5, step: 1 } } } };
  const site = { assets: { data: { trace: { output: 'trace.js' } } } };
  const plan = page({ config, site }).OP._boot.exportPlan(site, config, null, false);
  const shared = trustedScripts(plan);
  const manifest = shared.push(site) - 1;
  const traceText = 'x,y,key\n0,0,start\n5,2,mid\n10,3,end';
  const original = shared.push({ type: 'csv', text: traceText }) - 1;
  const revised = shared.push({ type: 'csv', text: traceText.replace('5,2', '5,9') }) - 1;
  const identities = ['trace', 'linked', 'bars', 'pie', 'interval', 'histogram', 'heatmap', 'brush', 'combo', 'fits', 'grid', 'sankey', 'venn', 'tour', 'state-tour', 'facets', 'splom']
    .map(id => ({ key: ['id', id], stamp: id }));
  const payload = { url: 'file:///original/charts.html', siteURL: 'file:///original/site.js', entryURL: entryURL.href,
    site: manifest, profile: null, features: plan.features, styles: plan.styles, identities,
    modules: plan.scripts.map((path, i) => [path, i]) };

  async function visit(saved, source = original, hideHeatmap = false) {
    const frames = new Map();
    let nextFrame = 0;
    const p = page({ config, site, interactive: true, movedURL: 'file:///elsewhere/standalone.html', globals: {
      performance: { now: () => 0 },
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); }
    } });
    function add(parent, tag, attrs = {}) {
      const node = parent.appendChild(p.document.createElement(tag));
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      return node;
    }
    const detail = add(p.body, 'section');
    const data = [{ x: 0, y: 1, key: 'start' }, { x: 5, y: 2, key: 'mid' }, { x: 10, y: 4, key: 'end' }];
    const series = [{ key: 'a', data }, { key: 'b', data: [[0, 2], [5, 3], [10, 5]] }];
    const sharedPosition = { 'data-op-x-group': 'position', 'data-op-selection-group': 'step' };
    const specs = [
      ['line', { 'data-op-source': 'trace', ...sharedPosition }, {}],
      ['line', sharedPosition, { data }],
      ['bar', { 'data-op-chart-bind': '{"orientation":"direction"}' }, { data: [['A', 1]] }],
      ['pie', {}, { data: [{ label: 'A', value: 3 }, { label: 'B', value: 4 }], toggles: true }],
      ['interval', {}, { data: [['A', 3]] }],
      ['histogram', { 'data-op-chart-bind': '{"bins":"bins"}' }, { data: [1, 3, 5] }],
      ['heatmap', {}, { z: [[1, 2], [3, 4]], contours: { levels: [2] } }],
      ['line', {}, { series, brush: true, toggles: true, motion: false }],
      ['combo', {}, { x: { type: 'time' }, brush: true, toggles: true, y: { unit: 'runs' }, y2: { unit: '%' }, series: [
        { key: 'runs', data: [[0, 4], [5, 6], [10, 3]] },
        { key: 'rate', mark: 'line', axis: 'y2', data: [[0, 40], [5, 55], [10, 70]] }
      ] }],
      ['scatter', {}, { residuals: true, series: [{ key: 'obs', data: [{ x: 0, y: 1, fitted: 1.2 }, { x: 2, y: 3, fitted: 2.8 }] }],
        fits: [{ key: 'trend', curve: [[0, 1.2], [2, 2.8]], band: [[0, 1, 1.4], [2, 2.5, 3.1]], stats: 'R² = 0.98' }] }],
      ['grid', {}, { rows: ['a', 'b'], columns: ['a', 'b'], z: [[3, 1], [2, 4]], diagonal: true, normalize: 'none',
        items: [{ key: 'case', row: 'b', column: 'a' }] }],
      ['sankey', { 'data-op-selection-group': 'energy' }, {
        nodes: [{ key: 'Solar', order: 0 }, { key: 'Grid', order: 1 }, { key: 'Storage' }, { key: 'Loads' }],
        links: [{ source: 'Solar', target: 'Storage', value: 42, key: 'solar-storage' },
          { source: 'Grid', target: 'Storage', value: 18, key: 'grid-storage' },
          { source: 'Storage', target: 'Loads', value: 55, key: 'stored-energy' }]
      }],
      ['venn', { 'data-op-selection-group': 'cohorts', 'data-op-reveal-sequence': 'tour' }, {
        sets: [{ key: 'collected', members: ['sample-01', 'sample-02'] }, { key: 'reviewed', members: ['sample-02'] }],
        regionOptions: [{ sets: ['reviewed', 'collected'], key: 'reviewed-samples', revealStep: 'mid' }]
      }]
    ];
    const charts = specs.map(([type, attrs, spec], i) => {
      const host = add(detail, 'div', { id: identities[i].key[1], 'data-op-export-identity': i,
        'data-op-chart': type, ...attrs });
      const definition = add(host, 'script', { type: 'application/json' });
      definition.textContent = JSON.stringify(spec);
      host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition : null;
      return host;
    });
    const bins = add(detail, 'input', { 'data-op-parameter': 'bins' });
    bins.type = 'range';
    const tour = add(detail, 'ol', { id: 'tour', 'data-op-chart-playback': '', ...sharedPosition,
      'data-op-duration': '100', 'data-op-export-identity': charts.length });
    const stops = data.map(({ key, x }) => {
      const stop = add(tour, 'li', { 'data-op-key': key, 'data-op-x': x });
      stop.textContent = key;
      return stop;
    });
    tour.querySelectorAll = selector => selector === ':scope > li' ? stops : [];
    tour.addEventListener('op:step', event => {
      const bubble = Object.assign(new Event('op:step'), { detail: event.detail });
      Object.defineProperty(bubble, 'target', { value: tour });
      p.document.dispatchEvent(bubble);
    });
    const stateTour = add(detail, 'ol', { id: 'state-tour', 'data-op-chart-playback': 'state',
      'data-op-target': 'bars', 'data-op-export-identity': charts.length + 1 });
    const stateNote = add(stateTour, 'li', { 'data-op-key': 'sideways',
      'data-op-state': '{"params":{"direction":"horizontal"}}' });
    stateNote.textContent = 'Sideways bars';
    stateTour.querySelectorAll = selector => selector === ':scope > li' ? [stateNote] : [];
    const facetSpecs = [
      ['', { type: 'line', brush: true, toggles: true, series: [
        { key: 'a', data: [{ x: 0, y: 1, site: 'P' }, { x: 10, y: 3, site: 'P' }, { x: 0, y: 2, site: 'Q' }, { x: 10, y: 6, site: 'Q' }] },
        { key: 'b', data: [{ x: 0, y: 4, site: 'P' }, { x: 10, y: 5, site: 'Q' }] }], facet: { field: 'site' } }],
      ['matrix', { fields: ['a', 'b', 'c'], key: 'id', data: [{ id: 'r1', a: 1, b: 2, c: 3 }, { id: 'r2', a: 4, b: 8, c: 1 },
        { id: 'r3', a: 6, b: 5, c: 9 }] }]
    ];
    const facetHosts = facetSpecs.map(([layout, spec], i) => {
      const host = add(detail, 'div', { id: ['facets', 'splom'][i], 'data-op-facets': layout,
        'data-op-export-identity': charts.length + 2 + i });
      const definition = add(host, 'script', { type: 'application/json' });
      definition.textContent = JSON.stringify(spec);
      host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition : null;
      return host;
    });
    if (hideHeatmap) {
      // A chart inside a hidden card detail has no rendered plot when its state replays.
      const create = p.document.createElement;
      p.document.createElement = tag => {
        const node = create(tag);
        Object.defineProperty(node, 'clientWidth', { get: () => node.parentNode === charts[6] ? 0 : 400 });
        return node;
      };
    }
    p.body.querySelectorAll = selector => ({
      '[data-op-chart]': charts, 'ol[data-op-chart-playback]': [tour, stateTour],
      '[data-op-x-group]': [charts[0], charts[1], tour],
      '[data-op-parameter]': [bins], '[data-op-export-identity]': [...charts, tour, stateTour, ...facetHosts],
      '[data-op-facets]': facetHosts,
      '[data-op-selection-group][data-op-key]': descendants(p.body).filter(node =>
        node.hasAttribute('data-op-selection-group') && node.hasAttribute('data-op-key'))
    })[selector] || [];
    const dataEntries = source === null ? [] : [['trace', source]];
    const runtime = await p.hydrate({ ...payload, data: dataEntries }, shared, new AbortController().signal, saved);
    assert.deepEqual(p.loads, []);
    return { p, runtime, charts, tour, stops, stateTour, stateNote, bins, frames, facetHosts };
  }

  const first = await visit();
  const chart = host => first.runtime._chart.get(host);
  for (const host of first.charts) assert.ok(chart(host), host.id);
  assert.deepEqual(first.charts.map(host => chart(host).model().addon ?? chart(host).model().type),
    ['line', 'line', 'bar', 'pie', 'interval', 'histogram', 'heatmap', 'line', 'combo', 'scatter', 'grid', 'sankey', 'venn']);
  const [trace, linked, bars, pie, , , heatmap, brush] = first.charts;
  const control = (host, cls) => descendants(host).find(node => node.className?.split(' ').includes(cls) || node.getAttribute('class') === cls);
  const key = (host, name) => control(host, 'op-chart-plot').dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: name }));
  const playback = first.runtime.sequence.get(first.tour);
  assert.ok(playback, first.runtime.diagnostics.list().map(issue => issue.message).join('\n'));
  const venn = first.charts[12];
  const readout = () => control(venn, 'op-chart-tip').textContent;
  assert.ok(plan.styles.some(path => /chart-venn\.css$/.test(path)));
  key(venn, 'End');
  assert.match(readout(), /sample-01/);
  assert.equal(playback.select('mid'), true);
  key(venn, 'End');
  assert.match(readout(), /sample-02/);
  key(venn, 'Enter');
  assert.equal(first.runtime.selection.group('cohorts').get(), 'reviewed-samples');
  assert.equal(playback.select('start'), true);
  assert.equal(control(venn, 'op-chart-tip').hidden, true);
  control(venn, 'op-chart-toggle').click();
  const vennRows = descendants(venn).filter(node => node.localName === 'tr').slice(1);
  assert.equal(vennRows.length, 3);
  const reviewed = vennRows.find(row => row.getAttribute('data-op-key') === 'reviewed-samples');
  assert.ok(reviewed.classList.contains('op-reveal-pending'));
  assert.equal(playback.select('mid'), true);
  assert.equal(reviewed.classList.contains('op-reveal-pending'), false);
  assert.ok(reviewed.hasAttribute('data-op-selection-active'));
  key(trace, 'Home');
  assert.equal(control(linked, 'op-chart-x-cursor').getAttribute('display'), 'inline');
  assert.equal(chart(pie).setSeriesVisible(chart(pie).model().series[0].key, false), true);
  key(brush, '+');
  assert.deepEqual(Array.from(chart(brush).range()), [2.5, 7.5]);
  assert.equal(chart(brush).setSeriesVisible('b', false), true);
  control(brush, 'op-chart-toggle').click();
  const statePlayback = first.runtime.sequence.get(first.stateTour);
  assert.ok(statePlayback, first.runtime.diagnostics.list().map(issue => issue.message).join('\n'));
  assert.equal(statePlayback.select('sideways'), true);
  assert.equal(chart(bars).model().orientation, 'horizontal');
  first.bins.valueAsNumber = 4;
  first.bins.dispatchEvent(new Event('input'));
  assert.equal(chart(first.charts[5]).model().histogramEdges.length, 5);
  const combo = first.charts[8];
  assert.equal(chart(combo).setSeriesVisible('rate', false), true);
  key(combo, '+');
  const comboRange = Array.from(chart(combo).range());
  assert.equal(comboRange.length, 2);
  const fits = first.charts[9];
  assert.equal(control(fits, 'op-chart-residual').getAttribute('class'), 'op-chart-residual');
  assert.equal(first.runtime._chartFits.visible(fits, 'trend', false), true);
  assert.equal(first.runtime._chart._grid.normalize(first.charts[10], 'row'), true);
  const sankey = first.charts[11];
  const flowMark = (host, markKey) => descendants(host).find(node => node.getAttribute('data-op-key') === markKey);
  assert.ok(plan.styles.some(path => /chart-sankey\.css$/.test(path)));
  assert.equal(chart(sankey).setRange([0, 1]), false, 'flows have no numeric x domain');
  key(sankey, 'Home');
  assert.ok(flowMark(sankey, 'solar-storage').classList.contains('is-active'));
  assert.ok(flowMark(sankey, 'stored-energy').classList.contains('is-active'));
  assert.equal(flowMark(sankey, 'grid-storage').classList.contains('is-active'), false);
  key(sankey, 'ArrowRight');
  key(sankey, 'ArrowRight');
  assert.match(control(sankey, 'op-chart-tip').textContent, /Incoming exceeds outgoing by 5/);
  key(sankey, 'End');
  assert.match(control(sankey, 'op-chart-tip').textContent, /55.*100%of source outflow100%of destination inflow/);
  key(sankey, 'Enter');
  assert.equal(first.runtime.selection.group('energy').get(), 'stored-energy');
  control(sankey, 'op-chart-toggle').click();
  assert.deepEqual(descendants(sankey).filter(node => node.localName === 'caption').map(node => node.textContent), ['Nodes', 'Links']);
  assert.ok(descendants(sankey).some(node => node.localName === 'tr' && node.hasAttribute('data-op-selection-active')));
  const facets = first.runtime._chartFacets.get(first.facetHosts[0]);
  assert.equal(facets.panels().length, 2);
  assert.equal(facets.setSeriesVisible('b', false), true);
  assert.equal(facets.setRange([2, 6]), true);
  const splom = first.runtime._chartFacets.get(first.facetHosts[1]);
  assert.equal(splom.panels().length, 6, 'a three-field matrix has six scatter panels and three range diagonals');
  assert.equal(splom.brush({ x: { field: 'a', range: [0, 5] }, y: { field: 'b', range: [0, 9] } }), true);
  assert.deepEqual(Array.from(splom.brush().keys), ['r1', 'r2']);
  key(heatmap, 'PageDown');
  assert.equal(first.runtime._chart._heatmap.contours(heatmap, false), true);
  control(heatmap, 'op-chart-toggle').click();
  assert.equal(playback.play(), true);
  for (const [id, callback] of Array.from(first.frames)) { first.frames.delete(id); callback(50); }
  assert.equal(playback.position, 7.5);
  const record = first.runtime._readerState.capture().record;

  const restored = await visit(record, original, true);
  const getChart = i => restored.runtime._chart.get(restored.charts[i]);
  const resumed = restored.runtime.sequence.get(restored.tour);
  assert.equal(resumed.position, 7.5);
  assert.equal(resumed.snapshot().playing, false);
  assert.equal(restored.runtime.selection.group('step').get(), 'mid');
  assert.equal(getChart(2).model().orientation, 'horizontal');
  assert.equal(restored.runtime.sequence.get(restored.stateTour).key, 'sideways');
  assert.equal(restored.stateNote.hidden, false);
  assert.equal(restored.bins.value, '4');
  assert.equal(getChart(5).model().histogramEdges.length, 5);
  assert.equal(getChart(3).visible(getChart(3).model().series[0].key), false);
  assert.equal(getChart(7).visible('b'), false);
  assert.deepEqual(Array.from(getChart(7).range()), [2.5, 7.5]);
  assert.equal(getChart(8).model().series[1].axis, 'y2');
  assert.equal(getChart(8).visible('rate'), false);
  assert.deepEqual(Array.from(getChart(8).range()), comboRange);
  assert.equal(restored.runtime._chartFits.visible(restored.charts[9], 'trend'), false);
  assert.equal(restored.runtime._chart._grid.normalize(restored.charts[10]), 'row', 'the grid restores its normalization');
  assert.equal(restored.runtime.selection.group('energy').get(), 'stored-energy');
  const restoredSankey = restored.charts[11];
  assert.equal(control(restoredSankey, 'op-chart-toggle').getAttribute('aria-pressed'), 'true');
  assert.ok(descendants(restoredSankey).some(node => node.localName === 'tr' && node.hasAttribute('data-op-selection-active')));
  control(restoredSankey, 'op-chart-toggle').click();
  assert.ok(flowMark(restoredSankey, 'stored-energy').hasAttribute('data-op-selection-active'));
  const restoredVenn = restored.charts[12];
  assert.equal(restored.runtime.selection.group('cohorts').get(), 'reviewed-samples');
  assert.equal(control(restoredVenn, 'op-chart-toggle').getAttribute('aria-pressed'), 'true');
  assert.ok(flowMark(restoredVenn, 'reviewed-samples').hasAttribute('data-op-selection-active'));
  const restoredFlow = getChart(11);
  const oldRibbon = flowMark(restoredSankey, 'stored-energy').getAttribute('d');
  const changed = restoredFlow.spec();
  changed.links.reverse();
  changed.links[0].value = 20;
  assert.equal(restoredFlow.update(changed), true);
  assert.equal(flowMark(restoredSankey, 'stored-energy').getAttribute('d'), oldRibbon, 'keyed ribbon starts at its old geometry');
  for (const now of [50, 330]) {
    for (const [id, callback] of Array.from(restored.frames)) { restored.frames.delete(id); callback(now); }
  }
  assert.notEqual(flowMark(restoredSankey, 'stored-energy').getAttribute('d'), oldRibbon);
  assert.ok(flowMark(restoredSankey, 'stored-energy').hasAttribute('data-op-selection-active'));
  const restoredFacets = restored.runtime._chartFacets.get(restored.facetHosts[0]);
  assert.deepEqual(Array.from(restoredFacets.range()), [2, 6]);
  for (const panel of restoredFacets.panels()) {
    assert.equal(restored.runtime._chart.get(panel).visible('b'), false, 'every panel restores the shared legend state');
    assert.deepEqual(Array.from(restored.runtime._chart.get(panel).range()), [2, 6]);
  }
  const matrixBrush = restored.runtime._chartFacets.get(restored.facetHosts[1]).brush();
  assert.deepEqual([matrixBrush.x.field, Array.from(matrixBrush.x.range), Array.from(matrixBrush.keys)], ['a', [0, 5], ['r1', 'r2']]);
  assert.equal(control(restored.charts[9], 'op-chart-fit-curve'), undefined);
  assert.ok(control(restored.charts[9], 'op-chart-residual-zero'), 'the residual panel is restored');
  assert.equal(control(restored.charts[7], 'op-chart-toggle').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(Array.from(restored.runtime._chart._heatmap.valueRange(restored.charts[6])),
    Array.from(first.runtime._chart._heatmap.valueRange(heatmap)));
  assert.equal(restored.runtime._chart._heatmap.contours(restored.charts[6]), false);
  const restoredBrush = restored.charts[7];
  control(restoredBrush, 'op-chart-toggle').click();
  const zoom = restored.runtime._zoom;
  assert.equal(zoom.open(restoredBrush), true);
  const { overlay } = zoom.snapshot();
  assert.equal(restored.runtime._zoomTools.use('measure'), true);
  function crosshair() {
    const svg = descendants(restoredBrush).find(node => node.localName === 'svg');
    svg.getBoundingClientRect = () => ({ width: 400, left: 0, top: 0 });
    overlay.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 200, clientY: 100 }));
    const readout = control(overlay, 'op-zoomtools-readout');
    assert.equal(readout.hidden, false);
    assert.equal(readout.children[0].children[1].textContent, getChart(7).coords(200, 100).xText);
    return readout.textContent;
  }
  const before = crosshair();
  assert.equal(getChart(7).setRange([3, 4]), true);
  assert.notEqual(crosshair(), before);
  zoom.close();
  overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(resumed.next(), true);
  assert.equal(restored.stops[2].hidden, false);

  // Reader capture uses the final SVG from an in-flight tween and the tracks from the live figure.
  control(restoredVenn, 'op-chart-toggle').click();
  const overlap = getChart(12).spec();
  overlap.sets[1].members.push('sample-03');
  assert.equal(getChart(12).update(overlap), true);
  const finalFrame = restored.runtime._chart.snapshotFrame(restoredVenn);
  assert.ok(finalFrame, 'a layout update is still animating');
  resumed.select('start');
  const p = restored.p;
  const closestFrame = '.op-chart-plot > svg';
  function readable(node, owner) {
    node.ownerDocument = owner;
    node.matches = selectors => selectors.split(',').some(selector => {
      if (selector === '*') return true;
      if (selector === '[hidden]') return node.hidden;
      if (/^\[[\w-]+\]$/.test(selector)) return node.hasAttribute(selector.slice(1, -1));
      if (/^\.[\w-]+$/.test(selector)) return node.classList.contains(selector.slice(1)) ||
        (node.getAttribute('class') || node.className || '').split(' ').includes(selector.slice(1));
      return selector === node.localName;
    });
    node.querySelectorAll = selectors => descendants(node).filter(child => child.matches(selectors));
    node.querySelector = selector => selector === closestFrame
      ? descendants(node).find(child => child.localName === 'svg' && child.parentNode.matches('.op-chart-plot'))
      : node.querySelectorAll(selector)[0] || null;
    node.children.forEach(child => readable(child, owner));
    return node;
  }
  const sourceQuery = p.body.querySelectorAll;
  p.body.querySelectorAll = selector => selector === '*' ? descendants(p.body) : sourceQuery(selector);
  p.document.implementation = { createHTMLDocument() {
    const output = {
      body: element('html').appendChild(element('body')),
      importNode: (node, deep) => readable(node.cloneNode(deep), output),
      createElement: tag => readable(element(tag), output)
    };
    return output;
  } };
  p.runScript(new URL('js/page-snapshot.js', library));
  const capture = () => restored.runtime._pageSnapshot.capture();
  const snapshot = await capture();
  const copiedChart = descendants(snapshot.body).find(node => node.id === 'venn');
  const track = copiedChart.querySelector('[data-op-reader-step-svg]');
  const [id, changes] = JSON.parse(track.getAttribute('data-op-reader-step-svg'));
  assert.deepEqual(changes, [[0, '.opacity', '0'], [0, '.visibility', 'hidden'], [1, '.opacity', '1'], [1, '.visibility', 'visible']]);
  assert.equal(track.style.getPropertyValue('visibility'), 'hidden');
  assert.equal(flowMark(copiedChart, 'reviewed-samples').getAttribute('d'), flowMark(finalFrame, 'reviewed-samples').getAttribute('d'));
  const controls = descendants(snapshot.body).find(node => node.hasAttribute('data-op-reader-steps'));
  const [controlId, initial, steps] = JSON.parse(controls.getAttribute('data-op-reader-steps'));
  assert.deepEqual([controlId, initial, steps[1][0]], [id, 0, 'mid']);
  control(restoredVenn, 'op-chart-toggle').click();
  const tableSnapshot = await capture();
  assert.equal(tableSnapshot.body.querySelector('[data-op-reader-step-svg]').localName, 'tr');

  const viewOnly = (kind, id) => ({ ...record, views: record.views.filter(([key]) => {
    const [type, [, name]] = JSON.parse(key);
    return type === kind && name === id;
  }) });
  await assert.rejects(visit(viewOnly('chart', 'trace'), revised), /committed view could not be restored/);
  await assert.rejects(visit(viewOnly('sequence', 'tour'), revised), /committed view could not be restored/);
  const groupOnly = await visit(viewOnly('selection', 'step'));
  assert.equal(groupOnly.runtime.sequence.get(groupOnly.tour).key, 'mid');
  await assert.rejects(visit(null, null), /chart could not load its data/);
});
