// Sankey diagrams draw a weighted, directed acyclic graph as nodes and ribbons.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint.chart || typeof OffPrint.chart.addon !== 'function') return;

  var MAX_NODES = 60;
  var MAX_LINKS = 200;
  var GAP = 10;
  var PAD = 12;
  var NODE_MIN = 4;
  var HIT_INDEX = 'data-op-sankey-index';

  function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

  function name(value) {
    if (Number.isFinite(value)) return String(value);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function tint(record, at) {
    var color = record.color == null ? null : name(record.color);
    var role = record.role == null ? null : name(record.role);
    if (record.color != null && !OffPrint._chart.SCALE_COLORS.includes(color)) {
      throw new Error(at + ' needs a named palette colour.');
    }
    if (record.role != null && !role) throw new Error(at + ' needs a nonempty role.');
    return { color: color, role: role };
  }

  function graphOf(spec, kit) {
    if (!Array.isArray(spec.links)) throw new Error('A Sankey needs a links array.');
    if (spec.links.length > MAX_LINKS) throw new Error('A Sankey can show at most ' + MAX_LINKS + ' links.');
    var infer = spec.nodes == null;
    if (!infer && !Array.isArray(spec.nodes)) throw new Error('Sankey nodes must be an array.');
    if (spec.nodes?.length > MAX_NODES) throw new Error('A Sankey can show at most ' + MAX_NODES + ' nodes.');
    var nodes = [];
    var keys = new Map();

    function addNode(record, at) {
      var key = plain(record) ? name(record.key) : null;
      if (!key) throw new Error(at + ' needs a nonempty key.');
      if (keys.has(key)) throw new Error('Repeated Sankey node key ' + JSON.stringify(key) + '.');
      if (nodes.length === MAX_NODES) throw new Error('A Sankey can show at most ' + MAX_NODES + ' nodes.');
      var label = record.label == null ? key : name(record.label);
      if (!label) throw new Error(at + ' needs a nonempty label.');
      var column = record.column ?? null;
      if (column !== null && (!Number.isInteger(column) || column < 0 || column >= MAX_NODES)) {
        throw new Error(at + ' column must be an integer from 0 to ' + (MAX_NODES - 1) + '.');
      }
      var order = record.order ?? null;
      if (order !== null && !Number.isFinite(order)) throw new Error(at + ' order must be a finite number.');
      var node = Object.assign({ key: key, label: label, column: column, order: order, index: nodes.length,
        incoming: [], outgoing: [], inTotal: 0, outTotal: 0 }, tint(record, at));
      nodes.push(node);
      keys.set(key, node);
      return node;
    }

    var descriptors = spec.nodes || [];
    for (var i = 0; i < descriptors.length; i++) addNode(descriptors[i], 'Sankey node ' + (i + 1));
    function endpoint(value, at) {
      var key = name(value);
      if (!key) throw new Error(at + ' needs a nonempty node key.');
      if (keys.has(key)) return keys.get(key);
      if (infer) return addNode({ key: key }, at);
      throw new Error(at + ' names unknown node ' + JSON.stringify(key) + '.');
    }

    var pairs = new Map();
    var linkKeys = new Set();
    var links = Array.from(spec.links, function (record, i) {
      var at = 'Sankey link ' + (i + 1);
      if (!plain(record)) throw new Error(at + ' needs source, target, and value.');
      var source = endpoint(record.source, at + ' source');
      var target = endpoint(record.target, at + ' target');
      var value = kit.toNumber(record.value);
      if (!Number.isFinite(value) || value <= 0) throw new Error(at + ' needs a positive finite value.');
      var pair = JSON.stringify([source.key, target.key]);
      var occurrence = (pairs.get(pair) || 0) + 1;
      pairs.set(pair, occurrence);
      var key = record.key == null ? 'link:' + pair + ':' + occurrence : name(record.key);
      if (!key) throw new Error(at + ' needs a nonempty key.');
      if (linkKeys.has(key)) throw new Error('Repeated Sankey link key ' + JSON.stringify(key) + '.');
      linkKeys.add(key);
      source.outgoing.push(i);
      target.incoming.push(i);
      source.outTotal += value;
      target.inTotal += value;
      return Object.assign({ key: key, source: source.index, target: target.index, value: value, index: i }, tint(record, at));
    });
    links.forEach(function (link) {
      if (keys.has(link.key)) throw new Error('Sankey link key ' + JSON.stringify(link.key) + ' repeats a node key.');
    });
    nodes.forEach(function (node) {
      node.value = Math.max(node.inTotal, node.outTotal);
      if (!Number.isFinite(node.value)) throw new Error('Sankey totals for ' + JSON.stringify(node.key) + ' exceed the numeric range.');
      var tolerance = 4 * Number.EPSILON * Math.max(node.incoming.length, node.outgoing.length) * node.value;
      var net = node.inTotal - node.outTotal;
      node.net = Math.abs(net) > tolerance ? net : 0;
      node.unbalanced = !!(node.incoming.length && node.outgoing.length && node.net);
    });
    return { nodes: nodes, links: links };
  }

  function assignColumns(nodes, links) {
    var ordered = [];
    var path = [];
    var marks = [];
    function visit(index) {
      if (marks[index] === 2) return;
      if (marks[index] === 1) {
        var cycle = path.slice(path.indexOf(index)).concat(index).map(function (i) { return JSON.stringify(nodes[i].key); });
        throw new Error('Sankey cycle: ' + cycle.join(' → ') + '.');
      }
      marks[index] = 1;
      path.push(index);
      nodes[index].outgoing.forEach(function (i) { visit(links[i].target); });
      path.pop();
      marks[index] = 2;
      ordered.push(index);
    }
    nodes.forEach(function (node) { visit(node.index); });

    var columns = [];
    ordered.reverse().forEach(function (index) {
      var node = nodes[index];
      var first = node.incoming.reduce(function (column, i) {
        return Math.max(column, nodes[links[i].source].column + 1);
      }, 0);
      if (node.column !== null && node.column < first) {
        throw new Error('Sankey column for ' + JSON.stringify(node.key) + ' must be at least ' + first + ' to follow its sources.');
      }
      node.column = node.column ?? first;
      if (node.column >= MAX_NODES) throw new Error('Sankey columns must fit within ' + MAX_NODES + ' positions.');
      (columns[node.column] ||= []).push(index);
    });
    return Array.from(columns, function (column) { return column || []; });
  }

  function orderColumns(columns, nodes, links) {
    var rank = [];
    function rankColumn(column) {
      column.forEach(function (index, i) { rank[index] = (i + 0.5) / column.length; });
    }
    columns.forEach(function (column) {
      column.sort(function (a, b) {
        return (nodes[a].order ?? Infinity) - (nodes[b].order ?? Infinity) || a - b;
      });
      rankColumn(column);
    });

    // Alternate predecessor and successor barycentres while holding the authored positions fixed.
    function sweep(sequence, edges, endpoint, total) {
      sequence.forEach(function (column) {
        var scores = new Map();
        column.forEach(function (index) {
          var node = nodes[index];
          if (node.order !== null) return;
          var score = node[edges].reduce(function (sum, i) {
            return sum + rank[links[i][endpoint]] * (links[i].value / node[total]);
          }, 0);
          scores.set(index, node[edges].length ? score : rank[index]);
        });
        column.sort(function (a, b) {
          if (!scores.has(a) || !scores.has(b)) {
            return (nodes[a].order ?? Infinity) - (nodes[b].order ?? Infinity) || a - b;
          }
          return scores.get(a) - scores.get(b) || rank[a] - rank[b];
        });
        rankColumn(column);
      });
    }
    var reverse = columns.slice().reverse();
    for (var pass = 0; pass < 4; pass++) {
      sweep(columns, 'incoming', 'source', 'inTotal');
      sweep(reverse, 'outgoing', 'target', 'outTotal');
    }
  }

  function trace(info, index) {
    var nodes = new Set([index]);
    var links = new Set();
    function walk(at, direction, endpoint, seen) {
      if (seen.has(at)) return;
      seen.add(at);
      nodes.add(at);
      info.nodes[at][direction].forEach(function (i) {
        links.add(i);
        walk(info.links[i][endpoint], direction, endpoint, seen);
      });
    }
    walk(index, 'incoming', 'source', new Set());
    walk(index, 'outgoing', 'target', new Set());
    return { nodes: nodes, links: links };
  }

  function prepare(spec, kit) {
    var info = graphOf(spec, kit);
    info.columns = assignColumns(info.nodes, info.links);
    orderColumns(info.columns, info.nodes, info.links);
    info.linkColor = spec.linkColor ?? 'source';
    if (!['source', 'target', 'role'].includes(info.linkColor)) {
      throw new Error('Sankey linkColor must be "source", "target", or "role".');
    }
    var points = info.nodes.concat(info.links).map(function (item, i) {
      return { x: i, y: item.value, key: item.key, label: item.label };
    });
    var high = Math.max(0, ...info.columns.map(function (column) { return column.length; }));
    var minimum = PAD * 2 + Math.max(0, ...info.columns.map(function (column) {
      return column.reduce(function (sum, index) {
        var node = info.nodes[index];
        return sum + Math.max(NODE_MIN, node.incoming.length, node.outgoing.length) + GAP;
      }, -GAP);
    }));
    var height = Number.isFinite(spec.height) && spec.height > 80 ? spec.height : Math.max(250, high * 25 + PAD * 2);
    var value = spec.value ?? spec.y;
    var axis = typeof value === 'string' ? value : { label: value?.label, unit: value?.unit, digits: value?.digits };
    return Object.assign({}, spec, {
      sankey: info, height: Math.max(height, minimum), series: [{ key: 'sankey', data: points }],
      x: {}, y: axis, categories: [], brush: false, rescale: false, toggles: false, referenceLines: []
    });
  }

  function layout(info, width, height) {
    var nodes = info.nodes;
    var links = info.links;
    var columns = info.columns;
    var max = links.reduce(function (value, link) { return Math.max(value, link.value); }, 0);
    var weights = links.map(function (link) { return link.value / max; });
    var available = height - PAD * 2;
    var heights;
    var sizes;
    function measure(scale) {
      sizes = weights.map(function (weight) { return Math.max(1, weight * scale); });
      function sum(indices) { return indices.reduce(function (total, i) { return total + sizes[i]; }, 0); }
      heights = nodes.map(function (node) { return Math.max(NODE_MIN, sum(node.incoming), sum(node.outgoing)); });
      return columns.every(function (column) {
        return column.reduce(function (total, index) { return total + heights[index] + GAP; }, -GAP) <= available;
      });
    }
    // Fit a common scale after accounting for the 1px minimum on every ribbon.
    var low = 0;
    var high = available;
    for (var i = 0; i < 28; i++) {
      var middle = (low + high) / 2;
      if (measure(middle)) low = middle;
      else high = middle;
    }
    measure(low);

    var margin = Math.min(PAD, width / 10);
    var pitch = columns.length > 1 ? (width - 2 * margin) / (columns.length - 1) : width / 2;
    var bar = Math.min(14, pitch * 0.33, margin * 2);
    var boxes = [];
    columns.forEach(function (column, c) {
      var stack = column.reduce(function (total, index) { return total + heights[index] + GAP; }, -GAP);
      var y = (height - stack) / 2;
      var x = columns.length === 1 ? margin : margin + pitch * c - bar / 2;
      column.forEach(function (index) {
        boxes[index] = { x: x, y: y, width: bar, height: heights[index] };
        y += heights[index] + GAP;
      });
    });
    var bands = links.map(function (_, i) { return { height: sizes[i] }; });
    nodes.forEach(function (node) {
      var box = boxes[node.index];
      function stack(indices, endpoint, edge, side) {
        var sorted = indices.slice().sort(function (a, b) {
          var first = boxes[links[a][endpoint]];
          var second = boxes[links[b][endpoint]];
          return first.y + first.height / 2 - second.y - second.height / 2 || a - b;
        });
        var total = sorted.reduce(function (sum, i) { return sum + sizes[i]; }, 0);
        var y = box.y + (box.height - total) / 2;
        sorted.forEach(function (i) {
          bands[i][side] = [edge, y];
          y += sizes[i];
        });
      }
      stack(node.incoming, 'source', box.x, 'end');
      stack(node.outgoing, 'target', box.x + box.width, 'start');
    });
    return { boxes: boxes, bands: bands, labelRoom: columns.length > 1 ? pitch / 2 - bar : width - 2 * margin - bar };
  }

  function ribbon(band) {
    var x0 = band.start[0];
    var y0 = band.start[1];
    var x1 = band.end[0];
    var y1 = band.end[1];
    var mid = (x0 + x1) / 2;
    var h = band.height;
    function pair(x, y) { return +x.toFixed(3) + ',' + +y.toFixed(3); }
    return 'M' + pair(x0, y0) + 'C' + pair(mid, y0) + ' ' + pair(mid, y1) + ' ' + pair(x1, y1) +
      'L' + pair(x1, y1 + h) + 'C' + pair(mid, y1 + h) + ' ' + pair(mid, y0 + h) + ' ' + pair(x0, y0 + h) + 'Z';
  }

  function draw(chart, width, kit) {
    var model = chart.view;
    var info = model.sankey;
    var series = model.series[0];
    var height = model.height;
    var frame = kit.svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      'aria-hidden': 'true', focusable: 'false' });
    var layer = kit.svg('g', { class: 'op-chart-marks' + (model.motion ? ' op-sankey-motion' : '') }, frame);
    var marks = new Map();
    var spots = [];
    var geom = { left: 0, right: width, top: 0, bottom: height };
    if (!series || !info.nodes.length || model.noMatches) {
      return { frame: frame, layer: layer, marks: marks, spots: spots, geom: geom,
        empty: model.noMatches ? 'No matching flows' : 'No visible flows' };
    }

    var result = layout(info, width, height);
    var flows = kit.svg('g', {}, layer);
    var bars = kit.svg('g', {}, layer);
    var labels = kit.svg('g', {}, layer);
    var chars = Math.floor(result.labelRoom / kit.CHAR);
    function color(node) {
      return { index: node.index % kit.COLORS, role: node.role, color: node.color };
    }
    function mark(kind, item, el, index, paint) {
      var p = series.points[index];
      el.setAttribute(HIT_INDEX, spots.length);
      kit.tagKey(model, el, p);
      kit.paint(el, paint);
      kit.addMark(marks, kit.markId(series.key, kind, p), { el: el, fade: true,
        paint: paint.role || paint.color || paint.index, order: info.columns.length > 1 ?
          (item.column ?? info.nodes[item.source].column) / (info.columns.length - 1) : 0 });
      return p;
    }

    info.columns.flat().forEach(function (index) {
      var node = info.nodes[index];
      var box = result.boxes[index];
      var el = kit.svg('rect', Object.assign({ rx: 2, class: 'op-sankey-node' }, box), bars);
      var p = mark('node', node, el, index, color(node));
      if (node.unbalanced) el.classList.add('is-unbalanced');
      var py = box.y + box.height / 2;
      var spot = { p: p, s: series, el: el, px: box.x + box.width / 2, py: py, node: index };
      if (chars >= 3) {
        var last = info.columns.length > 1 && node.column === info.columns.length - 1;
        var label = kit.svg('text', { x: last ? box.x - 5 : box.x + box.width + 5, y: py, 'dominant-baseline': 'central',
          'text-anchor': last ? 'end' : 'start', class: 'op-sankey-label' }, labels);
        label.setAttribute(HIT_INDEX, spots.length);
        label.textContent = node.label.length > chars ? node.label.slice(0, chars - 1) + '…' : node.label;
        kit.addMark(marks, kit.markId(series.key, 'label', p), { el: label, fade: true, obstacle: false });
        spot.label = label;
      }
      spots.push(spot);
    });

    info.links.forEach(function (link) {
      var band = result.bands[link.index];
      var paint = link.role || link.color ? link : info.linkColor === 'role' ? { color: 'gray' } : color(info.nodes[link[info.linkColor]]);
      var el = kit.svg('path', { d: ribbon(band), class: 'op-sankey-ribbon' }, flows);
      var p = mark('link', link, el, info.nodes.length + link.index, paint);
      spots.push({ p: p, s: series, el: el, link: link.index, px: (band.start[0] + band.end[0]) / 2,
        py: (band.start[1] + band.end[1] + band.height) / 2 });
    });
    return { frame: frame, layer: layer, marks: marks, spots: spots, geom: geom };
  }

  function pick(chart, px, py, event) {
    var target = event?.target?.closest?.('[' + HIT_INDEX + ']');
    if (!target) return -1;
    var index = Number(target.getAttribute(HIT_INDEX));
    var spot = chart.spots[index];
    return spot && (target === spot.el || target === spot.label) ? index : -1;
  }

  function share(part, total) {
    var percent = 100 * (part / total);
    return percent < 0.1 ? '<0.1%' : +percent.toFixed(1) + '%';
  }

  function flowText(value, axis, kit) {
    if (axis.digits === null && value && Math.abs(value) < 1e-6) return value.toExponential(5) + (axis.unit || '');
    return kit.format(value, axis);
  }

  function balance(node, format) {
    if (!node.outgoing.length && !node.incoming.length) return 'No flows';
    if (!node.incoming.length) return 'Source';
    if (!node.outgoing.length) return 'Destination';
    if (!node.unbalanced) return 'Balanced';
    return (node.net > 0 ? 'Incoming exceeds outgoing by ' : 'Outgoing exceeds incoming by ') + format(Math.abs(node.net));
  }

  function readout(chart, spot, tip, kit) {
    var model = chart.view;
    var info = model.sankey;
    function format(value) { return flowText(value, model.y, kit); }
    function row(label, value) {
      var line = kit.html('div', 'op-chart-tip-row', tip);
      kit.html('b', '', line, value);
      kit.html('span', '', line, label);
    }
    if (spot.node !== undefined) {
      var node = info.nodes[spot.node];
      var path = trace(info, spot.node);
      chart.spots.forEach(function (s) {
        if (path.nodes.has(s.node) || path.links.has(s.link)) {
          s.el.classList.add('is-active');
          s.label?.classList.add('is-active');
        }
      });
      kit.html('div', 'op-chart-tip-head', tip, node.label);
      row('Incoming', format(node.inTotal));
      row('Outgoing', format(node.outTotal));
      kit.html('div', 'op-chart-tip-note', tip, balance(node, format));
    } else {
      var link = info.links[spot.link];
      var source = info.nodes[link.source];
      var target = info.nodes[link.target];
      chart.spots.forEach(function (s) {
        if (s.link === spot.link || s.node === source.index || s.node === target.index) {
          s.el.classList.add('is-active');
          s.label?.classList.add('is-active');
        }
      });
      kit.html('div', 'op-chart-tip-head', tip, source.label + ' → ' + target.label);
      row(model.y.label || 'Flow', format(link.value));
      row('of source outflow', share(link.value, source.outTotal));
      row('of destination inflow', share(link.value, target.inTotal));
    }
  }

  function table(model, kit) {
    var info = model.sankey;
    var points = model.series[0]?.points || [];
    var wrapper = kit.html('div', 'op-sankey-tables');
    function format(value) { return flowText(value, model.y, kit); }
    function addTable(title, headings) {
      var table = kit.html('table', '', wrapper);
      kit.html('caption', '', table, title);
      var head = kit.html('tr', '', kit.html('thead', '', table));
      headings.forEach(function (heading) { kit.html('th', '', head, heading).setAttribute('scope', 'col'); });
      var body = kit.html('tbody', '', table);
      return function (point, cells) {
        var row = kit.tagKey(model, kit.html('tr', '', body), point);
        cells.forEach(function (cell) { kit.html('td', '', row, cell); });
      };
    }
    var nodeRow = addTable('Nodes', ['Node', 'Incoming', 'Outgoing', 'Node total', 'Balance']);
    var linkRow = addTable('Links', ['Source', 'Destination', model.y.label || 'Flow', 'Share of source', 'Share of destination']);
    info.columns.flat().forEach(function (index) {
      var node = info.nodes[index];
      nodeRow(points[index], [node.label, format(node.inTotal), format(node.outTotal), format(node.value), balance(node, format)]);
    });
    info.links.forEach(function (link) {
      var source = info.nodes[link.source];
      var target = info.nodes[link.target];
      linkRow(points[info.nodes.length + link.index], [source.label, target.label, format(link.value),
        share(link.value, source.outTotal), share(link.value, target.inTotal)]);
    });
    return wrapper;
  }

  function describe(model) {
    var info = model.sankey;
    return 'Sankey diagram with ' + info.nodes.length + ' nodes and ' + info.links.length +
      ' links. Reading a node traces its incoming and outgoing paths.';
  }

  var FIELDS = ['source', 'target', 'value', 'pointKey', 'color', 'role'];
  function mapFields(mapping) {
    function field(key) { return typeof mapping?.[key] === 'string' && mapping[key].trim(); }
    if (!FIELDS.slice(0, 3).every(field) ||
        FIELDS.slice(3).some(function (key) { return mapping[key] !== undefined && !field(key); })) {
      throw new Error('Sankey mapping needs source, target, and value field names, plus optional pointKey, color, and role.');
    }
    return FIELDS.filter(field).map(function (key) { return mapping[key]; });
  }

  function mapRecords(records, fields, mapping, spec) {
    if (records.length > MAX_LINKS) throw new Error('A Sankey can show at most ' + MAX_LINKS + ' links.');
    var columns = Object.fromEntries(FIELDS.filter(function (key) { return mapping[key] !== undefined; })
      .map(function (key, i) { return [key, fields[i]]; }));
    var links = records.map(function (record) {
      return { source: record[columns.source], target: record[columns.target], value: record[columns.value],
        key: columns.pointKey ? name(record[columns.pointKey]) : undefined,
        color: columns.color ? name(record[columns.color]) : undefined,
        role: columns.role ? name(record[columns.role]) : undefined };
    });
    return Object.assign({}, spec, { links: links, value: spec.value ?? spec.y ?? columns.value });
  }

  OffPrint.chart.addon('chart-sankey', {
    types: { sankey: {
      base: 'scatter', ignoreReducedMotion: true, prepare: prepare,
      normalize: function (model, spec, kit, prepared) {
        model.sankey = prepared.sankey;
        return model;
      },
      draw: draw, pick: pick, readout: readout, table: table, describe: describe,
      mapFields: mapFields, mapRecords: mapRecords
    } }
  });
  OffPrint._chart._sankey = { trace: trace, layout: layout, ribbon: ribbon };
})(window);
