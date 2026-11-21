// Internal geometry, SVG, and keyed interaction helpers for diagrams.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm._detail) {
    if (typeof console !== 'undefined') console.warn('[docform] diagram.js needs core.js and detail.js loaded before it.');
    return;
  }

  var items = DocForm._items;
  var detail = DocForm._detail;
  var SVG = 'http://www.w3.org/2000/svg';
  var SIDES = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] };

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function centers(h, rank, size, gap) {
    var maxH = Math.max.apply(null, h);
    var step = [];
    for (var k = 0; k < maxH; k++) step.push(0);
    var byRank = {};
    h.forEach(function (_, v) { (byRank[rank[v]] = byRank[rank[v]] || []).push(v); });
    Object.keys(byRank).forEach(function (r) {
      var list = byRank[r].sort(function (a, b) { return h[a] - h[b]; });
      for (var i = 1; i < list.length; i++) {
        var a = list[i - 1];
        var b = list[i];
        var span = Math.max(h[b] - h[a], 1);
        var per = (size[a] / 2 + gap + size[b] / 2) / span;
        for (var j = h[a]; j < h[a] + span && j < maxH; j++) step[j] = Math.max(step[j], per);
      }
    });
    var fallback = (mean(size) + gap) / 2;
    var c = [0];
    for (k = 0; k < maxH; k++) c.push(c[k] + (step[k] || fallback));
    var top = Math.min.apply(null, h.map(function (row, v) { return c[row] - size[v] / 2; }));
    return c.map(function (value) { return value - top; });
  }

  function bands(rank, size, gap) {
    var maxRank = Math.max.apply(null, rank);
    var width = [];
    for (var r = 0; r <= maxRank; r++) width.push(0);
    rank.forEach(function (r, v) { width[r] = Math.max(width[r], size[v]); });
    var start = [0];
    for (r = 1; r <= maxRank; r++) start.push(start[r - 1] + width[r - 1] + gap);
    return {
      center: width.map(function (w, i) { return start[i] + w / 2; }),
      total: start[maxRank] + width[maxRank]
    };
  }

  // Linear interpolation over evenly indexed positions, extrapolating past the ends.
  function interpolate(list, at) {
    if (list.length === 1) return list[0];
    var i = Math.min(Math.max(Math.floor(at), 0), list.length - 2);
    return list[i] + (at - i) * (list[i + 1] - list[i]);
  }

  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function length(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function unit(a) {
    var l = length(a);
    return l ? [a[0] / l, a[1] / l] : [1, 0];
  }

  // Smooth cubic segments through the points. Directions are travel directions at the ends.
  function curve(points, startDir, endDir) {
    var last = points.length - 1;
    var tangents = points.map(function (point, i) {
      return i === 0 ? startDir : i === last ? endDir : unit(sub(points[i + 1], points[i - 1]));
    });
    var segments = [];
    for (var i = 0; i < last; i++) {
      var a = points[i];
      var b = points[i + 1];
      var chord = sub(b, a);
      var k = Math.max(length(chord) * (last > 1 ? 0.35 : 0.42), 24);
      // A tangent across the chord (a loop back) gets a short handle so the bend stays near the blocks.
      var along = unit(chord);
      var k0 = tangents[i][0] * along[0] + tangents[i][1] * along[1] < 0.3 ? Math.min(k, 40) : k;
      var k1 = tangents[i + 1][0] * along[0] + tangents[i + 1][1] * along[1] < 0.3 ? Math.min(k, 40) : k;
      segments.push([a, add(a, mul(tangents[i], k0)), sub(b, mul(tangents[i + 1], k1)), b]);
    }
    return segments;
  }

  function point(segment, t) {
    var u = 1 - t;
    var a = u * u * u;
    var b = 3 * u * u * t;
    var c = 3 * u * t * t;
    var d = t * t * t;
    return [a * segment[0][0] + b * segment[1][0] + c * segment[2][0] + d * segment[3][0],
      a * segment[0][1] + b * segment[1][1] + c * segment[2][1] + d * segment[3][1]];
  }

  function midpoint(segments) {
    return point(segments[Math.floor((segments.length - 1) / 2)], segments.length % 2 ? 0.5 : 1);
  }

  function sample(segments, count) {
    var points = [segments[0][0]];
    segments.forEach(function (segment) {
      for (var i = 1; i <= count; i++) points.push(point(segment, i / count));
    });
    return points;
  }

  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }

  function intersect(p1, p2, q1, q2) {
    var r = sub(p2, p1);
    var s = sub(q2, q1);
    var d = cross(r, s);
    if (Math.abs(d) < 1e-9) return null;
    var t = cross(sub(q1, p1), s) / d;
    var u = cross(sub(q1, p1), r) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(p1, mul(r, t)) : null;
  }

  function crossings(a, b, gap) {
    var found = [];
    for (var i = 1; i < a.length; i++) {
      for (var j = 1; j < b.length; j++) {
        if (Math.max(a[i - 1][0], a[i][0]) < Math.min(b[j - 1][0], b[j][0]) ||
            Math.min(a[i - 1][0], a[i][0]) > Math.max(b[j - 1][0], b[j][0]) ||
            Math.max(a[i - 1][1], a[i][1]) < Math.min(b[j - 1][1], b[j][1]) ||
            Math.min(a[i - 1][1], a[i][1]) > Math.max(b[j - 1][1], b[j][1])) continue;
        var hit = intersect(a[i - 1], a[i], b[j - 1], b[j]);
        if (hit && !found.some(function (other) { return length(sub(other, hit)) < gap * 2; })) found.push(hit);
      }
    }
    return found;
  }

  function pathData(segments) {
    function f(n) { return Math.round(n * 10) / 10; }
    return 'M' + f(segments[0][0][0]) + ' ' + f(segments[0][0][1]) + segments.map(function (s) {
      return 'C' + [s[1], s[2], s[3]].map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join(' ');
    }).join('');
  }

  function svg(name, attrs, parent) {
    var el = document.createElementNS(SVG, name);
    Object.keys(attrs).forEach(function (key) { if (attrs[key] != null) el.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function sideOf(rect, side) {
    var d = SIDES[side];
    return [rect.x + rect.w / 2 + d[0] * rect.w / 2, rect.y + rect.h / 2 + d[1] * rect.h / 2];
  }

  function prepareNodes(nodes, selectable, base) {
    var keyed = new Set(selectable);
    nodes.forEach(function (el, i) {
      if (!el.id) el.id = detail.uniqueId(base + '-' + (i + 1));
      if (keyed.has(el) && !el.hasAttribute('data-df-key')) el.setAttribute('data-df-key', el.id);
    });
  }

  function selection(feature, host, domain, snapshotAt, groupAttribute, onSelect) {
    var nodes = domain.items;
    var active;

    function roving(index, ignoreFocus) {
      var focused = ignoreFocus ? -1 : nodes.indexOf(document.activeElement);
      nodes.forEach(function (node, i) { node.tabIndex = i === (focused < 0 ? index : focused) ? 0 : -1; });
    }

    var binding = items.controller(feature, host, domain, snapshotAt, function (current) {
      if (active) active.removeAttribute('aria-current');
      active = nodes[current.index];
      active.setAttribute('aria-current', 'true');
      if (onSelect) onSelect(current);
      roving(current.index);
    }, groupAttribute);
    var replace = binding.replace;
    binding.replace = function (next) {
      nodes = next.items;
      return replace(next);
    };
    binding.roving = roving;
    return binding;
  }

  function connectDetails(host, pane, controller) {
    if (pane) detail.mount(pane, { source: host });
    detail.source(host, controller);
  }

  function selectOnHover(target, index, binding) {
    target.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch' || target.inert) return;
      if (binding.controller.snapshot().index !== index) {
        var choose = function () { binding.choose(index, 'user'); };
        if (DocForm._readerState) DocForm._readerState.transient(choose);
        else choose();
      }
    });
  }

  function element(tag, cls, parent) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }

  function position(el, x, y) {
    el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  function recordDiagram(feature, readMarkup, fields, prepare, draw) {
    var selector = '.df-' + feature;
    var sources = new WeakMap();
    var controllers = new WeakMap();

    function source(host) {
      if (sources.has(host)) return sources.get(host);
      var data = DocForm._dataSource;
      if (!data) throw new Error('Enable the data feature to use a named diagram source.');
      var binding = data.binding(feature, host, data.options(feature, host), function (records, mapping, input, spec, caps) {
        if (spec) {
          mapping = records && records.mapping;
          records = records && records.records;
        }
        if (!Array.isArray(records) || records.length > caps.maxRows) {
          throw new Error('Expected an array of diagram records within the row limit.');
        }
        var names = Object.assign({}, fields, mapping);
        var keys = Object.keys(fields);
        if (keys.some(function (key) { return !items.key(names[key]); })) {
          throw new Error('Diagram mapping needs nonempty field names.');
        }
        return prepare(records.map(function (record) {
          if (!record || typeof record !== 'object' || Array.isArray(record)) {
            throw new Error('Each diagram record must be an object.');
          }
          var result = {};
          keys.forEach(function (key) {
            if (Object.hasOwn(record, names[key])) result[key] = record[names[key]];
          });
          return result;
        }), host);
      });
      sources.set(host, binding);
      return binding;
    }

    function domain(model, nodes) {
      return {
        items: nodes, keys: model.map(function (record) { return record.key; }),
        initial: Math.max(0, model.findIndex(function (record) { return record.initial; }))
      };
    }

    items.scan(feature, function () {
      DocForm._all(selector).forEach(function (host) {
        var next = null;
        try {
          var model = host.hasAttribute('data-df-source') ? source(host).read() : readMarkup(host);
          next = domain(model, model.map(function () { return host; }));
        } catch (_) {
          // Setup reports invalid input and keeps the authored fallback visible.
        }
        items.collect(feature, host, next);
      });
    });

    function mount(host) {
      var scroll = element('div', 'df-' + feature + '-scroll');
      var binding;
      var view;
      var records;
      var next;
      var actions = {
        host: host,
        current: function () { return binding.controller.snapshot().index; },
        choose: function (index, origin) { return binding.choose(index, origin); },
        focus: function (index) { next.items[index].focus(); }
      };

      function render(model) {
        var active = document.activeElement;
        var focused = active && scroll.contains(active) && active.getAttribute('data-df-key');
        records = model;
        var previous = view;
        view = draw(model, scroll, actions, previous);
        next = domain(model, view.nodes);
        next.items.forEach(function (button, index) {
          button.addEventListener('click', function () { actions.choose(index, 'user'); });
          button.addEventListener('focus', function () { binding.roving(index); });
          button.addEventListener('blur', function () {
            var selected = binding.controller.snapshot();
            if (selected) binding.roving(selected.index, true);
          });
          button.addEventListener('keydown', function (event) {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            var target = view.navigate(index, event.key);
            if (target === undefined) return;
            event.preventDefault();
            actions.focus(target);
            actions.choose(target, 'keyboard');
          });
        });
        if (!binding) {
          host.insertBefore(scroll, host.firstChild);
          host.classList.add('df-' + feature + '-ready');
          binding = selection(feature, host, next, function (index, key) {
            return view.snapshot(records[index], index, key);
          }, null, function (current) {
            if (view.reveal) view.reveal(current.index);
          });
          controllers.set(host, binding.controller);
          connectDetails(host, host.querySelector(':scope > .df-detail-pane'), binding.controller);
          bindHover();
          binding.start();
          return;
        }
        bindHover();
        var notify = binding.replace(next);
        if (focused) {
          var index = next.keys.indexOf(focused);
          var button = next.items[index];
          if (!button || (view.visible && !view.visible(index))) button = next.items[actions.current()];
          button.focus({ preventScroll: true });
        }
        return notify;
      }

      function bindHover() {
        (view.hoverTargets || next.items).forEach(function (target, index) {
          selectOnHover(target, index, binding);
        });
      }

      try {
        if (host.hasAttribute('data-df-source')) source(host).mount({ start: render, stage: render });
        else render(readMarkup(host));
      } catch (error) {
        items.issue(feature, host, error.message, 'Check the diagram markup or named source.');
      }
    }

    DocForm.register(feature, function () { DocForm._all(selector).forEach(mount); });
    return { get: function (target) { return controllers.get(items.target(target)) || null; } };
  }

  DocForm._diagram = {
    sides: SIDES, sideOf: sideOf, svg: svg,
    centers: centers, bands: bands, interpolate: interpolate, mean: mean,
    add: add, sub: sub, mul: mul, unit: unit,
    curve: curve, midpoint: midpoint, sample: sample, crossings: crossings, pathData: pathData,
    prepareNodes: prepareNodes, selection: selection, connectDetails: connectDetails,
    element: element, position: position, recordDiagram: recordDiagram, selectOnHover: selectOnHover
  };
})(typeof window !== 'undefined' ? window : globalThis);
