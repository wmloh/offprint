const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, TextEncoder, console: { warn: (m) => warnings.push(m) } });
context.window = context;
context.DocFormData = {
  runs: { type: 'csv', text: 'model,acc\nA,0.9\n' },
  plain: 'a: 1\n',
  broken: { type: 'csv' }
};
vm.runInContext(read('vendor/js-yaml/js-yaml.min.js'), context);
vm.runInContext(read('js/core.js'), context);
vm.runInContext(read('js/data.js'), context);
const data = context.DocForm.dataset;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fakeEl = (attrs) => ({ getAttribute: (name) => (name in attrs ? attrs[name] : null) });
const message = (fn) => { try { fn(); } catch (e) { return e.message; } return null; };

test('the registry reads added data and wrapped files, keeping the first of duplicate names', () => {
  assert.deepEqual(plain(data.get('runs')), { name: 'runs', type: 'csv', text: 'model,acc\nA,0.9\n' });
  assert.equal(data.get('plain').type, 'yaml');
  assert.equal(data.get('broken'), null);
  assert.equal(data.get('nothing'), null);
  data.add('cfg.json', '{"a": 1}');
  assert.equal(data.get('cfg.json').type, 'json');
  data.add('runs', 'other');
  assert.equal(data.get('runs').text, 'model,acc\nA,0.9\n');
  assert.ok(warnings.some((w) => /more than once/.test(w)));
  assert.ok(plain(data.names()).includes('cfg.json'));
});

test('types come from names, MIME types, or the text itself', () => {
  assert.deepEqual(['yml', 'text/csv', 'application/json', 'toml'].map(data.type), ['yaml', 'csv', 'json', null]);
  assert.equal(data.sniff('anything', 'x.yaml'), 'yaml');
  assert.equal(data.sniff('  [1, 2]'), 'json');
  assert.equal(data.sniff('a,b\n1,2'), 'csv');
  assert.equal(data.sniff('name: a, b\n'), 'yaml');
});

test('size caps parse units and default to 1 MB and 5,000 rows', () => {
  assert.deepEqual(['1 MB', '500kb', '2.5 K', '300', '1 GB', 'big'].map(data.parseSize), [1048576, 512000, 2560, 300, null, null]);
  assert.equal(data.size('é€'), 5);
  assert.deepEqual(['12 bytes', '1.5 KB', '200 KB', '2.0 MB'], [12, 1536, 204800, 2097152].map(data.formatSize));
  assert.deepEqual(plain(data.limits(fakeEl({}))), { maxBytes: 1048576, maxRows: 5000 });
  assert.deepEqual(plain(data.limits(fakeEl({ 'data-df-max-size': '2 MB', 'data-df-max-rows': '200' }))), { maxBytes: 2097152, maxRows: 200 });
  assert.deepEqual(plain(data.limits(fakeEl({ 'data-df-max-size': 'lots', 'data-df-max-rows': '2.5' }))), { maxBytes: 1048576, maxRows: 5000 });
});

test('CSV keeps quoted commas, quotes, and line breaks, and types only unquoted fields', () => {
  const csv = data.parseCsv('\uFEFFname,score,ok,note,id\r\n"Smith, J",0.91,true,"said ""hi""\nthen left",007\n\nLee,,FALSE,"42",-1e3\n');
  assert.deepEqual(plain(csv.columns), ['name', 'score', 'ok', 'note', 'id']);
  assert.deepEqual(plain(csv.rows), [
    ['Smith, J', 0.91, true, 'said "hi"\nthen left', '007'],
    ['Lee', null, false, '42', -1000]
  ]);
  assert.deepEqual(plain(csv.cells[1]), ['Lee', '', 'FALSE', '42', '-1e3']);
  assert.deepEqual(plain(data.parseCsv(',b\n1,2').columns), ['Column 1', 'b']);
});

test('CSV errors name the line, counting line breaks inside quotes', () => {
  assert.equal(message(() => data.parseCsv('a,b\n"x\ny",1\n3\n')), 'Line 4: this row has 1 fields; the header has 2.');
  assert.equal(message(() => data.parseCsv('a,b\n1,"open\n')), 'Line 2: a quoted field is not closed.');
  assert.equal(message(() => data.parseCsv('a,b\n"x"y,1')), 'Line 2: unexpected text after a closing quote.');
  assert.equal(message(() => data.parseCsv('\n\n')), 'the CSV is empty.');
});

test('JSON errors give the line and column without echoing the source', () => {
  assert.deepEqual(plain(data.parse('{"a": [1, null]}', 'json')), { type: 'json', value: { a: [1, null] } });
  assert.equal(message(() => data.parseJson('{\n  "a": 1,\n  "b" 2\n}')), "Line 3: Expected ':' after property name (column 7).");
  assert.ok(!/is not valid JSON/.test(message(() => data.parseJson('{"a":}'))));
});

test('YAML reads one core-schema document and rejects several documents and custom tags', () => {
  assert.deepEqual(plain(data.parse('- {lr: 0.1, when: 2024-01-02}\n- lr: .5\n', 'yaml').value), [{ lr: 0.1, when: '2024-01-02' }, { lr: 0.5 }]);
  assert.equal(data.parseYaml(''), null);
  assert.match(message(() => data.parseYaml('a: 1\n---\nb: 2\n')), /found 2 YAML documents/);
  assert.match(message(() => data.parseYaml('a: 1\nb: !secret x\n')), /^Line 2: the tag !secret is not supported/);
  assert.match(message(() => data.parseYaml('when: !!timestamp 2024-01-02\n')), /the tag !!timestamp is not supported/);
  assert.match(message(() => data.parseYaml('a: [1\n')), /^Line \d+: /);
  const saved = context.jsyaml;
  context.jsyaml = undefined;
  assert.match(message(() => data.parseYaml('a: 1')), /js-yaml\.min\.js/);
  context.jsyaml = saved;
});

test('views pick tables for CSV and flat records and code otherwise, with overrides', () => {
  const csv = data.parse('a,b\n1,2', 'csv');
  const records = data.parse('[{"m": "A", "acc": 0.9}, {"m": "B", "f1": true}]', 'json');
  const nested = data.parse('[{"m": "A", "hp": {"lr": 0.1}}]', 'json');
  assert.deepEqual(plain(data.table(records)), { columns: ['m', 'acc', 'f1'], cells: [['A', '0.9', ''], ['B', '', 'true']] });
  assert.equal(data.table(nested), null);
  assert.equal(data.table(data.parse('[]', 'json')), null);
  assert.equal(data.table(data.parse('{"a": 1}', 'json')), null);
  assert.deepEqual([data.view(csv), data.view(records), data.view(nested)], ['table', 'table', 'code']);
  assert.deepEqual([data.view(csv, 'code'), data.view(nested, 'table'), data.view(records, 'table')], ['code', 'code', 'table']);
});

test('inline blocks lose their shared indentation and edge blank lines', () => {
  assert.equal(data.dedent('\n    a: 1\n    b:\n      - 2\n  \n'), 'a: 1\nb:\n  - 2');
});
