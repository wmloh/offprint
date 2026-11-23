const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const name of ['core', 'detail', 'diagram', 'tree-diagram']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../offprint/js', name + '.js'), 'utf8'), context);
}
const { prepare, layout } = context.OffPrint._treeDiagram;

test('tree layout centers parents, preserves sibling order, and repacks collapsed branches', () => {
  const nodes = prepare([
    { key: 'a1', parent: 'a' }, { key: 'root' }, { key: 'a', parent: 'root' },
    { key: 'b', parent: 'root' }, { key: 'a2', parent: 'a' },
    { key: 'a2a', parent: 'a2' }, { key: 'second' }
  ]);
  assert.deepEqual(Array.from(nodes, (node) => node.key), ['root', 'a', 'a1', 'a2', 'a2a', 'b', 'second']);
  const open = layout(nodes, new Set());
  const closed = layout(nodes, new Set(['a']));
  const [root, a, a1, a2, a2a, b, second] = open.positions;
  assert.equal(root.x, (a.x + b.x) / 2);
  assert.ok(a1.x < a2.x && a2.x < b.x && b.x < second.x);
  assert.equal(a2.x, a2a.x);
  assert.ok(a2.y < a2a.y);
  assert.deepEqual(Array.from(closed.visible), [0, 1, 5, 6]);
  assert.equal(closed.positions[4].x, closed.positions[1].x);
  assert.ok(closed.positions[5].x < b.x);
  assert.ok(closed.height < open.height && closed.width < open.width);
});

test('tree records reject broken hierarchies before rendering', () => {
  assert.throws(() => prepare([{ key: 'a', parent: 'missing' }]), /Unknown tree parent/);
  assert.throws(() => prepare([
    { key: 'root' }, { key: 'a', parent: 'b' }, { key: 'b', parent: 'a' }
  ]), /cycles/);
  assert.throws(() => prepare([{ key: 'a' }, { key: 'a' }]), /unique/);
});
