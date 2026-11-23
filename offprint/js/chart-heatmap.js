// Heatmaps colour a grid of cells from a z matrix or long-form records, with a side colour scale that dims cells
// outside a value range, and optional contour lines traced by marching squares over complete numeric grids, which a
// legend chip hides and shows.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || typeof OffPrint.chart.addon !== 'function') return;

  var MAX_CELLS = 5000;
  var MAX_LEVELS = 20;
  var STEPS = 48;
  var GAP = 28;
  var BAR = 12;
  var COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  var states = new WeakMap();
  var hosts = new WeakMap();

  function label(value, what) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    throw new Error('Heatmap ' + what + ' labels must be nonempty text or finite numbers.');
  }

  function cellValue(value, toNumber) {
    if (value === null || value === undefined || value === '') return null;
    var number = toNumber(value);
    if (number === null) throw new Error('Heatmap values must be finite numbers, or null for a missing cell.');
    return number;
  }

  function unique(labels, what) {
    if (new Set(labels).size !== labels.length) throw new Error('Heatmap ' + what + ' labels must be unique.');
    return labels;
  }

  function checkSize(rows, columns) {
    if (!rows || !columns) throw new Error('A heatmap needs at least one row and one column.');
    if (rows * columns > MAX_CELLS) {
      throw new Error('A heatmap draws at most ' + MAX_CELLS + ' cells; this one has ' + rows * columns + '.');
    }
  }

  // Long-form records [{x, y, z, key?}] -> grid. Columns and rows follow first appearance unless listed.
  function pivot(records, options, toNumber) {
    options = options || {};
    toNumber = toNumber || function (v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; };
    if (!Array.isArray(records)) throw new Error('Heatmap records must be an array of {x, y, z} objects.');
    var listed = function (list, what) {
      if (list == null) return null;
      if (!Array.isArray(list)) throw new Error('Heatmap ' + what + ' must be an array of labels.');
      return unique(list.map(function (item) { return label(item, what === 'columns' ? 'column' : 'row'); }), what);
    };
    var columns = listed(options.columns, 'columns');
    var rows = listed(options.rows, 'rows');
    var cols = columns ? columns.slice() : [];
    var rowList = rows ? rows.slice() : [];
    var cells = new Map();
    records.forEach(function (record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('Heatmap records must be objects with x, y, and z.');
      }
      var x = label(record.x, 'column');
      var y = label(record.y, 'row');
      if (columns ? !columns.includes(x) : !cols.includes(x) && !cols.push(x)) {
        throw new Error('Heatmap column ' + JSON.stringify(x) + ' is not in the listed columns.');
      }
      if (rows ? !rows.includes(y) : !rowList.includes(y) && !rowList.push(y)) {
        throw new Error('Heatmap row ' + JSON.stringify(y) + ' is not in the listed rows.');
      }
      var at = y + '\u0001' + x;
      if (cells.has(at)) throw new Error('Heatmap records repeat the cell ' + JSON.stringify(y) + ' × ' + JSON.stringify(x) + '.');
      if (record.key !== undefined && record.key !== null && (typeof record.key !== 'string' || !record.key.trim())) {
        throw new Error('Heatmap cell keys must be nonempty strings.');
      }
      cells.set(at, { z: cellValue(record.z, toNumber), key: record.key == null ? null : record.key.trim() });
    });
    checkSize(rowList.length, cols.length);
    var z = rowList.map(function (row) {
      return cols.map(function (col) { var cell = cells.get(row + '\u0001' + col); return cell ? cell.z : null; });
    });
    var keys = rowList.map(function (row) {
      return cols.map(function (col) { var cell = cells.get(row + '\u0001' + col); return cell ? cell.key : null; });
    });
    return { columns: cols, rows: rowList, z: z, keys: keys };
  }

  // A z matrix with optional column and row labels (1-based numbers by default) and an optional key matrix.
  function matrix(spec, toNumber) {
    var z = spec.z;
    if (!Array.isArray(z) || !z.length || z.some(function (row) { return !Array.isArray(row); })) {
      throw new Error('Heatmap z must be an array of rows, each an array of values.');
    }
    var width = z[0].length;
    if (z.some(function (row) { return row.length !== width; })) throw new Error('Every heatmap z row needs the same length.');
    checkSize(z.length, width);
    var names = function (list, count, what) {
      if (list == null) return Array.from({ length: count }, function (_, i) { return String(i + 1); });
      if (!Array.isArray(list) || list.length !== count) {
        throw new Error('Heatmap ' + what + 's need one label per ' + (what === 'row' ? 'z row.' : 'z column.'));
      }
      return unique(list.map(function (item) { return label(item, what); }), what);
    };
    var keys = spec.keys;
    if (keys != null && (!Array.isArray(keys) || keys.length !== z.length ||
        keys.some(function (row) { return !Array.isArray(row) || row.length !== width; }))) {
      throw new Error('Heatmap keys must match the shape of z.');
    }
    return {
      columns: names(spec.columns, width, 'column'),
      rows: names(spec.rows, z.length, 'row'),
      z: z.map(function (row) { return row.map(function (v) { return cellValue(v, toNumber); }); }),
      keys: z.map(function (row, r) {
        return row.map(function (_, c) {
          var key = keys ? keys[r][c] : null;
          if (key != null && (typeof key !== 'string' || !key.trim())) throw new Error('Heatmap cell keys must be nonempty strings.');
          return key == null ? null : key.trim();
        });
      })
    };
  }

  function scaleOptions(option) {
    var raw = typeof option === 'string' ? { type: option } : option == null ? {} : option;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Heatmap scale must be "sequential", "diverging", "log", or an object with a type.');
    }
    var type = raw.type ?? 'sequential';
    if (!['sequential', 'diverging', 'log'].includes(type)) {
      throw new Error('Heatmap scale type must be "sequential", "diverging", or "log".');
    }
    ['min', 'max', 'mid'].forEach(function (end) {
      if (raw[end] != null && !(typeof raw[end] === 'number' && Number.isFinite(raw[end]))) {
        throw new Error('Heatmap scale ' + end + ' must be a finite number.');
      }
    });
    if (raw.mid != null && type !== 'diverging') throw new Error('Only a diverging heatmap scale takes a mid value.');
    var colors = type === 'diverging' ? raw.colors ?? ['orange', 'blue'] : [raw.color ?? 'blue'];
    if (!Array.isArray(colors) || colors.length !== (type === 'diverging' ? 2 : 1) ||
        colors.some(function (name) { return !COLORS.includes(name); })) {
      throw new Error('Heatmap colours must be palette names: ' + COLORS.join(', ') +
        (type === 'diverging' ? '; a diverging scale takes colors: [low, high].' : '.'));
    }
    return { type: type, min: raw.min ?? null, max: raw.max ?? null, mid: raw.mid ?? null, colors: colors };
  }

  // A colour scale over the finite values: pos(v) in [0, 1] along the scale, invert(t) back to a value, and
  // paint(v) -> {hue: 'low' | 'high', alpha} for a cell drawn in its palette hue over the neutral backdrop.
  function scaleFor(option, values) {
    var opts = scaleOptions(option);
    var finite = values.filter(function (v) { return v !== null; });
    var log = opts.type === 'log';
    if (log) {
      if (finite.some(function (v) { return !(v > 0); })) throw new Error('A log heatmap scale needs positive values.');
      if ((opts.min !== null && !(opts.min > 0)) || (opts.max !== null && !(opts.max > 0))) {
        throw new Error('Log heatmap scale bounds must be positive.');
      }
    }
    var lo = finite.length ? Math.min.apply(null, finite) : log ? 1 : 0;
    var hi = finite.length ? Math.max.apply(null, finite) : log ? 10 : 1;
    var mid = opts.type === 'diverging' ? opts.mid ?? 0 : null;
    if (mid !== null && opts.min === null && opts.max === null) {
      var reach = Math.max(Math.abs(hi - mid), Math.abs(mid - lo)) || Math.abs(mid) * 0.1 || 1;
      lo = mid - reach;
      hi = mid + reach;
    } else if (mid !== null) {
      var arm = Math.max(Math.abs(hi - mid), Math.abs(mid - lo)) || 1;
      lo = opts.min ?? mid - arm;
      hi = opts.max ?? mid + arm;
    }
    if (mid === null) {
      if (opts.min !== null) lo = opts.min;
      if (opts.max !== null) hi = opts.max;
    }
    if (lo > hi) throw new Error('The heatmap scale min must be below its max.');
    if (lo === hi) {
      if (log) { lo /= 2; hi *= 2; }
      else { var pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
    }
    if (mid !== null && !(mid > lo && mid < hi)) throw new Error('The diverging heatmap mid must lie between its min and max.');
    var to = log ? Math.log10 : function (v) { return v; };
    var from = log ? function (t) { return Math.pow(10, t); } : function (t) { return t; };
    var a = to(lo);
    var b = to(hi);
    var clamp = function (t) { return Math.max(0, Math.min(1, t)); };
    var scale = {
      type: opts.type, lo: lo, hi: hi, mid: mid, colors: opts.colors, log: log,
      pos: function (v) { return clamp((to(v) - a) / (b - a)); },
      invert: function (t) { return from(a + clamp(t) * (b - a)); },
      paint: function (v) {
        if (mid === null) return { hue: 'high', alpha: round(0.1 + 0.85 * scale.pos(v)) };
        var high = v >= mid;
        var strength = high ? (Math.min(v, hi) - mid) / (hi - mid) : (mid - Math.max(v, lo)) / (mid - lo);
        return { hue: high ? 'high' : 'low', alpha: round(0.9 * clamp(strength)) };
      }
    };
    return scale;
  }

  function round(v) { return +v.toFixed(3); }

  // Contour levels: true uses the colour scale's ticks inside the data, {levels: n} spaces n levels evenly, and
  // {levels: [..]} lists them. Log scales space levels by ratio.
  function contourLevels(option, scale, values, kit) {
    var raw = option === true ? {} : option;
    var finite = values.filter(function (v) { return v !== null; });
    var zLo = Math.min.apply(null, finite);
    var zHi = Math.max.apply(null, finite);
    var inside = function (v) { return v > zLo && v < zHi; };
    var levels;
    if (Array.isArray(raw.levels)) {
      if (raw.levels.some(function (v) { return !(typeof v === 'number' && Number.isFinite(v)); }) ||
          (scale.log && raw.levels.some(function (v) { return !(v > 0); }))) {
        throw new Error('Heatmap contour levels must be finite' + (scale.log ? ', positive' : '') + ' numbers.');
      }
      levels = raw.levels.slice();
    } else if (raw.levels != null) {
      if (!Number.isInteger(raw.levels) || raw.levels < 1 || raw.levels > MAX_LEVELS) {
        throw new Error('Heatmap contour levels must be an integer from 1 to ' + MAX_LEVELS + ', or a list of values.');
      }
      var to = scale.log ? Math.log10 : function (v) { return v; };
      var from = scale.log ? function (t) { return Math.pow(10, t); } : function (t) { return t; };
      levels = Array.from({ length: raw.levels }, function (_, i) {
        return from(to(zLo) + (to(zHi) - to(zLo)) * (i + 1) / (raw.levels + 1));
      });
    } else {
      levels = (scale.log ? kit.logTicks : kit.ticks)(zLo, zHi, 5).ticks;
    }
    levels = Array.from(new Set(levels)).filter(inside).sort(function (x, y) { return x - y; });
    if (levels.length > MAX_LEVELS) throw new Error('A heatmap draws at most ' + MAX_LEVELS + ' contour levels.');
    return levels;
  }

  // Why a grid cannot carry contours, or null: they need a complete grid with numeric, ordered labels.
  function contourProblem(grid) {
    var numeric = function (labels) {
      var values = labels.map(Number);
      if (values.some(function (v) { return !Number.isFinite(v); })) return false;
      var up = values.every(function (v, i) { return !i || v > values[i - 1]; });
      var down = values.every(function (v, i) { return !i || v < values[i - 1]; });
      return up || down;
    };
    if (!numeric(grid.columns) || !numeric(grid.rows)) return 'its row and column labels are not ordered numbers';
    if (grid.rows.length < 2 || grid.columns.length < 2) return 'it has fewer than two rows or columns';
    if (grid.z.some(function (row) { return row.some(function (v) { return v === null; }); })) return 'it has missing cells';
    return null;
  }

  // Marching squares over cell centres: segments [[col, row], [col, row]] where the surface crosses level.
  // Saddles resolve by the mean of their four corners.
  function contourSegments(z, level) {
    var out = [];
    for (var r = 0; r + 1 < z.length; r++) {
      for (var c = 0; c + 1 < z[r].length; c++) {
        var a = z[r][c];
        var b = z[r][c + 1];
        var d = z[r + 1][c];
        var e = z[r + 1][c + 1];
        var index = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (e >= level ? 2 : 0) | (d >= level ? 1 : 0);
        if (index === 0 || index === 15) continue;
        var t = function (p, q) { return p === q ? 0.5 : (level - p) / (q - p); };
        var top = [c + t(a, b), r];
        var right = [c + 1, r + t(b, e)];
        var bottom = [c + t(d, e), r + 1];
        var left = [c, r + t(a, d)];
        var high = (a + b + d + e) / 4 >= level;
        var pairs = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
          5: high ? [[left, top], [bottom, right]] : [[top, right], [left, bottom]],
          6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]],
          10: high ? [[top, right], [left, bottom]] : [[left, top], [bottom, right]],
          11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]]
        }[index];
        pairs.forEach(function (pair) { out.push(pair.map(function (p) { return [round(p[0]), round(p[1])]; })); });
      }
    }
    return out;
  }

  function prepare(spec, kit) {
    var records = Array.isArray(spec.data);
    if (records === (spec.z != null)) throw new Error('Give a heatmap either a z matrix or data records, not both.');
    var grid = records ? pivot(spec.data, spec, kit.toNumber) : matrix(spec, kit.toNumber);
    var values = [].concat.apply([], grid.z);
    var scale = scaleFor(spec.scale, values);
    var points = [];
    var seen = new Set();
    grid.z.forEach(function (row, r) {
      row.forEach(function (v, c) {
        if (v === null) return;
        var key = grid.keys[r][c] || 'cell:' + grid.rows[r] + ':' + grid.columns[c];
        if (seen.has(key)) throw new Error('Heatmap cell keys must be unique.');
        seen.add(key);
        points.push({ x: r * grid.columns.length + c, y: v, key: key });
      });
    });
    var contours = null;
    if (spec.contours != null && spec.contours !== false) {
      if (spec.contours !== true && (typeof spec.contours !== 'object' || Array.isArray(spec.contours))) {
        throw new Error('Heatmap contours must be true or an object with levels and labels.');
      }
      var problem = contourProblem(grid);
      if (problem) {
        OffPrint._warnOnce('chart-heatmap-contours:' + problem, 'Heatmap contours were skipped because ' + problem + '.');
      } else if (Math.min.apply(null, values) !== Math.max.apply(null, values)) {
        contours = { levels: contourLevels(spec.contours, scale, values, kit), labels: spec.contours.labels === true };
      }
    }
    var named = function (axis) { return typeof axis === 'string' ? axis : axis && typeof axis === 'object' ? axis.label || '' : ''; };
    var zAxis = typeof spec.value === 'string' ? { label: spec.value } :
      spec.value && typeof spec.value === 'object' ? spec.value : {};
    var plot = Math.max(120, Math.min(480, grid.rows.length * 26));
    var top = 10 + (named(spec.y) ? 20 : 0);
    var bottom = 26 + (named(spec.x) ? 20 : 0);
    return Object.assign({}, spec, {
      data: undefined, z: undefined, series: [{ key: 'cells', name: zAxis.label || 'Value', data: points }],
      x: { label: named(spec.x) }, y: { label: zAxis.label || '', unit: zAxis.unit, digits: zAxis.digits },
      height: typeof spec.height === 'number' && spec.height > 80 ? spec.height : top + bottom + plot,
      toggles: false, brush: false, rescale: false, referenceLines: [], categories: undefined,
      heatmap: {
        columns: grid.columns, rows: grid.rows, z: grid.z, rowLabel: named(spec.y), columnLabel: named(spec.x),
        scale: { type: scale.type, lo: scale.lo, hi: scale.hi, mid: scale.mid, colors: scale.colors }, contours: contours
      }
    });
  }

  function normalize(model, spec, kit, prepared) {
    var info = prepared.heatmap;
    var width = info.columns.length;
    model.heatmap = info;
    model.toggles = false;
    model.brush = false;
    model.series.forEach(function (series) {
      series.points.forEach(function (point) {
        point.row = Math.floor(point.x / width);
        point.col = point.x % width;
      });
    });
    return model;
  }

  function scaleOf(model) {
    var s = model.heatmap.scale;
    return scaleFor({ type: s.type, min: s.lo, max: s.hi, mid: s.mid ?? undefined, colors: s.colors,
      color: s.colors[0] }, []);
  }

  function stateOf(chart) {
    var state = states.get(chart);
    if (!state) {
      state = { range: null, cells: [], steps: [], contours: true, lines: null, contourChoice: null };
      states.set(chart, state);
      hosts.set(chart.box, chart);
      function revision() { return OffPrint._chart._authoredRevision(chart.box); }
      state.trackRange = OffPrint._readerState?.watch('heatmap-range', chart.box,
        function () { return state.range && state.range.slice(); }, function (range) {
          var scale = chart.model.heatmap?.scale;
          if (chart.model.addon !== 'heatmap' || !scale) return false;
          if (range !== null && (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) ||
              !same(range, clampRange(range, scale)))) return false;
          return setRange(chart, range, 'api');
        }, { order: 11, current: function () { return state.announced === undefined; }, revision: revision });
      state.trackContours = OffPrint._readerState?.watch('heatmap-contours', chart.box,
        function () { return chart.model.heatmap?.contours?.levels.length ? state.contours : undefined; }, function (on) {
          return typeof on === 'boolean' && OffPrint._chart._heatmap.contours(chart.box, on);
        }, { order: 11, revision: revision });
    }
    return state;
  }

  function fit(text, chars) {
    return text.length > chars ? text.slice(0, Math.max(1, chars - 1)) + '…' : text;
  }

  function draw(chart, width, kit) {
    var model = chart.view;
    var info = model.heatmap;
    var state = stateOf(chart);
    var scale = scaleOf(model);
    var CHAR = kit.CHAR;
    var height = model.height;
    var cols = info.columns.length;
    var rows = info.rows.length;
    var top = 10 + (info.rowLabel ? 20 : 0);
    var bottom = 26 + (info.columnLabel ? 20 : 0);
    var tickInfo = scale.log ? kit.logTicks(scale.lo, scale.hi, 5, true, true) : kit.ticks(scale.lo, scale.hi, 5, true, true);
    var tickFmt = scale.log ? kit.logTickFormat() : kit.tickFormat(tickInfo);
    var ticks = tickInfo.ticks.filter(function (v) { return v >= scale.lo && v <= scale.hi; });
    var tickW = Math.max.apply(null, ticks.map(function (v) { return tickFmt(v).length; }).concat([1])) * CHAR;
    var right = GAP + BAR + 8 + tickW + 6;
    var room = Math.max(4, Math.floor(width * 0.25 / CHAR));
    var rowText = info.rows.map(function (r) { return fit(r, room); });
    var left = 12 + CHAR * Math.max.apply(null, rowText.map(function (t) { return t.length; }).concat([1]));
    var plotW = Math.max(40, width - left - right);
    var plotB = height - bottom;
    var cw = plotW / cols;
    var ch = Math.max(1, plotB - top) / rows;
    var inset = cw > 6 && ch > 6 ? 0.5 : 0;
    var svg = kit.svg;

    chart.plot.style.setProperty('--op-heatmap-high', 'var(--op-' + scale.colors[scale.colors.length - 1] + ')');
    chart.plot.style.setProperty('--op-heatmap-low', 'var(--op-' + scale.colors[0] + ')');
    var frame = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      'aria-hidden': 'true', focusable: 'false' });
    svg('rect', { x: left, y: top, width: plotW, height: plotB - top, class: 'op-heatmap-backdrop' }, frame);

    var every = Math.max(1, Math.ceil((Math.min(14, Math.max.apply(null, info.columns.map(function (c) { return c.length; }))) *
      CHAR + 10) / Math.max(1, cw)));
    var colChars = Math.max(3, Math.floor((cw * every - 6) / CHAR));
    info.columns.forEach(function (c, i) {
      if (i % every) return;
      var text = svg('text', { x: left + cw * (i + 0.5), y: plotB + 16, 'text-anchor': 'middle', class: 'op-chart-tick' }, frame);
      text.textContent = fit(c, colChars);
      if (text.textContent !== c) svg('title', {}, text).textContent = c;
    });
    var everyRow = Math.max(1, Math.ceil(13 / ch));
    info.rows.forEach(function (r, i) {
      if (i % everyRow) return;
      var text = svg('text', { x: left - 8, y: top + ch * (i + 0.5), 'text-anchor': 'end', 'dominant-baseline': 'middle',
        class: 'op-chart-tick' }, frame);
      text.textContent = rowText[i];
      if (rowText[i] !== r) svg('title', {}, text).textContent = r;
    });
    if (info.columnLabel) {
      svg('text', { x: left + plotW / 2, y: height - 6, 'text-anchor': 'middle', class: 'op-chart-label' }, frame)
        .textContent = info.columnLabel;
    }
    if (info.rowLabel) svg('text', { x: 0, y: 12, class: 'op-chart-label' }, frame).textContent = info.rowLabel;

    var layer = svg('g', { class: 'op-chart-marks' }, frame);
    var cellGroup = svg('g', { class: 'op-chart-series op-heatmap-cells' }, layer);
    var marks = new Map();
    var spots = [];
    state.cells = [];
    model.series.forEach(function (series) {
      series.points.forEach(function (p) {
        var paint = scale.paint(p.y);
        var x = left + cw * p.col;
        var y = top + ch * p.row;
        var rect = svg('rect', {
          x: x + inset, y: y + inset, width: Math.max(0, cw - inset * 2), height: Math.max(0, ch - inset * 2),
          rx: inset ? Math.min(2, cw / 4, ch / 4) : 0, class: 'op-heatmap-cell', 'data-op-heat': paint.hue,
          'fill-opacity': paint.alpha
        }, cellGroup);
        kit.tagKey(model, rect, p);
        state.cells.push({ el: rect, value: p.y });
        kit.addMark(marks, kit.markId(series.key, 'cell', p), {
          el: rect, paint: paint.hue, from: { 'fill-opacity': 0 }, order: cols > 1 ? p.col / (cols - 1) : 0
        });
        spots.push({ px: x + cw / 2, py: y + ch / 2, p: p, s: series, el: rect });
      });
    });

    if (info.contours && info.contours.levels.length) {
      var lines = svg('g', { class: 'op-heatmap-contours' }, layer);
      state.lines = lines;
      var grid = scale.log ? info.z.map(function (row) { return row.map(Math.log10); }) : info.z;
      var px = function (pt) { return [left + cw * (pt[0] + 0.5), top + ch * (pt[1] + 0.5)]; };
      info.contours.levels.forEach(function (level) {
        var segments = contourSegments(grid, scale.log ? Math.log10(level) : level);
        if (!segments.length) return;
        var d = segments.map(function (seg) {
          var a = px(seg[0]);
          var b = px(seg[1]);
          return 'M' + round(a[0]) + ',' + round(a[1]) + 'L' + round(b[0]) + ',' + round(b[1]);
        }).join('');
        var path = svg('path', { d: d, class: 'op-heatmap-contour', 'data-op-level': level }, lines);
        kit.addMark(marks, kit.markId('contours', 'level', { x: level }), { el: path, fade: true, order: 1 });
        if (!info.contours.labels) return;
        // The label sits on the segment nearest the middle of its level's extent.
        var mids = segments.map(function (seg) { return px([(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2]); });
        var cx = mids.reduce(function (sum, m) { return sum + m[0]; }, 0) / mids.length;
        var cy = mids.reduce(function (sum, m) { return sum + m[1]; }, 0) / mids.length;
        var at = mids.reduce(function (best, m) {
          return Math.hypot(m[0] - cx, m[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? m : best;
        });
        var text = svg('text', { x: round(at[0]), y: round(at[1]), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          class: 'op-heatmap-contour-label' }, lines);
        text.textContent = kit.format(level, model.y);
        kit.addMark(marks, kit.markId('contours', 'label', { x: level }), { el: text, fade: true, order: 1 });
      });
    }

    // The side colour scale: high values at the top, brushed or clicked to dim cells outside a value range.
    var x0 = left + plotW + GAP;
    var scaleY = function (v) { return plotB - scale.pos(v) * (plotB - top); };
    var bar = svg('g', { class: 'op-heatmap-scale' }, frame);
    svg('rect', { x: x0, y: top, width: BAR, height: plotB - top, class: 'op-heatmap-backdrop' }, bar);
    var stepH = (plotB - top) / STEPS;
    for (var i = 0; i < STEPS; i++) {
      var paint = scale.paint(scale.invert((i + 0.5) / STEPS));
      svg('rect', { x: x0, y: round(plotB - (i + 1) * stepH), width: BAR, height: round(stepH + 0.5),
        class: 'op-heatmap-swatch', 'data-op-heat': paint.hue, 'fill-opacity': paint.alpha }, bar);
    }
    ticks.forEach(function (v) {
      var y = Math.round(scaleY(v)) + 0.5;
      svg('line', { x1: x0 + BAR, x2: x0 + BAR + 4, y1: y, y2: y, class: 'op-heatmap-scale-tick' }, bar);
      svg('text', { x: x0 + BAR + 8, y: y, 'dominant-baseline': 'middle', class: 'op-chart-tick' }, bar).textContent = tickFmt(v);
    });
    if (model.y.label) {
      svg('text', { x: width - 2, y: 12, 'text-anchor': 'end', class: 'op-chart-label' }, frame).textContent = model.y.label;
    }
    var band = svg('rect', { x: x0 - 3, width: BAR + 6, class: 'op-heatmap-scale-range', rx: 3 }, bar);
    var hit = svg('rect', { x: x0 - 8, y: top - 4, width: BAR + 16, height: plotB - top + 8, class: 'op-heatmap-scale-hit' }, bar);
    state.band = band;
    state.scaleY = scaleY;
    state.steps = [scale.lo].concat(ticks.filter(function (v) { return v > scale.lo && v < scale.hi; }), [scale.hi]);
    state.range = clampRange(state.range, scale);
    listen(chart, hit, function (clientY) {
      var box = chart.svg.getBoundingClientRect();
      var k = box.width && chart.width ? chart.width / box.width : 1;
      return scale.invert((plotB - (clientY - box.top) * k) / (plotB - top));
    });

    if (!(info.contours && info.contours.levels.length)) state.lines = null;
    chart.heatmapGeom = { cw: cw, ch: ch, cols: cols, rows: rows };
    var empty = spots.length ? '' : 'No values to show.';
    var result = { frame: frame, layer: layer, marks: marks, spots: spots, empty: empty,
      geom: { left: left, right: left + plotW, top: top, bottom: plotB } };
    paintRange(chart);
    paintContours(chart);
    return result;
  }

  function paintContours(chart) {
    var state = stateOf(chart);
    if (state.lines) state.lines.classList.toggle('is-off', !state.contours);
    if (state.contourChoice) state.contourChoice.show(state.contours ? ['on'] : []);
  }

  function setContours(chart, on, origin) {
    var state = stateOf(chart);
    on = !!on;
    if (state.contours === on) return true;
    state.contours = on;
    paintContours(chart);
    state.trackContours?.(origin);
    if (typeof root.CustomEvent === 'function') {
      chart.box.dispatchEvent(new root.CustomEvent('op:chart:heatmap-contours', { bubbles: true, detail: {
        current: on, previous: !on, origin: origin
      } }));
    }
    return true;
  }

  function clampRange(range, scale) {
    if (!range) return null;
    var lo = Math.max(range[0], scale.lo);
    var hi = Math.min(range[1], scale.hi);
    return lo <= hi ? [lo, hi] : null;
  }

  // Pointer brushing and clicks on the colour scale. A click without a drag picks the step between two ticks, and
  // clicking the chosen step again shows every value.
  function listen(chart, hit, valueAt) {
    var drag = null;
    hit.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { from: valueAt(event.clientY), y: event.clientY, moved: false };
      if (hit.setPointerCapture && event.pointerId !== undefined) {
        try { hit.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
      }
    });
    hit.addEventListener('pointermove', function (event) {
      if (!drag) return;
      if (Math.abs(event.clientY - drag.y) > 3) drag.moved = true;
      if (!drag.moved) return;
      var to = valueAt(event.clientY);
      setRange(chart, [Math.min(drag.from, to), Math.max(drag.from, to)], 'user', true);
    });
    var end = function (event) {
      if (!drag) return;
      var was = drag;
      drag = null;
      var state = stateOf(chart);
      if (was.moved) {
        var to = valueAt(event.clientY);
        setRange(chart, [Math.min(was.from, to), Math.max(was.from, to)], 'user');
        return;
      }
      var step = stepAt(state.steps, was.from);
      setRange(chart, state.range && state.range[0] === step[0] && state.range[1] === step[1] ? null : step, 'user');
    };
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', function () { drag = null; });
    hit.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function stepAt(steps, value) {
    for (var i = 1; i < steps.length; i++) if (value <= steps[i]) return [steps[i - 1], steps[i]];
    return [steps[steps.length - 2], steps[steps.length - 1]];
  }

  function same(a, b) {
    return a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
  }

  // live updates the dimming while a drag continues; the change is announced when it ends.
  function setRange(chart, range, origin, live) {
    var state = stateOf(chart);
    var scale = chart.model.heatmap?.scale;
    var next = range && scale ? clampRange(range, scale) : null;
    var previous = state.announced === undefined ? state.range : state.announced;
    state.range = next;
    paintRange(chart);
    if (live) {
      if (state.announced === undefined) state.announced = previous;
      state.trackRange?.('hover');
      return true;
    }
    state.announced = undefined;
    state.trackRange?.(origin);
    if (!same(previous, next) && typeof root.CustomEvent === 'function') {
      chart.box.dispatchEvent(new root.CustomEvent('op:chart:heatmap-range', { bubbles: true, detail: {
        current: next && next.slice(), previous: previous && previous.slice(), origin: origin
      } }));
    }
    return true;
  }

  function paintRange(chart) {
    var state = stateOf(chart);
    var range = state.range;
    state.cells.forEach(function (cell) {
      cell.el.classList.toggle('is-dimmed', !!range && (cell.value < range[0] || cell.value > range[1]));
    });
    if (state.band) {
      if (range) {
        var y0 = state.scaleY(range[1]);
        var y1 = state.scaleY(range[0]);
        state.band.setAttribute('y', round(y0 - 1));
        state.band.setAttribute('height', round(Math.max(2, y1 - y0 + 2)));
        state.band.removeAttribute('display');
      } else state.band.setAttribute('display', 'none');
    }
    if (state.text) {
      var axis = chart.view.y;
      state.text.textContent = range ? 'Values ' + format(range[0], axis) + ' – ' + format(range[1], axis) : '';
      state.text.hidden = !range;
      state.button.hidden = !range;
    }
  }

  var format = function (v, axis) { return OffPrint._chart.format(v, axis); };

  function legend(chart, el, kit) {
    var state = stateOf(chart);
    var item = kit.html('span', 'op-chart-legend-item op-heatmap-filter', el);
    state.text = kit.html('span', 'op-heatmap-filter-text', item);
    state.button = kit.html('button', 'op-button op-heatmap-filter-reset', item, 'Show all values');
    state.button.type = 'button';
    state.button.addEventListener('click', function () {
      setRange(chart, null, 'user');
      if (typeof chart.plot.focus === 'function') chart.plot.focus({ preventScroll: true });
    });
    state.contourChoice = null;
    var info = chart.model.heatmap;
    if (info.contours && info.contours.levels.length && OffPrint._choices) {
      // One chip hides and shows every contour line and label together.
      var swatch = kit.html('span', 'op-chart-key op-heatmap-contour-key');
      swatch.setAttribute('aria-hidden', 'true');
      state.contourChoice = OffPrint._choices.create({
        label: 'Contour lines shown', hideLabel: true, multiple: true, display: 'chips',
        className: 'op-chart-series-toggles op-heatmap-contour-toggle',
        options: [{ value: 'on', label: 'Contour lines', swatch: swatch }],
        onChange: function (value) { setContours(chart, value.indexOf('on') >= 0, 'user'); }
      });
      el.appendChild(state.contourChoice.el);
    }
    paintRange(chart);
    paintContours(chart);
  }

  // Up and Down move between rows within a column; Page Up and Page Down step the colour-scale filter.
  function keys(chart, event, kit) {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    var state = stateOf(chart);
    if (event.key === 'Escape' && state.range) {
      setRange(chart, null, 'user');
      return false;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      var steps = state.steps;
      var last = steps.length - 2;
      var at = state.range ? steps.findIndex(function (v, i) {
        return i <= last && v === state.range[0] && steps[i + 1] === state.range[1];
      }) : -1;
      var up = event.key === 'PageUp';
      var index = at < 0 ? (up ? last : 0) : Math.max(0, Math.min(last, at + (up ? 1 : -1)));
      setRange(chart, [steps[index], steps[index + 1]], 'user');
      return true;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
    event.preventDefault();
    var spots = chart.spots;
    var current = spots[chart.active < 0 ? 0 : chart.active];
    if (!current) return true;
    var down = event.key === 'ArrowDown';
    var best = -1;
    spots.forEach(function (spot, i) {
      if (spot.p.col !== current.p.col || (down ? spot.p.row <= current.p.row : spot.p.row >= current.p.row)) return;
      if (best < 0 || (down ? spot.p.row < spots[best].p.row : spot.p.row > spots[best].p.row)) best = i;
    });
    kit.inspect(chart, best < 0 ? Math.max(0, chart.active) : best);
    return true;
  }

  function cellAt(chart, px, py) {
    var g = chart.geom;
    var hg = chart.heatmapGeom;
    if (!hg || px < g.left || px > g.right || py < g.top || py > g.bottom) return null;
    return {
      col: Math.min(hg.cols - 1, Math.floor((px - g.left) / hg.cw)),
      row: Math.min(hg.rows - 1, Math.floor((py - g.top) / hg.ch))
    };
  }

  function pick(chart, px, py) {
    var cell = cellAt(chart, px, py);
    if (!cell) return -1;
    return chart.spots.findIndex(function (spot) { return spot.p.row === cell.row && spot.p.col === cell.col; });
  }

  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    var info = model.heatmap;
    var paint = scaleOf(model).paint(spot.p.y);
    kit.html('div', 'op-chart-tip-head', tip, info.rows[spot.p.row] + ' · ' + info.columns[spot.p.col]);
    var row = kit.html('div', 'op-chart-tip-row', tip);
    var swatch = kit.html('span', 'op-chart-key op-heatmap-key', row);
    var fill = kit.html('span', '', swatch);
    fill.setAttribute('data-op-heat', paint.hue);
    fill.style.setProperty('opacity', String(paint.alpha));
    kit.html('b', '', row, kit.format(spot.p.y, model.y));
    if (model.y.label) kit.html('span', 'op-chart-tip-series', row, model.y.label);
    var range = stateOf(chart).range;
    if (range && (spot.p.y < range[0] || spot.p.y > range[1])) kit.html('div', 'op-chart-tip-note', tip, 'Outside the value range');
    spot.el.classList.add('is-active');
    return spot.py;
  }

  function coords(model, geom, px, py) {
    var info = model.heatmap;
    var col = Math.min(info.columns.length - 1, Math.floor((px - geom.left) / ((geom.right - geom.left) / info.columns.length)));
    var row = Math.min(info.rows.length - 1, Math.floor((py - geom.top) / ((geom.bottom - geom.top) / info.rows.length)));
    var value = info.z[row][col];
    return { x: info.columns[col], y: info.rows[row], z: value, xText: info.columns[col],
      yText: info.rows[row] + (value === null ? '' : ' · ' + format(value, model.y)) };
  }

  function table(model, kit) {
    var info = model.heatmap;
    var element = kit.html('table');
    var head = kit.html('tr', '', kit.html('thead', '', element));
    var body = kit.html('tbody', '', element);
    [info.rowLabel].concat(info.columns).forEach(function (text) {
      kit.html('th', '', head, text).setAttribute('scope', 'col');
    });
    var points = new Map();
    model.series.forEach(function (series) { series.points.forEach(function (p) { points.set(p.x, p); }); });
    info.rows.forEach(function (name, r) {
      var tr = kit.html('tr', '', body);
      kit.html('th', '', tr, name).setAttribute('scope', 'row');
      info.columns.forEach(function (_, c) {
        var p = points.get(r * info.columns.length + c);
        kit.tagKey(model, kit.html('td', '', tr, p ? kit.format(p.y, model.y) : ''), p);
      });
    });
    return element;
  }

  function describe(model) {
    var info = model.heatmap;
    var s = info.scale;
    var what = model.y.label || 'values';
    return 'Heatmap of ' + what + (info.rowLabel && info.columnLabel ? ' by ' + info.rowLabel + ' and ' + info.columnLabel : '') +
      ', ' + info.rows.length + ' rows by ' + info.columns.length + ' columns. ' +
      (s.type === 'diverging' ? 'Colours diverge around ' + format(s.mid, model.y) + '.' :
        s.type === 'log' ? 'Colours follow a log scale.' : 'Darker colours mean higher values.') +
      (info.contours && info.contours.levels.length ? ' Contour lines mark levels ' +
        info.contours.levels.map(function (v) { return format(v, model.y); }).join(', ') +
        '; the Contour lines chip hides and shows them.' : '') +
      ' Arrow keys read the cells; Up and Down move between rows. Page Up and Page Down show one step of the colour ' +
      'scale at a time, and Escape shows every value again.';
  }

  // Header row of column labels, then one row label and its values per row; data-op-key cells key their cells.
  function fromTable(rows, keyCells) {
    var head = rows[0] || [];
    var body = rows.slice(1);
    return {
      y: head[0] || '', columns: head.slice(1), rows: body.map(function (r) { return r[0]; }),
      z: body.map(function (r) { return head.slice(1).map(function (_, c) { return r[c + 1] ?? null; }); }),
      keys: keyCells ? body.map(function (r, i) {
        return head.slice(1).map(function (_, c) { return (keyCells[i + 1] || [])[c + 1] || null; });
      }) : undefined
    };
  }

  function mapFields(mapping) {
    if (!mapping || typeof mapping !== 'object' || ['x', 'y', 'z'].some(function (name) {
      return typeof mapping[name] !== 'string' || !mapping[name].trim();
    })) throw new Error('Heatmap mapping needs x, y, and z field names, and an optional pointKey.');
    return [mapping.x, mapping.y, mapping.z].concat(mapping.pointKey !== undefined ? [mapping.pointKey] : []);
  }

  function mapRecords(records, fields, mapping, spec) {
    var out = Object.assign({}, spec);
    if (out.x == null) out.x = fields[0];
    if (out.y == null) out.y = fields[1];
    if (out.value == null) out.value = fields[2];
    out.data = records.map(function (record) {
      return { x: record[fields[0]], y: record[fields[1]], z: record[fields[2]],
        key: fields[3] === undefined ? undefined : record[fields[3]] == null ? null : String(record[fields[3]]) };
    });
    return out;
  }

  OffPrint.chart.addon('chart-heatmap', {
    types: { heatmap: {
      base: 'scatter', legend: 'heatmap-scale', prepare: prepare, normalize: normalize, draw: draw, pick: pick,
      readout: readout, table: table, describe: describe, keys: keys, coords: coords, fromTable: fromTable,
      mapFields: mapFields, mapRecords: mapRecords
    } },
    legends: { 'heatmap-scale': legend }
  });

  // Reads or sets the value range of a heatmap's colour-scale filter: null shows every value.
  OffPrint._chart._heatmap = {
    MAX_CELLS: MAX_CELLS, pivot: pivot, scale: scaleFor, contourSegments: contourSegments, contourLevels: function (option, scale, values) {
      return contourLevels(option, scale, values, { ticks: OffPrint._chart.ticks, logTicks: OffPrint._chart.logTicks });
    },
    valueRange: function (target, range) {
      var host = typeof target === 'string' ? root.document.getElementById(target) : target;
      var chart = host && hosts.get(host);
      if (!chart || !states.has(chart) || chart.model.addon !== 'heatmap') return arguments.length > 1 ? false : null;
      var state = stateOf(chart);
      if (arguments.length < 2) return state.range && state.range.slice();
      if (range !== null && !(Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] <= range[1])) {
        return false;
      }
      return setRange(chart, range, 'api');
    },
    // Reads or sets whether a heatmap's contour lines show; null or false when the target has no contours.
    contours: function (target, on) {
      var host = typeof target === 'string' ? root.document.getElementById(target) : target;
      var chart = host && hosts.get(host);
      var info = chart && states.has(chart) && chart.model.addon === 'heatmap' ? chart.model.heatmap : null;
      if (!info || !info.contours || !info.contours.levels.length) return arguments.length > 1 ? false : null;
      var state = stateOf(chart);
      if (arguments.length < 2) return state.contours;
      if (typeof on !== 'boolean') return false;
      return setContours(chart, on, 'api');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
