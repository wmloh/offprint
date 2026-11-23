// Pipeline block diagrams: structured HTML blocks placed in ranked columns and joined by curved SVG lines.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint._diagram) {
    if (typeof console !== 'undefined') console.warn('[offprint] pipeline.js needs diagram.js loaded before it.');
    return;
  }

  var items = OffPrint._items;
  var sequence = OffPrint._sequence;
  var detail = OffPrint._detail;
  var diagram = OffPrint._diagram;
  var FIELDS = ['eyebrow', 'headline', 'description'];
  var SIDES = diagram.sides;
  var STEM = 12;
  var ARROW = 8;
  var GAP = 5;
  var hosts = new WeakMap();
  var models = new WeakMap();
  var serial = 0;

  // ---- Layout geometry (pure) ----

  function adjacency(count, edges) {
    var out = [];
    var into = [];
    for (var i = 0; i < count; i++) { out.push([]); into.push([]); }
    edges.forEach(function (edge, index) {
      out[edge.from].push(index);
      into[edge.to].push(index);
    });
    return { out: out, into: into };
  }

  // Longest-path ranks over the graph without its back edges. Pinned columns win.
  function ranks(count, edges, pins) {
    var adj = adjacency(count, edges);
    var back = new Set();
    var mark = [];
    function visit(v) {
      mark[v] = 1;
      adj.out[v].forEach(function (index) {
        var w = edges[index].to;
        if (mark[w] === 1) back.add(index);
        else if (!mark[w]) visit(w);
      });
      mark[v] = 2;
    }
    for (var v = 0; v < count; v++) if (!mark[v]) visit(v);

    var indegree = [];
    for (v = 0; v < count; v++) {
      indegree[v] = adj.into[v].filter(function (index) { return !back.has(index); }).length;
    }
    var queue = [];
    for (v = 0; v < count; v++) if (!indegree[v]) queue.push(v);
    var order = [];
    while (queue.length) {
      var next = queue.shift();
      order.push(next);
      adj.out[next].forEach(function (index) {
        if (back.has(index)) return;
        var w = edges[index].to;
        if (--indegree[w] === 0) queue.push(w);
      });
    }
    var rank = [];
    order.forEach(function (node) {
      if (pins[node] != null) {
        rank[node] = pins[node];
        return;
      }
      rank[node] = adj.into[node].reduce(function (r, index) {
        return back.has(index) ? r : Math.max(r, rank[edges[index].from] + 1);
      }, 0);
    });
    // Pull unpinned sources next to their earliest successor.
    order.slice().reverse().forEach(function (node) {
      if (pins[node] != null || adj.into[node].some(function (index) { return !back.has(index); })) return;
      var next = adj.out[node].filter(function (index) { return !back.has(index); })
        .map(function (index) { return rank[edges[index].to]; });
      if (next.length) rank[node] = Math.max(rank[node], Math.min.apply(null, next) - 1);
    });
    return { rank: rank, back: back };
  }

  // Cross positions in half rows, so a fork source can sit midway between two branches.
  function rows(count, edges, rank, pins) {
    var preds = [];
    var succs = [];
    for (var v = 0; v < count; v++) { preds.push([]); succs.push([]); }
    edges.forEach(function (edge) {
      if (rank[edge.to] > rank[edge.from]) {
        preds[edge.to].push(edge.from);
        succs[edge.from].push(edge.to);
      }
    });
    var layers = [];
    for (v = 0; v < count; v++) (layers[rank[v]] = layers[rank[v]] || []).push(v);
    var pos = [];
    layers.forEach(function (list) { list.forEach(function (node, i) { pos[node] = i; }); });

    function sweep(list, neighbors) {
      var key = {};
      list.forEach(function (node) {
        var near = neighbors[node];
        key[node] = pins[node] != null ? pins[node] / 2 : near.length ? diagram.mean(near.map(function (u) { return pos[u]; })) : pos[node];
      });
      list.sort(function (a, b) { return key[a] - key[b] || pos[a] - pos[b]; });
      list.forEach(function (node, i) { pos[node] = i; });
    }
    for (var pass = 0; pass < 4; pass++) {
      layers.forEach(function (list) { sweep(list, preds); });
      for (var r = layers.length - 1; r >= 0; r--) if (layers[r]) sweep(layers[r], succs);
    }

    var h = [];
    function taken(list) {
      return list.filter(function (node) { return pins[node] != null; }).map(function (node) { return pins[node]; });
    }
    function clashes(fixed, at, self) {
      return fixed.some(function (other) { return other !== self && Math.abs(other - at) < 2; });
    }
    layers.forEach(function (list) {
      var fixed = taken(list);
      var last = -Infinity;
      list.forEach(function (node) {
        if (pins[node] != null) {
          h[node] = pins[node];
          last = Math.max(last, h[node]);
          return;
        }
        var placed = preds[node].filter(function (u) { return h[u] !== undefined; });
        var want = placed.length ? Math.round(diagram.mean(placed.map(function (u) { return h[u]; }))) : 0;
        var at = Math.max(want, last + 2);
        while (clashes(fixed, at)) at++;
        h[node] = at;
        last = at;
      });
    });

    // Center fork sources on their branches, then let single-successor sources follow them.
    for (var rank_ = layers.length - 1; rank_ >= 0; rank_--) {
      var list = layers[rank_];
      if (!list) continue;
      list.sort(function (a, b) { return h[a] - h[b]; });
      var fixed = taken(list);
      list.forEach(function (node, i) {
        if (pins[node] != null || !succs[node].length) return;
        if (preds[node].length && succs[node].length < 2) return;
        var want = Math.round(diagram.mean(succs[node].map(function (u) { return h[u]; })));
        var lo = i > 0 ? h[list[i - 1]] + 2 : 0;
        var hi = i < list.length - 1 ? h[list[i + 1]] - 2 : Infinity;
        want = Math.min(Math.max(want, lo, 0), hi);
        if (want >= lo && !clashes(fixed, want)) h[node] = want;
      });
    }
    return h;
  }

  // Cross-axis centers for every half row. Neighbours in a rank keep their gap; spacing is shared evenly.
  // "col row; col row" in one-based grid units; rows accept halves.
  function parseVia(text) {
    if (!text || !text.trim()) return [];
    var points = text.split(';').map(function (pair) {
      var parts = pair.trim().split(/[\s,]+/).map(Number);
      return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0] - 1, (parts[1] - 1) * 2] : null;
    });
    return points.includes(null) ? null : points;
  }

  // ---- Authored markup ----

  function issue(host, message, correction) {
    items.issue('pipeline', host, message, correction);
  }

  function isEmpty(field) {
    return !field.textContent.trim() && !field.querySelector('img, svg, video, canvas, iframe, math, .op-math, input, button');
  }

  function fieldsOf(block) {
    var found = {};
    FIELDS.forEach(function (name) { found[name] = block.querySelector(':scope > .op-pipe-' + name); });
    return found;
  }

  function positive(el, name, half) {
    var value = el.getAttribute('data-op-' + name);
    if (value === null) return null;
    var n = Number(value);
    if (Number.isFinite(n) && n >= 1 && (half ? Number.isInteger(n * 2) : Number.isInteger(n))) return half ? (n - 1) * 2 : n - 1;
    issue(el, 'Invalid data-op-' + name + ' value.', half ? 'Use a row of 1 or more in steps of 0.5.' : 'Use a whole column of 1 or more.');
    return null;
  }

  function prepare(host) {
    if (models.has(host)) return models.get(host);
    var list = host.querySelector(':scope > .op-pipe-blocks');
    var els = list ? OffPrint._all(':scope > .op-pipe-block, :scope > .op-pipe-junction', list) : [];
    if (!els.some(function (el) { return el.classList.contains('op-pipe-block'); })) {
      issue(host, 'A pipeline needs a .op-pipe-blocks list with at least one block.', 'Add li.op-pipe-block items to an ol.op-pipe-blocks child.');
      models.set(host, null);
      return null;
    }
    var base = host.id || 'op-pipeline-' + (++serial);
    var blocks = els.filter(function (el) { return el.classList.contains('op-pipe-block'); });
    diagram.prepareNodes(els, blocks, base);
    var steps = host.querySelector(':scope > [data-op-pipeline-steps]');
    var domain = steps && items.domain('pipeline', host, OffPrint._all(':scope > li', steps));
    var model = { list: list, els: els, blocks: blocks, domain: items.domain('pipeline', host, blocks),
      steps: steps, stepDomain: domain };
    models.set(host, model.domain ? model : null);
    return models.get(host);
  }

  function readEdges(host, nodes, stepIndex) {
    var index = new Map(nodes.map(function (node, i) { return [node.el.id, i]; }));
    var edges = [];
    var pairs = new Map();
    function add(from, id, link) {
      var to = index.get(id);
      if (to === undefined || to === from) {
        issue(nodes[from].el, to === undefined ? 'A pipeline line points to a missing block "' + id + '".' : 'A pipeline block links to itself.',
          'Use the ID of another block or junction in the same pipeline.');
        return;
      }
      var key = from + '>' + to;
      if (pairs.has(key)) {
        if (link) edges[pairs.get(key)].link = link;
        return;
      }
      pairs.set(key, edges.length);
      edges.push({ from: from, to: to, link: link || null });
    }
    nodes.forEach(function (node, from) {
      (node.el.getAttribute('data-op-to') || '').split(/\s+/).filter(Boolean).forEach(function (id) { add(from, id); });
      OffPrint._all('.op-pipe-link', node.el).forEach(function (link) {
        var href = link.getAttribute('href');
        var id = link.getAttribute('data-op-to') || (href && href.charAt(0) === '#' ? decodeURIComponent(href.slice(1)) : null);
        if (id) add(from, id, link);
      });
    });
    var flowAll = items.flag(host, 'flow', 'pipeline');
    edges.forEach(function (edge) {
      var link = edge.link;
      var get = function (name) { return link ? link.getAttribute('data-op-' + name) : null; };
      var via = parseVia(get('via'));
      if (via === null) {
        issue(link, 'Invalid data-op-via value.', 'Use one-based "column row" pairs separated by semicolons.');
        via = [];
      }
      ['exit', 'enter'].forEach(function (name) {
        if (get(name) !== null && !SIDES[get(name)]) {
          issue(link, 'Invalid data-op-' + name + ' side.', 'Use top, right, bottom, or left.');
        }
      });
      var arrow = get('arrow') || (nodes[edge.to].junction ? 'none' : 'end');
      if (!/^(none|end|start|both)$/.test(arrow)) arrow = 'end';
      var line = get('line') || 'solid';
      if (!/^(solid|dashed|dotted)$/.test(line)) line = 'solid';
      edge.label = get('label') || '';
      edge.line = line;
      edge.arrow = arrow;
      edge.color = get('color');
      edge.role = get('role');
      edge.flow = link && link.hasAttribute('data-op-flow') ? items.flag(link, 'flow', 'pipeline') : flowAll;
      edge.exit = SIDES[get('exit')] ? get('exit') : null;
      edge.enter = SIDES[get('enter')] ? get('enter') : null;
      edge.via = via;
      edge.step = link ? stepIndex(link, null) : null;
    });
    return edges;
  }

  // ---- Mounted diagram ----

  function setup(host) {
    var model = prepare(host);
    if (!model) return;
    var down = host.getAttribute('data-op-direction') === 'down';
    if (host.hasAttribute('data-op-direction') && !/^(right|down)$/.test(host.getAttribute('data-op-direction'))) {
      issue(host, 'Invalid data-op-direction value.', 'Use right or down.');
    }
    var flowSide = down ? 'bottom' : 'right';
    var backSide = down ? 'right' : 'bottom';
    var opposite = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };

    function stepIndex(el, fallback) {
      var key = items.key(OffPrint._data(el, 'reveal-step'));
      if (!key || !model.stepDomain) return fallback;
      var index = model.stepDomain.keys.indexOf(key);
      if (index >= 0) return index + 1;
      issue(el, 'Unknown pipeline reveal step "' + key + '".', 'Use a key from the pipeline step list.');
      return fallback;
    }

    var nodes = model.els.map(function (el) {
      var junction = el.classList.contains('op-pipe-junction');
      return {
        el: el, junction: junction,
        col: positive(el, 'col'), row: positive(el, 'row', true),
        width: OffPrint._maxWidth(el.getAttribute('data-op-width')),
        height: OffPrint._maxWidth(el.getAttribute('data-op-height')),
        step: stepIndex(el, 1),
        rect: null
      };
    });
    var edges = readEdges(host, nodes, stepIndex);
    var graph = ranks(nodes.length, edges, nodes.map(function (node) { return node.col; }));
    var rank = graph.rank;
    var h = rows(nodes.length, edges, rank, nodes.map(function (node) { return node.row; }));
    edges.forEach(function (edge, i) {
      var backward = rank[edge.to] < rank[edge.from] || graph.back.has(i);
      var same = rank[edge.to] === rank[edge.from];
      var exit = same ? (h[edge.to] > h[edge.from] ? (down ? 'right' : 'bottom') : (down ? 'left' : 'top')) : backward ? backSide : flowSide;
      var enter = same ? opposite[exit] : backward ? backSide : opposite[flowSide];
      edge.exit = edge.exit || exit;
      edge.enter = edge.enter || enter;
      if (!edge.step) edge.step = Math.max(nodes[edge.from].step, nodes[edge.to].step);
    });
    var blockIndex = model.blocks.map(function (el) { return model.els.indexOf(el); });

    // Wrap the list in a scroll area and a stage that also holds the line and label layers.
    var scroll = document.createElement('div');
    scroll.className = 'op-pipe-scroll';
    var stage = document.createElement('div');
    stage.className = 'op-pipe-stage';
    model.list.parentNode.insertBefore(scroll, model.list);
    scroll.appendChild(stage);
    stage.appendChild(model.list);
    var lines = diagram.svg('svg', { class: 'op-pipe-lines', 'aria-hidden': 'true', focusable: 'false' }, stage);
    var labels = document.createElement('div');
    labels.className = 'op-pipe-labels';
    labels.setAttribute('aria-hidden', 'true');
    stage.appendChild(labels);
    model.list.setAttribute('role', 'list');
    // Lines replace the visually hidden links, so only blocks take focus.
    OffPrint._all('.op-pipe-link', model.list).forEach(function (link) { link.tabIndex = -1; });
    if (!host.id) host.id = detail.uniqueId('op-pipeline');
    var width = OffPrint._maxWidth(host.getAttribute('data-op-block-width'));
    if (width) host.style.setProperty('--op-pipe-block-width', width);

    nodes.forEach(function (node) {
      if (node.width) node.el.style.width = node.width;
      if (node.height) node.el.style.height = node.height;
      if (!node.junction) refreshFields(node.el);
    });
    describeLinks(nodes, edges);

    var state = {
      host: host, nodes: nodes, edges: edges, rank: rank, h: h, down: down,
      stage: stage, lines: lines, labels: labels, paths: [], stems: [], tags: [],
      trace: null, step: 0, total: model.stepDomain ? model.stepDomain.keys.length : 0
    };

    // ---- Selection, detail pane, and keyboard ----
    var buttons = model.blocks;
    var selection = diagram.selection('pipeline', host, model.domain, function (index, key) {
      return { key: key, index: index, blockId: buttons[index].id };
    }, model.stepDomain ? 'block-selection-group' : 'selection-group');

    function hidden(i) { return nodes[i].el.hasAttribute('data-op-pipe-hidden'); }

    function neighbours(i, forward) {
      var found = [];
      var seen = new Set([i]);
      (function walk(v) {
        edges.forEach(function (edge) {
          var next = forward ? edge.from === v && edge.to : edge.to === v && edge.from;
          if (next === false || seen.has(next)) return;
          seen.add(next);
          if (nodes[next].junction) walk(next);
          else if (!hidden(next)) found.push(next);
        });
      })(i);
      return found;
    }

    function closest(i, list) {
      var at = nodes[i].rect;
      var axis = down ? 'x' : 'y';
      return list.sort(function (a, b) {
        return Math.abs(nodes[a].rect[axis] - at[axis]) - Math.abs(nodes[b].rect[axis] - at[axis]);
      })[0];
    }

    function across(i, delta) {
      var list = blockIndex.filter(function (v) { return rank[v] === rank[i] && !hidden(v); })
        .sort(function (a, b) { return h[a] - h[b]; });
      return list[list.indexOf(i) + delta];
    }

    buttons.forEach(function (button, b) {
      var i = blockIndex[b];
      button.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch' || hidden(i)) return;
        preview(state, i);
        if (selection.controller.snapshot().index !== b) selection.choose(b, 'user');
      });
      button.addEventListener('click', function () { if (!hidden(i)) selection.choose(b, 'user'); });
      button.addEventListener('focus', function () {
        preview(state, i);
        if (selection.controller.snapshot().index !== b) selection.choose(b, 'user');
        selection.roving(b);
      });
      button.addEventListener('keydown', function (event) {
        var along = down ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
        var side = down ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
        var visible = blockIndex.filter(function (v) { return !hidden(v); });
        var target;
        if (along[event.key]) target = closest(i, neighbours(i, along[event.key] > 0));
        else if (side[event.key]) target = across(i, side[event.key]);
        else if (event.key === 'Home') target = visible[0];
        else if (event.key === 'End') target = visible[visible.length - 1];
        else return;
        event.preventDefault();
        if (target !== undefined) nodes[target].el.focus();
      });
    });
    stage.addEventListener('pointerleave', function () {
      var focused = nodes.findIndex(function (node) { return node.el === document.activeElement; });
      preview(state, focused < 0 ? null : focused);
    });
    host.addEventListener('focusout', function (event) {
      if (!stage.contains(event.relatedTarget)) preview(state, null);
    });

    var steps = null;
    if (model.stepDomain) {
      var domain = model.stepDomain;
      var timer = null;
      var notes = domain.items.map(sequence.detail);

      function pause(origin) {
        if (timer === null) return true;
        root.clearInterval(timer);
        timer = null;
        var notify = steps.stage(origin);
        if (notify) notify();
        return true;
      }

      function play(origin) {
        if (timer !== null || domain.keys.length < 2) return false;
        timer = root.setInterval(function () {
          if (!steps.controller.snapshot().canNext) steps.run('pause', origin);
          else steps.choose(steps.controller.index + 1, 'playback');
        }, 1400);
        if (!steps.controller.snapshot().canNext) steps.choose(domain.initial, 'playback');
        var notify = steps.stage(origin);
        if (notify) notify();
        return true;
      }

      steps = sequence.indexed('pipeline', host, domain, function (index, previous, origin) {
        state.step = index + 1;
        reveal(state);
        sequence.showDetails(notes, index);
        var first = blockIndex.find(function (v) { return nodes[v].step === state.step; });
        if (first !== undefined && (origin === 'user' || origin === 'playback')) {
          selection.choose(blockIndex.indexOf(first), origin);
        }
      }, {
        playing: function () { return timer !== null; },
        stop: function (origin) {
          if (origin !== 'playback' && timer !== null) {
            root.clearInterval(timer);
            timer = null;
          }
        },
        transport: { play: play, pause: pause }
      });
      var pill = sequence.pill(steps, {
        className: 'op-pipe-steps', label: 'Pipeline steps',
        controls: scroll.id = detail.uniqueId(host.id + '-canvas'),
        initial: function () { return domain.initial; },
        canPlay: function () { return domain.keys.length > 1; },
        status: function (current) {
          return sequence.label(domain.items[current.index]) || 'Step ' + (current.index + 1) + ' of ' + current.count;
        }
      });
      if (domain.keys.length > 1) host.insertBefore(pill.element, scroll);
      model.steps.hidden = true;
    }

    // ---- Detail pane ----
    var pane = host.querySelector(':scope > .op-detail-pane');
    if (pane) {
      var placement = host.getAttribute('data-op-detail-layout');
      if (placement && placement !== 'side' && placement !== 'below') issue(host, 'Invalid data-op-detail-layout value.', 'Use below or side.');
    }
    diagram.connectDetails(host, pane, selection.controller);

    state.layout = function () { layout(state); };
    var controller = Object.assign({}, selection.controller, {
      layout: function () { layout(state); return true; },
      fields: function (id, values) { return setFields(state, id, values); },
      steps: steps ? steps.controller : null
    });
    hosts.set(host, controller);

    host.classList.add('op-pipeline-ready');
    layout(state);
    if (steps) steps.start();
    else reveal(state);
    selection.start();

    var pending = 0;
    function schedule() {
      if (pending) return;
      pending = (root.requestAnimationFrame || root.setTimeout)(function () {
        pending = 0;
        layout(state);
      });
    }
    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(schedule);
      nodes.forEach(function (node) { observer.observe(node.el); });
      observer.observe(scroll);
    }
    if (root.MutationObserver) {
      new root.MutationObserver(function (records) {
        var blocks = new Set();
        records.forEach(function (record) {
          for (var el = record.target.nodeType === 1 ? record.target : record.target.parentNode; el && el !== model.list; el = el.parentNode) {
            if (el.classList && el.classList.contains('op-pipe-block')) { blocks.add(el); break; }
          }
        });
        blocks.forEach(refreshFields);
        if (blocks.size) schedule();
      }).observe(model.list, { subtree: true, childList: true, characterData: true });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    root.addEventListener('load', schedule, { once: true });
  }

  // Mark empty fields and copy field content into override slots, so overrides follow the structured fields.
  function refreshFields(block) {
    var fields = fieldsOf(block);
    FIELDS.forEach(function (name) {
      var field = fields[name];
      if (field) field.toggleAttribute('data-op-pipe-empty', isEmpty(field));
    });
    var display = block.querySelector(':scope > .op-pipe-display');
    if (!display) return;
    display.setAttribute('aria-hidden', 'true');
    OffPrint._all('[data-op-slot]', display).forEach(function (slot) {
      var field = fields[slot.getAttribute('data-op-slot')];
      var copy = field ? field.cloneNode(true) : null;
      if (copy) OffPrint._all('[id]', copy).forEach(function (el) { el.removeAttribute('id'); });
      var text = copy ? Array.from(copy.childNodes) : [];
      if (slot.childNodes.length !== text.length || slot.innerHTML !== (copy ? copy.innerHTML : '')) slot.replaceChildren.apply(slot, text);
      slot.toggleAttribute('data-op-pipe-empty', !field || isEmpty(field));
    });
  }

  function setFields(state, id, values) {
    var node = state.nodes.find(function (n) { return n.el.id === id && !n.junction; });
    if (!node || !values || typeof values !== 'object') return false;
    var keys = Object.keys(values);
    if (keys.some(function (key) { return !FIELDS.includes(key) || (values[key] !== null && typeof values[key] !== 'string'); })) return false;
    var fields = fieldsOf(node.el);
    keys.forEach(function (name) {
      var field = fields[name];
      if (!field) {
        field = document.createElement('p');
        field.className = 'op-pipe-' + name;
        var after = FIELDS.slice(FIELDS.indexOf(name) + 1).map(function (n) { return fields[n]; }).find(Boolean);
        node.el.insertBefore(field, after || node.el.querySelector(':scope > .op-pipe-display, :scope > .op-pipe-links') || null);
        fields[name] = field;
      }
      field.textContent = values[name] || '';
    });
    refreshFields(node.el);
    describeLinks(state.nodes, state.edges);
    layout(state);
    return true;
  }

  // Blocks without authored links get a hidden "Leads to" sentence for screen readers.
  function describeLinks(nodes, edges) {
    function name(i) {
      var headline = nodes[i].el.querySelector(':scope > .op-pipe-headline');
      return headline && headline.textContent.trim() || nodes[i].el.id;
    }
    nodes.forEach(function (node, i) {
      if (node.junction || node.el.querySelector(':scope > .op-pipe-links')) return;
      var targets = [];
      var seen = new Set([i]);
      (function walk(v) {
        edges.forEach(function (edge) {
          if (edge.from !== v || seen.has(edge.to)) return;
          seen.add(edge.to);
          if (nodes[edge.to].junction) walk(edge.to);
          else targets.push(name(edge.to));
        });
      })(i);
      var note = node.el.querySelector(':scope > .op-pipe-sr');
      if (!targets.length) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = document.createElement('span');
        note.className = 'op-pipe-sr';
        node.el.appendChild(note);
      }
      var text = 'Leads to ' + targets.join(', ') + '.';
      if (note.textContent !== text) note.textContent = text;
    });
  }

  function layout(state) {
    var nodes = state.nodes;
    var stage = state.stage;
    if (!stage.isConnected || !stage.offsetParent && root.getComputedStyle(stage).position !== 'fixed') return;
    var style = root.getComputedStyle(stage);
    var gapX = parseFloat(style.columnGap) || 0;
    var gapY = parseFloat(style.rowGap) || 0;
    var down = state.down;

    // Measure natural sizes, then give blocks in a rank one shared height.
    nodes.forEach(function (node) { if (!node.junction && !node.height) node.el.style.minHeight = ''; });
    var sizes = nodes.map(function (node) { return [node.el.offsetWidth, node.el.offsetHeight]; });
    var tallest = {};
    nodes.forEach(function (node, i) {
      if (node.junction || node.height) return;
      tallest[state.rank[i]] = Math.max(tallest[state.rank[i]] || 0, sizes[i][1]);
    });
    nodes.forEach(function (node, i) {
      if (node.junction || node.height) return;
      var target = tallest[state.rank[i]];
      if (target > sizes[i][1]) {
        node.el.style.minHeight = target + 'px';
        sizes[i][1] = target;
      }
    });

    var main = down ? 1 : 0;
    var crossAxis = 1 - main;
    var mainBands = diagram.bands(state.rank, sizes.map(function (s) { return s[main]; }), down ? gapY : gapX);
    var c = diagram.centers(state.h, state.rank, sizes.map(function (s) { return s[crossAxis]; }), down ? gapX : gapY);
    var crossTotal = Math.max.apply(null, state.h.map(function (row, i) { return c[row] + sizes[i][crossAxis] / 2; }));
    var pad = 32;
    nodes.forEach(function (node, i) {
      var center = [];
      center[main] = mainBands.center[state.rank[i]] + pad;
      center[crossAxis] = c[state.h[i]] + pad;
      node.rect = { x: center[0] - sizes[i][0] / 2, y: center[1] - sizes[i][1] / 2, w: sizes[i][0], h: sizes[i][1] };
      node.el.style.left = node.rect.x + 'px';
      node.el.style.top = node.rect.y + 'px';
    });
    var total = [];
    total[main] = mainBands.total + pad * 2;
    total[crossAxis] = crossTotal + pad * 2;
    stage.style.width = total[0] + 'px';
    stage.style.height = total[1] + 'px';
    state.grid = { main: main, bands: mainBands.center, c: c, pad: pad };
    draw(state, total);
  }

  function gridPoint(state, via) {
    var g = state.grid;
    var p = [];
    p[g.main] = diagram.interpolate(g.bands, via[0]) + g.pad;
    p[1 - g.main] = diagram.interpolate(g.c, via[1]) + g.pad;
    return p;
  }

  function draw(state, total) {
    var nodes = state.nodes;
    var edges = state.edges;
    var lines = state.lines;
    lines.replaceChildren();
    state.labels.replaceChildren();
    lines.setAttribute('width', total[0]);
    lines.setAttribute('height', total[1]);
    lines.setAttribute('viewBox', '0 0 ' + total[0] + ' ' + total[1]);
    var defs = diagram.svg('defs', {}, lines);
    var stageSize = total;
    var uid = state.host.id;

    // Fork and merge stems: two or more lines sharing a block side share one short straight stem.
    var groups = new Map();
    edges.forEach(function (edge, i) {
      [['out', edge.from, edge.exit], ['in', edge.to, edge.enter]].forEach(function (end) {
        if (nodes[end[1]].junction) return;
        var key = end.join(':');
        if (!groups.has(key)) groups.set(key, { kind: end[0], node: end[1], side: end[2], edges: [] });
        groups.get(key).edges.push(i);
      });
    });
    var stemAt = {};
    var stems = [];
    groups.forEach(function (group, key) {
      if (group.edges.length < 2) return;
      var port = diagram.sideOf(nodes[group.node].rect, group.side);
      var tip = diagram.add(port, diagram.mul(SIDES[group.side], STEM));
      stemAt[key] = tip;
      stems.push({ group: group, port: port, tip: tip });
    });

    function endpoint(node, side, kind) {
      var key = [kind, node, side].join(':');
      if (stemAt[key]) return stemAt[key];
      var rect = nodes[node].rect;
      return nodes[node].junction ? [rect.x + rect.w / 2, rect.y + rect.h / 2] : diagram.sideOf(rect, side);
    }

    var shapes = edges.map(function (edge) {
      var start = endpoint(edge.from, edge.exit, 'out');
      var end = endpoint(edge.to, edge.enter, 'in');
      var merged = Boolean(stemAt[['in', edge.to, edge.enter].join(':')]);
      var forked = Boolean(stemAt[['out', edge.from, edge.exit].join(':')]);
      var endDir = diagram.mul(SIDES[edge.enter], -1);
      var startDir = SIDES[edge.exit];
      if (nodes[edge.to].junction) endDir = diagram.unit(diagram.sub(end, start));
      if (nodes[edge.from].junction) startDir = diagram.unit(diagram.sub(end, start));
      var endArrow = !merged && (edge.arrow === 'end' || edge.arrow === 'both');
      var startArrow = !forked && (edge.arrow === 'start' || edge.arrow === 'both');
      var a = startArrow ? diagram.add(start, diagram.mul(startDir, ARROW - 2)) : start;
      var b = endArrow ? diagram.sub(end, diagram.mul(endDir, ARROW - 2)) : end;
      var points = [a].concat(edge.via.map(function (via) { return gridPoint(state, via); }), [b]);
      var segments = diagram.curve(points, startDir, endDir);
      return {
        segments: segments, poly: diagram.sample(segments, 20),
        arrows: [startArrow && [start, diagram.mul(startDir, -1)], endArrow && [end, endDir]].filter(Boolean)
      };
    });

    // Grow the stage when a loop bends past its edge, so the scroll area keeps it in view.
    var far = shapes.reduce(function (most, shape) {
      shape.poly.forEach(function (p) { most[0] = Math.max(most[0], p[0] + 8); most[1] = Math.max(most[1], p[1] + 8); });
      return most;
    }, stageSize.slice());
    if (far[0] > stageSize[0]) state.stage.style.width = far[0] + 'px';
    if (far[1] > stageSize[1]) state.stage.style.height = far[1] + 'px';

    // Gaps go into the later line wherever two unrelated lines cross.
    var gaps = edges.map(function () { return []; });
    for (var i = 0; i < edges.length; i++) {
      for (var j = i + 1; j < edges.length; j++) {
        var shared = [edges[i].from, edges[i].to].some(function (n) { return n === edges[j].from || n === edges[j].to; });
        if (!shared) gaps[j] = gaps[j].concat(diagram.crossings(shapes[i].poly, shapes[j].poly, GAP));
      }
    }

    state.paths = edges.map(function (edge, index) {
      var g = diagram.svg('g', {
        class: 'op-pipe-edge op-pipe-line-' + edge.line + (edge.flow ? ' op-pipe-flow' : ''),
        'data-op-color': edge.color, 'data-op-role': edge.role
      }, lines);
      var mask = null;
      if (gaps[index].length) {
        mask = uid + '-gap-' + index;
        var m = diagram.svg('mask', { id: mask, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: total[0], height: total[1] }, defs);
        diagram.svg('rect', { x: 0, y: 0, width: total[0], height: total[1], fill: 'white' }, m);
        gaps[index].forEach(function (p) { diagram.svg('circle', { cx: p[0], cy: p[1], r: GAP, fill: 'black' }, m); });
      }
      diagram.svg('path', { class: 'op-pipe-path', d: diagram.pathData(shapes[index].segments), mask: mask && 'url(#' + mask + ')' }, g);
      shapes[index].arrows.forEach(function (arrow) { arrowHead(g, arrow[0], arrow[1]); });
      if (edge.label) {
        var tag = document.createElement('span');
        tag.className = 'op-pipe-label';
        if (edge.color) tag.setAttribute('data-op-color', edge.color);
        if (edge.role) tag.setAttribute('data-op-role', edge.role);
        tag.textContent = edge.label;
        var at = diagram.midpoint(shapes[index].segments);
        tag.style.left = at[0] + 'px';
        tag.style.top = at[1] + 'px';
        state.labels.appendChild(tag);
        edge.tag = tag;
      }
      return g;
    });

    state.stems = stems.map(function (stem) {
      var first = edges[stem.group.edges[0]];
      var g = diagram.svg('g', { class: 'op-pipe-edge op-pipe-stem', 'data-op-color': first.color, 'data-op-role': first.role }, lines);
      var inward = stem.group.kind === 'in';
      var arrow = inward && stem.group.edges.some(function (e) { return /end|both/.test(edges[e].arrow); });
      var dir = diagram.mul(SIDES[stem.group.side], -1);
      var end = arrow ? diagram.sub(stem.port, diagram.mul(dir, ARROW - 2)) : stem.port;
      diagram.svg('path', { class: 'op-pipe-path', d: 'M' + stem.tip[0] + ' ' + stem.tip[1] + 'L' + end[0] + ' ' + end[1] }, g);
      if (arrow) arrowHead(g, stem.port, dir);
      return { g: g, edges: stem.group.edges };
    });
    reveal(state);
  }

  function arrowHead(g, tip, dir) {
    var base = diagram.sub(tip, diagram.mul(dir, ARROW));
    var n = [-dir[1] * ARROW * 0.55, dir[0] * ARROW * 0.55];
    var a = diagram.add(base, n);
    var b = diagram.sub(base, n);
    diagram.svg('path', { class: 'op-pipe-arrow', d: 'M' + tip.join(' ') + 'L' + a.join(' ') + 'L' + b.join(' ') + 'Z' }, g);
  }

  // Emphasize everything upstream and downstream of a block; dim the rest.
  function preview(state, index) {
    if (state.trace === index) return;
    state.trace = index;
    paint(state);
  }

  function reach(state, start, forward) {
    var seen = new Set([start]);
    var queue = [start];
    while (queue.length) {
      var v = queue.shift();
      state.edges.forEach(function (edge) {
        var next = forward ? edge.from === v && edge.to : edge.to === v && edge.from;
        if (next !== false && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
    return seen;
  }

  function paint(state) {
    var index = state.trace;
    var host = state.host;
    host.classList.toggle('op-pipe-tracing', index !== null);
    var up = index === null ? null : reach(state, index, false);
    var downstream = index === null ? null : reach(state, index, true);
    function on(edge) {
      return (up.has(edge.from) && up.has(edge.to)) || (downstream.has(edge.from) && downstream.has(edge.to));
    }
    state.nodes.forEach(function (node, i) {
      node.el.toggleAttribute('data-op-pipe-trace', index !== null && (up.has(i) || downstream.has(i)));
    });
    var active = state.edges.map(function (edge) { return index !== null && on(edge); });
    state.paths.forEach(function (g, i) {
      g.toggleAttribute('data-op-pipe-trace', active[i]);
      if (state.edges[i].tag) state.edges[i].tag.toggleAttribute('data-op-pipe-trace', active[i]);
    });
    state.stems.forEach(function (stem) {
      stem.g.toggleAttribute('data-op-pipe-trace', stem.edges.some(function (i) { return active[i]; }));
    });
  }

  function reveal(state) {
    var step = state.total > 1 ? state.step || 1 : Infinity;
    var shown = state.edges.map(function (edge) { return edge.step <= step; });
    state.nodes.forEach(function (node) {
      node.el.toggleAttribute('data-op-pipe-hidden', node.step > step);
      node.el.toggleAttribute('data-op-pipe-current', state.total > 1 && node.step === step);
    });
    state.paths.forEach(function (g, i) {
      g.toggleAttribute('data-op-pipe-hidden', !shown[i]);
      if (state.edges[i].tag) state.edges[i].tag.toggleAttribute('data-op-pipe-hidden', !shown[i]);
    });
    state.stems.forEach(function (stem) {
      stem.g.toggleAttribute('data-op-pipe-hidden', !stem.edges.some(function (i) { return shown[i]; }));
    });
    paint(state);
  }

  OffPrint._pipeline = {
    ranks: ranks, rows: rows, parseVia: parseVia, isEmpty: isEmpty,
    get: function (target) { return hosts.get(items.target(target)) || null; }
  };

  items.scan('pipeline', function () {
    OffPrint._all('.op-pipeline').forEach(function (host) {
      var model = prepare(host);
      if (model && model.stepDomain) {
        items.collect('pipeline', host, model.stepDomain);
        items.collect('pipeline', host, model.domain, 'block-selection-group');
      } else items.collect('pipeline', host, model && model.domain);
    });
  });
  OffPrint.register('pipeline', function () { OffPrint._all('.op-pipeline').forEach(setup); });
})(typeof window !== 'undefined' ? window : globalThis);
