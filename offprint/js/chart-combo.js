// Combo charts: each series draws as bars or a line over one categorical or time x axis. Series read on the left
// value axis or, when they ask for it with axis: 'y2', on a second axis at the right. Both axes start at zero and
// share its level. Bars of every series sit side by side in each slot, or stack per axis with stack: 'stacked';
// lines run through the slot centres above the bars. An axis with one series is tinted and named after it.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || !OffPrint._chart) {
    if (typeof console !== 'undefined') console.warn('[offprint] chart-combo.js needs chart.js loaded before it.');
    return;
  }

  var MARKS = ['bar', 'line'];
  var AXES = ['y', 'y2'];
  var GAP = 2;
  var DENSE = 24;
  var SIDES = { y: 'Left axis', y2: 'Right axis' };

  function axisSpec(input, kit) {
    var a = typeof input === 'string' ? { label: input } : input && typeof input === 'object' ? input : {};
    return {
      label: a.label == null ? '' : String(a.label),
      min: kit.toNumber(a.min), max: kit.toNumber(a.max),
      digits: kit.isNum(a.digits) ? a.digits : null,
      unit: a.unit ? String(a.unit) : '', time: false, log: false, precision: null
    };
  }

  function seriesList(spec) {
    if (Array.isArray(spec.series)) return spec.series;
    return Array.isArray(spec.data) ? [{ name: spec.name, data: spec.data }] : [];
  }

  // Text x values stay categories in order of first appearance, even when they look like numbers.
  function prepare(spec) {
    var time = spec.x && typeof spec.x === 'object' && spec.x.type === 'time';
    if (spec.x && typeof spec.x === 'object' && spec.x.type != null && !time) {
      throw new Error('Combo charts use a categorical or time x axis; remove x.type ' + JSON.stringify(spec.x.type) + '.');
    }
    [['y', spec.y], ['y2', spec.y2]].forEach(function (pair) {
      if (pair[1] && typeof pair[1] === 'object' && pair[1].type != null) {
        throw new Error('Combo value axes are linear and start at zero; remove ' + pair[0] + '.type.');
      }
    });
    if (spec.orientation != null && spec.orientation !== 'vertical') throw new Error('Combo charts draw vertical bars only.');
    if (spec.gaps != null) throw new Error('Combo lines join across missing values; remove the gaps option.');
    var list = seriesList(spec);
    if (!list.length) throw new Error('Combo charts need a series array with at least one series.');
    var out = Object.assign({}, spec, { orientation: undefined, stack: undefined });
    if (!time) {
      var categories = Array.isArray(spec.categories) ? spec.categories.map(String) : [];
      list.forEach(function (s) {
        (s && Array.isArray(s.data) ? s.data : []).forEach(function (d, i) {
          var x = Array.isArray(d) ? d[0] : d && typeof d === 'object' ? d.x : Array.isArray(spec.categories) ? null : i;
          if (x != null && categories.indexOf(String(x)) < 0) categories.push(String(x));
        });
      });
      out.categories = categories;
    }
    return out;
  }

  function normalize(model, spec, kit, prepared) {
    var list = seriesList(prepared);
    model.series.forEach(function (s) {
      var raw = list[s.index] || {};
      var name = JSON.stringify(s.name || s.key);
      s.mark = raw.mark == null ? 'bar' : raw.mark;
      s.axis = raw.axis == null ? 'y' : raw.axis;
      if (MARKS.indexOf(s.mark) < 0) throw new Error('Combo series ' + name + ' needs a mark of "bar" or "line".');
      if (AXES.indexOf(s.axis) < 0) throw new Error('Combo series ' + name + ' needs an axis of "y" or "y2".');
      if (s.points.some(function (p) { return p.interval; })) {
        throw new Error('Combo series ' + name + ' cannot show intervals; remove them.');
      }
      if (model.categories) {
        s.points.sort(function (a, b) { return model.categories.indexOf(a.x) - model.categories.indexOf(b.x); });
      }
      var seen = new Set();
      s.points.forEach(function (p) {
        if (seen.has(String(p.x))) throw new Error('Combo series ' + name + ' has more than one value at x ' + JSON.stringify(String(p.x)) + '.');
        seen.add(String(p.x));
      });
    });
    var stack = spec.stack == null || spec.stack === false || spec.stack === 'none' ? null : spec.stack;
    if (stack && stack !== 'stacked') throw new Error('Combo stack must be "stacked" or "none", not ' + JSON.stringify(stack) + '.');
    model.stack = stack;
    model.zeroBaseline = true;
    var onY = model.series.filter(function (s) { return s.axis === 'y'; });
    var onY2 = model.series.filter(function (s) { return s.axis === 'y2'; });
    if (!onY.length) throw new Error('Put at least one combo series on the left y axis; y2 is for a second measure.');
    model.y2 = null;
    if (onY2.length) {
      model.y2 = axisSpec(spec.y2, kit);
      if (!model.y.label && onY.length === 1) model.y.label = onY[0].name;
      if (!model.y2.label && onY2.length === 1) model.y2.label = onY2[0].name;
      if (!model.y.unit || !model.y2.unit || model.y.unit === model.y2.unit) {
        OffPrint._warnOnce('chart-y2-units', 'A second y axis suits a measure with different units. Give y and y2 ' +
          'distinct units, or draw every series on one axis; matching or missing units invite misreading.');
      }
    } else if (spec.y2 != null) {
      OffPrint._warnOnce('chart-y2-unused', 'Combo y2 settings apply only when a series sets axis: "y2"; they are ignored.');
    }
    [['y', model.y], ['y2', model.y2]].forEach(function (pair) {
      var a = pair[1];
      if (a && ((a.min !== null && a.min > 0) || (a.max !== null && a.max < 0))) {
        throw new Error('Combo value axes start at zero; ' + pair[0] + ' min and max must keep zero inside the axis.');
      }
    });
    if (model.x.time) timeSpans(model);
    return model;
  }

  // On a time axis each bar covers half the closest spacing of x values to either side, and each line reading spans to
  // its neighbours, so a narrowed range keeps partly shown bars and the readings that carry a line to the plot edge.
  function timeSpans(model) {
    var xs = [];
    model.series.forEach(function (s) { s.points.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); }); });
    xs.sort(function (a, b) { return a - b; });
    var step = null;
    xs.forEach(function (x, i) { if (i && (step === null || x - xs[i - 1] < step)) step = x - xs[i - 1]; });
    model.comboStep = step;
    var half = (step || 0) / 2;
    model.series.forEach(function (s) {
      s.points.forEach(function (p, i) {
        if (s.mark === 'bar' || s.points.length < 2) p.xSpan = [p.x - half, p.x + half];
        else p.xSpan = [(s.points[i - 1] || p).x, (s.points[i + 1] || p).x];
      });
    });
  }

  // Bar ends in value units: { from, to, outer } per point, stacked per axis in series order when the chart stacks.
  function barLayout(model) {
    var bars = new Map();
    var runs = new Map();
    model.series.forEach(function (s) {
      if (s.mark !== 'bar') return;
      s.points.forEach(function (p) {
        if (!model.stack) return bars.set(p, { from: 0, to: p.y, outer: true });
        var at = s.axis + '\u0001' + String(p.x);
        var run = runs.get(at) || { up: 0, down: 0, last: [null, null] };
        var down = p.y < 0;
        var from = down ? run.down : run.up;
        var bar = { from: from, to: from + p.y, outer: false };
        if (down) run.down = bar.to;
        else run.up = bar.to;
        if (p.y) run.last[down ? 1 : 0] = bar;
        runs.set(at, run);
        bars.set(p, bar);
      });
    });
    runs.forEach(function (run) { run.last.forEach(function (bar) { if (bar) bar.outer = true; }); });
    return bars;
  }

  // The value span of one axis's series, always including zero.
  function axisExtent(model, axis) {
    var bars = barLayout(model);
    var lo = 0;
    var hi = 0;
    model.series.forEach(function (s) {
      if (s.axis !== axis) return;
      s.points.forEach(function (p) {
        var bar = bars.get(p);
        lo = Math.min(lo, bar ? bar.to : p.y);
        hi = Math.max(hi, bar ? bar.to : p.y);
      });
    });
    return { lo: lo, hi: hi === lo ? lo + 1 : hi };
  }

  function bounded(span, axis) {
    return { lo: axis.min !== null ? axis.min : span.lo, hi: axis.max !== null ? axis.max : span.hi };
  }

  function extent(model, span) {
    var left = axisExtent(model, 'y');
    span.yLo = left.lo;
    span.yHi = left.hi;
    if (model.x.time && model.comboStep && span.xs.length) {
      var lo = Math.min.apply(null, span.xs);
      var hi = Math.max.apply(null, span.xs);
      span.xs.push(lo - model.comboStep / 2, hi + model.comboStep / 2);
    }
  }

  // The series an axis is tinted after: its only series, else none.
  function tintOf(model, axis) {
    var on = model.series.filter(function (s) { return s.axis === axis; });
    return on.length === 1 ? on[0] : null;
  }

  function secondAxis(view, full) {
    if (!full.y2) return null;
    var source = full.rescale && view.series.some(function (s) { return s.axis === 'y2' && s.points.length; }) ? view : full;
    var span = bounded(axisExtent(source, 'y2'), full.y2);
    return { lo: span.lo, hi: span.hi, axis: full.y2, tintY: tintOf(full, 'y'), tintY2: tintOf(full, 'y2') };
  }

  // ---- Marks ----
  function marks(ctx, model, kit) {
    var bars = barLayout(model);
    var barSeries = model.series.filter(function (s) { return s.mark === 'bar'; });
    var slots = model.stack ? AXES.filter(function (axis) { return barSeries.some(function (s) { return s.axis === axis; }); }) :
      barSeries.map(function (s) { return s.key; });
    var band = ctx.band || (model.comboStep ? Math.abs(ctx.pos(model.comboStep) - ctx.pos(0)) : 48);
    var count = Math.max(1, slots.length);
    var thick = Math.max(2, Math.min(model.stack ? 36 : 24, (band * 0.72 - GAP * (count - 1)) / count));
    var groupW = count * thick + (count - 1) * GAP;
    var inside = function (px) { return px >= ctx.left - 0.5 && px <= ctx.right + 0.5; };
    var scale = function (s) { return s.axis === 'y2' ? ctx.val2 : ctx.val; };
    var groups = new Map();
    barSeries.concat(model.series.filter(function (s) { return s.mark === 'line'; })).forEach(function (s) {
      groups.set(s, ctx.group(s));
    });

    barSeries.forEach(function (s) {
      var v = scale(s);
      var slot = slots.indexOf(model.stack ? s.axis : s.key);
      var g = groups.get(s);
      g.classList.add('op-chart-combo-bars');
      s.points.forEach(function (p) {
        var bar = bars.get(p);
        var c0 = ctx.pos(p.x) - groupW / 2 + slot * (thick + GAP);
        var a = v(bar.from);
        var b = v(bar.to);
        var base = v(0);
        var r = bar.outer ? 4 : 0;
        var el = kit.svg('path', { d: kit.barPath(c0, thick, a, b, r, false), class: 'op-chart-bar' }, g);
        el.setAttribute('data-op-x', String(p.x));
        var mid = c0 + thick / 2;
        if (inside(mid)) ctx.place(p, el, mid, model.stack ? (a + b) / 2 : b);
        kit.addMark(ctx.markMap, kit.markId(s.key, 'bar', p), { el: el, order: ctx.orderAt(mid),
          from: { d: kit.barPath(c0, thick, base, base, r, false) } });
      });
    });

    model.series.forEach(function (s) {
      if (s.mark !== 'line') return;
      var v = scale(s);
      var g = groups.get(s);
      g.classList.add('op-chart-combo-line');
      if (s.points.length > 1) {
        var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + ctx.pos(p.x) + ',' + v(p.y); }).join('');
        kit.addMark(ctx.markMap, kit.markId(s.key, 'line'), { el: kit.svg('path', { d: d, class: 'op-chart-line' }, g), draw: true });
      }
      var quiet = s.points.length > DENSE;
      s.points.forEach(function (p) {
        var px = ctx.pos(p.x);
        if (!inside(px)) return;
        var r = quiet && !(model.selectionGroup && p.key) ? 0 : 4;
        var dot = kit.svg('circle', { cx: px, cy: v(p.y), r: r, class: 'op-chart-dot', 'data-op-x': String(p.x) }, g);
        ctx.place(p, dot, px, v(p.y));
        kit.addMark(ctx.markMap, kit.markId(s.key, 'dot', p), { el: dot, from: { r: 0 }, order: ctx.orderAt(px) });
      });
    });
  }

  // ---- Reading ----
  function sideText(model, axis) {
    var a = axis === 'y2' ? model.y2 : model.y;
    return SIDES[axis] + (a && a.label ? ' · ' + a.label : '');
  }

  function axisOf(model, s) {
    return s.axis === 'y2' && model.y2 ? model.y2 : model.y;
  }

  function xText(model, x, kit) {
    return model.categories ? String(x) : kit.format(x, model.x);
  }

  function pick(chart, px, py) {
    var g = chart.geom;
    var model = chart.view;
    var spots = chart.spots;
    var target;
    if (model.categories) {
      var i = Math.floor((px - g.left) / Math.max(1e-9, g.band));
      target = model.categories[Math.max(0, Math.min(model.categories.length - 1, i))];
    } else {
      var best = Infinity;
      spots.forEach(function (spot) {
        var d = Math.abs(g.px('x', spot.p.x) - px);
        if (d < best) { best = d; target = spot.p.x; }
      });
    }
    var found = -1;
    var gap = Infinity;
    spots.forEach(function (spot, index) {
      if (String(spot.p.x) !== String(target)) return;
      var d = Math.hypot((spot.px - px) / 4, spot.py - py);
      if (d < gap) { gap = d; found = index; }
    });
    return found;
  }

  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    var g = chart.geom;
    var x = spot.p.x;
    kit.html('div', 'op-chart-tip-head', tip, (model.x.label && !model.categories ? model.x.label + ' ' : '') + xText(model, x, kit));
    if (g.span('x', x)) {
      var span = g.span('x', x);
      kit.svg('rect', { x: span[0], y: g.top, width: span[1] - span[0], height: g.bottom - g.top, class: 'op-chart-band' }, chart.overlay);
      chart.marks.parentNode.insertBefore(chart.overlay, chart.marks);
    }
    Array.from(chart.marks.querySelectorAll('[data-op-x]')).forEach(function (el) {
      if (el.getAttribute('data-op-x') === String(x)) el.classList.add('is-active');
    });
    model.series.forEach(function (s) {
      var p = s.points.find(function (item) { return String(item.x) === String(x); });
      if (!p) return;
      var row = kit.row(tip, s, kit.format(p.y, axisOf(model, s)), s.mark);
      if (model.y2) kit.html('span', 'op-chart-axis-tag', row, s.axis === 'y2' ? 'right' : 'left');
      if (s === spot.s && model.series.length > 1) row.classList.add('is-current');
    });
    return chart.pointerY ?? spot.py;
  }

  function table(model, kit) {
    var el = kit.html('table', 'op-chart-combo-table');
    var head = kit.html('tr', '', kit.html('thead', '', el));
    var body = kit.html('tbody', '', el);
    var range = model.range;
    var xs = model.categories ? model.categories.slice() : [];
    var lookup = model.series.map(function (s) {
      var at = new Map();
      s.points.forEach(function (p) {
        if (range && (p.x < range[0] || p.x > range[1])) return;
        at.set(String(p.x), p);
        if (!model.categories && xs.indexOf(p.x) < 0) xs.push(p.x);
      });
      return at;
    });
    if (!model.categories) xs.sort(function (a, b) { return a - b; });
    var bars = model.stack ? barLayout(model) : null;
    var totals = model.stack ? AXES.filter(function (axis) {
      return model.series.filter(function (s) { return s.mark === 'bar' && s.axis === axis; }).length > 1;
    }) : [];
    kit.html('th', '', head, model.x.label || (model.x.time ? 'Time' : '')).setAttribute('scope', 'col');
    model.series.forEach(function (s) {
      var th = kit.html('th', '', head, s.name || axisOf(model, s).label || 'Value');
      th.setAttribute('scope', 'col');
      if (model.y2) kit.html('span', 'op-chart-axis-tag', th, sideText(model, s.axis));
    });
    totals.forEach(function (axis) {
      var th = kit.html('th', '', head, 'Total');
      th.setAttribute('scope', 'col');
      if (model.y2) kit.html('span', 'op-chart-axis-tag', th, sideText(model, axis));
    });
    xs.forEach(function (x) {
      var tr = kit.html('tr', '', body);
      kit.html('th', '', tr, xText(model, x, kit)).setAttribute('scope', 'row');
      model.series.forEach(function (s, i) {
        var p = lookup[i].get(String(x));
        kit.tagKey(model, kit.html('td', '', tr, p ? kit.format(p.y, axisOf(model, s)) : ''), p);
      });
      totals.forEach(function (axis) {
        var sum = null;
        model.series.forEach(function (s, i) {
          var p = lookup[i].get(String(x));
          if (p && bars.has(p) && s.axis === axis) sum = (sum || 0) + p.y;
        });
        kit.html('td', '', tr, sum === null ? '' : kit.format(sum, axis === 'y2' ? model.y2 : model.y));
      });
    });
    return el;
  }

  function names(list) {
    var all = list.map(function (s) { return s.name; }).filter(Boolean);
    return all.length > 1 ? all.slice(0, -1).join(', ') + ' and ' + all[all.length - 1] : all.join('');
  }

  function describe(model) {
    var bars = model.series.filter(function (s) { return s.mark === 'bar'; });
    var lines = model.series.filter(function (s) { return s.mark === 'line'; });
    var parts = [];
    if (bars.length) parts.push((model.stack ? 'stacked bars' : 'bars') + (names(bars) ? ' for ' + names(bars) : ''));
    if (lines.length) parts.push((lines.length > 1 ? 'lines' : 'a line') + (names(lines) ? ' for ' + names(lines) : ''));
    var text = 'Combo chart with ' + parts.join(' and ') + '.';
    if (model.y2) {
      text += ' ' + AXES.map(function (axis) {
        var on = names(model.series.filter(function (s) { return s.axis === axis; }));
        var a = axis === 'y2' ? model.y2 : model.y;
        return (on || 'Series') + ' read' + (on.indexOf(' and ') < 0 ? 's' : '') + ' on the ' +
          (axis === 'y2' ? 'right' : 'left') + ' axis' + (a.label ? ' (' + a.label + (a.unit ? ', ' + a.unit : '') + ')' : '');
      }).join('; ') + '. Both axes start at zero.';
    }
    return text;
  }

  // Legend keys mirror each series' mark; with a second axis, each item also names its side.
  function legend(chart) {
    var model = chart.model;
    (chart.seriesItems || []).forEach(function (item) {
      var s = model.series.find(function (entry) { return entry.key === item.key; });
      if (!s) return;
      var swatch = item.el.querySelector('.op-chart-key');
      if (swatch) swatch.className = 'op-chart-key' + (s.mark === 'bar' ? ' is-bar' : '');
      if (model.y2) {
        var tag = document.createElement('span');
        tag.className = 'op-chart-axis-tag';
        tag.textContent = s.axis === 'y2' ? 'right' : 'left';
        item.el.appendChild(tag);
      }
    });
  }

  root.OffPrint.chart.addon('chart-combo', {
    types: { combo: {
      base: 'scatter', legend: 'combo-axes', prepare: prepare, normalize: normalize, extent: extent,
      continuousMarks: marks, secondAxis: secondAxis, pick: pick, readout: readout, table: table, describe: describe
    } },
    legends: { 'combo-axes': legend }
  });

  OffPrint._chartCombo = { barLayout: barLayout, axisExtent: axisExtent, secondAxis: secondAxis };
})(typeof window !== 'undefined' ? window : globalThis);
