// Selectable trees with collapsible branches and an animated top-down layout.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm._diagram) return;

  var FEATURE = 'tree-diagram';
  var diagram = DocForm._diagram;
  var items = DocForm._items;
  var COLUMN = 176;
  var ROW = 88;
  var WIDTH = 152;
  var HEIGHT = 48;
  var PAD = 10;

  function prepare(records) {
    var byKey = new Map();
    var roots = [];
    records.forEach(function (record) {
      var key = items.key(record.key);
      var parent = items.key(record.parent);
      var parentMissing = record.parent == null || (typeof record.parent === 'string' && !record.parent.trim());
      if (!key || byKey.has(key)) throw new Error('Tree nodes need unique nonempty string keys.');
      if (!parent && !parentMissing) throw new Error('Tree parent keys must be strings.');
      byKey.set(key, {
        key: key, parent: parent, label: items.key(record.label) || key, initial: record.initial,
        collapsed: record.collapsed === true || record.collapsed === 'true', children: []
      });
    });
    byKey.forEach(function (node) {
      if (!node.parent) roots.push(node);
      else {
        var parent = byKey.get(node.parent);
        if (!parent) throw new Error('Unknown tree parent "' + node.parent + '".');
        parent.children.push(node);
      }
    });

    var pending = roots.slice().reverse();
    var ordered = [];
    while (pending.length) {
      var node = pending.pop();
      node.index = ordered.length;
      ordered.push(node);
      for (var i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
    }
    if (!ordered.length || ordered.length !== records.length) {
      throw new Error('A tree diagram needs at least one node and cannot contain cycles.');
    }
    return ordered.map(function (node) {
      return Object.assign({}, node, {
        parentIndex: node.parent ? byKey.get(node.parent).index : -1,
        children: node.children.map(function (child) { return child.index; })
      });
    });
  }

  function markup(host) {
    var list = host.querySelector(':scope > .df-tree-diagram-nodes');
    var records = [];
    function read(list, parent) {
      Array.from(list.children).forEach(function (el) {
        var key = el.getAttribute('data-df-key') ?? el.id;
        var label = el.querySelector(':scope > .df-tree-diagram-label');
        if (!label) throw new Error('Give each tree node a direct .df-tree-diagram-label.');
        records.push({
          key: key, parent: parent, label: label.textContent,
          initial: items.flag(el, 'initial', FEATURE), collapsed: items.flag(el, 'collapsed', FEATURE)
        });
        var children = el.querySelector(':scope > ul, :scope > ol');
        if (children) read(children, key);
      });
    }
    if (list) read(list, null);
    return prepare(records);
  }

  function layout(nodes, collapsed) {
    var positions = [];
    var nextLeaf = 0;
    var levels = 0;
    var visible = [];
    nodes.forEach(function (node, i) {
      var parent = positions[node.parentIndex];
      var shown = !parent || (parent.shown && !collapsed.has(node.parent));
      var depth = parent ? parent.depth + 1 : 0;
      positions.push({ shown: shown, depth: depth, x: 0, y: PAD + depth * ROW });
      if (shown) {
        visible.push(i);
        levels = Math.max(levels, depth + 1);
        if (!node.children.length || collapsed.has(node.key)) {
          positions[i].x = COLUMN / 2 + nextLeaf++ * COLUMN;
        }
      }
    });
    for (var i = nodes.length - 1; i >= 0; i--) {
      var children = nodes[i].children;
      if (positions[i].shown && children.length && !collapsed.has(nodes[i].key)) {
        positions[i].x = (positions[children[0]].x + positions[children[children.length - 1]].x) / 2;
      }
    }
    nodes.forEach(function (node, i) {
      if (!positions[i].shown) {
        var parent = positions[node.parentIndex];
        positions[i].x = parent.x;
        positions[i].y = parent.y;
      }
    });
    return {
      positions: positions, visible: visible, width: nextLeaf * COLUMN, height: 2 * PAD + (levels - 1) * ROW + HEIGHT
    };
  }

  function draw(nodes, scroll, actions, previous) {
    var stage = diagram.element('div', 'df-tree-diagram-stage');
    var collapsed = new Set();
    var branches = new Set();
    nodes.forEach(function (node) {
      if (!node.children.length) return;
      branches.add(node.key);
      if (previous && previous.branches.has(node.key) ? previous.collapsed.has(node.key) : node.collapsed) {
        collapsed.add(node.key);
      }
    });

    var edges = nodes.map(function (node) {
      if (node.parentIndex < 0) return null;
      var edge = diagram.element('span', 'df-tree-diagram-edge', stage);
      edge.setAttribute('aria-hidden', 'true');
      return edge;
    });
    var wrappers = [];
    var toggles = [];
    var buttons = nodes.map(function (node, i) {
      var wrap = diagram.element('div', 'df-tree-diagram-node', stage);
      wrappers.push(wrap);
      var button = diagram.element('button', 'df-tree-diagram-pick', wrap);
      var description = node.parent ? node.label + ', child of ' + nodes[node.parentIndex].label : node.label;
      button.type = 'button';
      button.textContent = node.label;
      button.title = description;
      button.setAttribute('aria-label', description);
      button.setAttribute('data-df-key', node.key);
      if (node.children.length) {
        var toggle = diagram.element('button', 'df-tree-diagram-toggle', wrap);
        toggle.type = 'button';
        toggle.tabIndex = -1;
        var icon = diagram.svg('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
          'stroke-width': 1.25, 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' }, toggle);
        diagram.svg('path', { d: 'M5 8h6' }, icon);
        diagram.svg('path', { d: 'M8 5v6', class: 'df-tree-diagram-toggle-vertical' }, icon);
        toggle.addEventListener('click', function () {
          setCollapsed(i, !collapsed.has(node.key));
          actions.focus(i);
        });
        toggles[i] = toggle;
      }
      return button;
    });
    var scene;

    function place() {
      scene = layout(nodes, collapsed);
      stage.style.width = scene.width + 'px';
      stage.style.height = scene.height + 'px';
      scene.positions.forEach(function (pos, i) {
        var node = nodes[i];
        diagram.position(wrappers[i], pos.x - WIDTH / 2, pos.y);
        wrappers[i].classList.toggle('df-tree-diagram-folded', !pos.shown);
        wrappers[i].inert = !pos.shown;
        if (toggles[i]) {
          var closed = collapsed.has(node.key);
          buttons[i].setAttribute('aria-expanded', String(!closed));
          toggles[i].setAttribute('aria-expanded', String(!closed));
          toggles[i].setAttribute('aria-label', (closed ? 'Expand ' : 'Collapse ') + node.label);
        }
        if (!edges[i]) return;
        var parent = scene.positions[node.parentIndex];
        var dx = pos.x - parent.x;
        var dy = pos.y - (parent.y + HEIGHT);
        edges[i].classList.toggle('df-tree-diagram-folded', !pos.shown);
        edges[i].style.transform = 'translate(' + parent.x + 'px, ' + (parent.y + HEIGHT) +
          'px) rotate(' + Math.atan2(dy, dx) + 'rad) scaleX(' + (pos.shown ? Math.hypot(dx, dy) : 0) + ')';
      });
    }

    function setCollapsed(index, closed) {
      var key = nodes[index].key;
      if (closed) {
        collapsed.add(key);
        place();
        if (!scene.positions[actions.current()].shown) actions.choose(index, 'user');
      } else {
        collapsed.delete(key);
        place();
      }
    }

    function reveal(index) {
      if (scene.positions[index].shown) return;
      for (var parent = nodes[index].parentIndex; parent >= 0; parent = nodes[parent].parentIndex) {
        collapsed.delete(nodes[parent].key);
      }
      place();
    }

    place();
    scroll.replaceChildren(stage);
    return {
      branches: branches, collapsed: collapsed, nodes: buttons, hoverTargets: wrappers, reveal: reveal,
      visible: function (index) { return scene.positions[index].shown; },
      navigate: function (index, key) {
        var node = nodes[index];
        var visible = scene.visible;
        if (key === 'Home') return visible[0];
        if (key === 'End') return visible[visible.length - 1];
        if (key === 'ArrowUp') return visible[Math.max(0, visible.indexOf(index) - 1)];
        if (key === 'ArrowDown') return visible[Math.min(visible.length - 1, visible.indexOf(index) + 1)];
        if (key === 'ArrowLeft') {
          if (node.children.length && !collapsed.has(node.key)) {
            setCollapsed(index, true);
            return index;
          }
          return node.parentIndex < 0 ? index : node.parentIndex;
        }
        if (key === 'ArrowRight') {
          if (!node.children.length) return index;
          if (!collapsed.has(node.key)) return node.children[0];
          setCollapsed(index, false);
          return index;
        }
      },
      snapshot: function (node, index, key) {
        return { key: key, index: index, label: node.label, parent: node.parent };
      }
    };
  }

  DocForm._treeDiagram = { prepare: prepare, layout: layout };
  DocForm.treeDiagram = diagram.recordDiagram(FEATURE, markup,
    { key: 'key', parent: 'parent', label: 'label', collapsed: 'collapsed' }, prepare, draw);
})(typeof window !== 'undefined' ? window : globalThis);
