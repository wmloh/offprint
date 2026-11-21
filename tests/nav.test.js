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
  const { _navigation: nav } = load();
  assert.equal(nav.slugify('  Eigenvalues & Eigenvectors! '), 'eigenvalues-eigenvectors');
  assert.equal(nav.slugify('Théorème de Pythagore'), 'theoreme-de-pythagore');
  assert.equal(nav.slugify('线性代数 2'), '线性代数-2');
  assert.equal(nav.slugify('?!'), 'section');
});

test('duplicate slugs get numeric suffixes that avoid existing IDs', () => {
  const { _navigation: nav } = load();
  const used = new Set(['intro-2']);
  const ids = ['Intro', 'Intro', 'Intro', '!', '?'].map((text) => nav.uniqueSlug(nav.slugify(text), used));
  assert.deepEqual(ids, ['intro', 'intro-3', 'intro-4', 'section', 'section-2']);
});

test('current page matches by path, ignoring index files, query, and hash', () => {
  const DocForm = load();
  const site = DocForm._normalizeSite({
    pages: [
      { title: 'Home', path: 'index.html' },
      { title: 'Group', pages: [{ title: 'My Page', path: 'basics/my%20page.html' }] },
      { title: 'Folder', path: 'folder/' }
    ]
  }, 'file:///notes/site.js');
  const find = (href) => DocForm._navigation.findCurrent(site.order, href);
  assert.equal(find('file:///notes/'), 0);
  assert.equal(find('file:///notes/index.html?x=1#top'), 0);
  assert.equal(find('file:///notes/basics/my page.html'), 1);
  assert.equal(find('file:///notes/folder/index.html'), 2);
  assert.equal(find('file:///notes/basics/other.html'), -1);
  assert.equal(find('http://localhost:8000/notes/index.html'), -1);
});

test('outline keeps every anchored h1 in order, even when titles match', () => {
  const { _navigation: nav } = load();
  const sections = nav.outlineSections([
    { level: 1, id: '', title: 'Welcome' }, { level: 2, id: 'a' },
    { level: 1, id: 'b', title: 'Welcome' }, { level: 2, id: 'c' },
    { level: 3, id: 'd' }, { level: 4, id: 'e' }, { level: 1, id: 'f', title: 'Welcome' }
  ]);
  assert.deepEqual(plain(sections.map((section) => section.id)), ['b', 'f']);
});

test('scroll-spy picks the last heading above the line', () => {
  const { _navigation: nav } = load();
  assert.equal(nav.pickActive([50, 400, 900], 200, false), 0);
  assert.equal(nav.pickActive([250, 400], 200, false), -1);
  assert.equal(nav.pickActive([-500, 400, 900], 200, true), 2);
});

test('subsection progress spans the next heading or end of the page and completes at the bottom', () => {
  const { _navigation: nav } = load();
  assert.equal(nav.sectionProgress([400], -1, 300, 1000, false), 0);
  assert.equal(nav.sectionProgress([100, 500], 0, 300, 800, false), 0.5);
  assert.equal(nav.sectionProgress([-300, 200], 1, 300, 600, false), 0.25);
  assert.equal(nav.sectionProgress([-300, 200], 1, 500, 600, true), 1);
});

test('sidebar width stays between 200px and the smaller of 480px and 40% of the viewport', () => {
  const { _navigation: nav } = load();
  assert.equal(nav.clampWidth(100, 1920), 200);
  assert.equal(nav.clampWidth(320.4, 1920), 320);
  assert.equal(nav.clampWidth(900, 1920), 480);
  assert.equal(nav.clampWidth(900, 1000), 400);
  assert.equal(nav.clampWidth(300, 400), 200);
});

test('heading links replace any hash and encode the section id', () => {
  const { _navigation: nav } = load();
  assert.equal(nav.headingUrl('file:///notes/page.html#old', 'basis'), 'file:///notes/page.html#basis');
  assert.equal(nav.headingUrl('file:///notes/page.html?x=1', 'a b#c'), 'file:///notes/page.html?x=1#a%20b%23c');
});
