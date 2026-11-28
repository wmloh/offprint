const test = require('node:test');
const assert = require('node:assert/strict');
const { descendants, element, page } = require('../support/offline-page');

test('only current source and view attributes register and render data', async () => {
  const p = page({ config: { profile: 'none', features: { 'data-view': true, dropzone: true } } });
  const oldSource = element('script');
  oldSource.setAttribute('data-op-data', 'old');
  oldSource.setAttribute('type', 'text/csv');
  oldSource.textContent = 'a,b\n1,2';
  const source = element('script');
  source.setAttribute('data-op-source', 'current');
  source.setAttribute('data-op-type', 'json');
  source.setAttribute('type', 'text/csv');
  source.textContent = 'a,b\n1,2';
  const oldView = element('div');
  oldView.setAttribute('data-op-data', 'current');
  oldView.setAttribute('data-op-view', 'code');
  oldView.textContent = 'Old fallback';
  const view = element('div');
  view.setAttribute('data-op-source', 'current');
  view.setAttribute('data-op-data-view', 'code');
  view.setAttribute('data-op-view', 'tree');
  view.setAttribute('data-op-type', 'json');
  const bare = element('div');
  bare.setAttribute('data-op-source', 'current');
  bare.setAttribute('data-op-view', 'code');
  bare.textContent = 'Bare fallback';
  const capped = element('div');
  capped.setAttribute('data-op-source', 'current');
  capped.setAttribute('data-op-data-view', 'code');
  capped.setAttribute('data-op-max-size', '1 B');
  const nodes = [oldSource, source, oldView, view, bare, capped];
  p.body.querySelectorAll = selector => {
    switch (selector) {
      case 'script[data-op-source], pre[data-op-source]':
        return nodes.filter(node => node.tagName === 'SCRIPT' && node.hasAttribute('data-op-source'));
      case '[data-op-data-view]:not([data-op-dropzone])':
        return nodes.filter(node => node.hasAttribute('data-op-data-view'));
      default:
        return nodes.filter(node => selector.startsWith('[data-op-data]') && node.hasAttribute('data-op-data'));
    }
  };
  await p.start();
  assert.equal(p.OP.data.source('old'), null);
  assert.equal(oldView.textContent, 'Old fallback');
  assert.equal(bare.textContent, 'Bare fallback');
  assert.equal(p.OP.data.source('current').snapshot().type, 'csv');
  const controller = p.OP._dataView.get(view);
  assert.equal(controller.snapshot().view, 'code');
  assert.equal(view.textContent, 'a,b\n1,2');
  assert.match(capped.textContent, /over this block's 1 byte limit/);
  assert.equal(capped.firstChild.lastChild.textContent, 'Show anyway');
  const target = p.OP._dropzone.link(view);
  const zone = element('div');
  assert.equal(target.kind, 'data');
  assert.equal(target.feed({ type: 'csv', text: 'a,b\n3,4' }, {}, zone, target.reserve()), '');
  assert.equal(view.textContent, 'a,b\n3,4');
  target.restore(zone, target.reserve());
  assert.equal(view.textContent, 'a,b\n1,2');
});

const matrixMapping = {
  row: 'actual class', column: 'prediction',
  rows: [{ key: 'A', label: 'Actual A' }, { key: 'B', label: 'Actual B' }],
  columns: [{ key: 'A', label: 'Predicted A' }, { key: 'B', label: 'Predicted B' }],
  measures: [
    { key: 'count', field: 'count', label: 'Count' },
    { key: 'share', field: 'percent', label: 'Normalized', unit: '%', range: [0, 100],
      normalization: 'Share of actual class' }
  ]
};

function matrixPage({ enabled = true, fail, options, attributes, input } = {}) {
  const p = page({ fail, config: { profile: 'none', features: { matrix: enabled },
    options: { matrix: { instances: { confusion: { mapping: matrixMapping, ...options } } } } } });
  const table = p.body.appendChild(element('table'));
  table.id = 'confusion';
  table.setAttribute('data-op-matrix', '');
  table.setAttribute('data-op-source', 'outcomes');
  for (const [key, value] of Object.entries(attributes || {})) table.setAttribute(key, value);
  p.ids.set(table.id, table);
  p.body.querySelectorAll = selector => selector === 'table[data-op-matrix]' ? [table] : [];
  const caption = table.appendChild(element('caption'));
  caption.textContent = 'Confusion matrix';
  const fallbackHead = table.appendChild(element('thead'));
  fallbackHead.appendChild(element('tr')).appendChild(element('th')).textContent = 'Actual class';
  const fallbackBody = table.appendChild(element('tbody'));
  fallbackBody.appendChild(element('tr')).appendChild(element('td')).textContent = 'Static evaluation totals';
  if (enabled) p.OP.setup(OP => OP.data.define('outcomes', input || {
    type: 'csv', text: 'prediction,count,actual class,percent\nA,4,B,50\nB,0,A,\nA,8,A,80'
  }));
  return { ...p, table, caption, fallbackHead, fallbackBody };
}

const matrixRecord = (row, column, count, percent) => ({ 'actual class': row, prediction: column, count, percent });
const matrixValues = (...value) => ({ type: 'value', value });

// The measure chooser is a radio chip group, rebuilt whenever the measures are replaced.
const measureGroup = (p) => p.body.firstChild.children.find((child) => child.tagName === 'FIELDSET') || null;
const measureRadios = (p) => descendants(measureGroup(p)).filter((el) => el.tagName === 'INPUT');
const chosenMeasure = (p) => measureRadios(p).find((input) => input.checked)?.value;
function chooseMeasure(p, key) {
  const radios = measureRadios(p);
  radios.forEach((input) => { input.checked = input.value === key; });
  radios.find((input) => input.value === key).dispatchEvent(new Event('change'));
}

test('offline matrices pivot by declared keys and use one scale per measure chip', async () => {
  const p = matrixPage();
  const events = [];
  p.table.addEventListener('op:matrix:change', event => events.push(event));
  await p.start();
  const matrix = p.OP._matrix.get('confusion');
  assert.equal(matrix, p.OP._matrix.mount(p.table));
  assert.ok(p.loads.indexOf('offprint/js/data.js') < p.loads.indexOf('offprint/js/matrix.js'));
  assert.ok(p.loads.includes('offprint/css/matrix.css'));
  assert.equal(p.table.firstChild, p.caption);
  const [group, status, ramp] = p.body.firstChild.children;
  assert.equal(group, measureGroup(p));
  assert.equal(group.children[0].tagName, 'LEGEND');
  assert.equal(group.children[0].textContent, 'Measure');
  assert.deepEqual(measureRadios(p).map(input => [input.type, input.value]), [['radio', 'count'], ['radio', 'share']]);
  assert.equal(chosenMeasure(p), 'count');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(ramp.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(p.table.children[1].firstChild.children.slice(1).map(cell =>
    [cell.tagName, cell.getAttribute('scope'), cell.textContent]),
    [['TH', 'col', 'Predicted A'], ['TH', 'col', 'Predicted B']]);
  const cells = () => p.table.lastChild.children.flatMap(row => row.children.slice(1));
  const values = () => cells().map(cell => cell.textContent);
  const shades = () => cells().map(cell => cell.style.getPropertyValue('--op-matrix-strength'));
  assert.deepEqual(p.table.lastChild.children.map(row => [row.firstChild.getAttribute('scope'), row.firstChild.textContent]),
    [['row', 'Actual A'], ['row', 'Actual B']]);
  assert.deepEqual(values(), ['8', '0', '4', 'Missing']);
  assert.deepEqual(shades(), ['1', '0', '0.5', '']);
  assert.equal(status.textContent, '0 to 8');
  assert.equal(ramp.hidden, false);

  const observed = [];
  matrix.subscribe((state, meta) => observed.push([state.key, meta.origin, values()]), { immediate: true });
  chooseMeasure(p, 'share');
  assert.deepEqual(values(), ['80%', 'Missing', '50%', 'Missing']);
  assert.deepEqual(shades(), ['0.8', '', '0.5', '']);
  assert.equal(status.textContent, 'Share of actual class · 0% to 100%');
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'share', index: 1, label: 'Normalized', total: 2 });
  assert.equal(Object.isFrozen(matrix.snapshot()), true);
  assert.equal(matrix.select('unknown'), false);
  assert.equal(matrix.select('share'), true);
  assert.deepEqual(observed, [
    ['count', 'init', ['8', '0', '4', 'Missing']],
    ['share', 'user', ['80%', 'Missing', '50%', 'Missing']]
  ]);
  assert.deepEqual(events.map(event => [event.target, event.bubbles, event.detail.origin, event.detail.previous?.key]),
    [[p.table, true, 'init', undefined], [p.table, true, 'user', 'count']]);

  const source = p.OP.data.source('outcomes');
  const replaced = matrixValues(matrixRecord('B', 'B', 12, 65));
  assert.equal(source.update(replaced), true);
  assert.equal(matrix.snapshot().key, 'share');
  assert.deepEqual(values(), ['Missing', 'Missing', 'Missing', '65%']);
  assert.equal(chosenMeasure(p), 'share', 'a rebuilt chooser keeps the chosen measure');
  assert.equal(matrix.update([matrixRecord('A', 'A', 3, 100)]), true);
  assert.equal(source.update(matrixValues(matrixRecord('A', 'B', 11, 75))), true);
  assert.deepEqual(values(), ['100%', 'Missing', 'Missing', 'Missing']);
  assert.equal(matrix.reset(), true);
  assert.equal(matrix.snapshot().key, 'count');
  assert.deepEqual(values(), ['Missing', '11', 'Missing', 'Missing']);
  assert.deepEqual(shades(), ['', '', '', '']);
  assert.equal(status.textContent, 'All values equal 11');
  assert.equal(ramp.hidden, true);
  assert.equal(source.reset(), true);
  assert.deepEqual(values(), ['8', '0', '4', 'Missing']);
  assert.equal(source.update(matrixValues()), true);
  assert.ok(values().every(value => value === 'Missing'));
  assert.equal(status.textContent, 'No values supplied');
  assert.deepEqual(Array.from(p.OP.diagnostics.list()), []);
});

test('invalid matrix replacements roll back and authored content survives failed or disabled enhancement', async () => {
  const p = matrixPage({ options: { maxRows: 3, maxSize: '512 B', maxCells: 4 } });
  await p.start();
  const source = p.OP.data.source('outcomes');
  const matrix = p.OP._matrix.get(p.table);
  const initial = source.snapshot();
  const body = p.table.lastChild;
  const valid = matrixRecord('A', 'A', 2, null);
  for (const input of [
    matrixValues(valid, valid),
    matrixValues(matrixRecord('A', 'unknown', 2, null)),
    matrixValues(matrixRecord('A', 'A', '2', null)),
    matrixValues({ 'actual class': 'A', prediction: 'A', count: 2 }),
    matrixValues(valid, valid, valid, valid),
    matrixValues({ ...valid, padding: 'a'.repeat(512) }),
    { type: 'csv', text: 'actual class,prediction,count' }
  ]) {
    assert.equal(source.update(input), false);
    assert.equal(source.snapshot(), initial);
    assert.equal(p.table.lastChild, body);
  }
  assert.equal(matrix.update([matrixRecord('A', 'A', 2, true)]), false);
  assert.equal(p.table.lastChild, body);
  for (const inputs of [
    { enabled: false },
    { fail: ['offprint/js/data.js'] },
    { attributes: { 'data-op-max-cells': '3' } },
    { options: { mapping: { ...matrixMapping, rows: [matrixMapping.rows[0], matrixMapping.rows[0]] } } },
    { options: { mapping: { ...matrixMapping, measures: [matrixMapping.measures[0], matrixMapping.measures[0]] } } },
    { input: matrixValues(matrixRecord('A', 'unknown', 3, 50)) }
  ]) {
    const fallback = matrixPage(inputs);
    await fallback.start();
    assert.ok(fallback.body.firstChild === fallback.table);
    assert.deepEqual(fallback.body.lastChild.children.map(el => el.textContent), ['Export']);
    assert.deepEqual(fallback.table.children, [fallback.caption, fallback.fallbackHead, fallback.fallbackBody]);
    if (inputs.input) {
      const api = fallback.OP._matrix.get(fallback.table);
      assert.equal(api.snapshot(), null);
      assert.equal(api.update([valid]), true);
      assert.equal(api.reset(), true);
      assert.deepEqual(fallback.table.children, [fallback.caption, fallback.fallbackHead, fallback.fallbackBody]);
      assert.equal(fallback.OP.data.source('outcomes').update(matrixValues(valid)), true);
      assert.equal(api.snapshot().key, 'count');
    }
  }
});

test('matrix selection follows its key through named transform replacements', async () => {
  const p = matrixPage({ options: { transform: 'matrix-spec', transformOutput: 'spec' },
    input: matrixValues(matrixRecord('A', 'A', 1, 50)) });
  p.OP.setup(OP => OP.data.defineTransform('matrix-spec', ({ value }, { mapping }) => {
    const count = value[0].count;
    const measures = count === 1 ? mapping.measures :
      count === 2 ? [{ ...mapping.measures[1], label: 'Row share' }, mapping.measures[0]] : mapping.measures.slice(0, 1);
    return { records: value, mapping: { ...mapping, measures } };
  }));
  await p.start();
  const matrix = p.OP._matrix.get(p.table);
  const source = p.OP.data.source('outcomes');
  assert.equal(matrix.select('share'), true);
  assert.equal(source.update(matrixValues(matrixRecord('A', 'A', 2, 75))), true);
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'share', index: 0, label: 'Row share', total: 2 });
  assert.equal(chosenMeasure(p), 'share');
  assert.equal(source.update(matrixValues(matrixRecord('A', 'A', 3, 90))), true);
  assert.deepEqual({ ...matrix.snapshot() }, { key: 'count', index: 0, label: 'Count', total: 1 });
  assert.equal(measureGroup(p), null, 'a single measure needs no chooser');
});
