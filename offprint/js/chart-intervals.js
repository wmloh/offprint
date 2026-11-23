// Ranked dots and lollipops with supplied intervals on the shared categorical axes.
(function (root) {
  'use strict';

  function normalize(model, spec) {
    var sort = spec.sort ?? 'value';
    var mark = spec.mark ?? 'dot';
    if (sort !== 'value' && sort !== 'label' && sort !== 'none') {
      model.errors.push('Interval plot sort must be "value", "label", or "none".');
    }
    if (mark !== 'dot' && mark !== 'lollipop') {
      model.errors.push('Interval plot mark must be "dot" or "lollipop".');
    }
    if (model.stack) model.errors.push('Interval plots use dodged marks; remove the stack option.');

    var values = new Map();
    model.series.forEach(function (s) {
      var byLabel = new Map();
      s.points.forEach(function (p) {
        if (byLabel.has(p.x)) {
          model.errors.push('Interval plot series ' + JSON.stringify(s.key) +
            ' has more than one value for ' + JSON.stringify(p.x) + '.');
        }
        byLabel.set(p.x, p.y);
      });
      values.set(s.key, byLabel);
    });
    var rank = values.get(spec.sortSeries ?? model.series[0]?.key);
    if (sort === 'value' && spec.sortSeries != null && !rank) {
      model.errors.push('Interval plot sortSeries must match a series key.');
    }
    var cats = Array.from(new Set(model.categories));
    if (sort === 'value' && rank) {
      // Missing estimates sort last; ties retain the input order.
      cats.sort(function (a, b) {
        var first = rank.get(a) ?? -Infinity;
        var second = rank.get(b) ?? -Infinity;
        return first === second ? 0 : second - first;
      });
    } else if (sort === 'label') {
      cats.sort(function (a, b) { return a.localeCompare(b); });
    }
    model.categories = cats;
    model.intervalMark = mark;
    model.zeroBaseline = mark === 'lollipop';
    return model;
  }

  function categoryMarks(ctx, series, index, group, model, kit) {
    var step = Math.min(12, ctx.band * 0.8 / ctx.count);
    var radius = Math.min(4.5, step * 0.38);
    var offset = (index - (ctx.count - 1) / 2) * step;
    var clip = 'url(#' + ctx.clip + '-interval)';
    series.points.forEach(function (point) {
      var category = ctx.pos(point.x) + offset;
      var value = ctx.val(point.y);
      var x = ctx.horizontal ? value : category;
      var y = ctx.horizontal ? category : value;
      var order = ctx.orderAt(category);
      if (model.intervalMark === 'lollipop') {
        var start = ctx.horizontal ? { x1: ctx.base, y1: y } : { x1: x, y1: ctx.base };
        var stem = kit.svg('line', Object.assign({
          x2: x, y2: y, class: 'op-chart-interval-stem', 'clip-path': clip
        }, start), group);
        kit.addMark(ctx.markMap, kit.markId(series.key, 'stem', point), { el: stem, from: { x2: start.x1, y2: start.y1 }, order: order });
      }
      if (point.interval) {
        var interval = kit.whisker(group, point.interval, category, ctx.val, ctx.horizontal, Math.min(3, step * 0.4));
        interval.setAttribute('clip-path', clip);
        kit.addMark(ctx.markMap, kit.markId(series.key, 'whisker', point), { el: interval, fade: true, order: order });
      }
      var dot = kit.svg('circle', { cx: x, cy: y, r: radius, class: 'op-chart-dot', 'clip-path': clip }, group);
      ctx.place(point, dot, x, y);
      kit.addMark(ctx.markMap, kit.markId(series.key, 'dot', point), { el: dot, from: { r: 0 }, order: order });
    });
  }

  function describe(model) {
    var kind = model.intervalMark === 'lollipop' ? 'lollipop' : 'dot';
    var names = model.series.map(function (s) { return s.name; }).filter(Boolean);
    return (model.orientation === 'horizontal' ? 'Horizontal' : 'Vertical') + ' ' + kind + ' plot' +
      (names.length ? ' of ' + names.join(', ') : '') + '. Whiskers show supplied intervals.';
  }

  root.OffPrint.chart.addon('chart-intervals', {
    types: { interval: { base: 'bar', normalize: normalize, categoryMarks: categoryMarks, describe: describe } }
  });
})(window);
