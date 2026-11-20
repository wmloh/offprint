// SVG line, bar, scatter, and pie charts from a JSON script or table inside a [data-df-chart] element, or
// DocForm.chart(el, spec). Hovering or the arrow keys show a readout; the Table button swaps the plot for its data.
// Line charts with gaps: 'break' end a segment at explicit missing values; referenceLines mark labelled values.
// With a selection group, a click, Enter, or Space on a keyed point selects that key in DocForm.selection.
// x: { type: 'time' } on line and scatter charts places zoned timestamps by elapsed time and shows them in UTC.
// type: 'log' on either axis of a line or scatter chart plots positive values on a base-10 scale. A spec that fails
// validation is not drawn: the element keeps its own content, and an update keeps the last valid chart.
// Legend buttons hide and show series; brush: true narrows the x range of numeric and time axes by dragging or
// with + and -, and rescale: true fits the y axis to what is shown. Readouts and the table follow the view.
// Motion is on by default: keyed marks morph between drawings and play an entrance the first time the chart
// scrolls into view. motion: false or data-df-animate="false" turns it off; reduced motion and print skip it.
// Bar charts lie horizontal with orientation: 'horizontal' and stack with stack: 'stacked' or 'percent'.
// Add-on features register further chart types, scales, and legends with DocForm.chart.addon.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] chart.js needs core.js loaded before it.');
    return;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var TYPES = { line: true, bar: true, scatter: true, pie: true };
  var COLORS = 6;
  var CHAR = 7;
  var HIT = 24;
  var DRAG = 5;
  var MIN_SPAN = 1e-3;
  var EMPTY_SERIES = 'Every series is hidden. Choose one in the legend to show it.';
  var HIDDEN_PIE = 'Every slice is hidden. Choose one in the legend to show it.';
  var EMPTY_PIE = 'No visible slices have a positive value.';
  var EMPTY_RANGE = 'No readings in this range.';
  var EMPTY_FILTER = 'No readings match these filters.';
  var clips = 0;
  var GROUP = 'data-df-selection-group';
  var KEY = 'data-df-key';
  var charts = typeof WeakMap === 'function' ? new WeakMap() : null;
  var playbacks = new WeakMap();
  var xGroups = new Map();
  var BASES = TYPES;
  var addons = Object.create(null);
  var addonFeatures = new Set();
  var scales = Object.create(null);
  var legends = Object.create(null);

  function linearX(model) {
    return model && !model.errors.length && !model.categories && !model.x.time && !model.x.log;
  }

  function xGroupName(host) {
    var name = host.getAttribute('data-df-x-group');
    return name && DocForm._items.key(name);
  }

  function joinXGroup(chart) {
    var name = xGroupName(chart.box);
    if (!name) return null;
    var group = xGroups.get(name);
    if (!group) {
      group = { members: new Set(), x: null, owner: null, playback: null };
      xGroups.set(name, group);
      function snapshot() { return Object.freeze({ x: group.x }); }
      group.events = DocForm._component.signal('chart', null, snapshot, { action: 'x' });
      group.name = name;
      group.api = {
        snapshot: snapshot, subscribe: group.events.subscribe,
        set: function (x) { return Number.isFinite(x) && writeX(group, x, null, 'api'); },
        clear: function () { return writeX(group, null, null, 'api'); }
      };
    }
    group.members.add(chart.box);
    return group;
  }

  function writeX(group, x, owner, origin, exiting) {
    var limit = group.playback && group.playback.x;
    if (limit !== null && x !== null && x > limit) return false;
    return DocForm._component.transaction(function () {
      var limit = group.playback && group.playback.x;
      if (limit !== null && x !== null && x > limit) return false;
      if (exiting && group.owner !== owner) return true;
      var emit = commitX(group, x, owner, origin);
      if (emit) emit();
      return true;
    });
  }

  function commitX(group, x, owner, origin) {
    var previous = group.api.snapshot();
    if (group.owner && group.owner !== owner) hide(group.owner);
    group.owner = owner;
    if (x === group.x) return null;
    group.x = x;
    group.members.forEach(function (host) {
      var member = charts.get(host);
      if (member) paintCursor(member);
    });
    var current = group.api.snapshot();
    return function () { group.events.emit(current, previous, origin, group.name); };
  }

  function paintCursor(chart) {
    if (!chart.cursor) return;
    var x = chart.xGroup.x;
    var g = chart.geom;
    var px = x === null ? NaN : g.x(x);
    var visible = px >= g.left && px <= g.right && !chart.plot.hidden &&
      (chart.playhead === null || x <= chart.playhead);
    chart.cursor.setAttribute('display', visible ? 'inline' : 'none');
    if (visible) {
      chart.cursor.setAttribute('x1', px);
      chart.cursor.setAttribute('x2', px);
    }
  }

  function inspect(chart, x) {
    if (chart.xGroup && linearX(chart.model) && Number.isFinite(x)) writeX(chart.xGroup, x, chart, 'user');
  }

  function leaveInspection(chart, origin) {
    hide(chart);
    if (chart.xGroup && chart.xGroup.owner === chart) writeX(chart.xGroup, null, chart, origin || 'user', true);
  }

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
  function logErrors(model, spec, allowLogZeroY) {
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
        s.points.forEach(function (p) {
          if (!(allowLogZeroY && name === 'y' && p.y === 0)) values.push(p[name]);
        });
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
  function normalize(spec, baseOptions) {
    spec = spec || {};
    var def = typeof spec.type === 'string' && Object.hasOwn(addons, spec.type) ? addons[spec.type] : null;
    if (def) return normalizeAddon(spec, def);
    var needs = typeof spec.type === 'string' && !Object.hasOwn(TYPES, spec.type) ? addonFeature(spec.type) : null;
    if (needs) {
      var missing = normalize(Object.assign({}, spec, { type: 'line' }));
      missing.errors.push('Chart type ' + JSON.stringify(spec.type) + ' needs the "' + needs + '" feature; enable it in features.');
      return missing;
    }
    var type = Object.hasOwn(TYPES, spec.type) ? spec.type : 'line';
    if (type === 'pie') return normalizePie(spec);
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
    var errors = [];
    var series = list.map(function (s, si) {
      s = s || {};
      var entries = [];
      (Array.isArray(s.data) ? s.data : []).forEach(function (d, i) {
        var x, y, label, key, interval;
        if (Array.isArray(d)) { x = d[0]; y = d[1]; label = d[2]; }
        else if (d && typeof d === 'object') { x = d.x; y = d.y; label = d.label; key = d.key; }
        else { x = categories ? categories[i] : i; y = d; }
        var blank = y === null || (typeof y === 'string' && !y.trim());
        y = toNumber(y);
        if (d && d.interval !== undefined) {
          var at = 'Chart series ' + JSON.stringify(s.key || s.name || si + 1) + ', point ' + (i + 1);
          try {
            interval = DocForm._interval.normalize(d.interval, at);
            if (x == null || !isNum(y) || (time && toTime(x) === null)) {
              throw new Error(at + ' needs a valid x and estimate to supply an interval.');
            }
            if (yLog && interval.lower <= 0) throw new Error(at + ' needs positive interval bounds on a log y axis.');
          } catch (error) { errors.push(error.message); }
        }
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
        key = typeof key === 'string' ? key.trim() : '';
        var point = { x: x, y: y, label: label == null ? '' : String(label), key: key || null };
        if (interval) point.interval = interval;
        entries.push(point);
      });
      var name = s.name == null || s.name === '' ? (list.length > 1 ? 'Series ' + (si + 1) : '') : String(s.name);
      return {
        name: name,
        key: typeof s.key === 'string' && s.key.trim() || name || 'series-' + (si + 1),
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
    var bars = barOptions(spec, type, series, categories, errors);
    var model = {
      type: type,
      orientation: bars.orientation,
      stack: bars.stack,
      title: spec.title ? String(spec.title) : '',
      series: series,
      categories: categorical ? categories : null,
      markedCategories: categorical && Array.isArray(spec.markedCategories) ? new Set(spec.markedCategories.map(String)) : null,
      gaps: breaks,
      referenceLines: refs,
      selectionMode: 'both',
      selectionGroup: typeof spec.selectionGroup === 'string' && spec.selectionGroup.trim() ? spec.selectionGroup.trim() : null,
      table: spec.table !== false,
      toggles: spec.toggles === true && series.length > 1,
      brush: !!spec.brush && !categorical,
      rescale: !!spec.rescale,
      motion: spec.motion !== false,
      x: xAxis,
      y: axisSpec(spec.y, false, yLog),
      height: isNum(spec.height) && spec.height > 80 ? spec.height : bars.height
    };
    if (model.stack === 'percent' && (model.y.min !== null || model.y.max !== null)) {
      DocForm.warnOnce('chart-percent-bounds', 'Percent stacked bars always span 0–100%; y min and max are ignored.');
      model.y.min = model.y.max = null;
    }
    model.errors = errors.concat(logErrors(model, spec, baseOptions?.allowLogZeroY));
    if (new Set(series.map(function (item) { return item.key; })).size !== series.length) {
      model.errors.push('Each chart series needs a unique key or a unique name.');
    }
    return model;
  }

  // Bar layout options: orientation 'vertical' (default) or 'horizontal', and stack 'stacked' or 'percent' (null,
  // false, or 'none' keep bars side by side). Horizontal bars without a set height get one row per category.
  function barOptions(spec, type, series, categories, errors) {
    var out = { orientation: 'vertical', stack: null, height: 260 };
    var orientation = spec.orientation == null ? 'vertical' : spec.orientation;
    var stack = spec.stack == null || spec.stack === false || spec.stack === 'none' ? null : spec.stack;
    if (type !== 'bar') {
      if (orientation !== 'vertical' || stack) {
        DocForm.warnOnce('chart-bar-layout', 'Orientation and stacking apply to bar charts; other chart types ignore them.');
      }
      return out;
    }
    if (orientation === 'horizontal') out.orientation = orientation;
    else if (orientation !== 'vertical') {
      errors.push('Bar orientation must be "vertical" or "horizontal", not ' + JSON.stringify(orientation) + '.');
    }
    if (stack === 'stacked' || stack === 'percent') out.stack = stack;
    else if (stack) errors.push('Bar stack must be "stacked", "percent", or "none", not ' + JSON.stringify(stack) + '.');
    if (out.stack) {
      series.forEach(function (s) {
        s.points.forEach(function (p) {
          var at = 'series ' + JSON.stringify(s.name || s.key) + ' at ' + JSON.stringify(String(p.x));
          if (out.stack === 'percent' && p.y < 0) {
            errors.push('Percent stacked bars need values of zero or more; ' + at + ' is ' + p.y + '.');
          }
          if (p.interval) errors.push('Stacked bars cannot show intervals; remove the interval from ' + at + '.');
        });
      });
    }
    if (out.orientation === 'horizontal') {
      var rows = Math.max(1, (categories || []).length);
      var row = out.stack || series.length < 2 ? 28 : Math.min(series.length, COLORS) * 10 + 12;
      var labels = (axisSpec(spec.x).label ? 20 : 0) + (axisSpec(spec.y).label ? 20 : 0);
      out.height = Math.max(120, 36 + labels + rows * row);
    }
    return out;
  }

  // Where each bar of a stacked chart runs, in value units: positive values stack up from zero and negative ones
  // down, in series order; percent stacks scale each category's total to 100. The model's series are those shown.
  // bars maps each point to { from, to, share, outer }, where outer marks the last bar in its direction.
  function stackLayout(model) {
    var bars = new Map();
    var totals = new Map();
    var percent = model.stack === 'percent';
    var lo = 0;
    var hi = 0;
    model.series.forEach(function (s) {
      s.points.forEach(function (p) {
        var at = String(p.x);
        var total = totals.get(at) || { sum: 0, pos: 0, neg: 0, up: 0, down: 0, last: [null, null] };
        total.sum += p.y;
        if (p.y < 0) total.neg += p.y;
        else total.pos += p.y;
        totals.set(at, total);
      });
    });
    model.series.forEach(function (s) {
      s.points.forEach(function (p) {
        var total = totals.get(String(p.x));
        var value = percent ? (total.pos ? p.y / total.pos * 100 : 0) : p.y;
        var down = value < 0;
        var from = down ? total.down : total.up;
        var to = from + value;
        if (down) total.down = to;
        else total.up = to;
        var bar = { from: from, to: to, share: percent ? (total.pos ? p.y / total.pos : null) : null, outer: false };
        if (value) total.last[down ? 1 : 0] = bar;
        bars.set(p, bar);
        lo = Math.min(lo, to);
        hi = Math.max(hi, to);
      });
    });
    totals.forEach(function (total) {
      total.last.forEach(function (bar) { if (bar) bar.outer = true; });
      delete total.up;
      delete total.down;
      delete total.last;
    });
    return { bars: bars, totals: totals, lo: lo, hi: percent ? 100 : hi };
  }

  // A category label split into lines of at most `width` characters, breaking long words; past `max` lines the
  // last one ends in an ellipsis and cut is true.
  function wrapLabel(text, width, max) {
    width = Math.max(2, width);
    var lines = [];
    var line = '';
    String(text).trim().split(/\s+/).filter(Boolean).forEach(function (word) {
      if (line && line.length + 1 + word.length <= width) {
        line += ' ' + word;
        return;
      }
      if (line) lines.push(line);
      while (word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      line = word;
    });
    if (line || !lines.length) lines.push(line);
    var cut = lines.length > max;
    if (cut) {
      lines = lines.slice(0, max);
      var last = lines[max - 1];
      lines[max - 1] = (last.length >= width ? last.slice(0, width - 1) : last) + '…';
    }
    return { lines: lines, cut: cut };
  }

  function normalizePie(spec) {
    var errors = [];
    if (!Array.isArray(spec.data)) errors.push('Pie charts need a data array of slices.');
    var series = (Array.isArray(spec.data) ? spec.data : []).map(function (slice, i) {
      slice = slice || {};
      var label = typeof slice.label === 'string' ? slice.label.trim() : '';
      var value = toNumber(slice.value);
      if (!label || !isNum(value) || value < 0) {
        errors.push('Pie slice ' + (i + 1) + ' needs a label and a nonnegative finite value.');
      }
      return { name: label, key: slice.key, role: slice.role, color: slice.color,
        data: [{ x: label, y: value, key: slice.key }] };
    });
    var valueAxis = axisSpec(spec.y, false, false);
    var model = normalize({ type: 'bar', series: series, y: { label: valueAxis.label, unit: valueAxis.unit, digits: valueAxis.digits },
      title: spec.title, height: spec.height, toggles: spec.toggles, table: spec.table, selectionGroup: spec.selectionGroup,
      motion: spec.motion });
    model.type = 'pie';
    model.toggles = spec.toggles === true && series.length > 0;
    model.errors = errors.concat(model.errors.map(function (error) {
      return error.replace('chart series', 'pie slice');
    }));
    return model;
  }

  // An add-on can translate its input before base normalization and adjust the resulting model.
  function normalizeAddon(spec, def) {
    var prepared = spec;
    var issue = null;
    try { if (def.prepare) prepared = def.prepare(spec, kit); }
    catch (error) {
      issue = String(error && error.message || error);
      prepared = {};
    }
    var model = normalize(Object.assign({}, prepared, { type: def.base }), def);
    model.addon = spec.type;
    if (issue) model.errors.push(issue);
    else if (def.normalize) {
      try { model = def.normalize(model, spec, kit, prepared) || model; }
      catch (error) { model.errors.push(String(error && error.message || error)); }
    }
    return model;
  }

  // The loader feature that provides a chart type, when the type belongs to an add-on that is not registered.
  function addonFeature(type) {
    var boot = DocForm._boot;
    return boot && typeof boot.chartFeature === 'function' ? boot.chartFeature(type) : null;
  }

  // Chart add-on features call DocForm.chart.addon(id, parts) as their script loads. parts.types maps new type names
  // to definitions drawn on a core base type; parts.scales and parts.legends add named scale factories and legend
  // renderers that any chart type can look up. Nothing is registered unless every part is valid.
  var HOOKS = ['prepare', 'normalize', 'extent', 'draw', 'categoryMarks', 'continuousMarks', 'pick', 'readout', 'table', 'describe',
    'keys', 'coords', 'mapFields', 'mapRecords', 'fromTable'];

  function addon(feature, parts) {
    var problem = addonProblem(feature, parts);
    if (problem) {
      DocForm.warnOnce('chart-addon:' + feature + ':' + problem, 'Chart add-on ' + JSON.stringify(feature) + ' was not registered: ' + problem);
      return false;
    }
    var types = parts.types || {};
    Object.keys(types).forEach(function (name) { addons[name] = Object.assign({ feature: feature }, types[name]); });
    Object.keys(parts.scales || {}).forEach(function (name) { scales[name] = parts.scales[name]; });
    Object.keys(parts.legends || {}).forEach(function (name) { legends[name] = parts.legends[name]; });
    addonFeatures.add(feature);
    return true;
  }

  function addonProblem(feature, parts) {
    var plain = function (value) { return !!value && typeof value === 'object' && !Array.isArray(value); };
    if (typeof feature !== 'string' || !/^[a-z][a-z0-9-]*$/.test(feature) || !plain(parts)) {
      return 'use a lowercase feature ID and an object of types, scales, and legends.';
    }
    if (addonFeatures.has(feature)) return 'it is already registered.';
    var groups = ['types', 'scales', 'legends'];
    var bad = groups.find(function (group) { return parts[group] !== undefined && !plain(parts[group]); });
    if (bad) return 'parts.' + bad + ' must be an object.';
    var types = parts.types || {};
    var newLegends = parts.legends || {};
    for (var name of Object.keys(types)) {
      var def = types[name];
      var owner = addonFeature(name);
      if (!/^[a-z][a-z0-9-]*$/.test(name) || Object.hasOwn(TYPES, name) || Object.hasOwn(addons, name)) {
        return 'chart type ' + JSON.stringify(name) + ' is invalid or taken.';
      }
      if (owner && owner !== feature) return 'chart type ' + JSON.stringify(name) + ' belongs to "' + owner + '".';
      if (!plain(def) || !Object.hasOwn(BASES, def.base)) {
        return 'chart type ' + JSON.stringify(name) + ' needs a base of line, bar, scatter, or pie.';
      }
      var hook = HOOKS.find(function (h) { return def[h] !== undefined && typeof def[h] !== 'function'; });
      if (hook) return 'chart type ' + JSON.stringify(name) + ' has a ' + hook + ' that is not a function.';
      if (def.categoryMarks && def.base !== 'bar') {
        return 'chart type ' + JSON.stringify(name) + ' needs a bar base to draw category marks.';
      }
      if (def.continuousMarks && def.base !== 'scatter') {
        return 'chart type ' + JSON.stringify(name) + ' needs a scatter base to draw continuous marks.';
      }
      if (def.legend !== undefined && !Object.hasOwn(legends, def.legend) && !Object.hasOwn(newLegends, def.legend)) {
        return 'chart type ' + JSON.stringify(name) + ' names an unknown legend ' + JSON.stringify(def.legend) + '.';
      }
    }
    for (var group of ['scales', 'legends']) {
      var taken = group === 'scales' ? scales : legends;
      var items = parts[group] || {};
      var clash = Object.keys(items).find(function (item) { return Object.hasOwn(taken, item) || typeof items[item] !== 'function'; });
      if (clash) return group.slice(0, -1) + ' ' + JSON.stringify(clash) + ' is taken or not a function.';
    }
    return null;
  }

  function addonOf(model) {
    return model && model.addon && Object.hasOwn(addons, model.addon) ? addons[model.addon] : null;
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
    if (type === 'pie') {
      return { type: type, y: { label: head[1] || '' }, data: body.map(function (row, i) {
        return { label: row[0] == null ? '' : String(row[0]), value: row[1], key: keys && keys[i + 1] && keys[i + 1][1] };
      }) };
    }
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

  // Scatter charts, categorical add-on marks, and charts with a selection group get a spot per point.
  // markOf maps a point to its drawn mark as { el, px }, if any.
  function spotsFor(model, xAt, y, markOf) {
    var spots = [];
    var cats = model.categories;
    var def = addonOf(model);
    var xs = model.type === 'scatter' ? null : cats || extent(model).xs.slice().sort(function (a, b) { return a - b; })
      .filter(function (x, i, list) { return !i || x !== list[i - 1]; });
    if (model.type === 'scatter') {
      model.series.forEach(function (s) {
        s.points.forEach(function (p) {
          var mark = markOf(p) || {};
          if (def?.continuousMarks && !mark.el) return;
          spots.push({ px: mark.px ?? xAt(p.x), py: mark.py ?? y(p.y), s: s, p: p, el: mark.el });
        });
      });
    } else if (model.selectionGroup || def?.categoryMarks) {
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
          spots.push({ px: mark.px == null ? cx : mark.px, cx: cx, py: mark.py == null ? y(f.p.y) : mark.py, x: x, s: f.s,
            p: f.p, el: mark.el });
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
  // Horizontal bars read along y first.
  function closest(spots, px, py, horizontal) {
    if (horizontal) return closest(spots.map(function (s) { return { px: s.py, py: s.px }; }), py, px);
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
    var yLo = Infinity;
    var yHi = -Infinity;
    var count = 0;
    var xs = [];
    model.series.forEach(function (s) {
      s.points.forEach(function (p) {
        count++;
        yLo = Math.min(yLo, p.y, p.interval ? p.interval.lower : p.y);
        yHi = Math.max(yHi, p.y, p.interval ? p.interval.upper : p.y);
        if (!model.categories) xs.push(p.x);
      });
      if (!model.categories && s.missing) xs.push.apply(xs, s.missing);
    });
    if (!count) { yLo = 0; yHi = 1; }
    if (model.type === 'bar' && model.stack && count) {
      var stacked = stackLayout(model);
      yLo = stacked.lo;
      yHi = stacked.hi;
    }
    if (model.type === 'bar' && model.zeroBaseline !== false) {
      yLo = Math.min(yLo, 0);
      yHi = Math.max(yHi, 0);
    }
    var span = { yLo: yLo, yHi: yHi, xs: xs, count: count };
    var def = addonOf(model);
    if (def?.extent) def.extent(model, span);
    if (model.y.min !== null) span.yLo = model.y.min;
    if (model.y.max !== null) span.yHi = model.y.max;
    return span;
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
    var series = model.series.filter(function (s) { return !off[s.key]; }).map(function (s) {
      var points = range ? s.points.filter(function (p) {
        return p.xSpan ? p.xSpan[0] < range[1] && p.xSpan[1] > range[0] : inside(p.x);
      }) : s.points;
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
    var def = addonOf(model);
    if (!geom || !(geom.y || geom.value || def?.coords) ||
      !(px >= geom.left && px <= geom.right && py >= geom.top && py <= geom.bottom)) return null;
    if (def?.coords) return def.coords(model, geom, px, py, kit);
    var fine = function (scale, p, log) {
      var v = scale.invert(p);
      var step = Math.abs(scale.invert(p + 1) - v);
      if (!(step > 0) || !isFinite(v)) return v;
      if (log) return +v.toPrecision(Math.max(1, Math.min(15, Math.ceil(Math.log10(Math.abs(v) / step)) + 1)));
      var d = Math.max(0, Math.min(12, -Math.floor(Math.log10(step))));
      return +v.toFixed(d);
    };
    var x;
    if (geom.horizontal) {
      var rows = model.categories;
      var row = Math.floor((py - geom.top) / Math.max(1e-9, geom.band));
      x = rows[Math.max(0, Math.min(rows.length - 1, row))];
      var value = fine(geom.value, px, false);
      return { x: x, y: value, xText: String(x), yText: valueText(model, value) };
    }
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
      yText: valueText(model, y)
    };
  }

  // Positions on the value axis of a percent stacked chart are shares of each category, not values.
  function valueText(model, v) {
    return model.stack === 'percent' ? format(v) + '%' : format(v, model.y);
  }

  function refValue(model, r) {
    return r.axis === 'x' && model.categories ? r.value : format(r.value, model[r.axis]);
  }

  function refText(model, r) {
    var value = refValue(model, r);
    return r.label ? r.label + ' (' + value + ')' : value;
  }

  // A bar w wide from x along its value axis, from baseline y0 to y1, with rounded corners only at the data end.
  // Horizontal bars swap the axes: x and w run down the plot and y0 and y1 across it. Both orientations share one
  // path shape, so a bar can morph from one to the other.
  function barPath(x, w, y0, y1, r, horizontal) {
    var pt = horizontal ? function (a, b) { return b + ',' + a; } : function (a, b) { return a + ',' + b; };
    r = Math.max(0, Math.min(r, w / 2, Math.abs(y1 - y0)));
    var edge = y1 <= y0 ? y1 + r : y1 - r;
    return 'M' + pt(x, y0) + 'L' + pt(x, edge) + 'Q' + pt(x, y1) + ' ' + pt(x + r, y1) + 'L' + pt(x + w - r, y1) +
      'Q' + pt(x + w, y1) + ' ' + pt(x + w, edge) + 'L' + pt(x + w, y0) + 'Z';
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

  function intervalReadout(parent, point, axis) {
    if (!point.interval) return;
    html('span', 'df-chart-interval-text', parent, DocForm._interval.text(point.interval, function (value) {
      return format(value, axis);
    }));
  }

  // An interval at position x across the value axis y; horizontal whiskers run across the plot instead.
  function whisker(parent, interval, x, y, horizontal, cap) {
    var lower = y(interval.lower);
    var upper = y(interval.upper);
    var w = cap === undefined ? 3 : cap;
    var pt = horizontal ? function (a, b) { return b + ',' + a; } : function (a, b) { return a + ',' + b; };
    return svg('path', { class: 'df-chart-whisker',
      d: 'M' + pt(x, lower) + 'L' + pt(x, upper) +
        'M' + pt(x - w, lower) + 'L' + pt(x + w, lower) +
        'M' + pt(x - w, upper) + 'L' + pt(x + w, upper)
    }, parent);
  }

  // Bars of one series: side by side within each category band, or end to end when stacked. pos gives a category's
  // centre across the bands and val a value's position on the value axis, in either orientation.
  function barMarks(ctx, s, si, g) {
    var groupW = ctx.count * ctx.thick + (ctx.count - 1) * ctx.gap;
    s.points.forEach(function (p) {
      var seg = ctx.layout && ctx.layout.bars.get(p);
      var c0 = ctx.pos(p.x) + (seg ? -ctx.thick / 2 : si * (ctx.thick + ctx.gap) - groupW / 2);
      var a = seg ? ctx.val(seg.from) : ctx.base;
      var b = ctx.val(seg ? seg.to : p.y);
      var r = !seg || seg.outer ? 4 : 0;
      var bar = svg('path', { d: barPath(c0, ctx.thick, a, b, r, ctx.horizontal), class: 'df-chart-bar' }, g);
      bar.setAttribute('data-df-x', p.x);
      var mid = c0 + ctx.thick / 2;
      var end = seg ? (a + b) / 2 : b;
      ctx.place(p, bar, ctx.horizontal ? end : mid, ctx.horizontal ? mid : end);
      var order = ctx.orderAt(mid);
      addMark(ctx.markMap, markId(s.key, 'bar', p), { el: bar, order: order,
        from: { d: barPath(c0, ctx.thick, ctx.base, ctx.base, r, ctx.horizontal) } });
      if (p.interval) {
        var cap = whisker(g, p.interval, mid, ctx.val, ctx.horizontal);
        cap.setAttribute('clip-path', 'url(#' + ctx.clip + '-interval)');
        addMark(ctx.markMap, markId(s.key, 'whisker', p), { el: cap, fade: true, order: order });
      }
    });
  }

  function revealInOrder(entries, show, hide) {
    var count = 0;
    return function (x) {
      while (count && entries[count - 1].x > x) hide(entries[--count]);
      while (count < entries.length && entries[count].x <= x) show(entries[count++]);
    };
  }

  function drawPlayhead(chart, frame, entries, spots, clips) {
    var g = chart.geom;
    var line = svg('line', { y1: g.top, y2: g.bottom, class: 'df-chart-playhead' }, frame);
    var checkpoint = playbackFor(chart).checkpoint;
    var marker = svg('circle', { cy: g.top, r: 4, class: 'df-chart-checkpoint', 'aria-hidden': 'true' }, frame);
    var revealMarks = revealInOrder(entries.sort(function (a, b) { return a.x - b.x; }), function (mark) {
      mark.el.removeAttribute('display');
      tagKey(chart.model, mark.el, mark.point);
    }, function (mark) {
      mark.el.setAttribute('display', 'none');
      [GROUP, KEY, 'data-df-selection-active'].forEach(function (attr) { mark.el.removeAttribute(attr); });
    });
    var revealSpots = revealInOrder(spots, function (spot) { chart.spots.push(spot); }, function () { chart.spots.pop(); });
    return function (x) {
      var px = g.x(x);
      var width = Math.max(0, Math.min(g.right, px) - g.left);
      clips.forEach(function (clip) { clip.setAttribute('width', width); });
      var inPlot = px >= g.left && px <= g.right;
      line.setAttribute('display', inPlot ? 'inline' : 'none');
      line.setAttribute('x1', px);
      line.setAttribute('x2', px);
      marker.setAttribute('display', inPlot && checkpoint() ? 'inline' : 'none');
      marker.setAttribute('cx', px);
      revealMarks(x);
      revealSpots(x);
      if (chart.active >= chart.spots.length) hide(chart);
    };
  }

  // ---- Motion ----
  // Marks are entries in a Map keyed by markId: { el, arc, shape, from, draw, fade, order, whole }. Between two
  // drawings, entries with the same key morph from what is displayed; new ones fade in and departing ones fade out.
  var TWEEN = 240;
  var ENTRANCE = 700;
  var STAGGER = 0.3;
  var GEOMETRY = ['d', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'fill-opacity'];
  var svgNumber = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  var moving = new Set();
  var awaiting = new Set();
  var entrances = null;

  function mix(from, to, t) { return from + (to - from) * t; }

  function ease(p) { return 1 - Math.pow(1 - p, 3); }

  // [r, g, b, a] from #rgb, #rrggbb, rgb(), or rgba() text, else null.
  function parseColor(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim().toLowerCase();
    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
    if (hex) {
      var h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
      return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }).concat([1]);
    }
    var fn = /^rgba?\(([^)]*)\)$/.exec(t);
    if (!fn) return null;
    var parts = fn[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    var out = parts.map(function (p, i) {
      var v = parseFloat(p);
      if (!isFinite(v)) return NaN;
      return /%$/.test(p) ? (i < 3 ? v * 2.55 : v / 100) : v;
    });
    if (out.length === 3) out.push(1);
    return out.every(isFinite) ? out : null;
  }

  function colorText(c) {
    return 'rgba(' + c.slice(0, 3).map(function (v) { return Math.round(Math.max(0, Math.min(255, v))); }).join(', ') +
      ', ' + +Math.max(0, Math.min(1, c[3])).toFixed(3) + ')';
  }

  // A function of t in [0, 1] from one attribute or colour value to another: numbers inside matching text move and
  // colours blend. null when the values are equal or cannot be blended, such as paths with different commands.
  function between(from, to) {
    if (from == null || to == null) return null;
    from = String(from);
    to = String(to);
    if (from === to) return null;
    var a = parseColor(from);
    var b = a && parseColor(to);
    if (a && b) return function (t) { return t >= 1 ? to : colorText(a.map(function (v, i) { return mix(v, b[i], t); })); };
    if (from.replace(svgNumber, '#') !== to.replace(svgNumber, '#')) return null;
    var start = (from.match(svgNumber) || []).map(Number);
    var end = (to.match(svgNumber) || []).map(Number);
    if (!start.length) return null;
    return function (t) {
      if (t >= 1) return to;
      var i = 0;
      return to.replace(svgNumber, function () {
        var v = mix(start[i], end[i], t);
        i++;
        return String(+v.toFixed(3));
      });
    };
  }

  // A mark's identity across drawings: its series, its kind, and its point key, else its x value.
  function markId(series, kind, point) {
    return String(series) + '\u0001' + (kind || '') + '\u0001' +
      (point ? (point.key ? 'k:' + point.key : 'x:' + String(point.x)) : '');
  }

  // Adds an entry under key, numbering repeats so marks that share a key, such as scatter points at one x, stay apart.
  function addMark(map, key, entry) {
    var id = key;
    for (var n = 2; map.has(id); n++) id = key + '#' + n;
    map.set(id, entry);
    return entry;
  }

  // Pairs entries by key: kept ones change in place, entering ones are new, and leaving ones are gone.
  function matchMarks(previous, current) {
    var out = { kept: [], entering: [], leaving: [] };
    current.forEach(function (entry, key) { out[previous.has(key) ? 'kept' : 'entering'].push(key); });
    previous.forEach(function (entry, key) { if (!current.has(key)) out.leaving.push(key); });
    return out;
  }

  function media(query) {
    try { return !!(root.matchMedia && root.matchMedia(query).matches); } catch (error) { return false; }
  }

  function motionEnv(chart) {
    return {
      reduced: media('(prefers-reduced-motion: reduce)'),
      print: media('print'),
      zoomed: !!(chart && chart.box.closest && chart.box.closest('.df-zoom')),
      frames: typeof root.requestAnimationFrame === 'function' && typeof root.cancelAnimationFrame === 'function'
    };
  }

  // Motion plays only when the chart allows it, the reader has not asked for reduced motion, the page is not being
  // printed, the chart is not in the zoom view (whose lens clones it), and the browser can schedule frames.
  function motionAllowed(model, env) {
    return !!model && model.motion !== false && !env.reduced && !env.print && !env.zoomed && !!env.frames;
  }

  // data-df-animate on the chart (true, false, or null when absent) wins, then the spec's motion, then the last
  // configured chart option layer that sets it. Motion is on by default.
  function resolveMotion(attribute, spec, layers) {
    if (typeof attribute === 'boolean') return attribute;
    if (spec && typeof spec.motion === 'boolean') return spec.motion;
    for (var i = (layers || []).length - 1; i >= 0; i--) {
      if (layers[i] && typeof layers[i].motion === 'boolean') return layers[i].motion;
    }
    return true;
  }

  function opacityOf(entry) {
    var own = entry.el.getAttribute('opacity');
    var wrap = entry.wrap ? entry.wrap.getAttribute('opacity') : null;
    return (own === null ? 1 : +own) * (wrap === null ? 1 : +wrap);
  }

  function fade(el, from, to) {
    return function (t) {
      if (t >= 1 && to === 1) el.removeAttribute('opacity');
      else el.setAttribute('opacity', mix(from, to, t));
    };
  }

  function arcTo(entry, start, end) {
    return function (t) { entry.shape(mix(start[0], end[0], t), mix(start[1], end[1], t)); };
  }

  // Moves every geometry attribute of b from a's values, in b and its children alike; false when a path changes
  // its commands, so the two marks cross-fade instead.
  function morph(a, b, changes) {
    if (a.tagName !== b.tagName) return false;
    var d = [a.getAttribute('d'), b.getAttribute('d')];
    if (d[0] !== null && d[1] !== null && d[0] !== d[1] && !between(d[0], d[1])) return false;
    GEOMETRY.forEach(function (name) {
      var f = between(a.getAttribute(name), b.getAttribute(name));
      if (f) changes.push({ run: function (t) { b.setAttribute(name, f(t)); } });
    });
    if (a.children.length === b.children.length) {
      Array.from(b.children).forEach(function (child, i) { morph(a.children[i], child, changes); });
    }
    return true;
  }

  function paintKey(el) {
    var g = el && el.parentNode;
    if (!g || !g.getAttribute) return '';
    return [g.getAttribute('data-df-role'), g.getAttribute('data-df-color'), g.getAttribute('style')].join('|');
  }

  function tintOf(entry) {
    return entry.whole ? entry.el.firstChild : entry.el;
  }

  function computedPaint(el) {
    if (!el || typeof root.getComputedStyle !== 'function') return null;
    var style = root.getComputedStyle(el);
    return { fill: style.fill, stroke: style.stroke };
  }

  // Changes from the displayed marks to the new ones. Departing marks move into the new layer, wrapped in a copy of
  // their series group so they keep its colour, and stay in `current` until they finish fading.
  function plan(previous, current, layer) {
    var changes = [];
    var leaving = [];
    var tints = [];
    function exit(before, key) {
      var target = before.el;
      var wrap = null;
      if (!before.whole && before.el.parentNode && before.el.parentNode.cloneNode) {
        wrap = before.el.parentNode.cloneNode(false);
        wrap.appendChild(before.el);
        target = wrap;
      }
      var from = opacityOf(before);
      before.el.removeAttribute('opacity');
      if (layer) layer.insertBefore(target, layer.firstChild);
      target.setAttribute('pointer-events', 'none');
      [target].concat(DocForm.all('[' + GROUP + '][' + KEY + ']', target)).forEach(function (el) {
        el.removeAttribute(GROUP);
        el.removeAttribute(KEY);
      });
      var entry = Object.assign({}, before, { wrap: wrap, leaving: true });
      current.set(key, entry);
      leaving.push(key);
      if (before.arc) changes.push({ run: arcTo(before, before.arc.slice(), [before.arc[0], before.arc[0]]) });
      changes.push({ run: fade(target, from, 0) });
    }
    var match = matchMarks(previous, current);
    match.kept.forEach(function (key) {
      var before = previous.get(key);
      var next = current.get(key);
      var from = opacityOf(before);
      if (before.arc && next.arc) changes.push({ run: arcTo(next, before.arc.slice(), next.arc.slice()) });
      else if (before.arc || next.arc || !morph(before.el, next.el, changes)) {
        if (!before.leaving) exit(before, key + '\u0002');
        from = 0;
      }
      if (from !== 1) changes.push({ run: fade(next.el, from, 1) });
      // An entry's own paint name, when given, stands in for its series colour.
      var repaint = next.paint !== undefined || before.paint !== undefined ? before.paint !== next.paint :
        paintKey(tintOf(before)) !== paintKey(tintOf(next));
      if (from && repaint) {
        tints.push({ from: computedPaint(tintOf(before)), el: tintOf(next) });
      }
    });
    match.entering.forEach(function (key) {
      var next = current.get(key);
      if (next.arc) changes.push({ run: arcTo(next, [next.arc[0], next.arc[0]], next.arc.slice()) });
      changes.push({ run: fade(next.el, 0, 1) });
    });
    match.leaving.forEach(function (key) { exit(previous.get(key), key); });
    return { changes: changes, leaving: leaving, tints: tints };
  }

  // Colours are read once both drawings are in the document, so blends start from the colour on screen.
  function tintChanges(tints) {
    var changes = [];
    tints.forEach(function (tint) {
      var to = computedPaint(tint.el);
      if (!tint.from || !to) return;
      ['fill', 'stroke'].forEach(function (prop) {
        var f = between(tint.from[prop], to[prop]);
        if (f) changes.push({ run: function (t) {
          if (t >= 1) tint.el.style.removeProperty(prop);
          else tint.el.style.setProperty(prop, f(t));
        } });
      });
    });
    return changes;
  }

  // Bars grow from their baseline, lines draw from their start, dots and slices pop in, and the rest fades in.
  // Each mark's order in [0, 1] staggers it across the entrance.
  function entranceChanges(current) {
    var changes = [];
    current.forEach(function (entry) {
      var order = entry.order || 0;
      if (entry.arc) {
        var arc = entry.arc.slice();
        changes.push({ order: 0, run: arcTo(entry, [0, 0], arc) });
        return;
      }
      Object.keys(entry.from || {}).forEach(function (name) {
        var f = between(entry.from[name], entry.el.getAttribute(name));
        if (f) changes.push({ order: order, run: function (t) { entry.el.setAttribute(name, f(t)); } });
      });
      if (entry.draw) changes.push({ order: order, run: function (t) {
        if (t >= 1) {
          ['pathLength', 'stroke-dasharray', 'stroke-dashoffset'].forEach(function (name) { entry.el.removeAttribute(name); });
          return;
        }
        entry.el.setAttribute('pathLength', '1');
        entry.el.setAttribute('stroke-dasharray', '1 1');
        entry.el.setAttribute('stroke-dashoffset', String(1 - t));
      } });
      if (entry.fade) changes.push({ order: order, run: fade(entry.el, 0, 1) });
    });
    return changes;
  }

  function stopMotion(chart) {
    if (chart.motion !== undefined) root.cancelAnimationFrame(chart.motion);
    chart.motion = undefined;
    chart.finishMotion = null;
    moving.delete(chart);
  }

  // Runs changes over duration ms with an ease-out curve, then calls done.
  function play(chart, changes, duration, done) {
    if (!changes.length) {
      if (done) done();
      return;
    }
    function frame(progress) {
      changes.forEach(function (change) {
        var local = change.order === undefined ? progress :
          Math.max(0, Math.min(1, (progress - change.order * STAGGER) / (1 - STAGGER)));
        change.run(local >= 1 ? 1 : ease(local));
      });
    }
    function finish() {
      stopMotion(chart);
      frame(1);
      if (done) done();
    }
    frame(0);
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var progress = Math.min(1, (now - start) / duration);
      if (progress >= 1) return finish();
      frame(progress);
      chart.motion = root.requestAnimationFrame(step);
    }
    chart.finishMotion = finish;
    moving.add(chart);
    chart.motion = root.requestAnimationFrame(step);
  }

  function mountFrame(chart, frame, markMap, previous) {
    var motion = previous ? plan(previous, markMap, chart.marks) : null;
    chart.markMap = markMap;
    if (chart.svg) chart.plot.replaceChild(frame, chart.svg);
    else chart.plot.insertBefore(frame, chart.plot.firstChild);
    chart.svg = frame;
    if (motion) {
      play(chart, motion.changes.concat(tintChanges(motion.tints)), TWEEN, function () {
        motion.leaving.forEach(function (key) {
          var entry = markMap.get(key);
          if (!entry || !entry.leaving) return;
          (entry.wrap || entry.el).remove();
          markMap.delete(key);
        });
      });
    }
    if (chart.entrance) {
      if (!motionAllowed(chart.model, motionEnv(chart))) cancelEntrance(chart);
      else if (chart.seen) playEntrance(chart);
    }
  }

  // The first drawing waits, with its marks hidden, until the chart scrolls into view or above it, then plays its
  // entrance once. Without IntersectionObserver or motion, charts draw in place.
  function awaitEntrance(chart) {
    if (typeof root.IntersectionObserver !== 'function' || !motionAllowed(chart.model, motionEnv(chart))) return;
    if (!entrances) {
      entrances = new root.IntersectionObserver(function (list) {
        list.forEach(function (item) {
          if (!item.isIntersecting && !(item.boundingClientRect && item.boundingClientRect.bottom <= 0)) return;
          entrances.unobserve(item.target);
          var seen = charts.get(item.target);
          if (!seen) return;
          seen.seen = true;
          playEntrance(seen);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    }
    chart.entrance = true;
    chart.seen = false;
    awaiting.add(chart);
    chart.box.classList.add('df-chart-await');
    entrances.observe(chart.box);
  }

  function cancelEntrance(chart) {
    chart.entrance = false;
    awaiting.delete(chart);
    chart.box.classList.remove('df-chart-await');
    if (entrances) entrances.unobserve(chart.box);
  }

  function playEntrance(chart) {
    if (!chart.entrance || !chart.svg) return;
    var go = motionAllowed(chart.model, motionEnv(chart)) && chart.playhead === null && chart.motion === undefined;
    cancelEntrance(chart);
    if (go) play(chart, entranceChanges(chart.markMap), ENTRANCE);
  }

  // Printing and opening the zoom view show every chart as drawn: waiting charts appear and motion jumps to its end.
  function settleMotion() {
    Array.from(awaiting).forEach(cancelEntrance);
    Array.from(moving).forEach(function (chart) { if (chart.finishMotion) chart.finishMotion(); });
  }

  if (typeof root.addEventListener === 'function') root.addEventListener('beforeprint', settleMotion);
  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('df:zoomopen', settleMotion);
  }

  var TURN = Math.PI * 2;

  function piePath(cx, cy, r, start, end) {
    function rim(a) { return (cx + r * Math.sin(a)) + ',' + (cy - r * Math.cos(a)); }
    var arc = 'A' + r + ',' + r + ' 0 0 1 ';
    if (end - start === TURN) return 'M' + rim(start) + arc + rim(start + Math.PI) + arc + rim(start) + 'Z';
    return 'M' + cx + ',' + cy + 'L' + rim(start) + arc + rim((start + end) / 2) + arc + rim(end) + 'Z';
  }

  function drawPie(chart, width, previous) {
    var model = chart.view;
    var height = model.height;
    var cx = width / 2;
    var cy = height / 2;
    var r = Math.max(0, Math.min(cx, cy) - 8);
    var frame = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      'aria-hidden': 'true', focusable: 'false' });
    var markMap = new Map();
    chart.marks = svg('g', { class: 'df-chart-marks' }, frame);
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.geom = { cx: cx, cy: cy, radius: r };
    chart.cursor = chart.revealPlot = null;
    var scale = pieTotal(model.series);
    var summed = 0;
    chart.spots = model.series.map(function (s) {
      var p = s.points[0];
      var part = scale.total ? p.y / scale.max / scale.total : null;
      var start = scale.total ? summed / scale.total * TURN : 0;
      summed += scale.max ? p.y / scale.max : 0;
      var end = scale.total ? summed / scale.total * TURN : 0;
      var group = svg('g', { class: 'df-chart-series' }, chart.marks);
      paint(group, s);
      var path = tagKey(model, svg('path', { class: 'df-chart-slice' }, group), p);
      var entry = { el: group, whole: true, arc: [start, end], shape: function (a, b) {
        entry.arc = [a, b];
        path.setAttribute('d', piePath(cx, cy, r, a, b));
        if (a === b) path.setAttribute('display', 'none');
        else path.removeAttribute('display');
      } };
      entry.shape(start, end);
      addMark(markMap, markId(s.key, 'slice'), entry);
      var middle = (start + end) / 2;
      return { p: p, s: s, el: path, part: part, entry: entry,
        px: cx + r * 0.65 * Math.sin(middle), py: cy - r * 0.65 * Math.cos(middle) };
    });
    chart.empty.textContent = model.noMatches ? EMPTY_FILTER : !model.series.length && model.hiddenCount ? HIDDEN_PIE :
      !scale.total ? EMPTY_PIE : '';
    chart.empty.hidden = !chart.empty.textContent;
    chart.empty.style.left = '0';
    chart.empty.style.width = '100%';
    chart.empty.style.top = '0';
    chart.empty.style.height = height + 'px';
    mountFrame(chart, frame, markMap, previous);
    if (chart.active >= 0) show(chart, Math.min(chart.active, chart.spots.length - 1), null);
  }

  // An add-on type draws its own frame: def.draw(chart, width, kit) returns { frame, marks, layer, overlay, spots,
  // geom, empty }, where marks is a markId-keyed Map of mark entries and layer the group that holds them.
  function drawAddon(chart, width, previous, def) {
    var out = def.draw(chart, width, kit) || {};
    if (!out.frame) return;
    chart.marks = out.layer || svg('g', { class: 'df-chart-marks' }, out.frame);
    chart.overlay = out.overlay || svg('g', { class: 'df-chart-hover' }, out.frame);
    chart.spots = out.spots || [];
    chart.geom = out.geom || {};
    chart.cursor = chart.revealPlot = null;
    chart.empty.textContent = out.empty || '';
    chart.empty.hidden = !out.empty;
    mountFrame(chart, out.frame, out.marks || new Map(), previous);
    if (chart.active >= 0) show(chart, Math.min(chart.active, chart.spots.length - 1), null);
  }

  function barThickness(band, count, gap, stacked) {
    var m = Math.max(1, count);
    return Math.max(2, Math.min(stacked ? 36 : 24, (band * 0.72 - gap * (m - 1)) / m));
  }

  function percentTicks(model, fmt) {
    return model.stack === 'percent' ? function (v) { return fmt(v) + '%'; } : fmt;
  }

  var LINE = 13;

  // Horizontal bars: categories run down the left, wrapped onto up to three lines, and values run across the plot.
  // Reference lines on y mark values across the plot and those on x mark categories.
  function drawHorizontal(chart, width, previous, categoryMarks) {
    var model = chart.view;
    var height = model.height;
    var series = model.series;
    var cats = model.categories || [];
    var layout = model.stack ? stackLayout(model) : null;
    chart.stack = layout;
    var span = extent(model);
    var fit = model.rescale && span.count ? span : extent(chart.model);
    var top = 10 + (model.x.label ? 20 : 0);
    var bottom = 26 + (model.y.label ? 20 : 0);
    var plotB = height - bottom;
    var band = Math.max(1, plotB - top) / Math.max(1, cats.length);
    var every = Math.max(1, Math.ceil(LINE / band));
    var room = Math.max(6, Math.floor(width * 0.3 / CHAR));
    var labels = cats.map(function (c) { return wrapLabel(c, room, Math.max(1, Math.min(3, Math.floor((band - 2) / LINE)))); });
    var marker = model.markedCategories ? 10 : 0;
    var labelW = Math.max.apply(null, labels.map(function (l) {
      return Math.max.apply(null, l.lines.map(function (line) { return line.length; }));
    }).concat([1])) * CHAR;
    var left = 12 + marker + labelW;
    var count = Math.max(2, Math.round((width - left) / 90));
    var vInfo = ticks(fit.yLo, fit.yHi, count, model.y.min !== null, model.y.max !== null);
    var vFmt = percentTicks(model, tickFormat(vInfo));
    var lastTick = vInfo.ticks[vInfo.ticks.length - 1] ?? vInfo.max;
    var right = Math.max(14, vFmt(lastTick).length * CHAR / 2 + 4);
    var plotW = Math.max(40, width - left - right);
    var plotR = left + plotW;
    var v = linear(vInfo.min, vInfo.max, left, plotR);
    var pos = function (c) { return top + band * (cats.indexOf(String(c)) + 0.5); };

    var frame = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      'aria-hidden': 'true', focusable: 'false' });
    if (categoryMarks || series.some(function (s) { return s.points.some(function (p) { return p.interval; }); })) {
      var clip = svg('clipPath', { id: chart.clip + '-interval' }, svg('defs', {}, frame));
      var pad = categoryMarks ? 7 : 1;
      svg('rect', { x: left - pad, y: top - 4, width: plotW + pad * 2, height: plotB - top + 8 }, clip);
    }
    var grid = svg('g', { class: 'df-chart-grid' }, frame);
    vInfo.ticks.forEach(function (t) {
      var px = Math.round(v(t)) + 0.5;
      svg('line', { x1: px, x2: px, y1: top, y2: plotB, class: t === 0 && vInfo.min < 0 ? 'is-zero' : '' }, grid);
      svg('text', { x: px, y: plotB + 16, 'text-anchor': 'middle', class: 'df-chart-tick' }, frame).textContent = vFmt(t);
    });
    var base = v(Math.max(vInfo.min, Math.min(0, vInfo.max)));
    var baseX = Math.round(model.zeroBaseline === false ? left : base) + 0.5;
    svg('line', { x1: baseX, x2: baseX, y1: top, y2: plotB, class: 'df-chart-base' }, frame);
    cats.forEach(function (c, i) {
      var cy = pos(c);
      if (model.markedCategories && model.markedCategories.has(c)) {
        svg('text', { x: left - 6, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'df-chart-label' }, frame)
          .textContent = '*';
      }
      if (i % every) return;
      var lines = every > 1 ? wrapLabel(c, room, 1) : labels[i];
      var text = svg('text', { x: left - 8 - marker, y: cy - (lines.lines.length - 1) * LINE / 2, 'text-anchor': 'end',
        'dominant-baseline': 'middle', class: 'df-chart-tick df-chart-category' }, frame);
      lines.lines.forEach(function (line, n) {
        svg('tspan', { x: left - 8 - marker, dy: n ? LINE : 0 }, text).textContent = line;
      });
      if (lines.cut) svg('title', {}, text).textContent = c;
    });
    if (model.y.label) {
      svg('text', { x: left + plotW / 2, y: height - 6, 'text-anchor': 'middle', class: 'df-chart-label' }, frame)
        .textContent = model.y.label;
    }
    if (model.x.label) svg('text', { x: 0, y: 12, class: 'df-chart-label' }, frame).textContent = model.x.label;

    var refLines = svg('g', { class: 'df-chart-refs' }, frame);
    var marks = svg('g', { class: 'df-chart-marks' }, frame);
    var gap = 2;
    var thick = barThickness(band, layout ? 1 : series.length, gap, layout);
    var markOf = new Map();
    var markMap = new Map();
    var plotH = Math.max(1, plotB - top);
    var place = function (p, el, px, py) {
      markOf.set(p, { el: el, px: px, py: py });
      return tagKey(model, el, p);
    };
    series.forEach(function (s, si) {
      var g = svg('g', { class: 'df-chart-series' }, marks);
      paint(g, s);
      (categoryMarks || barMarks)({ layout: layout, count: series.length, thick: thick, gap: gap, band: band, pos: pos, val: v, base: base,
        horizontal: true, place: place, markMap: markMap, clip: chart.clip,
        orderAt: function (py) { return Math.max(0, Math.min(1, (py - top) / plotH)); } }, s, si, g, model, kit);
    });

    var refLabels = svg('g', { class: 'df-chart-refs' }, frame);
    model.referenceLines.forEach(function (r, i) {
      var text = r.label || refValue(model, r);
      var on = false;
      if (r.axis === 'y') {
        if (r.value >= vInfo.min && r.value <= vInfo.max) {
          on = true;
          var px = Math.round(v(r.value)) + 0.5;
          var fits = px + 5 + text.length * 6.5 <= plotR;
          svg('line', { x1: px, x2: px, y1: top, y2: plotB, class: 'df-chart-ref' }, refLines);
          svg('text', { x: fits ? px + 5 : px - 5, y: top + 10, 'text-anchor': fits ? 'start' : 'end', class: 'df-chart-ref-label' },
            refLabels).textContent = text;
        }
      } else if (cats.indexOf(r.value) >= 0) {
        on = true;
        var py = Math.round(pos(r.value)) + 0.5;
        svg('line', { x1: left, x2: plotR, y1: py, y2: py, class: 'df-chart-ref' }, refLines);
        svg('text', { x: plotR - 4, y: py - 5 < top + 10 ? py + 13 : py - 5, 'text-anchor': 'end', class: 'df-chart-ref-label' },
          refLabels).textContent = text;
      }
      noteRef(chart, i, on, false);
    });

    var byX = new Map();
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (!byX.has(String(p.x))) byX.set(String(p.x), []);
        byX.get(String(p.x)).push({ s: s, p: p, mark: markOf.get(p) });
      });
    });
    var spots = [];
    cats.forEach(function (c) {
      var cy = pos(c);
      var found = byX.get(c) || [];
      if ((model.selectionGroup || categoryMarks) && found.length) {
        found.forEach(function (f) {
          spots.push({ px: f.mark.px, py: f.mark.py, cy: cy, x: c, s: f.s, p: f.p, el: f.mark.el });
        });
      } else {
        var far = found.reduce(function (end, f) {
          var at = layout ? v(layout.bars.get(f.p).to) : v(f.p.y);
          return Math.abs(at - base) > Math.abs(end - base) ? at : end;
        }, base);
        spots.push({ px: far, py: cy, cy: cy, x: c });
      }
    });
    spots.sort(function (a, b) { return a.py - b.py || a.px - b.px; });
    chart.spots = spots;
    chart.geom = { left: left, right: plotR, top: top, bottom: plotB, band: band, horizontal: true, value: v, x: null, y: null };
    chart.revealPlot = null;
    chart.cursor = null;
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.marks = marks;

    var empty = chart.model.noMatches ? EMPTY_FILTER : !series.length ? EMPTY_SERIES : '';
    chart.empty.textContent = empty;
    chart.empty.hidden = !empty;
    chart.empty.style.left = left + 'px';
    chart.empty.style.width = plotW + 'px';
    chart.empty.style.top = top + 'px';
    chart.empty.style.height = plotH + 'px';

    mountFrame(chart, frame, markMap, previous);
    if (chart.active >= 0) show(chart, Math.min(chart.active, chart.spots.length - 1), null);
  }

  // Marks a reference line's legend item when its value is off the plot: outside the range or off scale.
  function noteRef(chart, i, on, cut) {
    var item = chart.refItems && chart.refItems[i];
    if (!item) return;
    item.classList.toggle('is-outside', !on);
    item.lastChild.textContent = on ? '' : cut ? 'outside range' : 'off scale';
  }

  // The y axis covers every series unless the chart rescales to the series and range shown.
  function draw(chart, animate) {
    var model = chart.view;
    var width = Math.round(chart.plot.clientWidth);
    var previous = animate && width === chart.width && chart.markMap && chart.playhead === null &&
      motionAllowed(chart.model, motionEnv(chart)) ? chart.markMap : null;
    stopMotion(chart);
    chart.width = width;
    chart.stack = null;
    if (!width) return;
    var def = addonOf(model);
    var categoryMarks = def && def.categoryMarks;
    var continuousMarks = def && def.continuousMarks;
    if (def && def.draw) return drawAddon(chart, width, previous, def);
    if (model.type === 'pie') return drawPie(chart, width, previous);
    if (model.type === 'bar' && model.orientation === 'horizontal') return drawHorizontal(chart, width, previous, categoryMarks);
    var height = model.height;
    var type = model.type;
    var series = model.series;
    var cats = model.categories;
    var range = model.range;
    var playback = chart.playhead !== null;

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
    var yFmt = yLog ? logTickFormat() : percentTicks(model, tickFormat(yInfo));
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
      var limits = range || (playback ? domain(chart.model) : null);
      if (limits) { xLo = limits[0]; xHi = limits[1]; }
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
    var clipRect;
    var intervalRect;
    var hasIntervals = series.some(function (s) { return s.line.some(function (p) { return p.interval; }); });
    var defs = range || playback || hasIntervals || categoryMarks || continuousMarks ? svg('defs', {}, frame) : null;
    if (range || playback) {
      var clip = svg('clipPath', { id: chart.clip }, defs);
      clipRect = svg('rect', { x: left, y: top - 3, width: plotW, height: height - bottom - top + 6 }, clip);
    }
    if (continuousMarks) {
      svg('rect', { x: left, y: top, width: plotW, height: height - bottom - top },
        svg('clipPath', { id: chart.clip + '-plot' }, defs));
    }
    if (hasIntervals || categoryMarks) {
      // Whiskers keep their full caps and stroke at the plot edges; bands stay inside the exact bounds.
      var intervalClip = svg('clipPath', { id: chart.clip + '-interval' }, defs);
      var intervalPad = categoryMarks ? 7 : 1;
      svg('rect', { x: left - 4, y: top - intervalPad, width: plotW + 8,
        height: height - bottom - top + intervalPad * 2 }, intervalClip);
      var bandClip = svg('clipPath', { id: chart.clip + '-band' }, defs);
      var bandRect = svg('rect', { x: left, y: top, width: plotW, height: height - bottom - top }, bandClip);
      if (playback) intervalRect = bandRect;
    }

    var grid = svg('g', { class: 'df-chart-grid' }, frame);
    yInfo.ticks.forEach(function (v) {
      var py = Math.round(y(v)) + 0.5;
      svg('line', { x1: left, x2: left + plotW, y1: py, y2: py, class: v === 0 && yInfo.min < 0 ? 'is-zero' : '' }, grid);
      svg('text', { x: left - 8, y: py, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'df-chart-tick' }, frame)
        .textContent = yFmt(v);
    });
    var baseY = Math.round(type === 'bar' && model.zeroBaseline !== false ?
      y(Math.max(yInfo.min, Math.min(0, yInfo.max))) : height - bottom) + 0.5;
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
    var marks = svg('g', { class: 'df-chart-marks' }, frame);
    var layout = type === 'bar' && model.stack ? stackLayout(model) : null;
    chart.stack = layout;
    var gap = 2;
    var thick = type === 'bar' ? barThickness(band, layout ? 1 : series.length, gap, layout) : 0;
    var markOf = new Map();
    var markMap = new Map();
    var future = [];
    var plotW0 = Math.max(1, plotW);
    var orderAt = function (px) { return Math.max(0, Math.min(1, (px - left) / plotW0)); };
    // Keyed marks follow the shared selection after every redraw.
    var place = function (p, el, px, py) {
      markOf.set(p, { el: el, px: px, py: py });
      if (playback) {
        el.setAttribute('display', 'none');
        if (px >= left && px <= left + plotW) future.push({ x: p.x, el: el, point: p });
        return el;
      }
      return tagKey(model, el, p);
    };
    if (continuousMarks) continuousMarks({
      pos: xAt, val: y, base: Math.max(yInfo.min, Math.min(0, yInfo.max)), left: left, right: left + plotW,
      place: place, markMap: markMap, orderAt: orderAt,
      group: function (s) {
        var g = svg('g', { class: 'df-chart-series', 'clip-path': 'url(#' + chart.clip + '-plot)' }, marks);
        paint(g, s);
        return g;
      }
    }, model, kit);
    else series.forEach(function (s, si) {
      var g = svg('g', { class: 'df-chart-series' }, marks);
      paint(g, s);
      var intervals = hasIntervals && type !== 'bar' ?
        svg('g', { 'clip-path': 'url(#' + chart.clip + '-interval)' }, g) : null;
      if (type === 'line') {
        var runs = model.gaps ? segments(s.line, s.breaks, cats ? function (x) { return cats.indexOf(String(x)); } :
          function (x) { return x; }) : [s.line];
        if (intervals) {
          var bandPath = '';
          var addBand = function (run) {
            if (!run.length) return;
            if (run.length === 1) {
              var p = run[0];
              var px = xAt(p.x);
              if (px < left || px > left + plotW) return;
              var mark = whisker(intervals, p.interval, px, y);
              addMark(markMap, markId(s.key, 'whisker', p), { el: mark, fade: true, order: orderAt(px) });
              if (playback) future.push({ x: p.x, el: mark });
              return;
            }
            bandPath += run.map(function (p, i) { return (i ? 'L' : 'M') + xAt(p.x) + ',' + y(p.interval.upper); }).join('') +
              run.slice().reverse().map(function (p) { return 'L' + xAt(p.x) + ',' + y(p.interval.lower); }).join('') + 'Z';
          };
          runs.forEach(function (run) {
            var bounded = [];
            run.forEach(function (p) {
              if (p.interval) bounded.push(p);
              else { addBand(bounded); bounded = []; }
            });
            addBand(bounded);
          });
          if (bandPath) {
            addMark(markMap, markId(s.key, 'band'), { fade: true, el: svg('path', { class: 'df-chart-band-interval', d: bandPath,
              'clip-path': 'url(#' + chart.clip + '-band)' }, intervals) });
          }
        }
        var d = runs.map(function (run) {
          return run.length > 1 ? run.map(function (p, i) { return (i ? 'L' : 'M') + xAt(p.x) + ',' + y(p.y); }).join('') : '';
        }).join('');
        if (d) {
          var path = svg('path', { d: d, class: 'df-chart-line' }, g);
          if (clipRect) path.setAttribute('clip-path', 'url(#' + chart.clip + ')');
          addMark(markMap, markId(s.key, 'line'), { el: path, draw: true });
        }
        // Isolated readings between gaps, and selectable points, keep a marker even on dense lines.
        runs.forEach(function (run) {
          run.forEach(function (p) {
            if (range && (p.x < range[0] || p.x > range[1])) return;
            if (s.points.length > 16 && run.length > 1 && !(model.selectionGroup && p.key)) return;
            var dot = place(p, svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4, class: 'df-chart-dot' }, g), xAt(p.x));
            addMark(markMap, markId(s.key, 'dot', p), { el: dot, from: { r: 0 }, order: orderAt(xAt(p.x)) });
          });
        });
      } else if (type === 'bar') {
        (categoryMarks || barMarks)({ layout: layout, count: series.length, thick: thick, gap: gap, band: band, pos: xAt, val: y,
          base: y(Math.max(yInfo.min, Math.min(0, yInfo.max))), horizontal: false, place: place, markMap: markMap,
          orderAt: orderAt, clip: chart.clip }, s, si, g, model, kit);
      } else {
        s.points.forEach(function (p) {
          var order = orderAt(xAt(p.x));
          if (p.interval) {
            addMark(markMap, markId(s.key, 'whisker', p), { el: whisker(intervals, p.interval, xAt(p.x), y), fade: true, order: order });
          }
          var dot = place(p, svg('circle', { cx: xAt(p.x), cy: y(p.y), r: 4.5, class: 'df-chart-dot' }, g), xAt(p.x));
          addMark(markMap, markId(s.key, 'dot', p), { el: dot, from: { r: 0 }, order: order });
        });
      }
    });

    ends.forEach(function (e) {
      var px = xAt(e.p.x);
      var label = svg('text', { x: px + 10, y: e.y, 'dominant-baseline': 'middle', class: 'df-chart-end' }, frame);
      label.textContent = e.s.name;
      if (playback) {
        label.setAttribute('display', 'none');
        if (px >= left && px <= left + plotW) future.push({ x: e.p.x, el: label });
      }
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
      noteRef(chart, i, on, full && r.axis === 'x' && r.value >= full[0] && r.value <= full[1]);
    });

    var spots = spotsFor(model, xAt, y, function (p) { return markOf.get(p); });
    if (continuousMarks) spots = spots.filter(function (spot) {
      return !spot.p.xSpan || (xAt(spot.p.xSpan[0]) < plotR && xAt(spot.p.xSpan[1]) > left);
    });
    if (playback || chart.xGroup && linearX(model)) {
      spots = spots.filter(function (spot) { return spot.px >= left && spot.px <= plotR; });
    }
    chart.spots = playback ? [] : spots;
    chart.geom = { left: left, right: left + plotW, top: top, bottom: height - bottom, band: band, y: y, x: xs0 };
    chart.revealPlot = playback ? drawPlayhead(chart, frame, future, spots,
      intervalRect ? [clipRect, intervalRect] : [clipRect]) : null;
    chart.cursor = chart.xGroup && linearX(model) ? svg('line', {
      y1: top, y2: height - bottom, class: 'df-chart-x-cursor', display: 'none'
    }, frame) : null;
    chart.overlay = svg('g', { class: 'df-chart-hover' }, frame);
    chart.marks = marks;

    var empty = chart.model.noMatches ? EMPTY_FILTER : !series.length ? EMPTY_SERIES : range && !spots.length ? EMPTY_RANGE : '';
    chart.empty.textContent = empty;
    chart.empty.hidden = !empty;
    chart.empty.style.left = left + 'px';
    chart.empty.style.width = plotW + 'px';
    chart.empty.style.top = top + 'px';
    chart.empty.style.height = Math.max(0, height - bottom - top) + 'px';

    mountFrame(chart, frame, markMap, previous);
    if (chart.revealPlot) chart.revealPlot(chart.playhead);
    paintCursor(chart);
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
    if (s.name) html('span', 'df-chart-tip-series', r, s.name);
    return r;
  }

  function selectedKey(model) {
    var group = model.selectionMode !== 'publish' && DocForm.selection && DocForm.selection.group(model.selectionGroup);
    return group ? group.get() : null;
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
    var def = addonOf(model);

    if (def && def.readout) {
      var at = def.readout(chart, spot, tip, kit);
      anchorY = isNum(at) ? at : isNum(spot.py) ? spot.py : g.top;
    } else if (model.type === 'pie') {
      spot.el.classList.add('is-active');
      html('div', 'df-chart-tip-head', tip, spot.s.name);
      var share = pieShare(spot.part);
      html('div', 'df-chart-tip-row', tip, format(spot.p.y, model.y) + (share ? ' · ' + share : ''));
      anchorY = spot.py;
    } else if (model.type === 'scatter') {
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
      intervalReadout(tip, spot.p, model.y);
      anchorY = spot.py;
    } else {
      html('div', 'df-chart-tip-head', tip, (model.x.label && !model.categories ? model.x.label + ' ' : '') + xText(chart, spot.x));
      if (model.type === 'bar') {
        svg('rect', g.horizontal ?
          { x: g.left, y: spot.cy - g.band / 2, width: g.right - g.left, height: g.band, class: 'df-chart-band' } :
          { x: spot.cx - g.band / 2, y: g.top, width: g.band, height: g.bottom - g.top, class: 'df-chart-band' }, chart.overlay);
        chart.marks.parentNode.insertBefore(chart.overlay, chart.marks);
        if (spot.el) spot.el.classList.add('is-active');
        else DocForm.all('.df-chart-bar', chart.marks).forEach(function (el) {
          if (el.getAttribute('data-df-x') === String(spot.x)) el.classList.add('is-active');
        });
      } else {
        if (!chart.cursor) {
          svg('line', { x1: spot.cx, x2: spot.cx, y1: g.top, y2: g.bottom, class: 'df-chart-cross' }, chart.overlay);
        }
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
        var share = chart.stack && model.stack === 'percent' ? pieShare(chart.stack.bars.get(p).share) : '';
        var r = row(tip, s, format(p.y, model.y) + (share ? ' · ' + share : ''), def?.categoryMarks ? 'dot' : model.type);
        intervalReadout(r, p, model.y);
        if (spot.p && spot.s === s && model.series.length > 1) r.classList.add('is-current');
      });
      var total = chart.stack && model.series.length > 1 && chart.stack.totals.get(String(spot.x));
      if (total) {
        var sum = html('div', 'df-chart-tip-row df-chart-tip-total', tip);
        html('b', '', sum, format(total.sum, model.y));
        html('span', 'df-chart-tip-series', sum, 'Total');
      }
      anchorY = g.horizontal ? spot.cy : pointerY == null ? g.top : pointerY;
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
    var def = addonOf(chart.model);
    if (chart.model.type === 'pie') {
      var dx = px - g.cx;
      var dy = py - g.cy;
      if (Math.hypot(dx, dy) > g.radius || !g.radius) return hide(chart);
      var angle = (Math.atan2(dx, -dy) + TURN) % TURN;
      var slice = spots.findIndex(function (spot) {
        return angle >= spot.entry.arc[0] && angle < spot.entry.arc[1];
      });
      return show(chart, slice, null);
    }
    if (chart.playhead !== null && px > g.x(chart.playhead)) return leaveInspection(chart);
    if (chart.cursor && (px < g.left || px > g.right || py < g.top || py > g.bottom)) return leaveInspection(chart);
    if (!spots.length || px < g.left - HIT || px > g.right + HIT || py < g.top - HIT || py > g.bottom + HIT) {
      hide(chart);
    } else if (def?.pick) {
      show(chart, def.pick(chart, px, py), py);
    } else if (chart.model.type === 'scatter') {
      var best = -1;
      var dist = HIT;
      spots.forEach(function (s, i) {
        var d = Math.sqrt((s.px - px) * (s.px - px) + (s.py - py) * (s.py - py));
        if (d <= dist) { dist = d; best = i; }
      });
      show(chart, best, null);
    } else {
      show(chart, closest(spots, px, py, g.horizontal), py);
    }
    if (chart.cursor) {
      var x = g.x.invert(px);
      inspect(chart, chart.playhead === null ? x : Math.min(x, chart.playhead));
    }
  }

  // Commits the previewed point without changing the chart range or series.
  function keyedSpot(chart) {
    var spot = chart.spots[chart.active];
    return chart.group && chart.model.selectionMode !== 'follow' && spot && spot.p && spot.p.key ? spot : null;
  }

  function watch(chart) {
    if (chart.unfollow) chart.unfollow();
    chart.group = DocForm._selection && DocForm._selection.ensure(chart.model.selectionGroup);
    chart.unfollow = chart.group && chart.model.selectionMode !== 'publish' && chart.group.follow(function () {
      if (chart.active >= 0) show(chart, chart.active, chart.pointerY);
    });
  }

  function activate(chart) {
    var spot = keyedSpot(chart);
    return spot ? chart.group.toggle(spot.p.key) : false;
  }

  function tagKey(model, el, p) {
    if (model.selectionGroup && model.selectionMode !== 'publish' && p && p.key) {
      el.setAttribute(GROUP, model.selectionGroup);
      el.setAttribute(KEY, p.key);
      if (DocForm._selection) DocForm._selection.sync(el);
    }
    return el;
  }

  function pieShare(part) {
    if (part === null) return '';
    if (part > 0 && part < 0.001) return '<0.1%';
    return (Math.round(part * 1000) / 10) + '%';
  }

  function pieTotal(series) {
    var max = series.reduce(function (hi, s) { return Math.max(hi, s.points[0].y); }, 0);
    var total = max ? series.reduce(function (sum, s) { return sum + s.points[0].y / max; }, 0) : 0;
    return { max: max, total: total };
  }

  function buildTable(model, collectRow) {
    var def = addonOf(model);
    if (def && def.table) return def.table(model, kit);
    var table = document.createElement('table');
    var head = html('tr', '', html('thead', '', table));
    var body = html('tbody', '', table);
    if (model.type === 'pie') {
      var scale = pieTotal(model.series);
      ['Slice', model.y.label || 'Value', 'Share'].forEach(function (label) {
        html('th', '', head, label).setAttribute('scope', 'col');
      });
      model.series.forEach(function (s) {
        var p = s.points[0];
        var tr = tagKey(model, html('tr', '', body), p);
        html('th', '', tr, s.name).setAttribute('scope', 'row');
        html('td', '', tr, format(p.y, model.y));
        html('td', '', tr, pieShare(scale.total ? p.y / scale.max / scale.total : null));
      });
      return table;
    }
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
          intervalReadout(html('td', '', tr, format(p.y, model.y)), p, model.y);
        });
      });
      return table;
    }
    var stacked = model.type === 'bar' && model.stack ? stackLayout(model) : null;
    html('th', '', head, xName(model, ''));
    model.series.forEach(function (s) { html('th', '', head, s.name || model.y.label || 'Value'); });
    if (stacked) html('th', '', head, 'Total');
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
        var share = p && model.stack === 'percent' ? pieShare(stacked.bars.get(p).share) : '';
        var cell = tagKey(model, html('td', '', tr, p ? format(p.y, model.y) + (share ? ' (' + share + ')' : '') : ''), p);
        if (p) intervalReadout(cell, p, model.y);
      });
      var total = stacked && stacked.totals.get(String(x));
      if (stacked) html('td', '', tr, total ? format(total.sum, model.y) : '');
      if (collectRow) collectRow({ x: x, row: tr, body: body });
    });
    return table;
  }

  function describe(model) {
    var names = model.series.map(function (s) { return s.name; }).filter(Boolean);
    var gaps = model.gaps && model.series.some(function (s) { return s.missing.length; });
    var refs = model.referenceLines.map(function (r) { return refText(model, r); });
    var keyed = DocForm.selection && model.selectionMode !== 'follow' && model.selectionGroup &&
      model.series.some(function (s) { return s.points.some(function (p) { return p.key; }); });
    var def = addonOf(model);
    var type = model.type === 'bar' ? (model.stack === 'percent' ? '100% stacked ' : model.stack ? 'stacked ' : '') +
      (model.orientation === 'horizontal' ? 'horizontal ' : '') + 'bar' : model.type;
    var kind = def && def.describe ? def.describe(model) :
      type.charAt(0).toUpperCase() + type.slice(1) + ' chart' + (names.length ? ' of ' + names.join(', ') : '') + '.';
    return (model.title ? model.title + '. ' : '') + kind +
      (model.x.time ? ' Times are in UTC.' : '') +
      (model.x.log || model.y.log ? ' The ' + (model.x.log && model.y.log ? 'x and y axes use' : (model.x.log ? 'x' : 'y') +
        ' axis uses') + ' a log scale.' : '') +
      (refs.length ? ' Reference ' + (refs.length > 1 ? 'lines: ' : 'line: ') + refs.join(', ') + '.' : '') +
      (gaps ? ' Breaks in a line mark missing values.' : '') + ' Arrow keys read the values.' +
      (keyed ? ' Enter or Space selects the point being read.' : '') +
      (model.brush ? ' Drag across the plot, or press plus and minus, to narrow or widen the x range; Shift with ' +
        'the left and right arrow keys moves it.' : '') +
      (model.toggles ? ' The legend buttons hide and show ' + (model.type === 'pie' ? 'slices.' : 'series.') : '') +
      (model.table ? ' The Table button lists the values shown.' : '');
  }

  function rangeText(model, range) {
    return xName(model, 'x') + ' ' + format(range[0], model.x).replace(/ UTC$/, '') + ' – ' + format(range[1], model.x);
  }

  function renderHead(chart) {
    var model = chart.model;
    var def = addonOf(model);
    chart.legend.textContent = '';
    chart.seriesItems = [];
    if (model.series.length > 1 || model.toggles || model.type === 'pie') {
      model.series.forEach(function (s) {
        var item = html(model.toggles ? 'button' : 'span', 'df-chart-legend-item', chart.legend);
        if (model.toggles) {
          item.type = 'button';
          item.classList.add('df-chart-series-toggle');
          item.addEventListener('click', function () { setVisible(chart, s.key, !!chart.hidden[s.key]); });
        }
        key(model.type === 'line' ? 'line' : model.type === 'bar' && !def?.categoryMarks ? 'bar' : 'dot', s, item);
        html('span', '', item, s.name);
        chart.seriesItems.push({ el: item, key: s.key, name: s.name });
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
    if (def && def.legend) legends[def.legend](chart, chart.legend, kit);
    syncHead(chart);
  }

  // Pressed legend buttons, and the narrowed range with its Reset button.
  function syncHead(chart) {
    chart.seriesItems.forEach(function (item) {
      var off = !!chart.hidden[item.key];
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
    if (view.noMatches) return html('p', 'df-chart-empty-note', null, EMPTY_FILTER);
    return view.series.length ? buildTable(view) : html('p', 'df-chart-empty-note', null,
      view.type === 'pie' ? (view.hiddenCount ? HIDDEN_PIE : EMPTY_PIE) : EMPTY_SERIES);
  }

  // The table view lists what the plot shows; a source table stands in while nothing is hidden or narrowed.
  function fillTable(chart) {
    chart.table.textContent = '';
    chart.revealTable = null;
    if (chart.playhead !== null) {
      if (!chart.plot.hidden) return;
      var rows = [];
      var table = !chart.view.noMatches && chart.view.series.length ? buildTable(chart.view, function (entry) {
        entry.row.remove();
        rows.push(entry);
      }) : tableView(chart.view);
      chart.table.appendChild(table);
      chart.revealTable = revealInOrder(rows, function (entry) {
        entry.body.appendChild(entry.row);
        if (DocForm._selection) DocForm.all('[' + GROUP + '][' + KEY + ']', entry.row).forEach(DocForm._selection.sync);
      }, function (entry) { entry.row.remove(); });
      chart.revealTable(chart.playhead);
    } else if (sourceShown(chart)) chart.table.appendChild(chart.sourceTable);
    else if (chart.plot.hidden) chart.table.appendChild(tableView(chart.view));
  }

  // An authored source table stands in for the table view while it shows the same values as the chart.
  function sourceShown(chart) {
    var model = chart.model;
    var def = addonOf(model);
    return chart.ownTable && model.type !== 'pie' && !model.stack && !def?.categoryMarks && !def?.table &&
      !chart.range && !chart.view.hiddenCount;
  }

  function setPlayhead(chart, x) {
    var wasActive = chart.playhead !== null;
    chart.playhead = x;
    if (wasActive !== (x !== null)) {
      hide(chart);
      fillTable(chart);
      if (!chart.plot.hidden) draw(chart);
      return;
    }
    if (!chart.plot.hidden && chart.revealPlot) chart.revealPlot(x);
    if (chart.revealTable) chart.revealTable(x);
    paintCursor(chart);
  }

  function playbackFor(chart) {
    return playbacks.get(chart.box) || (chart.xGroup && chart.xGroup.playback);
  }

  function paintPlayback(playback, x, origin, redraw) {
    var group = playback.group;
    playback.x = x;
    if (redraw) redraw.playhead = x;
    var members = group ? group.members : [playback.reference];
    members.forEach(function (host) {
      var chart = charts.get(host);
      if (chart && chart !== redraw) setPlayhead(chart, x);
    });
    if (group && x !== null && group.x !== null && group.x > x) {
      var emit = commitX(group, null, null, origin || 'group');
      if (emit) DocForm._component.transaction(emit);
    }
  }

  function reconcilePlayhead(chart, origin) {
    var playback = playbackFor(chart);
    if (!playback) return;
    var reference = charts.get(playback.reference);
    var models = [reference && reference.model];
    if (playback.group) playback.group.members.forEach(function (host) {
      var member = charts.get(host);
      if (host !== playback.reference && member) models.push(member.model);
    });
    var update = playback.reconcile(models, origin, chart.box === playback.reference);
    paintPlayback(playback, update.x, origin, chart);
    return update.notify;
  }

  function refresh(chart, animate) {
    chart.view = viewOf(chart.model, chart.hidden, chart.range);
    hide(chart);
    syncHead(chart);
    fillTable(chart);
    if (!chart.plot.hidden) draw(chart, animate);
    if (typeof CustomEvent === 'function') {
      chart.box.dispatchEvent(new CustomEvent('df:chartview', {
        bubbles: true,
        detail: { hidden: Object.keys(chart.hidden), range: chart.range ? chart.range.slice() : null }
      }));
    }
    if (chart.controller) chart.controller.change(chart.origin || 'user');
  }

  function setVisible(chart, name, on) {
    if (on) delete chart.hidden[name];
    else chart.hidden[name] = true;
    refresh(chart, true);
  }

  function setRange(chart, range) {
    chart.range = range;
    refresh(chart, true);
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
      leaveInspection(chart);
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
    inspectSpot(chart, closest(chart.spots, px, null));
  }

  function inspectSpot(chart, index) {
    show(chart, index, null);
    inspect(chart, readX(chart));
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
    chart.box.classList.toggle('is-table', on);
    chart.table.hidden = !on;
    chart.plot.hidden = on;
    var def = addonOf(chart.model);
    if (on && (chart.model.type === 'pie' || def?.categoryMarks || def?.table || !chart.table.firstChild)) fillTable(chart);
    chart.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    chart.toggle.textContent = on ? 'Chart' : 'Table';
    if (!on) draw(chart);
    if (chart.controller && !chart.updating) chart.controller.change('user');
  }

  function build(host, model, sourceTable, spec, useSourceTable, origin) {
    var chart = {
      box: host, model: model, spec: spec, active: -1, spots: [], svg: null, width: 0, geom: {},
      hidden: Object.create(null), range: null, drag: null, dragged: false, clip: 'df-chart-clip-' + (++clips),
      playhead: null
    };
    chart.view = viewOf(model, chart.hidden, null);
    host.classList.add('df-chart');
    typeClasses(host, model);

    var head = html('div', 'df-chart-head');
    chart.legend = html('div', 'df-chart-legend', head);
    var tools = html('div', 'df-chart-tools', head);
    chart.rangeText = html('span', 'df-chart-range', tools);
    chart.reset = html('button', 'df-button df-chart-reset', tools, 'Reset range');
    chart.reset.type = 'button';
    chart.toggle = html('button', 'df-button df-chart-toggle', tools, 'Table');
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
    chart.sourceSpec = useSourceTable ? spec : null;
    chart.ownTable = Boolean(sourceTable && useSourceTable);
    if (sourceTable && chart.playhead === null && (!model.stack || addonOf(model)?.table)) chart.table.appendChild(sourceTable);
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
    chart.plot.addEventListener('pointercancel', function () { endDrag(chart, false); leaveInspection(chart); });
    chart.plot.addEventListener('pointerleave', function () { if (!chart.drag) leaveInspection(chart); });
    chart.plot.addEventListener('focus', function () {
      if (chart.plot.matches(':focus-visible')) inspectSpot(chart, Math.max(0, chart.active));
    });
    chart.plot.addEventListener('blur', function () { leaveInspection(chart); });
    // A committed point click stops here, so a zoomable figure around the chart stays in place.
    chart.plot.addEventListener('click', function (event) {
      if (chart.dragged) {
        chart.dragged = false;
        event.preventDefault();
        return;
      }
      if (event.button !== 0 || !chart.svg || !chart.group || chart.model.selectionMode === 'follow') return;
      pick(chart, event);
      if (activate(chart)) event.preventDefault();
    });
    chart.plot.addEventListener('keydown', function (event) {
      var def = addonOf(chart.model);
      if (def?.keys && chart.svg && def.keys(chart, event, kit)) return;
      if (keyRange(chart, event)) return;
      if (event.key === 'Escape') return leaveInspection(chart);
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
      else return;
      event.preventDefault();
      inspectSpot(chart, i);
    });

    if (typeof ResizeObserver === 'function') {
      var frame = 0;
      chart.observer = new ResizeObserver(function () {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(function () {
          if (!chart.plot.hidden && Math.round(chart.plot.clientWidth) !== chart.width) draw(chart);
        });
      });
      chart.observer.observe(chart.plot);
    }

    chart.api = {
      element: host,
      // Returns false, keeping the current chart, when the new data fails validation.
      update: function (next) {
        var model = chartModel(host, next);
        if (!report(model, host, true)) return false;
        function apply() { return replace(next, model, 'api'); }
        return DocForm._component ? DocForm._component.transaction(apply) : apply();
      },
      model: function () { return copyChart(chart.model); },
      // coords(clientX, clientY) reads the data position under a viewport point.
      coords: function (cx, cy) {
        if (!chart.svg || chart.plot.hidden) return null;
        var box = chart.svg.getBoundingClientRect();
        var k = box.width && chart.width ? chart.width / box.width : 1;
        var px = (cx - box.left) * k;
        if (chart.playhead !== null && px > chart.geom.x(chart.playhead)) return null;
        var hit = readAt(chart.view, chart.geom, px, (cy - box.top) * k);
        if (!hit) return null;
        var g = chart.geom;
        hit.plot = { left: box.left + g.left / k, right: box.left + g.right / k, top: box.top + g.top / k, bottom: box.top + g.bottom / k };
        return hit;
      },
      spec: function () { return copyChart(chart.spec); },
      visible: function (name, on) {
        var series = chart.model.series.find(function (s) { return s.key === name || s.name === name; });
        if (on === undefined) return !series || !chart.hidden[series.key];
        return series ? chart.api.setSeriesVisible(series.key, on) : false;
      },
      setSeriesVisible: function (key, on) {
        if (typeof on !== 'boolean' || !chart.model.series.some(function (s) { return s.key === key; })) return false;
        return write(function () {
          if (!on !== !!chart.hidden[key]) setVisible(chart, key, on);
        });
      },
      range: function (next) {
        return arguments.length ? chart.api.setRange(next) : chart.range && chart.range.slice();
      },
      setRange: function (next) {
        var value = next;
        if (next !== null) {
          var read = chart.model.x.time ? toTime : toNumber;
          value = Array.isArray(next) && next.length === 2 ? clampRange(chart.model, read(next[0]), read(next[1])) : false;
          if (value === false) return false;
        } else if (!domain(chart.model)) return false;
        return write(function () { if (!sameRange(value, chart.range)) setRange(chart, value); });
      }
    };
    function write(fn) {
      function apply() {
        chart.origin = 'api';
        try { fn(); } finally { chart.origin = null; }
        return true;
      }
      return DocForm._dataViews ? DocForm._dataViews.transaction(apply) : apply();
    }
    function replace(next, model, origin) {
      chart.updating = true;
      if (origin === 'reset') {
        chart.hidden = Object.create(null);
        chart.range = null;
        if (chart.plot.hidden) setTable(chart, false);
      }
      Object.keys(chart.hidden).forEach(function (name) {
        var compatible = model.filterSeries ? model.filterSeries.includes(name) :
          (model.type === 'pie' || model.series.length > 1) && model.series.some(function (s) { return s.key === name; });
        if (!compatible) delete chart.hidden[name];
      });
      if (!model.noMatches) chart.range = keepRange(chart.range, chart.model, model);
      chart.model = model;
      var notifyPlayback = reconcilePlayhead(chart, origin);
      if (chart.xGroup && chart.xGroup.owner === chart && !linearX(model)) leaveInspection(chart, origin);
      chart.spec = next;
      chart.view = viewOf(model, chart.hidden, chart.range);
      watch(chart);
      typeClasses(host, chart.model);
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
        if (!chart.plot.hidden) draw(chart, true);
      }
      chart.updating = false;
      if (notifyPlayback) notifyPlayback();
      return true;
    }
    chart.replace = replace;
    chart.remove = function (origin) {
      stopMotion(chart);
      cancelEntrance(chart);
      charts.delete(host);
      if (chart.xGroup) chart.xGroup.members.delete(host);
      var notifyPlayback = reconcilePlayhead(chart, origin);
      leaveInspection(chart, origin || 'api');
      if (chart.observer) chart.observer.disconnect();
      if (chart.unfollow) chart.unfollow();
      if (sourceTable) host.insertBefore(sourceTable, head);
      head.remove();
      chart.plot.remove();
      chart.table.remove();
      typeClasses(host, null);
      host.classList.remove('df-chart', 'is-table', 'df-chart-await');
      if (notifyPlayback) notifyPlayback();
    };
    charts.set(host, chart);
    chart.xGroup = joinXGroup(chart);
    var notifyPlayback = reconcilePlayhead(chart, origin);
    if (chart.playhead !== null) fillTable(chart);
    watch(chart);
    awaitEntrance(chart);
    draw(chart);
    if (notifyPlayback) notifyPlayback();
    return chart.api;
  }

  // is-<type> classes for the base type and, for add-on types, the add-on type too; null removes them.
  function typeClasses(host, model) {
    String(host.getAttribute('class') || '').split(/\s+/).forEach(function (name) {
      var type = name.slice(3);
      if (/^is-/.test(name) && (Object.hasOwn(TYPES, type) || Object.hasOwn(addons, type))) host.classList.remove(name);
    });
    host.classList.remove('is-horizontal', 'is-stacked');
    if (!model) return;
    host.classList.add('is-' + model.type);
    if (model.addon) host.classList.add('is-' + model.addon);
    if (model.orientation === 'horizontal') host.classList.add('is-horizontal');
    if (model.stack) host.classList.add('is-stacked');
  }

  function copyChart(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return value.map(copyChart);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(function (entry) { return [entry[0], copyChart(entry[1])]; }));
    }
    return value;
  }

  function cellText(cell) {
    return cell.textContent.trim();
  }

  function overrides(host, spec) {
    var type = DocForm.data(host, 'chart', '');
    if (Object.hasOwn(TYPES, type) || Object.hasOwn(addons, type) || addonFeature(type)) spec.type = type;
    var height = DocForm.data(host, 'height', null);
    if (height !== null) {
      if (DocForm._boot) {
        var h = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(height.trim()) ? Number(height) : NaN;
        if (validHeight(h)) spec.height = h;
        else invalidOption(host, 'height', 'Use a finite chart height greater than 80.', height);
      } else if (isFinite(parseFloat(height))) {
        spec.height = parseFloat(height);
      }
    }
    var gaps = DocForm.data(host, 'gaps', null);
    if (gaps !== null) spec.gaps = gaps;
    ['orientation', 'stack'].forEach(function (name) {
      var value = DocForm.data(host, name, null);
      if (value !== null) spec[name] = value.trim();
    });
    var group = DocForm.data(host, 'selection-group', null);
    if (group !== null) spec.selectionGroup = group;
    ['brush', 'rescale', 'toggles'].forEach(function (name) {
      if (DocForm.data(host, name, null) !== null) spec[name] = DocForm.flag(host, name);
    });
    var refs = DocForm.data(host, 'reference-lines', null);
    if (refs !== null) {
      try {
        var lines = JSON.parse(refs);
        if (DocForm._boot && lines !== null && !Array.isArray(lines)) throw new Error('Expected an array or null.');
        spec.referenceLines = lines;
      } catch (e) {
        if (DocForm._boot) invalidOption(host, 'referenceLines', 'Use a JSON array of reference lines or null.', refs);
        else DocForm.warnOnce('chart-refs:' + e.message, 'Chart reference lines are not valid JSON: ' + e.message, host);
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

  function validHeight(value) {
    return isNum(value) && value > 80;
  }

  function invalidOption(host, key, correction, input) {
    DocForm._boot.report('chart-option', 'chart', host, 'Invalid chart option "' + key + '".', correction, [key, input]);
  }

  function configuredSpec(host, spec, options) {
    var boot = DocForm._boot;
    if (!boot) return spec || {};
    var layers = boot.optionLayers('chart', host.id).concat([spec, options]);
    var result = {};
    layers.forEach(function (layer) {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return;
      var value = Object.assign({}, layer);
      delete value.instances;
      if ('height' in value && !validHeight(value.height)) {
        invalidOption(host, 'height', 'Use a finite chart height greater than 80.', value.height);
        delete value.height;
      }
      if ('motion' in value && typeof value.motion !== 'boolean') {
        invalidOption(host, 'motion', 'Use true or false.', value.motion);
        delete value.motion;
      }
      if ('referenceLines' in value && value.referenceLines !== null && !Array.isArray(value.referenceLines)) {
        invalidOption(host, 'referenceLines', 'Use an array of reference lines or null.', value.referenceLines);
        delete value.referenceLines;
      }
      ['x', 'y'].forEach(function (axis) {
        if (typeof value[axis] === 'string') value[axis] = { label: value[axis] };
      });
      result = boot.merge(result, value);
    });
    return result;
  }

  function chartModel(host, spec) {
    var model = normalize(spec);
    if (DocForm._items) model.selectionMode = DocForm._items.mode(host, 'chart');
    model.motion = resolveMotion(animateAttribute(host), spec, DocForm._boot ? DocForm._boot.optionLayers('chart', host.id) : []);
    return model;
  }

  function animateAttribute(host) {
    if (!host.hasAttribute || !host.hasAttribute('data-df-animate')) return null;
    return DocForm._boot && DocForm._component ? DocForm._component.flag(host, 'animate', 'chart', true) :
      DocForm.flag(host, 'animate');
  }

  function readMarkup(host, options) {
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
      var keys = cells.map(function (r) { return r.map(function (cell) { return DocForm.data(cell, 'key', '').trim() || null; }); });
      var named = DocForm.data(host, 'chart', '');
      var type = named === 'pie' ? 'pie' : null;
      var tableHook = Object.hasOwn(addons, named) ? addons[named].fromTable : null;
      var text = cells.map(function (r) { return r.map(cellText); });
      spec = tableHook ? tableHook(text, keys) : fromTable(text, type, keys);
      var heads = DocForm.all('tr', table)[0];
      (type !== 'pie' && !tableHook && heads ? DocForm.all('th, td', heads) : []).slice(1).forEach(function (cell, i) {
        var s = spec.series[i];
        if (!s) return;
        s.role = DocForm.data(cell, 'role', null);
        s.color = DocForm.data(cell, 'color', null);
      });
    } else if (!options) return null;
    spec = overrides(host, configuredSpec(host, spec, options));
    return { spec: spec, table: table, useSourceTable: !script };
  }

  function fromMarkup(host, options) {
    if (host.hasAttribute('data-df-source')) {
      var input = namedInput(host, options);
      return input ? chartController(host, null, input) : null;
    }
    var input = readMarkup(host, options);
    if (!input) return null;
    var model = chartModel(host, input.spec);
    if (!report(model, host)) return null;
    var table = input.table;
    // Keyed source cells join the group too, so the table view shows the same selection.
    if (table && model.selectionGroup && model.selectionMode !== 'publish') {
      DocForm.all('[' + KEY + ']', table).forEach(function (cell) {
        tagKey(model, cell, { key: DocForm.data(cell, 'key') });
      });
    }
    if (!DocForm._dataViews) return build(host, model, table, input.spec, input.useSourceTable);
    return chartController(host, { spec: input.spec, model: model, table: table, useSourceTable: input.useSourceTable });
  }

  var chartControllers = new WeakMap();
  var namedInputs = new WeakMap();
  var groupedSpecs = new WeakSet();

  function groupedSeries(rows, mapping, spec, keys, interval) {
    var data = DocForm._dataSource;
    var declared = new Map();
    var descriptors = mapping.group.series;
    if (descriptors !== undefined && !Array.isArray(descriptors)) {
      throw new Error('Use an array of series descriptors for chart mapping.group.series.');
    }
    (descriptors || []).forEach(function (series) {
      var key = series && data.key(series.key);
      if (!key || declared.has(key) || ['label', 'role', 'color'].some(function (field) {
        return series[field] !== undefined && typeof series[field] !== 'string';
      })) throw new Error('Chart mapping.group.series needs distinct string keys and optional string labels, roles, and colors.');
      declared.set(key, series);
    });
    var groups = new Map();
    var xType = axisType(spec.x);
    var yLog = axisType(spec.y) === 'log';
    rows.forEach(function (record, i) {
      var at = ' in record ' + (i + 1) + '.';
      var key = data.key(record[keys[2]]);
      if (!key) throw new Error('Use a nonempty string group key for field ' + JSON.stringify(keys[2]) + at);
      var x = xType === 'time' ? toTime(record[keys[0]]) : toNumber(record[keys[0]]);
      if (!isNum(x) || (xType === 'log' && x <= 0)) {
        throw new Error('Use a valid x coordinate for field ' + JSON.stringify(keys[0]) + at);
      }
      var raw = record[keys[1]];
      var y = toNumber(raw);
      var missing = raw === null || (typeof raw === 'string' && !raw.trim());
      if (!missing && (!isNum(y) || (yLog && y <= 0))) {
        throw new Error('Use a valid chart value for field ' + JSON.stringify(keys[1]) + at);
      }
      var pointKey = keys.length === 4 ? data.key(record[keys[3]]) : null;
      if (keys.length === 4 && !pointKey) {
        throw new Error('Use a nonempty string point key for field ' + JSON.stringify(keys[3]) + at);
      }
      if (!groups.has(key)) groups.set(key, new Map());
      var points = groups.get(key);
      if (points.has(x)) {
        throw new Error('Duplicate x ' + x + ' for series ' + JSON.stringify(key) + ' in records ' +
          points.get(x).row + ' and ' + (i + 1) + '. Keep one observation per series and x.');
      }
      points.set(x, { point: { x: x, y: y, key: pointKey, interval: interval(record) }, row: i + 1 });
    });
    var order = Array.from(declared.keys()).filter(function (key) { return groups.has(key); })
      .concat(Array.from(groups.keys()).filter(function (key) { return !declared.has(key); }).sort());
    return order.map(function (key) {
      var series = declared.get(key) || {};
      return { key: key, name: series.label ?? key, role: series.role, color: series.color,
        data: Array.from(groups.get(key).values(), function (entry) { return entry.point; })
          .sort(function (a, b) { return a.x - b.x; })
      };
    });
  }

  function mappedSpec(value, mapping, base, maxRows, parsed, truncate, filter, values) {
    var data = DocForm._dataSource;
    // Add-on types with their own record shape name the fields they read and build the spec from the records.
    var custom = typeof base.type === 'string' && Object.hasOwn(addons, base.type) ? addons[base.type] : null;
    if (custom && custom.mapFields) {
      var wanted = data.fields(value, custom.mapFields(mapping));
      if (parsed && parsed.type === 'csv') {
        var absent = wanted.find(function (key) { return !parsed.columns.includes(key); });
        if (absent !== undefined) throw new Error('Required CSV chart field ' + JSON.stringify(absent) + ' is missing.');
      }
      if (value.length > maxRows) throw new Error('The chart exceeds its ' + maxRows + '-row limit.');
      var picked = filter ? filter.rows(value, parsed, values) : value;
      var built = Object.assign({}, base);
      delete built.data;
      return { spec: custom.mapRecords(picked, wanted, mapping, built, kit), rows: picked.length, filterSeries: null };
    }
    var grouped = mapping && mapping.group !== undefined;
    if (grouped) {
      if (!mapping.group || typeof mapping.group !== 'object' || Array.isArray(mapping.group) || mapping.series != null) {
        throw new Error('Use chart mapping.group with a field and optional series descriptors, or use mapping.series for columns.');
      }
      if ((base.type && base.type !== 'line' && base.type !== 'scatter') || Array.isArray(base.categories)) {
        throw new Error('Grouped chart mapping needs a line or scatter chart with a numeric or time x axis.');
      }
    } else if (!mapping || !Array.isArray(mapping.series) || !mapping.series.length) {
      throw new Error('Chart mapping needs an x field and either column series or a value and group field.');
    }
    if (base.type === 'pie' && mapping.series.length !== 1) {
      throw new Error('Pie chart mapping needs one label field and one value column.');
    }
    var x = typeof mapping.x === 'string' ? mapping.x : mapping.x && mapping.x.field;
    var fields = grouped ? [x, mapping.value, mapping.group.field] :
      [x].concat(mapping.series.map(function (s) { return s && s.field; }));
    if (mapping.pointKey !== undefined) fields.push(mapping.pointKey);
    var keys = data.fields(value, fields, grouped);
    if (parsed && parsed.type === 'csv') {
      var missing = keys.find(function (key) { return !parsed.columns.includes(key); });
      if (missing !== undefined) throw new Error('Required CSV chart field ' + JSON.stringify(missing) + ' is missing.');
    }
    if (value.length > maxRows && (grouped || !truncate || filter)) throw new Error('The chart exceeds its ' + maxRows + '-row limit.');
    var rows = filter ? filter.rows(value, parsed, values) : value.slice(0, maxRows);
    var axis = Object.assign({}, typeof base.x === 'string' ? { label: base.x } : base.x);
    axis.label = mapping.x && mapping.x.label !== undefined ? mapping.x.label : axis.label ?? keys[0];
    var spec = Object.assign({}, base, { x: axis });
    delete spec.data;

    if (spec.type === 'pie') {
      var label = mapping.series[0].label ?? keys[1];
      spec.y = Object.assign({ label: label }, typeof base.y === 'string' ? { label: base.y } : base.y);
      function sliceKey(record) {
        return data.key(record[mapping.pointKey === undefined ? keys[0] : keys[2]]);
      }
      spec.data = rows.map(function (record) {
        var key = sliceKey(record);
        if (mapping.pointKey !== undefined && !key) throw new Error('Mapped pie slices need nonempty point keys.');
        return { label: record[keys[0]], value: record[keys[1]], key: key };
      });
      return { spec: spec, rows: rows.length, filterSeries: filter ? value.map(sliceKey).filter(Boolean) : null };
    }

    function readInterval(descriptor, field, at) {
      var interval = data.interval(value, descriptor, parsed, at);
      if (descriptor !== undefined) value.forEach(function (record, i) {
        var supplied = interval(record);
        if (!supplied) return;
        if (!isNum(toNumber(record[field]))) {
          throw new Error(at + ' needs a finite estimate in record ' + (i + 1) + '.');
        }
        if (spec.type !== 'bar' && axisType(spec.y) === 'log' && supplied.lower <= 0) {
          throw new Error(at + ' needs positive interval bounds on a log y axis in record ' + (i + 1) + '.');
        }
      });
      return interval;
    }

    if (grouped) {
      var interval = readInterval(mapping.interval, keys[1], 'Grouped chart value ' + JSON.stringify(keys[1]));
      spec.series = groupedSeries(rows, mapping, spec, keys, interval);
      groupedSpecs.add(spec);
      return { spec: spec, rows: rows.length, filterSeries: filter ?
        Array.from(new Set(value.map(function (record) { return data.key(record[keys[2]]); }).filter(Boolean))) : null };
    }
    var ids = new Set();
    spec.series = mapping.series.map(function (s, i) {
      var id = data.key(s.key);
      if (!id || ids.has(id) || (s.label !== undefined && typeof s.label !== 'string')) {
        throw new Error('Mapped chart series need distinct keys and string labels.');
      }
      ids.add(id);
      var interval = readInterval(s.interval, keys[i + 1], 'Chart series ' + JSON.stringify(id));
      return { key: id, name: s.label ?? keys[i + 1], role: s.role, color: s.color,
        data: rows.map(function (record) {
          var pointKey = mapping.pointKey === undefined ? null : data.key(record[keys[keys.length - 1]]);
          if (mapping.pointKey !== undefined && !pointKey) throw new Error('Each mapped point needs a nonempty string key.');
          var x = record[keys[0]];
          var y = record[keys[i + 1]];
          if (x === null || typeof x === 'boolean' || (axisType(axis) === 'time' && toTime(x) === null) ||
              (toNumber(y) === null && !(spec.gaps === 'break' && (y === null || y === '')))) {
            throw new Error('Mapped chart coordinates must be valid for their axes.');
          }
          return { x: x, y: y, key: pointKey, interval: interval(record) };
        })
      };
    });
    return { spec: spec, rows: rows.length };
  }

  function preparedChart(host, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Supply a chart spec object.');
    var customInput = typeof input.type === 'string' && addons[input.type]?.prepare;
    if (!customInput) {
      var validSeries = Array.isArray(input.series) && input.series.every(function (series) {
        return series && Array.isArray(series.data) &&
          (series.key === undefined || (typeof series.key === 'string' && series.key.trim()));
      });
      if (input.series != null ? !validSeries : !Array.isArray(input.data)) {
        throw new Error('Supply a chart spec with data or series containing data arrays.');
      }
    }
    var spec = copyChart(input);
    var model = chartModel(host, spec);
    if (model.errors.length) throw new Error('Chart update ignored; the last valid chart stays. ' + model.errors.join(' '));
    return { spec: spec, model: model, grouped: groupedSpecs.has(input) };
  }

  function namedInput(host, instance) {
    if (!instance && namedInputs.has(host)) return namedInputs.get(host);
    var data = DocForm._dataSource;
    if (!data) {
      DocForm._dataViews.issue('chart', host, 'Enable data to use a named chart source.');
      return null;
    }
    var options = data.options('chart', host, instance);
    var filter;
    try { filter = data.filter(options); }
    catch (error) { DocForm._dataViews.issue('chart', host, error.message); return null; }
    var markup = readMarkup(host, instance || {});
    if (!markup) return null;
    var base = markup.spec;
    function mapped(value, dataset, maxRows, truncate, values) {
      var result = mappedSpec(value, options.mapping, base, maxRows,
        value === dataset.snapshot.value ? dataset.parsed : null, truncate, filter, values);
      var prepared = preparedChart(host, result.spec);
      if (filter) {
        prepared.model.filterSeries = result.filterSeries || prepared.model.series.map(function (series) { return series.key; });
        prepared.model.noMatches = result.rows === 0;
        if (prepared.grouped && result.spec.toggles === true && prepared.model.series.length) prepared.model.toggles = true;
      }
      return prepared;
    }
    var input = {
      table: host.querySelector(':scope > table'),
      upload: function (entry, cap) {
        if (!options.mapping && options.transform === undefined) return null;
        var dataset = data.input(entry, data.key(host.getAttribute('data-df-source')), 0);
        var caps = DocForm.dataset.limits(host, options);
        if (dataset.bytes > caps.maxBytes) throw new Error('The file exceeds this chart’s size limit.');
        var value = data.transform(options, host, dataset);
        if (options.transformOutput === 'spec') return { spec: value, rows: null, total: null };
        var maxRows = Math.min(cap, caps.maxRows);
        if (!filter) {
          var result = mappedSpec(value, options.mapping, base, maxRows,
            value === dataset.snapshot.value ? dataset.parsed : null, true);
          return { spec: result.spec, total: value.length, rows: result.rows };
        }
        if (value !== dataset.snapshot.value && data.size(JSON.stringify(value)) > caps.maxBytes) {
          throw new Error('Transformed data exceeds the chart’s size limit.');
        }
        function refilter(values) {
          var prepared = mapped(value, dataset, maxRows, false, values);
          if (filter.scope) prepared.refilter = refilter;
          return prepared;
        }
        var token = {};
        chartUploads.set(token, refilter);
        return { spec: token, rows: null, total: null };
      }
    };
    input.binding = data.binding('chart', host, options, function (value, mapping, source, fullSpec, caps, values) {
      return fullSpec ? preparedChart(host, value) : mapped(value, source, caps.maxRows, false, values);
    }, filter);
    namedInputs.set(host, input);
    return input;
  }

  function chartController(host, original, named) {
    var runtime = DocForm._dataViews;
    var sourceTable = named ? named.table : original.table;
    var groupColors = new Map();
    var controller = runtime.controller('chart', host, {
      prepare: function (spec) {
        var refilter = chartUploads.get(spec);
        return refilter ? refilter() : preparedChart(host, spec);
      },
      render: function (prepared, origin) {
        var current = charts.get(host);
        if (!prepared) { if (current) current.remove(origin); return; }
        // Remember palette slots only for committed views so rejected inputs cannot affect later colors.
        if (prepared.grouped) prepared.model.series.forEach(function (series) {
          if (series.role || series.color) return;
          if (!groupColors.has(series.key) && groupColors.size < COLORS) groupColors.set(series.key, groupColors.size);
          series.index = groupColors.get(series.key) ?? COLORS;
        });
        if (current) current.replace(prepared.spec, prepared.model, origin);
        else {
          build(host, prepared.model, sourceTable, prepared.spec, prepared === original && original.useSourceTable, origin);
          charts.get(host).controller = controller;
        }
      },
      snapshot: function () {
        var chart = charts.get(host);
        return chart ? { hiddenSeries: Object.keys(chart.hidden), range: chart.api.range(), table: chart.plot.hidden } : null;
      },
      resetReader: true
    }, 'view');
    var api = controller.api;
    api.element = host;
    chartBaselines.set(api, function () {
      var base = controller.baseline();
      return base && copyChart(base.spec);
    });
    ['model', 'spec', 'coords', 'visible', 'range', 'setSeriesVisible', 'setRange'].forEach(function (method) {
      api[method] = function () {
        var chart = charts.get(host);
        return chart ? chart.api[method].apply(null, arguments) : null;
      };
    });
    chartControllers.set(host, api);
    if (named) named.binding.mount(controller);
    else controller.start(original);
    return api;
  }

  function chart(target, spec) {
    var host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host || !charts) {
      DocForm.warnOnce('chart-target:' + target, 'DocForm.chart could not find its element.', target);
      return null;
    }
    var controller = chartControllers.get(host);
    if (controller) { controller.update(spec); return controller; }
    var existing = charts.get(host);
    if (existing) {
      existing.api.update(spec);
      return existing.api;
    }
    var model = chartModel(host, spec || {});
    if (!report(model, host)) return null;
    var original = { spec: copyChart(spec || {}), model: model, table: null };
    return DocForm._dataViews ? chartController(host, original) : build(host, model, null, spec || {});
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
  chart.stackLayout = stackLayout;
  chart.wrapLabel = wrapLabel;
  chart.toNumber = toNumber;
  chart.toTime = toTime;
  chart.timeTicks = timeTicks;
  chart.timeTickFormat = timeTickFormat;
  chart.motion = {
    between: between, ease: ease, parseColor: parseColor, markId: markId, addMark: addMark, match: matchMarks,
    allowed: motionAllowed, resolve: resolveMotion, entrance: entranceChanges
  };
  chart.addon = addon;
  chart.addons = function () { return Array.from(addonFeatures); };
  chart.scale = function (name) { return Object.hasOwn(scales, name) ? scales[name] : null; };
  chart.legend = function (name) { return Object.hasOwn(legends, name) ? legends[name] : null; };
  scales.linear = linear;
  scales.log = log;
  scales.time = linear;
  // Helpers handed to add-on hooks, so add-ons draw with the same scales, colours, keys, and readouts as the core.
  var kit = {
    svg: svg, html: html, paint: paint, legendKey: key, tagKey: tagKey, barPath: barPath, whisker: whisker,
    ticks: ticks, logTicks: logTicks, timeTicks: timeTicks, tickFormat: tickFormat, logTickFormat: logTickFormat,
    format: format, toNumber: toNumber, isNum: isNum, extent: extent, intervalReadout: intervalReadout, row: row,
    markId: markId, addMark: addMark, scale: chart.scale, COLORS: COLORS, CHAR: CHAR, inspect: inspectSpot, hide: hide
  };
  chart.get = function (target) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    var c = charts && charts.get(el);
    return chartControllers.get(el) || (c ? c.api : null);
  };
  var chartBaselines = new WeakMap();
  var chartUploads = new WeakMap();
  chart.xGroup = function (name) {
    var group = xGroups.get(DocForm._items.key(name));
    return group ? group.api : null;
  };
  chart._positionHosts = function (name, pending) {
    var group = xGroups.get(name);
    return DocForm.all('[data-df-x-group]').filter(function (host) {
      return (group && group.members.has(host)) ||
        (pending && host.hasAttribute('data-df-chart') && xGroupName(host) === name);
    });
  };
  chart._playback = function (host, name, reconcile, checkpoint) {
    var group = name ? xGroups.get(name) : null;
    var target = charts.get(host);
    if (!target || playbackFor(target) || (name && !group) ||
      (group && Array.from(group.members).some(function (member) { return playbacks.has(member); }))) return null;
    var playback = { reference: host, group: group, reconcile: reconcile, checkpoint: checkpoint, x: null };
    if (group) group.playback = playback;
    else playbacks.set(host, playback);
    return function (x, origin) {
      paintPlayback(playback, x, origin);
    };
  };
  chart._upload = function (api, entry, cap) {
    var named = namedInputs.get(api.element);
    return named ? named.upload(entry, cap) : null;
  };
  chart._baseline = function (api) { return chartBaselines.get(api)?.() || api.spec(); };
  chart._embedded = function (host, spec) {
    var current = charts.get(host);
    if (current) return current.api.update(spec);
    var model = chartModel(host, spec);
    return report(model, host) ? build(host, model, null, spec) : null;
  };
  chart._remove = function (host) {
    var chart = charts.get(host);
    if (chart) chart.remove();
  };
  chart.mount = function (target, options) {
    var host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host || !charts || !host.querySelector) return null;
    return chart.get(host) || fromMarkup(host, options);
  };
  chart._selectionModel = function (host) {
    var mounted = charts.get(host);
    if (mounted) return mounted.model;
    if (!host.hasAttribute('data-df-chart')) return null;
    if (host.hasAttribute('data-df-source')) {
      if (DocForm._boot && !DocForm._boot.setupComplete) return null;
      var named = namedInput(host);
      try { return named ? named.binding.read().model : null; }
      catch (error) { DocForm._dataViews.issue('chart', host, error.message); return null; }
    }
    var input = readMarkup(host);
    return input && chartModel(host, input.spec);
  };
  DocForm.chart = chart;

  if (DocForm._items) DocForm._items.scan('chart', function () {
    DocForm.all('[data-df-chart]').forEach(function (host) {
      DocForm._selection.ensure(DocForm.data(host, 'selection-group', null));
      var model = chart._selectionModel(host);
      if (!model || model.errors.length || !model.selectionGroup) return;
      var keys = model.series.flatMap(function (series) {
        return series.points.map(function (point) { return point.key; }).filter(Boolean);
      });
      var seeded = keys.length && model.selectionMode !== 'follow' &&
        DocForm._items.flag(host, 'selection-seed', 'chart');
      DocForm._selection.collect(model.selectionGroup, keys, seeded ? [[host, keys[0]]] : []);
    });
  });

  DocForm.register('chart', function () {
    DocForm.all('[data-df-chart]').forEach(function (host) {
      if (!chart.get(host)) fromMarkup(host);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
