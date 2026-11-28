const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, GROUP, KEY, click, brush, linked } = require('../support/mounted-chart');

function guided(reduced = false, author, groups, intervals = false) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const observers = new Map();
  const chartHost = new Node('div');
  chartHost.id = 'trace';
  chartHost.setAttribute('data-op-chart', 'line');
  chartHost.setAttribute('data-op-source', 'readings');
  const host = new Node('ol');
  host.id = 'walkthrough';
  host.setAttribute('data-op-chart-playback', '');
  host.setAttribute('data-op-target', 'trace');
  const events = [];
  host.addEventListener('op:step', ({ detail }) => events.push(detail));
  const data = (end = 10) => ({ type: 'csv', text: intervals ?
    `x,y,key,lo,hi\n0,1,zero,0,2\n2,3,two,1,5\n4,,gap,,\n6,9,six,7,11\n${end},15,last,12,30` :
    `x,y,key\n0,1,zero\n2,3,two\n4,,gap\n6,9,six\n${end},15,last` });
  const env = setup({ groups, modules: ['data', 'chart-playback'], animation: {
    performance: { now: () => now },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe(el) { observers.set(el, this.fn); } }
  }, enhance(op, document, boot) {
    op.data.define('readings', data());
    boot.optionLayers = (feature, id) => {
      if (feature === 'chart') return [{ brush: true, gaps: 'break', selectionGroup: 'trace',
        mapping: { x: 'x', pointKey: 'key', series: [{ field: 'y', key: 'series',
          interval: intervals ? { lower: 'lo', upper: 'hi', label: '90% interval' } : undefined }] } }];
      if (feature === 'chart-playback' && id === host.id) return [{
        target: 'overridden-by-markup', duration: 1000, checkpoints: [
          { key: 'start', x: 0 }, { key: 'gap', x: 4.5, label: 'Between readings' }, { key: 'later', x: 8 }
        ]
      }];
      return [];
    };
    document.body.appendChild(chartHost);
    document.body.appendChild(host);
    if (author) author(host, document, op);
  } });
  const playback = env.OffPrint.sequence.get(host.id);
  const chart = env.chart.get(chartHost);
  const plot = chartHost.querySelector('.op-chart-plot');
  const controls = env.document.body.querySelector('.op-chart-playback-controls');
  function advance(ms) {
    now += ms;
    for (const [id, fn] of [...frames]) if (frames.delete(id)) fn(now);
  }
  function resize(el, width) {
    el.clientWidth = width;
    observers.get(el)();
  }
  return { ...env, host, chartHost, chart, playback, plot, controls, events, frames, advance, data, resize };
}

function positionChart(OffPrint, document, id, group, spec) {
  const host = document.body.appendChild(new Node('div'));
  host.id = id;
  host.setAttribute('data-op-x-group', group);
  const api = OffPrint._chart(host, spec);
  const plot = host.querySelector('.op-chart-plot');
  return { host, api, plot };
}

const cursor = (plot) => plot.querySelector('.op-chart-x-cursor');
const playhead = (plot) => plot.querySelector('.op-chart-playhead');
const display = (el) => el.getAttribute('display');
const firePlot = (plot, type, props) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));

test('x-position groups share keyboard and pointer inspection in data units with independent viewports', () => {
  const { OffPrint, document } = setup();
  const a = positionChart(OffPrint, document, 'a', 'steps', { type: 'line', data: [[0, 1], [4, 2], [10, 3]] });
  const b = positionChart(OffPrint, document, 'b', 'steps',
    { type: 'line', brush: true, data: [[1, 10], [3, 20], [6, 30], [9, 50]] });
  const c = positionChart(OffPrint, document, 'c', 'other', { type: 'scatter', data: [[0, 10], [10, 20]] });
  const group = OffPrint._chart.xGroup('steps');
  const events = [];
  const seen = [];
  group.subscribe((current, meta) => seen.push([current.x, meta.origin, display(cursor(b.plot))]), { immediate: true });
  document.addEventListener('op:chart:x', ({ detail }) => events.push(detail));
  assert.equal(OffPrint._chart.xGroup('unknown'), null);
  assert.equal(group.set('4'), false);
  assert.equal(group.set(Infinity), false);
  assert.equal(b.api.setRange([2, 8]), true);
  firePlot(a.plot, 'keydown', { key: 'Home' });
  firePlot(a.plot, 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(seen, [[null, 'init', 'none'], [0, 'user', 'none'], [4, 'user', 'inline']]);
  assert.equal(events.at(-1).group, 'steps');
  assert.equal(events.at(-1).previous.x, 0);
  assert.match(a.plot.querySelector('.op-chart-tip-head').textContent, /4$/);
  assert.equal(b.plot.querySelector('.op-chart-tip').hidden, true);
  const pixel = +cursor(b.plot).getAttribute('x1');
  assert.notEqual(pixel, +cursor(a.plot).getAttribute('x1'));
  assert.equal(b.api.coords(pixel, 80).x, 4);
  assert.deepEqual([...b.api.range()], [2, 8]);
  assert.equal(display(cursor(c.plot)), 'none');

  firePlot(b.plot, 'pointermove', { clientX: pixel, clientY: 80 });
  assert.equal(group.snapshot().x, 4, 'pointer uses the exact x even between observations');
  assert.equal(events.length, 2, 'same x transfers ownership without an event');
  assert.match(b.plot.querySelector('.op-chart-tip-head').textContent, /3$/, 'the readout shows its actual observation');
  firePlot(a.plot, 'blur');
  assert.equal(group.snapshot().x, 4);
  firePlot(b.plot, 'pointerleave');
  assert.equal(group.snapshot().x, null);
  assert.equal(display(cursor(a.plot)), 'none');

  assert.equal(group.set(7), true);
  assert.equal(b.api.setRange([2, 5]), true);
  assert.equal(display(cursor(b.plot)), 'none');
  assert.equal(group.snapshot().x, 7);
  assert.equal(b.api.setRange(null), true);
  assert.equal(display(cursor(b.plot)), 'inline');
  firePlot(a.plot, 'pointerleave');
  assert.equal(group.snapshot().x, 7, 'local exits preserve a programmatic position');
  assert.equal(OffPrint._chart.xGroup('other').set(5), true);
  assert.equal(group.clear(), true);
  assert.equal(display(cursor(c.plot)), 'inline');
  assert.equal(events.at(-1).origin, 'api');
});

test('one x-group playback clock gates independently sampled charts through source, resize and table redraws', () => {
  let follower;
  const followerSpec = { type: 'line', brush: true, data: [[1, 100], [3, 900], [7, 200], [13, 500]] };
  const env = guided(false, (host, document, OffPrint) => {
    host.removeAttribute('data-op-target');
    host.setAttribute('data-op-x-group', 'steps');
    document.getElementById('trace').setAttribute('data-op-x-group', 'steps');
    follower = positionChart(OffPrint, document, 'score', 'steps', followerSpec);
  });
  const { OffPrint, document, chart, chartHost, plot, playback, advance, frames, data, warnings } = env;
  const other = follower.plot;
  const group = OffPrint._chart.xGroup('steps');
  const visible = (p) => p.querySelectorAll('.op-chart-dot').filter((dot) => display(dot) !== 'none').length;
  assert.equal(playback.position, 0, 'the first chart in document order supplies the domain');
  assert.equal(display(playhead(other)), 'none');
  assert.equal(visible(other), 0);
  assert.equal(follower.api.setRange([2, 9]), true);
  assert.equal(group.set(1), false);
  const seen = [];
  playback.subscribe(({ playing }) => seen.push([playback.position, playing, visible(plot), visible(other)]));
  playback.play();
  assert.equal(frames.size, 1);
  advance(500);
  assert.equal(playback.position, 2.25);
  assert.deepEqual([visible(plot), visible(other)], [2, 0]);
  assert.equal(group.set(2), true);
  assert.equal(group.set(3), false);
  const future = other.querySelectorAll('.op-chart-dot').find((dot) => display(dot) === 'none');
  const point = { clientX: +future.getAttribute('cx'), clientY: +future.getAttribute('cy') };
  assert.equal(follower.api.coords(point.clientX, point.clientY), null);
  firePlot(other, 'pointermove', point);
  assert.equal(group.snapshot().x, 2);

  env.resize(other, 550);
  advance(500);
  assert.deepEqual(seen.at(-1), [4.5, false, 2, 1]);
  assert.equal(other.querySelector('svg').getAttribute('width'), '550');
  firePlot(other, 'keydown', { key: 'End' });
  assert.equal(group.snapshot().x, 3);
  assert.equal(playback.position, 4.5);
  assert.deepEqual([...follower.api.range()], [2, 9]);
  const toggle = follower.host.querySelector('.op-chart-toggle');
  click(toggle);
  const rows = () => follower.host.querySelector('tbody').rows.map((row) => row.firstChild.textContent);
  assert.deepEqual(rows(), ['3']);
  playback.play();
  advance(500);
  assert.equal(playback.position, 6.25);
  assert.equal(follower.api.update(followerSpec), true);
  assert.equal(playback.position, 6.25, 'a compatible follower redraw keeps the current frame');
  assert.deepEqual(rows(), ['3']);
  advance(500);
  assert.deepEqual(rows(), ['3', '7']);
  click(toggle);
  assert.equal(display(playhead(other)), 'inline');
  assert.equal(group.set(7), true);
  const beforeResize = other.querySelector('svg');
  env.resize(other, 0);
  advance(16);
  env.resize(other, 550);
  advance(16);
  assert.notEqual(other.querySelector('svg'), beforeResize);
  assert.equal(display(cursor(other)), 'inline');

  const source = OffPrint.data.source('readings');
  let observed;
  source.subscribe(() => { observed = [playback.position, visible(plot), visible(other)]; });
  playback.play();
  advance(200);
  assert.equal(source.update(data(12)), true);
  assert.deepEqual(observed, [8, 3, 2]);
  assert.equal(frames.size, 0);
  assert.equal(playback.snapshot().key, 'later');
  assert.equal(chart.range(), null);
  assert.deepEqual([...follower.api.range()], [2, 9]);
  const marker = other.querySelector('.op-chart-checkpoint');
  playback.play();
  assert.equal(display(marker), 'none');
  assert.equal(source.update(data(13)), true);
  assert.equal(playback.position, 8);
  assert.equal(display(marker), 'inline', 'same-position reconciliation restores the follower checkpoint marker');
  playback.reset();
  assert.equal(group.snapshot().x, null, 'rewind clears inspection beyond the playhead');
  assert.equal(display(playhead(other)), 'none');
  assert.equal(follower.api.update({ type: 'scatter', data: [[1, 2], [9, 3]] }), true);
  assert.equal(playback.position, null);
  assert.equal(playhead(plot), null);
  assert.equal(follower.api.update(followerSpec), true);
  assert.equal(playback.position, 0);
  assert.ok(warnings.some((warning) => warning.includes('incompatible chart')));

  const competing = document.body.appendChild(new Node('ol'));
  assert.equal(OffPrint._chartPlayback.mount(competing, { xGroup: 'steps' }), null);
  assert.equal(OffPrint._chartPlayback.mount(competing, { target: follower.host.id }), null);
  assert.equal(OffPrint.sequence.get(env.host), playback);
  assert.equal(chartHost.querySelector('.op-chart-playhead'), playhead(plot));
});

test('configured group playback rejects incompatible charts and claims all members together', () => {
  const { OffPrint, document } = setup({ modules: ['chart-playback'], animation: {
    matchMedia: () => ({ matches: true })
  } });
  const spec = { type: 'line', data: [[0, 2], [5, 3]] };
  const a = positionChart(OffPrint, document, 'a', 'steps', spec);
  const b = positionChart(OffPrint, document, 'b', 'steps', { ...spec, type: 'scatter' });
  const host = document.body.appendChild(new Node('ol'));
  const single = document.body.appendChild(new Node('ol'));
  const api = OffPrint._chartPlayback;
  assert.equal(api.mount(host, { xGroup: 'steps' }), null);
  assert.equal(playhead(a.plot), null);
  assert.equal(playhead(b.plot), null);
  assert.equal(b.api.update(spec), true);
  const playback = api.mount(host, { xGroup: 'steps', checkpoints: [{ key: 'middle', x: 2 }] });
  assert.equal(playback.play(), true);
  assert.equal(playback.position, 2);
  assert.equal(display(playhead(a.plot)), 'inline');
  assert.equal(display(playhead(b.plot)), 'inline');
  assert.equal(api.mount(single, { target: b.host.id }), null);
});

test('guided playback reveals exact observations while clipping the same line geometry over time', () => {
  const { chart, chartHost, playback, plot, controls, events, frames, advance, OffPrint, host } = guided();
  const shape = () => ({ ...playback.snapshot() });
  const keys = () => plot.all().filter((el) => el.hasAttribute(KEY)).map((el) => el.getAttribute(KEY));
  const button = (label) => controls.children.find((el) => el.getAttribute('aria-label') === label);
  const fire = (type, props) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
  const line = plot.querySelector('.op-chart-line');
  const clip = plot.all().find((el) => el.tag === 'clipPath').firstChild;
  const playhead = plot.querySelector('.op-chart-playhead');
  const ticks = plot.querySelectorAll('.op-chart-tick');
  assert.equal(OffPrint._chartPlayback.mount(host), playback);
  assert.deepEqual(shape(), { key: 'start', index: 0, count: 3, canPrev: false, canNext: true, playing: false });
  assert.equal(events[0].origin, 'init');
  assert.deepEqual({ ...events[0] }, { key: 'start', index: 0, origin: 'init' });
  assert.deepEqual(controls.children.map((el) => el.getAttribute('aria-label')),
    ['Reset', 'Previous checkpoint', null, 'Play to the next checkpoint', 'Next checkpoint']);
  assert.equal(button('Previous checkpoint').getAttribute('aria-disabled'), 'true');
  assert.deepEqual(keys(), ['zero']);
  assert.equal(+clip.getAttribute('width'), 0);
  assert.equal(line.getAttribute('d').match(/M/g).length, 2);

  const toggle = button('Play to the next checkpoint');
  toggle.dispatchEvent(new Event('click'));
  assert.equal(events.at(-1).origin, 'user');
  assert.equal(toggle.getAttribute('aria-label'), 'Pause', 'the same button pauses while playing');
  assert.equal(button('Next checkpoint').getAttribute('aria-disabled'), 'false');
  assert.equal(playback.play(), true);
  assert.equal(frames.size, 1);
  advance(500);
  assert.equal(playback.position, 2.25);
  assert.deepEqual(keys(), ['zero', 'two']);
  assert.equal(clip.getAttribute('width'), String(+playhead.getAttribute('x1') - +clip.getAttribute('x')));
  assert.equal(plot.querySelector('.op-chart-line'), line);
  assert.deepEqual(plot.querySelectorAll('.op-chart-tick'), ticks);

  const future = plot.querySelectorAll('.op-chart-dot').find((el) => el.getAttribute('display') === 'none');
  const position = { clientX: +future.getAttribute('cx'), clientY: +future.getAttribute('cy') };
  assert.equal(chart.coords(position.clientX, position.clientY), null);
  fire('pointermove', position);
  assert.equal(plot.querySelector('.op-chart-tip').hidden, true);
  fire('keydown', { key: 'End' });
  assert.equal(plot.querySelector('.op-chart-tip-head').textContent, 'x 2');
  fire('keydown', { key: 'Enter' });
  assert.equal(OffPrint.selection.group('trace').get(), 'two');

  toggle.dispatchEvent(new Event('click'));
  advance(5000);
  assert.equal(playback.position, 2.25);
  assert.equal(toggle.getAttribute('aria-label'), 'Play to the next checkpoint');
  button('Next checkpoint').dispatchEvent(new Event('click'));
  assert.equal(frames.size, 0, 'Next finishes the paused leg without animating');
  assert.deepEqual(shape(), { key: 'gap', index: 1, count: 3, canPrev: true, canNext: true, playing: false });
  assert.equal(controls.children[2].textContent, 'Between readings');
  assert.deepEqual(keys(), ['zero', 'two']);

  const table = chartHost.querySelector('.op-chart-table');
  const tableToggle = chartHost.querySelector('.op-chart-toggle');
  tableToggle.dispatchEvent(new Event('click'));
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4']);
  playback.play();
  advance(5000);
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4', '6']);
  tableToggle.dispatchEvent(new Event('click'));
  assert.equal(chart.setRange([1, 7]), true);
  assert.deepEqual([...chart.range()], [1, 7]);
  assert.equal(plot.querySelector('.op-chart-playhead').getAttribute('display'), 'none');
  playback.prev();
  assert.equal(playback.position, 4.5);
  assert.deepEqual([...chart.range()], [1, 7]);
  playback.reset();
  assert.equal(shape().key, 'start');
  assert.deepEqual(keys(), []);
});

test('reduced motion reaches each stop immediately and chart replacement reconciles the last reached key', () => {
  const { chart, playback, controls, chartHost, OffPrint, frames, events, data, warnings } = guided(true);
  const source = OffPrint.data.source('readings');
  assert.equal(playback.select('unknown'), false);
  assert.equal(playback.play(), true);
  assert.equal(playback.snapshot().key, 'gap');
  assert.equal(playback.play(), true);
  assert.equal(playback.snapshot().key, 'later');
  assert.equal(playback.play(), true);
  assert.equal(playback.snapshot().canNext, false);
  assert.equal(playback.snapshot().key, null);
  assert.equal(playback.play(), false);
  assert.equal(events.length, 4);
  assert.equal(frames.size, 0);
  for (const label of ['Play to the next checkpoint', 'Next checkpoint']) {
    assert.equal(controls.children.find((el) => el.getAttribute('aria-label') === label).getAttribute('aria-disabled'), 'true');
  }
  playback.prev();
  const reached = playback.snapshot();
  playback.play();
  assert.equal(source.update(data(11)), true);
  assert.deepEqual(playback.snapshot(), reached);
  assert.equal(source.update({ type: 'csv', text: 'bad,y\n12,3' }), false);
  assert.deepEqual(playback.snapshot(), reached);
  assert.equal(source.update(data(7)), true);
  assert.equal(playback.position, null);
  assert.equal(events.at(-1).origin, 'source');
  assert.equal(playback.play(), false);
  assert.match(warnings.at(-1), /Checkpoint "later"/);
  assert.equal(chartHost.querySelector('.op-chart-playhead'), null);
  assert.equal(source.update(data(12)), true);
  assert.deepEqual(playback.snapshot(), reached);
  assert.ok(chartHost.querySelector('.op-chart-playhead'));
  assert.equal(chart.reset(), true);
  assert.deepEqual(playback.snapshot(), reached);
});

test('replacement during a leg cancels its clock before source subscribers see the restored chart', () => {
  const { playback, OffPrint, data, frames, advance, events } = guided();
  const source = OffPrint.data.source('readings');
  playback.select('gap');
  playback.play();
  advance(500);
  assert.equal(playback.position, 6.25);
  let duringSource;
  source.subscribe(() => { duringSource = playback.snapshot(); });
  assert.equal(source.update(data(12)), true);
  assert.equal(duringSource.key, 'gap');
  assert.equal(duringSource.playing, false);
  assert.equal(events.at(-1).origin, 'source');
  assert.equal(frames.size, 0);
  advance(5000);
  assert.equal(playback.snapshot().key, 'gap');
});

test('invalid targets and checkpoints preserve authored content and leave the chart available', () => {
  const { OffPrint, document, warnings } = setup({ modules: ['chart-playback'] });
  const host = document.body.appendChild(new Node('ol'));
  const note = host.appendChild(new Node('li'));
  note.setAttribute(KEY, 'finish');
  note.setAttribute('data-op-x', '5');
  note.textContent = 'Static walkthrough';
  const chart = document.body.appendChild(new Node('div'));
  chart.id = 'manual';
  OffPrint._chart(chart, { type: 'scatter', data: [[0, 1], [5, 3]] });
  const api = OffPrint._chartPlayback;
  assert.equal(api.mount(host, { target: chart.id }), null);
  OffPrint._chart(chart, { type: 'line', data: [[0, 1], [5, 3]] });
  const competitor = document.body.appendChild(new Node('ol'));
  assert.equal(api.mount(competitor, { target: chart.id, checkpoints: [{ key: 'duplicate', x: 1 }, { key: 'duplicate', x: 2 }] }), null);
  assert.equal(document.querySelectorAll('.op-chart-playback-controls').length, 0);
  assert.equal(host.textContent, 'Static walkthrough');
  assert.ok(warnings.some((warning) => warning.includes('no playable numeric line range')));
  assert.ok(warnings.some((warning) => warning.includes('Invalid checkpoint "duplicate"')));
  note.setAttribute('data-op-x', '5 steps');
  assert.equal(api.mount(host, { target: chart.id, checkpoints: [{ key: 'valid', x: 5 }] }), null);
  assert.equal(note.hidden, false);
  note.setAttribute('data-op-x', '5');
  const playback = api.mount(host, { target: chart.id });
  assert.equal(playback.select('finish'), true);
  assert.equal(playback.snapshot().key, 'finish');
  assert.equal(playback.snapshot().canNext, false);
  assert.equal(api.mount(competitor, { target: chart.id }), null);
  assert.equal(OffPrint.sequence.get(host), playback);
});

function checkpointItem(host, key, x, label) {
  const item = host.appendChild(new Node('li'));
  item.setAttribute(KEY, key);
  item.setAttribute('data-op-x', x);
  const title = item.appendChild(new Node('strong'));
  title.setAttribute('data-op-step-label', '');
  title.textContent = label;
  item.appendChild(new Node('p')).textContent = 'Notes for ' + key;
  return item;
}

test('authored checkpoints reveal HTML and an off-sample marker and link to a companion button', () => {
  let start, gap, finish, companion, detail;
  const { playback, chart, document, controls, selection, events, sets, plot, OffPrint, data, advance } =
    guided(false, (host, doc) => {
      host.setAttribute(GROUP, 'checkpoints');
      host.setAttribute('data-op-selection-seed', '');
      start = checkpointItem(host, 'opening', 0, 'Opening');
      gap = checkpointItem(host, 'schedule', 4.5, 'Schedule change');
      finish = checkpointItem(host, 'final', 10, 'Final checkpoint');
      detail = doc.body.appendChild(new Node('aside'));
      detail.id = 'schedule-note';
      detail.appendChild(new Node('em')).textContent = 'The schedule changed here.';
      gap.setAttribute('data-op-detail', detail.id);
      companion = doc.body.appendChild(new Node('button'));
      companion.setAttribute(GROUP, 'checkpoints');
      companion.setAttribute(KEY, 'schedule');
      assert.deepEqual(host.children.map((item) => item.hidden), [false, false, false]);
    });
  const group = selection.group('checkpoints');
  assert.equal(group.get(), 'opening');
  assert.equal(start.getAttribute('aria-current'), 'step');
  assert.equal(gap.hidden, true);
  assert.equal(detail.hidden, true);
  assert.equal(controls.children[2].getAttribute('role'), 'status');
  playback.play();
  advance(500);
  assert.equal(gap.hidden, true);
  assert.equal(plot.querySelector('.op-chart-checkpoint').getAttribute('display'), 'none');
  const click = new Event('click');
  Object.defineProperties(click, { target: { value: companion }, button: { value: 0 } });
  document.dispatchEvent(click);
  assert.equal(playback.snapshot().playing, false);
  assert.equal(playback.position, 4.5);
  assert.equal(events.at(-1).origin, 'group');
  assert.deepEqual(sets, [['checkpoints', 'schedule']]);
  assert.equal(companion.getAttribute('aria-pressed'), 'true');
  assert.equal(gap.getAttribute('aria-current'), 'step');
  assert.equal(start.hidden, true);
  assert.equal(detail.hidden, false);
  assert.equal(detail.firstChild.tag, 'em');
  assert.equal(controls.children[2].textContent, 'Schedule change');
  const marker = plot.querySelector('.op-chart-checkpoint');
  assert.equal(marker.getAttribute('display'), 'inline');
  assert.equal(marker.getAttribute('cx'), plot.querySelector('.op-chart-playhead').getAttribute('x1'));
  assert.equal(plot.querySelectorAll('.op-chart-line')[0].getAttribute('d').match(/M/g).length, 2);
  const table = chart.element.querySelector('.op-chart-table');
  const toggle = chart.element.querySelector('.op-chart-toggle');
  toggle.dispatchEvent(new Event('click'));
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4']);
  toggle.dispatchEvent(new Event('click'));
  group.clear();
  group.select('unknown');
  assert.equal(playback.snapshot().key, 'schedule');
  playback.play();
  advance(1000);
  assert.equal(playback.snapshot().canNext, false);
  assert.equal(group.get(), 'final');
  assert.equal(finish.getAttribute('aria-current'), 'step');
  const source = OffPrint.data.source('readings');
  assert.equal(source.update(data(7)), true);
  assert.deepEqual([start, gap, finish, detail].map((item) => item.hidden), [false, false, false, false]);
  assert.equal(finish.getAttribute('aria-current'), null);
  assert.equal(source.reset(), true);
  assert.equal(finish.getAttribute('aria-current'), 'step');
  playback.reset();
  assert.equal(group.get(), 'opening');
});

test('configured note references validate before enhancement and cannot be claimed twice', () => {
  const { OffPrint, document, warnings } = setup({ modules: ['chart-playback'] });
  const host = document.body.appendChild(new Node('ol'));
  const chart = document.body.appendChild(new Node('div'));
  chart.id = 'manual';
  OffPrint._chart(chart, { type: 'line', data: [[0, 2], [2, 4], [8, 8]] });
  const note = document.body.appendChild(new Node('aside'));
  note.id = 'note';
  note.textContent = 'Static note';
  const mount = (target, detailId, playbackHost = host) => OffPrint._chartPlayback.mount(playbackHost, {
    target, checkpoints: [{ key: 'schedule', x: 4.5, label: 'Schedule change', detail: detailId }]
  });
  assert.equal(mount(chart.id, 'missing'), null);
  const duplicate = document.body.appendChild(new Node('div'));
  duplicate.id = note.id;
  assert.equal(mount(chart.id, note.id), null);
  duplicate.remove();
  assert.equal(mount(chart.id, chart.id), null);
  assert.equal(note.hidden, false);
  assert.equal(chart.querySelector('.op-chart-playhead'), null);
  assert.ok(warnings.some((warning) => warning.includes('Invalid detail reference "missing"')));
  const playback = mount(chart.id, note.id);
  assert.equal(note.hidden, true);
  playback.select('schedule');
  assert.equal(note.hidden, false);
  const other = document.body.appendChild(new Node('div'));
  other.id = 'other';
  OffPrint._chart(other, { type: 'line', data: [[0, 2], [3, 4], [8, 8]] });
  const otherHost = document.body.appendChild(new Node('ol'));
  assert.equal(mount(other.id, note.id, otherHost), null);
  assert.equal(note.hidden, false);
  assert.equal(other.querySelector('.op-chart-playhead'), null);
  const otherNote = document.body.appendChild(new Node('aside'));
  otherNote.id = 'other-note';
  const otherPlayback = mount(other.id, otherNote.id, otherHost);
  otherPlayback.select('schedule');
  assert.equal(otherPlayback.position, 4.5);
  assert.equal(otherNote.hidden, false);
  assert.equal(other.querySelector('.op-chart-checkpoint').getAttribute('display'), 'inline');
});

test('publish-only and follow-only modes respect a configured startup selection', () => {
  for (const mode of ['publish', 'follow']) {
    const { playback, selection } = guided(true, (host) => {
      host.setAttribute(GROUP, 'checkpoints');
      host.setAttribute('data-op-selection-mode', mode);
      checkpointItem(host, 'start', 0, 'Start');
      checkpointItem(host, 'off-sample', 4.5, 'Midpoint');
    }, { checkpoints: { initial: 'off-sample' } });
    const group = selection.group('checkpoints');
    assert.equal(group.get(), 'off-sample');
    assert.equal(playback.snapshot().key, mode === 'publish' ? 'start' : 'off-sample');
    playback.reset();
    assert.equal(group.get(), mode === 'publish' ? 'start' : 'off-sample');
    group.clear();
    group.select('off-sample');
    assert.equal(playback.snapshot().key, mode === 'publish' ? 'start' : 'off-sample');
  }
});

test('line intervals split at chart gaps and advance within the playback and brush clips', () => {
  const { chart, chartHost, plot, playback, advance } = guided(false, undefined, undefined, true);
  const band = plot.querySelector('.op-chart-band-interval');
  const bandClip = () => plot.all().find((el) => el.tag === 'clipPath' && el.id.endsWith('-band')).firstChild;
  assert.equal(band.getAttribute('d').match(/M/g).length, 2);
  assert.equal(+bandClip().getAttribute('width'), 0);
  assert.ok(plot.querySelectorAll('.op-chart-tick').some((tick) => tick.textContent === '30'));
  const fire = (key) => plot.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
  fire('End');
  assert.match(plot.querySelector('.op-chart-tip').textContent, /90% interval \[0, 2\]/);
  playback.play();
  advance(500);
  assert.ok(+bandClip().getAttribute('width') > 0);
  assert.equal(plot.querySelector('.op-chart-band-interval'), band);
  fire('End');
  assert.match(plot.querySelector('.op-chart-tip').textContent, /90% interval \[1, 5\]/);
  assert.equal(chart.setRange([1, 7]), true);
  const clip = bandClip();
  const playhead = plot.querySelector('.op-chart-playhead');
  assert.equal(+clip.getAttribute('width'), +playhead.getAttribute('x1') - +clip.getAttribute('x'));
  chartHost.querySelector('.op-chart-toggle').dispatchEvent(new Event('click'));
  const table = chartHost.querySelector('.op-chart-table');
  assert.match(table.textContent, /90% interval \[1, 5\]/);
  assert.doesNotMatch(table.textContent, /\[7, 11\]|\[12, 30\]/);
  playback.select('later');
  assert.match(table.textContent, /90% interval \[7, 11\]/);
  assert.doesNotMatch(table.textContent, /\[12, 30\]/);
});

function stateClock(reduced = false) {
  const frames = new Map();
  let id = 0;
  let now = 0;
  return {
    frames,
    animation: {
      performance: { now: () => now },
      matchMedia: () => ({ matches: reduced }),
      requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
      cancelAnimationFrame(i) { frames.delete(i); }
    },
    advance(ms) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(now));
    }
  };
}

function statePlayback(env, id, target, checkpoints, attrs = {}) {
  const host = env.document.body.appendChild(new Node('ol'));
  host.id = id;
  host.setAttribute('data-op-chart-playback', 'state');
  host.setAttribute('data-op-target', target);
  host.setAttribute('data-op-scope', 'look');
  for (const [name, value] of Object.entries(attrs)) host.setAttribute(name, value);
  return { host, playback: env.OffPrint._chartPlayback.mount(host, checkpoints && { checkpoints }) };
}

test('state checkpoints carry series, selection, and parameters forward, tween on Play, and step back exactly', () => {
  const clock = stateClock();
  const env = linked({ animation: clock.animation, modules: ['chart-playback'],
    define: { cut: { type: 'range', min: 0, max: 10, default: 1 } } });
  const bars = env.mount('bars', { reference: 'cut' }, { type: 'bar', toggles: true, selectionGroup: 'picks',
    referenceLines: [{ axis: 'y', value: 0 }], series: [
      { key: 'a', name: 'A', data: [{ x: 'x', y: 1, key: 'ax' }, { x: 'y', y: 2, key: 'ay' }] },
      { key: 'b', name: 'B', data: [{ x: 'x', y: 3, key: 'bx' }, { x: 'y', y: 4, key: 'by' }] }] });
  const { playback } = statePlayback(env, 'tour', 'bars', [
    { key: 'focus', label: 'Only B', series: ['b'], params: { cut: 4 } },
    { key: 'pick', select: 'bx' },
    { key: 'all', series: null, select: null }
  ]);
  const picks = env.selection.group('picks');
  const status = env.document.body.querySelector('.op-pill-count');
  const barCount = () => bars.element.all().filter((el) => el.classList.contains('op-chart-bar')).length;
  assert.deepEqual({ ...playback.snapshot() }, { key: null, index: null, count: 3, canPrev: false, canNext: true, playing: false });

  assert.equal(playback.play(), true);
  assert.equal(playback.snapshot().playing, true);
  assert.equal(status.textContent, 'Playing to Only B');
  assert.equal(bars.visible('a'), false, 'the target state applies as the leg starts');
  assert.equal(env.scope.get('cut'), 4);
  assert.equal(bars.model().referenceLines[0].value, 4, 'bound parameters update the chart');
  assert.equal(barCount(), 4, 'departing bars fade out instead of vanishing');
  clock.advance(0);
  clock.advance(500);
  assert.equal(playback.snapshot().playing, true);
  assert.equal(barCount(), 4, 'a played leg tweens over its whole duration');
  clock.advance(400);
  assert.equal(playback.snapshot().key, 'focus');
  assert.equal(playback.snapshot().playing, false);
  assert.equal(barCount(), 2);

  assert.equal(playback.next(), true);
  assert.equal(status.textContent, 'Checkpoint 2');
  assert.equal(picks.get(), 'bx');
  assert.equal(bars.visible('a'), false, 'unchanged series carry forward');
  assert.equal(playback.next(), true);
  assert.equal(playback.snapshot().canNext, false);
  assert.equal(bars.visible('a'), true);
  assert.equal(picks.get(), null);
  assert.equal(env.scope.get('cut'), 4);

  assert.equal(playback.prev(), true);
  assert.equal(playback.snapshot().key, 'pick');
  assert.equal(bars.visible('a'), false, 'Previous restores the earlier state exactly');
  assert.equal(picks.get(), 'bx');
  assert.equal(playback.select('focus'), true);
  assert.equal(picks.get(), null, 'the selection the start had returns before the first select');
  assert.equal(env.scope.set('cut', 7), true);
  assert.equal(playback.reset(), true);
  assert.equal(bars.visible('a'), true);
  assert.equal(env.scope.get('cut'), 1, 'Reset restores the values captured at mount');
  assert.equal(playback.snapshot().key, null);
});

test('state checkpoints validate against the chart and restore the last reached state after data replacement', () => {
  const clock = stateClock();
  const env = linked({ animation: clock.animation, modules: ['chart-playback'],
    define: { bins: { type: 'range', min: 1, max: 20, step: 1, default: 4 } } });
  const { warnings } = env;
  const spec = (extra = []) => ({ type: 'histogram', toggles: true, brush: true, series: [
    { key: 'm', name: 'M', data: [0, 1, 2, 3, 4, 5, 6, 7, 8, ...extra] }, { key: 'n', name: 'N', data: [1, 2, 3] }] });
  const hist = env.mount('hist', { bins: 'bins' }, spec());
  env.mount('trend', {}, { type: 'line', data: [[0, 1], [1, 2]] });
  const rejects = (checkpoints, pattern, attrs) => {
    assert.equal(statePlayback(env, 'bad' + warnings.length, 'hist', checkpoints, attrs).playback, null);
    assert.match(warnings.at(-1), pattern);
  };
  rejects([{ key: 'k', x: 3, series: ['m'] }], /Invalid checkpoint "k"/);
  rejects([{ key: 'k' }, { key: 'k' }], /Invalid checkpoint "k"/);
  rejects([{ key: 'k', range: [1] }], /Invalid checkpoint "k"/);
  rejects([{ key: 'k', series: ['zzz'] }], /Checkpoint "k" does not fit the chart/);
  rejects([{ key: 'k', select: 'bin:0:2' }], /own selection group/);
  rejects([{ key: 'k', params: { nope: 1 } }], /Unknown checkpoint parameter "nope"/);
  rejects([], /no checkpoints/);
  rejects([{ key: 'k' }], /Unknown playback mode "steps"/, { 'data-op-chart-playback': 'steps' });
  assert.equal(statePlayback(env, 'line-state', 'trend', [{ key: 'k' }]).playback, null);
  assert.match(warnings.at(-1), /non-line chart/);

  const markup = env.document.body.appendChild(new Node('ol'));
  markup.id = 'markup';
  markup.setAttribute('data-op-chart-playback', 'state');
  markup.setAttribute('data-op-target', 'hist');
  markup.setAttribute('data-op-scope', 'look');
  const item = (key, state) => {
    const li = markup.appendChild(new Node('li'));
    li.setAttribute('data-op-key', key);
    li.setAttribute('data-op-state', state);
    return li;
  };
  const zoom = item('zoom', '{"range": [2, 6], "params": {"bins": 8}}');
  const broken = item('one', '{series: m}');
  assert.equal(env.OffPrint._chartPlayback.mount(markup), null);
  assert.match(warnings.at(-1), /Invalid checkpoint "one"/);
  broken.setAttribute('data-op-state', '{"series": ["m"]}');
  const playback = env.OffPrint._chartPlayback.mount(markup);
  assert.ok(playback, 'failed mounts leave the chart free for a valid controller');
  assert.equal(zoom.hidden, true, 'notes show only at their checkpoint');

  assert.equal(playback.next(), true);
  assert.equal(zoom.hidden, false);
  assert.deepEqual([...hist.range()], [2, 6]);
  assert.equal(hist.model().histogramEdges.length, 9);
  hist.range([3, 5]);
  hist.visible('n', false);
  assert.equal(hist.update(spec([9])), true);
  assert.deepEqual([...hist.range()], [2, 6], 'replacement restores the reached range');
  assert.equal(hist.visible('n'), true, 'and the series the reached state shows');
  assert.equal(playback.snapshot().key, 'zoom');

  assert.deepEqual([zoom, broken].map((li) => li.getAttribute('value')), ['1', '2'], 'notes keep their numbers');
  assert.equal(playback.play(), true);
  assert.deepEqual([zoom.hidden, broken.hidden], [false, true], 'the departing note holds during the leg');
  assert.equal(hist.visible('n'), false);
  hist.visible('n', true);
  assert.equal(hist.update(spec([10])), true);
  assert.equal(playback.snapshot().playing, true, 'a leg keeps playing through replacement');
  assert.equal(hist.visible('n'), false, 'with the state it is heading to');
  clock.advance(0);
  clock.advance(900);
  assert.equal(playback.snapshot().key, 'one');
  assert.equal(playback.snapshot().canNext, false);
  assert.deepEqual([zoom.hidden, broken.hidden], [true, false]);
});
