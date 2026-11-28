const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, draw, GROUP, byClass, dotsOf, click, brush } = require('../support/mounted-chart');

test('a time axis draws UTC ticks and a zoned title, and readouts and the table use the same timestamps', () => {
  const c = draw({
    type: 'line',
    gaps: 'break',
    x: { type: 'time', label: 'Arrival' },
    series: [{ name: 'Rows', data: [['2026-11-16T17:02:00-05:00', 14], ['2026-11-17T00:40:00Z', null], ['2026-11-17T01:10:00Z', 9]] }]
  });
  const texts = (cls) => c.host.all().filter((el) => el.classList.contains(cls)).map((el) => el.textContent);
  assert.ok(texts('op-chart-tick').includes('Nov 17'));
  assert.ok(texts('op-chart-label').includes('Arrival (UTC)'));
  assert.match(c.plot.getAttribute('aria-label'), /Times are in UTC/);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^Arrival 2026-11-16 22:02 UTC14/);
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /^Arrival 2026-11-17 00:40 UTCNo data/);
  c.host.all().find((el) => el.classList.contains('op-chart-toggle')).dispatchEvent(new Event('click'));
  const heads = c.host.all().filter((el) => el.tag === 'th').map((el) => el.textContent);
  assert.deepEqual(heads, ['Arrival', 'Rows', '2026-11-16 22:02 UTC', '2026-11-17 00:40 UTC', '2026-11-17 01:10 UTC']);
});

test('log axes draw decade ticks and original readouts; invalid data is not drawn and an invalid update keeps the chart', () => {
  const sweep = {
    type: 'line',
    x: { type: 'log', label: 'Learning rate' },
    y: { type: 'log', label: 'Loss' },
    referenceLines: [{ axis: 'y', value: 1.79, label: 'Uniform guess' }],
    series: [{ name: 'Validation', data: [[1e-5, 1.73], [1e-4, 0.95], [1e-3, 0.61], [1e-2, 2.9]] }]
  };
  const c = draw(sweep);
  const texts = (cls) => c.host.all().filter((el) => el.classList.contains(cls)).map((el) => el.textContent);
  assert.deepEqual(texts('op-chart-tick').slice(-4), ['0.00001', '0.0001', '0.001', '0.01']);
  const dots = c.host.all().filter((el) => el.classList.contains('op-chart-dot')).map((el) => +el.getAttribute('cx'));
  assert.ok(Math.abs((dots[1] - dots[0]) - (dots[3] - dots[2])) < 1e-6, 'decades are evenly spaced');
  assert.deepEqual(texts('op-chart-ref-label'), ['Uniform guess']);
  assert.match(c.plot.getAttribute('aria-label'), /x and y axes use a log scale/);
  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /^Learning rate 0\.000011\.73/);

  const svgBefore = c.host.all().find((el) => el.tag === 'svg');
  assert.equal(c.api.update(Object.assign({}, sweep, { series: [{ data: [[1e-5, 0]] }] })), false);
  assert.equal(c.host.all().find((el) => el.tag === 'svg'), svgBefore, 'the last valid chart stays');
  assert.equal(c.api.model().series[0].points.length, 4);
  assert.match(c.warnings.pop(), /^Chart update ignored.*log y axis needs positive values/);

  const env = setup();
  const host = new Node('div');
  const fallback = host.appendChild(new Node('table'));
  assert.equal(env.chart(host, Object.assign({}, sweep, { y: { type: 'log', min: 0 } })), null);
  assert.deepEqual(host.children, [fallback], 'the authored content stays as it was');
  assert.equal(host.classList.contains('op-chart'), false);
  assert.match(env.warnings.pop(), /^Chart not drawn.*min must be a positive number/);
});

const hour = 36e5;
const t0 = Date.UTC(2026, 10, 10);
const telemetry = {
  type: 'line',
  brush: true,
  gaps: 'break',
  selectionGroup: 'ops',
  x: { type: 'time' },
  referenceLines: [{ axis: 'x', value: t0 + 5 * hour, label: 'Deploy' }],
  series: [
    { name: 'A', data: [[t0, 1], [t0 + hour, 2], [t0 + 2 * hour, null], [t0 + 3 * hour, 4], { x: t0 + 4 * hour, y: 3, key: 'spike' }, [t0 + 5 * hour, 2]] },
    { name: 'B', data: [[t0, 5], [t0 + 5 * hour, 6]] }
  ]
};

test('dragging narrows a time axis, readouts and the table follow, and Reset restores the full range', () => {
  const c = draw(telemetry);
  const dots = dotsOf(c);
  assert.equal(brush(c, dots[1], dots[3]).defaultPrevented, true, 'the click ending a drag is swallowed');
  const range = c.api.range();
  assert.ok(Math.abs(range[0] - (t0 + hour)) < 1 && Math.abs(range[1] - (t0 + 4 * hour)) < 1);
  assert.equal(c.selection.group('ops').get(), null, 'a drag selects nothing');
  assert.equal(byClass(c, 'op-chart-reset')[0].hidden, false);
  assert.match(byClass(c, 'op-chart-range')[0].textContent, /^Time 2026-11-10 01:00 – 2026-11-10 04:00 UTC$/);
  assert.equal(byClass(c, 'op-chart-ref-note')[0].textContent, 'outside range');
  assert.ok(c.host.all().some((el) => el.tag === 'clipPath'));

  c.fire('keydown', { key: 'Home' });
  assert.match(c.tip().textContent, /01:00 UTC2A/, 'B has no reading inside the range');
  c.fire('keydown', { key: 'ArrowRight' });
  assert.match(c.tip().textContent, /02:00 UTCNo data/);

  click(byClass(c, 'op-chart-toggle')[0]);
  const rows = c.host.all().filter((el) => el.tag === 'th' && el.getAttribute('scope') === 'row').map((el) => el.textContent);
  assert.deepEqual(rows, ['2026-11-10 01:00 UTC', '2026-11-10 02:00 UTC', '2026-11-10 03:00 UTC', '2026-11-10 04:00 UTC']);
  click(byClass(c, 'op-chart-toggle')[0]);

  click(byClass(c, 'op-chart-reset')[0]);
  assert.equal(c.api.range(), null);
  assert.equal(byClass(c, 'op-chart-reset')[0].hidden, true);
  assert.equal(byClass(c, 'op-chart-ref-note')[0].textContent, '');

  const tiny = dotsOf(c)[0];
  c.fire('pointerdown', { button: 0, clientX: +tiny.getAttribute('cx') + 10, clientY: +tiny.getAttribute('cy') });
  c.fire('pointermove', { clientX: +tiny.getAttribute('cx') + 12, clientY: 0 });
  c.fire('pointerup', {});
  assert.equal(c.api.range(), null, 'a short movement is a click, not a brush');
});

test('plus, minus, and Shift with the arrows narrow, widen, and move the range from the keyboard', () => {
  const c = draw(telemetry);
  const key = (k, extra) => c.fire('keydown', Object.assign({ key: k }, extra));
  key('Home');
  assert.equal(key('+').defaultPrevented, true);
  assert.deepEqual([...c.api.range()], [t0, t0 + 2.5 * hour], 'narrowed around the reading at the start');
  assert.match(c.tip().textContent, /00:00 UTC/, 'the readout stays on the same time');
  key('ArrowRight', { shiftKey: true });
  const moved = c.api.range();
  assert.ok(Math.abs(moved[0] - (t0 + 0.625 * hour)) < 1 && Math.abs(moved[1] - (t0 + 3.125 * hour)) < 1);
  key('-');
  key('-');
  assert.equal(c.api.range(), null, 'widening past the data resets');
  assert.equal(key('ArrowRight', { shiftKey: true }).defaultPrevented, true, 'without a range Shift+arrow just reads on');

  const plain = draw(Object.assign({}, telemetry, { brush: false }));
  plain.fire('keydown', { key: 'Home' });
  assert.equal(plain.fire('keydown', { key: '+' }).defaultPrevented, false);
  assert.equal(plain.api.range(), null);
  assert.equal(plain.api.range([t0, t0 + hour]), true, 'scripts can narrow a chart without the brush');
  assert.equal(plain.api.range(['2026-11-10T00:00:00Z', '2026-11-10T00:00:01Z']), false, 'too narrow');
});

test('a log x axis brushes by position and keyed selections persist while points are hidden or out of range', () => {
  const sweep = draw({
    type: 'scatter',
    brush: true,
    x: { type: 'log' },
    series: [{ data: [[1e-5, 1], [1e-4, 2], [1e-3, 3], [1e-2, 4]] }]
  });
  const dots = dotsOf(sweep);
  brush(sweep, dots[1], dots[2]);
  const range = sweep.api.range();
  assert.ok(Math.abs(Math.log10(range[0]) + 4) < 1e-6 && Math.abs(Math.log10(range[1]) + 3) < 1e-6);
  assert.equal(dotsOf(sweep).length, 2);

  const c = draw(telemetry);
  c.selection.group('ops').select('spike');
  c.api.range([t0, t0 + 2 * hour]);
  assert.equal(c.mark('spike'), undefined);
  assert.equal(c.selection.group('ops').get(), 'spike', 'the selection is kept while its point is out of range');
  c.api.visible('A', false);
  c.api.range(null);
  assert.equal(c.mark('spike'), undefined);
  c.api.visible('A', true);
  assert.equal(c.mark('spike').getAttribute(GROUP), 'ops');
  assert.equal(c.selection.group('ops').get(), 'spike');

  c.api.visible('B', false);
  c.api.range([t0 + hour, t0 + 4 * hour]);
  const next = JSON.parse(JSON.stringify(telemetry));
  next.series[0].data.push([t0 + 6 * hour, 1]);
  c.api.update(next);
  assert.equal(c.api.visible('B'), false, 'hidden series stay hidden across updates');
  assert.deepEqual([...c.api.range()], [t0 + hour, t0 + 4 * hour], 'and the range stays while it fits');
  c.api.update(Object.assign({}, next, { x: {} }));
  assert.equal(c.api.range(), null, 'a different axis kind drops the range');
});

test('coords reads the data under a viewport point of the drawn plot, following a narrowed range', () => {
  const c = draw(telemetry);
  const spike = c.mark('spike');
  const hit = c.api.coords(+spike.getAttribute('cx'), +spike.getAttribute('cy'));
  assert.equal(hit.xText, '2026-11-10 04:00 UTC');
  assert.equal(hit.yText, '3');
  assert.ok(hit.plot.left < hit.plot.right && hit.plot.top < hit.plot.bottom);
  assert.equal(c.api.coords(hit.plot.left - 1, +spike.getAttribute('cy')), null);
  c.api.range([t0 + 3 * hour, t0 + 5 * hour]);
  const narrowed = c.mark('spike');
  assert.equal(c.api.coords(+narrowed.getAttribute('cx'), +narrowed.getAttribute('cy')).xText, '2026-11-10 04:00 UTC');
  click(byClass(c, 'op-chart-toggle')[0]);
  assert.equal(c.api.coords(hit.plot.left + 1, hit.plot.top + 1), null, 'nothing to read while the table shows');
});
