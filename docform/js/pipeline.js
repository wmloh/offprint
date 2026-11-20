// Pipeline block diagrams: structured HTML blocks placed in ranked columns and joined by curved SVG lines.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm._detail) {
    if (typeof console !== 'undefined') console.warn('[docform] pipeline.js needs core.js and detail.js loaded before it.');
    return;
  }

  var items = DocForm._items;
  var detail = DocForm._detail;
  var SVG = 'http://www.w3.org/2000/svg';
  var FIELDS = ['eyebrow', 'headline', 'description'];
  var SIDES = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] };
  var STEM = 12;
  var ARROW = 8;
  var GAP = 5;
  var hosts = new WeakMap();
  var models = new WeakMap();
  var serial = 0;

  // ---- Layout geometry (pure) ----

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

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
        key[node] = pins[node] != null ? pins[node] / 2 : near.length ? mean(near.map(function (u) { return pos[u]; })) : pos[node];
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
        var want = placed.length ? Math.round(mean(placed.map(function (u) { return h[u]; }))) : 0;
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
        var want = Math.round(mean(succs[node].map(function (u) { return h[u]; })));
        var lo = i > 0 ? h[list[i - 1]] + 2 : 0;
        var hi = i < list.length - 1 ? h[list[i + 1]] - 2 : Infinity;
        want = Math.min(Math.max(want, lo, 0), hi);
        if (want >= lo && !clashes(fixed, want)) h[node] = want;
      });
    }
    return h;
  }

  // Cross-axis centers for every half row. Neighbours in a rank keep their gap; spacing is shared evenly.
  function centers(h, rank, size, gap) {
    var maxH = Math.max.apply(null, h);
    var step = [];
    for (var k = 0; k < maxH; k++) step.push(0);
    var byRank = {};
    h.forEach(function (_, v) { (byRank[rank[v]] = byRank[rank[v]] || []).push(v); });
    Object.keys(byRank).forEach(function (r) {
      var list = byRank[r].sort(function (a, b) { return h[a] - h[b]; });
      for (var i = 1; i < list.length; i++) {
        var a = list[i - 1];
        var b = list[i];
        var span = Math.max(h[b] - h[a], 1);
        var per = (size[a] / 2 + gap + size[b] / 2) / span;
        for (var j = h[a]; j < h[a] + span && j < maxH; j++) step[j] = Math.max(step[j], per);
      }
    });
    var fallback = (mean(size) + gap) / 2;
    var c = [0];
    for (k = 0; k < maxH; k++) c.push(c[k] + (step[k] || fallback));
    var top = Math.min.apply(null, h.map(function (row, v) { return c[row] - size[v] / 2; }));
    return c.map(function (value) { return value - top; });
  }

  function bands(rank, size, gap) {
    var maxRank = Math.max.apply(null, rank);
    var width = [];
    for (var r = 0; r <= maxRank; r++) width.push(0);
    rank.forEach(function (r, v) { width[r] = Math.max(width[r], size[v]); });
    var start = [0];
    for (r = 1; r <= maxRank; r++) start.push(start[r - 1] + width[r - 1] + gap);
    return {
      center: width.map(function (w, i) { return start[i] + w / 2; }),
      total: start[maxRank] + width[maxRank]
    };
  }

  // Linear interpolation over evenly indexed positions, extrapolating past the ends.
  function interpolate(list, at) {
    if (list.length === 1) return list[0];
    var i = Math.min(Math.max(Math.floor(at), 0), list.length - 2);
    return list[i] + (at - i) * (list[i + 1] - list[i]);
  }

  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function length(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function unit(a) {
    var l = length(a);
    return l ? [a[0] / l, a[1] / l] : [1, 0];
  }

  // Smooth cubic segments through the points. Directions are travel directions at the ends.
  function curve(points, startDir, endDir) {
    var last = points.length - 1;
    var tangents = points.map(function (point, i) {
      return i === 0 ? startDir : i === last ? endDir : unit(sub(points[i + 1], points[i - 1]));
    });
    var segments = [];
    for (var i = 0; i < last; i++) {
      var a = points[i];
      var b = points[i + 1];
      var chord = sub(b, a);
      var k = Math.max(length(chord) * (last > 1 ? 0.35 : 0.42), 24);
      // A tangent across the chord (a loop back) gets a short handle so the bend stays near the blocks.
      var along = unit(chord);
      var k0 = tangents[i][0] * along[0] + tangents[i][1] * along[1] < 0.3 ? Math.min(k, 40) : k;
      var k1 = tangents[i + 1][0] * along[0] + tangents[i + 1][1] * along[1] < 0.3 ? Math.min(k, 40) : k;
      segments.push([a, add(a, mul(tangents[i], k0)), sub(b, mul(tangents[i + 1], k1)), b]);
    }
    return segments;
  }

  function point(segment, t) {
    var u = 1 - t;
    var a = u * u * u;
    var b = 3 * u * u * t;
    var c = 3 * u * t * t;
    var d = t * t * t;
    return [a * segment[0][0] + b * segment[1][0] + c * segment[2][0] + d * segment[3][0],
      a * segment[0][1] + b * segment[1][1] + c * segment[2][1] + d * segment[3][1]];
  }

  function midpoint(segments) {
    return point(segments[Math.floor((segments.length - 1) / 2)], segments.length % 2 ? 0.5 : 1);
  }

  function sample(segments, count) {
    var points = [segments[0][0]];
    segments.forEach(function (segment) {
      for (var i = 1; i <= count; i++) points.push(point(segment, i / count));
    });
    return points;
  }

  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }

  function intersect(p1, p2, q1, q2) {
    var r = sub(p2, p1);
    var s = sub(q2, q1);
    var d = cross(r, s);
    if (Math.abs(d) < 1e-9) return null;
    var t = cross(sub(q1, p1), s) / d;
    var u = cross(sub(q1, p1), r) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(p1, mul(r, t)) : null;
  }

  function crossings(a, b) {
    var found = [];
    for (var i = 1; i < a.length; i++) {
      for (var j = 1; j < b.length; j++) {
        if (Math.max(a[i - 1][0], a[i][0]) < Math.min(b[j - 1][0], b[j][0]) ||
            Math.min(a[i - 1][0], a[i][0]) > Math.max(b[j - 1][0], b[j][0]) ||
            Math.max(a[i - 1][1], a[i][1]) < Math.min(b[j - 1][1], b[j][1]) ||
            Math.min(a[i - 1][1], a[i][1]) > Math.max(b[j - 1][1], b[j][1])) continue;
        var hit = intersect(a[i - 1], a[i], b[j - 1], b[j]);
        if (hit && !found.some(function (other) { return length(sub(other, hit)) < GAP * 2; })) found.push(hit);
      }
    }
    return found;
  }

  function pathData(segments) {
    function f(n) { return Math.round(n * 10) / 10; }
    return 'M' + f(segments[0][0][0]) + ' ' + f(segments[0][0][1]) + segments.map(function (s) {
      return 'C' + [s[1], s[2], s[3]].map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join(' ');
    }).join('');
  }

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
    return !field.textContent.trim() && !field.querySelector('img, svg, video, canvas, iframe, math, .df-math, input, button');
  }

  function fieldsOf(block) {
    var found = {};
    FIELDS.forEach(function (name) { found[name] = block.querySelector(':scope > .df-pipe-' + name); });
    return found;
  }

  function positive(el, name, half) {
    var value = el.getAttribute('data-df-' + name);
    if (value === null) return null;
    var n = Number(value);
    if (Number.isFinite(n) && n >= 1 && (half ? Number.isInteger(n * 2) : Number.isInteger(n))) return half ? (n - 1) * 2 : n - 1;
    issue(el, 'Invalid data-df-' + name + ' value.', half ? 'Use a row of 1 or more in steps of 0.5.' : 'Use a whole column of 1 or more.');
    return null;
  }

  function prepare(host) {
    if (models.has(host)) return models.get(host);
    var list = host.querySelector(':scope > .df-pipe-blocks');
    var els = list ? DocForm.all(':scope > .df-pipe-block, :scope > .df-pipe-junction', list) : [];
    if (!els.some(function (el) { return el.classList.contains('df-pipe-block'); })) {
      issue(host, 'A pipeline needs a .df-pipe-blocks list with at least one block.', 'Add li.df-pipe-block items to an ol.df-pipe-blocks child.');
      models.set(host, null);
      return null;
    }
    var base = host.id || 'df-pipeline-' + (++serial);
    els.forEach(function (el, i) {
      if (!el.id) el.id = detail.uniqueId(base + '-' + (i + 1));
      if (el.classList.contains('df-pipe-block') && !el.hasAttribute('data-df-key')) el.setAttribute('data-df-key', el.id);
    });
    var blocks = els.filter(function (el) { return el.classList.contains('df-pipe-block'); });
    var model = { list: list, els: els, blocks: blocks, domain: items.domain('pipeline', host, blocks) };
    models.set(host, model.domain ? model : null);
    return models.get(host);
  }

  function readEdges(host, nodes) {
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
      (node.el.getAttribute('data-df-to') || '').split(/\s+/).filter(Boolean).forEach(function (id) { add(from, id); });
      DocForm.all('.df-pipe-link', node.el).forEach(function (link) {
        var href = link.getAttribute('href');
        var id = link.getAttribute('data-df-to') || (href && href.charAt(0) === '#' ? decodeURIComponent(href.slice(1)) : null);
        if (id) add(from, id, link);
      });
    });
    var flowAll = items.flag(host, 'flow', 'pipeline');
    edges.forEach(function (edge) {
      var link = edge.link;
      var get = function (name) { return link ? link.getAttribute('data-df-' + name) : null; };
      var via = parseVia(get('via'));
      if (via === null) {
        issue(link, 'Invalid data-df-via value.', 'Use one-based "column row" pairs separated by semicolons.');
        via = [];
      }
      ['exit', 'enter'].forEach(function (name) {
        if (get(name) !== null && !SIDES[get(name)]) {
          issue(link, 'Invalid data-df-' + name + ' side.', 'Use top, right, bottom, or left.');
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
      edge.flow = link && link.hasAttribute('data-df-flow') ? items.flag(link, 'flow', 'pipeline') : flowAll;
      edge.exit = SIDES[get('exit')] ? get('exit') : null;
      edge.enter = SIDES[get('enter')] ? get('enter') : null;
      edge.via = via;
      var step = link && Number(get('step'));
      edge.step = Number.isInteger(step) && step > 0 ? step : null;
    });
    return edges;
  }

  // ---- Mounted diagram ----

  function svg(name, attrs, parent) {
    var el = document.createElementNS(SVG, name);
    Object.keys(attrs).forEach(function (key) { if (attrs[key] != null) el.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function sideOf(rect, side) {
    var d = SIDES[side];
    return [rect.x + rect.w / 2 + d[0] * rect.w / 2, rect.y + rect.h / 2 + d[1] * rect.h / 2];
  }

  function setup(host) {
    var model = prepare(host);
    if (!model) return;
    var down = host.getAttribute('data-df-direction') === 'down';
    if (host.hasAttribute('data-df-direction') && !/^(right|down)$/.test(host.getAttribute('data-df-direction'))) {
      issue(host, 'Invalid data-df-direction value.', 'Use right or down.');
    }
    var flowSide = down ? 'bottom' : 'right';
    var backSide = down ? 'right' : 'bottom';
    var opposite = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };

    var nodes = model.els.map(function (el) {
      var junction = el.classList.contains('df-pipe-junction');
      var step = Number(el.getAttribute('data-df-step'));
      return {
        el: el, junction: junction,
        col: positive(el, 'col'), row: positive(el, 'row', true),
        width: DocForm._maxWidth(el.getAttribute('data-df-width')),
        height: DocForm._maxWidth(el.getAttribute('data-df-height')),
        step: Number.isInteger(step) && step > 0 ? step : 1,
        rect: null
      };
    });
    var edges = readEdges(host, nodes);
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
    scroll.className = 'df-pipe-scroll';
    var stage = document.createElement('div');
    stage.className = 'df-pipe-stage';
    model.list.parentNode.insertBefore(scroll, model.list);
    scroll.appendChild(stage);
    stage.appendChild(model.list);
    var lines = svg('svg', { class: 'df-pipe-lines', 'aria-hidden': 'true', focusable: 'false' }, stage);
    var labels = document.createElement('div');
    labels.className = 'df-pipe-labels';
    labels.setAttribute('aria-hidden', 'true');
    stage.appendChild(labels);
    model.list.setAttribute('role', 'list');
    // Lines replace the visually hidden links, so only blocks take focus.
    DocForm.all('.df-pipe-link', model.list).forEach(function (link) { link.tabIndex = -1; });
    if (!host.id) host.id = detail.uniqueId('df-pipeline');
    var width = DocForm._maxWidth(host.getAttribute('data-df-block-width'));
    if (width) host.style.setProperty('--df-pipe-block-width', width);

    nodes.forEach(function (node) {
      if (node.width) node.el.style.width = node.width;
      if (node.height) node.el.style.height = node.height;
      if (!node.junction) refreshFields(node.el);
    });
    describeLinks(nodes, edges);

    var state = {
      host: host, nodes: nodes, edges: edges, rank: rank, h: h, down: down,
      stage: stage, lines: lines, labels: labels, paths: [], stems: [], tags: [],
      trace: null, step: 0, total: Math.max.apply(null, nodes.map(function (node) { return node.step; }))
    };

    // ---- Selection, detail pane, and keyboard ----
    var buttons = model.blocks;
    var selection = items.controller('pipeline', host, model.domain, function (index, key) {
      return { key: key, index: index, blockId: buttons[index].id };
    }, function (current, previous) {
      if (previous) buttons[previous.index].removeAttribute('aria-current');
      buttons[current.index].setAttribute('aria-current', 'true');
      roving(current.index);
    });

    function roving(index) {
      var focused = buttons.indexOf(document.activeElement);
      buttons.forEach(function (button, i) { button.tabIndex = i === (focused < 0 ? index : focused) ? 0 : -1; });
    }

    function hidden(i) { return nodes[i].el.hasAttribute('data-df-pipe-hidden'); }

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
        roving(b);
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

    // ---- Steps ----
    var stepEvents = items.signal('pipeline', host, function () { return stepSnapshot(); }, { action: 'step' });
    var pill = null;
    var timer = null;

    function stepSnapshot() {
      return state.total > 1 ? Object.freeze({ step: state.step, total: state.total }) : null;
    }

    function go(step, origin) {
      if (state.total < 2 || !Number.isInteger(step) || step < 1 || step > state.total) return false;
      if (step === state.step) return true;
      var previous = stepSnapshot();
      state.step = step;
      reveal(state);
      if (pill) {
        pill.count.textContent = 'Step ' + step + ' of ' + state.total;
        pill.buttons.reset.setAttribute('aria-disabled', String(step === 1));
        pill.buttons.previous.setAttribute('aria-disabled', String(step === 1));
        pill.buttons.next.setAttribute('aria-disabled', String(step === state.total));
      }
      var first = blockIndex.find(function (v) { return nodes[v].step === step; });
      if (first !== undefined && origin === 'user') selection.choose(blockIndex.indexOf(first), origin);
      var current = stepSnapshot();
      items.notify(function () { stepEvents.emit(current, previous, origin); });
      return true;
    }

    function play(on) {
      if (!pill) return;
      root.clearInterval(timer);
      timer = null;
      if (on) {
        if (state.step === state.total) go(1, 'user');
        timer = root.setInterval(function () {
          if (state.step >= state.total) play(false);
          else go(state.step + 1, 'user');
        }, 1400);
      }
      DocForm._pill.icon(pill.buttons.play, on ? 'pause' : 'play', on ? 'Pause' : 'Play');
    }

    var follow = host.getAttribute('data-df-steps-follow');
    if (state.total > 1 && follow) {
      var stepper = DocForm.stepper && DocForm.stepper.get(follow);
      if (!stepper) issue(host, 'A pipeline follows a missing stepper.', 'Enable stepper and set data-df-steps-follow to its list ID.');
      else stepper.subscribe(function (current) { go(Math.min(current.index + 1, state.total), 'source'); }, { immediate: true });
    } else if (state.total > 1) {
      pill = DocForm._pill.create('df-pipe-steps', 'Pipeline steps', [
        { name: 'reset', label: 'Reset', run: function () { play(false); go(1, 'reset'); } },
        { name: 'previous', label: 'Previous step', run: function () { play(false); go(state.step - 1, 'user'); } },
        'count',
        { name: 'next', label: 'Next step', run: function () { play(false); go(state.step + 1, 'user'); } },
        { name: 'play', label: 'Play', run: function () { play(timer === null); } }
      ], scroll.id = detail.uniqueId(host.id + '-canvas'));
      host.insertBefore(pill.element, scroll);
    }

    // ---- Detail pane ----
    var pane = host.querySelector(':scope > .df-detail-pane');
    if (pane) {
      var placement = host.getAttribute('data-df-detail-layout');
      if (placement && placement !== 'side' && placement !== 'below') issue(host, 'Invalid data-df-detail-layout value.', 'Use below or side.');
      detail.mount(pane, { source: host });
    }
    detail.source(host, selection.controller);

    state.layout = function () { layout(state); };
    var controller = Object.assign({}, selection.controller, {
      layout: function () { layout(state); return true; },
      fields: function (id, values) { return setFields(state, id, values); },
      steps: {
        go: function (step) { return go(step, 'api'); },
        next: function () { return go(state.step + 1, 'api'); },
        previous: function () { return go(state.step - 1, 'api'); },
        reset: function () { return go(1, 'reset'); },
        snapshot: stepSnapshot,
        subscribe: stepEvents.subscribe
      }
    });
    hosts.set(host, controller);

    host.classList.add('df-pipeline-ready');
    layout(state);
    if (state.total > 1) go(1, 'init');
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
            if (el.classList && el.classList.contains('df-pipe-block')) { blocks.add(el); break; }
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
      if (field) field.toggleAttribute('data-df-pipe-empty', isEmpty(field));
    });
    var display = block.querySelector(':scope > .df-pipe-display');
    if (!display) return;
    display.setAttribute('aria-hidden', 'true');
    DocForm.all('[data-df-slot]', display).forEach(function (slot) {
      var field = fields[slot.getAttribute('data-df-slot')];
      var copy = field ? field.cloneNode(true) : null;
      if (copy) DocForm.all('[id]', copy).forEach(function (el) { el.removeAttribute('id'); });
      var text = copy ? Array.from(copy.childNodes) : [];
      if (slot.childNodes.length !== text.length || slot.innerHTML !== (copy ? copy.innerHTML : '')) slot.replaceChildren.apply(slot, text);
      slot.toggleAttribute('data-df-pipe-empty', !field || isEmpty(field));
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
        field.className = 'df-pipe-' + name;
        var after = FIELDS.slice(FIELDS.indexOf(name) + 1).map(function (n) { return fields[n]; }).find(Boolean);
        node.el.insertBefore(field, after || node.el.querySelector(':scope > .df-pipe-display, :scope > .df-pipe-links') || null);
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
      var headline = nodes[i].el.querySelector(':scope > .df-pipe-headline');
      return headline && headline.textContent.trim() || nodes[i].el.id;
    }
    nodes.forEach(function (node, i) {
      if (node.junction || node.el.querySelector(':scope > .df-pipe-links')) return;
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
      var note = node.el.querySelector(':scope > .df-pipe-sr');
      if (!targets.length) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = document.createElement('span');
        note.className = 'df-pipe-sr';
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
    var mainBands = bands(state.rank, sizes.map(function (s) { return s[main]; }), down ? gapY : gapX);
    var c = centers(state.h, state.rank, sizes.map(function (s) { return s[crossAxis]; }), down ? gapX : gapY);
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
    p[g.main] = interpolate(g.bands, via[0]) + g.pad;
    p[1 - g.main] = interpolate(g.c, via[1]) + g.pad;
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
    var defs = svg('defs', {}, lines);
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
      var port = sideOf(nodes[group.node].rect, group.side);
      var tip = add(port, mul(SIDES[group.side], STEM));
      stemAt[key] = tip;
      stems.push({ group: group, port: port, tip: tip });
    });

    function endpoint(node, side, kind) {
      var key = [kind, node, side].join(':');
      if (stemAt[key]) return stemAt[key];
      var rect = nodes[node].rect;
      return nodes[node].junction ? [rect.x + rect.w / 2, rect.y + rect.h / 2] : sideOf(rect, side);
    }

    var shapes = edges.map(function (edge) {
      var start = endpoint(edge.from, edge.exit, 'out');
      var end = endpoint(edge.to, edge.enter, 'in');
      var merged = Boolean(stemAt[['in', edge.to, edge.enter].join(':')]);
      var forked = Boolean(stemAt[['out', edge.from, edge.exit].join(':')]);
      var endDir = mul(SIDES[edge.enter], -1);
      var startDir = SIDES[edge.exit];
      if (nodes[edge.to].junction) endDir = unit(sub(end, start));
      if (nodes[edge.from].junction) startDir = unit(sub(end, start));
      var endArrow = !merged && (edge.arrow === 'end' || edge.arrow === 'both');
      var startArrow = !forked && (edge.arrow === 'start' || edge.arrow === 'both');
      var a = startArrow ? add(start, mul(startDir, ARROW - 2)) : start;
      var b = endArrow ? sub(end, mul(endDir, ARROW - 2)) : end;
      var points = [a].concat(edge.via.map(function (via) { return gridPoint(state, via); }), [b]);
      var segments = curve(points, startDir, endDir);
      return {
        segments: segments, poly: sample(segments, 20),
        arrows: [startArrow && [start, mul(startDir, -1)], endArrow && [end, endDir]].filter(Boolean)
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
        if (!shared) gaps[j] = gaps[j].concat(crossings(shapes[i].poly, shapes[j].poly));
      }
    }

    state.paths = edges.map(function (edge, index) {
      var g = svg('g', {
        class: 'df-pipe-edge df-pipe-line-' + edge.line + (edge.flow ? ' df-pipe-flow' : ''),
        'data-df-color': edge.color, 'data-df-role': edge.role
      }, lines);
      var mask = null;
      if (gaps[index].length) {
        mask = uid + '-gap-' + index;
        var m = svg('mask', { id: mask, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: total[0], height: total[1] }, defs);
        svg('rect', { x: 0, y: 0, width: total[0], height: total[1], fill: 'white' }, m);
        gaps[index].forEach(function (p) { svg('circle', { cx: p[0], cy: p[1], r: GAP, fill: 'black' }, m); });
      }
      svg('path', { class: 'df-pipe-path', d: pathData(shapes[index].segments), mask: mask && 'url(#' + mask + ')' }, g);
      shapes[index].arrows.forEach(function (arrow) { arrowHead(g, arrow[0], arrow[1]); });
      if (edge.label) {
        var tag = document.createElement('span');
        tag.className = 'df-pipe-label';
        if (edge.color) tag.setAttribute('data-df-color', edge.color);
        if (edge.role) tag.setAttribute('data-df-role', edge.role);
        tag.textContent = edge.label;
        var at = midpoint(shapes[index].segments);
        tag.style.left = at[0] + 'px';
        tag.style.top = at[1] + 'px';
        state.labels.appendChild(tag);
        edge.tag = tag;
      }
      return g;
    });

    state.stems = stems.map(function (stem) {
      var first = edges[stem.group.edges[0]];
      var g = svg('g', { class: 'df-pipe-edge df-pipe-stem', 'data-df-color': first.color, 'data-df-role': first.role }, lines);
      var inward = stem.group.kind === 'in';
      var arrow = inward && stem.group.edges.some(function (e) { return /end|both/.test(edges[e].arrow); });
      var dir = mul(SIDES[stem.group.side], -1);
      var end = arrow ? sub(stem.port, mul(dir, ARROW - 2)) : stem.port;
      svg('path', { class: 'df-pipe-path', d: 'M' + stem.tip[0] + ' ' + stem.tip[1] + 'L' + end[0] + ' ' + end[1] }, g);
      if (arrow) arrowHead(g, stem.port, dir);
      return { g: g, edges: stem.group.edges };
    });
    reveal(state);
  }

  function arrowHead(g, tip, dir) {
    var base = sub(tip, mul(dir, ARROW));
    var n = [-dir[1] * ARROW * 0.55, dir[0] * ARROW * 0.55];
    var a = add(base, n);
    var b = sub(base, n);
    svg('path', { class: 'df-pipe-arrow', d: 'M' + tip.join(' ') + 'L' + a.join(' ') + 'L' + b.join(' ') + 'Z' }, g);
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
    host.classList.toggle('df-pipe-tracing', index !== null);
    var up = index === null ? null : reach(state, index, false);
    var downstream = index === null ? null : reach(state, index, true);
    function on(edge) {
      return (up.has(edge.from) && up.has(edge.to)) || (downstream.has(edge.from) && downstream.has(edge.to));
    }
    state.nodes.forEach(function (node, i) {
      node.el.toggleAttribute('data-df-pipe-trace', index !== null && (up.has(i) || downstream.has(i)));
    });
    var active = state.edges.map(function (edge) { return index !== null && on(edge); });
    state.paths.forEach(function (g, i) {
      g.toggleAttribute('data-df-pipe-trace', active[i]);
      if (state.edges[i].tag) state.edges[i].tag.toggleAttribute('data-df-pipe-trace', active[i]);
    });
    state.stems.forEach(function (stem) {
      stem.g.toggleAttribute('data-df-pipe-trace', stem.edges.some(function (i) { return active[i]; }));
    });
  }

  function reveal(state) {
    var step = state.total > 1 ? state.step || 1 : Infinity;
    var shown = state.edges.map(function (edge) { return edge.step <= step; });
    state.nodes.forEach(function (node) {
      node.el.toggleAttribute('data-df-pipe-hidden', node.step > step);
      node.el.toggleAttribute('data-df-pipe-current', state.total > 1 && node.step === step);
    });
    state.paths.forEach(function (g, i) {
      g.toggleAttribute('data-df-pipe-hidden', !shown[i]);
      if (state.edges[i].tag) state.edges[i].tag.toggleAttribute('data-df-pipe-hidden', !shown[i]);
    });
    state.stems.forEach(function (stem) {
      stem.g.toggleAttribute('data-df-pipe-hidden', !stem.edges.some(function (i) { return shown[i]; }));
    });
    paint(state);
  }

  DocForm._pipeline = {
    ranks: ranks, rows: rows, centers: centers, bands: bands, interpolate: interpolate,
    curve: curve, sample: sample, crossings: crossings, pathData: pathData, parseVia: parseVia, isEmpty: isEmpty
  };
  DocForm.pipeline = {
    get: function (target) { return hosts.get(items.target(target)) || null; }
  };

  items.scan('pipeline', function () {
    DocForm.all('.df-pipeline').forEach(function (host) {
      var model = prepare(host);
      items.collect('pipeline', host, model && model.domain);
    });
  });
  DocForm.register('pipeline', function () { DocForm.all('.df-pipeline').forEach(setup); });
})(typeof window !== 'undefined' ? window : globalThis);
