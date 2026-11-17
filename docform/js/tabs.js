(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] tabs.js needs core.js loaded before it.');
    return;
  }

  var STORE = 'docform-tab:';
  var groups = {};
  var count = 0;

  function key(label) {
    return String(label).trim().toLowerCase();
  }

  function remember(group, label) {
    try {
      root.localStorage.setItem(STORE + group, key(label));
    } catch (e) {
      // Storage can be blocked; synchronization then lasts only for this page view.
    }
  }

  function recall(group) {
    try {
      return root.localStorage.getItem(STORE + group);
    } catch (e) {
      return null;
    }
  }

  // Selects the tab whose label matches; returns false when the set has no such tab.
  function select(set, label, focus) {
    var index = -1;
    set.tabs.forEach(function (tab, i) { if (key(tab.textContent) === key(label)) index = i; });
    if (index < 0) return false;
    set.tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      set.panels[i].hidden = !on;
    });
    if (focus) set.tabs[index].focus();
    return true;
  }

  function choose(set, label, focus) {
    if (!set.group) {
      select(set, label, focus);
      return;
    }
    // Keep the chosen tab at the same screen position while synced groups above it change height.
    var anchor = set.root.getBoundingClientRect().top;
    groups[set.group].forEach(function (other) { select(other, label, focus && other === set); });
    root.scrollBy(0, set.root.getBoundingClientRect().top - anchor);
    remember(set.group, label);
  }

  function build(el) {
    var panels = Array.prototype.filter.call(el.children, function (child) { return child.hasAttribute('data-df-tab'); });
    if (!panels.length) return;
    var id = el.id || 'df-tabs-' + (++count);
    var list = document.createElement('div');
    list.className = 'df-tab-list';
    list.setAttribute('role', 'tablist');
    var set = { root: el, tabs: [], panels: panels, group: DocForm.data(el, 'tab-group', null) };

    panels.forEach(function (panel, i) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'df-tab';
      tab.id = id + '-tab-' + i;
      tab.textContent = panel.getAttribute('data-df-tab') || 'Tab ' + (i + 1);
      tab.setAttribute('role', 'tab');
      if (!panel.id) panel.id = id + '-panel-' + i;
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.classList.add('df-tab-panel');
      if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
      tab.addEventListener('click', function () { choose(set, tab.textContent, false); });
      set.tabs.push(tab);
      list.appendChild(tab);
    });

    list.addEventListener('keydown', function (event) {
      var i = set.tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = set.tabs.length;
      var to = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      choose(set, set.tabs[to % n].textContent, true);
    });

    el.insertBefore(list, el.firstChild);
    el.classList.add('df-tabs', 'df-tabs-ready');
    var initial = panels.find(function (p) { return DocForm.flag(p, 'selected'); });
    select(set, set.tabs[initial ? panels.indexOf(initial) : 0].textContent, false);
    if (set.group) {
      (groups[set.group] = groups[set.group] || []).push(set);
      var saved = recall(set.group);
      if (saved) select(set, saved, false);
    }
  }

  DocForm.tabs = { select: function (group, label) {
    (groups[group] || []).forEach(function (set) { select(set, label, false); });
    remember(group, label);
  } };

  DocForm.register('tabs', function () {
    DocForm.all('.df-tabs, [data-df-tabs]').forEach(build);
  });
})(typeof window !== 'undefined' ? window : globalThis);
