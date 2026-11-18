// SVG line, bar, and scatter charts from inline data: a JSON script or a table inside a [data-df-chart] element, or
// DocForm.chart(el, spec). Hovering or the arrow keys show a readout; the Table button swaps the plot for its data.
// Line charts with gaps: 'break' end a segment at explicit missing values; referenceLines mark labelled values.
// With a highlight group, a click, Enter, or Space on a keyed point selects that key in DocForm.highlight.
// x: { type: 'time' } on line and scatter charts places zoned timestamps by elapsed time and shows them in UTC.
// type: 'log' on either axis of a line or scatter chart plots positive values on a base-10 scale. A spec that fails
// validation is not drawn: the element keeps its own content, and an update keeps the last valid chart.
// Legend buttons hide and show series; brush: true narrows the x range of numeric and time axes by dragging or
// with + and -, and rescale: true fits the y axis to what is shown. Readouts and the table follow the view.
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
  var DRAG = 5;
  var MIN_SPAN = 1e-3;
  var EMPTY_SERIES = 'Every series is hidden. Choose one in the legend to show it.';
  var EMPTY_RANGE = 'No readings in this range.';
  var clips = 0;
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

  // Base-10 scale over positive values: each decade takes the same length.
  function log(d0, d1, r0, r1) {
    var base = linear(Math.log10(d0), Math.log10(d1), r0, r1);
    var f = function (v) { return base(Math.log10(v)); };
    f.invert = function (px) { return Math.pow(10, base.invert(px)); };
    return f;
  }

  // Ticks for a log axis: 1-2-5 or 1-3 steps across a few decades, every decade (or every nth) across more.
  // Ends round out to the nearest tick unless fixed; a range too narrow for two such ticks gets linear ones.
  function logTicks(min, max, count, fixMin, fixMax) {
    if (!(min > 0) || !(max > 0)) { min = 1; max = 10; }
    if (min > max) { var t = min; min = max; max = t; }
    if (min === max) { min /= 2; max *= 2; }
    count = count || 5;
    var lo10 = Math.floor(Math.log10(min) + 1e-9);
    var hi10 = Math.ceil(Math.log10(max) - 1e-9);
    var decades = Math.max(1, hi10 - lo10);
    var room = count * 1.5;
    var marks = decades * 3 + 1 <= room ? [1, 2, 5] : decades * 2 + 1 <= room ? [1, 3] : [1];
    var every = marks.length > 1 ? 1 : Math.max(1, Math.ceil(decades / count));
    var all = [];
    for (var k = Math.floor(lo10 / every) * every; k <= hi10 + every; k += every) {
      marks.forEach(function (m) { all.push(+(m + 'e' + k)); });
    }
    var lo = fixMin ? min : all.filter(function (v) { return v <= min * (1 + 1e-9); }).pop();
    var hi = fixMax ? max : all.filter(function (v) { return v >= max * (1 - 1e-9); })[0];
    var out = all.filter(function (v) { return v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9); });
    if (out.length < 2) out = ticks(lo, hi, count, true, true).ticks.filter(function (v) { return v > 0; });
    return { min: lo, max: hi, log: true, ticks: out };
  }

  // Log tick labels: each value in its own compact unit (500, 1,000, 10K, 2M, 1T) or as a short decimal (0.002, 1e-7).
  function logTickFormat() {
    return function (v) {
      var unit = v >= 1e12 ? [1e12, 'T'] : v >= 1e9 ? [1e9, 'B'] : v >= 1e6 ? [1e6, 'M'] : v >= 1e4 ? [1e3, 'K'] : null;
      if (unit) return String(+(v / unit[0]).toPrecision(6)) + unit[1];
      return v >= 1 ? v.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(+v.toPrecision(6));
    };
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
    if (axis && axis.time) return timeText(v, axis.precision);
    var digits = axis && isNum(axis.digits) ? axis.digits : null;
    var tiny = axis && axis.log && v && Math.abs(v) < 1e-4;
    var text = digits === null ?
      (tiny ? String(+v.toPrecision(6)) : (+v.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })) :
      v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return text + (axis && axis.unit ? axis.unit : '');
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SECOND = 1e3;
  var MINUTE = 6e4;
  var HOUR = 36e5;
  var DAY = 864e5;
  var ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)$/i;
  var TIME_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND,
    30 * SECOND, MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR,
    6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];
  var MONTH_STEPS = [1, 2, 3, 6];

  function pad(n, width) {
    n = String(n);
    while (n.length < (width || 2)) n = '0' + n;
    return n;
  }

  // Epoch milliseconds, or an ISO date and time ending in Z or an offset such as +09:00, become epoch milliseconds.
  // Anything else is null, including timestamps without a zone, which would otherwise depend on the reader's clock.
  function toTime(v) {
    if (typeof v === 'string' && /^\s*[-+]?\d+(?:\.\d+)?\s*$/.test(v)) v = parseFloat(v);
    if (isNum(v)) return Math.abs(v) <= 8.64e15 ? v : null;
    if (typeof v !== 'string') return null;
    var m = v.trim().match(ISO);
    if (!m) return null;
    var month = +m[2] - 1;
    var day = +m[3];
    var date = new Date(0);
    date.setUTCFullYear(+m[1], month, day);
    if (+m[4] > 23 || +m[5] > 59 || +(m[6] || 0) > 59 || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    var zone = m[8].toUpperCase();
    var offset = 0;
    if (zone !== 'Z') {
      var oh = +zone.slice(1, 3);
      var om = zone.length > 3 ? +zone.slice(-2) : 0;
      if (oh > 23 || om > 59) return null;
      offset = (zone.charAt(0) === '-' ? -1 : 1) * (oh * HOUR + om * MINUTE);
    }
    var ms = m[7] ? +(m[7] + '00').slice(0, 3) : 0;
    return date.getTime() + +m[4] * HOUR + +m[5] * MINUTE + +(m[6] || 0) * SECOND + ms - offset;
  }

  // The finest unit any instant needs, so every readout and table cell on one axis shares a format.
  function timePrecision(values) {
    if (values.some(function (v) { return v % SECOND; })) return 'ms';
    return values.some(function (v) { return v % MINUTE; }) ? 'second' : 'minute';
  }

  function timeText(v, precision) {
    var d = new Date(v);
    var text = pad(d.getUTCFullYear(), 4) + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    if (precision === 'second' || precision === 'ms') text += ':' + pad(d.getUTCSeconds());
    if (precision === 'ms') text += '.' + pad(d.getUTCMilliseconds(), 3);
    return text + ' UTC';
  }

  function monthStart(index) {
    var d = new Date(0);
    var year = Math.floor(index / 12);
    d.setUTCFullYear(year, index - year * 12, 1);
    return d.getTime();
  }

  // Ticks at round UTC steps (milliseconds through weeks, then calendar months and years) covering [min, max].
  // Week ticks fall on Mondays. Fixed ends keep their exact values, as in ticks().
  function timeTicks(min, max, count, fixMin, fixMax) {
    if (!isNum(min) || !isNum(max)) { min = 0; max = DAY; }
    if (min > max) { var t = min; min = max; max = t; }
    if (min === max) { min -= 30 * MINUTE; max += 30 * MINUTE; }
    var raw = (max - min) / Math.max(1, count || 5);
    var step = 0;
    var months = 0;
    var i;
    for (i = 0; i < TIME_STEPS.length && !step; i++) if (TIME_STEPS[i] >= raw) step = TIME_STEPS[i];
    if (!step) {
      var rawMonths = raw / (30.44 * DAY);
      for (i = 0; i < MONTH_STEPS.length && !months; i++) if (MONTH_STEPS[i] >= rawMonths) months = MONTH_STEPS[i];
      if (!months) months = 12 * Math.max(1, Math.round(niceStep(rawMonths / 12, 1)));
    }
    var out = [];
    var lo;
    var hi;
    var k;
    if (months) {
      var at = function (v) { var d = new Date(v); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
      var first = Math.floor(at(min) / months) * months;
      var last = Math.floor(at(max) / months) * months;
      if (monthStart(last) < max) last += months;
      lo = fixMin ? min : monthStart(first);
      hi = fixMax ? max : monthStart(last);
      for (k = first; k <= last && out.length < 1000; k += months) {
        if (monthStart(k) >= lo && monthStart(k) <= hi) out.push(monthStart(k));
      }
      step = months * 30.44 * DAY;
    } else {
      var origin = step === 7 * DAY ? 4 * DAY : 0;
      lo = fixMin ? min : Math.floor((min - origin) / step) * step + origin;
      hi = fixMax ? max : Math.ceil((max - origin) / step) * step + origin;
      for (k = Math.ceil((lo - origin) / step) * step + origin; k <= hi && out.length < 1000; k += step) out.push(k);
    }
    return { min: lo, max: hi, step: step, months: months, ticks: out };
  }

  // Short UTC tick labels sized to the step; a tick at UTC midnight names its date instead of 00:00.
  function timeTickFormat(info) {
    return function (v) {
      var d = new Date(v);
      if (info.months >= 12) return String(d.getUTCFullYear());
      if (info.months) return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
      var date = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
      if (info.step >= DAY) return date;
      var text = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
      if (info.step < MINUTE) text += ':' + pad(d.getUTCSeconds());
      if (info.step < SECOND) text += '.' + pad(d.getUTCMilliseconds(), 3);
      return v % DAY ? text : date;
    };
  }

  function axisSpec(a, time, log) {
    if (typeof a === 'string') a = { label: a };
    a = a || {};
    var bound = function (v) {
      if (!time) return toNumber(v);
      var at = v == null ? null : toTime(v);
      if (v != null && at === null) {
        DocForm.warnOnce('chart-time-bound:' + v, 'Chart time bound ' + JSON.stringify(v) + ' is not a timestamp; it is ignored.');
      }
      return at;
    };
    return {
      label: a.label == null ? '' : String(a.label),
      min: bound(a.min),
      max: bound(a.max),
      digits: isNum(a.digits) ? a.digits : null,
      unit: a.unit ? String(a.unit) : '',
      time: !!time,
      log: !!log,
      precision: null
    };
  }

  function axisType(a) {
    return !!a && typeof a === 'object' ? a.type : null;
  }

  // Problems that would make a log axis misleading. Each one stops the chart from drawing (see report).
  function logErrors(model, spec) {
    var errors = [];
    var rejected = function (name, values) {
      var bad = values.filter(function (v) { return !(v > 0); });
      if (bad.length) {
        errors.push('The log ' + name + ' axis needs positive values; ' + bad.length + (bad.length > 1 ? ' are' : ' is') +
          ' zero or negative, such as ' + bad[0] + '.');
      }
    };
    ['x', 'y'].forEach(function (name) {
      var axis = model[name];
      if (!axis.log) return;
      var raw = spec[name] && typeof spec[name] === 'object' ? spec[name] : {};
      ['min', 'max'].forEach(function (end) {
        if (raw[end] != null && !(axis[end] > 0)) {
          errors.push('The log ' + name + ' axis ' + end + ' must be a positive number, not ' + JSON.stringify(raw[end]) + '.');
        }
      });
      if (axis.min > 0 && axis.max > 0 && axis.min >= axis.max) {
        errors.push('The log ' + name + ' axis min must be below its max.');
      }
      if (name === 'x' && model.categories) {
        errors.push('The log x axis needs numeric x values.');
        return;
      }
      var values = [];
      model.series.forEach(function (s) {
        s.points.forEach(function (p) { values.push(p[name]); });
        if (name === 'x') values.push.apply(values, s.missing);
      });
      rejected(name, values);
      var refs = model.referenceLines.filter(function (r) { return r.axis === name; }).map(function (r) { return r.value; });
      var bad = refs.filter(function (v) { return !(v > 0); });
      if (bad.length) errors.push('A reference line on the log ' + name + ' axis is at ' + bad[0] + '; it needs a positive value.');
    });
    return errors;
  }

  // The x axis name in tables and readouts, and its title under the plot, which states the time zone.
  function xName(model, fallback) {
    return model.x.label || (model.x.time ? 'Time' : fallback);
  }

  function xTitle(model) {
    return model.x.time ? xName(model) + ' (UTC)' : model.x.label;
  }

  // Spec -> model. Data points are [x, y, label], {x, y, label}, or bare y values (x = category or index).
  // Bar charts and string x values give a categorical x axis in order of first appearance.
  // With gaps: 'break' on a line chart, a null or blank y keeps its x as a missing value instead of being dropped.
  // With x: { type: 'time' }, x values are timestamps (see toTime) and a point whose x is not one is skipped.
  function normalize(spec) {
    spec = spec || {};
    var type = TYPES[spec.type] ? spec.type : 'line';
    var breaks = type === 'line' && spec.gaps === 'break';
    var time = axisType(spec.x) === 'time';
    if (time && type === 'bar') {
      DocForm.warnOnce('chart-time-bar', 'Time axes apply to line and scatter charts; this bar chart keeps text categories.');
      time = false;
    }
    var xLog = axisType(spec.x) === 'log';
    var yLog = axisType(spec.y) === 'log';
    if ((xLog || yLog) && type === 'bar') {
      DocForm.warnOnce('chart-log-bar', 'Log axes apply to line and scatter charts; this bar chart keeps linear axes.');
      xLog = yLog = false;
    }
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
        if (time) {
          var at = toTime(x);
          if (at === null) {
            DocForm.warnOnce('chart-time:' + x, 'Chart time ' + JSON.stringify(x) + ' needs epoch milliseconds or an ISO ' +
              'timestamp with Z or an offset such as +09:00; the point is skipped.');
            return;
          }
          x = at;
        } else if (typeof x === 'string' && !categories && type !== 'bar' && toNumber(x) !== null) x = toNumber(x);
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
    var categorical = !time && (type === 'bar' || !!categories || series.some(function (s) {
      return s.points.some(function (p) { return typeof p.x !== 'number'; });
    }));
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
      var value = axis === 'x' && categorical ? (r.value == null ? null : String(r.value)) :
        axis === 'x' && time ? toTime(r.value) : toNumber(r.value);
      if (!axis || value === null) {
        DocForm.warnOnce('chart-ref', 'Chart reference lines need an axis of "x" or "y" and a value on that axis.');
        return;
      }
      refs.push({ axis: axis, value: value, label: r.label == null ? '' : String(r.label) });
    });
    if (series.length > COLORS) {
      DocForm.warnOnce('chart-series', 'Charts have ' + COLORS + ' series colours; later series are drawn gray.');
    }
    if (spec.brush && categorical) {
      DocForm.warnOnce('chart-brush', 'Range brushing needs a numeric or time x axis; this chart has text categories.');
    }
    var xAxis = axisSpec(spec.x, time, xLog);
    if (time) {
      var instants = [xAxis.min, xAxis.max].filter(isNum);
      series.forEach(function (s) {
        s.points.forEach(function (p) { instants.push(p.x); });
        instants.push.apply(instants, s.missing);
      });
      refs.forEach(function (r) { if (r.axis === 'x') instants.push(r.value); });
      xAxis.precision = timePrecision(instants);
    }
    var model = {
      type: type,
      title: spec.title ? String(spec.title) : '',
      series: series,
      categories: categorical ? categories : null,
      markedCategories: categorical && Array.isArray(spec.markedCategories) ? new Set(spec.markedCategories.map(String)) : null,
      gaps: breaks,
      referenceLines: refs,
      highlight: typeof spec.highlight === 'string' && spec.highlight.trim() ? spec.highlight.trim() : null,
      table: spec.table !== false,
      toggles: spec.toggles !== false && series.length > 1,
      brush: !!spec.brush && !categorical,
      rescale: !!spec.rescale,
      x: xAxis,
      y: axisSpec(spec.y, false, yLog),
      height: isNum(spec.height) && spec.height > 80 ? spec.height : 260
    };
    model.errors = logErrors(model, spec);
    return model;
  }

  // Warns about a model that cannot be drawn; true when it can.
  function report(model, host, update) {
    if (!model.errors.length) return true;
    var text = model.errors.join(' ');
    DocForm.warnOnce('chart-invalid:' + text, (update ? 'Chart update ignored; the last valid chart stays. ' :
      'Chart not drawn; its own content stays. ') + text, host);
    return false;
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
      var byX = new Map();
      model.series.forEach(function (s) {
        s.points.forEach(function (p) {
          var at = String(p.x);
          if (!byX.has(at)) byX.set(at, []);
          byX.get(at).push({ s: s, p: p });
        });
      });
      xs.forEach(function (x) {
        var cx = xAt(x);
        var found = byX.get(String(x)) || [];
        found.forEach(function (f) {
          var mark = markOf(f.p) || {};
          spots.push({ px: mark.px == null ? cx : mark.px, cx: cx, py: y(f.p.y), x: x, s: f.s, p: f.p, el: mark.el });
        });
        if (!found.length) spots.push({ px: cx, cx: cx, x: x });
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
    return { yLo: yLo, yHi: yHi, xs: xs, count: ys.length };
  }

  // The x span of all the data, with fixed axis ends, or null on text axes and charts with a single x value.
  function domain(model) {
    if (model.categories) return null;
    var xs = extent(model).xs;
    var lo = model.x.min !== null ? model.x.min : xs.length ? Math.min.apply(null, xs) : null;
    var hi = model.x.max !== null ? model.x.max : xs.length ? Math.max.apply(null, xs) : null;
    return lo !== null && hi !== null && hi > lo ? [lo, hi] : null;
  }

  // Range arithmetic happens in axis position units, so log axes narrow and move by ratios.
  function along(model) {
    return model.x.log ?
      { to: function (v) { return Math.log10(v); }, from: function (t) { return Math.pow(10, t); } } :
      { to: function (v) { return v; }, from: function (t) { return t; } };
  }

  // [lo, hi] clamped to the domain: null when it covers the whole domain, false when it is unusable or narrower
  // than a thousandth of the domain.
  function clampRange(model, lo, hi) {
    var dom = domain(model);
    if (!dom || !isNum(lo) || !isNum(hi) || (model.x.log && !(lo > 0 && hi > 0))) return false;
    var s = along(model);
    var a = s.to(dom[0]);
    var b = s.to(dom[1]);
    var p = Math.max(a, s.to(Math.min(lo, hi)));
    var q = Math.min(b, s.to(Math.max(lo, hi)));
    if (!isNum(p) || !isNum(q) || q - p < (b - a) * MIN_SPAN) return false;
    if (p <= a && q >= b) return null;
    return [p <= a ? dom[0] : s.from(p), q >= b ? dom[1] : s.from(q)];
  }

  // Scales the range width by factor around center (an x value, kept at the same place), within the domain.
  function zoomRange(model, range, center, factor) {
    var dom = domain(model);
    if (!dom) return null;
    var s = along(model);
    var a = s.to(dom[0]);
    var b = s.to(dom[1]);
    var r = range || dom;
    var p = s.to(r[0]);
    var q = s.to(r[1]);
    var c = isNum(center) && center > (model.x.log ? 0 : -Infinity) ? Math.max(p, Math.min(q, s.to(center))) : (p + q) / 2;
    var w = Math.max((q - p) * factor, (b - a) * MIN_SPAN * 1.5);
    if (w >= b - a) return null;
    var lo = Math.max(a, Math.min(c - (c - p) * w / (q - p), b - w));
    var next = clampRange(model, s.from(lo), s.from(lo + w));
    return next === false ? range : next;
  }

  // Moves the range by shift times its width, stopping at the domain ends.
  function panRange(model, range, shift) {
    var dom = domain(model);
    if (!dom || !range) return range || null;
    var s = along(model);
    var a = s.to(dom[0]);
    var b = s.to(dom[1]);
    var p = s.to(range[0]);
    var w = s.to(range[1]) - p;
    var lo = Math.max(a, Math.min(p + w * shift, b - w));
    var next = clampRange(model, s.from(lo), s.from(lo + w));
    return next === false ? range : next;
  }

  function sameRange(a, b) {
    return a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
  }

  // The part of a chart being shown: series not hidden by name, and points inside an x range. Line series keep
  // the nearest reading beyond each end in `line` so their paths run to the plot edge, and every missing value
  // in `breaks` so those paths still break where the data does.
  function viewOf(model, hidden, range) {
    var off = hidden || {};
    var inside = function (x) { return x >= range[0] && x <= range[1]; };
    var series = model.series.filter(function (s) { return !off[s.name]; }).map(function (s) {
      var points = range ? s.points.filter(function (p) { return inside(p.x); }) : s.points;
      var line = points;
      if (range && model.type === 'line') {
        var before = null;
        var after = null;
        s.points.forEach(function (p) {
          if (p.x < range[0]) before = p;
          else if (p.x > range[1] && !after) after = p;
        });
        line = (before ? [before] : []).concat(points, after ? [after] : []);
      }
      return Object.assign({}, s, {
        points: points,
        missing: range ? s.missing.filter(inside) : s.missing,
        line: line,
        breaks: s.missing
      });
    });
    return Object.assign({}, model, { series: series, range: range || null, hiddenCount: model.series.length - series.length });
  }

  // The data position under a point (px, py) of the drawn plot, or null outside the plot area. Continuous values are
  // rounded to what one pixel can tell apart; categorical x gives the category of the band.
  function readAt(model, geom, px, py) {
    if (!geom || !geom.y || !(px >= geom.left && px <= geom.right && py >= geom.top && py <= geom.bottom)) return null;
    var fine = function (scale, p, log) {
      var v = scale.invert(p);
      var step = Math.abs(scale.invert(p + 1) - v);
      if (!(step > 0) || !isFinite(v)) return v;
      if (log) return +v.toPrecision(Math.max(1, Math.min(15, Math.ceil(Math.log10(Math.abs(v) / step)) + 1)));
      var d = Math.max(0, Math.min(12, -Math.floor(Math.log10(step))));
      return +v.toFixed(d);
    };
    var x;
    if (model.categories) {
      var cats = model.categories;
      var i = Math.floor((px - geom.left) / Math.max(1e-9, geom.band));
      x = cats[Math.max(0, Math.min(cats.length - 1, i))];
    } else {
      x = geom.x ? (model.x.time ? Math.round(geom.x.invert(px)) : fine(geom.x, px, model.x.log)) : null;
    }
    var y = fine(geom.y, py, model.y.log);
    return {
      x: x, y: y,
      xText: model.categories ? String(x) : format(x, model.x),
      yText: format(y, model.y)
    };
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

  // Draws chart.view. The y axis covers every series unless the chart rescales to the series and range shown.
  function draw(chart) {
    var model = chart.view;
    var width = Math.round(chart.plot.clientWidth);
    if (!width) return;
    chart.width = width;
    var height = model.height;
    var type = model.type;
    var series = model.series;
    var cats = model.categories;
    var range = model.range;

    var span = extent(model);
    var xs = span.xs;
    var fit = model.rescale && span.count ? span : extent(chart.model);
    var yLo = fit.yLo;
    var yHi = fit.yHi;

    var top = 10 + (model.y.label ? 20 : 0);
    var markerSpace = model.markedCategories ? 13 : 0;
    var xLabel = xTitle(model);
    var bottom = 26 + markerSpace + (xLabel ? 20 : 0);
    var yLog = model.y.log;
    var yInfo = (yLog ? logTicks : ticks)(yLo, yHi, Math.max(2, Math.round((height - top - bottom) / 48)),
      model.y.min !== null, model.y.max !== null);
    var yFmt = yLog ? logTickFormat() : tickFormat(yInfo);
    var left = 12 + CHAR * Math.max.apply(null, yInfo.ticks.map(function (v) { return yFmt(v).length; }).concat([1]));
    var y = (yLog ? log : linear)(yInfo.min, yInfo.max, height - bottom, top);

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
    var xs0 = null;
    var band = 0;
    var xInfo = null;
    if (cats) {
      band = plotW / Math.max(1, cats.length);
      xAt = function (x) { return left + band * (cats.indexOf(String(x)) + 0.5); };
    } else {
      var xLo = xs.length ? Math.min.apply(null, xs) : 0;
      var xHi = xs.length ? Math.max.apply(null, xs) : 1;
      var exact = type === 'line';
      var xTicks = model.x.time ? timeTicks : model.x.log ? logTicks : ticks;
      if (model.x.min !== null) xLo = model.x.min;
      if (model.x.max !== null) xHi = model.x.max;
      if (range) { xLo = range[0]; xHi = range[1]; }
      xInfo = xTicks(xLo, xHi, Math.max(2, Math.round(plotW / (model.x.time ? 110 : 90))),
        exact || !!range || model.x.min !== null, exact || !!range || model.x.max !== null);
      if (xInfo.min === xInfo.max) xInfo = xTicks(xLo, xHi, 4);
      xs0 = (model.x.log ? log : linear)(xInfo.min, xInfo.max, left, left + plotW);
      xAt = function (x) { return xs0(x); };
    }

    var frame = svg('svg', {
      viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, 'aria-hidden': 'true', focusable: 'false'
    });
    // A narrowed range clips line paths that run on to the readings just beyond each end.
    if (range) {
      var clip = svg('clipPath', { id: chart.clip }, svg('defs', {}, frame));
      svg('rect', { x: left, y: top - 3, width: plotW, height: height - bottom - top + 6 }, clip);
    }

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
      var xFmt = model.x.time ? timeTickFormat(xInfo) : model.x.log ? logTickFormat() : tickFormat(xInfo);
      xInfo.ticks.forEach(function (v) {
        svg('text', { x: xAt(v), y: tickY, 'text-anchor': 'middle', class: 'df-chart-tick' }, frame).textContent = xFmt(v);
      });
    }
    if (xLabel) {
      svg('text', { x: left + plotW / 2, y: height - 6, 'text-anchor': 'middle', class: 'df-chart-label' }, frame)
        .textContent = xLabel;
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
    series.forEach(function (s, si) {
      var g = svg('g', { class: 'df-chart-series' }, marks);
      paint(g, s);
      if (type === 'line') {
        var runs = model.gaps ? segments(s.line, s.breaks, cats ? function (x) { return cats.indexOf(String(x)); } :
          function (x) { return x; }) : [s.line];
        var d = runs.map(function (run) {
          return run.length > 1 ? run.map(function (p, i) { return (i ? 'L' : 'M') + xAt(p.x) + ',' + y(p.y); }).join('') : '';
        }).join('');
        if (d) {
          var path = svg('path', { d: d, class: 'df-chart-line' }, g);
          if (range) path.setAttribute('clip-path', 'url(#' + chart.clip + ')');
        }
        // Isolated readings between gaps, and selectable points, keep a marker even on dense lines.
        runs.forEach(function (run) {
          run.forEach(function (p) {
            if (range && (p.x < range[0] || p.x > range[1])) return;
            if (s.points.length > 16 && run.length > 1 && !(model.highlight && p.key)) return;
            place(p, svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4, class: 'df-chart-dot' }, g), xAt(p.x));
          });
        });
      } else if (type === 'bar') {
        var groupW = series.length * thick + (series.length - 1) * gap;
        var y0 = y(Math.max(yInfo.min, Math.min(0, yInfo.max)));
        s.points.forEach(function (p) {
          var x0 = xAt(p.x) - groupW / 2 + si * (thick + gap);
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
    var full = range ? domain(chart.model) : null;
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
        var cut = full && r.axis === 'x' && r.value >= full[0] && r.value <= full[1];
        item.lastChild.textContent = on ? '' : cut ? 'outside range' : 'off scale';
      }
    });

    chart.spots = spotsFor(model, xAt, y, function (p) { return markOf.get(p); });
    chart.geom = { left: left, right: left + plotW, top: top, bottom: height - bottom, band: band, y: y, x: xs0 };
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.marks = marks;

    var empty = !series.length ? EMPTY_SERIES : range && !chart.spots.length ? EMPTY_RANGE : '';
    chart.empty.textContent = empty;
    chart.empty.hidden = !empty;
    chart.empty.style.left = left + 'px';
    chart.empty.style.width = plotW + 'px';
    chart.empty.style.top = top + 'px';
    chart.empty.style.height = Math.max(0, height - bottom - top) + 'px';

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
    var model = chart.view;
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
      line(xName(model, 'x'), xText(chart, spot.p.x));
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

  // Pointer position in the chart's drawing units.
  function local(chart, event) {
    var rect = chart.svg.getBoundingClientRect();
    var scale = rect.width ? chart.width / rect.width : 1;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
  }

  function pick(chart, event) {
    var at = local(chart, event);
    var px = at.x;
    var py = at.y;
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
      [model.series.length > 1 ? 'Series' : null, labels ? 'Label' : null, xName(model, 'x'), model.y.label || 'y']
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
    html('th', '', head, xName(model, ''));
    model.series.forEach(function (s) { html('th', '', head, s.name || model.y.label || 'Value'); });
    var xs = model.categories || [];
    if (!model.categories) {
      var seen = new Set();
      model.series.forEach(function (s) {
        s.points.forEach(function (p) { seen.add(p.x); });
        s.missing.forEach(function (x) { seen.add(x); });
      });
      seen.forEach(function (x) { xs.push(x); });
      xs.sort(function (a, b) { return a - b; });
    }
    var lookup = model.series.map(function (s) {
      var at = new Map();
      s.points.forEach(function (p) { if (!at.has(String(p.x))) at.set(String(p.x), p); });
      return at;
    });
    xs.forEach(function (x) {
      var tr = html('tr', '', body);
      html('th', '', tr, model.categories ? x : format(x, model.x)).setAttribute('scope', 'row');
      model.series.forEach(function (s, i) {
        var p = lookup[i].get(String(x));
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
      (model.x.time ? ' Times are in UTC.' : '') +
      (model.x.log || model.y.log ? ' The ' + (model.x.log && model.y.log ? 'x and y axes use' : (model.x.log ? 'x' : 'y') +
        ' axis uses') + ' a log scale.' : '') +
      (refs.length ? ' Reference ' + (refs.length > 1 ? 'lines: ' : 'line: ') + refs.join(', ') + '.' : '') +
      (gaps ? ' Breaks in a line mark missing values.' : '') + ' Arrow keys read the values.' +
      (keyed ? ' Enter or Space selects the point being read.' : '') +
      (model.brush ? ' Drag across the plot, or press plus and minus, to narrow or widen the x range; Shift with ' +
        'the left and right arrow keys moves it.' : '') +
      (model.toggles ? ' The legend buttons hide and show series.' : '') +
      (model.table ? ' The Table button lists the values shown.' : '');
  }

  function rangeText(model, range) {
    return xName(model, 'x') + ' ' + format(range[0], model.x).replace(/ UTC$/, '') + ' – ' + format(range[1], model.x);
  }

  function renderHead(chart) {
    var model = chart.model;
    chart.legend.textContent = '';
    chart.seriesItems = [];
    if (model.series.length > 1) {
      model.series.forEach(function (s) {
        var item = html(model.toggles ? 'button' : 'span', 'df-chart-legend-item', chart.legend);
        if (model.toggles) {
          item.type = 'button';
          item.classList.add('df-chart-series-toggle');
          item.addEventListener('click', function () { setVisible(chart, s.name, !!chart.hidden[s.name]); });
        }
        key(model.type === 'line' ? 'line' : model.type === 'bar' ? 'bar' : 'dot', s, item);
        html('span', '', item, s.name);
        chart.seriesItems.push({ el: item, name: s.name });
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
    syncHead(chart);
  }

  // Pressed legend buttons, and the narrowed range with its Reset button.
  function syncHead(chart) {
    chart.seriesItems.forEach(function (item) {
      var off = !!chart.hidden[item.name];
      item.el.classList[off ? 'add' : 'remove']('is-off');
      if (!chart.model.toggles) return;
      item.el.setAttribute('aria-pressed', off ? 'false' : 'true');
      item.el.title = (off ? 'Show ' : 'Hide ') + item.name;
    });
    chart.rangeText.textContent = chart.range ? rangeText(chart.model, chart.range) : '';
    chart.rangeText.hidden = !chart.range;
    chart.reset.hidden = !chart.range;
    chart.box.classList[chart.model.brush ? 'add' : 'remove']('is-brushable');
  }

  function tableView(view) {
    return view.series.length ? buildTable(view) : html('p', 'df-chart-empty-note', null, EMPTY_SERIES);
  }

  // The table view lists what the plot shows; a source table stands in while nothing is hidden or narrowed.
  function fillTable(chart) {
    chart.table.textContent = '';
    if (chart.ownTable && !chart.range && !chart.view.hiddenCount) chart.table.appendChild(chart.sourceTable);
    else if (chart.plot.hidden) chart.table.appendChild(tableView(chart.view));
  }

  function refresh(chart) {
    chart.view = viewOf(chart.model, chart.hidden, chart.range);
    hide(chart);
    syncHead(chart);
    fillTable(chart);
    if (!chart.plot.hidden) draw(chart);
    if (typeof CustomEvent === 'function') {
      chart.box.dispatchEvent(new CustomEvent('df:chartview', {
        bubbles: true,
        detail: { hidden: Object.keys(chart.hidden), range: chart.range ? chart.range.slice() : null }
      }));
    }
  }

  function setVisible(chart, name, on) {
    if (on) delete chart.hidden[name];
    else chart.hidden[name] = true;
    refresh(chart);
  }

  function setRange(chart, range) {
    chart.range = range;
    refresh(chart);
  }

  // A range survives an update when the x axis keeps its kind and the range still overlaps the new data.
  function keepRange(range, before, after) {
    if (!range || after.categories || before.x.time !== after.x.time || before.x.log !== after.x.log) return null;
    return clampRange(after, range[0], range[1]) || null;
  }

  function brushable(chart) {
    return chart.model.brush && !chart.plot.hidden && !!chart.svg && !!chart.geom.x && !!domain(chart.model);
  }

  function dragTo(chart, event) {
    var d = chart.drag;
    var g = chart.geom;
    d.to = Math.max(g.left, Math.min(g.right, local(chart, event).x));
    if (!d.moved && Math.abs(d.to - d.from) < DRAG) return;
    if (!d.moved) {
      d.moved = true;
      hide(chart);
      chart.box.classList.add('is-brushing');
      try { chart.plot.setPointerCapture(d.id); } catch (e) { /* capture is optional */ }
      d.rect = svg('rect', { y: g.top, height: g.bottom - g.top, class: 'df-chart-brush' }, chart.svg);
    }
    d.rect.setAttribute('x', Math.min(d.from, d.to));
    d.rect.setAttribute('width', Math.abs(d.to - d.from));
  }

  function endDrag(chart, commit) {
    var d = chart.drag;
    chart.drag = null;
    if (!d || !d.moved) return;
    chart.box.classList.remove('is-brushing');
    if (d.rect.parentNode) d.rect.parentNode.removeChild(d.rect);
    // The click that ends a drag is not a selection, and must not open a zoomable figure.
    chart.dragged = true;
    if (!commit) return;
    var next = clampRange(chart.model, chart.geom.x.invert(d.from), chart.geom.x.invert(d.to));
    if (next !== false) setRange(chart, next);
  }

  // The x value being read, so keyboard zooming stays centred on it.
  function readX(chart) {
    var spot = chart.spots[chart.active];
    if (!spot) return null;
    return spot.x !== undefined ? spot.x : spot.p ? spot.p.x : null;
  }

  function readNear(chart, x) {
    if (!chart.spots.length || !chart.geom || !chart.geom.x) return;
    var px = isNum(x) ? chart.geom.x(x) : (chart.geom.left + chart.geom.right) / 2;
    show(chart, closest(chart.spots, px, null), null);
  }

  // + and - narrow and widen the range around the reading; Shift with the left and right arrows moves it.
  function keyRange(chart, event) {
    if (!brushable(chart) || event.altKey || event.ctrlKey || event.metaKey) return false;
    var at = readX(chart);
    var next;
    if (event.key === '+' || event.key === '=') next = zoomRange(chart.model, chart.range, at, 0.5);
    else if (event.key === '-' || event.key === '_' || event.key === '−') next = zoomRange(chart.model, chart.range, at, 2);
    else if (event.shiftKey && chart.range && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      next = panRange(chart.model, chart.range, event.key === 'ArrowLeft' ? -0.25 : 0.25);
    } else return false;
    event.preventDefault();
    if (sameRange(next, chart.range)) return true;
    setRange(chart, next);
    readNear(chart, at);
    return true;
  }

  function setTable(chart, on) {
    if (on && !chart.table.firstChild) chart.table.appendChild(tableView(chart.view));
    chart.box.classList.toggle('is-table', on);
    chart.table.hidden = !on;
    chart.plot.hidden = on;
    chart.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    chart.toggle.textContent = on ? 'Chart' : 'Table';
    if (!on) draw(chart);
  }

  function build(host, model, sourceTable, spec) {
    var chart = {
      box: host, model: model, spec: spec, active: -1, spots: [], svg: null, width: 0, geom: {},
      hidden: Object.create(null), range: null, drag: null, dragged: false, clip: 'df-chart-clip-' + (++clips)
    };
    chart.view = viewOf(model, chart.hidden, null);
    host.classList.add('df-chart');
    host.classList.add('is-' + chart.model.type);

    var head = html('div', 'df-chart-head');
    chart.legend = html('div', 'df-chart-legend', head);
    var tools = html('div', 'df-chart-tools', head);
    chart.rangeText = html('span', 'df-chart-range', tools);
    chart.reset = html('button', 'df-chart-reset', tools, 'Reset range');
    chart.reset.type = 'button';
    chart.toggle = html('button', 'df-chart-toggle', tools, 'Table');
    chart.toggle.type = 'button';
    chart.toggle.hidden = !chart.model.table;
    chart.toggle.setAttribute('aria-pressed', 'false');
    chart.plot = html('div', 'df-chart-plot');
    chart.plot.tabIndex = 0;
    chart.plot.setAttribute('role', 'group');
    chart.tip = html('div', 'df-chart-tip', chart.plot);
    chart.tip.hidden = true;
    chart.tip.setAttribute('aria-live', 'polite');
    chart.empty = html('div', 'df-chart-empty', chart.plot);
    chart.empty.hidden = true;
    chart.empty.setAttribute('role', 'status');
    chart.table = html('div', 'df-chart-table');
    chart.table.hidden = true;
    // A table the chart was read from is its table view until an update brings other data.
    chart.sourceTable = sourceTable || null;
    chart.sourceSpec = spec;
    chart.ownTable = !!sourceTable;
    if (sourceTable) chart.table.appendChild(sourceTable);
    host.insertBefore(chart.table, host.firstChild);
    host.insertBefore(chart.plot, chart.table);
    host.insertBefore(head, chart.plot);
    renderHead(chart);
    chart.plot.setAttribute('aria-label', describe(chart.model));

    chart.toggle.addEventListener('click', function () { setTable(chart, !host.classList.contains('is-table')); });
    chart.reset.addEventListener('click', function () {
      setRange(chart, null);
      if (typeof chart.plot.focus === 'function') chart.plot.focus({ preventScroll: true });
    });
    chart.plot.addEventListener('pointerdown', function (event) {
      chart.dragged = false;
      if (event.button !== 0 || event.isPrimary === false || !brushable(chart)) return;
      var at = local(chart, event);
      var g = chart.geom;
      if (at.x < g.left || at.x > g.right || at.y < g.top || at.y > g.bottom) return;
      chart.drag = { from: at.x, to: at.x, id: event.pointerId, moved: false };
    });
    chart.plot.addEventListener('pointermove', function (event) {
      if (chart.drag) dragTo(chart, event);
      else if (chart.svg) pick(chart, event);
    });
    chart.plot.addEventListener('pointerup', function () { endDrag(chart, true); });
    chart.plot.addEventListener('pointercancel', function () { endDrag(chart, false); });
    chart.plot.addEventListener('pointerleave', function () { if (!chart.drag) hide(chart); });
    chart.plot.addEventListener('focus', function () {
      if (chart.plot.matches(':focus-visible')) show(chart, Math.max(0, chart.active), null);
    });
    chart.plot.addEventListener('blur', function () { hide(chart); });
    // A committed point click stops here, so a zoomable figure around the chart stays in place.
    chart.plot.addEventListener('click', function (event) {
      if (chart.dragged) {
        chart.dragged = false;
        event.preventDefault();
        return;
      }
      if (event.button !== 0 || !chart.svg || !chart.model.highlight) return;
      pick(chart, event);
      if (activate(chart)) event.preventDefault();
    });
    chart.plot.addEventListener('keydown', function (event) {
      if (keyRange(chart, event)) return;
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
      // Returns false, keeping the current chart, when the new data fails validation.
      update: function (next) {
        var model = normalize(next);
        if (!report(model, host, true)) return false;
        // Hidden series stay hidden by name, and a narrowed range stays while it still fits the data.
        Object.keys(chart.hidden).forEach(function (name) {
          if (model.series.length < 2 || !model.series.some(function (s) { return s.name === name; })) delete chart.hidden[name];
        });
        chart.range = keepRange(chart.range, chart.model, model);
        chart.model = model;
        chart.spec = next;
        chart.view = viewOf(model, chart.hidden, chart.range);
        watch(chart);
        host.classList.remove('is-line', 'is-bar', 'is-scatter');
        host.classList.add('is-' + chart.model.type);
        hide(chart);
        renderHead(chart);
        chart.toggle.hidden = !chart.model.table;
        chart.plot.setAttribute('aria-label', describe(chart.model));
        chart.ownTable = !!chart.sourceTable && next === chart.sourceSpec;
        if (chart.plot.hidden && !chart.model.table) {
          chart.table.textContent = '';
          setTable(chart, false);
        } else {
          fillTable(chart);
          if (!chart.plot.hidden) draw(chart);
        }
        return true;
      },
      model: function () { return chart.model; },
      // coords(clientX, clientY) reads the data position under a viewport point: { x, y, xText, yText, plot }, where
      // plot is the plot area in viewport pixels, or null outside the plot area or while the table shows.
      coords: function (cx, cy) {
        if (!chart.svg || chart.plot.hidden) return null;
        var box = chart.svg.getBoundingClientRect();
        var k = box.width && chart.width ? chart.width / box.width : 1;
        var hit = readAt(chart.view, chart.geom, (cx - box.left) * k, (cy - box.top) * k);
        if (!hit) return null;
        var g = chart.geom;
        hit.plot = { left: box.left + g.left / k, right: box.left + g.right / k, top: box.top + g.top / k, bottom: box.top + g.bottom / k };
        return hit;
      },
      // The spec last drawn; passing the first one back to update restores a chart read from a table to that table.
      spec: function () { return chart.spec; },
      // visible(name) says whether a series is shown; visible(name, on) shows or hides it.
      visible: function (name, on) {
        name = String(name);
        if (on === undefined) return !chart.hidden[name];
        if (!chart.model.series.some(function (s) { return s.name === name; })) return false;
        if (!on !== !!chart.hidden[name]) setVisible(chart, name, !!on);
        return true;
      },
      // range() is the narrowed [lo, hi] or null; range([lo, hi]) narrows the x axis and range(null) resets it.
      // Time axes take timestamps. Returns false, changing nothing, for a range it cannot show.
      range: function (next) {
        if (!arguments.length) return chart.range ? chart.range.slice() : null;
        var value = next;
        if (next !== null) {
          var read = chart.model.x.time ? toTime : toNumber;
          value = Array.isArray(next) && next.length === 2 ? clampRange(chart.model, read(next[0]), read(next[1])) : false;
          if (value === false) return false;
        } else if (!domain(chart.model)) {
          return false;
        }
        if (!sameRange(value, chart.range)) setRange(chart, value);
        return true;
      }
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
    ['brush', 'rescale', 'toggles'].forEach(function (name) {
      if (DocForm.data(host, name, null) !== null) spec[name] = DocForm.flag(host, name);
    });
    var refs = DocForm.data(host, 'reference-lines', null);
    if (refs !== null) {
      try {
        spec.referenceLines = JSON.parse(refs);
      } catch (e) {
        DocForm.warnOnce('chart-refs:' + e.message, 'Chart reference lines are not valid JSON: ' + e.message, host);
      }
    }
    var axisOf = function (axis) {
      if (typeof spec[axis] === 'string') spec[axis] = { label: spec[axis] };
      else if (!spec[axis] || typeof spec[axis] !== 'object') spec[axis] = {};
      return spec[axis];
    };
    ['x', 'y'].forEach(function (axis) {
      var label = DocForm.data(host, axis + '-label', null);
      if (label !== null) axisOf(axis).label = label;
      var kind = DocForm.data(host, axis + '-type', null);
      if (kind !== null) axisOf(axis).type = kind;
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
    var model = normalize(spec);
    if (!report(model, host)) return null;
    // Keyed source cells join the group too, so the table view shows the same selection.
    if (table && !script && model.highlight) {
      DocForm.all('[' + KEY + ']', table).forEach(function (cell) { cell.setAttribute(GROUP, model.highlight); });
    }
    return build(host, model, script ? null : table, spec);
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
    var model = normalize(spec || {});
    return report(model, host) ? build(host, model, null, spec || {}) : null;
  }

  chart.ticks = ticks;
  chart.linear = linear;
  chart.log = log;
  chart.logTicks = logTicks;
  chart.logTickFormat = logTickFormat;
  chart.validate = function (spec) { return normalize(spec).errors.slice(); };
  chart.nearest = nearest;
  chart.normalize = normalize;
  chart.fromTable = fromTable;
  chart.segments = segments;
  chart.spotsFor = spotsFor;
  chart.closest = closest;
  chart.extent = extent;
  chart.domain = domain;
  chart.clampRange = clampRange;
  chart.zoomRange = zoomRange;
  chart.panRange = panRange;
  chart.view = viewOf;
  chart.readAt = readAt;
  chart.format = format;
  chart.tickFormat = tickFormat;
  chart.barPath = barPath;
  chart.toNumber = toNumber;
  chart.toTime = toTime;
  chart.timeTicks = timeTicks;
  chart.timeTickFormat = timeTickFormat;
  chart.get = function (el) { var c = charts && charts.get(el); return c ? c.api : null; };
  DocForm.chart = chart;

  DocForm.register('chart', function () {
    DocForm.all('[data-df-chart]').forEach(function (host) {
      if (!charts.has(host)) fromMarkup(host);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
