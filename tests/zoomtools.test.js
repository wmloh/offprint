const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const source = read('zoomtools.js');
const core = read('core.js');

// Just enough DOM for zoomtools.js: elements, simple selectors, cloning, and events.
class El extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = /^(svg|g|line|path|circle|clipPath|use)$/.test(tag) ? tag : tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.hidden = false;
    this.rect = null;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    const el = this;
    this.classList = {
      set: () => new Set((el.getAttribute('class') || '').split(/\s+/).filter(Boolean)),
      add: (n) => { const s = el.classList.set(); s.add(n); el.setAttribute('class', [...s].join(' ')); },
      remove: (n) => { const s = el.classList.set(); s.delete(n); el.setAttribute('class', [...s].join(' ')); },
      toggle: (n, on) => (on ? el.classList.add(n) : el.classList.remove(n)),
      contains: (n) => el.classList.set().has(n)
    };
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  set className(v) { this.setAttribute('class', v); }
  set innerHTML(v) { this.html = v; }
  get textContent() { return (this.text || '') + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.text = String(v); }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
  contains(el) { return this === el || this.descendants().includes(el); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  matches(selector) {
    return selector.split(',').map((s) => s.trim()).some((s) => s === '*' ||
      (s[0] === '.' ? this.classList.contains(s.slice(1)) : s.toLowerCase() === this.tagName.toLowerCase()));
  }
  querySelectorAll(selector) { return this.descendants().filter((el) => el.matches(selector)); }
  closest() { return null; }
  cloneNode() {
    const copy = new El(this.tagName.toLowerCase());
    copy.tagName = this.tagName;
    this.attrs.forEach((v, k) => copy.attrs.set(k, v));
    copy.text = this.text;
    copy.value = this.value;
    this.children.forEach((c) => copy.appendChild(c.cloneNode(true)));
    return copy;
  }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get offsetWidth() { return 80; }
  get offsetHeight() { return 30; }
  setPointerCapture() {}
}

function setup(chartHit, timelineHit) {
  const document = new EventTarget();
  document.createElement = (tag) => new El(tag);
  document.createElementNS = (_, tag) => new El(tag);
  const frames = [];
  const observers = [];
  const time = { now: 1000 };
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); this.on = false; }
    observe() { this.on = true; }
    disconnect() { this.on = false; }
  }
  const api = {
    _all: (selector, scope) => scope.querySelectorAll(selector),
    _chart: chartHit ? {
      get: (host) => host.classList.contains('df-chart') ? {
        coords: chartHit,
        model: () => ({ x: { label: 'Time' }, y: { label: '' } })
      } : null
    } : undefined
  };
  if (timelineHit) {
    api._timeline = { get: () => ({}), coords: (host, x, y) => timelineHit(x, y) };
  }
  const context = vm.createContext({
    document, MutationObserver, Map, Set,
    performance: { now: () => time.now }, innerWidth: 1920, innerHeight: 1080,
    requestAnimationFrame: (fn) => frames.push(fn), cancelAnimationFrame() {}
  });
  context.window = context;
  vm.runInContext(core, context);
  Object.assign(context.DocForm, api);
  vm.runInContext(source, context);
  const tools = context.DocForm._zoomTools;

  const overlay = new El('div');
  overlay.className = 'df-zoom';
  const target = new El('figure');
  target.className = 'df-zoomed';
  target.rect = { left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300 };
  overlay.appendChild(target);

  const find = (cls) => overlay.descendants().find((el) => el.classList.contains(cls));
  const findAll = (cls) => overlay.descendants().filter((el) => el.classList.contains(cls));
  const open = () => document.dispatchEvent(new CustomEvent('df:zoomopen', { detail: { target, overlay, stage: overlay } }));
  const close = () => document.dispatchEvent(new CustomEvent('df:zoomclose'));
  const key = (k, props = {}) => {
    const event = new Event('keydown', { cancelable: true });
    document.dispatchEvent(Object.assign(event, { key: k }, props));
    return event;
  };
  const pointer = (el, type, x, y, props = {}) => {
    const event = new Event(type, { cancelable: true, bubbles: true });
    el.dispatchEvent(Object.assign(event, { clientX: x, clientY: y, button: 0, pointerId: 1 }, props));
    return event;
  };
  const tick = () => { const run = frames.splice(0); run.forEach((fn) => fn()); };
  const pressed = () => findAll('df-zoomtools-btn').filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('data-tool'));
  return { tools, document, overlay, target, find, findAll, open, close, key, pointer, tick, pressed, observers, time };
}

test('magnification stays within bounds, and laser traces are smooth and fade after release', () => {
  const { tools } = setup();
  assert.deepEqual([...tools.tools], ['cursor', 'magnifier', 'laser', 'pen', 'highlighter', 'measure', 'eraser']);

  let z = tools.limits.start;
  for (let i = 0; i < 20; i++) z = tools.magnify(z, -1);
  assert.equal(z, tools.limits.max);
  for (let i = 0; i < 20; i++) z = tools.magnify(z, 1);
  assert.equal(z, tools.limits.min);
  assert.equal(tools.magnify(2, 0), 2);

  assert.deepEqual([0, 500, 1000, 2000].map((t) => tools.fade(0, t, 1000)), [1, 0.75, 0, 0]);
  assert.equal(tools.smoothPath([[0, 0], [10, 0], [10, 10]]), 'M0,0Q10,0 10,5L10,10', 'curves end at the pointer');
  assert.equal(tools.smoothPath([[0, 0], [5, 5]]), 'M0,0L5,5');

  assert.deepEqual(JSON.parse(JSON.stringify(tools.snap({ x: 0, y: 0 }, { x: 30, y: 4 }))), { x: 30, y: 0 });
  assert.equal(tools.rulerText(tools.measure({ x: 0, y: 0 }, { x: 30, y: -40 }), 'units'), '50 units (Δx 30, Δy 40)');
});

test('ink strokes add, undo, and clear, and a fresh state starts at the cursor with no ink', () => {
  const { tools } = setup();
  const state = tools.createState();
  assert.equal(tools.begin(state, 0, 0), null, 'the cursor does not draw');
  assert.equal(tools.select(state, 'pen'), true);
  assert.equal(tools.select(state, 'pen'), false);
  assert.equal(tools.select(state, 'spotlight'), false);
  tools.begin(state, 0, 0);
  assert.equal(tools.extend(state, 1, 1), false, 'tiny moves are skipped');
  assert.equal(tools.extend(state, 10, 0), true);
  tools.end(state);
  tools.select(state, 'highlighter');
  tools.begin(state, 5, 5);
  tools.select(state, 'cursor');
  assert.equal(state.strokes.length, 2, 'switching tools finishes the stroke in progress');
  assert.deepEqual([...state.strokes].map((s) => [s.tool, s.color]), [['pen', 'red'], ['highlighter', 'yellow']]);
  assert.equal(tools.pathOf(state.strokes[0].points), 'M0,0L10,0');
  assert.equal(tools.pathOf([[3, 4]]), 'M3,4l0.01,0');
  assert.equal(tools.undo(state).stroke.tool, 'highlighter');
  assert.equal(tools.clear(state), 1);
  assert.equal(tools.undo(state), null);
  const fresh = tools.createState();
  assert.equal(fresh.tool, 'cursor');
  assert.equal(fresh.zoom, tools.limits.start);
  assert.equal(fresh.strokes.length, 0);
});

test('the eraser removes whole strokes it touches, counting their width, and undo restores them in place', () => {
  const { tools } = setup();
  const state = tools.createState();
  const draw = (tool, points) => {
    tools.select(state, tool);
    tools.begin(state, ...points[0]);
    points.slice(1).forEach((p) => tools.extend(state, ...p));
    tools.end(state);
  };
  draw('pen', [[0, 0], [100, 0]]);
  draw('highlighter', [[0, 50], [100, 50]]);
  draw('pen', [[0, 100], [100, 100]]);
  const names = () => [...state.strokes].map((s) => s.points[0][1]);

  assert.equal(tools.erase(state, [50, 20], [50, 20], 8, []), 0, 'a near miss keeps the pen line');
  assert.equal(tools.erase(state, [50, 34], [50, 34], 8, []), 1, 'the highlighter width counts');
  assert.deepEqual(names(), [0, 100]);
  draw('pen', [[0, 50], [100, 50]]);
  const erased = [];
  assert.equal(tools.erase(state, [-20, -20], [120, 120], 8, erased), 3, 'a fast sweep touches everything it crosses');
  state.history.push({ erased });
  assert.deepEqual(names(), []);
  tools.undo(state);
  assert.deepEqual(names(), [0, 100, 50], 'undo restores erased strokes in their order');
  tools.undo(state);
  assert.deepEqual(names(), [0, 100], 'then undoes the last drawn stroke');
  assert.equal(tools.touches({ width: 3, points: [[10, 10]] }, [0, 0], [20, 0], 8), false);
  assert.equal(tools.touches({ width: 3, points: [[10, 9]] }, [0, 0], [20, 0], 8), true, 'a dot counts');
});

test('clones rename ids and their references, drop linking attributes and scripts, and stay inert', () => {
  const { tools } = setup();
  const fig = new El('figure');
  const svg = fig.appendChild(new El('svg'));
  const clip = svg.appendChild(new El('clipPath'));
  clip.setAttribute('id', 'df-chart-clip-1');
  const line = svg.appendChild(new El('path'));
  line.setAttribute('clip-path', 'url(#df-chart-clip-1)');
  line.setAttribute('style', 'fill: url("#other")');
  const use = svg.appendChild(new El('use'));
  use.setAttribute('href', '#df-chart-clip-1');
  const input = fig.appendChild(new El('input'));
  input.setAttribute('name', 'mode');
  input.setAttribute('onclick', 'go()');
  input.setAttribute('aria-describedby', 'note');
  fig.appendChild(new El('script'));

  const copy = tools.prepareClone(fig.cloneNode(true), 'df-lens-1-');
  const [cSvg, cInput] = copy.children;
  assert.equal(cSvg.children[0].getAttribute('id'), 'df-lens-1-df-chart-clip-1');
  assert.equal(cSvg.children[1].getAttribute('clip-path'), 'url(#df-lens-1-df-chart-clip-1)');
  assert.equal(cSvg.children[1].getAttribute('style'), 'fill: url("#other")', 'outside references stay');
  assert.equal(cSvg.children[2].getAttribute('href'), '#df-lens-1-df-chart-clip-1');
  assert.deepEqual(cInput.attributes, []);
  assert.equal(copy.children.length, 2, 'scripts are dropped');
  assert.equal(copy.getAttribute('aria-hidden'), 'true');
  assert.equal(copy.getAttribute('inert'), '');
  assert.equal(clip.getAttribute('id'), 'df-chart-clip-1', 'the original keeps its ids');

  let made = 0;
  const sync = tools.lensSync(() => made++);
  assert.equal(sync.frame(400, 300), true);
  assert.equal(sync.frame(400, 300), false);
  sync.mark();
  assert.equal(sync.frame(400, 300), true);
  assert.equal(sync.frame(420, 300), true, 'a resize re-clones');
  assert.equal(made, 3);
});

test('the zoom view shows the pill with the cursor chosen, and number keys switch tools until it closes', () => {
  const z = setup();
  assert.equal(z.tools.active(), null);
  z.open();
  assert.ok(z.find('df-zoomtools'));
  assert.equal(z.tools.active(), 'cursor');
  assert.deepEqual(z.pressed(), ['cursor']);
  assert.equal(z.key('3').defaultPrevented, true);
  assert.deepEqual(z.pressed(), ['laser']);
  assert.ok(z.overlay.classList.contains('is-tool-laser'));
  assert.equal(z.key('3', { ctrlKey: true }).defaultPrevented, false, 'modified keys are left alone');
  z.findAll('df-zoomtools-btn').find((b) => b.getAttribute('data-tool') === 'magnifier').dispatchEvent(new Event('click'));
  assert.equal(z.tools.active(), 'magnifier');
  assert.equal(z.find('df-zoomtools-zoom').hidden, false);

  z.close();
  assert.equal(z.tools.active(), null);
  assert.equal(z.find('df-zoomtools'), undefined);
  assert.equal(z.overlay.classList.contains('is-tool-magnifier'), false);
  assert.equal(z.key('4').defaultPrevented, false, 'shortcuts end with the view');
  z.open();
  assert.equal(z.tools.active(), 'cursor', 'each view opens with the cursor');
});

test('the magnifier zooms with the wheel within bounds and re-clones the figure after it changes', () => {
  const z = setup();
  const label = z.target.appendChild(new El('span'));
  label.setAttribute('id', 'value');
  label.text = '1';
  z.open();
  z.key('2');
  const wheel = (deltaY) => {
    const event = new Event('wheel', { cancelable: true });
    z.overlay.dispatchEvent(Object.assign(event, { deltaY }));
    return event;
  };
  assert.equal(wheel(-100).defaultPrevented, true);
  for (let i = 0; i < 10; i++) wheel(-100);
  assert.equal(z.find('df-zoomtools-zoom').textContent, '6×');
  for (let i = 0; i < 10; i++) z.key('[');
  assert.equal(z.find('df-zoomtools-zoom').textContent, '1.5×');

  z.pointer(z.overlay, 'pointermove', 50, 50);
  z.tick();
  assert.equal(z.find('df-zoomtools-lens').hidden, true, 'no lens off the figure');
  assert.equal(z.overlay.classList.contains('is-lens-on'), false, 'the cursor shows off the figure');
  z.pointer(z.overlay, 'pointermove', 300, 250);
  z.tick();
  assert.equal(z.overlay.classList.contains('is-lens-on'), true, 'the cursor hides behind the lens');
  const view = z.find('df-zoomtools-lens-view');
  const first = view.children[0];
  assert.equal(z.find('df-zoomtools-lens').hidden, false);
  assert.equal(first.textContent, '1');
  assert.match(first.children[0].getAttribute('id'), /^df-lens-\d+-value$/);
  assert.equal(first.style.width, '400px');
  z.tick();
  assert.equal(view.children[0], first, 'an unchanged figure keeps its clone');
  label.text = '2';
  z.observers.filter((o) => o.on).forEach((o) => o.fn([]));
  z.tick();
  assert.notEqual(view.children[0], first);
  assert.equal(view.children[0].textContent, '2');

  z.key('1');
  assert.equal(view.children.length, 0, 'leaving the magnifier drops the clone');
  assert.equal(z.observers.some((o) => o.on), false);
  z.close();
  z.open();
  z.key('2');
  assert.equal(z.find('df-zoomtools-zoom').textContent, '2.5×', 'magnification resets on reopen');
});

test('the laser shows a ring while hovering and draws a trace while held that fades after release', () => {
  const z = setup();
  z.open();
  z.key('3');
  const layer = z.find('df-zoomtools-layer');
  const ring = z.find('df-zoomtools-ring');
  const dot = z.find('df-zoomtools-laser');
  const traces = () => z.find('df-zoomtools-trail').children;
  z.pointer(z.overlay, 'pointermove', 120, 120);
  assert.equal(ring.hidden, false);
  assert.equal(dot.hidden, true);
  assert.equal(traces().length, 0, 'hovering leaves no trail');

  const down = z.pointer(layer, 'pointerdown', 120, 120);
  assert.equal(down.defaultPrevented, true, 'the press does not reach the figure');
  z.pointer(z.overlay, 'pointermove', 140, 120);
  z.pointer(z.overlay, 'pointermove', 140, 140);
  assert.equal(ring.hidden, true);
  assert.equal(dot.hidden, false);
  assert.equal(traces().length, 1);
  assert.equal(traces()[0].children[2].getAttribute('d'), 'M120,120Q140,120 140,130L140,140');
  z.time.now += 5000;
  z.tick();
  assert.equal(traces().length, 1, 'a held trace persists');

  z.pointer(layer, 'pointerup', 140, 140);
  assert.equal(ring.hidden, false);
  z.pointer(layer, 'pointerdown', 200, 200);
  z.pointer(layer, 'pointerup', 200, 200);
  z.time.now += 1000;
  z.tick();
  assert.equal(traces().length, 2, 'an earlier trace keeps fading beside a new one');
  assert.ok(+traces()[0].getAttribute('opacity') < 1);
  z.time.now += 2000;
  z.tick();
  assert.equal(traces().length, 0, 'faded traces are removed');
});

test('pen ink draws on the layer, undoes, and is discarded when the view closes', () => {
  const z = setup();
  z.open();
  assert.equal(z.find('df-zoomtools-group').hidden, true);
  z.key('4');
  assert.equal(z.find('df-zoomtools-group').hidden, false);
  const draw = (x) => {
    const layer = z.find('df-zoomtools-layer');
    z.pointer(layer, 'pointerdown', x, 10);
    z.pointer(z.overlay, 'pointermove', x + 40, 30);
    z.pointer(layer, 'pointerup', x + 40, 30);
  };
  draw(10);
  z.findAll('df-zoomtools-swatch').find((b) => b.getAttribute('data-color') === 'blue').dispatchEvent(new Event('click'));
  draw(100);
  const paths = () => z.find('df-zoomtools-ink').children;
  assert.equal(paths().length, 2);
  assert.equal(paths()[0].getAttribute('d'), 'M10,10L50,30');
  assert.equal(paths()[1].style.stroke, 'var(--df-blue)');
  z.key('1');
  assert.equal(z.find('df-zoomtools-group').hidden, false, 'Undo and Clear stay while ink shows');
  assert.equal(z.key('z', { ctrlKey: true }).defaultPrevented, true);
  assert.equal(paths().length, 1);
  z.close();
  z.open();
  assert.equal(z.find('df-zoomtools-ink').children.length, 0);
  assert.equal(z.find('df-zoomtools-group').hidden, true);
  z.key('4');
  draw(0);
  assert.equal(z.find('df-zoomtools-ink').children[0].style.stroke, 'var(--df-blue)', 'the chosen colour is remembered');

  const eraser = z.findAll('df-zoomtools-btn').find((b) => b.getAttribute('data-tool') === 'eraser');
  const group = z.find('df-zoomtools-group');
  assert.equal(group.children[0], eraser, 'the eraser sits left of the swatches');
  assert.equal(eraser.hidden, false);
  z.key('5');
  draw(0);
  assert.equal(z.key('7').defaultPrevented, true);
  assert.equal(z.tools.active(), 'eraser');
  assert.equal(eraser.getAttribute('aria-pressed'), 'true');
  assert.equal(z.find('df-zoomtools-swatches').hidden, true);
  const layer = z.find('df-zoomtools-layer');
  z.pointer(layer, 'pointerdown', 20, -40);
  z.pointer(z.overlay, 'pointermove', 20, 80);
  z.pointer(layer, 'pointerup', 20, 80);
  assert.equal(z.find('df-zoomtools-ink').children.length, 0, 'one sweep erases both crossed strokes');
  z.key('z', { ctrlKey: true });
  assert.equal(z.find('df-zoomtools-ink').children.length, 2, 'undo brings the erased strokes back');
  z.key('7');
  assert.equal(z.tools.active(), 'highlighter', 'E returns to the last ink tool');
  z.key('1');
  assert.equal(eraser.hidden, true, 'the eraser shows only with ink tools');
  assert.equal(z.key('7').defaultPrevented, false);
});

test('on charts the measure tool is a crosshair that reads data coordinates; elsewhere it is a ruler', () => {
  const calls = [];
  const z = setup((x, y) => {
    calls.push([x, y]);
    return x > 200 ? { x: 1, y: 2, xText: '2026-11-10 01:00 UTC', yText: '42.5%', plot: { left: 150, right: 450, top: 120, bottom: 380 } } : null;
  });
  const host = z.target.appendChild(new El('div'));
  host.className = 'df-chart';
  z.open();
  const measure = z.findAll('df-zoomtools-btn').find((b) => b.getAttribute('data-tool') === 'measure');
  assert.equal(measure.getAttribute('aria-label'), 'Crosshair');
  z.key('6');
  assert.equal(z.overlay.classList.contains('is-tool-ruler'), false);
  z.pointer(z.overlay, 'pointermove', 300, 200);
  const readout = z.find('df-zoomtools-readout');
  assert.equal(readout.hidden, false);
  assert.equal(readout.textContent, 'Time2026-11-10 01:00 UTCy42.5%');
  const lines = z.find('df-zoomtools-measure').children.map((l) => ['x1', 'x2', 'y1', 'y2'].map((a) => +l.getAttribute(a)));
  assert.deepEqual(lines, [[300, 300, 120, 380], [150, 450, 200, 200]]);
  z.pointer(z.overlay, 'pointermove', 160, 200);
  assert.equal(readout.hidden, true, 'outside the plot there is no readout');
  assert.equal(z.find('df-zoomtools-measure').children.length, 0);
  z.close();

  const plain = setup();
  plain.open();
  const ruler = plain.findAll('df-zoomtools-btn').find((b) => b.getAttribute('data-tool') === 'measure');
  assert.equal(ruler.getAttribute('aria-label'), 'Ruler');
  plain.key('6');
  assert.ok(plain.overlay.classList.contains('is-tool-ruler'));
  const layer = plain.find('df-zoomtools-layer');
  plain.pointer(layer, 'pointerdown', 10, 10);
  plain.pointer(plain.overlay, 'pointermove', 40, 50);
  plain.pointer(layer, 'pointerup', 40, 50);
  plain.pointer(plain.overlay, 'pointermove', 400, 400);
  assert.equal(plain.find('df-zoomtools-readout').textContent, '50 px (Δx 30, Δy 40)', 'the ruler stays after release');
});

test('timeline crosshairs read the axis and lane while sequence and tree use presentation tools', () => {
  const z = setup(null, (x, y) => x > 200 && {
    label: 'Date', value: '2028-02-29', lane: 'Writing', plot: { left: 150, right: 450, top: 120, bottom: 380 }
  });
  z.target.className = 'df-timeline';
  z.open();
  assert.equal(z.tools.use('measure'), true);
  z.pointer(z.overlay, 'pointermove', 300, 200);
  assert.equal(z.find('df-zoomtools-readout').textContent, 'Date2028-02-29LaneWriting');
  assert.equal(z.find('df-zoomtools-measure').children.length, 2);
  z.pointer(z.overlay, 'pointermove', 180, 200);
  assert.equal(z.find('df-zoomtools-readout').hidden, true);
  z.close();

  for (const diagram of ['df-sequence', 'df-tree-diagram']) {
    z.target.className = diagram;
    z.open();
    assert.deepEqual(z.findAll('df-zoomtools-btn').map((b) => b.getAttribute('data-tool')).filter(Boolean),
      ['cursor', 'magnifier', 'laser', 'pen', 'highlighter', 'eraser']);
    assert.equal(z.key('6').defaultPrevented, false);
    assert.equal(z.tools.use('measure'), false);
    z.close();
  }
});
