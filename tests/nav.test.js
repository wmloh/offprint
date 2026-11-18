const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '../docform/js', name), 'utf8');
const core = read('core.js');
const nav = read('nav.js');

function load() {
  const window = {};
  const context = vm.createContext({ window, URL, console: { warn() {} } });
  vm.runInContext(core, context);
  vm.runInContext(nav, context);
  return window.DocForm;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('heading slugs are lowercase, hyphenated, and keep non-Latin letters', () => {
  const { nav } = load();
  assert.equal(nav.slugify('  Eigenvalues & Eigenvectors! '), 'eigenvalues-eigenvectors');
  assert.equal(nav.slugify('Théorème de Pythagore'), 'theoreme-de-pythagore');
  assert.equal(nav.slugify('线性代数 2'), '线性代数-2');
  assert.equal(nav.slugify('?!'), 'section');
});

test('duplicate slugs get numeric suffixes that avoid existing IDs', () => {
  const { nav } = load();
  const used = new Set(['intro-2']);
  const ids = ['Intro', 'Intro', 'Intro', '!', '?'].map((text) => nav.uniqueSlug(nav.slugify(text), used));
  assert.deepEqual(ids, ['intro', 'intro-3', 'intro-4', 'section', 'section-2']);
});

test('current page matches by path, ignoring index files, query, and hash', () => {
  const DocForm = load();
  const site = DocForm.normalizeSite({
    pages: [
      { title: 'Home', path: 'index.html' },
      { title: 'Group', pages: [{ title: 'My Page', path: 'basics/my%20page.html' }] },
      { title: 'Folder', path: 'folder/' }
    ]
  }, 'file:///notes/site.js');
  const find = (href) => DocForm.nav.findCurrent(site.order, href);
  assert.equal(find('file:///notes/'), 0);
  assert.equal(find('file:///notes/index.html?x=1#top'), 0);
  assert.equal(find('file:///notes/basics/my page.html'), 1);
  assert.equal(find('file:///notes/folder/index.html'), 2);
  assert.equal(find('file:///notes/basics/other.html'), -1);
  assert.equal(find('http://localhost:8000/notes/index.html'), -1);
});

test('outline nests h3 under the preceding h2 and scroll-spy picks the last heading above the line', () => {
  const { nav } = load();
  const tree = nav.outlineTree([{ level: 3, id: 'a' }, { level: 2, id: 'b' }, { level: 3, id: 'c' }, { level: 2, id: 'd' }]);
  assert.deepEqual(plain(tree.map((n) => [n.item.id, n.children.map((c) => c.item.id)])), [['a', []], ['b', ['c']], ['d', []]]);
  assert.equal(nav.pickActive([50, 400, 900], 200, false), 0);
  assert.equal(nav.pickActive([250, 400], 200, false), -1);
  assert.equal(nav.pickActive([-500, 400, 900], 200, true), 2);
});

test('groups open on their own or under the pointer until a caret click holds them open or closed', () => {
  const { nav } = load();
  assert.equal(nav.groupOpen(false, false, null), false);
  assert.equal(nav.groupOpen(true, false, null), true);
  assert.equal(nav.groupOpen(false, true, null), true);
  assert.equal(nav.groupOpen(true, true, false), false);
  assert.equal(nav.groupOpen(false, false, true), true);
  assert.equal(nav.caretChoice(false, true, null), true);
  assert.equal(nav.caretChoice(true, true, null), false);
  assert.equal(nav.caretChoice(false, true, true), false);
  assert.equal(nav.caretChoice(false, true, false), true);
});

test('sidebar width stays between 200px and the smaller of 480px and 40% of the viewport', () => {
  const { nav } = load();
  assert.equal(nav.clampWidth(100, 1920), 200);
  assert.equal(nav.clampWidth(320.4, 1920), 320);
  assert.equal(nav.clampWidth(900, 1920), 480);
  assert.equal(nav.clampWidth(900, 1000), 400);
  assert.equal(nav.clampWidth(300, 400), 200);
});

test('heading links replace any hash and encode the section id', () => {
  const { nav } = load();
  assert.equal(nav.headingUrl('file:///notes/page.html#old', 'basis'), 'file:///notes/page.html#basis');
  assert.equal(nav.headingUrl('file:///notes/page.html?x=1', 'a b#c'), 'file:///notes/page.html?x=1#a%20b%23c');
});
