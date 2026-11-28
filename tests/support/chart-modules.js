const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../../offprint/js', file), 'utf8');

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
  click() { this.dispatchEvent(new Event('click')); }
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

function loadChartModules(modules, globals = {}) {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) }, ...globals });
  context.window = context;
  modules.forEach((file) => vm.runInContext(read(file), context));
  const OffPrint = context.OffPrint;
  return { OffPrint, warnings, chart: OffPrint._chart };
}

function setupChartModules(modules) {
  const document = new Target();
  document.body = new Node('body');
  document.body.parentNode = document;
  document.createElement = (tag) => new Node(tag);
  document.createElementNS = (_, tag) => new Node(tag);
  document.getElementById = (id) => document.body.all().find((el) => el.id === id) || null;
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  const env = loadChartModules(modules, { document, CustomEvent });
  function draw(spec, attrs = {}) {
    const host = new Node('div');
    Object.entries(attrs).forEach(([name, value]) => host.setAttribute(name, value));
    document.body.appendChild(host);
    const api = env.chart(host, spec);
    const find = (cls) => host.all().filter((el) => el.classList.contains(cls));
    const svg = () => host.all().find((el) => el.tag === 'svg');
    const plot = () => find('op-chart-plot')[0];
    const move = (x, y) => plot().dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y }));
    return { host, api, find, svg, plot, move, tip: () => find('op-chart-tip')[0] };
  }
  return { ...env, document, draw };
}

module.exports = { Node, loadChartModules, setupChartModules };
