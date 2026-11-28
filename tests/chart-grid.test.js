const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');

// Enough DOM for charts to draw, with events that bubble to the document.
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((f) => f !== fn)); }
  dispatchEvent(event) {
    if (!Object.hasOwn(event, 'target')) Object.defineProperty(event, 'target', { value: this });
    (this.listeners.get(event.type) || []).slice().forEach((fn) => fn.call(this, event));
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

class Node extends Target {
  constructor(tag) {
    super();
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = { setProperty() {}, removeProperty() {} };
    this.text = '';
    this.hidden = false;
    this.nodeType = 1;
    this.clientWidth = 400;
    const node = this;
    this.classList = {
      add: (...names) => names.forEach((n) => node.setClasses(node.classes().add(n))),
      remove: (...names) => names.forEach((n) => { const set = node.classes(); set.delete(n); node.setClasses(set); }),
      toggle: (n, on) => ((on ?? !node.classList.contains(n)) ? node.classList.add(n) : node.classList.remove(n)),
      contains: (n) => node.classes().has(n)
    };
  }
  classes() { return new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean)); }
  setClasses(set) { this.attributes.set('class', [...set].join(' ')); }
  set className(v) { this.setAttribute('class', v); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get tagName() { return this.tag.toUpperCase(); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.text = String(v); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
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
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  cloneNode(deep) {
    const clone = new Node(this.tag);
    clone.attributes = new Map(this.attributes);
    clone.text = this.text;
    if (deep) this.children.forEach((c) => clone.appendChild(c.cloneNode(true)));
    return clone;
  }
  focus() {}
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const part = /^([a-z]+)?(?:\[([\w-]+)(?:="([^"]+)")?\])?$/.exec(selector);
    if (!part) return false;
    const [, tag, attr, value] = part;
    return (!tag || this.tag === tag) && (!attr || this.hasAttribute(attr) && (value === undefined || this.getAttribute(attr) === value));
  }
  closest(selector) { for (let n = this; n && n.matches; n = n.parentNode) if (n.matches(selector)) return n; return null; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(selector) {
    const direct = selector.startsWith(':scope > ');
    const simple = direct ? selector.slice(9) : selector;
    return (direct ? this.children : this.all()).filter((n) => n.matches(simple));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 260 }; }
}

function setup(modules = []) {
  const document = new Target();
  document.body = new Node('body');
  document.body.parentNode = document;
  document.createElement = (tag) => new Node(tag);
  document.createElementNS = (_, tag) => new Node(tag);
  document.getElementById = (id) => document.body.all().find((el) => el.id === id) || null;
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  const warnings = [];
  const context = vm.createContext({ URL, document, CustomEvent, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  ['core.js', 'chart.js', 'choices.js', 'chart-grid.js', ...modules].forEach((file) => vm.runInContext(read(file), context));
  const OffPrint = context.OffPrint;
  function draw(spec, attrs = {}) {
    const host = new Node('div');
    Object.entries(attrs).forEach(([name, value]) => host.setAttribute(name, value));
    document.body.appendChild(host);
    const api = OffPrint._chart(host, spec);
    const find = (cls) => host.all().filter((el) => el.classList.contains(cls));
    const svg = () => host.all().find((el) => el.tag === 'svg');
    const plot = () => find('op-chart-plot')[0];
    const move = (x, y) => plot().dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y }));
    return { host, api, find, svg, plot, move, tip: () => find('op-chart-tip')[0] };
  }
  return { OffPrint, document, warnings, draw, grid: OffPrint._chart._grid, chart: OffPrint._chart };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const classes = ['cat', 'dog', 'fox'];
const confusion = (extra = {}) => Object.assign({
  type: 'grid', rows: classes, columns: classes, x: 'Predicted', y: 'Actual', value: 'Count',
  z: [[8, 2, 0], [1, 6, 3], [0, 1, 9]], diagonal: true, totals: 'both', metrics: true, normalize: 'none'
}, extra);
const risk = (extra = {}) => Object.assign({
  type: 'grid', score: 'product', y: 'Impact', x: 'Likelihood',
  rows: ['Severe', 'Major', 'Minor'], columns: ['Rare', 'Possible', 'Likely'],
  zones: [{ key: 'low', label: 'Low', color: 'green', score: [1, 2] }, { key: 'mid', label: 'Medium', color: 'yellow', score: [3, 4] },
    { key: 'high', label: 'High', color: 'red', score: [5, 9] }],
  items: [{ key: 'r1', label: 'Supplier fails', row: 'Major', column: 'Likely', from: ['Severe', 'Likely'] },
    { key: 'r2', label: 'Data loss', row: 'Severe', column: 'Rare' }]
}, extra);

test('heatmaps and grids share the chart kit colour scales', () => {
  const { OffPrint, chart } = setup(['chart-heatmap.js']);
  assert.equal(chart._heatmap.scale, chart.colorScale, 'the heatmap uses the shared scale');
  const seq = chart.colorScale('sequential', [2, 12], 'Grid');
  assert.deepEqual(plain([seq.lo, seq.hi, seq.paint(12)]), [2, 12, { hue: 'high', alpha: 0.95 }]);
  assert.match(chart.validate(confusion({ scale: { color: 'teal' } }))[0], /^Grid colours must be palette names/);
  assert.match(chart.validate({ type: 'heatmap', scale: { color: 'teal' }, z: [[1]] })[0], /^Heatmap colours/);
  assert.match(chart.validate(confusion({ scale: 'log', z: [[0, 1, 1], [1, 1, 1], [1, 1, 1]] }))[0], /log grid scale needs positive/);
  assert.ok(OffPrint.chart.addons().includes('chart-grid'));
});

test('totals, shares, precision, and recall are derived exactly from supplied counts', () => {
  const { grid } = setup();
  const z = [[8, 2, 0], [1, 6, 3], [0, null, 9]];
  assert.deepEqual(plain(grid.totals(z)), { rows: [10, 10, 9], columns: [9, 8, 12], all: 29 }, 'missing counts add nothing');
  assert.deepEqual(plain(grid.shares(z, 'row')[0]), [0.8, 0.2, 0]);
  assert.deepEqual(plain(grid.shares(z, 'column').map((r) => r[0])), [8 / 9, 1 / 9, 0]);
  assert.equal(grid.shares(z, 'all')[2][2], 9 / 29);
  assert.equal(grid.shares(z, 'row')[2][1], null, 'a missing count has no share');
  assert.deepEqual(plain(grid.shares([[0, 0]], 'row')), [[null, null]], 'a zero total leaves no share');
  // Columns listed in another order: each class finds its own column.
  const m = grid.metrics([[2, 8], [1, 9]], [1, 0]);
  assert.deepEqual(plain(m), { recall: [0.8, 0.1], precision: [1 / 3, 8 / 17] });
  assert.deepEqual(plain(grid.metrics([[0, 0], [0, 4]], [0, 1]).recall), [null, 1]);
});

test('zones score cells by product, sum, or value, and cell lists claim cells first', () => {
  const { chart, grid } = setup();
  const zones = (extra) => chart.normalize(risk(extra)).grid.zoneOf;
  assert.deepEqual(plain(zones()), [[1, 2, 2], [0, 1, 2], [0, 0, 1]], 'rows score 3, 2, 1 from the top and columns 1, 2, 3');
  assert.deepEqual(plain(zones({ score: 'sum' })), [[1, 2, 2], [1, 1, 2], [0, 1, 1]]);
  const scored = chart.normalize(risk({ rows: [{ key: 'Severe', score: 10 }, 'Major', 'Minor'] })).grid;
  assert.equal(grid.score(scored, 0, 0), 10, 'an authored score replaces the rank');
  assert.deepEqual(plain(zones({ zones: [{ key: 'watch', label: 'Watch', cells: [['Minor', 'Likely']] }, { label: 'High', score: [3, 9] }] })[2]),
    [-1, -1, 0], 'a listed cell keeps its zone; unscored gaps stay unzoned');
  assert.deepEqual(plain(zones({ score: 'value', z: [[1, 5, null], [2, 2, 2], [9, 0, 0]], zones: [{ label: 'Hot', score: [5, 9] }] })),
    [[-1, 0, -1], [-1, -1, -1], [0, -1, -1]]);
  assert.match(chart.validate(risk({ score: undefined }))[0], /needs score: "product", "sum", or "value"/);
  assert.match(chart.validate(risk({ zones: [{ label: 'X', cells: [['Huge', 'Rare']] }] }))[0], /unknown row "Huge"/);
  assert.match(chart.validate(risk({ zones: [{ label: 'X', cells: [], score: [1, 2] }] }))[0], /either cells or a score range/);
});

test('items pack into cells, overflow into a count badge, and draw trails from earlier cells', () => {
  const env = setup();
  const packed = env.grid.pack(5, 60, 40, 8, 3);
  assert.equal(packed.overflow, 0);
  assert.deepEqual(plain(packed.slots), [[11, 10.5], [30, 10.5], [49, 10.5], [20.5, 29.5], [39.5, 29.5]], 'rows fill first and centre');
  const full = env.grid.pack(9, 40, 20, 8, 3);
  assert.deepEqual([full.slots.length, full.overflow], [2, 8], 'one slot holds the +8 badge');

  const view = env.draw(risk({ selectionGroup: 'risks' }));
  const dots = view.find('op-grid-dot');
  assert.deepEqual(plain(dots.map((el) => el.getAttribute('data-op-key'))), ['r1', 'r2']);
  assert.equal(view.find('op-grid-trail').length, 1, 'only the moved item has a trail');
  view.move(+dots[0].getAttribute('cx'), +dots[0].getAttribute('cy'));
  assert.equal(view.tip().textContent, 'Supplier failsMajor · Likely · HighMoved from Severe · Likely');
  const crowd = env.draw(risk({ items: Array.from({ length: 30 }, (_, i) => ({ key: 'k' + i, row: 'Minor', column: 'Rare' })) }));
  const badge = crowd.find('op-grid-badge-text')[0];
  assert.match(badge.textContent, /^\+\d+$/);
  assert.equal(crowd.find('op-grid-dot').length + +badge.textContent.slice(1), 30, 'every item is a dot or counted in the badge');
  assert.match(env.chart.validate(risk({ items: [{ key: 'cell:Severe:Rare', row: 'Severe', column: 'Rare' }] }))[0], /repeats a cell or item key/);
});

test('confusion grids draw margins and switch normalization by chip or API with an event', () => {
  const env = setup();
  const view = env.draw(confusion());
  const margins = () => view.find('op-grid-margin').map((el) => el.textContent);
  assert.deepEqual(margins(), ['10', '10', '10', '80%', '60%', '90%', '9', '9', '12', '88.9%', '66.7%', '75%', '30']);
  assert.equal(view.find('op-grid-cell').filter((el) => el.classList.contains('is-diagonal')).length, 3);
  const events = [];
  view.host.addEventListener('op:chart:grid-normalize', (event) => events.push(plain(event.detail)));
  assert.equal(env.grid.normalize(view.host, 'row'), true);
  assert.deepEqual(view.find('op-grid-value').map((el) => el.textContent).slice(0, 3), ['80%', '20%', '0%']);
  assert.deepEqual(margins().slice(0, 3), ['10', '10', '10'], 'totals stay counts');
  const chip = view.find('op-grid-normalize')[0].all().find((el) => el.tag === 'input' && el.value === 'all');
  chip.checked = true;
  chip.dispatchEvent(new Event('change'));
  assert.equal(env.grid.normalize(view.host), 'all');
  assert.deepEqual(events, [{ current: 'row', previous: 'none', origin: 'api' }, { current: 'all', previous: 'row', origin: 'user' }]);
  view.move(10 + 200, 60);
  assert.match(view.plot().getAttribute('aria-label'), /Values are overall shares\./);
  assert.equal(env.grid.normalize(view.host, 'diagonal'), false);
  view.api.update(confusion({ z: [[1, 1, 0], [0, 1, 1], [1, 0, 1]] }));
  assert.equal(env.grid.normalize(view.host), 'all', 'the chosen mode survives data updates');

  assert.match(env.chart.validate(confusion({ columns: ['cat', 'dog', 'owl'] }))[0], /same keys on rows and columns/);
  assert.match(env.chart.validate(confusion({ normalizeChoices: ['row'] }))[0], /at least two/);
  assert.match(env.chart.validate({ type: 'grid', rows: ['a'], columns: ['b'], totals: true })[0], /need cell values/);
});

test('keys move between cells and through items, and named records map to cells or items', () => {
  const env = setup(['data.js']);
  const view = env.draw(risk({ items: [{ key: 'a', row: 'Minor', column: 'Rare' }, { key: 'b', row: 'Minor', column: 'Rare' }] }));
  const key = (name) => view.plot().dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: name }));
  const head = () => view.tip().children[0].textContent;
  key('ArrowDown');
  assert.equal(head(), 'Severe · Rare');
  key('ArrowDown'); key('ArrowDown'); key('ArrowDown');
  assert.equal(head(), 'Minor · Rare', 'arrows stop at the edge');
  assert.match(view.tip().textContent, /2 items: 1 a, 2 b/);
  key(']');
  assert.equal(head(), 'a');
  key(']'); key(']');
  assert.equal(head(), 'Minor · Rare', '] wraps back to the cell');
  key('End');
  assert.equal(head(), 'Minor · Likely');

  const cells = env.chart._mapRecords([{ a: 'cat', p: 'dog', n: 3 }, { a: 'dog', p: 'dog', n: '5' }],
    { row: 'a', column: 'p', value: 'n' }, { type: 'grid' });
  assert.deepEqual(plain([cells.rows, cells.columns, cells.cells.map((c) => c.value)]), [['cat', 'dog'], ['dog'], [3, '5']]);
  assert.equal(env.chart.validate(cells).length, 0);
  const items = env.chart._mapRecords([{ id: 'x', imp: 'Major', lik: 'Rare', was: 'Severe', wasL: 'Rare' }],
    { row: 'imp', column: 'lik', item: 'id', fromRow: 'was', fromColumn: 'wasL' }, risk({ items: undefined }));
  assert.deepEqual(plain(items.items), [{ key: 'x', row: 'Major', column: 'Rare', from: ['Severe', 'Rare'] }]);
  assert.throws(() => env.chart._mapRecords([], { row: 'a', column: 'b' }, { type: 'grid' }), /either value \(cell records\) or item/);
});
