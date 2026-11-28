const test = require('node:test');
const assert = require('node:assert/strict');
const { entry, element, page } = require('../support/offline-page');

test('the offline entry exposes the extension surface and initializes a custom feature before ready', async () => {
  const p = page({ config: { features: { chart: true, data: true, selection: true } } });
  const phases = [];
  p.OP.setup(OP => {
    phases.push('setup');
    OP.register('test-reading-marker', () => {
      phases.push('initialize');
      p.body.setAttribute('data-reading-marker', OP.util.slug('Reading Ready'));
    });
  });
  p.OP.ready(() => phases.push('ready'));
  await p.start();

  assert.deepEqual(phases, ['setup', 'initialize', 'ready']);
  assert.equal(p.body.getAttribute('data-reading-marker'), 'reading-ready');
  assert.deepEqual(Object.getOwnPropertyNames(p.OP).filter(name => !name.startsWith('_')).sort(), [
    'chart', 'data', 'diagnostics', 'ready', 'register', 'selection', 'sequence', 'setup', 'shortcuts', 'util'
  ]);
  assert.deepEqual(Object.keys(p.OP.chart).sort(), ['addon', 'addons', 'layers', 'legend', 'scale']);
  assert.deepEqual(Object.keys(p.OP.data).sort(), ['define', 'defineTransform', 'names', 'parse', 'source', 'table', 'valueOf']);
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('standalone reading profile applies early theme and renders citations with tooltip cards before ready', async () => {
  const p = page({ cite: true, staticCSS: true, storage: new Error('blocked'), config: {
    options: { theme: { mode: 'dark' }, citations: { entries: { example: 'An example source.' } } }
  } });
  assert.equal(p.html.getAttribute('data-op-theme'), 'dark');
  const order = [];
  let preview;
  p.OP.setup(OP => {
    order.push('setup');
    assert.equal(OP._site.provided, false);
    const attach = OP._tooltips.attach;
    OP._tooltips.attach = (link, title, text, options) => {
      if (link.className === 'op-cite-link') preview = options.content;
      else return attach(link, title, text, options);
    };
    throw new Error('Example callback failure');
  });
  p.OP.setup(() => order.push('next setup'));
  p.OP.ready(OP => {
    order.push('ready');
    assert.equal(p.citation.childNodes[1].textContent, '1');
    assert.equal(preview().textContent, 'An example source.');
    assert.equal(typeof OP._search.open, 'function');
    assert.equal(OP._theme.get(), 'dark');
  });
  await p.start();
  assert.deepEqual(order, ['setup', 'next setup', 'ready']);
  assert.equal(p.loads.filter(path => path.endsWith('/refs.js')).length, 1);
  assert.equal(p.loads.some(path => path.endsWith('.css')), false);
  assert.deepEqual(p.events.map(event => event.detail.code), ['setup-failed']);
  assert.equal(p.OP.setup(() => {}), false);
  p.OP.ready(() => order.push('late ready'));
  assert.equal(order.at(-1), 'ready');
  await Promise.resolve();
  assert.equal(order.at(-1), 'late ready');
});

test('nested none profile clears inherited choices and loads playback after its chart dependency', async () => {
  const p = page({ nested: true, entryProfile: 'reading',
    site: { profile: 'reading', features: { math: true }, pages: ['pages/chapter.html'] },
    lateConfig: { profile: 'none', features: { 'chart-playback': true, cards: true, 'figure-steps': true } }
  });
  await p.start();
  assert.equal(p.OP._site.order[0].href, p.OP._page);
  assert.ok(Object.isFrozen(p.OP._site.order[0]));
  assert.equal(p.html.getAttribute('data-op-theme'), null);
  assert.deepEqual(p.loads, ['offprint/js/core.js', 'offprint/js/reader-state.js', 'offprint/css/tokens.css', 'offprint/css/base.css',
    'offprint/css/text.css', 'offprint/css/sections.css', 'offprint/css/buttons.css', 'offprint/css/choices.css', 'offprint/js/choices.js', 'offprint/css/chart.css', 'offprint/js/chart.js', 'offprint/css/chart-playback.css', 'offprint/js/chart-playback.js',
    'offprint/css/detail.css', 'offprint/js/detail.js', 'offprint/css/steps.css', 'offprint/js/steps.js']);
  assert.equal(typeof p.OP._chartPlayback.mount, 'function');
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('required failures preserve fallbacks and independent features still reach ready', async () => {
  const p = page({ entryProfile: 'none',
    config: { features: { citations: true, tooltips: false, scenarios: true, math: true, chart: true, tabs: true } },
    fail: ['offprint/css/chart.css', 'offprint/js/tabs.js']
  });
  await p.start();
  assert.ok(p.OP._math);
  assert.equal(p.OP._chart, undefined);
  assert.equal(p.loads.includes('offprint/js/refs.js'), false);
  assert.equal(p.loads.includes('offprint/js/scenarios.js'), false);
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => [item.code, item.feature]), [
    ['dependency', 'citations'], ['asset', 'chart'], ['dependency', 'scenarios'], ['asset', 'tabs']
  ]);
});

test('chart setup merges options and an invalid attribute preserves the configured height', async () => {
  const p = page({
    site: { profile: 'none', features: { chart: true }, options: {
      chart: { height: 300, x: { label: 'Samples' }, referenceLines: [{ axis: 'y', value: 2 }] }
    } },
    config: { options: {
      chart: { height: 330, x: { digits: 1 }, referenceLines: [], instances: { trace: { height: 360 } } }
    } }
  });
  const host = element('div');
  host.id = 'trace';
  host.setAttribute('data-op-height', '400px');
  p.OP.setup(OP => {
    const api = OP._chart.mount(host, { data: [2, 3], height: 390 });
    assert.equal(OP._chart.mount(host, { height: 410 }), api);
    assert.equal(api.spec().height, 390);
    assert.equal(api.spec().x.label, 'Samples');
    assert.equal(api.spec().x.digits, 1);
    assert.equal(api.spec().referenceLines.length, 0);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.code), ['chart-option']);
});

test('configured chart motion merges like other chart options and add-on chart types name their loader feature', async () => {
  const p = page({
    site: { profile: 'none', features: { chart: true }, options: { chart: { motion: false } } },
    config: { options: { chart: { instances: { lively: { motion: true }, odd: { motion: 'slow' } } } } }
  });
  const hosts = ['calm', 'lively', 'odd', 'needs'].map(id => Object.assign(element('div'), { id }));
  p.OP.setup(OP => {
    assert.equal(OP._chart.mount(hosts[0], { data: [1, 2] }).model().motion, false);
    assert.equal(OP._chart.mount(hosts[1], { data: [1, 2] }).model().motion, true);
    assert.equal(OP._chart.mount(hosts[2], { data: [1, 2] }).model().motion, false, 'an invalid value keeps the site choice');
    assert.equal(OP._chart.mount(hosts[3], { type: 'histogram', data: [1, 2] }), null);
    assert.equal(OP._boot.chartFeature('heatmap'), 'chart-heatmap');
    assert.equal(OP._boot.chartFeature('line'), null);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.code), ['chart-option']);
});

test('mixed features load all shipped assets and register data before author setup', async () => {
  const features = Object.fromEntries(('animation cards chart code concept-tables data-view dropdowns dropzone editable-text figure-steps ' +
    'glossary math parameters peek-bubbles pipeline quiz results reveals scenarios selection sequence split-views stepper tabs timeline tree tree-diagram zoom-tools')
    .split(' ').map(key => [key, true]));
  const p = page({ nested: true, site: { features, assets: { data: {
    'Reference counts': { source: 'docs/assets/data/feature-groups.csv', output: 'docs/assets/generated/reference-counts.js' }
  } } }, storage: { 'offprint-theme': 'light' }, dark: true });
  assert.equal(p.html.getAttribute('data-op-theme'), 'light');
  p.OP.setup(OP => {
    const snapshot = OP.data.source('Reference counts').snapshot();
    assert.match(snapshot.text, /group,references/);
    assert.equal(snapshot.value[0].group, 'setup');
    assert.equal(OP.data.define('setup-records', { type: 'value', value: [{ id: 'sample' }] }).snapshot().revision, 0);
    assert.equal(OP.data.define('readings', { type: 'csv', text: 'x,y\n1,2' }).snapshot().name, 'readings');
    assert.equal(typeof OP._animation.mount, 'function');
    assert.equal(typeof OP._chart.mount, 'function');
    assert.equal(typeof OP._dropdowns.mount, 'function');
    assert.equal(typeof OP._editableText.mount, 'function');
    assert.equal(typeof OP.sequence.get, 'function');
    assert.equal(typeof OP._sequenceDiagram.get, 'function');
    assert.equal(typeof OP._treeDiagram.get, 'function');
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.message), []);
  assert.equal(p.OP.data.source('readings').snapshot().text, 'x,y\n1,2');
  assert.deepEqual(Array.from(p.OP.data.names()), ['Reference counts', 'setup-records', 'readings']);
  assert.equal(new Set(p.loads).size, p.loads.length);
  assert.ok(!p.loads.some(path => path.includes('export-') || path.includes('page-snapshot')));
  assert.ok(p.loads.includes('offprint/js/scenarios.js'));
  assert.deepEqual(p.loads.filter(path => /^offprint\/js\/(detail|diagram|pipeline|sequence-diagram|timeline|tree-diagram)\.js$/.test(path)), [
    'offprint/js/detail.js', 'offprint/js/diagram.js', 'offprint/js/pipeline.js', 'offprint/js/timeline.js',
    'offprint/js/sequence-diagram.js', 'offprint/js/tree-diagram.js'
  ]);
  for (const css of ['timeline', 'sequence', 'tree-diagram']) assert.ok(p.loads.includes('offprint/css/' + css + '.css'));
  assert.ok(p.loads.includes('offprint/js/zoomtools.js'));
  for (const alias of ['anim', 'bubble', 'dataset', 'nav', 'notes', 'params', 'refs', 'reveal', 'roleCss', 'tooltip', 'zoomtools']) {
    assert.equal(Object.hasOwn(p.OP, alias), false, alias);
  }
});

test('legacy search manifest keys do not load an index', async () => {
  const p = page({ site: { search: 'legacy.js' } });
  await p.start();
  assert.equal(p.OP._site.search, null);
  assert.equal(p.loads.some(asset => asset.endsWith('legacy.js')), false);
});

test('offline parameter scopes merge before setup and publish their first snapshot before ready', async () => {
  const p = page({
    site: { profile: 'none', features: { parameters: true }, parameterScopes: {
      decoder: { temperature: { type: 'range', min: 0.5, max: 2, default: 1 }, flag: { type: 'toggle' } }
    } },
    config: { parameterScopes: { decoder: { temperature: { default: 1.5 } } } }
  });
  const order = [];
  p.OP.setup(OP => {
    const decoder = OP._parameters.scope('decoder');
    order.push('setup');
    assert.deepEqual({ ...decoder.snapshot() }, { temperature: 1.5, flag: false });
    assert.equal(decoder.set('temperature', 0.5), true);
    OP._parameters.define('experiment', { total: { type: 'number', default: 2 } });
    decoder.subscribe((state, meta) => order.push([state.temperature, meta.origin]), { immediate: true });
  });
  p.OP.ready(OP => {
    order.push('ready');
    assert.equal(OP._parameters.scope('experiment').get('total'), 2);
  });
  await p.start();
  assert.deepEqual(order, ['setup', [0.5, 'init'], 'ready']);
  assert.deepEqual(p.events, []);
  assert.equal(p.OP._parameters.scope('decoder').reset(), true);
  assert.equal(p.OP._parameters.scope('decoder').get('temperature'), 1.5);
});

test('selection groups merge across configuration and an authored group is available in setup', async () => {
  const p = page({
    nested: true,
    site: { profile: 'none', features: { selection: true, stepper: true }, selectionGroups: {
      trace: { initial: 'site', persist: true }
    } },
    config: { selectionGroups: { trace: { initial: 'page' } } }
  });
  const list = element('ol');
  list.id = 'trace-list';
  list.setAttribute('data-op-selection-group', 'implicit');
  const step = element('li');
  step.setAttribute('data-op-key', 'first');
  const label = element('strong');
  label.textContent = 'First';
  step.querySelector = selector => selector === ':scope > [data-op-step-label]' ? label : null;
  list.querySelectorAll = selector => selector === ':scope > li' ? [step] : [];
  list.before = () => {};
  p.body.querySelectorAll = selector => selector === 'ol[data-op-stepper]' ? [list] : [];
  p.OP.setup(OP => {
    assert.ok(OP.selection.group('implicit'));
    assert.equal(OP.selection.seed('implicit', 'first'), true);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.message), []);
  assert.equal(p.OP._site.selectionGroups.trace.persist, true);
  assert.equal(p.OP.selection.group('trace').get(), 'page');
  assert.equal(p.OP.sequence.get(list).snapshot().key, 'first');
  const changes = p.events.filter(event => event.type === 'op:selection:change');
  assert.deepEqual(changes.map(event => [event.detail.group, event.detail.current.key]), [
    ['trace', 'page'], ['implicit', 'first']
  ]);
});

test('every catalog feature starts alone because prerequisites are declared before dependents', async () => {
  const catalog = entry.slice(entry.indexOf('var catalog = {'), entry.indexOf('var reading = ['));
  const ids = Array.from(catalog.matchAll(/^ {4}'?([a-z][a-z-]*)'?: \{/gm), (match) => match[1]);
  const chartSpecs = {
    'chart-intervals': { type: 'interval', data: [['A', 3]] },
    'chart-histogram': { type: 'histogram', data: [1, 2] },
    'chart-heatmap': { type: 'heatmap', z: [[1, 2]] }
  };
  for (const id of ['quiz', 'cards', ...Object.keys(chartSpecs)]) assert.ok(ids.includes(id), id);

  for (const id of ids) {
    const p = page({ entryProfile: 'none', config: { features: { [id]: true } } });
    await p.start();
    const reports = Array.from(p.OP.diagnostics.list());
    const failures = reports.filter((item) => item.code === 'dependency' || item.code === 'asset');
    assert.deepEqual(failures.map(item => item.message), [], id);

    const spec = chartSpecs[id];
    if (spec) {
      assert.deepEqual(p.loads.filter(path => path.includes('/chart')), [
        'offprint/css/chart.css', 'offprint/js/chart.js', `offprint/css/${id}.css`, `offprint/js/${id}.js`
      ], id);
      assert.equal(p.OP._boot.chartFeature(spec.type), id);
      assert.equal(p.OP._chart.normalize(spec).addon, spec.type);
      assert.deepEqual(reports.map(item => item.message), [], id);
    }
    if (id === 'quiz') {
      assert.deepEqual(reports.map(item => item.message), [], id);
      for (const feature of ['quiz', 'dropdowns', 'chart', 'cards']) {
        assert.equal(p.OP._boot.enabled(feature), true, feature);
      }
      assert.equal(typeof p.OP.quiz.defineType, 'function');
      assert.equal(typeof p.OP._cards.mount, 'function');
      assert.ok(p.loads.indexOf('offprint/js/steps.js') < p.loads.indexOf('offprint/js/quiz.js'));
    }
  }
});
