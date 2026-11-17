(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] params.js needs core.js loaded before it.');
    return;
  }

  var NAME_RE = /^[A-Za-z_$][\w$]*$/;
  var TEMPLATE_RE = /\{\{([\s\S]+?)\}\}/g;
  var values = {};
  var digits = {};
  var inputs = {};
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
    return Object.prototype.hasOwnProperty.call(digits, name) ? digits[name] : null;
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
    return listener.names.every(function (n) { return Object.prototype.hasOwnProperty.call(values, n); });
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

  function set(name, value, source) {
    if (!NAME_RE.test(name)) {
      DocForm.warnOnce('param-name:' + name, 'Parameter "' + name + '" must be a valid identifier such as theta or a_1.');
      return;
    }
    value = Number(value);
    if (!isFinite(value)) return;
    values[name] = value;
    (inputs[name] || []).forEach(function (slider) {
      if (slider.input !== source) slider.input.value = String(value);
      slider.output.textContent = format(value, digits[name]);
    });
    if (!started) return;
    listeners.forEach(function (l) {
      if (l.names.indexOf(name) >= 0 && ready(l)) l.fn(snapshot(), name);
    });
    schedule();
  }

  // Calls fn(values, changedName) once all named parameters exist and whenever one of them changes.
  function on(names, fn) {
    var listener = { names: [].concat(names), fn: fn };
    listeners.push(listener);
    if (started && ready(listener)) fn(snapshot(), null);
    return function off() {
      var i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function slider(host) {
    var name = host.getAttribute('data-df-param').trim();
    if (!NAME_RE.test(name)) {
      DocForm.warnOnce('param-name:' + name, 'Parameter "' + name + '" must be a valid identifier such as theta or a_1.');
      return;
    }
    var min = DocForm.num(host, 'min', 0);
    var max = DocForm.num(host, 'max', 1);
    var step = DocForm.data(host, 'step', null);
    if (step === null || !(parseFloat(step) > 0)) step = String(Math.round((max - min) / 100 * 1e6) / 1e6 || 1);
    var initial = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : DocForm.num(host, 'value', min);
    if (!(name in digits)) digits[name] = DocForm.num(host, 'digits', digitsOf(step));

    var id = 'df-param-' + name + '-' + (++count);
    var label = document.createElement('label');
    label.className = 'df-param-label';
    label.htmlFor = id;
    var text = DocForm.data(host, 'label', name);
    if (DocForm.math && DocForm.math.mixed) label.innerHTML = DocForm.math.mixed(text);
    else label.textContent = text;

    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'df-param-input';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = step;
    input.value = String(initial);

    var output = document.createElement('output');
    output.className = 'df-param-value';
    output.htmlFor = id;

    host.textContent = '';
    host.classList.add('df-param');
    host.appendChild(label);
    host.appendChild(input);
    host.appendChild(output);

    (inputs[name] = inputs[name] || []).push({ input: input, output: output });
    input.addEventListener('input', function () { set(name, input.valueAsNumber, input); });
    set(name, input.valueAsNumber);
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
    set: function (name, value) { set(name, value, null); },
    values: snapshot,
    on: on,
    format: format,
    digitsOf: digitsOf,
    evaluate: evaluate,
    fill: fill
  };

  DocForm.register('params', function () {
    DocForm.all('[data-df-param]').forEach(slider);
    DocForm.all('[data-df-bind], [data-df-template]').forEach(bind);
    started = true;
    listeners.slice().forEach(function (l) { if (ready(l)) l.fn(snapshot(), null); });
    updateBindings();
  });
})(typeof window !== 'undefined' ? window : globalThis);
