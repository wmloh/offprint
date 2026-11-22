(function (root) {
  'use strict';

  var boot = root.DocForm && root.DocForm._boot;
  if (root.DocForm && (!boot || boot.initialize)) {
    if (typeof console !== 'undefined') console.warn('[docform] core.js was loaded more than once; ignoring the repeat.');
    return;
  }

  var COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  var NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
  var SHAPES = ['circle', 'triangle', 'star', 'square', 'heart', 'spades', 'diamond', 'clubs'];
  var GLOSSARY_SHAPE = 'circle';
  var hasOwn = Object.prototype.hasOwnProperty;
  var modules = [];
  var warned = {};
  var started = false;
  var transactions = [];
  var committing = false;
  var preparingData = false;
  var selectionScans = [];
  var initialItems = null;

  var shortcuts = new Map();
  var shortcutListener = false;
  var modifiers = ['Control', 'Alt', 'Shift', 'Meta'];
  var modifierNames = { ctrl: 'Control', control: 'Control', alt: 'Alt', shift: 'Shift', cmd: 'Meta', meta: 'Meta' };
  var editable = 'input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]';

  function keyName(key) {
    if (key === ' ' || key.toLowerCase() === 'space') return 'Space';
    if (/^\S$/u.test(key)) return key.toUpperCase();
    if (!/^[a-z][a-z0-9]*$/i.test(key)) return null;
    return key.toLowerCase().replace(/^(arrow|page|caps|num|scroll|context|audio)([a-z])|^./, function (text, start, next) {
      return text[0].toUpperCase() + (start ? start.slice(1) + next.toUpperCase() : '');
    });
  }

  function shortcutKey(binding) {
    if (typeof binding !== 'string') return null;
    var parts = (binding === ' ' ? binding : binding.trim()).split(/\+(?=.)/);
    var name = parts.pop();
    var key = keyName(name);
    if (!key) return null;
    var flags = parts.map(function (part) {
      return modifierNames[part.toLowerCase()];
    });
    if (flags.some(function (flag) { return !modifiers.includes(flag); }) || new Set(flags).size !== flags.length) return null;
    return modifiers.filter(function (flag) { return flags.includes(flag); }).concat(key).join('+');
  }

  function editableTarget(target) {
    if (!target || typeof target.closest !== 'function') return !!(target && target.isContentEditable);
    var region = target.closest('[contenteditable]');
    return target.isContentEditable || !!target.closest(editable) ||
      (typeof target.isContentEditable !== 'boolean' && region && region.getAttribute('contenteditable') !== 'false');
  }

  function shortcutIssue(code, target, message, input) {
    if (boot) boot.report(code, 'shortcuts', target, message, 'Check options.shortcuts and shortcut registrations.', input);
    else warnOnce(code + ':' + input, message, target || undefined);
  }

  function shortcutConflict(scope, key, first, second) {
    shortcutIssue('shortcut-conflict', scope, 'Shortcut "' + key + '" is assigned to "' + first +
      '" and "' + second + '" in the same scope. The first binding wins.', [key, first, second]);
  }

  function registerShortcut(spec) {
    var scope = spec.scope === undefined ? 'global' : spec.scope;
    var id = spec.id;
    if (typeof id !== 'string' || !id || typeof spec.run !== 'function' ||
        (scope !== 'global' && typeof scope !== 'function' && !(scope && typeof scope.contains === 'function'))) {
      throw new TypeError('A shortcut needs an ID, a callback, and a valid scope.');
    }
    if (shortcuts.has(id)) throw new Error('Shortcut ID "' + id + '" is already registered.');
    var options = DocForm._site && DocForm._site.options && DocForm._site.options.shortcuts;
    var override = options && hasOwn.call(options, id) ? options[id] : undefined;
    if (override !== undefined && override !== null && !shortcutKey(override)) {
      shortcutIssue('shortcut-key', 'options.shortcuts', 'Invalid key for shortcut "' + id + '". Using its default.', id);
      override = undefined;
    }
    var keys = override === null ? [] : [].concat(override === undefined ? spec.key : override).map(shortcutKey);
    if (keys.includes(null)) throw new TypeError('Invalid default key for shortcut "' + id + '".');
    keys = Array.from(new Set(keys)).filter(function (key) {
      for (var entry of shortcuts.values()) {
        if (entry.scope !== scope || !entry.keys.includes(key)) continue;
        shortcutConflict(scope, key, entry.id, id);
        return false;
      }
      return true;
    });
    var entry = Object.assign({}, spec, { scope: scope, keys: keys });
    shortcuts.set(id, entry);
    if (!shortcutListener && root.document) {
      root.document.addEventListener('keydown', dispatchShortcut, true);
      shortcutListener = true;
    }
    return function () { if (shortcuts.get(id) === entry) shortcuts.delete(id); };
  }

  function dispatchShortcut(event) {
    if (event.defaultPrevented || event.isComposing || typeof event.key !== 'string' ||
        event.key === 'Dead' || event.key === 'Process' || event.key === 'Unidentified' ||
        event.getModifierState && event.getModifierState('AltGraph')) return;
    var prefix = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta']
      .filter(Boolean);
    var key = shortcutKey(prefix.concat(event.key === ' ' ? 'Space' : event.key).join('+'));
    var shifted = prefix.length === 1 && event.shiftKey && /^\S$/u.test(event.key) ? keyName(event.key) : null;
    var path = event.composedPath ? event.composedPath() : [];
    var target = path[0] || event.target;
    var inField = editableTarget(target);
    var modal = target && target.closest && target.closest('dialog:modal');
    // Open popovers own Escape, including native light dismissal.
    if (key === 'Escape' && target && target.closest && target.closest(':popover-open, .df-filter-menu')) return;
    var candidates = new Map();
    shortcuts.forEach(function (entry) {
      var exact = entry.keys.includes(key);
      if (!exact && (!shifted || !entry.keys.includes(shifted) || entry.exactShift)) return;
      if (inField && !(entry.editable === true && (key === 'Escape' || prefix.some(function (flag) { return flag !== 'Shift'; })))) return;
      var scope = typeof entry.scope === 'function' ? entry.scope(event, target) : entry.scope;
      if (!scope || modal && (scope === 'global' || !modal.contains(scope))) return;
      var focused = scope !== 'global' && (path.includes(scope) || !!target && scope.contains(target));
      if (!focused && scope !== 'global' && typeof entry.scope !== 'function' && !(entry.active && entry.active())) return;
      if (entry.when && !entry.when(event, target)) return;
      var first = candidates.get(scope);
      if (!first || exact && !first.exact) {
        candidates.set(scope, { entry: entry, scope: scope, focused: focused, exact: exact });
      } else if (exact === first.exact) {
        shortcutConflict(scope, exact ? key : shifted, first.entry.id, entry.id);
      }
    });
    var scoped = Array.from(candidates.values()).filter(function (candidate) { return candidate.scope !== 'global'; });
    var innermost = scoped.filter(function (candidate) {
      return !scoped.some(function (other) {
        return other !== candidate && candidate.scope.contains(other.scope);
      });
    });
    var winner = innermost.find(function (candidate) { return candidate.focused; }) ||
      innermost[0] || candidates.get('global');
    if (!winner) return;
    event.preventDefault();
    event.stopPropagation();
    winner.entry.run(event, target);
  }

  function shortcutKeys(id) {
    var entry = shortcuts.get(id);
    return entry ? entry.keys.slice() : [];
  }

  function shortcutHint(el, id, label, visible) {
    var keys = shortcutKeys(id);
    if (keys.length) el.setAttribute('aria-keyshortcuts', keys.join(' '));
    else el.removeAttribute('aria-keyshortcuts');
    if (!label) return;
    var text = label + (keys.length ? ' (' + keys.join(' / ') + ')' : '');
    if (visible !== false) hint(el, text);
    return text;
  }

  var hints = new WeakMap();
  var hintCard = null;
  var hintOwner = null;

  // Hover and focus hint in the tooltip panel, a native title only without tooltips. All hints share one card,
  // filled as it shows, so controls rebuilt on every open leave nothing behind. Empty text clears the hint.
  function hint(el, text) {
    var tips = root.DocForm._tooltips;
    if (!tips) {
      if (text) el.title = text;
      else el.removeAttribute('title');
      return;
    }
    el.removeAttribute('title');
    if (!hints.has(el)) {
      if (!hintCard) hintCard = tips.card('', '', '', { className: 'df-tooltip-hint' });
      tips.attach(el, '', '', {
        card: hintCard, describe: false, focusable: false,
        enabled: function () {
          if (!hints.get(el)) return false;
          hintOwner = el;
          hintCard.body.textContent = hints.get(el);
          return true;
        }
      });
    }
    hints.set(el, text);
    if (hintOwner === el) hintCard.body.textContent = text;
  }

  function transaction(fn) {
    if (preparingData) throw new Error('Data transforms cannot change controller state.');
    transactions.push(DocForm._readerState?.preserveOrigin(fn) || fn);
    if (committing) return true;
    committing = true;
    try {
      var result = transactions.shift()();
      while (transactions.length) transactions.shift()();
      return result;
    } finally {
      transactions.length = 0;
      committing = false;
    }
  }

  function issue(feature, host, message, correction) {
    if (boot) boot.report('component-input', feature, host, message, correction, message);
    else warnOnce(feature + ':' + (host && host.id) + ':' + message, message, host || undefined);
  }

  function notifyNow(fn) {
    if (committing) fn();
    else transaction(fn);
  }

  function signal(feature, host, snapshot, options) {
    options = options || {};
    var callbacks = new Set();
    function notify(fn, current, meta) {
      try { fn(current, meta); }
      catch (error) { issue(feature, host, 'Subscriber failed: ' + String(error), 'Check the subscriber callback.'); }
    }
    return {
      subscribe: function (fn, options) {
        if (typeof fn !== 'function') return function () {};
        var listener = { fn: fn };
        callbacks.add(listener);
        if (options && options.immediate && snapshot() !== null) {
          notifyNow(function () { notify(fn, snapshot(), Object.freeze({ previous: null, origin: 'init' })); });
        }
        return function () { callbacks.delete(listener); };
      },
      emit: function (current, previous, origin, group) {
        var meta = Object.freeze({ previous: previous, origin: origin });
        Array.from(callbacks).forEach(function (listener) {
          if (callbacks.has(listener)) notify(listener.fn, current, meta);
        });
        if (typeof root.CustomEvent !== 'function' || typeof document === 'undefined') return;
        var detail = Object.assign({ current: current }, meta);
        if (options.eventState) {
          detail.current = options.eventState(current);
          detail.previous = previous === null ? null : options.eventState(previous);
        }
        if (group !== undefined) detail[options.identity || 'group'] = group;
        (host || document).dispatchEvent(new root.CustomEvent('df:' + feature + ':' + (options.action || 'change'), {
          bubbles: Boolean(host), detail: Object.freeze(detail)
        }));
      }
    };
  }

  function selectionKey(value) {
    return typeof value === 'string' && value.trim() || null;
  }

  function dataIssue(feature, target, message) {
    if (boot) boot.report('data-input', feature, target, message, 'Check the source, mapping, and view limits.', message);
    else warnOnce(feature + ':' + message, message, target);
  }

  function transformData(fn) {
    var previous = preparingData;
    preparingData = true;
    try { return fn(); } finally { preparingData = previous; }
  }

  function immutable(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(immutable);
      Object.freeze(value);
    }
    return value;
  }

  function destination(api, update, reset) {
    var sequence = 0;
    var owner = null;
    var error = null;
    function mutate(input, origin, zone, ticket, clear) {
      return transaction(function () {
        if (ticket !== undefined && ticket !== sequence) return false;
        if (zone && clear && owner !== zone) return true;
        error = null;
        var committed;
        try { committed = clear ? reset() : update(input, origin); }
        catch (failure) { error = failure; return false; }
        sequence++;
        var previousOwner = owner;
        owner = zone && !clear ? zone : null;
        if (previousOwner && previousOwner !== owner) DocForm._readerState?.removeImport(previousOwner);
        if (committed) committed(origin);
        return true;
      });
    }
    api.update = function (input) { return mutate(input, 'api'); };
    api.reset = function () { return mutate(null, 'reset', null, undefined, true); };
    dataDestinations.set(api, {
      reserve: function () { return ++sequence; },
      current: function (ticket) { return sequence === ticket; },
      owns: function (zone) { return owner === zone; },
      update: function (input, zone, ticket) { return mutate(input, 'drop', zone, ticket); },
      reset: function (zone, ticket) { return mutate(null, 'reset', zone, ticket, true); },
      error: function () { return error; }
    });
  }

  var dataDestinations = new WeakMap();

  function viewController(feature, host, adapter, action) {
    var base = null;
    var local = false;
    var refilterLocal = null;
    var state = null;
    var api = { snapshot: function () { return state; } };
    var events = signal(feature, host, api.snapshot, { action: action });
    api.subscribe = events.subscribe;

    function notify(next, origin, force) {
      var previous = state;
      state = immutable(next);
      if (next === null || (!force && JSON.stringify(state) === JSON.stringify(previous))) return;
      var current = state;
      return function () { events.emit(current, previous, origin); };
    }

    function afterRender(after, origin) {
      var emission = notify(adapter.snapshot(), origin, adapter.alwaysNotify);
      if (typeof after !== 'function') return emission;
      return function () {
        after();
        if (emission) emission();
      };
    }

    function render(prepared, origin) {
      return afterRender(adapter.render(prepared, origin), origin);
    }

    destination(api, function (input, origin) {
      var prepared;
      try { prepared = adapter.prepare(input); }
      catch (error) { dataIssue(feature, host, error.message); throw error; }
      var after = adapter.render(prepared, origin);
      local = true;
      refilterLocal = prepared && prepared.refilter;
      return function (origin) {
        var emission = afterRender(after, origin);
        if (emission) emission();
      };
    }, function () {
      if (!local && !adapter.resetReader) return;
      local = false;
      refilterLocal = null;
      return render(base, 'reset');
    });

    return {
      api: api,
      baseline: function () { return base; },
      change: function (origin) {
        var emission = notify(adapter.snapshot(), origin);
        if (emission) notifyNow(emission);
      },
      stage: function (prepared, origin) {
        base = prepared;
        if (!local) return render(prepared, origin);
      },
      prepareFilter: function (prepared, values) {
        var nextLocal = refilterLocal ? refilterLocal(values) : null;
        return function () {
          base = prepared;
          if (!local) return render(prepared, 'group');
          if (nextLocal) return render(nextLocal, 'group');
        };
      },
      start: function (prepared) {
        var emission = this.stage(prepared, 'init');
        if (emission) {
          if (initialItems) initialItems.push(emission);
          else notifyNow(emission);
        }
      }
    };
  }

  function attributeFlag(el, name, feature, fallback) {
    var value = data(el, name, null);
    if (value === null) return fallback === true;
    if (value === 'false') return false;
    if (value === '' || value === 'true') return true;
    issue(feature, el, 'Invalid data-df-' + name + ' value.', 'Use an empty attribute, true, or false.');
    return fallback === true;
  }

  function closestFlag(el, name, feature) {
    if (!boot) return el.closest('[data-df-' + name + ']');
    for (var node = el; node; node = node.parentElement) {
      if (node.hasAttribute('data-df-' + name) && attributeFlag(node, name, feature)) return node;
    }
    return null;
  }

  function attributeNumber(el, name, feature, fallback, valid) {
    var value = data(el, name, null);
    if (value === null) return fallback;
    var parsed = Number(value);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) &&
      Number.isFinite(parsed) && valid(parsed)) return parsed;
    issue(feature, el, 'Invalid data-df-' + name + ' value.', 'Use a finite number within the supported range.');
    return fallback;
  }

  function option(feature, host, name, fallback, valid, programmatic) {
    var layers = boot ? boot.optionLayers(feature, host && host.id) : [];
    return layers.concat(programmatic || {}).reduce(function (value, layer) {
      if (!isObject(layer) || !hasOwn.call(layer, name)) return value;
      if (valid(layer[name])) return layer[name];
      issue(feature, host, 'Invalid ' + feature + ' option "' + name + '".', 'Check the supported values for ' + name + '.');
      return value;
    }, fallback);
  }

  function elementTarget(target, feature, report, doc) {
    doc = doc || root.document;
    if (target && target.nodeType === 1) return target;
    if (typeof target === 'string' && target && doc) {
      var element = doc.getElementById(target);
      if (element && (!doc.querySelectorAll || all('[id]', doc).filter(function (el) {
        return el.id === target;
      }).length < 2)) return element;
    }
    if (report) issue(feature, null, 'Cannot resolve a unique element for "' + String(target) + '".',
      'Pass a unique plain ID or an Element.');
    return null;
  }

  function selectionMode(host, feature) {
    var mode = data(host, 'selection-mode', 'both');
    if (mode === 'both' || mode === 'publish' || mode === 'follow') return mode;
    issue(feature, host, 'Invalid selection mode.', 'Use both, publish, or follow.');
    return 'both';
  }

  function itemDomain(feature, host, items) {
    var keys = items.map(function (el) { return selectionKey(data(el, 'key', null)); });
    if (!keys.length || keys.includes(null) || new Set(keys).size !== keys.length) {
      issue(feature, host, 'Each item needs a unique nonempty key.', 'Set a distinct data-df-key on every item.');
      return null;
    }
    var initial = items.findIndex(function (el) { return attributeFlag(el, 'initial', feature); });
    return { keys: keys, initial: Math.max(0, initial), items: items };
  }

  function collectItems(feature, host, domain, groupAttribute) {
    var name = data(host, groupAttribute || 'selection-group', null);
    if (!domain) {
      DocForm._selection.ensure(name);
      return;
    }
    DocForm._selection.collect(name, domain.keys,
      selectionMode(host, feature) !== 'follow' && attributeFlag(host, 'selection-seed', feature)
        ? [[domain.items[domain.initial], domain.keys[domain.initial]]] : []);
  }

  function itemController(feature, host, domain, snapshotAt, render, groupAttribute) {
    var keys = domain.keys;
    var selection = DocForm._selection;
    var group = selection && selection.ensure(data(host, groupAttribute || 'selection-group', null));
    var mode = group ? selectionMode(host, feature) : 'both';
    var state = null;
    var events = signal(feature, host, function () { return state; });
    var track = DocForm._readerState?.watch(feature, host, function () { return state?.key; }, select, { reassert: true });

    function apply(index, origin, refresh) {
      if (index < 0 || index >= keys.length || (!refresh && state && state.index === index)) return null;
      var previous = state;
      state = Object.freeze(snapshotAt(index, keys[index]));
      var current = state;
      var notify = render(current, previous, origin);
      return function () {
        if (typeof notify === 'function') notify();
        events.emit(current, previous, origin);
        track?.(origin);
      };
    }

    function choose(index, origin) {
      if (index < 0 || index >= keys.length) return false;
      var before = keys;
      var key = keys[index];
      return transaction(function () {
        if (keys !== before) index = keys.indexOf(key);
        if (index < 0) return false;
        var notify = apply(index, origin);
        if (group && mode !== 'follow') group.commit(key, origin, notify);
        else if (notify) notify();
        track?.(origin);
        return true;
      });
    }

    function select(key, origin) {
      return choose(keys.indexOf(selectionKey(key)), origin || 'api');
    }

    if (group && mode !== 'publish') {
      group.follow(function (key) { return apply(keys.indexOf(key), 'group'); });
    }
    return {
      controller: {
        select: function (key) { return select(key); },
        reset: function () { return choose(domain.initial, 'reset'); },
        snapshot: function () { return state; },
        subscribe: events.subscribe
      },
      choose: choose,
      replace: function (next) {
        domain = next;
        keys = next.keys;
        var index = state ? keys.indexOf(state.key) : -1;
        if (index < 0 && group && mode !== 'publish') index = keys.indexOf(group.api.get());
        return apply(index < 0 ? domain.initial : index, 'source', true);
      },
      start: function () {
        var shared = group && mode !== 'publish' ? keys.indexOf(group.api.get()) : -1;
        var notify = apply(shared < 0 ? domain.initial : shared, 'init');
        if (initialItems) initialItems.push(notify);
        else if (notify) transaction(notify);
      }
    };
  }

  var sequences = new WeakMap();

  function sequenceGet(target) {
    var entry = sequences.get(elementTarget(target));
    return entry && (!entry.available || entry.available()) ? entry.controller : null;
  }

  function sequenceLabel(item, fallback) {
    var label = item.querySelector(':scope > [data-df-step-label]');
    return (label || fallback || {}).textContent?.trim() || '';
  }

  function sequenceDetail(item) {
    return elementTarget(data(item, 'detail'));
  }

  function showStepDetails(details, index) {
    var active = details[index];
    details.forEach(function (detail) { if (detail) detail.hidden = detail !== active; });
  }

  function sequenceBinding(feature, host) {
    var group = DocForm._selection && DocForm._selection.ensure(data(host, 'selection-group'));
    var mode = group ? selectionMode(host, feature) : 'both';
    return {
      group: group,
      initial: function () { return group && mode !== 'publish' ? group.api.get() : null; },
      follow: function (apply) {
        if (group && mode !== 'publish') group.follow(function (key) { return apply(key, 'group'); });
      },
      publish: function (key, origin, notify) {
        if (group && key !== null && mode !== 'follow' && origin !== 'group') group.commit(key, origin, notify);
        else if (notify) notify();
      }
    };
  }

  function defineSequence(host, impl) {
    var state = null;
    var callbacks = new Set();
    var controller = {
      get key() { return controller.snapshot().key; },
      get index() { return controller.snapshot().index; },
      get keys() { return Object.freeze(impl.keys().slice()); },
      snapshot: function () {
        var current = impl.read();
        var index = current.index;
        var keys = impl.keys();
        var count = keys.length;
        var result = { key: index === null ? null : keys[index], index: index, count: count,
          canPrev: current.canPrev ?? (index !== null && index > 0),
          canNext: current.canNext ?? (index !== null && index < count - 1) };
        if (impl.play) result.playing = Boolean(current.playing);
        return Object.freeze(result);
      },
      select: function (key) { return run('select', 'api', key); },
      next: function () { return run('next', 'api'); },
      prev: function () { return run('prev', 'api'); },
      reset: function () { return run('reset', 'reset'); },
      subscribe: function (fn, options) {
        if (typeof fn !== 'function') return function () {};
        var listener = { fn: fn };
        callbacks.add(listener);
        if (options && options.immediate) notifyNow(function () {
          call(listener, controller.snapshot(), null, 'init');
        });
        return function () { callbacks.delete(listener); };
      }
    };

    function call(listener, current, previous, origin) {
      try { listener.fn(current, Object.freeze({ previous: previous, origin: origin })); }
      catch (error) { issue('sequence', host, 'Subscriber failed: ' + String(error), 'Check the subscriber callback.'); }
    }

    function run(action, origin, key) {
      if (action === 'select') {
        key = selectionKey(key);
        if (!controller.keys.includes(key)) return false;
      }
      return transaction(function () { return impl[action](origin, key); });
    }

    function stage(origin) {
      var previous = state;
      var current = state = controller.snapshot();
      if (entry.updateControls) entry.updateControls(current);
      var changed = !previous || previous.key !== current.key || previous.index !== current.index;
      track?.(origin);
      if (origin === 'hover') origin = 'user';
      if (!changed && Object.keys(current).every(function (key) { return previous[key] === current[key]; })) return null;
      return function () {
        Array.from(callbacks).forEach(function (listener) {
          if (callbacks.has(listener)) call(listener, current, previous, origin);
        });
        if (changed && typeof root.CustomEvent === 'function') {
          host.dispatchEvent(new root.CustomEvent('df:step', {
            bubbles: true, detail: Object.freeze({ key: current.key, index: current.index, origin: origin })
          }));
        }
      };
    }

    if (impl.play) {
      controller.play = function () { return run('play', 'api'); };
      controller.pause = function () { return run('pause', 'api'); };
    }
    var entry = { controller: controller, run: run, stage: stage, apply: impl.apply, available: impl.available };
    sequences.set(host, entry);
    var track = impl.exportView ? DocForm._readerState?.watch('sequence', host,
      impl.exportView.snapshot, impl.exportView.apply, impl.exportView) :
      DocForm._readerState?.keyed('sequence', host, controller);
    return entry;
  }

  function startSequence(notify) {
    if (!notify) return;
    if (initialItems) initialItems.push(notify);
    else notifyNow(notify);
  }

  function indexedSequence(feature, host, domain, render, options) {
    options = options || {};
    var binding = sequenceBinding(feature, host);
    var index = null;
    function apply(key, origin, force) {
      var next = domain.keys.indexOf(key);
      if (next < 0 || (index === next && !force)) return null;
      var previous = index;
      index = next;
      var after = render(index, previous, origin);
      var notify = entry.stage(origin);
      return function () {
        if (typeof after === 'function') after();
        if (notify) notify();
      };
    }

    function choose(origin, key) {
      if (!domain.keys.includes(key)) return false;
      if (options.stop) options.stop(origin);
      binding.publish(key, origin, apply(key, origin) || entry.stage(origin));
      return true;
    }

    var entry = defineSequence(host, Object.assign({
      keys: function () { return domain.keys; },
      available: function () { return domain.keys.length > 0; },
      read: function () { return { index: index, playing: options.playing && options.playing() }; },
      select: choose,
      next: function (origin) { return choose(origin, domain.keys[index + 1]); },
      prev: function (origin) { return choose(origin, domain.keys[index - 1]); },
      reset: function (origin) { return choose(origin, domain.keys[domain.initial]); },
      apply: apply
    }, options.transport));
    binding.follow(apply);
    entry.choose = function (i, origin) { return entry.run('select', origin, domain.keys[i]); };
    entry.replace = function (key, origin) {
      var shared = binding.initial();
      var selected = domain.keys.includes(key) ? key : domain.keys.includes(shared) && origin !== 'reset'
        ? shared : domain.keys[domain.initial];
      if (domain.keys.length) return apply(selected, origin, true);
      index = null;
      return entry.stage(origin);
    };
    entry.start = function () {
      var shared = binding.initial();
      startSequence(apply(domain.keys.includes(shared) ? shared : domain.keys[domain.initial], 'init'));
    };
    return entry;
  }

  function sequencePill(entry, options) {
    function action(name, method, label) {
      return { name: name, label: label, run: function () { entry.run(method, 'user'); } };
    }
    var parts = [
      action('reset', 'reset', options.resetLabel || 'Reset'),
      action('previous', 'prev', options.prevLabel || 'Previous step'), 'count',
      action('next', 'next', options.nextLabel || 'Next step')
    ].filter(function (part) { return !options.omit || !options.omit.includes(part.name); });
    var timed = typeof entry.controller.play === 'function';
    if (timed) parts.splice(options.playAt ?? parts.length, 0, {
      name: 'play', label: options.playLabel || 'Play',
      run: function () {
        var playing = entry.controller.snapshot().playing;
        if (playing && options.onPause) options.onPause();
        entry.run(playing ? 'pause' : 'play', 'user');
      }
    });
    var controls = pill(options.className, options.label, parts, options.controls);
    function update(state) {
      var disabled = {
        reset: options.canReset ? !options.canReset(state) : state.index === (options.initial ? options.initial() : 0),
        previous: !state.canPrev, next: !state.canNext,
        play: !state.playing && (options.canPlay ? !options.canPlay(state) : !state.canNext)
      };
      Object.keys(controls.buttons).forEach(function (name) {
        controls.buttons[name].setAttribute('aria-disabled', String(disabled[name]));
      });
      if (timed) pillIcon(controls.buttons.play, state.playing ? 'pause' : 'play',
        state.playing ? 'Pause' : options.playLabel || 'Play');
      var label = options.status ? options.status(state) : 'Step ' + (state.index + 1) + ' of ' + state.count;
      if (controls.count.textContent !== label) controls.count.textContent = label;
    }
    controls.update = function () { update(entry.controller.snapshot()); };
    entry.updateControls = update;
    controls.destroy = function () {
      if (entry.updateControls === update) entry.updateControls = null;
    };
    return controls;
  }

  function warnOnce(key, message, detail) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console === 'undefined') return;
    if (detail === undefined) console.warn('[docform] ' + message);
    else console.warn('[docform] ' + message, detail);
  }

  function data(el, key, fallback) {
    var value = el.getAttribute('data-df-' + key);
    return value === null ? fallback : value;
  }

  function flag(el, key) {
    var value = el.getAttribute('data-df-' + key);
    return value !== null && value !== 'false';
  }

  function num(el, key, fallback) {
    var value = parseFloat(el.getAttribute('data-df-' + key));
    return isFinite(value) ? value : fallback;
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function plainObject(value, name) {
    if (value == null) return {};
    if (!isObject(value)) {
      warnOnce('object:' + name, 'Manifest "' + name + '" must be an object; ignoring it.');
      return {};
    }
    var copy = {};
    Object.keys(value).forEach(function (key) { copy[key] = value[key]; });
    return copy;
  }

  function resolvePath(path, base) {
    try {
      return new URL(path, base).href;
    } catch (e) {
      warnOnce('path:' + path, 'Cannot resolve page path "' + path + '" against "' + base + '".');
      return null;
    }
  }

  function normalizePages(list, base, order, where) {
    if (list == null) return [];
    if (!Array.isArray(list)) {
      warnOnce('pages:' + where, 'Manifest "' + where + '" must be an array; ignoring it.');
      return [];
    }
    var out = [];
    list.forEach(function (item, i) {
      var at = where + '[' + i + ']';
      if (typeof item === 'string') item = { path: item };
      if (!isObject(item) || (typeof item.path !== 'string' && item.pages == null)) {
        warnOnce('page:' + at, 'Manifest entry "' + at + '" needs a path or pages; ignoring it.');
        return;
      }
      var path = typeof item.path === 'string' ? item.path : null;
      var node = {
        title: String(item.title || path || 'Untitled'),
        path: path,
        href: path === null ? null : resolvePath(path, base),
        collapsed: !!item.collapsed,
        pages: []
      };
      if (node.href) order.push(node);
      node.pages = normalizePages(item.pages, base, order, at + '.pages');
      out.push(node);
    });
    return out;
  }

  function color(name) {
    var key = String(name).trim().toLowerCase();
    if (COLORS.indexOf(key) >= 0) return key;
    warnOnce('color:' + key, 'Unknown colour "' + name + '"; use one of ' + COLORS.join(', ') + '.');
    return null;
  }

  function normalizeRoles(value) {
    var source = plainObject(value, 'roles');
    var roles = {};
    Object.keys(source).forEach(function (name) {
      var key = name.trim().toLowerCase();
      if (!NAME_RE.test(key)) {
        warnOnce('role-name:' + name, 'Ignoring role "' + name + '": use letters, digits, hyphens, or underscores.');
        return;
      }
      var mapped = color(source[name]);
      if (mapped) roles[key] = mapped;
      else warnOnce('role-color:' + key, 'Ignoring role "' + key + '" because its colour is unknown.');
    });
    return roles;
  }

  // Role tips: the hover text that tags and legend entries of a role show unless they carry their own.
  function normalizeRoleTips(value, roles) {
    var source = plainObject(value, 'roles.tips');
    var tips = {};
    Object.keys(source).forEach(function (name) {
      var key = name.trim().toLowerCase();
      var text = typeof source[name] === 'string' ? source[name].trim() : '';
      if (!hasOwn.call(roles, key)) warnOnce('role-tip:' + key, 'Ignoring the tip for unknown role "' + key + '".');
      else if (!text) warnOnce('role-tip-text:' + key, 'Ignoring role "' + key + '" tip: use nonempty text.');
      else tips[key] = text;
    });
    return tips;
  }

  // options.tags: { glossary: { label: tip | { tip, color | role } }, classes: { name: { shape, label, tags } } }.
  // Glossary tags classify tooltip terms and alone use the circle; each other class owns one other shape, and a tag
  // label belongs to at most one class. `labels` maps each label's term key to its class, or "glossary".
  function normalizeTags(value, roles) {
    var source = plainObject(value, 'tags');
    var out = { glossary: {}, classes: {}, labels: {} };
    function claim(label, owner) {
      var key = termKey(label);
      if (!key) return null;
      if (hasOwn.call(out.labels, key)) {
        warnOnce('tag-label:' + key, 'Tag "' + String(label).trim() + '" is listed in both "' + out.labels[key] + '" and "' +
          owner + '"; keeping "' + out.labels[key] + '".');
        return null;
      }
      out.labels[key] = owner;
      return key;
    }
    var glossary = plainObject(source.glossary, 'tags.glossary');
    Object.keys(glossary).forEach(function (label) {
      var item = typeof glossary[label] === 'string' ? { tip: glossary[label] } : glossary[label];
      var tip = isObject(item) && typeof item.tip === 'string' ? item.tip.trim() : '';
      if (!tip) {
        warnOnce('tag-glossary:' + label, 'Glossary tag "' + label + '" needs a nonempty tip; ignoring it.');
        return;
      }
      var key = claim(label, 'glossary');
      if (!key) return;
      var role = typeof item.role === 'string' ? item.role.trim().toLowerCase() : null;
      if (role && !hasOwn.call(roles, role)) {
        warnOnce('tag-role:' + label, 'Glossary tag "' + label + '" names unknown role "' + role + '"; ignoring the role.');
        role = null;
      }
      out.glossary[key] = { label: label.trim(), tip: tip, color: item.color == null ? null : color(item.color), role: role };
    });
    var owners = {};
    var classes = plainObject(source.classes, 'tags.classes');
    Object.keys(classes).forEach(function (name) {
      var key = name.trim().toLowerCase();
      var item = classes[name];
      var shape = isObject(item) && typeof item.shape === 'string' ? item.shape.trim().toLowerCase() : '';
      var problem = !NAME_RE.test(key) ? 'use letters, digits, hyphens, or underscores in its name' :
        key === 'glossary' ? '"glossary" is reserved for glossary tags' :
        shape === GLOSSARY_SHAPE ? 'the circle is reserved for glossary tags' :
        SHAPES.indexOf(shape) < 0 ? 'its shape must be one of ' + SHAPES.slice(1).join(', ') :
        hasOwn.call(owners, shape) ? 'class "' + owners[shape] + '" already uses the ' + shape : '';
      if (problem) {
        warnOnce('tag-class:' + name, 'Ignoring tag class "' + name + '": ' + problem + '.');
        return;
      }
      if (item.tags != null && !Array.isArray(item.tags)) {
        warnOnce('tag-class-tags:' + key, 'Tag class "' + key + '" tags must be an array of labels; ignoring them.');
      }
      owners[shape] = key;
      var tags = [];
      (Array.isArray(item.tags) ? item.tags : []).forEach(function (label) {
        var tag = typeof label === 'string' ? claim(label, key) : null;
        if (tag) tags.push(tag);
      });
      out.classes[key] = {
        shape: shape,
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : key.replace(/[-_]+/g, ' '),
        tags: tags
      };
    });
    return out;
  }

  // A manifest tags array or data-df-tip-tags text (comma-separated) as distinct term keys.
  function tagKeys(value) {
    var list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    var out = [];
    list.forEach(function (item) {
      var key = typeof item === 'string' ? termKey(item) : '';
      if (key && out.indexOf(key) < 0) out.push(key);
    });
    return out;
  }

  // Only tips in running text are glossary entries. Tips on tags, legend entries, and controls explain that element.
  var NOT_GLOSSARY = '.df-tag, .df-legend-item, .df-tooltip, a[href], button, input, select, textarea, label, summary, ' +
    'svg, [role="button"], [role="tab"], .df-controls, .df-sidebar';
  function glossaryTip(el) {
    return el.hasAttribute('data-df-tip') && !el.closest(NOT_GLOSSARY);
  }

  // glossaryPage: a path or { path, title } listed last in the page tree, unless the tree already has that page.
  function addGlossaryPage(value, pages, base, order) {
    if (value == null) return null;
    var item = typeof value === 'string' ? { path: value } : value;
    if (!isObject(item) || typeof item.path !== 'string' || !item.path) {
      warnOnce('glossary-page', 'Manifest "glossaryPage" must be a path or { path, title }; ignoring it.');
      return null;
    }
    var href = resolvePath(item.path, base);
    if (!href) return null;
    var key = href.split('#')[0];
    var listed = order.some(function (page) { return page.href.split('#')[0] === key; });
    if (!listed) {
      var title = typeof item.title === 'string' && item.title ? item.title : 'Glossary';
      pages.push.apply(pages, normalizePages([{ title: title, path: item.path }], base, order, 'glossaryPage'));
    }
    return href;
  }

  function normalizeSite(raw, base, options) {
    var provided = isObject(raw);
    if (raw != null && !provided) warnOnce('site', 'window.DocFormSite must be an object; ignoring it.');
    var source = provided ? raw : {};
    options = options || source.options || {};
    var tooltips = options.tooltips || {};
    var terms = {};
    ['autoLink', 'hold'].forEach(function (key) {
      if (hasOwn.call(tooltips, key)) terms[key] = tooltips[key];
    });
    var search = source.assets && source.assets.search && source.assets.search.output;
    var order = [];
    var pages = normalizePages(source.pages, base, order, 'pages');
    var roles = normalizeRoles(options.roles && options.roles.colors);
    return {
      provided: provided,
      base: base,
      title: typeof source.title === 'string' ? source.title : '',
      pages: pages,
      order: order,
      glossaryPage: addGlossaryPage(source.glossaryPage, pages, base, order),
      roles: roles,
      roleTips: normalizeRoleTips(options.roles && options.roles.tips, roles),
      tags: normalizeTags(options.tags, roles),
      glossary: plainObject(tooltips.terms, 'glossary'),
      terms: terms,
      macros: plainObject(options.math && options.math.macros, 'macros'),
      bibliography: plainObject(options.citations && options.citations.entries, 'bibliography'),
      refs: plainObject(options.references, 'options.references'),
      search: typeof search === 'string' && search ? resolvePath(search, base) : null
    };
  }

  // Glossary keys: "Linear map", "linear-map", and "linear_map" all name the same term.
  function termKey(text) {
    return String(text).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  }

  // Heading anchors: shared by nav.js, which assigns them, and the search index, which must predict them.
  function slug(text) {
    var out = String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return out || 'section';
  }

  function uniqueSlug(base, used) {
    var out = base;
    for (var n = 2; used.has(out); n++) out = base + '-' + n;
    used.add(out);
    return out;
  }

  function roleColor(name, site) {
    var roles = (site || DocForm._site || {}).roles || {};
    var key = String(name).trim().toLowerCase();
    if (hasOwn.call(roles, key)) return roles[key];
    warnOnce('role:' + key, 'Unknown role "' + name + '"; add it to the manifest roles.');
    return null;
  }

  function run(mod) {
    if (boot && !boot.canInitialize(mod.name)) return;
    try {
      mod.init(DocForm._site, DocForm);
    } catch (e) {
      if (boot) boot.moduleFailed(mod.name, e);
      else warnOnce('init:' + mod.name, 'Module "' + mod.name + '" failed to initialise.', e);
    }
  }

  // Clipboard API first; file:// pages and blocked permissions fall back to execCommand on a hidden textarea.
  function copyText(text) {
    var nav = root.navigator;
    if (nav && nav.clipboard && root.isSecureContext !== false) {
      return nav.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      area.remove();
      if (ok) resolve();
      else reject(new Error('Copy was blocked.'));
    });
  }

  function register(name, init) {
    for (var i = 0; i < modules.length; i++) {
      if (modules[i].name === name) {
        warnOnce('module:' + name, 'Module "' + name + '" is registered more than once; ignoring the repeat.');
        return;
      }
    }
    var mod = { name: name, init: init };
    modules.push(mod);
    if (started) run(mod);
  }

  // data-df-max-width: a positive CSS length or percentage, else null.
  function maxWidthValue(value) {
    var text = String(value == null ? '' : value).trim().toLowerCase();
    var match = /^(\d+\.?\d*|\.\d+)(px|em|rem|ch|ex|vw|vh|vmin|vmax|svw|lvw|dvw|cqw|cqi|cm|mm|in|pt|pc|%)$/.exec(text);
    return match && Number(match[1]) > 0 ? Number(match[1]) + match[2] : null;
  }

  function applyMaxWidth(el) {
    var value = maxWidthValue(el.getAttribute('data-df-max-width'));
    if (value) el.style.setProperty('--df-max-width', value);
    else {
      el.style.removeProperty('--df-max-width');
      if (el.hasAttribute('data-df-max-width')) {
        issue('base', el, 'Invalid data-df-max-width value.', 'Use a positive length such as 720px or a percentage such as 80%.');
      }
    }
  }

  function watchMaxWidths() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    all('[data-df-max-width]').forEach(applyMaxWidth);
    if (typeof root.MutationObserver !== 'function') return;
    new root.MutationObserver(function (records) {
      records.forEach(function (record) { applyMaxWidth(record.target); });
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-df-max-width'] });
  }

  function initialize() {
    if (started) return;
    started = true;
    watchMaxWidths();
    if (DocForm._selection) {
      prepareSelection();
      DocForm._selection.start();
    }
    transaction(function () {
      initialItems = [];
      modules.slice().forEach(run);
      var pending = initialItems;
      initialItems = null;
      pending.forEach(function (notify) { if (notify) notify(); });
      if (DocForm._selection) DocForm._selection.finish();
    });
  }

  function prepareSelection() {
    if (!DocForm._selection) return;
    DocForm._selection.prepare();
    selectionScans.forEach(function (scan) {
      if (boot && !boot.canInitialize(scan.feature)) return;
      try { scan.fn(); }
      catch (error) { if (boot) boot.moduleFailed(scan.feature, error); else warnOnce(scan.feature + ':scan', String(error)); }
    });
  }

  var PILL_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  // Reading-control and theme icons, shared with the standalone export shell so both stay identical.
  var CONTROL_ICONS = Object.freeze({
    prev: PILL_SVG + '<path d="M12.5 8h-9m4-4-4 4 4 4"/></svg>',
    next: PILL_SVG + '<path d="M3.5 8h9m-4-4 4 4-4 4"/></svg>',
    nav: PILL_SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11M3.5 5.5h0.5M3.5 8h0.5"/></svg>',
    navHidden: PILL_SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m7 5.5-2.5 2.5L7 10.5"/></svg>',
    navAuto: PILL_SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 3v10" stroke-dasharray="1.2 2"/><path d="m8.5 5.5 2.5 2.5-2.5 2.5"/></svg>',
    focus: PILL_SVG + '<path d="M1.5 5V3a1.5 1.5 0 0 1 1.5-1.5h2M11 1.5h2A1.5 1.5 0 0 1 14.5 3v2M14.5 11v2a1.5 1.5 0 0 1-1.5 1.5h-2M5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2M5 8h6"/></svg>',
    light: PILL_SVG + '<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></svg>',
    dark: PILL_SVG + '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>',
    progress: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<circle class="df-progress-track" cx="10" cy="10" r="7"/>' +
      '<circle class="df-progress-bar" cx="10" cy="10" r="7" pathLength="100" stroke-dasharray="100" ' +
      'stroke-dashoffset="100" transform="rotate(-90 10 10)"/></svg>'
  });
  var PILL_ICONS = {
    reset: '<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.6"/><path d="M2.5 2.5v3.1h3.1"/>',
    previous: '<path d="m10 3.5-4.5 4.5 4.5 4.5"/>',
    next: '<path d="m6 3.5 4.5 4.5-4.5 4.5"/>',
    play: '<path d="M5 3.3v9.4L12.3 8z" fill="currentColor"/>',
    pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>'
  };

  function pillIcon(button, icon, label) {
    if (button.getAttribute('aria-label') === label) return;
    button.innerHTML = PILL_SVG + PILL_ICONS[icon] + '</svg>';
    button.setAttribute('aria-label', label);
    hint(button, label);
  }

  // Frosted step-control pill: parts are {name, label, run, icon?} buttons or 'count', a muted status line.
  // Buttons stay focusable at their ends through aria-disabled, so focus never jumps.
  function pill(className, label, parts, controls) {
    var group = document.createElement('div');
    group.className = 'df-pill' + (className ? ' ' + className : '');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    var buttons = {};
    var count = null;
    parts.forEach(function (part) {
      if (part === 'count') {
        count = document.createElement('span');
        count.className = 'df-pill-count';
        count.setAttribute('role', 'status');
        count.setAttribute('aria-atomic', 'true');
        group.appendChild(count);
        return;
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'df-pill-button df-pill-' + part.name;
      if (controls) button.setAttribute('aria-controls', controls);
      button.setAttribute('aria-disabled', 'false');
      pillIcon(button, part.icon || part.name, part.label);
      button.addEventListener('click', function () {
        if (button.getAttribute('aria-disabled') !== 'true') part.run();
      });
      group.appendChild(button);
      buttons[part.name] = button;
    });
    return { element: group, buttons: buttons, count: count };
  }

  function estimateInterval(value, at) {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isFinite(value.lower) || !Number.isFinite(value.upper) || value.lower > value.upper) {
      throw new Error(at + ' needs finite interval bounds with lower ≤ upper.');
    }
    var interval = { lower: value.lower, upper: value.upper };
    if (value.label !== undefined) {
      if (typeof value.label !== 'string' || !value.label.trim()) throw new Error(at + ' needs a nonempty interval label.');
      interval.label = value.label;
    }
    if (value.count !== undefined) {
      if (!Number.isInteger(value.count) || value.count < 0) throw new Error(at + ' needs a nonnegative integer interval count.');
      interval.count = value.count;
    }
    return interval;
  }

  function intervalText(interval, format) {
    return (interval.label || 'Interval') + ' [' + format(interval.lower) + ', ' + format(interval.upper) + ']' +
      (interval.count === undefined ? '' : ' (n = ' + interval.count + ')');
  }

  var DocForm = root.DocForm = Object.assign(root.DocForm || { _site: null, _page: null }, {
    _colors: COLORS.slice(),
    _icons: CONTROL_ICONS,
    register: register,
    _data: data,
    _flag: flag,
    _num: num,
    _all: all,
    _color: color,
    _normalizeRoles: normalizeRoles,
    _roleColor: roleColor,
    _resolvePath: resolvePath,
    _normalizeSite: normalizeSite,
    _termKey: termKey,
    _tagShapes: SHAPES.slice(),
    _normalizeTags: normalizeTags,
    _tagKeys: tagKeys,
    _glossaryTip: glossaryTip,
    _warnOnce: warnOnce,
    _component: {
      target: elementTarget, flag: attributeFlag, closestFlag: closestFlag, number: attributeNumber, option: option, issue: issue,
      transaction: transaction, notify: notifyNow, signal: signal
    },
    _dataViews: {
      controller: viewController, destination: destination, issue: dataIssue, freeze: immutable,
      transform: transformData,
      access: function (api) { return dataDestinations.get(api); },
      transaction: transaction, signal: signal, notify: notifyNow,
      target: function (target) { return typeof target === 'string' ? document.getElementById(target) : target; }
    },
    _interval: { normalize: estimateInterval, text: intervalText },
    _maxWidth: maxWidthValue,
    shortcuts: { register: registerShortcut, keys: shortcutKeys },
    _shortcutHint: shortcutHint,
    sequence: { get: sequenceGet },
    _sequence: {
      define: defineSequence, indexed: indexedSequence, binding: sequenceBinding, start: startSequence,
      pill: sequencePill, label: sequenceLabel, detail: sequenceDetail, showDetails: showStepDetails,
      apply: function (target, key, origin) {
        var entry = sequences.get(target);
        return entry && entry.apply ? entry.apply(key, origin) : null;
      }
    },
    _items: {
      key: selectionKey, flag: attributeFlag, mode: selectionMode, issue: issue, signal: signal,
      transaction: transaction, notify: notifyNow, domain: itemDomain, controller: itemController, collect: collectItems,
      scan: function (feature, fn) { selectionScans.push({ feature: feature, fn: fn }); },
      target: function (target) { return typeof target === 'string' ? document.getElementById(target) : target; }
    }
  });

  if (boot) {
    boot.initialize = initialize;
    boot.prepareSelection = prepareSelection;
    boot.registered = function (name) { return modules.some(function (mod) { return mod.name === name; }); };
  }
  DocForm.util = { slug: slug, uniqueSlug: uniqueSlug, copyText: copyText, hint: hint };
})(typeof window !== 'undefined' ? window : globalThis);
