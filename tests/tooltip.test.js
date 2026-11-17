const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');

function load() {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  vm.runInContext(read('core.js'), context);
  vm.runInContext(read('tooltip.js'), context);
  return { tip: context.DocForm.tooltip, warnings };
}

const json = (value) => JSON.parse(JSON.stringify(value));
const term = (attr, text = '') => ({ textContent: text, getAttribute: () => attr });

test('term keys ignore case, spacing, hyphens, and underscores', () => {
  const { tip } = load();
  for (const name of ['Linear map', ' linear-map ', 'LINEAR_MAP', 'linear  -  map']) {
    assert.equal(tip.termKey(name), 'linear map');
  }
});

test('glossary keeps titles, accepts objects, and warns about bad or colliding entries', () => {
  const { tip, warnings } = load();
  const terms = tip.glossary({
    'Dot product': 'Sum of products $a \\cdot b$.',
    span: { title: 'Span', text: 'All linear combinations.' },
    'dot-product': 'Duplicate.',
    broken: 42,
    noText: { title: 'X' }
  });
  assert.deepEqual(json(terms), {
    'dot product': { title: 'Dot product', text: 'Sum of products $a \\cdot b$.' },
    span: { title: 'Span', text: 'All linear combinations.' }
  });
  assert.equal(warnings.length, 3);
  assert.match(warnings.join('\n'), /collide/);
});

test('lookup falls back to element text and warns once per missing term', () => {
  const { tip, warnings } = load();
  const terms = tip.glossary({ basis: 'A spanning independent set.' });
  assert.equal(tip.lookup(terms, term('', ' Basis ')).title, 'basis');
  assert.equal(tip.lookup(terms, term('kernel')), null);
  assert.equal(tip.lookup(terms, term('Kernel')), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unknown glossary term "kernel"/);
});

test('tooltips flip above when there is no room below and stay inside the viewport', () => {
  const { tip } = load();
  const view = { width: 400, height: 300 };
  const size = { width: 200, height: 60 };
  assert.deepEqual(json(tip.place({ top: 50, bottom: 70, left: 10, width: 40 }, size, view)),
    { top: 78, left: 8, side: 'below' });
  assert.deepEqual(json(tip.place({ top: 250, bottom: 270, left: 380, width: 20 }, size, view)),
    { top: 182, left: 192, side: 'above' });
});
