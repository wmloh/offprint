const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, choose, chosen, brush } = require('../support/mounted-chart');

test('mapped intervals retain numeric results behavior and paired differences retain their baseline identity', () => {
  const bounds = { lower: 'lo', upper: 'hi', count: 'n', label: 'Outcome bounds' };
  const paired = { field: 'delta', baselineKeyField: 'reference', interval: { lower: 'dlo', upper: 'dhi', label: 'Paired bounds' } };
  const records = [
    { run: 'base', device: 'CPU', x: 1, score: 10, lo: 8, hi: 14, n: 5 },
    { run: 'alt', device: 'GPU', x: 2, score: 20, lo: 12, hi: 24, n: 3, delta: -2, reference: 'base', dlo: -5, dhi: 1 },
    { run: 'other', device: 'TPU', x: 3, score: 8, lo: null, hi: null, n: null, delta: null, reference: null, dlo: null, dhi: null }
  ];
  const hosts = {};
  const { OffPrint: op } = setup({ modules: ['data', 'results', 'scenarios'], enhance(op, document, boot) {
    const options = {
      chart: { mapping: { x: 'x', value: 'score', group: { field: 'run' }, interval: bounds } },
      results: { mapping: { columns: [{ field: 'run' }, { field: 'score', interval: bounds }] } },
      scenarios: { mapping: { recordKey: 'run', baselineKey: 'base', variantKeys: ['alt', 'other'],
        labels: { base: 'Reference' }, conditions: [{ field: 'device' }],
        outcomes: [{ field: 'score', unit: '%', interval: bounds, pairedDifference: paired }] } }
    };
    boot.optionLayers = (feature) => [options[feature] || {}];
    op.data.define('scores', { type: 'value', value: records });
    for (const [id, tag, mode] of [['chart', 'div', 'scatter'], ['results', 'table', ''], ['scenarios', 'table', '']]) {
      const host = document.createElement(tag);
      host.id = id;
      host.setAttribute('data-op-' + id, mode);
      host.setAttribute('data-op-source', 'scores');
      hosts[id] = document.body.appendChild(host);
    }
    const header = hosts.results.createTHead().insertRow().appendChild(new Node('th'));
    header.setAttribute('data-op-field', 'score');
    header.setAttribute('data-op-threshold', '>= 10');
    header.setAttribute('data-op-best', 'max');
  } });
  const source = op.data.source('scores');
  const chart = op._chart.get('chart');
  const results = () => hosts.results.tBodies[0].rows;
  const outcome = (index) => hosts.scenarios.tBodies[0].rows[1].cells[index];
  const cell = results()[1].cells[1];
  assert.equal(cell.getAttribute('data-op-value'), '20');
  assert.match(cell.textContent, /Outcome bounds \[12, 24\] \(n = 3\)/);
  assert.ok(cell.classList.contains('op-pass'));
  assert.ok(cell.classList.contains('op-best'));
  assert.ok(results()[2].cells[1].classList.contains('op-fail'));
  const sort = hosts.results.tHead.rows[0].cells[1].querySelector('button');
  sort.dispatchEvent(new Event('click'));
  assert.deepEqual(results().map((row) => row.cells[0].textContent), ['alt', 'base', 'other']);
  sort.dispatchEvent(new Event('click'));
  sort.dispatchEvent(new Event('click'));
  assert.match(outcome(3).textContent, /Outcome bounds \[12%, 24%\].*Paired difference vs Reference \(base\) -2%.*Paired bounds \[-5%, 1%\]/);
  assert.equal(op.sequence.get('scenarios').select('other'), true);
  assert.equal(outcome(4).hidden, false);
  assert.doesNotMatch(outcome(4).textContent, /bounds|Paired difference/);
  assert.equal(chart.model().series.find((s) => s.key === 'alt').points[0].interval.upper, 24);
  for (const invalid of [{ hi: null }, { n: -1 }, { reference: 'other' }, { dlo: 4 }]) {
    assert.equal(source.update({ type: 'value', value: [records[0], { ...records[1], ...invalid }, records[2]] }), false);
    assert.equal(source.snapshot().revision, 0);
    assert.equal(results()[1].cells[1], cell);
  }
  assert.equal(source.update({ type: 'value', value: [records[0], { ...records[1], hi: 60 }, records[2]] }), true);
  assert.equal(chart.model().series.find((s) => s.key === 'alt').points[0].interval.upper, 60);
  assert.match(outcome(3).textContent, /Outcome bounds \[12%, 60%\].*Paired bounds \[-5%, 1%\]/);
  assert.equal(op._scenarios.get('scenarios').snapshot().key, 'other');
  assert.equal(source.reset(), true);
  assert.match(results()[1].cells[1].textContent, /Outcome bounds \[12, 24\]/);
});

test('named data updates charts, filtered results and scenarios atomically while local uploads keep ownership', () => {
  const csv = (a = 5) => ({ type: 'csv', text: `run,epoch,ms,loss,device
r01,1,${a},0.7,Laptop
r03,2,9,0.5,GPU
r04,3,7,0.6,Lab` });
  const reordered = { type: 'csv', text: 'device,loss,run,ms,epoch\nLaptop,0.8,r01,6,1\nGPU,0.4,r03,10,2\nLab,0.6,r04,8,3' };
  const options = {
    chart: { mapping: { x: 'epoch', pointKey: 'run', series: [
      { key: 'budget', field: 'derived', label: 'Budget' }, { key: 'duration', field: 'ms', label: 'Latency' }
    ] }, transform: 'budget', y: { type: 'log' }, brush: true },
    results: { mapping: { columns: [{ field: 'run', label: 'Run ID' }, { field: 'ms', label: 'Latency' }] } },
    scenarios: { mapping: { recordKey: 'run', baselineKey: 'r01', variantKeys: ['r03', 'r04'],
      labels: { r03: 'Fast candidate', r04: 'Alternative' },
      conditions: [{ field: 'device' }], outcomes: [{ field: 'ms', label: 'Latency', unit: 'ms' }] } }
  };
  const hosts = {};
  const env = setup({ modules: ['data', 'dropzone', 'results', 'scenarios'], enhance(op, document, boot) {
    boot.optionLayers = (feature) => [options[feature] || {}];
    op.data.defineTransform('budget', ({ value }) => value.map((record) => {
      if (record.device === 'Broken') throw new Error('Rejected device');
      return { ...record, derived: 12 - record.ms };
    }));
    op.data.define('runs', csv());
    function element(tag, id, attrs) {
      const el = document.createElement(tag);
      el.setAttribute('id', id);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute('data-op-' + key, value);
      hosts[id] = document.body.appendChild(el);
      return el;
    }
    element('div', 'plot', { chart: 'line', source: 'runs' });
    const results = element('table', 'results', { results: '', source: 'runs', filters: '',
      chips: 'Budget: ms <= 8' });
    const head = results.createTHead().insertRow();
    for (const field of ['run', 'ms']) {
      const th = head.appendChild(new Node('th'));
      th.setAttribute('data-op-field', field);
      th.textContent = field;
      if (field === 'ms') th.setAttribute('data-op-threshold', '<= 8');
    }
    results.createTBody().insertRow().insertCell().textContent = 'Authored results';
    element('table', 'scenario', { scenarios: 'configurations', source: 'runs' });
    element('div', 'raw', { 'data-view': 'code', source: 'runs', 'max-size': '200' });
    element('div', 'local', { dropzone: '', target: 'plot' });
    for (const id of ['shared-one', 'shared-two']) element('div', id, { dropzone: '', 'target-source': 'runs' });
  } });
  const op = env.OffPrint;
  const source = op.data.source('runs');
  const chart = op._chart.get('plot');
  const results = op._results.get('results');
  const scenario = op._scenarios.get('scenario');
  const raw = op._dataView.get('raw');
  function choose(zone, input, name = 'runs.csv') {
    const field = hosts[zone].querySelector('input');
    field.files = [{ name, text: input.text, size: input.text.length }];
    field.dispatchEvent(new Event('change'));
    return env.reads.pop();
  }
  function reset(zone) { hosts[zone].querySelector('.op-dropzone-reset').dispatchEvent(new Event('click')); }
  const chartY = () => chart.spec().series[0].data[0].y;
  const snapshots = [];
  source.subscribe(({ revision }, { origin }) => snapshots.push([revision, origin, chartY(), results.snapshot().shown,
    scenario.snapshot().key, raw.snapshot().total]));
  assert.equal(chartY(), 7);
  assert.equal(hosts.results.tHead.rows[0].cells[1].textContent.startsWith('Latency'), true);
  assert.equal(op._results.filters(hosts.results).chip('Budget', true), true);
  assert.equal(op.sequence.get('scenario').select('r04'), true);
  assert.equal(chart.setSeriesVisible('duration', false), true);
  assert.equal(chart.setRange([1.25, 2.75]), true);
  assert.equal(source.update(reordered), true);
  assert.deepEqual(snapshots.at(-1), [1, 'api', 6, 2, 'r04', 4]);
  assert.deepEqual([...chart.snapshot().hiddenSeries], ['duration']);
  assert.deepEqual([...chart.snapshot().range], [1.25, 2.75]);
  assert.equal(source.update(reordered), true);
  assert.equal(snapshots.length, 1);
  for (const bad of [
    { type: 'csv', text: 'run,epoch\nr01,1' },
    { type: 'csv', text: reordered.text.replace('Laptop', 'Broken') },
    csv(12), { type: 'csv', text: csv().text + ' '.repeat(200) },
    { type: 'csv', text: 'run,epoch,ms,loss,device\nr01,1,5,0.7,Laptop' }
  ]) {
    assert.equal(source.update(bad), false);
    assert.equal(source.snapshot().revision, 1);
    assert.equal(chartY(), 6);
  }

  choose('local', csv(8))();
  assert.equal(chartY(), 4);
  assert.equal(source.snapshot().revision, 1);
  const older = choose('shared-one', csv(9));
  const newer = choose('shared-two', csv(4));
  newer();
  older();
  assert.deepEqual(snapshots.at(-1), [2, 'drop', 4, 2, 'r04', 4]);
  reset('shared-one');
  assert.equal(source.snapshot().revision, 2);
  reset('local');
  assert.equal(chartY(), 8);
  assert.equal(chart.snapshot().range, null);
  assert.equal(chart.snapshot().hiddenSeries.length, 0);
  reset('shared-two');
  assert.equal(source.snapshot().revision, 3);
  assert.equal(chartY(), 7);

  const pending = choose('shared-one', csv(10));
  assert.equal(source.update(csv(6)), true);
  pending();
  assert.equal(chartY(), 6);
  const superseded = choose('shared-two', csv(10));
  choose('shared-one', csv(), 'notes.txt');
  superseded();
  assert.equal(source.snapshot().revision, 4);
  const canceled = choose('shared-two', csv(10));
  reset('shared-two');
  canceled();
  assert.equal(source.snapshot().revision, 4);
});

test('a shared parameter scope commits filtered charts and results with coordinated replacement and Reset', () => {
  const choices = (...values) => values.map((value) => ({ value, label: value }));
  const row = (run, step, loss, split = 'dev', accepted = true) => ({ run, step, loss, split, accepted, tableRun: run });
  const initial = [row('a', 0, 5), row('a', 4, 6), row('b', 0, 8), row('b', 4, 9),
    row('a', 0, 11, 'test'), row('a', 0, 12, 'test'), row('b', 0, 99, 'dev', 'true')];
  const payload = (value) => ({ type: 'value', value });
  const hosts = {};
  const filter = { scope: 'eval', fields: { runs: 'run', split: 'split' }, where: { accepted: true } };
  const env = setup({ modules: ['params', 'data', 'dropzone', 'results'], enhance(op, document, boot) {
    op._parameters.define('eval', {
      runs: { type: 'multiselect', choices: choices('a', 'b') },
      split: { type: 'select', choices: choices('dev', 'test') }
    });
    op.data.define('runs', payload(initial));
    const options = {
      plot: { filter, brush: true, maxRows: 8, mapping: { x: 'step', value: 'value', group: { field: 'run' } },
        transform: 'observations' },
      results: { filter, mapping: { columns: [{ field: 'tableRun' }, { field: 'loss' }] } },
      fixed: { filter: { where: { accepted: 'true' } }, mapping: { columns: [{ field: 'loss' }] } },
      fixedPlot: { filter: { where: { accepted: 'true' } },
        mapping: { x: 'step', series: [{ key: 'loss', field: 'loss' }] } }
    };
    op.data.defineTransform('observations', ({ value }) => value.map((record) => ({ ...record, value: record.loss })));
    boot.optionLayers = (_, id) => [options[id] || {}];
    function element(tag, id, attrs) {
      const el = document.createElement(tag);
      el.id = id;
      for (const [key, value] of Object.entries(attrs)) el.setAttribute('data-op-' + key, value);
      return hosts[id] = document.body.appendChild(el);
    }
    element('div', 'plot', { chart: 'line', source: 'runs' });
    const table = element('table', 'results', { results: '', source: 'runs', filters: '', heat: '',
      chips: 'Small: loss <= 8' });
    const head = table.createTHead().insertRow();
    for (const field of ['tableRun', 'loss']) {
      const th = head.appendChild(new Node('th'));
      th.setAttribute('data-op-field', field);
      th.textContent = field;
      if (field === 'loss') th.setAttribute('data-op-best', 'max');
    }
    element('table', 'fixed', { results: '', source: 'runs' });
    element('div', 'fixedPlot', { chart: 'line', source: 'runs' });
    element('div', 'local', { dropzone: '', target: 'plot' });
    element('fieldset', 'split', { scope: 'eval', choice: 'split' });
    element('button', 'preset', { scope: 'eval', preset: '{"runs":["b"],"split":"dev"}' });
  } });
  const op = env.OffPrint;
  const scope = op._parameters.scope('eval');
  const source = op.data.source('runs');
  const chart = op._chart.get('plot');
  const results = op._results.get('results');
  const fixed = op._results.get('fixed');
  const table = hosts.results;
  const series = () => Array.from(chart.spec().series, ({ key, data }) => [key, ...Array.from(data, ({ y }) => y)]);
  const rendered = () => table.tBodies[0].rows.filter((tr) => !tr.hidden).map((tr) => tr.cells[1].textContent);
  const state = () => [[...scope.get('runs')], scope.get('split'), series(), rendered(), results.snapshot().shown];
  const observations = [];
  scope.subscribe(() => observations.push(['scope', state()]));
  results.subscribe(() => observations.push(['results', state()]));
  source.subscribe(() => observations.push(['source', state()]));

  assert.deepEqual(series(), [['a', 5, 6], ['b', 8, 9]]);
  assert.equal(fixed.snapshot().shown, 1, 'fixed predicates compare the original scalar type');
  assert.equal(chart.setSeriesVisible('a', false), true);
  assert.equal(chart.setRange([1, 3]), true);
  hosts.plot.querySelector('.op-chart-toggle').dispatchEvent(new Event('click'));
  const localFilters = () => op._results.filters(table);
  localFilters().set('loss', { min: 6 });
  localFilters().chip('Small', true);
  const header = () => table.tHead.rows[0].cells[1];
  header().querySelector('.op-sort').dispatchEvent(new Event('click'));
  observations.length = 0;
  hosts.preset.dispatchEvent(new Event('click'));
  const presetState = [['b'], 'dev', [['b', 8, 9]], ['8'], 1];
  assert.deepEqual(observations, [['results', presetState], ['scope', presetState]]);
  assert.equal(table.tBodies[0].rows[1].cells[1].classList.contains('op-best'), true);
  assert.equal(hosts.preset.getAttribute('aria-current'), 'true');
  assert.equal(header().getAttribute('aria-sort'), 'descending');

  assert.equal(scope.reset(), true);
  assert.equal(chart.visible('a'), false);
  assert.equal(chart.snapshot().table, true);
  assert.deepEqual([...chart.range()], [1, 3]);
  const before = scope.snapshot();
  const noticeCount = observations.length;
  choose(hosts.split, 'test');
  assert.equal(scope.snapshot(), before, 'duplicate x values in the proposed slice reject the whole update');
  assert.deepEqual(chosen(hosts.split), ['dev']);
  assert.equal(observations.length, noticeCount);

  assert.equal(scope.set('runs', []), true);
  assert.deepEqual(series(), []);
  assert.match(hosts.plot.querySelector('.op-chart-table').textContent, /No readings match/);
  assert.match(table.querySelector('.op-filter-empty').textContent, /No rows match/);
  assert.deepEqual([...results.snapshot().chips], ['Small']);
  assert.equal(results.snapshot().filters.loss.min, 6);
  const { tableRun, ...missingColumn } = row('a', 0, 5);
  assert.equal(source.update(payload([missingColumn])), false);
  assert.equal(source.update(payload([{ run: 'a', step: 0, loss: 5, accepted: true }])), false);
  assert.equal(source.update(payload(Array.from({ length: 9 }, (_, i) => row('a', i, i)))), false);
  assert.equal(source.snapshot().revision, 0);

  const replacement = [row('b', 0, 7, 'test'), row('b', 4, 8, 'test'), row('a', 0, 6), row('a', 4, 7)];
  assert.equal(source.update(payload(replacement)), true);
  assert.deepEqual(observations.at(-1), ['source', [[], 'dev', [], [], 0]]);
  assert.match(hosts.fixed.textContent, /No rows match/);
  assert.match(hosts.fixedPlot.querySelector('.op-chart-empty').textContent, /No readings match/);
  assert.equal(scope.update({ runs: ['b'], split: 'test' }), true);
  assert.deepEqual(series(), [['b', 7, 8]]);
  assert.equal(chart.snapshot().table, true);
  assert.deepEqual([...chart.range()], [1, 3]);
  assert.equal(header().getAttribute('aria-sort'), 'descending');
  assert.deepEqual(rendered(), ['8', '7']);

  const local = hosts.local.querySelector('input');
  const text = JSON.stringify([row('a', 0, 15), row('a', 4, 16), row('b', 0, 17, 'test')]);
  local.files = [{ name: 'local.json', text, size: text.length }];
  local.dispatchEvent(new Event('change'));
  env.reads.pop()();
  const records = [row('a', 0, 6), row('b', 0, 8, 'test')];
  assert.equal(results.update(records), true);
  records[0].loss = 99;
  assert.deepEqual(series(), [['b', 17]]);
  assert.equal(scope.reset(), true);
  assert.deepEqual(series(), [['a', 15, 16]]);
  assert.deepEqual(rendered(), ['6']);
  assert.equal(source.reset(), true);
  assert.deepEqual(series(), [['a', 15, 16]]);
  assert.deepEqual(rendered(), ['6']);
  hosts.local.querySelector('.op-dropzone-reset').dispatchEvent(new Event('click'));
  assert.equal(results.reset(), true);
  assert.deepEqual(series(), [['a', 5, 6], ['b', 8, 9]]);

  const override = { series: [{ key: 'override', data: [[0, 25]] }] };
  assert.equal(chart.update(override), true);
  assert.equal(scope.set('runs', ['a']), true);
  assert.equal(source.update(payload(replacement)), true);
  assert.equal(chart.spec().series[0].key, 'override');
  assert.equal(chart.reset(), true);
  assert.deepEqual(series(), [['a', 6, 7]]);
});

test('grouped line charts keep irregular observations, gaps, and colors through source and local file replacement', () => {
  const initial = { type: 'csv', text: 'Step,Loss,Run,ID\n6,4,z,z6\n4,,control,c4\n1,3,control,c1\n1,5,z,z1\n6,2,control,c6\n2,8,a,a2' };
  const replacement = { type: 'csv', text: 'ID,Run,Loss,Step\nz2,z,6,2\nc3,control,4,3\nb1,b,7,1' };
  const host = new Node('div');
  host.id = 'plot';
  host.setAttribute('data-op-chart', 'line');
  host.setAttribute('data-op-source', 'observations');
  host.setAttribute('data-op-gaps', 'break');
  const zone = new Node('div');
  zone.setAttribute('data-op-dropzone', '');
  zone.setAttribute('data-op-target', 'plot');
  zone.setAttribute('data-op-max-rows', '2');
  const env = setup({ modules: ['data', 'dropzone'], enhance(op, document, boot) {
    boot.optionLayers = (feature) => feature === 'chart' ? [{ maxRows: 6, mapping: {
      x: { field: 'Step', label: 'Training step' }, value: 'Loss', pointKey: 'ID',
      group: { field: 'Run', series: [{ key: 'control', label: 'Reference', role: 'baseline' }, { key: 'absent' }] }
    } }] : [];
    op.data.define('observations', initial);
    document.body.appendChild(host);
    document.body.appendChild(zone);
  } });
  const chart = env.chart.get(host);
  const source = env.OffPrint.data.source('observations');
  const series = () => JSON.parse(JSON.stringify(chart.model().series));
  const input = zone.querySelector('input');
  const status = zone.querySelector('.op-dropzone-status');
  function choose(text, name = 'observations.json') {
    input.files = [{ name, text, size: text.length }];
    input.dispatchEvent(new Event('change'));
    env.reads.pop()();
  }
  assert.equal(chart.model().x.label, 'Training step');
  assert.deepEqual(series().map(({ key, name, role }) => [key, name, role]),
    [['control', 'Reference', 'baseline'], ['a', 'a', null], ['z', 'z', null]]);
  assert.deepEqual(series().map(({ points, missing }) => [points.map(({ x, y, key }) => [x, y, key]), missing]),
    [[[[1, 3, 'c1'], [6, 2, 'c6']], [4]], [[[2, 8, 'a2']], []], [[[1, 5, 'z1'], [6, 4, 'z6']], []]]);
  const zColor = series().find(({ key }) => key === 'z').index;
  assert.equal(chart.setSeriesVisible('z', false), true);
  const observed = [];
  source.subscribe(({ revision }) => observed.push([revision, series().map(({ key }) => key)]));
  assert.equal(source.update(replacement), true);
  assert.deepEqual(observed, [[1, ['control', 'b', 'z']]]);
  assert.deepEqual([...chart.snapshot().hiddenSeries], ['z']);
  assert.equal(series().at(-1).index, zColor);

  const local = [{ Step: 10, Loss: 2, Run: 'z', ID: 'z10' }, { Step: 7, Loss: 0, Run: 'a', ID: 'a7' }];
  choose(JSON.stringify(local));
  assert.deepEqual(series().map(({ points }) => points[0].y), [0, 2]);
  assert.equal(series().at(-1).index, zColor);
  assert.equal(source.snapshot().revision, 1);
  choose(JSON.stringify([...local, { Step: 11, Loss: 3, Run: 'z', ID: 'z11' }]));
  assert.match(status.textContent, /2-row limit/);
  choose('Step,Loss,Run,ID\n10,,z,z10\n"10.0",2,z,z11', 'observations.csv');
  assert.match(status.textContent, /Duplicate x 10 for series "z" in records 1 and 2/i);
  assert.deepEqual(series().map(({ points }) => points[0].x), [7, 10]);

  for (const bad of [
    { ...local[0], Step: 'unknown' }, { ...local[0], Step: '1e999' }, { ...local[0], Loss: 'unknown' },
    { ...local[0], Run: 1 }, { ...local[0], ID: '' }, { ...local[0], Loss: undefined }, { ...local[0], run: 'z', Run: undefined }
  ]) {
    assert.equal(source.update({ type: 'json', text: JSON.stringify([bad]) }), false);
    assert.equal(source.snapshot().revision, 1);
  }
  assert.equal(source.update({ type: 'csv', text: 'step,Loss,Run,ID' }), false);
  assert.equal(source.update({ type: 'csv', text: 'Step,Loss,Run,ID\n1,,z,z1\n"01",5,z,z2' }), false);
  assert.equal(source.update({ type: 'value', value: Array.from({ length: 7 }, (_, Step) => ({ ...local[0], Step })) }), false);
  assert.equal(observed.length, 1);
  assert.equal(source.update({ type: 'value', value: [{ ...local[0], Step: 12 }] }), true);
  assert.deepEqual(observed.at(-1), [2, ['a', 'z']], 'source replacement retains the local override');
  zone.querySelector('.op-dropzone-reset').dispatchEvent(new Event('click'));
  assert.deepEqual(series().map(({ key, points }) => [key, points[0].x]), [['z', 12]]);
  assert.equal(series()[0].index, zColor);
  assert.equal(source.reset(), true);
  assert.deepEqual(series().map(({ key }) => key), ['control', 'a', 'z']);
  assert.equal(series().at(-1).index, zColor);
  assert.equal(source.update({ type: 'csv', text: 'Step,Loss,Run,ID' }), true);
  assert.deepEqual(series(), []);
  assert.equal(source.reset(), true);
  assert.equal(series().at(-1).index, zColor);
});

test('grouped scatter charts match exact fields and compare timestamps by instant within each series', () => {
  const host = new Node('div');
  host.id = 'plot';
  host.setAttribute('data-op-chart', 'scatter');
  host.setAttribute('data-op-source', 'observations');
  const utc = { time: '2025-05-01T00:00:00Z', ' score ': 2, run: 'utc' };
  const offset = { time: '2025-05-01T01:00:00+01:00', ' score ': 3, run: 'offset' };
  const env = setup({ modules: ['data'], enhance(op, document, boot) {
    boot.optionLayers = () => [{ x: { type: 'time' }, y: { type: 'log' },
      mapping: { x: 'time', value: ' score ', group: { field: 'run' } } }];
    op.data.define('observations', { type: 'value', value: [utc, offset] });
    document.body.appendChild(host);
  } });
  const chart = env.chart.get(host);
  const source = env.OffPrint.data.source('observations');
  const time = Date.parse(utc.time);
  assert.deepEqual(Array.from(chart.model().series, ({ key, points }) => [key, points[0].x]), [['offset', time], ['utc', time]]);
  for (const bad of [{ ...offset, run: 'utc' }, { ...offset, time: '2025-05-01T00:00:00' }, { ...offset, ' score ': 0 }]) {
    assert.equal(source.update({ type: 'value', value: [utc, bad] }), false);
    assert.equal(source.snapshot().revision, 0);
  }
  assert.match(env.warnings.join('\n'), /Duplicate x .* for series "utc" in records 1 and 2/);
});

test('inline sources preserve raw fallbacks and full chart transforms keep series identity across renaming', () => {
  const host = new Node('div');
  host.setAttribute('data-op-chart', 'line');
  host.setAttribute('data-op-source', 'trace');
  const fallback = host.appendChild(new Node('table'));
  const raw = new Node('pre');
  raw.setAttribute('data-op-source', 'draft');
  raw.setAttribute('data-op-source-type', 'json');
  raw.setAttribute('data-op-data-view', 'code');
  raw.textContent = '{"bad":}';
  const preview = new Node('div');
  preview.setAttribute('data-op-source', 'preview');
  preview.setAttribute('data-op-data-view', 'code');
  preview.setAttribute('data-op-max-size', '8');
  preview.setAttribute('data-op-max-rows', '2');
  const env = setup({ modules: ['data'], enhance(op, document, boot) {
    const inline = new Node('script');
    inline.setAttribute('data-op-source', 'trace');
    inline.setAttribute('type', 'application/json');
    inline.textContent = '{"label":"Before","y":3}';
    [inline, host, raw, preview].forEach((node) => document.body.appendChild(node));
    boot.optionLayers = (feature) => feature === 'chart' ? [{ transform: 'full', transformOutput: 'spec' }] : [];
    boot.readData();
    op.data.define('preview', { type: 'csv', text: 'id,n\na,1\nb,2\nc,3' });
    op.data.defineTransform('full', ({ value }) => ({ series: [
      { key: 'first', name: value.label, data: [[1, value.y]] },
      { key: 'second', name: value.label, data: [[1, 2]] }
    ] }));
  } });
  assert.equal(env.OffPrint.data.source('draft'), null);
  assert.equal(raw.hidden, true);
  assert.match(env.document.body.textContent, /Could not read "draft"/);
  const view = env.OffPrint._dataView.get(preview);
  assert.equal(view.snapshot(), null);
  preview.querySelector('button').dispatchEvent(new Event('click'));
  assert.equal(view.snapshot().shown, 2);
  preview.querySelector('button').dispatchEvent(new Event('click'));
  assert.equal(view.snapshot().shown, 4);
  const api = env.chart.get(host);
  const source = env.OffPrint.data.source('trace');
  assert.equal(api.spec().series[0].name, 'Before');
  assert.equal(fallback.parentNode?.classList.contains('op-chart-table'), true);
  assert.equal(api.setSeriesVisible('first', false), true);
  assert.equal(source.update({ type: 'value', value: { label: 'After', y: 4 } }), true);
  assert.equal(api.spec().series[0].name, 'After');
  assert.deepEqual([...api.snapshot().hiddenSeries], ['first']);
  const copy = api.spec();
  copy.series[0].data[0][1] = 100;
  assert.equal(api.spec().series[0].data[0][1], 4);
});

test('a static results upload resets to the same authored rows, sort and filters', () => {
  const table = new Node('table');
  table.id = 'static';
  table.setAttribute('data-op-results', '');
  table.setAttribute('data-op-filters', '');
  const header = table.createTHead().insertRow();
  header.appendChild(new Node('th')).textContent = 'Run';
  header.appendChild(new Node('th')).textContent = 'Latency';
  const body = table.createTBody();
  for (const [id, ms] of [['first', 4], ['second', 9]]) {
    const row = body.insertRow();
    row.insertCell().textContent = id;
    row.insertCell().textContent = String(ms);
  }
  const zone = new Node('div');
  zone.setAttribute('data-op-dropzone', '');
  zone.setAttribute('data-op-target', table.id);
  const env = setup({ modules: ['data', 'results', 'dropzone'], enhance(op, document) {
    document.body.appendChild(table);
    document.body.appendChild(zone);
  } });
  const results = env.OffPrint._results;
  const run = results.get(table);
  const originalFilter = results.filters(table);
  assert.equal(originalFilter.set('Latency', { max: 5 }), true);
  header.cells[1].querySelector('.op-sort').dispatchEvent(new Event('click'));
  const originalOrder = [...body.rows];
  const text = 'latency,run\n8,replacement\n3,another';
  const input = zone.querySelector('input');
  input.files = [{ name: 'results.csv', text, size: text.length }];
  input.dispatchEvent(new Event('change'));
  env.reads.pop()();
  assert.equal(table.tBodies[0].rows[0].cells[0].textContent, 'replacement');
  assert.equal(run.snapshot().shown, 1);
  zone.querySelector('.op-dropzone-reset').dispatchEvent(new Event('click'));
  assert.equal(table.tBodies[0], body);
  assert.deepEqual(body.rows, originalOrder);
  assert.equal(results.filters(table), originalFilter);
  assert.equal(run.snapshot().shown, 1);
});
