// Histograms use continuous chart axes and share bin boundaries across series.
(function (root) {
  'use strict';

  var MAX_BINS = 500;

  function quantile(sorted, fraction) {
    var index = (sorted.length - 1) * fraction;
    var low = Math.floor(index);
    var weight = index - low;
    return sorted[low] * (1 - weight) + sorted[Math.ceil(index)] * weight;
  }

  // Internal boundaries belong to the following bin; the final bin includes its upper edge.
  function binAt(edges, value) {
    if (value < edges[0] || value > edges[edges.length - 1]) return -1;
    var lo = 0;
    var hi = edges.length - 1;
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2);
      if (value < edges[mid]) hi = mid;
      else lo = mid;
    }
    return lo;
  }

  function checkEdges(edges, log) {
    if (!Array.isArray(edges) || edges.length < 2 || edges.length > MAX_BINS + 1 ||
        Array.from(edges).some(function (edge, i) {
          return !Number.isFinite(edge) || (i && !(edge > edges[i - 1] && Number.isFinite(edge - edges[i - 1])));
        })) {
      throw new Error('Histogram edges must be finite, strictly increasing, and define 1 to ' + MAX_BINS + ' finite-width bins.');
    }
    if (log && edges[0] <= 0) throw new Error('The log x axis needs positive histogram edges.');
    if (log ? edges.some(function (edge, i) { return i && Math.log10(edge) <= Math.log10(edges[i - 1]); }) :
      !Number.isFinite(edges[edges.length - 1] - edges[0])) {
      throw new Error('Histogram edges exceed the precision or range of the x scale.');
    }
  }

  function makeEdges(series, bins, log) {
    if (bins && typeof bins === 'object' && Object.hasOwn(bins, 'edges')) {
      if (Object.hasOwn(bins, 'width')) throw new Error('Choose one histogram bin width or edge list.');
      return bins.edges;
    }
    var width = bins && typeof bins === 'object' ? bins.width : null;
    var byWidth = width != null;
    var rule = bins === 'fd' || bins === 'sturges';
    if (!rule && !(byWidth ? Number.isFinite(width) && width > 0 :
      Number.isInteger(bins) && bins > 0 && bins <= MAX_BINS)) {
      throw new Error('Histogram bins must be "fd", "sturges", an integer from 1 to ' + MAX_BINS +
        ', a positive {width}, or {edges}.');
    }
    var low = Infinity;
    var high = -Infinity;
    var sorted = [];
    var size = 0;
    series.forEach(function (entry) {
      entry.data.forEach(function (value) {
        var at = log ? Math.log10(value) : value;
        low = Math.min(low, at);
        high = Math.max(high, at);
        if (bins === 'fd') sorted.push(at);
        size++;
      });
    });
    var count = rule ? Math.ceil(Math.log2(size || 1)) + 1 : bins;
    var constant = size > 0 && low === high;
    if (!size) { low = 0; high = 1; }
    if (constant) {
      var pad = byWidth ? width / 2 : log ? 0.5 : Math.abs(low) / 10 || 0.5;
      low -= pad;
      high += pad;
      if (rule) count = 1;
    }
    var span = high - low;
    if (byWidth) {
      var ratio = span / width;
      count = constant ? 1 : Math.max(1, Math.ceil(ratio - Math.min(ratio, 1) * 1e-12));
    } else if (bins === 'fd' && size > 1 && !constant) {
      sorted.sort(function (a, b) { return a - b; });
      var fd = 2 * (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / Math.cbrt(size);
      if (fd > 0) count = Math.ceil(span / fd);
    }
    if (rule) count = Math.min(count, MAX_BINS);
    if (count > MAX_BINS) throw new Error('Histogram bin width produces more than ' + MAX_BINS + ' bins.');
    var edges = Array.from({ length: count + 1 }, function (_, index) {
      var at = index === count ? (byWidth ? Math.max(high, low + index * width) : high) :
        low + (byWidth ? index * width : span * (index / count));
      return log ? Math.pow(10, at) : at;
    });
    // Log round trips can otherwise exclude the minimum or maximum observation by one ULP.
    if (log && size && !constant) series.forEach(function (entry) {
      entry.data.forEach(function (value) {
        edges[0] = Math.min(edges[0], value);
        edges[count] = Math.max(edges[count], value);
      });
    });
    return edges;
  }

  function prepare(spec) {
    var log = spec.x?.type === 'log';
    var preBinned = Object.hasOwn(spec, 'edges') || Object.hasOwn(spec, 'counts');
    var series = spec.series ?? [{
      name: spec.name, key: spec.key, color: spec.color, role: spec.role, data: spec.data, counts: spec.counts
    }];
    var measure = spec.measure ?? 'count';
    var stack = spec.stack === 'stacked';
    if (!Array.isArray(series) || !series.length || (spec.series != null && (spec.data != null || spec.counts != null))) {
      throw new Error('Use one histogram data or counts array, or provide a nonempty series array.');
    }
    if (!['count', 'density', 'percent'].includes(measure)) {
      throw new Error('Histogram measure must be "count", "density", or "percent".');
    }
    if (spec.stack != null && ![false, 'none', 'stacked'].includes(spec.stack)) {
      throw new Error('Histogram stack must be "none" or "stacked".');
    }
    if ((spec.orientation != null && spec.orientation !== 'vertical') || spec.categories != null ||
        spec.x?.type === 'time' || spec.y?.type === 'time') {
      throw new Error('Histograms use vertical bars with numeric linear or log axes.');
    }
    if (preBinned && spec.bins != null) throw new Error('Pre-binned histograms use supplied edges instead of a bins option.');
    series.forEach(function (entry) {
      if (entry?.key !== undefined && (typeof entry.key !== 'string' || !entry.key.trim())) {
        throw new Error('Histogram series keys must be nonempty strings.');
      }
      if (preBinned ? !Array.isArray(entry?.counts) || entry.data != null :
        !Array.isArray(entry?.data) || entry.counts != null) {
        throw new Error(preBinned ? 'Each pre-binned histogram series needs a counts array.' :
          'Each raw histogram series needs a data array of numeric observations.');
      }
      if (!preBinned) {
        for (var value of entry.data) {
          if (!Number.isFinite(value)) throw new Error('Histogram observations must be finite numbers.');
          if (log && value <= 0) throw new Error('The log x axis needs positive histogram observations.');
        }
      }
    });

    var edges = preBinned ? spec.edges : makeEdges(series, spec.bins ?? 'fd', log);
    checkEdges(edges, log);
    edges = edges.slice();
    var rows = series.map(function (entry) {
      if (preBinned) {
        if (entry.counts.length !== edges.length - 1 ||
            Array.from(entry.counts).some(function (count) { return !Number.isSafeInteger(count) || count < 0; })) {
          throw new Error('Histogram counts need one nonnegative safe integer per bin.');
        }
        return entry.counts;
      }
      var counts = edges.slice(1).map(function () { return 0; });
      entry.data.forEach(function (value) {
        var index = binAt(edges, value);
        if (index < 0) throw new Error('Histogram edges must cover every observation.');
        counts[index]++;
      });
      return counts;
    });
    var totals = rows.map(function (row) {
      return row.reduce(function (sum, count) { return sum + count; }, 0);
    });
    var grandTotal = totals.reduce(function (sum, count) { return sum + count; }, 0);
    var labels = { count: 'Count', density: 'Density', percent: 'Percent' };
    var y = typeof spec.y === 'string' ? { label: spec.y } : spec.y;
    return Object.assign({}, spec, {
      stack: null, orientation: null, data: undefined, y: Object.assign({
        label: labels[measure], unit: measure === 'percent' ? '%' : ''
      }, y),
      edges: edges,
      series: series.map(function (entry, si) {
        var total = stack ? grandTotal : totals[si];
        var points = rows[si].map(function (count, index) {
          var lo = edges[index];
          var hi = edges[index + 1];
          var fraction = total ? count / total : 0;
          var value = measure === 'count' ? count : measure === 'percent' ? 100 * fraction : fraction / (hi - lo);
          if (!Number.isFinite(value)) throw new Error('The histogram density exceeds the numeric range.');
          var middle = log ? Math.pow(10, (Math.log10(lo) + Math.log10(hi)) / 2) : lo + (hi - lo) / 2;
          return { x: Math.max(lo, Math.min(hi, middle)), y: value, key: 'bin:' + lo + ':' + hi };
        });
        return Object.assign({}, entry, { data: points });
      })
    });
  }

  function normalize(model, spec, kit, prepared) {
    model.histogramEdges = prepared.edges;
    model.stack = spec.stack === 'stacked' ? 'stacked' : null;
    var positions = new Map(prepared.edges.slice(0, -1).map(function (lo, i) {
      return ['bin:' + lo + ':' + prepared.edges[i + 1], i];
    }));
    model.series.forEach(function (series) {
      series.points.forEach(function (point) {
        point.bin = positions.get(point.key);
        point.xSpan = prepared.edges.slice(point.bin, point.bin + 2);
      });
    });
    eachBar(model, function (series, point, base, end) {
      if (!Number.isFinite(end)) throw new Error('The histogram stack exceeds the numeric range.');
    });
    return model;
  }

  function eachBar(model, visit) {
    var totals = model.histogramEdges.slice(1).map(function () { return 0; });
    model.series.forEach(function (series) {
      series.points.forEach(function (point) {
        var base = model.stack ? totals[point.bin] : 0;
        var end = base + point.y;
        totals[point.bin] = end;
        visit(series, point, base, end);
      });
    });
  }

  function extent(model, span) {
    if (!model.histogramEdges) return;
    var least = Infinity;
    var highest = 0;
    eachBar(model, function (series, point, base, end) {
      if (point.y > 0) least = Math.min(least, point.y);
      highest = Math.max(highest, end);
    });
    if (span.count) span.xs = [model.histogramEdges[0], model.histogramEdges[model.histogramEdges.length - 1]];
    if (least === Infinity) least = 1;
    var minimum = Math.min(least, model.y.max ?? Infinity);
    span.yLo = model.y.log ? minimum / 2 || minimum : 0;
    span.yHi = highest || 1;
    if (model.y.log && model.y.min >= span.yHi) span.yHi = model.y.min * 2;
  }

  function marks(ctx, model, kit) {
    var groups = new Map(model.series.map(function (series) { return [series, ctx.group(series)]; }));
    eachBar(model, function (series, point, from, to) {
      var left = ctx.pos(point.xSpan[0]);
      var right = ctx.pos(point.xSpan[1]);
      var bottom = ctx.val(Math.max(ctx.base, from));
      var top = ctx.val(Math.max(ctx.base, to));
      var rect = kit.svg('rect', {
        x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top),
        class: 'op-chart-bar op-chart-histogram-bar', 'data-op-bin': point.bin
      }, groups.get(series));
      var center = Math.max(ctx.left, left) / 2 + Math.min(ctx.right, right) / 2;
      if (series === model.series[0]) ctx.place(point, rect, center, (top + bottom) / 2);
      else kit.tagKey(model, rect, point);
      // Match slots across rebinning for motion, while selection continues to identify the actual interval.
      kit.addMark(ctx.markMap, kit.markId(series.key, 'bin', { x: point.bin }), {
        el: rect, from: { y: bottom, height: 0 }, order: ctx.orderAt(center)
      });
    });
  }

  function pick(chart, x, y) {
    var g = chart.geom;
    if (x < g.left || x > g.right || y < g.top || y > g.bottom) return -1;
    var edges = chart.view.histogramEdges;
    var bin = binAt(edges.map(g.x), x);
    return chart.spots.findIndex(function (spot) { return spot.p.bin === bin; });
  }

  function binLabel(model, bin, kit) {
    var edges = model.histogramEdges;
    return '[' + kit.format(edges[bin], model.x) + ', ' + kit.format(edges[bin + 1], model.x) +
      (bin === edges.length - 2 ? ']' : ')');
  }

  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    var bin = spot.p.bin;
    kit.html('div', 'op-chart-tip-head', tip, binLabel(model, bin, kit));
    model.series.forEach(function (series) {
      var point = series.points.find(function (p) { return p.bin === bin; });
      if (point) kit.row(tip, series, kit.format(point.y, model.y), 'bar');
    });
    Array.from(chart.marks.querySelectorAll('[data-op-bin="' + bin + '"]')).forEach(function (bar) {
      bar.classList.add('is-active');
    });
    return chart.pointerY ?? spot.py;
  }

  function table(model, kit) {
    var element = kit.html('table');
    var head = kit.html('tr', '', kit.html('thead', '', element));
    var body = kit.html('tbody', '', element);
    [model.x.label || 'Bin', ...model.series.map(function (series) { return series.name || model.y.label; })]
      .forEach(function (label) { kit.html('th', '', head, label).setAttribute('scope', 'col'); });
    model.series[0].points.forEach(function (point, index) {
      var row = kit.html('tr', '', body);
      kit.html('th', '', row, binLabel(model, point.bin, kit)).setAttribute('scope', 'row');
      model.series.forEach(function (series) {
        var p = series.points[index];
        kit.tagKey(model, kit.html('td', '', row, kit.format(p.y, model.y)), p);
      });
    });
    return element;
  }

  root.OffPrint.chart.addon('chart-histogram', {
    types: { histogram: {
      base: 'scatter', allowLogZeroY: true, prepare: prepare, normalize: normalize, extent: extent,
      continuousMarks: marks, pick: pick, readout: readout, table: table,
      describe: function (model) {
        var names = model.series.map(function (series) { return series.name; }).filter(Boolean);
        return 'Histogram' + (names.length ? ' of ' + names.join(', ') : '') + '.';
      }
    } }
  });
})(window);
