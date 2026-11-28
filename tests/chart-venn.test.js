const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
context.window = context;
for (const file of ['core.js', 'chart.js', 'data.js', 'chart-venn.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8'), context);
}
const chart = context.OffPrint._chart;
const { classify, geometry } = chart._venn;
const plain = value => JSON.parse(JSON.stringify(value));
const sets = ['A', 'B', 'C'].map(key => ({ key }));
const masks = count => Array.from({ length: (1 << count) - 1 }, (_, i) => i + 1);
const enabled = (pattern, mask) => Boolean(pattern & (1 << (mask - 1)));
const project = (mask, groups) => Array.from(groups).reduce((sum, group, i) => mask & (1 << i) ? sum | group : sum, 0);
const names = (mask, count) => sets.slice(0, count).filter((_, i) => mask & (1 << i)).map(set => set.key);

test('Venn derives exclusive counts and capped member lists from deduplicated identifiers', () => {
  const model = chart.specModel({
    type: 'venn',
    sets: [
      { key: 'A', members: ['solo', 'solo', 'pair', 12, 'all', ...Array.from({ length: 10 }, (_, i) => 'id' + i)] },
      { key: 'B', members: ['pair', '12', 'all'] },
      { key: 'C', members: ['all', 'other'] }
    ],
    regionOptions: [{ sets: ['C', 'B', 'A'], key: 'shared', revealStep: 'all' }]
  });
  assert.deepEqual(plain(model.errors), []);
  const regions = model.venn.regions;
  assert.deepEqual(plain(regions.map(region => region.count)), [11, 0, 2, 1, 0, 0, 1]);
  assert.deepEqual(plain(regions[2].members), ['pair', '12']);
  assert.equal(regions[0].members.length, 8);
  assert.deepEqual([regions[6].key, regions[6].revealStep], ['shared', 'all']);
  assert.equal(model.series[0].points[6].key, 'shared');
});

test('Venn classifies and draws every two- and three-set emptiness pattern', () => {
  const unsupported = [20, 22, 30, 52, 53, 55, 67, 75, 77, 79, 84, 86, 116, 117];
  const orders = [[1, 2, 4], [1, 4, 2], [2, 1, 4], [2, 4, 1], [4, 1, 2], [4, 2, 1]];
  const fallback3 = new Set(unsupported.flatMap(pattern => orders.map(order =>
    masks(3).reduce((bits, mask) => enabled(pattern, mask) ? bits | (1 << (project(mask, order) - 1)) : bits, 0))));

  for (const count of [2, 3]) {
    for (let pattern = 0; pattern < 1 << masks(count).length; pattern++) {
      const label = count + ' sets, pattern ' + pattern;
      const layout = classify(count, pattern);
      const expectedFallback = count === 3 && fallback3.has(pattern);
      assert.equal(layout.fallback, expectedFallback, label);
      const shape = geometry(layout.circles);
      const drawn = Array.from(shape.regions).filter(region => region.loops.length);
      assert.deepEqual(drawn.map(region => project(region.mask, layout.groups)).sort((a, b) => a - b),
        masks(count).filter(mask => expectedFallback || enabled(pattern, mask)), label);
      for (const region of drawn) {
        const { x, y, gap } = region.anchor;
        assert.ok(gap > 0, label);
        assert.equal(Array.from(layout.circles).reduce((mask, [cx, cy, r], i) =>
          Math.hypot(x - cx, y - cy) < r ? mask | (1 << i) : mask, 0), region.mask, label);
        for (const loop of region.loops) {
          assert.ok(loop.every((edge, i) => edge.end === loop[(i + 1) % loop.length].start), label);
        }
      }
    }
  }
  assert.deepEqual(plain(classify(3, 64).groups), [7], 'equal nonempty sets share a circle');
  assert.deepEqual(plain(classify(3, 1).empty), [1, 2]);
  assert.deepEqual(plain(classify(3, 0).circles), []);
  assert.ok(geometry(classify(2, 5).circles).regions[0].loops.length === 2, 'a nested set leaves a hole');
});

test('Venn keys are stable under tuple and set reordering, and authors can override them', () => {
  const regions = [{ sets: ['C', 'A'], count: 5, key: 'both' }, { sets: ['B', 'A'], count: '0' }];
  const keys = (sets, regions) => {
    const model = chart.specModel({ type: 'venn', sets, regions });
    assert.deepEqual(plain(model.errors), []);
    return Object.fromEntries(Array.from(model.venn.regions, region => [JSON.stringify(region.sets), region.key]));
  };
  const original = keys(sets, regions);
  assert.equal(original['["A","C"]'], 'both');
  assert.equal(original['["A","B"]'], 'region:["A","B"]');
  assert.deepEqual(original, keys(sets.toReversed(), regions.map(region => ({ ...region, sets: region.sets.toReversed() }))));
  const punctuation = [{ key: 'A,B' }, { key: '"C"' }, { key: 'A' }];
  const distinct = Object.values(keys(punctuation, []));
  assert.equal(new Set(distinct).size, 7);
});

test('Venn rejects ambiguous input and maps delimited or JSON region fields', () => {
  const validate = (regions, options) => chart.validate({ type: 'venn', sets, regions, ...options }).join(' ');
  assert.match(validate([{ sets: ['A'], count: -1 }]), /nonnegative safe integer/);
  assert.match(validate([{ sets: ['A'], count: '1.5' }]), /nonnegative safe integer/);
  assert.match(validate([{ sets: ['A'], count: '7%' }]), /nonnegative safe integer/);
  assert.match(validate([{ sets: ['A'], count: '' }]), /nonnegative safe integer/);
  assert.match(validate([{ sets: ['A', 'Z'], count: 1 }]), /unknown set/);
  assert.match(validate([{ sets: ['A', 'A'], count: 1 }]), /repeats set/);
  assert.match(validate([{ sets: ['A', 'B'], count: 1 }, { sets: ['B', 'A'], count: 1 }]), /Repeated Venn region/);
  assert.match(validate([{ sets: ['A'], count: 1, key: 'region:["B"]' }]), /keys must be unique/);
  assert.match(validate([], { sets: [{ key: 'A', members: [] }, { key: 'B' }] }), /either members for every set or region counts/);
  const input = chart._mapRecords([
    { membership: 'B | A', count: '7', key: 'both', step: 'show' },
    { membership: 'C', count: 9, key: '', step: '' },
    { membership: '["A","C"]', count: 4, key: '', step: '' }
  ], { sets: ' membership ', count: 'count', pointKey: 'key', revealStep: 'step' }, { type: 'venn', sets });
  const model = chart.specModel(input);
  assert.deepEqual(plain(model.errors), []);
  assert.deepEqual(plain(model.venn.regions.map(region => region.count)), [0, 0, 7, 9, 4, 0, 0]);
  assert.equal(model.venn.regions[2].key, 'both');
  assert.equal(model.venn.regions[2].revealStep, 'show');
});
