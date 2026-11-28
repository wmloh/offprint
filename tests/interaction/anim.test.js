const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../../offprint/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('anim.js'), context);
const anim = context.OffPrint._animationMath;
const json = (value) => JSON.parse(JSON.stringify(value));

test('easings start at 0, end at 1, and keep their shape', () => {
  for (const name of Object.keys(anim.easings)) {
    const ease = anim.easings[name];
    assert.ok(Math.abs(ease(0)) < 1e-9 && Math.abs(ease(1) - 1) < 1e-9, name);
  }
  assert.equal(anim.easings['ease-in-out'](0.5), 0.5);
  assert.ok(anim.easings['ease-in'](0.3) < 0.3 && anim.easings['ease-out'](0.3) > 0.3);
  assert.ok(anim.easings['back-out'](0.8) > 1);
  assert.equal(anim.easing('bounce'), anim.easings.ease);
  assert.match(warnings.at(-1), /Unknown easing "bounce"/);
});

test('lerp handles numbers, arrays, and strings with matching numbers', () => {
  assert.equal(anim.lerp(10, 20, 0.25), 12.5);
  assert.deepEqual(json(anim.lerp([0, 10], [10, 0], 0.5)), [5, 5]);
  assert.equal(anim.lerp('matrix(1 0 0 1 0 0)', 'matrix(0 1 -1 0 0 0)', 0.5), 'matrix(0.5 0.5 -0.5 0.5 0 0)');
  assert.equal(anim.lerp('red', 'blue', 0.5), 'red');
  assert.equal(anim.lerp('red', 'blue', 1), 'blue');
});

test('steps lay out end to end with delays, step durations, and caption-only steps', () => {
  const tl = anim.timeline([
    { label: 'A', actions: [{ draw: '#a' }, { fade: '#b', delay: 300, duration: 200 }] },
    { label: 'B', duration: 400, actions: [{ move: '#c', to: [5, 5] }] },
    { label: 'Pause' },
    [{ attr: '#d', name: 'r', to: 9, duration: 100 }]
  ], { duration: 1000 });
  assert.deepEqual(json(tl.ends), [1000, 1400, 1900, 2000]);
  assert.equal(tl.total, 2000);
  assert.deepEqual(json(tl.captions), ['A', 'B', 'Pause', '']);
  assert.deepEqual(json(tl.actions.map((a) => [a.kind, a.start, a.end])),
    [['draw', 0, 1000], ['fade', 300, 500], ['move', 1000, 1400], ['attr', 1900, 2000]]);
});

test('time maps to completed steps, the shown step, and progress', () => {
  const ends = [1000, 1400, 2000];
  const at = (t) => json(anim.locate(ends, t));
  assert.deepEqual(at(0), { done: 0, current: 0, progress: 0 });
  assert.deepEqual(at(500), { done: 0, current: 1, progress: 0.5 });
  assert.deepEqual(at(1000), { done: 1, current: 1, progress: 1 });
  assert.deepEqual(at(1100), { done: 1, current: 2, progress: 0.25 });
  assert.deepEqual(at(2000), { done: 3, current: 3, progress: 1 });
  assert.deepEqual(at(5000), { done: 3, current: 3, progress: 1 });
});

test('tracks chain missing from values and hold values between actions', () => {
  const tl = anim.timeline([[{ fade: '#x' }], [{ fade: '#x', to: 0.2 }], [{ move: '#x', to: [10, 0] }]],
    { duration: 100, easing: 'linear' });
  const fades = anim.chain(tl.actions.filter((a) => a.kind === 'fade'), 1);
  assert.deepEqual(json(fades.map((a) => [a.from, a.to])), [[0, 1], [1, 0.2]]);
  const at = (t) => Math.round(anim.value(fades, t) * 100) / 100;
  assert.deepEqual([0, 50, 100, 150, 200, 260].map(at), [0, 0.5, 1, 0.6, 0.2, 0.2]);

  const move = anim.chain(tl.actions.filter((a) => a.kind === 'move'), [0, 0]);
  assert.deepEqual(json(anim.value(move, 0)), [0, 0]);
  assert.deepEqual(json(anim.value(move, 250)), [5, 0]);

  const fadeOut = anim.chain([{ kind: 'fade', action: { to: 0 }, start: 0, end: 1, easing: anim.easings.linear }], 1);
  assert.deepEqual([fadeOut[0].from, fadeOut[0].to], [1, 0]);
});

test('animated step jumps play only the last step, forwards or backwards', () => {
  const ends = [1000, 1400, 2000];
  const route = (t, step) => json(anim.path(ends, t, step));
  assert.deepEqual([0, 1, 2, 3, 7].map((s) => anim.stepTime(ends, s)), [0, 1000, 1400, 2000, 2000]);
  assert.deepEqual(route(0, 1), { start: 0, goal: 1000 });
  assert.deepEqual(route(0, 3), { start: 1400, goal: 2000 });
  assert.deepEqual(route(1200, 2), { start: 1200, goal: 1400 });
  assert.deepEqual(route(2000, 0), { start: 1000, goal: 0 });
  assert.deepEqual(route(1200, 0), { start: 1000, goal: 0 });
  assert.deepEqual(route(500, 0), { start: 500, goal: 0 });
  assert.deepEqual(route(1400, 2), { start: 1400, goal: 1400 });
});

test('a mouse or pen crossing a stopped figure plays it unless paused or controlled by a step panel', () => {
  const base = { playing: false, held: false, stepDriven: false, pointer: 'mouse' };
  assert.equal(anim.hoverPlays(base), true);
  assert.equal(anim.hoverPlays({ ...base, pointer: 'pen' }), true);
  assert.equal(anim.hoverPlays({ ...base, pointer: 'touch' }), false);
  assert.equal(anim.hoverPlays({ ...base, playing: true }), false);
  assert.equal(anim.hoverPlays({ ...base, held: true }), false);
  assert.equal(anim.hoverPlays({ ...base, stepDriven: true }), false);
});

test('only chart filtering and chart playback alter timing for reduced motion', () => {
  const root = path.join(__dirname, '../../offprint');
  for (const dir of ['js', 'css']) {
    for (const file of fs.readdirSync(path.join(root, dir))) {
      // The generated runtime contains copies of the source modules checked here.
      if (dir === 'js' && ['chart.js', 'chart-playback.js', 'export-runtime.js'].includes(file)) continue;
      const source = fs.readFileSync(path.join(root, dir, file), 'utf8');
      assert.doesNotMatch(source, /prefers-reduced-motion|reducedMotion/, `${dir}/${file}`);
    }
  }
});
