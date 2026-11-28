const test = require('node:test');
const assert = require('node:assert/strict');
const { element, page } = require('../support/offline-page');

test('custom figures expose keyed animation state and committed zoom lifecycle events', async () => {
  const p = page({ config: { profile: 'none', features: { animation: true, zoom: true },
    options: { shortcuts: { 'zoom.close': 'q' } } } });
  const figure = p.body.appendChild(element('figure'));
  const svg = figure.appendChild(element('svg'));
  figure.querySelector = selector => selector === 'svg' ? svg : null;
  p.ids.set('custom-figure', figure);
  const events = [];
  figure.addEventListener('op:step', event => events.push([event.detail.key, event.detail.origin, event.bubbles]));
  let animation;
  p.OP.setup(OP => {
    animation = OP._animation.mount('custom-figure', { steps: [{ key: 'trace', label: 'Trace', actions: [] }] });
  });
  await p.start();
  assert.ok(animation);
  assert.equal(p.OP._animation.mount(figure), animation);
  assert.deepEqual({ ...animation.snapshot() }, { key: 'start', index: 0, count: 2, canPrev: false, canNext: true, playing: false });
  const steps = [];
  animation.subscribe((state, meta) => steps.push([state.key, meta.origin]));
  assert.equal(animation.select('unknown'), false);
  assert.equal(animation.select('trace'), true);
  animation.timeline.ends[0] = 0;
  assert.equal(animation.time, 400);
  assert.equal(animation.reset(), true);
  assert.deepEqual(steps, [['trace', 'api'], ['start', 'reset']]);
  assert.deepEqual(events, [['start', 'init', true], ['trace', 'api', true], ['start', 'reset', true]]);

  const zoom = p.OP._zoom;
  const observed = [];
  zoom.subscribe(state => observed.push(state ? figure.parentNode === state.stage : figure.parentNode === p.body));
  assert.equal(zoom.open('custom-figure'), true);
  const open = zoom.snapshot();
  assert.equal(zoom.open(figure), true);
  assert.equal(open.overlay.lastChild.getAttribute('aria-keyshortcuts'), 'Q');
  assert.equal(p.key('Escape', open.overlay).defaultPrevented, false);
  assert.equal(p.key('q', open.overlay).defaultPrevented, true);
  assert.equal(p.events.at(-1).type, 'op:zoom:closing');
  assert.equal(figure.parentNode, open.stage);
  open.overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.events.at(-1).type, 'op:zoom:change');
  assert.equal(p.events.at(-1).detail.current, null);
  assert.deepEqual(observed, [true, true]);
  assert.equal(p.body.focused, true);
});

test('diagram fullscreen requires an opt-in and opens from the background or keyboard', async () => {
  const p = page({ config: { profile: 'none', features: { zoom: true } } });
  const figures = ['op-timeline', 'op-sequence', 'op-tree-diagram', 'regular'].map((cls, i) => {
    const figure = p.body.appendChild(element('figure'));
    const background = figure.appendChild(element('div'));
    const control = figure.appendChild(element('button'));
    if (i === 0) figure.setAttribute('data-op-zoom', '');
    if (i === 1) figure.setAttribute('data-op-zoom', 'false');
    figure.matches = (selector) => selector === '.op-page img, .op-page figure';
    for (const target of [figure, background, control]) {
      target.closest = (selector) => {
        if (selector.includes('figure.' + cls) || selector.includes('.op-page figure')) return figure;
        return null;
      };
    }
    control.matches = (selector) => selector.split(', ').includes('button');
    return { figure, background, control };
  });
  p.body.querySelectorAll = (selector) => selector.startsWith('.op-page img') ? figures.map(({ figure }) => figure) : [];
  await p.start();
  assert.deepEqual(figures.map(({ figure }) => figure.classList.contains('op-zoomable')), [true, false, false, true]);
  p.click(figures[1].background);
  p.click(figures[2].background);
  p.click(figures[0].control);
  assert.equal(p.OP._zoom.snapshot(), null);
  p.click(figures[0].background);
  const open = p.OP._zoom.snapshot();
  assert.equal(open.target, figures[0].figure);
  assert.equal(open.target.parentNode, open.stage);
  p.OP._zoom.close();
  open.overlay.dispatchEvent(new Event('transitionend'));
  assert.equal(p.OP._zoom.snapshot(), null);
  assert.equal(p.key('Enter', figures[0].figure).defaultPrevented, true);
  assert.equal(p.OP._zoom.snapshot().target, figures[0].figure);
});
