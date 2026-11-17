const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docform/js/core.js'), 'utf8');

function load() {
  const warnings = [];
  const window = {};
  vm.runInNewContext(source, {
    window,
    URL,
    console: { warn: (message) => warnings.push(message) }
  });
  return { DocForm: window.DocForm, warnings };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('missing manifest normalizes to empty defaults', () => {
  const { DocForm, warnings } = load();
  const site = DocForm.normalizeSite(undefined, 'file:///notes/index.html');
  assert.deepEqual(plain(site), {
    provided: false,
    base: 'file:///notes/index.html',
    title: '',
    pages: [],
    order: [],
    roles: {},
    glossary: {},
    macros: {}
  });
  assert.equal(warnings.length, 0);
});

test('page paths resolve against the manifest and keep reading order', () => {
  const { DocForm, warnings } = load();
  const site = DocForm.normalizeSite({
    title: 'Notes',
    pages: [
      'index.html',
      { title: 'Basics', path: 'basics/index.html', collapsed: true, pages: [
        { title: 'Vectors', path: 'basics/vectors.html' }
      ] },
      { title: 'More', pages: [{ title: 'Other', path: '../other/page.html' }] },
      { title: 'External', path: 'https://example.com/a.html' },
      { title: 'Broken' }
    ]
  }, 'file:///repo/docs/site.js');

  assert.equal(site.provided, true);
  assert.equal(site.pages.length, 4);
  assert.equal(site.pages[0].title, 'index.html');
  assert.equal(site.pages[1].collapsed, true);
  assert.equal(site.pages[2].href, null);
  assert.deepEqual(plain(site.order.map((page) => page.href)), [
    'file:///repo/docs/index.html',
    'file:///repo/docs/basics/index.html',
    'file:///repo/docs/basics/vectors.html',
    'file:///repo/other/page.html',
    'https://example.com/a.html'
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /pages\[4\]/);
});

test('roles are lowercased and invalid entries warn once', () => {
  const { DocForm, warnings } = load();
  const raw = { roles: { Theorem: 'Purple', bad: 'teal', 'no spaces': 'red' } };
  const site = DocForm.normalizeSite(raw, 'file:///x/site.js');
  DocForm.normalizeSite(raw, 'file:///x/site.js');
  assert.deepEqual(plain(site.roles), { theorem: 'purple' });
  assert.equal(warnings.length, 3);
});

test('unknown role lookups warn once and return null', () => {
  const { DocForm, warnings } = load();
  const site = DocForm.normalizeSite({ roles: { proof: 'gray' } }, 'file:///x/site.js');
  assert.equal(DocForm.roleColor('Proof', site), 'gray');
  assert.equal(DocForm.roleColor('lemma', site), null);
  assert.equal(DocForm.roleColor('lemma', site), null);
  assert.equal(warnings.length, 1);
});

test('non-object manifest fields are ignored with a warning', () => {
  const { DocForm, warnings } = load();
  const site = DocForm.normalizeSite({ pages: 'index.html', glossary: [], macros: null }, 'file:///x/site.js');
  assert.deepEqual(plain(site.pages), []);
  assert.deepEqual(plain(site.glossary), {});
  assert.deepEqual(plain(site.macros), {});
  assert.equal(warnings.length, 2);
});
