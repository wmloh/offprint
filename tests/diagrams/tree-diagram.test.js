const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, setup, GROUP, KEY, hover } = require('../support/mounted-chart');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const name of ['core', 'detail', 'diagram', 'tree-diagram']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../offprint/js', name + '.js'), 'utf8'), context);
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

test('tree disclosure repositions persistent nodes and keeps details and selection linked', () => {
  const add = (parent, tag, attrs, label) => {
    const el = parent.appendChild(new Node(tag));
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (label) el.textContent = label;
    return el;
  };
  const rows = [
    { name: 'root', title: 'Root' }, { name: 'branch', under: 'root', title: 'Branch' },
    { name: 'leaf', under: 'branch', title: 'Leaf' }, { name: 'tip', under: 'branch', title: 'Tip' },
    { name: 'other', under: 'root', title: 'Other' }
  ];
  const input = (value) => ({ type: 'value', value });
  let diagram, named, pane, data;
  const { OffPrint: OP, document, warnings } = setup({
    modules: ['data', 'detail', 'diagram', 'tree-diagram'],
    enhance(OP, document, boot) {
      document.createElement = (tag) => {
        const el = new Node(tag);
        el.focus = () => { document.activeElement = el; el.dispatchEvent(new Event('focus')); };
        return el;
      };
      boot.optionLayers = (feature) => feature === 'tree-diagram' ? [{
        mapping: { key: 'name', parent: 'under', label: 'title' }
      }] : [];
      diagram = add(document.body, 'figure', { class: 'op-tree-diagram', id: 'tree-plan', [GROUP]: 'plan' });
      named = add(document.body, 'figure', { class: 'op-tree-diagram', [GROUP]: 'plan', 'data-op-source': 'plan' });
      const list = add(diagram, 'ul', { class: 'op-tree-diagram-nodes' });
      const node = (list, key, attrs = {}) => {
        const el = add(list, 'li', { [KEY]: key, ...attrs });
        add(el, 'span', { class: 'op-tree-diagram-label' }, key);
        return el;
      };
      const siblings = add(node(list, 'root'), 'ul', {});
      const leaves = add(node(siblings, 'branch', { 'data-op-collapsed': '' }), 'ol', {});
      node(leaves, 'leaf');
      node(leaves, 'tip');
      node(siblings, 'other');
      pane = add(document.body, 'div', { class: 'op-detail-pane', 'data-op-detail-for': 'tree-plan' });
      rows.forEach((row) => add(pane, 'p', { [KEY]: row.name }, row.title));
      data = OP.data.define('plan', input(rows));
    }
  });
  const tree = OP._treeDiagram.get(diagram);
  const mapped = OP._treeDiagram.get(named);
  const picks = (host) => host.querySelectorAll('.op-tree-diagram-pick');
  const [root, branch, leaf, tip, other] = picks(diagram);
  const closed = other.parentNode.style.transform;
  const toggle = branch.parentNode.querySelector('.op-tree-diagram-toggle');
  const icon = toggle.querySelector('svg');
  const detail = OP._detailPane.get(pane);
  assert.deepEqual(warnings, []);
  assert.equal(icon.getAttribute('viewBox'), '0 0 10 8');
  assert.deepEqual(icon.children.map((path) => path.getAttribute('d')), ['M2 2.5 5 5.5 8 2.5']);
  assert.equal(root.tabIndex, 0);
  assert.equal(branch.getAttribute('aria-expanded'), 'false');
  assert.equal(leaf.parentNode.inert, true);
  hover(leaf.parentNode);
  assert.equal(tree.snapshot().key, 'root');
  hover(other.parentNode);
  assert.equal(mapped.snapshot().key, 'other');
  assert.equal(detail.snapshot().key, 'other');
  assert.equal(mapped.select('tip'), true);
  assert.equal(tree.snapshot().key, 'tip');
  assert.equal(detail.snapshot().key, 'tip');
  assert.equal(tip.parentNode.inert, false);
  assert.equal(branch.getAttribute('aria-expanded'), 'true');
  assert.notEqual(other.parentNode.style.transform, closed);

  toggle.dispatchEvent(new Event('click'));
  assert.equal(tree.snapshot().key, 'branch');
  assert.equal(mapped.snapshot().key, 'branch');
  assert.equal(detail.snapshot().key, 'branch');
  assert.equal(document.activeElement, branch);
  assert.equal(other.parentNode.style.transform, closed);
  assert.equal(picks(diagram)[4], other);
  assert.equal(leaf.parentNode.inert, true);

  const keydown = (el, key) => el.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
  keydown(branch, 'ArrowDown');
  assert.equal(tree.snapshot().key, 'other');
  keydown(other, 'ArrowUp');
  keydown(branch, 'ArrowRight');
  assert.equal(leaf.parentNode.inert, false);
  keydown(branch, 'ArrowRight');
  assert.equal(tree.snapshot().key, 'leaf');
  assert.equal(document.activeElement, leaf);
  assert.equal(picks(named)[2].getAttribute('aria-current'), 'true');

  const namedBranch = picks(named)[1].parentNode.querySelector('.op-tree-diagram-toggle');
  namedBranch.dispatchEvent(new Event('click'));
  assert.equal(data.update(input(rows.map((row) => ({ ...row, title: row.title + ' updated' })))), true);
  assert.equal(mapped.snapshot().label, 'Branch updated');
  assert.equal(picks(named)[1].getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, picks(named)[1]);
  assert.equal(data.update(input([{ name: 'root', under: 'root' }])), false);
  assert.equal(mapped.snapshot().key, 'branch');
});
