const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');

function load(files) {
  const warnings = [];
  const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
  context.window = context;
  vm.runInContext(read('core.js'), context);
  files.forEach((file) => vm.runInContext(read(file), context));
  return { OffPrint: context.OffPrint, warnings };
}

const json = (value) => JSON.parse(JSON.stringify(value));

test('figures, tables, and equations are numbered separately in page order', () => {
  const { OffPrint } = load(['refs.js']);
  const items = ['figure', 'equation', 'figure', 'table', 'equation'].map((kind) => ({ kind }));
  assert.deepEqual(json(OffPrint._references.numberItems(items)).map((item) => item.label), [
    'Figure 1', 'Equation (1)', 'Figure 2', 'Table 1', 'Equation (2)'
  ]);
});

test('citations number by first use, skip repeats, and report unknown keys once', () => {
  const { OffPrint } = load(['refs.js']);
  const bib = { a: 'A', b: 'B', c: 'C' };
  const lists = [' b, a ', 'zz a', 'c;b', 'zz'].map(OffPrint._citations.citeKeys);
  const result = OffPrint._references.assignNumbers(lists, bib);
  assert.deepEqual(json(result), { numbers: { b: 1, a: 2, c: 3 }, order: ['b', 'a', 'c'], missing: ['zz'] });
});

test('entries format authors, venue details, and links, and strings pass through', () => {
  const { OffPrint } = load(['refs.js']);
  const { citationText, formatEntry } = OffPrint._citations;
  const { joinAuthors } = OffPrint._references;
  assert.equal(citationText({
    author: 'A. Vaswani and N. Shazeer and N. Parmar',
    title: 'Attention is all you need',
    booktitle: 'NeurIPS',
    pages: '5998-6008',
    year: 2017
  }), 'A. Vaswani, N. Shazeer, and N. Parmar. Attention is all you need. NeurIPS, pp. 5998-6008, 2017.');
  assert.equal(citationText({ authors: ['Ada Lovelace'], title: 'Why?', year: 1843 }), 'Ada Lovelace. Why? 1843.');
  assert.equal(citationText('Preformatted entry.'), 'Preformatted entry.');
  assert.equal(formatEntry({ title: 'T', doi: '10.1/x' }).url, 'https://doi.org/10.1/x');
  assert.equal(joinAuthors(['A', 'B']), 'A and B');
  assert.equal(joinAuthors(['1', '2', '3', '4', '5', '6', '7']), '1, 2, 3, 4, 5, 6, et al.');
});

test('sidenotes go to the margin only when the column leaves room beside it', () => {
  const { OffPrint } = load(['notes.js']);
  const { fits, width, gap } = OffPrint._sidenotes;
  // A 1920px window with the sidebar shown leaves about 390px right of the column.
  assert.equal(fits(1920, 1530, width, gap, 16), true);
  assert.equal(fits(1440, 1290, width, gap, 16), false);
  assert.equal(fits(1000, 1000 - (width + gap + 16), width, gap, 16), true);
});
