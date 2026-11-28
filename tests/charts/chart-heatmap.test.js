const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChartModules } = require('../support/chart-modules');
const { Node, setup, draw, KEY, byClass, click, entranceClock, awaiting } = require('../support/mounted-chart');

const { chart, warnings } = loadChartModules(['core.js', 'chart.js', 'chart-heatmap.js']);
const heatmap = chart._heatmap;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('colour scales map sequential, diverging, and log values to a hue and strength', () => {
  const seq = heatmap.scale('sequential', [2, 4, 12]);
  assert.deepEqual([seq.lo, seq.hi, seq.pos(7), seq.pos(40)], [2, 12, 0.5, 1]);
  assert.deepEqual(plain([seq.paint(2), seq.paint(12)]), [{ hue: 'high', alpha: 0.1 }, { hue: 'high', alpha: 0.95 }]);
  assert.equal(seq.invert(0.5), 7);

  const div = heatmap.scale({ type: 'diverging', mid: 1 }, [-2, 1, 2]);
  assert.deepEqual([div.lo, div.hi], [-2, 4], 'both arms reach the farthest value from the midpoint');
  assert.deepEqual(plain([div.paint(1), div.paint(-2), div.paint(2.5)]),
    [{ hue: 'high', alpha: 0 }, { hue: 'low', alpha: 0.9 }, { hue: 'high', alpha: 0.45 }]);
  const fixed = heatmap.scale({ type: 'diverging', mid: 0, min: -1, max: 4 }, [0]);
  assert.equal(fixed.paint(-1).alpha, fixed.paint(4).alpha, 'author bounds scale each arm to its own end');

  const log = heatmap.scale({ type: 'log', color: 'green' }, [1, 10, 1000]);
  assert.equal(log.pos(10), 1 / 3);
  assert.ok(Math.abs(log.invert(2 / 3) - 100) < 1e-9);
  assert.deepEqual(plain(log.colors), ['green']);

  assert.match(chart.validate({ type: 'heatmap', scale: 'log', z: [[0, 1]] })[0], /positive values/);
  assert.match(chart.validate({ type: 'heatmap', scale: { color: 'teal' }, z: [[1]] })[0], /palette names/);
  assert.match(chart.validate({ type: 'heatmap', scale: { type: 'diverging', mid: 9, min: 0, max: 4 }, z: [[1]] })[0], /mid must lie/);
  assert.match(chart.validate({ type: 'heatmap', scale: { mid: 1 }, z: [[1]] })[0], /Only a diverging/);
});

test('records pivot into a grid in first-appearance or listed order with missing cells', () => {
  const grid = heatmap.pivot([
    { x: 'Tue', y: 'AM', z: 2 }, { x: 'Mon', y: 'PM', z: '1,200', key: 'pm-mon' }, { x: 'Mon', y: 'AM', z: null }
  ], {}, chart.toNumber);
  assert.deepEqual(plain(grid), { columns: ['Tue', 'Mon'], rows: ['AM', 'PM'], z: [[2, null], [null, 1200]],
    keys: [[null, null], [null, 'pm-mon']] });
  const listed = heatmap.pivot([{ x: 3, y: 1, z: 5 }], { columns: [1, 3], rows: [2, 1] });
  assert.deepEqual(plain(listed.z), [[null, null], [null, 5]]);
  assert.throws(() => heatmap.pivot([{ x: 'a', y: 'b', z: 1 }], { columns: ['c'] }), /not in the listed columns/);
  assert.throws(() => heatmap.pivot([{ x: 'a', y: 'b', z: 'n/a' }], {}, chart.toNumber), /finite numbers/);

  const model = chart.normalize({ type: 'heatmap', data: [{ x: 'a', y: 'r', z: 1 }, { x: 'b', y: 'r', z: 3 }] });
  assert.deepEqual(plain(model.series[0].points.map((p) => [p.key, p.row, p.col, p.y])),
    [['cell:r:a', 0, 0, 1], ['cell:r:b', 0, 1, 3]]);
  assert.match(chart.validate({ type: 'heatmap', data: [{ x: 'a', y: 'r', z: 1 }, { x: 'a', y: 'r', z: 2 }] })[0], /repeat/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1]], data: [] })[0], /not both/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2], [3]] })[0], /same length/);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2]], columns: ['a', 'a'] })[0], /unique/);
});

test('heatmaps reject grids above the cell cap', () => {
  const row = (n) => Array(n).fill(1);
  assert.equal(chart.validate({ type: 'heatmap', z: Array.from({ length: 100 }, () => row(50)) }).length, 0);
  assert.match(chart.validate({ type: 'heatmap', z: Array.from({ length: 101 }, () => row(50)) })[0], /at most 5000 cells/);
  const records = Array.from({ length: 5001 }, (_, i) => ({ x: i, y: 0, z: 1 }));
  assert.match(chart.validate({ type: 'heatmap', data: records })[0], /5001/);
});

test('marching squares traces known grids and resolves saddles by the cell mean', () => {
  assert.deepEqual(plain(heatmap.contourSegments([[0, 0], [0, 2]], 1)), [[[0.5, 1], [1, 0.5]]]);
  assert.deepEqual(plain(heatmap.contourSegments([[0, 2], [0, 2]], 1)), [[[0.5, 0], [0.5, 1]]]);
  assert.deepEqual(plain(heatmap.contourSegments([[1, 1], [1, 1]], 1)), [], 'a flat grid at the level is all inside');
  assert.deepEqual(plain(heatmap.contourSegments([[2, 0], [0, 2]], 1.5)), [[[0, 0.25], [0.25, 0]], [[0.75, 1], [1, 0.75]]],
    'a low mean keeps the two high corners apart');
  assert.equal(heatmap.contourSegments([[2, 0], [0, 2]], 0.5).length, 2);
  const ring = [[0, 0, 0], [0, 4, 0], [0, 0, 0]];
  const segments = heatmap.contourSegments(ring, 2);
  assert.equal(segments.length, 4, 'a peak gives a closed loop of four segments');
  segments.flat().forEach(([x, y]) => assert.equal(Math.abs(x - 1) + Math.abs(y - 1), 0.5));
});

test('contour levels come from ticks, counts, or lists, and skip unsuitable grids with a warning', () => {
  const scale = heatmap.scale('sequential', [0, 10]);
  assert.deepEqual(plain(heatmap.contourLevels(true, scale, [0, 10])), [2, 4, 6, 8]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: 3 }, scale, [0, 10])), [2.5, 5, 7.5]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: [9, 0, 4, 4] }, scale, [0, 10])), [4, 9], 'levels on the edge draw nothing');
  const log = heatmap.scale('log', [1, 1000]);
  assert.deepEqual(plain(heatmap.contourLevels({ levels: 2 }, log, [1, 1000]).map((v) => +v.toPrecision(6))), [10, 100]);
  assert.match(chart.validate({ type: 'heatmap', z: [[1, 2], [3, 4]], contours: { levels: 0 } })[0], /integer from 1/);

  const numeric = chart.normalize({ type: 'heatmap', columns: [0, 1], rows: [5, 10], z: [[0, 4], [4, 8]],
    contours: { levels: [2], labels: true } });
  assert.deepEqual(plain(numeric.heatmap.contours), { levels: [2], labels: true });
  warnings.length = 0;
  const named = chart.normalize({ type: 'heatmap', columns: ['a', 'b'], rows: [1, 2], z: [[0, 4], [4, 8]], contours: true });
  const sparse = chart.normalize({ type: 'heatmap', columns: [1, 2], rows: [1, 2], z: [[0, null], [4, 8]], contours: true });
  assert.equal(named.heatmap.contours, null);
  assert.equal(sparse.heatmap.contours, null);
  assert.equal(named.errors.length + sparse.errors.length, 0, 'unsuitable grids still draw without contours');
  assert.deepEqual(warnings.map((w) => w.replace(/^.*because /, '')),
    ['its row and column labels are not ordered numbers.', 'it has missing cells.']);
});

const heatSpec = { type: 'heatmap', x: 'Hour', y: 'Day', value: { label: 'Visits' }, columns: ['9', '10', '11'],
  rows: ['Mon', 'Tue'], z: [[1, 5, 9], [3, null, 7]], selectionGroup: 'cells' };
const cellsOf = (c) => byClass(c, 'op-heatmap-cell');
const cellAt = (c, key) => cellsOf(c).find((el) => el.getAttribute(KEY) === key);

test('heatmap cells read by row and column, move between rows, select keys, and list a grid table', () => {
  const c = draw(heatSpec, { modules: ['chart-heatmap'] });
  assert.equal(cellsOf(c).length, 5, 'missing cells draw no mark');
  assert.ok(c.host.classList.contains('is-heatmap'));
  const low = cellAt(c, 'cell:Mon:9');
  const high = cellAt(c, 'cell:Mon:11');
  assert.ok(+low.getAttribute('fill-opacity') < +high.getAttribute('fill-opacity'));
  c.fire('keydown', { key: 'Home' });
  assert.equal(c.tip().textContent, 'Mon · 91Visits');
  c.fire('keydown', { key: 'ArrowDown' });
  assert.match(c.tip().textContent, /^Tue · 93/);
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /^Tue · 117/, 'reading skips the missing cell');
  c.fire('keydown', { key: 'ArrowUp' });
  assert.match(c.tip().textContent, /^Mon · 119/);
  c.fire('keydown', { key: 'Enter' });
  assert.equal(c.selection.group('cells').get(), 'cell:Mon:11');
  const x = +low.getAttribute('x') + 2;
  const y = +low.getAttribute('y') + 2;
  c.fire('pointermove', { clientX: x, clientY: y });
  assert.match(c.tip().textContent, /^Mon · 91/);
  assert.deepEqual([c.api.coords(x, y).x, c.api.coords(x, y).y, c.api.coords(x, y).yText], ['9', 'Mon', 'Mon · 1']);
  assert.match(c.plot.getAttribute('aria-label'), /^Heatmap of Visits by Day and Hour, 2 rows by 3 columns/);
  click(c.host.querySelector('.op-chart-toggle'));
  const table = c.host.querySelector('.op-chart-table');
  assert.deepEqual(table.querySelectorAll('tr').map((row) => row.textContent), ['Day91011', 'Mon159', 'Tue37']);
  assert.ok(table.querySelectorAll('td').find((td) => td.getAttribute(KEY) === 'cell:Mon:11').hasAttribute('data-op-selection-active'));
});

test('the heatmap colour scale filters cells by value range from the pointer, keys, and API', () => {
  const c = draw(heatSpec, { modules: ['chart-heatmap'] });
  const events = [];
  c.host.addEventListener('op:chart:heatmap-range', ({ detail }) => events.push(detail));
  const dimmed = () => cellsOf(c).filter((el) => el.classList.contains('is-dimmed')).map((el) => el.getAttribute(KEY));
  const reset = c.host.querySelector('.op-heatmap-filter-reset');
  assert.equal(reset.hidden, true);
  c.fire('keydown', { key: 'PageUp' });
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [8, 9]);
  assert.deepEqual(dimmed(), ['cell:Mon:9', 'cell:Mon:10', 'cell:Tue:9', 'cell:Tue:11']);
  assert.equal(reset.hidden, false);
  assert.equal(c.host.querySelector('.op-heatmap-filter-text').textContent, 'Values 8 – 9');
  c.fire('keydown', { key: 'PageDown' });
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [6, 8]);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /Outside the value range$/);
  c.fire('keydown', { key: 'Escape' });
  assert.equal(c.chart._heatmap.valueRange(c.host), null);
  assert.deepEqual(dimmed(), []);

  const hit = c.host.querySelector('.op-heatmap-scale-hit');
  const top = +hit.getAttribute('y') + 4;
  const bottom = top + +hit.getAttribute('height') - 8;
  const at = (value) => bottom - (value - 1) / 8 * (bottom - top);
  const pointer = (type, value) => hit.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
    button: 0, clientY: at(value) }));
  pointer('pointerdown', 6.5);
  pointer('pointermove', 2.5);
  assert.deepEqual(dimmed(), ['cell:Mon:9', 'cell:Mon:11', 'cell:Tue:11'], 'dragging dims live');
  const announced = events.length;
  pointer('pointerup', 2.5);
  assert.equal(events.length, announced + 1, 'a drag is announced once when it ends');
  assert.deepEqual([...events.at(-1).current].map((v) => +v.toFixed(6)), [2.5, 6.5]);
  pointer('pointerdown', 5);
  pointer('pointerup', 5);
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [4, 6], 'a click picks the step between two ticks');
  pointer('pointerdown', 5);
  pointer('pointerup', 5);
  assert.equal(c.chart._heatmap.valueRange(c.host), null, 'clicking the chosen step again shows every value');

  assert.equal(c.chart._heatmap.valueRange(c.host, [6, 2]), false);
  assert.equal(c.chart._heatmap.valueRange(c.host, [0, 4]), true);
  assert.deepEqual([...c.chart._heatmap.valueRange(c.host)], [1, 4], 'ranges clamp to the scale');
  assert.equal(c.api.update({ ...heatSpec, z: [[1, 2, 3], [4, 5, 6]] }), true);
  assert.deepEqual(dimmed(), ['cell:Tue:10', 'cell:Tue:11'], 'the filter applies to replaced values');
  click(reset);
  assert.equal(c.chart._heatmap.valueRange(c.host), null);
  assert.deepEqual(events.at(-1).origin, 'user');
});

test('heatmap cells enter by fading in and tween colour strength on updates', () => {
  const clock = entranceClock();
  const spec = { type: 'heatmap', scale: { type: 'diverging' }, columns: ['a', 'b'], rows: ['r'], z: [[-2, 2]], selectionGroup: 'g' };
  const c = draw(spec, { ...clock, modules: ['chart-heatmap'] });
  const cell = (key) => cellAt(c, key);
  assert.ok(awaiting(c));
  clock.scrollTo(c.host);
  clock.tick(0);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0');
  clock.tick(1000);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0.9');
  assert.equal(cell('cell:r:a').getAttribute('data-op-heat'), 'low');
  assert.equal(c.api.update({ ...spec, z: [[-1, 2]] }), true);
  clock.tick(1000);
  clock.tick(1120);
  const mid = +cell('cell:r:a').getAttribute('fill-opacity');
  assert.ok(mid > 0.45 && mid < 0.9, 'strength tweens from the displayed value');
  clock.tick(2000);
  assert.equal(cell('cell:r:a').getAttribute('fill-opacity'), '0.45');
});

test('heatmaps draw contours on numeric grids and read long-form records from a named source', () => {
  const host = new Node('div');
  host.id = 'grid';
  host.setAttribute('data-op-chart', 'heatmap');
  host.setAttribute('data-op-source', 'field');
  const env = setup({ modules: ['data', 'chart-heatmap'], enhance(op, document, boot) {
    op.data.define('field', { type: 'csv', text: 'col,row,v,id\n0,0,0,a\n1,0,4,b\n0,1,4,c\n1,1,8,d' });
    boot.optionLayers = (feature) => feature === 'chart' ?
      [{ mapping: { x: 'col', y: 'row', z: 'v', pointKey: 'id' }, contours: { levels: [2, 6], labels: true } }] : [];
    document.body.appendChild(host);
  } });
  const api = env.chart.get(host);
  assert.deepEqual(JSON.parse(JSON.stringify(api.model().heatmap.z)), [[0, 4], [4, 8]]);
  const contours = host.querySelectorAll('.op-heatmap-contour');
  assert.deepEqual(contours.map((el) => el.getAttribute('data-op-level')), ['2', '6']);
  assert.deepEqual(host.querySelectorAll('.op-heatmap-contour-label').map((el) => el.textContent), ['2', '6']);
  assert.equal(api.model().series[0].points[3].key, 'd');
  assert.match(host.querySelector('.op-chart-plot').getAttribute('aria-label'), /Contour lines mark levels 2, 6/);
});
