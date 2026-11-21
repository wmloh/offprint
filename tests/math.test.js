const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lib = path.join(__dirname, '../docform');
const core = fs.readFileSync(path.join(lib, 'js/core.js'), 'utf8');
const math = fs.readFileSync(path.join(lib, 'js/math.js'), 'utf8');
const katex = fs.readFileSync(path.join(lib, 'vendor/katex/katex.min.js'), 'utf8');

function load({ withKatex = true, macros } = {}) {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  vm.runInContext(core, context);
  if (withKatex) vm.runInContext(katex, context);
  vm.runInContext(math, context);
  const DocForm = context.DocForm;
  DocForm.site = DocForm.normalizeSite({ options: { math: { macros } } }, 'file:///x/site.js');
  return { DocForm, warnings };
}

function element(text, attrs = {}) {
  const classes = new Set(['df-math']);
  return {
    attrs: { ...attrs },
    textContent: text,
    innerHTML: '',
    title: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; if (name === 'title') this.title = ''; },
    matches: () => false
  };
}

const scope = (els) => ({ querySelectorAll: () => els });

test('manifest macros apply and \\gdef does not leak into the manifest', () => {
  const { DocForm } = load({ macros: { '\\R': '\\mathbb{R}' } });
  assert.match(DocForm.math.html('x \\in \\R'), /mathbb/);
  assert.match(DocForm.math.html('x', true), /katex-display/);
  DocForm.math.html('\\gdef\\V{v}');
  assert.match(DocForm.math.html('\\V'), /mord mathnormal[^>]*>v</);
  assert.deepEqual(Object.keys(DocForm.site.macros), ['\\R']);
});

test('render handles inline, display, and errors, and skips rendered elements', () => {
  const { DocForm, warnings } = load();
  const inline = element('  a^2  ');
  const display = element('b', { 'data-df-display': '' });
  const bad = element('\\frac{1}');
  assert.equal(DocForm.math.render(scope([inline, display, bad])), 3);

  assert.equal(inline.getAttribute('data-df-tex'), 'a^2');
  assert.match(inline.innerHTML, /class="katex"/);
  assert.doesNotMatch(inline.innerHTML, /katex-display/);
  assert.match(display.innerHTML, /katex-display/);

  assert.ok(bad.classList.contains('df-math-error'));
  assert.equal(bad.textContent, '\\frac{1}');
  assert.match(bad.title, /KaTeX parse error/);
  assert.equal(warnings.length, 1);

  assert.equal(DocForm.math.render(scope([inline, display, bad])), 0);
  assert.equal(DocForm.math.render(scope([inline]), true), 1);
});

test('set replaces the source and clears a previous error', () => {
  const { DocForm } = load();
  const el = element('\\frac{1}');
  DocForm.math.render(scope([el]));
  assert.ok(el.classList.contains('df-math-error'));
  assert.equal(DocForm.math.set(el, 'x = 3'), true);
  assert.equal(el.getAttribute('data-df-tex'), 'x = 3');
  assert.ok(!el.classList.contains('df-math-error'));
  assert.equal(el.title, '');
  assert.match(el.innerHTML, /katex/);
});

test('missing KaTeX leaves TeX source in place with one warning', () => {
  const { DocForm, warnings } = load({ withKatex: false });
  const el = element('a^2');
  assert.equal(DocForm.math.render(scope([el, element('b')])), 0);
  assert.equal(el.textContent, 'a^2');
  assert.ok(!el.classList.contains('df-math-rendered'));
  assert.equal(warnings.length, 1);
});

test('split and mixed render $…$ inside text and keep escaped dollars', () => {
  const { DocForm } = load();
  const parts = (text) => JSON.parse(JSON.stringify(DocForm.math.split(text)));
  assert.deepEqual(parts('Cost \\$5, area $a^2$ <ok>'),
    [{ tex: false, text: 'Cost $5, area ' }, { tex: true, text: 'a^2' }, { tex: false, text: ' <ok>' }]);
  assert.deepEqual(parts('open $x'), [{ tex: false, text: 'open $x' }]);
  const html = DocForm.math.mixed('a <b> $x^2$ $\\frac{1}$');
  assert.match(html, /^a &lt;b&gt; <span class="katex">/);
  assert.match(html, /<span class="df-math-error">\\frac\{1\}<\/span>$/);
});
