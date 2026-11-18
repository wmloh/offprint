// SVG line, bar, and scatter charts from inline data: a JSON script or a table inside a [data-df-chart] element, or
// DocForm.chart(el, spec). Hovering or the arrow keys show a readout; the Table button swaps the plot for its data.
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
  function normalize(spec) {
    spec = spec || {};
    var type = TYPES[spec.type] ? spec.type : 'line';
    var categories = Array.isArray(spec.categories) ? spec.categories.map(String) : null;
    var list = Array.isArray(spec.series) ? spec.series : Array.isArray(spec.data) ? [{ name: spec.name, data: spec.data }] : [];
    var series = list.map(function (s, si) {
      s = s || {};
      var points = [];
      (Array.isArray(s.data) ? s.data : []).forEach(function (d, i) {
        var x, y, label;
        if (Array.isArray(d)) { x = d[0]; y = d[1]; label = d[2]; }
        else if (d && typeof d === 'object') { x = d.x; y = d.y; label = d.label; }
        else { x = categories ? categories[i] : i; y = d; }
        y = toNumber(y);
        if (y === null || x == null) return;
        if (typeof x === 'string' && !categories && type !== 'bar' && toNumber(x) !== null) x = toNumber(x);
        points.push({ x: x, y: y, label: label == null ? '' : String(label) });
      });
      return {
        name: s.name == null || s.name === '' ? (list.length > 1 ? 'Series ' + (si + 1) : '') : String(s.name),
        points: points,
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
    } else {
      series.forEach(function (s) { s.points.sort(function (a, b) { return a.x - b.x; }); });
    }
    if (series.length > COLORS) {
      DocForm.warnOnce('chart-series', 'Charts have ' + COLORS + ' series colours; later series are drawn gray.');
    }
    return {
      type: type,
      title: spec.title ? String(spec.title) : '',
      series: series,
      categories: categorical ? categories : null,
      x: axisSpec(spec.x),
      y: axisSpec(spec.y),
      height: isNum(spec.height) && spec.height > 80 ? spec.height : 260
    };
  }

  // Header row plus body rows of cell text -> spec: the first column is x, every other column a series.
  function fromTable(rows, type) {
    var head = rows[0] || [];
    var body = rows.slice(1);
    return {
      type: type,
      x: { label: head[0] || '' },
      series: head.slice(1).map(function (name, c) {
        return { name: name, data: body.map(function (r) { return [r[0], r[c + 1]]; }) };
      })
    };
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

    var ys = [];
    var xs = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        ys.push(p.y);
        if (!cats) xs.push(p.x);
      });
    });
    var yLo = ys.length ? Math.min.apply(null, ys) : 0;
    var yHi = ys.length ? Math.max.apply(null, ys) : 1;
    if (type === 'bar') { yLo = Math.min(yLo, 0); yHi = Math.max(yHi, 0); }
    if (model.y.min !== null) yLo = model.y.min;
    if (model.y.max !== null) yHi = model.y.max;

    var top = 10 + (model.y.label ? 20 : 0);
    var bottom = 26 + (model.x.label ? 20 : 0);
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

    var tickY = height - bottom + 16;
    if (cats) {
      var widest = Math.max.apply(null, cats.map(function (c) { return c.length; }).concat([1])) * CHAR + 12;
      var every = Math.max(1, Math.ceil(widest / Math.max(1, band)));
      cats.forEach(function (c, i) {
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

    var marks = svg('g', {}, frame);
    var thick = 0;
    var gap = 2;
    if (type === 'bar') {
      var m = Math.max(1, series.length);
      thick = Math.max(2, Math.min(24, (band * 0.72 - gap * (m - 1)) / m));
    }
    series.forEach(function (s) {
      var g = svg('g', { class: 'df-chart-series' }, marks);
      paint(g, s);
      s.els = [];
      if (type === 'line') {
        var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + xAt(p.x) + ',' + y(p.y); }).join('');
        if (s.points.length > 1) svg('path', { d: d, class: 'df-chart-line' }, g);
        if (s.points.length <= 16) {
          s.points.forEach(function (p) { svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4, class: 'df-chart-dot' }, g); });
        }
      } else if (type === 'bar') {
        var groupW = series.length * thick + (series.length - 1) * gap;
        var y0 = y(Math.max(yInfo.min, Math.min(0, yInfo.max)));
        s.points.forEach(function (p) {
          var x0 = xAt(p.x) - groupW / 2 + s.index * (thick + gap);
          var bar = svg('path', { d: barPath(x0, thick, y0, y(p.y), 4), class: 'df-chart-bar' }, g);
          bar.setAttribute('data-df-x', p.x);
        });
      } else {
        s.points.forEach(function (p) {
          s.els.push(svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4.5, class: 'df-chart-dot' }, g));
        });
      }
    });

    ends.forEach(function (e) {
      svg('text', { x: xAt(e.p.x) + 10, y: e.y, 'dominant-baseline': 'middle', class: 'df-chart-end' }, frame)
        .textContent = e.s.name;
    });

    // Hover positions: one per x (line, bar) or one per point (scatter), in left-to-right order.
    var spots = [];
    if (type === 'scatter') {
      series.forEach(function (s) {
        s.points.forEach(function (p, i) { spots.push({ px: xAt(p.x), py: y(p.y), s: s, p: p, el: s.els[i] }); });
      });
    } else if (cats) {
      cats.forEach(function (c) { spots.push({ px: xAt(c), x: c }); });
    } else {
      xs.slice().sort(function (a, b) { return a - b; }).forEach(function (x, i, list) {
        if (!i || x !== list[i - 1]) spots.push({ px: xAt(x), x: x });
      });
    }
    spots.sort(function (a, b) { return a.px - b.px || (a.py || 0) - (b.py || 0); });
    chart.spots = spots;
    chart.geom = { left: left, right: left + plotW, top: top, bottom: height - bottom, band: band, y: y };
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.marks = marks;

    if (chart.svg) chart.plot.replaceChild(frame, chart.svg);
    else chart.plot.insertBefore(frame, chart.plot.firstChild);
    chart.svg = frame;
    if (chart.active >= 0) show(chart, Math.min(chart.active, spots.length - 1), null);
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
  }

  function show(chart, index, pointerY) {
    var spot = chart.svg && chart.spots[index];
    if (!spot) return hide(chart);
    var model = chart.model;
    var g = chart.geom;
    chart.active = index;
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
          x: spot.px - g.band / 2, y: g.top, width: g.band, height: g.bottom - g.top, class: 'df-chart-band'
        }, chart.overlay);
        chart.marks.parentNode.insertBefore(chart.overlay, chart.marks);
        DocForm.all('.df-chart-bar', chart.marks).forEach(function (el) {
          if (el.getAttribute('data-df-x') === String(spot.x)) el.classList.add('is-active');
        });
      } else {
        svg('line', { x1: spot.px, x2: spot.px, y1: g.top, y2: g.bottom, class: 'df-chart-cross' }, chart.overlay);
        chart.marks.parentNode.appendChild(chart.overlay);
      }
      model.series.forEach(function (s) {
        var p = null;
        for (var i = 0; i < s.points.length; i++) if (String(s.points[i].x) === String(spot.x)) { p = s.points[i]; break; }
        if (!p) return;
        if (model.type === 'line') {
          var dot = svg('circle', { cx: spot.px, cy: g.y(p.y), r: 4.5, class: 'df-chart-ring' }, chart.overlay);
          paint(dot, s);
        }
        row(tip, s, format(p.y, model.y), model.type);
      });
      anchorY = pointerY == null ? g.top : pointerY;
    }

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
    show(chart, nearest(spots.map(function (s) { return s.px; }), px), py);
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
          var tr = html('tr', '', body);
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
      model.series.forEach(function (s) { s.points.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); }); });
      xs.sort(function (a, b) { return a - b; });
    }
    xs.forEach(function (x) {
      var tr = html('tr', '', body);
      html('th', '', tr, model.categories ? x : format(x, model.x)).setAttribute('scope', 'row');
      model.series.forEach(function (s) {
        var p = s.points.filter(function (q) { return String(q.x) === String(x); })[0];
        html('td', '', tr, p ? format(p.y, model.y) : '');
      });
    });
    return table;
  }

  function describe(model) {
    var names = model.series.map(function (s) { return s.name; }).filter(Boolean);
    return (model.title ? model.title + '. ' : '') + model.type.charAt(0).toUpperCase() + model.type.slice(1) + ' chart' +
      (names.length ? ' of ' + names.join(', ') : '') + '. Arrow keys read the values; the Table button lists them.';
  }

  function renderHead(chart) {
    var model = chart.model;
    chart.legend.textContent = '';
    if (model.series.length < 2) return;
    model.series.forEach(function (s) {
      var item = html('span', 'df-chart-legend-item', chart.legend);
      key(model.type === 'line' ? 'line' : model.type === 'bar' ? 'bar' : 'dot', s, item);
      html('span', '', item, s.name);
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
    chart.plot.addEventListener('keydown', function (event) {
      var n = chart.spots.length;
      if (!n) return;
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
        host.classList.remove('is-line', 'is-bar', 'is-scatter');
        host.classList.add('is-' + chart.model.type);
        hide(chart);
        renderHead(chart);
        chart.plot.setAttribute('aria-label', describe(chart.model));
        if (!chart.ownTable) chart.table.textContent = '';
        if (chart.plot.hidden) {
          if (!chart.table.firstChild) chart.table.appendChild(buildTable(chart.model));
        } else {
          draw(chart);
        }
      },
      model: function () { return chart.model; }
    };
    charts.set(host, chart);
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
      var rows = DocForm.all('tr', table).map(function (tr) { return DocForm.all('th, td', tr).map(cellText); });
      spec = fromTable(rows, null);
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
    return build(host, overrides(host, spec || {}), script ? null : table);
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
