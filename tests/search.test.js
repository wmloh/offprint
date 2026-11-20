const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');

function load() {
  const context = vm.createContext({ URL, console: { warn: () => {} } });
  context.window = context;
  vm.runInContext(read('core.js'), context);
  vm.runInContext(read('search.js'), context);
  return Object.assign({}, context.DocForm.search, { context });
}

const json = (value) => JSON.parse(JSON.stringify(value));

const entries = [
  { page: 'Vectors', title: 'Vectors', text: 'A vector is an arrow. The dot product appears later.' },
  { page: 'Vectors', title: 'Length and the dot product', text: 'The dot product measures alignment.' },
  { page: 'Matrices', title: 'Multiplying matrices', text: 'Each entry is a dot product of a row and a column.' },
  { page: 'Matrices', title: 'Order matters', text: 'Products do not commute.' },
  { page: 'Dot notation', title: 'Notation', text: 'Unrelated text about symbols.' }
];

test('ranking requires every word and prefers section titles, then page titles, then text', () => {
  const search = load();
  const titles = (query) => json(search.rank(entries, query).map((r) => r.entry.title));
  assert.deepEqual(titles('dot product'), ['Length and the dot product', 'Vectors', 'Multiplying matrices']);
  assert.deepEqual(titles('dot'), ['Length and the dot product', 'Notation', 'Vectors', 'Multiplying matrices']);
  assert.deepEqual(titles('matrices order'), ['Order matters']);
  assert.deepEqual(titles('   '), []);
});

test('whole-word matches outrank mid-word matches and ties keep index order', () => {
  const search = load();
  const list = [
    { page: 'P', title: 'Eigenvectors', text: '' },
    { page: 'P', title: 'Vectors', text: '' },
    { page: 'P', title: 'Vectors again', text: '' }
  ];
  assert.deepEqual(json(search.rank(list, 'vector').map((r) => r.entry.title)), ['Vectors', 'Vectors again', 'Eigenvectors']);
  assert.deepEqual(json(search.rank(list, 'vector', 1).map((r) => r.entry.title)), ['Vectors']);
});

test('highlights mark every token without overlaps, and snippets centre the first hit', () => {
  const search = load();
  assert.deepEqual(json(search.highlight('Dot product of dots', ['dot', 'do'])), [
    { text: 'Dot', hit: true }, { text: ' product of ', hit: false }, { text: 'dot', hit: true }, { text: 's', hit: false }
  ]);
  const text = 'word '.repeat(60) + 'needle ' + 'tail '.repeat(60);
  const piece = search.snippet(text, ['needle'], 80);
  assert.match(piece, /^….*needle.*…$/);
  assert.ok(piece.length <= 82);
  assert.equal(search.snippet('short text', ['x']), 'short text');
});

test('Ctrl+K and Cmd+K open the palette, other chords do not', () => {
  const search = load();
  assert.equal(search.isShortcut({ key: 'k', ctrlKey: true }), true);
  assert.equal(search.isShortcut({ key: 'K', metaKey: true }), true);
  assert.equal(search.isShortcut({ key: 'k', ctrlKey: true, shiftKey: true }), false);
  assert.equal(search.isShortcut({ key: 'k' }), false);
});

test('indexed pages are listed with URLs resolved against the manifest base', () => {
  const search = load();
  const context = search.context;
  context.DocForm.site = { provided: true, base: 'file:///notes/' };
  const sections = [{ id: 'x', level: 2, title: 'X' }];
  const outline = [{ id: 'heading', level: 1, title: 'B' }, ...sections];
  const page = { path: 'a/b.html', title: 'B', sections };
  context.DocFormSearch = { pages: [page, { ...page, path: 'c.html', outline }] };
  let result;
  search.pages((pages) => { result = pages; });
  assert.deepEqual(json(result), [
    { href: 'file:///notes/a/b.html', title: 'B', sections, outline: sections, terms: null },
    { href: 'file:///notes/c.html', title: 'B', sections, outline, terms: null }
  ]);
});
