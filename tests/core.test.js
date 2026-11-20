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
    glossaryPage: null,
    roles: {},
    roleTips: {},
    tags: { glossary: {}, classes: {}, labels: {} },
    glossary: {},
    terms: {},
    macros: {},
    bibliography: {},
    refs: {},
    search: null
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

test('copyText uses the clipboard and falls back to execCommand when it is refused', async () => {
  const copied = [];
  let allowFallback = true;
  const area = { style: {}, setAttribute() {}, select() { copied.push('fallback:' + this.value); }, remove() {} };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    createElement: () => area,
    body: { appendChild() {} },
    execCommand: () => allowFallback
  };
  const clipboard = { writeText: (text) => (text === 'refused' ? Promise.reject(new Error('no')) : (copied.push(text), Promise.resolve())) };
  const window = { navigator: { clipboard }, isSecureContext: true };
  vm.runInNewContext(source, { window, document, URL, console: { warn() {} } });
  const { DocForm } = window;
  await DocForm.copyText('plain');
  await DocForm.copyText('refused');
  allowFallback = false;
  await assert.rejects(DocForm.copyText('refused'));
  assert.deepEqual(copied, ['plain', 'fallback:refused', 'fallback:refused']);
});

test('bibliography, refs, and the search index path are read from the manifest', () => {
  const { DocForm } = load();
  const site = DocForm.normalizeSite({
    bibliography: { a: 'Entry' },
    refs: { equations: 'all' },
    search: 'search-index.js'
  }, 'file:///repo/docs/site.js');
  assert.deepEqual(plain(site.bibliography), { a: 'Entry' });
  assert.deepEqual(plain(site.refs), { equations: 'all' });
  assert.equal(site.search, 'file:///repo/docs/search-index.js');
});

test('max-width attributes accept positive lengths and percentages only', () => {
  const { DocForm } = load();
  const parse = DocForm._maxWidth;
  assert.equal(parse(' 720PX '), '720px');
  assert.equal(parse('80%'), '80%');
  assert.equal(parse('.5em'), '0.5em');
  assert.equal(parse('42rem'), '42rem');
  for (const bad of [null, '', '0px', '720', '-10px', 'calc(100% - 2em)', '10 px', 'wide']) assert.equal(parse(bad), null);
});

test('tag classes own one shape each, the circle stays with glossary tags, and a label has one class', () => {
  const { DocForm, warnings } = load();
  const tags = DocForm._normalizeTags({
    glossary: { Basics: 'Everyday words.', ' Web ': { tip: 'Web words.', color: 'blue' }, Empty: '', Odd: { tip: 'x', role: 'nope' } },
    classes: {
      availability: { shape: 'Triangle', label: 'Availability', tags: ['On by default', 'on-request', 'basics'] },
      clash: { shape: 'triangle' },
      round: { shape: 'circle' },
      glossary: { shape: 'star' },
      odd: { shape: 'hexagon' },
      swatch: { shape: 'square' }
    }
  }, {});
  assert.deepEqual(plain(tags), {
    glossary: {
      basics: { label: 'Basics', tip: 'Everyday words.', color: null, role: null },
      web: { label: 'Web', tip: 'Web words.', color: 'blue', role: null },
      odd: { label: 'Odd', tip: 'x', color: null, role: null }
    },
    classes: {
      availability: { shape: 'triangle', label: 'Availability', tags: ['on by default', 'on request'] },
      swatch: { shape: 'square', label: 'swatch', tags: [] }
    },
    labels: { basics: 'glossary', web: 'glossary', odd: 'glossary', 'on by default': 'availability', 'on request': 'availability' }
  });
  const text = warnings.join('\n');
  for (const re of [/"Empty" needs a nonempty tip/, /unknown role "nope"/, /"basics" is listed in both "glossary" and "availability"/,
    /"clash": class "availability" already uses the triangle/, /"round": the circle is reserved/, /"glossary" is reserved/,
    /"odd": its shape must be one of triangle, star, square, heart, spades, diamond, clubs/]) assert.match(text, re);
  assert.deepEqual(plain(DocForm.tagKeys(' Basics, web ,, BASICS ')), ['basics', 'web']);
  assert.deepEqual(plain(DocForm.tagKeys(['Web', 3])), ['web']);
});
