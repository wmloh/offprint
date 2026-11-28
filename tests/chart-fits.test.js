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
  ['core.js', 'chart.js', 'chart-fits.js', ...modules].forEach((file) => vm.runInContext(read(file), context));
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
  return { OffPrint, document, warnings, draw, fits: OffPrint._chartFits, chart: OffPrint._chart };
}

const observed = [
  { x: 0, y: 1.2, fitted: 1, key: 'a' }, { x: 1, y: 2.6, fitted: 3, key: 'b' },
  { x: 2, y: 5.5, fitted: 5, key: 'c' }, { x: 3, y: 6.8, fitted: 7, key: 'd' }, { x: 4, y: 9.1, fitted: 9, key: 'e' }
];
const linear = [[0, 1], [4, 9]];
const scatter = (extra = {}) => Object.assign({
  type: 'scatter', residuals: true,
  series: [{ key: 'obs', name: 'Observed', data: observed }],
  fits: [{ key: 'line', label: 'Linear fit', curve: linear, band: [[0, 0.5, 1.5], [4, 8, 10]], stats: 'R² = 0.99' }]
}, extra);
const num = (el, name) => +el.getAttribute(name);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('fit curves, bands, and fitted values are validated and never estimated', () => {
  const { chart } = setup();
  const errors = (extra) => chart.validate(scatter(extra));
  assert.equal(errors({}).length, 0);
  assert.match(errors({ fits: {} })[0], /fits must be an array/);
  assert.match(errors({ type: 'bar' })[0], /line and scatter charts/);
  assert.match(errors({ fits: [{ curve: [[0, 1]] }] })[0], /at least two \[x, y\] points/);
  assert.match(errors({ fits: [{ curve: [[2, 1], [1, 3]] }] })[0], /sorted by increasing x; point 2/);
  assert.match(errors({ fits: [{ curve: [[0, 1], [1, 'n/a']] }] })[0], /point 2 needs finite x, y values/);
  assert.match(errors({ fits: [{ curve: linear, band: [[0, 2, 1], [4, 8, 10]] }] })[0], /lower bound at or below/);
  assert.match(errors({ fits: [{ curve: linear, series: 'nope' }] })[0], /unknown series/);
  assert.match(errors({ fits: [{ key: 'k', curve: linear }, { key: 'k', curve: linear }] })[0], /unique/);
  assert.match(errors({ fits: [{ curve: linear, stats: 3 }] })[0], /stats as nonempty text/);
  assert.match(errors({ residuals: { height: 20 } })[0], /height must be a number from 48/);
  assert.match(errors({ series: [{ data: [[0, 1], [1, 2]] }] })[0], /need fitted values/);
  assert.match(errors({ series: [{ data: [{ x: 0, y: 1, fitted: 'about one' }, { x: 1, y: 2 }] }] })[0], /finite fitted value/);

  // Log axes reject nonpositive curve, band, and fitted values instead of dropping them.
  assert.match(errors({ x: { type: 'log' }, series: [{ data: [{ x: 1, y: 1, fitted: 1 }, { x: 2, y: 2, fitted: 2 }] }],
    fits: [{ curve: [[0, 1], [2, 2]] }] })[0], /log x axis and needs positive x values; point 1/);
  assert.match(errors({ y: { type: 'log' }, fits: [{ curve: [[0, 1], [4, 9]], band: [[0, 0, 2], [4, 8, 10]] }] })[0],
    /band is on a log y axis and needs positive values; point 1/);
  assert.match(errors({ y: { type: 'log' }, series: [{ data: [{ x: 1, y: 1, fitted: 0 }, { x: 2, y: 2, fitted: 2 }] }],
    fits: [] })[0], /log y axis and needs a positive fitted value/);

  const model = chart.normalize(scatter());
  const fits = setup().fits;
  fits.normalize(model, scatter());
  assert.deepEqual(plain(model.fits.map((f) => [f.key, f.label, f.series, f.stats])), [['line', 'Linear fit', 'obs', 'R² = 0.99']],
    'a fit on a one-series chart belongs to that series');
  assert.deepEqual(plain(fits.residuals(model).map((r) => +r.value.toFixed(6))), [0.2, -0.4, 0.5, -0.2, 0.1],
    'residual = observed − supplied fitted value');
  const time = chart.normalize({ type: 'line', x: { type: 'time' }, series: [{ data: [['2026-01-01T00:00Z', 1]] }] });
  fits.normalize(time, { fits: [{ curve: [['2026-01-01T00:00Z', 1], ['2026-01-02T00:00Z', 2]] }] });
  assert.equal(time.fits[0].curve[1][0], Date.UTC(2026, 0, 2));
});

test('fits draw over the data and widen the value axis to fit the band', () => {
  const env = setup();
  const view = env.draw(scatter({ residuals: false, fits: [{ key: 'line', curve: [[0, 1], [4, 9]], band: [[0, 0.5, 1.5], [4, 8, 14]] }] }));
  const curve = view.find('op-chart-fit-curve')[0];
  const band = view.find('op-chart-fit-band')[0];
  assert.ok(curve && band, 'curve and band are drawn');
  assert.match(curve.getAttribute('d'), /^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/, 'the supplied curve points are joined, not smoothed');
  const ticks = view.find('op-chart-tick').map((el) => +el.textContent).filter(Number.isFinite);
  assert.ok(Math.max(...ticks) >= 14, 'the y axis reaches the band top');
  const layers = view.find('op-chart-layer').map((el) => el.getAttribute('data-op-layer'));
  assert.deepEqual(layers, ['fits']);
  assert.match(view.plot().getAttribute('aria-label'), /Fits: Observed fit for Observed with an uncertainty band\./);
});

test('residual panel sits under the plot, shares x, keys, and the readout, and follows brushing', () => {
  const env = setup();
  const view = env.draw(scatter({ selectionGroup: 'runs', brush: true, x: { label: 'Dose' } }));
  assert.equal(num(view.svg(), 'height'), 260 + 24 + 72, 'the frame grows by the panel and its gap');
  const dots = view.find('op-chart-dot');
  const residuals = view.find('op-chart-residual');
  assert.equal(residuals.length, 5);
  residuals.forEach((el, i) => assert.equal(num(el, 'cx'), num(dots[i], 'cx'), 'residuals share the x axis'));
  assert.deepEqual(plain(residuals.map((el) => el.getAttribute('data-op-key'))), ['a', 'b', 'c', 'd', 'e']);
  const zero = view.find('op-chart-residual-zero')[0];
  assert.ok(num(residuals[0], 'cy') < num(zero, 'y1') && num(residuals[1], 'cy') > num(zero, 'y1'),
    'positive residuals sit above the zero line and negative ones below');
  const plotBottom = Math.max(...dots.map((el) => num(el, 'cy')));
  assert.ok(num(zero, 'y1') > plotBottom + 24, 'the panel is under the plot');
  const xTitle = view.find('op-chart-label').find((el) => el.textContent === 'Dose');
  assert.equal(num(xTitle, 'y'), 260 + 24 + 72 - 6, 'the x title moves below the panel');

  view.move(num(residuals[1], 'cx'), num(residuals[1], 'cy'));
  const tip = view.tip();
  assert.equal(tip.hidden, false, 'pointing at a residual reads its point');
  assert.match(tip.textContent, /-0\.4residual \(fitted 3\)/);
  assert.ok(residuals[1].classList.contains('is-active'));

  view.api.setRange([1.5, 4]);
  assert.equal(view.find('op-chart-residual').length, 3, 'residuals outside the range are not drawn');
  view.find('op-chart-toggle').find((el) => el.textContent === 'Table').dispatchEvent(new Event('click'));
  const table = view.find('op-chart-residuals-table')[0];
  const rows = table.all().filter((el) => el.tag === 'tr' && el.parentNode.tag === 'tbody');
  assert.deepEqual(plain(rows.map((tr) => tr.children.map((td) => td.textContent))), [
    ['2', '5.5', '5', '+0.5'], ['3', '6.8', '7', '-0.2'], ['4', '9.1', '9', '+0.1']]);
});

test('fit chips and the API hide a fit with its residuals, and named sources map curves and fitted fields', () => {
  const env = setup(['choices.js']);
  const spec = {
    type: 'line', residuals: true,
    series: [{ key: 'a', name: 'A', data: [{ x: 0, y: 1, fitted: 1.5 }, { x: 1, y: 3, fitted: 2.5 }] },
      { key: 'b', name: 'B', data: [{ x: 0, y: 4, fitted: 4 }, { x: 1, y: 5, fitted: 6 }] }],
    fits: [{ key: 'fa', series: 'a', curve: [[0, 1.5], [1, 2.5]] }, { key: 'fb', series: 'B', label: 'B trend', curve: [[0, 4], [1, 6]] }]
  };
  const view = env.draw(spec);
  const events = [];
  view.host.addEventListener('op:chart:fits', (event) => events.push(event.detail));
  const curves = () => view.find('op-chart-fit-curve').map((el) => el.getAttribute('data-op-fit'));
  assert.deepEqual(curves(), ['fa', 'fb']);
  assert.equal(env.fits.visible(view.host, 'fb'), true);
  assert.equal(env.fits.visible(view.host, 'fb', false), true);
  assert.deepEqual(curves(), ['fa']);
  assert.equal(view.find('op-chart-residual').length, 2, 'the hidden fit takes its residuals with it');
  assert.deepEqual(plain(events.map((e) => [e.shown.join(), e.hidden.join(), e.origin])), [['fa', 'fb', 'api']]);
  assert.equal(env.fits.visible(view.host, 'missing', false), false);
  view.api.setSeriesVisible('a', false);
  assert.deepEqual(curves(), [], 'a fit follows its series');
  env.fits.visible(view.host, 'fb', true);
  assert.deepEqual(curves(), ['fb']);
  const chip = view.find('op-chart-fit-toggle').find((el) => el.textContent.includes('B trend'));
  const input = chip.all().find((el) => el.tag === 'input');
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(curves(), [], 'unchecking a fit chip hides the fit');
  assert.equal(events[events.length - 1].origin, 'user');

  const mapped = env.fits.mapRecords([
    { t: 0, y: 1, pred: 1.1, lo: 0.9, hi: 1.3 }, { t: 1, y: 2, pred: '', lo: '', hi: '' }, { t: 2, y: 3, pred: 3.2, lo: 3, hi: 3.4 }
  ], { x: 't', series: [{ key: 'obs', field: 'y', fitted: 'pred' }],
    fits: [{ key: 'model', label: 'Model', y: 'pred', lower: 'lo', upper: 'hi', stats: 'RMSE 0.1' }] },
  { series: [{ key: 'obs', data: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] }] });
  assert.deepEqual(plain(mapped.fits[0].curve), [[0, 1.1], [2, 3.2]], 'blank fitted values leave gaps in the curve, not guesses');
  assert.deepEqual(plain(mapped.fits[0].band), [[0, 0.9, 1.3], [2, 3, 3.4]]);
  assert.deepEqual(plain(mapped.series[0].data.map((p) => p.fitted)), [1.1, null, 3.2]);
  assert.throws(() => env.fits.mapRecords([{ t: 0, y: 1 }], { x: 't', series: [], fits: [{ y: 'pred' }] }, {}),
    /field "pred" is missing in record 1/);
});
