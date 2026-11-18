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
    this.attrs = new Map(Object.entries(attrs));
    this.children = children;
    this.text = '';
    this.value = '';
    this.checked = false;
    this.className = '';
    const classes = new Set();
    this.classList = { add: (c) => classes.add(c), contains: (c) => classes.has(c) };
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
function page({ hosts = [], presets = [], bound = [] }) {
  const warned = [];
  let start;
  const document = {
    readyState: 'loading',
    addEventListener: (_, fn) => { start = fn; },
    querySelector: () => null,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll(selector) {
      if (selector === '[data-df-param]') return hosts;
      if (selector === '[data-df-preset]') return presets;
      if (selector === '[data-df-bind], [data-df-template]') return bound;
      return [];
    }
  };
  const ctx = vm.createContext({ URL, document, location: { href: 'file:///page.html' }, console: { warn: (m) => warned.push(m) } });
  ctx.window = ctx;
  vm.runInContext(read('core.js'), ctx);
  vm.runInContext(read('params.js'), ctx);
  const calls = [];
  ctx.DocForm.params.on(['k', 'mode', 'flag'], (values, name, changed) => calls.push({ values: { ...values }, name, changed: [...changed] }));
  start();
  return { params: ctx.DocForm.params, warned, calls };
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
