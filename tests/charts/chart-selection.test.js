const test = require('node:test');
const assert = require('node:assert/strict');
const { draw, shared, GROUP, KEY } = require('../support/mounted-chart');

test('a click commits the keyed point nearest the pointer, even where series share an x, and a second click clears it', () => {
  const c = draw(shared);
  assert.deepEqual(c.marks().map((el) => [el.getAttribute(GROUP), el.getAttribute(KEY)]),
    [['trace', 'a1'], ['trace', 'a2'], ['trace', 'b1'], ['trace', 'b2']]);
  c.point(c.mark('b1'), 'pointermove');
  assert.equal(c.selection.group('trace').get(), null, 'hovering only previews');
  assert.equal(c.point(c.mark('b1'), 'click').defaultPrevented, true, 'a handled click leaves a zoomable figure alone');
  assert.equal(c.selection.group('trace').get(), 'b1');
  assert.match(c.tip().textContent, /Selected/);
  c.point(c.mark('a1'), 'click');
  assert.equal(c.selection.group('trace').get(), 'a1');
  c.point(c.mark('a1'), 'click');
  assert.equal(c.selection.group('trace').get(), null);
  assert.doesNotMatch(c.tip().textContent, /Selected/);
});

test('arrow keys visit each reading at a shared x and Enter or Space toggles its key', () => {
  const c = draw(shared);
  const key = (k, extra) => c.fire('keydown', Object.assign({ key: k }, extra));
  assert.equal(key('Enter').defaultPrevented, false, 'nothing is read yet');
  key('Home');
  key('ArrowRight');
  assert.equal(key('Enter').defaultPrevented, true);
  assert.equal(c.selection.group('trace').get(), 'a1', 'readings at x = 1 run from the top of the plot down');
  key('Enter', { repeat: true });
  assert.equal(c.selection.group('trace').get(), 'a1');
  key(' ');
  assert.equal(c.selection.group('trace').get(), null);
  key('End');
  assert.equal(key('Enter').defaultPrevented, false, 'an unkeyed point has nothing to select');
  assert.deepEqual(c.sets, [['trace', 'a1'], ['trace', null]]);
});

test('outside selections refresh the readout, and keys survive redraws, gaps in the data, and the table view', () => {
  const c = draw(shared);
  c.fire('keydown', { key: 'End' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.fire('keydown', { key: 'ArrowLeft' });
  c.selection.group('trace').select('b2');
  assert.match(c.tip().textContent, /Selected/);

  const without = JSON.parse(JSON.stringify(shared));
  without.series[1].data.splice(1, 1);
  c.api.update(without);
  assert.equal(c.mark('b2'), undefined);
  c.api.update(shared);
  assert.equal(c.selection.group('trace').get(), 'b2', 'the selection is kept by key while its point is absent');
  assert.equal(c.mark('b2').getAttribute(GROUP), 'trace');

  c.host.all().find((el) => el.classList.contains('op-chart-toggle')).dispatchEvent(new Event('click'));
  const cells = c.host.all().filter((el) => el.tag === 'td' && el.getAttribute(KEY));
  assert.deepEqual(cells.map((el) => el.getAttribute(KEY)), ['a1', 'b1', 'a2', 'b2']);
  assert.ok(cells.every((el) => el.getAttribute(GROUP) === 'trace'));
});

test('bars and scatter points are keyed, and charts without a group keep one readout per x and ignore clicks', () => {
  const bars = draw({ type: 'bar', selectionGroup: 'g', series: [{ data: [{ x: 'a', y: 1, key: 'k1' }] }, { data: [{ x: 'a', y: 2, key: 'k2' }] }] });
  assert.deepEqual(bars.marks().map((el) => el.tag + ':' + el.getAttribute(KEY)), ['path:k1', 'path:k2']);
  const dots = draw({ type: 'scatter', selectionGroup: 'g', series: [{ data: [{ x: 1, y: 1, key: 'p' }] }] });
  dots.point(dots.mark('p'), 'click');
  assert.equal(dots.selection.group('g').get(), 'p');

  const legacy = draw(Object.assign({}, shared, { selectionGroup: undefined }));
  assert.equal(legacy.marks().length, 0);
  const dot = legacy.host.all().find((el) => el.classList.contains('op-chart-dot'));
  assert.equal(legacy.point(dot, 'click').defaultPrevented, false);
  assert.deepEqual(legacy.sets, []);
  legacy.fire('keydown', { key: 'Home' });
  legacy.fire('keydown', { key: 'ArrowRight' });
  assert.match(legacy.tip().textContent, /^2/, 'the second readout is the next x, not the other series');
});
