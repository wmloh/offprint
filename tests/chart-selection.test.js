const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = (name) => fs.readFileSync(path.join(__dirname, '../docform/js', name + '.js'), 'utf8');
const GROUP = 'data-df-selection-group';
const KEY = 'data-df-key';
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
  const DocForm = { _boot: boot, site: { base: 'file:///site.js', selectionGroups: groups } };
  const reads = [];
  const context = vm.createContext({ DocForm, document, CustomEvent, TextEncoder, console: { warn: (message) => warnings.push(message.replace(/^\[docform\] /, '')) },
    FileReader: class { readAsText(file) { this.result = file.text; reads.push(() => this.onload()); } },
    MutationObserver: class { observe() {} }, ...animation });
  context.window = context;
  for (const name of ['core', 'highlight', 'chart', 'stepper', 'tabs', ...modules]) vm.runInContext(script(name), context);
  if (enhance) enhance(DocForm, document, boot);
  boot.initialize();
  after.forEach((fn) => fn());
  return { chart: DocForm.chart, selection: DocForm.selection, sets, warnings, document, DocForm, reads };
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
  host.addEventListener('df:chart-playback:change', ({ detail }) => events.push(detail));
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
  const playback = env.DocForm.chartPlayback.get(host.id);
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
  const api = DocForm.chart(host, spec);
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
  const group = DocForm.chart.xGroup('steps');
  const events = [];
  const seen = [];
  group.subscribe((current, meta) => seen.push([current.x, meta.origin, display(cursor(b.plot))]), { immediate: true });
  document.addEventListener('df:chart:x', ({ detail }) => events.push(detail));
  assert.equal(DocForm.chart.xGroup('unknown'), null);
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
  assert.equal(DocForm.chart.xGroup('other').set(5), true);
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
  const group = DocForm.chart.xGroup('steps');
  const visible = (p) => p.querySelectorAll('.df-chart-dot').filter((dot) => display(dot) !== 'none').length;
  assert.equal(playback.snapshot().x, 0, 'the first chart in document order supplies the domain');
  assert.equal(display(playhead(other)), 'none');
  assert.equal(visible(other), 0);
  assert.equal(follower.api.setRange([2, 9]), true);
  assert.equal(group.set(1), false);
  const seen = [];
  playback.subscribe(({ x, state }) => seen.push([x, state, visible(plot), visible(other)]));
  playback.next();
  assert.equal(frames.size, 1);
  advance(500);
  assert.equal(playback.snapshot().x, 2.25);
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
  assert.deepEqual(seen.at(-1), [4.5, 'paused', 2, 1]);
  assert.equal(other.querySelector('svg').getAttribute('width'), '550');
  firePlot(other, 'keydown', { key: 'End' });
  assert.equal(group.snapshot().x, 3);
  assert.equal(playback.snapshot().x, 4.5);
  assert.deepEqual([...follower.api.range()], [2, 9]);
  const toggle = follower.host.querySelector('.df-chart-toggle');
  click(toggle);
  const rows = () => follower.host.querySelector('tbody').rows.map((row) => row.firstChild.textContent);
  assert.deepEqual(rows(), ['3']);
  playback.next();
  advance(500);
  assert.equal(playback.snapshot().x, 6.25);
  assert.equal(follower.api.update(followerSpec), true);
  assert.equal(playback.snapshot().x, 6.25, 'a compatible follower redraw keeps the current frame');
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
  source.subscribe(() => { observed = [playback.snapshot().x, visible(plot), visible(other)]; });
  playback.next();
  advance(200);
  assert.equal(source.update(data(12)), true);
  assert.deepEqual(observed, [8, 3, 2]);
  assert.equal(frames.size, 0);
  assert.equal(playback.snapshot().key, 'later');
  assert.equal(chart.range(), null);
  assert.deepEqual([...follower.api.range()], [2, 9]);
  const marker = other.querySelector('.df-chart-checkpoint');
  playback.next();
  assert.equal(display(marker), 'none');
  assert.equal(source.update(data(13)), true);
  assert.equal(playback.snapshot().x, 8);
  assert.equal(display(marker), 'inline', 'same-position reconciliation restores the follower checkpoint marker');
  playback.reset();
  assert.equal(group.snapshot().x, null, 'rewind clears inspection beyond the playhead');
  assert.equal(display(playhead(other)), 'none');
  assert.equal(follower.api.update({ type: 'scatter', data: [[1, 2], [9, 3]] }), true);
  assert.equal(playback.snapshot().x, null);
  assert.equal(playhead(plot), null);
  assert.equal(follower.api.update(followerSpec), true);
  assert.equal(playback.snapshot().x, 0);
  assert.ok(warnings.some((warning) => warning.includes('incompatible chart')));

  const competing = document.body.appendChild(new Node('ol'));
  assert.equal(DocForm.chartPlayback.mount(competing, { xGroup: 'steps' }), null);
  assert.equal(DocForm.chartPlayback.mount(competing, { target: follower.host.id }), null);
  assert.equal(DocForm.chartPlayback.get(env.host), playback);
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
  const api = DocForm.chartPlayback;
  assert.equal(api.mount(host, { xGroup: 'steps' }), null);
  assert.equal(playhead(a.plot), null);
  assert.equal(playhead(b.plot), null);
  assert.equal(b.api.update(spec), true);
  const playback = api.mount(host, { xGroup: 'steps', checkpoints: [{ key: 'middle', x: 2 }] });
  assert.equal(playback.next(), true);
  assert.equal(playback.snapshot().x, 2);
  assert.equal(display(playhead(a.plot)), 'inline');
  assert.equal(display(playhead(b.plot)), 'inline');
  assert.equal(api.mount(single, { target: b.host.id }), null);
});

test('guided playback reveals exact observations while clipping the same line geometry over time', () => {
  const { chart, chartHost, playback, plot, controls, events, frames, advance, DocForm, host } = guided();
  const shape = () => ({ ...playback.snapshot() });
  const keys = () => plot.all().filter((el) => el.hasAttribute(KEY)).map((el) => el.getAttribute(KEY));
  const button = (label) => controls.children.find((el) => el.textContent === label);
  const fire = (type, props) => plot.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props));
  const line = plot.querySelector('.df-chart-line');
  const clip = plot.all().find((el) => el.tag === 'clipPath').firstChild;
  const playhead = plot.querySelector('.df-chart-playhead');
  const ticks = plot.querySelectorAll('.df-chart-tick');
  assert.equal(DocForm.chartPlayback.mount(host), playback);
  assert.deepEqual(shape(), { x: 0, key: 'start', index: 0, total: 3, state: 'paused' });
  assert.equal(events[0].origin, 'init');
  assert.equal(events[0].previous, null);
  assert.equal(button('Previous').getAttribute('aria-disabled'), 'true');
  assert.deepEqual(keys(), ['zero']);
  assert.equal(+clip.getAttribute('width'), 0);
  assert.equal(line.getAttribute('d').match(/M/g).length, 2);

  button('Next').dispatchEvent(new Event('click'));
  assert.equal(events.at(-1).origin, 'user');
  assert.equal(playback.next(), true);
  assert.equal(frames.size, 1);
  advance(500);
  assert.equal(shape().x, 2.25);
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

  assert.equal(playback.pause(), true);
  advance(5000);
  assert.equal(shape().x, 2.25);
  playback.next();
  advance(500);
  assert.deepEqual(shape(), { x: 4.5, key: 'gap', index: 1, total: 3, state: 'paused' });
  assert.equal(controls.lastChild.textContent, 'Between readings');
  assert.deepEqual(keys(), ['zero', 'two']);

  const table = chartHost.querySelector('.df-chart-table');
  const toggle = chartHost.querySelector('.df-chart-toggle');
  toggle.dispatchEvent(new Event('click'));
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4']);
  playback.next();
  advance(5000);
  assert.deepEqual(table.querySelector('tbody').rows.map((row) => row.firstChild.textContent), ['0', '2', '4', '6']);
  toggle.dispatchEvent(new Event('click'));
  assert.equal(chart.setRange([1, 7]), true);
  assert.deepEqual([...chart.range()], [1, 7]);
  assert.equal(plot.querySelector('.df-chart-playhead').getAttribute('display'), 'none');
  playback.prev();
  assert.equal(shape().x, 4.5);
  assert.deepEqual([...chart.range()], [1, 7]);
  playback.reset();
  assert.equal(shape().key, 'start');
  assert.deepEqual(keys(), []);
});

test('reduced motion reaches each stop immediately and chart replacement reconciles the last reached key', () => {
  const { chart, playback, controls, chartHost, DocForm, frames, events, data, warnings } = guided(true);
  const source = DocForm.data.source('readings');
  assert.equal(playback.select('unknown'), false);
  assert.equal(playback.next(), true);
  assert.equal(playback.snapshot().key, 'gap');
  assert.equal(playback.next(), true);
  assert.equal(playback.snapshot().key, 'later');
  assert.equal(playback.next(), true);
  assert.equal(playback.snapshot().state, 'ended');
  assert.equal(playback.snapshot().key, null);
  assert.equal(playback.next(), true);
  assert.equal(events.length, 4);
  assert.equal(frames.size, 0);
  assert.equal(controls.children.find((el) => el.textContent === 'Next').getAttribute('aria-disabled'), 'true');
  playback.prev();
  const reached = playback.snapshot();
  playback.next();
  assert.equal(source.update(data(11)), true);
  assert.deepEqual(playback.snapshot(), reached);
  assert.equal(source.update({ type: 'csv', text: 'bad,y\n12,3' }), false);
  assert.deepEqual(playback.snapshot(), reached);
  assert.equal(source.update(data(7)), true);
  assert.equal(playback.snapshot().x, null);
  assert.equal(events.at(-1).origin, 'source');
  assert.equal(playback.next(), false);
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
  playback.next();
  advance(500);
  assert.equal(playback.snapshot().x, 6.25);
  let duringSource;
  source.subscribe(() => { duringSource = playback.snapshot(); });
  assert.equal(source.update(data(12)), true);
  assert.equal(duringSource.key, 'gap');
  assert.equal(duringSource.state, 'paused');
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
  DocForm.chart(chart, { type: 'scatter', data: [[0, 1], [5, 3]] });
  const api = DocForm.chartPlayback;
  assert.equal(api.mount(host, { target: chart.id }), null);
  DocForm.chart(chart, { type: 'line', data: [[0, 1], [5, 3]] });
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
  assert.equal(playback.snapshot().state, 'ended');
  assert.equal(api.mount(competitor, { target: chart.id }), null);
  assert.equal(api.get(host), playback);
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
  assert.equal(controls.lastChild.getAttribute('role'), 'status');
  playback.next();
  advance(500);
  assert.equal(gap.hidden, true);
  assert.equal(plot.querySelector('.df-chart-checkpoint').getAttribute('display'), 'none');
  const click = new Event('click');
  Object.defineProperties(click, { target: { value: companion }, button: { value: 0 } });
  document.dispatchEvent(click);
  assert.equal(playback.snapshot().state, 'paused');
  assert.equal(playback.snapshot().x, 4.5);
  assert.equal(events.at(-1).origin, 'group');
  assert.deepEqual(sets, [['checkpoints', 'schedule']]);
  assert.equal(companion.getAttribute('aria-pressed'), 'true');
  assert.equal(gap.getAttribute('aria-current'), 'step');
  assert.equal(start.hidden, true);
  assert.equal(detail.hidden, false);
  assert.equal(detail.firstChild.tag, 'em');
  assert.equal(controls.lastChild.textContent, 'Schedule change');
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
  playback.next();
  advance(1000);
  assert.equal(playback.snapshot().state, 'ended');
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
  DocForm.chart(chart, { type: 'line', data: [[0, 2], [2, 4], [8, 8]] });
  const note = document.body.appendChild(new Node('aside'));
  note.id = 'note';
  note.textContent = 'Static note';
  const mount = (target, detailId, playbackHost = host) => DocForm.chartPlayback.mount(playbackHost, {
    target, checkpoints: [{ key: 'schedule', x: 4.5, label: 'Schedule change', detailId }]
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
  DocForm.chart(other, { type: 'line', data: [[0, 2], [3, 4], [8, 8]] });
  const otherHost = document.body.appendChild(new Node('ol'));
  assert.equal(mount(other.id, note.id, otherHost), null);
  assert.equal(note.hidden, false);
  assert.equal(other.querySelector('.df-chart-playhead'), null);
  const otherNote = document.body.appendChild(new Node('aside'));
  otherNote.id = 'other-note';
  const otherPlayback = mount(other.id, otherNote.id, otherHost);
  otherPlayback.select('schedule');
  assert.equal(otherPlayback.snapshot().x, 4.5);
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
  playback.next();
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
  const chart = df.chart.get('chart');
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
  assert.equal(df.scenarios.get('scenarios').select('other'), true);
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
  assert.equal(df.scenarios.get('scenarios').snapshot().key, 'other');
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
  const chart = df.chart.get('plot');
  const results = df.results.get('results');
  const scenario = df.scenarios.get('scenario');
  const raw = df.dataView.get('raw');
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
  assert.equal(df.results.filters(hosts.results).chip('Budget', true), true);
  assert.equal(scenario.select('r04'), true);
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
    df.parameters.define('eval', {
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
    element('select', 'split', { scope: 'eval', parameter: 'split' });
    element('button', 'preset', { scope: 'eval', preset: '{"runs":["b"],"split":"dev"}' });
  } });
  const df = env.DocForm;
  const scope = df.parameters.scope('eval');
  const source = df.data.source('runs');
  const chart = df.chart.get('plot');
  const results = df.results.get('results');
  const fixed = df.results.get('fixed');
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
  const localFilters = () => df.results.filters(table);
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
  hosts.split.value = 'test';
  hosts.split.dispatchEvent(new Event('change'));
  assert.equal(scope.snapshot(), before, 'duplicate x values in the proposed slice reject the whole update');
  assert.equal(hosts.split.value, 'dev');
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
  const view = env.DocForm.dataView.get(preview);
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
  const results = env.DocForm.results;
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
