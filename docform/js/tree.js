// Tree view for nested data: DocForm.tree.build(value, options) returns a collapsible, keyboard-navigable tree
// (the WAI-ARIA tree pattern) with Expand all and Collapse all buttons. data.js uses it for data-df-view="tree".
// Children are drawn when a node first opens, and each node lists at most maxItems children before a Show more item.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] tree.js needs core.js loaded before it.');
    return;
  }

  var hasOwn = Object.prototype.hasOwnProperty;

  function kind(v) {
    if (Array.isArray(v)) return 'array';
    return v !== null && typeof v === 'object' ? 'object' : 'scalar';
  }

  function count(n) {
    return Number(n).toLocaleString('en-US');
  }

  function keysOf(v) {
    return kind(v) === 'array' ? v.map(function (x, i) { return i; }) : Object.keys(v).filter(function (k) { return hasOwn.call(v, k); });
  }

  // "3 keys", "1 item", "empty list".
  function summary(v) {
    var k = kind(v);
    if (k === 'scalar') return '';
    var n = keysOf(v).length;
    if (!n) return k === 'array' ? 'empty list' : 'empty object';
    return count(n) + (k === 'array' ? (n === 1 ? ' item' : ' items') : (n === 1 ? ' key' : ' keys'));
  }

  function scalarText(v) {
    if (v === null || v === undefined) return 'null';
    return typeof v === 'string' ? JSON.stringify(v) : String(v);
  }

  function scalarClass(v) {
    return typeof v === 'string' ? 'df-tok-string' : typeof v === 'number' ? 'df-tok-number' : 'df-tok-literal';
  }

  function container(node) {
    return node.kind === 'object' || node.kind === 'array';
  }

  function makeNode(key, value, depth, parent) {
    return { key: key, value: value, kind: kind(value), depth: depth, parent: parent, expanded: false, items: null, shown: 0 };
  }

  // The tree's state without any DOM: roots are the entries of an object or list, or one node for anything else.
  function model(value, options) {
    options = options || {};
    var m = {
      maxItems: options.maxItems > 0 ? options.maxItems : 5000,
      roots: null
    };
    var top = makeNode(null, value, -1, null);
    if (container(top) && keysOf(value).length) {
      top.expanded = true;
      m.roots = children(m, top);
      m.top = top;
    } else {
      m.roots = [makeNode(null, value, 0, null)];
    }
    var open = options.open == null ? 1 : Math.max(0, Math.floor(options.open));
    var walk = function (list) {
      list.forEach(function (n) {
        if (container(n) && n.depth < open && keysOf(n.value).length) {
          n.expanded = true;
          walk(children(m, n));
        }
      });
    };
    walk(m.roots);
    return m;
  }

  // Child nodes up to the node's shown count, plus a "more" node when the cap hides the rest. Existing nodes are kept.
  function children(m, node) {
    var keys = keysOf(node.value);
    if (!node.shown) node.shown = Math.min(keys.length, m.maxItems);
    var list = node.items ? node.items.filter(function (n) { return n.kind !== 'more'; }) : [];
    for (var i = list.length; i < node.shown; i++) {
      list.push(makeNode(keys[i], node.value[keys[i]], node.depth + 1, node.depth < 0 ? null : node));
    }
    if (node.shown < keys.length) {
      list.push({ kind: 'more', depth: node.depth + 1, parent: node.depth < 0 ? null : node, owner: node, left: keys.length - node.shown, total: keys.length });
    }
    node.items = list;
    return list;
  }

  function siblings(m, node) {
    return node.parent ? node.parent.items : m.roots;
  }

  // Shows another maxItems children of the "more" node's owner and returns the first newly shown child.
  function more(m, node) {
    var owner = node.owner;
    var first = owner.shown;
    owner.shown = Math.min(owner.shown + m.maxItems, keysOf(owner.value).length);
    var list = children(m, owner);
    if (owner === m.top) m.roots = list;
    return list[first];
  }

  function expandable(node) {
    return container(node) && keysOf(node.value).length > 0;
  }

  function setOpen(m, node, open) {
    if (!expandable(node)) return false;
    if (node.expanded === open) return false;
    node.expanded = open;
    if (open) children(m, node);
    return true;
  }

  function visible(m) {
    var out = [];
    var walk = function (list) {
      list.forEach(function (n) {
        out.push(n);
        if (n.expanded && n.items) walk(n.items);
      });
    };
    walk(m.roots);
    return out;
  }

  // Opens every node, drawing children up to each node's cap; returns the nodes that changed.
  function expandAll(m) {
    var changed = [];
    var walk = function (list) {
      list.forEach(function (n) {
        if (setOpen(m, n, true)) changed.push(n);
        if (n.expanded) walk(n.items);
      });
    };
    walk(m.roots);
    return changed;
  }

  function collapseAll(m) {
    var changed = [];
    var walk = function (list) {
      list.forEach(function (n) {
        if (n.items) walk(n.items);
        if (setOpen(m, n, false)) changed.push(n);
      });
    };
    walk(m.roots);
    return changed;
  }

  function topOf(node) {
    while (node.parent) node = node.parent;
    return node;
  }

  // One key press on the focused node: { focus, changed } where changed lists nodes whose expansion changed,
  // or null for keys the tree does not handle. "more" in changed means the owner gained children.
  function key(m, node, name) {
    var list = visible(m);
    var at = list.indexOf(node);
    var changed = [];
    var focus = node;
    if (name === 'ArrowDown') focus = list[Math.min(list.length - 1, at + 1)];
    else if (name === 'ArrowUp') focus = list[Math.max(0, at - 1)];
    else if (name === 'Home') focus = list[0];
    else if (name === 'End') focus = list[list.length - 1];
    else if (name === 'ArrowRight') {
      if (expandable(node) && !node.expanded) { setOpen(m, node, true); changed.push(node); }
      else if (node.expanded) focus = node.items[0];
    } else if (name === 'ArrowLeft') {
      if (node.expanded) { setOpen(m, node, false); changed.push(node); }
      else if (node.parent) focus = node.parent;
    } else if (name === 'Enter' || name === ' ') {
      if (node.kind === 'more') {
        focus = more(m, node);
        changed.push(node.owner);
      } else if (setOpen(m, node, !node.expanded)) changed.push(node);
    } else if (name === '*') {
      siblings(m, node).forEach(function (n) { if (setOpen(m, n, true)) changed.push(n); });
    } else {
      return null;
    }
    return { focus: focus, changed: changed };
  }

  // DOM below.

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderNode(t, node) {
    var li = make('li', 'df-tree-item');
    li.setAttribute('role', 'treeitem');
    li.tabIndex = -1;
    node.el = li;
    t.byEl.set(li, node);
    var row = make('div', 'df-tree-row');
    li.appendChild(row);
    if (node.kind === 'more') {
      li.classList.add('df-tree-more');
      row.textContent = 'Show ' + count(Math.min(node.left, t.model.maxItems)) + ' more of ' + count(node.total);
      return li;
    }
    row.appendChild(make('span', 'df-tree-twisty')).setAttribute('aria-hidden', 'true');
    if (node.key !== null) {
      row.appendChild(make('span', typeof node.key === 'number' ? 'df-tree-index' : 'df-tree-key', String(node.key)));
      row.appendChild(make('span', 'df-tree-sep', ': '));
    }
    if (container(node)) {
      row.appendChild(make('span', 'df-tree-summary', (node.kind === 'array' ? '[ ' : '{ ') + summary(node.value) + (node.kind === 'array' ? ' ]' : ' }')));
      if (expandable(node)) li.setAttribute('aria-expanded', 'false');
    } else {
      row.appendChild(make('span', 'df-tree-value ' + scalarClass(node.value), scalarText(node.value)));
    }
    sync(t, node);
    return li;
  }

  function fill(t, node, group) {
    node.items.forEach(function (child) {
      if (child.el && child.el.parentNode === group) return;
      group.appendChild(child.el || renderNode(t, child));
    });
  }

  // Brings a node's element in line with its model state, drawing its group on first open.
  function sync(t, node) {
    if (!node.el || !expandable(node)) return;
    node.el.setAttribute('aria-expanded', node.expanded ? 'true' : 'false');
    if (node.expanded && !node.group) {
      node.group = make('ul', 'df-tree-group');
      node.group.setAttribute('role', 'group');
      node.el.appendChild(node.group);
    }
    if (node.group) {
      if (node.expanded) fill(t, node, node.group);
      node.group.hidden = !node.expanded;
    }
  }

  function removeMore(t, owner) {
    var group = owner === t.model.top ? t.list : owner.group;
    if (!group) return;
    Array.prototype.slice.call(group.children).forEach(function (li) {
      var n = t.byEl.get(li);
      if (n && n.kind === 'more' && owner.items.indexOf(n) < 0) li.remove();
    });
  }

  function refresh(t, changed) {
    changed.forEach(function (n) {
      removeMore(t, n);
      if (n === t.model.top) fill(t, n, t.list);
      else sync(t, n);
    });
  }

  function focusNode(t, node) {
    if (!node || !node.el) return;
    if (t.current && t.current.el) t.current.el.tabIndex = -1;
    t.current = node;
    node.el.tabIndex = 0;
    node.el.focus();
  }

  function build(value, options) {
    options = options || {};
    var m = model(value, options);
    var t = { model: m, byEl: typeof WeakMap === 'function' ? new WeakMap() : new Map(), current: null };
    var box = make('div', 'df-tree');
    var bar = make('div', 'df-tree-bar');
    var openAll = make('button', null, 'Expand all');
    var closeAll = make('button', null, 'Collapse all');
    openAll.type = closeAll.type = 'button';
    bar.appendChild(openAll);
    bar.appendChild(closeAll);
    t.list = make('ul', 'df-tree-list');
    t.list.setAttribute('role', 'tree');
    if (options.label) t.list.setAttribute('aria-label', options.label);
    box.appendChild(bar);
    box.appendChild(t.list);
    m.roots.forEach(function (n) { t.list.appendChild(renderNode(t, n)); });
    if (m.roots[0]) {
      t.current = m.roots[0];
      m.roots[0].el.tabIndex = 0;
    }
    var hasNested = m.roots.some(expandable);
    bar.hidden = !hasNested;

    openAll.addEventListener('click', function () { refresh(t, expandAll(m)); });
    closeAll.addEventListener('click', function () {
      refresh(t, collapseAll(m));
      // The focusable item moves to the top-level node that still shows.
      if (t.current) {
        var top = topOf(t.current);
        t.current.el.tabIndex = -1;
        t.current = top;
        top.el.tabIndex = 0;
      }
    });
    t.list.addEventListener('click', function (event) {
      var li = event.target.closest && event.target.closest('.df-tree-item');
      var node = li && t.byEl.get(li);
      if (!node || !event.target.closest('.df-tree-row') || event.target.closest('.df-tree-row').parentNode !== li) return;
      var result = key(m, node, 'Enter');
      refresh(t, result.changed);
      focusNode(t, result.focus);
    });
    t.list.addEventListener('keydown', function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      var li = event.target.closest && event.target.closest('.df-tree-item');
      var node = li && t.byEl.get(li);
      if (!node) return;
      var result = key(m, node, event.key);
      if (!result) return;
      event.preventDefault();
      refresh(t, result.changed);
      focusNode(t, result.focus);
    });
    return box;
  }

  DocForm.tree = {
    build: build,
    model: model,
    visible: visible,
    key: key,
    expandAll: expandAll,
    collapseAll: collapseAll,
    summary: summary,
    scalarText: scalarText
  };
})(typeof window !== 'undefined' ? window : globalThis);
