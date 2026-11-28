// Small multiples and scatter-plot matrices from one chart spec or named source. data-op-facets splits the spec by
// a point field or by series into titled panels of any chart type, on scales shared across panels (or a free y), with
// one legend, range, and table for all of them. data-op-facets="matrix" plots every pair of 2 to 6 record fields, with
// a name-and-range or histogram diagonal and a rectangle brush that dims records outside it in every panel by key.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || !OffPrint._chart) {
    if (typeof console !== 'undefined') console.warn('[offprint] chart-facets.js needs chart.js loaded before it.');
    return;
  }

  var chart = OffPrint._chart;
  var MAX_PANELS = 24;
  var MIN_FIELDS = 2;
  var MAX_FIELDS = 6;
  var INLINE_FIELDS = 4;
  var HEIGHTS = { 1: 240, 2: 220, 3: 190, 4: 170 };
  var MATRIX_HEIGHTS = { 2: 220, 3: 190, 4: 160, 5: 128, 6: 112 };
  var ZOOM_HEIGHTS = { 5: 170, 6: 150 };
  var DRAG = 4;
  var states = new WeakMap();
  var owners = new WeakMap();
  var groups = 0;

  function plain(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function make(tag, className, parent, content) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    if (parent) parent.appendChild(el);
    return el;
  }

  function axisOf(value) {
    return typeof value === 'string' ? { label: value } : plain(value) ? Object.assign({}, value) : {};
  }

  function scalar(v) {
    return typeof v === 'string' || typeof v === 'boolean' || isNum(v);
  }

  // ---- Small multiples ----

  function facetOptions(spec) {
    var facet = spec.facet;
    if (!plain(facet)) throw new Error('Facets need a facet object with a field or series: true.');
    var field = facet.field === undefined ? null : text(facet.field);
    if ((facet.field !== undefined && !field) || (facet.series !== undefined && facet.series !== true) ||
        !field === !facet.series) {
      throw new Error('Facets split by one field name or by series: true, not both.');
    }
    var columns = facet.columns === undefined ? 2 : facet.columns;
    if (!Number.isInteger(columns) || columns < 2 || columns > 4) throw new Error('Facet columns must be 2, 3, or 4.');
    var scales = facet.scales === undefined ? 'shared' : facet.scales;
    if (scales !== 'shared' && scales !== 'free-y') throw new Error('Facet scales must be "shared" or "free-y".');
    if (facet.order !== undefined && (!Array.isArray(facet.order) || facet.order.some(function (v) { return !scalar(v); }))) {
      throw new Error('Facet order must list panel values.');
    }
    if (facet.labels !== undefined && (!plain(facet.labels) ||
        Object.values(facet.labels).some(function (v) { return typeof v !== 'string'; }))) {
      throw new Error('Facet labels must map panel values to text.');
    }
    var height = facet.height === undefined ? (isNum(spec.height) ? spec.height : HEIGHTS[columns]) : facet.height;
    if (!isNum(height) || height <= 80) throw new Error('Facet panel height must be a number greater than 80.');
    return {
      field: field, series: facet.series === true, columns: columns, scales: scales, height: height,
      order: (facet.order || []).map(String), labels: facet.labels || {}
    };
  }

  // Panel keys in authored order, then in order of first appearance.
  function panelOrder(values, facet) {
    var seen = new Set(values);
    var keys = facet.order.filter(function (key) { return seen.has(key); });
    values.forEach(function (key) { if (keys.indexOf(key) < 0) keys.push(key); });
    if (keys.length > MAX_PANELS) throw new Error('Facets draw at most ' + MAX_PANELS + ' panels; this split makes ' + keys.length + '.');
    return keys;
  }

  function fieldValue(item, field, at) {
    if (!plain(item) || !Object.hasOwn(item, field) || !scalar(item[field])) {
      throw new Error('Facet field ' + JSON.stringify(field) + ' is missing in ' + at + '.');
    }
    return String(item[field]);
  }

  function baseOf(spec) {
    var base = copy(spec);
    delete base.facet;
    delete base.title;
    return base;
  }

  function seriesKey(s, i) {
    return text(s && s.key) || (s && s.name != null && String(s.name)) || 'series-' + (i + 1);
  }

  // Splits a spec's points (series data and top-level data) by a field, keeping every series in every panel.
  function splitSpec(spec, facet) {
    var base = baseOf(spec);
    if (facet.series) {
      if (!Array.isArray(spec.series) || spec.series.length < 2) throw new Error('Facets by series need two or more series.');
      var keys = panelOrder(spec.series.map(seriesKey), facet);
      return keys.map(function (key) {
        var s = spec.series[spec.series.map(seriesKey).indexOf(key)];
        return { key: key, title: facet.labels[key] || (s.name != null ? String(s.name) : key),
          spec: Object.assign({}, base, { series: [copy(s)] }) };
      });
    }
    var values = [];
    var add = function (v) { if (values.indexOf(v) < 0) values.push(v); };
    var lists = [];
    if (Array.isArray(spec.series)) spec.series.forEach(function (s, si) {
      lists.push({ items: s && Array.isArray(s.data) ? s.data : [], at: 'series ' + JSON.stringify(seriesKey(s, si)) });
    });
    if (Array.isArray(spec.data)) lists.push({ items: spec.data, at: 'data' });
    if (!lists.length) throw new Error('Facets by field need series data or a data array of objects.');
    lists.forEach(function (list) {
      list.items.forEach(function (item, i) { add(fieldValue(item, facet.field, 'point ' + (i + 1) + ' of ' + list.at)); });
    });
    var pie = base.type === 'pie';
    var slices = pie && Array.isArray(spec.data) ? spec.data.map(function (d) { return d && d.label; })
      .filter(function (label, i, all) { return all.indexOf(label) === i; }) : null;
    return panelOrder(values, facet).map(function (key) {
      var own = function (item) { return String(item[facet.field]) === key; };
      var panel = Object.assign({}, base);
      if (Array.isArray(spec.series)) panel.series = spec.series.map(function (s) {
        return Object.assign({}, copy(s), { data: copy(s.data.filter(own)) });
      });
      if (Array.isArray(spec.data)) {
        var data = copy(spec.data.filter(own));
        // Every pie panel lists every slice, empty where a panel has none, so slice colours match across panels.
        if (slices) data = slices.map(function (label) {
          return data.find(function (d) { return d.label === label; }) || { label: label, value: 0 };
        });
        panel.data = data;
      }
      return { key: key, title: facet.labels[key] || key, spec: panel };
    });
  }

  // Named-source records split by field before mapping, or mapped once and split by series.
  function mappedPanels(records, mapping, spec, facet, maxRows) {
    var base = baseOf(spec);
    delete base.series;
    delete base.data;
    if (facet.series) {
      var whole = chart._mapRecords(records, mapping, base, maxRows);
      return splitSpec(Object.assign({}, whole, { facet: spec.facet }), facet);
    }
    var values = records.map(function (record, i) { return fieldValue(record, facet.field, 'record ' + (i + 1)); });
    var keys = panelOrder(values.filter(function (v, i) { return values.indexOf(v) === i; }), facet);
    var panels = keys.map(function (key) {
      var rows = records.filter(function (_, i) { return values[i] === key; });
      return { key: key, title: facet.labels[key] || key, spec: chart._mapRecords(rows, mapping, base, maxRows) };
    });
    // Grouped mappings make series from the groups present; every panel lists all of them in one order.
    var union = [];
    panels.forEach(function (panel) {
      (panel.spec.series || []).forEach(function (s) {
        if (!union.some(function (u) { return u.key === s.key; })) union.push(s);
      });
    });
    panels.forEach(function (panel) {
      if (!Array.isArray(panel.spec.series)) return;
      panel.spec.series = union.map(function (u) {
        return panel.spec.series.find(function (s) { return s.key === u.key; }) ||
          { key: u.key, name: u.name, role: u.role, color: u.color, data: [] };
      });
    });
    return panels;
  }

  function niceEnds(lo, hi, log, time, exact) {
    if (exact) return [lo, hi];
    var info = (time ? chart.timeTicks : log ? chart.logTicks : chart.ticks)(lo, hi, 4);
    return [info.min, info.max];
  }

  // Scales from the combined extents of every panel. Author bounds win; free-y leaves each value axis alone.
  function shareScales(panels, facet) {
    var models = panels.map(function (panel) { return chart.specModel(panel.spec); });
    if (models.some(function (m) { return m.errors.length; }) || !models.length) return;
    var first = models[0];
    if (first.type === 'pie') return;
    if (first.addon === 'heatmap') {
      if (facet.scales === 'free-y') return;
      var values = models.flatMap(function (m) { return m.series[0].points.map(function (p) { return p.y; }); });
      if (!values.length) return;
      panels.forEach(function (panel) {
        var scale = typeof panel.spec.scale === 'string' ? { type: panel.spec.scale } : Object.assign({}, panel.spec.scale);
        if (scale.min === undefined) scale.min = Math.min.apply(null, values);
        if (scale.max === undefined) scale.max = Math.max.apply(null, values);
        panel.spec.scale = scale;
      });
      return;
    }
    if (first.categories) {
      var cats = [];
      models.forEach(function (m) { (m.categories || []).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); }); });
      panels.forEach(function (panel) { panel.spec.categories = cats.slice(); });
    } else {
      var xs = models.flatMap(function (m) { return chart.extent(m).xs; });
      if (xs.length) {
        var x = niceEnds(Math.min.apply(null, xs), Math.max.apply(null, xs), first.x.log, first.x.time, first.type === 'line');
        panels.forEach(function (panel) {
          var axis = axisOf(panel.spec.x);
          if (axis.min === undefined || axis.min === null) axis.min = x[0];
          if (axis.max === undefined || axis.max === null) axis.max = x[1];
          panel.spec.x = axis;
        });
      }
    }
    if (facet.scales === 'free-y' || first.stack === 'percent') return;
    var spans = models.map(function (m) { return chart.extent(m); }).filter(function (s) { return s.count; });
    if (!spans.length) return;
    var y = niceEnds(Math.min.apply(null, spans.map(function (s) { return s.yLo; })),
      Math.max.apply(null, spans.map(function (s) { return s.yHi; })), first.y.log, false, false);
    panels.forEach(function (panel) {
      var axis = axisOf(panel.spec.y);
      if (axis.min === undefined || axis.min === null) axis.min = y[0];
      if (axis.max === undefined || axis.max === null) axis.max = y[1];
      panel.spec.y = axis;
    });
  }

  function panelLayout(spec, records, options, caps) {
    var facet = facetOptions(spec);
    var panels = records ? mappedPanels(records, options.mapping, spec, facet, caps.maxRows) : splitSpec(spec, facet);
    if (!panels.length) throw new Error('Facets found no panels to draw.');
    shareScales(panels, facet);
    var model = chart.specModel(panels[0].spec);
    var series = facet.series ? [] : model.series.map(function (s) {
      return { key: s.key, name: s.name, role: s.role, color: s.color, index: s.index };
    });
    var pie = model.type === 'pie';
    panels.forEach(function (panel, i) {
      Object.assign(panel.spec, { height: pie ? panel.spec.height : facet.height, toggles: false });
      panel.row = Math.floor(i / facet.columns);
      panel.col = i % facet.columns;
      panel.kind = 'chart';
    });
    return {
      mode: 'panels', columns: facet.columns, panels: panels, series: series, pie: pie,
      mark: model.type === 'line' ? 'line' : model.type === 'bar' && !model.addon ? 'bar' : 'dot',
      toggles: spec.toggles === true && series.length > 1, brush: !!spec.brush, table: spec.table !== false,
      title: text(spec.title)
    };
  }

  // ---- Scatter-plot matrix ----

  function matrixField(entry, i) {
    var f = typeof entry === 'string' ? { field: entry } : entry;
    if (!plain(f) || !text(f.field)) throw new Error('Matrix field ' + (i + 1) + ' needs a field name.');
    var log = f.type === 'log' || f.log === true;
    if (f.type !== undefined && f.type !== 'log' && f.type !== 'linear') throw new Error('Matrix field types are "linear" or "log".');
    ['min', 'max', 'digits'].forEach(function (name) {
      if (f[name] !== undefined && !isNum(f[name])) throw new Error('Matrix field ' + JSON.stringify(f.field) + ' ' + name + ' must be a number.');
    });
    return { field: f.field.trim(), label: text(f.label) || f.field.trim(), unit: typeof f.unit === 'string' ? f.unit : '',
      digits: f.digits, log: log, fixed: [f.min, f.max] };
  }

  function matrixLayout(spec, records) {
    if (!Array.isArray(spec.fields)) throw new Error('A scatter-plot matrix needs a fields array.');
    if (spec.fields.length < MIN_FIELDS || spec.fields.length > MAX_FIELDS) {
      throw new Error('A scatter-plot matrix plots ' + MIN_FIELDS + ' to ' + MAX_FIELDS + ' fields; it has ' + spec.fields.length + '.');
    }
    var fields = spec.fields.map(matrixField);
    if (new Set(fields.map(function (f) { return f.field; })).size !== fields.length) throw new Error('Matrix fields must be distinct.');
    if (!Array.isArray(records) || !records.length) throw new Error('A scatter-plot matrix needs a nonempty array of records.');
    var keyField = spec.key === undefined ? null : text(spec.key);
    if (spec.key !== undefined && !keyField) throw new Error('Matrix key must name a record field.');
    var group = typeof spec.group === 'string' ? { field: spec.group } : spec.group;
    if (group !== undefined && (!plain(group) || !text(group.field) || (group.series !== undefined && !Array.isArray(group.series)))) {
      throw new Error('Matrix group needs a field and optional series descriptors.');
    }
    var labelField = spec.label === undefined ? null : text(spec.label);
    var keys = new Set();
    var rows = records.map(function (record, i) {
      if (!plain(record)) throw new Error('Matrix record ' + (i + 1) + ' must be an object.');
      var key = keyField ? (scalar(record[keyField]) ? String(record[keyField]).trim() : '') : 'r' + (i + 1);
      if (!key) throw new Error('Matrix record ' + (i + 1) + ' needs a key in field ' + JSON.stringify(keyField) + '.');
      if (keys.has(key)) throw new Error('Matrix record keys must be unique; ' + JSON.stringify(key) + ' repeats.');
      keys.add(key);
      var values = fields.map(function (f) {
        var raw = record[f.field];
        var v = raw === null || raw === undefined || raw === '' ? null : chart.toNumber(raw);
        if (v !== null && f.log && v <= 0) {
          throw new Error('Matrix field ' + JSON.stringify(f.field) + ' is on a log axis and needs positive values; record ' + (i + 1) + '.');
        }
        return v;
      });
      var groupKey = group ? (scalar(record[group.field]) ? String(record[group.field]) : '') : 'records';
      if (!groupKey) throw new Error('Matrix record ' + (i + 1) + ' needs a group in field ' + JSON.stringify(group.field) + '.');
      return { key: key, values: values, group: groupKey, label: labelField && scalar(record[labelField]) ? String(record[labelField]) : '' };
    });
    var descriptors = group && group.series || [];
    var order = descriptors.map(function (d) { return String(d && d.key); });
    rows.forEach(function (r) { if (order.indexOf(r.group) < 0) order.push(r.group); });
    var series = order.filter(function (key) { return rows.some(function (r) { return r.group === key; }); }).map(function (key, index) {
      var d = descriptors.find(function (item) { return String(item && item.key) === key; }) || {};
      return { key: key, name: text(d.label) || (group ? key : 'Records'), role: d.role || null, color: d.color || null, index: index,
        records: rows.filter(function (r) { return r.group === key; }) };
    });
    fields.forEach(function (f, i) {
      var vs = rows.map(function (r) { return r.values[i]; }).filter(isNum);
      if (!vs.length) throw new Error('Matrix field ' + JSON.stringify(f.field) + ' has no numeric values.');
      var ends = niceEnds(Math.min.apply(null, vs), Math.max.apply(null, vs), f.log, false, false);
      f.lo = Math.min.apply(null, vs);
      f.hi = Math.max.apply(null, vs);
      f.min = isNum(f.fixed[0]) ? f.fixed[0] : ends[0];
      f.max = isNum(f.fixed[1]) ? f.fixed[1] : ends[1];
      f.missing = rows.length - vs.length;
    });
    var diagonal = spec.diagonal === undefined ? 'range' : spec.diagonal;
    if (diagonal !== 'range' && diagonal !== 'histogram') throw new Error('Matrix diagonal must be "range" or "histogram".');
    if (diagonal === 'histogram' && OffPrint.chart.addons().indexOf('chart-histogram') < 0) {
      OffPrint._warnOnce('chart-facets-histogram', 'Matrix histogram diagonals need the "chart-histogram" feature; the diagonal shows field ranges.');
      diagonal = 'range';
    }
    if (spec.bins !== undefined && !(Number.isInteger(spec.bins) && spec.bins >= 2 && spec.bins <= 40)) {
      throw new Error('Matrix bins must be a whole number from 2 to 40.');
    }
    return {
      mode: 'matrix', fields: fields, rows: rows, series: series, diagonal: diagonal, bins: spec.bins,
      columns: fields.length, mark: 'dot', toggles: spec.toggles === true && series.length > 1, brush: true,
      table: spec.table !== false, title: text(spec.title), height: isNum(spec.height) && spec.height > 80 ? spec.height : null
    };
  }

  function fieldAxis(f, full) {
    return { label: full ? f.label : '', unit: f.unit, digits: f.digits, type: f.log ? 'log' : undefined, min: f.min, max: f.max };
  }

  function binEdges(f, bins) {
    var n = bins;
    var lo = f.log ? Math.log10(f.min) : f.min;
    var hi = f.log ? Math.log10(f.max) : f.max;
    if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
    var edges = [];
    for (var i = 0; i <= n; i++) {
      var t = lo + (hi - lo) * i / n;
      edges.push(+(f.log ? Math.pow(10, t) : t).toPrecision(12));
    }
    return edges;
  }

  // Panel specs for the matrix: scatter off the diagonal, derived-count histograms or ranges on it.
  function matrixPanels(layout, full) {
    var n = layout.fields.length;
    var height = layout.height || (full && ZOOM_HEIGHTS[n]) || MATRIX_HEIGHTS[n];
    var panels = [];
    layout.fields.forEach(function (fy, i) {
      layout.fields.forEach(function (fx, j) {
        var panel = { key: fx.field + '|' + fy.field, row: i, col: j, title: '' };
        if (i === j) {
          panel.kind = 'diagonal';
          panel.field = fx;
          if (layout.diagonal === 'histogram') {
            var bins = layout.bins || Math.max(5, Math.min(20, Math.ceil(Math.sqrt(layout.rows.length))));
            var edges = binEdges(fx, bins);
            panel.spec = { type: 'histogram', height: height, edges: edges, x: fieldAxis(fx, full),
              y: { label: full ? 'Count' : '' }, series: layout.series.map(function (s) {
                var counts = edges.slice(1).map(function () { return 0; });
                s.records.forEach(function (r) {
                  var v = r.values[j];
                  if (!isNum(v)) return;
                  // Bins hold [lo, hi), the last one [lo, hi], as in the histogram add-on.
                  var at = 0;
                  while (at < counts.length - 1 && v >= edges[at + 1]) at++;
                  counts[at]++;
                });
                return { key: s.key, name: s.name, role: s.role, color: s.color, counts: counts };
              }) };
          }
        } else {
          panel.kind = 'chart';
          panel.spec = { type: 'scatter', height: height, x: fieldAxis(fx, full), y: fieldAxis(fy, full),
            series: layout.series.map(function (s) {
              return { key: s.key, name: s.name, role: s.role, color: s.color,
                data: s.records.filter(function (r) { return isNum(r.values[j]) && isNum(r.values[i]); }).map(function (r) {
                  return { x: r.values[j], y: r.values[i], key: r.key, label: r.label };
                }) };
            }) };
        }
        panels.push(panel);
      });
    });
    return panels;
  }

  // ---- Mounting ----

  function rangeText(f) {
    var format = function (v) { return chart.format(v, { digits: f.digits, unit: f.unit }); };
    return f.lo === f.hi ? format(f.lo) : format(f.lo) + ' – ' + format(f.hi);
  }

  function legendKey(mark, s) {
    var key = make('span', 'op-chart-key is-' + mark);
    chart.paint(key, s);
    return key;
  }

  function renderLegend(state) {
    var layout = state.layout;
    state.legend.textContent = '';
    state.chooser = null;
    var shown = layout.series.length > 1 || layout.pie;
    state.legend.hidden = !shown;
    if (!shown) return;
    if (layout.toggles && OffPrint._choices) {
      state.chooser = OffPrint._choices.create({
        label: layout.pie ? 'Slices shown' : 'Series shown', hideLabel: true, multiple: true, display: 'chips',
        className: 'op-chart-series-toggles',
        options: layout.series.map(function (s) {
          return { value: s.key, label: s.name, swatch: legendKey(layout.mark, s), mark: function (el) {
            el.classList.add('op-chart-legend-item', 'op-chart-series-toggle');
          } };
        }),
        onChange: function (values) {
          var hidden = new Set(layout.series.map(function (s) { return s.key; }).filter(function (k) { return values.indexOf(k) < 0; }));
          setView(state, { hidden: hidden }, 'user');
        }
      });
      state.legend.appendChild(state.chooser.el);
    } else {
      layout.series.forEach(function (s) {
        var item = make('span', 'op-chart-legend-item', state.legend);
        item.appendChild(legendKey(layout.mark, s));
        make('span', '', item, s.name);
      });
    }
  }

  function syncHead(state) {
    var view = state.view;
    if (state.chooser) {
      state.chooser.show(state.layout.series.map(function (s) { return s.key; }).filter(function (k) { return !view.hidden.has(k); }));
    }
    var ranged = !!view.range && state.panels.length;
    state.rangeText.hidden = !ranged;
    state.reset.hidden = !ranged;
    if (ranged) {
      var model = state.panels[0].api && state.panels[0].api.model();
      var axis = model ? model.x : {};
      state.rangeText.textContent = (axis.label || 'x') + ' ' + chart.format(view.range[0], axis).replace(/ UTC$/, '') + ' – ' +
        chart.format(view.range[1], axis);
    }
    state.toggle.hidden = !state.layout.table;
    state.toggle.setAttribute('aria-pressed', String(view.table));
    var brush = state.brush;
    state.status.hidden = !brush;
    state.clear.hidden = !brush;
    if (brush) {
      state.status.textContent = state.inside.size + ' of ' + state.layout.rows.length + ' records in the brushed area';
    }
    state.host.classList.toggle('is-brushed', !!brush);
    state.host.classList.toggle('is-table', view.table);
  }

  function chartPanels(state) {
    return state.panels.filter(function (p) { return p.api; });
  }

  // Applies the shared view to every panel; each panel's own reports are user changes only.
  function applyView(state) {
    var view = state.view;
    chartPanels(state).forEach(function (panel) {
      var model = panel.api.model();
      if (!model) return;
      if (state.layout.series.length > 1 || state.layout.pie) model.series.forEach(function (s) {
        var on = !view.hidden.has(s.key);
        if (panel.api.visible(s.key) !== on) panel.api.setSeriesVisible(s.key, on);
      });
      if (state.layout.brush && state.layout.mode === 'panels') {
        var current = panel.api.range();
        if (String(current) !== String(view.range)) panel.api.setRange(view.range);
      }
    });
    state.grid.hidden = view.table && state.layout.mode === 'matrix';
    if (state.table) state.table.hidden = !(view.table && state.layout.mode === 'matrix');
    if (state.layout.mode === 'matrix' && view.table) fillTable(state);
    if (state.layout.mode === 'panels') chartPanels(state).forEach(function (panel) {
      var button = panel.host.querySelector('.op-chart-toggle');
      var on = panel.host.classList.contains('is-table');
      if (button && on !== view.table && !button.hidden) button.click();
    });
    syncHead(state);
  }

  function sameView(a, b) {
    return Array.from(a.hidden).sort().join('\n') === Array.from(b.hidden).sort().join('\n') &&
      String(a.range) === String(b.range) && a.table === b.table;
  }

  function setView(state, change, origin) {
    var next = { hidden: change.hidden || state.view.hidden, range: Object.hasOwn(change, 'range') ? change.range : state.view.range,
      table: Object.hasOwn(change, 'table') ? change.table : state.view.table };
    if (sameView(next, state.view)) return false;
    state.view = next;
    run(function () { applyView(state); });
    state.track?.(origin);
    return true;
  }

  function run(fn) {
    return OffPrint._component ? OffPrint._component.transaction(function () { fn(); return true; }) : fn();
  }

  function watchPanel(state, panel) {
    if (!panel.api || typeof panel.api.subscribe !== 'function') return;
    panel.unsubscribe = panel.api.subscribe(function (current, meta) {
      if (!current || meta.origin !== 'user' || state.rendering) return;
      setView(state, { hidden: new Set(current.hiddenSeries || []), range: current.range || null }, 'user');
    });
  }

  function panelHost(state, panel) {
    var cell = make('div', 'op-facets-cell is-' + panel.kind);
    cell.setAttribute('role', 'listitem');
    cell.setAttribute('data-op-panel', panel.key);
    cell.style.gridColumn = String(panel.col + 1);
    cell.style.gridRow = String(panel.row + 1);
    if (panel.title) make('p', 'op-facets-title', cell, panel.title);
    panel.cell = cell;
    if (panel.kind === 'diagonal') {
      var head = make('div', 'op-facets-field', cell);
      make('span', 'op-facets-field-name', head, panel.field.label);
      panel.rangeEl = make('span', 'op-facets-field-range', head, rangeText(panel.field));
      if (panel.field.missing) make('span', 'op-facets-field-missing', head, panel.field.missing + ' missing');
    }
    if (panel.spec) {
      panel.host = make('div', 'op-facets-panel', cell);
      owners.set(panel.host, { state: state, panel: panel });
    }
    return cell;
  }

  function decorate(state, spec) {
    var out = Object.assign({}, spec);
    out.title = undefined;
    if (state.selectionGroup) out.selectionGroup = state.selectionGroup;
    if (state.motion !== null) out.motion = state.motion;
    out.table = state.layout.table && state.layout.mode === 'panels';
    return out;
  }

  function mountPanel(state, panel) {
    if (!panel.spec) return;
    if (state.xGroup && state.layout.mode === 'panels') panel.host.setAttribute('data-op-x-group', state.xGroup);
    panel.api = chart(panel.host, decorate(state, panel.spec));
    if (!panel.api) return;
    watchPanel(state, panel);
    if (state.layout.mode === 'matrix' && panel.kind === 'chart') listenBrush(state, panel);
  }

  function teardown(state) {
    state.panels.forEach(function (panel) {
      if (panel.unsubscribe) panel.unsubscribe();
      if (panel.host) chart._remove(panel.host);
      if (panel.cell) panel.cell.remove();
    });
    state.panels = [];
  }

  function full(state) {
    return state.layout.mode !== 'matrix' || state.layout.fields.length <= INLINE_FIELDS || state.zoomed;
  }

  function render(state, layout, origin) {
    var previous = state.layout;
    state.layout = layout;
    state.rendering = true;
    try {
      var panels = layout.mode === 'matrix' ? matrixPanels(layout, full(state)) : layout.panels;
      var same = previous && previous.mode === layout.mode && state.panels.length === panels.length &&
        state.panels.every(function (p, i) { return p.key === panels[i].key && p.kind === panels[i].kind; });
      state.host.style.setProperty('--op-facets-columns', String(layout.columns));
      var sized = panels.find(function (p) { return p.spec && isNum(p.spec.height); });
      if (sized) state.host.style.setProperty('--op-facets-height', sized.spec.height + 'px');
      state.host.classList.toggle('is-matrix', layout.mode === 'matrix');
      state.host.classList.toggle('is-compact', !full(state));
      state.host.classList.toggle('has-shared-legend', layout.series.length > 1 || layout.pie);
      state.caption.textContent = layout.title || '';
      state.caption.hidden = !layout.title;
      if (!previous || layout.series.map(function (s) { return s.key + s.name; }).join() !==
          previous.series.map(function (s) { return s.key + s.name; }).join() || layout.toggles !== previous.toggles) renderLegend(state);
      if (same) {
        panels.forEach(function (next, i) {
          var panel = state.panels[i];
          panel.spec = next.spec;
          panel.field = next.field;
          if (panel.rangeEl) panel.rangeEl.textContent = rangeText(next.field);
          if (panel.spec) chart(panel.host, decorate(state, panel.spec));
        });
      } else {
        teardown(state);
        state.panels = panels.map(function (panel) { return Object.assign({}, panel); });
        state.panels.forEach(function (panel) { state.grid.appendChild(panelHost(state, panel)); });
        state.panels.forEach(function (panel) { mountPanel(state, panel); });
      }
      var keys = new Set(layout.series.map(function (s) { return s.key; }));
      state.view.hidden = new Set(Array.from(state.view.hidden).filter(function (k) { return keys.has(k); }));
      if (origin === 'reset') state.view = { hidden: new Set(), range: null, table: false };
      if (layout.mode !== 'matrix' || !state.brush || !layout.fields[state.brush.row] || !layout.fields[state.brush.col] ||
          layout.fields[state.brush.row].field !== state.brush.y.field || layout.fields[state.brush.col].field !== state.brush.x.field) {
        state.brush = null;
      }
      measureBrush(state);
      applyView(state);
      paintBrush(state);
      describe(state);
    } finally {
      state.rendering = false;
    }
    return true;
  }

  function describe(state) {
    var layout = state.layout;
    var n = state.panels.length;
    state.grid.setAttribute('aria-label', layout.mode === 'matrix' ?
      'Scatter-plot matrix of ' + layout.fields.map(function (f) { return f.label; }).join(', ') + ' for ' + layout.rows.length +
        ' records. Drag across a plot to brush a rectangle; records outside it are dimmed in every plot.' +
        (full(state) ? '' : ' Open the figure in the zoom view for full axes.') :
      n + ' panels: ' + state.panels.map(function (p) { return p.title; }).join(', ') + '.');
  }

  // ---- Matrix brush ----

  function inside(state, record) {
    var b = state.brush;
    var x = record.values[b.col];
    var y = record.values[b.row];
    return isNum(x) && isNum(y) && x >= b.x.range[0] && x <= b.x.range[1] && y >= b.y.range[0] && y <= b.y.range[1];
  }

  function measureBrush(state) {
    state.inside = new Set(state.brush ? state.layout.rows.filter(function (r) { return inside(state, r); })
      .map(function (r) { return r.key; }) : []);
  }

  function pointKey(id) {
    var part = String(id).split('\u0001')[2] || '';
    return part.slice(0, 2) === 'k:' ? part.slice(2).replace(/#\d+$/, '') : null;
  }

  function dimMarks(state, owner) {
    var keys = state.brush ? state.inside : null;
    (owner.marks || new Map()).forEach(function (entry, id) {
      var key = pointKey(id);
      if (!key || !entry.el || entry.leaving) return;
      entry.el.classList.toggle('is-facets-out', !!keys && !keys.has(key));
    });
  }

  function drawRect(state, owner) {
    var rect = owner.rect;
    var geom = owner.geom;
    var b = state.brush;
    if (!rect || !geom || !geom.px) return;
    var on = !!b && b.row === owner.panel.row && b.col === owner.panel.col;
    rect.setAttribute('display', on ? 'inline' : 'none');
    if (!on) return;
    var x0 = geom.px('x', b.x.range[0]);
    var x1 = geom.px('x', b.x.range[1]);
    var y0 = geom.px('y', b.y.range[0]);
    var y1 = geom.px('y', b.y.range[1]);
    rect.setAttribute('x', Math.min(x0, x1));
    rect.setAttribute('y', Math.min(y0, y1));
    rect.setAttribute('width', Math.abs(x1 - x0));
    rect.setAttribute('height', Math.abs(y1 - y0));
  }

  function paintBrush(state) {
    if (state.layout.mode !== 'matrix') return;
    state.panels.forEach(function (panel) {
      var owner = panel.host && owners.get(panel.host);
      if (!owner || !owner.marks) return;
      dimMarks(state, owner);
      drawRect(state, owner);
    });
    if (state.view.table) fillTable(state);
    syncHead(state);
  }

  function brushSnapshot(state) {
    var b = state.brush;
    if (!b) return null;
    return Object.freeze({
      x: Object.freeze({ field: b.x.field, range: Object.freeze(b.x.range.slice()) }),
      y: Object.freeze({ field: b.y.field, range: Object.freeze(b.y.range.slice()) }),
      keys: Object.freeze(Array.from(state.inside)), count: state.inside.size, total: state.layout.rows.length
    });
  }

  function setBrush(state, brush, origin) {
    var previous = brushSnapshot(state);
    state.brush = brush;
    measureBrush(state);
    paintBrush(state);
    var current = brushSnapshot(state);
    if (JSON.stringify(previous) === JSON.stringify(current)) return true;
    if (origin !== 'drag') {
      OffPrint._component.notify(function () { state.signal.emit(current, previous, origin); });
      state.track?.(origin);
    }
    return true;
  }

  // Brush in data units from two points on a panel's plot, clamped to the plot area.
  function brushFrom(state, owner, a, b) {
    var g = owner.geom;
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    var xs = [clamp(a[0], g.left, g.right), clamp(b[0], g.left, g.right)].map(g.x.invert).sort(function (p, q) { return p - q; });
    var ys = [clamp(a[1], g.top, g.bottom), clamp(b[1], g.top, g.bottom)].map(g.y.invert).sort(function (p, q) { return p - q; });
    var fx = state.layout.fields[owner.panel.col];
    var fy = state.layout.fields[owner.panel.row];
    return { row: owner.panel.row, col: owner.panel.col, x: { field: fx.field, range: xs }, y: { field: fy.field, range: ys } };
  }

  function localPoint(owner, event) {
    var svg = owner.chart && owner.chart.svg;
    if (!svg) return null;
    var box = svg.getBoundingClientRect();
    var k = box.width && owner.chart.width ? owner.chart.width / box.width : 1;
    return [(event.clientX - box.left) * k, (event.clientY - box.top) * k];
  }

  function listenBrush(state, panel) {
    var plot = panel.host.querySelector('.op-chart-plot');
    if (!plot) return;
    plot.addEventListener('pointerdown', function (event) {
      var owner = owners.get(panel.host);
      if (event.button !== 0 || event.isPrimary === false || !owner || !owner.geom || !owner.geom.x || state.view.table) return;
      var at = localPoint(owner, event);
      var g = owner.geom;
      if (!at || at[0] < g.left || at[0] > g.right || at[1] < g.top || at[1] > g.bottom) return;
      state.drag = { owner: owner, from: at, client: [event.clientX, event.clientY], moved: false, before: state.brush };
    });
    plot.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.brush) setBrush(state, null, 'user');
    });
  }

  function dragMove(state, event) {
    var drag = state.drag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.client[0], event.clientY - drag.client[1]) < DRAG) return;
    drag.moved = true;
    var at = localPoint(drag.owner, event);
    if (at) setBrush(state, brushFrom(state, drag.owner, drag.from, at), 'drag');
  }

  function dragEnd(state, commit) {
    var drag = state.drag;
    state.drag = null;
    if (!drag || !drag.moved) return;
    state.dragged = true;
    var current = state.brush;
    state.brush = drag.before;
    measureBrush(state);
    setBrush(state, commit ? current : drag.before, 'user');
  }

  // The brush layer draws over every chart but acts only on matrix panels: it keeps their dimming and brush rectangle
  // across redraws such as resizing and zoom.
  function drawLayer(c, geom, kit, layer) {
    var owner = owners.get(c.box);
    if (!owner || owner.state.layout.mode !== 'matrix' || owner.panel.kind !== 'chart') return;
    owner.chart = c;
    owner.geom = geom;
    owner.marks = layer.marks;
    owner.rect = kit.svg('rect', { class: 'op-facets-brush', display: 'none', rx: 2 }, layer.group);
    dimMarks(owner.state, owner);
    drawRect(owner.state, owner);
  }

  // ---- Matrix table ----

  function fillTable(state) {
    var layout = state.layout;
    if (!state.table || layout.mode !== 'matrix') return;
    state.table.textContent = '';
    var table = make('table', '', state.table);
    var head = make('tr', '', make('thead', '', table));
    make('th', '', head, 'Record').scope = 'col';
    if (layout.series.length > 1) make('th', '', head, 'Group').scope = 'col';
    layout.fields.forEach(function (f) { make('th', '', head, f.label).scope = 'col'; });
    if (state.brush) make('th', '', head, 'Brushed').scope = 'col';
    var body = make('tbody', '', table);
    layout.series.forEach(function (s) {
      s.records.forEach(function (r) {
        var tr = make('tr', '', body);
        make('th', '', tr, r.label || r.key).scope = 'row';
        if (layout.series.length > 1) make('td', '', tr, s.name);
        r.values.forEach(function (v, i) {
          make('td', '', tr, isNum(v) ? chart.format(v, { digits: layout.fields[i].digits, unit: layout.fields[i].unit }) : '');
        });
        if (state.brush) {
          var on = state.inside.has(r.key);
          make('td', '', tr, on ? 'Yes' : 'No');
          tr.classList.toggle('is-facets-out', !on);
        }
        if (state.selectionGroup) {
          tr.setAttribute('data-op-selection-group', state.selectionGroup);
          tr.setAttribute('data-op-key', r.key);
          if (OffPrint._selection) OffPrint._selection.sync(tr);
        }
      });
    });
  }

  // ---- Host ----

  function readSpec(host) {
    var script = host.querySelector(':scope > script[type="application/json"]');
    if (!script) return {};
    return JSON.parse(script.textContent);
  }

  function animateAttribute(host) {
    if (!host.hasAttribute('data-op-animate')) return null;
    return OffPrint._component.flag(host, 'animate', 'chart-facets', true);
  }

  function mount(target, instance) {
    var component = OffPrint._component;
    var host = component.target(target, 'chart-facets', true);
    if (!host) return null;
    if (states.has(host)) return states.get(host).api;
    var mode = OffPrint._data(host, 'facets', '').trim() || 'panels';
    if (mode !== 'panels' && mode !== 'matrix') {
      component.issue('chart-facets', host, 'Unknown data-op-facets layout "' + mode + '".', 'Use an empty value, panels, or matrix.');
      return null;
    }
    var spec;
    try { spec = readSpec(host); }
    catch (error) {
      component.issue('chart-facets', host, 'Facet spec is not valid JSON: ' + error.message, 'Check the JSON spec.');
      return null;
    }
    var data = OffPrint._dataSource;
    var named = host.hasAttribute('data-op-source');
    if (named && !data) {
      component.issue('chart-facets', host, 'Enable data to use a named facet source.', 'Turn on the data feature.');
      return null;
    }
    var options = named ? data.options('chart-facets', host, instance) : {};
    var caps = named ? data.limits(host, options) : { maxRows: Infinity };
    var group = OffPrint._data(host, 'selection-group', null);
    var state = {
      host: host, mode: mode, spec: spec, layout: null, panels: [],
      view: { hidden: new Set(), range: null, table: false }, brush: null, inside: new Set(),
      selectionGroup: text(group) || text(spec.selectionGroup), motion: animateAttribute(host) ?? (spec.motion === false ? false : null),
      xGroup: text(host.getAttribute('data-op-x-group')) || 'op-facets-' + (++groups), zoomed: false,
      fallback: Array.from(host.children).filter(function (child) { return !(child.tagName === 'SCRIPT'); })
    };

    // Spec facets take a new spec on update; named facets take records.
    function prepare(input, records) {
      if (!plain(input)) throw new Error('Supply a facet spec object.');
      var layout = mode === 'matrix' ? matrixLayout(input, records === undefined ? input.data : records) :
        panelLayout(input, records, options, caps);
      layout.spec = input;
      return layout;
    }

    var built = false;
    function build() {
      if (built) return;
      built = true;
      state.fallback.forEach(function (node) { node.hidden = true; });
      host.classList.add('op-facets');
      state.headEl = make('div', 'op-facets-head');
      state.legend = make('div', 'op-chart-legend op-facets-legend', state.headEl);
      var tools = make('div', 'op-chart-tools op-facets-tools', state.headEl);
      state.status = make('span', 'op-facets-status', tools);
      state.status.setAttribute('role', 'status');
      state.clear = make('button', 'op-button op-facets-clear', tools, 'Clear brush');
      state.clear.type = 'button';
      state.rangeText = make('span', 'op-chart-range', tools);
      state.reset = make('button', 'op-button op-chart-reset', tools, 'Reset range');
      state.reset.type = 'button';
      state.toggle = make('button', 'op-button op-chart-toggle', tools, 'Table');
      state.toggle.type = 'button';
      state.caption = make('p', 'op-facets-caption');
      state.grid = make('div', 'op-facets-grid');
      state.grid.setAttribute('role', 'list');
      state.table = make('div', 'op-chart-table op-facets-table');
      state.table.hidden = true;
      host.insertBefore(state.table, host.firstChild);
      host.insertBefore(state.grid, state.table);
      host.insertBefore(state.caption, state.grid);
      host.insertBefore(state.headEl, state.caption);
      state.clear.addEventListener('click', function () { setBrush(state, null, 'user'); });
      state.reset.addEventListener('click', function () { setView(state, { range: null }, 'user'); });
      state.toggle.addEventListener('click', function () { setView(state, { table: !state.view.table }, 'user'); });
      // The click that ends a brush drag is not a selection and must not open a zoomable figure.
      host.addEventListener('click', function (event) {
        if (!state.dragged) return;
        state.dragged = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      state.onMove = function (event) { dragMove(state, event); };
      state.onUp = function () { dragEnd(state, true); };
      state.onCancel = function () { dragEnd(state, false); };
      document.addEventListener('pointermove', state.onMove);
      document.addEventListener('pointerup', state.onUp);
      document.addEventListener('pointercancel', state.onCancel);
      state.onZoom = function (event) {
        var open = event.detail && event.detail.current;
        var zoomed = !!(open && open.target && (open.target === host || (open.target.contains && open.target.contains(host))));
        if (zoomed === state.zoomed) return;
        state.zoomed = zoomed;
        if (state.layout && state.layout.mode === 'matrix' && state.layout.fields.length > INLINE_FIELDS) render(state, state.layout, 'zoom');
      };
      document.addEventListener('op:zoom:change', state.onZoom);
    }

    var controller = OffPrint._dataViews.controller('chart-facets', host, {
      prepare: function (value) { return named ? prepare(state.spec, value) : prepare(value); },
      render: function (layout, origin) {
        if (!layout) return;
        build();
        state.spec = layout.spec;
        render(state, layout, origin);
      },
      snapshot: function () { return state.layout ? viewSnapshot(state) : null; },
      resetReader: true
    }, 'view');

    function viewSnapshot(s) {
      return { hiddenSeries: Array.from(s.view.hidden), range: s.view.range && s.view.range.slice(), table: s.view.table,
        panels: s.panels.map(function (p) { return p.key; }), brush: brushSnapshot(s) };
    }

    state.signal = OffPrint._component.signal('chart', host, function () { return brushSnapshot(state); }, { action: 'facets-brush' });
    var api = controller.api;
    api.element = host;
    api.panels = function () { return state.panels.filter(function (p) { return p.host; }).map(function (p) { return p.host; }); };
    api.setSeriesVisible = function (key, on) {
      if (typeof on !== 'boolean' || !state.layout || !state.layout.series.some(function (s) { return s.key === key; })) return false;
      var hidden = new Set(state.view.hidden);
      if (on) hidden.delete(key);
      else hidden.add(key);
      setView(state, { hidden: hidden }, 'api');
      return true;
    };
    api.setRange = function (range) {
      if (!state.layout || state.layout.mode !== 'panels' || !state.layout.brush) return false;
      var probe = chartPanels(state)[0];
      if (!probe || probe.api.setRange(range) === false) return false;
      setView(state, { range: probe.api.range() || null }, 'api');
      return true;
    };
    api.range = function () { return state.view.range && state.view.range.slice(); };
    api.brush = function (next) {
      if (!arguments.length) return brushSnapshot(state);
      if (!state.layout || state.layout.mode !== 'matrix') return false;
      if (next === null) return setBrush(state, null, 'api');
      var b = checkedBrush(state, next);
      return b ? setBrush(state, b, 'api') : false;
    };
    api.subscribeBrush = state.signal.subscribe;
    state.api = api;
    states.set(host, state);

    state.track = OffPrint._readerState?.watch('chart-facets', host, function () {
      return state.layout ? { hidden: Array.from(state.view.hidden).sort(), range: state.view.range && state.view.range.slice(),
        table: state.view.table, brush: state.brush && { x: state.brush.x, y: state.brush.y } } : undefined;
    }, function (saved) {
      if (!saved || !state.layout || !Array.isArray(saved.hidden) || typeof saved.table !== 'boolean') return false;
      var keys = state.layout.series.map(function (s) { return s.key; });
      if (saved.hidden.some(function (k) { return keys.indexOf(k) < 0; })) return false;
      var brush = saved.brush ? checkedBrush(state, saved.brush) : null;
      if (saved.brush && !brush) return false;
      if (saved.range !== null && (!Array.isArray(saved.range) || saved.range.length !== 2 || !saved.range.every(isNum))) return false;
      state.view = { hidden: new Set(saved.hidden), range: saved.range && saved.range.slice(), table: saved.table };
      run(function () { applyView(state); });
      if (state.layout.mode === 'matrix') setBrush(state, brush, 'api');
      return true;
    }, { order: 20, current: function () { return true; },
      revision: function () { return named ? data.authoredRevision(host.getAttribute('data-op-source')) : null; } });

    if (named) {
      data.binding('chart-facets', host, options, function (value, mapping, input, fullSpec) {
        if (fullSpec) throw new Error('Facets read records; use a transform that returns records.');
        return prepare(state.spec, value);
      }).mount(controller);
    } else {
      try { controller.start(prepare(spec)); }
      catch (error) { component.issue('chart-facets', host, error.message, 'Check the facet spec.'); }
    }
    return api;
  }

  // A brush from {x: {field, range}, y: {field, range}} on two different matrix fields, or null when it does not fit.
  function checkedBrush(state, next) {
    if (!plain(next) || !plain(next.x) || !plain(next.y)) return null;
    var fields = state.layout.fields.map(function (f) { return f.field; });
    var col = fields.indexOf(next.x.field);
    var row = fields.indexOf(next.y.field);
    var range = function (r) {
      return Array.isArray(r) && r.length === 2 && r.every(isNum) ? r.slice().sort(function (a, b) { return a - b; }) : null;
    };
    var xr = range(next.x.range);
    var yr = range(next.y.range);
    if (col < 0 || row < 0 || col === row || !xr || !yr) return null;
    return { row: row, col: col, x: { field: fields[col], range: xr }, y: { field: fields[row], range: yr } };
  }

  OffPrint.chart.addon('chart-facets', { layers: { 'facets-brush': { draw: drawLayer } } });

  OffPrint._chartFacets = {
    mount: mount,
    get: function (target) {
      var host = OffPrint._component.target(target, 'chart-facets', false);
      var state = host && states.get(host);
      return state ? state.api : null;
    },
    split: function (spec) { return splitSpec(spec, facetOptions(spec)); },
    layout: function (spec, records) {
      return spec.fields ? matrixLayout(spec, records === undefined ? spec.data : records) :
        panelLayout(spec, records, { mapping: spec.mapping }, { maxRows: Infinity });
    }
  };

  if (OffPrint._items) OffPrint._items.scan('chart-facets', function () {
    OffPrint._all('[data-op-facets]').forEach(function (host) {
      var group = OffPrint._data(host, 'selection-group', null);
      if (group && OffPrint._selection) OffPrint._selection.ensure(group);
    });
  });

  OffPrint.register('chart-facets', function () {
    OffPrint._all('[data-op-facets]').forEach(function (host) { mount(host); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
