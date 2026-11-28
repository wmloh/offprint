// Chart annotations: notes with leader lines, shaded ranges, and labelled event markers anchored to data values,
// categories, or keyed points. Input is the spec's annotations array or data-op-annotations JSON on the chart host.
// Note labels are placed automatically clear of marks, plot edges, and earlier labels; side, dx, and dy override.
// Annotations off the plot are hidden and counted in a legend note. With data-op-reveal-sequence on the chart,
// annotations with a revealStep appear once that step sequence reaches the step.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || !OffPrint._chart) {
    if (typeof console !== 'undefined') console.warn('[offprint] chart-annotations.js needs chart.js loaded before it.');
    return;
  }

  var TYPES = ['note', 'range', 'marker'];
  var DIRECTIONS = {
    top: [0, -1], 'top-right': [1, -1], right: [1, 0], 'bottom-right': [1, 1],
    bottom: [0, 1], 'bottom-left': [-1, 1], left: [-1, 0], 'top-left': [-1, -1]
  };
  var PREFERRED = ['top-right', 'top', 'right', 'top-left', 'bottom-right', 'left', 'bottom', 'bottom-left'];
  var RINGS = [22, 40, 62];
  var LINE_CHARS = 28;
  var LINES = 2;
  var LABEL_CHARS = 26;
  var LINE_H = 13;
  var CHAR_W = 6.3;
  var PAD = 5;
  var hosts = new WeakMap();
  var legendItems = new WeakMap();

  function warn(key, message, host) {
    OffPrint._warnOnce('chart-annotations:' + key, message, host);
  }

  // How an axis reads annotation values: category labels, timestamps, positive log values, or numbers.
  function axisKind(model, axis) {
    if (model.heatmap || model.grid) return 'category';
    if (axis === 'x') return model.categories ? 'category' : model.x.time ? 'time' : model.x.log ? 'log' : 'number';
    return axis === 'y' && model.y.log ? 'log' : 'number';
  }

  // The value axis a note's y reads on: its series' axis, else the annotation's own axis (y2 on combo charts).
  function valueAxis(model, a, seriesKey) {
    var s = seriesKey && model.series.find(function (item) { return item.key === seriesKey; });
    return s && s.axis === 'y2' ? 'y2' : s ? 'y' : a.axis;
  }

  function readValue(kind, value, kit) {
    if (value === null || value === undefined) return null;
    if (kind === 'category') return typeof value === 'string' || kit.isNum(value) ? String(value) : undefined;
    var v = kind === 'time' ? kit.toTime(value) : kit.toNumber(value);
    if (v === null || (kind === 'log' && !(v > 0))) return undefined;
    return v;
  }

  function seriesKey(model, name) {
    var found = model.series.find(function (s) { return s.key === name || s.name === name; });
    return found ? found.key : null;
  }

  // Spec -> model.annotations. Shape errors stop the chart from drawing; anchors are resolved when drawn.
  function normalize(model, spec, kit) {
    var input = spec.annotations;
    model.annotations = [];
    if (input === undefined || input === null) return;
    if (!Array.isArray(input)) throw new Error('Chart annotations must be an array.');
    if (model.type === 'pie') {
      warn('pie', 'Pie charts have no axes; their annotations are ignored.');
      return;
    }
    var keys = new Set();
    input.forEach(function (a, i) {
      var at = 'Chart annotation ' + (i + 1);
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(at + ' must be an object.');
      var type = a.type === undefined ? 'note' : a.type;
      if (TYPES.indexOf(type) < 0) throw new Error(at + ' needs a type of "note", "range", or "marker".');
      var text = a.text === undefined || a.text === null ? '' : String(a.text).trim();
      if (!text) throw new Error(at + ' needs text.');
      var key = a.key === undefined ? 'annotation-' + (i + 1) : typeof a.key === 'string' ? a.key.trim() : '';
      if (!key || keys.has(key)) throw new Error(at + ' needs a unique nonempty string key.');
      keys.add(key);
      var out = { key: key, type: type, text: text, index: i, series: null, point: null, side: null, dx: null, dy: null,
        color: null, role: null, revealStep: null, axis: 'y' };
      if (a.axis !== undefined && a.axis !== null) {
        if (a.axis !== 'y' && a.axis !== 'y2') throw new Error(at + ' needs an axis of "y" or "y2".');
        if (a.axis === 'y2' && !model.y2) throw new Error(at + ' reads on axis y2, but the chart has no second y axis.');
        out.axis = a.axis;
      }
      [['x', 'x'], ['x2', 'x'], ['y', out.axis], ['y2', out.axis]].forEach(function (field) {
        var value = readValue(axisKind(model, field[1]), a[field[0]], kit);
        if (value === undefined) throw new Error(at + ' has a ' + field[0] + ' that is not a value on the ' + field[1] + ' axis.');
        out[field[0]] = value;
      });
      if (a.series !== undefined && a.series !== null) {
        out.series = seriesKey(model, String(a.series));
        if (!out.series) throw new Error(at + ' names an unknown series ' + JSON.stringify(a.series) + '.');
      }
      if (a.point !== undefined && a.point !== null) {
        if (typeof a.point !== 'string' || !a.point.trim()) throw new Error(at + ' needs a point key as a nonempty string.');
        out.point = a.point.trim();
      }
      if (a.side !== undefined && a.side !== null) {
        if (!Object.hasOwn(DIRECTIONS, a.side)) throw new Error(at + ' needs a side of ' + PREFERRED.join(', ') + '.');
        out.side = a.side;
      }
      ['dx', 'dy'].forEach(function (name) {
        if (a[name] === undefined || a[name] === null) return;
        if (!kit.isNum(a[name])) throw new Error(at + ' needs a finite ' + name + ' in pixels.');
        out[name] = a[name];
      });
      ['color', 'role', 'revealStep'].forEach(function (name) {
        if (a[name] === undefined || a[name] === null) return;
        if (typeof a[name] !== 'string' || !a[name].trim()) throw new Error(at + ' needs a nonempty string ' + name + '.');
        out[name] = a[name].trim();
      });
      if (type === 'note' && out.x === null && !out.point) throw new Error(at + ' is a note and needs an x value or a point key.');
      if (type === 'range' && !((out.x !== null && out.x2 !== null) || (out.y !== null && out.y2 !== null))) {
        throw new Error(at + ' is a range and needs x and x2, y and y2, or both pairs.');
      }
      if (type === 'marker' && (out.x === null) === (out.y === null)) {
        throw new Error(at + ' is a marker and needs either an x or a y value.');
      }
      model.annotations.push(out);
    });
  }

  // The data position a note points at: a keyed point, or x with y from the given or only series, else the plot top.
  // Returns { x, y, series } or { missing } when its point or series value cannot be found.
  function anchor(model, a) {
    var cats = model.heatmap || model.grid;
    if (a.point) {
      for (var s of model.series) {
        if (a.series && s.key !== a.series) continue;
        var p = s.points.find(function (item) { return item.key === a.point; });
        if (p) {
          return cats ? { x: String(cats.columns[p.col]), y: String(cats.rows[p.row]), series: s.key } :
            { x: p.x, y: p.y, series: s.key };
        }
      }
      return { missing: 'point' };
    }
    if (a.y !== null || cats) return { x: a.x, y: a.y, series: a.series };
    var candidates = a.series ? model.series.filter(function (s) { return s.key === a.series; }) :
      model.series.length === 1 ? model.series : [];
    for (var series of candidates) {
      var hit = series.points.find(function (item) { return String(item.x) === String(a.x); });
      if (hit) return { x: a.x, y: hit.y, series: series.key };
    }
    return a.series ? { missing: 'value' } : { x: a.x, y: null, series: null };
  }

  // ---- Placement ----
  function overlap(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function outside(box, area) {
    var inside = overlap(box, { x: area.left, y: area.top, w: area.right - area.left, h: area.bottom - area.top });
    return box.w * box.h - inside;
  }

  function sum(box, boxes) {
    return boxes.reduce(function (total, other) { return total + overlap(box, other); }, 0);
  }

  // The label box for a note at anchor { x, y }: candidates sit at three distances in eight directions (or the given
  // side), slid back inside the plot, and scored by overlap with marks, earlier labels, the anchor, and the plot and
  // frame edges, with nearer and preferred positions breaking ties. dx and dy place the label's centre at that offset.
  function placeNote(point, size, context, options) {
    options = options || {};
    if (options.dx !== null && options.dx !== undefined || options.dy !== null && options.dy !== undefined) {
      var cx = point.x + (options.dx || 0);
      var cy = point.y + (options.dy || 0);
      return { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h, side: null, cost: 0 };
    }
    var sides = options.side ? [options.side] : PREFERRED;
    var best = null;
    RINGS.forEach(function (distance, ring) {
      sides.forEach(function (name, rank) {
        var d = DIRECTIONS[name];
        var reach = d[0] && d[1] ? distance * 0.7 : distance;
        var box = { x: point.x + d[0] * (reach + size.w / 2) - size.w / 2, y: point.y + d[1] * (reach + size.h / 2) - size.h / 2,
          w: size.w, h: size.h, side: name };
        // A label that would cross a plot edge slides back inside, as long as it then leaves its anchor clear.
        var plot = context.plot;
        if (size.w <= plot.right - plot.left) box.x = Math.max(plot.left, Math.min(plot.right - size.w, box.x));
        if (size.h <= plot.bottom - plot.top) box.y = Math.max(plot.top, Math.min(plot.bottom - size.h, box.y));
        box.cost = sum(box, context.marks) + sum(box, context.labels) * 4 + outside(box, plot) * 3 +
          outside(box, context.frame) * 40 + overlap(box, { x: point.x - 6, y: point.y - 6, w: 12, h: 12 }) * 40 +
          rank * 6 + ring * 24;
        if (!best || box.cost < best.cost) best = box;
      });
    });
    return best;
  }

  // The point of box nearest to (x, y), where a leader line meets the label.
  function edgePoint(box, x, y) {
    return [Math.max(box.x, Math.min(box.x + box.w, x)), Math.max(box.y, Math.min(box.y + box.h, y))];
  }

  // Wrapped note text: up to two lines; cut text keeps its full wording in the tooltip panel.
  function noteText(text, kit) {
    var wrapped = kit.wrapLabel(text, LINE_CHARS, LINES);
    var widest = Math.max.apply(null, wrapped.lines.map(function (line) { return line.length; }));
    return { lines: wrapped.lines, cut: wrapped.cut, w: Math.ceil(widest * CHAR_W + PAD * 2), h: wrapped.lines.length * LINE_H + PAD * 2 - 1 };
  }

  // ---- Drawing ----
  function screenAxis(geom, axis) {
    return (axis === 'x') !== !!geom.horizontal ? 'h' : 'v';
  }

  function spanOf(geom, axis, a, b) {
    var ends = [a, b].map(function (v) {
      var band = geom.span(axis, v);
      if (band) return band;
      var at = geom.px(axis, v);
      return at === null || at === undefined || !isFinite(at) ? null : [at, at];
    });
    if (!ends[0] || !ends[1]) return null;
    var all = ends[0].concat(ends[1]);
    return [Math.min.apply(null, all), Math.max.apply(null, all)];
  }

  function clip(span, lo, hi) {
    if (!span) return null;
    var a = Math.max(lo, span[0]);
    var b = Math.min(hi, span[1]);
    return b > a || (b === a && span[0] === span[1] && a >= lo && a <= hi) ? [a, b] : null;
  }

  function paintAnnotation(el, a) {
    if (a.role) el.setAttribute('data-op-role', a.role);
    else if (a.color) el.setAttribute('data-op-color', a.color);
  }

  function labelText(group, kit, text, x, y, anchorSide) {
    var cut = kit.wrapLabel(text, LABEL_CHARS, 1);
    var el = kit.svg('text', { x: x, y: y, 'text-anchor': anchorSide, class: 'op-annotation-label' }, group);
    el.textContent = cut.lines[0];
    return { el: el, cut: cut.cut, w: cut.lines[0].length * CHAR_W };
  }

  // Shifts a fixed label down in 14px steps, up to four times, while it overlaps an earlier label.
  function settle(box, labels, limit) {
    for (var i = 0; i < 4 && sum(box, labels) > 0 && box.y + box.h + 14 <= limit; i++) box.y += 14;
    return box;
  }

  function hostState(chart) {
    var state = hosts.get(chart.box);
    if (!state) {
      state = { chart: chart, follower: null };
      state.follower = OffPrint._revealSteps ? OffPrint._revealSteps.follow(chart.box, function (follower) {
        var current = state.chart;
        if (current.svg) follower.apply(current.svg.querySelector('.op-chart-annotations') || current.svg);
        follower.apply(current.table);
        note(current, state.hidden || []);
      }) : null;
      hosts.set(chart.box, state);
    }
    state.chart = chart;
    return state;
  }

  function draw(chart, geom, kit, layer) {
    var list = chart.model.annotations || [];
    var model = chart.view;
    if (!list.length || !geom || typeof geom.px !== 'function') return note(chart, []);
    var follower = hostState(chart).follower;
    if (!follower && list.some(function (a) { return a.revealStep; })) {
      warn('reveal:' + (chart.box.id || ''), 'Annotations with a revealStep need data-op-reveal-sequence on the chart; ' +
        'they are shown at every step.', chart.box);
    }
    var svg = kit.svg;
    var plot = { left: geom.left, right: geom.right, top: geom.top, bottom: geom.bottom };
    var frame = { left: 0, right: chart.width, top: 0, bottom: model.height };
    var labels = [];
    var hidden = [];
    var shownSeries = new Set(model.series.map(function (s) { return s.key; }));
    var group = svg('g', { class: 'op-chart-annotations' }, layer.group);
    var context = { marks: geom.bounds(), labels: labels, plot: plot, frame: frame };

    function start(a) {
      var g = svg('g', { class: 'op-annotation is-' + a.type, 'data-op-annotation': a.key }, group);
      paintAnnotation(g, a);
      if (a.revealStep && follower) {
        g.setAttribute('data-op-reveal-step', a.revealStep);
        g.classList.add('op-reveal-ready');
        if (!follower.shown(a.revealStep)) g.classList.add('op-reveal-pending');
      }
      kit.addMark(layer.marks, kit.markId('annotation', a.type, { key: a.key }), { el: g, fade: true, order: 1, obstacle: false });
      return g;
    }

    function drop(a, reason) {
      hidden.push({ a: a, reason: reason });
    }

    function range(a) {
      var box = { x: plot.left, y: plot.top, w: plot.right - plot.left, h: plot.bottom - plot.top };
      var ok = true;
      [['x', 'x2'], ['y', 'y2']].forEach(function (pair) {
        if (a[pair[0]] === null || a[pair[1]] === null) return;
        var axis = pair[0] === 'y' ? a.axis : 'x';
        var h = screenAxis(geom, axis) === 'h';
        var span = clip(spanOf(geom, axis, a[pair[0]], a[pair[1]]), h ? plot.left : plot.top, h ? plot.right : plot.bottom);
        if (!span) { ok = false; return; }
        if (h) { box.x = span[0]; box.w = Math.max(1, span[1] - span[0]); }
        else { box.y = span[0]; box.h = Math.max(1, span[1] - span[0]); }
      });
      if (!ok) return drop(a, 'outside');
      var g = start(a);
      svg('rect', { x: box.x, y: box.y, width: box.w, height: box.h, class: 'op-annotation-band' }, g);
      // The label sits inside the band's top left, else beside the band where it fits.
      var probe = kit.wrapLabel(a.text, LABEL_CHARS, 1).lines[0].length * CHAR_W;
      var lx = box.w >= probe + 8 ? box.x + 4 : box.x + box.w + 4 + probe <= plot.right ? box.x + box.w + 4 : box.x - 4;
      var forward = lx >= box.x;
      var spot = settle({ x: forward ? lx : lx - probe, y: box.y + 2, w: probe, h: 13 }, labels, plot.bottom);
      var label = labelText(g, kit, a.text, lx, spot.y + 10, forward ? 'start' : 'end');
      labels.push(spot);
      if (label.cut) kit.hint(g, a.text);
    }

    function marker(a) {
      var axis = a.x !== null ? 'x' : a.axis;
      var at = geom.px(axis, a.x !== null ? a.x : a.y);
      var h = screenAxis(geom, axis) === 'h';
      if (at === null || at === undefined || !isFinite(at) ||
          (h ? at < plot.left - 0.5 || at > plot.right + 0.5 : at < plot.top - 0.5 || at > plot.bottom + 0.5)) {
        return drop(a, 'outside');
      }
      var g = start(a);
      var p = Math.round(at) + 0.5;
      svg('line', h ? { x1: p, x2: p, y1: plot.top, y2: plot.bottom, class: 'op-annotation-line' } :
        { x1: plot.left, x2: plot.right, y1: p, y2: p, class: 'op-annotation-line' }, g);
      // Lines across x carry their label at the top, right of the line where it fits; lines across y at the right end.
      var probe = kit.wrapLabel(a.text, LABEL_CHARS, 1).lines[0].length * CHAR_W;
      var spot;
      var label;
      if (h) {
        var right = p + 5 + probe <= plot.right;
        spot = settle({ x: right ? p + 5 : p - 5 - probe, y: plot.top + 1, w: probe, h: 13 }, labels, plot.bottom);
        label = labelText(g, kit, a.text, right ? p + 5 : p - 5, spot.y + 10, right ? 'start' : 'end');
      } else {
        var above = p - 15 >= plot.top;
        spot = settle({ x: plot.right - 4 - probe, y: above ? p - 15 : p + 2, w: probe, h: 13 }, labels, plot.bottom);
        label = labelText(g, kit, a.text, plot.right - 4, spot.y + 10, 'end');
      }
      labels.push(spot);
      if (label.cut) kit.hint(g, a.text);
    }

    function noteAt(a) {
      var at = anchor(model, a);
      if (at.missing) {
        var full = anchor(chart.model, a);
        return drop(a, full.missing ? 'missing' : 'series');
      }
      if (at.series && !shownSeries.has(at.series)) return drop(a, 'series');
      var horizontal = geom.horizontal;
      var yAxis = valueAxis(model, a, at.series);
      var sx = horizontal ? (at.y === null ? plot.right : geom.px('y', at.y)) : geom.px('x', at.x);
      var sy = horizontal ? geom.px('x', at.x) : (at.y === null ? plot.top : geom.px(yAxis, at.y));
      if (!isFinite(sx) || !isFinite(sy) || sx === null || sy === null ||
          sx < plot.left - 0.5 || sx > plot.right + 0.5 || sy < plot.top - 0.5 || sy > plot.bottom + 0.5) {
        return drop(a, 'outside');
      }
      var text = noteText(a.text, kit);
      var box = placeNote({ x: sx, y: sy }, text, context, a);
      var g = start(a);
      var end = edgePoint(box, sx, sy);
      var length = Math.hypot(end[0] - sx, end[1] - sy);
      var trim = length > 4 ? 3 / length : 0;
      svg('line', { x1: sx + (end[0] - sx) * trim, y1: sy + (end[1] - sy) * trim, x2: end[0], y2: end[1],
        class: 'op-annotation-leader' }, g);
      svg('circle', { cx: sx, cy: sy, r: 2.5, class: 'op-annotation-anchor' }, g);
      svg('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, class: 'op-annotation-box' }, g);
      var t = svg('text', { x: box.x + PAD, y: box.y + PAD + 9, class: 'op-annotation-text' }, g);
      text.lines.forEach(function (line, i) {
        svg('tspan', { x: box.x + PAD, dy: i ? LINE_H : 0 }, t).textContent = line;
      });
      labels.push(box);
      if (text.cut) kit.hint(g, a.text);
    }

    list.filter(function (a) { return a.type === 'range'; }).forEach(range);
    list.filter(function (a) { return a.type === 'marker'; }).forEach(marker);
    list.filter(function (a) { return a.type === 'note'; }).forEach(noteAt);
    note(chart, hidden);
  }

  // ---- Legend, table, and description ----
  var REASONS = { outside: 'outside the plot', series: 'on hidden series', missing: 'with no matching point' };

  function legend(chart, legendEl, kit) {
    if (!(chart.model.annotations || []).length) return legendItems.delete(chart);
    var item = kit.html('span', 'op-chart-legend-item op-chart-annotation-note', legendEl);
    item.hidden = true;
    kit.html('span', 'op-chart-key is-annotation', item);
    kit.html('span', '', item);
    legendItems.set(chart, item);
  }

  // The legend note counts annotations that cannot be drawn and says why, leaving out those waiting for their step.
  function note(chart, all) {
    var state = hosts.get(chart.box);
    if (state) state.hidden = all;
    var follower = state && state.follower;
    var hidden = all.filter(function (h) { return !h.a.revealStep || !follower || follower.shown(h.a.revealStep); });
    var item = legendItems.get(chart);
    if (!item) return;
    item.hidden = !hidden.length;
    if (!hidden.length) return;
    var reasons = [];
    hidden.forEach(function (h) {
      var text = h.reason === 'outside' && chart.range ? 'outside the range' : REASONS[h.reason];
      if (reasons.indexOf(text) < 0) reasons.push(text);
    });
    item.lastChild.textContent = hidden.length + (hidden.length === 1 ? ' annotation' : ' annotations') + ' not shown: ' +
      reasons.join(', ');
  }

  function valueText(model, axis, v, kit) {
    if (v === null) return '';
    return axisKind(model, axis) === 'category' ? String(v) : kit.format(v, model[axis]);
  }

  function position(model, a, kit) {
    var yAxis = a.axis === 'y2' && model.y2 ? 'y2' : 'y';
    var x = function (v) { return valueText(model, 'x', v, kit); };
    var y = function (v) { return valueText(model, yAxis, v, kit); };
    var xName = model.heatmap || model.grid ? 'column' : model.x.label || 'x';
    var yName = model.heatmap || model.grid ? 'row' : model[yAxis].label || (yAxis === 'y2' ? 'right axis' : 'y');
    if (a.type === 'range') {
      return [a.x !== null ? xName + ' ' + x(a.x) + ' to ' + x(a.x2) : '', a.y !== null ? yName + ' ' + y(a.y) + ' to ' + y(a.y2) : '']
        .filter(Boolean).join(', ');
    }
    if (a.type === 'marker') return a.x !== null ? xName + ' ' + x(a.x) : yName + ' ' + y(a.y);
    if (a.point) return 'point ' + a.point;
    return xName + ' ' + x(a.x) + (a.y !== null ? ', ' + yName + ' ' + y(a.y) : '');
  }

  function table(view, kit, chart) {
    var list = view.annotations || [];
    if (!list.length) return null;
    var el = kit.html('table', 'op-chart-annotations-table');
    kit.html('caption', '', el, 'Annotations');
    var head = kit.html('tr', '', kit.html('thead', '', el));
    ['Annotation', 'Kind', 'Position'].forEach(function (label) { kit.html('th', '', head, label).setAttribute('scope', 'col'); });
    var body = kit.html('tbody', '', el);
    var follower = chart && hostState(chart).follower;
    list.forEach(function (a) {
      var tr = kit.html('tr', '', body);
      kit.html('th', '', tr, a.text).setAttribute('scope', 'row');
      kit.html('td', '', tr, a.type === 'note' ? 'Note' : a.type === 'range' ? 'Range' : 'Marker');
      kit.html('td', '', tr, position(view, a, kit));
      if (a.revealStep && follower) tr.setAttribute('data-op-reveal-step', a.revealStep);
    });
    if (follower) follower.apply(el);
    return el;
  }

  function describe(model) {
    var list = model.annotations || [];
    if (!list.length) return '';
    var kit = { format: OffPrint._chart.format };
    var parts = list.map(function (a) {
      return (a.type === 'note' ? 'note' : a.type) + ' “' + a.text + '” at ' + position(model, a, kit);
    });
    return 'Annotations: ' + parts.join('; ') + '.' +
      (list.some(function (a) { return a.revealStep; }) ? ' Some annotations appear at later steps.' : '');
  }

  OffPrint.chart.addon('chart-annotations', {
    layers: { annotations: { draw: draw, normalize: normalize, legend: legend, table: table, describe: describe } }
  });

  OffPrint._chartAnnotations = {
    normalize: function (model, spec) { normalize(model, spec, annotationKit); return model.annotations; },
    anchor: anchor, placeNote: placeNote, overlap: overlap, spanOf: spanOf, clip: clip, position: position
  };
  var annotationKit = {
    isNum: function (v) { return typeof v === 'number' && isFinite(v); },
    toNumber: OffPrint._chart.toNumber, toTime: OffPrint._chart.toTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
