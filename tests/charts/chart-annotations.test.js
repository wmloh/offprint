const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setupChartModules } = require('../support/chart-modules');

function setup(modules = []) {
  const env = setupChartModules(['core.js', 'chart.js', ...modules, 'chart-annotations.js']);
  function draw(spec, attrs) {
    const view = env.draw(spec, attrs);
    const notes = () => view.find('op-annotation');
    const legend = () => view.find('op-chart-annotation-note')[0];
    return { ...view, notes, legend, note: (key) => notes().find((el) => el.getAttribute('data-op-annotation') === key) };
  }
  return { ...env, draw, annotations: env.OffPrint._chartAnnotations };
}

const line = (annotations, extra = {}) => Object.assign({
  type: 'line',
  series: [{ key: 'load', name: 'Load', data: [{ x: 1, y: 10 }, { x: 2, y: 30, key: 'peak' }, { x: 3, y: 20 }, { x: 4, y: 15 }] }],
  annotations
}, extra);
const box = (el) => ['x', 'y', 'width', 'height'].map((name) => +el.getAttribute(name));

test('annotations validate their shape and resolve anchors from values, series, and point keys', () => {
  const { chart, annotations } = setup();
  assert.match(chart.validate(line({}))[0], /must be an array/);
  assert.match(chart.validate(line([{ type: 'arrow', x: 1, text: 'a' }]))[0], /type of "note", "range", or "marker"/);
  assert.match(chart.validate(line([{ x: 1 }]))[0], /needs text/);
  assert.match(chart.validate(line([{ x: 1, text: 'a', key: 'k' }, { x: 2, text: 'b', key: 'k' }]))[0], /unique/);
  assert.match(chart.validate(line([{ type: 'range', x: 1, text: 'a' }]))[0], /x and x2/);
  assert.match(chart.validate(line([{ type: 'marker', x: 1, y: 2, text: 'a' }]))[0], /either an x or a y/);
  assert.match(chart.validate(line([{ x: 1, series: 'nope', text: 'a' }]))[0], /unknown series/);
  assert.match(chart.validate(line([{ x: 1, text: 'a', side: 'north' }]))[0], /side of/);
  assert.match(chart.validate(line([{ x: 0, text: 'a' }], { x: { type: 'log' } }))[0], /not a value on the x axis/);

  const model = chart.normalize(line());
  const resolve = (spec) => annotations.anchor(model, annotations.normalize(model, { annotations: [spec] })[0]);
  assert.deepEqual({ ...resolve({ point: 'peak', text: 'Peak' }) }, { x: 2, y: 30, series: 'load' });
  assert.deepEqual({ ...resolve({ x: 3, text: 'Only series' }) }, { x: 3, y: 20, series: 'load' });
  assert.deepEqual({ ...resolve({ x: 3, y: 5, text: 'Free' }) }, { x: 3, y: 5, series: null });
  assert.deepEqual({ ...resolve({ point: 'gone', text: 'Missing' }) }, { missing: 'point' });

  const two = chart.normalize(line(undefined, { series: [{ name: 'A', data: [[1, 1]] }, { name: 'B', data: [[1, 4]] }] }));
  const top = annotations.anchor(two, annotations.normalize(two, { annotations: [{ x: 1, text: 'Ambiguous' }] })[0]);
  assert.equal(top.y, null, 'x alone on several series points at the plot top');
  const pick = annotations.anchor(two, annotations.normalize(two, { annotations: [{ x: 1, series: 'B', text: 'B' }] })[0]);
  assert.equal(pick.y, 4);

  const time = chart.normalize(line(undefined, { x: { type: 'time' }, series: [{ data: [['2026-01-01T00:00Z', 1]] }] }));
  assert.equal(annotations.normalize(time, { annotations: [{ x: '2026-01-01T00:00Z', text: 'New year' }] })[0].x,
    Date.UTC(2026, 0, 1));
});

test('note placement avoids marks, earlier labels, and plot edges, and honours side and offsets', () => {
  const { annotations } = setup();
  const plot = { left: 40, right: 380, top: 10, bottom: 230 };
  const frame = { left: 0, right: 400, top: 0, bottom: 260 };
  const size = { w: 80, h: 20 };
  const free = annotations.placeNote({ x: 200, y: 120 }, size, { marks: [], labels: [], plot, frame });
  assert.equal(free.side, 'top-right', 'the preferred side wins on an empty plot');

  const blocked = annotations.placeNote({ x: 200, y: 120 }, size,
    { marks: [{ x: 190, y: 20, w: 200, h: 95 }], labels: [], plot, frame });
  assert.equal(annotations.overlap(blocked, { x: 190, y: 20, w: 200, h: 95 }), 0, 'the label clears the marks');

  const labels = [free];
  const second = annotations.placeNote({ x: 205, y: 122 }, size, { marks: [], labels, plot, frame });
  assert.equal(annotations.overlap(second, free), 0, 'a later label avoids the earlier one');

  const corner = annotations.placeNote({ x: 375, y: 15 }, size, { marks: [], labels: [], plot, frame });
  assert.ok(corner.x + corner.w <= plot.right && corner.y >= plot.top, 'labels near a corner turn back into the plot');

  assert.equal(annotations.placeNote({ x: 200, y: 120 }, size, { marks: [], labels: [], plot, frame }, { side: 'bottom' }).side,
    'bottom');
  const offset = annotations.placeNote({ x: 200, y: 120 }, size, { marks: [], labels: [], plot, frame }, { dx: -60, dy: 30 });
  assert.deepEqual([offset.x + offset.w / 2, offset.y + offset.h / 2], [140, 150]);
});

test('drawn notes keep clear of the line, and off-range annotations hide with a legend note', () => {
  const env = setup();
  const view = env.draw(line([
    { key: 'peak', point: 'peak', text: 'Peak load after the deploy' },
    { key: 'late', type: 'marker', x: 4, text: 'Freeze' },
    { key: 'window', type: 'range', x: 1, x2: 2, text: 'Window' }
  ], { brush: true }));
  assert.deepEqual(view.notes().map((el) => el.getAttribute('data-op-annotation')), ['window', 'late', 'peak']);
  const line0 = view.host.all().find((el) => el.classList.contains('op-chart-line'));
  const segments = env.chart.markBounds(new Map([['line', { el: line0 }]]));
  assert.ok(segments.length > 3, 'an open line path gives boxes along each segment');
  assert.ok(segments.every((s) => s.w <= 12 && s.h <= 12), 'segment boxes hug the line');
  const label = box(view.note('peak').all().find((el) => el.classList.contains('op-annotation-box')));
  const touching = segments.reduce((sum, s) => sum + env.annotations.overlap({ x: label[0], y: label[1], w: label[2], h: label[3] }, s), 0);
  assert.ok(touching < label[2] * label[3] * 0.02, 'the note label keeps clear of the line');
  assert.equal(view.legend().hidden, true);

  view.api.setRange([1, 2.5]);
  assert.equal(view.note('late'), undefined, 'a marker past the range is not drawn');
  assert.ok(view.note('window') && view.note('peak'));
  assert.equal(view.legend().hidden, false);
  assert.equal(view.legend().lastChild.textContent, '1 annotation not shown: outside the range');
  assert.match(view.host.all().find((el) => el.classList.contains('op-chart-plot')).getAttribute('aria-label'),
    /Annotations: note “Peak load after the deploy” at point peak; marker “Freeze” at x 4; range “Window” at x 1 to 2\./);
});

test('annotations follow a step sequence cumulatively and appear in the table view', () => {
  const env = setup();
  const steps = new Node('ol');
  steps.id = 'walk';
  ['intro', 'spike', 'fix'].forEach((key) => {
    const item = steps.appendChild(new Node('li'));
    item.setAttribute('data-op-key', key);
    item.appendChild(new Node('span')).setAttribute('data-op-step-label', '');
    item.lastChild.textContent = key.toUpperCase();
  });
  env.document.body.appendChild(steps);
  const entry = env.OffPrint._sequence.indexed('test', steps, { keys: ['intro', 'spike', 'fix'], initial: 0 }, () => {});
  entry.start();
  const view = env.draw(line([
    { key: 'always', x: 1, y: 10, text: 'Start' },
    { key: 'spike', point: 'peak', text: 'Spike', revealStep: 'spike' },
    { key: 'fix', type: 'marker', x: 3, text: 'Fix', revealStep: 'fix' },
    { key: 'later', type: 'marker', x: 9, text: 'Off the plot', revealStep: 'fix' }
  ]), { 'data-op-reveal-sequence': 'walk' });
  const pending = () => view.notes().filter((el) => el.classList.contains('op-reveal-pending'))
    .map((el) => el.getAttribute('data-op-annotation'));
  assert.deepEqual(pending(), ['fix', 'spike']);
  entry.run('next', 'user');
  assert.deepEqual(pending(), ['fix'], 'reaching a step shows its annotations');
  assert.equal(view.legend().hidden, true, 'an off-plot annotation waiting for its step is not counted');
  entry.run('next', 'user');
  assert.deepEqual(pending(), [], 'earlier steps stay shown');
  assert.equal(view.legend().lastChild.textContent, '1 annotation not shown: outside the plot');
  entry.run('reset', 'reset');
  assert.deepEqual(pending(), ['fix', 'spike']);

  const follower = env.OffPrint._revealSteps.followers(steps)[0];
  assert.equal(follower.label('spike'), 'SPIKE');
  assert.equal(follower.shown('missing'), true, 'an unknown step key shows its item');
  assert.ok(env.warnings.some((w) => /not a step of "walk"/.test(w)));

  view.host.all().find((el) => el.classList.contains('op-chart-toggle')).dispatchEvent(new Event('click'));
  const table = view.host.all().find((el) => el.classList.contains('op-chart-annotations-table'));
  const rows = table.all().filter((el) => el.tag === 'tr' && el.parentNode.tag === 'tbody');
  assert.deepEqual(rows.map((tr) => tr.children[0].textContent), ['Start', 'Spike', 'Fix', 'Off the plot']);
  assert.deepEqual(rows.map((tr) => tr.classList.contains('op-reveal-pending')), [false, true, true, true]);
});

test('add-on chart types draw the layer on their own geometry', () => {
  const env = setup(['chart-heatmap.js']);
  const view = env.draw({
    type: 'heatmap', columns: ['Mon', 'Tue', 'Wed'], rows: ['AM', 'PM'], z: [[1, 2, 3], [4, 5, 6]],
    annotations: [
      { key: 'busy', x: 'Wed', y: 'PM', text: 'Busiest slot' },
      { key: 'mid', type: 'range', x: 'Tue', x2: 'Wed', text: 'Midweek' },
      { key: 'off', type: 'marker', x: 'Sun', text: 'Not a column' }
    ]
  });
  const anchor = view.note('busy').all().find((el) => el.classList.contains('op-annotation-anchor'));
  const cells = view.host.all().filter((el) => el.classList.contains('op-heatmap-cell'));
  const wedPM = box(cells[5]);
  assert.ok(Math.abs(+anchor.getAttribute('cx') - (wedPM[0] + wedPM[2] / 2)) < 1, 'notes anchor at the cell centre');
  const band = box(view.note('mid').all().find((el) => el.classList.contains('op-annotation-band')));
  assert.ok(Math.abs(band[0] - box(cells[1])[0]) < 1 && Math.abs(band[0] + band[2] - (wedPM[0] + wedPM[2])) < 1,
    'a category range spans whole columns');
  assert.equal(view.note('off'), undefined);
  assert.equal(view.legend().lastChild.textContent, '1 annotation not shown: outside the plot');
});
