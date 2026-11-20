(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] params.js needs core.js loaded before it.');
    return;
  }

  var NAME_RE = /^[A-Za-z_$][\w$]*$/;
  var TEMPLATE_RE = /\{\{([\s\S]+?)\}\}/g;
  var hasOwn = Object.prototype.hasOwnProperty;
  var values = Object.create(null);
  var digits = Object.create(null);
  var controls = Object.create(null);
  var presets = [];
  var listeners = [];
  var bindings = [];
  var started = false;
  var pending = false;
  var compiled = Object.create(null);
  var count = 0;
  var boot = DocForm._boot;
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
    precision = precision || digits;
    return String(template).replace(TEMPLATE_RE, function (all, body) {
      var m = body.match(/^([\s\S]*?[^|])\|\s*(\d+)\s*$/);
      return m ? show(m[1], scope, parseInt(m[2], 10), precision) : show(body, scope, null, precision);
    });
  }

  function snapshot() {
    return { ...values };
  }

  function ready(listener) {
    return listener.names.every(function (n) { return hasOwn.call(values, n); });
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

  function updateBindings() {
    pending = false;
    renderBindings(bindings, snapshot(), digits);
  }

  function schedule() {
    if (pending || !started) return;
    pending = true;
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(updateBindings);
    else updateBindings();
  }

  function quote(value) {
    return typeof value === 'string' ? '"' + value + '"' : String(value);
  }

  // Returns { value } with the typed value, or { error } when no control of that name accepts it.
  function check(name, value) {
    if (!NAME_RE.test(name)) return { error: 'Parameter "' + name + '" must be a valid identifier such as theta or a_1.' };
    var group = controls[name];
    var type = group ? group.type : 'range';
    if (type === 'range') {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !isFinite(Number(value))) {
        return { error: 'Parameter "' + name + '" needs a finite number, not ' + quote(value) + '.' };
      }
      value = Number(value);
    } else if (type === 'toggle' && typeof value !== 'boolean') {
      return { error: 'Toggle "' + name + '" needs true or false, not ' + quote(value) + '.' };
    } else if (type === 'select' && typeof value !== 'string') {
      return { error: 'Choice "' + name + '" needs a string value, not ' + quote(value) + '.' };
    }
    var bad = group && group.items.filter(function (c) { return !c.accepts(value); })[0];
    if (bad) return { error: 'Parameter "' + name + '" cannot be ' + quote(value) + '; ' + bad.expects + '.' };
    return { value: value };
  }

  // Validates every entry before any state changes, so a rejected update leaves all parameters as they were.
  function checkAll(update) {
    if (update === null || typeof update !== 'object' || Array.isArray(update)) return { error: 'must be an object of parameter values.' };
    var names = Object.keys(update);
    if (!names.length) return { error: 'must set at least one parameter.' };
    var next = Object.create(null);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!controls[name] && !hasOwn.call(values, name)) return { error: 'sets unknown parameter "' + name + '".' };
      var result = check(name, update[name]);
      if (result.error) return result;
      next[name] = result.value;
    }
    return { values: next };
  }

  function same(a, b) {
    return Object.keys(a).every(function (n) { return hasOwn.call(b, n) && sameValue(b[n], a[n]); });
  }

  function sameValue(a, b) {
    return a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every(function (value, i) { return value === b[i]; }));
  }

  function markPresets() {
    renderPresets(presets, values);
  }

  function renderPresets(list, current) {
    list.forEach(function (p) {
      if (same(p.values, current)) p.el.setAttribute('aria-current', 'true');
      else p.el.removeAttribute('aria-current');
    });
  }

  // Calls each affected listener once with the full snapshot, the single changed name (or null), and every changed name.
  function commit(next, changed, source) {
    changed.forEach(function (name) {
      values[name] = next[name];
      (controls[name] ? controls[name].items : []).forEach(function (c) { c.show(next[name], source); });
    });
    markPresets();
    if (!started || !changed.length) return;
    var single = changed.length === 1 ? changed[0] : null;
    listeners.slice().forEach(function (l) {
      var hit = changed.some(function (n) { return l.names.indexOf(n) >= 0; });
      if (hit && ready(l)) l.fn(snapshot(), single, changed.slice());
    });
    schedule();
  }

  function set(name, value, source) {
    var result = check(name, value);
    if (result.error) {
      DocForm.warnOnce('param-value:' + name + ':' + quote(value), result.error);
      return false;
    }
    var next = Object.create(null);
    next[name] = result.value;
    commit(next, [name], source);
    return true;
  }

  function apply(update, label) {
    var result = checkAll(update);
    if (result.error) {
      var what = label ? 'Preset "' + label + '" ' : 'Parameter update ';
      DocForm.warnOnce('param-apply:' + (label || '') + ':' + result.error, what + result.error);
      return false;
    }
    var changed = Object.keys(result.values).filter(function (n) {
      return !hasOwn.call(values, n) || values[n] !== result.values[n];
    });
    commit(result.values, changed, null);
    return true;
  }

  // Calls fn(values, changedName, changedNames) once all named parameters exist and whenever any of them change.
  function on(names, fn) {
    var listener = { names: [].concat(names), fn: fn };
    listeners.push(listener);
    if (started && ready(listener)) fn(snapshot(), null, listener.names.slice());
    return function off() {
      var i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function labelFor(text, id, tag) {
    var label = document.createElement(tag || 'label');
    label.className = 'df-param-label';
    if (id) label.htmlFor = id;
    if (DocForm.math && DocForm.math.mixed) label.innerHTML = DocForm.math.mixed(text);
    else label.textContent = text;
    return label;
  }

  function rangeControl(host, name, input) {
    var min = DocForm.num(host, 'min', 0);
    var max = DocForm.num(host, 'max', 1);
    var step = DocForm.data(host, 'step', null);
    if (step === null || !(parseFloat(step) > 0)) step = String(Math.round((max - min) / 100 * 1e6) / 1e6 || 1);
    if (!(name in digits)) digits[name] = DocForm.num(host, 'digits', digitsOf(step));
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = step;
    input.value = String(hasOwn.call(values, name) ? values[name] : DocForm.num(host, 'value', min));

    var output = document.createElement('output');
    output.className = 'df-param-value';
    output.htmlFor = input.id;
    input.addEventListener('input', function () { set(name, input.valueAsNumber, input); });
    return {
      output: output,
      initial: function () { return input.valueAsNumber; },
      accepts: function (v) { return v >= min && v <= max; },
      expects: 'use a number from ' + format(min) + ' to ' + format(max),
      show: function (v, source) {
        if (input !== source) input.value = String(v);
        output.textContent = format(v, digits[name]);
      }
    };
  }

  function selectControl(host, name, select) {
    var options = DocForm.all('option', host).map(function (o) {
      var value = o.getAttribute('value');
      return { value: value === null ? o.textContent.trim() : value, label: o.textContent.trim(), selected: o.hasAttribute('selected') };
    });
    var keys = options.map(function (o) { return o.value; });
    if (!options.length || keys.some(function (k, i) { return keys.indexOf(k) !== i; })) {
      DocForm.warnOnce('param-options:' + name, 'Choice "' + name + '" needs <option> children with distinct values.');
      return null;
    }
    options.forEach(function (o) {
      var option = document.createElement('option');
      option.value = o.value;
      option.textContent = o.label;
      select.appendChild(option);
    });
    select.className += ' df-param-select';
    var initial = DocForm.data(host, 'value', null);
    if (initial !== null && keys.indexOf(initial) < 0) {
      DocForm.warnOnce('param-initial:' + name, 'Choice "' + name + '" has no option "' + initial + '"; using the default.');
      initial = null;
    }
    if (initial === null) initial = (options.filter(function (o) { return o.selected; })[0] || options[0]).value;
    select.addEventListener('change', function () { set(name, select.value, select); });
    return {
      initial: function () { return initial; },
      accepts: function (v) { return keys.indexOf(v) >= 0; },
      expects: 'use one of ' + keys.map(quote).join(', '),
      show: function (v, source) { if (select !== source) select.value = v; }
    };
  }

  function toggleControl(host, name, input) {
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.className += ' df-param-switch';
    var raw = DocForm.data(host, 'value', 'false');
    if (raw !== 'true' && raw !== 'false') {
      DocForm.warnOnce('param-initial:' + name, 'Toggle "' + name + '" needs data-df-value="true" or "false"; using false.');
    }
    input.addEventListener('change', function () { set(name, input.checked, input); });
    return {
      initial: function () { return raw === 'true'; },
      accepts: function () { return true; },
      expects: 'use true or false',
      show: function (v) { input.checked = v; }
    };
  }

  function control(host) {
    var name = host.getAttribute('data-df-param').trim();
    if (!NAME_RE.test(name)) {
      DocForm.warnOnce('param-name:' + name, 'Parameter "' + name + '" must be a valid identifier such as theta or a_1.');
      return;
    }
    var type = DocForm.data(host, 'type', 'range');
    if (type !== 'range' && type !== 'select' && type !== 'toggle') {
      DocForm.warnOnce('param-type:' + name, 'Parameter "' + name + '" has unknown type "' + type + '"; use range, select, or toggle.');
      return;
    }
    if (controls[name] && controls[name].type !== type) {
      DocForm.warnOnce('param-mixed:' + name, 'Parameter "' + name + '" is already a ' + controls[name].type + '; ignoring this ' + type + '.');
      return;
    }

    var id = 'df-param-' + name + '-' + (++count);
    var input = document.createElement(type === 'select' ? 'select' : 'input');
    input.className = 'df-param-input';
    input.id = id;
    var make = type === 'select' ? selectControl : type === 'toggle' ? toggleControl : rangeControl;
    var c = make(host, name, input);
    if (!c) return;

    var label = labelFor(DocForm.data(host, 'label', name), id);
    host.textContent = '';
    host.classList.add('df-param');
    host.classList.add('df-param-' + type);
    host.appendChild(label);
    host.appendChild(input);
    if (c.output) host.appendChild(c.output);

    var group = controls[name] = controls[name] || { type: type, items: [] };
    group.items.push(c);
    var start = c.initial();
    // A later control of the same name adopts the current value when it can.
    if (hasOwn.call(values, name) && check(name, values[name]).value !== undefined) start = values[name];
    if (!set(name, start)) group.items.splice(group.items.indexOf(c), 1);
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
      : scope ? scope.validate(update, true) : checkAll(update);
    button.classList.add('df-preset');
    if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
    if (result.error) {
      if (scope) parameterIssue(button, 'Preset "' + label + '" ' + result.error);
      else DocForm.warnOnce('param-preset:' + label + ':' + result.error, 'Preset "' + label + '" ' + result.error);
      button.setAttribute('aria-disabled', 'true');
      return;
    }
    var list = scope ? scope.presets : presets;
    list.push({ el: button, values: result.values });
    button.addEventListener('click', function () {
      if (scope) scope.write(result.values, 'user');
      else apply(result.values, label);
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
    if (boot) boot.report('parameter-input', 'parameters', host, message, 'Check the parameter scope, definition, or value.', message);
    else DocForm.warnOnce('parameter:' + message, message, host || undefined);
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

    state.control = function (host) {
      var key = host.getAttribute('data-df-parameter').trim();
      var def = definitions[key];
      if (!def || def.type === 'number') {
        parameterIssue(host, 'Parameter "' + key + '" has no control definition in scope "' + name + '".');
        return;
      }
      var showValue = scopedControl(host, key, def, function (value) {
        if (!state.write({ [key]: value }, 'user')) showValue(current[key]);
      });
      if (!showValue) return;
      if (!displays.has(key)) displays.set(key, []);
      displays.get(key).push(showValue);
      showValue(current[key]);
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
    var native = tag === 'input' || tag === 'select';
    var type = def.type;
    var label = DocForm.data(host, 'parameter-label', null);
    var places = DocForm.data(host, 'parameter-digits', null);
    if (places !== null && (!places.trim() || !precision(Number(places)))) {
      parameterIssue(host, 'Invalid display precision for parameter "' + key + '".');
      places = null;
    }
    var selectType = type === 'select' || type === 'multiselect';
    if (native && (selectType ? tag !== 'select' || host.hasAttribute('multiple') !== (type === 'multiselect') : tag !== 'input' ||
        host.type !== (type === 'toggle' ? 'checkbox' : 'range'))) {
      parameterIssue(host, 'Native control for parameter "' + key + '" does not match its ' + type + ' definition.');
      return null;
    }
    var style = selectType ? choiceStyle(host, key, def, native) : 'native';
    if (style !== 'native') {
      var title = label !== null ? label : native && host.getAttribute('aria-label') || key;
      var showChoice = (style === 'chips' ? chipControl : comboControl)(choiceBox(host, native, type, style), key, def, title, change);
      if (!native) return showChoice;
      // The hidden native select stays in step for forms and for reading with scripts off.
      var showNative = nativeOptions(host, def, function () {});
      return function (value) {
        showChoice(value);
        showNative(value);
      };
    }
    if (type === 'multiselect' && !native) {
      var group = document.createElement('fieldset');
      group.className = 'df-param-multiselect';
      var legend = document.createElement('legend');
      legend.textContent = label === null ? key : label;
      group.appendChild(legend);
      var checks = def.choices.map(function (choice) {
        var item = document.createElement('label');
        if (def.selectionGroup) {
          item.setAttribute('data-df-selection-group', def.selectionGroup);
          item.setAttribute('data-df-key', choice.value);
        }
        var check = document.createElement('input');
        check.type = 'checkbox';
        check.value = choice.value;
        item.appendChild(check);
        var text = document.createElement('span');
        text.textContent = choice.label;
        item.appendChild(text);
        group.appendChild(item);
        check.addEventListener('change', function () {
          change(checks.filter(function (input) { return input.checked; }).map(function (input) { return input.value; }));
        });
        return check;
      });
      host.textContent = '';
      host.appendChild(group);
      return function (value) {
        checks.forEach(function (check) { check.checked = value.includes(check.value); });
      };
    }
    var input = native ? host : document.createElement(selectType ? 'select' : 'input');
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
    if (selectType) return nativeOptions(input, def, change);
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.classList.add('df-param-switch');
    input.addEventListener('change', function () { change(input.checked); });
    return function (value) { input.checked = value; };
  }

  function nativeOptions(input, def, change) {
    input.textContent = '';
    input.classList.add('df-param-select');
    var options = def.choices.map(function (choice) {
      var option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      input.appendChild(option);
      return option;
    });
    if (def.type === 'multiselect') {
      input.addEventListener('change', function () {
        change(options.filter(function (option) { return option.selected; }).map(function (option) { return option.value; }));
      });
      return function (value) {
        options.forEach(function (option) { option.selected = value.includes(option.value); });
      };
    }
    input.addEventListener('change', function () { change(input.value); });
    return function (value) { input.value = value; };
  }

  // Choice sets up to this size, in count and total label length, render as chips; larger ones as a combobox.
  var CHIP_LIMIT = 8;
  var CHIP_TEXT = 80;
  var CHOICE_STYLES = ['auto', 'chips', 'combobox', 'native'];

  function choiceStyle(host, key, def, native) {
    var style = DocForm.data(host, 'parameter-style', 'auto').trim();
    if (CHOICE_STYLES.indexOf(style) < 0) {
      parameterIssue(host, 'Parameter "' + key + '" has unknown style "' + style + '"; use auto, chips, combobox, or native.');
      style = 'auto';
    }
    if (style !== 'auto') return style;
    if (native) return 'native';
    var text = def.choices.reduce(function (sum, choice) { return sum + choice.label.length; }, 0);
    return def.choices.length <= CHIP_LIMIT && text <= CHIP_TEXT ? 'chips' : 'combobox';
  }

  // Generated hosts are emptied; an authored select is hidden with its wrapping label and followed by the control.
  function choiceBox(host, native, type, style) {
    var box = host;
    if (native) {
      var anchor = (host.closest && host.closest('label')) || host;
      box = document.createElement('div');
      anchor.parentNode.insertBefore(box, anchor.nextSibling || null);
      anchor.hidden = true;
    } else host.textContent = '';
    box.classList.add('df-param', 'df-param-' + type, 'df-param-' + style);
    return box;
  }

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function markChoice(el, def, choice) {
    if (!def.selectionGroup) return;
    el.setAttribute('data-df-selection-group', def.selectionGroup);
    el.setAttribute('data-df-key', choice.value);
  }

  function frame(fn) {
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(fn);
    else fn();
  }

  // Native radio or checkbox inputs inside pill labels. Arrow keys, Home, and End move between chips; for a
  // single choice they also choose, as native radios do. A highlight slides to the chosen chip.
  function chipControl(box, key, def, text, change) {
    var multi = def.type === 'multiselect';
    var id = 'df-param-' + key + '-' + (++count);
    var heading = labelFor(text, null, 'span');
    heading.id = id + '-label';
    var group = make('div', 'df-chips');
    group.setAttribute('role', multi ? 'group' : 'radiogroup');
    group.setAttribute('aria-labelledby', heading.id);
    var glider = null;
    if (!multi) {
      glider = make('span', 'df-chips-glider');
      glider.setAttribute('aria-hidden', 'true');
      group.classList.add('df-chips-still');
      group.appendChild(glider);
    }
    var inputs = def.choices.map(function (choice, i) {
      var chip = make('label', 'df-chip');
      markChoice(chip, def, choice);
      var input = make('input', 'df-chip-input');
      input.type = multi ? 'checkbox' : 'radio';
      input.name = id;
      input.id = id + '-' + i;
      input.value = choice.value;
      chip.appendChild(input);
      if (multi) {
        var tick = make('span', 'df-chip-check');
        tick.setAttribute('aria-hidden', 'true');
        chip.appendChild(tick);
      }
      chip.appendChild(make('span', 'df-chip-text', choice.label));
      group.appendChild(chip);
      input.addEventListener('change', function () {
        if (!multi) {
          if (input.checked) change(input.value);
          return;
        }
        change(inputs.filter(function (item) { return item.checked; }).map(function (item) { return item.value; }));
      });
      return input;
    });
    var steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    group.addEventListener('keydown', function (event) {
      var at = inputs.indexOf(event.target);
      var step = steps[event.key];
      if (at < 0 || event.altKey || event.ctrlKey || event.metaKey ||
        (step === undefined && event.key !== 'Home' && event.key !== 'End')) return;
      event.preventDefault();
      var next = inputs[event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 :
        (at + step + inputs.length) % inputs.length];
      next.focus();
      if (!multi && !next.checked) change(next.value);
    });
    box.appendChild(heading);
    box.appendChild(group);

    var settled = false;
    function glide() {
      var on = inputs.filter(function (input) { return input.checked; })[0];
      var chip = on && on.parentNode;
      var shown = Boolean(chip && chip.offsetWidth > 0);
      glider.classList.toggle('is-hidden', !shown);
      if (!shown) return;
      glider.style.setProperty('--df-chip-x', chip.offsetLeft + 'px');
      glider.style.setProperty('--df-chip-y', chip.offsetTop + 'px');
      glider.style.setProperty('--df-chip-w', chip.offsetWidth + 'px');
      glider.style.setProperty('--df-chip-h', chip.offsetHeight + 'px');
      if (settled) return;
      settled = true;
      // The first placement jumps into place; later ones slide.
      frame(function () { group.classList.remove('df-chips-still'); });
    }
    if (!multi && root.ResizeObserver) new root.ResizeObserver(glide).observe(group);
    return function (value) {
      inputs.forEach(function (input) {
        input.checked = multi ? value.includes(input.value) : input.value === value;
        input.parentNode.classList.toggle('is-selected', input.checked);
      });
      if (!multi) glide();
    };
  }

  function fold(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // A text field with role="combobox" that filters a listbox in a dropdown popover. A single choice shows its
  // label in the field; a multiselect lists removable chips before the field and adds All and None actions.
  function comboControl(box, key, def, text, change) {
    var multi = def.type === 'multiselect';
    var id = 'df-param-' + key + '-' + (++count);
    var choices = def.choices;
    var heading = labelFor(text, id);
    heading.id = id + '-label';
    var wrap = make('div', 'df-combo');
    var field = make('div', 'df-combo-field');
    var chips = null;
    if (multi) {
      chips = make('ul', 'df-combo-chips');
      chips.setAttribute('aria-label', 'Chosen');
      field.appendChild(chips);
    }
    var input = make('input', 'df-combo-input');
    input.type = 'text';
    input.id = id;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (multi) input.setAttribute('placeholder', 'Search choices');
    field.appendChild(input);
    wrap.appendChild(field);

    var panel = make('div', 'df-dropdown-panel df-combo-panel');
    panel.id = id + '-panel';
    var popover = typeof panel.showPopover === 'function' && DocForm.dropdowns && typeof DocForm.dropdowns.follow === 'function';
    if (popover) panel.setAttribute('popover', 'manual');
    else panel.hidden = true;
    var all = null;
    var none = null;
    var tally = null;
    if (multi) {
      var actions = make('div', 'df-combo-actions');
      all = make('button', 'df-combo-action', 'All');
      none = make('button', 'df-combo-action', 'None');
      tally = make('span', 'df-combo-count');
      [all, none].forEach(function (button) {
        button.type = 'button';
        actions.appendChild(button);
      });
      actions.appendChild(tally);
      panel.appendChild(actions);
      all.addEventListener('click', function () { change(choices.map(function (choice) { return choice.value; })); });
      none.addEventListener('click', function () { change([]); });
    }
    var list = make('ul', 'df-combo-list');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', heading.id);
    if (multi) list.setAttribute('aria-multiselectable', 'true');
    var options = choices.map(function (choice, i) {
      var option = make('li', 'df-combo-option');
      option.id = id + '-option-' + i;
      option.setAttribute('role', 'option');
      markChoice(option, def, choice);
      if (multi) {
        var tick = make('span', 'df-chip-check');
        tick.setAttribute('aria-hidden', 'true');
        option.appendChild(tick);
      }
      var label = make('span', 'df-combo-text', choice.label);
      option.appendChild(label);
      option.addEventListener('click', function () { pick(i); });
      option.addEventListener('mousemove', function () { if (active !== i) activate(i, false); });
      list.appendChild(option);
      return { el: option, label: label, folded: fold(choice.label), value: fold(choice.value) };
    });
    var empty = make('p', 'df-combo-empty', 'No matching choices');
    empty.setAttribute('role', 'status');
    empty.hidden = true;
    panel.appendChild(list);
    panel.appendChild(empty);
    wrap.appendChild(panel);
    box.appendChild(heading);
    box.appendChild(wrap);

    var selected = multi ? [] : null;
    var open = false;
    var active = -1;
    var query = '';
    var stop = null;
    var chipFor = new Map();
    var live = false;

    function labelOf(value) {
      var choice = choices.filter(function (c) { return c.value === value; })[0];
      return choice ? choice.label : '';
    }

    function isOn(i) {
      return multi ? selected.includes(choices[i].value) : selected === choices[i].value;
    }

    function visible() {
      return options.map(function (_, i) { return i; }).filter(function (i) { return !options[i].el.hidden; });
    }

    // Marks the first match in each label so readers see why it stayed.
    function highlight(item, needle) {
      var text = choices[options.indexOf(item)].label;
      var at = needle ? item.folded.indexOf(needle) : -1;
      if (at < 0 || item.folded.length !== text.length) {
        item.label.textContent = text;
        return;
      }
      item.label.textContent = '';
      item.label.appendChild(document.createTextNode(text.slice(0, at)));
      item.label.appendChild(make('mark', null, text.slice(at, at + needle.length)));
      item.label.appendChild(document.createTextNode(text.slice(at + needle.length)));
    }

    function filter() {
      var needle = fold(query.trim());
      options.forEach(function (item) {
        item.el.hidden = Boolean(needle) && item.folded.indexOf(needle) < 0 && item.value.indexOf(needle) < 0;
        highlight(item, needle);
      });
      var shown = visible();
      empty.hidden = shown.length > 0;
      if (shown.indexOf(active) < 0) activate(shown.length ? shown[0] : -1, true);
    }

    function activate(i, scroll) {
      if (active >= 0) options[active].el.classList.remove('is-active');
      active = i;
      if (i < 0) {
        input.removeAttribute('aria-activedescendant');
        return;
      }
      var el = options[i].el;
      el.classList.add('is-active');
      input.setAttribute('aria-activedescendant', el.id);
      if (scroll && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }

    function move(step) {
      var shown = visible();
      if (!shown.length) return;
      var at = shown.indexOf(active);
      activate(shown[at < 0 ? (step > 0 ? 0 : shown.length - 1) : (at + step + shown.length) % shown.length], true);
    }

    function show() {
      if (open) return;
      open = true;
      input.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
      filter();
      var shown = visible();
      var chosen = shown.filter(isOn);
      activate(chosen.length ? chosen[0] : shown.length ? shown[0] : -1, true);
      if (!popover) {
        panel.hidden = false;
        return;
      }
      if (field.offsetWidth) panel.style.minWidth = field.offsetWidth + 'px';
      panel.showPopover();
      stop = DocForm.dropdowns.follow(field, panel);
    }

    function hide() {
      if (!open) return;
      open = false;
      input.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('is-open');
      activate(-1, false);
      query = '';
      input.value = multi ? '' : labelOf(selected);
      if (!popover) {
        panel.hidden = true;
        return;
      }
      if (stop) stop();
      stop = null;
      if (panel.matches(':popover-open')) panel.hidePopover();
    }

    function pick(i) {
      var value = choices[i].value;
      if (!multi) {
        change(value);
        hide();
        return;
      }
      change(isOn(i) ? selected.filter(function (v) { return v !== value; }) : choices.map(function (c) { return c.value; })
        .filter(function (v) { return v === value || selected.includes(v); }));
    }

    function unpick(value) {
      change(selected.filter(function (v) { return v !== value; }));
    }

    if (popover) {
      // The popover closes itself when its field scrolls out of view.
      panel.addEventListener('toggle', function (event) { if (event.newState === 'closed') hide(); });
    }
    // Keep focus in the field while pointing at choices and actions.
    panel.addEventListener('mousedown', function (event) { event.preventDefault(); });
    input.addEventListener('click', show);
    input.addEventListener('focus', function () {
      if (!multi && typeof input.select === 'function') input.select();
    });
    input.addEventListener('input', function () {
      query = input.value;
      if (!open) show();
      filter();
      var shown = visible();
      activate(shown.length ? shown[0] : -1, true);
    });
    input.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        if (!open) show();
        else if (!event.altKey) move(key === 'ArrowDown' ? 1 : -1);
        else if (key === 'ArrowUp') hide();
      } else if (key === 'Enter') {
        if (!open || active < 0) return;
        event.preventDefault();
        pick(active);
      } else if (key === 'Escape') {
        if (open) {
          event.preventDefault();
          hide();
        } else if (input.value && multi) input.value = '';
        else if (!multi) input.value = labelOf(selected);
      } else if (key === 'Tab') hide();
      else if (key === 'Backspace' && multi && !input.value && selected.length) unpick(selected[selected.length - 1]);
    });
    wrap.addEventListener('focusout', function (event) {
      var next = event.relatedTarget;
      if (!next || !(typeof wrap.contains === 'function' && wrap.contains(next))) hide();
    });

    function renderChips() {
      Array.from(chipFor.keys()).forEach(function (value) {
        if (selected.includes(value)) return;
        chipFor.get(value).remove();
        chipFor.delete(value);
      });
      choices.forEach(function (choice, i) {
        if (!selected.includes(choice.value) || chipFor.has(choice.value)) return;
        var chip = make('li', 'df-combo-chip' + (live ? ' is-new' : ''));
        chip.appendChild(make('span', 'df-combo-chip-text', choice.label));
        var remove = make('button', 'df-combo-remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + choice.label);
        remove.addEventListener('click', function () {
          unpick(choice.value);
          input.focus();
        });
        chip.appendChild(remove);
        // Insert before the next chosen chip so chips keep declaration order without moving existing ones.
        var later = choices.slice(i + 1).map(function (c) { return chipFor.get(c.value); }).filter(Boolean)[0];
        chips.insertBefore(chip, later || null);
        chipFor.set(choice.value, chip);
      });
    }

    return function (value) {
      selected = value;
      options.forEach(function (item, i) { item.el.setAttribute('aria-selected', String(isOn(i))); });
      if (multi) {
        renderChips();
        all.disabled = selected.length === choices.length;
        none.disabled = !selected.length;
        tally.textContent = selected.length + ' of ' + choices.length + ' chosen';
      } else if (!open || !query) input.value = labelOf(value);
      live = true;
    };
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

  function resolveScope(el, allowLegacy) {
    var name = DocForm.data(el, 'scope', null);
    if (name === null) {
      for (var node = el; node; node = node.parentElement) {
        name = node.getAttribute(scopeMarker);
        if (name !== null) break;
      }
    }
    if (name === null && allowLegacy && !scopes.has('page')) return undefined;
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
    var scope = resolveScope(el, false);
    return scope ? scope.link() : null;
  };
  DocForm._parameterScope = function (el) {
    var scope = resolveScope(el, false);
    return scope ? scope.api : null;
  };

  // Stored group keys count only when a participant offers them, so linked choices join the startup domain.
  if (DocForm._items) DocForm._items.scan('parameters', function () {
    scopes.forEach(function (scope) { scope.groupDomains(); });
  });

  var configured = (boot ? DocForm.site : root.DocFormSite) || {};
  if (configured.parameterScopes !== undefined) {
    if (record(configured.parameterScopes)) {
      Object.keys(configured.parameterScopes).forEach(function (name) { define(name, configured.parameterScopes[name]); });
    } else parameterIssue(null, 'Parameter scopes must be an object keyed by scope name.');
  }
  if (boot) boot.after('parameters', finishScopes);

  DocForm.params = {
    get: function (name) { return values[name]; },
    set: function (name, value) { return set(name, value, null); },
    apply: function (update) { return apply(update, null); },
    values: snapshot,
    on: on,
    format: format,
    digitsOf: digitsOf,
    evaluate: evaluate,
    fill: fill
  };

  DocForm.register('params', function () {
    DocForm.all('[data-df-param]').forEach(control);
    DocForm.all('[data-df-parameter]').forEach(function (el) {
      var scope = resolveScope(el, false);
      if (scope) scope.control(el);
    });
    DocForm.all('[data-df-preset]').forEach(function (el) {
      var scope = resolveScope(el, true);
      if (scope === null) {
        el.classList.add('df-preset');
        el.setAttribute('aria-disabled', 'true');
        if (!el.hasAttribute('type')) el.setAttribute('type', 'button');
      } else preset(el, scope);
    });
    DocForm.all('[data-df-bind], [data-df-template]').forEach(function (el) {
      var scope = resolveScope(el, true);
      if (scope !== null) bind(el, scope ? scope.bindings : bindings);
    });
    DocForm.all('[data-df-show-when]').forEach(function (el) {
      var scope = resolveScope(el, false);
      if (scope) showWhen(el, scope.shows);
    });
    started = true;
    scopes.forEach(function (scope) {
      renderPresets(scope.presets, scope.api.snapshot());
      scope.render();
      scope.renderShows(false);
      scope.joinGroups();
    });
    markPresets();
    listeners.slice().forEach(function (l) { if (ready(l)) l.fn(snapshot(), null, l.names.slice()); });
    updateBindings();
    if (!boot) finishScopes();
  });
})(typeof window !== 'undefined' ? window : globalThis);
