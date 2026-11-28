const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, draw, KEY, byClass, legendButton, legendInput, toggleLegend, dotsOf, click, chartClock, entranceClock, awaiting } = require('../support/mounted-chart');

test('legend chips hide series from the plot, readout, and table; rescale is opt-in; all hidden shows a message', () => {
  const spec = {
    type: 'line',
    toggles: true,
    series: [{ name: 'Low', data: [[1, 1], [2, 2]] }, { name: 'High', data: [[1, 50], [2, 90]] }, { name: 'Mid', data: [[1, 5]] }]
  };
  const c = draw(spec);
  const low = () => dotsOf(c)[0].getAttribute('cy');
  const before = low();
  toggleLegend(legendButton(c, 'High'));
  assert.equal(legendInput(legendButton(c, 'High')).checked, false);
  assert.ok(legendButton(c, 'High').classList.contains('is-off'));
  assert.equal(dotsOf(c).length, 3, 'only Low and Mid are drawn');
  assert.equal(low(), before, 'the y axis stays put without rescale');
  c.fire('keydown', { key: 'Home' });
  assert.doesNotMatch(c.tip().textContent, /High/);
  assert.equal(c.api.visible('High'), false);

  click(byClass(c, 'op-chart-toggle')[0]);
  assert.deepEqual(c.host.all().filter((el) => el.tag === 'th').map((el) => el.textContent).slice(0, 3), ['', 'Low', 'Mid']);
  click(byClass(c, 'op-chart-toggle')[0]);

  const fitted = draw(Object.assign({ rescale: true }, spec));
  const fittedLow = () => dotsOf(fitted)[0].getAttribute('cy');
  const wide = fittedLow();
  fitted.api.visible('High', false);
  assert.notEqual(fittedLow(), wide, 'rescale fits the y axis to the series shown');

  c.api.visible('Low', false);
  c.api.visible('Mid', false);
  const empty = byClass(c, 'op-chart-empty')[0];
  assert.equal(empty.hidden, false);
  assert.match(empty.textContent, /Every series is hidden/);
  assert.equal(c.fire('keydown', { key: 'Home' }).defaultPrevented, false, 'nothing to read');
  toggleLegend(legendButton(c, 'Mid'));
  assert.equal(empty.hidden, true);
  assert.equal(dotsOf(c).length, 1);
  assert.equal(c.api.visible('Nope', false), false);
});

test('legend transitions retarget surviving bars and remove departing bars after they fade', () => {
  const spec = { type: 'bar', toggles: true, series: [
    { name: 'First', data: [['A', 2]] }, { name: 'Second', data: [['A', 5]] }
  ] };
  const clock = chartClock();
  const c = draw(spec, clock);
  const bars = () => byClass(c, 'op-chart-bar');
  const first = () => bars().at(-1).getAttribute('d');
  const before = bars()[0].getAttribute('d');
  toggleLegend(legendButton(c, 'Second'));
  assert.equal(first(), before);
  clock.tick(0);
  clock.tick(110);
  const middle = first();
  assert.notEqual(middle, before);
  assert.ok(+bars()[0].parentNode.getAttribute('opacity') < 1);
  toggleLegend(legendButton(c, 'Second'));
  assert.equal(bars()[0].getAttribute('d'), middle);
  clock.tick(110);
  clock.tick(350);
  assert.equal(bars()[0].getAttribute('d'), before);
  assert.equal(bars()[1].parentNode.getAttribute('opacity'), null);

  toggleLegend(legendButton(c, 'Second'));
  clock.tick(400);
  clock.tick(700);
  assert.equal(bars().length, 1);

  const still = chartClock(true);
  const reduced = draw(spec, still);
  toggleLegend(legendButton(reduced, 'Second'));
  assert.equal(byClass(reduced, 'op-chart-bar').length, 1);
  assert.equal(still.frames.size, 0);
});

const barSpec = { type: 'bar', series: [{ name: 'Runs', data: [{ x: 'a', y: 2, key: 'a' }, { x: 'b', y: 6, key: 'b' }] }] };
const barOf = (c, x) => byClass(c, 'op-chart-bar').find((el) => el.getAttribute('data-op-x') === x && !el.parentNode.getAttribute('pointer-events'));
const barD = (c, x) => barOf(c, x).getAttribute('d');

test('the entrance waits until the chart scrolls into view, grows bars and draws lines once, then stays put', () => {
  const clock = entranceClock();
  const c = draw(barSpec, clock);
  const final = barD(c, 'b');
  assert.ok(awaiting(c), 'marks stay hidden until seen');
  assert.equal(clock.frames.size, 0);
  clock.scrollTo(c.host);
  assert.ok(!awaiting(c));
  assert.equal(clock.watched.length, 0, 'watched only once');
  const start = barD(c, 'b');
  const ys = [...start.matchAll(/(?:V|,)(-?[\d.]+)/g)].map((m) => +m[1]);
  assert.equal(new Set(ys).size, 1, 'each bar starts flat on its baseline');
  clock.tick(0);
  clock.tick(350);
  assert.ok(![start, final].includes(barD(c, 'b')), 'mid-growth');
  clock.tick(700);
  assert.equal(barD(c, 'b'), final);
  assert.equal(clock.frames.size, 0);

  const lineClock = entranceClock();
  const line = draw({ series: [{ name: 'Loss', data: [[0, 3], [1, 2], [2, 1]] }] }, lineClock);
  lineClock.scrollTo(line.host);
  const path = byClass(line, 'op-chart-line')[0];
  assert.equal(path.getAttribute('pathLength'), '1');
  assert.equal(path.getAttribute('stroke-dashoffset'), '1', 'the line starts undrawn');
  assert.equal(dotsOf(line)[0].getAttribute('r'), '0', 'dots pop in from nothing');
  lineClock.tick(0);
  lineClock.tick(700);
  assert.equal(path.getAttribute('pathLength'), null);
  assert.equal(dotsOf(line)[0].getAttribute('r'), '4');
});

test('data-op-animate="false", motion: false, and reduced motion draw in place without waiting or tweening', () => {
  const clock = entranceClock();
  const env = setup(clock);
  const host = new Node('div');
  host.setAttribute('data-op-animate', 'false');
  env.document.body.appendChild(host);
  const api = env.chart(host, barSpec);
  assert.ok(!host.classList.contains('op-chart-await'));
  assert.equal(api.model().motion, false);
  api.update({ ...barSpec, series: [{ name: 'Runs', data: [{ x: 'a', y: 9, key: 'a' }] }] });
  assert.equal(clock.frames.size, 0);
  assert.equal(host.all().filter((el) => el.classList.contains('op-chart-bar')).length, 1, 'no departing bar lingers');

  const spec = draw({ ...barSpec, motion: false }, entranceClock());
  assert.ok(!awaiting(spec));
  const reducedClock = entranceClock(true);
  const reduced = draw(barSpec, reducedClock);
  assert.ok(!awaiting(reduced));
  reduced.api.update({ ...barSpec, series: [{ name: 'Runs', data: [{ x: 'a', y: 9, key: 'a' }] }] });
  assert.equal(reducedClock.frames.size, 0);
});

test('data updates tween each keyed bar from where it was drawn, fade new bars in, and remove departing ones', () => {
  const clock = chartClock();
  const c = draw(barSpec, clock);
  const oldB = barD(c, 'b');
  const next = { type: 'bar', series: [{ name: 'Runs', data: [
    { x: 'b', y: 3, key: 'b' }, { x: 'c', y: 4, key: 'c' }
  ] }] };
  assert.ok(c.api.update(next));
  assert.equal(barD(c, 'b'), oldB, 'b starts where it was, though it moved to the first category');
  assert.equal(barOf(c, 'c').getAttribute('opacity'), '0');
  const leaving = byClass(c, 'op-chart-bar').filter((el) => el.parentNode.getAttribute('pointer-events') === 'none');
  assert.deepEqual(leaving.map((el) => el.getAttribute('data-op-x')), ['a']);
  assert.equal(leaving[0].getAttribute(KEY), null, 'departing marks leave the selection group');
  clock.tick(0);
  clock.tick(120);
  assert.notEqual(barD(c, 'b'), oldB);
  clock.tick(240);
  assert.equal(barOf(c, 'c').getAttribute('opacity'), null);
  assert.deepEqual(byClass(c, 'op-chart-bar').map((el) => el.getAttribute('data-op-x')), ['b', 'c']);
  const settled = barD(c, 'b');
  c.api.update(next);
  assert.equal(clock.frames.size, 0, 'an unchanged redraw has nothing to move');
  assert.equal(barD(c, 'b'), settled);
});
