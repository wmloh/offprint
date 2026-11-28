const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { library, entryURL, trustedScripts, descendants, page } = require('../support/offline-page');

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
  const shared = trustedScripts(plan);
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

test('Interactive zoom uses the live figure and tears down before the reader replaces its frame', async () => {
  const config = { profile: 'none', features: { 'zoom-tools': true } };
  const plan = page({ config }).OP._boot.exportPlan({}, config, null, false);
  assert.ok(plan.styles.includes('css/zoom.css') && plan.styles.includes('css/zoomtools.css'));
  const shared = trustedScripts(plan);
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
  const shared = trustedScripts(plan);
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

test('Interactive Gantt charts restore selection, collapsed groups, and layer toggles', async () => {
  const config = { profile: 'none', features: { gantt: true } };
  const plan = page({ config }).OP._boot.exportPlan({}, config, null, false);
  const shared = trustedScripts(plan);
  assert.ok(plan.scripts.includes('js/gantt.js') && plan.styles.some(path => /gantt\.css$/.test(path)));
  const url = 'file:///original/guide/plan.html';
  const payload = { url, siteURL: url, entryURL: entryURL.href, site: null, profile: null,
    features: plan.features, styles: plan.styles, modules: Array.from(plan.scripts, (path, i) => [path, i]), data: [],
    identities: [{ key: ['id', 'plan'], stamp: 'plan' }] };

  async function visit(saved) {
    const p = page({ config, interactive: true, movedURL: 'file:///elsewhere/plan.html' });
    const find = (node, selector) => selector.split(',').flatMap(part => {
      part = part.trim();
      const direct = part.startsWith(':scope > ');
      const match = /^([\w-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(direct ? part.slice(9) : part);
      if (!match) return [];
      const [, tag, cls, attr] = match;
      return (direct ? node.children : descendants(node)).filter(el =>
        (!tag || el.localName === tag) && (!cls || el.className === cls) && (!attr || el.hasAttribute(attr)));
    });
    p.body.querySelectorAll = selector => find(p.body, selector);
    const add = (parent, tag, cls, attrs = {}, label = '') => {
      const node = parent.appendChild(p.document.createElement(tag));
      node.className = cls;
      if (cls) node.classList.add(cls);
      node.textContent = label;
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      node.querySelectorAll = selector => find(node, selector);
      node.querySelector = selector => find(node, selector)[0] || null;
      return node;
    };
    const host = add(p.body, 'figure', 'op-gantt', { id: 'plan', 'data-op-export-identity': 0 });
    const list = add(host, 'ol', 'op-gantt-tasks');
    add(list, 'li', '', { 'data-op-key': 'design', 'data-op-start': '2026-06-01', 'data-op-end': '2026-06-03' }, 'Design');
    add(list, 'li', '', { 'data-op-key': 'api', 'data-op-group': 'Build', 'data-op-start': '2026-06-04',
      'data-op-duration': '4', 'data-op-depends': 'design', 'data-op-planned-start': '2026-06-03',
      'data-op-planned-end': '2026-06-06' }, 'API');
    add(list, 'li', '', { 'data-op-key': 'ship', 'data-op-start': '2026-06-08', 'data-op-milestone': '',
      'data-op-depends': 'api' }, 'Ship');
    const runtime = await p.hydrate(payload, shared, new AbortController().signal, saved);
    const controller = runtime._gantt.get(host);
    assert.ok(controller, JSON.stringify(runtime.diagnostics.list().map(issue => issue.message)));
    return { runtime, controller, view: runtime._gantt.view(host), host };
  }

  const first = await visit();
  assert.equal(first.controller.snapshot().key, 'design');
  assert.equal(first.controller.snapshot().critical, true);
  assert.deepEqual(Array.from(first.view.layers()), ['critical', 'planned']);
  first.controller.select('ship');
  assert.equal(first.view.setCollapsed('Build', true), true);
  assert.equal(first.view.setLayer('planned', false), true);
  assert.equal(first.host.classList.contains('op-gantt-hide-planned'), true);

  const restored = await visit(first.runtime._readerState.capture().record);
  assert.equal(restored.controller.snapshot().key, 'ship');
  assert.deepEqual(Array.from(restored.view.collapsed()), ['Build']);
  assert.deepEqual(Array.from(restored.view.layers()), ['critical']);
  assert.equal(restored.host.classList.contains('op-gantt-hide-planned'), true);
  // Selecting a task inside a collapsed group opens the group.
  restored.controller.select('api');
  assert.deepEqual(Array.from(restored.view.collapsed()), []);
});
