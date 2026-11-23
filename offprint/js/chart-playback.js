(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  var component = OffPrint._component;
  var items = OffPrint._items;
  var sequence = OffPrint._sequence;
  var feature = 'chart-playback';
  var HOST = 'ol[data-op-chart-playback]';
  var controlledNotes = new WeakSet();
  var STATE_FIELDS = ['key', 'label', 'detail', 'initial', 'series', 'select', 'range', 'params'];

  function issue(host, message, correction) {
    component.issue(feature, host, message, correction);
  }

  // A state checkpoint names only what it changes; null series means all series and null select clears.
  function readState(stop) {
    var has = function (name) { return stop[name] !== undefined; };
    if (Object.keys(stop).some(function (name) { return has(name) && !STATE_FIELDS.includes(name); })) return null;
    var state = {};
    if (has('series')) {
      var series = stop.series === null ? null : [].concat(stop.series);
      if (series && series.some(function (key, i) { return typeof key !== 'string' || !key || series.indexOf(key) !== i; })) {
        return null;
      }
      state.series = series;
    }
    if (has('select')) {
      if (stop.select !== null && !items.key(stop.select)) return null;
      state.select = stop.select === null ? null : items.key(stop.select);
    }
    if (has('range')) {
      if (stop.range !== null && !(Array.isArray(stop.range) && stop.range.length === 2)) return null;
      state.range = stop.range && stop.range.slice();
    }
    if (has('params')) {
      var params = stop.params;
      if (!params || typeof params !== 'object' || Array.isArray(params) || !Object.keys(params).length) return null;
      state.params = Object.assign({}, params);
    }
    return state;
  }

  function readStops(host, chartHosts, input, list, stateMode) {
    if (!Array.isArray(input)) {
      issue(host, 'Invalid checkpoints option.', 'Supply an ordered array of checkpoint objects.');
      return null;
    }
    var keys = new Set();
    var stops = [];
    for (var i = 0; i < input.length; i++) {
      var stop = input[i];
      var key = stop && items.key(stop.key);
      var state = stateMode && key ? readState(stop) : null;
      if (!key || keys.has(key) || (stateMode ? !state : !Number.isFinite(stop.x) || (i && stop.x <= stops[i - 1].x)) ||
        (stop.label !== undefined && (typeof stop.label !== 'string' || !stop.label.trim())) ||
        (stop.initial !== undefined && typeof stop.initial !== 'boolean')) {
        issue(host, 'Invalid checkpoint ' + (key ? '"' + key + '"' : 'at position ' + (i + 1)) + '.', stateMode ?
          'Use a unique nonempty key, a nonempty label if supplied, and only series, select, range, and params state.' :
          'Use a unique nonempty key, strictly increasing finite x values, and a nonempty label if supplied.');
        return null;
      }
      var detail = null;
      if (stop.detail !== undefined) {
        detail = typeof stop.detail === 'string' && component.target(stop.detail, feature);
        var playbackList = detail && detail.closest(HOST);
        if (!detail || !contains(document.body, detail) || contains(detail, host) ||
          chartHosts.some(function (chartHost) { return contains(chartHost, detail); }) ||
          (playbackList && playbackList !== host) || detail.querySelector(HOST) ||
          (detail.namespaceURI && detail.namespaceURI !== 'http://www.w3.org/1999/xhtml') ||
          detail.tagName === 'SCRIPT' || detail.tagName === 'TEMPLATE') {
          issue(host, 'Invalid detail reference "' + stop.detail + '" for checkpoint "' + key + '".',
            'Use the unique plain ID of an HTML note that does not wrap the chart or playback controls.');
          return null;
        }
      }
      keys.add(key);
      // State checkpoints sit at positions 1..n after the start at 0, so the playhead transport walks them in order.
      stops.push({ key: key, x: stateMode ? i + 1 : stop.x, label: stop.label && stop.label.trim(), index: i,
        item: list[i], detail: detail, state: state, initial: stop.initial === true });
    }
    var bound = new Map();
    for (var checkpoint of stops) {
      for (var note of [checkpoint.item, checkpoint.detail]) {
        if (!note) continue;
        if (bound.has(note) || overlapsControlledNote(note) ||
          chartHosts.some(function (chartHost) { return contains(note, chartHost); })) {
          return noteConflict(host, checkpoint);
        }
        bound.set(note, checkpoint);
      }
    }
    for (var [element, owner] of bound) {
      for (var ancestor = element.parentNode; ancestor; ancestor = ancestor.parentNode) {
        if (bound.has(ancestor) && bound.get(ancestor) !== owner) return noteConflict(host, owner);
      }
    }
    return stops;
  }

  function noteConflict(host, checkpoint) {
    issue(host, 'Conflicting note for checkpoint "' + checkpoint.key + '".',
      'Give each checkpoint its own note without wrapping the chart or another checkpoint.');
    return null;
  }

  function contains(parent, node) {
    for (; node; node = node.parentNode) if (node === parent) return true;
    return false;
  }

  function overlapsControlledNote(note) {
    for (var node = note; node; node = node.parentNode) {
      if (controlledNotes.has(node)) return true;
    }
    return note.querySelector('.op-chart-playback-note, .op-chart-playback-ready') !== null;
  }

  function readInstance(host, options, report) {
    function option(name, fallback, valid) {
      return component.option(feature, host, name, fallback, valid, options);
    }
    var mode = OffPrint._data(host, 'chart-playback', '') ||
      option('mode', 'playhead', function (value) { return value === 'playhead' || value === 'state'; });
    if (mode !== 'playhead' && mode !== 'state') {
      if (report) issue(host, 'Unknown playback mode "' + mode + '".',
        'Use data-op-chart-playback="state" for state checkpoints, or leave it empty for the line playhead.');
      return null;
    }
    var stateMode = mode === 'state';
    var targetId = OffPrint._data(host, 'target', null);
    var groupOption = OffPrint._data(host, 'x-group', null);
    if (targetId === null && groupOption === null) {
      targetId = option('target', null, function () { return true; });
      groupOption = option('xGroup', null, function () { return true; });
    }
    var xGroup = items.key(groupOption);
    var chartHosts;
    if (stateMode && groupOption !== null) {
      if (report) issue(host, 'State playback cannot target an x-group.', 'Target one chart by plain ID.');
      return null;
    }
    if (groupOption !== null) {
      if (!xGroup || targetId !== null) {
        if (report) issue(host, 'Invalid playback x-group target.',
          'Supply one nonempty x-group name in data-op-x-group or xGroup, or supply a chart target.');
        return null;
      }
      chartHosts = OffPrint._chart._positionHosts(xGroup, !report);
      if (!chartHosts.length) {
        if (report) issue(host, 'Cannot resolve chart x-group "' + xGroup + '".',
          'Mount charts with this data-op-x-group before mounting playback.');
        return null;
      }
    } else {
      var chartHost = typeof targetId === 'string' && component.target(targetId, feature);
      chartHosts = chartHost && chartHost !== host ? [chartHost] : [];
    }
    if (!chartHosts.length) {
      if (report) reportTarget(host, targetId);
      return null;
    }
    var list = OffPrint._all(':scope > li', host);
    var input = list.length ? list.map(function (item) {
      var stop = { key: OffPrint._data(item, 'key'), label: sequence.label(item) || undefined,
        detail: OffPrint._data(item, 'detail'), initial: items.flag(item, 'initial', feature) };
      if (!stateMode) return Object.assign(stop, { x: component.number(item, 'x', feature, NaN, Number.isFinite) });
      return Object.assign(markupState(item), stop);
    }) : option('checkpoints', [], function () { return true; });
    var stops = readStops(host, chartHosts, input, list, stateMode);
    return stops && { chartHosts: chartHosts, targetId: targetId, xGroup: xGroup, stops: stops, option: option,
      state: stateMode };
  }

  // data-op-state holds the checkpoint's JSON state; a stray data-op-x or unreadable JSON makes the stop invalid.
  function markupState(item) {
    var raw = OffPrint._data(item, 'state');
    var state = {};
    if (raw !== undefined) {
      try { state = JSON.parse(raw); } catch (error) { state = null; }
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) return { invalid: true };
    return Object.assign({}, state, { x: OffPrint._data(item, 'x') });
  }

  function stateModel(model) {
    return !!model && !model.errors.length && model.type !== 'line';
  }

  function stateRange(host, model, stops, report) {
    if (stateModel(model) && stops.length) return [0, stops.length];
    if (report) issue(host, stops.length ? 'State checkpoints need a non-line chart.' : 'State playback has no checkpoints.',
      'Target a mounted bar, pie, scatter, histogram, heatmap, or interval chart and supply at least one checkpoint.');
    return null;
  }

  // Validates what checkpoints change against the mounted chart and returns the parameter scope and selection group.
  function prepareState(host, model, stops, playbackGroup) {
    var paramKeys = [];
    var select = false;
    stops.forEach(function (stop) {
      if (Object.hasOwn(stop.state, 'select')) select = true;
      Object.keys(stop.state.params || {}).forEach(function (key) {
        if (!paramKeys.includes(key)) paramKeys.push(key);
      });
    });
    var scope = null;
    if (paramKeys.length) {
      if (!OffPrint._parameterScope) {
        issue(host, 'Checkpoint parameter values need the parameters feature.', 'Enable parameters or remove params.');
        return null;
      }
      scope = OffPrint._parameterScope(host);
      if (!scope) return null;
      var unknown = paramKeys.find(function (key) { return scope.get(key) === undefined; });
      if (unknown) {
        issue(host, 'Unknown checkpoint parameter "' + unknown + '".',
          'Use parameters of the scope the playback list resolves to, set with data-op-scope or data-op-parameter-scope.');
        return null;
      }
    }
    var group = null;
    if (select) {
      group = model.selectionGroup && OffPrint._selection && OffPrint._selection.ensure(model.selectionGroup);
      if (!group || group === playbackGroup) {
        issue(host, 'Checkpoints that select keys need the chart\'s own selection group.',
          'Give the chart a selection group other than the playback list\'s data-op-selection-group.');
        return null;
      }
    }
    for (var stop of stops) {
      try { OffPrint._chart._checkView(model, stop.state); }
      catch (error) {
        issue(host, 'Checkpoint "' + stop.key + '" does not fit the chart. ' + error.message,
          'Use the chart\'s series keys and a range within a continuous x axis.');
        return null;
      }
    }
    return { scope: scope, group: group, paramKeys: paramKeys };
  }

  // Each resolved state carries earlier changes forward from the start state captured at mount.
  function resolveStates(stops, start) {
    var current = start;
    return [start].concat(stops.map(function (stop) {
      var next = Object.assign({}, current, stop.state);
      if (stop.state.params) next.params = Object.assign({}, current.params, stop.state.params);
      current = next;
      return next;
    }));
  }

  function reportTarget(host, targetId) {
    issue(host, 'Cannot resolve chart target "' + targetId + '".',
      'Set data-op-target or the target option to the unique plain ID of a mounted chart.');
  }

  function revealModel(model) {
    return model && !model.errors.length && model.type === 'line' && !model.categories && !model.x.time && !model.x.log;
  }

  function playableRange(host, models, stops, report) {
    if (models.slice(1).some(function (model) { return !revealModel(model); })) {
      if (report) issue(host, 'The playback x-group has an incompatible chart.',
        'Use continuous linear-x line charts with the same x units for group playback.');
      return null;
    }
    var model = models[0];
    var range = revealModel(model) &&
      model.series.some(function (series) { return series.points.length; }) && OffPrint._chart.domain(model);
    if (!range || !Number.isFinite(range[1] - range[0])) {
      if (report) issue(host, 'The target has no playable numeric line range.',
        'Use a mounted line chart with a continuous linear x axis, observations, and distinct bounds.');
      return null;
    }
    var off = stops.find(function (stop) { return stop.x < range[0] || stop.x > range[1]; });
    if (off) {
      if (report) issue(host, 'Checkpoint "' + off.key + '" at x = ' + off.x + ' is outside the chart range.',
        'Place each checkpoint within the full chart domain.');
      return null;
    }
    return range;
  }

  function mount(target, options) {
    var host = component.target(target, feature, true);
    if (!host) return null;
    var mounted = OffPrint.sequence.get(host);
    if (mounted) return Object.hasOwn(mounted, 'position') ? mounted : null;

    var instance = readInstance(host, options, true);
    if (!instance) return null;
    var chartHost = instance.chartHosts[0];
    var models = instance.chartHosts.map(function (target) {
      var chart = OffPrint._chart.get(target);
      return chart && chart.model();
    });
    if (!models[0] && !instance.xGroup) {
      reportTarget(host, instance.targetId);
      return null;
    }
    var stops = instance.stops;
    var keys = stops.map(function (stop) { return stop.key; });
    var model = models[0];
    var range = instance.state ? stateRange(host, model, stops, true) : playableRange(host, models, stops, true);
    if (!range) return null;
    var positive = function (value) { return Number.isFinite(value) && value > 0; };
    var duration = component.number(host, 'duration', feature, instance.option('duration', 800, positive), positive);
    var binding = sequence.binding(feature, host);
    var setup = instance.state && prepareState(host, model, stops, binding.group);
    if (instance.state && !setup) return null;
    var resolved = null;
    var applied = 0;

    var controlIds = instance.chartHosts.concat(host).map(function (target) { return target.id; }).filter(Boolean);
    var x = range[0];
    var state = 'paused';
    var lastReached = null;
    var leg = null;
    var frame = null;
    var beforeReconcile = false;
    var motion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    var initialStop = stops.find(function (stop) { return stop.initial; });
    function initial() { return initialStop ? initialStop.x : range[0]; }
    var entry;
    var pill;

    function stopWithKey(key) {
      return stops.find(function (stop) { return stop.key === key; });
    }

    function follow(key, origin) {
      // The saved selection can still point at the last checkpoint while the playhead is between stops.
      if (OffPrint._readerState?.restoring('sequence', host)) return null;
      var stop = stopWithKey(key);
      return range && stop ? arrive(stop.x, origin) : null;
    }

    function stopAt(value) {
      return stops.find(function (stop) { return stop.x === value; });
    }

    function labelAt(value) {
      var stop = stopAt(value);
      if (instance.state) return stop ? stop.label || 'Checkpoint ' + (stop.index + 1) : 'Start';
      return (stop && stop.label) || (value === range[0] ? 'Start' : value === range[1] ? 'End' :
        OffPrint._chart.format(value, model.x));
    }

    // Applies the state of the position being reached once, as the leg starts, so the chart tweens during the leg.
    function applyState(origin) {
      var position = leg ? leg.to : x;
      if (position === null || position === applied) return;
      applied = position;
      var target = resolved[position];
      component.transaction(function () {
        if (target.params && !setup.scope.update(target.params)) {
          issue(host, 'The parameter scope rejected the values for "' + labelAt(position) + '".',
            'Use values each parameter and its bound views accept.');
        }
        try { handle.apply(target, origin || 'api'); } catch (error) {
          // A state that no longer fits the data keeps the reader view.
        }
        if (Object.hasOwn(target, 'select')) setup.group.commit(target.select, origin || 'api');
        return true;
      });
    }

    function checkpoint() {
      return !leg && stopAt(x) || null;
    }

    function renderControls() {
      pill.update();
      var active = checkpoint();
      stops.forEach(function (stop) {
        var current = stop === active;
        if (stop.item) {
          stop.item.hidden = !!range && !current;
          if (current) stop.item.setAttribute('aria-current', 'step');
          else stop.item.removeAttribute('aria-current');
        }
        if (stop.detail) stop.detail.hidden = !!range && !current;
      });
    }

    function transport(run) {
      return function (origin, key) { return range ? run(origin, key) : false; };
    }

    function changed(origin) {
      var notify = entry.stage(origin);
      if (notify) notify();
    }

    function cancel() {
      if (frame !== null) root.cancelAnimationFrame(frame);
      frame = null;
    }

    function restAt(value) {
      leg = null;
      x = value;
      state = range && x === range[1] ? 'ended' : 'paused';
      var stop = stopAt(x);
      if (stop || state !== 'ended') lastReached = stop ? stop.key : null;
    }

    function arrive(to, origin) {
      cancel();
      restAt(to);
      paint(x, origin);
      renderControls();
      return entry.stage(origin);
    }

    function jump(to, origin) {
      var notify = arrive(to, origin);
      var active = checkpoint();
      binding.publish(active ? active.key : null, origin, notify);
      return true;
    }

    function tick(time, activeLeg, origin) {
      if (leg !== activeLeg || state !== 'playing') return;
      frame = null;
      var elapsed = Math.max(0, time - leg.started);
      var progress = Math.min(1, Math.max(leg.progress, elapsed / duration));
      var position = leg.from + (leg.to - leg.from) * progress;
      if (progress === 1 || position >= leg.to || (motion && motion.matches)) {
        component.transaction(function () {
          if (leg === activeLeg && state === 'playing') jump(leg.to, origin);
        });
        return;
      }
      leg.progress = progress;
      if (!instance.state) {
        x = position;
        paint(x, origin);
      }
      frame = root.requestAnimationFrame(function (now) { tick(now, activeLeg, origin); });
    }

    function play(origin) {
      if (state !== 'paused') return state === 'playing';
      var stop = stops.find(function (item) { return item.x > x; });
      var to = leg ? leg.to : stop ? stop.x : range[1];
      if ((motion && motion.matches) || to <= x) return jump(to, origin);
      leg = leg || { from: x, to: to, progress: 0 };
      // A state leg shows its target from the start, so a replacement mid-leg restores the target.
      if (instance.state) lastReached = stopAt(leg.to).key;
      leg.started = root.performance.now() - leg.progress * duration;
      var activeLeg = leg;
      state = 'playing';
      frame = root.requestAnimationFrame(function (time) { tick(time, activeLeg, origin); });
      paint(x, origin);
      renderControls();
      changed(origin);
      return true;
    }

    // Next skips the animation: it finishes a running leg or jumps to the following stop.
    function next(origin) {
      if (state === 'ended') return false;
      var stop = stops.find(function (item) { return item.x > x; });
      return jump(leg ? leg.to : stop ? stop.x : range[1], origin);
    }

    function previous(origin) {
      if (x === range[0] && !leg) return false;
      var to = range[0];
      var at = instance.state && leg ? leg.to : x;
      for (var i = stops.length - 1; i >= 0; i--) {
        if (stops[i].x < at) { to = stops[i].x; break; }
      }
      return jump(to, origin);
    }

    // A state leg has no in-between chart, so pausing arrives at its target.
    function pause(origin) {
      if (state !== 'playing') return true;
      if (instance.state) return jump(leg.to, origin);
      cancel();
      state = 'paused';
      renderControls();
      changed(origin);
      return true;
    }

    function reset(origin) { return jump(initial(), origin); }

    function current() {
      return { x: x, state: resolved && range ? resolved[applied] : null };
    }

    // A state replacement restores the applied state, and a running state leg keeps going because its target is
    // already shown; only a change in compatibility suspends or resumes state playback.
    function reconcile(models, origin, referenceChanged) {
      var nextRange = instance.state ? stateRange(host, models[0], stops, true) : playableRange(host, models, stops, true);
      if ((instance.state || !referenceChanged) && Boolean(range) === Boolean(nextRange)) return current();
      cancel();
      model = models[0];
      range = nextRange;
      var reached = stops.find(function (stop) { return stop.key === lastReached; });
      var remembered = lastReached;
      restAt(range ? (reached ? reached.x : initial()) : null);
      if (!range) lastReached = remembered;
      if (x !== null) applied = x;
      renderControls();
      if (beforeReconcile) return current();
      beforeReconcile = true;
      return Object.assign(current(), { notify: function () {
        component.transaction(function () {
          beforeReconcile = false;
          changed(origin || 'api');
        });
      } });
    }

    var handle = instance.state && OffPrint._chart._statePlayback(chartHost, reconcile);
    var paint = instance.state ? handle && function (value, origin) { applyState(origin); } :
      OffPrint._chart._playback(chartHost, instance.xGroup, reconcile, checkpoint);
    if (!paint) {
      issue(host, 'A target chart already has a playback controller.', 'Use one playback controller per chart or x-group.');
      return null;
    }
    if (instance.state) {
      var view = handle.view();
      var start = {};
      if (stops.some(function (stop) { return Object.hasOwn(stop.state, 'series'); })) start.series = view.series;
      if (stops.some(function (stop) { return Object.hasOwn(stop.state, 'range'); })) start.range = view.range;
      if (setup.group) start.select = setup.group.api.get();
      if (setup.scope) {
        start.params = {};
        setup.paramKeys.forEach(function (key) { start.params[key] = setup.scope.get(key); });
      }
      resolved = resolveStates(stops, start);
    }
    entry = sequence.define(host, {
      keys: function () { return keys; },
      read: function () {
        var stop = checkpoint();
        return { index: stop ? stop.index : null, playing: state === 'playing',
          canPrev: !!range && (x > range[0] || state === 'playing'),
          canNext: !!range && state !== 'ended' };
      },
      play: transport(play), pause: transport(pause), next: transport(next), prev: transport(previous),
      reset: transport(reset),
      select: transport(function (origin, key) { return jump(stopWithKey(key).x, origin); }),
      apply: follow,
      exportView: {
        snapshot: function () { return instance.state && leg ? leg.to : x; },
        apply: function (value) {
          if (value === null) return !range;
          if (!range || !Number.isFinite(value) || value < range[0] || value > range[1] ||
              (instance.state && !Number.isInteger(value))) return false;
          return component.transaction(function () {
            var notify = arrive(value, 'api');
            if (notify) notify();
            return true;
          });
        },
        order: instance.state ? -30 : 5, current: function () { return true; },
        revision: function () {
          var revisions = instance.chartHosts.map(OffPrint._chart._authoredRevision);
          return revisions.some(Boolean) ? JSON.stringify(revisions) : null;
        }
      }
    });
    var api = entry.controller;
    Object.defineProperty(api, 'position', { get: function () { return x; } });
    pill = sequence.pill(entry, {
      className: 'op-chart-playback-controls', label: 'Chart playback', controls: controlIds.join(' '),
      playAt: 3, prevLabel: 'Previous checkpoint', nextLabel: 'Next checkpoint', playLabel: 'Play to the next checkpoint',
      canReset: function () { return !!range && (x !== initial() || state === 'playing' || !!leg); },
      status: function () {
        if (!range) return 'Playback unavailable.';
        if (state === 'playing') return 'Playing to ' + labelAt(leg.to);
        return leg ? 'Paused at ' + OffPrint._chart.format(x, model.x) : labelAt(x);
      }
    });

    host.before(pill.element);
    stops.forEach(function (stop) {
      if (stop.item) controlledNotes.add(stop.item);
      if (stop.detail) {
        controlledNotes.add(stop.detail);
        stop.detail.classList.add('op-chart-playback-note');
      }
    });
    if (stops.some(function (stop) { return stop.item; })) host.classList.add('op-chart-playback-ready');
    binding.follow(follow);
    var shared = stopWithKey(binding.initial());
    restAt(shared ? shared.x : initial());
    renderControls();
    paint(x, 'init');
    sequence.start(entry.stage('init'));
    return api;
  }

  OffPrint._chartPlayback = { mount: mount };

  items.scan(feature, function () {
    OffPrint._all(HOST).forEach(function (host) {
      var name = OffPrint._data(host, 'selection-group');
      if (!OffPrint._selection.ensure(name) || OffPrint.sequence.get(host)) return;
      if (OffPrint._boot && !OffPrint._boot.setupComplete) return;
      var instance = readInstance(host);
      if (!instance) return;
      var models = instance.chartHosts.map(OffPrint._chart._selectionModel);
      var range = instance.state ? stateRange(host, models[0], instance.stops) :
        playableRange(host, models, instance.stops);
      if (!range) return;
      var initial = instance.stops.find(function (stop) { return stop.initial; }) ||
        instance.stops.find(function (stop) { return stop.x === range[0]; });
      var seed = initial && items.mode(host, feature) !== 'follow' && items.flag(host, 'selection-seed', feature);
      OffPrint._selection.collect(name, instance.stops.map(function (stop) { return stop.key; }),
        seed ? [[initial.item || host, initial.key]] : []);
    });
  });
  OffPrint.register(feature, function () {
    OffPrint._all(HOST).forEach(function (host) { mount(host); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
