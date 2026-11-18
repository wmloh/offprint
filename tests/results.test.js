const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console, Intl });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('results.js'), context);
const results = context.DocForm.results;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('result cells parse numbers with spreads, units, and marks', () => {
  const cells = ['92.1 ± 0.3', '1,204 ms', '−3.5%', '$12', '0.81*', '4.2 GB', '7 +/- 1', 'ResNet-50', 'v2', '', '—'];
  assert.deepEqual(cells.map(results.parseCell), [92.1, 1204, -3.5, 12, 0.81, 4.2, 7, null, null, null, null]);
  assert.equal(results.numericColumn(['1.5', '—', '', '2']), true);
  assert.equal(results.numericColumn(['1.5', 'Adam']), false);
  assert.equal(results.numericColumn(['—', '']), false);
});

test('sorting keeps empties last and ties in written order', () => {
  assert.deepEqual(plain(results.sortOrder([3, null, 1, 3, 2], 'desc', true)), [0, 3, 4, 2, 1]);
  assert.deepEqual(plain(results.sortOrder([3, null, 1, 3, 2], 'asc', true)), [2, 4, 0, 3, 1]);
  assert.deepEqual(plain(results.sortOrder(['b10', 'B2', '', 'a'], 'asc', false)), [3, 1, 0, 2]);
});

test('best values and heat follow the column direction', () => {
  assert.deepEqual(plain(results.best([0.3, null, 0.1, 0.1], 'min')), [2, 3]);
  assert.deepEqual(plain(results.best([0.3, null, 0.1, 0.3], 'max')), [0, 3]);
  assert.deepEqual(plain(results.heat([10, 20, null, 30], 'max')), [0, 0.5, null, 1]);
  assert.deepEqual(plain(results.heat([10, 20, 30], 'min')), [1, 0.5, 0]);
  assert.deepEqual(plain(results.heat([5, 5], 'max')), [0, 0]);
});

test('fixed heat ranges saturate at their ends and keep the direction', () => {
  assert.deepEqual(plain(results.heatRange('0, 60')), [0, 60]);
  assert.deepEqual(plain(results.heatRange('0 ms, 60 ms')), [0, 60]);
  assert.equal(results.heatRange('60, 0'), null);
  assert.equal(results.heatRange('5, 5'), null);
  assert.equal(results.heatRange('0 60'), null);
  assert.deepEqual(plain(results.heat([-10, 0, 30, 60, 90, null], 'max', [0, 60])), [0, 0, 0.5, 1, 1, null]);
  assert.deepEqual(plain(results.heat([-10, 15, 90], 'min', [0, 60])), [1, 0.75, 0]);
  assert.deepEqual(plain(results.heat([5, 5], 'max', [0, 10])), [0.5, 0.5]);
});

test('thresholds classify boundary values and leave missing values unclassified', () => {
  assert.deepEqual(plain(results.threshold('<= 25 ms')), { op: '<=', value: 25, text: '25 ms' });
  assert.deepEqual(plain(results.threshold('≥0.9')), { op: '>=', value: 0.9, text: '0.9' });
  assert.equal(results.threshold('25'), null);
  assert.equal(results.threshold('== 25'), null);
  assert.equal(results.threshold('< fast'), null);
  const at = (text) => [24, 25, 26, null].map((v) => results.verdict(results.threshold(text), v));
  assert.deepEqual(at('< 25'), [true, false, false, null]);
  assert.deepEqual(at('<= 25'), [true, true, false, null]);
  assert.deepEqual(at('> 25'), [false, false, true, null]);
  assert.deepEqual(at('>= 25'), [false, true, true, null]);
});

function el(tag, text = '', children = []) {
  const attrs = new Map();
  const classes = new Set();
  const props = new Map();
  const node = Object.assign(new EventTarget(), {
    tagName: tag.toUpperCase(), colSpan: 1, children, classes, props,
    classList: { add: (name) => classes.add(name) },
    style: { setProperty: (name, value) => props.set(name, value) },
    setAttribute: (name, value) => attrs.set(name, String(value)),
    getAttribute: (name) => attrs.get(name) ?? null,
    hasAttribute: (name) => attrs.has(name),
    appendChild(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = node;
      children.push(child);
      return child;
    },
    insertAdjacentHTML() {}
  });
  children.forEach((child) => { child.parent = node; });
  return Object.defineProperties(node, {
    firstChild: { get: () => children[0] ?? null },
    rows: { get: () => children },
    cells: { get: () => children },
    textContent: {
      get: () => (text ?? '') + children.map((child) => child.textContent).join(''),
      set(value) { text = value; children.length = 0; }
    }
  });
}

function enhanceTable(header, cells) {
  const th = el('th', 'Time (ms)');
  Object.entries(header).forEach(([name, value]) => th.setAttribute(name, value));
  const rows = cells.map(([name, value]) => el('tr', '', [el('td', name), el('td', value)]));
  const head = el('tr', '', [el('th', 'Method'), th]);
  const table = el('table');
  table.tHead = el('thead', '', [head]);
  table.tBodies = [el('tbody', '', rows)];
  const warnings = [];
  let init;
  const context = vm.createContext({
    Intl,
    document: { createElement: (tag) => el(tag), createTextNode: (text) => el('#text', text) },
    DocForm: {
      data: (node, key, fallback) => node.getAttribute('data-df-' + key) ?? fallback,
      warnOnce: (key, message) => warnings.push(message),
      all: () => [table],
      register: (name, fn) => { init = fn; }
    }
  });
  context.window = context;
  vm.runInContext(read('results.js'), context);
  init();
  return { th, rows, body: table.tBodies[0], warnings };
}

test('a table threshold adds verdicts and a header rule without changing sorting', () => {
  const cells = [['Inverse', '61.0 ± 2.1'], ['LU', '21.4'], ['Edge', '25'], ['CG', '—'], ['Tuned', '30']];
  const { th, rows, body, warnings } = enhanceTable({
    'data-df-threshold': '<= 25 ms', 'data-df-threshold-label': 'Time budget', 'data-df-heat-range': '0, 60', 'data-df-best': 'min'
  }, cells);
  assert.deepEqual(warnings, []);
  assert.deepEqual(rows.map((tr) => tr.cells[1].textContent), ['61.0 ± 2.1 Fail', '21.4 Pass', '25 Pass', '—', '30 Fail']);
  assert.equal(rows[3].cells[1].classes.has('df-pass') || rows[3].cells[1].classes.has('df-fail'), false);
  assert.equal(th.children.at(-1).textContent, 'Time budget: ≤ 25 ms');
  assert.deepEqual(rows.map((tr) => tr.cells[1].props.get('--df-heat') ?? null), [0, 0.6433, 0.5833, null, 0.5]);
  const order = () => body.children.map((tr) => tr.cells[0].textContent);
  th.children[0].dispatchEvent(new Event('click'));
  assert.deepEqual(order(), ['LU', 'Edge', 'Tuned', 'Inverse', 'CG']);
  th.children[0].dispatchEvent(new Event('click'));
  assert.deepEqual(order(), ['Inverse', 'Tuned', 'Edge', 'LU', 'CG']);
});

test('invalid ranges and thresholds warn and are ignored', () => {
  const { th, rows, warnings } = enhanceTable({ 'data-df-threshold': 'under 25', 'data-df-heat-range': '60, 0' }, [['A', '10'], ['B', '20']]);
  assert.equal(warnings.length, 2);
  assert.deepEqual(rows.map((tr) => tr.cells[1].textContent), ['10', '20']);
  assert.equal(rows[0].cells[1].classes.has('df-heat'), false);
  assert.equal(th.children.length, 1);
});
