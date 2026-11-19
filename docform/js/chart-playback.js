(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  var component = DocForm._component;
  var items = DocForm._items;
  var feature = 'chart-playback';
  var HOST = 'ol[data-df-chart-playback]';
  var controllers = new WeakMap();
  var controlledNotes = new WeakSet();

  function issue(host, message, correction) {
    component.issue(feature, host, message, correction);
  }

  function readStops(host, chartHosts, input, list) {
    if (!Array.isArray(input)) {
      issue(host, 'Invalid checkpoints option.', 'Supply an ordered array of checkpoint objects.');
      return null;
    }
    var keys = new Set();
    var stops = [];
    for (var i = 0; i < input.length; i++) {
      var stop = input[i];
      var key = stop && items.key(stop.key);
      if (!key || keys.has(key) || !Number.isFinite(stop.x) || (i && stop.x <= stops[i - 1].x) ||
        (stop.label !== undefined && (typeof stop.label !== 'string' || !stop.label.trim()))) {
        issue(host, 'Invalid checkpoint ' + (key ? '"' + key + '"' : 'at position ' + (i + 1)) + '.',
          'Use a unique nonempty key, strictly increasing finite x values, and a nonempty label if supplied.');
        return null;
      }
      var detail = null;
      if (stop.detailId !== undefined) {
        detail = typeof stop.detailId === 'string' && component.target(stop.detailId, feature);
        var playbackList = detail && detail.closest(HOST);
        if (!detail || !contains(document.body, detail) || contains(detail, host) ||
          chartHosts.some(function (chartHost) { return contains(chartHost, detail); }) ||
          (playbackList && playbackList !== host) || detail.querySelector(HOST) ||
          (detail.namespaceURI && detail.namespaceURI !== 'http://www.w3.org/1999/xhtml') ||
          detail.tagName === 'SCRIPT' || detail.tagName === 'TEMPLATE') {
          issue(host, 'Invalid detail reference "' + stop.detailId + '" for checkpoint "' + key + '".',
            'Use the unique plain ID of an HTML note that does not wrap the chart or playback controls.');
          return null;
        }
      }
      keys.add(key);
      stops.push({ key: key, x: stop.x, label: stop.label && stop.label.trim(), index: i,
        item: list[i], detail: detail });
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
    return note.querySelector('.df-chart-playback-note, .df-chart-playback-ready') !== null;
  }

  function readInstance(host, options, report) {
    function option(name, fallback, valid) {
      return component.option(feature, host, name, fallback, valid, options);
    }
    var targetId = DocForm.data(host, 'target', null);
    var groupOption = DocForm.data(host, 'x-group', null);
    if (targetId === null && groupOption === null) {
      targetId = option('target', null, function () { return true; });
      groupOption = option('xGroup', null, function () { return true; });
    }
    var xGroup = items.key(groupOption);
    var chartHosts;
    if (groupOption !== null) {
      if (!xGroup || targetId !== null) {
        if (report) issue(host, 'Invalid playback x-group target.',
          'Supply one nonempty x-group name in data-df-x-group or xGroup, or supply a chart target.');
        return null;
      }
      chartHosts = DocForm.chart._positionHosts(xGroup, !report);
      if (!chartHosts.length) {
        if (report) issue(host, 'Cannot resolve chart x-group "' + xGroup + '".',
          'Mount charts with this data-df-x-group before mounting playback.');
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
    var list = DocForm.all(':scope > li', host);
    var input = list.length ? list.map(function (item) {
      var title = item.querySelector(':scope > [data-df-step-label]');
      return { key: DocForm.data(item, 'key'), x: component.number(item, 'x', feature, NaN, Number.isFinite),
        label: title ? title.textContent : undefined, detailId: DocForm.data(item, 'detail') };
    }) : option('checkpoints', [], function () { return true; });
    var stops = readStops(host, chartHosts, input, list);
    return stops && { chartHosts: chartHosts, targetId: targetId, xGroup: xGroup, stops: stops, option: option };
  }

  function reportTarget(host, targetId) {
    issue(host, 'Cannot resolve chart target "' + targetId + '".',
      'Set data-df-target or the target option to the unique plain ID of a mounted chart.');
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
      model.series.some(function (series) { return series.points.length; }) && DocForm.chart.domain(model);
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
    if (controllers.has(host)) return controllers.get(host);

    var instance = readInstance(host, options, true);
    if (!instance) return null;
    var chartHost = instance.chartHosts[0];
    var models = instance.chartHosts.map(function (target) {
      var chart = DocForm.chart.get(target);
      return chart && chart.model();
    });
    if (!models[0] && !instance.xGroup) {
      reportTarget(host, instance.targetId);
      return null;
    }
    var stops = instance.stops;
    var model = models[0];
    var range = playableRange(host, models, stops, true);
    if (!range) return null;
    var positive = function (value) { return Number.isFinite(value) && value > 0; };
    var duration = component.number(host, 'duration', feature, instance.option('duration', 800, positive), positive);
    var group = DocForm._selection && DocForm._selection.ensure(DocForm.data(host, 'selection-group'));
    var mode = group ? items.mode(host, feature) : 'both';

    var controls = document.createElement('div');
    controls.className = 'df-chart-playback-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Chart playback');
    var status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-atomic', 'true');
    var buttons = {};
    var x = range[0];
    var state = 'paused';
    var lastReached = null;
    var leg = null;
    var frame = null;
    var announced = null;
    var beforeReconcile = null;
    var motion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    var events = component.signal(feature, host, snapshot);
    var api = {
      snapshot: snapshot, subscribe: events.subscribe,
      next: transport(next), prev: transport(previous), pause: transport(pause), reset: transport(reset, 'reset'),
      select: function (key) {
        key = items.key(key);
        var stop = stops.find(function (item) { return item.key === key; });
        return !!stop && !!range && component.transaction(function () {
          return range ? jump(stop.x, 'api') : false;
        });
      }
    };

    function stopAt(value) {
      return stops.find(function (stop) { return stop.x === value; });
    }

    function snapshot() {
      var stop = stopAt(x);
      return Object.freeze({ x: x, key: stop ? stop.key : null, index: stop ? stop.index : null,
        total: stops.length, state: state });
    }

    function labelAt(value) {
      var stop = stopAt(value);
      return (stop && stop.label) || (value === range[0] ? 'Start' : value === range[1] ? 'End' :
        DocForm.chart.format(value, model.x));
    }

    function checkpoint() {
      return !leg && stopAt(x) || null;
    }

    function renderControls() {
      var disabled = {
        Previous: !range || (x === range[0] && state !== 'playing'),
        Next: !range || state !== 'paused',
        Pause: state !== 'playing',
        Reset: !range || (x === range[0] && state === 'paused' && !leg)
      };
      Object.keys(buttons).forEach(function (label) {
        buttons[label].setAttribute('aria-disabled', String(disabled[label]));
      });
      var message = !range ? 'Playback unavailable.' : state === 'playing' ? 'Playing to ' + labelAt(leg.to) :
        leg ? 'Paused at ' + DocForm.chart.format(x, model.x) : labelAt(x);
      var active = checkpoint();
      if (status.textContent !== message || active !== announced) status.textContent = message;
      announced = active;
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

    function publish(previous, origin) {
      var current = snapshot();
      if (!previous || current.x !== previous.x || current.state !== previous.state) events.emit(current, previous, origin);
    }

    function transport(run, origin) {
      return function () {
        if (!range) return false;
        return component.transaction(function () { return range ? run(origin || 'api') : false; });
      };
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
      var before = snapshot();
      cancel();
      restAt(to);
      paint(x, origin);
      renderControls();
      return function () { publish(before, origin); };
    }

    function jump(to, origin) {
      var notify = arrive(to, origin);
      var active = checkpoint();
      if (active && group && mode !== 'follow') group.commit(active.key, origin, notify);
      else notify();
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
      x = position;
      paint(x, origin);
      frame = root.requestAnimationFrame(function (now) { tick(now, activeLeg, origin); });
    }

    function next(origin) {
      if (state !== 'paused') return true;
      var stop = stops.find(function (item) { return item.x > x; });
      var to = leg ? leg.to : stop ? stop.x : range[1];
      if ((motion && motion.matches) || to <= x) return jump(to, origin);
      var before = snapshot();
      leg = leg || { from: x, to: to, progress: 0 };
      leg.started = root.performance.now() - leg.progress * duration;
      var activeLeg = leg;
      state = 'playing';
      frame = root.requestAnimationFrame(function (time) { tick(time, activeLeg, origin); });
      paint(x, origin);
      renderControls();
      publish(before, origin);
      return true;
    }

    function previous(origin) {
      var to = range[0];
      for (var i = stops.length - 1; i >= 0; i--) {
        if (stops[i].x < x) { to = stops[i].x; break; }
      }
      return jump(to, origin);
    }

    function pause(origin) {
      if (state !== 'playing') return true;
      var before = snapshot();
      cancel();
      state = 'paused';
      renderControls();
      publish(before, origin);
      return true;
    }

    function reset(origin) { return jump(range[0], origin); }

    function reconcile(models, origin, referenceChanged) {
      var nextRange = playableRange(host, models, stops, true);
      if (!referenceChanged && Boolean(range) === Boolean(nextRange)) return { x: x };
      var before = beforeReconcile || snapshot();
      cancel();
      model = models[0];
      range = nextRange;
      var reached = stops.find(function (stop) { return stop.key === lastReached; });
      var remembered = lastReached;
      restAt(range ? (reached ? reached.x : range[0]) : null);
      if (!range) lastReached = remembered;
      renderControls();
      if (beforeReconcile) return { x: x };
      beforeReconcile = before;
      return { x: x, notify: function () {
        component.transaction(function () {
          beforeReconcile = null;
          publish(before, origin || 'api');
        });
      } };
    }

    var paint = DocForm.chart._playback(chartHost, instance.xGroup, reconcile, checkpoint);
    if (!paint) {
      issue(host, 'A target chart already has a playback controller.', 'Use one playback controller per chart or x-group.');
      return null;
    }
    var controlIds = instance.chartHosts.concat(host).map(function (target) { return target.id; }).filter(Boolean);
    [['Previous', previous], ['Next', next], ['Pause', pause], ['Reset', reset]].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[0];
      if (controlIds.length) button.setAttribute('aria-controls', controlIds.join(' '));
      button.addEventListener('click', function () {
        if (button.getAttribute('aria-disabled') === 'false') transport(entry[1], 'user')();
      });
      controls.appendChild(button);
      buttons[entry[0]] = button;
    });
    controls.appendChild(status);
    host.before(controls);
    stops.forEach(function (stop) {
      if (stop.item) controlledNotes.add(stop.item);
      if (stop.detail) {
        controlledNotes.add(stop.detail);
        stop.detail.classList.add('df-chart-playback-note');
      }
    });
    if (stops.some(function (stop) { return stop.item; })) host.classList.add('df-chart-playback-ready');
    var shared = group && mode !== 'publish' && stops.find(function (stop) { return stop.key === group.api.get(); });
    if (group && mode !== 'publish') {
      group.follow(function (key) {
        var stop = stops.find(function (item) { return item.key === key; });
        return range && stop ? arrive(stop.x, 'group') : null;
      });
    }
    restAt(shared ? shared.x : x);
    renderControls();
    controllers.set(host, api);
    paint(x);
    component.notify(function () { publish(null, 'init'); });
    return api;
  }

  DocForm.chartPlayback = {
    mount: mount,
    get: function (target) { return controllers.get(component.target(target, feature)) || null; }
  };

  items.scan(feature, function () {
    DocForm.all(HOST).forEach(function (host) {
      var name = DocForm.data(host, 'selection-group');
      if (!DocForm._selection.ensure(name) || controllers.has(host)) return;
      if (DocForm._boot && !DocForm._boot.setupComplete) return;
      var instance = readInstance(host);
      if (!instance) return;
      var models = instance.chartHosts.map(DocForm.chart._selectionModel);
      var range = playableRange(host, models, instance.stops);
      if (!range) return;
      var initial = instance.stops[0];
      var seed = initial && initial.x === range[0] && items.mode(host, feature) !== 'follow' &&
        items.flag(host, 'selection-seed', feature);
      DocForm._selection.collect(name, instance.stops.map(function (stop) { return stop.key; }),
        seed ? [[initial.item || host, initial.key]] : []);
    });
  });
  DocForm.register(feature, function () {
    DocForm.all(HOST).forEach(function (host) { mount(host); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
