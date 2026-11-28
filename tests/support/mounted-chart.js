const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = (name) => fs.readFileSync(path.join(__dirname, '../../offprint/js', name + '.js'), 'utf8');
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
const GROUP = 'data-op-selection-group';
const KEY = 'data-op-key';
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
      if (selector === '.op-data' && node.classList.contains('op-data')) return node;
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
      if (simple === `[data-op-stepper-view][${KEY}]`) return node.hasAttribute('data-op-stepper-view') && node.hasAttribute(KEY);
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
  document.addEventListener('op:selection:change', ({ detail }) => {
    if (detail.origin !== 'init') sets.push([detail.group, detail.current.key]);
  });
  const boot = { canInitialize: () => true, setupComplete: true, optionLayers: () => [], merge: Object.assign,
    after: (_, fn) => after.push(fn),
    report: (_, feature, host, message) => warnings.push(message),
    moduleFailed: (_, error) => { throw error; } };
  const OffPrint = { _boot: boot, _site: { base: 'file:///site.js', selectionGroups: groups } };
  const reads = [];
  const context = vm.createContext({ OffPrint, document, CustomEvent, TextEncoder, console: { warn: (message) => warnings.push(message.replace(/^\[offprint\] /, '')) },
    FileReader: class { readAsText(file) { this.result = file.text; reads.push(() => this.onload()); } },
    MutationObserver: class { observe() {} }, ...animation });
  context.window = context;
  for (const name of ['core', 'choices', 'highlight', 'chart', 'stepper', 'tabs', ...modules]) vm.runInContext(script(name), context);
  if (enhance) enhance(OffPrint, document, boot);
  boot.initialize();
  after.forEach((fn) => fn());
  return { chart: OffPrint._chart, selection: OffPrint.selection, sets, warnings, document, OffPrint, reads };
}

function draw(spec, options) {
  const env = setup(options);
  const host = new Node('div');
  env.document.body.appendChild(host);
  const api = env.chart(host, spec);
  const plot = host.all().find((el) => el.classList.contains('op-chart-plot'));
  const marks = () => host.all().filter((el) => el.getAttribute(KEY) !== null && el.tag !== 'td' && el.tag !== 'tr');
  const mark = (key) => marks().find((el) => el.getAttribute(KEY) === key);
  const tip = () => host.all().find((el) => el.classList.contains('op-chart-tip'));
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

const byClass = (c, cls) => c.host.all().filter((el) => el.classList.contains(cls));
const legendButton = (c, name) => byClass(c, 'op-chart-series-toggle').find((el) => el.textContent === name);
const legendInput = (chip) => chip.children.find((el) => el.tag === 'input');
// A legend chip is a checkbox inside its label: a press flips the box and reports the change.
const toggleLegend = (chip) => {
  const input = legendInput(chip);
  input.checked = !input.checked;
  input.dispatchEvent(new Event('change'));
};
const dotsOf = (c) => byClass(c, 'op-chart-dot');
const click = (el) => el.dispatchEvent(new Event('click'));

function chartClock(reduced = false) {
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

function brush(c, fromEl, toEl) {
  const at = (el, type) => c.fire(type, { button: 0, pointerId: 1, clientX: +el.getAttribute('cx'), clientY: +el.getAttribute('cy') });
  at(fromEl, 'pointerdown');
  at(toEl, 'pointermove');
  at(toEl, 'pointerup');
  return at(toEl, 'click');
}

function entranceClock(reduced = false) {
  const clock = chartClock(reduced);
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

const nums = (d) => (d.match(/-?[\d.]+/g) || []).map(Number);
const xsOf = (d) => nums(d).filter((_, i) => i % 2 === 0);
const ysOf = (d) => nums(d).filter((_, i) => i % 2 === 1);
const shapeOf = (d) => d.replace(/-?[\d.]+/g, '#');

function linked({ define, groups, animation, build, modules = [] }) {
  let scope;
  const nodes = {};
  const env = setup({ groups, animation, modules: ['params', 'chart-histogram', 'chart-heatmap', ...modules], enhance(op, document) {
    scope = op._parameters.define('look', define);
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
    host.setAttribute('data-op-scope', 'look');
    host.setAttribute('data-op-chart-bind', typeof bind === 'string' ? bind : JSON.stringify(bind));
    return env.chart(host, spec);
  };
  return { ...env, scope, nodes, mount };
}

const awaiting = (c) => c.host.classList.contains('op-chart-await');

module.exports = {
  Node, setup, draw, shared, GROUP, KEY, hover, choose, chosen,
  byClass, legendButton, legendInput, toggleLegend, dotsOf, click, chartClock, brush, entranceClock, awaiting, nums, xsOf, ysOf, shapeOf, linked
};
