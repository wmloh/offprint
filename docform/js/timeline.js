// Horizontal timeline diagrams backed by authored events or a named record source.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm._diagram) return;

  var FEATURE = 'timeline';
  var WIDTH = 744;
  var LEFT = 132;
  var RIGHT = WIDTH - 134;
  var AXIS = 36;
  var ROW = 56;
  var LABEL = 112;
  var GAP = 8;
  var DAY = 86400000;
  var diagram = DocForm._diagram;
  var items = DocForm._items;
  var models = new WeakMap();
  var sources = new WeakMap();
  var controllers = new WeakMap();
  var views = new WeakMap();

  function position(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      var date = Date.parse(text);
      if (Number.isFinite(date) && formatDate(date) === text) return { date: true, value: date };
    }
    if (typeof value !== 'number' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    var number = Number(value);
    return Number.isFinite(number) ? { date: false, value: number } : null;
  }

  function formatDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function makeScale(min, max, left, right) {
    var span = max - min;
    return function (value) {
      if (span === 0) return (left + right) / 2;
      var fraction = Number.isFinite(span) ? (value - min) / span :
        (value / 2 - min / 2) / (max / 2 - min / 2);
      return left + fraction * (right - left);
    };
  }

  function axisTicks(min, max, date) {
    var values = new Set([min]);
    for (var i = 1; min !== max && i < 5; i++) {
      var fraction = i / 4;
      var value = i === 4 ? max : min * (1 - fraction) + max * fraction;
      values.add(date ? Math.round(value / DAY) * DAY : value);
    }
    var ticks = Array.from(values);
    var labels = ticks.map(function (value) {
      return date ? formatDate(value) : String(Number(value.toPrecision(6)));
    });
    var distinct = new Set(labels).size === labels.length;
    return ticks.map(function (value, i) { return { value: value, label: distinct ? labels[i] : String(value) }; });
  }

  function layout(events, scale) {
    var lanes = new Map();
    events.forEach(function (event) {
      if (!lanes.has(event.lane)) lanes.set(event.lane, []);
      lanes.get(event.lane).push(event);
    });
    var top = AXIS;
    var ordered = [];
    var rows = Array.from(lanes, function (entry) {
      var ends = [];
      var laneTop = top;
      entry[1].sort(function (a, b) { return a.start - b.start; }).forEach(function (event) {
        var x = scale(event.start);
        var span = scale(event.end) - x;
        var width = Math.max(LABEL, span);
        var row = ends.findIndex(function (end) { return end + GAP <= x; });
        if (row < 0) row = ends.length;
        ends[row] = x + width;
        ordered.push({ event: event, x: x, span: span, width: width, row: row, y: laneTop + row * ROW });
      });
      top += ends.length * ROW;
      return { label: entry[0], top: laneTop, bottom: top };
    });
    return { lanes: rows, events: ordered, height: top };
  }

  function prepare(records) {
    if (!records.length) throw new Error('A timeline needs at least one event.');
    var keys = new Set();
    var date;
    var min = Infinity;
    var max = -Infinity;
    var events = records.map(function (record) {
      var key = items.key(record.key);
      if (!key || keys.has(key)) throw new Error('Timeline events need unique nonempty string keys.');
      keys.add(key);
      var start = position(record.start);
      var missingEnd = record.end == null || (typeof record.end === 'string' && !record.end.trim());
      var end = missingEnd ? start : position(record.end);
      if (!start || !end || start.date !== end.date || (date !== undefined && start.date !== date) ||
          end.value < start.value) {
        throw new Error('Timeline event "' + key + '" needs an ordered range on the same numeric or ISO date scale as the other events.');
      }
      date = start.date;
      min = Math.min(min, start.value);
      max = Math.max(max, end.value);
      return {
        key: key, start: start.value, end: end.value, initial: record.initial,
        label: items.key(record.label) || key, lane: items.key(record.lane) || 'Events'
      };
    });
    var scale = makeScale(min, max, LEFT, RIGHT);
    var scene = layout(events, scale);
    scene.min = min;
    scene.max = max;
    scene.date = date;
    scene.axis = axisTicks(min, max, date).map(function (tick) {
      return { x: scale(tick.value), label: tick.label };
    });
    scene.format = date ? formatDate : String;
    scene.initial = Math.max(0, scene.events.findIndex(function (entry) { return entry.event.initial; }));
    return scene;
  }

  function markup(host) {
    var list = host.querySelector(':scope > .df-timeline-events');
    var records = list ? Array.from(list.children, function (el) {
      return {
        key: el.getAttribute('data-df-key') ?? el.id,
        start: el.getAttribute('data-df-start'), end: el.getAttribute('data-df-end'),
        lane: el.getAttribute('data-df-lane'), label: DocForm._data(el, 'label', el.textContent),
        initial: items.flag(el, 'initial', FEATURE)
      };
    }) : [];
    return prepare(records);
  }

  function sourceBinding(host) {
    if (sources.has(host)) return sources.get(host);
    var data = DocForm._dataSource;
    if (!data) throw new Error('Enable the data feature to use a named timeline source.');
    var options = data.options(FEATURE, host);
    var binding = data.binding(FEATURE, host, options, function (records, mapping, input, spec, caps) {
      if (spec) {
        mapping = records && records.mapping;
        records = records && records.records;
      }
      if (!Array.isArray(records) || records.length > caps.maxRows) {
        throw new Error('Expected an array of timeline records within the row limit.');
      }
      var fields = Object.assign({ key: 'key', start: 'start', end: 'end', label: 'label', lane: 'lane' }, mapping);
      var names = ['key', 'start', 'end', 'label', 'lane'];
      if (names.some(function (name) { return !items.key(fields[name]); })) {
        throw new Error('Timeline mapping needs nonempty field names.');
      }
      return prepare(records.map(function (record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error('Each timeline record must be an object.');
        }
        var event = {};
        names.forEach(function (name) {
          if (Object.hasOwn(record, fields[name])) event[name] = record[fields[name]];
        });
        return event;
      }));
    });
    sources.set(host, binding);
    return binding;
  }

  function make(tag, cls, parent) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }

  function describe(event, format) {
    var position = format(event.start);
    if (event.start !== event.end) position += ' to ' + format(event.end);
    return event.label + ', ' + position + ', ' + event.lane;
  }

  function draw(scene, scroll) {
    var stage = make('div', 'df-timeline-stage');
    var width;
    stage.style.height = scene.height + 'px';
    var grid = diagram.svg('svg', { class: 'df-timeline-grid', width: WIDTH, height: scene.height,
      'aria-hidden': 'true', focusable: 'false' }, stage);

    var dividers = scene.lanes.map(function (lane) {
      var label = make('span', 'df-timeline-lane', stage);
      label.style.top = (lane.top + 8) + 'px';
      label.textContent = lane.label;
      DocForm.util.hint(label, lane.label);
      label.setAttribute('aria-hidden', 'true');
      return diagram.svg('line', { x1: 0, x2: WIDTH, y1: lane.top, y2: lane.top }, grid);
    });
    var axis = diagram.svg('line', { x1: LEFT, x2: RIGHT, y1: 28, y2: 28, class: 'df-timeline-axis' }, grid);
    var ticks = scene.axis.map(function (tick) {
      var line = diagram.svg('line', { y1: 24, y2: scene.height }, grid);
      var text = diagram.svg('text', { y: 18, 'text-anchor': 'middle' }, grid);
      text.textContent = tick.label;
      return { line: line, text: text, x: tick.x };
    });
    var summary = make('ol', 'df-timeline-summary', stage);
    var bars = [];
    var nodes = scene.events.map(function (entry, index) {
      var event = entry.event;
      var span = event.end !== event.start;
      var legend = describe(event, scene.format);
      var button = make('button', 'df-timeline-event', stage);
      button.type = 'button';
      button.setAttribute('data-df-key', event.key);
      button.setAttribute('aria-label', legend);
      DocForm.util.hint(button, legend);
      button.style.top = (entry.y + 3) + 'px';
      make('span', 'df-timeline-label', button).textContent = event.label;
      var mark = make('span', 'df-timeline-mark', button);
      if (span) {
        mark.classList.add('df-timeline-span');
        bars[index] = mark;
      }
      make('li', null, summary).textContent = legend;
      return button;
    });
    scroll.replaceChildren(stage);
    function resize() {
      var nextWidth = Math.max(WIDTH, scroll.clientWidth);
      if (nextWidth === width) return;
      width = nextWidth;
      var growth = (RIGHT - LEFT + width - WIDTH) / (RIGHT - LEFT);
      stage.style.width = width + 'px';
      grid.setAttribute('width', width);
      axis.setAttribute('x2', RIGHT + width - WIDTH);
      dividers.forEach(function (line) { line.setAttribute('x2', width); });
      ticks.forEach(function (tick) {
        var x = LEFT + (tick.x - LEFT) * growth;
        tick.line.setAttribute('x1', x);
        tick.line.setAttribute('x2', x);
        tick.text.setAttribute('x', x);
      });
      scene.events.forEach(function (entry, i) {
        nodes[i].style.left = (LEFT + (entry.x - LEFT) * growth) + 'px';
        nodes[i].style.width = Math.max(LABEL, entry.span * growth) + 'px';
        if (bars[i]) bars[i].style.width = entry.span * growth + 'px';
      });
    }

    function coords(x, y) {
      var region = scroll.getBoundingClientRect();
      var bounds = scroll.parentElement.getBoundingClientRect();
      var rect = stage.getBoundingClientRect();
      var scaleX = rect.width / width;
      var scaleY = rect.height / scene.height;
      var start = rect.left + LEFT * scaleX;
      var end = rect.right - (WIDTH - RIGHT) * scaleX;
      var plot = {
        left: Math.max(start, region.left, bounds.left), right: Math.min(end, region.right, bounds.right),
        top: Math.max(rect.top + AXIS * scaleY, region.top, bounds.top),
        bottom: Math.min(rect.bottom, region.bottom, bounds.bottom)
      };
      if (!scaleX || !scaleY || x < plot.left || x > plot.right || y < plot.top || y >= plot.bottom) return null;
      var fraction = (x - start) / (end - start);
      var value = scene.min * (1 - fraction) + scene.max * fraction;
      var laneY = (y - rect.top) / scaleY;
      var lane = scene.lanes.find(function (lane) { return laneY >= lane.top && laneY < lane.bottom; });
      return { plot: plot, value: scene.date ? formatDate(Math.round(value / DAY) * DAY) : String(Number(value.toPrecision(6))),
        label: scene.date ? 'Date' : 'Position', lane: lane ? lane.label : '' };
    }

    return { resize: resize, coords: coords,
      domain: { items: nodes, keys: scene.events.map(function (entry) { return entry.event.key; }), initial: scene.initial } };
  }

  function setup(host) {
    var binding;
    var scene;
    var view;
    var scroll = make('div', 'df-timeline-scroll');
    var named = host.hasAttribute('data-df-source');

    function snapshot(index, key) {
      var event = scene.events[index].event;
      return { key: key, index: index, label: event.label, lane: event.lane, start: event.start, end: event.end };
    }

    function render(model, initial) {
      var active = document.activeElement;
      var focused = active && scroll.contains(active) ? active.getAttribute('data-df-key') : null;
      scene = model;
      view = draw(model, scroll);
      var domain = view.domain;
      views.set(host, view);
      if (!binding) {
        host.insertBefore(scroll, host.firstChild);
        host.classList.add('df-timeline-ready');
        binding = diagram.selection(FEATURE, host, domain, snapshot);
        controllers.set(host, binding.controller);
        diagram.connectDetails(host, host.querySelector(':scope > .df-detail-pane'), binding.controller);
        if (typeof root.ResizeObserver === 'function') {
          new root.ResizeObserver(function () { view.resize(); }).observe(scroll);
        }
      }
      view.resize();
      domain.items.forEach(function (button, index) {
        diagram.selectOnHover(button, index, binding);
        button.addEventListener('click', function () { binding.choose(index, 'user'); });
        button.addEventListener('focus', function () { binding.roving(index); });
        button.addEventListener('blur', function () {
          var selected = binding.controller.snapshot();
          if (selected) binding.roving(selected.index, true);
        });
        button.addEventListener('keydown', function (event) {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          var next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: domain.items.length - 1 }[event.key];
          if (!Number.isInteger(next)) return;
          event.preventDefault();
          next = Math.max(0, Math.min(domain.items.length - 1, next));
          domain.items[next].focus();
          binding.choose(next, 'keyboard');
        });
      });
      if (initial) {
        binding.start();
        return;
      }
      var notify = binding.replace(domain);
      if (focused) {
        var nextFocus = domain.keys.indexOf(focused);
        domain.items[nextFocus < 0 ? binding.controller.snapshot().index : nextFocus].focus({ preventScroll: true });
      }
      return notify;
    }

    try {
      if (named) {
        sourceBinding(host).mount({
          start: function (model) { render(model, true); },
          stage: function (model) { return render(model, false); }
        });
      } else render(models.get(host) || markup(host), true);
    } catch (error) {
      items.issue(FEATURE, host, error.message, 'Check the timeline event keys, positions, and source.');
    }
  }

  items.scan(FEATURE, function () {
    DocForm._all('.df-timeline').forEach(function (host) {
      try {
        var model;
        if (host.hasAttribute('data-df-source')) model = sourceBinding(host).read();
        else {
          model = markup(host);
          models.set(host, model);
        }
        items.collect(FEATURE, host, {
          keys: model.events.map(function (entry) { return entry.event.key; }),
          items: model.events.map(function () { return host; }),
          initial: model.initial
        });
      } catch (_) {
        // Setup reports invalid input and leaves the authored list visible.
        items.collect(FEATURE, host, null);
      }
    });
  });
  DocForm._timeline = {
    scale: makeScale, ticks: axisTicks, layout: layout,
    coords: function (host, x, y) { var view = views.get(host); return view ? view.coords(x, y) : null; },
    get: function (target) { return controllers.get(items.target(target)) || null; }
  };
  DocForm.register(FEATURE, function () { DocForm._all('.df-timeline').forEach(setup); });
})(typeof window !== 'undefined' ? window : globalThis);
