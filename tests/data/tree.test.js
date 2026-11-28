const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../../offprint/js', file), 'utf8');
const context = vm.createContext({ URL, console });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('tree.js'), context);
const tree = context.OffPrint._tree;
const config = { model: { name: 'cnn', layers: [64, 128] }, seed: 1, tags: [] };
const names = (m) => [...tree.visible(m)].map((n) => (n.kind === 'more' ? 'more' : n.key));
const keys = (list) => [...list].map((n) => n.key);
const press = (m, node, ...keys) => keys.reduce((at, k) => tree.key(m, at, k).focus, node);

test('trees open the top level by default and summarize containers and values', () => {
  const m = tree.model(config);
  assert.deepEqual(names(m), ['model', 'name', 'layers', 'seed', 'tags']);
  assert.deepEqual(names(tree.model(config, { open: 0 })), ['model', 'seed', 'tags']);
  assert.deepEqual(names(tree.model(config, { open: 5 })), ['model', 'name', 'layers', 0, 1, 'seed', 'tags']);
  assert.deepEqual([config.model, config.model.layers, [], {}, 3].map((v) => tree.summary(v)), ['2 keys', '2 items', 'empty list', 'empty object', '']);
  assert.deepEqual(['a', 2, true, null].map(tree.scalarText), ['"a"', '2', 'true', 'null']);
  assert.deepEqual(names(tree.model('just text')), [null]);
  assert.equal(tree.model([]).roots[0].kind, 'array');
});

test('expand all and collapse all reach every level and skip empty containers', () => {
  const m = tree.model(config, { open: 0 });
  assert.deepEqual(keys(tree.expandAll(m)), ['model', 'layers']);
  assert.deepEqual(names(m), ['model', 'name', 'layers', 0, 1, 'seed', 'tags']);
  assert.deepEqual(keys(tree.collapseAll(m)), ['layers', 'model']);
  assert.deepEqual(names(m), ['model', 'seed', 'tags']);
});

test('arrow keys move, open, and close nodes like a tree widget', () => {
  const m = tree.model(config, { open: 0 });
  const [model, seed] = m.roots;
  assert.equal(tree.key(m, model, 'ArrowUp').focus, model);
  assert.equal(press(m, model, 'ArrowDown'), seed);
  assert.equal(tree.key(m, model, 'ArrowRight').focus, model);
  assert.equal(model.expanded, true);
  const name = press(m, model, 'ArrowRight');
  assert.equal(name.key, 'name');
  assert.equal(press(m, name, 'ArrowLeft'), model);
  assert.deepEqual(keys(tree.key(m, model, 'ArrowLeft').changed), ['model']);
  assert.equal(model.expanded, false);
  assert.equal(press(m, seed, 'Home'), model);
  assert.equal(press(m, model, 'End').key, 'tags');
  assert.equal(press(m, seed, 'ArrowRight', 'ArrowLeft'), seed);
  tree.key(m, model, 'Enter');
  assert.equal(model.expanded, true);
  tree.key(m, model, ' ');
  assert.equal(model.expanded, false);
  tree.key(m, seed, '*');
  assert.equal(model.expanded, true);
  assert.equal(tree.key(m, seed, 'a'), null);
});

test('long lists show a capped number of children and a Show more item', () => {
  const m = tree.model({ runs: [1, 2, 3, 4, 5] }, { maxItems: 2 });
  assert.deepEqual(names(m), ['runs', 0, 1, 'more']);
  const more = tree.visible(m)[3];
  assert.deepEqual([more.left, more.total], [3, 5]);
  const result = tree.key(m, more, 'Enter');
  assert.equal(result.focus.key, 2);
  assert.deepEqual(names(m), ['runs', 0, 1, 2, 3, 'more']);
  tree.key(m, tree.visible(m)[5], 'Enter');
  assert.deepEqual(names(m), ['runs', 0, 1, 2, 3, 4]);
  const top = tree.model([1, 2, 3], { maxItems: 2 });
  assert.deepEqual(names(top), [0, 1, 'more']);
  tree.key(top, top.roots[2], 'Enter');
  assert.deepEqual(names(top), [0, 1, 2]);
});
