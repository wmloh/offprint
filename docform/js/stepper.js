// Previous, Next, and Reset for an authored sequence of worked steps.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] stepper.js needs core.js loaded before it.');
    return;
  }

  var states = new WeakMap();
  var selectors = new WeakMap();

  function button(controls, id, label, activate) {
    var control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.setAttribute('aria-controls', id);
    control.addEventListener('click', activate);
    controls.appendChild(control);
    return control;
  }

  function setup(list, views) {
    var steps = DocForm.all(':scope > li', list);
    var keys = new Set();
    var entries = steps.map(function (step, index) {
      var key = DocForm.data(step, 'step-key', '').trim();
      var title = step.querySelector(':scope > [data-df-step-name]');
      var name = title ? title.textContent.trim() : '';
      if (!key || !name || keys.has(key)) return null;
      keys.add(key);
      return Object.freeze({ index: index, key: key, name: name, total: steps.length });
    });
    if (!list.id || !entries.length || entries.includes(null)) {
      DocForm.warnOnce('stepper:markup', 'A stepper needs an ordered list with an id, and a unique step key and short name on every step.');
      return;
    }

    var bindings = [];
    views.forEach(function (view) {
      if (DocForm.data(view, 'stepper-view') !== list.id) return;
      var key = DocForm.data(view, 'step-key').trim();
      if (keys.has(key)) bindings.push({ view: view, key: key });
    });

    var controls = document.createElement('div');
    controls.className = 'df-stepper-controls';
    var status = document.createElement('span');
    status.className = 'df-stepper-status';
    status.setAttribute('role', 'status');
    controls.appendChild(status);

    var index = -1;
    var previous = button(controls, list.id, 'Previous', function () { show(index - 1); });
    var next = button(controls, list.id, 'Next', function () { show(index + 1); });
    var reset = button(controls, list.id, 'Reset', function () { show(0); });

    function show(position) {
      if (position < 0 || position >= entries.length || position === index) return;
      index = position;
      var state = entries[index];
      states.set(list, state);
      steps.forEach(function (step, i) {
        step.hidden = i !== index;
        if (i === index) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
      bindings.forEach(function (binding) {
        binding.view.toggleAttribute('hidden', binding.key !== state.key);
      });
      // Keep focus on the activated control when it reaches a boundary.
      previous.setAttribute('aria-disabled', String(index === 0));
      next.setAttribute('aria-disabled', String(index === entries.length - 1));
      reset.setAttribute('aria-disabled', String(index === 0));
      status.textContent = 'Step ' + (index + 1) + ' of ' + entries.length;
      list.dispatchEvent(new root.CustomEvent('df:stepperchange', { bubbles: true, detail: state }));
    }

    selectors.set(list, function (key) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].key === key) { show(i); return true; }
      }
      return false;
    });

    list.before(controls);
    list.classList.add('df-stepper-ready');
    list.setAttribute('role', 'list');
    show(0);
  }

  function listFor(target) {
    return typeof target === 'string' ? document.getElementById(target) : target;
  }

  DocForm.stepper = {
    get: function (target) {
      return states.get(listFor(target)) || null;
    },
    // Shows the step with this key exactly as Previous and Next would; false for an unknown list or key.
    select: function (target, key) {
      var select = selectors.get(listFor(target));
      if (!select) {
        DocForm.warnOnce('stepper:select', 'DocForm.stepper.select needs the id or element of a stepper list that is set up.');
        return false;
      }
      if (select(key)) return true;
      DocForm.warnOnce('stepper:select:' + key, 'This stepper has no step with the key "' + key + '".');
      return false;
    }
  };

  DocForm.register('stepper', function () {
    var views = DocForm.all('[data-df-stepper-view][data-df-step-key]');
    DocForm.all('ol[data-df-stepper]').forEach(function (list) { setup(list, views); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
