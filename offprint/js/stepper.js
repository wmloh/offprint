// Previous, Next, and Reset for an authored sequence of worked steps.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] stepper.js needs core.js loaded before it.');
    return;
  }

  var items = OffPrint._items;
  var sequence = OffPrint._sequence;
  var HOST = 'ol[data-op-stepper]';

  function prepare(list) {
    var domain = items.domain('stepper', list, OffPrint._all(':scope > li', list));
    if (!domain) return null;
    domain.labels = domain.items.map(function (step) {
      return sequence.label(step);
    });
    if (!list.id || domain.labels.includes('')) {
      items.issue('stepper', list, 'A worked example needs a list ID and a short label on each step.',
        'Set id on the list and data-op-step-label on a direct child of each item.');
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
      if (OffPrint._data(view, 'stepper-view') !== list.id) return;
      var key = items.key(OffPrint._data(view, 'key'));
      if (domain.keys.includes(key)) bindings.push({ view: view, key: key });
    });

    var details = steps.map(sequence.detail);
    var state = sequence.indexed('stepper', list, domain, function (index) {
      steps.forEach(function (step, i) {
        step.hidden = i !== index;
        if (i === index) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
      sequence.showDetails(details, index);
      bindings.forEach(function (binding) {
        binding.view.toggleAttribute('hidden', binding.key !== domain.keys[index]);
      });
    });
    var controls = sequence.pill(state, {
      className: 'op-stepper-controls', label: 'Worked example steps', controls: list.id,
      initial: function () { return domain.initial; }
    });

    list.before(controls.element);
    list.classList.add('op-stepper-ready');
    list.setAttribute('role', 'list');
    state.start();
  }

  items.scan('stepper', function () {
    OffPrint._all(HOST).forEach(function (list) { items.collect('stepper', list, prepare(list)); });
  });
  OffPrint.register('stepper', function () {
    var views = OffPrint._all('[data-op-stepper-view][data-op-key]');
    OffPrint._all(HOST).forEach(function (list) { setup(list, views); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
