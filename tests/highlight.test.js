const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../docform/js/highlight.js'), 'utf8');
const GROUP = 'data-df-highlight-group';
const KEY = 'data-df-highlight-key';
const ACTIVE = 'data-df-highlight-active';
const item = `[${GROUP}][${KEY}]`;
const control = 'button, [role="button"][tabindex]';

function element(tag, group, key, attrs = {}) {
  const attributes = new Map(Object.entries(attrs));
  if (group !== undefined) attributes.set(GROUP, group);
  if (key !== undefined) attributes.set(KEY, key);
  return {
    nodeType: 1,
    children: [],
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

function setup(...items) {
  const document = new EventTarget();
  document.body = element('body');
  document.body.children = items;
  document.body.contains = (node) => descendants(document.body).includes(node);
  let observe;
  let options;
  const DocForm = {
    all: (selector, scope = document.body) => descendants(scope).filter((el) => el.matches(selector)),
    register: (_, init) => init()
  };
  vm.runInNewContext(source, {
    DocForm,
    document,
    CustomEvent,
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe(target, config) {
        assert.equal(target, document.body);
        options = config;
      }
    }
  });

  function dispatch(type, target, props) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    document.dispatchEvent(Object.assign(event, props));
    return event;
  }

  return { highlight: DocForm.highlight, document, observe, options, dispatch };
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
  const { highlight, document, dispatch } = setup(...views);
  const changes = [];
  document.addEventListener('df:highlightchange', ({ detail: { group, key } }) => {
    assert.equal(highlight.get(group), key);
    changes.push([group, key]);
  });

  assert.equal(pressed(prose), 'false');
  assert.equal(pressed(cell), null);
  dispatch('click', prose, { button: 0 });
  assert.deepEqual(views.map(active), [true, true, true, false, false]);
  assert.equal(pressed(prose), 'true');

  dispatch('click', otherGroup, { button: 0 });
  highlight.set('inputs', 'alpha');
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
  const { dispatch, highlight } = setup(svgMark, native, disabled);

  assert.equal(dispatch('keydown', svgMark, { key: 'Enter' }).defaultPrevented, true);
  assert.equal(highlight.get('inputs'), 'beta');
  assert.equal(pressed(native), 'true');
  dispatch('keydown', svgMark, { key: 'Enter', repeat: true });
  dispatch('click', disabled, { button: 0 });
  assert.equal(highlight.get('inputs'), 'beta');

  assert.equal(dispatch('keydown', svgMark, { key: ' ' }).defaultPrevented, true);
  assert.equal(highlight.get('inputs'), null);
  dispatch('click', child, { button: 0 });
  assert.equal(highlight.get('inputs'), 'beta');
  assert.equal(dispatch('keydown', native, { key: 'Enter' }).defaultPrevented, false);
  // Native buttons turn keyboard activation into a click.
  dispatch('click', native, { button: 0, detail: 0 });
  assert.equal(highlight.get('inputs'), null);
});

test('a redraw restores the selection on new marks and updates marks that change key', () => {
  const oldMark = element('g', 'trace', 'old', { role: 'button', tabindex: '0' });
  const view = element('svg');
  view.children = [oldMark];
  const { document, observe, options, highlight } = setup(view);
  const changes = [];
  document.addEventListener('df:highlightchange', ({ detail }) => changes.push(detail.key));
  highlight.set('trace', 'old');
  assert.equal(active(oldMark), true);

  view.children = [];
  observe([{ type: 'childList', addedNodes: [] }]);
  assert.equal(highlight.get('trace'), 'old');

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
