const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, shared, GROUP, KEY, click } = require('../support/mounted-chart');

test('a chart, stepper and passive markup follow the same seeded group without bridges', () => {
  let chartHost, list, row, companion;
  const { selection } = setup({
    groups: { trace: { initial: 'b1' } },
    enhance(OP, document, boot) {
      const add = (parent, tag, attrs = {}, value = '') => {
        const el = parent.appendChild(new Node(tag));
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        el.textContent = value;
        return el;
      };
      chartHost = add(document.body, 'div', { 'data-op-chart': '' });
      add(chartHost, 'script', { type: 'application/json' }, JSON.stringify(shared));
      list = add(document.body, 'ol', { 'data-op-stepper': '', [GROUP]: 'trace' });
      list.id = 'timeline';
      for (const key of ['a1', 'b1', 'a2']) {
        add(add(list, 'li', { [KEY]: key }), 'strong', { 'data-op-step-label': '' }, key);
      }
      row = add(document.body, 'p', { [GROUP]: 'trace', [KEY]: 'b1' });
      companion = add(document.body, 'p', { 'data-op-stepper-view': 'timeline', [KEY]: 'a2' });
      boot.prepareSelection();
      const commits = [];
      document.addEventListener('op:selection:change', ({ detail }) => {
        const key = detail.current.key;
        const step = OP.sequence.get(list).snapshot().key;
        commits.push(key);
        assert.equal(step, key === null || key === 'unmatched' ? 'a2' : key);
        assert.equal(row.hasAttribute('data-op-selection-active'), key === 'b1');
        const active = chartHost.all().filter(el => el.hasAttribute('data-op-selection-active'));
        assert.equal(active.length > 0, key !== null && key !== 'unmatched');
      });
      list.commits = commits;
    }
  });
  const group = selection.group('trace');
  assert.deepEqual(list.commits, ['b1']);
  assert.equal(list.children[1].getAttribute('aria-current'), 'step');
  assert.equal(companion.hasAttribute('hidden'), true);
  const plot = chartHost.all().find(el => el.classList.contains('op-chart-plot'));
  const point = chartHost.all().find(el => el.tag === 'circle' && el.getAttribute(KEY) === 'a1');
  const click = Object.assign(new Event('click', { cancelable: true }), {
    button: 0, clientX: Number(point.getAttribute('cx')), clientY: Number(point.getAttribute('cy'))
  });
  plot.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(group.get(), 'a1');
  assert.equal(list.children[0].getAttribute('aria-current'), 'step');
  const next = list.parentNode.children.find(el => el.classList.contains('op-stepper-controls')).children[3];
  next.dispatchEvent(new Event('click'));
  next.dispatchEvent(new Event('click'));
  assert.equal(group.get(), 'a2');
  assert.equal(companion.hasAttribute('hidden'), false);
  group.clear();
  group.select('unmatched');
  assert.deepEqual(list.commits, ['b1', 'a1', 'b1', 'a2', null, 'unmatched']);
});

test('tabs synchronize different labels and orders by key, with local follow-only Reset', () => {
  let tabs, first, second;
  const { selection } = setup({
    groups: { languages: { initial: 'js' } },
    enhance(OP, document) {
      tabs = OP._tabs;
      const tabSet = (labels, follow = false) => {
        const host = document.body.appendChild(new Node('div'));
        host.setAttribute('data-op-tabs', '');
        host.setAttribute(GROUP, 'languages');
        if (follow) host.setAttribute('data-op-selection-mode', 'follow');
        labels.forEach(([key, label]) => {
          const panel = host.appendChild(new Node('div'));
          panel.setAttribute(KEY, key);
          panel.setAttribute('data-op-tab', label);
        });
        return host;
      };
      first = tabSet([['python', 'Python'], ['js', 'JavaScript']]);
      second = tabSet([['js', 'JS'], ['python', 'Python 3']], true);
      OP._all = (selector, scope = document.body) => {
        if (selector === '.op-tabs, [data-op-tabs]') return [first, second];
        return scope.querySelectorAll(selector);
      };
    }
  });
  const group = selection.group('languages');
  const left = tabs.get(first);
  const right = tabs.get(second);
  assert.equal(left.snapshot().index, 1);
  assert.equal(right.snapshot().index, 0);
  left.select('python');
  assert.equal(group.get(), 'python');
  assert.equal(right.snapshot().index, 1);
  right.reset();
  assert.equal(right.snapshot().key, 'js');
  assert.equal(group.get(), 'python');
  group.clear();
  assert.equal(left.snapshot().key, 'python');
  assert.equal(right.snapshot().key, 'js');
});

test('all six sequence members share navigation, events, and bidirectional keyed selection', () => {
  const keys = ['start', 'middle', 'end'];
  const hosts = new Map();
  const events = new Map();
  const blocks = [];
  const timed = new Set(['animation', 'chart', 'pipeline']);
  const intervals = new Map();
  const pendingFrames = new Map();
  let serial = 0;
  const { OffPrint, selection } = setup({
    modules: ['detail', 'steps', 'anim', 'diagram', 'pipeline', 'chart-playback', 'scenarios'],
    groups: { tour: { initial: 'middle' } },
    animation: {
      addEventListener() {}, clearTimeout() {},
      setInterval(fn) { intervals.set(++serial, fn); return serial; },
      clearInterval(id) { intervals.delete(id); },
      requestAnimationFrame(fn) { pendingFrames.set(++serial, fn); return serial; },
      cancelAnimationFrame(id) { pendingFrames.delete(id); },
      matchMedia: () => ({ matches: true })
    },
    enhance(op, document, boot) {
      document.readyState = 'complete';
      function add(parent, tag, attrs = {}, text = '') {
        const node = parent.appendChild(new Node(tag));
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
        node.textContent = text;
        return node;
      }
      function member(name, tag, attrs) {
        const host = add(document.body, tag, { id: name, [GROUP]: 'tour', ...attrs });
        hosts.set(name, host);
        events.set(name, []);
        host.addEventListener('op:step', event => {
          assert.equal(event.bubbles, true);
          events.get(name).push({ ...event.detail });
        });
        return host;
      }
      function item(parent, tag, key, labelTag = 'span') {
        const node = add(parent, tag, { [KEY]: key });
        add(node, labelTag, { 'data-op-step-label': '' }, key);
        if (key === 'start') node.setAttribute('data-op-initial', '');
        return node;
      }

      const stepper = member('stepper', 'ol', { 'data-op-stepper': '' });
      keys.forEach(key => item(stepper, 'li', key));
      const figure = member('figure', 'div', { class: 'op-figure-steps' });
      add(figure, 'figure');
      const panel = add(figure, 'div', { class: 'op-step-panel' });
      keys.forEach(key => item(panel, 'button', key));
      const animation = member('animation', 'figure', {});
      add(animation, 'svg');
      boot.prepareSelection();
      boot.setupComplete = false;
      op._animation.mount(animation, { steps: keys.slice(1).map(key => ({ key, actions: [] })) });
      boot.setupComplete = true;

      const chart = add(document.body, 'div', { id: 'chart-target', 'data-op-chart': 'line' });
      add(chart, 'script', { type: 'application/json' }, JSON.stringify({ type: 'line', data: [[0, 1], [2, 3]] }));
      const tour = member('chart', 'ol', { 'data-op-chart-playback': '', 'data-op-target': chart.id });
      keys.forEach((key, index) => item(tour, 'li', key).setAttribute('data-op-x', String(index)));

      const pipeline = member('pipeline', 'figure', { class: 'op-pipeline' });
      const stages = add(pipeline, 'ol', { 'data-op-pipeline-steps': '' });
      const flow = add(pipeline, 'ol', { class: 'op-pipe-blocks' });
      keys.forEach((key) => {
        item(stages, 'li', key);
        blocks.push(add(flow, 'li', { id: 'block-' + key, class: 'op-pipe-block', 'data-op-reveal-step': key }));
      });

      const scenarios = member('scenarios', 'table', { 'data-op-scenarios': '' });
      const header = scenarios.createTHead().insertRow();
      add(header, 'th', {}, 'Measure');
      add(header, 'th', {}, 'Unit');
      add(header, 'th', { [KEY]: 'baseline' }, 'Baseline');
      keys.forEach(key => item(header, 'th', key));
      const body = scenarios.createTBody();
      const condition = body.insertRow();
      condition.setAttribute('data-op-condition', '');
      const outcome = body.insertRow();
      ['Setting', '', '0', '1', '2', '3'].forEach((text, i) => add(condition, i ? 'td' : 'th', {}, text));
      ['Score', '', '1', '2', '3', '4'].forEach((text, i) => add(outcome, i ? 'td' : 'th', {}, text));
    }
  });
  const group = selection.group('tour');
  function check(name, index, origin) {
    const controller = OffPrint.sequence.get(hosts.get(name));
    assert.equal(OffPrint.sequence.get(name), controller);
    assert.equal(controller.key, keys[index], name);
    assert.equal(controller.index, index);
    assert.deepEqual([...controller.keys], keys);
    assert.ok(Object.isFrozen(controller.keys));
    const snapshot = controller.snapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.deepEqual({ ...snapshot }, {
      key: keys[index], index, count: 3, canPrev: index > 0, canNext: index < 2,
      ...(timed.has(name) ? { playing: false } : {})
    }, name);
    assert.deepEqual(events.get(name).at(-1), { key: keys[index], index, origin }, name);
    assert.equal(typeof controller.play, timed.has(name) ? 'function' : 'undefined');
    assert.equal(typeof controller.pause, timed.has(name) ? 'function' : 'undefined');
    return controller;
  }

  for (const name of hosts.keys()) check(name, 1, 'init');
  assert.deepEqual(blocks.map(block => block.hasAttribute('data-op-pipe-hidden')), [false, false, true]);
  for (const name of hosts.keys()) {
    const controller = OffPrint.sequence.get(name);
    const seen = [];
    const stop = controller.subscribe((state, meta) => seen.push([state.key, meta.origin]), { immediate: true });
    assert.equal(controller.select('missing'), false);
    assert.equal(controller.select('end'), true);
    assert.equal(controller.next(), false);
    assert.equal(group.get(), 'end');
    for (const peer of hosts.keys()) check(peer, 2, peer === name ? 'api' : 'group');
    assert.ok(blocks.every(block => !block.hasAttribute('data-op-pipe-hidden')));
    assert.equal(controller.reset(), true);
    assert.equal(controller.prev(), false);
    assert.equal(group.get(), 'start');
    for (const peer of hosts.keys()) check(peer, 0, peer === name ? 'reset' : 'group');
    stop();
    assert.equal(group.select('middle'), true);
    for (const peer of hosts.keys()) check(peer, 1, 'group');
    assert.deepEqual(seen, [['middle', 'init'], ['end', 'api'], ['start', 'reset']], name);
  }

  const pipeline = OffPrint._pipeline.get('pipeline').steps;
  assert.equal(pipeline, OffPrint.sequence.get('pipeline'));
  assert.equal(pipeline.play(), true);
  assert.equal(pipeline.snapshot().playing, true);
  intervals.values().next().value();
  assert.equal(group.get(), 'end');
  assert.deepEqual(events.get('pipeline').at(-1), { key: 'end', index: 2, origin: 'playback' });
  assert.equal(pipeline.pause(), true);
  assert.equal(pipeline.snapshot().playing, false);
  assert.equal(intervals.size, 0);

  const animation = OffPrint.sequence.get('animation');
  group.select('middle');
  assert.equal(animation.play(), true);
  assert.equal(animation.snapshot().playing, true);
  assert.equal(pendingFrames.size, 1);
  assert.equal(animation.pause(), true);
  assert.equal(animation.snapshot().playing, false);
  assert.equal(pendingFrames.size, 0);
  assert.deepEqual(events.get('animation').at(-1), { key: 'middle', index: 1, origin: 'group' });

});
