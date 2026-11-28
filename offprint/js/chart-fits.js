// Supplied fits on line and scatter charts: fit curves, optional uncertainty bands, and fit statistics drawn from the
// spec's fits array (or data-op-fits JSON) with nothing estimated in the browser. Legend chips hide and show each fit.
// With residuals: true, a panel under the plot shows each observation minus its supplied fitted value on the same x
// axis, keyed and read like the points above it.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || !OffPrint._chart) {
    if (typeof console !== 'undefined') console.warn('[offprint] chart-fits.js needs chart.js loaded before it.');
    return;
  }

  var PANEL = 72;
  var PANEL_MIN = 48;
  var PANEL_MAX = 200;
  var states = new WeakMap();

  function plain(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function blank(value) {
    return value === null || value === undefined || (typeof value === 'string' && !value.trim());
  }

  function seriesKey(model, name) {
    var found = model.series.find(function (s) { return s.key === name || s.name === name; });
    return found ? found.key : null;
  }

  // Fits and residuals read a numeric or time x on line and scatter charts.
  function supported(model, what) {
    if (model.addon || (model.type !== 'line' && model.type !== 'scatter')) {
      throw new Error(what + ' apply to line and scatter charts.');
    }
    if (model.categories) throw new Error(what + ' need a numeric or time x axis, not text categories.');
  }

  function readX(model, value, kit) {
    return model.x.time ? kit.toTime(value) : kit.toNumber(value);
  }

  // Rows of numbers sorted by strictly increasing x, each value positive on a log axis.
  function readRows(model, input, at, kit, names) {
    var size = names.length;
    if (!Array.isArray(input) || input.length < 2) {
      throw new Error(at + ' needs at least two [' + names.join(', ') + '] points.');
    }
    var rows = [];
    input.forEach(function (entry, i) {
      var raw = Array.isArray(entry) ? entry : plain(entry) ? names.map(function (name) { return entry[name]; }) : null;
      var row = raw && raw.length >= size ? raw.slice(0, size).map(function (v, k) {
        return k ? kit.toNumber(v) : readX(model, v, kit);
      }) : null;
      if (!row || row.some(function (v) { return v === null; })) {
        throw new Error(at + ' point ' + (i + 1) + ' needs finite ' + names.join(', ') + ' values.');
      }
      if (i && row[0] <= rows[i - 1][0]) {
        throw new Error(at + ' needs points sorted by increasing x; point ' + (i + 1) + ' is not after point ' + i + '.');
      }
      if (model.x.log && !(row[0] > 0)) {
        throw new Error(at + ' is on a log x axis and needs positive x values; point ' + (i + 1) + ' has ' + row[0] + '.');
      }
      if (model.y.log && row.slice(1).some(function (v) { return !(v > 0); })) {
        throw new Error(at + ' is on a log y axis and needs positive values; point ' + (i + 1) + ' has zero or less.');
      }
      if (size === 3 && row[1] > row[2]) {
        throw new Error(at + ' point ' + (i + 1) + ' needs a lower bound at or below its upper bound.');
      }
      rows.push(row);
    });
    return rows;
  }

  // ---- Input ----
  // Spec -> model.fits: [{ key, label, series, color, role, curve: [[x, y]], band: [[x, lower, upper]] | null, stats }].
  function normalizeFits(model, spec, kit) {
    var input = spec.fits;
    model.fits = [];
    if (input === undefined || input === null) return;
    if (!Array.isArray(input)) throw new Error('Chart fits must be an array.');
    if (!input.length) return;
    supported(model, 'Fits');
    var keys = new Set();
    input.forEach(function (f, i) {
      var at = 'Chart fit ' + (i + 1);
      if (!plain(f)) throw new Error(at + ' must be an object.');
      var key = f.key === undefined ? 'fit-' + (i + 1) : text(f.key);
      if (!key || keys.has(key)) throw new Error(at + ' needs a unique nonempty string key.');
      keys.add(key);
      at = 'Chart fit ' + JSON.stringify(key);
      var series = null;
      if (f.series !== undefined && f.series !== null) {
        series = seriesKey(model, String(f.series));
        if (!series) throw new Error(at + ' names an unknown series ' + JSON.stringify(f.series) + '.');
      } else if (model.series.length === 1) series = model.series[0].key;
      var owner = series && model.series.find(function (s) { return s.key === series; });
      var label = f.label === undefined || f.label === null ? (owner && owner.name ? owner.name + ' fit' : 'Fit ' + (i + 1)) :
        text(String(f.label));
      if (!label) throw new Error(at + ' needs a nonempty label.');
      var stats = f.stats === undefined || f.stats === null ? null : typeof f.stats === 'string' ? text(f.stats) :
        plain(f.stats) ? text(f.stats.text) : null;
      if (f.stats !== undefined && f.stats !== null && !stats) {
        throw new Error(at + ' needs stats as nonempty text or an object with text.');
      }
      var out = { key: key, label: label, series: series, color: null, role: null, stats: stats, index: i,
        curve: readRows(model, f.curve, at + ' curve', kit, ['x', 'y']), band: null };
      if (f.band !== undefined && f.band !== null) out.band = readRows(model, f.band, at + ' band', kit, ['x', 'lower', 'upper']);
      ['color', 'role'].forEach(function (name) {
        if (f[name] === undefined || f[name] === null) return;
        if (!text(f[name])) throw new Error(at + ' needs a nonempty string ' + name + '.');
        out[name] = text(f[name]);
      });
      model.fits.push(out);
    });
  }

  // Supplied fitted values on points become numbers; residuals: true | { height, label } adds the panel.
  function normalizeResiduals(model, spec, kit) {
    var input = spec.residuals;
    model.residuals = null;
    var fitted = 0;
    if (model.type !== 'pie') model.series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.fitted === undefined) return;
        if (blank(p.fitted)) { delete p.fitted; return; }
        var at = 'Chart series ' + JSON.stringify(s.name || s.key) + ' at x ' + kit.format(p.x, model.x);
        var v = kit.toNumber(p.fitted);
        if (v === null) throw new Error(at + ' needs a finite fitted value, not ' + JSON.stringify(p.fitted) + '.');
        if (model.y.log && !(v > 0)) throw new Error(at + ' is on a log y axis and needs a positive fitted value.');
        p.fitted = v;
        fitted++;
      });
    });
    if (input === undefined || input === null || input === false) return;
    if (input !== true && !plain(input)) throw new Error('Chart residuals must be true or an object with height and label.');
    supported(model, 'Residual panels');
    var options = input === true ? {} : input;
    var height = options.height === undefined || options.height === null ? PANEL : options.height;
    if (!isNum(height) || height < PANEL_MIN || height > PANEL_MAX) {
      throw new Error('Chart residuals height must be a number from ' + PANEL_MIN + ' to ' + PANEL_MAX + ' pixels.');
    }
    var label = options.label === undefined || options.label === null ? 'Residual' : text(String(options.label));
    if (!label) throw new Error('Chart residuals need a nonempty label.');
    if (!fitted) throw new Error('Residual panels need fitted values: give observed points a fitted value.');
    model.residuals = { height: height, label: label };
  }

  // ---- Named sources ----
  // mapping.fits builds curves and bands from the mapped records; a column series' fitted field, or mapping.fitted
  // with a grouped mapping, gives each point its fitted value. Blank values leave a record without one.
  function mapRecords(rows, mapping, spec, kit) {
    var time = !!spec.x && typeof spec.x === 'object' && spec.x.type === 'time';
    var xOf = function (v) { return time ? kit.toTime(v) : kit.toNumber(v); };
    var xField = typeof mapping.x === 'string' ? mapping.x : mapping.x && mapping.x.field;
    var groupField = mapping.group && mapping.group.field;
    var field = function (name, at) {
      var key = text(name);
      if (!key) throw new Error(at + ' needs a nonempty field name.');
      rows.forEach(function (record, i) {
        if (!Object.hasOwn(record, key)) throw new Error(at + ' field ' + JSON.stringify(key) + ' is missing in record ' + (i + 1) + '.');
      });
      return key;
    };
    if (mapping.fits !== undefined) {
      if (!Array.isArray(mapping.fits)) throw new Error('Chart mapping.fits needs an array of fit descriptors.');
      var mapped = mapping.fits.map(function (d, i) {
        var at = 'Chart mapping fit ' + (i + 1);
        if (!plain(d)) throw new Error(at + ' must be an object with a y field.');
        var x = field(d.x === undefined ? xField : d.x, at + ' x');
        var y = field(d.y, at + ' y');
        if ((d.lower === undefined) !== (d.upper === undefined)) throw new Error(at + ' needs both lower and upper fields for a band.');
        var lower = d.lower === undefined ? null : field(d.lower, at + ' lower');
        var upper = d.upper === undefined ? null : field(d.upper, at + ' upper');
        var group = d.group === undefined ? null : text(d.group);
        if (d.group !== undefined && (!group || !groupField)) throw new Error(at + ' needs a nonempty group with a grouped mapping.');
        var seen = new Map();
        var curve = [];
        var band = [];
        rows.forEach(function (record, r) {
          if (group && text(String(record[groupField])) !== group) return;
          if (blank(record[y])) return;
          var at0 = xOf(record[x]);
          if (at0 === null) throw new Error(at + ' needs a valid x in record ' + (r + 1) + '.');
          if (seen.has(at0)) {
            if (seen.get(at0) !== String(record[y])) throw new Error(at + ' has more than one value at x ' + record[x] + '.');
            return;
          }
          seen.set(at0, String(record[y]));
          curve.push([at0, record[y]]);
          if (lower && !blank(record[lower])) band.push([at0, record[lower], record[upper]]);
        });
        var order = function (a, b) { return a[0] - b[0]; };
        var out = { key: d.key, label: d.label, series: d.series === undefined ? group || undefined : d.series,
          color: d.color, role: d.role, stats: d.stats, curve: curve.sort(order) };
        if (lower) out.band = band.sort(order);
        return out;
      });
      spec.fits = (Array.isArray(spec.fits) ? spec.fits : []).concat(mapped);
    }
    if (groupField !== undefined && groupField !== null) {
      if (mapping.fitted === undefined) return;
      var fittedField = field(mapping.fitted, 'Chart mapping.fitted');
      var bySeries = new Map((spec.series || []).map(function (s) { return [s.key, s]; }));
      rows.forEach(function (record) {
        var s = bySeries.get(text(String(record[groupField])));
        var x = xOf(record[xField]);
        var point = s && s.data.find(function (p) { return p.x === x; });
        if (point && !blank(record[fittedField])) point.fitted = record[fittedField];
      });
      return;
    }
    (mapping.series || []).forEach(function (descriptor, i) {
      if (!descriptor || descriptor.fitted === undefined || !spec.series || !spec.series[i]) return;
      var key = field(descriptor.fitted, 'Chart series ' + JSON.stringify(descriptor.key) + ' fitted');
      spec.series[i].data.forEach(function (point, j) {
        if (rows[j] && !blank(rows[j][key])) point.fitted = rows[j][key];
      });
    });
  }

  // ---- State ----
  function stateOf(chart) {
    var state = states.get(chart.box);
    if (!state) {
      state = { chart: chart, hidden: new Set(), choice: null, kit: null, info: null, at: null };
      states.set(chart.box, state);
      state.track = OffPrint._readerState?.watch('chart-fits', chart.box, function () {
        return (state.chart.model.fits || []).length ? Array.from(state.hidden).sort() : undefined;
      }, function (hidden) {
        if (!Array.isArray(hidden) || !hidden.every(function (key) { return typeof key === 'string'; })) return false;
        return setHidden(state.chart, hidden, 'api');
      }, { order: 11, revision: function () { return OffPrint._chart._authoredRevision(chart.box); } });
    }
    state.chart = chart;
    return state;
  }

  function fitShown(chart, fit) {
    var state = stateOf(chart);
    return !state.hidden.has(fit.key) && (!fit.series || chart.view.series.some(function (s) { return s.key === fit.series; }));
  }

  // A series' residuals follow the fit drawn for it, when there is one.
  function residualsShown(chart, s) {
    var owner = (chart.model.fits || []).find(function (f) { return f.series === s.key; });
    return !owner || !stateOf(chart).hidden.has(owner.key);
  }

  function setHidden(chart, keys, origin) {
    var state = stateOf(chart);
    var fits = chart.model.fits || [];
    if (keys.some(function (key) { return !fits.some(function (f) { return f.key === key; }); })) return false;
    var next = new Set(keys);
    var previous = Array.from(state.hidden).sort();
    if (previous.join('\n') === Array.from(next).sort().join('\n')) return true;
    state.hidden = next;
    if (state.choice) state.choice.show(shownKeys(chart));
    if (state.kit) state.kit.redraw(chart);
    state.track?.(origin);
    if (typeof root.CustomEvent === 'function') {
      chart.box.dispatchEvent(new root.CustomEvent('op:chart:fits', { bubbles: true, detail: {
        shown: shownKeys(chart), hidden: Array.from(next).sort(), previous: previous, origin: origin
      } }));
    }
    return true;
  }

  function shownKeys(chart) {
    var hidden = stateOf(chart).hidden;
    return (chart.model.fits || []).map(function (f) { return f.key; }).filter(function (key) { return !hidden.has(key); });
  }

  // ---- Drawing ----
  function paintFit(el, fit, model, kit) {
    if (fit.role || fit.color) return kit.paint(el, { role: fit.role, color: fit.color });
    var s = fit.series && model.series.find(function (item) { return item.key === fit.series; });
    if (s) kit.paint(el, s);
    else el.style.setProperty('--op-series', 'var(--op-text-muted)');
  }

  function pathOf(points, px) {
    return points.map(function (pt, i) { return (i ? 'L' : 'M') + px('x', pt[0]) + ',' + px('y', pt[1]); }).join('');
  }

  function bandOf(points, px) {
    return points.map(function (pt, i) { return (i ? 'L' : 'M') + px('x', pt[0]) + ',' + px('y', pt[2]); }).join('') +
      points.slice().reverse().map(function (pt) { return 'L' + px('x', pt[0]) + ',' + px('y', pt[1]); }).join('') + 'Z';
  }

  function clipTo(group, id, area, kit) {
    var clip = kit.svg('clipPath', { id: id }, kit.svg('defs', {}, group));
    kit.svg('rect', { x: area.left, y: area.top, width: Math.max(0, area.right - area.left),
      height: Math.max(0, area.bottom - area.top) }, clip);
    return 'url(#' + id + ')';
  }

  function drawFits(chart, geom, kit, layer) {
    if (!(chart.model.fits || []).length || !geom || typeof geom.px !== 'function') return;
    stateOf(chart).kit = kit;
    var fits = chart.model.fits.filter(function (f) { return fitShown(chart, f); });
    if (!fits.length) return;
    var clip = clipTo(layer.group, chart.clip + '-fits', geom, kit);
    var bands = kit.svg('g', { class: 'op-chart-fit-bands', 'clip-path': clip }, layer.group);
    var curves = kit.svg('g', { class: 'op-chart-fit-curves', 'clip-path': clip }, layer.group);
    fits.forEach(function (f) {
      if (f.band) {
        var band = kit.svg('path', { d: bandOf(f.band, geom.px), class: 'op-chart-fit-band', 'data-op-fit': f.key }, bands);
        paintFit(band, f, chart.model, kit);
        kit.addMark(layer.marks, kit.markId('fit', 'band', { key: f.key }), { el: band, fade: true, order: 1, obstacle: false });
      }
      var curve = kit.svg('path', { d: pathOf(f.curve, geom.px), class: 'op-chart-fit-curve', 'data-op-fit': f.key }, curves);
      paintFit(curve, f, chart.model, kit);
      kit.addMark(layer.marks, kit.markId('fit', 'curve', { key: f.key }), { el: curve, fade: true, order: 1 });
    });
  }

  // Observed minus fitted for each shown point, with its series: [{ s, p, value }].
  function residualsOf(chart, view) {
    var out = [];
    view.series.forEach(function (s) {
      if (chart && !residualsShown(chart, s)) return;
      s.points.forEach(function (p) {
        if (isNum(p.fitted) && isNum(p.y)) out.push({ s: s, p: p, value: p.y - p.fitted });
      });
    });
    return out;
  }

  // The residual axis is symmetric about zero and covers every series, hidden ones too, unless the chart rescales.
  function panel(view, chart, kit) {
    if (!view.residuals) return null;
    var state = stateOf(chart);
    state.kit = kit;
    var source = view.rescale && residualsOf(chart, view).length ? view : chart.model;
    var reach = 0;
    residualsOf(null, source).forEach(function (r) { reach = Math.max(reach, Math.abs(r.value)); });
    var info = kit.ticks(-(reach || 1), reach || 1, 3);
    var fmt = kit.tickFormat(info);
    state.info = { min: info.min, max: info.max, ticks: info.ticks, fmt: fmt };
    return { height: view.residuals.height, labels: info.ticks.map(fmt) };
  }

  function drawResiduals(chart, geom, kit, layer) {
    var model = chart.view;
    var state = stateOf(chart);
    var area = geom && geom.panels && geom.panels.residuals;
    state.at = null;
    if (!model.residuals || !area || !state.info) return;
    var info = state.info;
    var y = kit.scale('linear')(info.min, info.max, area.bottom, area.top);
    var axis = kit.svg('g', { class: 'op-chart-residual-axis' }, layer.group);
    info.ticks.forEach(function (v) {
      var py = Math.round(y(v)) + 0.5;
      kit.svg('line', { x1: geom.left, x2: geom.right, y1: py, y2: py,
        class: v === 0 ? 'op-chart-residual-zero' : 'op-chart-residual-grid' }, axis);
      kit.svg('text', { x: geom.left - 8, y: py, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'op-chart-tick' }, axis)
        .textContent = info.fmt(v);
    });
    kit.svg('text', { x: 0, y: area.top - 8, class: 'op-chart-label' }, axis).textContent = model.residuals.label;
    var dots = kit.svg('g', { class: 'op-chart-residuals', 'clip-path': clipTo(layer.group, chart.clip + '-residuals',
      { left: geom.left - 4, right: geom.right + 4, top: area.top - 4, bottom: area.bottom + 4 }, kit) }, layer.group);
    var width = Math.max(1, geom.right - geom.left);
    var at = new Map();
    var spots = [];
    var groups = new Map();
    var byPoint = new Map();
    var byX = new Map();
    chart.spots.forEach(function (spot, index) {
      if (spot.p) byPoint.set(spot.p, index);
      else if (spot.x !== undefined) byX.set(String(spot.x), index);
    });
    residualsOf(chart, model).forEach(function (r) {
      var px = geom.px('x', r.p.x);
      if (px === null || px < geom.left - 0.5 || px > geom.right + 0.5) return;
      var py = y(Math.max(info.min, Math.min(info.max, r.value)));
      if (!groups.has(r.s)) {
        var g = kit.svg('g', { class: 'op-chart-series' }, dots);
        kit.paint(g, r.s);
        groups.set(r.s, g);
      }
      var dot = kit.svg('circle', { cx: px, cy: py, r: 3.5, class: 'op-chart-residual', 'data-op-x': String(r.p.x) }, groups.get(r.s));
      if (chart.playhead === null) kit.tagKey(model, dot, r.p);
      kit.addMark(layer.marks, kit.markId(r.s.key, 'residual', r.p), { el: dot, from: { r: 0 }, order: (px - geom.left) / width,
        obstacle: false });
      at.set(r.p, { px: px, py: py, s: r.s, value: r.value, el: dot });
      var index = byPoint.has(r.p) ? byPoint.get(r.p) : byX.get(String(r.p.x));
      if (index !== undefined) spots.push({ px: px, py: py, index: index });
    });
    state.at = at;
    chart.panelSpots = spots;
  }

  // ---- Reading ----
  function signed(v, axis, kit) {
    return (v > 0 ? '+' : '') + kit.format(v, axis);
  }

  // Readout rows give the supplied fitted value and the residual of each point being read.
  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    if (model.type !== 'line' && model.type !== 'scatter') return;
    var x = spot.p ? spot.p.x : spot.x;
    var pairs = model.type === 'line' ? model.series.map(function (s) {
      return { s: s, p: s.points.find(function (p) { return String(p.x) === String(x); }) };
    }) : spot.p ? [{ s: spot.s, p: spot.p }] : [];
    var previous = states.get(chart.box);
    if (previous && previous.at) previous.at.forEach(function (drawn) { drawn.el.classList.remove('is-active'); });
    pairs = pairs.filter(function (pair) { return pair.p && isNum(pair.p.fitted) && residualsShown(chart, pair.s); });
    if (!pairs.length) return;
    var state = stateOf(chart);
    pairs.forEach(function (pair) {
      var row = kit.html('div', 'op-chart-tip-row op-chart-fit-row', tip);
      kit.html('b', '', row, signed(pair.p.y - pair.p.fitted, model.y, kit));
      kit.html('span', '', row, 'residual' + (pairs.length > 1 && pair.s.name ? ' · ' + pair.s.name : '') +
        ' (fitted ' + kit.format(pair.p.fitted, model.y) + ')');
      var drawn = state.at && state.at.get(pair.p);
      if (drawn) {
        drawn.el.classList.add('is-active');
        kit.paint(kit.svg('circle', { cx: drawn.px, cy: drawn.py, r: 6, class: 'op-chart-ring' }, chart.overlay), pair.s);
      }
    });
  }

  // ---- Legend, table, and description ----
  function legend(chart, legendEl, kit) {
    var fits = chart.model.fits || [];
    if (!fits.length && !states.has(chart.box)) return;
    var state = stateOf(chart);
    state.kit = kit;
    state.choice = null;
    state.hidden = new Set(Array.from(state.hidden).filter(function (key) { return fits.some(function (f) { return f.key === key; }); }));
    if (!fits.length) return;
    var swatch = function (f) {
      var el = kit.html('span', 'op-chart-key is-fit' + (f.band ? ' has-band' : ''));
      el.setAttribute('aria-hidden', 'true');
      paintFit(el, f, chart.model, kit);
      return el;
    };
    if (!OffPrint._choices) {
      fits.forEach(function (f) {
        var item = kit.html('span', 'op-chart-legend-item op-chart-fit-item', legendEl);
        item.appendChild(swatch(f));
        kit.html('span', '', item, f.label);
        if (f.stats) kit.html('span', 'op-chart-fit-stats', item, f.stats);
      });
      return;
    }
    state.choice = OffPrint._choices.create({
      label: 'Fits shown', hideLabel: true, multiple: true, display: 'chips',
      className: 'op-chart-series-toggles op-chart-fit-toggles',
      options: fits.map(function (f) {
        return { value: f.key, label: f.label, swatch: swatch(f), note: f.stats || undefined,
          mark: function (el) { el.classList.add('op-chart-legend-item', 'op-chart-fit-toggle'); } };
      }),
      onChange: function (shown) {
        var current = state.chart;
        setHidden(current, (current.model.fits || []).map(function (f) { return f.key; })
          .filter(function (key) { return shown.indexOf(key) < 0; }), 'user');
      }
    });
    legendEl.appendChild(state.choice.el);
    state.choice.show(shownKeys(chart));
  }

  function rangeText(fit, rows, model, kit) {
    return kit.format(rows[0][0], model.x) + ' to ' + kit.format(rows[rows.length - 1][0], model.x);
  }

  function fitTable(view, kit, chart) {
    var fits = (view.fits || []).filter(function (f) { return !chart || fitShown(chart, f); });
    if (!fits.length) return null;
    var el = kit.html('table', 'op-chart-fits-table');
    kit.html('caption', '', el, 'Fits');
    var head = kit.html('tr', '', kit.html('thead', '', el));
    ['Fit', 'Series', 'Curve', 'Band', 'Statistics'].forEach(function (label) {
      kit.html('th', '', head, label).setAttribute('scope', 'col');
    });
    var body = kit.html('tbody', '', el);
    fits.forEach(function (f) {
      var tr = kit.html('tr', '', body);
      var s = f.series && view.series.find(function (item) { return item.key === f.series; });
      kit.html('th', '', tr, f.label).setAttribute('scope', 'row');
      kit.html('td', '', tr, s ? s.name || s.key : '');
      kit.html('td', '', tr, f.curve.length + ' points, ' + (view.x.label || 'x') + ' ' + rangeText(f, f.curve, view, kit));
      kit.html('td', '', tr, f.band ? (view.x.label || 'x') + ' ' + rangeText(f, f.band, view, kit) : 'None');
      kit.html('td', '', tr, f.stats || '');
    });
    return el;
  }

  function residualTable(view, kit, chart) {
    if (!view.residuals) return null;
    var list = residualsOf(chart, view);
    if (!list.length) return null;
    var el = kit.html('table', 'op-chart-residuals-table');
    kit.html('caption', '', el, 'Residuals');
    var head = kit.html('tr', '', kit.html('thead', '', el));
    var several = view.series.length > 1;
    [several ? 'Series' : null, view.x.label || (view.x.time ? 'Time' : 'x'), 'Observed', 'Fitted', view.residuals.label]
      .forEach(function (label) { if (label !== null) kit.html('th', '', head, label).setAttribute('scope', 'col'); });
    var body = kit.html('tbody', '', el);
    list.forEach(function (r) {
      var tr = kit.tagKey(view, kit.html('tr', '', body), r.p);
      if (several) kit.html('td', '', tr, r.s.name || r.s.key);
      kit.html('td', '', tr, kit.format(r.p.x, view.x));
      kit.html('td', '', tr, kit.format(r.p.y, view.y));
      kit.html('td', '', tr, kit.format(r.p.fitted, view.y));
      kit.html('td', '', tr, signed(r.value, view.y, kit));
    });
    return el;
  }

  function describeFits(model) {
    var fits = model.fits || [];
    if (!fits.length) return '';
    var parts = fits.map(function (f) {
      var s = f.series && model.series.find(function (item) { return item.key === f.series; });
      return f.label + (s && s.name ? ' for ' + s.name : '') + (f.band ? ' with an uncertainty band' : '') +
        (f.stats ? ' (' + f.stats + ')' : '');
    });
    return 'Fits: ' + parts.join('; ') + '. Fit curves, bands, and statistics are supplied with the data. ' +
      'The fit chips in the legend hide and show each fit.';
  }

  function describeResiduals(model) {
    return model.residuals ? 'A residual panel under the plot shows each observation minus its fitted value on the same x axis.' : '';
  }

  // Fit curves and bands widen the value axis so that they are never cut off at the plot edge.
  function extent(model, span) {
    (model.fits || []).forEach(function (f) {
      f.curve.forEach(function (pt) { span.yLo = Math.min(span.yLo, pt[1]); span.yHi = Math.max(span.yHi, pt[1]); });
      (f.band || []).forEach(function (pt) { span.yLo = Math.min(span.yLo, pt[1]); span.yHi = Math.max(span.yHi, pt[2]); });
    });
  }

  OffPrint.chart.addon('chart-fits', {
    layers: {
      fits: { draw: drawFits, normalize: normalizeFits, legend: legend, table: fitTable, describe: describeFits, extent: extent,
        mapRecords: mapRecords },
      residuals: { draw: drawResiduals, normalize: normalizeResiduals, panel: panel, readout: readout, table: residualTable,
        describe: describeResiduals }
    }
  });

  var fitKit = {
    toNumber: OffPrint._chart.toNumber, toTime: OffPrint._chart.toTime, format: OffPrint._chart.format
  };

  OffPrint._chartFits = {
    normalize: function (model, spec) {
      normalizeFits(model, spec, fitKit);
      normalizeResiduals(model, spec, fitKit);
      return model;
    },
    mapRecords: function (rows, mapping, spec) { mapRecords(rows, mapping, spec, fitKit); return spec; },
    residuals: function (model) {
      return residualsOf(null, model).map(function (r) { return { series: r.s.key, x: r.p.x, value: r.value }; });
    },
    // Reads or sets whether a fit shows; null or false when the chart has no such fit.
    visible: function (target, key, on) {
      var api = OffPrint._chart.get(target);
      var host = api && api.element;
      var state = host && states.get(host);
      if (!state || !(state.chart.model.fits || []).some(function (f) { return f.key === key; })) {
        return arguments.length > 2 ? false : null;
      }
      if (arguments.length < 3) return !state.hidden.has(key);
      var hidden = new Set(state.hidden);
      if (on) hidden.delete(key);
      else hidden.add(key);
      return setHidden(state.chart, Array.from(hidden), 'api');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
