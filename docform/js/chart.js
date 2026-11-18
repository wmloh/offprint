// SVG line, bar, and scatter charts from inline data: a JSON script or a table inside a [data-df-chart] element, or
// DocForm.chart(el, spec). Hovering or the arrow keys show a readout; the Table button swaps the plot for its data.
// Line charts with gaps: 'break' end a segment at explicit missing values; referenceLines mark labelled values.
// With a highlight group, a click, Enter, or Space on a keyed point selects that key in DocForm.highlight.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] chart.js needs core.js loaded before it.');
    return;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var TYPES = { line: true, bar: true, scatter: true };
  var COLORS = 6;
  var CHAR = 7;
  var HIT = 24;
  var GROUP = 'data-df-highlight-group';
  var KEY = 'data-df-highlight-key';
  var charts = typeof WeakMap === 'function' ? new WeakMap() : null;

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // "1,204", "−3.5", and "12%" become numbers; anything else becomes null.
  function toNumber(v) {
    if (isNum(v)) return v;
    if (typeof v !== 'string') return null;
    var t = v.replace(/[\s,]/g, '').replace(/−/g, '-').replace(/%$/, '');
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : null;
  }

  function decimals(step) {
    var s = String(+step.toPrecision(12));
    var e = s.match(/e-(\d+)$/);
    if (e) return +e[1];
    var dot = s.indexOf('.');
    return dot < 0 ? 0 : s.length - dot - 1;
  }

  function niceStep(span, count) {
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  // Round tick values covering [min, max] with about `count` intervals. Fixed ends keep their exact values.
  function ticks(min, max, count, fixMin, fixMax) {
    if (!isNum(min) || !isNum(max)) { min = 0; max = 1; }
    if (min > max) { var t = min; min = max; max = t; }
    if (min === max) {
      var pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    var step = niceStep(max - min, count || 5);
    var d = decimals(step);
    var lo = fixMin ? min : +(Math.floor(min / step + 1e-9) * step).toFixed(d);
    var hi = fixMax ? max : +(Math.ceil(max / step - 1e-9) * step).toFixed(d);
    var out = [];
    var start = Math.ceil(lo / step - 1e-9);
    for (var k = start; k - start < 1000; k++) {
      var v = +(k * step).toFixed(d);
      if (v > hi + step * 1e-9) break;
      out.push(v);
    }
    return { min: lo, max: hi, step: step, ticks: out };
  }

  function linear(d0, d1, r0, r1) {
    var k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
    var f = function (v) { return r0 + (v - d0) * k; };
    f.invert = function (px) { return k ? d0 + (px - r0) / k : d0; };
    return f;
  }

  // Index of the entry in an ascending list closest to v; ties go to the lower index.
  function nearest(sorted, v) {
    var lo = 0;
    var hi = sorted.length - 1;
    if (hi < 0) return -1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid;
      else hi = mid;
    }
    return Math.abs(sorted[hi] - v) < Math.abs(sorted[lo] - v) ? hi : lo;
  }

  // Axis labels: one compact unit per axis from 10,000 up (10K, 2.5M), otherwise the step's decimals.
  function tickFormat(info) {
    var big = Math.max(Math.abs(info.min), Math.abs(info.max));
    var unit = big >= 1e9 ? [1e9, 'B'] : big >= 1e6 ? [1e6, 'M'] : big >= 1e4 ? [1e3, 'K'] : [1, ''];
    var d = decimals(info.step / unit[0]);
    return function (v) {
      if (v === 0) return '0';
      return (v / unit[0]).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + unit[1];
    };
  }

  // Readout values: full precision up to six significant digits unless the axis gives digits.
  function format(v, axis) {
    if (!isNum(v)) return '';
    var digits = axis && isNum(axis.digits) ? axis.digits : null;
    var text = digits === null ?
      (+v.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 }) :
      v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return text + (axis && axis.unit ? axis.unit : '');
  }

  function axisSpec(a) {
    if (typeof a === 'string') a = { label: a };
    a = a || {};
    return {
      label: a.label == null ? '' : String(a.label),
      min: toNumber(a.min),
      max: toNumber(a.max),
      digits: isNum(a.digits) ? a.digits : null,
      unit: a.unit ? String(a.unit) : ''
    };
  }

  // Spec -> model. Data points are [x, y, label], {x, y, label}, or bare y values (x = category or index).
  // Bar charts and string x values give a categorical x axis in order of first appearance.
  // With gaps: 'break' on a line chart, a null or blank y keeps its x as a missing value instead of being dropped.
  function normalize(spec) {
    spec = spec || {};
    var type = TYPES[spec.type] ? spec.type : 'line';
    var breaks = type === 'line' && spec.gaps === 'break';
    var categories = Array.isArray(spec.categories) ? spec.categories.map(String) : null;
    var list = Array.isArray(spec.series) ? spec.series : Array.isArray(spec.data) ? [{ name: spec.name, data: spec.data }] : [];
    var series = list.map(function (s, si) {
      s = s || {};
      var entries = [];
      (Array.isArray(s.data) ? s.data : []).forEach(function (d, i) {
        var x, y, label, key;
        if (Array.isArray(d)) { x = d[0]; y = d[1]; label = d[2]; }
        else if (d && typeof d === 'object') { x = d.x; y = d.y; label = d.label; key = d.key; }
        else { x = categories ? categories[i] : i; y = d; }
        var blank = y === null || (typeof y === 'string' && !y.trim());
        y = toNumber(y);
        if (x == null || (y === null && !(breaks && blank))) return;
        if (typeof x === 'string' && !categories && type !== 'bar' && toNumber(x) !== null) x = toNumber(x);
        key = key == null ? '' : String(key).trim();
        entries.push({ x: x, y: y, label: label == null ? '' : String(label), key: key || null });
      });
      return {
        name: s.name == null || s.name === '' ? (list.length > 1 ? 'Series ' + (si + 1) : '') : String(s.name),
        points: entries,
        role: s.role ? String(s.role) : null,
        color: s.color ? String(s.color) : null,
        index: si
      };
    });
    var categorical = type === 'bar' || !!categories || series.some(function (s) {
      return s.points.some(function (p) { return typeof p.x !== 'number'; });
    });
    if (categorical) {
      categories = categories ? categories.slice() : [];
      series.forEach(function (s) {
        s.points.forEach(function (p) {
          p.x = String(p.x);
          if (categories.indexOf(p.x) < 0) categories.push(p.x);
        });
      });
    }
    // Missing values sit apart from the points; a reading at the same x wins over a missing one.
    series.forEach(function (s) {
      var points = s.points.filter(function (p) { return p.y !== null; });
      var seen = points.map(function (p) { return String(p.x); });
      s.missing = s.points.filter(function (p) { return p.y === null && seen.indexOf(String(p.x)) < 0; })
        .map(function (p) { return p.x; })
        .filter(function (x, i, all) { return all.indexOf(x) === i; });
      s.points = points;
      if (!categorical) {
        s.points.sort(function (a, b) { return a.x - b.x; });
        s.missing.sort(function (a, b) { return a - b; });
      }
    });
    var refs = [];
    (Array.isArray(spec.referenceLines) ? spec.referenceLines : []).forEach(function (r) {
      r = r || {};
      var axis = r.axis === 'x' || r.axis === 'y' ? r.axis : null;
      var value = axis === 'x' && categorical ? (r.value == null ? null : String(r.value)) : toNumber(r.value);
      if (!axis || value === null) {
        DocForm.warnOnce('chart-ref', 'Chart reference lines need an axis of "x" or "y" and a value on that axis.');
        return;
      }
      refs.push({ axis: axis, value: value, label: r.label == null ? '' : String(r.label) });
    });
    if (series.length > COLORS) {
      DocForm.warnOnce('chart-series', 'Charts have ' + COLORS + ' series colours; later series are drawn gray.');
    }
    return {
      type: type,
      title: spec.title ? String(spec.title) : '',
      series: series,
      categories: categorical ? categories : null,
      markedCategories: categorical && Array.isArray(spec.markedCategories) ? new Set(spec.markedCategories.map(String)) : null,
      gaps: breaks,
      referenceLines: refs,
      highlight: typeof spec.highlight === 'string' && spec.highlight.trim() ? spec.highlight.trim() : null,
      table: spec.table !== false,
      x: axisSpec(spec.x),
      y: axisSpec(spec.y),
      height: isNum(spec.height) && spec.height > 80 ? spec.height : 260
    };
  }

  // Header row plus body rows of cell text -> spec: the first column is x, every other column a series.
  // keys, when given, holds a point key (or null) for each cell in the same layout.
  function fromTable(rows, type, keys) {
    var head = rows[0] || [];
    var body = rows.slice(1);
    return {
      type: type,
      x: { label: head[0] || '' },
      series: head.slice(1).map(function (name, c) {
        return {
          name: name,
          data: body.map(function (r, i) {
            var key = keys && keys[i + 1] && keys[i + 1][c + 1];
            return key ? { x: r[0], y: r[c + 1], key: key } : [r[0], r[c + 1]];
          })
        };
      })
    };
  }

  // Readout positions after the marks are drawn. Scatter charts, and line or bar charts with a highlight group,
  // get one spot per point so marks that share an x can each be read and selected; other charts get one per x.
  // markOf maps a point to its drawn mark as { el, px }, if any.
  function spotsFor(model, xAt, y, markOf) {
    var spots = [];
    var cats = model.categories;
    var xs = cats ? cats : extent(model).xs.slice().sort(function (a, b) { return a - b; })
      .filter(function (x, i, list) { return !i || x !== list[i - 1]; });
    if (model.type === 'scatter') {
      model.series.forEach(function (s) {
        s.points.forEach(function (p) { spots.push({ px: xAt(p.x), py: y(p.y), s: s, p: p, el: (markOf(p) || {}).el }); });
      });
    } else if (model.highlight) {
      xs.forEach(function (x) {
        var cx = xAt(x);
        var found = false;
        model.series.forEach(function (s) {
          s.points.forEach(function (p) {
            if (String(p.x) !== String(x)) return;
            found = true;
            var mark = markOf(p) || {};
            spots.push({ px: mark.px == null ? cx : mark.px, cx: cx, py: y(p.y), x: x, s: s, p: p, el: mark.el });
          });
        });
        if (!found) spots.push({ px: cx, cx: cx, x: x });
      });
    } else {
      xs.forEach(function (x) { spots.push({ px: xAt(x), cx: xAt(x), x: x }); });
    }
    spots.sort(function (a, b) { return a.px - b.px || (a.py || 0) - (b.py || 0); });
    return spots;
  }

  // The spot nearest the pointer: closest x first, then the closest y among spots that share it.
  function closest(spots, px, py) {
    var i = nearest(spots.map(function (s) { return s.px; }), px);
    if (i < 0 || py == null) return i;
    var best = i;
    for (var j = i - 1; j >= 0 && spots[j].px === spots[i].px; j--) if (Math.abs(spots[j].py - py) < Math.abs(spots[best].py - py)) best = j;
    for (j = i + 1; j < spots.length && spots[j].px === spots[i].px; j++) if (Math.abs(spots[j].py - py) < Math.abs(spots[best].py - py)) best = j;
    return best;
  }

  // Runs of consecutive points with no missing value between them. pos maps an x value to its axis position.
  function segments(points, missing, pos) {
    var gaps = (missing || []).map(pos);
    var out = [];
    var run = [];
    points.forEach(function (p, i) {
      if (run.length) {
        var a = pos(points[i - 1].x);
        var b = pos(p.x);
        var lo = Math.min(a, b);
        var hi = Math.max(a, b);
        if (gaps.some(function (g) { return g > lo && g < hi; })) {
          out.push(run);
          run = [];
        }
      }
      run.push(p);
    });
    if (run.length) out.push(run);
    return out;
  }

  // Data extent before tick rounding: reference lines never widen it, and missing x values keep their place.
  function extent(model) {
    var ys = [];
    var xs = [];
    model.series.forEach(function (s) {
      s.points.forEach(function (p) {
        ys.push(p.y);
        if (!model.categories) xs.push(p.x);
      });
      if (!model.categories && s.missing) xs.push.apply(xs, s.missing);
    });
    var yLo = ys.length ? Math.min.apply(null, ys) : 0;
    var yHi = ys.length ? Math.max.apply(null, ys) : 1;
    if (model.type === 'bar') { yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0); }
    if (model.y.min !== null) yLo = model.y.min;
    if (model.y.max !== null) yHi = model.y.max;
    return { yLo: yLo, yHi: yHi, xs: xs };
  }

  function refValue(model, r) {
    return r.axis === 'x' && model.categories ? r.value : format(r.value, model[r.axis]);
  }

  function refText(model, r) {
    var value = refValue(model, r);
    return r.label ? r.label + ' (' + value + ')' : value;
  }

  // A bar from baseline y0 to y1 with rounded corners only at the data end.
  function barPath(x, w, y0, y1, r) {
    var up = y1 <= y0;
    r = Math.max(0, Math.min(r, w / 2, Math.abs(y1 - y0)));
    var edge = up ? y1 + r : y1 - r;
    return 'M' + x + ',' + y0 + 'V' + edge + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) +
      'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + edge + 'V' + y0 + 'Z';
  }

  function svg(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function html(tag, className, parent, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }

  // Series colour: its role or named colour, else the next chart colour in fixed order.
  function paint(el, s) {
    if (s.role) el.setAttribute('data-df-role', s.role);
    else if (s.color) el.setAttribute('data-df-color', s.color);
    el.style.setProperty('--df-series', s.role || s.color ? 'var(--df-accent)' :
      s.index < COLORS ? 'var(--df-chart-' + (s.index + 1) + ')' : 'var(--df-gray)');
  }

  function key(type, s, parent) {
    var k = html('span', 'df-chart-key is-' + type, parent);
    paint(k, s);
    return k;
  }

  function xText(chart, x) {
    return chart.model.categories ? String(x) : format(x, chart.model.x);
  }

  function draw(chart) {
    var model = chart.model;
    var width = Math.round(chart.plot.clientWidth);
    if (!width) return;
    chart.width = width;
    var height = model.height;
    var type = model.type;
    var series = model.series;
    var cats = model.categories;

    var span = extent(model);
    var xs = span.xs;
    var yLo = span.yLo;
    var yHi = span.yHi;

    var top = 10 + (model.y.label ? 20 : 0);
    var markerSpace = model.markedCategories ? 13 : 0;
    var bottom = 26 + markerSpace + (model.x.label ? 20 : 0);
    var yInfo = ticks(yLo, yHi, Math.max(2, Math.round((height - top - bottom) / 48)), model.y.min !== null, model.y.max !== null);
    var yFmt = tickFormat(yInfo);
    var left = 12 + CHAR * Math.max.apply(null, yInfo.ticks.map(function (v) { return yFmt(v).length; }).concat([1]));
    var y = linear(yInfo.min, yInfo.max, height - bottom, top);

    // End labels name up to four line series when their ends sit at least 14px apart.
    var ends = [];
    if (type === 'line' && series.length > 1 && series.length <= 4) {
      ends = series.map(function (s) {
        var last = s.points[s.points.length - 1];
        return last ? { s: s, p: last, y: y(last.y) } : null;
      });
      var sorted = ends.filter(Boolean).map(function (e) { return e.y; }).sort(function (a, b) { return a - b; });
      var clash = ends.some(function (e) { return !e; }) || sorted.some(function (v, i) { return i && v - sorted[i - 1] < 14; });
      if (clash) ends = [];
    }
    var right = 14 + (ends.length ? 10 + 6.5 * Math.max.apply(null, ends.map(function (e) { return e.s.name.length; })) : 0);
    var plotW = Math.max(40, width - left - right);

    var xAt;
    var band = 0;
    var xInfo = null;
    if (cats) {
      band = plotW / Math.max(1, cats.length);
      xAt = function (x) { return left + band * (cats.indexOf(String(x)) + 0.5); };
    } else {
      var xLo = xs.length ? Math.min.apply(null, xs) : 0;
      var xHi = xs.length ? Math.max.apply(null, xs) : 1;
      var exact = type === 'line';
      if (model.x.min !== null) xLo = model.x.min;
      if (model.x.max !== null) xHi = model.x.max;
      xInfo = ticks(xLo, xHi, Math.max(2, Math.round(plotW / 90)), exact || model.x.min !== null, exact || model.x.max !== null);
      if (xInfo.min === xInfo.max) xInfo = ticks(xLo, xHi, 4);
      var xs0 = linear(xInfo.min, xInfo.max, left, left + plotW);
      xAt = function (x) { return xs0(x); };
    }

    var frame = svg('svg', {
      viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, 'aria-hidden': 'true', focusable: 'false'
    });

    var grid = svg('g', { class: 'df-chart-grid' }, frame);
    yInfo.ticks.forEach(function (v) {
      var py = Math.round(y(v)) + 0.5;
      svg('line', { x1: left, x2: left + plotW, y1: py, y2: py, class: v === 0 && yInfo.min < 0 ? 'is-zero' : '' }, grid);
      svg('text', { x: left - 8, y: py, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'df-chart-tick' }, frame)
        .textContent = yFmt(v);
    });
    var baseY = Math.round(type === 'bar' ? y(Math.max(yInfo.min, Math.min(0, yInfo.max))) : height - bottom) + 0.5;
    svg('line', { x1: left, x2: left + plotW, y1: baseY, y2: baseY, class: 'df-chart-base' }, frame);

    var tickY = height - bottom + 16 + markerSpace;
    if (cats) {
      var widest = Math.max.apply(null, cats.map(function (c) { return c.length; }).concat([1])) * CHAR + 12;
      var every = Math.max(1, Math.ceil(widest / Math.max(1, band)));
      cats.forEach(function (c, i) {
        if (model.markedCategories && model.markedCategories.has(c)) {
          svg('text', { x: xAt(c), y: tickY - markerSpace, 'text-anchor': 'middle', class: 'df-chart-label' }, frame)
            .textContent = '*';
        }
        if (i % every) return;
        svg('text', { x: xAt(c), y: tickY, 'text-anchor': 'middle', class: 'df-chart-tick' }, frame).textContent = c;
      });
    } else {
      var xFmt = tickFormat(xInfo);
      xInfo.ticks.forEach(function (v) {
        svg('text', { x: xAt(v), y: tickY, 'text-anchor': 'middle', class: 'df-chart-tick' }, frame).textContent = xFmt(v);
      });
    }
    if (model.x.label) {
      svg('text', { x: left + plotW / 2, y: height - 6, 'text-anchor': 'middle', class: 'df-chart-label' }, frame)
        .textContent = model.x.label;
    }
    if (model.y.label) {
      svg('text', { x: 0, y: 12, class: 'df-chart-label' }, frame).textContent = model.y.label;
    }

    var refLines = svg('g', { class: 'df-chart-refs' }, frame);
    var marks = svg('g', {}, frame);
    var thick = 0;
    var gap = 2;
    if (type === 'bar') {
      var m = Math.max(1, series.length);
      thick = Math.max(2, Math.min(24, (band * 0.72 - gap * (m - 1)) / m));
    }
    var markOf = new Map();
    // Keyed marks join the chart's highlight group, so outside selections reach them after every redraw.
    var place = function (p, el, px) {
      markOf.set(p, { el: el, px: px });
      return tagKey(model, el, p);
    };
    series.forEach(function (s) {
      var g = svg('g', { class: 'df-chart-series' }, marks);
      paint(g, s);
      if (type === 'line') {
        var runs = model.gaps ? segments(s.points, s.missing, cats ? function (x) { return cats.indexOf(String(x)); } :
          function (x) { return x; }) : [s.points];
        var d = runs.map(function (run) {
          return run.length > 1 ? run.map(function (p, i) { return (i ? 'L' : 'M') + xAt(p.x) + ',' + y(p.y); }).join('') : '';
        }).join('');
        if (d) svg('path', { d: d, class: 'df-chart-line' }, g);
        // Isolated readings between gaps, and selectable points, keep a marker even on dense lines.
        runs.forEach(function (run) {
          run.forEach(function (p) {
            if (s.points.length > 16 && run.length > 1 && !(model.highlight && p.key)) return;
            place(p, svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4, class: 'df-chart-dot' }, g), xAt(p.x));
          });
        });
      } else if (type === 'bar') {
        var groupW = series.length * thick + (series.length - 1) * gap;
        var y0 = y(Math.max(yInfo.min, Math.min(0, yInfo.max)));
        s.points.forEach(function (p) {
          var x0 = xAt(p.x) - groupW / 2 + s.index * (thick + gap);
          var bar = svg('path', { d: barPath(x0, thick, y0, y(p.y), 4), class: 'df-chart-bar' }, g);
          bar.setAttribute('data-df-x', p.x);
          place(p, bar, x0 + thick / 2);
        });
      } else {
        s.points.forEach(function (p) {
          place(p, svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4.5, class: 'df-chart-dot' }, g), xAt(p.x));
        });
      }
    });

    ends.forEach(function (e) {
      svg('text', { x: xAt(e.p.x) + 10, y: e.y, 'dominant-baseline': 'middle', class: 'df-chart-end' }, frame)
        .textContent = e.s.name;
    });

    // Reference lines use the data scales and are skipped, not clamped, when their value lies off the plot.
    var refLabels = svg('g', { class: 'df-chart-refs' }, frame);
    var plotR = left + plotW;
    var plotB = height - bottom;
    model.referenceLines.forEach(function (r, i) {
      var text = r.label || refValue(model, r);
      var on = false;
      if (r.axis === 'y') {
        if (r.value >= yInfo.min && r.value <= yInfo.max) {
          on = true;
          var py = Math.round(y(r.value)) + 0.5;
          svg('line', { x1: left, x2: plotR, y1: py, y2: py, class: 'df-chart-ref' }, refLines);
          svg('text', { x: plotR - 4, y: py - 5 < top + 10 ? py + 13 : py - 5, 'text-anchor': 'end', class: 'df-chart-ref-label' },
            refLabels).textContent = text;
        }
      } else if (cats ? cats.indexOf(r.value) >= 0 : r.value >= xInfo.min && r.value <= xInfo.max) {
        on = true;
        var px = Math.round(xAt(r.value)) + 0.5;
        var fits = px + 5 + text.length * 6.5 <= plotR;
        svg('line', { x1: px, x2: px, y1: top, y2: plotB, class: 'df-chart-ref' }, refLines);
        svg('text', { x: fits ? px + 5 : px - 5, y: top + 10, 'text-anchor': fits ? 'start' : 'end', class: 'df-chart-ref-label' },
          refLabels).textContent = text;
      }
      var item = chart.refItems && chart.refItems[i];
      if (item) {
        item.classList.toggle('is-outside', !on);
        item.lastChild.textContent = on ? '' : 'off scale';
      }
    });

    chart.spots = spotsFor(model, xAt, y, function (p) { return markOf.get(p); });
    chart.geom = { left: left, right: left + plotW, top: top, bottom: height - bottom, band: band, y: y };
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.marks = marks;

    if (chart.svg) chart.plot.replaceChild(frame, chart.svg);
    else chart.plot.insertBefore(frame, chart.plot.firstChild);
    chart.svg = frame;
    if (chart.active >= 0) show(chart, Math.min(chart.active, chart.spots.length - 1), null);
  }

  function hide(chart) {
    chart.active = -1;
    chart.tip.hidden = true;
    chart.box.classList.remove('is-hovering');
    if (chart.overlay) chart.overlay.textContent = '';
    if (chart.marks) DocForm.all('.is-active', chart.marks).forEach(function (el) { el.classList.remove('is-active'); });
  }

  function row(tip, s, value, type) {
    var r = html('div', 'df-chart-tip-row', tip);
    key(type === 'line' ? 'line' : type === 'bar' ? 'bar' : 'dot', s, r);
    html('b', '', r, value);
    if (s.name) html('span', '', r, s.name);
    return r;
  }

  function selectedKey(model) {
    return model.highlight && DocForm.highlight ? DocForm.highlight.get(model.highlight) : null;
  }

  function show(chart, index, pointerY) {
    var spot = chart.svg && chart.spots[index];
    if (!spot) return hide(chart);
    var model = chart.model;
    var g = chart.geom;
    chart.active = index;
    chart.pointerY = pointerY;
    chart.overlay.textContent = '';
    DocForm.all('.is-active', chart.marks).forEach(function (el) { el.classList.remove('is-active'); });
    chart.box.classList.add('is-hovering');
    var tip = chart.tip;
    tip.textContent = '';
    var anchorY = g.top;

    if (model.type === 'scatter') {
      spot.el.classList.add('is-active');
      var ring = svg('circle', { cx: spot.px, cy: spot.py, r: 7, class: 'df-chart-ring' }, chart.overlay);
      paint(ring, spot.s);
      html('div', 'df-chart-tip-head', tip, spot.p.label || spot.s.name || '');
      var line = function (label, text) {
        var r = html('div', 'df-chart-tip-row', tip);
        html('b', '', r, text);
        html('span', '', r, label);
      };
      if (spot.p.label && spot.s.name && model.series.length > 1) {
        var r0 = html('div', 'df-chart-tip-row', tip);
        key('dot', spot.s, r0);
        html('span', '', r0, spot.s.name);
      }
      line(model.x.label || 'x', xText(chart, spot.p.x));
      line(model.y.label || 'y', format(spot.p.y, model.y));
      anchorY = spot.py;
    } else {
      html('div', 'df-chart-tip-head', tip, (model.x.label && !model.categories ? model.x.label + ' ' : '') + xText(chart, spot.x));
      if (model.type === 'bar') {
        svg('rect', {
          x: spot.cx - g.band / 2, y: g.top, width: g.band, height: g.bottom - g.top, class: 'df-chart-band'
        }, chart.overlay);
        chart.marks.parentNode.insertBefore(chart.overlay, chart.marks);
        if (spot.el) spot.el.classList.add('is-active');
        else DocForm.all('.df-chart-bar', chart.marks).forEach(function (el) {
          if (el.getAttribute('data-df-x') === String(spot.x)) el.classList.add('is-active');
        });
      } else {
        svg('line', { x1: spot.cx, x2: spot.cx, y1: g.top, y2: g.bottom, class: 'df-chart-cross' }, chart.overlay);
        chart.marks.parentNode.appendChild(chart.overlay);
        // Per-point spots mark which of the readings at this x a click or Enter would select.
        if (spot.p) paint(svg('circle', { cx: spot.cx, cy: spot.py, r: 7, class: 'df-chart-ring' }, chart.overlay), spot.s);
      }
      model.series.forEach(function (s) {
        var p = null;
        for (var i = 0; i < s.points.length; i++) if (String(s.points[i].x) === String(spot.x)) { p = s.points[i]; break; }
        if (!p) {
          if (model.gaps && s.missing.map(String).indexOf(String(spot.x)) >= 0) row(tip, s, 'No data', model.type);
          return;
        }
        if (model.type === 'line') {
          var dot = svg('circle', { cx: spot.cx, cy: g.y(p.y), r: 4.5, class: 'df-chart-ring' }, chart.overlay);
          paint(dot, s);
        }
        var r = row(tip, s, format(p.y, model.y), model.type);
        if (spot.p && spot.s === s && model.series.length > 1) r.classList.add('is-current');
      });
      anchorY = pointerY == null ? g.top : pointerY;
    }
    if (spot.p && spot.p.key && spot.p.key === selectedKey(model)) html('div', 'df-chart-tip-note', tip, 'Selected');

    tip.hidden = false;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var x = spot.px + 14;
    if (x + w > chart.width) x = spot.px - 14 - w;
    tip.style.left = Math.max(0, x) + 'px';
    tip.style.top = Math.max(0, Math.min(anchorY - h / 2, chart.model.height - h)) + 'px';
  }

  function pick(chart, event) {
    var rect = chart.svg.getBoundingClientRect();
    var scale = rect.width ? chart.width / rect.width : 1;
    var px = (event.clientX - rect.left) * scale;
    var py = (event.clientY - rect.top) * scale;
    var g = chart.geom;
    var spots = chart.spots;
    if (!spots.length || px < g.left - HIT || px > g.right + HIT || py < g.top - HIT || py > g.bottom + HIT) return hide(chart);
    if (chart.model.type === 'scatter') {
      var best = -1;
      var dist = HIT;
      spots.forEach(function (s, i) {
        var d = Math.sqrt((s.px - px) * (s.px - px) + (s.py - py) * (s.py - py));
        if (d <= dist) { dist = d; best = i; }
      });
      return best < 0 ? hide(chart) : show(chart, best, null);
    }
    show(chart, closest(spots, px, py), py);
  }

  // Commits the point under the readout: its key becomes the group's selection, or clears it when already selected.
  function keyedSpot(chart) {
    var spot = chart.spots[chart.active];
    return chart.model.highlight && spot && spot.p && spot.p.key ? spot : null;
  }

  // Selections made elsewhere refresh an open readout without moving focus. One listener serves every chart
  // that has had a highlight group.
  var selectable = [];
  function watch(chart) {
    if (!chart.model.highlight || selectable.indexOf(chart) >= 0) return;
    if (!selectable.length) {
      document.addEventListener('df:highlightchange', function (event) {
        selectable.forEach(function (c) {
          if (event.detail && event.detail.group === c.model.highlight && c.active >= 0) show(c, c.active, c.pointerY);
        });
      });
    }
    selectable.push(chart);
  }

  function activate(chart) {
    var spot = keyedSpot(chart);
    var group = chart.model.highlight;
    if (!spot) return false;
    if (!DocForm.highlight) {
      DocForm.warnOnce('chart-highlight', 'Charts with a highlight group need highlight.js.');
      return false;
    }
    DocForm.highlight.set(group, DocForm.highlight.get(group) === spot.p.key ? null : spot.p.key);
    return true;
  }

  function tagKey(model, el, p) {
    if (model.highlight && p && p.key) {
      el.setAttribute(GROUP, model.highlight);
      el.setAttribute(KEY, p.key);
    }
    return el;
  }

  function buildTable(model) {
    var table = document.createElement('table');
    var head = html('tr', '', html('thead', '', table));
    var body = html('tbody', '', table);
    if (model.type === 'scatter') {
      var labels = model.series.some(function (s) { return s.points.some(function (p) { return p.label; }); });
      [model.series.length > 1 ? 'Series' : null, labels ? 'Label' : null, model.x.label || 'x', model.y.label || 'y']
        .forEach(function (t) { if (t !== null) html('th', '', head, t); });
      model.series.forEach(function (s) {
        s.points.forEach(function (p) {
          var tr = tagKey(model, html('tr', '', body), p);
          if (model.series.length > 1) html('td', '', tr, s.name);
          if (labels) html('td', '', tr, p.label);
          html('td', '', tr, format(p.x, model.x));
          html('td', '', tr, format(p.y, model.y));
        });
      });
      return table;
    }
    html('th', '', head, model.x.label);
    model.series.forEach(function (s) { html('th', '', head, s.name || model.y.label || 'Value'); });
    var xs = model.categories || [];
    if (!model.categories) {
      model.series.forEach(function (s) {
        s.points.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); });
        s.missing.forEach(function (x) { if (xs.indexOf(x) < 0) xs.push(x); });
      });
      xs.sort(function (a, b) { return a - b; });
    }
    xs.forEach(function (x) {
      var tr = html('tr', '', body);
      html('th', '', tr, model.categories ? x : format(x, model.x)).setAttribute('scope', 'row');
      model.series.forEach(function (s) {
        var p = s.points.filter(function (q) { return String(q.x) === String(x); })[0];
        tagKey(model, html('td', '', tr, p ? format(p.y, model.y) : ''), p);
      });
    });
    return table;
  }

  function describe(model) {
    var names = model.series.map(function (s) { return s.name; }).filter(Boolean);
    var gaps = model.gaps && model.series.some(function (s) { return s.missing.length; });
    var refs = model.referenceLines.map(function (r) { return refText(model, r); });
    var keyed = model.highlight && model.series.some(function (s) { return s.points.some(function (p) { return p.key; }); });
    return (model.title ? model.title + '. ' : '') + model.type.charAt(0).toUpperCase() + model.type.slice(1) + ' chart' +
      (names.length ? ' of ' + names.join(', ') : '') + '.' +
      (refs.length ? ' Reference ' + (refs.length > 1 ? 'lines: ' : 'line: ') + refs.join(', ') + '.' : '') +
      (gaps ? ' Breaks in a line mark missing values.' : '') + ' Arrow keys read the values.' +
      (keyed ? ' Enter or Space selects the point being read.' : '') +
      (model.table ? ' The Table button lists them.' : '');
  }

  function renderHead(chart) {
    var model = chart.model;
    chart.legend.textContent = '';
    if (model.series.length > 1) {
      model.series.forEach(function (s) {
        var item = html('span', 'df-chart-legend-item', chart.legend);
        key(model.type === 'line' ? 'line' : model.type === 'bar' ? 'bar' : 'dot', s, item);
        html('span', '', item, s.name);
      });
    }
    // Reference lines are also named in text, so their meaning survives the table view and off-scale values.
    chart.refItems = model.referenceLines.map(function (r) {
      var item = html('span', 'df-chart-legend-item', chart.legend);
      html('span', 'df-chart-key is-ref', item);
      html('span', '', item, refText(model, r));
      html('span', 'df-chart-ref-note', item);
      return item;
    });
  }

  function setTable(chart, on) {
    if (on && !chart.table.firstChild) chart.table.appendChild(buildTable(chart.model));
    chart.box.classList.toggle('is-table', on);
    chart.table.hidden = !on;
    chart.plot.hidden = on;
    chart.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    chart.toggle.textContent = on ? 'Chart' : 'Table';
    if (!on) draw(chart);
  }

  function build(host, spec, sourceTable) {
    var chart = { box: host, model: normalize(spec), active: -1, spots: [], svg: null, width: 0 };
    host.classList.add('df-chart');
    host.classList.add('is-' + chart.model.type);

    var head = html('div', 'df-chart-head');
    chart.legend = html('div', 'df-chart-legend', head);
    chart.toggle = html('button', 'df-chart-toggle', head, 'Table');
    chart.toggle.type = 'button';
    chart.toggle.hidden = !chart.model.table;
    chart.toggle.setAttribute('aria-pressed', 'false');
    chart.plot = html('div', 'df-chart-plot');
    chart.plot.tabIndex = 0;
    chart.plot.setAttribute('role', 'group');
    chart.tip = html('div', 'df-chart-tip', chart.plot);
    chart.tip.hidden = true;
    chart.tip.setAttribute('aria-live', 'polite');
    chart.table = html('div', 'df-chart-table');
    chart.table.hidden = true;
    chart.ownTable = !!sourceTable;
    if (sourceTable) chart.table.appendChild(sourceTable);
    host.insertBefore(chart.table, host.firstChild);
    host.insertBefore(chart.plot, chart.table);
    host.insertBefore(head, chart.plot);
    renderHead(chart);
    chart.plot.setAttribute('aria-label', describe(chart.model));

    chart.toggle.addEventListener('click', function () { setTable(chart, !host.classList.contains('is-table')); });
    chart.plot.addEventListener('pointermove', function (event) { if (chart.svg) pick(chart, event); });
    chart.plot.addEventListener('pointerleave', function () { hide(chart); });
    chart.plot.addEventListener('focus', function () {
      if (chart.plot.matches(':focus-visible')) show(chart, Math.max(0, chart.active), null);
    });
    chart.plot.addEventListener('blur', function () { hide(chart); });
    // A committed point click stops here, so a zoomable figure around the chart stays in place.
    chart.plot.addEventListener('click', function (event) {
      if (event.button !== 0 || !chart.svg || !chart.model.highlight) return;
      pick(chart, event);
      if (activate(chart)) event.preventDefault();
    });
    chart.plot.addEventListener('keydown', function (event) {
      var n = chart.spots.length;
      if (!n) return;
      if (event.key === 'Enter' || event.key === ' ') {
        if (!keyedSpot(chart)) return;
        event.preventDefault();
        if (!event.repeat) activate(chart);
        return;
      }
      var i = chart.active < 0 ? 0 : chart.active;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') i = Math.min(n - 1, i + 1);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') i = Math.max(0, i - 1);
      else if (event.key === 'Home') i = 0;
      else if (event.key === 'End') i = n - 1;
      else if (event.key === 'Escape') return hide(chart);
      else return;
      event.preventDefault();
      show(chart, i, null);
    });

    if (typeof ResizeObserver === 'function') {
      var frame = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(function () {
          if (!chart.plot.hidden && Math.round(chart.plot.clientWidth) !== chart.width) draw(chart);
        });
      }).observe(chart.plot);
    }

    chart.api = {
      element: host,
      update: function (next) {
        chart.model = normalize(next);
        watch(chart);
        host.classList.remove('is-line', 'is-bar', 'is-scatter');
        host.classList.add('is-' + chart.model.type);
        hide(chart);
        renderHead(chart);
        chart.toggle.hidden = !chart.model.table;
        chart.plot.setAttribute('aria-label', describe(chart.model));
        if (!chart.ownTable) chart.table.textContent = '';
        if (chart.plot.hidden && !chart.model.table) {
          setTable(chart, false);
        } else if (chart.plot.hidden) {
          if (!chart.table.firstChild) chart.table.appendChild(buildTable(chart.model));
        } else {
          draw(chart);
        }
      },
      model: function () { return chart.model; }
    };
    charts.set(host, chart);
    watch(chart);
    draw(chart);
    return chart.api;
  }

  function cellText(cell) {
    return cell.textContent.trim();
  }

  function overrides(host, spec) {
    var type = DocForm.data(host, 'chart', '');
    if (TYPES[type]) spec.type = type;
    var h = DocForm.num(host, 'height', null);
    if (h !== null) spec.height = h;
    var gaps = DocForm.data(host, 'gaps', null);
    if (gaps !== null) spec.gaps = gaps;
    var group = DocForm.data(host, 'highlight-group', null);
    if (group !== null) spec.highlight = group;
    var refs = DocForm.data(host, 'reference-lines', null);
    if (refs !== null) {
      try {
        spec.referenceLines = JSON.parse(refs);
      } catch (e) {
        DocForm.warnOnce('chart-refs:' + e.message, 'Chart reference lines are not valid JSON: ' + e.message, host);
      }
    }
    ['x', 'y'].forEach(function (axis) {
      var label = DocForm.data(host, axis + '-label', null);
      if (label === null) return;
      spec[axis] = typeof spec[axis] === 'object' && spec[axis] ? spec[axis] : {};
      spec[axis].label = label;
    });
    return spec;
  }

  // Reads the data inside a [data-df-chart] element and draws it.
  function fromMarkup(host) {
    var script = host.querySelector(':scope > script[type="application/json"]');
    var table = host.querySelector(':scope > table');
    var spec = null;
    if (script) {
      try {
        spec = JSON.parse(script.textContent);
      } catch (e) {
        DocForm.warnOnce('chart-json:' + e.message, 'Chart data is not valid JSON: ' + e.message, host);
        return null;
      }
    } else if (table) {
      var cells = DocForm.all('tr', table).map(function (tr) { return DocForm.all('th, td', tr); });
      var keys = cells.map(function (r) { return r.map(function (cell) { return DocForm.data(cell, 'highlight-key', '').trim() || null; }); });
      spec = fromTable(cells.map(function (r) { return r.map(cellText); }), null, keys);
      var heads = DocForm.all('tr', table)[0];
      DocForm.all('th, td', heads).slice(1).forEach(function (cell, i) {
        var s = spec.series[i];
        if (!s) return;
        s.role = DocForm.data(cell, 'role', null);
        s.color = DocForm.data(cell, 'color', null);
      });
    } else {
      return null;
    }
    spec = overrides(host, spec || {});
    // Keyed source cells join the group too, so the table view shows the same selection.
    if (table && !script && typeof spec.highlight === 'string' && spec.highlight.trim()) {
      DocForm.all('[' + KEY + ']', table).forEach(function (cell) { cell.setAttribute(GROUP, spec.highlight.trim()); });
    }
    return build(host, spec, script ? null : table);
  }

  function chart(target, spec) {
    var host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host || !charts) {
      DocForm.warnOnce('chart-target:' + target, 'DocForm.chart could not find its element.', target);
      return null;
    }
    var existing = charts.get(host);
    if (existing) {
      existing.api.update(spec);
      return existing.api;
    }
    return build(host, spec || {}, null);
  }

  chart.ticks = ticks;
  chart.linear = linear;
  chart.nearest = nearest;
  chart.normalize = normalize;
  chart.fromTable = fromTable;
  chart.segments = segments;
  chart.spotsFor = spotsFor;
  chart.closest = closest;
  chart.extent = extent;
  chart.format = format;
  chart.tickFormat = tickFormat;
  chart.barPath = barPath;
  chart.toNumber = toNumber;
  chart.get = function (el) { var c = charts && charts.get(el); return c ? c.api : null; };
  DocForm.chart = chart;

  DocForm.register('chart', function () {
    DocForm.all('[data-df-chart]').forEach(function (host) {
      if (!charts.has(host)) fromMarkup(host);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
