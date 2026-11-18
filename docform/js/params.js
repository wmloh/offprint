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
  var values = {};
  var digits = {};
  var controls = {};
  var presets = [];
  var listeners = [];
  var bindings = [];
  var started = false;
  var pending = false;
  var compiled = {};
  var count = 0;

  // Decimal places implied by a slider step, such as 2 for 0.05.
  function digitsOf(step) {
    var text = String(step);
    var m = text.match(/e-(\d+)$/);
    if (m) return parseInt(m[1], 10);
    var dot = text.indexOf('.');
    return dot < 0 ? 0 : text.length - dot - 1;
  }

  // Fixed decimals when `places` is given, otherwise up to three decimals with trailing zeros dropped.
  function format(value, places) {
    if (typeof value !== 'number') return String(value);
    if (!isFinite(value)) return isNaN(value) ? '?' : value > 0 ? '∞' : '−∞';
    var text = places == null ? String(Math.round(value * 1000) / 1000) : value.toFixed(places);
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

  function placesFor(expr, places) {
    if (places != null) return places;
    var name = expr.trim();
    return hasOwn.call(digits, name) ? digits[name] : null;
  }

  function show(expr, scope, places) {
    try {
      return format(evaluate(expr, scope), placesFor(expr, places));
    } catch (e) {
      DocForm.warnOnce('param-expr:' + expr, 'Cannot evaluate "' + expr + '": ' + (e && e.message ? e.message : e));
      return '?';
    }
  }

  // Replaces each {{expression}} or {{expression|places}} in the template with its formatted value.
  function fill(template, scope) {
    return String(template).replace(TEMPLATE_RE, function (all, body) {
      var m = body.match(/^([\s\S]*?[^|])\|\s*(\d+)\s*$/);
      return m ? show(m[1], scope, parseInt(m[2], 10)) : show(body, scope, null);
    });
  }

  function snapshot() {
    var copy = {};
    Object.keys(values).forEach(function (k) { copy[k] = values[k]; });
    return copy;
  }

  function ready(listener) {
    return listener.names.every(function (n) { return hasOwn.call(values, n); });
  }

  function updateBindings() {
    pending = false;
    var scope = snapshot();
    bindings.forEach(function (b) {
      var text = b.template === null ? show(b.expr, scope, b.places) : fill(b.template, scope);
      if (text === b.last) return;
      b.last = text;
      if (b.el.classList.contains('df-math') && DocForm.math) DocForm.math.set(b.el, text);
      else if (b.template !== null && DocForm.math && DocForm.math.mixed) b.el.innerHTML = DocForm.math.mixed(text);
      else b.el.textContent = text;
    });
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
    var next = {};
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
    return Object.keys(a).every(function (n) { return hasOwn.call(b, n) && b[n] === a[n]; });
  }

  function markPresets() {
    presets.forEach(function (p) {
      if (same(p.values, values)) p.el.setAttribute('aria-current', 'true');
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
    var next = {};
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

  function labelFor(host, name, id) {
    var label = document.createElement('label');
    label.className = 'df-param-label';
    label.htmlFor = id;
    var text = DocForm.data(host, 'label', name);
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

    var label = labelFor(host, name, id);
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

  function preset(button) {
    var label = button.textContent.trim() || button.getAttribute('data-df-preset');
    var update;
    try {
      update = JSON.parse(button.getAttribute('data-df-preset'));
    } catch (e) {
      update = undefined;
    }
    var result = update === undefined ? { error: 'must be valid JSON.' } : checkAll(update);
    button.classList.add('df-preset');
    if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
    if (result.error) {
      DocForm.warnOnce('param-preset:' + label + ':' + result.error, 'Preset "' + label + '" ' + result.error);
      button.setAttribute('aria-disabled', 'true');
      return;
    }
    presets.push({ el: button, values: result.values });
    button.addEventListener('click', function () { apply(result.values, label); });
  }

  function bind(el) {
    var template = el.getAttribute('data-df-template');
    var expr = el.getAttribute('data-df-bind');
    if (template === null && (expr === null || !expr.trim())) return;
    bindings.push({
      el: el,
      template: template,
      expr: template === null ? expr : null,
      places: DocForm.num(el, 'digits', null),
      last: null
    });
  }

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
    DocForm.all('[data-df-preset]').forEach(preset);
    DocForm.all('[data-df-bind], [data-df-template]').forEach(bind);
    started = true;
    markPresets();
    listeners.slice().forEach(function (l) { if (ready(l)) l.fn(snapshot(), null, l.names.slice()); });
    updateBindings();
  });
})(typeof window !== 'undefined' ? window : globalThis);
