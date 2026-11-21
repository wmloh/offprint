const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
class FakeElement extends EventTarget {
  constructor(tag, attrs = {}, children = []) {
    super();
    this.tag = tag;
    this.tagName = tag.toUpperCase();
    this.type = attrs.type || '';
    this.attrs = new Map(Object.entries(attrs));
    this.children = children;
    this.text = '';
    this.value = '';
    this.checked = false;
    this.className = '';
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach((c) => classes.add(c)), contains: (c) => classes.has(c) };
  }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) { this.children.push(child); }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text; }
  set textContent(value) { this.children = []; this.text = String(value); }
  get valueAsNumber() { return Math.min(Math.max(parseFloat(this.value), parseFloat(this.min)), parseFloat(this.max)); }
  click() { this.dispatchEvent(new Event('click')); }
  find(tag) { return this.children.find((c) => c.tag === tag); }
}

// Loads fresh core and params modules over the given hosts, presets, and bindings, then starts the page.
function page({ hosts = [], scoped = [], chosen = [], presets = [], bound = [], frames, setup }) {
  const warned = [];
  const after = [];
  const boot = {
    canInitialize: () => true, optionLayers: () => [],
    report: (_, feature, host, message) => warned.push(message),
    moduleFailed: (_, error) => { throw error; },
    after: (_, fn) => after.push(fn)
  };
  const events = [];
  const document = {
    readyState: 'loading',
    querySelector: () => null,
    createElement: (tag) => new FakeElement(tag),
    dispatchEvent: (event) => events.push(event),
    querySelectorAll(selector) {
      if (selector === '[data-df-param]') return hosts;
      if (selector === '[data-df-parameter]') return scoped;
      if (selector === '[data-df-choice]') return chosen;
      if (selector === '[data-df-preset]') return presets;
      if (selector === '[data-df-bind], [data-df-template]') return bound;
      return [];
    }
  };
  const ctx = vm.createContext({ URL, document, CustomEvent, DocForm: { _boot: boot }, requestAnimationFrame: frames && ((fn) => frames.push(fn)),
    location: { href: 'file:///page.html' }, console: { warn: (m) => warned.push(m) } });
  ctx.window = ctx;
  vm.runInContext(read('core.js'), ctx);
  vm.runInContext(read('params.js'), ctx);
  if (setup) setup(ctx.DocForm.parameters, events);
  boot.initialize();
  after.forEach((fn) => fn());
  return { parameters: ctx.DocForm.parameters, warned, events };
}

test('legacy parameter hosts and per-control options are ignored', () => {
  const legacyAttrs = {
    'data-df-type': 'toggle', 'data-df-min': '10', 'data-df-max': '20', 'data-df-step': '5',
    'data-df-value': '15', 'data-df-digits': '2', 'data-df-label': 'Old label'
  };
  const legacy = new FakeElement('div', { ...legacyAttrs, 'data-df-param': 'k' });
  legacy.textContent = 'Authored fallback';
  const current = new FakeElement('div', { ...legacyAttrs, 'data-df-parameter': 'k' });
  const { parameters, warned } = page({ hosts: [legacy], scoped: [current], setup(api) {
    api.define('page', { k: { type: 'range', min: 0, max: 5, step: 0.5, default: 2 } });
  } });
  assert.deepEqual(legacy.children, []);
  assert.equal(legacy.textContent, 'Authored fallback');
  assert.equal(current.find('input').type, 'range');
  assert.deepEqual(['min', 'max', 'step', 'value'].map(key => current.find('input')[key]), ['0', '5', '0.5', '2']);
  assert.equal(current.find('label').textContent, 'k');
  assert.equal(current.find('output').textContent, '2.0');
  assert.equal(parameters.scope().get('k'), 2);
  assert.deepEqual(warned, []);
});

test('scoped templates format expressions and report repeated errors once', () => {
  const template = new FakeElement('span', {
    'data-df-template': '{{sqrt(a*a + b*b)}} {{sin(theta)|3}} {{a || 1}} {{a > 2 ? "big" : "small"}}'
  });
  const invalid = new FakeElement('span', { 'data-df-template': '{{missing + 1}} {{missing + 1}}' });
  const { warned } = page({ bound: [template, invalid], setup(api) {
    api.define('page', {
      a: { type: 'number', default: 3 }, b: { type: 'number', default: 4 },
      theta: { type: 'number', default: Math.PI / 6 }
    });
  } });
  assert.equal(template.textContent, '5 0.500 3 big');
  assert.equal(invalid.textContent, '? ?');
  assert.equal(warned.length, 1);
  assert.match(warned[0], /Cannot evaluate "missing \+ 1"/);
});

test('scoped markup resolves nesting and explicit targets and uses one definition per scope', () => {
  const outer = new FakeElement('div', { 'data-df-parameter-scope': 'decoder' });
  const inner = new FakeElement('div', { 'data-df-parameter-scope': 'comparison' });
  inner.parentElement = outer;
  function child(tag, attrs, parent) {
    const el = new FakeElement(tag, attrs);
    el.parentElement = parent;
    return el;
  }
  const native = child('input', { type: 'range', 'data-df-parameter': 'k' }, outer);
  const linked = child('div', { 'data-df-parameter': 'k', 'data-df-scope': 'decoder',
    'data-df-parameter-label': 'Decoder', 'data-df-parameter-digits': '2' }, inner);
  const local = child('div', { 'data-df-parameter': 'k' }, inner);
  const implicit = child('div', { 'data-df-parameter': 'mode' });
  const toggle = child('input', { type: 'checkbox', 'data-df-parameter': 'flag' });
  const missing = child('div', { 'data-df-parameter': 'k', 'data-df-scope': 'missing' }, inner);
  missing.textContent = 'Fallback';
  const text = child('span', { 'data-df-bind': 'k' }, inner);
  const crossText = child('span', { 'data-df-template': '{{k}}', 'data-df-scope': 'decoder' }, inner);
  const preset = child('button', { 'data-df-preset': '{"k":"4.5"}', 'data-df-scope': 'decoder' }, inner);
  const bad = child('button', { 'data-df-preset': '{"k":4.5}' }, inner);
  const frames = [];
  const { parameters, events, warned } = page({
    scoped: [native, linked, local, implicit, toggle, missing], bound: [text, crossText], presets: [preset, bad], frames,
    setup(params) {
      params.define('decoder', { k: { type: 'range', max: 5, step: 0.5, default: 2 } });
      params.define('comparison', { k: { type: 'range', min: 10, max: 12, default: 11 } });
      params.define('page', { mode: { type: 'select', choices: [{ value: 'fast', label: 'Fast' }] }, flag: { type: 'toggle' } });
    }
  });
  const decoder = parameters.scope('decoder');
  const comparison = parameters.scope('comparison');
  assert.equal(native.max, '5');
  assert.equal(linked.find('input').step, '0.5');
  assert.equal(linked.find('label').textContent, 'Decoder');
  assert.equal(linked.find('output').textContent, '2.00');
  assert.equal(local.find('input').min, '10');
  assert.match(warned.join('\n'), /"mode" is a select; author it as <fieldset data-df-choice="mode">/);
  assert.equal(toggle.checked, false);
  assert.equal(missing.textContent, 'Fallback');
  assert.equal(bad.getAttribute('aria-disabled'), 'true');
  preset.click();
  assert.equal(decoder.get('k'), 4.5);
  assert.equal(comparison.get('k'), 11);
  assert.equal(native.value, '4.5');
  assert.equal(linked.find('input').value, '4.5');
  assert.equal(preset.getAttribute('aria-current'), 'true');
  assert.equal(events.at(-1).detail.origin, 'user');
  native.value = '3';
  native.dispatchEvent(new Event('input'));
  assert.equal(decoder.get('k'), 3);
  assert.equal(linked.find('output').textContent, '3.00');
  assert.equal(preset.getAttribute('aria-current'), null);
  assert.equal(comparison.set('k', 12), true);
  assert.equal(crossText.textContent, '2.0');
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(crossText.textContent, '3.0');
  assert.equal(text.textContent, '12.00');
  decoder.reset();
  assert.equal(native.value, '2');
  assert.equal(comparison.get('k'), 12);
  assert.equal(events.at(-1).detail.origin, 'reset');
});

test('scoped batches validate before publication and notify filtered subscribers before events', () => {
  const order = [];
  const { parameters, events, warned } = page({ setup(params, events) {
    const scope = params.define(' page ', { gain: { type: 'range' }, total: { type: 'number', min: -2, default: 1 } });
    assert.equal(params.define('page', { other: { type: 'toggle' } }), null);
    assert.equal(params.define('bad', { fine: { type: 'toggle' }, broken: { type: 'number' } }), null);
    assert.equal(params.define('choices', { mode: { type: 'select', choices: [
      { value: 'x', label: 'X' }, { value: 'x', label: 'Duplicate' }
    ] } }), null);
    scope.subscribe((current, meta) => {
      order.push([meta.origin, ...meta.changedKeys]);
      if (meta.origin === 'api' && current.total === 2) {
        assert.equal(events.length, 0);
        assert.equal(scope.set('total', 3), true);
        assert.equal(current.total, 2);
      }
    }, { immediate: true });
    scope.subscribe(() => { throw Error('callback failure'); }, { keys: ['total'] });
    scope.subscribe((current, meta) => order.push([current.total, meta.previous.total]), { keys: ['total'] });
    scope.subscribe(() => assert.fail('unsubscribed'), { immediate: true })();
  } });
  const scope = parameters.scope();
  assert.equal(parameters.scope('bad'), null);
  assert.equal(parameters.scope('choices'), null);
  assert.equal(scope.get('constructor'), undefined);
  assert.deepEqual(order, [['init', 'gain', 'total']]);
  const initial = scope.snapshot();
  assert.ok(Object.isFrozen(initial));
  assert.equal(scope.update({ gain: 0.3, total: '-1' }), false);
  assert.equal(scope.set('unknown', 1), false);
  assert.equal(scope.update({}), false);
  assert.deepEqual({ ...scope.snapshot() }, { gain: 0, total: 1 });
  assert.equal(events.length, 0);
  assert.equal(scope.update({ gain: 0.315, total: 2 }), true);
  assert.equal(scope.update({ gain: 0.315, total: 3 }), true);
  assert.deepEqual(order, [['init', 'gain', 'total'], ['api', 'gain', 'total'], [2, 1], ['api', 'total'], [3, 2]]);
  assert.deepEqual(events.map(event => [event.type, event.detail.scope, event.detail.current.total]),
    [['df:parameters:change', 'page', 2], ['df:parameters:change', 'page', 3]]);
  assert.equal(initial.total, 1);
  assert.match(warned.join('\n'), /subscriber.*callback failure/);
});

test('scoped multiple choices use ordered immutable arrays in presets and subscriptions', () => {
  const preset = new FakeElement('button', { 'data-df-preset': '{"runs":["b","a"]}' });
  const { parameters, events } = page({ presets: [preset], setup(params) {
    params.define('page', { runs: { type: 'multiselect', choices: [
      { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }
    ] } });
  } });
  const scope = parameters.scope();
  assert.equal(preset.getAttribute('aria-current'), 'true');
  const old = scope.get('runs');
  assert.ok(Object.isFrozen(old));
  assert.equal(scope.set('runs', ['b', 'a']), true);
  assert.equal(scope.get('runs'), old);
  assert.equal(events.length, 0);
  for (const invalid of ['a', ['a', 'a'], ['c'], [1], Array(1)]) assert.equal(scope.set('runs', invalid), false);

  assert.equal(scope.set('runs', ['b']), true);
  assert.equal(preset.getAttribute('aria-current'), null);
  preset.click();
  assert.deepEqual([...scope.get('runs')], ['a', 'b']);
  assert.equal(preset.getAttribute('aria-current'), 'true');
  const input = ['a'];
  assert.equal(scope.set('runs', input), true);
  input.push('b');
  assert.deepEqual([...scope.get('runs')], ['a']);
  assert.equal(scope.reset(), true);
  assert.deepEqual([...scope.get('runs')], ['a', 'b']);
  assert.deepEqual([...events.at(-1).detail.previous.runs], ['a']);
});
