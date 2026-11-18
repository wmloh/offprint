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
    tagName: tag.toUpperCase(), colSpan: 1, hidden: false, children, classes, props, parentNode: null,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
    closest: () => null,
    style: { setProperty: (name, value) => props.set(name, value), removeProperty: (name) => props.delete(name) },
    setAttribute: (name, value) => attrs.set(name, String(value)),
    getAttribute: (name) => attrs.get(name) ?? null,
    hasAttribute: (name) => attrs.has(name),
    appendChild: (child) => node.insertBefore(child, null),
    insertBefore(child, before) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      child.parentNode = node;
      const at = before ? children.indexOf(before) : -1;
      children.splice(at < 0 ? children.length : at, 0, child);
      return child;
    },
    insertRow: () => node.appendChild(el('tr')),
    insertCell: () => node.appendChild(el('td')),
    insertAdjacentHTML() {}
  });
  children.forEach((child) => { child.parentNode = node; });
  return Object.defineProperties(node, {
    firstChild: { get: () => children[0] ?? null },
    rows: { get: () => children },
    cells: { get: () => children },
    className: { set(value) { value.split(' ').forEach((name) => classes.add(name)); } },
    innerHTML: { set() {} },
    textContent: {
      get: () => (text ?? '') + children.map((child) => child.textContent).join(''),
      set(value) { text = value; children.length = 0; }
    }
  });
}

// headers: [text, attributes] pairs; cells: one array of texts per row. A holder stands in for a data block.
function makeTable(headers, cells, tableAttrs = {}, holder = null) {
  const ths = headers.map(([text, attrs = {}]) => {
    const th = el('th', text);
    Object.entries(attrs).forEach(([name, value]) => th.setAttribute(name, value));
    return th;
  });
  const rows = cells.map((row) => el('tr', '', row.map((text) => el('td', text))));
  const table = el('table');
  Object.entries(tableAttrs).forEach(([name, value]) => table.setAttribute(name, value));
  table.tHead = el('thead', '', [el('tr', '', ths)]);
  table.tBodies = [el('tbody', '', rows)];
  table.appendChild(table.tBodies[0]);
  table.closest = (selector) => (selector === '.df-data' ? holder : null);
  el('div', '', [table]);
  return { table, ths, rows: rows.slice(), body: table.tBodies[0] };
}

function build(headers, cells, tableAttrs = {}, holder = null) {
  const { table, ths, rows } = makeTable(headers, cells, tableAttrs, holder);
  const warnings = [];
  let init;
  const context = vm.createContext({
    Intl, WeakMap,
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
  return { table, ths, rows, body: table.tBodies[0], warnings, results: context.DocForm.results };
}

function enhanceTable(header, cells) {
  const built = build([['Method'], ['Time (ms)', header]], cells);
  return { ...built, th: built.ths[1] };
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

test('time cells, chip text, and filter checks', () => {
  assert.equal(results.timeValue('2026-03-01'), Date.UTC(2026, 2, 1));
  assert.equal(results.timeValue('2026-03-01 14:05'), Date.UTC(2026, 2, 1, 14, 5));
  assert.equal(results.timeValue('2026-03-01T14:05:09.5+09:00'), Date.UTC(2026, 2, 1, 5, 5, 9, 500));
  assert.equal(results.timeValue('2026-02-30'), null);
  assert.equal(results.timeValue('03/01/2026'), null);
  assert.equal(results.timeColumn(['2026-03-01', '—', '2026-03-02T00:00Z']), true);
  assert.equal(results.timeColumn(['2026-03-01', 'soon']), false);

  const chips = plain(results.parseChips('Fast: Latency (ms) <= 25 & Optimizer = adam | SGD; no label; Odd: Latency ~ 3;'));
  assert.deepEqual(chips[0], { label: 'Fast', conds: [{ column: 'Latency (ms)', op: '<=', text: '25' }, { column: 'Optimizer', op: '=', text: 'adam | SGD' }] });
  assert.ok(chips[1].error && chips[2].error);
  assert.equal(chips.length, 3);

  const text = results.condition({ column: 'Optimizer', op: '=', text: 'adam | SGD' }, 'text');
  assert.deepEqual(['sgd', 'Adam', 'rmsprop'].map((k) => text.test(null, k)), [true, true, false]);
  assert.ok(results.condition({ column: 'Optimizer', op: '<', text: 'adam' }, 'text').error);
  const under = results.condition({ column: 'Latency', op: '<=', text: '25 ms' }, 'number');
  assert.deepEqual([25, 26, null].map((v) => under.test(v)), [true, false, false]);
  assert.equal(results.condition({ column: 'Seed', op: '!=', text: '1 | 2' }, 'number').test(3), true);
  assert.ok(results.condition({ column: 'Seed', op: '<', text: '1 | 2' }, 'number').error);
  assert.equal(results.condition({ column: 'Date', op: '>=', text: '2026-03-01' }, 'time').test(Date.UTC(2026, 2, 1)), true);

  assert.deepEqual([results.passes({ excluded: ['a'] }, 'a', 'a'), results.passes({ excluded: ['a'] }, 'b', 'b')], [false, true]);
  assert.deepEqual([0, 1, null].map((v) => results.passes({ min: 1, max: null }, v, '')), [false, true, false]);
  assert.equal(results.passes({ min: null, max: null }, null, ''), true);
});

const BENCH = [
  ['Model'], ['Optimizer'], ['Accuracy', { 'data-df-best': 'max', 'data-df-heat': '' }],
  ['Latency (ms)', { 'data-df-best': 'min', 'data-df-heat-range': '0, 40', 'data-df-threshold': '<= 25' }], ['Date']
];
const BENCH_ROWS = [
  ['A', 'sgd', '0.80', '10', '2026-03-01'], ['B', 'adam', '0.90', '20', '2026-03-02'],
  ['C', 'adam', '0.95', '30', '2026-03-03'], ['D', 'sgd', '0.85', '—', '2026-03-04']
];
const find = (node, cls) => node.classes.has(cls) ? node : node.children.map((child) => find(child, cls)).find(Boolean);
const shownNames = (body) => body.children.filter((tr) => !tr.hidden).map((tr) => tr.cells[0].textContent);
const marks = (rows, c) => rows.map((tr) => [tr.cells[c].classes.has('df-best'), tr.cells[c].props.get('--df-heat') ?? null]);

test('chips match columns by data-df-field or header text, not the removed data-df-column', () => {
  const { warnings } = build([['Run'], ['Latency (ms)', { 'data-df-field': 'latency' }],
    ['Validation loss', { 'data-df-column': 'loss' }]], [['a', '10', '1'], ['b', '30', '2']],
  { 'data-df-chips': 'Fast: latency <= 25; Low: Validation loss < 2; Old: loss < 2' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Old.*no column "loss"/);
});

test('column filters and chips combine, recompute marks over visible rows, and keep fixed ranges and verdicts', () => {
  const { table, ths, rows, body, warnings, results: api } = build(BENCH, BENCH_ROWS, {
    'data-df-filters': '', 'data-df-chips': 'Within budget: Latency (ms) <= 25; Adam: optimizer = adam; Broken: Nope = 1'
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Broken.*no column "Nope"/);
  const bar = table.parentNode.children[0];
  const count = find(bar, 'df-filter-count');
  const clear = find(bar, 'df-filter-clear');
  const [budget, adam] = find(bar, 'df-chips').children;
  const empty = table.children.find((child) => child.classes.has('df-filter-empty'));
  assert.equal(count.textContent, '4 rows');
  assert.equal(clear.disabled, true);
  assert.deepEqual(marks(rows, 2), [[false, 0], [false, 0.6667], [true, 1], [false, 0.3333]]);

  budget.dispatchEvent(new Event('click'));
  assert.equal(budget.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(shownNames(body), ['A', 'B']);
  assert.equal(count.textContent, '2 of 4 rows match');
  assert.deepEqual(marks(rows, 2), [[false, 0], [true, 1], [false, null], [false, null]]);
  assert.deepEqual(marks(rows, 3).map((m) => m[1]), [0.75, 0.5, null, null]);
  assert.equal(rows[2].cells[3].textContent, '30 Fail');

  const filters = api.filters(table);
  assert.equal(filters.set('optimizer', { excluded: ['adam'] }), true);
  assert.deepEqual(shownNames(body), ['A']);
  assert.equal(ths[1].children[0].children[1].getAttribute('data-df-active'), 'true');
  assert.deepEqual(marks(rows, 2)[0], [true, 0]);

  // Sorting moves hidden rows too and keeps them hidden.
  ths[2].children[0].children[0].dispatchEvent(new Event('click'));
  assert.deepEqual(body.children.map((tr) => tr.cells[0].textContent), ['C', 'B', 'D', 'A']);
  assert.deepEqual(shownNames(body), ['A']);

  filters.set('Accuracy', { min: 0.99, max: null });
  assert.equal(count.textContent, '0 of 4 rows match');
  assert.equal(empty.hidden, false);

  clear.dispatchEvent(new Event('click'));
  assert.deepEqual(shownNames(body), ['C', 'B', 'D', 'A']);
  assert.equal(empty.hidden, true);
  assert.equal(adam.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(marks(rows, 2)[2], [true, 1]);

  filters.set('Date', { min: results.timeValue('2026-03-02'), max: results.timeValue('2026-03-03') });
  filters.chip('Adam', true);
  assert.deepEqual(shownNames(body).sort(), ['B', 'C']);
});

test('a data table redrawn in the same block keeps the reader\'s filters and chips', () => {
  const holder = {};
  const first = build(BENCH, BENCH_ROWS, { 'data-df-filters': '', 'data-df-chips': 'Adam: Optimizer = adam' }, holder);
  first.results.filters(first.table).set('Accuracy', { min: 0.9, max: null });
  first.results.filters(first.table).chip('adam');
  assert.deepEqual(shownNames(first.body), ['B', 'C']);
  const more = makeTable(BENCH, BENCH_ROWS.concat([['E', 'adam', '0.97', '12', '2026-03-05'], ['F', 'adam', '0.5', '9', '2026-03-06']]),
    { 'data-df-filters': '', 'data-df-chips': 'Adam: Optimizer = adam' }, holder);
  first.results.enhance(more.table);
  assert.deepEqual(shownNames(more.body), ['B', 'C', 'E']);
  assert.equal(find(more.table.parentNode.children[0], 'df-filter-count').textContent, '3 of 6 rows match');
  assert.equal(first.results.filters(more.table).shown(), 3);
});
