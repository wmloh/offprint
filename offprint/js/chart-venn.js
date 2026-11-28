// Two- and three-set diagrams with schematic circles and exact region counts.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart) return;

  var TURN = 2 * Math.PI;
  var EPSILON = 1e-8;
  var MEMBER_LIMIT = 8;
  var HIT = 'data-op-venn-region';
  var FALLBACK = 'Circle boundaries cannot represent these overlaps exactly. Hatching marks empty regions.';
  var followers = new WeakMap();
  var permutations = [
    [[]], [[0]], [[0, 1], [1, 0]],
    [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  ];
  var classic = [[], [[0, 0, 10]], [[0, 0, 10], [10, 0, 10]],
    [[0, 0, 10], [10, 0, 10], [5, 8.66, 10]]];
  var sharedChordRadius = Math.hypot(7, 10);
  // Each pattern lists the exclusive regions with positive counts. Bit (mask - 1) denotes the region
  // whose set membership is mask. The three-circle entries cover distinct, nonempty disks up to permutation.
  var catalogue = [
    { 0: [] },
    { 1: classic[1] },
    { 3: [[0, 0, 10], [24, 0, 10]], 5: [[0, 0, 12], [0, 0, 6]], 7: classic[2] },
    {
      11: [[0, 0, 10], [24, 0, 10], [48, 0, 10]],
      13: [[0, 0, 13], [0, 0, 6], [28, 0, 10]],
      15: [[0, 0, 10], [10, 0, 10], [33, 0, 10]],
      21: [[0, 0, 17], [-8, 0, 6], [8, 0, 6]],
      23: [[0, 0, 13], [-11, 0, 9], [6, 0, 5]],
      31: [[0, 0, 10], [-12, 0, 10], [12, 0, 10]],
      63: [[0, 0, 10], [18, 0, 10], [9, 16, 11]],
      69: [[0, 0, 16], [0, 0, 11], [0, 0, 6]],
      71: [[-5, 0, 11], [5, 0, 11], [0, 0, 4]],
      85: [[0, 0, 17], [-5, 0, 10], [5, 0, 10]],
      87: [[4, 3, 16], [14, 0, 14], [0, 0, 10]],
      // All three boundaries meet at both ends of one chord to omit both A-only and BC-only.
      94: [[0, 0, 10], [-7, 0, sharedChordRadius], [7, 0, sharedChordRadius]],
      95: [[7, 3, 11], [0, 0, 10], [15, 0, 10]],
      119: [[7, 0, 14], [-7, 3, 15], [0, 0, 10]],
      127: classic[3]
    }
  ];

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function name(value) {
    if (Number.isFinite(value)) return String(value);
    return typeof value === 'string' ? value.trim() : '';
  }

  function regionOf(input, indexes, at) {
    if (!record(input) || !Array.isArray(input.sets) || !input.sets.length) {
      throw new Error(at + ' needs a nonempty array of set keys.');
    }
    var mask = 0;
    input.sets.forEach(function (value) {
      var key = name(value);
      if (!indexes.has(key)) throw new Error(at + ' names unknown set ' + JSON.stringify(key) + '.');
      var bit = 1 << indexes.get(key);
      if (mask & bit) throw new Error(at + ' repeats set ' + JSON.stringify(key) + '.');
      mask |= bit;
    });
    return mask;
  }

  function regionsOf(spec, kit) {
    if (!Array.isArray(spec.sets) || spec.sets.length < 2 || spec.sets.length > 3) {
      throw new Error('A Venn diagram needs two or three sets.');
    }
    var indexes = new Map();
    var fromCounts = spec.regions !== undefined;
    var sets = Array.from(spec.sets, function (input, index) {
      var at = 'Venn set ' + (index + 1);
      var key = record(input) && name(input.key);
      if (!key || indexes.has(key)) throw new Error(at + ' needs a unique, nonempty key.');
      indexes.set(key, index);
      if (fromCounts ? input.members !== undefined : !Array.isArray(input.members)) {
        throw new Error('Give Venn either members for every set or region counts.');
      }
      var color = name(input.color);
      var role = name(input.role);
      if (input.color != null && !OffPrint._chart.SCALE_COLORS.includes(color)) {
        throw new Error(at + ' needs a named palette colour.');
      }
      if (input.role != null && !role) throw new Error(at + ' needs a nonempty role.');
      return { key: key, label: name(input.label) || key, index: index, color: color, role: role };
    });

    var regions = Array.from({ length: (1 << sets.length) - 1 }, function (_, index) {
      var mask = index + 1;
      var inside = sets.filter(function (set) { return mask & (1 << set.index); });
      var keys = inside.map(function (set) { return set.key; }).sort();
      return { mask: mask, sets: keys, label: inside.map(function (set) { return set.label; }).join(' ∩ ') +
        (inside.length < sets.length ? ' only' : ''), key: 'region:' + JSON.stringify(keys), count: 0,
        members: fromCounts ? null : [] };
    });
    if (!fromCounts) {
      var membership = new Map();
      spec.sets.forEach(function (set, index) {
        for (var value of set.members) {
          var member = name(value);
          if (!member) throw new Error('Venn members must be nonempty strings or finite numbers.');
          membership.set(member, (membership.get(member) || 0) | (1 << index));
        }
      });
      membership.forEach(function (mask, member) {
        var region = regions[mask - 1];
        region.count++;
        if (region.members.length < MEMBER_LIMIT) region.members.push(member);
      });
    }
    if (fromCounts && spec.regionOptions !== undefined) throw new Error('Set Venn region options on the count records.');
    var inputs = fromCounts ? spec.regions : spec.regionOptions === undefined ? [] : spec.regionOptions;
    if (!Array.isArray(inputs) || inputs.length > regions.length) {
      throw new Error('Venn needs an array with at most one record per exclusive region.');
    }
    var masks = new Set();
    for (var input of inputs) {
      var at = 'Venn region ' + (masks.size + 1);
      var mask = regionOf(input, indexes, at);
      if (masks.has(mask)) throw new Error('Repeated Venn region ' + JSON.stringify(input.sets) + '.');
      masks.add(mask);
      var region = regions[mask - 1];
      if (fromCounts) {
        var count = typeof input.count === 'string' && input.count.includes('%') ? null : kit.toNumber(input.count);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error(at + ' needs a nonnegative safe integer count.');
        region.count = count;
      }
      if (input.key != null) {
        region.key = name(input.key);
        if (!region.key) throw new Error(at + ' needs a nonempty key.');
      }
      if (input.revealStep != null) {
        region.revealStep = name(input.revealStep);
        if (!region.revealStep) throw new Error(at + ' needs a nonempty reveal step.');
      }
    }
    if (new Set(regions.map(function (region) { return region.key; })).size !== regions.length) {
      throw new Error('Venn region keys must be unique, including generated keys for omitted regions.');
    }
    return { sets: sets, regions: regions };
  }

  function expand(mask, groups) {
    return groups.reduce(function (expanded, group, i) {
      return mask & (1 << i) ? expanded | group : expanded;
    }, 0);
  }

  function classify(count, pattern) {
    var groups = [];
    var signatures = [];
    var empty = [];
    for (var i = 0; i < count; i++) {
      var signature = 0;
      for (var mask = 1; mask < (1 << count); mask++) {
        if ((pattern & (1 << (mask - 1))) && (mask & (1 << i))) signature |= 1 << (mask - 1);
      }
      if (!signature) empty.push(i);
      else {
        var equal = signatures.indexOf(signature);
        if (equal < 0) {
          signatures.push(signature);
          groups.push(1 << i);
        } else groups[equal] |= 1 << i;
      }
    }
    for (var order of permutations[groups.length]) {
      var ordered = order.map(function (index) { return groups[index]; });
      var reduced = 0;
      for (var mask = 1; mask < (1 << ordered.length); mask++) {
        if (pattern & (1 << (expand(mask, ordered) - 1))) reduced |= 1 << (mask - 1);
      }
      var circles = catalogue[ordered.length][reduced];
      if (circles) return { groups: ordered, empty: empty, circles: circles, fallback: false };
    }
    return { groups: Array.from({ length: count }, function (_, index) { return 1 << index; }),
      empty: [], circles: classic[count], fallback: true };
  }

  function boundsOf(circles) {
    return {
      left: Math.min(...circles.map(function ([x, , r]) { return x - r; })),
      right: Math.max(...circles.map(function ([x, , r]) { return x + r; })),
      top: Math.min(...circles.map(function ([, y, r]) { return y - r; })),
      bottom: Math.max(...circles.map(function ([, y, r]) { return y + r; }))
    };
  }

  function position(circles, x, y, except) {
    var mask = 0;
    var gap = Infinity;
    circles.forEach(function ([cx, cy, radius], index) {
      if (index === except) return;
      var distance = radius - Math.hypot(cx - x, cy - y);
      if (distance > 0) mask |= 1 << index;
      gap = Math.min(gap, Math.abs(distance));
    });
    return { mask: mask, gap: gap, x: x, y: y };
  }

  function cutCircles(circles) {
    var corners = [];
    var cuts = circles.map(function () { return []; });
    function vertex(x, y) {
      var found = corners.findIndex(function (p) { return Math.hypot(p.x - x, p.y - y) < EPSILON; });
      if (found >= 0) return found;
      corners.push({ x: x, y: y });
      return corners.length - 1;
    }
    circles.forEach(function ([x, y, r], i) {
      for (var j = i + 1; j < circles.length; j++) {
        var [cx, cy, s] = circles[j];
        var dx = cx - x;
        var dy = cy - y;
        var distance = Math.hypot(dx, dy);
        if (distance >= r + s || distance <= Math.abs(r - s)) continue;
        var along = (r * r - s * s + distance * distance) / (2 * distance);
        var normal = Math.sqrt(r * r - along * along);
        [-normal, normal].forEach(function (side) {
          var px = x + (along * dx - side * dy) / distance;
          var py = y + (along * dy + side * dx) / distance;
          var id = vertex(px, py);
          [i, j].forEach(function (index) {
            if (!cuts[index].some(function (cut) { return cut.id === id; })) {
              cuts[index].push({ id: id, angle: Math.atan2(py - circles[index][1], px - circles[index][0]) });
            }
          });
        });
      }
    });
    var arcs = [];
    circles.forEach(function ([x, y, r], index) {
      var ends = cuts[index].sort(function (a, b) { return a.angle - b.angle; });
      if (!ends.length) ends = [{ id: vertex(x + r, y), angle: 0 }, { id: vertex(x - r, y), angle: Math.PI }];
      ends.forEach(function (start, i) {
        var end = ends[(i + 1) % ends.length];
        var span = end.angle - start.angle + (i === ends.length - 1 ? TURN : 0);
        var angle = start.angle + span / 2;
        var outside = position(circles, x + r * Math.cos(angle), y + r * Math.sin(angle), index);
        arcs.push({ start: start.id, end: end.id, r: r, span: span, outside: outside.mask,
          inside: outside.mask | (1 << index), x: x, y: y, angle: angle, gap: outside.gap });
      });
    });
    return { corners: corners, arcs: arcs };
  }

  function geometry(circles) {
    if (!circles.length) return { regions: [] };
    var cut = cutCircles(circles);
    var bounds = boundsOf(circles);
    var regions = Array.from({ length: (1 << circles.length) - 1 }, function (_, i) {
      return { mask: i + 1, loops: [], anchor: null };
    });
    function candidate(x, y) {
      var point = position(circles, x, y);
      if (!point.mask) return;
      var region = regions[point.mask - 1];
      if (!region.anchor || point.gap > region.anchor.gap) region.anchor = point;
    }
    // Start on both sides of every boundary arc so even a thin region has an interior label position.
    cut.arcs.forEach(function (arc) {
      var offset = Math.min(arc.gap / 2, arc.r / 2);
      [-offset, offset].forEach(function (delta) {
        candidate(arc.x + (arc.r + delta) * Math.cos(arc.angle), arc.y + (arc.r + delta) * Math.sin(arc.angle));
      });
    });
    circles.forEach(function ([x, y]) { candidate(x, y); });
    for (var row = 0; row < 24; row++) {
      for (var col = 0; col < 32; col++) {
        candidate(bounds.left + (bounds.right - bounds.left) * (col + 0.5) / 32,
          bounds.top + (bounds.bottom - bounds.top) * (row + 0.5) / 24);
      }
    }
    regions.forEach(function (region) {
      // Traverse each boundary with the region on the same side. Separate loops also describe holes.
      var edges = cut.arcs.flatMap(function (arc) {
        if (arc.inside === region.mask) return [{ start: arc.start, end: arc.end, r: arc.r, span: arc.span, sweep: 1 }];
        if (arc.outside === region.mask) return [{ start: arc.end, end: arc.start, r: arc.r, span: arc.span, sweep: 0 }];
        return [];
      });
      while (edges.length) {
        var first = edges.shift();
        var loop = [first];
        var end = first.end;
        while (end !== first.start) {
          var next = edges.findIndex(function (edge) { return edge.start === end; });
          if (next < 0) throw new Error('Could not close a Venn region boundary.');
          var edge = edges.splice(next, 1)[0];
          loop.push(edge);
          end = edge.end;
        }
        region.loops.push(loop);
      }
    });
    return { bounds: bounds, corners: cut.corners, regions: regions };
  }

  function prepare(spec, kit) {
    var info = regionsOf(spec, kit);
    var pattern = info.regions.reduce(function (bits, region) {
      return region.count ? bits | (1 << (region.mask - 1)) : bits;
    }, 0);
    info.layout = classify(info.sets.length, pattern);
    info.geometry = geometry(info.layout.circles);
    var points = info.regions.map(function (region, i) {
      return { x: i, y: region.count, key: region.key, label: region.label };
    });
    return Object.assign({}, spec, {
      venn: info, height: Number.isFinite(spec.height) && spec.height > 80 ? spec.height : 300,
      series: [{ key: 'regions', data: points }], x: {}, y: {}, categories: [],
      brush: false, rescale: false, toggles: false, referenceLines: []
    });
  }

  function regionPath(loops, corners, transform, scale) {
    function point(id) {
      var p = corners[id];
      return transform(p.x, p.y).map(round).join(',');
    }
    return loops.map(function (loop) {
      return 'M' + point(loop[0].start) + loop.map(function (edge) {
        var radius = round(edge.r * scale);
        return 'A' + radius + ',' + radius + ' 0 ' + (edge.span > Math.PI + EPSILON ? 1 : 0) + ' ' +
          edge.sweep + ' ' + point(edge.end);
      }).join('') + 'Z';
    }).join('');
  }

  function round(value) { return +value.toFixed(4); }

  function visibleSpots(spots) {
    return spots.filter(function (spot) { return !spot.track.classList.contains('op-reveal-pending'); });
  }

  function follow(chart, kit) {
    var state = followers.get(chart.box);
    if (state) {
      state.chart = chart;
      return state.follower;
    }
    state = { chart: chart, spots: [] };
    followers.set(chart.box, state);
    state.follower = OffPrint._revealSteps?.follow(chart.box, function (follower) {
      var chart = state.chart;
      if (chart.model.addon !== 'venn' || !chart.plot.parentNode) return;
      if (chart.svg) follower.apply(chart.svg);
      follower.apply(chart.table);
      var active = chart.spots[chart.active];
      chart.spots = visibleSpots(state.spots);
      if (!active) return;
      var at = chart.spots.indexOf(active);
      if (at < 0) kit.hide(chart);
      else chart.active = at;
    });
    return state.follower;
  }

  function addReveal(el, region, follower) {
    if (!region.revealStep || !follower) return;
    el.setAttribute('data-op-reveal-step', region.revealStep);
    follower.apply(el);
  }

  function draw(chart, width, kit) {
    var model = chart.view;
    var info = model.venn;
    var layout = info.layout;
    var geom = info.geometry;
    var series = model.series[0];
    var height = model.height;
    var frame = kit.svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      'aria-hidden': 'true', focusable: 'false' });
    var layer = kit.svg('g', { class: 'op-chart-marks' }, frame);
    var marks = new Map();
    var out = { frame: frame, layer: layer, marks: marks, spots: [], geom: { left: 0, right: width, top: 0, bottom: height } };
    var state = followers.get(chart.box);
    state.spots = [];
    if (!series || model.noMatches || !layout.circles.length) {
      out.empty = model.noMatches ? 'No matching records' : !series ? 'No visible regions' : 'All sets are empty';
      return out;
    }

    var bounds = geom.bounds;
    var w = bounds.right - bounds.left;
    var h = bounds.bottom - bounds.top;
    var scale = Math.min(Math.max(1, width - 24) / w, (height - 24) / h);
    function transform(x, y) {
      return [(width - w * scale) / 2 + (x - bounds.left) * scale,
        (height - h * scale) / 2 + (y - bounds.top) * scale];
    }
    var hatch = chart.clip + '-venn-empty';
    if (layout.fallback) {
      var pattern = kit.svg('pattern', { id: hatch, width: 6, height: 6, patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)' }, kit.svg('defs', {}, frame));
      kit.svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'op-venn-hatch' }, pattern);
    }
    var outlines = kit.svg('g', { class: 'op-venn-outlines' }, layer);
    layout.circles.forEach(function ([x, y, r], index) {
      var [cx, cy] = transform(x, y);
      var authors = layout.groups[index];
      var circle = kit.svg('circle', { cx: round(cx), cy: round(cy), r: round(r * scale), class: 'op-venn-outline' }, outlines);
      kit.paint(circle, info.sets.find(function (set) { return authors & (1 << set.index); }));
    });
    var spots = geom.regions.filter(function (shape) { return shape.loops.length; }).map(function (shape) {
      var mask = expand(shape.mask, layout.groups);
      var region = info.regions[mask - 1];
      return { shape: shape, region: region, p: series.points[mask - 1], s: series };
    }).sort(function (a, b) { return a.region.mask - b.region.mask; });
    spots.forEach(function (spot) {
      var region = spot.region;
      var shape = spot.shape;
      var [x, y] = transform(shape.anchor.x, shape.anchor.y);
      var track = kit.svg('g', {}, layer);
      layer.insertBefore(track, outlines);
      var el = kit.svg('path', { d: regionPath(shape.loops, geom.corners, transform, scale),
        class: 'op-venn-region' + (region.count ? '' : ' is-empty'), 'fill-rule': 'evenodd',
        'data-op-venn-overlap': region.sets.length, [HIT]: region.mask }, track);
      if (!region.count) el.setAttribute('fill', 'url(#' + hatch + ')');
      var paint = info.sets.find(function (set) { return region.mask & (1 << set.index); });
      kit.paint(el, paint);
      kit.tagKey(model, el, spot.p);
      var count = String(region.count);
      var label = kit.svg('text', { x: round(x), y: round(y), 'text-anchor': 'middle',
        'dominant-baseline': 'central', class: 'op-venn-count' }, track);
      label.textContent = count;
      var room = Math.max(1, shape.anchor.gap * scale * 1.65);
      if (count.length * 8 > room) {
        label.setAttribute('textLength', round(room));
        label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      label.setAttribute('font-size', Math.min(14, round(room)));
      Object.assign(spot, { track: track, el: el, px: x, py: y });
      addReveal(track, region, state.follower);
      kit.addMark(marks, kit.markId(series.key, 'region', spot.p), { el: el, fade: true, paint: paint.role || paint.color || paint.index });
      kit.addMark(marks, kit.markId(series.key, 'count', spot.p), { el: label, fade: true, obstacle: false });
    });
    state.spots = spots;
    out.spots = visibleSpots(spots);
    return out;
  }

  function pick(chart, px, py, event) {
    var target = event?.target?.closest?.('[' + HIT + ']');
    return target ? chart.spots.findIndex(function (spot) { return spot.el === target; }) : -1;
  }

  function memberSummary(region) {
    var list = region.members.map(function (member) { return member.length > 48 ? member.slice(0, 47) + '…' : member; });
    if (region.count > list.length) list.push('+' + (region.count - list.length) + ' more');
    return list.join(', ');
  }

  function readout(chart, spot, tip, kit) {
    var region = spot.region;
    spot.el.classList.add('is-active');
    kit.html('div', 'op-chart-tip-head', tip, region.label);
    var row = kit.html('div', 'op-chart-tip-row', tip);
    kit.html('b', '', row, String(region.count));
    kit.html('span', '', row, region.count === 1 ? 'member' : 'members');
    if (region.members?.length) kit.html('div', 'op-venn-members', tip, memberSummary(region));
  }

  function legend(chart, el, kit) {
    var info = chart.model.venn;
    var follower = follow(chart, kit);
    if (!follower && info.regions.some(function (region) { return region.revealStep; })) {
      OffPrint._warnOnce('chart-venn-reveal', 'Venn regions with a revealStep need data-op-reveal-sequence on the chart.', chart.box);
    }
    info.layout.groups.concat(info.layout.empty.map(function (index) { return 1 << index; })).forEach(function (mask, i) {
      var sets = info.sets.filter(function (set) { return mask & (1 << set.index); });
      var item = kit.html('span', 'op-chart-legend-item', el);
      kit.legendKey('bar', sets[0], item);
      kit.html('span', '', item, sets.map(function (set) { return set.label; }).join(' = ') +
        (i >= info.layout.groups.length ? ' (empty)' : ''));
    });
    if (info.layout.fallback) {
      kit.html('span', 'op-venn-warning', el, FALLBACK);
      OffPrint._warnOnce('chart-venn-layout:' + info.sets.length + ':' + info.regions.map(function (region) {
        return region.count ? '1' : '0';
      }).join(''), FALLBACK, chart.box);
    }
  }

  function table(model, kit, chart) {
    var info = model.venn;
    var memberMode = info.regions[0].members !== null;
    var el = kit.html('table', 'op-venn-table');
    var head = kit.html('tr', '', kit.html('thead', '', el));
    var body = kit.html('tbody', '', el);
    var follower = chart && followers.get(chart.box)?.follower;
    ['Region', 'Count'].concat(memberMode ? ['Members'] : []).forEach(function (label) {
      kit.html('th', '', head, label).setAttribute('scope', 'col');
    });
    info.regions.forEach(function (region, i) {
      var row = kit.tagKey(model, kit.html('tr', '', body), model.series[0].points[i]);
      addReveal(row, region, follower);
      kit.html('th', '', row, region.label).setAttribute('scope', 'row');
      kit.html('td', '', row, String(region.count));
      if (memberMode) kit.html('td', '', row, memberSummary(region));
    });
    return el;
  }

  function describe(model) {
    var info = model.venn;
    return 'Venn diagram for ' + info.sets.map(function (set) { return set.label; }).join(', ') +
      '. Each count belongs to exactly the sets shown by its region.' + (info.layout.fallback ? ' ' + FALLBACK : '');
  }

  var FIELDS = ['sets', 'count', 'pointKey', 'revealStep'];
  function mapFields(mapping) {
    function hasField(key) { return typeof mapping?.[key] === 'string' && mapping[key].trim(); }
    if (!hasField('sets') || !hasField('count') || FIELDS.slice(2).some(function (key) {
      return mapping[key] !== undefined && !hasField(key);
    })) throw new Error('Venn mapping needs sets and count field names, plus optional pointKey and revealStep.');
    return FIELDS.filter(hasField).map(function (key) { return mapping[key]; });
  }

  function mapRecords(records, fields, mapping, spec) {
    var columns = Object.fromEntries(FIELDS.filter(function (key) { return mapping[key] !== undefined; })
      .map(function (key, i) { return [key, fields[i]]; }));
    var regions = records.map(function (row) {
      var sets = row[columns.sets];
      if (typeof sets === 'string') {
        var trimmed = sets.trim();
        sets = trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed.split('|');
      } else if (Number.isFinite(sets)) sets = [sets];
      return { sets: sets, count: row[columns.count], key: columns.pointKey ? name(row[columns.pointKey]) || undefined : undefined,
        revealStep: columns.revealStep ? name(row[columns.revealStep]) || undefined : undefined };
    });
    return Object.assign({}, spec, { regions: regions });
  }

  OffPrint.chart.addon('chart-venn', {
    types: { venn: {
      base: 'scatter', legend: 'venn-sets', ignoreReducedMotion: true, prepare: prepare,
      normalize: function (model, spec, kit, prepared) {
        model.venn = prepared.venn;
        return model;
      },
      draw: draw, pick: pick, readout: readout, table: table, describe: describe,
      mapFields: mapFields, mapRecords: mapRecords
    } },
    legends: { 'venn-sets': legend }
  });
  OffPrint._chart._venn = { classify: classify, geometry: geometry };
})(window);
