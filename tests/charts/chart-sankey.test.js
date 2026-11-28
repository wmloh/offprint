const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChartModules } = require('../support/chart-modules');

const { chart } = loadChartModules(['core.js', 'chart.js', 'data.js', 'chart-sankey.js']);
const sankey = chart._sankey;
const plain = value => JSON.parse(JSON.stringify(value));
const flow = (source, target, value = 1, key) => ({ source, target, value, key });
const spec = (links, options) => ({ type: 'sankey', links, ...options });

test('Sankey derives node totals and reports net differences at intermediate stages', () => {
  const input = spec([flow('A', 'B', 7), flow('A', 'B', 3), flow('B', 'C', '6'), flow('C', 'D', 8)]);
  const { sankey: { nodes, links }, errors } = chart.specModel(input);
  assert.equal(errors.length, 0);
  assert.deepEqual(plain(nodes.map(n => [n.key, n.inTotal, n.outTotal, n.value, n.net, n.unbalanced])), [
    ['A', 0, 10, 10, -10, false], ['B', 10, 6, 10, 4, true],
    ['C', 6, 8, 8, -2, true], ['D', 8, 0, 8, 8, false]
  ]);
  assert.notEqual(links[0].key, links[1].key, 'parallel links get distinct generated keys');
  const roundoff = chart.specModel(spec([flow('A', 'B', 0.1), flow('A', 'B', 0.2), flow('B', 'C', 0.3)]));
  assert.equal(roundoff.sankey.nodes[1].unbalanced, false);
});

test('Sankey columns follow the longest path and accept forward authored anchors', () => {
  const links = [flow('A', 'D'), flow('A', 'B'), flow('B', 'C'), flow('C', 'D'), flow('Y', 'D')];
  const automatic = chart.specModel(spec(links)).sankey;
  assert.deepEqual(plain(automatic.columns.map(list => list.map(i => automatic.nodes[i].key))), [['A', 'Y'], ['B'], ['C'], ['D']]);
  const nodes = [{ key: 'A' }, { key: 'B', column: 2 }, { key: 'C' }, { key: 'D' }, { key: 'Y' }];
  const pinned = chart.specModel(spec(links, { nodes })).sankey;
  assert.deepEqual(plain(pinned.nodes.map(n => n.column)), [0, 2, 3, 4, 0]);
  assert.equal(pinned.columns[1].length, 0);
  nodes[3].column = 3;
  assert.match(chart.validate(spec(links, { nodes }))[0], /"D".*at least 4/);
});

test('Sankey barycentre sweeps align automatic nodes and preserve authored order and stable ties', () => {
  const nodes = [{ key: 'A', order: 2 }, { key: 'B', order: 1 }, { key: 'X' }, { key: 'Y' }];
  const links = [flow('A', 'X'), flow('B', 'Y')];
  const order = input => {
    const { sankey: model } = chart.specModel(input);
    return plain(model.columns.map(list => list.map(i => model.nodes[i].key)));
  };
  assert.deepEqual(order(spec(links, { nodes })), [['B', 'A'], ['Y', 'X']]);
  assert.deepEqual(order(spec(links.toReversed(), { nodes })), [['B', 'A'], ['Y', 'X']]);
  assert.deepEqual(order(spec([flow('A', 'Y'), flow('A', 'X')], { nodes })), [['B', 'A'], ['X', 'Y']]);
  assert.deepEqual(order(spec(links, { nodes: nodes.map(n => n.key === 'X' ? { ...n, order: 0 } : n) })),
    [['B', 'A'], ['X', 'Y']]);
});

test('Sankey names cycles and rejects invalid endpoints, amounts, keys, and caps', () => {
  assert.match(chart.validate(spec([flow('A', 'B'), flow('B', 'C'), flow('C', 'A')]))[0], /"A" → "B" → "C" → "A"/);
  assert.match(chart.validate(spec([flow('A', 'A')]))[0], /"A" → "A"/);
  assert.match(chart.validate(spec([flow('A', 'B')], { nodes: [{ key: 'A' }] }))[0], /unknown node "B"/);
  assert.match(chart.validate(spec([flow('A', 'B', 0)]))[0], /positive finite value/);
  assert.match(chart.validate(spec([flow('A', 'B', '1e500')]))[0], /positive finite value/);
  assert.match(chart.validate(spec([flow('A', 'B', 1, 'B')]))[0], /repeats a node key/);
  const chain = Array.from({ length: 60 }, (_, i) => flow(i, i + 1));
  assert.equal(chart.validate(spec(chain.slice(0, 59))).length, 0);
  assert.match(chart.validate(spec(chain))[0], /at most 60 nodes/);
  const parallel = Array.from({ length: 201 }, () => flow('A', 'B'));
  assert.equal(chart.validate(spec(parallel.slice(0, 200))).length, 0);
  assert.match(chart.validate(spec(parallel))[0], /at most 200 links/);
});

test('Sankey traces ancestors and descendants without taking unrelated branches', () => {
  const links = [
    flow('A', 'B'), flow('A', 'C'), flow('B', 'D'), flow('C', 'D'),
    flow('E', 'B'), flow('D', 'F'), flow('D', 'G'), flow('F', 'H'), flow('G', 'H')
  ];
  const info = chart.specModel(spec(links)).sankey;
  const through = sankey.trace(info, info.nodes.findIndex(n => n.key === 'B'));
  assert.deepEqual([...through.nodes].map(i => info.nodes[i].key).sort(), ['A', 'B', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual([...through.links].sort(), [0, 2, 4, 5, 6, 7, 8]);
});

test('Sankey maps named records and fits parallel ribbons on both sides of each node', () => {
  const mapped = chart._mapRecords([
    { from: 'A', to: 'B', total: 210, id: 'main' },
    { from: 'A', to: 'B', total: 1e-12, id: 'sliver' },
    { from: 'B', to: 'C', total: 32, id: 'out' }
  ], { source: ' from ', target: 'to', value: 'total', pointKey: 'id' }, { type: 'sankey', height: 100 });
  const model = chart.specModel(mapped);
  assert.equal(model.errors.length, 0);
  assert.equal(model.y.label, 'total');
  assert.deepEqual(plain(model.sankey.links.map(link => link.key)), ['main', 'sliver', 'out']);
  const { bands, boxes } = sankey.layout(model.sankey, 400, model.height);
  assert.equal(bands[1].height, 1);
  assert.ok(bands[0].height / bands[2].height > 6);
  for (const [i, band] of bands.entries()) {
    const { source, target } = model.sankey.links[i];
    const a = boxes[source];
    const b = boxes[target];
    assert.equal(band.start[0], a.x + a.width);
    assert.equal(band.end[0], b.x);
    assert.ok(band.start[1] >= a.y && band.start[1] + band.height <= a.y + a.height + 1e-9);
    assert.ok(band.end[1] >= b.y && band.end[1] + band.height <= b.y + b.height + 1e-9);
    assert.match(sankey.ribbon(band), /^M.*C.*L.*C.*Z$/);
  }
});
