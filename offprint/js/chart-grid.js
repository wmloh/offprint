// Categorical grids for risk and confusion matrices: ordered row and column descriptors, supplied cell values coloured
// with the shared heatmap scales, keyed items packed into cells with optional trails from an earlier cell, risk zones
// from cell lists or score ranges, and confusion options that derive totals, shares, and precision and recall.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || typeof OffPrint.chart.addon !== 'function') return;

  var MAX_SIDE = 16;
  var MAX_ITEMS = 300;
  var MAX_ZONES = 12;
  var MODES = ['none', 'row', 'column', 'all'];
  var MODE_LABELS = { none: 'Counts', row: 'Row shares', column: 'Column shares', all: 'Overall shares' };
  var STEPS = 32;
  var BAR = 10;
  var MARGIN_W = 58;
  var MARGIN_H = 22;
  var GAP = 3;
  var states = new WeakMap();
  var hosts = new WeakMap();

  function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function text(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  function round(v) { return +v.toFixed(3); }

  // ---- Input ----
  // Ordered descriptors: a label, or {key, label?, score?}. Keys and labels are unique per axis.
  function descriptors(list, what) {
    if (!Array.isArray(list) || !list.length) throw new Error('A grid needs a nonempty ' + what + ' list.');
    if (list.length > MAX_SIDE) throw new Error('A grid has at most ' + MAX_SIDE + ' ' + what + '; this one has ' + list.length + '.');
    var out = list.map(function (item, i) {
      var key = plain(item) ? text(item.key) : text(item);
      if (key === null) throw new Error('Grid ' + what + ' ' + (i + 1) + ' needs a nonempty key or label.');
      var label = plain(item) && item.label != null ? text(item.label) : key;
      if (label === null) throw new Error('Grid ' + what + ' ' + (i + 1) + ' needs a nonempty label.');
      var score = plain(item) && item.score != null ? item.score : null;
      if (score !== null && !(typeof score === 'number' && Number.isFinite(score))) {
        throw new Error('Grid ' + what + ' ' + JSON.stringify(key) + ' needs a finite score.');
      }
      return { key: key, label: label, score: score };
    });
    ['key', 'label'].forEach(function (name) {
      if (new Set(out.map(function (d) { return d[name]; })).size !== out.length) {
        throw new Error('Grid ' + what + ' ' + name + 's must be unique.');
      }
    });
    return out;
  }

  // The index of a row or column named by key, else by label.
  function find(list, value, what, at) {
    var name = text(value);
    var i = name === null ? -1 : list.findIndex(function (d) { return d.key === name; });
    if (i < 0 && name !== null) i = list.findIndex(function (d) { return d.label === name; });
    if (i < 0) throw new Error(at + ' names an unknown ' + what + ' ' + JSON.stringify(value) + '.');
    return i;
  }

  function cellRef(rows, columns, value, at) {
    var row = Array.isArray(value) ? value[0] : plain(value) ? value.row : undefined;
    var column = Array.isArray(value) ? value[1] : plain(value) ? value.column : undefined;
    if (row === undefined || column === undefined) throw new Error(at + ' needs a [row, column] pair or {row, column}.');
    return [find(rows, row, 'row', at), find(columns, column, 'column', at)];
  }

  function readValues(spec, rows, columns, toNumber) {
    var values = rows.map(function () { return columns.map(function () { return null; }); });
    var keys = rows.map(function () { return columns.map(function () { return null; }); });
    var number = function (v, at) {
      if (v === null || v === undefined || v === '') return null;
      var n = toNumber(v);
      if (n === null) throw new Error(at + ' needs a finite number, or null for no value.');
      return n;
    };
    if (spec.z != null && spec.cells != null) throw new Error('Give a grid either a z matrix or cells, not both.');
    if (spec.z != null) {
      if (!Array.isArray(spec.z) || spec.z.length !== rows.length || spec.z.some(function (r) {
        return !Array.isArray(r) || r.length !== columns.length;
      })) throw new Error('Grid z needs one array per row with one value per column.');
      spec.z.forEach(function (r, i) { r.forEach(function (v, j) { values[i][j] = number(v, 'Grid z row ' + (i + 1)); }); });
    } else if (spec.cells != null) {
      if (!Array.isArray(spec.cells)) throw new Error('Grid cells must be an array of {row, column, value?, key?}.');
      var seen = new Set();
      spec.cells.forEach(function (cell, n) {
        var at = 'Grid cell ' + (n + 1);
        if (!plain(cell)) throw new Error(at + ' must be an object with row and column.');
        var rc = cellRef(rows, columns, cell, at);
        if (seen.has(rc.join())) throw new Error(at + ' repeats the cell ' + rows[rc[0]].key + ' × ' + columns[rc[1]].key + '.');
        seen.add(rc.join());
        values[rc[0]][rc[1]] = number(cell.value, at);
        if (cell.key != null) {
          if (text(cell.key) === null || typeof cell.key !== 'string') throw new Error(at + ' needs a nonempty string key.');
          keys[rc[0]][rc[1]] = cell.key.trim();
        }
      });
    }
    return { values: values, keys: keys };
  }

  function readItems(list, rows, columns) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw new Error('Grid items must be an array of {key, row, column}.');
    if (list.length > MAX_ITEMS) throw new Error('A grid places at most ' + MAX_ITEMS + ' items; this one has ' + list.length + '.');
    return list.map(function (item, i) {
      var at = 'Grid item ' + (i + 1);
      if (!plain(item) || typeof item.key !== 'string' || !item.key.trim()) throw new Error(at + ' needs a nonempty string key.');
      var rc = cellRef(rows, columns, item, at);
      var from = item.from == null ? null : cellRef(rows, columns, item.from, at + ' from');
      if (from && from[0] === rc[0] && from[1] === rc[1]) from = null;
      var out = { key: item.key.trim(), label: text(item.label) || item.key.trim(), row: rc[0], col: rc[1], from: from,
        short: text(item.short) || String(i + 1), text: text(item.text), color: text(item.color), role: text(item.role),
        revealStep: text(item.revealStep), index: i };
      if (out.short.length > 3) throw new Error(at + ' needs a short badge of at most 3 characters.');
      return out;
    });
  }

  function readZones(list, rows, columns, score) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw new Error('Grid zones must be an array of {label, cells | score}.');
    if (list.length > MAX_ZONES) throw new Error('A grid has at most ' + MAX_ZONES + ' zones.');
    var keys = new Set();
    return list.map(function (zone, i) {
      var at = 'Grid zone ' + (i + 1);
      if (!plain(zone) || text(zone.label) === null) throw new Error(at + ' needs a label.');
      if ((zone.cells == null) === (zone.score == null)) throw new Error(at + ' needs either cells or a score range.');
      var key = text(zone.key) || 'zone-' + (i + 1);
      if (keys.has(key)) throw new Error('Grid zone keys must be unique.');
      keys.add(key);
      var out = { key: key, label: text(zone.label), color: text(zone.color), role: text(zone.role),
        revealStep: text(zone.revealStep), cells: null, score: null };
      if (out.color && !OffPrint._chart.SCALE_COLORS.includes(out.color)) {
        throw new Error(at + ' colour must be a palette name: ' + OffPrint._chart.SCALE_COLORS.join(', ') + '.');
      }
      if (zone.cells != null) {
        if (!Array.isArray(zone.cells) || !zone.cells.length) throw new Error(at + ' cells must be a nonempty list.');
        out.cells = zone.cells.map(function (ref) { return cellRef(rows, columns, ref, at); });
      } else {
        if (!score) throw new Error(at + ' uses a score range, so the grid needs score: "product", "sum", or "value".');
        if (!Array.isArray(zone.score) || zone.score.length !== 2 || !zone.score.every(Number.isFinite) || zone.score[0] > zone.score[1]) {
          throw new Error(at + ' score must be [min, max] with min at or below max.');
        }
        out.score = zone.score.slice();
      }
      return out;
    });
  }

  // ---- Derived bookkeeping ----
  function sum(list) { return list.reduce(function (a, v) { return v === null ? a : a + v; }, 0); }

  // Row, column, and overall totals of the supplied values; missing values count as zero.
  function totals(values) {
    var columns = values[0].map(function (_, c) { return sum(values.map(function (r) { return r[c]; })); });
    var rows = values.map(sum);
    return { rows: rows, columns: columns, all: sum(rows) };
  }

  // Values divided by their row, column, or overall total; null where the value or a zero total leaves no share.
  function shares(values, mode) {
    if (mode === 'none') return values.map(function (r) { return r.slice(); });
    var t = totals(values);
    return values.map(function (r, i) {
      return r.map(function (v, j) {
        var whole = mode === 'row' ? t.rows[i] : mode === 'column' ? t.columns[j] : t.all;
        return v === null || !whole ? null : v / whole;
      });
    });
  }

  // Per class, recall = diagonal / row total (actual) and precision = diagonal / column total (predicted); null when
  // the total is zero. columnOf[r] is the column holding row r's class.
  function metrics(values, columnOf) {
    var t = totals(values);
    var hit = function (r) { return values[r][columnOf[r]] || 0; };
    var rowOf = [];
    columnOf.forEach(function (c, r) { rowOf[c] = r; });
    return {
      recall: values.map(function (_, r) { return t.rows[r] ? hit(r) / t.rows[r] : null; }),
      precision: values[0].map(function (_, c) { return t.columns[c] ? hit(rowOf[c]) / t.columns[c] : null; })
    };
  }

  // Scores of rows and columns: authored scores, else rows count down from the top and columns up from the left.
  function cellScore(info, r, c) {
    var rs = info.rowInfo[r].score ?? info.rowInfo.length - r;
    var cs = info.columnInfo[c].score ?? c + 1;
    if (info.score === 'product') return rs * cs;
    if (info.score === 'sum') return rs + cs;
    return info.values[r][c];
  }

  // The zone index of each cell, or -1: cell lists claim cells first, then the first score range holding the score.
  function assignZones(info) {
    var out = info.values.map(function (r) { return r.map(function () { return -1; }); });
    info.zones.forEach(function (zone, z) {
      (zone.cells || []).forEach(function (rc) { if (out[rc[0]][rc[1]] < 0) out[rc[0]][rc[1]] = z; });
    });
    out.forEach(function (r, i) {
      r.forEach(function (zone, j) {
        if (zone >= 0) return;
        var s = cellScore(info, i, j);
        if (s === null) return;
        r[j] = info.zones.findIndex(function (z) { return z.score && s >= z.score[0] && s <= z.score[1]; });
      });
    });
    return out;
  }

  // Badge slots for count items in a width × height area: [x, y] centres, rows filled first and centred, and how
  // many items did not fit (the last slot then holds the overflow badge).
  function pack(count, width, height, r, gap) {
    var step = 2 * r + gap;
    var across = Math.max(1, Math.floor((width + gap) / step));
    var down = Math.max(1, Math.floor((height + gap) / step));
    var room = across * down;
    var shown = count > room ? room : count;
    var lines = Math.ceil(shown / across);
    var slots = [];
    for (var i = 0; i < shown; i++) {
      var line = Math.floor(i / across);
      var inLine = line < lines - 1 ? across : shown - line * across;
      slots.push([round(width / 2 + ((i % across) - (inLine - 1) / 2) * step), round(height / 2 + (line - (lines - 1) / 2) * step)]);
    }
    return { slots: slots, overflow: count > room ? count - room + 1 : 0 };
  }

  // ---- Spec ----
  function axisTitle(axis) { return typeof axis === 'string' ? axis : plain(axis) ? text(axis.label) || '' : ''; }

  function prepare(spec, kit) {
    var rows = descriptors(spec.rows, 'rows');
    var columns = descriptors(spec.columns, 'columns');
    var read = readValues(spec, rows, columns, kit.toNumber);
    var hasValues = read.values.some(function (r) { return r.some(function (v) { return v !== null; }); });
    var score = spec.score == null ? null : spec.score;
    if (score !== null && !['product', 'sum', 'value'].includes(score)) throw new Error('Grid score must be "product", "sum", or "value".');
    if (score === 'value' && !hasValues) throw new Error('A grid scored by value needs cell values.');
    var items = readItems(spec.items, rows, columns);
    var zones = readZones(spec.zones, rows, columns, score);
    var totalsOpt = spec.totals === true ? 'both' : spec.totals == null || spec.totals === false ? null : spec.totals;
    if (totalsOpt !== null && !['rows', 'columns', 'both'].includes(totalsOpt)) {
      throw new Error('Grid totals must be "rows", "columns", "both", or true.');
    }
    var mode = spec.normalize == null ? 'none' : spec.normalize;
    if (!MODES.includes(mode)) throw new Error('Grid normalize must be "none", "row", "column", or "all".');
    var choices = spec.normalizeChoices;
    if (choices == null) choices = spec.normalize == null ? [] : MODES.slice();
    else if (choices === true) choices = MODES.slice();
    else if (choices === false) choices = [];
    if (!Array.isArray(choices) || choices.some(function (m) { return !MODES.includes(m); }) || choices.length === 1) {
      throw new Error('Grid normalizeChoices must be true, false, or a list of at least two of none, row, column, all.');
    }
    if (choices.length && !choices.includes(mode)) throw new Error('Grid normalizeChoices must include the initial normalize mode.');
    var diagonal = spec.diagonal === true;
    var showMetrics = spec.metrics === true;
    if ((totalsOpt || mode !== 'none' || choices.length || showMetrics) && !hasValues) {
      throw new Error('Grid totals, shares, and precision and recall need cell values.');
    }
    var columnOf = null;
    if (diagonal || showMetrics) {
      columnOf = rows.map(function (r) { return columns.findIndex(function (c) { return c.key === r.key; }); });
      if (rows.length !== columns.length || columnOf.includes(-1)) {
        throw new Error('Grid diagonal emphasis and precision and recall need the same keys on rows and columns.');
      }
    }
    var keys = new Set();
    var points = [];
    rows.forEach(function (row, r) {
      columns.forEach(function (column, c) {
        var key = read.keys[r][c] || 'cell:' + row.key + ':' + column.key;
        if (keys.has(key)) throw new Error('Grid cell keys must be unique.');
        keys.add(key);
        points.push({ x: points.length, y: 0, key: key });
      });
    });
    items.forEach(function (item) {
      if (keys.has(item.key)) throw new Error('Grid item key ' + JSON.stringify(item.key) + ' repeats a cell or item key.');
      keys.add(item.key);
      points.push({ x: points.length, y: 0, key: item.key, label: item.label });
    });
    var value = typeof spec.value === 'string' ? { label: spec.value } : plain(spec.value) ? spec.value : {};
    var info = {
      rows: rows.map(function (d) { return d.key; }), columns: columns.map(function (d) { return d.key; }),
      rowInfo: rows, columnInfo: columns, values: read.values, hasValues: hasValues, items: items, zones: zones, score: score,
      totals: totalsOpt, mode: mode, choices: choices, diagonal: diagonal, metrics: showMetrics, columnOf: columnOf,
      rowLabel: axisTitle(spec.y), columnLabel: axisTitle(spec.x), scale: spec.scale ?? null
    };
    // Validate the colour scale now so a bad scale fails the spec, not the drawing.
    if (hasValues && !zones.length) kit.colorScale(spec.scale, [].concat.apply([], read.values), 'Grid');
    info.zoneOf = assignZones(info);
    var cellH = items.length ? 52 : 40;
    var height = typeof spec.height === 'number' && spec.height > 80 ? spec.height :
      frameTop(info) + rows.length * cellH + marginRows(info) * MARGIN_H + 10;
    return Object.assign({}, spec, {
      z: undefined, cells: undefined, items: undefined, zones: undefined, rows: undefined, columns: undefined,
      series: [{ key: 'grid', name: value.label || 'Value', data: points }],
      x: { label: info.columnLabel }, y: { label: value.label || '', unit: value.unit, digits: value.digits },
      height: height, toggles: false, brush: false, rescale: false, referenceLines: [], categories: undefined, grid: info
    });
  }

  function frameTop(info) { return 8 + (info.columnLabel || info.rowLabel ? 18 : 0) + 18; }
  function marginRows(info) {
    return (info.totals === 'columns' || info.totals === 'both' ? 1 : 0) + (info.metrics ? 1 : 0);
  }
  function marginColumns(info) {
    return (info.totals === 'rows' || info.totals === 'both' ? 1 : 0) + (info.metrics ? 1 : 0);
  }

  function normalize(model, spec, kit, prepared) {
    var info = prepared.grid;
    var cells = info.rows.length * info.columns.length;
    model.grid = info;
    model.toggles = false;
    model.brush = false;
    model.series.forEach(function (series) {
      series.points.forEach(function (p) {
        if (p.x < cells) {
          p.kind = 'cell';
          p.row = Math.floor(p.x / info.columns.length);
          p.col = p.x % info.columns.length;
        } else {
          var item = info.items[p.x - cells];
          p.kind = 'item';
          p.item = item.index;
          p.row = item.row;
          p.col = item.col;
        }
      });
    });
    return model;
  }

  // ---- State ----
  function stateOf(chart) {
    var state = states.get(chart.box);
    if (!state) {
      state = { chart: chart, mode: null, choice: null, follower: null };
      states.set(chart.box, state);
      state.follower = OffPrint._revealSteps ? OffPrint._revealSteps.follow(chart.box, function (follower) {
        var current = state.chart;
        [current.svg, current.legend, current.table].forEach(function (el) { if (el) follower.apply(el); });
      }) : null;
      state.track = OffPrint._readerState?.watch('chart-grid', chart.box, function () {
        var info = state.chart.model.grid;
        return info && info.choices.length ? info.mode : undefined;
      }, function (mode) { return setMode(state.chart, mode, 'api'); },
      { order: 11, revision: function () { return OffPrint._chart._authoredRevision(chart.box); } });
    }
    state.chart = chart;
    hosts.set(chart.box, chart);
    var info = chart.model.grid;
    if (info) {
      if (state.mode === null || (info.choices.length ? !info.choices.includes(state.mode) : state.mode !== info.mode)) {
        state.mode = info.mode;
      }
      info.mode = state.mode;
    }
    return state;
  }

  function setMode(chart, mode, origin) {
    var info = chart.model.grid;
    if (!info || !info.choices.includes(mode)) return false;
    var state = stateOf(chart);
    var previous = state.mode;
    if (previous === mode) return true;
    state.mode = mode;
    info.mode = mode;
    if (state.choice) state.choice.show(mode);
    if (state.kit) state.kit.redraw(chart);
    if (OffPrint._chart.describe) chart.plot.setAttribute('aria-label', OffPrint._chart.describe(chart.model));
    state.track?.(origin);
    if (typeof root.CustomEvent === 'function') {
      chart.box.dispatchEvent(new root.CustomEvent('op:chart:grid-normalize', { bubbles: true, detail: {
        current: mode, previous: previous, origin: origin
      } }));
    }
    return true;
  }

  function shown(chart, step) {
    var follower = stateOf(chart).follower;
    return !step || !follower || follower.shown(step);
  }

  // ---- Reading values ----
  function display(info) { return shares(info.values, info.mode); }

  function percent(v) {
    if (v === null) return '–';
    if (v > 0 && v < 0.001) return '<0.1%';
    return (Math.round(v * 1000) / 10) + '%';
  }

  function valueText(info, v, model) {
    if (v === null) return '';
    return info.mode === 'none' ? OffPrint._chart.format(v, model.y) : percent(v);
  }

  function scaleOf(info, kit) {
    if (!info.hasValues || info.zones.length) return null;
    var shown = [].concat.apply([], display(info));
    if (info.mode === 'none') return kit.colorScale(info.scale, shown, 'Grid');
    var base = typeof info.scale === 'string' ? { type: info.scale } : plain(info.scale) ? info.scale : {};
    var colors = base.type === 'diverging' ? base.colors || ['orange', 'blue'] : [base.color || 'blue'];
    return kit.colorScale({ type: 'sequential', color: colors[colors.length - 1], min: 0, max: 1 }, [], 'Grid');
  }

  function fit(value, chars) {
    return value.length > chars ? value.slice(0, Math.max(1, chars - 1)) + '…' : value;
  }

  function paintAccent(el, source) {
    if (source.role) el.setAttribute('data-op-role', source.role);
    else if (source.color) el.setAttribute('data-op-color', source.color);
  }

  function revealTag(el, step, chart) {
    if (!step || !stateOf(chart).follower) return el;
    el.setAttribute('data-op-reveal-step', step);
    el.classList.add('op-reveal-ready');
    if (!shown(chart, step)) el.classList.add('op-reveal-pending');
    return el;
  }

  // ---- Drawing ----
  function draw(chart, width, kit) {
    var model = chart.view;
    var info = model.grid;
    var state = stateOf(chart);
    state.kit = kit;
    var svg = kit.svg;
    var CHAR = kit.CHAR;
    var height = model.height;
    var rows = info.rows.length;
    var cols = info.columns.length;
    var shownValues = display(info);
    var t = info.hasValues ? totals(info.values) : null;
    var m = info.metrics ? metrics(info.values, info.columnOf) : null;
    var scale = scaleOf(info, kit);
    var tickInfo = scale && kit.ticks(scale.lo, scale.hi, 4, true, true);
    var tickFmt = scale && (info.mode === 'none' ? kit.tickFormat(tickInfo) : function (v) { return percent(v); });
    var ticks = scale ? tickInfo.ticks.filter(function (v) { return v >= scale.lo && v <= scale.hi; }) : [];
    var tickW = Math.max.apply(null, ticks.map(function (v) { return tickFmt(v).length; }).concat([1])) * CHAR;
    var scaleW = scale ? 20 + BAR + 8 + tickW : 0;
    var right = 4 + marginColumns(info) * MARGIN_W + scaleW;
    var room = Math.max(4, Math.floor(width * 0.24 / CHAR));
    var rowText = info.rowInfo.map(function (d) { return fit(d.label, room); });
    var marginNames = (info.totals === 'columns' || info.totals === 'both' ? ['Total'] : []).concat(info.metrics ? ['Precision'] : []);
    var left = 12 + CHAR * Math.max.apply(null, rowText.concat(marginNames).map(function (s) { return s.length; }).concat([1]));
    var top = frameTop(info);
    var plotW = Math.max(40, width - left - right);
    var plotB = height - 10 - marginRows(info) * MARGIN_H;
    var cw = plotW / cols;
    var ch = Math.max(1, plotB - top) / rows;
    var inset = cw > 8 && ch > 8 ? 1 : 0;

    if (scale) {
      chart.plot.style.setProperty('--op-grid-high', 'var(--op-' + scale.colors[scale.colors.length - 1] + ')');
      chart.plot.style.setProperty('--op-grid-low', 'var(--op-' + scale.colors[0] + ')');
    }
    var frame = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height, 'aria-hidden': 'true', focusable: 'false' });
    var colChars = Math.max(3, Math.floor((cw - 6) / CHAR));
    info.columnInfo.forEach(function (d, i) {
      var label = svg('text', { x: left + cw * (i + 0.5), y: top - 7, 'text-anchor': 'middle', class: 'op-chart-tick' }, frame);
      label.textContent = fit(d.label, colChars);
      if (label.textContent !== d.label) svg('title', {}, label).textContent = d.label;
    });
    info.rowInfo.forEach(function (d, i) {
      var label = svg('text', { x: left - 8, y: top + ch * (i + 0.5), 'text-anchor': 'end', 'dominant-baseline': 'middle',
        class: 'op-chart-tick' }, frame);
      label.textContent = rowText[i];
      if (rowText[i] !== d.label) svg('title', {}, label).textContent = d.label;
    });
    if (info.columnLabel) {
      svg('text', { x: left + plotW / 2, y: 14, 'text-anchor': 'middle', class: 'op-chart-label' }, frame).textContent = info.columnLabel;
    }
    if (info.rowLabel) svg('text', { x: 0, y: 14, class: 'op-chart-label' }, frame).textContent = info.rowLabel;

    var layer = svg('g', { class: 'op-chart-marks' }, frame);
    var cellGroup = svg('g', { class: 'op-chart-series op-grid-cells' }, layer);
    var zoneGroup = svg('g', { class: 'op-grid-zones' }, layer);
    var textGroup = svg('g', { class: 'op-grid-values' }, layer);
    var trailGroup = svg('g', { class: 'op-grid-trails' }, layer);
    var itemGroup = svg('g', { class: 'op-grid-items' }, layer);
    var marks = new Map();
    var spots = [];
    var series = model.series[0];
    var points = series ? series.points : [];
    var byCell = new Map();
    points.forEach(function (p) {
      if (p.kind !== 'item') return;
      var at = p.row + ':' + p.col;
      if (!byCell.has(at)) byCell.set(at, []);
      byCell.get(at).push(p);
    });
    var R = Math.max(4, Math.min(8, cw / 5, ch / 5));
    var centre = function (r, c) { return [left + cw * (c + 0.5), top + ch * (r + 0.5)]; };
    var itemSpots = [];
    var slotOf = new Map();

    points.forEach(function (p) {
      if (p.kind !== 'cell') return;
      var x = left + cw * p.col;
      var y = top + ch * p.row;
      var v = shownValues[p.row][p.col];
      var rect = svg('rect', { x: round(x + inset), y: round(y + inset), width: round(Math.max(0, cw - inset * 2)),
        height: round(Math.max(0, ch - inset * 2)), rx: inset ? 2 : 0, class: 'op-grid-cell', 'data-op-key': p.key }, cellGroup);
      if (scale && v !== null) {
        var paint = scale.paint(v);
        rect.setAttribute('data-op-heat', paint.hue);
        rect.setAttribute('fill-opacity', paint.alpha);
      }
      var diagonal = info.diagonal && info.columnOf[p.row] === p.col;
      if (diagonal) rect.classList.add('is-diagonal');
      kit.tagKey(model, rect, p);
      kit.addMark(marks, kit.markId(series.key, 'cell', p), {
        el: rect, from: scale && v !== null ? { 'fill-opacity': 0 } : undefined, fade: !(scale && v !== null),
        order: cols > 1 ? p.col / (cols - 1) : 0, obstacle: false
      });
      var zone = info.zoneOf[p.row][p.col];
      if (zone >= 0) {
        var z = info.zones[zone];
        var fill = svg('rect', { x: round(x + inset), y: round(y + inset), width: round(Math.max(0, cw - inset * 2)),
          height: round(Math.max(0, ch - inset * 2)), rx: inset ? 2 : 0, class: 'op-grid-zone', 'data-op-zone': z.key }, zoneGroup);
        paintAccent(fill, z);
        revealTag(fill, z.revealStep, chart);
        kit.addMark(marks, kit.markId('zones', 'cell', p), { el: fill, fade: true, order: 0, obstacle: false });
      }
      var crowded = byCell.has(p.row + ':' + p.col);
      if (v !== null) {
        var label = svg('text', crowded ? { x: round(x + 5), y: round(y + 11), class: 'op-grid-value is-corner' } :
          { x: round(x + cw / 2), y: round(y + ch / 2), 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'op-grid-value' },
        textGroup);
        if (diagonal) label.classList.add('is-diagonal');
        label.textContent = fit(valueText(info, v, model), Math.max(2, Math.floor((cw - 6) / CHAR)));
        kit.addMark(marks, kit.markId('values', 'text', p), { el: label, fade: true, order: 0, obstacle: false });
      }
      var spot = { px: x + cw / 2, py: y + ch / 2, p: p, s: series, el: rect };
      spots.push(spot);
      if (!crowded) return;
      var list = byCell.get(p.row + ':' + p.col);
      var reserved = v !== null ? 14 : 0;
      var packed = pack(list.length, Math.max(0, cw - 6), Math.max(0, ch - 6 - reserved), R, GAP);
      list.forEach(function (item, i) {
        var slot = packed.slots[Math.min(i, packed.slots.length - 1)];
        var over = packed.overflow && i >= packed.slots.length - 1;
        slotOf.set(item.key, { x: round(x + 3 + slot[0]), y: round(y + 3 + reserved + slot[1]), over: over });
      });
      if (packed.overflow) {
        var last = packed.slots[packed.slots.length - 1];
        var ox = round(x + 3 + last[0]);
        var oy = round(y + 3 + reserved + last[1]);
        var more = svg('g', { class: 'op-grid-overflow' }, itemGroup);
        var badge = svg('circle', { cx: ox, cy: oy, r: round(R), class: 'op-grid-badge' }, more);
        var count = svg('text', { x: ox, y: oy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'op-grid-badge-text' }, more);
        count.textContent = '+' + packed.overflow;
        kit.addMark(marks, kit.markId('items', 'overflow', p), { el: badge, fade: true, order: 1 });
        kit.addMark(marks, kit.markId('items', 'overflow-text', p), { el: count, fade: true, order: 1, obstacle: false });
        slotOf.set('\u0001' + p.key, { badge: badge });
      }
    });

    points.forEach(function (p) {
      if (p.kind !== 'item') return;
      var item = info.items[p.item];
      var slot = slotOf.get(p.key);
      if (!slot) return;
      var cellKey = points.find(function (q) { return q.kind === 'cell' && q.row === p.row && q.col === p.col; }).key;
      var g = svg('g', { class: 'op-grid-item', 'data-op-item': item.key }, slot.over ? trailGroup : itemGroup);
      paintAccent(g, item);
      revealTag(g, item.revealStep, chart);
      if (item.from) {
        var start = centre(item.from[0], item.from[1]);
        var trail = svg('path', { d: 'M' + round(start[0]) + ',' + round(start[1]) + 'L' + slot.x + ',' + slot.y,
          class: 'op-grid-trail' }, g);
        var ghost = svg('circle', { cx: round(start[0]), cy: round(start[1]), r: round(R * 0.6), class: 'op-grid-trail-from' }, g);
        kit.addMark(marks, kit.markId('items', 'trail', p), { el: trail, fade: true, order: 1, obstacle: false });
        kit.addMark(marks, kit.markId('items', 'from', p), { el: ghost, fade: true, order: 1, obstacle: false });
      }
      var el = null;
      if (!slot.over) {
        el = svg('circle', { cx: slot.x, cy: slot.y, r: round(R), class: 'op-grid-dot' }, g);
        kit.tagKey(model, el, p);
        kit.addMark(marks, kit.markId(series.key, 'item', p), { el: el, fade: true, order: 1 });
        if (R >= 6.5) {
          var badgeText = svg('text', { x: slot.x, y: slot.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            class: 'op-grid-dot-text' }, g);
          badgeText.textContent = item.short;
          kit.addMark(marks, kit.markId(series.key, 'item-text', p), { el: badgeText, fade: true, order: 1, obstacle: false });
        }
      } else {
        var holder = slotOf.get('\u0001' + cellKey);
        el = holder && holder.badge;
      }
      itemSpots.push({ px: slot.x, py: slot.y, p: p, s: series, el: el, over: slot.over, group: g });
    });
    spots = spots.concat(itemSpots);

    // Margins: totals and recall right of the plot, totals and precision under it.
    var marginGroup = svg('g', { class: 'op-grid-margins' }, frame);
    var mx = left + plotW + 4;
    var marginCol = function (title, values, format) {
      var cx = mx + MARGIN_W / 2;
      svg('text', { x: cx, y: top - 7, 'text-anchor': 'middle', class: 'op-chart-tick op-grid-margin-head' }, marginGroup).textContent = title;
      values.forEach(function (v, r) {
        svg('text', { x: cx, y: top + ch * (r + 0.5), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          class: 'op-grid-margin' }, marginGroup).textContent = format(v);
      });
      mx += MARGIN_W;
    };
    var my = plotB;
    var marginRow = function (title, values, format) {
      var cy = my + MARGIN_H / 2 + 2;
      svg('text', { x: left - 8, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'op-chart-tick op-grid-margin-head' },
        marginGroup).textContent = title;
      values.forEach(function (v, c) {
        svg('text', { x: left + cw * (c + 0.5), y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'op-grid-margin' },
          marginGroup).textContent = format(v);
      });
      my += MARGIN_H;
    };
    var count = function (v) { return OffPrint._chart.format(v, model.y); };
    if (info.totals === 'rows' || info.totals === 'both') marginCol('Total', t.rows, count);
    if (m) marginCol('Recall', m.recall, percent);
    if (info.totals === 'columns' || info.totals === 'both') marginRow('Total', t.columns, count);
    if (m) marginRow('Precision', m.precision, percent);
    if (t && info.totals === 'both') {
      svg('text', { x: left + plotW + 4 + MARGIN_W / 2, y: plotB + MARGIN_H / 2 + 2, 'text-anchor': 'middle',
        'dominant-baseline': 'middle', class: 'op-grid-margin is-grand' }, marginGroup).textContent = count(t.all);
    }

    if (scale) {
      var x0 = mx + 16;
      var bar = svg('g', { class: 'op-grid-scale' }, frame);
      var scaleY = function (v) { return plotB - scale.pos(v) * (plotB - top); };
      svg('rect', { x: x0, y: top, width: BAR, height: plotB - top, class: 'op-grid-backdrop' }, bar);
      var stepH = (plotB - top) / STEPS;
      for (var i = 0; i < STEPS; i++) {
        var swatch = scale.paint(scale.invert((i + 0.5) / STEPS));
        svg('rect', { x: x0, y: round(plotB - (i + 1) * stepH), width: BAR, height: round(stepH + 0.5), class: 'op-grid-swatch',
          'data-op-heat': swatch.hue, 'fill-opacity': swatch.alpha }, bar);
      }
      ticks.forEach(function (v) {
        var y = Math.round(scaleY(v)) + 0.5;
        svg('line', { x1: x0 + BAR, x2: x0 + BAR + 4, y1: y, y2: y, class: 'op-grid-scale-tick' }, bar);
        svg('text', { x: x0 + BAR + 7, y: y, 'dominant-baseline': 'middle', class: 'op-chart-tick' }, bar).textContent = tickFmt(v);
      });
    }

    if (info.items.some(function (item) { return item.revealStep; }) || info.zones.some(function (z) { return z.revealStep; })) {
      if (!state.follower) {
        OffPrint._warnOnce('chart-grid-reveal:' + (chart.box.id || ''), 'Grid items and zones with a revealStep need ' +
          'data-op-reveal-sequence on the chart; they are shown at every step.', chart.box);
      }
    }
    chart.gridGeom = { left: left, top: top, cw: cw, ch: ch, rows: rows, cols: cols, R: R };
    var span = function (axis, v) {
      var list = axis === 'x' ? info.columnInfo : info.rowInfo;
      var name = String(v);
      var i = list.findIndex(function (d) { return d.key === name; });
      if (i < 0) i = list.findIndex(function (d) { return d.label === name; });
      if (i < 0) return null;
      return axis === 'x' ? [left + cw * i, left + cw * (i + 1)] : [top + ch * i, top + ch * (i + 1)];
    };
    return { frame: frame, layer: layer, marks: marks, spots: spots, empty: '',
      geom: { left: left, right: left + plotW, top: top, bottom: plotB,
        px: function (axis, v) { var at = span(axis, v); return at && (at[0] + at[1]) / 2; },
        span: span,
        cell: function (row, col) {
          var r = span('y', row);
          var c = span('x', col);
          return r && c ? { x: c[0], y: r[0], width: c[1] - c[0], height: r[1] - r[0] } : null;
        } } };
  }

  // ---- Reading ----
  function cellIndex(chart, row, col) {
    return chart.spots.findIndex(function (s) { return s.p.kind === 'cell' && s.p.row === row && s.p.col === col; });
  }

  function itemShown(chart, spot) {
    return spot.p.kind === 'item' && shown(chart, chart.model.grid.items[spot.p.item].revealStep);
  }

  function pick(chart, px, py) {
    var g = chart.gridGeom;
    if (!g) return -1;
    var best = -1;
    var gap = g.R + 3;
    chart.spots.forEach(function (spot, i) {
      if (spot.p.kind !== 'item' || spot.over || !itemShown(chart, spot)) return;
      var d = Math.hypot(spot.px - px, spot.py - py);
      if (d <= gap) { gap = d; best = i; }
    });
    if (best >= 0) return best;
    if (px < g.left || py < g.top || px > g.left + g.cw * g.cols || py > g.top + g.ch * g.rows) return -1;
    return cellIndex(chart, Math.min(g.rows - 1, Math.floor((py - g.top) / g.ch)), Math.min(g.cols - 1, Math.floor((px - g.left) / g.cw)));
  }

  function cellName(info, r, c) { return info.rowInfo[r].label + ' · ' + info.columnInfo[c].label; }

  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    var info = model.grid;
    var p = spot.p;
    var zone = info.zoneOf[p.row][p.col];
    var zoneShown = zone >= 0 && shown(chart, info.zones[zone].revealStep);
    if (p.kind === 'item') {
      var item = info.items[p.item];
      kit.html('div', 'op-chart-tip-head', tip, item.label);
      kit.html('div', 'op-chart-tip-row', tip, cellName(info, p.row, p.col) + (zoneShown ? ' · ' + info.zones[zone].label : ''));
      if (item.from) kit.html('div', 'op-chart-tip-row', tip, 'Moved from ' + cellName(info, item.from[0], item.from[1]));
      if (item.text) kit.html('div', 'op-chart-tip-note', tip, item.text);
      if (spot.el) spot.el.classList.add('is-active');
      return spot.py;
    }
    kit.html('div', 'op-chart-tip-head', tip, cellName(info, p.row, p.col));
    if (zoneShown) {
      var zrow = kit.html('div', 'op-chart-tip-row', tip);
      var key = kit.html('span', 'op-chart-key op-grid-zone-key', zrow);
      paintAccent(key, info.zones[zone]);
      kit.html('span', '', zrow, info.zones[zone].label);
    }
    var raw = info.values[p.row][p.col];
    if (raw !== null) {
      var v = display(info)[p.row][p.col];
      var row = kit.html('div', 'op-chart-tip-row', tip);
      kit.html('b', '', row, info.mode === 'none' ? kit.format(raw, model.y) : percent(v));
      var t = totals(info.values);
      var whole = info.mode === 'row' ? t.rows[p.row] : info.mode === 'column' ? t.columns[p.col] : t.all;
      var of = { row: 'of the row', column: 'of the column', all: 'of all' }[info.mode];
      kit.html('span', 'op-chart-tip-series', row, info.mode === 'none' ? model.y.label || '' :
        of + ' (' + kit.format(raw, model.y) + ' of ' + kit.format(whole, model.y) + ')');
      if (info.diagonal && info.columnOf[p.row] === p.col) kit.html('div', 'op-chart-tip-note', tip, 'Diagonal');
    }
    var list = chart.spots.filter(function (s) { return s.p.kind === 'item' && s.p.row === p.row && s.p.col === p.col && itemShown(chart, s); });
    if (list.length) {
      var names = list.slice(0, 8).map(function (s) { var it = info.items[s.p.item]; return it.short + ' ' + it.label; });
      if (list.length > 8) names.push('+' + (list.length - 8) + ' more');
      kit.html('div', 'op-chart-tip-row', tip, list.length + (list.length === 1 ? ' item: ' : ' items: ') + names.join(', '));
    }
    spot.el.classList.add('is-active');
    return spot.py;
  }

  // Arrows move between cells; [ and ] step through the items shown in the current cell.
  function keys(chart, event, kit) {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    var spots = chart.spots;
    var current = spots[chart.active < 0 ? 0 : chart.active];
    var g = chart.gridGeom;
    if (!current || !g) return false;
    var r = current.p.row;
    var c = current.p.col;
    var move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (move) {
      event.preventDefault();
      if (chart.active < 0) return kit.inspect(chart, cellIndex(chart, 0, 0)), true;
      kit.inspect(chart, cellIndex(chart, Math.max(0, Math.min(g.rows - 1, r + move[0])), Math.max(0, Math.min(g.cols - 1, c + move[1]))));
      return true;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      kit.inspect(chart, event.key === 'Home' ? cellIndex(chart, 0, 0) : cellIndex(chart, g.rows - 1, g.cols - 1));
      return true;
    }
    if (event.key !== '[' && event.key !== ']') return false;
    event.preventDefault();
    var here = [cellIndex(chart, r, c)].concat(spots.map(function (s, i) { return i; }).filter(function (i) {
      return spots[i].p.kind === 'item' && spots[i].p.row === r && spots[i].p.col === c && itemShown(chart, spots[i]);
    }));
    var at = Math.max(0, here.indexOf(chart.active));
    kit.inspect(chart, here[(at + (event.key === ']' ? 1 : here.length - 1)) % here.length]);
    return true;
  }

  function coords(model, geom, px, py) {
    var info = model.grid;
    var c = Math.min(info.columns.length - 1, Math.floor((px - geom.left) / ((geom.right - geom.left) / info.columns.length)));
    var r = Math.min(info.rows.length - 1, Math.floor((py - geom.top) / ((geom.bottom - geom.top) / info.rows.length)));
    var v = info.values[r][c];
    return { x: info.columnInfo[c].label, y: info.rowInfo[r].label, z: v, xText: info.columnInfo[c].label,
      yText: info.rowInfo[r].label + (v === null ? '' : ' · ' + valueText(info, display(info)[r][c], model)) };
  }

  function table(model, kit) {
    var info = model.grid;
    var wrap = kit.html('div', 'op-grid-tables');
    var points = model.series[0] ? model.series[0].points : [];
    var shownValues = display(info);
    var t = info.hasValues ? totals(info.values) : null;
    var m = info.metrics ? metrics(info.values, info.columnOf) : null;
    var rowTotals = info.totals === 'rows' || info.totals === 'both';
    var colTotals = info.totals === 'columns' || info.totals === 'both';
    var element = kit.html('table', 'op-grid-table', wrap);
    var head = kit.html('tr', '', kit.html('thead', '', element));
    var body = kit.html('tbody', '', element);
    [info.rowLabel].concat(info.columnInfo.map(function (d) { return d.label; }), rowTotals ? ['Total'] : [], m ? ['Recall'] : [])
      .forEach(function (label) { kit.html('th', '', head, label).setAttribute('scope', 'col'); });
    info.rowInfo.forEach(function (d, r) {
      var tr = kit.html('tr', '', body);
      kit.html('th', '', tr, d.label).setAttribute('scope', 'row');
      info.columnInfo.forEach(function (_, c) {
        var p = points.find(function (q) { return q.kind === 'cell' && q.row === r && q.col === c; });
        var zone = info.zoneOf[r][c];
        var parts = [valueText(info, shownValues[r][c], model), zone >= 0 ? info.zones[zone].label : '']
          .concat(info.items.filter(function (item) { return item.row === r && item.col === c; }).map(function (item) { return item.label; }));
        kit.tagKey(model, kit.html('td', '', tr, parts.filter(Boolean).join(' · ')), p);
      });
      if (rowTotals) kit.html('td', '', tr, kit.format(t.rows[r], model.y));
      if (m) kit.html('td', '', tr, percent(m.recall[r]));
    });
    var footer = function (title, values, format, extra) {
      var tr = kit.html('tr', '', body);
      kit.html('th', '', tr, title).setAttribute('scope', 'row');
      values.forEach(function (v) { kit.html('td', '', tr, format(v)); });
      if (rowTotals) kit.html('td', '', tr, extra);
      if (m) kit.html('td', '', tr, '');
    };
    if (colTotals) footer('Total', t.columns, function (v) { return kit.format(v, model.y); }, rowTotals ? kit.format(t.all, model.y) : '');
    if (m) footer('Precision', m.precision, percent, '');
    if (info.items.length) {
      var items = kit.html('table', 'op-grid-items-table', wrap);
      var ih = kit.html('tr', '', kit.html('thead', '', items));
      var ib = kit.html('tbody', '', items);
      var notes = info.items.some(function (item) { return item.text; });
      var moves = info.items.some(function (item) { return item.from; });
      ['Item', info.rowLabel || 'Row', info.columnLabel || 'Column'].concat(moves ? ['From'] : [], info.zones.length ? ['Zone'] : [],
        notes ? ['Note'] : []).forEach(function (label) { kit.html('th', '', ih, label).setAttribute('scope', 'col'); });
      info.items.forEach(function (item) {
        var p = points.find(function (q) { return q.kind === 'item' && q.item === item.index; });
        var tr = kit.tagKey(model, kit.html('tr', '', ib), p);
        if (item.revealStep) tr.setAttribute('data-op-reveal-step', item.revealStep);
        kit.html('th', '', tr, item.short + ' ' + item.label).setAttribute('scope', 'row');
        kit.html('td', '', tr, info.rowInfo[item.row].label);
        kit.html('td', '', tr, info.columnInfo[item.col].label);
        if (moves) kit.html('td', '', tr, item.from ? cellName(info, item.from[0], item.from[1]) : '');
        if (info.zones.length) {
          var zone = info.zoneOf[item.row][item.col];
          kit.html('td', '', tr, zone >= 0 ? info.zones[zone].label : '');
        }
        if (notes) kit.html('td', '', tr, item.text || '');
      });
    }
    return wrap;
  }

  function describe(model) {
    var info = model.grid;
    var what = model.y.label || (info.hasValues ? 'values' : 'cells');
    var parts = ['Grid of ' + what + (info.rowLabel && info.columnLabel ? ' by ' + info.rowLabel + ' and ' + info.columnLabel : '') +
      ', ' + info.rows.length + ' rows by ' + info.columns.length + ' columns.'];
    if (info.zones.length) {
      parts.push('Zones: ' + info.zones.map(function (z, i) {
        var n = info.zoneOf.reduce(function (a, r) { return a + r.filter(function (v) { return v === i; }).length; }, 0);
        return z.label + ' (' + n + (n === 1 ? ' cell)' : ' cells)');
      }).join(', ') + '.');
    }
    if (info.items.length) {
      parts.push(info.items.length + (info.items.length === 1 ? ' item sits' : ' items sit') + ' in the cells' +
        (info.items.some(function (item) { return item.from; }) ? '; lines show moves from earlier cells.' : '.'));
    }
    if (info.diagonal) parts.push('The diagonal is emphasised.');
    if (info.mode !== 'none') parts.push('Values are ' + MODE_LABELS[info.mode].toLowerCase() + '.');
    if (info.totals) parts.push('Totals are shown for ' + (info.totals === 'both' ? 'rows and columns' : info.totals) + '.');
    if (info.metrics) parts.push('Recall is shown for each row and precision for each column.');
    if (info.choices.length) parts.push('The chips switch between ' + info.choices.map(function (m) { return MODE_LABELS[m].toLowerCase(); }).join(', ') + '.');
    if (info.items.length) parts.push('Arrow keys move between cells, and [ and ] step through the items in a cell.');
    return parts.join(' ');
  }

  // ---- Legend ----
  function legend(chart, el, kit) {
    var state = stateOf(chart);
    state.kit = kit;
    var info = chart.model.grid;
    info.zones.forEach(function (zone) {
      var item = kit.html('span', 'op-chart-legend-item op-grid-zone-item', el);
      paintAccent(kit.html('span', 'op-chart-key op-grid-zone-key', item), zone);
      kit.html('span', '', item, zone.label);
      revealTag(item, zone.revealStep, chart);
    });
    state.choice = null;
    if (info.choices.length && OffPrint._choices) {
      state.choice = OffPrint._choices.create({
        label: 'Show values as', hideLabel: true, multiple: false, display: 'chips', className: 'op-grid-normalize',
        options: info.choices.map(function (mode) { return { value: mode, label: MODE_LABELS[mode] }; }),
        onChange: function (mode) { if (!setMode(chart, mode, 'user')) state.choice.show(state.mode); }
      });
      state.choice.show(state.mode);
      el.appendChild(state.choice.el);
    }
  }

  // ---- Markup and named sources ----
  // Header row of column labels, then one row label and its values per row; data-op-key cells key their cells.
  function fromTable(rows, keyCells) {
    var head = rows[0] || [];
    var body = rows.slice(1);
    var cells = [];
    body.forEach(function (r, i) {
      head.slice(1).forEach(function (column, c) {
        var key = keyCells && (keyCells[i + 1] || [])[c + 1];
        cells.push({ row: r[0], column: column, value: r[c + 1] ?? null, key: key || undefined });
      });
    });
    return { y: head[0] || '', columns: head.slice(1), rows: body.map(function (r) { return r[0]; }), cells: cells };
  }

  var FIELD_NAMES = ['row', 'column', 'value', 'item', 'label', 'fromRow', 'fromColumn', 'pointKey', 'text'];

  function mapFields(mapping) {
    var bad = !plain(mapping) || typeof mapping.row !== 'string' || typeof mapping.column !== 'string' ||
      (mapping.value === undefined) === (mapping.item === undefined) ||
      FIELD_NAMES.some(function (name) { return mapping[name] !== undefined && (typeof mapping[name] !== 'string' || !mapping[name].trim()); });
    if (bad) {
      throw new Error('Grid mapping needs row and column field names and either value (cell records) or item (item records), ' +
        'plus optional label, fromRow, fromColumn, text, and pointKey.');
    }
    return FIELD_NAMES.filter(function (name) { return mapping[name] !== undefined; }).map(function (name) { return mapping[name]; });
  }

  // Cell records set values; item records place keyed items. Rows and columns not listed in the spec follow first appearance.
  function mapRecords(records, fields, mapping, spec) {
    var out = Object.assign({}, spec);
    var listed = function (name, field) {
      if (out[name] != null) return;
      var seen = [];
      records.forEach(function (record) {
        var v = text(record[field]);
        if (v !== null && seen.indexOf(v) < 0) seen.push(v);
      });
      out[name] = seen;
    };
    listed('rows', mapping.row);
    listed('columns', mapping.column);
    if (out.x == null) out.x = mapping.column;
    if (out.y == null) out.y = mapping.row;
    if (mapping.value !== undefined) {
      if (out.value == null) out.value = mapping.value;
      out.cells = records.map(function (record) {
        return { row: record[mapping.row], column: record[mapping.column], value: record[mapping.value],
          key: mapping.pointKey && record[mapping.pointKey] != null ? String(record[mapping.pointKey]) : undefined };
      });
      delete out.z;
    } else {
      out.items = records.map(function (record, i) {
        var from = mapping.fromRow && mapping.fromColumn && text(record[mapping.fromRow]) !== null && text(record[mapping.fromColumn]) !== null ?
          [record[mapping.fromRow], record[mapping.fromColumn]] : undefined;
        var key = record[mapping.item];
        if (text(key) === null) throw new Error('Grid item field ' + JSON.stringify(mapping.item) + ' is empty in record ' + (i + 1) + '.');
        return { key: String(key), label: mapping.label ? record[mapping.label] : undefined, row: record[mapping.row],
          column: record[mapping.column], from: from, text: mapping.text ? record[mapping.text] : undefined };
      });
    }
    return out;
  }

  OffPrint.chart.addon('chart-grid', {
    types: { grid: {
      base: 'scatter', legend: 'grid-zones', prepare: prepare, normalize: normalize, draw: draw, pick: pick,
      readout: readout, table: table, describe: describe, keys: keys, coords: coords, fromTable: fromTable,
      mapFields: mapFields, mapRecords: mapRecords
    } },
    legends: { 'grid-zones': legend }
  });

  function chartOf(target) {
    var host = typeof target === 'string' ? root.document.getElementById(target) : target;
    var chart = host && hosts.get(host);
    return chart && chart.model.addon === 'grid' && chart.model.grid ? chart : null;
  }

  OffPrint._chart._grid = {
    totals: totals, shares: shares, metrics: metrics, pack: pack, assignZones: assignZones, score: cellScore,
    // Reads or sets how a grid shows its values: none, row, column, or all. Setting needs that mode among its choices.
    normalize: function (target, mode) {
      var chart = chartOf(target);
      if (!chart) return arguments.length > 1 ? false : null;
      if (arguments.length < 2) return stateOf(chart).mode;
      return setMode(chart, mode, 'api');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
