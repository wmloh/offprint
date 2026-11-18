const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docform/js/chart.js'), 'utf8');
const GROUP = 'data-df-highlight-group';
const KEY = 'data-df-highlight-key';

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
  matches() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400 }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

function setup() {
  const document = new EventTarget();
  document.createElement = (tag) => new Node(tag);
  document.createElementNS = (_, tag) => new Node(tag);
  let selection = new Map();
  const sets = [];
  const warnings = [];
  const DocForm = {
    warnOnce: (_, message) => warnings.push(message),
    register() {},
    all(selector, scope) {
      const cls = selector.match(/^\.([\w-]+)$/);
      return scope.all().filter((el) => cls && el.classList.contains(cls[1]));
    },
    highlight: {
      get: (group) => selection.get(group) ?? null,
      set(group, key) {
        sets.push([group, key]);
        if (key === null) selection.delete(group);
        else selection.set(group, key);
        document.dispatchEvent(new CustomEvent('df:highlightchange', { detail: { group, key } }));
      }
    }
  };
  const context = vm.createContext({ DocForm, document, CustomEvent, Map, Set, WeakMap });
  context.window = context;
  vm.runInContext(source, context);
  return { chart: DocForm.chart, highlight: DocForm.highlight, sets, warnings };
}

function draw(spec) {
  const env = setup();
  const host = new Node('div');
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
  highlight: 'trace',
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
  assert.equal(c.highlight.get('trace'), null, 'hovering only previews');
  assert.equal(c.point(c.mark('b1'), 'click').defaultPrevented, true, 'a handled click leaves a zoomable figure alone');
  assert.equal(c.highlight.get('trace'), 'b1');
  assert.match(c.tip().textContent, /Selected/);
  c.point(c.mark('a1'), 'click');
  assert.equal(c.highlight.get('trace'), 'a1');
  c.point(c.mark('a1'), 'click');
  assert.equal(c.highlight.get('trace'), null);
  assert.doesNotMatch(c.tip().textContent, /Selected/);
});

test('arrow keys visit each reading at a shared x and Enter or Space toggles its key', () => {
  const c = draw(shared);
  const key = (k, extra) => c.fire('keydown', Object.assign({ key: k }, extra));
  assert.equal(key('Enter').defaultPrevented, false, 'nothing is read yet');
  key('Home');
  key('ArrowRight');
  assert.equal(key('Enter').defaultPrevented, true);
  assert.equal(c.highlight.get('trace'), 'a1', 'readings at x = 1 run from the top of the plot down');
  key('Enter', { repeat: true });
  assert.equal(c.highlight.get('trace'), 'a1');
  key(' ');
  assert.equal(c.highlight.get('trace'), null);
  key('End');
  assert.equal(key('Enter').defaultPrevented, false, 'an unkeyed point has nothing to select');
  assert.deepEqual(c.sets, [['trace', 'a1'], ['trace', null]]);
});

test('outside selections refresh the readout, and keys survive redraws, gaps in the data, and the table view', () => {
  const c = draw(shared);
  c.fire('keydown', { key: 'End' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.highlight.set('trace', 'b2');
  assert.match(c.tip().textContent, /Selected/);

  const without = JSON.parse(JSON.stringify(shared));
  without.series[1].data.splice(1, 1);
  c.api.update(without);
  assert.equal(c.mark('b2'), undefined);
  c.api.update(shared);
  assert.equal(c.highlight.get('trace'), 'b2', 'the selection is kept by key while its point is absent');
  assert.equal(c.mark('b2').getAttribute(GROUP), 'trace');

  c.host.all().find((el) => el.classList.contains('df-chart-toggle')).dispatchEvent(new Event('click'));
  const cells = c.host.all().filter((el) => el.tag === 'td' && el.getAttribute(KEY));
  assert.deepEqual(cells.map((el) => el.getAttribute(KEY)), ['a1', 'b1', 'a2', 'b2']);
  assert.ok(cells.every((el) => el.getAttribute(GROUP) === 'trace'));
});

test('bars and scatter points are keyed, and charts without a group keep one readout per x and ignore clicks', () => {
  const bars = draw({ type: 'bar', highlight: 'g', series: [{ data: [{ x: 'a', y: 1, key: 'k1' }] }, { data: [{ x: 'a', y: 2, key: 'k2' }] }] });
  assert.deepEqual(bars.marks().map((el) => el.tag + ':' + el.getAttribute(KEY)), ['path:k1', 'path:k2']);
  const dots = draw({ type: 'scatter', highlight: 'g', series: [{ data: [{ x: 1, y: 1, key: 'p' }] }] });
  dots.point(dots.mark('p'), 'click');
  assert.equal(dots.highlight.get('g'), 'p');

  const legacy = draw(Object.assign({}, shared, { highlight: undefined }));
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
  const model = chart.normalize(Object.assign(spec, { highlight: 'h' }));
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
