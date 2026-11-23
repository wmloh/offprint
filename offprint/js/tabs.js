(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] tabs.js needs core.js loaded before it.');
    return;
  }

  var items = OffPrint._items;
  var controllers = new WeakMap();
  var HOST = '.op-tabs, [data-op-tabs]';
  var count = 0;

  function prepare(el) {
    return items.domain('tabs', el, OffPrint._all(':scope > [data-op-tab]', el));
  }

  function build(el) {
    var domain = prepare(el);
    if (!domain) return;
    var panels = domain.items;
    var id = el.id || 'op-tabs-' + (++count);
    var list = document.createElement('div');
    list.className = 'op-tab-list';
    list.setAttribute('role', 'tablist');
    var tabs = [];
    var state = items.controller('tabs', el, domain, function (index, key) {
      return { key: key, index: index };
    }, function (current) {
      tabs.forEach(function (tab, i) {
        var on = i === current.index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
    });

    function choose(index, focus) {
      // Keep the activated tab at the same screen position when another tab set changes height.
      var top = el.getBoundingClientRect().top;
      state.choose(index, 'user');
      if (focus) tabs[index].focus({ preventScroll: true });
      var offset = el.getBoundingClientRect().top - top;
      if (offset) root.scrollBy(0, offset);
    }

    panels.forEach(function (panel, i) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'op-tab';
      tab.id = id + '-tab-' + i;
      tab.textContent = panel.getAttribute('data-op-tab') || 'Tab ' + (i + 1);
      tab.setAttribute('role', 'tab');
      if (!panel.id) panel.id = id + '-panel-' + i;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.classList.add('op-tab-panel');
      if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
      tab.addEventListener('click', function () { choose(i, false); });
      tabs.push(tab);
      list.appendChild(tab);
    });

    list.addEventListener('keydown', function (event) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = tabs.length;
      var to = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[event.key];
      if (typeof to !== 'number') return;
      event.preventDefault();
      choose(to % n, true);
    });

    el.insertBefore(list, el.firstChild);
    el.classList.add('op-tabs', 'op-tabs-ready');
    controllers.set(el, state.controller);
    state.start();
  }

  OffPrint._tabs = {
    get: function (target) { return controllers.get(items.target(target)) || null; }
  };
  items.scan('tabs', function () {
    OffPrint._all(HOST).forEach(function (el) { items.collect('tabs', el, prepare(el)); });
  });
  OffPrint.register('tabs', function () { OffPrint._all(HOST).forEach(build); });
})(typeof window !== 'undefined' ? window : globalThis);
