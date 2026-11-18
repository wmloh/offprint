const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Just enough DOM for data.js to draw a code view.
class El {
  constructor(tag) {
    const classes = new Set();
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.kids = [];
    this.text = '';
    this.classList = { add: (...names) => names.forEach((n) => classes.add(n)), contains: (n) => classes.has(n) };
  }
  get textContent() { return this.text + this.kids.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kids = []; this.text = String(v); }
  set className(v) { this.classList.add(...String(v).split(' ')); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  hasAttribute(n) { return this.attrs.has(n); }
  appendChild(k) { this.kids.push(k); return k; }
  querySelector() { return null; }
}

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform', file), 'utf8');
const context = vm.createContext({ URL, TextEncoder, WeakMap, console: { warn() {} } });
context.window = context;
context.document = { createElement: (tag) => new El(tag), readyState: 'loading', addEventListener() {} };
vm.runInContext(read('vendor/js-yaml/js-yaml.min.js'), context);
vm.runInContext(read('js/core.js'), context);
vm.runInContext(read('js/data.js'), context);
vm.runInContext(read('js/chart.js'), context);
vm.runInContext(read('js/dropzone.js'), context);
const { dataset, dropzone, chart } = context.DocForm;
const plain = (value) => JSON.parse(JSON.stringify(value));
const csv = { name: 'mine.csv', type: 'csv', text: 'epoch,train,val\n1,0.6,0.55\n2,0.7,0.61\n3,0.8,0.64\n' };

test('dropzones accept only their declared types and sizes', () => {
  assert.deepEqual(plain(dropzone.accepted('')), ['csv', 'json', 'yaml']);
  assert.deepEqual(plain(dropzone.accepted('.yml, json toml json')), ['yaml', 'json']);
  assert.equal(dropzone.listNames(['csv', 'json', 'yaml']), 'CSV, JSON, or YAML');
  const accept = ['csv', 'yaml'];
  assert.deepEqual(['a.CSV', 'b.yml', 'c.json', 'notes.txt', 'csv'].map((n) => dropzone.fileType(n, '', accept)), ['csv', 'yaml', null, null, null]);
  assert.equal(dropzone.fileType('export', 'text/csv; charset=utf-8', accept), 'csv');
  assert.equal(dropzone.fileType('export.txt', 'text/csv', accept), null);
  assert.deepEqual(plain(dropzone.check({ name: 'runs.csv', size: 1024, type: '' }, accept, 1024)), { type: 'csv' });
  assert.equal(dropzone.check({ name: 'runs.json', size: 10, type: '' }, accept, 1024).error, '"runs.json" is not a CSV or YAML file.');
  assert.equal(dropzone.check({ name: 'big.csv', size: 3 * 1048576, type: '' }, accept, 1048576).error,
    '"big.csv" is 3.0 MB, over this file box\'s 1.0 MB limit.');
});

test('tabular files become chart series that keep the chart\'s look but not its fixed bounds', () => {
  const base = {
    type: 'line', x: { label: 'Epoch', min: 0, max: 10 }, y: { type: 'log', min: 0.5 },
    referenceLines: [{ axis: 'y', value: 0.6, label: 'Target' }],
    series: [{ name: 'val', color: 'red', data: [[1, 0.5]] }], categories: ['a']
  };
  const made = dropzone.chartSpec(dataset.parse(csv.text, 'csv'), base, 2);
  assert.deepEqual([made.rows, made.total], [2, 3]);
  assert.deepEqual(plain(made.spec.x), { label: 'Epoch' });
  assert.deepEqual(plain(made.spec.y), { type: 'log' });
  assert.equal(made.spec.categories, undefined);
  assert.deepEqual(plain(made.spec.referenceLines), plain(base.referenceLines));
  assert.deepEqual([...made.spec.series].map((s) => [s.name, s.color, s.data.length]), [['train', undefined, 2], ['val', 'red', 2]]);
  assert.deepEqual(plain(chart.validate(made.spec)), []);
  assert.equal(dropzone.chartSpec(dataset.parse(csv.text, 'csv'), { x: {} }).spec.x.label, 'epoch');
  const spec = dropzone.chartSpec(dataset.parse('{"type": "bar", "series": [{"name": "s", "data": [["a", 1]]}]}', 'json'), base);
  assert.deepEqual([spec.spec.type, spec.spec.series[0].name, spec.spec.x.label], ['bar', 's', 'Epoch']);
  assert.throws(() => dropzone.chartSpec(dataset.parse('a: {b: 1}', 'yaml'), base), /needs a table/);
  assert.throws(() => dropzone.chartSpec(dataset.parse('only\n1\n', 'csv'), base), /at least one series/);
});

test('a linked chart takes the file and Reset hands back its original spec', () => {
  const original = { type: 'line', series: [{ name: 'val', data: [[1, 0.5], [2, 0.6]] }] };
  const updates = [];
  const api = { spec: () => updates.length ? updates[updates.length - 1] : original, update: (s) => updates.push(s) };
  const get = chart.get;
  chart.get = () => api;
  const link = dropzone.link({});
  chart.get = get;
  assert.equal(link.kind, 'chart');
  assert.equal(link.feed(csv, { maxRows: 2 }), 'Plotting the first 2 of 3 rows.');
  assert.equal(link.feed(csv, { maxRows: 5000 }), '');
  assert.deepEqual([...updates[1].series].map((s) => s.name), ['train', 'val']);
  assert.throws(() => link.feed({ name: 'x.json', type: 'json', text: '{"a": 1}' }, { maxRows: 10 }), /needs a table/);
  assert.equal(updates.length, 2);
  link.restore();
  assert.equal(updates[2], original);
});

test('a linked data block shows the file and restores its own data', () => {
  dataset.add('curve', 'epoch,val\n1,0.5\n', 'csv');
  const block = context.document.createElement('div');
  block.setAttribute('data-df-data', 'curve');
  block.setAttribute('data-df-view', 'code');
  dataset.render(block);
  assert.equal(block.textContent, 'epoch,val\n1,0.5');
  assert.equal(dataset.restore(block), false);
  const link = dropzone.link(block);
  assert.equal(link.kind, 'data');
  link.feed(csv);
  assert.match(block.textContent, /^epoch,train,val\n1,0.6/);
  link.feed({ name: 'two.csv', type: 'csv', text: 'a,b\n1,2' });
  assert.equal(block.textContent, 'a,b\n1,2');
  link.restore();
  assert.equal(block.textContent, 'epoch,val\n1,0.5');
  assert.equal(dropzone.link(context.document.createElement('p')), null);
});
