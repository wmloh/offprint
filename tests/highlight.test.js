const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const core = readFileSync(join(__dirname, '../docform/js/core.js'), 'utf8');
const source = readFileSync(join(__dirname, '../docform/js/highlight.js'), 'utf8');
const GROUP = 'data-df-selection-group';
const KEY = 'data-df-key';
const ACTIVE = 'data-df-selection-active';
const item = `[${GROUP}][${KEY}]`;
const control = 'button:not([role="tab"]), [role="button"][tabindex]';

function element(tag, group, key, attrs = {}) {
  const attributes = new Map(Object.entries(attrs));
  if (group !== undefined) attributes.set(GROUP, group);
  if (key !== undefined) attributes.set(KEY, key);
  return {
    nodeType: 1,
    children: [],
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    toggleAttribute: (name, force) => force ? attributes.set(name, '') : attributes.delete(name),
    matches(selector) {
      switch (selector) {
        case item: return attributes.has(GROUP) && attributes.has(KEY);
        case control: return tag === 'button' || (attributes.get('role') === 'button' && attributes.has('tabindex'));
        case 'button': return tag === 'button';
        case ':disabled, [aria-disabled="true"]': return attributes.has('disabled') || attributes.get('aria-disabled') === 'true';
        default: throw new Error(`Unexpected selector ${selector}`);
      }
    },
    closest(selector) {
      return this.matches(selector) ? this : this.parent?.closest(selector);
    }
  };
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function setup(...items) { return selectionPage(items).start(); }

function selectionPage(nodes, groups = {}, store = new Map()) {
  const document = new EventTarget();
  document.body = element('body');
  document.body.children = nodes;
  nodes.forEach((node, i) => {
    node.order = i;
    node.compareDocumentPosition = (other) => node === other ? 0 : i < other.order ? 4 : 2;
  });
  document.body.contains = (node) => descendants(document.body).includes(node);
  let observe;
  let options;
  const diagnostics = [];
  const boot = { canInitialize: () => true, report: (_, feature, host, message) => diagnostics.push(message),
    moduleFailed: (_, error) => { throw error; } };
  const DocForm = { _boot: boot, site: { base: 'file:///site/site.js', selectionGroups: groups } };
  const context = vm.createContext({
    DocForm,
    document,
    localStorage: {
      getItem: (key) => store.get(key),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key)
    },
    CustomEvent,
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe(target, config) {
        assert.equal(target, document.body);
        options = config;
      }
    }
  });

  vm.runInContext(core, context);
  DocForm.all = (selector, scope = document.body) => descendants(scope).filter((el) => el.matches(selector));
  vm.runInContext(source, context);
  boot.prepareSelection();

  function dispatch(type, target, props) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    document.dispatchEvent(Object.assign(event, props));
    return event;
  }

  return {
    selection: DocForm.selection, document, diagnostics,
    start() {
      boot.initialize();
      return { selection: DocForm.selection, document, observe, options, dispatch };
    }
  };
}

const active = (node) => node.getAttribute(ACTIVE) !== null;
const pressed = (node) => node.getAttribute('aria-pressed');

test('a shared key links views in one group and a second activation clears that group', () => {
  const prose = element('button', 'inputs', 'alpha');
  const cell = element('td', 'inputs', 'alpha');
  const annotation = element('li', 'inputs', 'alpha');
  const otherGroup = element('button', 'outputs', 'alpha');
  const anotherKey = element('rect', 'inputs', 'beta');
  const views = [prose, cell, annotation, otherGroup, anotherKey];
  const { selection, document, dispatch } = setup(...views);
  const changes = [];
  document.addEventListener('df:selection:change', ({ detail: { group, current: { key } } }) => {
    assert.equal(selection.group(group).get(), key);
    changes.push([group, key]);
  });

  assert.equal(pressed(prose), 'false');
  assert.equal(pressed(cell), null);
  dispatch('click', prose, { button: 0 });
  assert.deepEqual(views.map(active), [true, true, true, false, false]);
  assert.equal(pressed(prose), 'true');

  dispatch('click', otherGroup, { button: 0 });
  selection.group('inputs').select('alpha');
  dispatch('click', prose, { button: 0 });
  assert.deepEqual(views.map(active), [false, false, false, true, false]);
  assert.equal(pressed(prose), 'false');
  assert.equal(pressed(otherGroup), 'true');
  assert.deepEqual(changes, [['inputs', 'alpha'], ['outputs', 'alpha'], ['inputs', null]]);
});

test('an SVG button responds to Enter and Space and ignores repeats and disabled controls', () => {
  const svgMark = element('g', 'inputs', 'beta', { role: 'button', tabindex: '0' });
  const child = element('path');
  child.parent = svgMark;
  svgMark.children = [child];
  const native = element('button', 'inputs', 'beta');
  const disabled = element('button', 'inputs', 'alpha', { 'aria-disabled': 'true' });
  const { dispatch, selection } = setup(svgMark, native, disabled);

  assert.equal(dispatch('keydown', svgMark, { key: 'Enter' }).defaultPrevented, true);
  assert.equal(selection.group('inputs').get(), 'beta');
  assert.equal(pressed(native), 'true');
  dispatch('keydown', svgMark, { key: 'Enter', repeat: true });
  dispatch('click', disabled, { button: 0 });
  assert.equal(selection.group('inputs').get(), 'beta');

  assert.equal(dispatch('keydown', svgMark, { key: ' ' }).defaultPrevented, true);
  assert.equal(selection.group('inputs').get(), null);
  dispatch('click', child, { button: 0 });
  assert.equal(selection.group('inputs').get(), 'beta');
  assert.equal(dispatch('keydown', native, { key: 'Enter' }).defaultPrevented, false);
  // Native buttons turn keyboard activation into a click.
  dispatch('click', native, { button: 0, detail: 0 });
  assert.equal(selection.group('inputs').get(), null);
});

test('a redraw restores the selection on new marks and updates marks that change key', () => {
  const oldMark = element('g', 'trace', 'old', { role: 'button', tabindex: '0' });
  const view = element('svg');
  view.children = [oldMark];
  const { document, observe, options, selection } = setup(view);
  const changes = [];
  document.addEventListener('df:selection:change', ({ detail }) => changes.push(detail.current.key));
  selection.group('trace').select('old');
  assert.equal(active(oldMark), true);

  view.children = [];
  observe([{ type: 'childList', addedNodes: [] }]);
  assert.equal(selection.group('trace').get(), 'old');

  const replacement = element('rect', 'trace', 'old', { role: 'button', tabindex: '0' });
  const other = element('rect', 'compare', 'old');
  const layer = element('g');
  layer.children = [replacement, other];
  view.children = [layer];
  assert.equal(options.subtree && options.childList && options.attributeFilter.includes(KEY), true);
  observe([{ type: 'childList', addedNodes: [layer] }]);
  assert.equal(active(replacement), true);
  assert.equal(pressed(replacement), 'true');
  assert.equal(active(other), false);

  replacement.setAttribute(KEY, 'new');
  observe([{ type: 'attributes', target: replacement }]);
  assert.equal(active(replacement), false);
  assert.equal(pressed(replacement), 'false');
  assert.deepEqual(changes, ['old']);
});

test('startup uses configured, stored, document-order and setup seeds in that order', () => {
  const store = new Map();
  const groups = { trace: { persist: true } };
  const late = element('button', 'trace', 'late', { 'data-df-selection-seed': '' });
  const early = element('button', 'trace', 'early', { 'data-df-selection-seed': '' });
  const page = selectionPage([early, late], groups, store);
  const group = page.selection.group('trace');
  assert.equal(page.selection.seed('trace', 'custom'), true);
  assert.equal(page.selection.define(' trace '), null);
  const seen = [];
  group.subscribe((snapshot, change) => seen.push([snapshot.key, change.origin, active(early)]), { immediate: true });
  assert.deepEqual(seen, []);
  page.start();
  assert.deepEqual(seen, [['early', 'init', true]]);
  group.select('late');
  assert.equal(selectionPage([early, late], groups, store).start().selection.group('trace').get(), 'late');
  assert.equal(selectionPage([early], groups, store).start().selection.group('trace').get(), 'early');
  const cleared = selectionPage([early, late], { trace: { initial: null, persist: true } }, store).start();
  assert.equal(cleared.selection.group('trace').get(), null);
  assert.equal(cleared.selection.group('trace').clear(), true);
  assert.equal(store.size, 0);

  const customPage = selectionPage([], { custom: {} });
  assert.equal(customPage.selection.seed('custom', ' first '), true);
  assert.equal(customPage.selection.seed('custom', 'second'), true);
  customPage.start();
  assert.equal(customPage.selection.group('custom').get(), 'first');
});

test('custom subscribers and events observe committed views before queued writes run', () => {
  const first = element('p', 'trace', 'first');
  const { selection, document } = setup(first);
  const group = selection.group('trace');
  const log = [];
  group.subscribe((state) => {
    log.push(['subscriber', state.key, active(first)]);
    if (state.key === 'first') {
      assert.equal(group.select(' next '), true);
      assert.equal(group.clear(), true);
      assert.equal(group.get(), 'first');
    }
  });
  const unsubscribe = group.subscribe((state) => log.push(['second', state.key]), { immediate: true });
  document.addEventListener('df:selection:change', ({ detail }) => log.push(['event', detail.current.key]));
  assert.equal(group.select('first'), true);
  unsubscribe();
  unsubscribe();
  assert.equal(group.clear(), true);
  assert.equal(group.select(' '), false);
  assert.deepEqual(log, [
    ['second', null],
    ['subscriber', 'first', true], ['second', 'first'], ['event', 'first'],
    ['subscriber', 'next', false], ['second', 'next'], ['event', 'next'],
    ['subscriber', null, false], ['second', null], ['event', null]
  ]);
});
