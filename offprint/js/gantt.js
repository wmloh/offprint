// Gantt charts: one task per row on a numeric or UTC calendar axis, with durations, milestones, collapsible group rows,
// right-angled dependency arrows, derived total float and critical path, planned bars, progress, and an as-of line.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint._diagram) return;

  var FEATURE = 'gantt';
  var WIDTH = 744;
  var LEFT = 192;
  var RIGHT = 720;
  var AXIS = 40;
  var ROW = 30;
  var BAR = 8;
  var BAR_H = 14;
  var DIAMOND = 7;
  var MAX_ROWS = 60;
  var DAY = 86400000;
  var TYPES = { FS: 'finish to start', SS: 'start to start', FF: 'finish to finish', SF: 'start to finish' };
  var LAYERS = ['critical', 'planned', 'as-of'];
  var LAYER_LABELS = { critical: 'Critical path', planned: 'Planned dates' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var diagram = OffPrint._diagram;
  var items = OffPrint._items;
  var models = new WeakMap();
  var sources = new WeakMap();
  var controllers = new WeakMap();
  var views = new WeakMap();

  // ---- Parsing ----
  function position(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      var date = Date.parse(text);
      if (Number.isFinite(date) && isoDate(date) === text) return { date: true, value: date };
    }
    if (typeof value !== 'number' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    var number = Number(value);
    return Number.isFinite(number) ? { date: false, value: number } : null;
  }

  function present(value) {
    return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim());
  }

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    var text = typeof value === 'string' ? value.trim() : '';
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : null;
  }

  function flag(value) {
    return value === true || value === 'true' || value === '';
  }

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function shortDate(value, year) {
    var d = new Date(value);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (year ? ' ' + d.getUTCFullYear() : '');
  }

  function plain(value) {
    return String(Number(value.toPrecision(6)));
  }

  // Dependency tokens: "key", "key:SS", or "key:FS+2"; records may also use {key, type, lag} objects.
  function parseDepends(value, owner) {
    if (!present(value)) return [];
    var list = Array.isArray(value) ? value : String(value).split(/[\s,;]+/).filter(Boolean);
    return list.map(function (item) {
      var dep;
      if (typeof item === 'string') {
        var match = /^(.+?)(?::([A-Za-z]+)([+-](?:\d+\.?\d*|\.\d+))?)?$/.exec(item.trim());
        dep = match && { key: match[1], type: match[2], lag: match[3] };
      } else if (item && typeof item === 'object' && !Array.isArray(item)) dep = item;
      var key = dep && items.key(dep.key);
      var type = dep && present(dep.type) ? String(dep.type).toUpperCase() : 'FS';
      var lag = dep && present(dep.lag) ? number(dep.lag) : 0;
      if (!key || !TYPES[type] || lag === null) {
        throw new Error('Gantt task "' + owner + '" has an invalid dependency; use key, key:SS, or key:FS+2.');
      }
      return { key: key, type: type, lag: lag };
    });
  }

  function parseProgress(value, key) {
    if (!present(value)) return null;
    var text = typeof value === 'string' ? value.trim().replace(/%$/, '') : value;
    var n = number(text);
    if (n === null || n < 0 || n > 100) throw new Error('Gantt task "' + key + '" needs progress from 0 to 100 percent.');
    return n;
  }

  // ---- Model ----
  // Dates are UTC calendar days with inclusive end dates, stored as an exclusive end one day later.
  function prepare(records, settings) {
    settings = settings || {};
    if (!Array.isArray(records) || !records.length) throw new Error('A Gantt chart needs at least one task.');
    var date;
    function at(value, what, key) {
      var p = position(value);
      if (!p) throw new Error('Gantt task "' + key + '" needs a numeric or ISO date (YYYY-MM-DD) ' + what + '.');
      if (date === undefined) date = p.date;
      else if (p.date !== date) throw new Error('Gantt task "' + key + '" mixes numbers and dates; use one scale throughout.');
      return p.value;
    }
    function span(key, start, end, duration, what) {
      var s = at(start, what + 'start', key);
      var unit = date ? DAY : 1;
      if (present(end) && present(duration)) throw new Error('Gantt task "' + key + '" needs an end or a duration, not both.');
      if (present(end)) {
        var e = at(end, what + 'end', key) + (date ? DAY : 0);
        if (e < s) throw new Error('Gantt task "' + key + '" ends before it starts.');
        return [s, e];
      }
      if (present(duration)) {
        var d = number(duration);
        if (d === null || d < 0) throw new Error('Gantt task "' + key + '" needs a nonnegative ' + what + 'duration.');
        return [s, s + d * unit];
      }
      return null;
    }

    var tasks = [];
    var byKey = new Map();
    records.forEach(function (record) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Each Gantt task must be an object.');
      var key = items.key(record.key);
      if (!key || byKey.has(key)) throw new Error('Gantt tasks need unique nonempty string keys.');
      var milestone = flag(record.milestone);
      var range = span(key, record.start, record.end, record.duration, '');
      if (milestone) {
        // An end date equal to the start, or a zero duration, still marks one moment.
        if (range && range[1] - range[0] !== (present(record.end) && date ? DAY : 0)) {
          throw new Error('Gantt milestone "' + key + '" needs a single date or a zero duration.');
        }
        var moment = range ? range[0] : at(record.start, 'start', key);
        range = [moment, moment];
      }
      if (!range) throw new Error('Gantt task "' + key + '" needs an end, a duration, or the milestone flag.');
      if (range[1] === range[0]) milestone = true;
      var planned = null;
      var source = record.planned && typeof record.planned === 'object' ? record.planned : null;
      var pStart = source ? source.start : record.plannedStart;
      var pEnd = source ? source.end : record.plannedEnd;
      var pDuration = source ? source.duration : record.plannedDuration;
      if (present(pStart) || present(pEnd) || present(pDuration)) {
        if (!present(pStart)) throw new Error('Gantt task "' + key + '" needs a planned start with its planned end.');
        planned = span(key, pStart, pEnd, pDuration, 'planned ') || (milestone ? null : undefined);
        if (planned === undefined) throw new Error('Gantt task "' + key + '" needs a planned end or duration.');
        if (!planned) {
          var ps = at(pStart, 'planned start', key);
          planned = [ps, ps];
        }
      }
      var task = {
        kind: 'task', key: key, label: items.key(record.label) || key, start: range[0], end: range[1], milestone: milestone,
        progress: milestone ? null : parseProgress(record.progress, key), planned: planned,
        group: items.key(record.group), depends: parseDepends(record.depends, key),
        revealStep: items.key(record.revealStep), initial: record.initial === true || record.initial === 'true'
      };
      byKey.set(key, task);
      tasks.push(task);
    });
    var unit = date ? DAY : 1;

    // Rows: each group row sits where its first task appears, with all of its tasks gathered beneath it.
    var rows = [];
    var groups = new Map();
    tasks.forEach(function (task) {
      if (!task.group) {
        rows.push(task);
        return;
      }
      if (groups.has(task.group)) return;
      if (byKey.has(task.group)) throw new Error('Gantt group "' + task.group + '" uses the same key as a task.');
      var members = tasks.filter(function (other) { return other.group === task.group; });
      var group = {
        kind: 'group', key: task.group, label: task.group, children: [],
        start: Math.min.apply(null, members.map(function (t) { return t.start; })),
        end: Math.max.apply(null, members.map(function (t) { return t.end; })),
        revealStep: null, initial: false
      };
      groups.set(task.group, group);
      rows.push(group);
      members.forEach(function (member) { rows.push(member); });
    });
    if (rows.length > MAX_ROWS) {
      throw new Error('A Gantt chart shows at most ' + MAX_ROWS + ' rows, including group rows; split it into smaller charts.');
    }
    rows.forEach(function (row, index) {
      row.index = index;
      if (row.kind === 'task' && row.group) groups.get(row.group).children.push(index);
    });

    var links = schedule(tasks, byKey, unit);
    var asOf = null;
    if (present(settings.asOf)) {
      var p = position(settings.asOf);
      if (!p || p.date !== date) throw new Error('The Gantt as-of position must use the same numeric or date scale as the tasks.');
      asOf = p.value + (date ? DAY : 0);
    }
    var min = Infinity;
    var max = -Infinity;
    tasks.forEach(function (task) {
      [task.start, task.end].concat(task.planned || []).forEach(function (v) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      });
    });
    if (asOf !== null) {
      min = Math.min(min, asOf);
      max = Math.max(max, asOf);
    }
    if (min === max) {
      min -= unit;
      max += unit;
    }
    var collapsed = (settings.collapsed || []).filter(function (key) { return groups.has(key); });
    return {
      rows: rows, tasks: tasks, links: links, groups: groups, date: date, unit: unit, min: min, max: max, asOf: asOf,
      finish: Math.max.apply(null, tasks.map(function (task) { return task.ef; })),
      weekends: !!settings.weekends && date, collapsed: collapsed,
      initial: Math.max(0, rows.findIndex(function (row) { return row.initial; })),
      unmet: links.filter(function (link) { return link.unmet; })
    };
  }

  // Forward and backward passes. Each task's authored start is its earliest start unless a dependency pushes it later;
  // total float is how far it can slip without delaying the latest finish.
  function schedule(tasks, byKey, unit) {
    var links = [];
    tasks.forEach(function (task) {
      task.incoming = [];
      task.outgoing = [];
    });
    tasks.forEach(function (task) {
      task.depends.forEach(function (dep) {
        var from = byKey.get(dep.key);
        if (!from) throw new Error('Gantt task "' + task.key + '" depends on unknown task "' + dep.key + '".');
        var link = { from: from, to: task, type: dep.type, lag: dep.lag * unit, lagUnits: dep.lag, index: links.length };
        links.push(link);
        from.outgoing.push(link);
        task.incoming.push(link);
      });
    });
    var order = topological(tasks);
    var eps = 1e-9 * Math.max(1, Math.abs(tasks[0].start), unit);
    function need(link, es, ef) {
      var from = link.from;
      return link.type === 'FS' ? from[ef] + link.lag : link.type === 'SS' ? from[es] + link.lag :
        link.type === 'FF' ? from[ef] + link.lag : from[es] + link.lag;
    }
    function startBased(link) { return link.type === 'FS' || link.type === 'SS'; }
    order.forEach(function (task) {
      var duration = task.end - task.start;
      var es = task.start;
      task.incoming.forEach(function (link) {
        var value = need(link, 'es', 'ef');
        es = Math.max(es, startBased(link) ? value : value - duration);
        var authored = need(link, 'start', 'end');
        link.unmet = (startBased(link) ? task.start : task.end) < authored - eps;
      });
      task.es = es;
      task.ef = es + duration;
    });
    var finish = Math.max.apply(null, tasks.map(function (task) { return task.ef; }));
    order.slice().reverse().forEach(function (task) {
      var duration = task.end - task.start;
      var lf = finish;
      task.outgoing.forEach(function (link) {
        var to = link.to;
        var limit = link.type === 'FS' ? to.ls - link.lag : link.type === 'SS' ? to.ls - link.lag + duration :
          link.type === 'FF' ? to.lf - link.lag : to.lf - link.lag + duration;
        lf = Math.min(lf, limit);
      });
      task.lf = lf;
      task.ls = lf - duration;
      task.float = task.ls - task.es;
      task.floatUnits = task.float / unit;
      task.critical = task.float <= eps;
    });
    links.forEach(function (link) {
      var to = link.to;
      var slack = (startBased(link) ? to.es : to.ef) - need(link, 'es', 'ef');
      link.critical = link.from.critical && to.critical && slack <= eps;
    });
    return links;
  }

  function topological(tasks) {
    var state = new Map();
    var order = [];
    var stack = [];
    function visit(task) {
      var mark = state.get(task);
      if (mark === 2) return;
      if (mark === 1) {
        var cycle = stack.slice(stack.indexOf(task)).concat(task).map(function (t) { return t.key; });
        throw new Error('Gantt dependencies form a cycle: ' + cycle.join(' → ') + '.');
      }
      state.set(task, 1);
      stack.push(task);
      task.incoming.forEach(function (link) { visit(link.from); });
      stack.pop();
      state.set(task, 2);
      order.push(task);
    }
    tasks.forEach(visit);
    return order;
  }

  // ---- Axis ----
  function makeScale(min, max) {
    return function (value) { return LEFT + (value - min) / (max - min) * (RIGHT - LEFT); };
  }

  function ticks(min, max, date) {
    if (!date) {
      var raw = (max - min) / 6;
      var power = Math.pow(10, Math.floor(Math.log10(raw)));
      var step = [1, 2, 5, 10].map(function (m) { return m * power; }).find(function (s) { return s >= raw; });
      var list = [];
      for (var v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
        list.push({ value: v, label: plain(Math.abs(v) < step * 1e-9 ? 0 : v) });
      }
      return list;
    }
    var days = (max - min) / DAY;
    var choices = [[1, 'day'], [2, 'day'], [7, 'week'], [14, 'week'], [1, 'month'], [2, 'month'], [3, 'month'],
      [6, 'month'], [12, 'month']];
    var choice = choices.find(function (c) {
      return days / (c[1] === 'month' ? 30.44 * c[0] : c[0]) <= 8;
    }) || choices[choices.length - 1];
    var out = [];
    var first = Math.ceil(min / DAY) * DAY;
    if (choice[1] !== 'month') {
      if (choice[1] === 'week') while (new Date(first).getUTCDay() !== 1) first += DAY;
      for (var t = first; t <= max; t += choice[0] * DAY) out.push({ value: t, label: shortDate(t) });
      return out;
    }
    var d = new Date(first);
    var year = d.getUTCFullYear();
    var month = d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0);
    month = Math.ceil(month / choice[0]) * choice[0];
    for (var at = Date.UTC(year, month, 1); at <= max; at = Date.UTC(year, month, 1)) {
      var md = new Date(at);
      out.push({ value: at, label: MONTHS[md.getUTCMonth()] + (md.getUTCMonth() === 0 ? ' ' + md.getUTCFullYear() : '') });
      month += choice[0];
    }
    return out;
  }

  // ---- Text ----
  function formatter(scene) {
    var date = scene.date;
    return {
      start: function (v) { return date ? shortDate(v, true) : plain(v); },
      end: function (v, start) { return date ? shortDate(v > start ? v - DAY : v, true) : plain(v); },
      iso: function (v) { return date ? isoDate(v) : v; },
      isoEnd: function (v, start) { return date ? isoDate(v > start ? v - DAY : v) : v; },
      amount: function (v) {
        var n = plain(v / scene.unit);
        return date ? n + (n === '1' || n === '-1' ? ' day' : ' days') : n;
      }
    };
  }

  function lagText(link, f) {
    if (!link.lag) return '';
    return (link.lag > 0 ? ' plus ' : ' minus ') + f.amount(Math.abs(link.lag));
  }

  function describe(scene, row) {
    var f = formatter(scene);
    if (row.kind === 'group') {
      return row.label + ', group of ' + row.children.length + (row.children.length === 1 ? ' task, ' : ' tasks, ') +
        f.start(row.start) + ' to ' + f.end(row.end, row.start);
    }
    var parts = [row.label];
    parts.push(row.milestone ? 'milestone on ' + f.start(row.start) :
      f.start(row.start) + ' to ' + f.end(row.end, row.start) + ', ' + f.amount(row.end - row.start));
    if (row.progress !== null) parts.push(plain(row.progress) + '% done');
    if (row.planned) {
      parts.push(row.planned[0] === row.planned[1] ? 'planned for ' + f.start(row.planned[0]) :
        'planned ' + f.start(row.planned[0]) + ' to ' + f.end(row.planned[1], row.planned[0]));
    }
    if (row.incoming.length) {
      parts.push('after ' + row.incoming.map(function (link) {
        return link.from.label + ' (' + TYPES[link.type] + lagText(link, f) + (link.unmet ? ', not met' : '') + ')';
      }).join(', '));
    }
    if (scene.links.length) parts.push(row.critical ? 'on the critical path' : f.amount(row.float) + ' of float');
    return parts.join(', ');
  }

  function unmetText(link, f) {
    return 'Gantt task "' + link.to.key + '" breaks its ' + TYPES[link.type] + lagText(link, f) +
      ' dependency on "' + link.from.key + '".';
  }

  // ---- Markup and sources ----
  function settings(host) {
    var list = function (name) {
      return (OffPrint._data(host, name, '') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    };
    return {
      asOf: OffPrint._data(host, 'as-of', null), weekends: items.flag(host, 'weekends', FEATURE),
      collapsed: list('collapsed'), layersOff: list('layers-off').join(' ').split(/\s+/).filter(Boolean),
      reveal: { critical: OffPrint._data(host, 'reveal-critical', null), planned: OffPrint._data(host, 'reveal-planned', null),
        'as-of': OffPrint._data(host, 'reveal-as-of', null) }
    };
  }

  function markup(host) {
    var list = host.querySelector(':scope > .op-gantt-tasks');
    var records = list ? Array.from(list.children, function (el) {
      var get = function (name) { return el.getAttribute('data-op-' + name); };
      return {
        key: get('key') ?? el.id, label: OffPrint._data(el, 'label', el.textContent.trim()),
        start: get('start'), end: get('end'), duration: get('duration'), group: get('group'), progress: get('progress'),
        milestone: items.flag(el, 'milestone', FEATURE), depends: get('depends'),
        plannedStart: get('planned-start'), plannedEnd: get('planned-end'), revealStep: get('reveal-step'),
        initial: items.flag(el, 'initial', FEATURE)
      };
    }) : [];
    return prepare(records, settings(host));
  }

  var FIELDS = ['key', 'label', 'start', 'end', 'duration', 'group', 'progress', 'milestone', 'depends',
    'plannedStart', 'plannedEnd', 'revealStep'];

  function sourceBinding(host) {
    if (sources.has(host)) return sources.get(host);
    var data = OffPrint._dataSource;
    if (!data) throw new Error('Enable the data feature to use a named Gantt source.');
    var binding = data.binding(FEATURE, host, data.options(FEATURE, host), function (records, mapping, input, spec, caps) {
      if (spec) {
        mapping = records && records.mapping;
        records = records && records.records;
      }
      if (!Array.isArray(records) || records.length > caps.maxRows) {
        throw new Error('Expected an array of Gantt task records within the row limit.');
      }
      var names = {};
      FIELDS.forEach(function (name) { names[name] = name; });
      Object.assign(names, mapping);
      if (FIELDS.some(function (name) { return !items.key(names[name]); })) {
        throw new Error('Gantt mapping needs nonempty field names.');
      }
      return prepare(records.map(function (record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Each Gantt task must be an object.');
        var task = {};
        FIELDS.forEach(function (name) {
          if (Object.hasOwn(record, names[name])) task[name] = record[names[name]];
        });
        if (record.planned && typeof record.planned === 'object') task.planned = record.planned;
        return task;
      }), settings(host));
    });
    sources.set(host, binding);
    return binding;
  }

  // ---- Drawing ----
  function make(tag, cls, parent, text) {
    var el = diagram.element(tag, cls, parent);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function revealAttr(el, step) {
    if (step) el.setAttribute('data-op-reveal-step', step);
    return el;
  }

  // A right-angled route from an anchor on one row to an anchor on another. out and into are travel directions:
  // +1 leaves an end or enters a start moving right, -1 the reverse.
  function route(x1, y1, out, x2, y2, into) {
    var stub = 8;
    var low = out > 0 ? x1 + stub : -Infinity;
    var high = out > 0 ? Infinity : x1 - stub;
    var low2 = into > 0 ? -Infinity : x2 + stub;
    var high2 = into > 0 ? x2 - stub : Infinity;
    var lo = Math.max(low, low2);
    var hi = Math.min(high, high2);
    if (lo <= hi && y1 !== y2) {
      var vx = out > 0 ? lo : hi;
      return [[x1, y1], [vx, y1], [vx, y2], [x2, y2]];
    }
    var ym = y1 + (y2 >= y1 ? 1 : -1) * ROW / 2;
    var xa = x1 + out * stub;
    var xc = x2 - into * stub;
    return [[x1, y1], [xa, y1], [xa, ym], [xc, ym], [xc, y2], [x2, y2]];
  }

  function pathOf(points) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + Math.round(p[0] * 10) / 10 + ' ' + p[1]; }).join('');
  }

  function arrowHead(x, y, into) {
    return 'M' + x + ' ' + y + 'L' + (x - into * 6) + ' ' + (y - 4) + 'L' + (x - into * 6) + ' ' + (y + 4) + 'Z';
  }

  function draw(host, scene, scroll, state) {
    var x = makeScale(scene.min, scene.max);
    var f = formatter(scene);
    var stage = make('div', 'op-gantt-stage');
    stage.style.width = WIDTH + 'px';
    var grid = diagram.svg('svg', { class: 'op-gantt-grid', width: WIDTH, 'aria-hidden': 'true', focusable: 'false' }, stage);
    var weekendGroup = diagram.svg('g', { class: 'op-gantt-weekends' }, grid);
    var tickGroup = diagram.svg('g', { class: 'op-gantt-ticks' }, grid);
    var dividers = diagram.svg('g', { class: 'op-gantt-dividers' }, grid);
    diagram.svg('line', { class: 'op-gantt-axis', x1: LEFT - 8, x2: WIDTH, y1: AXIS - 6, y2: AXIS - 6 }, grid);
    var tickList = ticks(scene.min, scene.max, scene.date);
    var tickLines = tickList.map(function (tick) {
      var tx = x(tick.value);
      diagram.svg('text', { x: tx, y: 18, 'text-anchor': 'middle' }, grid).textContent = tick.label;
      return diagram.svg('line', { x1: tx, x2: tx, y1: AXIS - 10 }, tickGroup);
    });
    if (scene.date) {
      var years = [new Date(scene.min).getUTCFullYear(), new Date(scene.max - 1).getUTCFullYear()];
      diagram.svg('text', { x: 12, y: 18, class: 'op-gantt-year' }, grid).textContent =
        years[0] === years[1] ? String(years[0]) : years[0] + '–' + years[1];
    }
    var weekendRects = [];
    if (scene.weekends && (x(scene.min + DAY) - x(scene.min)) >= 3) {
      for (var day = Math.floor(scene.min / DAY) * DAY; day < scene.max; day += DAY) {
        var weekday = new Date(day).getUTCDay();
        if (weekday !== 6 && weekday !== 0) continue;
        var left = Math.max(LEFT, x(day));
        var right = Math.min(RIGHT, x(day + DAY));
        if (right > left) weekendRects.push(diagram.svg('rect', { x: left, width: right - left, y: AXIS - 6 }, weekendGroup));
      }
    }

    var lines = [];
    var buttons = [];
    var toggles = [];
    scene.rows.forEach(function (row, index) {
      var line = revealAttr(make('div', 'op-gantt-line op-gantt-' + row.kind, stage), row.revealStep);
      var button = make('button', 'op-gantt-row', line);
      button.type = 'button';
      button.setAttribute('data-op-key', row.key);
      var text = describe(scene, row);
      button.setAttribute('aria-label', text);
      OffPrint.util.hint(button, text);
      var label = make('span', 'op-gantt-label', button, row.label);
      if (row.kind === 'task' && row.group) label.classList.add('is-child');
      var x1 = x(row.start);
      var x2 = x(row.end);
      if (row.kind === 'group') {
        var summary = make('span', 'op-gantt-summary', button);
        summary.style.left = x1 + 'px';
        summary.style.width = Math.max(2, x2 - x1) + 'px';
        var toggle = make('button', 'op-gantt-toggle', line);
        toggle.type = 'button';
        toggle.tabIndex = -1;
        var icon = diagram.svg('svg', { viewBox: '0 0 10 8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.25,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, toggle);
        diagram.svg('path', { d: 'M2 2.5 5 5.5 8 2.5' }, icon);
        toggle.addEventListener('click', function () {
          state.setCollapsed(row.key, !state.collapsed.has(row.key), 'user');
          button.focus({ preventScroll: true });
        });
        toggles[index] = toggle;
      } else {
        if (row.planned) {
          var planned = revealAttr(make('span', 'op-gantt-planned', button), scene.reveal.planned);
          var px1 = x(row.planned[0]);
          planned.style.left = px1 + 'px';
          planned.style.width = Math.max(2, x(row.planned[1]) - px1) + 'px';
          if (row.planned[0] === row.planned[1]) planned.classList.add('is-point');
        }
        if (row.milestone) {
          var diamond = make('span', 'op-gantt-milestone', button);
          diamond.style.left = x1 + 'px';
        } else {
          var bar = make('span', 'op-gantt-bar', button);
          bar.style.left = x1 + 'px';
          bar.style.width = Math.max(2, x2 - x1) + 'px';
          if (row.progress !== null) make('span', 'op-gantt-progress', bar).style.width = row.progress + '%';
        }
        if (scene.links.length && row.critical) {
          var crit = revealAttr(make('span', 'op-gantt-crit' + (row.milestone ? ' is-milestone' : ''), button), scene.reveal.critical);
          crit.style.left = (row.milestone ? x1 : x1 - 4) + 'px';
          if (!row.milestone) crit.style.width = Math.max(2, x2 - x1) + 8 + 'px';
        }
        if (row.incoming.some(function (link) { return link.unmet; })) line.classList.add('is-unmet');
      }
      lines.push(line);
      buttons.push(button);
    });

    var asOfLine = null;
    if (scene.asOf !== null) {
      asOfLine = revealAttr(make('div', 'op-gantt-asof', stage), scene.reveal['as-of']);
      asOfLine.style.left = x(scene.asOf) + 'px';
      asOfLine.style.top = (AXIS - 10) + 'px';
      var at = scene.date ? shortDate(scene.asOf - DAY) : plain(scene.asOf);
      make('span', 'op-gantt-asof-label', asOfLine, 'As of ' + at);
    }
    var links = diagram.svg('svg', { class: 'op-gantt-links', width: WIDTH, 'aria-hidden': 'true', focusable: 'false' }, stage);
    var list = make('ol', 'op-gantt-list', stage);
    scene.rows.forEach(function (row) {
      make('li', row.kind === 'group' ? 'is-group' : '', list, describe(scene, row));
    });
    if (scene.asOf !== null) make('li', '', list, 'Status as of ' + (scene.date ? shortDate(scene.asOf - DAY, true) : plain(scene.asOf)));
    scroll.replaceChildren(stage);

    var place = { visible: [], y: [] };
    function hiddenRow(row) {
      return row.kind === 'task' && row.group && state.collapsed.has(row.group);
    }

    function layout() {
      var top = AXIS;
      place.visible = [];
      scene.rows.forEach(function (row, index) {
        var hidden = hiddenRow(row);
        lines[index].hidden = hidden;
        lines[index].inert = hidden;
        if (!hidden) {
          place.y[index] = top;
          place.visible.push(index);
          diagram.position(lines[index], 0, top);
          top += ROW;
        } else place.y[index] = place.y[scene.groups.get(row.group).index];
        if (toggles[index]) {
          var closed = state.collapsed.has(row.key);
          buttons[index].setAttribute('aria-expanded', String(!closed));
          toggles[index].setAttribute('aria-expanded', String(!closed));
          toggles[index].setAttribute('aria-label', (closed ? 'Expand ' : 'Collapse ') + row.label);
        }
      });
      var height = top + 8;
      place.height = height;
      stage.style.height = height + 'px';
      grid.setAttribute('height', height);
      links.setAttribute('height', height);
      tickLines.forEach(function (line) { line.setAttribute('y2', height); });
      weekendRects.forEach(function (rect) { rect.setAttribute('height', height - AXIS + 6); });
      dividers.textContent = '';
      place.visible.forEach(function (index) {
        if (scene.rows[index].kind === 'group' && index !== place.visible[0]) {
          diagram.svg('line', { x1: 0, x2: WIDTH, y1: place.y[index], y2: place.y[index] }, dividers);
        }
      });
      if (asOfLine) asOfLine.style.height = (height - AXIS + 6) + 'px';
      drawLinks();
    }

    // Anchors on a hidden task move to its group's summary row.
    function anchor(task, end) {
      var hidden = hiddenRow(task);
      var y = place.y[task.index] + ROW / 2;
      var value = end ? task.end : task.start;
      var px = x(value);
      if (!hidden && task.milestone) px += end ? DIAMOND : -DIAMOND;
      return [px, y, hidden];
    }

    function drawLinks() {
      links.textContent = '';
      var base = diagram.svg('g', { class: 'op-gantt-link-base' }, links);
      var critical = revealAttr(diagram.svg('g', { class: 'op-gantt-critical-links' }, links), scene.reveal.critical);
      scene.links.forEach(function (link) {
        var fromEnd = link.type[0] === 'F';
        var toEnd = link.type[1] === 'F';
        var a = anchor(link.from, fromEnd);
        var b = anchor(link.to, toEnd);
        if (a[2] && b[2] && link.from.group === link.to.group) return;
        var into = toEnd ? -1 : 1;
        var points = route(a[0], a[1], fromEnd ? 1 : -1, b[0], b[1], into);
        [base].concat(link.critical ? [critical] : []).forEach(function (parent, layer) {
          var outer = revealAttr(diagram.svg('g', {}, parent), link.from.revealStep);
          var g = revealAttr(diagram.svg('g', { class: 'op-gantt-link' + (link.unmet && !layer ? ' is-unmet' : ''),
            'data-op-from': link.from.key, 'data-op-to': link.to.key }, outer), link.to.revealStep);
          diagram.svg('path', { d: pathOf(points), class: 'op-gantt-link-line' }, g);
          diagram.svg('path', { d: arrowHead(b[0], b[1], into), class: 'op-gantt-link-head' }, g);
        });
      });
      state.paint();
    }

    function coords(cx, cy) {
      var region = scroll.getBoundingClientRect();
      var bounds = scroll.parentElement.getBoundingClientRect();
      var rect = stage.getBoundingClientRect();
      var scaleX = rect.width / WIDTH;
      var scaleY = rect.height / place.height;
      var start = rect.left + LEFT * scaleX;
      var end = rect.left + RIGHT * scaleX;
      var plot = {
        left: Math.max(start, region.left, bounds.left), right: Math.min(end, region.right, bounds.right),
        top: Math.max(rect.top + AXIS * scaleY, region.top, bounds.top),
        bottom: Math.min(rect.top + (place.height - 8) * scaleY, region.bottom, bounds.bottom)
      };
      if (!scaleX || !scaleY || cx < plot.left || cx > plot.right || cy < plot.top || cy >= plot.bottom) return null;
      var value = scene.min + (cx - start) / (end - start) * (scene.max - scene.min);
      var slot = Math.floor(((cy - rect.top) / scaleY - AXIS) / ROW);
      var row = scene.rows[place.visible[slot]];
      return { plot: plot, label: scene.date ? 'Date' : 'Position', row: row ? row.label : '',
        value: scene.date ? shortDate(Math.floor(value / DAY) * DAY, true) : plain(value) };
    }

    return { stage: stage, lines: lines, buttons: buttons, links: links, layout: layout, place: place, coords: coords };
  }

  // ---- Setup ----
  function setup(host) {
    var binding;
    var scene;
    var view;
    var scroll = make('div', 'op-gantt-scroll');
    var toolbar = null;
    var choice = null;
    var named = host.hasAttribute('data-op-source');
    var authored = settings(host);
    var state = {
      collapsed: new Set(), off: new Set(authored.layersOff.filter(function (name) { return LAYERS.includes(name); })),
      setCollapsed: setCollapsed, paint: paint
    };
    var follower = OffPrint._revealSteps ? OffPrint._revealSteps.follow(host, function (current) {
      if (view) current.apply(view.stage);
    }) : null;
    var seeded = false;

    function available() {
      var list = [];
      if (scene.links.length) list.push('critical');
      if (scene.tasks.some(function (task) { return task.planned; })) list.push('planned');
      return list;
    }

    function paint() {
      LAYERS.forEach(function (name) { host.classList.toggle('op-gantt-hide-' + name, state.off.has(name)); });
      var selected = binding && binding.controller.snapshot();
      if (!view) return;
      Array.from(view.links.querySelectorAll ? view.links.querySelectorAll('.op-gantt-link') : []).forEach(function (g) {
        var on = !!selected && (g.getAttribute('data-op-from') === selected.key || g.getAttribute('data-op-to') === selected.key);
        g.classList.toggle('is-active', on);
      });
    }

    var trackLayers = OffPrint._readerState?.watch('gantt-layers', host, function () {
      return scene ? available().filter(function (name) { return state.off.has(name); }) : undefined;
    }, function (off) {
      if (!Array.isArray(off) || off.some(function (name) { return !available().includes(name); })) return false;
      available().forEach(function (name) { setLayer(name, !off.includes(name), 'api'); });
      return true;
    }, { order: -10 });

    var trackGroups = OffPrint._readerState?.watch('gantt-groups', host, function () {
      return scene ? Array.from(state.collapsed).sort() : undefined;
    }, function (keys) {
      if (!Array.isArray(keys) || keys.some(function (key) { return !scene.groups.has(key); })) return false;
      state.collapsed = new Set(keys);
      if (view) view.layout();
      afterLayout();
      return true;
    }, { order: -10 });

    function setLayer(name, on, origin) {
      if (!available().includes(name) || on === !state.off.has(name)) return false;
      if (on) state.off.delete(name);
      else state.off.add(name);
      paint();
      if (choice) choice.show(available().filter(function (layer) { return !state.off.has(layer); }));
      trackLayers?.(origin);
      return true;
    }

    function setCollapsed(key, closed, origin) {
      if (!scene.groups.has(key) || closed === state.collapsed.has(key)) return false;
      if (closed) state.collapsed.add(key);
      else state.collapsed.delete(key);
      view.layout();
      afterLayout();
      var selected = binding.controller.snapshot();
      var row = selected && scene.rows[selected.index];
      if (closed && row && row.kind === 'task' && row.group === key) binding.choose(scene.groups.get(key).index, origin);
      trackGroups?.(origin);
      return true;
    }

    function afterLayout() {
      if (follower && view) follower.apply(view.stage);
    }

    function snapshot(index, key) {
      var row = scene.rows[index];
      var f = formatter(scene);
      var out = { key: key, index: index, kind: row.kind, label: row.label, start: f.iso(row.start), end: f.isoEnd(row.end, row.start) };
      if (row.kind === 'group') {
        out.tasks = row.children.map(function (i) { return scene.rows[i].key; });
        return out;
      }
      return Object.assign(out, {
        group: row.group, milestone: row.milestone, progress: row.progress, float: row.floatUnits,
        critical: scene.links.length ? row.critical : false
      });
    }

    function toolbarFor() {
      var layers = available();
      if (!layers.length || !OffPrint._choices) {
        if (toolbar) toolbar.remove();
        toolbar = choice = null;
        return;
      }
      var next = make('div', 'op-gantt-layers');
      choice = OffPrint._choices.create({
        label: 'Gantt layers shown', hideLabel: true, multiple: true, display: 'chips', className: 'op-gantt-layer-chips',
        options: layers.map(function (name) {
          var swatch = make('span', 'op-gantt-key is-' + name);
          swatch.setAttribute('aria-hidden', 'true');
          return { value: name, label: LAYER_LABELS[name], swatch: swatch };
        }),
        onChange: function (value) {
          layers.forEach(function (name) { setLayer(name, value.includes(name), 'user'); });
        }
      });
      next.appendChild(choice.el);
      choice.show(layers.filter(function (name) { return !state.off.has(name); }));
      if (toolbar) toolbar.replaceWith(next);
      else host.insertBefore(next, scroll);
      toolbar = next;
    }

    function navigate(index, key) {
      var visible = view.place.visible.filter(function (i) {
        return !view.lines[i].classList.contains('op-reveal-pending');
      });
      var at = visible.indexOf(index);
      var row = scene.rows[index];
      if (key === 'Home') return visible[0];
      if (key === 'End') return visible[visible.length - 1];
      if (key === 'ArrowUp') return visible[Math.max(0, at - 1)];
      if (key === 'ArrowDown') return visible[Math.min(visible.length - 1, at + 1)];
      if (key === 'ArrowLeft') {
        if (row.kind === 'group' && !state.collapsed.has(row.key)) {
          setCollapsed(row.key, true, 'keyboard');
          return index;
        }
        return row.kind === 'task' && row.group ? scene.groups.get(row.group).index : index;
      }
      if (key === 'ArrowRight' && row.kind === 'group') {
        if (state.collapsed.has(row.key)) {
          setCollapsed(row.key, false, 'keyboard');
          return index;
        }
        return row.children[0];
      }
    }

    function warn() {
      var f = formatter(scene);
      scene.unmet.forEach(function (link) {
        OffPrint._warnOnce('gantt-unmet:' + (host.id || '') + ':' + link.from.key + ':' + link.to.key + ':' + link.type,
          unmetText(link, f), host);
      });
    }

    function render(model, initial) {
      var active = document.activeElement;
      var focused = active && scroll.contains(active) ? active.getAttribute('data-op-key') : null;
      var previous = scene;
      scene = model;
      scene.reveal = authored.reveal;
      if (!previous) state.collapsed = new Set(model.collapsed);
      else {
        state.collapsed = new Set(Array.from(model.groups.keys()).filter(function (key) {
          return previous.groups.has(key) ? state.collapsed.has(key) : model.collapsed.includes(key);
        }));
      }
      warn();
      view = draw(host, model, scroll, state);
      views.set(host, view);
      var domain = { items: view.buttons, keys: model.rows.map(function (row) { return row.key; }), initial: model.initial };
      if (!binding) {
        host.insertBefore(scroll, host.firstChild);
        host.classList.add('op-gantt-ready');
        binding = diagram.selection(FEATURE, host, domain, snapshot, null, function (current) {
          var row = scene.rows[current.index];
          if (row.kind === 'task' && row.group && state.collapsed.has(row.group)) {
            state.collapsed.delete(row.group);
            view.layout();
            afterLayout();
            trackGroups?.('api');
          }
          paint();
        });
        controllers.set(host, binding.controller);
        diagram.connectDetails(host, host.querySelector(':scope > .op-detail-pane'), binding.controller);
      }
      toolbarFor();
      view.layout();
      afterLayout();
      paint();
      domain.items.forEach(function (button, index) {
        diagram.selectOnHover(view.lines[index], index, binding);
        button.addEventListener('click', function () { binding.choose(index, 'user'); });
        button.addEventListener('focus', function () { binding.roving(index); });
        button.addEventListener('blur', function () {
          var selected = binding.controller.snapshot();
          if (selected) binding.roving(selected.index, true);
        });
        button.addEventListener('keydown', function (event) {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          var next = navigate(index, event.key);
          if (next === undefined) return;
          event.preventDefault();
          view.buttons[next].focus();
          binding.choose(next, 'keyboard');
        });
      });
      if (initial && !seeded) {
        seeded = true;
        binding.start();
        return;
      }
      var notify = binding.replace(domain);
      if (focused) {
        var nextFocus = domain.keys.indexOf(focused);
        var button = domain.items[nextFocus];
        if (!button || view.lines[nextFocus].hidden) button = domain.items[binding.controller.snapshot().index];
        button.focus({ preventScroll: true });
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
      items.issue(FEATURE, host, error.message, 'Check the Gantt task keys, dates, dependencies, and source.');
    }

    return {
      setLayer: function (name, on) { return setLayer(name, on, 'api'); },
      setCollapsed: function (key, closed) { return scene ? setCollapsed(key, closed, 'api') : false; },
      layers: function () { return scene ? available().filter(function (name) { return !state.off.has(name); }) : []; },
      collapsed: function () { return Array.from(state.collapsed); }
    };
  }

  var apis = new WeakMap();

  items.scan(FEATURE, function () {
    OffPrint._all('.op-gantt').forEach(function (host) {
      try {
        var model;
        if (host.hasAttribute('data-op-source')) model = sourceBinding(host).read();
        else {
          model = markup(host);
          models.set(host, model);
        }
        items.collect(FEATURE, host, {
          keys: model.rows.map(function (row) { return row.key; }),
          items: model.rows.map(function () { return host; }),
          initial: model.initial
        });
      } catch (_) {
        // Setup reports invalid input and leaves the authored list visible.
        items.collect(FEATURE, host, null);
      }
    });
  });

  OffPrint._gantt = {
    prepare: prepare, ticks: ticks, route: route,
    coords: function (host, x, y) { var view = views.get(host); return view ? view.coords(x, y) : null; },
    get: function (target) { return controllers.get(items.target(target)) || null; },
    view: function (target) { return apis.get(items.target(target)) || null; }
  };
  OffPrint.register(FEATURE, function () {
    OffPrint._all('.op-gantt').forEach(function (host) { apis.set(host, setup(host)); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
