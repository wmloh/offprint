const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { repo, element, page } = require('../support/offline-page');

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
