const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = (name) => fs.readFileSync(path.join(__dirname, '../docform/js', name + '.js'), 'utf8');
const GROUP = 'data-df-selection-group';
const KEY = 'data-df-key';

// Just enough DOM for chart.js to build, draw, and handle events.
class Node extends EventTarget {
  constructor(tag) {
    super();
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = { setProperty() {} };
    this.text = '';
    this.hidden = false;
    this.nodeType = 1;
    this.clientWidth = 400;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    const node = this;
    this.classList = {
      add: (...names) => names.forEach((n) => node.classes().add(n) && node.saveClasses()),
      remove: (...names) => names.forEach((n) => node.classes().delete(n) && node.saveClasses()),
      toggle: (n, on) => (on ?? !node.classList.contains(n)) ? node.classList.add(n) : node.classList.remove(n),
      contains: (n) => node.classes().has(n)
    };
  }
  classes() { return this._classes || (this._classes = new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean))); }
  saveClasses() { this.attributes.set('class', [...this._classes].join(' ')); return true; }
  set className(v) { this.setAttribute('class', v); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.text = String(v); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this._classes = null; }
  removeAttribute(name) { this.attributes.delete(name); }
  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(i < 0 ? this.children.length : i, 0, child);
    child.parentNode = this;
    return child;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  replaceChild(child, old) { this.insertBefore(child, old); this.removeChild(old); }
  before(child) { this.parentNode.insertBefore(child, this); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, on) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
  matches(selector) { return selector === `[${GROUP}][${KEY}]` && this.hasAttribute(GROUP) && this.hasAttribute(KEY); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const direct = selector.startsWith(':scope > ');
    const simple = direct ? selector.slice(9) : selector;
    return (direct ? this.children : this.all()).filter((node) => {
      if (simple === `[${GROUP}][${KEY}]`) return node.matches(simple);
      if (simple === `[data-df-stepper-view][${KEY}]`) return node.hasAttribute('data-df-stepper-view') && node.hasAttribute(KEY);
      if (simple.startsWith('.')) return node.classList.contains(simple.slice(1));
      const part = /^([a-z]+)?(?:\[([\w-]+)(?:="([^"]+)")?\])?$/.exec(simple);
      if (!part) return false;
      const [, tag, attr, value] = part;
      return (!tag || node.tag === tag) && (!attr || node.hasAttribute(attr) &&
        (value === undefined || node.getAttribute(attr) === value));
    });
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400 }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

function setup({ groups, enhance } = {}) {
  const document = new EventTarget();
  document.body = new Node('body');
  document.createElement = (tag) => new Node(tag);
  document.createElementNS = (_, tag) => new Node(tag);
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  document.getElementById = (id) => document.body.all().find((el) => el.id === id) ?? null;
  const sets = [];
  const warnings = [];
  document.addEventListener('df:selection:change', ({ detail }) => {
    if (detail.origin !== 'init') sets.push([detail.group, detail.current.key]);
  });
  const boot = { canInitialize: () => true, optionLayers: () => [], merge: Object.assign, report: (_, feature, host, message) => warnings.push(message),
    moduleFailed: (_, error) => { throw error; } };
  const DocForm = { _boot: boot, site: { base: 'file:///site.js', selectionGroups: groups } };
  const context = vm.createContext({ DocForm, document, CustomEvent, console: { warn: (message) => warnings.push(message.replace(/^\[docform\] /, '')) },
    MutationObserver: class { observe() {} } });
  context.window = context;
  for (const name of ['core', 'highlight', 'chart', 'stepper', 'tabs']) vm.runInContext(script(name), context);
  if (enhance) enhance(DocForm, document, boot);
  boot.initialize();
  return { chart: DocForm.chart, selection: DocForm.selection, sets, warnings, document };
}

function draw(spec) {
  const env = setup();
  const host = new Node('div');
  env.document.body.appendChild(host);
  const api = env.chart(host, spec);
  const plot = host.all().find((el) => el.classList.contains('df-chart-plot'));
  const marks = () => host.all().filter((el) => el.getAttribute(KEY) !== null && el.tag !== 'td' && el.tag !== 'tr');
  const mark = (key) => marks().find((el) => el.getAttribute(KEY) === key);
  const tip = () => host.all().find((el) => el.classList.contains('df-chart-tip'));
  const fire = (type, props) => {
    const event = new Event(type, { cancelable: true });
    plot.dispatchEvent(Object.assign(event, props));
    return event;
  };
  const point = (el, type) => fire(type, { button: 0, clientX: +el.getAttribute('cx'), clientY: +el.getAttribute('cy') });
  return Object.assign(env, { host, api, plot, marks, mark, tip, fire, point });
}

const shared = {
  type: 'line',
  selectionGroup: 'trace',
  series: [
    { name: 'A', data: [{ x: 1, y: 2, key: 'a1' }, { x: 2, y: 3, key: 'a2' }] },
    { name: 'B', data: [{ x: 1, y: 8, key: 'b1' }, { x: 2, y: 9, key: 'b2' }, [3, 7]] }
  ]
};

test('a click commits the keyed point nearest the pointer, even where series share an x, and a second click clears it', () => {
  const c = draw(shared);
  assert.deepEqual(c.marks().map((el) => [el.getAttribute(GROUP), el.getAttribute(KEY)]),
    [['trace', 'a1'], ['trace', 'a2'], ['trace', 'b1'], ['trace', 'b2']]);
  c.point(c.mark('b1'), 'pointermove');
  assert.equal(c.selection.group('trace').get(), null, 'hovering only previews');
  assert.equal(c.point(c.mark('b1'), 'click').defaultPrevented, true, 'a handled click leaves a zoomable figure alone');
  assert.equal(c.selection.group('trace').get(), 'b1');
  assert.match(c.tip().textContent, /Selected/);
  c.point(c.mark('a1'), 'click');
  assert.equal(c.selection.group('trace').get(), 'a1');
  c.point(c.mark('a1'), 'click');
  assert.equal(c.selection.group('trace').get(), null);
  assert.doesNotMatch(c.tip().textContent, /Selected/);
});

test('arrow keys visit each reading at a shared x and Enter or Space toggles its key', () => {
  const c = draw(shared);
  const key = (k, extra) => c.fire('keydown', Object.assign({ key: k }, extra));
  assert.equal(key('Enter').defaultPrevented, false, 'nothing is read yet');
  key('Home');
  key('ArrowRight');
  assert.equal(key('Enter').defaultPrevented, true);
  assert.equal(c.selection.group('trace').get(), 'a1', 'readings at x = 1 run from the top of the plot down');
  key('Enter', { repeat: true });
  assert.equal(c.selection.group('trace').get(), 'a1');
  key(' ');
  assert.equal(c.selection.group('trace').get(), null);
  key('End');
  assert.equal(key('Enter').defaultPrevented, false, 'an unkeyed point has nothing to select');
  assert.deepEqual(c.sets, [['trace', 'a1'], ['trace', null]]);
});

test('outside selections refresh the readout, and keys survive redraws, gaps in the data, and the table view', () => {
  const c = draw(shared);
  c.fire('keydown', { key: 'End' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.selection.group('trace').select('b2');
  assert.match(c.tip().textContent, /Selected/);

  const without = JSON.parse(JSON.stringify(shared));
  without.series[1].data.splice(1, 1);
  c.api.update(without);
  assert.equal(c.mark('b2'), undefined);
  c.api.update(shared);
  assert.equal(c.selection.group('trace').get(), 'b2', 'the selection is kept by key while its point is absent');
  assert.equal(c.mark('b2').getAttribute(GROUP), 'trace');

  c.host.all().find((el) => el.classList.contains('df-chart-toggle')).dispatchEvent(new Event('click'));
  const cells = c.host.all().filter((el) => el.tag === 'td' && el.getAttribute(KEY));
  assert.deepEqual(cells.map((el) => el.getAttribute(KEY)), ['a1', 'b1', 'a2', 'b2']);
  assert.ok(cells.every((el) => el.getAttribute(GROUP) === 'trace'));
});

test('bars and scatter points are keyed, and charts without a group keep one readout per x and ignore clicks', () => {
  const bars = draw({ type: 'bar', selectionGroup: 'g', series: [{ data: [{ x: 'a', y: 1, key: 'k1' }] }, { data: [{ x: 'a', y: 2, key: 'k2' }] }] });
  assert.deepEqual(bars.marks().map((el) => el.tag + ':' + el.getAttribute(KEY)), ['path:k1', 'path:k2']);
  const dots = draw({ type: 'scatter', selectionGroup: 'g', series: [{ data: [{ x: 1, y: 1, key: 'p' }] }] });
  dots.point(dots.mark('p'), 'click');
  assert.equal(dots.selection.group('g').get(), 'p');

  const legacy = draw(Object.assign({}, shared, { selectionGroup: undefined }));
  assert.equal(legacy.marks().length, 0);
  const dot = legacy.host.all().find((el) => el.classList.contains('df-chart-dot'));
  assert.equal(legacy.point(dot, 'click').defaultPrevented, false);
  assert.deepEqual(legacy.sets, []);
  legacy.fire('keydown', { key: 'Home' });
  legacy.fire('keydown', { key: 'ArrowRight' });
  assert.match(legacy.tip().textContent, /^2/, 'the second readout is the next x, not the other series');
});

test('table keys become point keys and the nearest spot prefers the closest reading at a shared x', () => {
  const { chart } = setup();
  const spec = chart.fromTable([['t', 'q', 'r'], ['1', '4', '5'], ['2', '6', '']], 'line', [[null, null, null], [null, 'q1', null], [null, null, 'r2']]);
  assert.deepEqual(JSON.parse(JSON.stringify(spec.series.map((s) => s.data))), [[{ x: '1', y: '4', key: 'q1' }, ['2', '6']], [['1', '5'], { x: '2', y: '', key: 'r2' }]]);
  const model = chart.normalize(Object.assign(spec, { selectionGroup: 'h' }));
  assert.deepEqual(JSON.parse(JSON.stringify(model.series.map((s) => s.points.map((p) => p.key)))), [['q1', null], [null]]);
  const spots = [{ px: 0, py: 10 }, { px: 0, py: 50 }, { px: 30, py: 20 }];
  assert.equal(chart.closest(spots, 2, 45), 1);
  assert.equal(chart.closest(spots, 25, 0), 2);
});

test('a time axis draws UTC ticks and a zoned title, and readouts and the table use the same timestamps', () => {
  const c = draw({
    type: 'line',
    gaps: 'break',
    x: { type: 'time', label: 'Arrival' },
    series: [{ name: 'Rows', data: [['2026-11-16T17:02:00-05:00', 14], ['2026-11-17T00:40:00Z', null], ['2026-11-17T01:10:00Z', 9]] }]
  });
  const texts = (cls) => c.host.all().filter((el) => el.classList.contains(cls)).map((el) => el.textContent);
  assert.ok(texts('df-chart-tick').includes('Nov 17'));
  assert.ok(texts('df-chart-label').includes('Arrival (UTC)'));
  assert.match(c.plot.getAttribute('aria-label'), /Times are in UTC/);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^Arrival 2026-11-16 22:02 UTC14/);
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /^Arrival 2026-11-17 00:40 UTCNo data/);
  c.host.all().find((el) => el.classList.contains('df-chart-toggle')).dispatchEvent(new Event('click'));
  const heads = c.host.all().filter((el) => el.tag === 'th').map((el) => el.textContent);
  assert.deepEqual(heads, ['Arrival', 'Rows', '2026-11-16 22:02 UTC', '2026-11-17 00:40 UTC', '2026-11-17 01:10 UTC']);
});

test('log axes draw decade ticks and original readouts; invalid data is not drawn and an invalid update keeps the chart', () => {
  const sweep = {
    type: 'line',
    x: { type: 'log', label: 'Learning rate' },
    y: { type: 'log', label: 'Loss' },
    referenceLines: [{ axis: 'y', value: 1.79, label: 'Uniform guess' }],
    series: [{ name: 'Validation', data: [[1e-5, 1.73], [1e-4, 0.95], [1e-3, 0.61], [1e-2, 2.9]] }]
  };
  const c = draw(sweep);
  const texts = (cls) => c.host.all().filter((el) => el.classList.contains(cls)).map((el) => el.textContent);
  assert.deepEqual(texts('df-chart-tick').slice(-4), ['0.00001', '0.0001', '0.001', '0.01']);
  const dots = c.host.all().filter((el) => el.classList.contains('df-chart-dot')).map((el) => +el.getAttribute('cx'));
  assert.ok(Math.abs((dots[1] - dots[0]) - (dots[3] - dots[2])) < 1e-6, 'decades are evenly spaced');
  assert.deepEqual(texts('df-chart-ref-label'), ['Uniform guess']);
  assert.match(c.plot.getAttribute('aria-label'), /x and y axes use a log scale/);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^Learning rate 0\.000011\.73/);

  const svgBefore = c.host.all().find((el) => el.tag === 'svg');
  assert.equal(c.api.update(Object.assign({}, sweep, { series: [{ data: [[1e-5, 0]] }] })), false);
  assert.equal(c.host.all().find((el) => el.tag === 'svg'), svgBefore, 'the last valid chart stays');
  assert.equal(c.api.model().series[0].points.length, 4);
  assert.match(c.warnings.pop(), /^Chart update ignored.*log y axis needs positive values/);

  const env = setup();
  const host = new Node('div');
  const fallback = host.appendChild(new Node('table'));
  assert.equal(env.chart(host, Object.assign({}, sweep, { y: { type: 'log', min: 0 } })), null);
  assert.deepEqual(host.children, [fallback], 'the authored content stays as it was');
  assert.equal(host.classList.contains('df-chart'), false);
  assert.match(env.warnings.pop(), /^Chart not drawn.*min must be a positive number/);
});

const byClass = (c, cls) => c.host.all().filter((el) => el.classList.contains(cls));
const legendButton = (c, name) => byClass(c, 'df-chart-series-toggle').find((el) => el.textContent === name);
const dotsOf = (c) => byClass(c, 'df-chart-dot');
const click = (el) => el.dispatchEvent(new Event('click'));

test('legend buttons hide series from the plot, readout, and table; rescale is opt-in; all hidden shows a message', () => {
  const spec = {
    type: 'line',
    series: [{ name: 'Low', data: [[1, 1], [2, 2]] }, { name: 'High', data: [[1, 50], [2, 90]] }, { name: 'Mid', data: [[1, 5]] }]
  };
  const c = draw(spec);
  const views = [];
  c.host.addEventListener('df:chartview', (event) => views.push(event.detail));
  const low = () => dotsOf(c)[0].getAttribute('cy');
  const before = low();
  click(legendButton(c, 'High'));
  assert.equal(legendButton(c, 'High').getAttribute('aria-pressed'), 'false');
  assert.ok(legendButton(c, 'High').classList.contains('is-off'));
  assert.equal(dotsOf(c).length, 3, 'only Low and Mid are drawn');
  assert.equal(low(), before, 'the y axis stays put without rescale');
  c.fire('keydown', { key: 'Home' });
  assert.doesNotMatch(c.tip().textContent, /High/);
  assert.deepEqual(JSON.parse(JSON.stringify(views)), [{ hidden: ['High'], range: null }]);
  assert.equal(c.api.visible('High'), false);

  click(byClass(c, 'df-chart-toggle')[0]);
  assert.deepEqual(c.host.all().filter((el) => el.tag === 'th').map((el) => el.textContent).slice(0, 3), ['', 'Low', 'Mid']);
  click(byClass(c, 'df-chart-toggle')[0]);

  const fitted = draw(Object.assign({ rescale: true }, spec));
  const fittedLow = () => dotsOf(fitted)[0].getAttribute('cy');
  const wide = fittedLow();
  fitted.api.visible('High', false);
  assert.notEqual(fittedLow(), wide, 'rescale fits the y axis to the series shown');

  c.api.visible('Low', false);
  c.api.visible('Mid', false);
  const empty = byClass(c, 'df-chart-empty')[0];
  assert.equal(empty.hidden, false);
  assert.match(empty.textContent, /Every series is hidden/);
  assert.equal(c.fire('keydown', { key: 'Home' }).defaultPrevented, false, 'nothing to read');
  click(legendButton(c, 'Mid'));
  assert.equal(empty.hidden, true);
  assert.equal(dotsOf(c).length, 1);
  assert.equal(c.api.visible('Nope', false), false);
});

const hour = 36e5;
const t0 = Date.UTC(2026, 10, 10);
const telemetry = {
  type: 'line',
  brush: true,
  gaps: 'break',
  selectionGroup: 'ops',
  x: { type: 'time' },
  referenceLines: [{ axis: 'x', value: t0 + 5 * hour, label: 'Deploy' }],
  series: [
    { name: 'A', data: [[t0, 1], [t0 + hour, 2], [t0 + 2 * hour, null], [t0 + 3 * hour, 4], { x: t0 + 4 * hour, y: 3, key: 'spike' }, [t0 + 5 * hour, 2]] },
    { name: 'B', data: [[t0, 5], [t0 + 5 * hour, 6]] }
  ]
};

function brush(c, fromEl, toEl) {
  const at = (el, type) => c.fire(type, { button: 0, pointerId: 1, clientX: +el.getAttribute('cx'), clientY: +el.getAttribute('cy') });
  at(fromEl, 'pointerdown');
  at(toEl, 'pointermove');
  at(toEl, 'pointerup');
  return at(toEl, 'click');
}

test('dragging narrows a time axis, readouts and the table follow, and Reset restores the full range', () => {
  const c = draw(telemetry);
  const dots = dotsOf(c);
  assert.equal(brush(c, dots[1], dots[3]).defaultPrevented, true, 'the click ending a drag is swallowed');
  const range = c.api.range();
  assert.ok(Math.abs(range[0] - (t0 + hour)) < 1 && Math.abs(range[1] - (t0 + 4 * hour)) < 1);
  assert.equal(c.selection.group('ops').get(), null, 'a drag selects nothing');
  assert.equal(byClass(c, 'df-chart-reset')[0].hidden, false);
  assert.match(byClass(c, 'df-chart-range')[0].textContent, /^Time 2026-11-10 01:00 – 2026-11-10 04:00 UTC$/);
  assert.equal(byClass(c, 'df-chart-ref-note')[0].textContent, 'outside range');
  assert.ok(c.host.all().some((el) => el.tag === 'clipPath'));

  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /01:00 UTC2A/, 'B has no reading inside the range');
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /02:00 UTCNo data/);

  click(byClass(c, 'df-chart-toggle')[0]);
  const rows = c.host.all().filter((el) => el.tag === 'th' && el.getAttribute('scope') === 'row').map((el) => el.textContent);
  assert.deepEqual(rows, ['2026-11-10 01:00 UTC', '2026-11-10 02:00 UTC', '2026-11-10 03:00 UTC', '2026-11-10 04:00 UTC']);
  click(byClass(c, 'df-chart-toggle')[0]);

  click(byClass(c, 'df-chart-reset')[0]);
  assert.equal(c.api.range(), null);
  assert.equal(byClass(c, 'df-chart-reset')[0].hidden, true);
  assert.equal(byClass(c, 'df-chart-ref-note')[0].textContent, '');

  const tiny = dotsOf(c)[0];
  c.fire('pointerdown', { button: 0, clientX: +tiny.getAttribute('cx') + 10, clientY: +tiny.getAttribute('cy') });
  c.fire('pointermove', { clientX: +tiny.getAttribute('cx') + 12, clientY: 0 });
  c.fire('pointerup', {});
  assert.equal(c.api.range(), null, 'a short movement is a click, not a brush');
});

test('plus, minus, and Shift with the arrows narrow, widen, and move the range from the keyboard', () => {
  const c = draw(telemetry);
  const key = (k, extra) => c.fire('keydown', Object.assign({ key: k }, extra));
  key('Home');
  assert.equal(key('+').defaultPrevented, true);
  assert.deepEqual([...c.api.range()], [t0, t0 + 2.5 * hour], 'narrowed around the reading at the start');
  assert.match(c.tip().textContent, /00:00 UTC/, 'the readout stays on the same time');
  key('ArrowRight', { shiftKey: true });
  const moved = c.api.range();
  assert.ok(Math.abs(moved[0] - (t0 + 0.625 * hour)) < 1 && Math.abs(moved[1] - (t0 + 3.125 * hour)) < 1);
  key('-');
  key('-');
  assert.equal(c.api.range(), null, 'widening past the data resets');
  assert.equal(key('ArrowRight', { shiftKey: true }).defaultPrevented, true, 'without a range Shift+arrow just reads on');

  const plain = draw(Object.assign({}, telemetry, { brush: false }));
  plain.fire('keydown', { key: 'Home' });
  assert.equal(plain.fire('keydown', { key: '+' }).defaultPrevented, false);
  assert.equal(plain.api.range(), null);
  assert.equal(plain.api.range([t0, t0 + hour]), true, 'scripts can narrow a chart without the brush');
  assert.equal(plain.api.range(['2026-11-10T00:00:00Z', '2026-11-10T00:00:01Z']), false, 'too narrow');
});

test('a log x axis brushes by position and keyed selections persist while points are hidden or out of range', () => {
  const sweep = draw({
    type: 'scatter',
    brush: true,
    x: { type: 'log' },
    series: [{ data: [[1e-5, 1], [1e-4, 2], [1e-3, 3], [1e-2, 4]] }]
  });
  const dots = dotsOf(sweep);
  brush(sweep, dots[1], dots[2]);
  const range = sweep.api.range();
  assert.ok(Math.abs(Math.log10(range[0]) + 4) < 1e-6 && Math.abs(Math.log10(range[1]) + 3) < 1e-6);
  assert.equal(dotsOf(sweep).length, 2);

  const c = draw(telemetry);
  c.selection.group('ops').select('spike');
  c.api.range([t0, t0 + 2 * hour]);
  assert.equal(c.mark('spike'), undefined);
  assert.equal(c.selection.group('ops').get(), 'spike', 'the selection is kept while its point is out of range');
  c.api.visible('A', false);
  c.api.range(null);
  assert.equal(c.mark('spike'), undefined);
  c.api.visible('A', true);
  assert.equal(c.mark('spike').getAttribute(GROUP), 'ops');
  assert.equal(c.selection.group('ops').get(), 'spike');

  c.api.visible('B', false);
  c.api.range([t0 + hour, t0 + 4 * hour]);
  const next = JSON.parse(JSON.stringify(telemetry));
  next.series[0].data.push([t0 + 6 * hour, 1]);
  c.api.update(next);
  assert.equal(c.api.visible('B'), false, 'hidden series stay hidden across updates');
  assert.deepEqual([...c.api.range()], [t0 + hour, t0 + 4 * hour], 'and the range stays while it fits');
  c.api.update(Object.assign({}, next, { x: {} }));
  assert.equal(c.api.range(), null, 'a different axis kind drops the range');
});

test('coords reads the data under a viewport point of the drawn plot, following a narrowed range', () => {
  const c = draw(telemetry);
  const spike = c.mark('spike');
  const hit = c.api.coords(+spike.getAttribute('cx'), +spike.getAttribute('cy'));
  assert.equal(hit.xText, '2026-11-10 04:00 UTC');
  assert.equal(hit.yText, '3');
  assert.ok(hit.plot.left < hit.plot.right && hit.plot.top < hit.plot.bottom);
  assert.equal(c.api.coords(hit.plot.left - 1, +spike.getAttribute('cy')), null);
  c.api.range([t0 + 3 * hour, t0 + 5 * hour]);
  const narrowed = c.mark('spike');
  assert.equal(c.api.coords(+narrowed.getAttribute('cx'), +narrowed.getAttribute('cy')).xText, '2026-11-10 04:00 UTC');
  click(byClass(c, 'df-chart-toggle')[0]);
  assert.equal(c.api.coords(hit.plot.left + 1, hit.plot.top + 1), null, 'nothing to read while the table shows');
});

test('a chart, stepper and passive markup follow the same seeded group without bridges', () => {
  let chartHost, list, row, companion;
  const { selection } = setup({
    groups: { trace: { initial: 'b1' } },
    enhance(DF, document, boot) {
      const add = (parent, tag, attrs = {}, value = '') => {
        const el = parent.appendChild(new Node(tag));
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        el.textContent = value;
        return el;
      };
      chartHost = add(document.body, 'div', { 'data-df-chart': '' });
      add(chartHost, 'script', { type: 'application/json' }, JSON.stringify(shared));
      list = add(document.body, 'ol', { 'data-df-stepper': '', [GROUP]: 'trace' });
      list.id = 'timeline';
      for (const key of ['a1', 'b1', 'a2']) {
        add(add(list, 'li', { [KEY]: key }), 'strong', { 'data-df-step-label': '' }, key);
      }
      row = add(document.body, 'p', { [GROUP]: 'trace', [KEY]: 'b1' });
      companion = add(document.body, 'p', { 'data-df-stepper-view': 'timeline', [KEY]: 'a2' });
      boot.prepareSelection();
      const commits = [];
      document.addEventListener('df:selection:change', ({ detail }) => {
        const key = detail.current.key;
        const step = DF.stepper.get(list).snapshot().key;
        commits.push(key);
        assert.equal(step, key === null || key === 'unmatched' ? 'a2' : key);
        assert.equal(row.hasAttribute('data-df-selection-active'), key === 'b1');
        const active = chartHost.all().filter(el => el.hasAttribute('data-df-selection-active'));
        assert.equal(active.length > 0, key !== null && key !== 'unmatched');
      });
      list.commits = commits;
    }
  });
  const group = selection.group('trace');
  assert.deepEqual(list.commits, ['b1']);
  assert.equal(list.children[1].getAttribute('aria-current'), 'step');
  assert.equal(companion.hasAttribute('hidden'), true);
  const plot = chartHost.all().find(el => el.classList.contains('df-chart-plot'));
  const point = chartHost.all().find(el => el.tag === 'circle' && el.getAttribute(KEY) === 'a1');
  const click = Object.assign(new Event('click', { cancelable: true }), {
    button: 0, clientX: Number(point.getAttribute('cx')), clientY: Number(point.getAttribute('cy'))
  });
  plot.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  assert.equal(group.get(), 'a1');
  assert.equal(list.children[0].getAttribute('aria-current'), 'step');
  const next = list.parentNode.children.find(el => el.classList.contains('df-stepper-controls')).children[2];
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
    enhance(DF, document) {
      tabs = DF.tabs;
      const tabSet = (labels, follow = false) => {
        const host = document.body.appendChild(new Node('div'));
        host.setAttribute('data-df-tabs', '');
        host.setAttribute(GROUP, 'languages');
        if (follow) host.setAttribute('data-df-selection-mode', 'follow');
        labels.forEach(([key, label]) => {
          const panel = host.appendChild(new Node('div'));
          panel.setAttribute(KEY, key);
          panel.setAttribute('data-df-tab', label);
        });
        return host;
      };
      first = tabSet([['python', 'Python'], ['js', 'JavaScript']]);
      second = tabSet([['js', 'JS'], ['python', 'Python 3']], true);
      DF.all = (selector, scope = document.body) => {
        if (selector === '.df-tabs, [data-df-tabs]') return [first, second];
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
