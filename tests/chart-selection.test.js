const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = (name) => fs.readFileSync(path.join(__dirname, '../docform/js', name + '.js'), 'utf8');
// Choice chips are native inputs in labels; choosing one checks it (clearing radio siblings) and reports the change.
const choiceInputs = (host) => host.all().filter((el) => el.tag === 'input');
const choose = (host, value) => {
  const inputs = choiceInputs(host);
  const target = inputs.find((input) => input.value === value);
  if (target.type === 'radio') inputs.forEach((input) => { input.checked = input === target; });
  else target.checked = !target.checked;
  target.dispatchEvent(new Event('change'));
};
const chosen = (host) => choiceInputs(host).filter((input) => input.checked).map((input) => input.value);
const GROUP = 'data-df-selection-group';
const KEY = 'data-df-key';
const hover = (el, pointerType = 'mouse') => el.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType }));
const CONTROL = 'button:not([role="tab"]), [role="button"][tabindex]';

// Enough DOM for data views to build, draw, and handle events.
class Node extends EventTarget {
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
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    this.colSpan = 1;
    this.rowSpan = 1;
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
  get tagName() { return this.tag.toUpperCase(); }
  get id() { return this.getAttribute('id'); }
  set id(value) { this.setAttribute('id', value); }
  get childNodes() { return this.children; }
  get parentElement() { return this.parentNode; }
  get rows() { return this.children.filter((child) => child.tag === 'tr'); }
  get cells() { return this.children.filter((child) => ['th', 'td'].includes(child.tag)); }
  get tHead() { return this.children.find((child) => child.tag === 'thead') || null; }
  get tBodies() { return this.children.filter((child) => child.tag === 'tbody'); }
  get selectedIndex() { return this.children.findIndex((child) => String(child.value) === String(this.value)); }
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
  append(...children) { children.forEach(child => this.appendChild(child)); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  replaceChild(child, old) { this.insertBefore(child, old); this.removeChild(old); }
  before(child) { this.parentNode.insertBefore(child, this); }
  after(child) { this.parentNode.insertBefore(child, this.parentNode.children[this.parentNode.children.indexOf(this) + 1]); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...children) { this.textContent = ''; children.forEach((child) => this.appendChild(child)); }
  cloneNode(deep) {
    const clone = new Node(this.tag);
    clone.attributes = new Map(this.attributes);
    clone.text = this.text;
    if (deep) this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
    return clone;
  }
  insertRow() { return this.appendChild(new Node('tr')); }
  insertCell() { return this.appendChild(new Node('td')); }
  createTHead() { return this.tHead || this.insertBefore(new Node('thead'), this.firstChild); }
  createTBody() { return this.appendChild(new Node('tbody')); }
  deleteTHead() { this.tHead?.remove(); }
  insertAdjacentHTML() {}
  focus() {}
  contains(node) { return node === this || this.all().includes(node); }
  hasAttribute(name) { return this.attributes.has(name); }
  toggleAttribute(name, on) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
  matches(selector) {
    if (selector === `[${GROUP}][${KEY}]`) return this.hasAttribute(GROUP) && this.hasAttribute(KEY);
    if (selector === CONTROL) return this.tag === 'button' && this.getAttribute('role') !== 'tab';
    if (selector === ':disabled, [aria-disabled="true"]') return this.getAttribute('aria-disabled') === 'true';
    return this.matchesAttribute(selector);
  }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (selector === '.df-data' && node.classList.contains('df-data')) return node;
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    if (selector.includes(', ')) return [...new Set(selector.split(', ').flatMap((part) => this.querySelectorAll(part)))];
    if (selector === ':scope > thead > tr') return this.tHead?.rows || [];
    if (selector === ':scope > tbody > tr') return this.tBodies.flatMap((section) => section.rows);
    const exclusion = /^(.*):not\((.+)\)$/.exec(selector);
    if (exclusion) {
      return this.querySelectorAll(exclusion[1]).filter((node) =>
        exclusion[2].startsWith('.') ? !node.classList.contains(exclusion[2].slice(1)) : !node.matchesAttribute(exclusion[2]));
    }
    const direct = selector.startsWith(':scope > ');
    const simple = direct ? selector.slice(9) : selector;
    return (direct ? this.children : this.all()).filter((node) => {
      if (simple === `[${GROUP}][${KEY}]`) return node.matches(simple);
      if (simple === `[data-df-stepper-view][${KEY}]`) return node.hasAttribute('data-df-stepper-view') && node.hasAttribute(KEY);
      if (simple.startsWith('.')) return node.classList.contains(simple.slice(1));
      return node.matchesAttribute(simple);
    });
  }
  matchesAttribute(selector) {
    const part = /^([a-z]+)?(?:\[([\w-]+)(?:="([^"]+)")?\])?$/.exec(selector);
    if (!part) return false;
    const [, tag, attr, value] = part;
    return (!tag || this.tag === tag) && (!attr || this.hasAttribute(attr) &&
      (value === undefined || this.getAttribute(attr) === value));
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400 }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

function setup({ groups, enhance, modules = [], animation = {} } = {}) {
  const document = new EventTarget();
  document.body = new Node('body');
  document.createElement = (tag) => new Node(tag);
  document.createElementNS = (_, tag) => new Node(tag);
  document.createTextNode = (text) => Object.assign(new Node('#text'), { text, nodeType: 3 });
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  document.getElementById = (id) => document.body.all().find((el) => el.id === id) ?? null;
  const sets = [];
  const warnings = [];
  const after = [];
  document.addEventListener('df:selection:change', ({ detail }) => {
    if (detail.origin !== 'init') sets.push([detail.group, detail.current.key]);
  });
  const boot = { canInitialize: () => true, setupComplete: true, optionLayers: () => [], merge: Object.assign,
    after: (_, fn) => after.push(fn),
    report: (_, feature, host, message) => warnings.push(message),
    moduleFailed: (_, error) => { throw error; } };
  const DocForm = { _boot: boot, _site: { base: 'file:///site.js', selectionGroups: groups } };
  const reads = [];
  const context = vm.createContext({ DocForm, document, CustomEvent, TextEncoder, console: { warn: (message) => warnings.push(message.replace(/^\[docform\] /, '')) },
    FileReader: class { readAsText(file) { this.result = file.text; reads.push(() => this.onload()); } },
    MutationObserver: class { observe() {} }, ...animation });
  context.window = context;
  for (const name of ['core', 'choices', 'highlight', 'chart', 'stepper', 'tabs', ...modules]) vm.runInContext(script(name), context);
  if (enhance) enhance(DocForm, document, boot);
  boot.initialize();
  after.forEach((fn) => fn());
  return { chart: DocForm._chart, selection: DocForm.selection, sets, warnings, document, DocForm, reads };
}

function draw(spec, options) {
  const env = setup(options);
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

function guided(reduced = false, author, groups, intervals = false) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const observers = new Map();
  const chartHost = new Node('div');
  chartHost.id = 'trace';
  chartHost.setAttribute('data-df-chart', 'line');
  chartHost.setAttribute('data-df-source', 'readings');
  const host = new Node('ol');
  host.id = 'walkthrough';
  host.setAttribute('data-df-chart-playback', '');
  host.setAttribute('data-df-target', 'trace');
  const events = [];
  host.addEventListener('df:step', ({ detail }) => events.push(detail));
  const data = (end = 10) => ({ type: 'csv', text: intervals ?
    `x,y,key,lo,hi\n0,1,zero,0,2\n2,3,two,1,5\n4,,gap,,\n6,9,six,7,11\n${end},15,last,12,30` :
    `x,y,key\n0,1,zero\n2,3,two\n4,,gap\n6,9,six\n${end},15,last` });
  const env = setup({ groups, modules: ['data', 'chart-playback'], animation: {
    performance: { now: () => now },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe(el) { observers.set(el, this.fn); } }
  }, enhance(df, document, boot) {
    df.data.define('readings', data());
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
    if (author) author(host, document, df);
  } });
  const playback = env.DocForm.sequence.get(host.id);
  const chart = env.chart.get(chartHost);
  const plot = chartHost.querySelector('.df-chart-plot');
  const controls = env.document.body.querySelector('.df-chart-playback-controls');
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

function positionChart(DocForm, document, id, group, spec) {
  const host = document.body.appendChild(new Node('div'));
  host.id = id;
  host.setAttribute('data-df-x-group', group);
  const api = DocForm._chart(host, spec);
  const plot = host.querySelector('.df-chart-plot');
  return { host, api, plot };
}

const cursor = (plot) => plot.querySelector('.df-chart-x-cursor');
const playhead = (plot) => plot.querySelector('.df-chart-playhead');
const display = (el) => el.getAttribute('display');
const firePlot = (plot, type, props) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));

test('x-position groups share keyboard and pointer inspection in data units with independent viewports', () => {
  const { DocForm, document } = setup();
  const a = positionChart(DocForm, document, 'a', 'steps', { type: 'line', data: [[0, 1], [4, 2], [10, 3]] });
  const b = positionChart(DocForm, document, 'b', 'steps',
    { type: 'line', brush: true, data: [[1, 10], [3, 20], [6, 30], [9, 50]] });
  const c = positionChart(DocForm, document, 'c', 'other', { type: 'scatter', data: [[0, 10], [10, 20]] });
  const group = DocForm._chart.xGroup('steps');
  const events = [];
  const seen = [];
  group.subscribe((current, meta) => seen.push([current.x, meta.origin, display(cursor(b.plot))]), { immediate: true });
  document.addEventListener('df:chart:x', ({ detail }) => events.push(detail));
  assert.equal(DocForm._chart.xGroup('unknown'), null);
  assert.equal(group.set('4'), false);
  assert.equal(group.set(Infinity), false);
  assert.equal(b.api.setRange([2, 8]), true);
  firePlot(a.plot, 'keydown', { key: 'Home' });
  firePlot(a.plot, 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(seen, [[null, 'init', 'none'], [0, 'user', 'none'], [4, 'user', 'inline']]);
  assert.equal(events.at(-1).group, 'steps');
  assert.equal(events.at(-1).previous.x, 0);
  assert.match(a.plot.querySelector('.df-chart-tip-head').textContent, /4$/);
  assert.equal(b.plot.querySelector('.df-chart-tip').hidden, true);
  const pixel = +cursor(b.plot).getAttribute('x1');
  assert.notEqual(pixel, +cursor(a.plot).getAttribute('x1'));
  assert.equal(b.api.coords(pixel, 80).x, 4);
  assert.deepEqual([...b.api.range()], [2, 8]);
  assert.equal(display(cursor(c.plot)), 'none');

  firePlot(b.plot, 'pointermove', { clientX: pixel, clientY: 80 });
  assert.equal(group.snapshot().x, 4, 'pointer uses the exact x even between observations');
  assert.equal(events.length, 2, 'same x transfers ownership without an event');
  assert.match(b.plot.querySelector('.df-chart-tip-head').textContent, /3$/, 'the readout shows its actual observation');
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
  assert.equal(DocForm._chart.xGroup('other').set(5), true);
  assert.equal(group.clear(), true);
  assert.equal(display(cursor(c.plot)), 'inline');
  assert.equal(events.at(-1).origin, 'api');
});

test('one x-group playback clock gates independently sampled charts through source, resize and table redraws', () => {
  let follower;
  const followerSpec = { type: 'line', brush: true, data: [[1, 100], [3, 900], [7, 200], [13, 500]] };
  const env = guided(false, (host, document, DocForm) => {
    host.removeAttribute('data-df-target');
    host.setAttribute('data-df-x-group', 'steps');
    document.getElementById('trace').setAttribute('data-df-x-group', 'steps');
    follower = positionChart(DocForm, document, 'score', 'steps', followerSpec);
  });
  const { DocForm, document, chart, chartHost, plot, playback, advance, frames, data, warnings } = env;
  const other = follower.plot;
  const group = DocForm._chart.xGroup('steps');
  const visible = (p) => p.querySelectorAll('.df-chart-dot').filter((dot) => display(dot) !== 'none').length;
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
  const future = other.querySelectorAll('.df-chart-dot').find((dot) => display(dot) === 'none');
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
  const toggle = follower.host.querySelector('.df-chart-toggle');
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

  const source = DocForm.data.source('readings');
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
  const marker = other.querySelector('.df-chart-checkpoint');
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
  assert.equal(DocForm._chartPlayback.mount(competing, { xGroup: 'steps' }), null);
  assert.equal(DocForm._chartPlayback.mount(competing, { target: follower.host.id }), null);
  assert.equal(DocForm.sequence.get(env.host), playback);
  assert.equal(chartHost.querySelector('.df-chart-playhead'), playhead(plot));
});

test('configured group playback rejects incompatible charts and claims all members together', () => {
  const { DocForm, document } = setup({ modules: ['chart-playback'], animation: {
    matchMedia: () => ({ matches: true })
  } });
  const spec = { type: 'line', data: [[0, 2], [5, 3]] };
  const a = positionChart(DocForm, document, 'a', 'steps', spec);
  const b = positionChart(DocForm, document, 'b', 'steps', { ...spec, type: 'scatter' });
  const host = document.body.appendChild(new Node('ol'));
  const single = document.body.appendChild(new Node('ol'));
  const api = DocForm._chartPlayback;
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
  const { chart, chartHost, playback, plot, controls, events, frames, advance, DocForm, host } = guided();
  const shape = () => ({ ...playback.snapshot() });
  const keys = () => plot.all().filter((el) => el.hasAttribute(KEY)).map((el) => el.getAttribute(KEY));
  const button = (label) => controls.children.find((el) => el.getAttribute('aria-label') === label);
  const fire = (type, props) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
  const line = plot.querySelector('.df-chart-line');
  const clip = plot.all().find((el) => el.tag === 'clipPath').firstChild;
  const playhead = plot.querySelector('.df-chart-playhead');
  const ticks = plot.querySelectorAll('.df-chart-tick');
  assert.equal(DocForm._chartPlayback.mount(host), playback);
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
  assert.equal(plot.querySelector('.df-chart-line'), line);
  assert.deepEqual(plot.querySelectorAll('.df-chart-tick'), ticks);

  const future = plot.querySelectorAll('.df-chart-dot').find((el) => el.getAttribute('display') === 'none');
  const position = { clientX: +future.getAttribute('cx'), clientY: +future.getAttribute('cy') };
  assert.equal(chart.coords(position.clientX, position.clientY), null);
  fire('pointermove', position);
  assert.equal(plot.querySelector('.df-chart-tip').hidden, true);
  fire('keydown', { key: 'End' });
  assert.equal(plot.querySelector('.df-chart-tip-head').textContent, 'x 2');
  fire('keydown', { key: 'Enter' });
  assert.equal(DocForm.selection.group('trace').get(), 'two');

  toggle.dispatchEvent(new Event('click'));
  advance(5000);
  assert.equal(playback.position, 2.25);
  assert.equal(toggle.getAttribute('aria-label'), 'Play to the next checkpoint');
  button('Next checkpoint').dispatchEvent(new Event('click'));
  assert.equal(frames.size, 0, 'Next finishes the paused leg without animating');
  assert.deepEqual(shape(), { key: 'gap', index: 1, count: 3, canPrev: true, canNext: true, playing: false });
  assert.equal(controls.children[2].textContent, 'Between readings');
  assert.deepEqual(keys(), ['zero', 'two']);

  const table = chartHost.querySelector('.df-chart-table');
  const tableToggle = chartHost.querySelector('.df-chart-toggle');
  tableToggle.dispatchEvent(new Event('click'));
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4']);
  playback.play();
  advance(5000);
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4', '6']);
  tableToggle.dispatchEvent(new Event('click'));
  assert.equal(chart.setRange([1, 7]), true);
  assert.deepEqual([...chart.range()], [1, 7]);
  assert.equal(plot.querySelector('.df-chart-playhead').getAttribute('display'), 'none');
  playback.prev();
  assert.equal(playback.position, 4.5);
  assert.deepEqual([...chart.range()], [1, 7]);
  playback.reset();
  assert.equal(shape().key, 'start');
  assert.deepEqual(keys(), []);
});

test('reduced motion reaches each stop immediately and chart replacement reconciles the last reached key', () => {
  const { chart, playback, controls, chartHost, DocForm, frames, events, data, warnings } = guided(true);
  const source = DocForm.data.source('readings');
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
  assert.equal(chartHost.querySelector('.df-chart-playhead'), null);
  assert.equal(source.update(data(12)), true);
  assert.deepEqual(playback.snapshot(), reached);
  assert.ok(chartHost.querySelector('.df-chart-playhead'));
  assert.equal(chart.reset(), true);
  assert.deepEqual(playback.snapshot(), reached);
});

test('replacement during a leg cancels its clock before source subscribers see the restored chart', () => {
  const { playback, DocForm, data, frames, advance, events } = guided();
  const source = DocForm.data.source('readings');
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
  const { DocForm, document, warnings } = setup({ modules: ['chart-playback'] });
  const host = document.body.appendChild(new Node('ol'));
  const note = host.appendChild(new Node('li'));
  note.setAttribute(KEY, 'finish');
  note.setAttribute('data-df-x', '5');
  note.textContent = 'Static walkthrough';
  const chart = document.body.appendChild(new Node('div'));
  chart.id = 'manual';
  DocForm._chart(chart, { type: 'scatter', data: [[0, 1], [5, 3]] });
  const api = DocForm._chartPlayback;
  assert.equal(api.mount(host, { target: chart.id }), null);
  DocForm._chart(chart, { type: 'line', data: [[0, 1], [5, 3]] });
  const competitor = document.body.appendChild(new Node('ol'));
  assert.equal(api.mount(competitor, { target: chart.id, checkpoints: [{ key: 'duplicate', x: 1 }, { key: 'duplicate', x: 2 }] }), null);
  assert.equal(document.querySelectorAll('.df-chart-playback-controls').length, 0);
  assert.equal(host.textContent, 'Static walkthrough');
  assert.ok(warnings.some((warning) => warning.includes('no playable numeric line range')));
  assert.ok(warnings.some((warning) => warning.includes('Invalid checkpoint "duplicate"')));
  note.setAttribute('data-df-x', '5 steps');
  assert.equal(api.mount(host, { target: chart.id, checkpoints: [{ key: 'valid', x: 5 }] }), null);
  assert.equal(note.hidden, false);
  note.setAttribute('data-df-x', '5');
  const playback = api.mount(host, { target: chart.id });
  assert.equal(playback.select('finish'), true);
  assert.equal(playback.snapshot().key, 'finish');
  assert.equal(playback.snapshot().canNext, false);
  assert.equal(api.mount(competitor, { target: chart.id }), null);
  assert.equal(DocForm.sequence.get(host), playback);
});

function checkpointItem(host, key, x, label) {
  const item = host.appendChild(new Node('li'));
  item.setAttribute(KEY, key);
  item.setAttribute('data-df-x', x);
  const title = item.appendChild(new Node('strong'));
  title.setAttribute('data-df-step-label', '');
  title.textContent = label;
  item.appendChild(new Node('p')).textContent = 'Notes for ' + key;
  return item;
}

test('authored checkpoints reveal HTML and an off-sample marker and link to a companion button', () => {
  let start, gap, finish, companion, detail;
  const { playback, chart, document, controls, selection, events, sets, plot, DocForm, data, advance } =
    guided(false, (host, doc) => {
      host.setAttribute(GROUP, 'checkpoints');
      host.setAttribute('data-df-selection-seed', '');
      start = checkpointItem(host, 'opening', 0, 'Opening');
      gap = checkpointItem(host, 'schedule', 4.5, 'Schedule change');
      finish = checkpointItem(host, 'final', 10, 'Final checkpoint');
      detail = doc.body.appendChild(new Node('aside'));
      detail.id = 'schedule-note';
      detail.appendChild(new Node('em')).textContent = 'The schedule changed here.';
      gap.setAttribute('data-df-detail', detail.id);
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
  assert.equal(plot.querySelector('.df-chart-checkpoint').getAttribute('display'), 'none');
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
  const marker = plot.querySelector('.df-chart-checkpoint');
  assert.equal(marker.getAttribute('display'), 'inline');
  assert.equal(marker.getAttribute('cx'), plot.querySelector('.df-chart-playhead').getAttribute('x1'));
  assert.equal(plot.querySelectorAll('.df-chart-line')[0].getAttribute('d').match(/M/g).length, 2);
  const table = chart.element.querySelector('.df-chart-table');
  const toggle = chart.element.querySelector('.df-chart-toggle');
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
  const source = DocForm.data.source('readings');
  assert.equal(source.update(data(7)), true);
  assert.deepEqual([start, gap, finish, detail].map((item) => item.hidden), [false, false, false, false]);
  assert.equal(finish.getAttribute('aria-current'), null);
  assert.equal(source.reset(), true);
  assert.equal(finish.getAttribute('aria-current'), 'step');
  playback.reset();
  assert.equal(group.get(), 'opening');
});

test('configured note references validate before enhancement and cannot be claimed twice', () => {
  const { DocForm, document, warnings } = setup({ modules: ['chart-playback'] });
  const host = document.body.appendChild(new Node('ol'));
  const chart = document.body.appendChild(new Node('div'));
  chart.id = 'manual';
  DocForm._chart(chart, { type: 'line', data: [[0, 2], [2, 4], [8, 8]] });
  const note = document.body.appendChild(new Node('aside'));
  note.id = 'note';
  note.textContent = 'Static note';
  const mount = (target, detailId, playbackHost = host) => DocForm._chartPlayback.mount(playbackHost, {
    target, checkpoints: [{ key: 'schedule', x: 4.5, label: 'Schedule change', detail: detailId }]
  });
  assert.equal(mount(chart.id, 'missing'), null);
  const duplicate = document.body.appendChild(new Node('div'));
  duplicate.id = note.id;
  assert.equal(mount(chart.id, note.id), null);
  duplicate.remove();
  assert.equal(mount(chart.id, chart.id), null);
  assert.equal(note.hidden, false);
  assert.equal(chart.querySelector('.df-chart-playhead'), null);
  assert.ok(warnings.some((warning) => warning.includes('Invalid detail reference "missing"')));
  const playback = mount(chart.id, note.id);
  assert.equal(note.hidden, true);
  playback.select('schedule');
  assert.equal(note.hidden, false);
  const other = document.body.appendChild(new Node('div'));
  other.id = 'other';
  DocForm._chart(other, { type: 'line', data: [[0, 2], [3, 4], [8, 8]] });
  const otherHost = document.body.appendChild(new Node('ol'));
  assert.equal(mount(other.id, note.id, otherHost), null);
  assert.equal(note.hidden, false);
  assert.equal(other.querySelector('.df-chart-playhead'), null);
  const otherNote = document.body.appendChild(new Node('aside'));
  otherNote.id = 'other-note';
  const otherPlayback = mount(other.id, otherNote.id, otherHost);
  otherPlayback.select('schedule');
  assert.equal(otherPlayback.position, 4.5);
  assert.equal(otherNote.hidden, false);
  assert.equal(other.querySelector('.df-chart-checkpoint').getAttribute('display'), 'inline');
});

test('publish-only and follow-only modes respect a configured startup selection', () => {
  for (const mode of ['publish', 'follow']) {
    const { playback, selection } = guided(true, (host) => {
      host.setAttribute(GROUP, 'checkpoints');
      host.setAttribute('data-df-selection-mode', mode);
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
  const band = plot.querySelector('.df-chart-band-interval');
  const bandClip = () => plot.all().find((el) => el.tag === 'clipPath' && el.id.endsWith('-band')).firstChild;
  assert.equal(band.getAttribute('d').match(/M/g).length, 2);
  assert.equal(+bandClip().getAttribute('width'), 0);
  assert.ok(plot.querySelectorAll('.df-chart-tick').some((tick) => tick.textContent === '30'));
  const fire = (key) => plot.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
  fire('End');
  assert.match(plot.querySelector('.df-chart-tip').textContent, /90% interval \[0, 2\]/);
  playback.play();
  advance(500);
  assert.ok(+bandClip().getAttribute('width') > 0);
  assert.equal(plot.querySelector('.df-chart-band-interval'), band);
  fire('End');
  assert.match(plot.querySelector('.df-chart-tip').textContent, /90% interval \[1, 5\]/);
  assert.equal(chart.setRange([1, 7]), true);
  const clip = bandClip();
  const playhead = plot.querySelector('.df-chart-playhead');
  assert.equal(+clip.getAttribute('width'), +playhead.getAttribute('x1') - +clip.getAttribute('x'));
  chartHost.querySelector('.df-chart-toggle').dispatchEvent(new Event('click'));
  const table = chartHost.querySelector('.df-chart-table');
  assert.match(table.textContent, /90% interval \[1, 5\]/);
  assert.doesNotMatch(table.textContent, /\[7, 11\]|\[12, 30\]/);
  playback.select('later');
  assert.match(table.textContent, /90% interval \[7, 11\]/);
  assert.doesNotMatch(table.textContent, /\[12, 30\]/);
});

test('direct intervals handle disjoint bounds, missing intervals, fixed scales, and invalid updates', () => {
  const interval = { lower: 3, upper: 5, label: 'Supplied bounds', count: 0 };
  const spec = { type: 'line', data: [
    { x: 1, y: 2, interval }, { x: 2, y: 2 }, { x: 3, y: 2, interval }, { x: 4, y: 4, interval }
  ] };
  const env = draw(spec);
  assert.equal(env.plot.querySelectorAll('.df-chart-whisker').length, 1);
  assert.equal(env.plot.querySelector('.df-chart-band-interval').getAttribute('d').match(/M/g).length, 1);
  assert.equal(env.api.model().series[0].points[1].interval, undefined);
  const band = env.plot.querySelector('.df-chart-band-interval');
  for (const invalid of [{ lower: 1 }, { lower: 3, upper: 2 }, { lower: 0, upper: Infinity }, { ...interval, count: 1.2 }]) {
    assert.equal(env.api.update({ data: [{ x: 1, y: 2, interval: invalid }] }), false);
  }
  assert.equal(env.api.update({ data: [{ x: 1, y: null, interval }] }), false);
  assert.equal(env.api.update({ y: { type: 'log' }, data: [
    { x: 1, y: 2, interval: { lower: 0, upper: 3 } }
  ] }), false);
  assert.equal(env.plot.querySelector('.df-chart-band-interval'), band);
  for (const type of ['bar', 'scatter']) {
    const { plot, tip, fire } = draw({ type, y: { min: 0, max: 4 }, data: [{ x: 1, y: 2, interval }] });
    assert.equal(plot.querySelectorAll('.df-chart-whisker').length, 1);
    const clip = plot.all().find((el) => el.tag === 'clipPath' && el.id.endsWith('-interval')).firstChild;
    assert.ok(+clip.getAttribute('height') > 0);
    assert.ok(plot.querySelectorAll('.df-chart-tick').some((tick) => tick.textContent === '4'));
    assert.ok(!plot.querySelectorAll('.df-chart-tick').some((tick) => tick.textContent === '5'));
    fire('keydown', { key: 'End' });
    assert.match(tip().textContent, /Supplied bounds \[3, 5\] \(n = 0\)/);
  }
});

test('mapped intervals retain numeric results behavior and paired differences retain their baseline identity', () => {
  const bounds = { lower: 'lo', upper: 'hi', count: 'n', label: 'Outcome bounds' };
  const paired = { field: 'delta', baselineKeyField: 'reference', interval: { lower: 'dlo', upper: 'dhi', label: 'Paired bounds' } };
  const records = [
    { run: 'base', device: 'CPU', x: 1, score: 10, lo: 8, hi: 14, n: 5 },
    { run: 'alt', device: 'GPU', x: 2, score: 20, lo: 12, hi: 24, n: 3, delta: -2, reference: 'base', dlo: -5, dhi: 1 },
    { run: 'other', device: 'TPU', x: 3, score: 8, lo: null, hi: null, n: null, delta: null, reference: null, dlo: null, dhi: null }
  ];
  const hosts = {};
  const { DocForm: df } = setup({ modules: ['data', 'results', 'scenarios'], enhance(df, document, boot) {
    const options = {
      chart: { mapping: { x: 'x', value: 'score', group: { field: 'run' }, interval: bounds } },
      results: { mapping: { columns: [{ field: 'run' }, { field: 'score', interval: bounds }] } },
      scenarios: { mapping: { recordKey: 'run', baselineKey: 'base', variantKeys: ['alt', 'other'],
        labels: { base: 'Reference' }, conditions: [{ field: 'device' }],
        outcomes: [{ field: 'score', unit: '%', interval: bounds, pairedDifference: paired }] } }
    };
    boot.optionLayers = (feature) => [options[feature] || {}];
    df.data.define('scores', { type: 'value', value: records });
    for (const [id, tag, mode] of [['chart', 'div', 'scatter'], ['results', 'table', ''], ['scenarios', 'table', '']]) {
      const host = document.createElement(tag);
      host.id = id;
      host.setAttribute('data-df-' + id, mode);
      host.setAttribute('data-df-source', 'scores');
      hosts[id] = document.body.appendChild(host);
    }
    const header = hosts.results.createTHead().insertRow().appendChild(new Node('th'));
    header.setAttribute('data-df-field', 'score');
    header.setAttribute('data-df-threshold', '>= 10');
    header.setAttribute('data-df-best', 'max');
  } });
  const source = df.data.source('scores');
  const chart = df._chart.get('chart');
  const results = () => hosts.results.tBodies[0].rows;
  const outcome = (index) => hosts.scenarios.tBodies[0].rows[1].cells[index];
  const cell = results()[1].cells[1];
  assert.equal(cell.getAttribute('data-df-value'), '20');
  assert.match(cell.textContent, /Outcome bounds \[12, 24\] \(n = 3\)/);
  assert.ok(cell.classList.contains('df-pass'));
  assert.ok(cell.classList.contains('df-best'));
  assert.ok(results()[2].cells[1].classList.contains('df-fail'));
  const sort = hosts.results.tHead.rows[0].cells[1].querySelector('button');
  sort.dispatchEvent(new Event('click'));
  assert.deepEqual(results().map((row) => row.cells[0].textContent), ['alt', 'base', 'other']);
  sort.dispatchEvent(new Event('click'));
  sort.dispatchEvent(new Event('click'));
  assert.match(outcome(3).textContent, /Outcome bounds \[12%, 24%\].*Paired difference vs Reference \(base\) -2%.*Paired bounds \[-5%, 1%\]/);
  assert.equal(df.sequence.get('scenarios').select('other'), true);
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
  assert.equal(df._scenarios.get('scenarios').snapshot().key, 'other');
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
  const env = setup({ modules: ['data', 'dropzone', 'results', 'scenarios'], enhance(df, document, boot) {
    boot.optionLayers = (feature) => [options[feature] || {}];
    df.data.defineTransform('budget', ({ value }) => value.map((record) => {
      if (record.device === 'Broken') throw new Error('Rejected device');
      return { ...record, derived: 12 - record.ms };
    }));
    df.data.define('runs', csv());
    function element(tag, id, attrs) {
      const el = document.createElement(tag);
      el.setAttribute('id', id);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute('data-df-' + key, value);
      hosts[id] = document.body.appendChild(el);
      return el;
    }
    element('div', 'plot', { chart: 'line', source: 'runs' });
    const results = element('table', 'results', { results: '', source: 'runs', filters: '',
      chips: 'Budget: ms <= 8' });
    const head = results.createTHead().insertRow();
    for (const field of ['run', 'ms']) {
      const th = head.appendChild(new Node('th'));
      th.setAttribute('data-df-field', field);
      th.textContent = field;
      if (field === 'ms') th.setAttribute('data-df-threshold', '<= 8');
    }
    results.createTBody().insertRow().insertCell().textContent = 'Authored results';
    element('table', 'scenario', { scenarios: 'configurations', source: 'runs' });
    element('div', 'raw', { 'data-view': 'code', source: 'runs', 'max-size': '200' });
    element('div', 'local', { dropzone: '', target: 'plot' });
    for (const id of ['shared-one', 'shared-two']) element('div', id, { dropzone: '', 'target-source': 'runs' });
  } });
  const df = env.DocForm;
  const source = df.data.source('runs');
  const chart = df._chart.get('plot');
  const results = df._results.get('results');
  const scenario = df._scenarios.get('scenario');
  const raw = df._dataView.get('raw');
  function choose(zone, input, name = 'runs.csv') {
    const field = hosts[zone].querySelector('input');
    field.files = [{ name, text: input.text, size: input.text.length }];
    field.dispatchEvent(new Event('change'));
    return env.reads.pop();
  }
  function reset(zone) { hosts[zone].querySelector('.df-dropzone-reset').dispatchEvent(new Event('click')); }
  const chartY = () => chart.spec().series[0].data[0].y;
  const snapshots = [];
  source.subscribe(({ revision }, { origin }) => snapshots.push([revision, origin, chartY(), results.snapshot().shown,
    scenario.snapshot().key, raw.snapshot().total]));
  assert.equal(chartY(), 7);
  assert.equal(hosts.results.tHead.rows[0].cells[1].textContent.startsWith('Latency'), true);
  assert.equal(df._results.filters(hosts.results).chip('Budget', true), true);
  assert.equal(df.sequence.get('scenario').select('r04'), true);
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
  const env = setup({ modules: ['params', 'data', 'dropzone', 'results'], enhance(df, document, boot) {
    df._parameters.define('eval', {
      runs: { type: 'multiselect', choices: choices('a', 'b') },
      split: { type: 'select', choices: choices('dev', 'test') }
    });
    df.data.define('runs', payload(initial));
    const options = {
      plot: { filter, brush: true, maxRows: 8, mapping: { x: 'step', value: 'value', group: { field: 'run' } },
        transform: 'observations' },
      results: { filter, mapping: { columns: [{ field: 'tableRun' }, { field: 'loss' }] } },
      fixed: { filter: { where: { accepted: 'true' } }, mapping: { columns: [{ field: 'loss' }] } },
      fixedPlot: { filter: { where: { accepted: 'true' } },
        mapping: { x: 'step', series: [{ key: 'loss', field: 'loss' }] } }
    };
    df.data.defineTransform('observations', ({ value }) => value.map((record) => ({ ...record, value: record.loss })));
    boot.optionLayers = (_, id) => [options[id] || {}];
    function element(tag, id, attrs) {
      const el = document.createElement(tag);
      el.id = id;
      for (const [key, value] of Object.entries(attrs)) el.setAttribute('data-df-' + key, value);
      return hosts[id] = document.body.appendChild(el);
    }
    element('div', 'plot', { chart: 'line', source: 'runs' });
    const table = element('table', 'results', { results: '', source: 'runs', filters: '', heat: '',
      chips: 'Small: loss <= 8' });
    const head = table.createTHead().insertRow();
    for (const field of ['tableRun', 'loss']) {
      const th = head.appendChild(new Node('th'));
      th.setAttribute('data-df-field', field);
      th.textContent = field;
      if (field === 'loss') th.setAttribute('data-df-best', 'max');
    }
    element('table', 'fixed', { results: '', source: 'runs' });
    element('div', 'fixedPlot', { chart: 'line', source: 'runs' });
    element('div', 'local', { dropzone: '', target: 'plot' });
    element('fieldset', 'split', { scope: 'eval', choice: 'split' });
    element('button', 'preset', { scope: 'eval', preset: '{"runs":["b"],"split":"dev"}' });
  } });
  const df = env.DocForm;
  const scope = df._parameters.scope('eval');
  const source = df.data.source('runs');
  const chart = df._chart.get('plot');
  const results = df._results.get('results');
  const fixed = df._results.get('fixed');
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
  hosts.plot.querySelector('.df-chart-toggle').dispatchEvent(new Event('click'));
  const localFilters = () => df._results.filters(table);
  localFilters().set('loss', { min: 6 });
  localFilters().chip('Small', true);
  const header = () => table.tHead.rows[0].cells[1];
  header().querySelector('.df-sort').dispatchEvent(new Event('click'));
  observations.length = 0;
  hosts.preset.dispatchEvent(new Event('click'));
  const presetState = [['b'], 'dev', [['b', 8, 9]], ['8'], 1];
  assert.deepEqual(observations, [['results', presetState], ['scope', presetState]]);
  assert.equal(table.tBodies[0].rows[1].cells[1].classList.contains('df-best'), true);
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
  assert.match(hosts.plot.querySelector('.df-chart-table').textContent, /No readings match/);
  assert.match(table.querySelector('.df-filter-empty').textContent, /No rows match/);
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
  assert.match(hosts.fixedPlot.querySelector('.df-chart-empty').textContent, /No readings match/);
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
  hosts.local.querySelector('.df-dropzone-reset').dispatchEvent(new Event('click'));
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
  host.setAttribute('data-df-chart', 'line');
  host.setAttribute('data-df-source', 'observations');
  host.setAttribute('data-df-gaps', 'break');
  const zone = new Node('div');
  zone.setAttribute('data-df-dropzone', '');
  zone.setAttribute('data-df-target', 'plot');
  zone.setAttribute('data-df-max-rows', '2');
  const env = setup({ modules: ['data', 'dropzone'], enhance(df, document, boot) {
    boot.optionLayers = (feature) => feature === 'chart' ? [{ maxRows: 6, mapping: {
      x: { field: 'Step', label: 'Training step' }, value: 'Loss', pointKey: 'ID',
      group: { field: 'Run', series: [{ key: 'control', label: 'Reference', role: 'baseline' }, { key: 'absent' }] }
    } }] : [];
    df.data.define('observations', initial);
    document.body.appendChild(host);
    document.body.appendChild(zone);
  } });
  const chart = env.chart.get(host);
  const source = env.DocForm.data.source('observations');
  const series = () => JSON.parse(JSON.stringify(chart.model().series));
  const input = zone.querySelector('input');
  const status = zone.querySelector('.df-dropzone-status');
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
  zone.querySelector('.df-dropzone-reset').dispatchEvent(new Event('click'));
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
  host.setAttribute('data-df-chart', 'scatter');
  host.setAttribute('data-df-source', 'observations');
  const utc = { time: '2025-05-01T00:00:00Z', ' score ': 2, run: 'utc' };
  const offset = { time: '2025-05-01T01:00:00+01:00', ' score ': 3, run: 'offset' };
  const env = setup({ modules: ['data'], enhance(df, document, boot) {
    boot.optionLayers = () => [{ x: { type: 'time' }, y: { type: 'log' },
      mapping: { x: 'time', value: ' score ', group: { field: 'run' } } }];
    df.data.define('observations', { type: 'value', value: [utc, offset] });
    document.body.appendChild(host);
  } });
  const chart = env.chart.get(host);
  const source = env.DocForm.data.source('observations');
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
  host.setAttribute('data-df-chart', 'line');
  host.setAttribute('data-df-source', 'trace');
  const fallback = host.appendChild(new Node('table'));
  const raw = new Node('pre');
  raw.setAttribute('data-df-source', 'draft');
  raw.setAttribute('data-df-source-type', 'json');
  raw.setAttribute('data-df-data-view', 'code');
  raw.textContent = '{"bad":}';
  const preview = new Node('div');
  preview.setAttribute('data-df-source', 'preview');
  preview.setAttribute('data-df-data-view', 'code');
  preview.setAttribute('data-df-max-size', '8');
  preview.setAttribute('data-df-max-rows', '2');
  const env = setup({ modules: ['data'], enhance(df, document, boot) {
    const inline = new Node('script');
    inline.setAttribute('data-df-source', 'trace');
    inline.setAttribute('type', 'application/json');
    inline.textContent = '{"label":"Before","y":3}';
    [inline, host, raw, preview].forEach((node) => document.body.appendChild(node));
    boot.optionLayers = (feature) => feature === 'chart' ? [{ transform: 'full', transformOutput: 'spec' }] : [];
    boot.readData();
    df.data.define('preview', { type: 'csv', text: 'id,n\na,1\nb,2\nc,3' });
    df.data.defineTransform('full', ({ value }) => ({ series: [
      { key: 'first', name: value.label, data: [[1, value.y]] },
      { key: 'second', name: value.label, data: [[1, 2]] }
    ] }));
  } });
  assert.equal(env.DocForm.data.source('draft'), null);
  assert.equal(raw.hidden, true);
  assert.match(env.document.body.textContent, /Could not read "draft"/);
  const view = env.DocForm._dataView.get(preview);
  assert.equal(view.snapshot(), null);
  preview.querySelector('button').dispatchEvent(new Event('click'));
  assert.equal(view.snapshot().shown, 2);
  preview.querySelector('button').dispatchEvent(new Event('click'));
  assert.equal(view.snapshot().shown, 4);
  const api = env.chart.get(host);
  const source = env.DocForm.data.source('trace');
  assert.equal(api.spec().series[0].name, 'Before');
  assert.equal(fallback.parentNode?.classList.contains('df-chart-table'), true);
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
  table.setAttribute('data-df-results', '');
  table.setAttribute('data-df-filters', '');
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
  zone.setAttribute('data-df-dropzone', '');
  zone.setAttribute('data-df-target', table.id);
  const env = setup({ modules: ['data', 'results', 'dropzone'], enhance(df, document) {
    document.body.appendChild(table);
    document.body.appendChild(zone);
  } });
  const results = env.DocForm._results;
  const run = results.get(table);
  const originalFilter = results.filters(table);
  assert.equal(originalFilter.set('Latency', { max: 5 }), true);
  header.cells[1].querySelector('.df-sort').dispatchEvent(new Event('click'));
  const originalOrder = [...body.rows];
  const text = 'latency,run\n8,replacement\n3,another';
  const input = zone.querySelector('input');
  input.files = [{ name: 'results.csv', text, size: text.length }];
  input.dispatchEvent(new Event('change'));
  env.reads.pop()();
  assert.equal(table.tBodies[0].rows[0].cells[0].textContent, 'replacement');
  assert.equal(run.snapshot().shown, 1);
  zone.querySelector('.df-dropzone-reset').dispatchEvent(new Event('click'));
  assert.equal(table.tBodies[0], body);
  assert.deepEqual(body.rows, originalOrder);
  assert.equal(results.filters(table), originalFilter);
  assert.equal(run.snapshot().shown, 1);
});

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
const legendInput = (chip) => chip.children.find((el) => el.tag === 'input');
// A legend chip is a checkbox inside its label: a press flips the box and reports the change.
const toggleLegend = (chip) => {
  const input = legendInput(chip);
  input.checked = !input.checked;
  input.dispatchEvent(new Event('change'));
};
const dotsOf = (c) => byClass(c, 'df-chart-dot');
const click = (el) => el.dispatchEvent(new Event('click'));

test('legend chips hide series from the plot, readout, and table; rescale is opt-in; all hidden shows a message', () => {
  const spec = {
    type: 'line',
    toggles: true,
    series: [{ name: 'Low', data: [[1, 1], [2, 2]] }, { name: 'High', data: [[1, 50], [2, 90]] }, { name: 'Mid', data: [[1, 5]] }]
  };
  const c = draw(spec);
  const low = () => dotsOf(c)[0].getAttribute('cy');
  const before = low();
  toggleLegend(legendButton(c, 'High'));
  assert.equal(legendInput(legendButton(c, 'High')).checked, false);
  assert.ok(legendButton(c, 'High').classList.contains('is-off'));
  assert.equal(dotsOf(c).length, 3, 'only Low and Mid are drawn');
  assert.equal(low(), before, 'the y axis stays put without rescale');
  c.fire('keydown', { key: 'Home' });
  assert.doesNotMatch(c.tip().textContent, /High/);
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
  toggleLegend(legendButton(c, 'Mid'));
  assert.equal(empty.hidden, true);
  assert.equal(dotsOf(c).length, 1);
  assert.equal(c.api.visible('Nope', false), false);
});

function legendClock(reduced = false) {
  const frames = new Map();
  let id = 0;
  return {
    frames,
    animation: {
      matchMedia: () => ({ matches: reduced }),
      requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
      cancelAnimationFrame(id) { frames.delete(id); }
    },
    tick(now) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(now));
    }
  };
}

test('legend transitions retarget surviving bars and remove departing bars after they fade', () => {
  const spec = { type: 'bar', toggles: true, series: [
    { name: 'First', data: [['A', 2]] }, { name: 'Second', data: [['A', 5]] }
  ] };
  const clock = legendClock();
  const c = draw(spec, clock);
  const bars = () => byClass(c, 'df-chart-bar');
  const first = () => bars().at(-1).getAttribute('d');
  const before = bars()[0].getAttribute('d');
  toggleLegend(legendButton(c, 'Second'));
  assert.equal(first(), before);
  clock.tick(0);
  clock.tick(110);
  const middle = first();
  assert.notEqual(middle, before);
  assert.ok(+bars()[0].parentNode.getAttribute('opacity') < 1);
  toggleLegend(legendButton(c, 'Second'));
  assert.equal(bars()[0].getAttribute('d'), middle);
  clock.tick(110);
  clock.tick(350);
  assert.equal(bars()[0].getAttribute('d'), before);
  assert.equal(bars()[1].parentNode.getAttribute('opacity'), null);

  toggleLegend(legendButton(c, 'Second'));
  clock.tick(400);
  clock.tick(700);
  assert.equal(bars().length, 1);

  const still = legendClock(true);
  const reduced = draw(spec, still);
  toggleLegend(legendButton(reduced, 'Second'));
  assert.equal(byClass(reduced, 'df-chart-bar').length, 1);
  assert.equal(still.frames.size, 0);
});

test('pie slices interpolate their angles and update the visible shares, with stable keys across updates', () => {
  const clock = legendClock();
  const spec = { type: 'pie', toggles: true, data: [
    { label: 'North', value: 3, key: 'n' }, { label: 'South', value: 1, key: 's' }
  ] };
  const c = draw(spec, clock);
  c.fire('pointermove', { clientX: 200, clientY: 50 });
  assert.match(c.tip().textContent, /North.*75%/);
  const pathOf = () => byClass(c, 'df-chart-slice').at(-1).getAttribute('d');
  const north = byClass(c, 'df-chart-slice')[0].getAttribute('d');
  toggleLegend(legendButton(c, 'South'));
  assert.equal(pathOf(), north);
  clock.tick(0);
  clock.tick(120);
  const middle = pathOf();
  assert.notEqual(middle, north);
  clock.tick(240);
  assert.notEqual(pathOf(), middle);
  assert.equal(byClass(c, 'df-chart-slice').length, 1);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /North.*100%/);
  click(byClass(c, 'df-chart-toggle')[0]);
  const table = byClass(c, 'df-chart-table')[0];
  assert.match(table.textContent, /North3100%/);
  assert.doesNotMatch(table.textContent, /South/);
  assert.ok(c.api.update({ ...spec, data: [{ label: 'South updated', key: 's', value: 4 }] }));
  assert.match(table.textContent, /Every slice is hidden/);
  assert.equal(legendInput(legendButton(c, 'South updated')).checked, false);
});

test('pie markup and mapped sources both use slice labels and opt-in legend controls', () => {
  const authored = new Node('div');
  const mapped = new Node('div');
  mapped.id = 'mapped-pie';
  mapped.setAttribute('data-df-source', 'counts');
  for (const host of [authored, mapped]) host.setAttribute('data-df-chart', 'pie');
  authored.setAttribute('data-df-toggles', '');
  const table = new Node('table');
  for (const values of [['Region', 'Count'], ['West', '1'], ['East', '3']]) {
    const row = table.insertRow();
    values.forEach((value) => { row.insertCell().textContent = value; });
  }
  authored.appendChild(table);
  const env = setup({ modules: ['data'], enhance(df, document, boot) {
    df.data.define('counts', { type: 'csv', text: 'area,count,code\nWest,1,w\nEast,3,e' });
    boot.optionLayers = (feature, id) => feature === 'chart' && id === mapped.id ? [{
      mapping: { x: 'area', series: [{ field: 'count', key: 'count', label: 'Count' }], pointKey: 'code' }
    }] : [];
    document.body.appendChild(authored);
    document.body.appendChild(mapped);
  } });
  assert.equal(byClass({ host: authored }, 'df-chart-series-toggle').length, 2);
  assert.equal(byClass({ host: mapped }, 'df-chart-series-toggle').length, 0);
  assert.deepEqual(Array.from(env.chart.get(mapped).model().series, (s) => [s.key, s.name]), [['w', 'West'], ['e', 'East']]);
  assert.equal(env.chart.get(mapped).model().y.label, 'Count');
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
        const step = DF.sequence.get(list).snapshot().key;
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
  const next = list.parentNode.children.find(el => el.classList.contains('df-stepper-controls')).children[3];
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
      tabs = DF._tabs;
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
      DF._all = (selector, scope = document.body) => {
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

function entranceClock(reduced = false) {
  const clock = legendClock(reduced);
  const watched = [];
  let notify = null;
  clock.animation.IntersectionObserver = class {
    constructor(fn) { notify = fn; }
    observe(el) { watched.push(el); }
    unobserve(el) { if (watched.includes(el)) watched.splice(watched.indexOf(el), 1); }
  };
  clock.watched = watched;
  clock.scrollTo = (el) => notify([{ target: el, isIntersecting: true }]);
  return clock;
}

const barSpec = { type: 'bar', series: [{ name: 'Runs', data: [{ x: 'a', y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] }] };
const awaiting = (c) => c.host.classList.contains('df-chart-await');
const barOf = (c, x) => byClass(c, 'df-chart-bar').find((el) => el.getAttribute('data-df-x') === x && !el.parentNode.getAttribute('pointer-events'));
const barD = (c, x) => barOf(c, x).getAttribute('d');

test('the entrance waits until the chart scrolls into view, grows bars and draws lines once, then stays put', () => {
  const clock = entranceClock();
  const c = draw(barSpec, clock);
  const final = barD(c, 'b');
  assert.ok(awaiting(c), 'marks stay hidden until seen');
  assert.equal(clock.frames.size, 0);
  clock.scrollTo(c.host);
  assert.ok(!awaiting(c));
  assert.equal(clock.watched.length, 0, 'watched only once');
  const start = barD(c, 'b');
  const ys = [...start.matchAll(/(?:V|,)(-?[\d.]+)/g)].map((m) => +m[1]);
  assert.equal(new Set(ys).size, 1, 'each bar starts flat on its baseline');
  clock.tick(0);
  clock.tick(350);
  assert.ok(![start, final].includes(barD(c, 'b')), 'mid-growth');
  clock.tick(700);
  assert.equal(barD(c, 'b'), final);
  assert.equal(clock.frames.size, 0);

  const lineClock = entranceClock();
  const line = draw({ series: [{ name: 'Loss', data: [[0, 3], [1, 2], [2, 1]] }] }, lineClock);
  lineClock.scrollTo(line.host);
  const path = byClass(line, 'df-chart-line')[0];
  assert.equal(path.getAttribute('pathLength'), '1');
  assert.equal(path.getAttribute('stroke-dashoffset'), '1', 'the line starts undrawn');
  assert.equal(dotsOf(line)[0].getAttribute('r'), '0', 'dots pop in from nothing');
  lineClock.tick(0);
  lineClock.tick(700);
  assert.equal(path.getAttribute('pathLength'), null);
  assert.equal(dotsOf(line)[0].getAttribute('r'), '4');
});

test('data-df-animate="false", motion: false, and reduced motion draw in place without waiting or tweening', () => {
  const clock = entranceClock();
  const env = setup(clock);
  const host = new Node('div');
  host.setAttribute('data-df-animate', 'false');
  env.document.body.appendChild(host);
  const api = env.chart(host, barSpec);
  assert.ok(!host.classList.contains('df-chart-await'));
  assert.equal(api.model().motion, false);
  api.update({ ...barSpec, series: [{ name: 'Runs', data: [{ x: 'a', y: 9, key: 'a' }] }] });
  assert.equal(clock.frames.size, 0);
  assert.equal(host.all().filter((el) => el.classList.contains('df-chart-bar')).length, 1, 'no departing bar lingers');

  const spec = draw({ ...barSpec, motion: false }, entranceClock());
  assert.ok(!awaiting(spec));
  const reducedClock = entranceClock(true);
  const reduced = draw(barSpec, reducedClock);
  assert.ok(!awaiting(reduced));
  reduced.api.update({ ...barSpec, series: [{ name: 'Runs', data: [{ x: 'a', y: 9, key: 'a' }] }] });
  assert.equal(reducedClock.frames.size, 0);
});

test('data updates tween each keyed bar from where it was drawn, fade new bars in, and remove departing ones', () => {
  const clock = legendClock();
  const c = draw(barSpec, clock);
  const oldB = barD(c, 'b');
  const next = { type: 'bar', series: [{ name: 'Runs', data: [
    { x: 'b', y: 3, key: 'b' }, { x: 'c', y: 4, key: 'c' }
  ] }] };
  assert.ok(c.api.update(next));
  assert.equal(barD(c, 'b'), oldB, 'b starts where it was, though it moved to the first category');
  assert.equal(barOf(c, 'c').getAttribute('opacity'), '0');
  const leaving = byClass(c, 'df-chart-bar').filter((el) => el.parentNode.getAttribute('pointer-events') === 'none');
  assert.deepEqual(leaving.map((el) => el.getAttribute('data-df-x')), ['a']);
  assert.equal(leaving[0].getAttribute(KEY), null, 'departing marks leave the selection group');
  clock.tick(0);
  clock.tick(120);
  assert.notEqual(barD(c, 'b'), oldB);
  clock.tick(240);
  assert.equal(barOf(c, 'c').getAttribute('opacity'), null);
  assert.deepEqual(byClass(c, 'df-chart-bar').map((el) => el.getAttribute('data-df-x')), ['b', 'c']);
  const settled = barD(c, 'b');
  c.api.update(next);
  assert.equal(clock.frames.size, 0, 'an unchanged redraw has nothing to move');
  assert.equal(barD(c, 'b'), settled);
});

test('add-on types draw through the core with their own description, legend, readout, and table', () => {
  const env = setup();
  const lollipop = {
    base: 'bar',
    legend: 'note',
    describe: (model) => 'Lollipop chart of ' + model.series.length + ' series.',
    readout(chart, spot, tip, kit) { kit.html('div', 'df-chart-tip-head', tip, 'Lollipop ' + spot.x); },
    table(model, kit) {
      const table = kit.html('table');
      model.series[0].points.forEach((p) => kit.html('td', '', kit.html('tr', '', table), p.x + '=' + p.y));
      return table;
    }
  };
  assert.ok(env.DocForm.chart.addon('test-lollipops', { types: { lollipop }, legends: {
    note(chart, legend, kit) { kit.html('span', 'df-test-note', legend, 'stems'); }
  } }));
  const host = new Node('div');
  env.document.body.appendChild(host);
  env.chart(host, { type: 'lollipop', series: [{ data: [['a', 1], ['b', 3]] }] });
  assert.ok(host.classList.contains('is-bar') && host.classList.contains('is-lollipop'));
  const plot = host.querySelector('.df-chart-plot');
  assert.match(plot.getAttribute('aria-label'), /^Lollipop chart of 1 series\./);
  assert.equal(host.querySelector('.df-test-note').textContent, 'stems');
  plot.dispatchEvent(Object.assign(new Event('keydown'), { key: 'End' }));
  assert.equal(host.querySelector('.df-chart-tip').textContent, 'Lollipop b');
  host.querySelector('.df-chart-toggle').dispatchEvent(new Event('click'));
  assert.equal(host.querySelector('.df-chart-table').textContent, 'a=1b=3');
  env.chart(host, { type: 'bar', data: [1] });
  assert.ok(!host.classList.contains('is-lollipop'));
});

const nums = (d) => (d.match(/-?[\d.]+/g) || []).map(Number);
const xsOf = (d) => nums(d).filter((_, i) => i % 2 === 0);
const ysOf = (d) => nums(d).filter((_, i) => i % 2 === 1);
const shapeOf = (d) => d.replace(/-?[\d.]+/g, '#');

test('horizontal bars list categories down the left with wrapped labels and read and select along y', () => {
  const long = 'a very long model name that wraps';
  const c = draw({ type: 'bar', orientation: 'horizontal', selectionGroup: 'g', y: 'Score',
    referenceLines: [{ axis: 'y', value: 3, label: 'Target' }, { axis: 'x', value: 'b' }],
    series: [{ name: 'Runs', data: [{ x: long, y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] }] });
  assert.ok(c.host.classList.contains('is-horizontal'));
  assert.match(c.plot.getAttribute('aria-label'), /^Horizontal bar chart of Runs\./);
  const [a, b] = ['a', 'b'].map((key) => c.mark(key).getAttribute('d'));
  assert.ok(Math.min(...ysOf(b)) > Math.max(...ysOf(a)), 'categories run down in order');
  assert.ok(Math.max(...xsOf(b)) > Math.max(...xsOf(a)) && Math.min(...xsOf(a)) === Math.min(...xsOf(b)),
    'values grow across from one baseline');
  const labels = byClass(c, 'df-chart-category');
  assert.ok(labels[0].children.filter((el) => el.tag === 'tspan').length > 1, 'the long label wraps');
  assert.ok(Math.max(...labels[0].children.map((el) => el.textContent.length)) < long.length);
  const [value, category] = byClass(c, 'df-chart-ref');
  assert.equal(value.getAttribute('x1'), value.getAttribute('x2'), 'value guides cross the plot vertically');
  assert.equal(category.getAttribute('y1'), category.getAttribute('y2'), 'category guides run across');

  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^a very long/);
  c.fire('keydown', { key: 'ArrowDown' });
  assert.match(c.tip().textContent, /^b6/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('g').get(), 'b');
  const middle = (ys) => (Math.min(...ys) + Math.max(...ys)) / 2;
  c.fire('pointermove', { clientX: Math.min(...xsOf(a)) + 2, clientY: middle(ysOf(a)) });
  assert.match(c.tip().textContent, /^a very long/, 'the pointer reads the nearest row');
  const at = c.api.coords(Math.max(...xsOf(b)), middle(ysOf(b)));
  assert.deepEqual([at.x, Math.round(at.y), at.yText.length > 0], ['b', 6, true]);
});

test('stacked bars restack after legend toggles while the readout and table follow the visible series', () => {
  const clock = legendClock();
  const c = draw({ type: 'bar', stack: 'percent', toggles: true, series: [
    { name: 'A', data: [['x', 1], ['y', 3]] }, { name: 'B', data: [['x', 3], ['y', 1]] }
  ] }, clock);
  assert.ok(c.host.classList.contains('is-stacked'));
  assert.match(c.plot.getAttribute('aria-label'), /^100% stacked bar chart of A, B\./);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /1 · 25%A3 · 75%B4Total/);
  const before = byClass(c, 'df-chart-series')[1].children[0].getAttribute('d');
  toggleLegend(legendButton(c, 'A'));
  const series = byClass(c, 'df-chart-series').filter((g) => !g.getAttribute('pointer-events'));
  assert.equal(series.length, 1);
  const moving = series[0].children[0];
  const round = (d) => nums(d).map((v) => +v.toFixed(3));
  assert.deepEqual(round(moving.getAttribute('d')), round(before), 'B starts where it sat on top of A');
  clock.tick(0);
  clock.tick(120);
  const mid = moving.getAttribute('d');
  assert.notEqual(mid, before);
  assert.equal(shapeOf(mid), shapeOf(before));
  clock.tick(400);
  assert.ok(Math.max(...ysOf(moving.getAttribute('d'))) > Math.max(...ysOf(before)), 'B now reaches down to the baseline');
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /3 · 100%B/);
  assert.doesNotMatch(c.tip().textContent, /Total/, 'one series has no total');
  click(c.host.querySelector('.df-chart-toggle'));
  const table = c.host.querySelector('.df-chart-table').textContent;
  assert.match(table, /BTotalx3 \(100%\)3y1 \(100%\)1/);
  assert.doesNotMatch(table, /A/);
});

test('switching orientation or stacking morphs keyed bars in place and keeps their selection', () => {
  const clock = legendClock();
  const spec = { type: 'bar', selectionGroup: 'g', series: [
    { name: 'Runs', data: [{ x: 'a', y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] },
    { name: 'Cost', data: [{ x: 'a', y: 1, key: 'ca' }, { x: 'b', y: 2, key: 'cb' }] }
  ] };
  const c = draw(spec, clock);
  c.fire('keydown', { key: 'Home' });
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('g').get(), 'a');
  const upright = c.mark('b').getAttribute('d');
  assert.ok(c.api.update({ ...spec, orientation: 'horizontal' }));
  assert.equal(c.mark('b').getAttribute('d'), upright, 'the bar starts upright');
  assert.equal(c.host.all().filter((el) => el.classList.contains('df-chart-bar')).length, 4, 'no cross-fade copies');
  clock.tick(0);
  clock.tick(120);
  const turning = c.mark('b').getAttribute('d');
  assert.notEqual(turning, upright);
  assert.equal(shapeOf(turning), shapeOf(upright));
  clock.tick(400);
  const flat = c.mark('b').getAttribute('d');
  assert.ok(Math.max(...xsOf(flat)) - Math.min(...xsOf(flat)) > Math.max(...ysOf(flat)) - Math.min(...ysOf(flat)));
  assert.ok(c.mark('a').hasAttribute('data-df-selection-active'), 'the selection survives the switch');

  assert.ok(c.api.update({ ...spec, orientation: 'horizontal', stack: 'stacked' }));
  clock.tick(0);
  clock.tick(400);
  const runs = xsOf(c.mark('b').getAttribute('d'));
  const cost = xsOf(c.mark('cb').getAttribute('d'));
  assert.equal(Math.min(...cost), Math.max(...runs), 'Cost starts where Runs ends');
  assert.ok(c.mark('a').hasAttribute('data-df-selection-active'));
  assert.equal(c.api.update({ ...spec, stack: 'percent', series: [{ name: 'Net', data: [['a', -1]] }] }), false);
  assert.equal(c.mark('b').getAttribute('d') !== null, true, 'a rejected update keeps the chart');
});

test('data-df-orientation and data-df-stack lay out bars from markup and leave the source table for a generated one', () => {
  const env = setup();
  const host = env.document.body.appendChild(new Node('div'));
  host.setAttribute('data-df-chart', 'bar');
  host.setAttribute('data-df-orientation', 'horizontal');
  host.setAttribute('data-df-stack', 'stacked');
  const table = host.appendChild(new Node('table'));
  [['Run', 'Train', 'Eval'], ['a', '2', '1'], ['b', '3', '4']].forEach((cells) => {
    const tr = table.appendChild(new Node('tr'));
    cells.forEach((text) => Object.assign(tr.appendChild(new Node('td')), { text }));
  });
  const api = env.chart.mount(host);
  assert.deepEqual([api.model().orientation, api.model().stack], ['horizontal', 'stacked']);
  host.querySelector('.df-chart-toggle').dispatchEvent(new Event('click'));
  assert.equal(host.querySelector('.df-chart-table').textContent, 'RunTrainEvalTotala213b347');
});

test('interval plots dodge, draw bounds and references in both orientations, and keep selection through tweens', () => {
  const clock = legendClock();
  const spec = { type: 'interval', orientation: 'horizontal', mark: 'lollipop', selectionGroup: 'interval-demo',
    x: 'Group', y: 'Score', toggles: true, referenceLines: [{ axis: 'y', value: 5 }, { axis: 'x', value: 'Alpha' }],
    series: [
      { name: 'Baseline', data: [{ x: 'Alpha', y: 3, key: 'a' }, { x: 'Bravo', y: 8, key: 'b',
        interval: { lower: 7, upper: 9, label: 'Example bounds', count: 12 } }] },
      { name: 'Follow-up', data: [{ x: 'Bravo', y: 8, key: 'b-follow' }] }
    ] };
  const c = draw(spec, { ...clock, modules: ['chart-intervals'] });
  const at = (key, coordinate) => Number(c.mark(key).getAttribute(coordinate));
  assert.match(c.plot.getAttribute('aria-label'), /^Horizontal lollipop plot/);
  assert.equal(at('b', 'cx'), at('b-follow', 'cx'));
  assert.ok(at('b', 'cy') < at('b-follow', 'cy') && at('b-follow', 'cy') < at('a', 'cy'));
  const bound = () => byClass(c, 'df-chart-whisker')[0].getAttribute('d');
  const horizontal = bound();
  const [lowerX, lowerY, upperX, upperY] = nums(horizontal);
  assert.equal(lowerY, upperY);
  assert.ok(lowerX < at('b', 'cx') && upperX > at('b', 'cx'));
  assert.equal(byClass(c, 'df-chart-interval-stem').length, 3);
  const valueRef = () => byClass(c, 'df-chart-ref')[0];
  assert.equal(valueRef().getAttribute('x1'), valueRef().getAttribute('x2'));
  c.point(c.mark('b'), 'pointermove');
  assert.match(c.tip().textContent, /Bravo.*Example bounds \[7, 9\] \(n = 12\)/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('interval-demo').get(), 'b');
  const oldX = at('b', 'cx');
  assert.ok(c.api.update({ ...spec, orientation: 'vertical' }));
  assert.equal(at('b', 'cx'), oldX);
  assert.equal(bound(), horizontal, 'the whisker starts from its horizontal coordinates');
  clock.tick(0);
  clock.tick(120);
  assert.notEqual(bound(), horizontal, 'the whisker moves with the dot');
  clock.tick(400);
  assert.equal(at('b', 'cy'), at('b-follow', 'cy'));
  assert.ok(at('b', 'cx') < at('b-follow', 'cx') && at('b-follow', 'cx') < at('a', 'cx'));
  assert.equal(valueRef().getAttribute('y1'), valueRef().getAttribute('y2'));
  assert.ok(c.mark('b').hasAttribute('data-df-selection-active'));
  const before = at('b', 'cx');
  toggleLegend(legendButton(c, 'Follow-up'));
  assert.equal(at('b', 'cx'), before);
  clock.tick(400);
  clock.tick(800);
  assert.ok(at('b', 'cx') > before, 'the remaining series recentres');
  assert.equal(c.mark('b-follow'), undefined);
  click(c.host.querySelector('.df-chart-toggle'));
  const table = c.host.querySelector('.df-chart-table');
  assert.deepEqual(table.querySelectorAll('tr').map((row) => row.textContent), [
    'GroupBaseline', 'Bravo8Example bounds [7, 9] (n = 12)', 'Alpha3'
  ]);
  assert.ok(table.querySelector('[data-df-key="b"]').hasAttribute('data-df-selection-active'));
});

test('interval markup ranks the interactive table while retaining the authored fallback', () => {
  const env = setup({ modules: ['chart-intervals'] });
  const host = env.document.body.appendChild(new Node('div'));
  host.setAttribute('data-df-chart', 'interval');
  const table = host.appendChild(new Node('table'));
  [['Group', 'Score'], ['Alpha', '2'], ['Bravo', '4']].forEach((cells) => {
    const tr = table.appendChild(new Node('tr'));
    cells.forEach((text) => Object.assign(tr.appendChild(new Node('td')), { text }));
  });
  const api = env.chart.mount(host);
  assert.equal(api.model().intervalMark, 'dot');
  assert.equal(host.querySelectorAll('.df-chart-dot').length, 2);
  assert.equal(host.querySelectorAll('.df-chart-interval-stem').length, 0);
  click(host.querySelector('.df-chart-toggle'));
  assert.equal(host.querySelector('.df-chart-table').textContent, 'GroupScoreBravo4Alpha2');
  assert.equal(table.textContent, 'GroupScoreAlpha2Bravo4');
});

test('log histogram renders zero bins empty and reads them by their actual edges in the plot and table', () => {
  const c = draw({ type: 'histogram', x: { type: 'log' }, y: { type: 'log' },
    edges: [1, 2, 100, 1000], counts: [2, 0, 4] }, { modules: ['chart-histogram', 'data'] });
  const [first, zero, last] = byClass(c, 'df-chart-histogram-bar');
  assert.equal(Number(zero.getAttribute('height')), 0);
  assert.ok(Number(first.getAttribute('height')) > 0 && Number(last.getAttribute('height')) > 0);
  const x = Number(zero.getAttribute('x')) + 2;
  const y = Number(zero.getAttribute('y')) - 20;
  c.fire('pointermove', { clientX: x, clientY: y });
  assert.equal(c.tip().textContent, '[2, 100)0', 'the pointer enters the bin at its edge even far from its midpoint');
  assert.ok(c.api.coords(x, y).y > 0);
  click(c.host.querySelector('.df-chart-toggle'));
  assert.deepEqual(c.host.querySelector('.df-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinCount', '[1, 2)2', '[2, 100)0', '[100, 1,000]4']);
  assert.equal(c.api.update({ ...c.api.spec(), counts: [1, -2, 3] }), false);
  assert.equal(c.api.update({ ...c.api.spec(), counts: [1, 0, 3] }), true);
  assert.match(c.host.querySelector('.df-chart-table').textContent, /\[100, 1,000\]3$/);
});

test('a live bin slider tweens existing histogram slots and preserves exact-edge selection', () => {
  const clock = legendClock();
  let slider, scope;
  const c = draw({ type: 'histogram', bins: 2, y: { max: 6 }, data: [0, 1, 2, 3, 4], selectionGroup: 'bins' }, {
    ...clock, modules: ['chart-histogram', 'params', 'data'],
    enhance(DF, document) {
      scope = DF._parameters.define('histogram', { bins: { type: 'range', min: 1, max: 6, step: 1, default: 2 } });
      const controls = document.body.appendChild(new Node('div'));
      controls.setAttribute('data-df-parameter-scope', 'histogram');
      controls.setAttribute('data-df-parameter', 'bins');
      slider = controls;
    }
  });
  scope.subscribe((values) => c.api.update({ ...c.api.spec(), bins: values.bins }), { keys: ['bins'] });
  const first = () => byClass(c, 'df-chart-histogram-bar').find((bar) => bar.getAttribute('data-df-bin') === '0');
  const width = () => Number(first().getAttribute('width'));
  const before = width();
  c.fire('keydown', { key: 'Home' });
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('bins').get(), 'bin:0:2');
  const input = slider.querySelector('input');
  input.valueAsNumber = 4;
  input.dispatchEvent(new Event('input'));
  assert.equal(c.api.spec().bins, 4);
  assert.equal(width(), before);
  clock.tick(0);
  clock.tick(120);
  assert.ok(width() < before && width() > before / 2);
  clock.tick(400);
  assert.equal(width(), before / 2);
  assert.equal(c.selection.group('bins').get(), 'bin:0:2');
  assert.equal(c.marks().filter((el) => el.hasAttribute('data-df-selection-active')).length, 0);
  input.valueAsNumber = 2;
  input.dispatchEvent(new Event('input'));
  clock.tick(400);
  clock.tick(800);
  assert.equal(byClass(c, 'df-chart-histogram-bar').length, 2);
  assert.ok(first().hasAttribute('data-df-selection-active'));
});

test('stacked histogram bars restack and retain shared bin widths and counts after legend filtering', () => {
  const c = draw({ type: 'histogram', stack: 'stacked', toggles: true, edges: [0, 1, 3],
    series: [{ name: 'A', counts: [1, 1] }, { name: 'B', counts: [2, 2] }] }, { modules: ['chart-histogram'] });
  const [a, , b] = byClass(c, 'df-chart-histogram-bar');
  const coord = (el, attr) => Number(el.getAttribute(attr));
  assert.equal(coord(a, 'width'), coord(b, 'width'));
  assert.equal(coord(a, 'y'), coord(b, 'y') + coord(b, 'height'));
  c.fire('keydown', { key: 'Home' });
  assert.equal(c.tip().textContent, '[0, 1)1A2B');
  c.fire('keydown', { key: 'ArrowRight' });
  assert.equal(c.tip().textContent, '[1, 3]1A2B');
  toggleLegend(legendButton(c, 'A'));
  const [visible, wider] = byClass(c, 'df-chart-histogram-bar');
  assert.equal(coord(visible, 'y') + coord(visible, 'height'), coord(a, 'y') + coord(a, 'height'));
  assert.ok(Math.abs(coord(wider, 'width') / coord(visible, 'width') - 2) < 1e-12);
  click(c.host.querySelector('.df-chart-toggle'));
  assert.deepEqual(c.host.querySelector('.df-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinB', '[0, 1)2', '[1, 3]2']);
  assert.ok(c.api.setRange([2.5, 3]));
  assert.deepEqual(c.host.querySelector('.df-chart-table').querySelectorAll('tr').map((row) => row.textContent),
    ['BinB', '[1, 3]2'], 'narrowing into the edge of a bin keeps its original interval and count');
});

const heatSpec = { type: 'heatmap', x: 'Hour', y: 'Day', value: { label: 'Visits' }, columns: ['9', '10', '11'],
  rows: ['Mon', 'Tue'], z: [[1, 5, 9], [3, null, 7]], selectionGroup: 'cells' };
const cellsOf = (c) => byClass(c, 'df-heatmap-cell');
const cellAt = (c, key) => cellsOf(c).find((el) => el.getAttribute(KEY) === key);

test('heatmap cells read by row and column, move between rows, select keys, and list a grid table', () => {
  const c = draw(heatSpec, { modules: ['chart-heatmap'] });
  assert.equal(cellsOf(c).length, 5, 'missing cells draw no mark');
  assert.ok(c.host.classList.contains('is-heatmap'));
  const low = cellAt(c, 'cell:Mon:9');
  const high = cellAt(c, 'cell:Mon:11');
  assert.ok(+low.getAttribute('fill-opacity') < +high.getAttribute('fill-opacity'));
  c.fire('keydown', { key: 'Home' });
  assert.equal(c.tip().textContent, 'Mon · 91Visits');
  c.fire('keydown', { key: 'ArrowDown' });
  assert.match(c.tip().textContent, /^Tue · 93/);
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /^Tue · 117/, 'reading skips the missing cell');
  c.fire('keydown', { key: 'ArrowUp' });
  assert.match(c.tip().textContent, /^Mon · 119/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('cells').get(), 'cell:Mon:11');
  const x = +low.getAttribute('x') + 2;
  const y = +low.getAttribute('y') + 2;
  c.fire('pointermove', { clientX: x, clientY: y });
  assert.match(c.tip().textContent, /^Mon · 91/);
  assert.deepEqual([c.api.coords(x, y).x, c.api.coords(x, y).y, c.api.coords(x, y).yText], ['9', 'Mon', 'Mon · 1']);
  assert.match(c.plot.getAttribute('aria-label'), /^Heatmap of Visits by Day and Hour, 2 rows by 3 columns/);
  click(c.host.querySelector('.df-chart-toggle'));
  const table = c.host.querySelector('.df-chart-table');
  assert.deepEqual(table.querySelectorAll('tr').map((row) => row.textContent), ['Day91011', 'Mon159', 'Tue37']);
  assert.ok(table.querySelectorAll('td').find((td) => td.getAttribute(KEY) === 'cell:Mon:11').hasAttribute('data-df-selection-active'));
});

test('the heatmap colour scale filters cells by value range from the pointer, keys, and API', () => {
  const c = draw(heatSpec, { modules: ['chart-heatmap'] });
  const events = [];
  c.host.addEventListener('df:chart:heatmap-range', ({ detail }) => events.push(detail));
  const dimmed = () => cellsOf(c).filter((el) => el.classList.contains('is-dimmed')).map((el) => el.getAttribute(KEY));
  const reset = c.host.querySelector('.df-heatmap-filter-reset');
  assert.equal(reset.hidden, true);
  c.fire('keydown', { key: 'PageUp' });
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [8, 9]);
  assert.deepEqual(dimmed(), ['cell:Mon:9', 'cell:Mon:10', 'cell:Tue:9', 'cell:Tue:11']);
  assert.equal(reset.hidden, false);
  assert.equal(c.host.querySelector('.df-heatmap-filter-text').textContent, 'Values 8 – 9');
  c.fire('keydown', { key: 'PageDown' });
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [6, 8]);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /Outside the value range$/);
  c.fire('keydown', { key: 'Escape' });
  assert.equal(c.chart._heatmap.valueRange(c.host), null);
  assert.deepEqual(dimmed(), []);

  const hit = c.host.querySelector('.df-heatmap-scale-hit');
  const top = +hit.getAttribute('y') + 4;
  const bottom = top + +hit.getAttribute('height') - 8;
  const at = (value) => bottom - (value - 1) / 8 * (bottom - top);
  const pointer = (type, value) => hit.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
    button: 0, clientY: at(value) }));
  pointer('pointerdown', 6.5);
  pointer('pointermove', 2.5);
  assert.deepEqual(dimmed(), ['cell:Mon:9', 'cell:Mon:11', 'cell:Tue:11'], 'dragging dims live');
  const announced = events.length;
  pointer('pointerup', 2.5);
  assert.equal(events.length, announced + 1, 'a drag is announced once when it ends');
  assert.deepEqual([...events.at(-1).current].map((v) => +v.toFixed(6)), [2.5, 6.5]);
  pointer('pointerdown', 5);
  pointer('pointerup', 5);
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [4, 6], 'a click picks the step between two ticks');
  pointer('pointerdown', 5);
  pointer('pointerup', 5);
  assert.equal(c.chart._heatmap.valueRange(c.host), null, 'clicking the chosen step again shows every value');

  assert.equal(c.chart._heatmap.valueRange(c.host, [6, 2]), false);
  assert.equal(c.chart._heatmap.valueRange(c.host, [0, 4]), true);
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [1, 4], 'ranges clamp to the scale');
  assert.equal(c.api.update({ ...heatSpec, z: [[1, 2, 3], [4, 5, 6]] }), true);
  assert.deepEqual(dimmed(), ['cell:Tue:10', 'cell:Tue:11'], 'the filter applies to replaced values');
  click(reset);
  assert.equal(c.chart._heatmap.valueRange(c.host), null);
  assert.deepEqual(events.at(-1).origin, 'user');
});

test('heatmap cells enter by fading in and tween colour strength on updates', () => {
  const clock = entranceClock();
  const spec = { type: 'heatmap', scale: { type: 'diverging' }, columns: ['a', 'b'], rows: ['r'], z: [[-2, 2]], selectionGroup: 'g' };
  const c = draw(spec, { ...clock, modules: ['chart-heatmap'] });
  const cell = (key) => cellAt(c, key);
  assert.ok(awaiting(c));
  clock.scrollTo(c.host);
  clock.tick(0);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0');
  clock.tick(1000);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0.9');
  assert.equal(cell('cell:r:a').getAttribute('data-df-heat'), 'low');
  assert.equal(c.api.update({ ...spec, z: [[-1, 2]] }), true);
  clock.tick(1000);
  clock.tick(1120);
  const mid = +cell('cell:r:a').getAttribute('fill-opacity');
  assert.ok(mid > 0.45 && mid < 0.9, 'strength tweens from the displayed value');
  clock.tick(2000);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0.45');
});

test('heatmaps draw contours on numeric grids and read long-form records from a named source', () => {
  const host = new Node('div');
  host.id = 'grid';
  host.setAttribute('data-df-chart', 'heatmap');
  host.setAttribute('data-df-source', 'field');
  const env = setup({ modules: ['data', 'chart-heatmap'], enhance(df, document, boot) {
    df.data.define('field', { type: 'csv', text: 'col,row,v,id\n0,0,0,a\n1,0,4,b\n0,1,4,c\n1,1,8,d' });
    boot.optionLayers = (feature) => feature === 'chart' ?
      [{ mapping: { x: 'col', y: 'row', z: 'v', pointKey: 'id' }, contours: { levels: [2, 6], labels: true } }] : [];
    document.body.appendChild(host);
  } });
  const api = env.chart.get(host);
  assert.deepEqual(JSON.parse(JSON.stringify(api.model().heatmap.z)), [[0, 4], [4, 8]]);
  const contours = host.querySelectorAll('.df-heatmap-contour');
  assert.deepEqual(contours.map((el) => el.getAttribute('data-df-level')), ['2', '6']);
  assert.deepEqual(host.querySelectorAll('.df-heatmap-contour-label').map((el) => el.textContent), ['2', '6']);
  assert.equal(api.model().series[0].points[3].key, 'd');
  assert.match(host.querySelector('.df-chart-plot').getAttribute('aria-label'), /Contour lines mark levels 2, 6/);
});

const choiceList = (...values) => values.map((value) => ({ value, label: value }));

function linked({ define, groups, animation, build, modules = [] }) {
  let scope;
  const nodes = {};
  const env = setup({ groups, animation, modules: ['params', 'chart-histogram', 'chart-heatmap', ...modules], enhance(df, document) {
    scope = df._parameters.define('look', define);
    build?.((tag, id, attrs) => {
      const el = document.body.appendChild(new Node(tag));
      el.id = id;
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      return nodes[id] = el;
    });
  } });
  const mount = (id, bind, spec) => {
    const host = env.document.body.appendChild(new Node('div'));
    host.id = id;
    host.setAttribute('data-df-scope', 'look');
    host.setAttribute('data-df-chart-bind', typeof bind === 'string' ? bind : JSON.stringify(bind));
    return env.chart(host, spec);
  };
  return { ...env, scope, nodes, mount };
}

test('chart bindings apply parameter values through update and roll back values the chart rejects', () => {
  const env = linked({
    animation: legendClock(true).animation,
    define: {
      layout: { type: 'select', choices: choiceList('vertical', 'horizontal') },
      stacking: { type: 'select', choices: choiceList('none', 'stacked', 'percent') },
      cut: { type: 'range', min: -5, max: 10, default: 3 },
      shown: { type: 'multiselect', choices: choiceList('a', 'b') },
      bins: { type: 'range', min: 1, max: 600, step: 1, default: 3 },
      lo: { type: 'range', min: 0, max: 10, default: 0 }
    },
    build: (el) => el('fieldset', 'stacking', { 'data-df-scope': 'look', 'data-df-choice': 'stacking' })
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

  const heat = env.mount('heat', { colorMax: 'cut' }, heatSpec);
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
      const scoped = (id, when, value) => el('p', id, { 'data-df-scope': 'look', 'data-df-show-when': when,
        ...(value === undefined ? {} : { 'data-df-show-value': value }) });
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
  assert.ok(nodes.high.classList.contains('df-show-when'));

  assert.equal(scope.update({ cut: 1, layout: 'horizontal', shown: [] }), true);
  assert.ok(nodes.high.classList.contains('df-show-leave'));
  assert.equal(nodes.high.hidden, false, 'a leaving element stays until its fade ends');
  assert.equal(nodes.wide.hidden, false);
  assert.ok(nodes.wide.classList.contains('df-show-enter'));
  timers.splice(0).forEach((fn) => fn());
  frames.splice(0).forEach((fn) => fn());
  frames.splice(0).forEach((fn) => fn());
  assert.deepEqual(visible(), { high: false, wide: true, withB: false, any: false, broken: true });
  assert.ok(!nodes.wide.classList.contains('df-show-enter') && !nodes.high.classList.contains('df-show-leave'));
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
      el('p', 'passive', { 'data-df-selection-group': 'runs', 'data-df-key': 'c' });
      el('fieldset', 'many', { 'data-df-scope': 'look', 'data-df-choice': 'many' });
    }
  });
  const { scope, selection, DocForm: df } = env;
  const runs = selection.group('runs');
  const picked = selection.group('picked');
  const origins = [];
  env.document.addEventListener('df:parameters:change', ({ detail }) => origins.push(detail.origin));
  assert.equal(scope.get('run'), 'b', 'a configured group key starts the select');
  assert.equal(scope.get('quiet'), 'b');

  assert.equal(scope.set('run', 'c'), true);
  assert.equal(runs.get(), 'c');
  assert.ok(env.nodes.passive.hasAttribute('data-df-selection-active'));
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
  assert.deepEqual(labels.map((label) => [label.getAttribute('data-df-selection-group'), label.getAttribute('data-df-key')]),
    [['picked', 'a'], ['picked', 'b'], ['picked', 'c']]);
  assert.equal(df._parameters.define('bad', { n: { type: 'range', selectionGroup: 'runs' } }), null);
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
  host.setAttribute('data-df-chart-playback', 'state');
  host.setAttribute('data-df-target', target);
  host.setAttribute('data-df-scope', 'look');
  for (const [name, value] of Object.entries(attrs)) host.setAttribute(name, value);
  return { host, playback: env.DocForm._chartPlayback.mount(host, checkpoints && { checkpoints }) };
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
  const status = env.document.body.querySelector('.df-pill-count');
  const barCount = () => bars.element.all().filter((el) => el.classList.contains('df-chart-bar')).length;
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
  rejects([{ key: 'k' }], /Unknown playback mode "steps"/, { 'data-df-chart-playback': 'steps' });
  assert.equal(statePlayback(env, 'line-state', 'trend', [{ key: 'k' }]).playback, null);
  assert.match(warnings.at(-1), /non-line chart/);

  const markup = env.document.body.appendChild(new Node('ol'));
  markup.id = 'markup';
  markup.setAttribute('data-df-chart-playback', 'state');
  markup.setAttribute('data-df-target', 'hist');
  markup.setAttribute('data-df-scope', 'look');
  const item = (key, state) => {
    const li = markup.appendChild(new Node('li'));
    li.setAttribute('data-df-key', key);
    li.setAttribute('data-df-state', state);
    return li;
  };
  const zoom = item('zoom', '{"range": [2, 6], "params": {"bins": 8}}');
  const broken = item('one', '{series: m}');
  assert.equal(env.DocForm._chartPlayback.mount(markup), null);
  assert.match(warnings.at(-1), /Invalid checkpoint "one"/);
  broken.setAttribute('data-df-state', '{"series": ["m"]}');
  const playback = env.DocForm._chartPlayback.mount(markup);
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

  assert.equal(playback.play(), true);
  assert.equal(hist.visible('n'), false);
  hist.visible('n', true);
  assert.equal(hist.update(spec([10])), true);
  assert.equal(playback.snapshot().playing, true, 'a leg keeps playing through replacement');
  assert.equal(hist.visible('n'), false, 'with the state it is heading to');
  clock.advance(0);
  clock.advance(900);
  assert.equal(playback.snapshot().key, 'one');
  assert.equal(playback.snapshot().canNext, false);
});

test('a mounted pipeline preserves fork geometry, tracing, keyboard navigation, and keyed details', () => {
  let host, document, inline, external;
  const graph = [];
  const { DocForm, warnings } = setup({
    modules: ['detail', 'diagram', 'pipeline'],
    groups: { flow: { initial: 'write' } },
    animation: { addEventListener() {}, getComputedStyle: () => ({ columnGap: '40px', rowGap: '20px', position: 'fixed' }) },
    enhance(_df, doc) {
      document = doc;
      document.readyState = 'complete';
      function add(parent, tag, attrs) {
        const el = parent.appendChild(new Node(tag));
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
        return el;
      }
      host = add(document.body, 'figure', { id: 'flow', class: 'df-pipeline', [GROUP]: 'flow', 'data-df-detail-layout': 'side' });
      // A connected stage allows the production measurement and SVG drawing to run.
      const create = doc.createElement;
      doc.createElement = (tag) => Object.assign(create(tag), { isConnected: true });
      const list = add(host, 'ol', { class: 'df-pipe-blocks' });
      [
        ['write', 'links terms', 100, 40],
        ['links', 'merge', 80, 30],
        ['terms', 'merge', 120, 50],
        ['merge', 'share', 12, 12],
        ['share', '', 90, 40]
      ].forEach(([id, to, width, height]) => {
        const el = add(list, 'li', { id, class: id === 'merge' ? 'df-pipe-junction' : 'df-pipe-block', 'data-df-to': to });
        el.offsetWidth = width;
        el.offsetHeight = height;
        el.focus = () => {
          document.activeElement = el;
          el.dispatchEvent(new Event('focus'));
        };
        graph.push(el);
      });
      const route = add(graph[2], 'a', { class: 'df-pipe-link', href: '#merge', 'data-df-line': 'dashed', 'data-df-label': 'Review' });
      route.textContent = 'Review';
      inline = add(host, 'div', { class: 'df-detail-pane' });
      external = add(doc.body, 'div', { class: 'df-detail-pane', 'data-df-detail-for': 'flow' });
      [inline, external].forEach(pane => {
        ['write', 'links', 'terms', 'share'].forEach(key => add(pane, 'div', { [KEY]: key }));
      });
    }
  });
  const stage = host.querySelector('.df-pipe-stage');
  const lines = host.querySelector('.df-pipe-lines');
  const controller = DocForm._pipeline.get('flow');
  const [write, links, terms, merge, share] = graph;
  const geometry = () => ({
    blocks: graph.map(({ style }) => [style.left, style.top, style.minHeight]),
    viewBox: lines.getAttribute('viewBox'),
    paths: lines.querySelectorAll('.df-pipe-path').map(path => path.getAttribute('d')),
    label: host.querySelector('.df-pipe-label').textContent
  });
  const original = geometry();
  assert.deepEqual(original, {
    blocks: [
      ['32px', '72px', ''],
      ['192px', '32px', '50px'],
      ['172px', '102px', ''],
      ['332px', '86px', undefined],
      ['384px', '72px', '']
    ],
    viewBox: '0 0 506 184',
    paths: [
      'M144 92C168 92 162 57 186 57',
      'M144 92C168 92 142 127 166 127',
      'M272 57C303.4 57 310.3 77.3 338 92',
      'M292 127C316.3 127 318.7 106.7 338 92',
      'M338 92C362 92 354 92 378 92',
      'M144 92L132 92'
    ],
    label: 'Review'
  });
  assert.equal(controller.layout(), true);
  assert.deepEqual(geometry(), original);
  assert.equal(terms.querySelector('.df-pipe-link').tabIndex, -1);
  assert.ok(lines.querySelector('.df-pipe-line-dashed'));
  assert.deepEqual(warnings, []);

  function current(key) {
    assert.equal(controller.snapshot().key, key);
    assert.equal(controller.snapshot().blockId, key);
    assert.equal(DocForm.selection.group('flow').get(), key);
    [inline, external].forEach(pane => {
      assert.equal(DocForm._detailPane.get(pane).snapshot().key, key);
      assert.deepEqual(pane.children.filter(child => !child.inert).map(child => child.getAttribute(KEY)), [key]);
    });
    assert.deepEqual(graph.filter(el => el.hasAttribute('aria-current')).map(el => el.id), [key]);
  }

  function fire(el, type, props) {
    const event = Object.assign(new Event(type, { cancelable: true }), props);
    el.dispatchEvent(event);
    return event;
  }

  current('write');
  assert.equal(write.tabIndex, 0);
  fire(terms, 'pointermove', { pointerType: 'touch' });
  current('write');
  fire(terms, 'pointermove', { pointerType: 'mouse' });
  current('terms');
  assert.deepEqual(graph.filter(el => el.hasAttribute('data-df-pipe-trace')), [write, terms, merge, share]);
  fire(stage, 'pointerleave');
  assert.equal(host.classList.contains('df-pipe-tracing'), false);

  write.focus();
  assert.equal(fire(write, 'keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  current('terms');
  fire(terms, 'keydown', { key: 'ArrowUp' });
  current('links');
  assert.equal(links.tabIndex, 0);
  fire(links, 'keydown', { key: 'ArrowDown' });
  current('terms');
  fire(terms, 'keydown', { key: 'ArrowRight' });
  current('share');
  assert.equal(document.activeElement, share);
  fire(host, 'focusout', { relatedTarget: document.body });
  assert.equal(host.classList.contains('df-pipe-tracing'), false);
  DocForm.selection.group('flow').select('write');
  current('write');
  assert.equal(share.tabIndex, 0);
  fire(terms, 'click');
  current('terms');
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
  const { DocForm, selection } = setup({
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
    enhance(df, document, boot) {
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
        host.addEventListener('df:step', event => {
          assert.equal(event.bubbles, true);
          events.get(name).push({ ...event.detail });
        });
        return host;
      }
      function item(parent, tag, key, labelTag = 'span') {
        const node = add(parent, tag, { [KEY]: key });
        add(node, labelTag, { 'data-df-step-label': '' }, key);
        if (key === 'start') node.setAttribute('data-df-initial', '');
        return node;
      }

      const stepper = member('stepper', 'ol', { 'data-df-stepper': '' });
      keys.forEach(key => item(stepper, 'li', key));
      const figure = member('figure', 'div', { class: 'df-figure-steps' });
      add(figure, 'figure');
      const panel = add(figure, 'div', { class: 'df-step-panel' });
      keys.forEach(key => item(panel, 'button', key));
      const animation = member('animation', 'figure', {});
      add(animation, 'svg');
      boot.prepareSelection();
      boot.setupComplete = false;
      df._animation.mount(animation, { steps: keys.slice(1).map(key => ({ key, actions: [] })) });
      boot.setupComplete = true;

      const chart = add(document.body, 'div', { id: 'chart-target', 'data-df-chart': 'line' });
      add(chart, 'script', { type: 'application/json' }, JSON.stringify({ type: 'line', data: [[0, 1], [2, 3]] }));
      const tour = member('chart', 'ol', { 'data-df-chart-playback': '', 'data-df-target': chart.id });
      keys.forEach((key, index) => item(tour, 'li', key).setAttribute('data-df-x', String(index)));

      const pipeline = member('pipeline', 'figure', { class: 'df-pipeline' });
      const stages = add(pipeline, 'ol', { 'data-df-pipeline-steps': '' });
      const flow = add(pipeline, 'ol', { class: 'df-pipe-blocks' });
      keys.forEach((key) => {
        item(stages, 'li', key);
        blocks.push(add(flow, 'li', { id: 'block-' + key, class: 'df-pipe-block', 'data-df-reveal-step': key }));
      });

      const scenarios = member('scenarios', 'table', { 'data-df-scenarios': '' });
      const header = scenarios.createTHead().insertRow();
      add(header, 'th', {}, 'Measure');
      add(header, 'th', {}, 'Unit');
      add(header, 'th', { [KEY]: 'baseline' }, 'Baseline');
      keys.forEach(key => item(header, 'th', key));
      const body = scenarios.createTBody();
      const condition = body.insertRow();
      condition.setAttribute('data-df-condition', '');
      const outcome = body.insertRow();
      ['Setting', '', '0', '1', '2', '3'].forEach((text, i) => add(condition, i ? 'td' : 'th', {}, text));
      ['Score', '', '1', '2', '3', '4'].forEach((text, i) => add(outcome, i ? 'td' : 'th', {}, text));
    }
  });
  const group = selection.group('tour');
  function check(name, index, origin) {
    const controller = DocForm.sequence.get(hosts.get(name));
    assert.equal(DocForm.sequence.get(name), controller);
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
  assert.deepEqual(blocks.map(block => block.hasAttribute('data-df-pipe-hidden')), [false, false, true]);
  for (const name of hosts.keys()) {
    const controller = DocForm.sequence.get(name);
    const seen = [];
    const stop = controller.subscribe((state, meta) => seen.push([state.key, meta.origin]), { immediate: true });
    assert.equal(controller.select('missing'), false);
    assert.equal(controller.select('end'), true);
    assert.equal(controller.next(), false);
    assert.equal(group.get(), 'end');
    for (const peer of hosts.keys()) check(peer, 2, peer === name ? 'api' : 'group');
    assert.ok(blocks.every(block => !block.hasAttribute('data-df-pipe-hidden')));
    assert.equal(controller.reset(), true);
    assert.equal(controller.prev(), false);
    assert.equal(group.get(), 'start');
    for (const peer of hosts.keys()) check(peer, 0, peer === name ? 'reset' : 'group');
    stop();
    assert.equal(group.select('middle'), true);
    for (const peer of hosts.keys()) check(peer, 1, 'group');
    assert.deepEqual(seen, [['middle', 'init'], ['end', 'api'], ['start', 'reset']], name);
  }

  const pipeline = DocForm._pipeline.get('pipeline').steps;
  assert.equal(pipeline, DocForm.sequence.get('pipeline'));
  assert.equal(pipeline.play(), true);
  assert.equal(pipeline.snapshot().playing, true);
  intervals.values().next().value();
  assert.equal(group.get(), 'end');
  assert.deepEqual(events.get('pipeline').at(-1), { key: 'end', index: 2, origin: 'playback' });
  assert.equal(pipeline.pause(), true);
  assert.equal(pipeline.snapshot().playing, false);
  assert.equal(intervals.size, 0);

  const animation = DocForm.sequence.get('animation');
  group.select('middle');
  assert.equal(animation.play(), true);
  assert.equal(animation.snapshot().playing, true);
  assert.equal(pendingFrames.size, 1);
  assert.equal(animation.pause(), true);
  assert.equal(animation.snapshot().playing, false);
  assert.equal(pendingFrames.size, 0);
  assert.deepEqual(events.get('animation').at(-1), { key: 'middle', index: 1, origin: 'group' });

});

test('figure step controls paint keyed SVG frames and restore the opening drawing', () => {
  let box, figure, route, marker, jump;
  const { DocForm } = setup({
    modules: ['detail', 'steps', 'anim'],
    animation: { cancelAnimationFrame() {}, clearTimeout() {} },
    enhance(df, document) {
      document.readyState = 'complete';
      box = document.body.appendChild(new Node('div'));
      box.className = 'df-figure-steps';
      box.setAttribute('data-df-step-layout', 'side');
      figure = box.appendChild(new Node('figure'));
      const svg = figure.appendChild(new Node('svg'));
      route = svg.appendChild(new Node('path'));
      marker = svg.appendChild(new Node('circle'));
      marker.setAttribute('r', '5');
      const panel = box.appendChild(new Node('div'));
      panel.className = 'df-step-panel';
      const start = panel.appendChild(new Node('button'));
      start.setAttribute(KEY, 'start');
      jump = panel.appendChild(new Node('button'));
      jump.setAttribute(KEY, 'jump');

      df._animation.mount(figure, {
        duration: 800, easing: 'linear', steps: [{
          key: 'jump', actions: [
            { draw: 'path' }, { fade: 'circle' },
            { move: 'circle', to: [40, 0] }, { attr: 'circle', name: 'r', to: 9 }
          ]
        }]
      });
    }
  });

  const frame = () => [route.style.strokeDashoffset, marker.style.opacity, marker.style.translate, marker.getAttribute('r')];
  assert.deepEqual(frame(), ['1', '0', '0px 0px', '5']);
  DocForm.sequence.get(figure).seek(400);
  assert.deepEqual(frame(), ['0.5', '0.5', '20px 0px', '7']);

  jump.dispatchEvent(new Event('focus'));
  assert.deepEqual(frame(), ['', '1', '40px 0px', '9']);
  assert.equal(jump.getAttribute('aria-current'), 'step');

  const controls = figure.querySelector('.df-figure-step-controls');
  controls.querySelector('.df-pill-previous').dispatchEvent(new Event('click'));
  assert.deepEqual(frame(), ['1', '0', '0px 0px', '5']);
  assert.equal(DocForm.sequence.get(box).key, 'start');
  assert.equal(DocForm.sequence.get(figure).key, 'start');
});

test('timelines link authored and mapped events, detail panes, and transactional source replacements', () => {
  const set = (node, attrs) => {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const figure = (id, attrs) => set(new Node('figure'), {
    class: 'df-timeline', id, [GROUP]: 'schedule', ...attrs
  });
  const pane = (attrs) => {
    const el = set(new Node('div'), { class: 'df-detail-pane', ...attrs });
    for (const key of ['draft', 'publish']) el.appendChild(set(new Node('p'), { [KEY]: key }));
    return el;
  };
  const calendar = figure('calendar', {});
  const sourceTimeline = figure('days', { 'data-df-source': 'releases' });
  const list = set(new Node('ol'), { class: 'df-timeline-events' });
  list.append(set(new Node('li'), {
    [KEY]: 'draft', 'data-df-start': '2028-02-28', 'data-df-end': '2028-03-01',
    'data-df-lane': 'Writing', 'data-df-label': 'Draft'
  }), set(new Node('li'), {
    id: 'publish', 'data-df-start': '2028-03-02', 'data-df-label': 'Publish', 'data-df-initial': ''
  }));
  const directPane = pane({});
  const externalPane = pane({ 'data-df-detail-for': 'days' });
  calendar.append(list, directPane);
  const input = (rows) => ({ type: 'csv', text: 'id,from,through,team,title\n' + rows.join('\n') });
  const original = input(['draft,0,2,Writing,Draft', 'publish,3,,Release,Publish']);
  const changes = [];
  sourceTimeline.addEventListener('df:timeline:change', ({ detail }) => changes.push(detail));
  let data;
  let resize;
  const env = setup({
    groups: { schedule: { initial: 'draft' } },
    modules: ['data', 'detail', 'diagram', 'timeline'],
    animation: { ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} } },
    enhance(DF, document, boot) {
      boot.optionLayers = (feature) => feature === 'timeline' ? [{
        mapping: { key: 'id', start: 'from', end: 'through', lane: 'team', label: 'title' }
      }] : [];
      document.body.append(calendar, sourceTimeline, externalPane);
      data = DF.data.define('releases', original);
      document.createElement = (tag) => {
        const element = new Node(tag);
        element.focus = () => { document.activeElement = element; element.dispatchEvent(new Event('focus')); };
        return element;
      };
    }
  });
  const { DocForm: DF, document, warnings } = env;
  const calendarAPI = DF._timeline.get('calendar');
  const source = DF._timeline.get(sourceTimeline);
  const detail = (el) => DF._detailPane.get(el).snapshot().key;
  const marks = (host) => host.querySelectorAll('.df-timeline-event');
  const keyOf = (button) => button.getAttribute(KEY);

  assert.deepEqual(warnings, []);
  assert.equal(calendarAPI.snapshot().key, 'draft');
  assert.equal(calendarAPI.snapshot().end, Date.parse('2028-03-01'));
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(detail(directPane), 'draft');
  assert.equal(detail(externalPane), 'draft');
  const spanWidth = parseFloat(marks(calendar)[0].querySelector('.df-timeline-span').style.width);
  const axis = calendar.querySelector('.df-timeline-axis');
  const [left, right] = ['x1', 'x2'].map((attr) => Number(axis.getAttribute(attr)));
  assert.ok(Math.abs(spanWidth - (right - left) * 2 / 3) < 0.01);
  const [draft, publish] = marks(calendar);
  assert.equal(draft.tabIndex, 0);
  assert.equal(publish.tabIndex, -1);
  const scroll = sourceTimeline.querySelector('.df-timeline-scroll');
  const stage = sourceTimeline.querySelector('.df-timeline-stage');
  scroll.clientWidth = 1100;
  resize();
  assert.equal(stage.style.width, '1100px');
  assert.equal(sourceTimeline.querySelector('.df-timeline-axis').getAttribute('x2'), String(right + 356));
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const width = parseFloat(stage.style.width);
  const height = parseFloat(stage.style.height);
  stage.getBoundingClientRect = () => rect(20, 30, width, height);
  scroll.getBoundingClientRect = sourceTimeline.getBoundingClientRect = () => rect(20, 30, width, height);
  const mid = 20 + (left + right + 356) / 2;
  const hit = DF._timeline.coords(sourceTimeline, mid, 70);
  assert.equal(hit.value, '1.5');
  assert.equal(hit.lane, 'Writing');
  scroll.getBoundingClientRect = () => rect(mid + 1, 30, 400, height);
  assert.equal(DF._timeline.coords(sourceTimeline, mid, 70), null);
  hover(publish, 'touch');
  assert.equal(calendarAPI.snapshot().key, 'draft');
  hover(publish);
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(detail(directPane), 'publish');
  hover(draft);
  const keydown = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' });
  draft.dispatchEvent(keydown);
  assert.equal(keydown.defaultPrevented, true);
  assert.equal(document.activeElement, publish);
  assert.equal(publish.getAttribute('aria-current'), 'true');
  assert.equal(draft.getAttribute('aria-current'), null);
  assert.equal(detail(directPane), 'publish');
  assert.equal(detail(externalPane), 'publish');
  assert.equal(DF.selection.group('schedule').get(), 'publish');

  const updated = input(['publish,12,,Release,Ship', 'draft,0,10,Writing,Revise']);
  marks(sourceTimeline)[1].focus();
  assert.equal(data.update(updated), true);
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(source.snapshot().index, 0);
  assert.equal(source.snapshot().start, 12);
  assert.equal(source.snapshot().label, 'Ship');
  assert.equal(changes.at(-1).origin, 'source');
  assert.equal(changes.at(-1).previous.start, 3);
  assert.equal(keyOf(document.activeElement), 'publish');
  assert.equal(marks(sourceTimeline)[0].getAttribute('aria-current'), 'true');
  assert.equal(detail(externalPane), 'publish');

  assert.equal(data.update(input(['publish,1,0,Release,Invalid'])), false);
  assert.equal(data.snapshot().revision, 1);
  assert.equal(source.snapshot().start, 12);
  assert.equal(data.update(input(['draft,0,10,Writing,Only draft'])), true);
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(detail(externalPane), 'draft');
  assert.equal(data.reset(), true);
  assert.equal(source.snapshot().key, 'draft');
  assert.equal(source.snapshot().end, 2);
  marks(sourceTimeline)[1].dispatchEvent(new Event('click'));
  assert.equal(DF.selection.group('schedule').get(), 'publish');
  assert.equal(calendarAPI.snapshot().key, 'publish');

  const stop = source.subscribe(() => {
    stop();
    data.update(updated);
    source.select('publish');
  });
  source.select('draft');
  assert.equal(source.snapshot().key, 'publish');
  assert.equal(source.snapshot().index, 0);
  assert.equal(detail(externalPane), 'publish');
});

test('sequence diagrams keep message and participant order while linking selection and mapped records', () => {
  const add = (parent, tag, attrs, label) => {
    const el = parent.appendChild(new Node(tag));
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (label) el.textContent = label;
    return el;
  };
  const input = (rows) => ({ type: 'csv', text: 'id,sender,recipient,caption\n' + rows.join('\n') });
  let diagram, named, pane, data;
  const { DocForm: DF, document, warnings } = setup({
    modules: ['data', 'detail', 'diagram', 'sequence-diagram'],
    enhance(DF, document, boot) {
      document.createElement = (tag) => {
        const el = new Node(tag);
        el.focus = () => { document.activeElement = el; el.dispatchEvent(new Event('focus')); };
        return el;
      };
      boot.optionLayers = (feature) => feature === 'sequence' ? [{
        mapping: { key: 'id', from: 'sender', to: 'recipient', label: 'caption' }
      }] : [];
      diagram = add(document.body, 'figure', { class: 'df-sequence', id: 'messages', [GROUP]: 'order' });
      const participants = add(diagram, 'ul', { class: 'df-sequence-participants' });
      add(participants, 'li', { [KEY]: 'shop' }, 'Shop');
      add(participants, 'li', { [KEY]: 'buyer' }, 'Buyer');
      const messages = add(diagram, 'ol', { class: 'df-sequence-messages' });
      add(messages, 'li', { [KEY]: 'request', 'data-df-from': 'buyer', 'data-df-to': 'shop' }, 'Request');
      add(messages, 'li', { [KEY]: 'check', 'data-df-from': 'shop', 'data-df-to': 'shop' }, 'Check');
      add(messages, 'li', { [KEY]: 'reply', 'data-df-from': 'shop', 'data-df-to': 'buyer' }, 'Reply');
      pane = add(diagram, 'div', { class: 'df-detail-pane' });
      for (const key of ['request', 'check', 'reply']) add(pane, 'p', { [KEY]: key }, key);
      named = add(document.body, 'figure', { class: 'df-sequence', [GROUP]: 'order', 'data-df-source': 'messages' });
      data = DF.data.define('messages', input(['request,buyer,shop,Request', 'reply,shop,buyer,Reply']));
    }
  });
  const authored = DF._sequenceDiagram.get('messages');
  const mapped = DF._sequenceDiagram.get(named);
  const buttons = diagram.querySelectorAll('.df-sequence-message');
  assert.deepEqual(warnings, []);
  assert.deepEqual(diagram.querySelectorAll('.df-sequence-participant').map((el) => el.textContent), ['Shop', 'Buyer']);
  assert.deepEqual(buttons.map((el) => el.getAttribute(KEY)), ['request', 'check', 'reply']);
  assert.equal(diagram.querySelectorAll('path')[2].getAttribute('d'), 'M82 158h54v17H82');
  assert.equal(authored.snapshot().key, 'request');
  hover(buttons[2], 'touch');
  assert.equal(authored.snapshot().key, 'request');
  hover(buttons[2], 'pen');
  assert.equal(mapped.snapshot().key, 'reply');
  assert.equal(DF._detailPane.get(pane).snapshot().key, 'reply');
  hover(buttons[0]);
  const end = Object.assign(new Event('keydown', { cancelable: true }), { key: 'End' });
  buttons[0].dispatchEvent(end);
  assert.equal(end.defaultPrevented, true);
  assert.equal(document.activeElement, buttons[2]);
  assert.equal(mapped.snapshot().key, 'reply');
  assert.equal(DF._detailPane.get(pane).snapshot().key, 'reply');
  assert.equal(data.update(input(['reply,shop,buyer,Done', 'request,buyer,shop,Go'])), true);
  assert.equal(mapped.snapshot().index, 0);
  assert.equal(mapped.snapshot().label, 'Done');
  assert.equal(data.update(input(['reply,shop,,Invalid'])), false);
  assert.equal(mapped.snapshot().key, 'reply');
});

test('tree disclosure repositions persistent nodes and keeps details and selection linked', () => {
  const add = (parent, tag, attrs, label) => {
    const el = parent.appendChild(new Node(tag));
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (label) el.textContent = label;
    return el;
  };
  const rows = [
    { name: 'root', title: 'Root' }, { name: 'branch', under: 'root', title: 'Branch' },
    { name: 'leaf', under: 'branch', title: 'Leaf' }, { name: 'tip', under: 'branch', title: 'Tip' },
    { name: 'other', under: 'root', title: 'Other' }
  ];
  const input = (value) => ({ type: 'value', value });
  let diagram, named, pane, data;
  const { DocForm: DF, document, warnings } = setup({
    modules: ['data', 'detail', 'diagram', 'tree-diagram'],
    enhance(DF, document, boot) {
      document.createElement = (tag) => {
        const el = new Node(tag);
        el.focus = () => { document.activeElement = el; el.dispatchEvent(new Event('focus')); };
        return el;
      };
      boot.optionLayers = (feature) => feature === 'tree-diagram' ? [{
        mapping: { key: 'name', parent: 'under', label: 'title' }
      }] : [];
      diagram = add(document.body, 'figure', { class: 'df-tree-diagram', id: 'tree-plan', [GROUP]: 'plan' });
      named = add(document.body, 'figure', { class: 'df-tree-diagram', [GROUP]: 'plan', 'data-df-source': 'plan' });
      const list = add(diagram, 'ul', { class: 'df-tree-diagram-nodes' });
      const node = (list, key, attrs = {}) => {
        const el = add(list, 'li', { [KEY]: key, ...attrs });
        add(el, 'span', { class: 'df-tree-diagram-label' }, key);
        return el;
      };
      const siblings = add(node(list, 'root'), 'ul', {});
      const leaves = add(node(siblings, 'branch', { 'data-df-collapsed': '' }), 'ol', {});
      node(leaves, 'leaf');
      node(leaves, 'tip');
      node(siblings, 'other');
      pane = add(document.body, 'div', { class: 'df-detail-pane', 'data-df-detail-for': 'tree-plan' });
      rows.forEach((row) => add(pane, 'p', { [KEY]: row.name }, row.title));
      data = DF.data.define('plan', input(rows));
    }
  });
  const tree = DF._treeDiagram.get(diagram);
  const mapped = DF._treeDiagram.get(named);
  const picks = (host) => host.querySelectorAll('.df-tree-diagram-pick');
  const [root, branch, leaf, tip, other] = picks(diagram);
  const closed = other.parentNode.style.transform;
  const toggle = branch.parentNode.querySelector('.df-tree-diagram-toggle');
  const icon = toggle.querySelector('svg');
  const detail = DF._detailPane.get(pane);
  assert.deepEqual(warnings, []);
  assert.equal(icon.getAttribute('viewBox'), '0 0 16 16');
  assert.deepEqual(icon.children.map((path) => path.getAttribute('d')), ['M5 8h6', 'M8 5v6']);
  assert.equal(root.tabIndex, 0);
  assert.equal(branch.getAttribute('aria-expanded'), 'false');
  assert.equal(leaf.parentNode.inert, true);
  hover(leaf.parentNode);
  assert.equal(tree.snapshot().key, 'root');
  hover(other.parentNode);
  assert.equal(mapped.snapshot().key, 'other');
  assert.equal(detail.snapshot().key, 'other');
  assert.equal(mapped.select('tip'), true);
  assert.equal(tree.snapshot().key, 'tip');
  assert.equal(detail.snapshot().key, 'tip');
  assert.equal(tip.parentNode.inert, false);
  assert.equal(branch.getAttribute('aria-expanded'), 'true');
  assert.notEqual(other.parentNode.style.transform, closed);

  toggle.dispatchEvent(new Event('click'));
  assert.equal(tree.snapshot().key, 'branch');
  assert.equal(mapped.snapshot().key, 'branch');
  assert.equal(detail.snapshot().key, 'branch');
  assert.equal(document.activeElement, branch);
  assert.equal(other.parentNode.style.transform, closed);
  assert.equal(picks(diagram)[4], other);
  assert.equal(leaf.parentNode.inert, true);

  const keydown = (el, key) => el.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
  keydown(branch, 'ArrowDown');
  assert.equal(tree.snapshot().key, 'other');
  keydown(other, 'ArrowUp');
  keydown(branch, 'ArrowRight');
  assert.equal(leaf.parentNode.inert, false);
  keydown(branch, 'ArrowRight');
  assert.equal(tree.snapshot().key, 'leaf');
  assert.equal(document.activeElement, leaf);
  assert.equal(picks(named)[2].getAttribute('aria-current'), 'true');

  const namedBranch = picks(named)[1].parentNode.querySelector('.df-tree-diagram-toggle');
  namedBranch.dispatchEvent(new Event('click'));
  assert.equal(data.update(input(rows.map((row) => ({ ...row, title: row.title + ' updated' })))), true);
  assert.equal(mapped.snapshot().label, 'Branch updated');
  assert.equal(picks(named)[1].getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, picks(named)[1]);
  assert.equal(data.update(input([{ name: 'root', under: 'root' }])), false);
  assert.equal(mapped.snapshot().key, 'branch');
});
