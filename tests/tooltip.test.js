const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');

function load() {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  vm.runInContext(read('core.js'), context);
  vm.runInContext(read('tooltip.js'), context);
  return { tip: context.OffPrint._tooltips, warnings };
}

const json = (value) => JSON.parse(JSON.stringify(value));
const term = (attr, text = '') => ({ textContent: text, getAttribute: () => attr });

test('term keys ignore case, spacing, hyphens, and underscores', () => {
  const { tip } = load();
  for (const name of ['Linear map', ' linear-map ', 'LINEAR_MAP', 'linear  -  map']) {
    assert.equal(tip.termKey(name), 'linear map');
  }
});

test('glossary keeps titles, accepts objects, and warns about bad or colliding entries', () => {
  const { tip, warnings } = load();
  const terms = tip.glossary({
    'Dot product': 'Sum of products $a \\cdot b$.',
    span: { title: 'Span', text: 'All linear combinations.' },
    'dot-product': 'Duplicate.',
    broken: 42,
    noText: { title: 'X' }
  });
  assert.deepEqual(json(terms), {
    'dot product': { title: 'Dot product', text: 'Sum of products $a \\cdot b$.', more: '', tags: [] },
    span: { title: 'Span', text: 'All linear combinations.', more: '', tags: [] }
  });
  assert.equal(warnings.length, 3);
  assert.match(warnings.join('\n'), /collide/);
});

test('lookup falls back to element text and warns once per missing term', () => {
  const { tip, warnings } = load();
  const terms = tip.glossary({ basis: 'A spanning independent set.' });
  assert.equal(tip.lookup(terms, term('', ' Basis ')).title, 'basis');
  assert.equal(tip.lookup(terms, term('kernel')), null);
  assert.equal(tip.lookup(terms, term('Kernel')), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unknown glossary term "kernel"/);
});

test('tooltips flip above when there is no room below and stay inside the viewport', () => {
  const { tip } = load();
  const view = { width: 400, height: 300 };
  const size = { width: 200, height: 60 };
  assert.deepEqual(json(tip.place({ top: 50, bottom: 70, left: 10, width: 40 }, size, view)),
    { top: 78, left: 8, side: 'below' });
  assert.deepEqual(json(tip.place({ top: 250, bottom: 270, left: 380, width: 20 }, size, view)),
    { top: 182, left: 192, side: 'above' });
});

// Minimal element stand-ins: closest() understands tag, .class, [attr], and [attr="value"] in comma lists.
function el(tag, attrs = {}, parent = null) {
  const classes = (attrs.class || '').split(/\s+/).filter(Boolean);
  const matches = (selector) => selector.split(',').some((part) => {
    const one = part.trim();
    const attr = one.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[2] === undefined ? attr[1] in attrs : attrs[attr[1]] === attr[2];
    if (one[0] === '.') return classes.includes(one.slice(1));
    return one === tag;
  });
  const node = {
    parent,
    matches,
    closest(selector) {
      for (let at = node; at; at = at.parent) if (at.matches(selector)) return at;
      return null;
    },
    contains(other) {
      for (let at = other; at; at = at.parent) if (at === node) return true;
      return false;
    }
  };
  return node;
}
const text = (parent) => ({ parentElement: parent });

test('glossary accepts extended text and ignores a non-text one', () => {
  const { tip, warnings } = load();
  const terms = tip.glossary({
    basis: { text: 'Short.', more: '  <p>Long with $x$.</p> ' },
    span: { text: 'Short.', more: 7 }
  });
  assert.equal(terms.basis.more, '<p>Long with $x$.</p>');
  assert.equal(terms.span.more, '');
  assert.equal(warnings.length, 1);
});

test('extended text comes from data-op-more-id, inline data-op-more, or the glossary', () => {
  const { tip, warnings } = load();
  const entry = { title: 'Basis', text: 'Short.', more: '<p>Glossary.</p>' };
  const doc = { getElementById: (id) => (id === 'basis-more' ? { nodeType: 1, innerHTML: '\n<p>Template.</p>\n' } : null) };
  const node = (attrs) => ({ ownerDocument: doc, getAttribute: (name) => (name in attrs ? attrs[name] : null) });
  assert.equal(tip.extended(entry, node({})), '<p>Glossary.</p>');
  assert.equal(tip.extended(entry, node({ 'data-op-more': 'Inline <b>override</b>' })), 'Inline <b>override</b>');
  assert.equal(tip.extended(entry, node({ 'data-op-more-id': 'basis-more', 'data-op-more': 'Ignored' })), '<p>Template.</p>');
  assert.equal(tip.extended(entry, node({ 'data-op-more': '#basis-more' })), '#basis-more');
  assert.equal(tip.extended(entry, node({ 'data-op-more': '' })), '');
  assert.equal(tip.extended({ title: 'X', text: 'Y', more: '' }, node({})), '');
  assert.equal(tip.extended(entry, node({ 'data-op-more-id': 'missing' })), '<p>Glossary.</p>');
  assert.equal(warnings.length, 1);
});

test('hold time comes from the term, then the manifest, else 600ms', () => {
  const { tip, warnings } = load();
  const node = (value) => ({ getAttribute: () => value });
  assert.equal(tip.holdTime(node(null), { terms: {} }), 600);
  assert.equal(tip.holdTime(node(null), { terms: { hold: 900 } }), 900);
  assert.equal(tip.holdTime(node('300'), { terms: { hold: 900 } }), 300);
  assert.equal(tip.holdTime(node('soon'), { terms: {} }), 600);
  assert.equal(warnings.length, 1);
});

test('term matching is whole-word and case-insensitive, preferring longer terms', () => {
  const { tip } = load();
  const re = tip.matcher(['map', 'linear map', 'vector', 'vector space', 'basis']);
  const keys = (value) => JSON.parse(JSON.stringify(tip.findTerms(value, re)));
  assert.deepEqual(keys('A Linear-map sends a vector.'), [
    { start: 2, end: 12, key: 'linear map' },
    { start: 21, end: 27, key: 'vector' }
  ]);
  assert.deepEqual(keys('vectors, eigenvector, mapped, vector_x, map2'), []);
  assert.deepEqual(keys('(Vector), map.').map((hit) => hit.key), ['vector', 'map']);
  assert.deepEqual(keys('basis vector space').map((hit) => hit.key), ['basis', 'vector space']);
  assert.deepEqual(keys('vector  space').map((hit) => hit.key), ['vector space']);
  assert.equal(tip.matcher([]), null);
  assert.deepEqual(json(tip.findTerms('vector', null)), []);
});

test('term keys with regex characters match literally', () => {
  const { tip } = load();
  const re = tip.matcher(['c++', 'a.b']);
  assert.deepEqual(json(tip.findTerms('use c++ not axb or a.b', re).map((hit) => hit.key)), ['c++', 'a.b']);
});

test('auto-linking only enters paragraphs and list items outside skipped contexts', () => {
  const { tip } = load();
  const page = el('main', { class: 'op-page' });
  const p = el('p', {}, page);
  const li = el('li', {}, el('ul', {}, page));
  assert.equal(tip.linkable(text(p), page), true);
  assert.equal(tip.linkable(text(el('em', {}, li)), page), true);
  assert.equal(tip.linkable(text(el('h2', {}, page)), page), false);
  assert.equal(tip.linkable(text(el('figcaption', {}, page)), page), false);
  const skipped = [
    ['code'], ['a', { href: '#' }], ['span', { class: 'op-math' }], ['span', { class: 'katex' }],
    ['span', { 'data-op-term': '' }], ['span', { 'data-op-tip': 'x' }], ['span', { 'data-op-template': '{{a}}' }],
    ['span', { 'data-op-no-autolink': '' }], ['span', { class: 'op-tag' }], ['div', { 'data-op-autolink': 'false' }]
  ];
  for (const [tag, attrs] of skipped) {
    assert.equal(tip.linkable(text(el(tag, attrs, p)), page), false, tag + ' ' + JSON.stringify(attrs));
  }
  const outside = el('p', {}, el('aside'));
  assert.equal(tip.linkable(text(outside), page), false);
  assert.equal(tip.linkable({ parentElement: null }, page), false);
});

test('tags whose whole label is a glossary term become its anchor unless they carry their own tip', () => {
  const { tip } = load();
  const keys = new Set(['on request']);
  const tag = (label, attrs = {}, { inside = null, nested = false } = {}) => ({
    textContent: label,
    hasAttribute: (name) => name in attrs,
    closest: () => inside,
    querySelector: () => (nested ? {} : null)
  });
  assert.equal(tip.tagTerm(tag(' On-request '), keys), 'on request');
  assert.equal(tip.tagTerm(tag('On request soon'), keys), null);
  assert.equal(tip.tagTerm(tag('On request', { 'data-op-tip': 'x' }), keys), null);
  assert.equal(tip.tagTerm(tag('On request', { 'data-op-term': 'other' }), keys), null);
  assert.equal(tip.tagTerm(tag('On request', {}, { nested: true }), keys), null);
  assert.equal(tip.tagTerm(tag('On request', {}, { inside: {} }), keys), null);
});

test('every tag gets a tooltip: own tip or term kept, role tip inherited, otherwise a warned fallback', () => {
  const { tip, warnings } = load();
  const tag = (label, attrs = {}, nested = false) => ({
    textContent: label,
    attrs: { ...attrs },
    classes: [],
    classList: { add(name) { this.owner.classes.push(name); } },
    hasAttribute(name) { return name in this.attrs; },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector: () => (nested ? {} : null)
  });
  const tags = [
    tag('Draft', { 'data-op-tip': 'Not final.' }),
    tag('Basis', { 'data-op-term': 'basis' }),
    tag('Wrapped', {}, true),
    tag('On by default', { 'data-op-role': 'Default' }),
    tag('Try it', { 'data-op-role': 'try' }),
    tag(' New  label ')
  ];
  tags.forEach((el) => { el.classList.owner = el; });
  const scope = { querySelectorAll: () => tags };
  const missing = tip.tipTags(scope, { roleTips: { default: 'On without any setup.' } });
  assert.deepEqual(tags.map((el) => el.attrs['data-op-tip'] ?? null),
    ['Not final.', null, null, 'On without any setup.', 'Colour role: try', 'New label']);
  assert.deepEqual([...missing], [tags[4], tags[5]]);
  assert.ok(missing.every((el) => el.classes.includes('op-tag-untipped')));
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Tag "Try it" has no tooltip.*options\.roles\.tips\["try"\]/);
});

test('glossary entries keep known tags, drop unknown ones, and one warning lists untagged entries', () => {
  const { tip, warnings } = load();
  const registry = { glossary: { web: { label: 'Web' }, basics: { label: 'Basics' } } };
  const terms = tip.glossary({
    browser: { text: 'Shows pages.', tags: ['Web', 'Basics', 'web'] },
    file: { text: 'Saved item.', tags: ['Storage'] },
    folder: 'Holds files.'
  }, registry);
  assert.deepEqual(json([terms.browser.tags, terms.file.tags, terms.folder.tags]), [['web', 'basics'], [], []]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Glossary entry "file" names unknown glossary tag "storage"/);
  assert.match(warnings[1], /^\[offprint\] 2 glossary entries have no tags.*: file, folder\.$/);
});

test('tags take their class shape from data-op-tag-class or a listed label, else a warned dashed fallback', () => {
  const { tip, warnings } = load();
  const tag = (label, attrs = {}, cls = []) => {
    const node = {
      textContent: label,
      attrs: { ...attrs },
      classes: new Set(cls),
      getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      closest: () => null
    };
    node.classList = {
      contains: (name) => node.classes.has(name),
      toggle: (name, on) => (on ? node.classes.add(name) : node.classes.delete(name))
    };
    return node;
  };
  const tags = [
    tag('On request'),
    tag('Blue', { 'data-op-tag-class': 'Swatch' }),
    tag('Basics'),
    tag('Draft'),
    tag('Web', { 'data-op-tag-class': 'glossary' }),
    tag('Web', {}, ['op-tag-glossary'])
  ];
  const site = {
    tags: {
      glossary: { basics: {} },
      classes: { availability: { shape: 'triangle' }, swatch: { shape: 'square' } },
      labels: { 'on request': 'availability', basics: 'glossary' }
    }
  };
  const missing = tip.classifyTags({ querySelectorAll: () => tags }, site);
  assert.deepEqual(tags.map((el) => el.attrs['data-op-shape'] ?? null), ['triangle', 'square', 'circle', 'none', 'none', null]);
  assert.deepEqual([...missing], [tags[3], tags[4]]);
  assert.ok(missing.every((el) => el.classes.has('op-tag-unclassified')));
  assert.match(warnings.join('\n'), /Tag "Web" names unknown tag class "glossary"; glossary tags are matched by their label/);
  assert.match(warnings.join('\n'), /Tag "Draft" has no tag class/);
});
