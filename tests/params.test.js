const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('params.js'), context);
const params = context.DocForm.params;

test('slider steps imply decimal places', () => {
  assert.deepEqual(['1', '0.5', '0.05', '10', '1e-3'].map(params.digitsOf), [0, 1, 2, 0, 3]);
});

test('values format with fixed or trimmed decimals and no negative zero', () => {
  assert.equal(params.format(3.14159, 2), '3.14');
  assert.equal(params.format(2, 2), '2.00');
  assert.equal(params.format(1 / 3), '0.333');
  assert.equal(params.format(2.5), '2.5');
  assert.equal(params.format(-0.0001, 2), '0.00');
  assert.equal(params.format(-0.0001), '0');
  assert.equal(params.format(NaN), '?');
  assert.equal(params.format(Infinity), '∞');
  assert.equal(params.format('text'), 'text');
});

test('templates substitute expressions with Math in scope and optional places', () => {
  const scope = { a: 3, b: 4, theta: Math.PI / 6 };
  assert.equal(params.fill('c = \\sqrt{ {{a}}^2 + {{b}}^2 } = {{sqrt(a*a + b*b)}}', scope), 'c = \\sqrt{ 3^2 + 4^2 } = 5');
  assert.equal(params.fill('{{sin(theta)|3}} and {{PI|2}}', scope), '0.500 and 3.14');
  assert.equal(params.fill('{{a > 2 ? "big" : "small"}}', scope), 'big');
  assert.equal(params.fill('{{ a || 1 }}', scope), '3');
  assert.equal(params.fill('no braces {here}', scope), 'no braces {here}');
});

test('bad expressions show a placeholder and warn once', () => {
  const before = warnings.length;
  assert.equal(params.fill('{{missing + 1}} {{missing + 1}}', { a: 1 }), '? ?');
  assert.equal(warnings.length, before + 1);
  assert.match(warnings.at(-1), /Cannot evaluate "missing \+ 1"/);
});

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
  querySelectorAll(selector) {
    assert.equal(selector, 'option');
    return this.children.filter((c) => c.tag === 'option');
  }
  click() { this.dispatchEvent(new Event('click')); }
  find(tag) { return this.children.find((c) => c.tag === tag); }
}

function option(value, label, attrs = {}) {
  const el = new FakeElement('option', { value, ...attrs });
  el.textContent = label;
  return el;
}

// Loads fresh core and params modules over the given hosts, presets, and bindings, then starts the page.
function page({ hosts = [], scoped = [], presets = [], bound = [], frames, setup }) {
  const warned = [];
  let start;
  const events = [];
  const document = {
    readyState: 'loading',
    addEventListener: (_, fn) => { start = fn; },
    querySelector: () => null,
    createElement: (tag) => new FakeElement(tag),
    dispatchEvent: (event) => events.push(event),
    querySelectorAll(selector) {
      if (selector === '[data-df-param]') return hosts;
      if (selector === '[data-df-parameter]') return scoped;
      if (selector === '[data-df-preset]') return presets;
      if (selector === '[data-df-bind], [data-df-template]') return bound;
      return [];
    }
  };
  const ctx = vm.createContext({ URL, document, CustomEvent, requestAnimationFrame: frames && ((fn) => frames.push(fn)),
    location: { href: 'file:///page.html' }, console: { warn: (m) => warned.push(m) } });
  ctx.window = ctx;
  vm.runInContext(read('core.js'), ctx);
  vm.runInContext(read('params.js'), ctx);
  const calls = [];
  ctx.DocForm.params.on(['k', 'mode', 'flag'], (values, name, changed) => calls.push({ values: { ...values }, name, changed: [...changed] }));
  if (setup) setup(ctx.DocForm.parameters, events);
  start();
  return { params: ctx.DocForm.params, parameters: ctx.DocForm.parameters, warned, calls, events };
}

function choicePage(extraPresets = []) {
  const slider = new FakeElement('div', { 'data-df-param': 'k', 'data-df-min': '0', 'data-df-max': '5', 'data-df-step': '0.5', 'data-df-value': '2' });
  const select = () => new FakeElement('div', { 'data-df-param': 'mode', 'data-df-type': 'select', 'data-df-label': 'Mode' },
    [option('fast', 'Fast'), option('exact', 'Exact', { selected: '' })]);
  const selects = [select(), select()];
  const toggle = new FakeElement('div', { 'data-df-param': 'flag', 'data-df-type': 'toggle', 'data-df-value': 'true' });
  const preset = (values, label) => {
    const el = new FakeElement('button', { 'data-df-preset': JSON.stringify(values) });
    el.textContent = label;
    return el;
  };
  const presets = [preset({ k: 4, mode: 'fast', flag: false }, 'Quick'), preset({ k: 2 }, 'Default k'), ...extraPresets.map((p) => {
    const el = new FakeElement('button', { 'data-df-preset': p });
    el.textContent = 'Broken';
    return el;
  })];
  const text = new FakeElement('span', { 'data-df-template': '{{k}} {{mode}} {{flag ? "on" : "off"}}' });
  return { slider, selects, toggle, presets, text, ...page({ hosts: [slider, ...selects, toggle], presets, bound: [text] }) };
}

test('select and toggle controls hold typed values and stay synchronized', () => {
  const { params, selects, toggle, text, calls, presets } = choicePage();
  assert.deepEqual({ ...params.values() }, { k: 2, mode: 'exact', flag: true });
  assert.equal(text.textContent, '2.0 exact on');
  assert.equal(calls.length, 1);
  assert.equal(presets[1].getAttribute('aria-current'), 'true');

  const [first, second] = selects.map((host) => host.find('select'));
  assert.deepEqual(first.children.map((o) => o.value), ['fast', 'exact']);
  first.value = 'fast';
  first.dispatchEvent(new Event('change'));
  assert.equal(second.value, 'fast');
  assert.deepEqual(calls.at(-1), { values: { k: 2, mode: 'fast', flag: true }, name: 'mode', changed: ['mode'] });

  const box = toggle.find('input');
  assert.equal(box.getAttribute('role'), 'switch');
  box.checked = false;
  box.dispatchEvent(new Event('change'));
  assert.equal(params.get('flag'), false);
  assert.equal(text.textContent, '2.0 fast off');
});

test('set rejects values that a control of that name cannot show', () => {
  const { params, warned, calls } = choicePage();
  assert.equal(params.set('mode', 'slow'), false);
  assert.equal(params.set('flag', 'true'), false);
  assert.equal(params.set('k', 9), false);
  assert.equal(params.set('k', '3.5'), true);
  assert.deepEqual({ ...params.values() }, { k: 3.5, mode: 'exact', flag: true });
  assert.equal(calls.length, 2);
  assert.match(warned.join('\n'), /one of "fast", "exact"[\s\S]*true or false[\s\S]*from 0 to 5/);
});

test('presets update every control and notify each subscriber once', () => {
  const { params, slider, selects, toggle, presets, text, calls } = choicePage();
  presets[0].click();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { values: { k: 4, mode: 'fast', flag: false }, name: null, changed: ['k', 'mode', 'flag'] });
  assert.equal(slider.find('input').value, '4');
  assert.equal(slider.find('output').textContent, '4.0');
  assert.deepEqual(selects.map((host) => host.find('select').value), ['fast', 'fast']);
  assert.equal(toggle.find('input').checked, false);
  assert.equal(text.textContent, '4.0 fast off');
  assert.equal(presets[0].getAttribute('aria-current'), 'true');
  assert.equal(presets[1].getAttribute('aria-current'), null);

  presets[0].click();
  assert.equal(calls.length, 2);
  presets[1].click();
  assert.deepEqual(calls.at(-1), { values: { k: 2, mode: 'fast', flag: false }, name: 'k', changed: ['k'] });
});

test('invalid presets are disabled and rejected updates change nothing', () => {
  const bad = ['{"k": 9}', '{"mode": "slow"}', '{"flag": 1}', '{"other": 1}', '{}', '[1]', 'not json'];
  const { params, presets, warned, calls } = choicePage(bad);
  const broken = presets.slice(2);
  assert.deepEqual(broken.map((b) => b.getAttribute('aria-disabled')), bad.map(() => 'true'));
  assert.equal(presets[0].getAttribute('aria-disabled'), null);
  broken.forEach((b) => b.click());
  assert.equal(params.apply({ k: 1, mode: 'slow' }), false);
  assert.deepEqual({ ...params.values() }, { k: 2, mode: 'exact', flag: true });
  assert.equal(calls.length, 1);
  assert.match(warned.join('\n'), /unknown parameter "other"[\s\S]*at least one[\s\S]*an object[\s\S]*valid JSON/);
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
  const implicit = child('select', { 'data-df-parameter': 'mode' });
  const toggle = child('input', { type: 'checkbox', 'data-df-parameter': 'flag' });
  const missing = child('div', { 'data-df-parameter': 'k', 'data-df-scope': 'missing' }, inner);
  missing.textContent = 'Fallback';
  const text = child('span', { 'data-df-bind': 'k' }, inner);
  const crossText = child('span', { 'data-df-template': '{{k}}', 'data-df-scope': 'decoder' }, inner);
  const preset = child('button', { 'data-df-preset': '{"k":"4.5"}', 'data-df-scope': 'decoder' }, inner);
  const bad = child('button', { 'data-df-preset': '{"k":4.5}' }, inner);
  const frames = [];
  const { parameters, events } = page({
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
  assert.equal(implicit.value, 'fast');
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

test('scoped multiple choices use ordered immutable arrays in controls, presets and subscriptions', () => {
  const attrs = { 'data-df-parameter': 'runs', 'data-df-parameter-label': 'Runs to show' };
  const generated = new FakeElement('div', { ...attrs, 'data-df-parameter-style': 'native' });
  const native = new FakeElement('select', { ...attrs, multiple: '' });
  const preset = new FakeElement('button', { 'data-df-preset': '{"runs":["b","a"]}' });
  const { parameters, events } = page({ scoped: [generated, native], presets: [preset], setup(params) {
    params.define('page', { runs: { type: 'multiselect', choices: [
      { value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }
    ] } });
  } });
  const scope = parameters.scope();
  const group = generated.find('fieldset');
  const checks = group.children.filter((child) => child.tag === 'label').map((label) => label.find('input'));
  assert.equal(group.find('legend').textContent, 'Runs to show');
  assert.equal(native.getAttribute('aria-label'), 'Runs to show');
  assert.deepEqual(checks.map((check) => [check.type, check.checked]), [['checkbox', true], ['checkbox', true]]);
  assert.equal(preset.getAttribute('aria-current'), 'true');
  const old = scope.get('runs');
  assert.ok(Object.isFrozen(old));
  assert.equal(scope.set('runs', ['b', 'a']), true);
  assert.equal(scope.get('runs'), old);
  assert.equal(events.length, 0);
  for (const invalid of ['a', ['a', 'a'], ['c'], [1], Array(1)]) assert.equal(scope.set('runs', invalid), false);

  checks[0].checked = false;
  checks[0].dispatchEvent(new Event('change'));
  assert.deepEqual([...scope.get('runs')], ['b']);
  assert.deepEqual(native.children.map((option) => option.selected), [false, true]);
  assert.equal(preset.getAttribute('aria-current'), null);
  native.children[1].selected = false;
  native.dispatchEvent(new Event('change'));
  assert.deepEqual([...scope.get('runs')], []);
  assert.deepEqual(checks.map((check) => check.checked), [false, false]);
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
