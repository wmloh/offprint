// Previous, Next, and Reset for an authored sequence of worked steps.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] stepper.js needs core.js loaded before it.');
    return;
  }

  var items = DocForm._items;
  var controllers = new WeakMap();
  var HOST = 'ol[data-df-stepper]';

  function button(controls, id, label, activate) {
    var control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.setAttribute('aria-controls', id);
    control.addEventListener('click', activate);
    controls.appendChild(control);
    return control;
  }

  function prepare(list) {
    var domain = items.domain('stepper', list, DocForm.all(':scope > li', list));
    if (!domain) return null;
    domain.labels = domain.items.map(function (step) {
      var title = step.querySelector(':scope > [data-df-step-label]');
      return title ? title.textContent.trim() : '';
    });
    if (!list.id || domain.labels.includes('')) {
      items.issue('stepper', list, 'A worked example needs a list ID and a short label on each step.',
        'Set id on the list and data-df-step-label on a direct child of each item.');
      return null;
    }
    return domain;
  }

  function setup(list, views) {
    var domain = prepare(list);
    if (!domain) return;
    var steps = domain.items;
    var bindings = [];
    views.forEach(function (view) {
      if (DocForm.data(view, 'stepper-view') !== list.id) return;
      var key = items.key(DocForm.data(view, 'key'));
      if (domain.keys.includes(key)) bindings.push({ view: view, key: key });
    });

    var controls = document.createElement('div');
    controls.className = 'df-stepper-controls';
    var status = document.createElement('span');
    status.className = 'df-stepper-status';
    status.setAttribute('role', 'status');
    controls.appendChild(status);

    var state = items.controller('stepper', list, domain, function (index, key) {
      return { key: key, index: index, label: domain.labels[index], total: steps.length };
    }, function (current) {
      var index = current.index;
      steps.forEach(function (step, i) {
        step.hidden = i !== index;
        if (i === index) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
      bindings.forEach(function (binding) {
        binding.view.toggleAttribute('hidden', binding.key !== current.key);
      });
      // Keep focus on the activated control when it reaches a boundary.
      previous.setAttribute('aria-disabled', String(index === 0));
      next.setAttribute('aria-disabled', String(index === steps.length - 1));
      reset.setAttribute('aria-disabled', String(index === domain.initial));
      status.textContent = 'Step ' + (index + 1) + ' of ' + steps.length;
    });

    var previous = button(controls, list.id, 'Previous', function () {
      state.choose(state.controller.snapshot().index - 1, 'user');
    });
    var next = button(controls, list.id, 'Next', function () {
      state.choose(state.controller.snapshot().index + 1, 'user');
    });
    var reset = button(controls, list.id, 'Reset', state.controller.reset);

    list.before(controls);
    list.classList.add('df-stepper-ready');
    list.setAttribute('role', 'list');
    controllers.set(list, state.controller);
    state.start();
  }

  DocForm.stepper = {
    get: function (target) { return controllers.get(items.target(target)) || null; }
  };

  items.scan('stepper', function () {
    DocForm.all(HOST).forEach(function (list) { items.collect('stepper', list, prepare(list)); });
  });
  DocForm.register('stepper', function () {
    var views = DocForm.all('[data-df-stepper-view][data-df-key]');
    DocForm.all(HOST).forEach(function (list) { setup(list, views); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
