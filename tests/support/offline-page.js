const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const repo = new URL('../../', 'file://' + __filename);
const library = new URL('offprint/', repo);
const entryURL = new URL('offprint.js', library);
const entry = fs.readFileSync(entryURL, 'utf8');

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function element(tag) {
  const attrs = new Map();
  const classes = new Set();
  const properties = new Map();
  const listeners = new EventTarget();
  let text = '';
  return {
    tagName: tag.toUpperCase(),
    localName: tag,
    nodeType: 1,
    clientWidth: 400,
    offsetWidth: 120,
    offsetHeight: 48,
    childNodes: [],
    get children() { return this.childNodes.filter(node => node.nodeType === 1); },
    get attributes() { return Array.from(attrs, ([name, value]) => ({ name, value })); },
    get textContent() { return text + this.childNodes.map(node => node.textContent).join(''); },
    set textContent(value) {
      text = String(value);
      while (this.firstChild) this.removeChild(this.firstChild);
    },
    get id() { return this.getAttribute('id') || ''; },
    set id(value) { this.setAttribute('id', value); },
    get title() { return this.getAttribute('title') || ''; },
    set title(value) { this.setAttribute('title', value); },
    get parentElement() { return this.parentNode || null; },
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; },
    get firstChild() { return this.childNodes[0] || null; },
    get lastChild() { return this.childNodes.at(-1) || null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) { attrs.delete(name); },
    toggleAttribute(name, force) {
      if (force ?? !attrs.has(name)) attrs.set(name, '');
      else attrs.delete(name);
    },
    querySelector(selector) {
      return selector === '.op-progress-bar' && this.innerHTML?.includes('op-progress-bar') ? element('circle') : null;
    },
    querySelectorAll(selector) {
      return selector === '[data-op-reveal-step]' ? descendants(this).filter(node => node.hasAttribute(selector.slice(1, -1))) : [];
    },
    matches(selector) { return selector === tag || selector === '.' + this.className; },
    closest() { return null; },
    contains(child) { return this === child || this.childNodes.some(node => node.contains?.(child)); },
    get isConnected() { return !!this.parentNode; },
    getClientRects() { return [this.getBoundingClientRect()]; },
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 10, height: 10, width: 10 }; },
    focus() { this.focused = true; },
    appendChild(child) { return this.insertBefore(child, null); },
    append(...items) {
      items.forEach(item => this.appendChild(typeof item === 'string' ? { textContent: item } : item));
    },
    before(child) { this.parentNode?.insertBefore(child, this); },
    insertBefore(child, before) {
      child.parentNode?.removeChild(child);
      const index = this.childNodes.indexOf(before);
      this.childNodes.splice(index === -1 ? this.childNodes.length : index, 0, child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; },
    remove() { this.parentNode?.removeChild(this); },
    replaceWith(node) { this.parentNode?.replaceChild(node, this); },
    replaceChildren(...children) {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append(...children);
    },
    replaceChild(child, old) { this.insertBefore(child, old); this.removeChild(old); },
    cloneNode(deep) {
      const copy = element(tag);
      for (const [name, value] of attrs) copy.setAttribute(name, value);
      for (const [name, value] of properties) copy.style.setProperty(name, value);
      copy.classList.add(...classes);
      copy.className = this.className;
      copy.hidden = this.hidden;
      copy.textContent = text;
      if (deep) this.childNodes.forEach(child => copy.appendChild(child.cloneNode?.(true) || { ...child }));
      return copy;
    },
    addEventListener: listeners.addEventListener.bind(listeners),
    removeEventListener: listeners.removeEventListener.bind(listeners),
    dispatchEvent(event) {
      Object.defineProperty(event, 'target', { value: this, configurable: true });
      return listeners.dispatchEvent(event);
    },
    style: {
      setProperty: (name, value) => properties.set(name, String(value)),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) ?? ''
    },
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: name => classes.delete(name),
      contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) }
  };
}

function page({ nested, site, config, lateConfig, entryProfile, fail = [], storage, dark, staticCSS, cite, download,
  interactive = false, movedURL, globals } = {}) {
  const location = new URL(movedURL || (nested ? 'pages/chapter.html' : 'index.html'), repo);
  const source = new URL(nested ? '../offprint/offprint.js' : 'offprint/offprint.js', location);
  const siteScript = site ? { src: new URL(nested ? '../site.js' : 'site.js', location).href } : null;
  const siteConfig = config => ({ type: 'application/json', textContent: JSON.stringify(config) });
  const events = [];
  const loads = [];
  const keyboards = [];
  const clicks = [];
  const head = element('head');
  const body = element('body');
  const html = element('html');
  html.appendChild(body);
  const documentEvents = new EventTarget();
  const citation = cite ? element('cite') : null;
  const bibliography = cite ? element('div') : null;
  const ids = new Map();
  if (cite) {
    citation.setAttribute('data-op-cite', 'example');
    body.querySelectorAll = selector => {
      if (selector === '[data-op-cite]') return [citation];
      if (selector === '[data-op-bibliography]') return [bibliography];
      return [];
    };
  }
  let launch;
  const document = {
    readyState: 'loading',
    head,
    body,
    documentElement: html,
    currentScript: { src: source.href, getAttribute: () => entryProfile ?? null },
    activeElement: body,
    getElementById: id => ids.get(id) || (movedURL && descendants(body).find(node => node.id === id)) || null,
    querySelector: selector => selector === 'script[data-op-site]' ? siteScript : null,
    querySelectorAll(selector) {
      if (selector === 'script[data-op-page]') return this.readyState === 'loading'
        ? (config ? [siteConfig(config)] : [])
        : (lateConfig || config ? [siteConfig(lateConfig || config)] : []);
      if (selector.startsWith('link[rel') && staticCSS) return [{ href: new URL('offprint.css', library).href }];
      return body.querySelectorAll(selector);
    },
    addEventListener(type, callback, capture) {
      if (type === 'DOMContentLoaded') launch = callback;
      if (type === 'keydown') keyboards.push({ callback, capture });
      if (type === 'click') clicks.push(callback);
      documentEvents.addEventListener(type, callback, capture);
    },
    removeEventListener(type, callback, capture) {
      if (type === 'click' && clicks.includes(callback)) clicks.splice(clicks.indexOf(callback), 1);
      documentEvents.removeEventListener(type, callback, capture);
    },
    dispatchEvent(event) { events.push(event); return documentEvents.dispatchEvent(event); },
    createElement(tag) {
      const node = element(tag);
      node.focus = () => { document.activeElement = node; };
      node.click = () => tag === 'a' && download ? download(node) : node.dispatchEvent(new Event('click'));
      if (tag === 'dialog') {
        node.showModal = () => { node.open = true; };
        node.close = () => { node.open = false; node.dispatchEvent(new Event('close')); };
      }
      return node;
    },
    createElementNS: (_, tag) => element(tag),
    createTextNode: textContent => ({ textContent })
  };
  const context = vm.createContext({
    document, location, URL, AbortController, setTimeout, clearTimeout, queueMicrotask, structuredClone,
    CustomEvent: class extends Event {
      constructor(type, { detail, bubbles }) { super(type, { bubbles }); this.detail = detail; }
    },
    MutationObserver: class { observe() {} },
    localStorage: { getItem(key) { if (storage instanceof Error) throw storage; return storage?.[key] ?? null; } },
    matchMedia: () => ({ matches: !!dark, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    getComputedStyle: () => ({}),
    console: { warn() {} },
    OffPrintSite: site, ...globals
  });
  context.window = context;
  document.defaultView = context;
  head.appendChild = el => {
    const url = new URL(el.href || el.src);
    const path = url.pathname.slice(repo.pathname.length);
    loads.push(path);
    queueMicrotask(() => {
      if (fail.includes(path)) return el.onerror();
      assert.equal(url.protocol, 'file:');
      if (el.src) vm.runInContext(fs.readFileSync(url, 'utf8'), context, { filename: path });
      else assert.ok(fs.existsSync(url), path);
      el.onload();
    });
  };
  if (!interactive) vm.runInContext(entry, context);
  return {
    OP: context.OffPrint, html, body, citation, events, loads, ids, document, keyboards,
    key(key, target = body, props = {}) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { key }, props);
      Object.defineProperty(event, 'target', { value: target });
      if (props.handled) event.preventDefault();
      keyboards.forEach(({ callback }) => callback(event));
      return event;
    },
    click(target) {
      clicks.forEach(callback => callback({ target, button: 0 }));
    },
    runScript(url) { vm.runInContext(fs.readFileSync(url, 'utf8'), context, { filename: url.pathname }); },
    async hydrate(payload, shared, signal, saved = null) {
      document.readyState = 'complete';
      html.setAttribute('data-op-export-replay', '');
      context.OffPrint = {};
      this.runScript(new URL('js/export-reader.js', library));
      const initialize = context.OffPrint._exportReader.startInteractive;
      delete context.OffPrint;
      head.append = script => {
        assert.equal(script.nonce, 'test-nonce');
        document.currentScript = script;
        vm.runInContext(script.textContent, context);
        document.currentScript = null;
      };
      await initialize(document, payload, shared, 'test-nonce', saved, signal);
      return context.OffPrint;
    },
    async start() {
      document.readyState = 'interactive';
      const done = new Promise(resolve => context.OffPrint.ready(resolve));
      launch();
      await done;
    }
  };
}

function trustedScripts(plan) {
  const trusted = { window: { OffPrint: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('js/export-runtime.js', library), 'utf8'), trusted);
  const runtime = trusted.window.OffPrint._exportRuntime;
  return Array.from(plan.scripts, path => runtime[path]);
}

module.exports = { repo, library, entryURL, entry, descendants, element, page, trustedScripts };
