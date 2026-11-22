const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform', file), 'utf8');
const context = vm.createContext({ URL, TextEncoder, WeakMap, console: { warn() {} } });
context.window = context;
vm.runInContext(read('vendor/js-yaml/js-yaml.min.js'), context);
vm.runInContext(read('js/core.js'), context);
vm.runInContext(read('js/data.js'), context);
vm.runInContext(read('js/chart.js'), context);
vm.runInContext(read('js/dropzone.js'), context);
const { data, _dropzone: dropzone, _chart: chart } = context.DocForm;
const plain = (value) => JSON.parse(JSON.stringify(value));
const csv = { name: 'mine.csv', type: 'csv', text: 'epoch,train,val\n1,0.6,0.55\n2,0.7,0.61\n3,0.8,0.64\n' };

test('dropzones accept only their declared types and sizes', () => {
  assert.deepEqual(plain(dropzone.accepted('')), ['csv', 'tsv', 'json', 'yaml', 'xml', 'markdown']);
  assert.deepEqual(['n.md', 'r.xml', 't.tsv'].map((n) => dropzone.fileType(n, '', ['markdown', 'xml', 'tsv'])), ['markdown', 'xml', 'tsv']);
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
  const made = dropzone.chartSpec(data.parse(csv.text, 'csv'), base, 2);
  assert.deepEqual([made.rows, made.total], [2, 3]);
  assert.deepEqual(plain(made.spec.x), { label: 'Epoch' });
  assert.deepEqual(plain(made.spec.y), { type: 'log' });
  assert.equal(made.spec.categories, undefined);
  assert.deepEqual(plain(made.spec.referenceLines), plain(base.referenceLines));
  assert.deepEqual([...made.spec.series].map((s) => [s.name, s.color, s.data.length]), [['train', undefined, 2], ['val', 'red', 2]]);
  assert.deepEqual(plain(chart.validate(made.spec)), []);
  assert.equal(dropzone.chartSpec(data.parse(csv.text, 'csv'), { x: {} }).spec.x.label, 'epoch');
  const spec = dropzone.chartSpec(data.parse('{"type": "bar", "series": [{"name": "s", "data": [["a", 1]]}]}', 'json'), base);
  assert.deepEqual([spec.spec.type, spec.spec.series[0].name, spec.spec.x.label], ['bar', 's', 'Epoch']);
  assert.throws(() => dropzone.chartSpec(data.parse('a: {b: 1}', 'yaml'), base), /needs a table/);
  assert.throws(() => dropzone.chartSpec(data.parse('only\n1\n', 'csv'), base), /at least one series/);
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

test('pie file replacements accept label and value tables or a full pie spec', () => {
  const base = { type: 'pie', toggles: true, data: [{ label: 'North', value: 3, key: 'n', color: 'blue' }] };
  const made = dropzone.chartSpec(data.parse('Label,Total\nNorth,5\nSouth,2', 'csv'), base, 2);
  assert.deepEqual([made.rows, made.total], [2, 2]);
  assert.equal(made.spec.y.label, 'Total');
  assert.deepEqual(plain(made.spec.data[0]), { label: 'North', value: '5', key: 'n', color: 'blue' });
  assert.deepEqual(plain(chart.validate(made.spec)), []);
  const full = dropzone.chartSpec(data.parse('{"type":"pie","data":[{"label":"East","value":7}]}', 'json'), base);
  assert.deepEqual(plain(full.spec.data), [{ label: 'East', value: 7 }]);
  assert.equal(full.spec.toggles, true);
});
