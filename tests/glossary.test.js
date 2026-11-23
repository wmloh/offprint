const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');
const json = (value) => JSON.parse(JSON.stringify(value));

function load() {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  ['core.js', 'tooltip.js', 'search.js', 'glossary.js'].forEach((file) => vm.runInContext(read(file), context));
  return { OffPrint: context.OffPrint, context, warnings };
}

// A minimal element tree for the extractor: simple selectors only (tag, .class, [attr], [attr="v"]); anything with a
// combinator or pseudo-class never matches.
function el(tag, attrs, children) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attrs: Object.assign({}, attrs),
    children: (children || []).map((c) => (typeof c === 'string' ? { nodeType: 3, nodeValue: c } : c)),
    get id() { return this.attrs.id || ''; },
    set id(value) { this.attrs.id = value; },
    get className() { return this.attrs.class || ''; },
    set className(value) { this.attrs.class = value; },
    classList: { add: (name) => { node.className = `${node.className} ${name}`.trim(); } },
    addEventListener() {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    setAttribute(name, value) { this.attrs[name] = value; },
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
      return child;
    },
    get textContent() {
      return this.children.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
    },
    set textContent(value) {
      this.children = [];
      if (value) this.appendChild({ nodeType: 3, nodeValue: value });
    },
    matches(selector) { return selector.split(',').some((part) => simple(this, part.trim())); },
    closest(selector) {
      for (let n = this; n; n = n.parent) if (n.matches(selector)) return n;
      return null;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (n) => n.children.forEach((c) => {
        if (c.nodeType !== 1) return;
        if (c.matches(selector)) out.push(c);
        walk(c);
      });
      walk(this);
      return out;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
  node.children.forEach((c) => { c.parent = node; });
  return node;
}

function simple(node, part) {
  if (!part || /[\s:>+~]/.test(part.replace(/"[^"]*"/g, '""'))) return false;
  const re = /^([a-z0-9]+)?((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i;
  const m = part.match(re);
  if (!m) return false;
  if (m[1] && m[1].toUpperCase() !== node.tagName) return false;
  const bits = m[2].match(/\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || [];
  return bits.every((bit) => {
    if (bit[0] === '.') return (node.attrs.class || '').split(/\s+/).indexOf(bit.slice(1)) >= 0;
    const [, name, value] = bit.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    return node.hasAttribute(name) && (value === undefined || node.attrs[name] === value);
  });
}

function doc(body) {
  const root = el('body', {}, [body]);
  return {
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createTreeWalker(start, show, filter) {
      const list = [];
      const visit = (n) => n.children.forEach((c) => {
        if (c.nodeType === 3) return list.push(c);
        const verdict = filter.acceptNode(c);
        if (verdict === 1) list.push(c);
        if (verdict !== 2) visit(c);
      });
      visit(start);
      let i = -1;
      return { get currentNode() { return list[i]; }, nextNode: () => ++i < list.length };
    }
  };
}

test('the extractor records tips and term uses once per section, with their section anchors', () => {
  const { OffPrint } = load();
  const page = el('main', { class: 'op-page' }, [
    el('h1', {}, ['Vectors']),
    el('p', {}, ['A ', el('span', { 'data-op-term': '' }, ['Vector']), ' has a ',
      el('span', { 'data-op-tip': 'Its length.', 'data-op-tip-tags': 'Geometry, geometry,Size' }, ['norm']), '.']),
    el('p', {}, [el('span', { class: 'op-tag', 'data-op-tip': 'A tag explains itself.' }, ['Draft'])]),
    el('h2', {}, ['Dot  product']),
    el('p', {}, [
      el('span', { 'data-op-term': 'dot-product' }, ['dot products']), ' and ',
      el('span', { 'data-op-term': 'dot product' }, ['dot products']), ' and ',
      el('span', { 'data-op-tip': ' Its   length. ' }, ['norm'])
    ]),
    el('nav', {}, [el('span', { 'data-op-tip': 'Skipped' }, ['hidden'])]),
    el('p', {}, [el('span', { 'data-op-tip': '' }, ['empty']), el('span', { 'data-op-term': '' }, [' '])])
  ]);
  const data = OffPrint._search.extract(doc(page));
  assert.deepEqual(json(data.terms), [
    { text: 'Vector', term: 'vector', section: '' },
    { text: 'norm', tip: 'Its length.', tags: ['geometry', 'size'], section: '' },
    { text: 'dot products', term: 'dot product', section: 'dot-product' },
    { text: 'norm', tip: 'Its length.', tags: [], section: 'dot-product' }
  ]);
  assert.equal(data.sections[1].id, 'dot-product');
});

test('the extractor exports an h1/h2 outline while preserving existing search anchors', () => {
  const { OffPrint } = load();
  const page = el('main', { class: 'op-page' }, [
    el('h1', {}, ['Vectors']),
    el('h2', {}, ['Vectors']),
    el('h3', {}, ['Dot product']),
    el('h2', { 'data-op-no-outline': '' }, ['Omitted']),
    el('h1', {}, ['Matrices'])
  ]);
  const data = OffPrint._search.extract(doc(page));
  assert.deepEqual(json(data.outline), [
    { id: 'vectors-2', title: 'Vectors', level: 1 },
    { id: 'vectors', title: 'Vectors', level: 2 },
    { id: 'matrices', title: 'Matrices', level: 1 }
  ]);
  assert.deepEqual(json(data.sections.map((section) => section.id)), ['', 'vectors', 'dot-product']);
});

const pages = [
  {
    href: 'file:///n/vectors.html', title: 'Vectors',
    sections: [{ id: '', title: 'Vectors' }, { id: 'length', title: 'Length' }, { id: 'angles', title: 'Angles' }],
    terms: [
      { text: 'vector', term: 'vector', section: '' },
      { text: 'Norm', tip: 'The length of a vector.', tags: [], section: 'length' },
      { text: 'Vector', tip: 'An arrow   from the origin.', tags: [], section: 'length' },
      { text: 'norm', tip: 'the length of a vector.', tags: [], section: 'angles' },
      { text: 'vectors', term: 'vectors', section: 'angles' },
      { text: 'Vector', term: 'vector', section: 'angles' }
    ]
  },
  {
    href: 'file:///n/matrices.html#top', title: 'Matrices',
    sections: [{ id: '', title: 'Matrices' }],
    terms: [
      { text: 'norm', tip: 'A size measure.', tags: [], section: '' },
      { text: 'Vector', tip: 'A list of numbers, such as $(2, 1)$.', tags: [], section: '' },
      { text: 'Vector', tip: 'an arrow from the origin.', tags: [], section: '' },
      { text: 'Ω-limit', tip: 'Where orbits end.', tags: [], section: '' },
      { text: '2-norm', tip: 'Euclidean length.', tags: [], section: '' }
    ]
  }
];

test('merging keeps manifest definitions first, folds inline tips by underlined text, and lists variants', () => {
  const { OffPrint } = load();
  const terms = OffPrint._tooltips.glossary({
    vector: 'A list of numbers, such as $(2, 1)$.',
    basis: { title: 'Basis', text: 'Independent spanning vectors.', more: '<p>More.</p>' }
  });
  const entries = OffPrint._glossary.merge(terms, pages);
  assert.deepEqual(json(entries.map((e) => [e.title, e.manifest])),
    [['Basis', true], ['Norm', false], ['vector', true], ['Ω-limit', false], ['2-norm', false]]);
  const vector = entries.find((e) => e.key === 'vector');
  assert.equal(vector.text, 'A list of numbers, such as $(2, 1)$.');
  assert.deepEqual(json(vector.variants), [{
    text: 'An arrow from the origin.',
    tags: [],
    pages: [{ title: 'Vectors', href: 'file:///n/vectors.html' }, { title: 'Matrices', href: 'file:///n/matrices.html' }]
  }]);
  const norm = entries.find((e) => e.key === 'norm');
  assert.equal(norm.text, 'The length of a vector.');
  assert.deepEqual(json(norm.variants), [{ text: 'A size measure.', tags: [], pages: [{ title: 'Matrices', href: 'file:///n/matrices.html' }] }]);
  assert.equal(entries.find((e) => e.key === 'basis').more, '<p>More.</p>');
});

test('back-links group uses by page with section links, and unknown term names add nothing', () => {
  const { OffPrint } = load();
  const entries = OffPrint._glossary.merge(OffPrint._tooltips.glossary({ vector: 'A list.' }), pages);
  assert.deepEqual(json(entries.find((e) => e.key === 'vector').uses), [
    {
      title: 'Vectors', href: 'file:///n/vectors.html', intro: true,
      sections: [
        { id: 'length', title: 'Length', href: 'file:///n/vectors.html#length' },
        { id: 'angles', title: 'Angles', href: 'file:///n/vectors.html#angles' }
      ]
    },
    { title: 'Matrices', href: 'file:///n/matrices.html', intro: true, sections: [] }
  ]);
  assert.equal(entries.some((e) => e.key === 'vectors'), false);
});

test('Used on lists heading links directly and includes the page title for introductory uses', () => {
  const { OffPrint, context } = load();
  const holder = el('div');
  context.document = {
    body: el('body'),
    querySelectorAll: () => [],
    createElement: (tag) => el(tag),
    createTextNode: (value) => ({ nodeType: 3, nodeValue: value })
  };
  OffPrint._glossary.render(holder, OffPrint._glossary.merge({}, [
    {
      title: 'Vectors', href: 'file:///n/vectors.html',
      sections: [{ id: 'length', title: 'Length' }, { id: 'angles', title: 'Angles' }],
      terms: ['length', 'angles'].map((section) => ({ section, text: 'norm', tip: 'A size measure.', tags: [] }))
    },
    { title: 'Matrices', href: 'file:///n/matrices.html', terms: [{ text: 'norm', tip: 'A size measure.', tags: [] }] }
  ]));
  const usedOn = holder.querySelector('.op-glossary-uses');
  assert.equal(usedOn.textContent, 'Used on Length · Angles · Matrices');
  assert.deepEqual(usedOn.querySelectorAll('a').map((a) => [a.textContent, a.href]), [
    ['Length', 'file:///n/vectors.html#length'],
    ['Angles', 'file:///n/vectors.html#angles'],
    ['Matrices', 'file:///n/matrices.html']
  ]);
});

test('letters group accented and non-Latin titles, put symbols last, and fill the jump bar', () => {
  const { OffPrint } = load();
  const { letter, groups, jumps, merge } = OffPrint._glossary;
  assert.equal(letter('élan'), 'E');
  assert.equal(letter('$k$-means'), '#');
  assert.equal(letter('  ω'), 'Ω');
  const list = groups(merge(OffPrint._tooltips.glossary({ zeta: 'z', Alpha: 'a', 'élan': 'e', apex: 'x', '3-cycle': 'c', ω: 'o' }), null));
  assert.deepEqual(json(list.map((g) => [g.letter, g.entries.map((e) => e.title)])),
    [['A', ['Alpha', 'apex']], ['E', ['élan']], ['Z', ['zeta']], ['Ω', ['ω']], ['#', ['3-cycle']]]);
  const bar = jumps(list);
  assert.equal(bar.length, 28);
  assert.deepEqual(json(bar.filter((j) => j.present).map((j) => j.letter)), ['A', 'E', 'Z', 'Ω', '#']);
});

test('without an index, or with an index built before glossary data, only manifest entries show with a notice', () => {
  const { OffPrint } = load();
  const terms = OffPrint._tooltips.glossary({ vector: 'A list.' });
  const { merge, notice } = OffPrint._glossary;
  assert.deepEqual(json(merge(terms, null).map((e) => [e.title, e.uses.length])), [['vector', 0]]);
  assert.match(notice(null), /no search index/);
  assert.match(notice([{ title: 'Old', href: 'file:///a.html', sections: [], terms: null }]), /no glossary data/);
  assert.equal(notice(pages), null);
  const legacy = [{
    title: 'Old', href: 'file:///a.html', sections: [],
    terms: [{ text: 'Blue', tip: 'A colour sample.', section: '' }, { text: 'vector', term: 'vector', section: '' }]
  }];
  assert.match(notice(legacy), /built before glossary tags/);
  assert.deepEqual(json(merge(terms, legacy).map((e) => [e.title, e.uses.length])), [['vector', 1]]);
  assert.equal(notice([]), null);
});

test('indexed pages pass their recorded terms on, or null for an older index', () => {
  const { OffPrint, context } = load();
  context.OffPrint._site = { provided: true, base: 'file:///n/' };
  context.OffPrintSearch = { pages: [{ path: 'a.html', title: 'A', terms: [{ text: 'x', tip: 'y', tags: [], section: '' }] }, { path: 'b.html', title: 'B' }] };
  let result;
  OffPrint._search.pages((list) => { result = list; });
  assert.deepEqual(json(result.map((p) => p.terms)), [[{ text: 'x', tip: 'y', tags: [], section: '' }], null]);
});

test('the glossaryPage setting adds the page last in the tree unless it is already listed', () => {
  const { OffPrint, warnings } = load();
  const added = OffPrint._normalizeSite({ pages: ['index.html'], glossaryPage: 'terms.html' }, 'file:///n/site.js');
  assert.deepEqual(json(added.pages.map((p) => [p.title, p.href])),
    [['index.html', 'file:///n/index.html'], ['Glossary', 'file:///n/terms.html']]);
  assert.equal(added.order.length, 2);
  assert.equal(added.glossaryPage, 'file:///n/terms.html');
  const named = OffPrint._normalizeSite({ glossaryPage: { path: 'g.html', title: 'Terms' } }, 'file:///n/site.js');
  assert.equal(named.pages[0].title, 'Terms');
  const listed = OffPrint._normalizeSite({
    pages: [{ title: 'Ref', pages: [{ title: 'Words', path: 'terms.html' }] }],
    glossaryPage: 'terms.html#top'
  }, 'file:///n/site.js');
  assert.equal(listed.order.length, 1);
  assert.equal(listed.pages.length, 1);
  assert.equal(OffPrint._normalizeSite({ glossaryPage: 5 }, 'file:///n/site.js').glossaryPage, null);
  assert.equal(warnings.length, 1);
});

test('entry tags are a union with manifest tags first, variants keep their own, and the filter matches any tag', () => {
  const { OffPrint } = load();
  const registry = { glossary: { maths: {}, geometry: {}, computing: {} } };
  const terms = OffPrint._tooltips.glossary({ norm: { text: 'A length.', tags: ['Maths'] }, rank: 'Independent columns.' });
  const entries = OffPrint._glossary.merge(terms, [{
    href: 'file:///n/a.html', title: 'A', sections: [],
    terms: [
      { text: 'norm', tip: 'a length.', tags: ['geometry', 'maths'], section: '' },
      { text: 'norm', tip: 'A vector size.', tags: ['Computing'], section: '' }
    ]
  }]);
  const norm = entries.find((e) => e.key === 'norm');
  assert.deepEqual(json(norm.tags), ['maths', 'geometry', 'computing']);
  assert.deepEqual(json(norm.variants.map((v) => v.tags)), [['computing']]);
  const { matches, filterTags } = OffPrint._glossary;
  const rank = entries.find((e) => e.key === 'rank');
  assert.deepEqual(json(filterTags(entries, registry)),
    [{ key: 'maths', count: 1 }, { key: 'geometry', count: 1 }, { key: 'computing', count: 1 }, { key: '', count: 1 }]);
  assert.equal(matches(norm, new Set()), true);
  assert.equal(matches(norm, new Set(['computing', 'other'])), true);
  assert.equal(matches(norm, new Set([''])), false);
  assert.equal(matches(rank, new Set([''])), true);
  assert.equal(matches(rank, new Set(['maths'])), false);
});
