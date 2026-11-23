const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, TextEncoder, console: { warn: (m) => warnings.push(m) } });
context.window = context;
vm.runInContext(read('vendor/js-yaml/js-yaml.min.js'), context);
vm.runInContext(read('js/core.js'), context);
vm.runInContext(read('js/data.js'), context);
const data = context.OffPrint.data;
const helpers = context.OffPrint._dataSource;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fakeEl = (attrs) => ({ getAttribute: (name) => (name in attrs ? attrs[name] : null) });
const message = (fn) => { try { fn(); } catch (e) { return e.message; } return null; };

test('named sources accept typed and raw data with immutable snapshots and revisioned updates', () => {
  const api = context.OffPrint.data;
  const input = [{ id: '007', values: { a: true, b: [1, null] } }];
  const source = api.define(' typed ', { type: 'value', value: input });
  const received = [];
  const stop = source.subscribe((state, meta) => received.push([state.revision, meta.origin]), { immediate: true });
  assert.equal(api.source('typed'), source);
  assert.equal(api.source('Typed'), null);
  assert.equal(api.define('typed', { type: 'json', text: 'null' }), null);
  input[0].values.b[0] = 9;
  assert.equal(source.snapshot().value[0].values.b[0], 1);
  assert.equal(Object.isFrozen(source.snapshot().value[0].values.b), true);
  assert.equal(source.update({ type: 'value', value: [{ values: { b: [1, null], a: true }, id: '007' }] }), true);
  assert.equal(received.length, 1);
  const circular = {};
  circular.ref = circular;
  for (const value of [circular, new Date(), { bad: Infinity }, [undefined]]) {
    assert.equal(source.update({ type: 'value', value }), false);
  }
  assert.equal(source.update({ type: 'csv', text: 'id,id\na,b' }), false);
  assert.equal(source.snapshot().revision, 0);
  assert.equal(source.update({ type: 'yaml', text: 'nested:\n  enabled: true' }), true);
  assert.deepEqual(plain(source.snapshot().value), { nested: { enabled: true } });
  assert.equal(source.reset(), true);
  assert.deepEqual(received, [[0, 'init'], [1, 'api'], [2, 'reset']]);
  stop();
  stop();
  assert.equal(source.update({ type: 'json', text: 'null' }), true);
  assert.equal(received.length, 3);
});

test('types come from names, MIME types, or the text itself', () => {
  assert.deepEqual(['yml', 'text/csv', 'application/json', 'toml'].map(helpers.type), ['yaml', 'csv', 'json', null]);
  assert.equal(helpers.sniff('anything', 'x.yaml'), 'yaml');
  assert.equal(helpers.sniff('  [1, 2]'), 'json');
  assert.equal(helpers.sniff('a,b\n1,2'), 'csv');
  assert.equal(helpers.sniff('name: a, b\n'), 'yaml');
  assert.deepEqual(['md', 'text/tab-separated-values', 'text/xml'].map(helpers.type), ['markdown', 'tsv', 'xml']);
  assert.deepEqual([helpers.sniff('a\tb\n1\t2'), helpers.sniff('<?xml version="1.0"?><a/>'), helpers.sniff('x', 'notes.md')],
    ['tsv', 'xml', 'markdown']);
});

test('size caps parse units and default to 1 MB and 5,000 rows', () => {
  assert.deepEqual(['1 MB', '500kb', '2.5 K', '300', '1 GB', 'big'].map(helpers.parseSize), [1048576, 512000, 2560, 300, null, null]);
  assert.equal(helpers.size('é€'), 5);
  assert.deepEqual(['12 bytes', '1.5 KB', '200 KB', '2.0 MB'], [12, 1536, 204800, 2097152].map(helpers.formatSize));
  assert.deepEqual(plain(helpers.limits(fakeEl({}))), { maxBytes: 1048576, maxRows: 5000 });
  assert.deepEqual(plain(helpers.limits(fakeEl({ 'data-op-max-size': '2 MB', 'data-op-max-rows': '200' }))), { maxBytes: 2097152, maxRows: 200 });
  assert.deepEqual(plain(helpers.limits(fakeEl({ 'data-op-max-size': 'lots', 'data-op-max-rows': '2.5' }))), { maxBytes: 1048576, maxRows: 5000 });
});

test('CSV keeps quoted commas, quotes, and line breaks, and types only unquoted fields', () => {
  const csv = data.parse('\uFEFFname,score,ok,note,id\r\n"Smith, J",0.91,true,"said ""hi""\nthen left",007\n\nLee,,FALSE,"42",-1e3\n', 'csv');
  assert.deepEqual(plain(csv.columns), ['name', 'score', 'ok', 'note', 'id']);
  assert.deepEqual(plain(csv.rows), [
    ['Smith, J', 0.91, true, 'said "hi"\nthen left', '007'],
    ['Lee', null, false, '42', -1000]
  ]);
  assert.deepEqual(plain(csv.cells[1]), ['Lee', '', 'FALSE', '42', '-1e3']);
  assert.deepEqual(plain(data.parse(',b\n1,2', 'csv').columns), ['Column 1', 'b']);
});

test('CSV errors name the line, counting line breaks inside quotes', () => {
  assert.equal(message(() => data.parse('a,b\n"x\ny",1\n3\n', 'csv')), 'Line 4: this row has 1 fields; the header has 2.');
  assert.equal(message(() => data.parse('a,b\n1,"open\n', 'csv')), 'Line 2: a quoted field is not closed.');
  assert.equal(message(() => data.parse('a,b\n"x"y,1', 'csv')), 'Line 2: unexpected text after a closing quote.');
  assert.equal(message(() => data.parse('\n\n', 'csv')), 'the CSV is empty.');
});

test('TSV shares CSV quoting and typing, and its records feed tables', () => {
  const tsv = data.parse('name\tscore\n"a\tb"\t1.5\nc\t\n', 'tsv');
  assert.deepEqual(plain(tsv.rows), [['a\tb', 1.5], ['c', null]]);
  assert.equal(helpers.isGrid(tsv), true);
  assert.deepEqual(plain(data.table(tsv).columns), ['name', 'score']);
  assert.equal(message(() => data.parse('a\tb\n1\n', 'tsv')), 'Line 2: this row has 1 fields; the header has 2.');
  assert.equal(message(() => data.parse('\n', 'tsv')), 'the TSV is empty.');
});

test('XML becomes a typed JSON tree with attributes, repeated children as lists, and mixed text', () => {
  const xml = '<?xml version="1.0"?>\n<!-- runs --><runs split="test">\n  <run id="007"><acc>0.91</acc><ok>true</ok></run>\n' +
    '  <run id="r2"><acc>.5</acc><note>a &amp; b &#x41;<![CDATA[<raw>]]></note><empty/></run>\n  <p>x<b>y</b></p>\n</runs>';
  assert.deepEqual(plain(data.parse(xml, 'xml').value), { runs: {
    '@split': 'test',
    run: [{ '@id': '007', acc: 0.91, ok: true }, { '@id': 'r2', acc: 0.5, note: 'a & b A<raw>', empty: null }],
    p: { b: 'y', '#text': 'x' }
  } });
  assert.equal(message(() => data.parse('<a>\n<b></a>', 'xml')), 'Line 2: </a> does not match <b>.');
  assert.match(message(() => data.parse('<a/><b/>', 'xml')), /more than one root/);
  assert.match(message(() => data.parse('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>', 'xml')), /DOCTYPE/);
  assert.match(message(() => data.parse('<a>&x;</a>', 'xml')), /not a supported entity/);
  assert.match(message(() => data.parse('<a x="1" x="2"/>', 'xml')), /appears twice/);
  assert.match(message(() => data.parse('<a>', 'xml')), /<a> is not closed/);
  assert.equal(data.define('xml-source', { type: 'xml', text: '<a><b>1</b></a>' }).snapshot().value.a.b, 1);
});

test('Markdown keeps its text as the value and views it rendered by default', () => {
  const md = data.parse('\uFEFF# Notes\n', 'markdown');
  assert.deepEqual(plain(md), { type: 'markdown', value: '# Notes\n' });
  assert.deepEqual([helpers.view(md), helpers.view(md, 'code'), helpers.view(md, 'table')], ['markdown', 'code', 'code']);
  assert.equal(helpers.view(data.parse('a,b\n1,2', 'csv'), 'markdown'), 'table');
});

test('JSON errors give the line and column without echoing the source', () => {
  assert.deepEqual(plain(data.parse('{"a": [1, null]}', 'json')), { type: 'json', value: { a: [1, null] } });
  assert.equal(message(() => data.parse('{\n  "a": 1,\n  "b" 2\n}', 'json')), "Line 3: Expected ':' after property name (column 7).");
  assert.ok(!/is not valid JSON/.test(message(() => data.parse('{"a":}', 'json'))));
});

test('YAML reads one core-schema document and rejects several documents and custom tags', () => {
  assert.deepEqual(plain(data.parse('- {lr: 0.1, when: 2024-01-02}\n- lr: .5\n', 'yaml').value), [{ lr: 0.1, when: '2024-01-02' }, { lr: 0.5 }]);
  assert.equal(data.parse('', 'yaml').value, null);
  assert.match(message(() => data.parse('a: 1\n---\nb: 2\n', 'yaml')), /found 2 YAML documents/);
  assert.match(message(() => data.parse('a: 1\nb: !secret x\n', 'yaml')), /^Line 2: the tag !secret is not supported/);
  assert.match(message(() => data.parse('when: !!timestamp 2024-01-02\n', 'yaml')), /the tag !!timestamp is not supported/);
  assert.match(message(() => data.parse('a: [1\n', 'yaml')), /^Line \d+: /);
  const saved = context.jsyaml;
  context.jsyaml = undefined;
  assert.match(message(() => data.parse('a: 1', 'yaml')), /js-yaml\.min\.js/);
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
  assert.deepEqual([helpers.view(csv), helpers.view(records), helpers.view(nested)], ['table', 'table', 'code']);
  assert.deepEqual([helpers.view(csv, 'code'), helpers.view(nested, 'table'), helpers.view(records, 'table')], ['code', 'code', 'table']);
  assert.deepEqual([helpers.view(csv, 'tree'), helpers.view(nested, 'tree')], ['tree', 'tree']);
  assert.deepEqual(plain(data.valueOf(data.parse('a,b\n1,x', 'csv'))), [{ a: 1, b: 'x' }]);
});

test('inline blocks lose their shared indentation and edge blank lines', () => {
  assert.equal(helpers.dedent('\n    a: 1\n    b:\n      - 2\n  \n'), 'a: 1\nb:\n  - 2');
});
