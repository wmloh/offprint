const test = require('node:test');
const assert = require('node:assert/strict');
const { choose, chosen, chartClock, linked } = require('../support/mounted-chart');

const choiceList = (...values) => values.map((value) => ({ value, label: value }));

test('chart bindings apply parameter values through update and roll back values the chart rejects', () => {
  const env = linked({
    animation: chartClock(true).animation,
    define: {
      layout: { type: 'select', choices: choiceList('vertical', 'horizontal') },
      stacking: { type: 'select', choices: choiceList('none', 'stacked', 'percent') },
      cut: { type: 'range', min: -5, max: 10, default: 3 },
      shown: { type: 'multiselect', choices: choiceList('a', 'b') },
      bins: { type: 'range', min: 1, max: 600, step: 1, default: 3 },
      lo: { type: 'range', min: 0, max: 10, default: 0 }
    },
    build: (el) => el('fieldset', 'stacking', { 'data-op-scope': 'look', 'data-op-choice': 'stacking' })
  });
  const { scope, warnings } = env;
  const barSpec = { type: 'bar', referenceLines: [{ axis: 'y', value: 0, label: 'Cut' }], series: [
    { key: 'a', name: 'A', data: [['x', 1], ['y', -2]] }, { key: 'b', name: 'B', data: [['x', 3], ['y', 4]] }] };
  const bars = env.mount('bars', { orientation: 'layout', stack: 'stacking', reference: 'cut', series: 'shown' }, barSpec);
  assert.equal(bars.model().referenceLines[0].value, 3, 'the default value applies before the first drawing');
  assert.equal(bars.spec().referenceLines[0].value, 0, 'spec() keeps the unbound spec');

  assert.equal(scope.set('layout', 'horizontal'), true);
  assert.equal(bars.model().orientation, 'horizontal');
  assert.ok(bars.element.classList.contains('is-horizontal'));
  assert.equal(scope.set('shown', ['b']), true);
  assert.deepEqual([...bars.snapshot().hiddenSeries], ['a']);

  choose(env.nodes.stacking, 'percent');
  assert.equal(scope.get('stacking'), 'none', 'percent bars with a negative value reject the whole update');
  assert.deepEqual(chosen(env.nodes.stacking), ['none'], 'the control shows the kept value');
  assert.ok(!bars.model().stack);
  assert.match(warnings.at(-1), /rejected.*Chart "bars"/);
  assert.equal(scope.update({ stacking: 'stacked', cut: 5 }), true);
  assert.equal(bars.model().stack, 'stacked');
  assert.equal(bars.update({ ...barSpec, title: 'Replaced' }), true);
  assert.equal(bars.model().referenceLines[0].value, 5, 'bound values apply over replacement specs');
  assert.deepEqual([...bars.snapshot().hiddenSeries], ['a'], 'the bound view survives replacement');

  const hist = env.mount('hist', { bins: 'bins' }, { type: 'histogram', data: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(hist.model().histogramEdges.length, 4);
  assert.equal(scope.set('bins', 600), false, 'more than 500 bins is rejected');
  assert.equal(scope.get('bins'), 3);
  assert.equal(scope.set('bins', 5), true);
  assert.equal(hist.model().histogramEdges.length, 6);

  const line = env.mount('line', { range: '[lo, 10]' }, { type: 'line', data: [[0, 1], [10, 2]] });
  assert.equal(line.range(), null, 'a range covering the domain shows everything');
  assert.equal(scope.set('lo', 4), true);
  assert.deepEqual([...line.range()], [4, 10]);
  assert.equal(scope.set('lo', 10), false, 'an empty range is rejected');
  assert.deepEqual([...line.range()], [4, 10]);

  const heat = env.mount('heat', { colorMax: 'cut' }, { type: 'heatmap', z: [[1, 2]] });
  assert.equal(heat.model().heatmap.scale.hi, 5);

  assert.equal(env.mount('missing', { 'reference.2': 'cut' }, barSpec), null);
  assert.match(warnings.at(-1), /reference line 2 is not in the chart spec/);
  assert.ok(env.mount('unknown', { colour: 'cut' }, barSpec), 'an invalid binding leaves the chart drawn');
  assert.match(warnings.at(-1), /Chart binding "colour" needs a known target/);
  env.mount('json', '{bins', barSpec);
  assert.match(warnings.at(-1), /JSON object of targets/);
});

test('show conditions evaluate expressions, values, and choice lists and animate in and out', () => {
  const frames = [];
  const timers = [];
  const env = linked({
    animation: { requestAnimationFrame: (fn) => frames.push(fn), setTimeout: (fn) => timers.push(fn), clearTimeout() {} },
    define: {
      cut: { type: 'range', min: 0, max: 10, default: 3 },
      layout: { type: 'select', choices: choiceList('vertical', 'horizontal') },
      shown: { type: 'multiselect', choices: choiceList('a', 'b') }
    },
    build(el) {
      const scoped = (id, when, value) => el('p', id, { 'data-op-scope': 'look', 'data-op-show-when': when,
        ...(value === undefined ? {} : { 'data-op-show-value': value }) });
      scoped('high', 'cut > 2');
      scoped('wide', 'layout', 'horizontal');
      scoped('withB', 'shown', 'b');
      scoped('any', 'shown');
      scoped('broken', 'missing + 1');
    }
  });
  const { nodes, scope } = env;
  const visible = () => Object.fromEntries(Object.entries(nodes).map(([id, el]) => [id, !el.hidden]));
  assert.deepEqual(visible(), { high: true, wide: false, withB: true, any: true, broken: true });
  assert.match(env.warnings.join('\n'), /Cannot evaluate show condition "missing \+ 1"/);
  assert.ok(nodes.high.classList.contains('op-show-when'));

  assert.equal(scope.update({ cut: 1, layout: 'horizontal', shown: [] }), true);
  assert.ok(nodes.high.classList.contains('op-show-leave'));
  assert.equal(nodes.high.hidden, false, 'a leaving element stays until its fade ends');
  assert.equal(nodes.wide.hidden, false);
  assert.ok(nodes.wide.classList.contains('op-show-enter'));
  timers.splice(0).forEach((fn) => fn());
  frames.splice(0).forEach((fn) => fn());
  frames.splice(0).forEach((fn) => fn());
  assert.deepEqual(visible(), { high: false, wide: true, withB: false, any: false, broken: true });
  assert.ok(!nodes.wide.classList.contains('op-show-enter') && !nodes.high.classList.contains('op-show-leave'));
  assert.equal(scope.set('shown', ['a']), true);
  assert.equal(nodes.any.hidden, false);
  assert.equal(nodes.withB.hidden, true);
});

test('select and multiselect parameters publish and follow keys in a selection group', () => {
  const env = linked({
    groups: { runs: { initial: 'b' } },
    define: {
      run: { type: 'select', choices: choiceList('a', 'b', 'c'), selectionGroup: 'runs' },
      many: { type: 'multiselect', choices: choiceList('a', 'b', 'c'), default: ['a'], selectionGroup: 'picked' },
      quiet: { type: 'select', choices: choiceList('a', 'b'), selectionGroup: 'runs', selectionMode: 'follow' }
    },
    build(el) {
      el('p', 'passive', { 'data-op-selection-group': 'runs', 'data-op-key': 'c' });
      el('fieldset', 'many', { 'data-op-scope': 'look', 'data-op-choice': 'many' });
    }
  });
  const { scope, selection, OffPrint: op } = env;
  const runs = selection.group('runs');
  const picked = selection.group('picked');
  const origins = [];
  env.document.addEventListener('op:parameters:change', ({ detail }) => origins.push(detail.origin));
  assert.equal(scope.get('run'), 'b', 'a configured group key starts the select');
  assert.equal(scope.get('quiet'), 'b');

  assert.equal(scope.set('run', 'c'), true);
  assert.equal(runs.get(), 'c');
  assert.ok(env.nodes.passive.hasAttribute('data-op-selection-active'));
  assert.equal(scope.get('quiet'), 'b', 'a follower ignores keys outside its choices');
  assert.equal(runs.select('a'), true);
  assert.equal(scope.get('run'), 'a');
  assert.equal(scope.get('quiet'), 'a');
  assert.ok(origins.includes('selection'));
  assert.equal(scope.set('quiet', 'b'), true);
  assert.equal(runs.get(), 'a', 'follow mode does not publish');
  runs.clear();
  assert.equal(scope.get('run'), 'a', 'clearing the group keeps the chosen value');

  assert.equal(scope.set('many', ['a', 'b']), true);
  assert.equal(picked.get(), 'b', 'a multiselect publishes the choice just added');
  assert.equal(picked.select('c'), true);
  assert.deepEqual([...scope.get('many')], ['a', 'b', 'c'], 'following a key adds it to the choices');
  assert.equal(scope.set('many', ['a', 'b']), true);
  assert.equal(picked.get(), null, 'removing the shared key clears the group');
  const labels = env.nodes.many.all().filter((node) => node.tag === 'label');
  assert.deepEqual(labels.map((label) => [label.getAttribute('data-op-selection-group'), label.getAttribute('data-op-key')]),
    [['picked', 'a'], ['picked', 'b'], ['picked', 'c']]);
  assert.equal(op._parameters.define('bad', { n: { type: 'range', selectionGroup: 'runs' } }), null);
});
