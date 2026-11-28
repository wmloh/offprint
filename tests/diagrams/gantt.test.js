const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const name of ['core', 'detail', 'diagram', 'gantt']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../offprint/js', name + '.js'), 'utf8'), context);
}
const api = context.OffPrint._gantt;
// Copies results out of the VM realm so deep equality compares plain values.
const plain = value => JSON.parse(JSON.stringify(value));
const { ticks, route } = api;
const prepare = (records, settings) => api.prepare(plain(records), settings && plain(settings));
const DAY = 86400000;
const day = iso => Date.parse(iso);
const task = (scene, key) => scene.tasks.find(t => t.key === key);

test('Gantt dates use inclusive UTC end days, durations, numbers, and milestones', () => {
  const scene = prepare([
    { key: 'a', start: '2026-06-01', end: '2026-06-05' },
    { key: 'b', start: '2026-06-08', duration: 3, progress: '40%' },
    { key: 'm', start: '2026-06-11', milestone: true },
    { key: 'z', start: '2026-06-12', duration: 0 }
  ]);
  assert.equal(scene.date, true);
  assert.deepEqual([task(scene, 'a').start, task(scene, 'a').end], [day('2026-06-01'), day('2026-06-06')]);
  assert.equal(task(scene, 'b').end - task(scene, 'b').start, 3 * DAY);
  assert.equal(task(scene, 'b').progress, 40);
  assert.equal(task(scene, 'm').milestone, true);
  assert.equal(task(scene, 'z').milestone, true);
  assert.deepEqual([scene.min, scene.max], [day('2026-06-01'), day('2026-06-12')]);

  const numeric = prepare([{ key: 'a', start: 0, end: 4 }, { key: 'b', start: '4', duration: '2.5' }]);
  assert.equal(numeric.date, false);
  assert.equal(task(numeric, 'b').end, 6.5);

  assert.throws(() => prepare([{ key: 'a', start: 1, end: 3, duration: 2 }]), /end or a duration, not both/);
  assert.throws(() => prepare([{ key: 'a', start: '2026-06-01', duration: 1 }, { key: 'b', start: 3, end: 4 }]), /mixes numbers and dates/);
  assert.throws(() => prepare([{ key: 'a', start: 5, end: 3 }]), /ends before it starts/);
  assert.throws(() => prepare([{ key: 'a', start: 1 }]), /end, a duration, or the milestone flag/);
  assert.throws(() => prepare([{ key: 'a', start: 1, end: 2, progress: 120 }]), /0 to 100/);
  assert.throws(() => prepare([{ key: 'a', start: '2026-02-30', duration: 1 }]), /ISO date/);
});

test('Gantt dependency types and lags constrain the right ends and report unmet links', () => {
  const scene = prepare([
    { key: 'p', start: 0, end: 4 },
    { key: 'fs', start: 6, end: 8, depends: 'p:FS+2' },
    { key: 'ss', start: 1, end: 3, depends: [{ key: 'p', type: 'SS', lag: 1 }] },
    { key: 'ff', start: 2, end: 5, depends: 'p:FF+1' },
    { key: 'sf', start: 0, end: 1, depends: 'p:SF+2' },
    { key: 'late', start: 3, end: 5, depends: 'p' }
  ]);
  const unmet = Object.fromEntries(scene.links.map(link => [link.to.key, link.unmet]));
  assert.deepEqual(unmet, { fs: false, ss: false, ff: false, sf: true, late: true });
  assert.deepEqual(plain(scene.links.map(link => [link.type, link.lagUnits])),
    [['FS', 2], ['SS', 1], ['FF', 1], ['SF', 2], ['FS', 0]]);
  assert.deepEqual(plain(scene.unmet.map(link => link.to.key)), ['sf', 'late']);
  // Unmet links push the earliest dates later in the float calculation.
  assert.deepEqual([task(scene, 'late').es, task(scene, 'late').ef], [4, 6]);
  assert.deepEqual([task(scene, 'sf').es, task(scene, 'sf').ef], [1, 2]);

  const dated = prepare([
    { key: 'a', start: '2026-06-01', end: '2026-06-05' },
    { key: 'b', start: '2026-06-06', end: '2026-06-07', depends: 'a' },
    { key: 'c', start: '2026-06-09', end: '2026-06-09', depends: 'b:FS+1' }
  ]);
  assert.deepEqual(plain(dated.links.map(link => link.unmet)), [false, false]);
  assert.equal(dated.links[1].lag, DAY);
  assert.throws(() => prepare([{ key: 'a', start: 0, end: 1, depends: 'a:XX' }]), /invalid dependency/);
  assert.throws(() => prepare([{ key: 'a', start: 0, end: 1, depends: 'ghost' }]), /unknown task "ghost"/);
});

test('Gantt total float and the critical path follow the longest dependency chain', () => {
  const scene = prepare([
    { key: 'design', start: 0, end: 3 },
    { key: 'build', start: 3, end: 8, depends: 'design' },
    { key: 'docs', start: 3, end: 5, depends: 'design' },
    { key: 'test', start: 8, end: 10, depends: 'build docs' },
    { key: 'side', start: 0, end: 2 },
    { key: 'ship', start: 10, milestone: true, depends: 'test' }
  ]);
  const floats = Object.fromEntries(scene.tasks.map(t => [t.key, t.floatUnits]));
  assert.deepEqual(floats, { design: 0, build: 0, docs: 3, test: 0, side: 8, ship: 0 });
  assert.deepEqual(plain(scene.tasks.filter(t => t.critical).map(t => t.key)), ['design', 'build', 'test', 'ship']);
  assert.deepEqual(plain(scene.links.filter(l => l.critical).map(l => l.from.key + '>' + l.to.key)),
    ['design>build', 'build>test', 'test>ship']);
  assert.equal(scene.finish, 10);

  // Start-to-start and finish-to-finish links pass float back through their own ends.
  const overlap = prepare([
    { key: 'a', start: 0, end: 6 },
    { key: 'b', start: 2, end: 9, depends: 'a:SS+2' },
    { key: 'c', start: 0, end: 4 },
    { key: 'd', start: 5, end: 9, depends: 'c:FF+5' }
  ]);
  assert.deepEqual(plain(overlap.tasks.map(t => t.floatUnits)), [0, 0, 0, 0]);
});

test('Gantt rejects dependency cycles by naming them', () => {
  assert.throws(() => prepare([
    { key: 'a', start: 0, end: 1, depends: 'c' },
    { key: 'b', start: 1, end: 2, depends: 'a' },
    { key: 'c', start: 2, end: 3, depends: 'b' }
  ]), /cycle: c → b → a → c|cycle: a → c → b → a/);
  assert.throws(() => prepare([{ key: 'a', start: 0, end: 1, depends: 'a' }]), /cycle: a → a/);
});

test('Gantt group rows gather their tasks, derive spans, and cap rows', () => {
  const scene = prepare([
    { key: 'plan', start: 0, end: 2 },
    { key: 'api', start: 2, end: 6, group: 'Build' },
    { key: 'review', start: 6, end: 7 },
    { key: 'ui', start: 1, end: 9, group: 'Build' }
  ], { collapsed: ['Build', 'Missing'] });
  assert.deepEqual(plain(scene.rows.map(row => row.key)), ['plan', 'Build', 'api', 'ui', 'review']);
  const group = scene.groups.get('Build');
  assert.deepEqual(plain([group.start, group.end, group.children]), [1, 9, [2, 3]]);
  assert.deepEqual(plain(scene.collapsed), ['Build']);
  assert.throws(() => prepare([{ key: 'Build', start: 0, end: 1 }, { key: 'x', start: 0, end: 1, group: 'Build' }]),
    /same key as a task/);
  const many = Array.from({ length: 61 }, (_, i) => ({ key: 'k' + i, start: i, end: i + 1 }));
  assert.throws(() => prepare(many), /at most 60 rows/);
});

test('Gantt axes and arrows stay readable', () => {
  assert.deepEqual(Array.from(ticks(0, 10, false), t => t.label), ['0', '2', '4', '6', '8', '10']);
  const weeks = Array.from(ticks(day('2026-06-01'), day('2026-07-20'), true), t => t.label);
  assert.deepEqual(weeks, ['1 Jun', '8 Jun', '15 Jun', '22 Jun', '29 Jun', '6 Jul', '13 Jul', '20 Jul']);
  const months = Array.from(ticks(day('2026-10-15'), day('2027-03-01'), true), t => t.label);
  assert.deepEqual(months, ['Nov', 'Dec', 'Jan 2027', 'Feb', 'Mar']);
  // Finish-to-start with room bends once; without room it doubles back between the rows.
  assert.deepEqual(Array.from(route(100, 15, 1, 200, 45, 1), p => Array.from(p)), [[100, 15], [108, 15], [108, 45], [200, 45]]);
  assert.equal(route(200, 15, 1, 150, 45, 1).length, 6);
  assert.deepEqual(Array.from(route(100, 15, -1, 150, 45, 1), p => p[0]), [100, 92, 92, 150]);
});
