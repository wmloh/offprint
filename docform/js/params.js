(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  var boot = DocForm && DocForm._boot;
  if (!boot) return;

  var NAME_RE = /^[A-Za-z_$][\w$]*$/;
  var TEMPLATE_RE = /\{\{([\s\S]+?)\}\}/g;
  var hasOwn = Object.prototype.hasOwnProperty;
  var started = false;
  var compiled = Object.create(null);
  var count = 0;
  var scopes = new Map();
  var scopeMarker = 'data-df-parameter-scope';

  // Decimal places implied by a slider step, such as 2 for 0.05.
  function digitsOf(step) {
    var text = String(step);
    var parts = text.split('e');
    var decimals = (parts[0].split('.')[1] || '').length;
    return Math.min(100, Math.max(0, decimals - Number(parts[1] || 0)));
  }

  // Fixed decimals when `places` is given, otherwise up to three decimals with trailing zeros dropped.
  function format(value, places) {
    if (typeof value !== 'number') return String(value);
    if (!isFinite(value)) return isNaN(value) ? '?' : value > 0 ? '∞' : '−∞';
    var rounded = Math.abs(value) < Number.MAX_VALUE / 1000 ? Math.round(value * 1000) / 1000 : value;
    var text = places == null ? String(rounded) : value.toFixed(places);
    return /^-0(?:\.0*)?$/.test(text) ? text.slice(1) : text;
  }

  // Evaluates an expression with parameters and Math functions (sqrt, sin, PI, …) in scope.
  function evaluate(expr, scope) {
    var fn = compiled[expr];
    if (!fn) {
      // Function bodies are sloppy mode, so `with` is allowed here.
      fn = compiled[expr] = new Function('$scope', 'with (Math) { with ($scope) { return (' + expr + '); } }');
    }
    return fn(scope);
  }

  function placesFor(expr, places, precision) {
    if (places != null) return places;
    var name = expr.trim();
    return hasOwn.call(precision, name) ? precision[name] : null;
  }

  function show(expr, scope, places, precision) {
    try {
      return format(evaluate(expr, scope), placesFor(expr, places, precision));
    } catch (e) {
      DocForm.warnOnce('param-expr:' + expr, 'Cannot evaluate "' + expr + '": ' + (e && e.message ? e.message : e));
      return '?';
    }
  }

  // Replaces each {{expression}} or {{expression|places}} in the template with its formatted value.
  function fill(template, scope, precision) {
    return String(template).replace(TEMPLATE_RE, function (all, body) {
      var m = body.match(/^([\s\S]*?[^|])\|\s*(\d+)\s*$/);
      return m ? show(m[1], scope, parseInt(m[2], 10), precision) : show(body, scope, null, precision);
    });
  }

  function renderBindings(list, scope, precision) {
    list.forEach(function (b) {
      var text = b.template === null ? show(b.expr, scope, b.places, precision) : fill(b.template, scope, precision);
      if (text === b.last) return;
      b.last = text;
      if (b.el.classList.contains('df-math') && DocForm.math) DocForm.math.set(b.el, text);
      else if (b.template !== null && DocForm.math && DocForm.math.mixed) b.el.innerHTML = DocForm.math.mixed(text);
      else b.el.textContent = text;
    });
  }

  function same(a, b) {
    return Object.keys(a).every(function (n) { return hasOwn.call(b, n) && sameValue(b[n], a[n]); });
  }

  function sameValue(a, b) {
    return a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every(function (value, i) { return value === b[i]; }));
  }

  function renderPresets(list, current) {
    list.forEach(function (p) {
      if (same(p.values, current)) p.el.setAttribute('aria-current', 'true');
      else p.el.removeAttribute('aria-current');
    });
  }

  function labelFor(text, id, tag) {
    var label = document.createElement(tag || 'label');
    label.className = 'df-param-label';
    if (id) label.htmlFor = id;
    if (DocForm.math && DocForm.math.mixed) label.innerHTML = DocForm.math.mixed(text);
    else label.textContent = text;
    return label;
  }

  function preset(button, scope) {
    var label = button.textContent.trim() || button.getAttribute('data-df-preset');
    var update;
    try {
      update = JSON.parse(button.getAttribute('data-df-preset'));
    } catch (e) {
      update = undefined;
    }
    var result = update === undefined ? { error: 'must be valid JSON.' }
      : scope.validate(update, true);
    button.classList.add('df-preset');
    if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
    if (result.error) {
      parameterIssue(button, 'Preset "' + label + '" ' + result.error);
      button.setAttribute('aria-disabled', 'true');
      return;
    }
    scope.presets.push({ el: button, values: result.values });
    button.addEventListener('click', function () {
      scope.write(result.values, 'user');
    });
  }

  function bind(el, list) {
    var template = el.getAttribute('data-df-template');
    var expr = el.getAttribute('data-df-bind');
    if (template === null && (expr === null || !expr.trim())) return;
    list.push({
      el: el,
      template: template,
      expr: template === null ? expr : null,
      places: DocForm.num(el, 'digits', null),
      last: null
    });
  }

  function parameterIssue(host, message) {
    boot.report('parameter-input', 'parameters', host, message, 'Check the parameter scope, definition, or value.', message);
  }

  function record(value) {
    if (!value || typeof value !== 'object') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === null || (Object.getPrototypeOf(proto) === null &&
      hasOwn.call(proto, 'constructor') && typeof proto.constructor === 'function' && proto.constructor.name === 'Object');
  }

  function precision(value) {
    return Number.isInteger(value) && value >= 0 && value <= 100;
  }

  function accepts(def, value) {
    if (def.type === 'toggle') return typeof value === 'boolean';
    if (def.type === 'select') return def.choices.some(function (choice) { return choice.value === value; });
    if (def.type === 'multiselect') {
      if (!Array.isArray(value)) return false;
      var choices = new Set(value);
      return choices.size === value.length &&
        def.choices.filter(function (choice) { return choices.has(choice.value); }).length === choices.size;
    }
    return Number.isFinite(value) && value >= def.min && value <= def.max;
  }

  function normalizeValue(def, value) {
    if (def.type !== 'multiselect') return value;
    return Object.freeze(def.choices.map(function (choice) { return choice.value; })
      .filter(function (choice) { return value.includes(choice); }));
  }

  function definition(raw) {
    if (!record(raw) || !['range', 'number', 'select', 'multiselect', 'toggle'].includes(raw.type)) return null;
    var type = raw.type;
    var def = { type: type, digits: raw.digits };
    if (def.digits !== undefined && !precision(def.digits)) return null;
    if (raw.selectionGroup !== undefined || raw.selectionMode !== undefined) {
      var group = typeof raw.selectionGroup === 'string' ? raw.selectionGroup.trim() : '';
      if ((type !== 'select' && type !== 'multiselect') || !group ||
        (raw.selectionMode !== undefined && !['both', 'publish', 'follow'].includes(raw.selectionMode))) return null;
      def.selectionGroup = group;
      def.selectionMode = raw.selectionMode || 'both';
    }
    var initial;
    if (type === 'range' || type === 'number') {
      var range = type === 'range';
      if (raw.min !== undefined && !Number.isFinite(raw.min)) return null;
      if (raw.max !== undefined && !Number.isFinite(raw.max)) return null;
      def.min = raw.min === undefined ? (range ? 0 : -Infinity) : raw.min;
      def.max = raw.max === undefined ? (range ? 1 : Infinity) : raw.max;
      if (def.min > def.max) return null;
      if (range) {
        var span = def.max - def.min;
        var increment = Number.isFinite(span) ? span / 100 : def.max / 100 - def.min / 100;
        def.step = raw.step === undefined ? Number(increment.toPrecision(12)) || span || 1 : raw.step;
        if (!Number.isFinite(def.step) || def.step <= 0) return null;
        if (def.digits === undefined) def.digits = digitsOf(def.step);
        initial = def.min;
      }
    } else if (type === 'select' || type === 'multiselect') {
      if (!Array.isArray(raw.choices) || !raw.choices.length) return null;
      def.choices = Array.from(raw.choices, function (choice) {
        return record(choice) && typeof choice.value === 'string' && typeof choice.label === 'string'
          ? { value: choice.value, label: choice.label } : null;
      });
      if (def.choices.includes(null) || new Set(def.choices.map(function (c) { return c.value; })).size !== def.choices.length) return null;
      initial = type === 'select' ? def.choices[0].value : def.choices.map(function (choice) { return choice.value; });
    } else initial = false;
    def.initial = raw.default === undefined ? initial : raw.default;
    if (!accepts(def, def.initial)) return null;
    def.initial = normalizeValue(def, def.initial);
    return def;
  }

  function valueFromMarkup(def, value) {
    return (def.type === 'range' || def.type === 'number') && typeof value === 'string' && value.trim()
      ? Number(value) : value;
  }

  function makeScope(name, definitions) {
    var defaults = Object.freeze(Object.fromEntries(Object.entries(definitions).map(function (entry) {
      return [entry[0], entry[1].initial];
    })));
    var current = defaults;
    var displays = new Map();
    var state = { bindings: [], presets: [], shows: [] };
    var places = Object.create(null);
    Object.keys(definitions).forEach(function (key) { places[key] = definitions[key].digits; });
    var subscribers = new Set();
    var views = [];

    state.views = function (keys) {
      if (!keys.every(function (key) {
        return knownKey(key) && ['select', 'multiselect'].includes(definitions[key].type);
      })) return null;
      return {
        snapshot: function () { return current; },
        bind: function (prepare) { views.push({ keys: keys, prepare: prepare }); }
      };
    };

    // Other features join every commit of this scope: prepare(candidate) throws to reject the whole update,
    // or returns a stage that applies it.
    state.link = function () {
      var keys = Object.keys(definitions);
      return {
        snapshot: function () { return current; },
        evaluate: evaluate,
        bind: function (prepare) { views.push({ keys: keys, prepare: prepare }); }
      };
    };

    state.groupDomains = function () {
      Object.keys(definitions).forEach(function (key) {
        var def = definitions[key];
        if (def.selectionGroup && def.selectionMode !== 'publish' && DocForm._selection) {
          DocForm._selection.collect(def.selectionGroup, def.choices.map(function (choice) { return choice.value; }), []);
        }
      });
    };

    state.renderShows = function (animate) {
      state.shows.forEach(function (item) { showItem(item, current, animate); });
    };

    // A select follows a group key among its choices; a multiselect adds it. A select publishes its value; a
    // multiselect publishes the choice just added, or clears the group when the shared key is removed.
    state.joinGroups = function () {
      Object.keys(definitions).forEach(function (key) {
        var def = definitions[key];
        if (!def.selectionGroup) return;
        var group = DocForm._selection && DocForm._selection.ensure(def.selectionGroup);
        if (!group) {
          parameterIssue(null, 'Enable selection to link parameter "' + key + '" to group "' + def.selectionGroup + '".');
          return;
        }
        var shared = group.api;
        var choices = def.choices.map(function (choice) { return choice.value; });
        if (def.selectionMode !== 'publish') {
          var follow = function (selected) {
            var chosen = selected && selected.key;
            if (!choices.includes(chosen)) return;
            if (def.type === 'select') state.write({ [key]: chosen }, 'selection');
            else if (!current[key].includes(chosen)) state.write({ [key]: current[key].concat(chosen) }, 'selection');
          };
          shared.subscribe(follow);
          follow(shared.snapshot());
        }
        if (def.selectionMode === 'follow') return;
        subscribers.add({ keys: [key], fn: function (now, meta) {
          if (meta.origin === 'init') return;
          var value = now[key];
          if (def.type === 'select') { shared.select(value); return; }
          var before = meta.previous ? meta.previous[key] : [];
          var added = value.filter(function (choice) { return !before.includes(choice); });
          var at = shared.get();
          if (added.length) shared.select(added[added.length - 1]);
          else if (choices.includes(at) && !value.includes(at)) shared.clear();
        } });
      });
    };

    state.validate = function (update, fromMarkup) {
      if (!record(update)) return { error: 'requires an object of parameter values.' };
      var keys = Object.keys(update);
      if (!keys.length) return { error: 'must set at least one parameter.' };
      var next = Object.create(null);
      for (var key of keys) {
        var def = definitions[key];
        if (!def) return { error: 'sets unknown parameter "' + key + '".' };
        var value = fromMarkup ? valueFromMarkup(def, update[key]) : update[key];
        if (!accepts(def, value)) return { error: 'has an invalid value for "' + key + '".' };
        next[key] = normalizeValue(def, value);
      }
      return { values: next };
    };

    function notify(subscriber, meta) {
      try { subscriber.fn(current, meta); }
      catch (error) { parameterIssue(null, 'Parameter subscriber in "' + name + '" failed: ' + String(error)); }
    }

    function immediate(subscriber) {
      var keys = subscriber.keys || Object.keys(definitions);
      notify(subscriber, Object.freeze({ previous: null, changedKeys: Object.freeze(keys.slice()), origin: 'init' }));
    }

    function commit(next, origin) {
      var changed = Object.keys(next).filter(function (key) { return !sameValue(current[key], next[key]); });
      if (!changed.length) return true;
      var previous = current;
      var candidate = { ...current };
      changed.forEach(function (key) { candidate[key] = next[key]; });
      Object.freeze(candidate);
      var prepared;
      function renderControls() {
        changed.forEach(function (key) {
          (displays.get(key) || []).forEach(function (showValue) { showValue(current[key]); });
        });
      }
      try {
        prepared = views.filter(function (view) {
          return view.keys.some(function (key) { return changed.includes(key); });
        }).map(function (view) { return view.prepare(candidate); });
      } catch (error) {
        renderControls();
        parameterIssue(null, 'Parameter update for "' + name + '" was rejected. ' + error.message);
        return false;
      }
      current = candidate;
      renderControls();
      renderPresets(state.presets, current);
      state.renderShows(true);
      var notifications = prepared.map(function (stage) { return stage(); });
      notifications.forEach(function (notify) { if (notify) notify(); });
      if (!scopesReady) return true;
      scheduleScopedBindings(state);
      var meta = Object.freeze({ previous: previous, changedKeys: Object.freeze(changed), origin: origin });
      Array.from(subscribers).forEach(function (sub) {
        if (subscribers.has(sub) && (!sub.keys || changed.some(function (key) { return sub.keys.includes(key); }))) notify(sub, meta);
      });
      if (typeof root.CustomEvent === 'function' && typeof document !== 'undefined') {
        document.dispatchEvent(new root.CustomEvent('df:parameters:change', {
          detail: Object.freeze({ current: current, scope: name, ...meta })
        }));
      }
      return true;
    }

    state.write = function (update, origin) {
      var result = state.validate(update, false);
      if (result.error) {
        parameterIssue(null, 'Parameter update for "' + name + '" ' + result.error);
        return false;
      }
      return DocForm._items.transaction(function () { return commit(result.values, origin); });
    };

    function attach(key, showValue) {
      if (!displays.has(key)) displays.set(key, []);
      displays.get(key).push(showValue);
      showValue(current[key]);
    }
    state.control = function (host) {
      var key = host.getAttribute('data-df-parameter').trim();
      var def = definitions[key];
      if (!def || def.type === 'number') {
        parameterIssue(host, 'Parameter "' + key + '" has no control definition in scope "' + name + '".');
        return;
      }
      if (def.type === 'select' || def.type === 'multiselect') {
        parameterIssue(host, 'Parameter "' + key + '" is a ' + def.type + '; author it as <fieldset data-df-choice="' + key + '">.');
        return;
      }
      var showValue = scopedControl(host, key, def, function (value) {
        if (!state.write({ [key]: value }, 'user')) showValue(current[key]);
      });
      if (showValue) attach(key, showValue);
    };
    // <fieldset data-df-choice="key"> with an optional legend and native inputs for reading without scripts.
    state.choice = function (host) {
      var key = host.getAttribute('data-df-choice').trim();
      var def = definitions[key];
      if (!def || (def.type !== 'select' && def.type !== 'multiselect')) {
        parameterIssue(host, 'Parameter "' + key + '" has no select or multiselect definition in scope "' + name + '".');
        return;
      }
      if (host.tagName !== 'FIELDSET') {
        parameterIssue(host, 'Choice parameter "' + key + '" needs a fieldset host.');
        return;
      }
      if (!DocForm.choices) {
        parameterIssue(host, 'Choice parameter "' + key + '" needs the choices feature.');
        return;
      }
      var control = DocForm.choices.create({
        host: host,
        label: key,
        multiple: def.type === 'multiselect',
        options: def.choices.map(function (choice) {
          return {
            value: choice.value,
            label: choice.label,
            mark: def.selectionGroup ? function (el) {
              el.setAttribute('data-df-selection-group', def.selectionGroup);
              el.setAttribute('data-df-key', choice.value);
            } : null
          };
        }),
        onChange: function (value) {
          if (!state.write({ [key]: value }, 'user')) control.show(current[key]);
        }
      });
      if (control.mismatch) {
        parameterIssue(host, 'Authored choices for parameter "' + key + '" do not match its definition; they were replaced.');
      }
      attach(key, control.show);
    };
    state.render = function () { renderBindings(state.bindings, current, places); };
    state.finish = function () {
      Array.from(subscribers).forEach(function (sub) {
        if (subscribers.has(sub) && sub.immediate) immediate(sub);
      });
    };
    state.api = {
      get: function (key) { return knownKey(key) ? current[key] : undefined; },
      snapshot: function () { return current; },
      set: function (key, value) { return typeof key === 'string' && state.write({ [key]: value }, 'api'); },
      update: function (update) { return state.write(update, 'api'); },
      reset: function () { return DocForm._items.transaction(function () { return commit(defaults, 'reset'); }); },
      subscribe: function (fn, options) {
        options = options || {};
        var keys = Array.isArray(options.keys) ? Array.from(new Set(options.keys)) : null;
        if (typeof fn !== 'function' || (options.keys !== undefined && (!keys || !keys.every(knownKey)))) {
          parameterIssue(null, 'Invalid parameter subscription for "' + name + '".');
          return function () {};
        }
        var sub = { fn: fn, keys: keys, immediate: options.immediate === true };
        subscribers.add(sub);
        if (scopesReady && sub.immediate) DocForm._items.notify(function () { immediate(sub); });
        return function () { subscribers.delete(sub); };
      }
    };

    function knownKey(key) {
      return typeof key === 'string' && hasOwn.call(definitions, key);
    }
    return state;
  }

  var scopesReady = false;
  var bindingQueue = new Set();
  var SHOW_MS = 200;

  // data-df-show-when holds an expression; with data-df-show-value the element shows when the result, or any
  // item of an array result, equals that text. Otherwise it shows when the result is truthy and not an empty array.
  function showItem(item, values, animate) {
    var on = true;
    try {
      var result = evaluate(item.expr, values);
      on = item.value === null ? (Array.isArray(result) ? result.length > 0 : !!result) :
        [].concat(result).some(function (value) { return String(value) === item.value; });
    } catch (error) {
      if (!item.failed) parameterIssue(item.el, 'Cannot evaluate show condition "' + item.expr + '": ' + error.message);
      item.failed = true;
    }
    if (item.on === on) return;
    item.on = on;
    var el = item.el;
    if (item.timer) root.clearTimeout(item.timer);
    item.timer = null;
    el.classList.remove('df-show-enter', 'df-show-leave');
    if (!animate || typeof root.requestAnimationFrame !== 'function' || typeof root.setTimeout !== 'function') {
      el.hidden = !on;
      return;
    }
    if (on) {
      el.hidden = false;
      el.classList.add('df-show-enter');
      // Two frames, so the start state is painted before the transition back to rest.
      root.requestAnimationFrame(function () {
        root.requestAnimationFrame(function () { if (item.on) el.classList.remove('df-show-enter'); });
      });
    } else {
      el.classList.add('df-show-leave');
      item.timer = root.setTimeout(function () {
        item.timer = null;
        el.hidden = true;
        el.classList.remove('df-show-leave');
      }, SHOW_MS);
    }
  }

  function showWhen(el, list) {
    var expr = el.getAttribute('data-df-show-when');
    if (!expr || !expr.trim()) {
      parameterIssue(el, 'data-df-show-when needs an expression over the scope parameters.');
      return;
    }
    el.classList.add('df-show-when');
    list.push({ el: el, expr: expr, value: el.getAttribute('data-df-show-value'), on: !el.hidden, timer: null, failed: false });
  }

  function scheduleScopedBindings(state) {
    if (!state.bindings.length) return;
    var waiting = bindingQueue.size > 0;
    bindingQueue.add(state);
    if (waiting) return;
    function render() {
      var queued = Array.from(bindingQueue);
      bindingQueue.clear();
      queued.forEach(function (scope) { scope.render(); });
    }
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(render);
    else render();
  }

  function scopedControl(host, key, def, change) {
    var tag = (host.tagName || '').toLowerCase();
    var native = tag === 'input';
    var type = def.type;
    var label = DocForm.data(host, 'parameter-label', null);
    var places = DocForm.data(host, 'parameter-digits', null);
    if (places !== null && (!places.trim() || !precision(Number(places)))) {
      parameterIssue(host, 'Invalid display precision for parameter "' + key + '".');
      places = null;
    }
    if (native && (tag !== 'input' || host.type !== (type === 'toggle' ? 'checkbox' : 'range'))) {
      parameterIssue(host, 'Native control for parameter "' + key + '" does not match its ' + type + ' definition.');
      return null;
    }
    var input = native ? host : document.createElement('input');
    var output;
    if (!native) {
      input.id = 'df-param-' + key + '-' + (++count);
      host.textContent = '';
      host.classList.add('df-param', 'df-param-' + type);
      host.appendChild(labelFor(label === null ? key : label, input.id));
      host.appendChild(input);
      if (type === 'range') {
        output = document.createElement('output');
        output.className = 'df-param-value';
        output.htmlFor = input.id;
        host.appendChild(output);
      }
    } else if (label !== null) input.setAttribute('aria-label', label);
    input.classList.add('df-param-input');
    if (type === 'range') {
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.addEventListener('input', function () { change(input.valueAsNumber); });
      return function (value) {
        input.value = String(value);
        if (output) output.textContent = format(value, places === null ? def.digits : Number(places));
      };
    }
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.classList.add('df-param-switch');
    input.addEventListener('change', function () { change(input.checked); });
    return function (value) { input.checked = value; };
  }

  function scopeName(name) {
    return typeof name === 'string' ? name.trim() : '';
  }

  function define(name, raw) {
    name = scopeName(name);
    if (!name || scopes.has(name) || started || !record(raw) || !Object.keys(raw).length) {
      parameterIssue(null, 'Invalid, duplicate, or late parameter scope "' + name + '".');
      return null;
    }
    var definitions = Object.create(null);
    for (var key of Object.keys(raw)) {
      var def = definition(raw[key]);
      if (!NAME_RE.test(key) || !def) {
        parameterIssue(null, 'Invalid parameter definition "' + key + '" in scope "' + name + '".');
        return null;
      }
      definitions[key] = def;
    }
    var scope = makeScope(name, definitions);
    scopes.set(name, scope);
    return scope.api;
  }

  function resolveScope(el) {
    var name = DocForm.data(el, 'scope', null);
    if (name === null) {
      for (var node = el; node; node = node.parentElement) {
        name = node.getAttribute(scopeMarker);
        if (name !== null) break;
      }
    }
    var key = name === null ? 'page' : scopeName(name);
    var scope = scopes.get(key);
    if (!scope) parameterIssue(el, 'Unknown parameter scope "' + key + '".');
    return scope || null;
  }

  function finishScopes() {
    DocForm._items.transaction(function () {
      scopesReady = true;
      scopes.forEach(function (scope) { scope.finish(); });
    });
  }

  DocForm.parameters = {
    define: define,
    scope: function (name) {
      var scope = scopes.get(name === undefined ? 'page' : scopeName(name));
      return scope ? scope.api : null;
    }
  };
  DocForm._parameterViews = function (name, keys) {
    var scope = scopes.get(scopeName(name));
    return scope ? scope.views(keys) : null;
  };
  // The scope an element resolves to, as a link other features can join; null after reporting an unknown scope.
  DocForm._parameterLink = function (el) {
    var scope = resolveScope(el);
    return scope ? scope.link() : null;
  };
  DocForm._parameterScope = function (el) {
    var scope = resolveScope(el);
    return scope ? scope.api : null;
  };

  // Stored group keys count only when a participant offers them, so linked choices join the startup domain.
  if (DocForm._items) DocForm._items.scan('parameters', function () {
    scopes.forEach(function (scope) { scope.groupDomains(); });
  });

  var configured = DocForm.site || {};
  if (configured.parameterScopes !== undefined) {
    if (record(configured.parameterScopes)) {
      Object.keys(configured.parameterScopes).forEach(function (name) { define(name, configured.parameterScopes[name]); });
    } else parameterIssue(null, 'Parameter scopes must be an object keyed by scope name.');
  }
  boot.after('parameters', finishScopes);

  DocForm.register('params', function () {
    DocForm.all('[data-df-parameter]').forEach(function (el) {
      var scope = resolveScope(el);
      if (scope) scope.control(el);
    });
    DocForm.all('[data-df-choice]').forEach(function (el) {
      var scope = resolveScope(el);
      if (scope) scope.choice(el);
    });
    DocForm.all('[data-df-preset]').forEach(function (el) {
      var scope = resolveScope(el);
      if (scope === null) {
        el.classList.add('df-preset');
        el.setAttribute('aria-disabled', 'true');
        if (!el.hasAttribute('type')) el.setAttribute('type', 'button');
      } else preset(el, scope);
    });
    DocForm.all('[data-df-bind], [data-df-template]').forEach(function (el) {
      var scope = resolveScope(el);
      if (scope) bind(el, scope.bindings);
    });
    DocForm.all('[data-df-show-when]').forEach(function (el) {
      var scope = resolveScope(el);
      if (scope) showWhen(el, scope.shows);
    });
    started = true;
    scopes.forEach(function (scope) {
      renderPresets(scope.presets, scope.api.snapshot());
      scope.render();
      scope.renderShows(false);
      scope.joinGroups();
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
