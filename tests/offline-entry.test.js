const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const repo = new URL('../', 'file://' + __filename);
const library = new URL('docform/', repo);
const entryURL = new URL('docform.js', library);
const entry = fs.readFileSync(entryURL, 'utf8');

function element(tag) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new EventTarget();
  return {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    clientWidth: 400,
    childNodes: [],
    get id() { return this.getAttribute('id') || ''; },
    set id(value) { this.setAttribute('id', value); },
    get parentElement() { return this.parentNode || null; },
    get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; },
    get firstChild() { return this.childNodes[0] || null; },
    get lastChild() { return this.childNodes.at(-1) || null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) { attrs.delete(name); },
    querySelector(selector) {
      return selector === '.df-progress-bar' && this.innerHTML?.includes('df-progress-bar') ? element('circle') : null;
    },
    querySelectorAll() { return []; },
    matches(selector) { return selector === tag || selector === '.' + this.className; },
    closest() { return null; },
    contains(child) { return this === child || this.childNodes.some(node => node.contains?.(child)); },
    getBoundingClientRect() { return { height: 10, width: 10 }; },
    focus() { this.focused = true; },
    appendChild(child) { return this.insertBefore(child, null); },
    insertBefore(child, before) {
      child.parentNode?.removeChild(child);
      const index = this.childNodes.indexOf(before);
      this.childNodes.splice(index === -1 ? this.childNodes.length : index, 0, child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; },
    remove() { this.parentNode?.removeChild(this); },
    replaceChild(child, old) { this.insertBefore(child, old); this.removeChild(old); },
    addEventListener: listeners.addEventListener.bind(listeners),
    removeEventListener: listeners.removeEventListener.bind(listeners),
    dispatchEvent(event) {
      Object.defineProperty(event, 'target', { value: this, configurable: true });
      return listeners.dispatchEvent(event);
    },
    style: { setProperty() {}, removeProperty() {} },
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: name => classes.delete(name),
      contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) }
  };
}

function page({ nested, site, config, lateConfig, entryProfile, fail = [], storage, dark, staticCSS, cite } = {}) {
  const location = new URL(nested ? 'pages/chapter.html' : 'index.html', repo);
  const source = new URL(nested ? '../docform/docform.js' : 'docform/docform.js', location);
  const siteScript = site ? { src: new URL(nested ? '../site.js' : 'site.js', location).href } : null;
  const siteConfig = config => ({ type: 'application/json', textContent: JSON.stringify(config) });
  const events = [];
  const loads = [];
  const head = element('head');
  const body = element('body');
  const html = element('html');
  const citation = cite ? element('cite') : null;
  const bibliography = cite ? element('div') : null;
  const ids = new Map();
  if (cite) {
    citation.setAttribute('data-df-cite', 'example');
    body.querySelectorAll = selector => {
      if (selector === '[data-df-cite]') return [citation];
      if (selector === '[data-df-bibliography]') return [bibliography];
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
    getElementById: id => ids.get(id) || null,
    querySelector: selector => selector === 'script[data-df-site]' ? siteScript : null,
    querySelectorAll(selector) {
      if (selector === 'script[data-df-page]') return this.readyState === 'loading'
        ? (config ? [siteConfig(config)] : [])
        : (lateConfig || config ? [siteConfig(lateConfig || config)] : []);
      if (selector.startsWith('link[rel') && staticCSS) return [{ href: new URL('docform.css', library).href }];
      return body.querySelectorAll(selector);
    },
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') launch = callback; },
    removeEventListener() {},
    dispatchEvent(event) { events.push(event); },
    createElement: element,
    createElementNS: (_, tag) => element(tag),
    createTextNode: textContent => ({ textContent })
  };
  const context = vm.createContext({
    document, location, URL, setTimeout, clearTimeout, queueMicrotask,
    CustomEvent: class extends Event {
      constructor(type, { detail, bubbles }) { super(type, { bubbles }); this.detail = detail; }
    },
    MutationObserver: class { observe() {} },
    localStorage: { getItem(key) { if (storage instanceof Error) throw storage; return storage?.[key] ?? null; } },
    matchMedia: () => ({ matches: !!dark, addEventListener() {} }),
    addEventListener() {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    getComputedStyle: () => ({}),
    console: { warn() {} },
    DocFormSite: site
  });
  context.window = context;
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
  vm.runInContext(entry, context);
  return {
    DF: context.DocForm, html, body, citation, events, loads, ids, document,
    async start() {
      document.readyState = 'interactive';
      const done = new Promise(resolve => context.DocForm.ready(resolve));
      launch();
      await done;
    }
  };
}

test('standalone reading profile applies early theme and renders citations with tooltip cards before ready', async () => {
  const p = page({ cite: true, staticCSS: true, storage: new Error('blocked'), config: {
    options: { theme: { mode: 'dark' }, citations: { entries: { example: 'An example source.' } } }
  } });
  assert.equal(p.html.getAttribute('data-df-theme'), 'dark');
  const order = [];
  let preview;
  p.DF.setup(DF => {
    order.push('setup');
    assert.equal(DF.site.provided, false);
    DF.tooltips.attach = (link, title, text, options) => { preview = options.content; };
    throw new Error('Example callback failure');
  });
  p.DF.setup(() => order.push('next setup'));
  p.DF.ready(DF => {
    order.push('ready');
    assert.equal(p.citation.childNodes[1].textContent, '1');
    assert.equal(preview().textContent, 'An example source.');
    assert.equal(typeof DF.search.open, 'function');
    assert.equal(DF.theme.get(), 'dark');
  });
  await p.start();
  assert.deepEqual(order, ['setup', 'next setup', 'ready']);
  assert.equal(p.loads.filter(path => path.endsWith('/refs.js')).length, 1);
  assert.equal(p.loads.some(path => path.endsWith('.css')), false);
  assert.deepEqual(p.events.map(event => event.detail.code), ['setup-failed']);
  assert.equal(p.DF.setup(() => {}), false);
  p.DF.ready(() => order.push('late ready'));
  assert.equal(order.at(-1), 'ready');
  await Promise.resolve();
  assert.equal(order.at(-1), 'late ready');
});

test('nested none profile clears inherited choices and loads a chart with its styles once', async () => {
  const p = page({ nested: true, entryProfile: 'reading',
    site: { profile: 'reading', features: { math: true }, pages: ['pages/chapter.html'] },
    lateConfig: { profile: 'none', features: { chart: true, cards: true, 'figure-steps': true } }
  });
  await p.start();
  assert.equal(p.DF.site.order[0].href, p.DF.page);
  assert.ok(Object.isFrozen(p.DF.site.order[0]));
  assert.equal(p.html.getAttribute('data-df-theme'), null);
  assert.deepEqual(p.loads, ['docform/js/core.js', 'docform/css/tokens.css', 'docform/css/base.css',
    'docform/css/chart.css', 'docform/js/chart.js', 'docform/css/steps.css', 'docform/js/steps.js']);
  assert.equal(p.DF.diagnostics.list().length, 0);
});

test('required failures preserve fallbacks and independent features still reach ready', async () => {
  const p = page({ entryProfile: 'none',
    config: { features: { citations: true, tooltips: false, scenarios: true, math: true, chart: true, tabs: true } },
    fail: ['docform/css/chart.css', 'docform/js/tabs.js']
  });
  await p.start();
  assert.ok(p.DF.math);
  assert.equal(p.DF.chart, undefined);
  assert.equal(p.loads.includes('docform/js/refs.js'), false);
  assert.equal(p.loads.includes('docform/js/scenarios.js'), false);
  assert.deepEqual(Array.from(p.DF.diagnostics.list(), item => [item.code, item.feature]), [
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
  host.setAttribute('data-df-height', '400px');
  p.DF.setup(DF => {
    const api = DF.chart.mount(host, { data: [2, 3], height: 390 });
    assert.equal(DF.chart.mount(host, { height: 410 }), api);
    assert.equal(api.spec().height, 390);
    assert.equal(api.spec().x.label, 'Samples');
    assert.equal(api.spec().x.digits, 1);
    assert.equal(api.spec().referenceLines.length, 0);
  });
  await p.start();
  assert.deepEqual(Array.from(p.DF.diagnostics.list(), item => item.code), ['chart-option']);
});

test('mixed features load all shipped assets and register data before author setup', async () => {
  const features = Object.fromEntries(('animation cards chart code concept-tables data-view dropzone figure-steps ' +
    'glossary math parameters peek-bubbles results reveals scenarios selection split-views stepper tabs tree wide zoom-tools')
    .split(' ').map(key => [key, true]));
  const p = page({ nested: true, site: { features, assets: { data: {
    runs: { source: 'examples/transformers/assets/runs.csv', output: 'examples/transformers/assets/generated/runs.js' }
  } } }, storage: { 'docform-theme': 'light' }, dark: true });
  assert.equal(p.html.getAttribute('data-df-theme'), 'light');
  p.DF.setup(DF => {
    assert.match(DF.dataset.get('runs').text, /r01,2026-11-14/);
    assert.equal(DF.data.source('runs').snapshot().value[0].run, 'r01');
    assert.equal(DF.data.define('setup-records', { type: 'value', value: [{ id: 'sample' }] }).snapshot().revision, 0);
    assert.equal(DF.dataset.add('readings', 'x,y\n1,2', 'csv').name, 'readings');
    assert.equal(typeof DF.animation.mount, 'function');
    assert.equal(typeof DF.chart.mount, 'function');
  });
  await p.start();
  assert.deepEqual(Array.from(p.DF.diagnostics.list(), item => item.message), []);
  assert.equal(p.DF.dataset.get('readings').text, 'x,y\n1,2');
  assert.deepEqual(Array.from(p.DF.data.names()), ['runs', 'setup-records']);
  assert.equal(new Set(p.loads).size, p.loads.length);
  assert.ok(p.loads.includes('docform/js/scenarios.js'));
  assert.ok(p.loads.includes('docform/js/zoomtools.js'));
});

test('theme changes commit before listeners and queue writes requested by subscribers', async () => {
  const p = page({ config: { profile: 'none', features: { theme: true }, options: { theme: { mode: 'light' } } } });
  const seen = [];
  const host = p.body.appendChild(element('button'));
  p.ids.set('theme:toggle', host);
  await p.start();
  const theme = p.DF.theme;
  assert.equal(theme.mount('theme:toggle'), host);
  assert.equal(theme.mount(host), host);
  const unsubscribe = theme.subscribe((state, meta) => {
    seen.push([state.mode, meta.origin, p.html.getAttribute('data-df-theme'), host.getAttribute('aria-label')]);
    if (state.mode === 'dark') theme.set('light');
  }, { immediate: true });
  host.dispatchEvent(new Event('click'));
  assert.deepEqual(seen.map(([mode, origin, applied]) => [mode, origin, applied]),
    [['light', 'init', 'light'], ['dark', 'user', 'dark'], ['light', 'api', 'light']]);
  assert.match(seen[1][3], /Theme: Dark/);
  assert.deepEqual(p.events.map(event => [event.type, event.detail.current.mode]),
    [['df:theme:change', 'dark'], ['df:theme:change', 'light']]);
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
  p.document.querySelector = selector => selector === '.df-sidebar' ? sidebar : querySelector(selector);
  p.ids.set('open:nav', opener);
  await p.start();
  const { drawer } = p.DF.navigation;
  const seen = [];
  drawer.subscribe((state, meta) => seen.push([state.open, meta.origin]), { immediate: true });
  assert.equal(drawer.toggle('open:nav'), true);
  assert.equal(sidebar.focused, true);
  assert.equal(drawer.close(), true);
  assert.equal(drawer.close(), true);
  assert.equal(opener.focused, true);
  assert.deepEqual(seen, [[false, 'init'], [true, 'api'], [false, 'api']]);
  assert.deepEqual(p.events.filter(event => event.type === 'df:navigation:drawer').map(event => event.detail.current.open),
    [true, false]);
  const controls = p.DF.controls;
  assert.equal(p.DF.roles.color('definition'), 'blue');
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
  const DF = p.DF;
  const pre = p.body.appendChild(element('pre'));
  pre.textContent = 'const x = 1;';
  p.ids.set('sample:code', pre);
  assert.equal(DF.code.mount('sample:code'), pre);
  assert.equal(DF.code.mount(pre), pre);
  assert.equal(pre.parentNode.className, 'df-code');
  assert.equal(pre.parentNode.childNodes.length, 2);
  const term = p.body.appendChild(element('span'));
  term.setAttribute('aria-describedby', 'prior');
  p.ids.set('term:example', term);
  const dispose = DF.tooltips.attach('term:example', '', 'An example.');
  assert.match(term.getAttribute('aria-describedby'), /^prior df-tip-/);
  dispose();
  dispose();
  assert.equal(term.getAttribute('aria-describedby'), 'prior');
  assert.equal(p.body.childNodes.length, 2);
  const math = p.body.appendChild(element('span'));
  p.ids.set('math:x', math);
  assert.equal(DF.math.set('math:x', 'x^2'), true);
  assert.equal(DF.math.source('math:x'), 'x^2');
  assert.equal(DF.roles.color('example'), 'green');
  assert.match(DF.roles.css({ warning: 'red' }), /--df-role-warning:var\(--df-red\)/);
});

test('custom figures expose keyed animation state and committed zoom lifecycle events', async () => {
  const p = page({ config: { profile: 'none', features: { animation: true, zoom: true } } });
  const figure = p.body.appendChild(element('figure'));
  const svg = figure.appendChild(element('svg'));
  figure.querySelector = selector => selector === 'svg' ? svg : null;
  p.ids.set('custom-figure', figure);
  const events = [];
  figure.addEventListener('df:animation:step', event => events.push([event.detail.current.key, event.detail.origin, event.bubbles]));
  let animation;
  p.DF.setup(DF => {
    animation = DF.animation.mount('custom-figure', { steps: [{ key: 'trace', caption: 'Trace', actions: [] }] });
  });
  await p.start();
  assert.ok(animation);
  assert.equal(p.DF.animation.mount(figure), animation);
  assert.deepEqual({ ...animation.snapshot() }, { key: 'start', index: 0, completed: 0, time: 0 });
  const steps = [];
  animation.subscribe((state, meta) => steps.push([state.key, meta.origin]));
  assert.equal(animation.go('unknown'), false);
  assert.equal(animation.go('trace'), true);
  animation.timeline.ends[0] = 0;
  assert.equal(animation.snapshot().time, 400);
  assert.equal(animation.reset(), true);
  assert.deepEqual(steps, [['trace', 'api'], ['start', 'reset']]);
  assert.deepEqual(events, [['start', 'init', true], ['trace', 'api', true], ['start', 'reset', true]]);

  const zoom = p.DF.zoom;
  const observed = [];
  zoom.subscribe(state => observed.push(state ? figure.parentNode === state.stage : figure.parentNode === p.body));
  assert.equal(zoom.open('custom-figure'), true);
  const open = zoom.snapshot();
  assert.equal(zoom.open(figure), true);
  assert.equal(zoom.close(), true);
  assert.equal(p.events.at(-1).type, 'df:zoom:closing');
  assert.equal(figure.parentNode, open.stage);
  open.overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.events.at(-1).type, 'df:zoom:change');
  assert.equal(p.events.at(-1).detail.current, null);
  assert.deepEqual(observed, [true, true]);
  assert.equal(p.body.focused, true);
});

test('offline parameter scopes merge before setup and publish their first snapshot before ready', async () => {
  const p = page({
    site: { profile: 'none', features: { parameters: true }, parameterScopes: {
      decoder: { temperature: { type: 'range', min: 0.5, max: 2, default: 1 }, flag: { type: 'toggle' } }
    } },
    config: { parameterScopes: { decoder: { temperature: { default: 1.5 } } } }
  });
  const order = [];
  p.DF.setup(DF => {
    const decoder = DF.parameters.scope('decoder');
    order.push('setup');
    assert.deepEqual({ ...decoder.snapshot() }, { temperature: 1.5, flag: false });
    assert.equal(decoder.set('temperature', 0.5), true);
    DF.parameters.define('experiment', { total: { type: 'number', default: 2 } });
    decoder.subscribe((state, meta) => order.push([state.temperature, meta.origin]), { immediate: true });
  });
  p.DF.ready(DF => {
    order.push('ready');
    assert.equal(DF.parameters.scope('experiment').get('total'), 2);
  });
  await p.start();
  assert.deepEqual(order, ['setup', [0.5, 'init'], 'ready']);
  assert.deepEqual(p.events, []);
  assert.equal(p.DF.parameters.scope('decoder').reset(), true);
  assert.equal(p.DF.parameters.scope('decoder').get('temperature'), 1.5);
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
  list.setAttribute('data-df-selection-group', 'implicit');
  const step = element('li');
  step.setAttribute('data-df-key', 'first');
  const label = element('strong');
  label.textContent = 'First';
  step.querySelector = selector => selector === ':scope > [data-df-step-label]' ? label : null;
  list.querySelectorAll = selector => selector === ':scope > li' ? [step] : [];
  list.before = () => {};
  p.body.querySelectorAll = selector => selector === 'ol[data-df-stepper]' ? [list] : [];
  p.DF.setup(DF => {
    assert.ok(DF.selection.group('implicit'));
    assert.equal(DF.selection.seed('implicit', 'first'), true);
  });
  await p.start();
  assert.deepEqual(Array.from(p.DF.diagnostics.list(), item => item.message), []);
  assert.equal(p.DF.site.selectionGroups.trace.persist, true);
  assert.equal(p.DF.selection.group('trace').get(), 'page');
  assert.equal(p.DF.stepper.get(list).snapshot().key, 'first');
  const changes = p.events.filter(event => event.type === 'df:selection:change');
  assert.deepEqual(changes.map(event => [event.detail.group, event.detail.current.key]), [
    ['trace', 'page'], ['implicit', 'first']
  ]);
});
