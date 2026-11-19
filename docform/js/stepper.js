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
      // aria-disabled keeps focus on the activated control when it reaches a boundary.
      buttons.previous.setAttribute('aria-disabled', String(index === 0));
      buttons.next.setAttribute('aria-disabled', String(index === steps.length - 1));
      buttons.reset.setAttribute('aria-disabled', String(index === domain.initial));
      controls.count.textContent = 'Step ' + (index + 1) + ' of ' + steps.length;
    });

    var move = function (by) {
      return function () { state.choose(state.controller.snapshot().index + by, 'user'); };
    };
    var controls = DocForm._pill.create('df-stepper-controls', 'Worked example steps', [
      { name: 'reset', label: 'Reset', run: state.controller.reset },
      { name: 'previous', label: 'Previous step', run: move(-1) },
      'count',
      { name: 'next', label: 'Next step', run: move(1) }
    ], list.id);
    var buttons = controls.buttons;

    list.before(controls.element);
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
