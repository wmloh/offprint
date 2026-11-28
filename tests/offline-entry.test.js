const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const repo = new URL('../', 'file://' + __filename);
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
    querySelectorAll() { return []; },
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
    replaceChildren(...children) {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append(...children);
    },
    replaceChild(child, old) { this.insertBefore(child, old); this.removeChild(old); },
    cloneNode(deep) {
      const copy = element(tag);
      for (const [name, value] of attrs) copy.setAttribute(name, value);
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

test('the trusted Interactive loader initializes the feature closure from embedded assets at the original page URL', async () => {
  const config = { profile: 'none', features: { tabs: true, data: true, sections: true } };
  const site = { assets: { data: { runs: { output: 'data/runs.js' } } } };
  const normal = page({ config, site });
  const plan = normal.OP._boot.exportPlan(site, config, null, false);
  assert.deepEqual(Array.from(plan.features), ['tokens', 'base', 'data', 'tabs', 'sections']);
  assert.deepEqual(Array.from(plan.scripts), ['offprint.js', 'js/core.js', 'js/reader-state.js',
    'vendor/js-yaml/js-yaml.min.js', 'js/data.js', 'js/tabs.js', 'js/sections.js']);
  const original = 'file:///original/chapter.html';
  const shared = Array.from(plan.scripts, path => fs.readFileSync(new URL(path, library), 'utf8'));
  const manifest = shared.push(site) - 1;
  const data = shared.push({ type: 'json', text: '[{"id":"authored"}]' }) - 1;
  const payload = { url: original, siteURL: 'file:///original/site.js', entryURL: entryURL.href,
    site: manifest, profile: null, features: plan.features, styles: plan.styles, identities: [],
    modules: Array.from(plan.scripts, (path, index) => [path, index]), data: [['runs', data]] };
  const exported = page({ config, site, interactive: true });
  const runtime = await exported.hydrate(payload, shared, new AbortController().signal);
  assert.equal(runtime._page, original);
  assert.equal(runtime.data.source('runs').snapshot().value[0].id, 'authored');
  assert.equal(runtime._boot.enabled('tabs'), true);
  assert.equal(runtime._boot.enabled('sections'), true);
  assert.equal(runtime._readerState.isolated(), true);
  // Interactive frames replay their inputs but keep the live page's motion; only Reader captures freeze it.
  assert.equal(runtime._boot.replaying, true);
  assert.equal(runtime._boot.capturing, false);
  assert.deepEqual(exported.loads, []);

  const broken = page({ config, site, interactive: true });
  await assert.rejects(broken.hydrate({ ...payload, modules: payload.modules.slice(0, -1) }, shared,
    new AbortController().signal), /required OffPrint feature/);
});

test('Interactive import replay restores local overrides and shared replacements before rendering the saved view', async () => {
  const config = { profile: 'none', features: { 'data-view': true, dropzone: true } };
  const site = { assets: { data: { runs: { output: 'runs.js' }, unused: { output: 'unused.js' } } } };
  const plan = page({ config, site }).OP._boot.exportPlan(site, config, null, false);
  const trusted = { window: { OffPrint: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('js/export-runtime.js', library), 'utf8'), trusted);
  const shared = plan.scripts.map(path => trusted.window.OffPrint._exportRuntime[path]);
  const baseline = 'name,value\nauthored,1';
  const local = 'name,value\nlocal café,2';
  const replacement = 'name,value\nshared,3';
  const manifest = shared.push(site) - 1;
  const runs = shared.push({ type: 'csv', text: baseline }) - 1;
  const changedRuns = shared.push({ type: 'csv', text: 'name,value\nrevised,4' }) - 1;
  const localIndex = shared.push(local) - 1;
  const sharedIndex = shared.push(replacement) - 1;
  const inlineIndex = shared.push('name,value\ninline,5') - 1;
  const identities = ['local-view', 'shared-view', 'local-box', 'shared-box']
    .map(id => ({ key: ['id', id], stamp: id }));
  const localKey = '["target","local-view"]';
  const sharedKey = '["source","runs"]';
  const payload = { url: 'file:///original/data.html', siteURL: 'file:///original/site.js', entryURL: entryURL.href,
    site: manifest, profile: null, features: plan.features, styles: plan.styles,
    identities, modules: plan.scripts.map((path, i) => [path, i]), data: [['runs', runs]],
    inlineData: [inlineIndex], imports: [[localKey, localIndex], [sharedKey, sharedIndex]] };

  async function visit(saved, data = payload.data) {
    const p = page({ config, site, interactive: true, movedURL: 'file:///elsewhere/standalone.html', globals: { TextEncoder } });
    const nodes = identities.map(({ key: [, id] }, index) => {
      const node = p.body.appendChild(p.document.createElement('div'));
      node.id = id;
      node.setAttribute('data-op-export-identity', index);
      return node;
    });
    const [localView, sharedView, localBox, sharedBox] = nodes;
    for (const view of [localView, sharedView]) {
      view.setAttribute('data-op-source', 'runs');
      view.setAttribute('data-op-data-view', 'code');
    }
    for (const box of [localBox, sharedBox]) box.setAttribute('data-op-dropzone', '');
    localBox.setAttribute('data-op-target', localView.id);
    sharedBox.setAttribute('data-op-target-source', 'runs');
    const definition = p.body.appendChild(p.document.createElement('script'));
    definition.setAttribute('type', 'text/csv');
    definition.setAttribute('data-op-source', 'inline');
    definition.setAttribute('data-op-export-data', '0');
    p.body.querySelectorAll = selector => ({
      '[data-op-export-data]': [definition],
      '[data-op-export-identity]': nodes,
      'script[data-op-source], pre[data-op-source]': [definition],
      '[data-op-data-view]:not([data-op-dropzone])': [localView, sharedView],
      '[data-op-dropzone]:not(.op-dropzone)': [localBox, sharedBox]
    })[selector] || [];
    const runtime = await p.hydrate({ ...payload, data }, shared, new AbortController().signal, saved);
    assert.deepEqual(p.loads, []);
    assert.equal(runtime.data.source('unused'), null);
    assert.equal(runtime.data.source('inline').snapshot().text, shared[inlineIndex]);
    return { runtime, localView, sharedView, localBox, sharedBox };
  }

  const { runtime } = await visit();
  const seed = runtime._readerState.capture().record;
  const item = (box, target, text) => ({ host: JSON.stringify(['import', ['id', box]]), stamp: box,
    target: JSON.stringify(target), revision: [1, box, 1], name: box + '.csv', type: 'csv',
    bytes: Buffer.byteLength(text) });
  seed.imports = [
    [localKey, item('local-box', ['target', 'local-view', 'local-view'], local)],
    [sharedKey, item('shared-box', ['source', 'runs', 'csv', runtime._readerState.stamp(baseline)], replacement)]
  ];
  const opened = await visit(seed);
  assert.equal(opened.localView.textContent, local);
  assert.equal(opened.sharedView.textContent, replacement);
  const captured = opened.runtime._readerState.capture();
  assert.equal(captured.payloads.get(localKey), local);
  assert.equal(captured.payloads.get(sharedKey), replacement);
  const returned = await visit(captured);
  assert.equal(returned.localView.textContent, local);
  assert.equal(returned.sharedView.textContent, replacement);
  const reset = box => descendants(box).find(el => el.className === 'op-button op-dropzone-reset').click();
  reset(returned.localBox);
  assert.equal(returned.localView.textContent, replacement);
  reset(returned.sharedBox);
  assert.equal(returned.sharedView.textContent, baseline);
  assert.equal(returned.runtime._readerState.capture().payloads.size, 0);
  await assert.rejects(visit(seed, [['runs', changedRuns]]), /committed view could not be restored/);
});

test('Interactive cards restore nested tabs, filters, and a paused SVG position across page visits', async () => {
  const config = { profile: 'none', features: { cards: true, tabs: true, animation: true } };
  const plan = page({ config }).OP._boot.exportPlan({}, config, null, false);
  const shared = Array.from(plan.scripts, path => fs.readFileSync(new URL(path, library), 'utf8'));
  const url = 'file:///original/cards.html';
  const payload = { url, siteURL: url, entryURL: entryURL.href, site: null, profile: null,
    features: plan.features, styles: plan.styles, modules: Array.from(plan.scripts, (path, index) => [path, index]),
    data: [], identities: ['cards', 'tabs', 'figure'].map(id => ({ key: ['id', id], stamp: id })) };

  async function visit(saved) {
    const observers = new Map();
    const frames = new Map();
    let nextFrame = 0;
    const p = page({ config, interactive: true, globals: {
      IntersectionObserver: class {
        constructor(callback) { this.callback = callback; }
        observe(node) { this.node = node; observers.set(node, this.callback); }
        disconnect() { observers.delete(this.node); }
      },
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); }
    } });
    function add(parent, tag, attrs = {}) {
      const node = parent.appendChild(p.document.createElement(tag));
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      if (node.id) p.ids.set(node.id, node);
      return node;
    }
    const cards = add(p.body, 'div', { id: 'cards', 'data-op-numbered': '', 'data-op-search': '' });
    const panel = add(cards, 'div');
    const list = add(panel, 'div', { 'aria-labelledby': 'card-heading' });
    add(list, 'span', { id: 'card-heading' });
    const details = add(cards, 'div');
    const sections = ['overview', 'motion'].map(id => add(details, 'section', { id }));
    const buttons = sections.map(section => add(list, 'button', {
      'data-op-key': section.id, 'data-op-detail': section.id
    }));
    buttons[0].textContent = 'Overview';
    buttons[1].textContent = 'Motion';
    const tag = add(buttons[1], 'span');
    tag.textContent = 'SVG';
    buttons[1].querySelectorAll = selector => selector === ':scope > .op-tag' ? [tag] : [];
    cards.querySelector = selector => ({ ':scope > .op-step-panel': panel, ':scope > .op-step-details': details })[selector];
    panel.querySelector = selector => selector === ':scope > .op-step-list' ? list : null;
    list.querySelectorAll = selector => selector === ':scope > button, :scope > .op-step-group > button' ? buttons : [];
    const tabs = add(sections[1], 'div', { id: 'tabs' });
    const tabPanels = ['explain', 'draw'].map(key => add(tabs, 'section', { 'data-op-tab': key, 'data-op-key': key }));
    tabs.querySelectorAll = selector => selector === ':scope > [data-op-tab]' ? tabPanels : [];
    const figure = add(tabPanels[1], 'figure', { id: 'figure', 'data-op-animation-autoplay': '' });
    const svg = add(figure, 'svg');
    const circle = add(svg, 'circle', { r: '4' });
    circle.namespaceURI = 'http://www.w3.org/2000/svg';
    const declaration = add(figure, 'script');
    declaration.type = 'application/json';
    declaration.textContent = JSON.stringify({ duration: 100, easing: 'linear', steps: [
      { key: 'larger', actions: [{ attr: 'circle', name: 'r', to: 8 }] }
    ] });
    figure.querySelector = selector => selector === 'svg' ? svg : null;
    figure.querySelectorAll = selector => selector === ':scope > script[data-op-animation]' ? [declaration] : [];
    svg.querySelectorAll = selector => selector === 'circle' ? [circle] : [];
    [cards, tabs, figure].forEach((host, i) => host.setAttribute('data-op-export-identity', i));
    p.body.querySelectorAll = selector => ({
      '.op-card-panel': [cards], '.op-tabs, [data-op-tabs]': [tabs],
      'figure > script[data-op-animation]': [declaration], '[data-op-export-identity]': [cards, tabs, figure]
    })[selector] || [];
    const runtime = await p.hydrate(payload, shared, new AbortController().signal, saved);
    const controls = figure.children.find(child => child.className === 'op-anim-controls');
    return { runtime, buttons, sections, tabs, tabPanels, figure, circle, observers, frames, document: p.document,
      filter: panel.firstChild.firstChild, animation: runtime.sequence.get(figure),
      scrub: controls.lastChild, play: controls.firstChild.children.find(button => button.className === 'op-pill-button op-pill-play') };
  }

  const first = await visit();
  assert.deepEqual(first.sections.map(section => section.inert), [false, true]);
  first.buttons[1].dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'touch' }));
  assert.equal(first.buttons[1].getAttribute('aria-selected'), 'false');
  first.buttons[1].click();
  assert.equal(first.buttons[1].getAttribute('aria-controls'), 'motion');
  assert.equal(first.sections[1].getAttribute('aria-labelledby'), first.buttons[1].id);
  assert.equal(first.buttons[1].firstChild.textContent, '2');
  first.filter.value = 'SVG';
  first.filter.dispatchEvent(new Event('input'));
  assert.ok(first.buttons[0].classList.contains('op-step-filtered'));
  first.tabs.firstChild.lastChild.click();
  first.observers.get(first.figure)([{ isIntersecting: true }]);
  assert.equal(first.animation.snapshot().playing, true);
  for (const time of [1000, 1025]) {
    const [id, advance] = first.frames.entries().next().value;
    first.frames.delete(id);
    advance(time);
  }
  assert.equal(first.circle.getAttribute('r'), '5');
  const record = first.runtime._readerState.capture().record;

  const restored = await visit(record);
  assert.equal(restored.observers.size, 0);
  assert.deepEqual(restored.sections.map(section => section.inert), [true, false]);
  assert.deepEqual(restored.tabPanels.map(tab => tab.hidden), [true, false]);
  assert.equal(restored.filter.value, 'svg');
  assert.equal(restored.animation.snapshot().playing, false);
  assert.equal(restored.scrub.getAttribute('aria-label'), 'Animation position');
  assert.equal(restored.scrub.value, '25');
  assert.equal(restored.circle.getAttribute('r'), '5');
  assert.equal(restored.play.getAttribute('aria-label'), 'Play');
  restored.play.click();
  assert.equal(restored.play.getAttribute('aria-label'), 'Pause');
  restored.play.click();
  assert.equal(restored.animation.snapshot().playing, false);
  restored.scrub.value = '75';
  restored.scrub.dispatchEvent(new Event('input'));
  assert.equal(restored.circle.getAttribute('r'), '7');
  const key = name => Object.assign(new Event('keydown', { cancelable: true }), { key: name });
  restored.filter.dispatchEvent(key('Escape'));
  restored.buttons[1].dispatchEvent(key('Home'));
  assert.equal(restored.document.activeElement, restored.buttons[0]);
  assert.equal(restored.buttons[1].getAttribute('aria-selected'), 'true');
  restored.buttons[0].dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'pen' }));
  assert.equal(restored.buttons[0].getAttribute('aria-selected'), 'true');
  const afterHover = restored.runtime._readerState.capture().record;
  assert.equal(afterHover.views.find(([id]) => JSON.parse(id)[0] === 'cards')[1].value, 'motion');
});

test('Interactive charts restore linked playback, filters, and nested chart controls offline', async () => {
  const config = { profile: 'none', features: { data: true, selection: true, parameters: true,
    'chart-intervals': true, 'chart-histogram': true, 'chart-heatmap': true, 'chart-combo': true, 'chart-fits': true,
    'chart-grid': true, 'chart-facets': true, 'chart-playback': true, 'zoom-tools': true },
    options: { chart: { instances: { trace: { mapping: {
      x: 'x', series: [{ field: 'y', key: 'observed' }], pointKey: 'key'
    } } } } },
    parameterScopes: { page: { direction: { type: 'select', choices: [
      { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }
    ] }, bins: { type: 'range', min: 2, max: 5, step: 1 } } } };
  const site = { assets: { data: { trace: { output: 'trace.js' } } } };
  const plan = page({ config, site }).OP._boot.exportPlan(site, config, null, false);
  const trusted = { window: { OffPrint: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('js/export-runtime.js', library), 'utf8'), trusted);
  const shared = plan.scripts.map(path => trusted.window.OffPrint._exportRuntime[path]);
  const manifest = shared.push(site) - 1;
  const traceText = 'x,y,key\n0,0,start\n5,2,mid\n10,3,end';
  const original = shared.push({ type: 'csv', text: traceText }) - 1;
  const revised = shared.push({ type: 'csv', text: traceText.replace('5,2', '5,9') }) - 1;
  const identities = ['trace', 'linked', 'bars', 'pie', 'interval', 'histogram', 'heatmap', 'brush', 'combo', 'fits', 'grid', 'tour', 'state-tour', 'facets', 'splom']
    .map(id => ({ key: ['id', id], stamp: id }));
  const payload = { url: 'file:///original/charts.html', siteURL: 'file:///original/site.js', entryURL: entryURL.href,
    site: manifest, profile: null, features: plan.features, styles: plan.styles, identities,
    modules: plan.scripts.map((path, i) => [path, i]) };

  async function visit(saved, source = original, hideHeatmap = false) {
    const frames = new Map();
    let nextFrame = 0;
    const p = page({ config, site, interactive: true, movedURL: 'file:///elsewhere/standalone.html', globals: {
      performance: { now: () => 0 },
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); }
    } });
    function add(parent, tag, attrs = {}) {
      const node = parent.appendChild(p.document.createElement(tag));
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      return node;
    }
    const detail = add(p.body, 'section');
    const data = [{ x: 0, y: 1, key: 'start' }, { x: 5, y: 2, key: 'mid' }, { x: 10, y: 4, key: 'end' }];
    const series = [{ key: 'a', data }, { key: 'b', data: [[0, 2], [5, 3], [10, 5]] }];
    const sharedPosition = { 'data-op-x-group': 'position', 'data-op-selection-group': 'step' };
    const specs = [
      ['line', { 'data-op-source': 'trace', ...sharedPosition }, {}],
      ['line', sharedPosition, { data }],
      ['bar', { 'data-op-chart-bind': '{"orientation":"direction"}' }, { data: [['A', 1]] }],
      ['pie', {}, { data: [{ label: 'A', value: 3 }, { label: 'B', value: 4 }], toggles: true }],
      ['interval', {}, { data: [['A', 3]] }],
      ['histogram', { 'data-op-chart-bind': '{"bins":"bins"}' }, { data: [1, 3, 5] }],
      ['heatmap', {}, { z: [[1, 2], [3, 4]], contours: { levels: [2] } }],
      ['line', {}, { series, brush: true, toggles: true, motion: false }],
      ['combo', {}, { x: { type: 'time' }, brush: true, toggles: true, y: { unit: 'runs' }, y2: { unit: '%' }, series: [
        { key: 'runs', data: [[0, 4], [5, 6], [10, 3]] },
        { key: 'rate', mark: 'line', axis: 'y2', data: [[0, 40], [5, 55], [10, 70]] }
      ] }],
      ['scatter', {}, { residuals: true, series: [{ key: 'obs', data: [{ x: 0, y: 1, fitted: 1.2 }, { x: 2, y: 3, fitted: 2.8 }] }],
        fits: [{ key: 'trend', curve: [[0, 1.2], [2, 2.8]], band: [[0, 1, 1.4], [2, 2.5, 3.1]], stats: 'R² = 0.98' }] }],
      ['grid', {}, { rows: ['a', 'b'], columns: ['a', 'b'], z: [[3, 1], [2, 4]], diagonal: true, normalize: 'none',
        items: [{ key: 'case', row: 'b', column: 'a' }] }]
    ];
    const charts = specs.map(([type, attrs, spec], i) => {
      const host = add(detail, 'div', { id: identities[i].key[1], 'data-op-export-identity': i,
        'data-op-chart': type, ...attrs });
      const definition = add(host, 'script', { type: 'application/json' });
      definition.textContent = JSON.stringify(spec);
      host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition : null;
      return host;
    });
    const bins = add(detail, 'input', { 'data-op-parameter': 'bins' });
    bins.type = 'range';
    const tour = add(detail, 'ol', { id: 'tour', 'data-op-chart-playback': '', ...sharedPosition,
      'data-op-duration': '100', 'data-op-export-identity': charts.length });
    const stops = data.map(({ key, x }) => {
      const stop = add(tour, 'li', { 'data-op-key': key, 'data-op-x': x });
      stop.textContent = key;
      return stop;
    });
    tour.querySelectorAll = selector => selector === ':scope > li' ? stops : [];
    const stateTour = add(detail, 'ol', { id: 'state-tour', 'data-op-chart-playback': 'state',
      'data-op-target': 'bars', 'data-op-export-identity': charts.length + 1 });
    const stateNote = add(stateTour, 'li', { 'data-op-key': 'sideways',
      'data-op-state': '{"params":{"direction":"horizontal"}}' });
    stateNote.textContent = 'Sideways bars';
    stateTour.querySelectorAll = selector => selector === ':scope > li' ? [stateNote] : [];
    const facetSpecs = [
      ['', { type: 'line', brush: true, toggles: true, series: [
        { key: 'a', data: [{ x: 0, y: 1, site: 'P' }, { x: 10, y: 3, site: 'P' }, { x: 0, y: 2, site: 'Q' }, { x: 10, y: 6, site: 'Q' }] },
        { key: 'b', data: [{ x: 0, y: 4, site: 'P' }, { x: 10, y: 5, site: 'Q' }] }], facet: { field: 'site' } }],
      ['matrix', { fields: ['a', 'b', 'c'], key: 'id', data: [{ id: 'r1', a: 1, b: 2, c: 3 }, { id: 'r2', a: 4, b: 8, c: 1 },
        { id: 'r3', a: 6, b: 5, c: 9 }] }]
    ];
    const facetHosts = facetSpecs.map(([layout, spec], i) => {
      const host = add(detail, 'div', { id: ['facets', 'splom'][i], 'data-op-facets': layout,
        'data-op-export-identity': charts.length + 2 + i });
      const definition = add(host, 'script', { type: 'application/json' });
      definition.textContent = JSON.stringify(spec);
      host.querySelector = selector => selector === ':scope > script[type="application/json"]' ? definition : null;
      return host;
    });
    if (hideHeatmap) {
      // A chart inside a hidden card detail has no rendered plot when its state replays.
      const create = p.document.createElement;
      p.document.createElement = tag => {
        const node = create(tag);
        Object.defineProperty(node, 'clientWidth', { get: () => node.parentNode === charts[6] ? 0 : 400 });
        return node;
      };
    }
    p.body.querySelectorAll = selector => ({
      '[data-op-chart]': charts, 'ol[data-op-chart-playback]': [tour, stateTour],
      '[data-op-x-group]': [charts[0], charts[1], tour],
      '[data-op-parameter]': [bins], '[data-op-export-identity]': [...charts, tour, stateTour, ...facetHosts],
      '[data-op-facets]': facetHosts
    })[selector] || [];
    const dataEntries = source === null ? [] : [['trace', source]];
    const runtime = await p.hydrate({ ...payload, data: dataEntries }, shared, new AbortController().signal, saved);
    assert.deepEqual(p.loads, []);
    return { runtime, charts, tour, stops, stateTour, stateNote, bins, frames, facetHosts };
  }

  const first = await visit();
  const chart = host => first.runtime._chart.get(host);
  for (const host of first.charts) assert.ok(chart(host), host.id);
  assert.deepEqual(first.charts.map(host => chart(host).model().addon ?? chart(host).model().type),
    ['line', 'line', 'bar', 'pie', 'interval', 'histogram', 'heatmap', 'line', 'combo', 'scatter', 'grid']);
  const [trace, linked, bars, pie, , , heatmap, brush] = first.charts;
  const control = (host, cls) => descendants(host).find(node => node.className?.split(' ').includes(cls) || node.getAttribute('class') === cls);
  const key = (host, name) => control(host, 'op-chart-plot').dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: name }));
  const playback = first.runtime.sequence.get(first.tour);
  assert.ok(playback, first.runtime.diagnostics.list().map(issue => issue.message).join('\n'));
  assert.equal(playback.select('mid'), true);
  key(trace, 'Home');
  assert.equal(control(linked, 'op-chart-x-cursor').getAttribute('display'), 'inline');
  assert.equal(chart(pie).setSeriesVisible(chart(pie).model().series[0].key, false), true);
  key(brush, '+');
  assert.deepEqual(Array.from(chart(brush).range()), [2.5, 7.5]);
  assert.equal(chart(brush).setSeriesVisible('b', false), true);
  control(brush, 'op-chart-toggle').click();
  const statePlayback = first.runtime.sequence.get(first.stateTour);
  assert.ok(statePlayback, first.runtime.diagnostics.list().map(issue => issue.message).join('\n'));
  assert.equal(statePlayback.select('sideways'), true);
  assert.equal(chart(bars).model().orientation, 'horizontal');
  first.bins.valueAsNumber = 4;
  first.bins.dispatchEvent(new Event('input'));
  assert.equal(chart(first.charts[5]).model().histogramEdges.length, 5);
  const combo = first.charts[8];
  assert.equal(chart(combo).setSeriesVisible('rate', false), true);
  key(combo, '+');
  const comboRange = Array.from(chart(combo).range());
  assert.equal(comboRange.length, 2);
  const fits = first.charts[9];
  assert.equal(control(fits, 'op-chart-residual').getAttribute('class'), 'op-chart-residual');
  assert.equal(first.runtime._chartFits.visible(fits, 'trend', false), true);
  assert.equal(first.runtime._chart._grid.normalize(first.charts[10], 'row'), true);
  const facets = first.runtime._chartFacets.get(first.facetHosts[0]);
  assert.equal(facets.panels().length, 2);
  assert.equal(facets.setSeriesVisible('b', false), true);
  assert.equal(facets.setRange([2, 6]), true);
  const splom = first.runtime._chartFacets.get(first.facetHosts[1]);
  assert.equal(splom.panels().length, 6, 'a three-field matrix has six scatter panels and three range diagonals');
  assert.equal(splom.brush({ x: { field: 'a', range: [0, 5] }, y: { field: 'b', range: [0, 9] } }), true);
  assert.deepEqual(Array.from(splom.brush().keys), ['r1', 'r2']);
  key(heatmap, 'PageDown');
  assert.equal(first.runtime._chart._heatmap.contours(heatmap, false), true);
  control(heatmap, 'op-chart-toggle').click();
  assert.equal(playback.play(), true);
  for (const [id, callback] of Array.from(first.frames)) { first.frames.delete(id); callback(50); }
  assert.equal(playback.position, 7.5);
  const record = first.runtime._readerState.capture().record;

  const restored = await visit(record, original, true);
  const getChart = i => restored.runtime._chart.get(restored.charts[i]);
  const resumed = restored.runtime.sequence.get(restored.tour);
  assert.equal(resumed.position, 7.5);
  assert.equal(resumed.snapshot().playing, false);
  assert.equal(restored.runtime.selection.group('step').get(), 'mid');
  assert.equal(getChart(2).model().orientation, 'horizontal');
  assert.equal(restored.runtime.sequence.get(restored.stateTour).key, 'sideways');
  assert.equal(restored.stateNote.hidden, false);
  assert.equal(restored.bins.value, '4');
  assert.equal(getChart(5).model().histogramEdges.length, 5);
  assert.equal(getChart(3).visible(getChart(3).model().series[0].key), false);
  assert.equal(getChart(7).visible('b'), false);
  assert.deepEqual(Array.from(getChart(7).range()), [2.5, 7.5]);
  assert.equal(getChart(8).model().series[1].axis, 'y2');
  assert.equal(getChart(8).visible('rate'), false);
  assert.deepEqual(Array.from(getChart(8).range()), comboRange);
  assert.equal(restored.runtime._chartFits.visible(restored.charts[9], 'trend'), false);
  assert.equal(restored.runtime._chart._grid.normalize(restored.charts[10]), 'row', 'the grid restores its normalization');
  const restoredFacets = restored.runtime._chartFacets.get(restored.facetHosts[0]);
  assert.deepEqual(Array.from(restoredFacets.range()), [2, 6]);
  for (const panel of restoredFacets.panels()) {
    assert.equal(restored.runtime._chart.get(panel).visible('b'), false, 'every panel restores the shared legend state');
    assert.deepEqual(Array.from(restored.runtime._chart.get(panel).range()), [2, 6]);
  }
  const matrixBrush = restored.runtime._chartFacets.get(restored.facetHosts[1]).brush();
  assert.deepEqual([matrixBrush.x.field, Array.from(matrixBrush.x.range), Array.from(matrixBrush.keys)], ['a', [0, 5], ['r1', 'r2']]);
  assert.equal(control(restored.charts[9], 'op-chart-fit-curve'), undefined);
  assert.ok(control(restored.charts[9], 'op-chart-residual-zero'), 'the residual panel is restored');
  assert.equal(control(restored.charts[7], 'op-chart-toggle').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(Array.from(restored.runtime._chart._heatmap.valueRange(restored.charts[6])),
    Array.from(first.runtime._chart._heatmap.valueRange(heatmap)));
  assert.equal(restored.runtime._chart._heatmap.contours(restored.charts[6]), false);
  const restoredBrush = restored.charts[7];
  control(restoredBrush, 'op-chart-toggle').click();
  const zoom = restored.runtime._zoom;
  assert.equal(zoom.open(restoredBrush), true);
  const { overlay } = zoom.snapshot();
  assert.equal(restored.runtime._zoomTools.use('measure'), true);
  function crosshair() {
    const svg = descendants(restoredBrush).find(node => node.localName === 'svg');
    svg.getBoundingClientRect = () => ({ width: 400, left: 0, top: 0 });
    overlay.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 200, clientY: 100 }));
    const readout = control(overlay, 'op-zoomtools-readout');
    assert.equal(readout.hidden, false);
    assert.equal(readout.children[0].children[1].textContent, getChart(7).coords(200, 100).xText);
    return readout.textContent;
  }
  const before = crosshair();
  assert.equal(getChart(7).setRange([3, 4]), true);
  assert.notEqual(crosshair(), before);
  zoom.close();
  overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(resumed.next(), true);
  assert.equal(restored.stops[2].hidden, false);
  const viewOnly = (kind, id) => ({ ...record, views: record.views.filter(([key]) => {
    const [type, [, name]] = JSON.parse(key);
    return type === kind && name === id;
  }) });
  await assert.rejects(visit(viewOnly('chart', 'trace'), revised), /committed view could not be restored/);
  await assert.rejects(visit(viewOnly('sequence', 'tour'), revised), /committed view could not be restored/);
  const groupOnly = await visit(viewOnly('selection', 'step'));
  assert.equal(groupOnly.runtime.sequence.get(groupOnly.tour).key, 'mid');
  await assert.rejects(visit(null, null), /chart could not load its data/);
});

test('Interactive zoom uses the live figure and tears down before the reader replaces its frame', async () => {
  const config = { profile: 'none', features: { 'zoom-tools': true } };
  const plan = page({ config }).OP._boot.exportPlan({}, config, null, false);
  assert.ok(plan.styles.includes('css/zoom.css') && plan.styles.includes('css/zoomtools.css'));
  const trusted = { window: { OffPrint: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('js/export-runtime.js', library), 'utf8'), trusted);
  const shared = plan.scripts.map(path => trusted.window.OffPrint._exportRuntime[path]);
  const url = 'file:///original/figures.html';
  const payload = { url, siteURL: url, entryURL: entryURL.href, site: null, profile: null, data: [],
    features: plan.features, styles: plan.styles, modules: plan.scripts.map((path, i) => [path, i]) };
  const frames = new Map();
  let nextFrame = 0;
  let observer;
  const p = page({ config, interactive: true, movedURL: 'file:///elsewhere/standalone.html', globals: {
    MutationObserver: class {
      constructor(callback) { this.changed = callback; observer = this; }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }
  } });
  const figure = p.body.appendChild(p.document.createElement('figure'));
  const svg = figure.appendChild(p.document.createElement('svg'));
  const mark = svg.appendChild(p.document.createElement('circle'));
  figure.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
  figure.querySelectorAll = selector => selector === 'svg, img' ? [svg] : [];
  figure.closest = selector => selector.includes('.op-page figure') ? figure : null;
  figure.matches = selector => selector === '.op-page img, .op-page figure';
  p.body.querySelectorAll = selector => selector.startsWith('.op-page img') ? [figure] : [];
  const controller = new AbortController();
  const runtime = await p.hydrate(payload, shared, controller.signal);
  assert.deepEqual(p.loads, []);
  const zoom = runtime._zoom;
  const tools = runtime._zoomTools;
  const find = (host, cls) => descendants(host).find(node => node.className === cls || node.getAttribute('class') === cls);
  const pointer = (host, type, x, y) => host.dispatchEvent(Object.assign(new Event(type, { cancelable: true }),
    { clientX: x, clientY: y, button: 0, pointerId: 1 }));
  function tick() {
    for (const [id, callback] of Array.from(frames)) if (frames.delete(id)) callback(0);
  }

  p.click(figure);
  const { overlay, stage } = zoom.snapshot();
  assert.equal(figure.parentNode, stage);
  assert.equal(p.document.activeElement, find(overlay, 'op-zoom-close'));
  assert.equal(p.key('2', p.document.activeElement).defaultPrevented, true);
  pointer(overlay, 'pointermove', 50, 50);
  const lens = find(overlay, 'op-zoomtools-lens-view');
  mark.setAttribute('cx', '10');
  tick();
  assert.equal(descendants(lens).find(node => node.localName === 'circle').getAttribute('cx'), '10');
  mark.setAttribute('cx', '40');
  observer.changed();
  tick();
  assert.equal(descendants(lens).find(node => node.localName === 'circle').getAttribute('cx'), '40');
  assert.equal(p.key('Escape', p.document.activeElement).defaultPrevented, true);
  assert.equal(observer.target, null);
  assert.equal(lens.parentNode.parentNode, null);
  overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.document.activeElement, figure);
  assert.equal(figure.parentNode, p.body);
  assert.equal(frames.size, 0);

  assert.equal(p.key('Enter', figure).defaultPrevented, true);
  const reopened = zoom.snapshot().overlay;
  assert.equal(tools.active(), 'cursor');
  assert.equal(tools.use('pen'), true);
  const layer = find(reopened, 'op-zoomtools-layer');
  let captured;
  layer.setPointerCapture = id => { captured = id; };
  layer.hasPointerCapture = id => captured === id;
  layer.releasePointerCapture = () => { captured = null; };
  pointer(layer, 'pointerdown', 25, 25);
  assert.equal(captured, 1);
  assert.ok(descendants(layer).some(node => node.localName === 'path'));
  controller.abort();
  assert.equal(captured, null);
  assert.equal(tools.active(), null);
  assert.equal(zoom.snapshot(), null);
  assert.equal(layer.parentNode, null);
  assert.equal(reopened.parentNode, null);
  assert.equal(figure.parentNode, p.body);
  assert.equal(p.html.classList.contains('op-zoom-open'), false);
  assert.equal(frames.size, 0);
  assert.equal(p.key('4', figure).defaultPrevented, false);
  assert.equal(p.key('Enter', figure).defaultPrevented, false);
  p.click(figure);
  assert.equal(zoom.snapshot(), null);
});

test('Interactive diagrams rebuild and restore their authored controls at a moved file URL', async () => {
  const config = { profile: 'none',
    features: { pipeline: true, sequence: true, timeline: true, 'tree-diagram': true, selection: true, data: true } };
  const plan = page({ config }).OP._boot.exportPlan({}, config, null, false);
  const trusted = { window: { OffPrint: {} } };
  vm.runInNewContext(fs.readFileSync(new URL('js/export-runtime.js', library), 'utf8'), trusted);
  const shared = Array.from(plan.scripts, path => trusted.window.OffPrint._exportRuntime[path]);
  const url = 'file:///original/guide/diagrams.html';
  const identities = ['flow', 'sequence', 'timeline', 'tree', 'details', 'bad'].map(id => ({ key: ['id', id], stamp: id }));
  const payload = { url, siteURL: url, entryURL: entryURL.href, site: null, profile: null,
    features: plan.features, styles: plan.styles, modules: Array.from(plan.scripts, (path, i) => [path, i]), data: [],
    identities };

  async function visit(saved) {
    const timers = new Map();
    let nextTimer = 0;
    const p = page({ config, interactive: true, movedURL: 'file:///elsewhere/standalone.html', globals: {
      setInterval(callback) { timers.set(++nextTimer, callback); return nextTimer; },
      clearInterval(id) { timers.delete(id); },
      getComputedStyle: () => ({ position: 'fixed', columnGap: '30px', rowGap: '20px' })
    } });
    function find(node, selector) {
      return selector.split(',').flatMap(part => {
        part = part.trim();
        const direct = part.startsWith(':scope > ');
        const query = direct ? part.slice(9) : part;
        const match = /^([\w-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(query);
        if (!match) return [];
        const [, tag, cls, attr] = match;
        return (direct ? node.children : descendants(node)).filter(el =>
          (!tag || el.localName === tag) && (!cls || el.className === cls) && (!attr || el.hasAttribute(attr)));
      });
    }
    p.body.querySelectorAll = selector => find(p.body, selector);
    function add(parent, tag, cls, attrs = {}, label = '') {
      const node = parent.appendChild(p.document.createElement(tag));
      node.className = cls;
      if (cls) node.classList.add(cls);
      node.textContent = label;
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      node.querySelectorAll = selector => find(node, selector);
      node.querySelector = selector => find(node, selector)[0] || null;
      return node;
    }
    function host(i, cls, attrs) {
      return add(p.body, 'figure', cls, { ...attrs, id: identities[i].key[1], 'data-op-export-identity': i });
    }
    const flow = host(0, 'op-pipeline');
    const blocks = add(flow, 'ol', 'op-pipe-blocks');
    const begin = add(blocks, 'li', 'op-pipe-block', {}, 'Begin');
    add(begin, 'a', 'op-pipe-link', { href: '#flow-2', 'data-op-label': 'Continue' });
    const finish = add(blocks, 'li', 'op-pipe-block', { 'data-op-reveal-step': 'finish' }, 'Finish');
    const steps = add(flow, 'ol', '', { 'data-op-pipeline-steps': '' });
    add(steps, 'li', '', { 'data-op-key': 'begin', 'data-op-detail': 'begin-note' }, 'Start');
    add(steps, 'li', '', { 'data-op-key': 'finish', 'data-op-detail': 'finish-note' }, 'Finish');
    add(flow, 'p', '', { id: 'begin-note' }, 'First note');
    const note = add(flow, 'p', '', { id: 'finish-note' }, 'Alternate pipeline note');

    const group = { 'data-op-selection-group': 'writing' };
    const sequence = host(1, 'op-sequence', group);
    const messages = add(sequence, 'ol', 'op-sequence-messages');
    add(messages, 'li', '', { 'data-op-key': 'read', 'data-op-from': 'reader', 'data-op-to': 'writer' }, 'Read');
    add(messages, 'li', '', { 'data-op-key': 'write', 'data-op-from': 'writer', 'data-op-to': 'writer' }, 'Write');
    const timeline = host(2, 'op-timeline', group);
    const events = add(timeline, 'ol', 'op-timeline-events');
    add(events, 'li', '', { 'data-op-key': 'read', 'data-op-start': '1' }, 'Read');
    add(events, 'li', '', { 'data-op-key': 'write', 'data-op-start': '2', 'data-op-end': '4' }, 'Write');
    const tree = host(3, 'op-tree-diagram', { ...group, 'data-op-source': 'outline' });
    const source = add(p.body, 'script', '', { 'data-op-source': 'outline', type: 'application/json' }, JSON.stringify([
      { key: 'read', label: 'Read', collapsed: true }, { key: 'write', label: 'Write', parent: 'read' }
    ]));
    source.type = 'application/json';
    const pane = add(timeline, 'div', 'op-detail-pane', { id: 'details', 'data-op-export-identity': 4 });
    add(pane, 'p', '', { 'data-op-key': 'read' }, 'Read detail');
    const alternate = add(pane, 'p', '', { 'data-op-key': 'write' }, 'Alternate timeline detail');
    const bad = host(5, 'op-sequence');
    const fallback = add(bad, 'ol', 'op-sequence-messages');
    add(fallback, 'li', '', { 'data-op-key': 'broken' }, 'Readable fallback');
    const runtime = await p.hydrate(payload, shared, new AbortController().signal, saved);
    const flowController = runtime._pipeline.get(flow);
    assert.ok(flowController, JSON.stringify(runtime.diagnostics.list().map(issue => issue.message)));
    const treeRoot = descendants(tree).find(node => node.className === 'op-tree-diagram-pick');
    const toggle = descendants(tree).find(node => node.className === 'op-tree-diagram-toggle');
    const keys = () => [runtime._sequenceDiagram.get(sequence), runtime._timeline.get(timeline),
      runtime._treeDiagram.get(tree)].map(controller => controller.snapshot().key);
    assert.equal(runtime._page, url);
    assert.deepEqual(p.loads, []);
    assert.equal(runtime._sequenceDiagram.get(bad), null);
    assert.equal(bad.firstChild.textContent, 'Readable fallback');
    assert.ok(runtime.diagnostics.list().some(issue => issue.feature === 'sequence' && issue.code === 'component-input'));
    return { runtime, flowController, keys, treeRoot, toggle, alternate, note, begin, finish, timers,
      sequenceButton: descendants(sequence).find(node => node.className === 'op-sequence-message') };
  }

  const first = await visit();
  assert.equal(first.finish.hasAttribute('data-op-pipe-hidden'), true);
  assert.equal(first.note.hidden, true);
  assert.equal(first.treeRoot.getAttribute('aria-expanded'), 'false');
  first.flowController.steps.play();
  first.timers.values().next().value();
  first.begin.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse' }));
  assert.equal(first.finish.hasAttribute('data-op-pipe-trace'), true);
  first.finish.click();
  first.sequenceButton.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'End' }));
  assert.deepEqual(first.keys(), ['write', 'write', 'write']);
  assert.equal(first.alternate.inert, false);
  assert.equal(first.treeRoot.getAttribute('aria-expanded'), 'true');

  const record = first.runtime._readerState.capture().record;
  const restored = await visit(record);
  assert.deepEqual(restored.keys(), ['write', 'write', 'write']);
  assert.equal(restored.alternate.inert, false);
  assert.equal(restored.treeRoot.getAttribute('aria-expanded'), 'true');
  assert.equal(restored.flowController.steps.snapshot().key, 'finish');
  assert.equal(restored.flowController.steps.snapshot().playing, false);
  assert.equal(restored.flowController.snapshot().key, 'flow-2');
  assert.equal(restored.finish.hasAttribute('data-op-pipe-hidden'), false);
  assert.equal(restored.note.hidden, false);
  restored.toggle.click();
  assert.deepEqual(restored.keys(), ['read', 'read', 'read']);
  assert.equal(restored.alternate.inert, true);
  const folded = await visit(restored.runtime._readerState.capture().record);
  assert.equal(folded.treeRoot.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(folded.keys(), ['read', 'read', 'read']);
  folded.sequenceButton.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'End' }));
  folded.sequenceButton.click();
  assert.deepEqual(folded.keys(), ['read', 'read', 'read']);
  const reopened = await visit(folded.runtime._readerState.capture().record);
  assert.equal(reopened.treeRoot.getAttribute('aria-expanded'), 'true');
  const stale = structuredClone(record);
  stale.views.find(([id]) => JSON.parse(id)[0] === 'timeline')[1].value = 'unknown';
  await assert.rejects(visit(stale), /committed view could not be restored/);
});

test('the offline entry exposes the extension surface and initializes a custom feature before ready', async () => {
  const p = page({ config: { features: { chart: true, data: true, selection: true } } });
  const phases = [];
  p.OP.setup(OP => {
    phases.push('setup');
    OP.register('test-reading-marker', () => {
      phases.push('initialize');
      p.body.setAttribute('data-reading-marker', OP.util.slug('Reading Ready'));
    });
  });
  p.OP.ready(() => phases.push('ready'));
  await p.start();

  assert.deepEqual(phases, ['setup', 'initialize', 'ready']);
  assert.equal(p.body.getAttribute('data-reading-marker'), 'reading-ready');
  assert.deepEqual(Object.getOwnPropertyNames(p.OP).filter(name => !name.startsWith('_')).sort(), [
    'chart', 'data', 'diagnostics', 'ready', 'register', 'selection', 'sequence', 'setup', 'shortcuts', 'util'
  ]);
  assert.deepEqual(Object.keys(p.OP.chart).sort(), ['addon', 'addons', 'layers', 'legend', 'scale']);
  assert.deepEqual(Object.keys(p.OP.data).sort(), ['define', 'defineTransform', 'names', 'parse', 'source', 'table', 'valueOf']);
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('standalone reading profile applies early theme and renders citations with tooltip cards before ready', async () => {
  const p = page({ cite: true, staticCSS: true, storage: new Error('blocked'), config: {
    options: { theme: { mode: 'dark' }, citations: { entries: { example: 'An example source.' } } }
  } });
  assert.equal(p.html.getAttribute('data-op-theme'), 'dark');
  const order = [];
  let preview;
  p.OP.setup(OP => {
    order.push('setup');
    assert.equal(OP._site.provided, false);
    const attach = OP._tooltips.attach;
    OP._tooltips.attach = (link, title, text, options) => {
      if (link.className === 'op-cite-link') preview = options.content;
      else return attach(link, title, text, options);
    };
    throw new Error('Example callback failure');
  });
  p.OP.setup(() => order.push('next setup'));
  p.OP.ready(OP => {
    order.push('ready');
    assert.equal(p.citation.childNodes[1].textContent, '1');
    assert.equal(preview().textContent, 'An example source.');
    assert.equal(typeof OP._search.open, 'function');
    assert.equal(OP._theme.get(), 'dark');
  });
  await p.start();
  assert.deepEqual(order, ['setup', 'next setup', 'ready']);
  assert.equal(p.loads.filter(path => path.endsWith('/refs.js')).length, 1);
  assert.equal(p.loads.some(path => path.endsWith('.css')), false);
  assert.deepEqual(p.events.map(event => event.detail.code), ['setup-failed']);
  assert.equal(p.OP.setup(() => {}), false);
  p.OP.ready(() => order.push('late ready'));
  assert.equal(order.at(-1), 'ready');
  await Promise.resolve();
  assert.equal(order.at(-1), 'late ready');
});

test('nested none profile clears inherited choices and loads playback after its chart dependency', async () => {
  const p = page({ nested: true, entryProfile: 'reading',
    site: { profile: 'reading', features: { math: true }, pages: ['pages/chapter.html'] },
    lateConfig: { profile: 'none', features: { 'chart-playback': true, cards: true, 'figure-steps': true } }
  });
  await p.start();
  assert.equal(p.OP._site.order[0].href, p.OP._page);
  assert.ok(Object.isFrozen(p.OP._site.order[0]));
  assert.equal(p.html.getAttribute('data-op-theme'), null);
  assert.deepEqual(p.loads, ['offprint/js/core.js', 'offprint/js/reader-state.js', 'offprint/css/tokens.css', 'offprint/css/base.css',
    'offprint/css/text.css', 'offprint/css/sections.css', 'offprint/css/buttons.css', 'offprint/css/choices.css', 'offprint/js/choices.js', 'offprint/css/chart.css', 'offprint/js/chart.js', 'offprint/css/chart-playback.css', 'offprint/js/chart-playback.js',
    'offprint/css/detail.css', 'offprint/js/detail.js', 'offprint/css/steps.css', 'offprint/js/steps.js']);
  assert.equal(typeof p.OP._chartPlayback.mount, 'function');
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('floating page links match the bottom pager and respect page boundaries and opt-out', async () => {
  const home = { path: 'index.html', title: 'Home' };
  const current = { path: 'pages/chapter.html', title: 'Chapter' };
  const end = { path: 'end.html', title: 'End' };
  const prev = ['prev', new URL(home.path, repo).href];
  const next = ['next', new URL(end.path, repo).href];
  const links = pager => pager?.children.map(link => [link.rel, link.href]);

  for (const { pages, noPager, controls = true, expected } of [
    { pages: [home, current, end], expected: [prev, next] },
    { pages: [current, end], expected: [next] },
    { pages: [home, current], expected: [prev] },
    { pages: [home, current, end], noPager: true },
    { pages: [home, end] },
    { pages: [current] },
    { pages: [home, current, end], controls: false, expected: [prev, next] }
  ]) {
    const p = page({ nested: true, site: { pages, features: { controls } } });
    const main = p.body.appendChild(element('main'));
    const query = p.document.querySelector;
    p.document.querySelector = selector => {
      if (selector === 'main') return main;
      if (selector === '.op-sidebar') return p.body.children.find(el => el.className === 'op-sidebar') || null;
      return query(selector);
    };
    if (noPager) main.setAttribute('data-op-no-pager', '');
    await p.start();

    const bar = p.body.children.find(el => el.className === 'op-controls-bar');
    const quick = bar?.children[1];
    const bottom = main.children.find(el => el.className === 'op-pager');
    assert.equal(bar?.firstChild.className, controls ? 'op-controls' : undefined);
    assert.deepEqual(links(bottom), expected);
    assert.deepEqual(links(quick), controls ? expected : undefined);
    if (quick) {
      assert.equal(quick.className, 'op-controls-pager');
      assert.deepEqual(quick.children.map(link => link.getAttribute('aria-label')),
        expected.map(([rel]) => rel === 'prev' ? 'Previous page: Home' : 'Next page: End'));
    }
    assert.equal(p.OP.diagnostics.list().length, 0);
  }
});

test('floating controls show shared tooltip cards with current labels and effective shortcuts', async () => {
  const p = page({
    site: { pages: ['index.html', { path: 'next.html', title: 'Next chapter' }] },
    config: { options: { shortcuts: { 'controls.theme': 'y' } } }
  });
  const heading = p.body.appendChild(element('h2'));
  p.body.querySelectorAll = selector => selector === 'h2, h3' ? [heading] : [];
  const query = p.document.querySelector;
  p.document.querySelector = selector => selector === '.op-sidebar'
    ? p.body.children.find(el => el.className === 'op-sidebar') || null
    : query(selector);
  await p.start();

  const [pill, pager] = p.body.children.find(el => el.className === 'op-controls-bar').children;
  const [progress, nav, focus, search, theme, exportButton] = pill.children;
  const next = pager.firstChild;
  const showHint = el => {
    assert.equal(el.hasAttribute('title'), false);
    el.dispatchEvent(new Event('focus'));
    const card = p.body.children.find(child => String(child.className).split(' ').includes('op-tooltip') && !child.hidden);
    assert.equal(card?.getAttribute('role'), 'tooltip');
    return card;
  };
  assert.equal(showHint(nav).textContent, 'Navigation shown. Select to hide (N)');
  const focusCard = showHint(focus);
  assert.equal(focusCard.textContent, 'Turn on focus mode (F)');
  p.OP._controls.setFocus(true);
  assert.equal(focusCard.textContent, 'Turn off focus mode (F)');
  assert.equal(showHint(search).textContent, 'Search (S)');
  const themeCard = showHint(theme);
  assert.equal(themeCard.textContent, 'Theme: Light. Switch to Dark. (Y)');
  assert.equal(theme.getAttribute('aria-keyshortcuts'), 'Y');
  p.OP._theme.set('dark');
  assert.equal(themeCard.textContent, 'Theme: Dark. Switch to Light. (Y)');
  assert.equal(theme.hasAttribute('title'), false);
  assert.equal(showHint(next).textContent, 'Next page: Next chapter');
  assert.equal(exportButton.getAttribute('aria-label'), 'Export');
  assert.equal(showHint(exportButton).textContent, 'Export');
  assert.equal(pill.children.length, 6);
  assert.equal(progress.tabIndex, undefined);
  assert.equal(progress.hasAttribute('title'), false);
  progress.dispatchEvent(new Event('mouseenter'));
  await new Promise(resolve => setTimeout(resolve, 150));
  const progressCard = p.body.children.find(child => String(child.className).split(' ').includes('op-tooltip') && !child.hidden);
  assert.equal(progressCard?.textContent, 'Read 100%');

  const fallback = page({ config: { profile: 'none', features: { controls: true, theme: true } } });
  await fallback.start();
  const fallbackPill = fallback.body.children.find(el => el.className === 'op-controls-bar').firstChild;
  assert.equal(fallbackPill.firstChild.title, 'Read 100%');
  assert.equal(fallbackPill.children[1].title, 'Turn on focus mode (F)', 'focus mode needs no headings');
  assert.equal(fallbackPill.children[2].title, 'Theme: Light. Switch to Dark. (T)');
  const fallbackExport = fallbackPill.children.find(el => el.getAttribute('aria-label') === 'Export');
  assert.ok(fallbackExport);
  assert.equal(fallbackExport.hasAttribute('title'), false);
  assert.ok(!fallbackPill.children.some(el => el.getAttribute('aria-label') === 'Clear saved views and imports'));
});

test('the lazy export dialog handles folder recovery, mixed groups, cancellation and the reviewed download', async () => {
  const downloads = [];
  const blobs = new Map();
  class PreviewURL extends URL {
    static createObjectURL(blob) {
      const url = URL.createObjectURL(blob);
      blobs.set(url, blob);
      return url;
    }
  }
  const p = page({ entryProfile: 'none', globals: { URL: PreviewURL },
    download: link => downloads.push([link.download, link.href]) });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await p.start();
  const opener = descendants(p.body).find(el => el.textContent === 'Export' && el.tagName === 'BUTTON');
  assert.ok(opener);
  assert.equal(p.loads.some(path => path.includes('export-')), false);
  opener.click();
  await settle();
  const modal = p.body.children.find(el => el.tagName === 'DIALOG');
  assert.ok(modal.open);
  assert.deepEqual(p.loads.filter(path => path.includes('export-')),
    ['offprint/js/export-dialog.js', 'offprint/css/export-dialog.css']);

  const find = (tag, title) => descendants(modal).find(el => el.tagName === tag &&
    (title === undefined || el.textContent === title));
  const [docsInput] = descendants(modal).filter(el => el.type === 'file');
  const [reader, interactive] = descendants(modal).filter(el => el.type === 'radio');
  assert.equal(reader.checked, true);
  assert.equal(interactive.checked, false);
  const choose = find('BUTTON', 'Choose site folder');
  const build = find('BUTTON', 'Build preview');
  const stop = find('BUTTON', 'Cancel');
  const download = find('BUTTON', 'Download HTML');
  const status = descendants(modal).find(el => el.getAttribute('role') === 'status');
  assert.equal(p.document.activeElement, choose);
  docsInput.dispatchEvent(new Event('cancel'));
  assert.match(status.textContent, /Folder selection cancelled/);
  const leaf = (id, title, available = true) => ({ id, title, available, children: [] });
  const selected = [];
  const modes = [];
  const consents = [];
  let blob;
  async function verifyDownload() {
    const previous = downloads.length;
    assert.ok(modal.textContent.includes(`${blob.size} bytes`));
    download.click();
    assert.equal(downloads.length, previous + 1);
    const [name, href] = downloads.at(-1);
    assert.equal(name, 'Book.html');
    assert.match(href, /^blob:/);
    assert.equal(blobs.get(href), blob);
    return blobs.get(href).text();
  }
  p.OP._exportPackage = {
    async prepare(files) {
      if (!files[0].webkitRelativePath.startsWith('source/')) {
        throw Object.assign(new Error('Wrong folder'), { folder: 'documents' });
      }
      return {
        active: 'home',
        tree: [{ title: 'Book', children: [leaf('home', 'Home'), {
          title: 'Part', children: [leaf('chapter', 'Chapter'), leaf('missing', 'Hidden page', false)]
        }] }],
        async build(ids, { signal, mode, includeImports, includeScripts }) {
          selected.push(Array.from(ids));
          modes.push(mode);
          consents.push(Array.from(includeImports));
          if (selected.length === 1) throw new Error('Build failed');
          if (selected.length === 2) {
            await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
            signal.throwIfAborted();
          }
          const embedImport = includeImports.has('accepted-revision');
          const embedScript = includeScripts.has('approved-script');
          blob = new Blob(['<!doctype html>', embedImport ? 'données' : '', embedScript ? 'script' : '']);
          return { filename: 'Book.html', blob, bytes: blob.size,
            importChoices: mode === 'interactive' ? [{ id: 'accepted-revision', name: 'input.csv', bytes: 22,
              title: 'Home', consumers: ['#runs'], available: true,
              selected: embedImport, included: embedImport }] : [],
            scriptChoices: mode === 'interactive' ? [{ id: 'approved-script', name: 'widgets.js', title: 'Chapter',
              dependencies: ['helpers.js'], resources: [], available: true, selected: embedScript, included: embedScript }] : [],
            pages: [{ title: 'Home', view: 'live', imports: [{ name: 'input.csv', target: 'runs' }] },
              { title: 'Chapter', view: 'saved', imports: [] }],
            issues: [{ title: 'Home', code: 'unavailable-link', target: 'omitted.html', message: 'Unavailable.' }] };
        }
      };
    }
  };
  const selectFolder = async (input, path) => {
    input.files = [{ webkitRelativePath: path + '/index.html' }];
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  await selectFolder(docsInput, 'wrong');
  assert.match(status.textContent, /Wrong folder/);
  assert.equal(build.hidden, true);
  assert.equal(p.document.activeElement, choose);
  await selectFolder(docsInput, 'source');
  assert.match(modal.textContent, /source/);
  const picker = descendants(modal).find(el => el.tagName === 'FIELDSET' && el.firstChild.textContent === 'Pages to export');
  const [group, home, part, chapter] = descendants(picker).filter(el => el.type === 'checkbox');
  assert.equal(home.checked, true);
  assert.equal(chapter.checked, false);
  assert.equal(group.indeterminate, true);
  assert.equal(part.checked, false);
  assert.doesNotMatch(picker.textContent, /Hidden page/);
  group.checked = true;
  group.dispatchEvent(new Event('change'));
  assert.equal(part.checked, true);
  assert.equal(chapter.checked, true);
  assert.equal(group.indeterminate, false);
  build.click();
  await settle();
  assert.match(status.textContent, /Build failed/);
  assert.equal(build.textContent, 'Retry preview');
  build.click();
  stop.click();
  await settle();
  assert.match(status.textContent, /Export cancelled/);
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  assert.deepEqual(selected, Array.from({ length: 3 }, () => ['home', 'chapter']));
  assert.equal(p.OP._readerState.enabled(), true);
  assert.equal(download.hidden, false);
  assert.match(modal.textContent, /Current view/);
  assert.match(modal.textContent, /Saved view/);
  assert.match(modal.textContent, /input\.csv/);
  assert.match(modal.textContent, /1 disabled link/);
  assert.match(modal.textContent, /omitted\.html/);
  assert.match(modal.textContent, /15 bytes/);
  assert.equal(await verifyDownload(), '<!doctype html>');
  assert.deepEqual(modes, ['reader', 'reader', 'reader']);
  interactive.checked = true;
  interactive.dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  assert.match(status.textContent, /Export mode changed/);
  build.click();
  await settle();
  assert.equal(modes.at(-1), 'interactive');
  assert.equal(download.hidden, false);
  const importOptions = descendants(modal).find(el => el.tagName === 'FIELDSET' &&
    el.firstChild?.textContent === 'Include full imported datasets');
  const importCheck = () => descendants(importOptions).find(el => el.type === 'checkbox');
  const scriptOptions = descendants(modal).find(el => el.tagName === 'FIELDSET' &&
    el.firstChild?.textContent === 'Include local author scripts');
  const scriptCheck = () => descendants(scriptOptions).find(el => el.type === 'checkbox');
  assert.equal(scriptCheck().checked, false);
  assert.match(scriptOptions.textContent, /widgets\.js.*Chapter.*helpers\.js/);
  assert.equal(importCheck().checked, false);
  assert.match(importOptions.textContent, /input\.csv · 22 bytes.*Home · #runs/);
  assert.equal(await verifyDownload(), '<!doctype html>');
  scriptCheck().checked = true;
  scriptCheck().dispatchEvent(new Event('change'));
  assert.match(status.textContent, /Script choices changed/);
  importCheck().checked = true;
  importCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  download.click();
  assert.equal(downloads.length, 2);
  build.click();
  await settle();
  assert.deepEqual(consents.at(-1), ['accepted-revision']);
  assert.equal(importCheck().checked, true);
  assert.equal(scriptCheck().checked, true);
  assert.equal(download.hidden, false);
  assert.equal(await verifyDownload(), '<!doctype html>donnéesscript');
  importCheck().checked = false;
  importCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  assert.deepEqual(consents.at(-1), []);
  assert.equal(await verifyDownload(), '<!doctype html>script');
  scriptCheck().checked = false;
  scriptCheck().dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  download.click();
  assert.equal(downloads.length, 4);
  build.click();
  await settle();
  assert.equal(await verifyDownload(), '<!doctype html>');
  assert.match(modal.textContent, /Saved reading data/);
  const cleared = [];
  p.OP._readerState.clear = async () => cleared.push(true) && true;
  find('BUTTON', 'Clear saved views and imports').click();
  find('BUTTON', 'Keep').click();
  assert.equal(cleared.length, 0);
  find('BUTTON', 'Clear saved views and imports').click();
  find('BUTTON', 'Clear').click();
  await settle();
  assert.equal(cleared.length, 1);
  assert.match(status.textContent, /cleared\. Build a new preview/);
  assert.equal(download.hidden, true);
  build.click();
  await settle();
  chapter.checked = false;
  chapter.dispatchEvent(new Event('change'));
  assert.equal(download.hidden, true);
  assert.equal(group.indeterminate, true);
  find('BUTTON', 'Close').click();
  assert.equal(p.document.activeElement, opener);
  assert.equal(modal.isConnected, false);
});

test('required failures preserve fallbacks and independent features still reach ready', async () => {
  const p = page({ entryProfile: 'none',
    config: { features: { citations: true, tooltips: false, scenarios: true, math: true, chart: true, tabs: true } },
    fail: ['offprint/css/chart.css', 'offprint/js/tabs.js']
  });
  await p.start();
  assert.ok(p.OP._math);
  assert.equal(p.OP._chart, undefined);
  assert.equal(p.loads.includes('offprint/js/refs.js'), false);
  assert.equal(p.loads.includes('offprint/js/scenarios.js'), false);
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => [item.code, item.feature]), [
    ['dependency', 'citations'], ['asset', 'chart'], ['dependency', 'scenarios'], ['asset', 'tabs']
  ]);
});

test('chart setup merges options and an invalid attribute preserves the configured height', async () => {
  const p = page({
    site: { profile: 'none', features: { chart: true }, options: {
      chart: { height: 300, x: { label: 'Samples' }, referenceLines: [{ axis: 'y', value: 2 }] }
    } },
    config: { options: {
      chart: { height: 330, x: { digits: 1 }, referenceLines: [], instances: { trace: { height: 360 } } }
    } }
  });
  const host = element('div');
  host.id = 'trace';
  host.setAttribute('data-op-height', '400px');
  p.OP.setup(OP => {
    const api = OP._chart.mount(host, { data: [2, 3], height: 390 });
    assert.equal(OP._chart.mount(host, { height: 410 }), api);
    assert.equal(api.spec().height, 390);
    assert.equal(api.spec().x.label, 'Samples');
    assert.equal(api.spec().x.digits, 1);
    assert.equal(api.spec().referenceLines.length, 0);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.code), ['chart-option']);
});

test('configured chart motion merges like other chart options and add-on chart types name their loader feature', async () => {
  const p = page({
    site: { profile: 'none', features: { chart: true }, options: { chart: { motion: false } } },
    config: { options: { chart: { instances: { lively: { motion: true }, odd: { motion: 'slow' } } } } }
  });
  const hosts = ['calm', 'lively', 'odd', 'needs'].map(id => Object.assign(element('div'), { id }));
  p.OP.setup(OP => {
    assert.equal(OP._chart.mount(hosts[0], { data: [1, 2] }).model().motion, false);
    assert.equal(OP._chart.mount(hosts[1], { data: [1, 2] }).model().motion, true);
    assert.equal(OP._chart.mount(hosts[2], { data: [1, 2] }).model().motion, false, 'an invalid value keeps the site choice');
    assert.equal(OP._chart.mount(hosts[3], { type: 'histogram', data: [1, 2] }), null);
    assert.equal(OP._boot.chartFeature('heatmap'), 'chart-heatmap');
    assert.equal(OP._boot.chartFeature('line'), null);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.code), ['chart-option']);
});

test('the offline loader enables interval plots and loads their chart dependency first', async () => {
  const p = page({ entryProfile: 'none', config: { features: { 'chart-intervals': true } } });
  await p.start();
  assert.deepEqual(p.loads.filter(path => path.includes('/chart')), [
    'offprint/css/chart.css', 'offprint/js/chart.js', 'offprint/css/chart-intervals.css', 'offprint/js/chart-intervals.js'
  ]);
  assert.equal(p.OP._boot.chartFeature('interval'), 'chart-intervals');
  assert.equal(p.OP._chart.normalize({ type: 'interval', data: [['A', 3]] }).addon, 'interval');
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('mixed features load all shipped assets and register data before author setup', async () => {
  const features = Object.fromEntries(('animation cards chart code concept-tables data-view dropdowns dropzone editable-text figure-steps ' +
    'glossary math parameters peek-bubbles pipeline results reveals scenarios selection sequence split-views stepper tabs timeline tree tree-diagram zoom-tools')
    .split(' ').map(key => [key, true]));
  const p = page({ nested: true, site: { features, assets: { data: {
    'Reference counts': { source: 'docs/assets/data/feature-groups.csv', output: 'docs/assets/generated/reference-counts.js' }
  } } }, storage: { 'offprint-theme': 'light' }, dark: true });
  assert.equal(p.html.getAttribute('data-op-theme'), 'light');
  p.OP.setup(OP => {
    const snapshot = OP.data.source('Reference counts').snapshot();
    assert.match(snapshot.text, /group,references/);
    assert.equal(snapshot.value[0].group, 'setup');
    assert.equal(OP.data.define('setup-records', { type: 'value', value: [{ id: 'sample' }] }).snapshot().revision, 0);
    assert.equal(OP.data.define('readings', { type: 'csv', text: 'x,y\n1,2' }).snapshot().name, 'readings');
    assert.equal(typeof OP._animation.mount, 'function');
    assert.equal(typeof OP._chart.mount, 'function');
    assert.equal(typeof OP._dropdowns.mount, 'function');
    assert.equal(typeof OP._editableText.mount, 'function');
    assert.equal(typeof OP.sequence.get, 'function');
    assert.equal(typeof OP._sequenceDiagram.get, 'function');
    assert.equal(typeof OP._treeDiagram.get, 'function');
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.message), []);
  assert.equal(p.OP.data.source('readings').snapshot().text, 'x,y\n1,2');
  assert.deepEqual(Array.from(p.OP.data.names()), ['Reference counts', 'setup-records', 'readings']);
  assert.equal(new Set(p.loads).size, p.loads.length);
  assert.ok(!p.loads.some(path => path.includes('export-') || path.includes('page-snapshot')));
  assert.ok(p.loads.includes('offprint/js/scenarios.js'));
  assert.deepEqual(p.loads.filter(path => /^offprint\/js\/(detail|diagram|pipeline|sequence-diagram|timeline|tree-diagram)\.js$/.test(path)), [
    'offprint/js/detail.js', 'offprint/js/diagram.js', 'offprint/js/pipeline.js', 'offprint/js/timeline.js',
    'offprint/js/sequence-diagram.js', 'offprint/js/tree-diagram.js'
  ]);
  for (const css of ['timeline', 'sequence', 'tree-diagram']) assert.ok(p.loads.includes('offprint/css/' + css + '.css'));
  assert.ok(p.loads.includes('offprint/js/zoomtools.js'));
  for (const alias of ['anim', 'bubble', 'dataset', 'nav', 'notes', 'params', 'refs', 'reveal', 'roleCss', 'tooltip', 'zoomtools']) {
    assert.equal(Object.hasOwn(p.OP, alias), false, alias);
  }
});

test('only current source and view attributes register and render data', async () => {
  const p = page({ config: { profile: 'none', features: { 'data-view': true, dropzone: true } } });
  const oldSource = element('script');
  oldSource.setAttribute('data-op-data', 'old');
  oldSource.setAttribute('type', 'text/csv');
  oldSource.textContent = 'a,b\n1,2';
  const source = element('script');
  source.setAttribute('data-op-source', 'current');
  source.setAttribute('data-op-type', 'json');
  source.setAttribute('type', 'text/csv');
  source.textContent = 'a,b\n1,2';
  const oldView = element('div');
  oldView.setAttribute('data-op-data', 'current');
  oldView.setAttribute('data-op-view', 'code');
  oldView.textContent = 'Old fallback';
  const view = element('div');
  view.setAttribute('data-op-source', 'current');
  view.setAttribute('data-op-data-view', 'code');
  view.setAttribute('data-op-view', 'tree');
  view.setAttribute('data-op-type', 'json');
  const bare = element('div');
  bare.setAttribute('data-op-source', 'current');
  bare.setAttribute('data-op-view', 'code');
  bare.textContent = 'Bare fallback';
  const capped = element('div');
  capped.setAttribute('data-op-source', 'current');
  capped.setAttribute('data-op-data-view', 'code');
  capped.setAttribute('data-op-max-size', '1 B');
  const nodes = [oldSource, source, oldView, view, bare, capped];
  p.body.querySelectorAll = selector => {
    switch (selector) {
      case 'script[data-op-source], pre[data-op-source]':
        return nodes.filter(node => node.tagName === 'SCRIPT' && node.hasAttribute('data-op-source'));
      case '[data-op-data-view]:not([data-op-dropzone])':
        return nodes.filter(node => node.hasAttribute('data-op-data-view'));
      default:
        return nodes.filter(node => selector.startsWith('[data-op-data]') && node.hasAttribute('data-op-data'));
    }
  };
  await p.start();
  assert.equal(p.OP.data.source('old'), null);
  assert.equal(oldView.textContent, 'Old fallback');
  assert.equal(bare.textContent, 'Bare fallback');
  assert.equal(p.OP.data.source('current').snapshot().type, 'csv');
  const controller = p.OP._dataView.get(view);
  assert.equal(controller.snapshot().view, 'code');
  assert.equal(view.textContent, 'a,b\n1,2');
  assert.match(capped.textContent, /over this block's 1 byte limit/);
  assert.equal(capped.firstChild.lastChild.textContent, 'Show anyway');
  const target = p.OP._dropzone.link(view);
  const zone = element('div');
  assert.equal(target.kind, 'data');
  assert.equal(target.feed({ type: 'csv', text: 'a,b\n3,4' }, {}, zone, target.reserve()), '');
  assert.equal(view.textContent, 'a,b\n3,4');
  target.restore(zone, target.reserve());
  assert.equal(view.textContent, 'a,b\n1,2');
});

test('the asset tool loads through the offline entry and wires its folder input', async () => {
  const url = new URL('tools/assets.html', library);
  const markup = fs.readFileSync(url, 'utf8');
  const config = JSON.parse(markup.match(/<script type="application\/json" data-op-page>([\s\S]*?)<\/script>/)[1]);
  const p = page({ config });
  for (const [, tag, id] of markup.matchAll(/<(\w+)[^>]*? id="([^"]+)"/g)) p.ids.set(id, element(tag));
  const scripts = Array.from(markup.matchAll(/<script src="([^"]+)"/g), match => match[1]);
  assert.deepEqual(scripts, ['../offprint.js', 'asset-build.js', 'asset-page.js']);
  scripts.slice(1).forEach(src => p.runScript(new URL(src, url)));

  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list()), []);
  const folder = p.ids.get('folder');
  folder.files = [{}];
  folder.dispatchEvent(new Event('change'));
  assert.match(p.ids.get('status').textContent, /Choose a site folder/);
});

test('legacy search manifest keys do not load an index', async () => {
  const p = page({ site: { search: 'legacy.js' } });
  await p.start();
  assert.equal(p.OP._site.search, null);
  assert.equal(p.loads.some(asset => asset.endsWith('legacy.js')), false);
});

const matrixMapping = {
  row: 'actual class', column: 'prediction',
  rows: [{ key: 'A', label: 'Actual A' }, { key: 'B', label: 'Actual B' }],
  columns: [{ key: 'A', label: 'Predicted A' }, { key: 'B', label: 'Predicted B' }],
  measures: [
    { key: 'count', field: 'count', label: 'Count' },
    { key: 'share', field: 'percent', label: 'Normalized', unit: '%', range: [0, 100],
      normalization: 'Share of actual class' }
  ]
};

function matrixPage({ enabled = true, fail, options, attributes, input } = {}) {
  const p = page({ fail, config: { profile: 'none', features: { matrix: enabled },
    options: { matrix: { instances: { confusion: { mapping: matrixMapping, ...options } } } } } });
  const table = p.body.appendChild(element('table'));
  table.id = 'confusion';
  table.setAttribute('data-op-matrix', '');
  table.setAttribute('data-op-source', 'outcomes');
  for (const [key, value] of Object.entries(attributes || {})) table.setAttribute(key, value);
  p.ids.set(table.id, table);
  p.body.querySelectorAll = selector => selector === 'table[data-op-matrix]' ? [table] : [];
  const caption = table.appendChild(element('caption'));
  caption.textContent = 'Confusion matrix';
  const fallbackHead = table.appendChild(element('thead'));
  fallbackHead.appendChild(element('tr')).appendChild(element('th')).textContent = 'Actual class';
  const fallbackBody = table.appendChild(element('tbody'));
  fallbackBody.appendChild(element('tr')).appendChild(element('td')).textContent = 'Static evaluation totals';
  if (enabled) p.OP.setup(OP => OP.data.define('outcomes', input || {
    type: 'csv', text: 'prediction,count,actual class,percent\nA,4,B,50\nB,0,A,\nA,8,A,80'
  }));
  return { ...p, table, caption, fallbackHead, fallbackBody };
}

const matrixRecord = (row, column, count, percent) => ({ 'actual class': row, prediction: column, count, percent });
const matrixValues = (...value) => ({ type: 'value', value });

// The measure chooser is a radio chip group, rebuilt whenever the measures are replaced.
const descend = (el) => el.children.flatMap((child) => [child, ...descend(child)]);
const measureGroup = (p) => p.body.firstChild.children.find((child) => child.tagName === 'FIELDSET') || null;
const measureRadios = (p) => descend(measureGroup(p)).filter((el) => el.tagName === 'INPUT');
const chosenMeasure = (p) => measureRadios(p).find((input) => input.checked)?.value;
function chooseMeasure(p, key) {
  const radios = measureRadios(p);
  radios.forEach((input) => { input.checked = input.value === key; });
  radios.find((input) => input.value === key).dispatchEvent(new Event('change'));
}

test('offline matrices pivot by declared keys and use one scale per measure chip', async () => {
  const p = matrixPage();
  const events = [];
  p.table.addEventListener('op:matrix:change', event => events.push(event));
  await p.start();
  const matrix = p.OP._matrix.get('confusion');
  assert.equal(matrix, p.OP._matrix.mount(p.table));
  assert.ok(p.loads.indexOf('offprint/js/data.js') < p.loads.indexOf('offprint/js/matrix.js'));
  assert.ok(p.loads.includes('offprint/css/matrix.css'));
  assert.equal(p.table.firstChild, p.caption);
  const [group, status, ramp] = p.body.firstChild.children;
  assert.equal(group, measureGroup(p));
  assert.equal(group.children[0].tagName, 'LEGEND');
  assert.equal(group.children[0].textContent, 'Measure');
  assert.deepEqual(measureRadios(p).map(input => [input.type, input.value]), [['radio', 'count'], ['radio', 'share']]);
  assert.equal(chosenMeasure(p), 'count');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(ramp.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(p.table.children[1].firstChild.children.slice(1).map(cell =>
    [cell.tagName, cell.getAttribute('scope'), cell.textContent]),
    [['TH', 'col', 'Predicted A'], ['TH', 'col', 'Predicted B']]);
  const cells = () => p.table.lastChild.children.flatMap(row => row.children.slice(1));
  const values = () => cells().map(cell => cell.textContent);
  const shades = () => cells().map(cell => cell.style.getPropertyValue('--op-matrix-strength'));
  assert.deepEqual(p.table.lastChild.children.map(row => [row.firstChild.getAttribute('scope'), row.firstChild.textContent]),
    [['row', 'Actual A'], ['row', 'Actual B']]);
  assert.deepEqual(values(), ['8', '0', '4', 'Missing']);
  assert.deepEqual(shades(), ['1', '0', '0.5', '']);
  assert.equal(status.textContent, '0 to 8');
  assert.equal(ramp.hidden, false);

  const observed = [];
  matrix.subscribe((state, meta) => observed.push([state.key, meta.origin, values()]), { immediate: true });
  chooseMeasure(p, 'share');
  assert.deepEqual(values(), ['80%', 'Missing', '50%', 'Missing']);
  assert.deepEqual(shades(), ['0.8', '', '0.5', '']);
  assert.equal(status.textContent, 'Share of actual class · 0% to 100%');
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'share', index: 1, label: 'Normalized', total: 2 });
  assert.equal(Object.isFrozen(matrix.snapshot()), true);
  assert.equal(matrix.select('unknown'), false);
  assert.equal(matrix.select('share'), true);
  assert.deepEqual(observed, [
    ['count', 'init', ['8', '0', '4', 'Missing']],
    ['share', 'user', ['80%', 'Missing', '50%', 'Missing']]
  ]);
  assert.deepEqual(events.map(event => [event.target, event.bubbles, event.detail.origin, event.detail.previous?.key]),
    [[p.table, true, 'init', undefined], [p.table, true, 'user', 'count']]);

  const source = p.OP.data.source('outcomes');
  const replaced = matrixValues(matrixRecord('B', 'B', 12, 65));
  assert.equal(source.update(replaced), true);
  assert.equal(matrix.snapshot().key, 'share');
  assert.deepEqual(values(), ['Missing', 'Missing', 'Missing', '65%']);
  assert.equal(chosenMeasure(p), 'share', 'a rebuilt chooser keeps the chosen measure');
  assert.equal(matrix.update([matrixRecord('A', 'A', 3, 100)]), true);
  assert.equal(source.update(matrixValues(matrixRecord('A', 'B', 11, 75))), true);
  assert.deepEqual(values(), ['100%', 'Missing', 'Missing', 'Missing']);
  assert.equal(matrix.reset(), true);
  assert.equal(matrix.snapshot().key, 'count');
  assert.deepEqual(values(), ['Missing', '11', 'Missing', 'Missing']);
  assert.deepEqual(shades(), ['', '', '', '']);
  assert.equal(status.textContent, 'All values equal 11');
  assert.equal(ramp.hidden, true);
  assert.equal(source.reset(), true);
  assert.deepEqual(values(), ['8', '0', '4', 'Missing']);
  assert.equal(source.update(matrixValues()), true);
  assert.ok(values().every(value => value === 'Missing'));
  assert.equal(status.textContent, 'No values supplied');
  assert.deepEqual(Array.from(p.OP.diagnostics.list()), []);
});

test('invalid matrix replacements roll back and authored content survives failed or disabled enhancement', async () => {
  const p = matrixPage({ options: { maxRows: 3, maxSize: '512 B', maxCells: 4 } });
  await p.start();
  const source = p.OP.data.source('outcomes');
  const matrix = p.OP._matrix.get(p.table);
  const initial = source.snapshot();
  const body = p.table.lastChild;
  const valid = matrixRecord('A', 'A', 2, null);
  for (const input of [
    matrixValues(valid, valid),
    matrixValues(matrixRecord('A', 'unknown', 2, null)),
    matrixValues(matrixRecord('A', 'A', '2', null)),
    matrixValues({ 'actual class': 'A', prediction: 'A', count: 2 }),
    matrixValues(valid, valid, valid, valid),
    matrixValues({ ...valid, padding: 'a'.repeat(512) }),
    { type: 'csv', text: 'actual class,prediction,count' }
  ]) {
    assert.equal(source.update(input), false);
    assert.equal(source.snapshot(), initial);
    assert.equal(p.table.lastChild, body);
  }
  assert.equal(matrix.update([matrixRecord('A', 'A', 2, true)]), false);
  assert.equal(p.table.lastChild, body);
  for (const inputs of [
    { enabled: false },
    { fail: ['offprint/js/data.js'] },
    { attributes: { 'data-op-max-cells': '3' } },
    { options: { mapping: { ...matrixMapping, rows: [matrixMapping.rows[0], matrixMapping.rows[0]] } } },
    { options: { mapping: { ...matrixMapping, measures: [matrixMapping.measures[0], matrixMapping.measures[0]] } } },
    { input: matrixValues(matrixRecord('A', 'unknown', 3, 50)) }
  ]) {
    const fallback = matrixPage(inputs);
    await fallback.start();
    assert.ok(fallback.body.firstChild === fallback.table);
    assert.deepEqual(fallback.body.lastChild.children.map(el => el.textContent), ['Export']);
    assert.deepEqual(fallback.table.children, [fallback.caption, fallback.fallbackHead, fallback.fallbackBody]);
    if (inputs.input) {
      const api = fallback.OP._matrix.get(fallback.table);
      assert.equal(api.snapshot(), null);
      assert.equal(api.update([valid]), true);
      assert.equal(api.reset(), true);
      assert.deepEqual(fallback.table.children, [fallback.caption, fallback.fallbackHead, fallback.fallbackBody]);
      assert.equal(fallback.OP.data.source('outcomes').update(matrixValues(valid)), true);
      assert.equal(api.snapshot().key, 'count');
    }
  }
});

test('matrix selection follows its key through named transform replacements', async () => {
  const p = matrixPage({ options: { transform: 'matrix-spec', transformOutput: 'spec' },
    input: matrixValues(matrixRecord('A', 'A', 1, 50)) });
  p.OP.setup(OP => OP.data.defineTransform('matrix-spec', ({ value }, { mapping }) => {
    const count = value[0].count;
    const measures = count === 1 ? mapping.measures :
      count === 2 ? [{ ...mapping.measures[1], label: 'Row share' }, mapping.measures[0]] : mapping.measures.slice(0, 1);
    return { records: value, mapping: { ...mapping, measures } };
  }));
  await p.start();
  const matrix = p.OP._matrix.get(p.table);
  const source = p.OP.data.source('outcomes');
  assert.equal(matrix.select('share'), true);
  assert.equal(source.update(matrixValues(matrixRecord('A', 'A', 2, 75))), true);
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'share', index: 0, label: 'Row share', total: 2 });
  assert.equal(chosenMeasure(p), 'share');
  assert.equal(source.update(matrixValues(matrixRecord('A', 'A', 3, 90))), true);
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'count', index: 0, label: 'Count', total: 1 });
  assert.equal(measureGroup(p), null, 'a single measure needs no chooser');
});

test('theme changes commit before listeners and queue writes requested by subscribers', async () => {
  const p = page({ config: { profile: 'none', features: { theme: true }, options: { theme: { mode: 'light' } } } });
  const seen = [];
  const host = p.body.appendChild(element('button'));
  p.ids.set('theme:toggle', host);
  await p.start();
  const theme = p.OP._theme;
  assert.equal(theme.mount('theme:toggle'), host);
  assert.equal(theme.mount(host), host);
  const unsubscribe = theme.subscribe((state, meta) => {
    seen.push([state.mode, meta.origin, p.html.getAttribute('data-op-theme'), host.getAttribute('aria-label')]);
    if (state.mode === 'dark') theme.set('light');
  }, { immediate: true });
  host.dispatchEvent(new Event('click'));
  assert.deepEqual(seen.map(([mode, origin, applied]) => [mode, origin, applied]),
    [['light', 'init', 'light'], ['dark', 'user', 'dark'], ['light', 'api', 'light']]);
  assert.match(seen[1][3], /Theme: Dark/);
  assert.deepEqual(p.events.map(event => [event.type, event.detail.current.mode]),
    [['op:theme:change', 'dark'], ['op:theme:change', 'light']]);
  unsubscribe();
  unsubscribe();
  assert.equal(theme.set('light'), true);
  assert.equal(theme.set('system'), false);
  assert.equal(seen.length, 3);
});

test('drawer and controls use committed state and retain valid options from the site', async () => {
  const p = page({ site: { options: { controls: { focus: true, navMode: 'auto' }, roles: { colors: { definition: 'blue' } } } },
    config: { options: { controls: { focus: 'invalid' }, roles: { colors: { definition: 'invalid' } } } } });
  const sidebar = p.body.appendChild(element('nav'));
  const opener = p.body.appendChild(element('button'));
  const querySelector = p.document.querySelector;
  p.document.querySelector = selector => selector === '.op-sidebar' ? sidebar : querySelector(selector);
  p.ids.set('open:nav', opener);
  await p.start();
  const { drawer } = p.OP._navigation;
  const seen = [];
  drawer.subscribe((state, meta) => seen.push([state.open, meta.origin]), { immediate: true });
  assert.equal(drawer.toggle('open:nav'), true);
  assert.equal(sidebar.focused, true);
  assert.equal(drawer.close(), true);
  assert.equal(drawer.close(), true);
  assert.equal(opener.focused, true);
  assert.deepEqual(seen, [[false, 'init'], [true, 'api'], [false, 'api']]);
  assert.deepEqual(p.events.filter(event => event.type === 'op:navigation:drawer').map(event => event.detail.current.open),
    [true, false]);
  const controls = p.OP._controls;
  assert.equal(p.OP._roles.color('definition'), 'blue');
  assert.deepEqual({ ...controls.snapshot() }, { focus: true, nav: false, navMode: 'auto' });
  assert.equal(controls.setFocus(false), true);
  assert.equal(controls.setNavMode('shown'), true);
  assert.equal(controls.setNavMode('invalid'), false);
  assert.deepEqual({ ...controls.snapshot() }, { focus: false, nav: true, navMode: 'shown' });
});

test('custom reading extensions mount code once, dispose tooltips, and resolve literal IDs', async () => {
  const p = page({ config: { profile: 'none', features: { code: true, tooltips: true, math: true, roles: true },
    options: { roles: { colors: { example: 'green' } } } } });
  await p.start();
  const OP = p.OP;
  const pre = p.body.appendChild(element('pre'));
  pre.textContent = 'const x = 1;';
  p.ids.set('sample:code', pre);
  assert.equal(OP._code.mount('sample:code'), pre);
  assert.equal(OP._code.mount(pre), pre);
  assert.equal(pre.parentNode.className, 'op-code');
  assert.equal(pre.parentNode.childNodes.length, 2);
  const term = p.body.appendChild(element('span'));
  term.setAttribute('aria-describedby', 'prior');
  p.ids.set('term:example', term);
  const dispose = OP._tooltips.attach('term:example', '', 'An example.');
  assert.match(term.getAttribute('aria-describedby'), /^prior op-tip-/);
  dispose();
  dispose();
  assert.equal(term.getAttribute('aria-describedby'), 'prior');
  assert.equal(p.body.childNodes.filter(node => !node.hasAttribute('data-op-reader-state-control')).length, 2);
  const math = p.body.appendChild(element('span'));
  p.ids.set('math:x', math);
  assert.equal(OP._math.set('math:x', 'x^2'), true);
  assert.equal(OP._math.source('math:x'), 'x^2');
  assert.equal(OP._roles.color('example'), 'green');
  assert.match(OP._roles.css({ warning: 'red' }), /--op-role-warning:var\(--op-red\)/);
});

test('shortcuts use a single capture listener and route to the innermost active scope', async () => {
  const p = page({ entryProfile: 'none' });
  const outer = p.body.appendChild(element('div'));
  const inner = outer.appendChild(element('div'));
  const button = inner.appendChild(element('button'));
  const calls = [];
  let opened = false;
  let remove;
  p.OP.setup(({ shortcuts }) => {
    const register = (id, scope, active) => shortcuts.register({ id, key: 'A', scope, active, run: () => calls.push(id) });
    register('global');
    register('outer', outer);
    remove = register('inner', inner, () => opened);
  });
  await p.start();
  assert.deepEqual(p.keyboards.map(({ capture }) => capture), [true]);
  assert.equal(p.key('a', button).defaultPrevented, true);
  p.key('a', outer);
  p.key('a');
  opened = true;
  p.key('a', outer);
  remove();
  p.key('A', button, { shiftKey: true });
  assert.deepEqual(calls, ['inner', 'outer', 'global', 'inner', 'outer']);
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('shortcuts preserve editable, composed, handled and unbound modifier keystrokes', async () => {
  const p = page({ entryProfile: 'none' });
  const textbox = p.body.appendChild(element('input'));
  textbox.closest = selector => selector.startsWith('input,') ? textbox : null;
  const editor = p.body.appendChild(element('div'));
  editor.isContentEditable = true;
  const calls = [];
  p.OP.setup(({ shortcuts }) => {
    shortcuts.register({ id: 'plain', key: 'X', run: () => calls.push('plain') });
    shortcuts.register({ id: 'chord', key: 'Ctrl+Shift+X', run: () => calls.push('chord') });
  });
  await p.start();
  p.key('x', textbox);
  p.key('x', editor);
  p.key('x', p.body, { composedPath: () => [textbox, p.body] });
  p.key('x', p.body, { isComposing: true });
  p.key('x', p.body, { getModifierState: key => key === 'AltGraph' });
  p.key('x', p.body, { handled: true });
  p.key('x', p.body, { ctrlKey: true });
  p.key('x', p.body, { metaKey: true });
  p.key('x', p.body, { altKey: true });
  p.key('x', textbox, { ctrlKey: true, shiftKey: true });
  assert.deepEqual(calls, []);
  p.key('X', p.body, { ctrlKey: true, shiftKey: true });
  p.key('x');
  assert.deepEqual(calls, ['chord', 'plain']);
});

test('shortcut options merge per ID and report a duplicate effective key in the same scope', async () => {
  const p = page({
    site: { profile: 'none', options: { shortcuts: { primary: 'x', secondary: 'z', hidden: 'b' } } },
    config: { options: { shortcuts: { secondary: 'X', hidden: null, chord: 'Ctrl++', invalid: false } } }
  });
  const calls = [];
  p.OP.setup(({ shortcuts }) => {
    for (const [id, key] of Object.entries({ primary: 'p', secondary: 's', hidden: 'h', chord: 'C', invalid: 'I' })) {
      shortcuts.register({ id, key, run: () => calls.push(id) });
    }
  });
  await p.start();
  assert.deepEqual([...p.OP.shortcuts.keys('primary')], ['X']);
  assert.deepEqual([...p.OP.shortcuts.keys('secondary')], []);
  assert.deepEqual([...p.OP.shortcuts.keys('hidden')], []);
  assert.deepEqual([...p.OP.shortcuts.keys('chord')], ['Control++']);
  for (const key of ['p', 's', 'z', 'b', 'h', '+']) assert.equal(p.key(key).defaultPrevented, false);
  assert.equal(p.key('X').defaultPrevented, true);
  assert.equal(p.key('+', p.body, { ctrlKey: true }).defaultPrevented, true);
  assert.equal(p.key('i').defaultPrevented, true);
  assert.deepEqual(calls, ['primary', 'chord', 'invalid']);
  const reports = p.OP.diagnostics.list();
  assert.deepEqual(Array.from(reports, report => [report.code, report.feature]),
    [['shortcut-conflict', 'shortcuts'], ['shortcut-key', 'shortcuts']]);
  assert.match(reports[0].message, /primary.*secondary/);
  assert.equal(p.events.filter(event => event.type === 'op:diagnostic').length, 2);
});

test('search remaps its opening key and honors a disabled Escape while the typing field is focused', async () => {
  const p = page({
    site: { profile: 'none', features: { search: true }, options: { shortcuts: { 'search.open': 'g' } } },
    config: { options: { shortcuts: { 'search.close': null } } }
  });
  let dialog;
  let input;
  p.document.createTreeWalker = () => ({ nextNode: () => null });
  const create = p.document.createElement;
  p.document.createElement = tag => {
    const el = create(tag);
    el.scrollIntoView = () => {};
    if (tag === 'dialog') {
      dialog = el;
      el.showModal = () => { el.open = true; };
      el.close = () => { el.open = false; };
    }
    if (tag === 'input') {
      input = el;
      el.value = '';
      el.select = () => {};
      el.closest = selector => selector.startsWith('input,') ? el : selector === 'dialog:modal' ? dialog : null;
    }
    return el;
  };
  await p.start();
  assert.equal(p.key('s').defaultPrevented, false);
  assert.equal(p.key('g').defaultPrevented, true);
  assert.equal(dialog.open, true);
  assert.equal(p.key('g', input).defaultPrevented, false);
  assert.equal(p.key('Escape', input).defaultPrevented, false);
  const cancel = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(dialog.open, true);
  const closeButton = dialog.lastChild.lastChild;
  assert.equal(closeButton.getAttribute('aria-keyshortcuts'), null);
  closeButton.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false);
});

test('declarative animations use the same SVG endpoints in the source and Reader', async () => {
  const p = page({ config: { profile: 'none', features: { animation: true } } });
  function declaration(id, options) {
    const figure = p.body.appendChild(element('figure'));
    figure.id = id;
    p.ids.set(id, figure);
    const svg = figure.appendChild(element('svg'));
    const circle = svg.appendChild(element('circle'));
    circle.namespaceURI = 'http://www.w3.org/2000/svg';
    circle.setAttribute('r', '4');
    const script = figure.appendChild(element('script'));
    script.type = 'application/json';
    script.textContent = JSON.stringify(options);
    figure.querySelector = selector => selector === 'svg' ? svg : null;
    figure.querySelectorAll = selector => selector === ':scope > script[data-op-animation]' ? [script] : [];
    svg.querySelectorAll = selector => selector === 'circle' ? [circle] : [];
    return { figure, circle, script };
  }
  const good = declaration('declarative', { duration: 0, steps: [
    { key: 'wider', actions: [{ attr: 'circle', name: 'r', to: 8 }] },
    { key: 'pause', actions: [] },
    { key: 'widest', actions: [{ attr: 'circle', name: 'r', from: 9, to: 12 }], initial: true }
  ] });
  const bad = declaration('invalid', { steps: [
    { key: 'valid', actions: [{ draw: 'circle' }] },
    { key: 'invalid', actions: [{ attr: 'circle', name: 'href', to: 'elsewhere' }] }
  ] });
  p.body.querySelectorAll = selector => selector === 'figure > script[data-op-animation]' ?
    [good.script, bad.script] : [];
  await p.start();
  const live = p.OP.sequence.get(good.figure);
  assert.equal(live.key, 'widest');
  assert.equal(good.circle.getAttribute('r'), '12');
  assert.equal(p.OP.sequence.get(bad.figure), null);
  assert.equal(bad.circle.getAttribute('r'), '4');
  assert.equal(bad.circle.getAttribute('pathLength'), null);
  assert.ok(p.OP.diagnostics.list().some(item => item.feature === 'animation'));

  const model = p.OP._animation.reader(good.figure);
  const [[target, changes]] = model.tracks([0, 1, 2, 3]);
  assert.equal(target, good.circle);
  assert.equal(JSON.stringify(changes), JSON.stringify([[0, 'r', '4'], [1, 'r', '8'], [3, 'r', '12']]));
  assert.equal(model.read(), 3);
  live.select('wider');
  assert.equal(good.circle.getAttribute('r'), '8');
  live.select('start');
  assert.equal(good.circle.getAttribute('r'), '4');
});

test('Reader step controls restore jumps, shared notes and page-local choice', () => {
  const p = page();
  p.runScript(new URL('offprint/js/export-reader.js', repo));
  const saved = new Map();
  function mount() {
    const host = element('div');
    const target = element('circle');
    const shared = element('div');
    const alternate = element('div');
    const anchor = alternate.appendChild(element('a'));
    const nodes = [host, target, shared, alternate];
    host.replaceChildren = (...children) => {
      host.childNodes.slice().forEach(node => host.removeChild(node));
      host.append(...children);
    };
    host.setAttribute('data-op-reader-steps', JSON.stringify([0, 1, [
      ['start', 'Start', [0], ''], ['look', 'Look', [1], 'Caption'], ['end', 'End', [0], '']
    ]]));
    target.setAttribute('data-op-reader-step-svg', JSON.stringify([0, [
      [0, 'r', '4'], [1, 'r', '8'], [2, 'r', '12'], [0, '.opacity', '0'], [2, '.opacity', '1']
    ]]));
    shared.setAttribute('data-op-reader-step-detail', '0:0');
    alternate.setAttribute('data-op-reader-step-detail', '0:1');
    p.body.querySelectorAll = selector => nodes.filter(node => node.hasAttribute(selector.slice(1, -1)));
    const reveal = p.OP._exportReader.figureSteps(p.document, saved);
    const [previous, select, next] = host.firstChild.children;
    return { host, target, shared, alternate, anchor, reveal, previous, select, next };
  }
  const first = mount();
  assert.equal(first.select.value, 'look');
  assert.equal(first.host.lastChild.textContent, 'Caption');
  assert.equal(first.target.getAttribute('r'), '8');
  assert.equal(first.shared.hidden, true);
  assert.equal(first.alternate.hidden, false);
  first.next.click();
  assert.equal(first.next.getAttribute('aria-disabled'), 'true');
  assert.equal(first.target.style.getPropertyValue('opacity'), '1');
  assert.equal(first.shared.hidden, false);
  first.select.selectedIndex = 0;
  first.select.dispatchEvent(new Event('change'));
  assert.equal(first.previous.getAttribute('aria-disabled'), 'true');
  assert.equal(first.target.getAttribute('r'), '4');
  assert.equal(first.target.style.getPropertyValue('opacity'), '0');
  assert.equal(first.shared.hidden, false);

  const second = mount();
  assert.equal(second.select.value, 'start');
  second.reveal(second.anchor);
  assert.equal(second.select.value, 'look');
  assert.equal(second.alternate.hidden, false);
  assert.equal(second.shared.hidden, true);
});

test('Reader controls draw full section lines, keep a first-level outline, and operate the compact drawer', () => {
  const p = page();
  const core = vm.createContext({ console });
  core.window = core;
  vm.runInContext(fs.readFileSync(new URL('offprint/js/core.js', repo), 'utf8'), core);
  const icons = core.OffPrint._icons;
  p.runScript(new URL('offprint/js/export-reader.js', repo));
  const create = p.document.createElement.bind(p.document);
  p.html.toggleAttribute = (name, on) => on ? p.html.setAttribute(name, '') : p.html.removeAttribute(name);
  p.document.createElement = tag => {
    const node = create(tag);
    node.after = child => node.parentNode.insertBefore(child, node.nextSibling);
    node.dataset = {};
    Object.defineProperty(node, 'hash', { get: () => node.href });
    if (tag === 'span') {
      const ring = element('circle');
      node.querySelector = () => ring;
    }
    return node;
  };
  const parts = new Map();
  function part(id, tag = 'div', parent = p.body) {
    const node = p.document.createElement(tag);
    node.id = id;
    parts.set('#' + id, node);
    parent.append(node);
    return node;
  }
  const host = part('export-page');
  const pill = part('export-pill');
  const pager = part('export-pager', 'nav');
  const sidebar = part('export-sidebar');
  const toc = part('export-contents', 'nav', sidebar);
  const closer = part('export-close', 'button', sidebar);
  const separator = part('export-resize');
  const edge = part('export-edge');
  const shade = part('export-shade');
  const first = part('first', 'a', part('first-row', 'div', toc));
  first.href = '#page-1';
  const second = part('second', 'a', part('second-row', 'div', toc));
  second.href = '#page-2';
  pager.querySelectorAll = () => [part('previous', 'a', pager), part('next', 'a', pager)];
  toc.querySelectorAll = selector => selector === '.op-nav-link' ? [first, second] :
    [first, second, ...toc.children.filter(node => node.tagName === 'UL')
    .flatMap(list => list.children.map(item => item.firstChild))];
  const compact = new EventTarget();
  compact.matches = false;
  const frames = [];
  const route = [];
  const controls = p.OP._exportReader.controls;
  // Give the shell control module only the browser APIs it uses.
  const chrome = vm.runInNewContext(`(${controls})(host, headings, tips, navigate, icons, reading)`, {
    host,
    icons,
    reading: core.OffPrint._reading,
    document: Object.assign(p.document, {
      querySelector: selector => parts.get(selector),
      getElementById: id => p.body.lastChild.children.find(node => node.id === id)
    }),
    window: new EventTarget(),
    matchMedia: query => query.includes('hover') ? compact : { matches: false },
    innerWidth: 1920,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    ResizeObserver: class { observe() {} disconnect() {} },
    headings: doc => doc.body.children.filter(node => node.localName),
    tips: () => () => {},
    navigate: (hash, smooth) => route.push([hash, !!smooth])
  });
  const [progress, nav, focus, theme] = pill.children;
  assert.equal(pill.children.length, 4);

  const zoomWatchers = [];
  function mount(id) {
    const doc = new EventTarget();
    const view = new EventTarget();
    const main = element('main');
    main.matches = selector => selector === '.op-page:not(.op-bubble-body)';
    const intro = main.appendChild(element('h1'));
    const section = main.appendChild(element('h2'));
    const discussion = main.appendChild(element('p'));
    const nextSection = main.appendChild(element('h2'));
    const paragraph = main.appendChild(element('p'));
    main.insertBefore(paragraph, intro);
    intro.id = 'intro';
    intro.localName = 'h1';
    intro.getBoundingClientRect = () => ({ top: 10, bottom: 25 });
    section.id = 'more';
    section.localName = 'h2';
    section.getBoundingClientRect = () => ({ top: 20, bottom: 35, left: 15 });
    section.style.setProperty('--op-section-color', 'purple');
    discussion.getBoundingClientRect = () => ({ top: 35, bottom: 90 });
    nextSection.id = 'next';
    nextSection.getBoundingClientRect = () => ({ top: 100, bottom: 110, left: 15 });
    paragraph.getBoundingClientRect = () => ({ top: -20, bottom: -5 });
    doc.body = main;
    main.ownerDocument = doc;
    doc.createElement = element;
    doc.documentElement = element('html');
    doc.scrollingElement = { clientHeight: 100, scrollHeight: 300, scrollTop: 50 };
    doc.defaultView = view;
    doc.querySelector = () => null;
    view.document = doc;
    view.MutationObserver = class {
      constructor(fn) { zoomWatchers.push(fn); }
      observe() {}
      disconnect() {}
    };
    view.scrollY = 50;
    view.Event = Event;
    view.getComputedStyle = node => ({ scrollMarginTop: '0', fontSize: '20',
      getPropertyValue: name => node.style.getPropertyValue(name) });
    chrome.page(id, id === 'page-1' ? [null, { id: 'page-2', title: 'Second' }] : [null, null]);
    chrome.mount(doc, id);
    frames.splice(0).forEach(fn => fn());
    return doc;
  }

  const doc = mount('page-1');
  assert.equal(theme.innerHTML, icons.light);
  assert.equal(nav.innerHTML, icons.nav);
  assert.equal(nav.className, 'op-controls-btn op-controls-nav');
  doc.documentElement.classList.add('op-zoom-open');
  zoomWatchers.at(-1)();
  assert.equal(p.html.hasAttribute('data-zoom'), true);
  assert.equal(pill.inert, true);
  assert.equal(pager.inert, true);
  doc.documentElement.classList.remove('op-zoom-open');
  zoomWatchers.at(-1)();
  assert.equal(p.html.hasAttribute('data-zoom'), false);
  assert.equal(pill.inert, false);
  assert.equal(first.getAttribute('aria-current'), 'page');
  assert.deepEqual(toc.querySelectorAll().slice(2).map(link => link.href), ['#page-1/intro']);
  assert.equal(toc.querySelectorAll().at(-1).getAttribute('aria-current'), 'location');
  assert.equal(toc.querySelectorAll().at(-1).className, 'op-outline-link');
  assert.equal(toc.querySelectorAll().at(-1).classList.contains('is-active'), true);
  const layer = doc.body.lastChild;
  assert.equal(layer.className, 'op-section-lines');
  assert.deepEqual(layer.children.map(line => line.style.height), ['70px', '10px']);
  assert.equal(layer.firstChild.style.getPropertyValue('--op-section-color'), 'purple');
  // The subsection rail numbers h1 and h2 headings and fills rings up to the reading line.
  const rail = p.body.children.find(node => node.className === 'op-section-rail');
  const ringLinks = () => rail.firstChild.children.map(item => item.firstChild);
  assert.equal(rail.hidden, false);
  assert.deepEqual(ringLinks().map(link => [link.href, link.getAttribute('aria-label')]),
    [['#page-1/intro', '1. intro'], ['#page-1/more', '2. more'], ['#page-1/next', '3. next']]);
  assert.equal(ringLinks()[1].getAttribute('aria-current'), 'location');
  const arc = link => link.firstChild.querySelector().getAttribute('stroke-dashoffset');
  assert.deepEqual(ringLinks().slice(0, 2).map(arc), ['0', '87']);
  assert.equal(doc.documentElement.classList.contains('op-scrollbar-auto'), true);
  doc.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 380 }));
  assert.equal(doc.documentElement.classList.contains('op-scrollbar-near'), true);
  doc.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 100 }));
  assert.equal(doc.documentElement.classList.contains('op-scrollbar-near'), false);
  doc.body.children[3].getBoundingClientRect = () => ({ top: 35, bottom: 75 });
  doc.defaultView.dispatchEvent(new Event('resize'));
  assert.equal(layer.firstChild.style.height, '55px');
  assert.equal(progress.getAttribute('aria-valuenow'), '25');
  assert.equal(p.document.getElementById('export-hint-progress').textContent, 'Read 25%');
  assert.equal(nav.hasAttribute('title'), false);
  assert.equal(nav.getAttribute('data-op-snapshot-tip'), 'export-hint-nav');
  chrome.scrolled('#page-1/intro');
  p.key('j');
  // Heading jumps glide, and a quick second press steps on from the first target before the scroll settles.
  p.key('j');
  assert.deepEqual(route, [['#page-1/more', true], ['#page-1/next', true]]);
  p.key('t');
  assert.equal(theme.innerHTML, icons.dark);
  p.key('f');
  assert.equal(doc.documentElement.classList.contains('op-focus-mode'), true);
  assert.equal(doc.body.firstChild.classList.contains('op-focus-block'), true);
  assert.equal(doc.body.firstChild.classList.contains('op-focus-dim'), true);
  // The panel stays rendered and slides by class, so it can animate.
  const closed = () => p.html.classList.contains('op-nav-hidden');
  p.key('n');
  assert.equal(closed(), true);
  assert.equal(sidebar.hidden, false);
  p.key('n');
  assert.match(nav.getAttribute('aria-label'), /auto-hide/);
  edge.dispatchEvent(new Event('pointerenter'));
  assert.equal(closed(), false);
  p.key('Escape');
  assert.equal(closed(), true);
  p.key('n');
  assert.equal(closed(), false);
  separator.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowRight' }));
  assert.equal(separator.getAttribute('aria-valuenow'), '276');

  compact.matches = true;
  compact.dispatchEvent(new Event('change'));
  nav.click();
  assert.equal(host.inert, true);
  assert.equal(p.document.activeElement, closer);
  p.key('Escape', closer);
  assert.equal(host.inert, false);
  assert.equal(p.document.activeElement, nav);
  nav.click();
  shade.click();
  assert.equal(closed(), true);
  assert.equal(doc.documentElement.getAttribute('data-op-theme'), 'dark');
  const secondDoc = mount('page-2');
  assert.equal(second.getAttribute('aria-current'), 'page');
  assert.equal(first.getAttribute('aria-current'), null);
  assert.equal(focus.getAttribute('aria-pressed'), 'true');
  assert.equal(theme.getAttribute('aria-label'), 'Theme: Dark. Switch to Light.');
  assert.equal(secondDoc.documentElement.getAttribute('data-op-theme'), 'dark');

  chrome.page('page-1', [null, null]);
  chrome.mountRemote({ theme: 'dark', headings: [['top', 'Top', 1], ['child', 'Child', 2], ['leaf', 'Leaf', 3]] },
    'page-1', () => {});
  chrome.remoteProgress({ readings: [-30, -20, 10], height: 100, percent: 50, bottom: false, remaining: 50, end: 200 });
  const remoteOutline = toc.querySelectorAll().slice(2);
  assert.deepEqual(remoteOutline.map(link => link.href), ['#page-1/top']);
  assert.equal(remoteOutline[0].getAttribute('aria-current'), 'location');
  assert.deepEqual(ringLinks().map(link => link.href), ['#page-1/top', '#page-1/child']);
  assert.equal(ringLinks()[1].getAttribute('aria-current'), 'location');
  assert.deepEqual(ringLinks().map(arc), ['0', '68']);
  chrome.scrolled('#page-1/child');
  chrome.remoteKey('j');
  assert.deepEqual(route.at(-1), ['#page-1/leaf', true]);
});

test('Shared focus blocks blur each element inside plain wrappers, never the title, and run from source text', () => {
  const context = vm.createContext({ console });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('offprint/js/core.js', repo), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('offprint/js/export-reader.js', repo), 'utf8'), context);
  const exportReader = context.OffPrint._exportReader;
  // The export shell runs the helpers from their source text, so they must work without core.js around them.
  const reading = vm.runInNewContext('(' + exportReader.readingSource(context.OffPrint._reading) + ')');
  function node(localName, children = [], attributes = [], box = { top: 0, bottom: 10 }) {
    const classes = new Set();
    return { localName, children, attributes, classes,
      matches: selector => selector.split(',').map(part => part.trim()).includes(localName),
      querySelector: () => null,
      classList: { add: name => classes.add(name) },
      getBoundingClientRect: () => box };
  }
  const title = node('h1', [], [], { top: -200, bottom: -150 });
  const first = node('p', [], [], { top: -100, bottom: -10 });
  const second = node('p', [], [], { top: 40, bottom: 60 });
  const wrapper = node('section', [first, second]);
  const card = node('div', [node('p')], [{ name: 'class', value: 'card' }], { top: 90, bottom: 120 });
  const blocks = reading.focusBlocks(node('main', [title, node('script'), wrapper, card]));
  assert.deepEqual([...blocks].map(block => block.node), [title, first, second, card]);
  assert.equal(first.classes.has('op-focus-block'), true);
  assert.deepEqual([...blocks].map(({ node, title }) => {
    const rect = node.getBoundingClientRect();
    return reading.dimmed(rect.top, rect.bottom, 100, title);
  }), [false, true, false, true]);
  assert.equal(reading.jumpChain, 1000);
});

test('custom figures expose keyed animation state and committed zoom lifecycle events', async () => {
  const p = page({ config: { profile: 'none', features: { animation: true, zoom: true },
    options: { shortcuts: { 'zoom.close': 'q' } } } });
  const figure = p.body.appendChild(element('figure'));
  const svg = figure.appendChild(element('svg'));
  figure.querySelector = selector => selector === 'svg' ? svg : null;
  p.ids.set('custom-figure', figure);
  const events = [];
  figure.addEventListener('op:step', event => events.push([event.detail.key, event.detail.origin, event.bubbles]));
  let animation;
  p.OP.setup(OP => {
    animation = OP._animation.mount('custom-figure', { steps: [{ key: 'trace', label: 'Trace', actions: [] }] });
  });
  await p.start();
  assert.ok(animation);
  assert.equal(p.OP._animation.mount(figure), animation);
  assert.deepEqual({ ...animation.snapshot() }, { key: 'start', index: 0, count: 2, canPrev: false, canNext: true, playing: false });
  const steps = [];
  animation.subscribe((state, meta) => steps.push([state.key, meta.origin]));
  assert.equal(animation.select('unknown'), false);
  assert.equal(animation.select('trace'), true);
  animation.timeline.ends[0] = 0;
  assert.equal(animation.time, 400);
  assert.equal(animation.reset(), true);
  assert.deepEqual(steps, [['trace', 'api'], ['start', 'reset']]);
  assert.deepEqual(events, [['start', 'init', true], ['trace', 'api', true], ['start', 'reset', true]]);

  const zoom = p.OP._zoom;
  const observed = [];
  zoom.subscribe(state => observed.push(state ? figure.parentNode === state.stage : figure.parentNode === p.body));
  assert.equal(zoom.open('custom-figure'), true);
  const open = zoom.snapshot();
  assert.equal(zoom.open(figure), true);
  assert.equal(open.overlay.lastChild.getAttribute('aria-keyshortcuts'), 'Q');
  assert.equal(p.key('Escape', open.overlay).defaultPrevented, false);
  assert.equal(p.key('q', open.overlay).defaultPrevented, true);
  assert.equal(p.events.at(-1).type, 'op:zoom:closing');
  assert.equal(figure.parentNode, open.stage);
  open.overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.events.at(-1).type, 'op:zoom:change');
  assert.equal(p.events.at(-1).detail.current, null);
  assert.deepEqual(observed, [true, true]);
  assert.equal(p.body.focused, true);
});

test('diagram fullscreen requires an opt-in and opens from the background or keyboard', async () => {
  const p = page({ config: { profile: 'none', features: { zoom: true } } });
  const figures = ['op-timeline', 'op-sequence', 'op-tree-diagram', 'regular'].map((cls, i) => {
    const figure = p.body.appendChild(element('figure'));
    const background = figure.appendChild(element('div'));
    const control = figure.appendChild(element('button'));
    if (i === 0) figure.setAttribute('data-op-zoom', '');
    if (i === 1) figure.setAttribute('data-op-zoom', 'false');
    figure.matches = (selector) => selector === '.op-page img, .op-page figure';
    for (const target of [figure, background, control]) {
      target.closest = (selector) => {
        if (selector.includes('figure.' + cls) || selector.includes('.op-page figure')) return figure;
        return null;
      };
    }
    control.matches = (selector) => selector.split(', ').includes('button');
    return { figure, background, control };
  });
  p.body.querySelectorAll = (selector) => selector.startsWith('.op-page img') ? figures.map(({ figure }) => figure) : [];
  await p.start();
  assert.deepEqual(figures.map(({ figure }) => figure.classList.contains('op-zoomable')), [true, false, false, true]);
  p.click(figures[1].background);
  p.click(figures[2].background);
  p.click(figures[0].control);
  assert.equal(p.OP._zoom.snapshot(), null);
  p.click(figures[0].background);
  const open = p.OP._zoom.snapshot();
  assert.equal(open.target, figures[0].figure);
  assert.equal(open.target.parentNode, open.stage);
  p.OP._zoom.close();
  open.overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.OP._zoom.snapshot(), null);
  assert.equal(p.key('Enter', figures[0].figure).defaultPrevented, true);
  assert.equal(p.OP._zoom.snapshot().target, figures[0].figure);
});

test('offline parameter scopes merge before setup and publish their first snapshot before ready', async () => {
  const p = page({
    site: { profile: 'none', features: { parameters: true }, parameterScopes: {
      decoder: { temperature: { type: 'range', min: 0.5, max: 2, default: 1 }, flag: { type: 'toggle' } }
    } },
    config: { parameterScopes: { decoder: { temperature: { default: 1.5 } } } }
  });
  const order = [];
  p.OP.setup(OP => {
    const decoder = OP._parameters.scope('decoder');
    order.push('setup');
    assert.deepEqual({ ...decoder.snapshot() }, { temperature: 1.5, flag: false });
    assert.equal(decoder.set('temperature', 0.5), true);
    OP._parameters.define('experiment', { total: { type: 'number', default: 2 } });
    decoder.subscribe((state, meta) => order.push([state.temperature, meta.origin]), { immediate: true });
  });
  p.OP.ready(OP => {
    order.push('ready');
    assert.equal(OP._parameters.scope('experiment').get('total'), 2);
  });
  await p.start();
  assert.deepEqual(order, ['setup', [0.5, 'init'], 'ready']);
  assert.deepEqual(p.events, []);
  assert.equal(p.OP._parameters.scope('decoder').reset(), true);
  assert.equal(p.OP._parameters.scope('decoder').get('temperature'), 1.5);
});

test('selection groups merge across configuration and an authored group is available in setup', async () => {
  const p = page({
    nested: true,
    site: { profile: 'none', features: { selection: true, stepper: true }, selectionGroups: {
      trace: { initial: 'site', persist: true }
    } },
    config: { selectionGroups: { trace: { initial: 'page' } } }
  });
  const list = element('ol');
  list.id = 'trace-list';
  list.setAttribute('data-op-selection-group', 'implicit');
  const step = element('li');
  step.setAttribute('data-op-key', 'first');
  const label = element('strong');
  label.textContent = 'First';
  step.querySelector = selector => selector === ':scope > [data-op-step-label]' ? label : null;
  list.querySelectorAll = selector => selector === ':scope > li' ? [step] : [];
  list.before = () => {};
  p.body.querySelectorAll = selector => selector === 'ol[data-op-stepper]' ? [list] : [];
  p.OP.setup(OP => {
    assert.ok(OP.selection.group('implicit'));
    assert.equal(OP.selection.seed('implicit', 'first'), true);
  });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), item => item.message), []);
  assert.equal(p.OP._site.selectionGroups.trace.persist, true);
  assert.equal(p.OP.selection.group('trace').get(), 'page');
  assert.equal(p.OP.sequence.get(list).snapshot().key, 'first');
  const changes = p.events.filter(event => event.type === 'op:selection:change');
  assert.deepEqual(changes.map(event => [event.detail.group, event.detail.current.key]), [
    ['trace', 'page'], ['implicit', 'first']
  ]);
});

test('the offline loader enables histogram assets and registers the add-on after chart', async () => {
  const p = page({ entryProfile: 'none', config: { features: { 'chart-histogram': true } } });
  await p.start();
  assert.deepEqual(p.loads.filter(path => path.includes('/chart')), [
    'offprint/css/chart.css', 'offprint/js/chart.js', 'offprint/css/chart-histogram.css', 'offprint/js/chart-histogram.js'
  ]);
  assert.equal(p.OP._boot.chartFeature('histogram'), 'chart-histogram');
  assert.equal(p.OP._chart.normalize({ type: 'histogram', data: [1, 2] }).addon, 'histogram');
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('the offline loader enables heatmap assets and registers the add-on after chart', async () => {
  const p = page({ entryProfile: 'none', config: { features: { 'chart-heatmap': true } } });
  await p.start();
  assert.deepEqual(p.loads.filter(path => path.includes('/chart')), [
    'offprint/css/chart.css', 'offprint/js/chart.js', 'offprint/css/chart-heatmap.css', 'offprint/js/chart-heatmap.js'
  ]);
  assert.equal(p.OP._boot.chartFeature('heatmap'), 'chart-heatmap');
  assert.equal(p.OP._chart.normalize({ type: 'heatmap', z: [[1, 2]] }).addon, 'heatmap');
  assert.equal(p.OP.diagnostics.list().length, 0);
});

test('every catalog feature starts alone because prerequisites are declared before dependents', async () => {
  const catalog = entry.slice(entry.indexOf('var catalog = {'), entry.indexOf('var reading = ['));
  const ids = Array.from(catalog.matchAll(/^ {4}'?([a-z][a-z-]*)'?: \{/gm), (match) => match[1]);
  assert.ok(ids.includes('quiz') && ids.includes('cards'));
  for (const id of ids) {
    const p = page({ entryProfile: 'none', config: { features: { [id]: true } } });
    await p.start();
    const failures = Array.from(p.OP.diagnostics.list()).filter((item) => item.code === 'dependency' || item.code === 'asset');
    assert.deepEqual(Array.from(failures, (item) => item.message), [], id);
  }
});

test('quiz starts with its dropdown, chart, and card panel dependencies', async () => {
  const p = page({ config: { features: { quiz: true, data: true, code: true } } });
  await p.start();
  assert.deepEqual(Array.from(p.OP.diagnostics.list(), (item) => item.message), []);
  assert.equal(p.OP._boot.enabled('quiz'), true);
  assert.equal(typeof p.OP.quiz.defineType, 'function');
  assert.equal(typeof p.OP._cards.mount, 'function');
  assert.ok(p.loads.indexOf('offprint/js/steps.js') < p.loads.indexOf('offprint/js/quiz.js'));
});
