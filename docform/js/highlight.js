// Linked highlighting for items that share a group and key.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] highlight.js needs core.js loaded before it.');
    return;
  }

  var GROUP = 'data-df-highlight-group';
  var KEY = 'data-df-highlight-key';
  var ACTIVE = 'data-df-highlight-active';
  var ITEM = '[' + GROUP + '][' + KEY + ']';
  var CONTROL = 'button, [role="button"][tabindex]';
  var selections = new Map();
  var pressed = new WeakSet();

  function get(group) {
    return selections.get(group) || null;
  }

  function sync(el) {
    var group = el.getAttribute(GROUP);
    var key = el.getAttribute(KEY);
    var active = Boolean(group && key && get(group) === key);
    el.toggleAttribute(ACTIVE, active);
    if (group && key && el.matches(CONTROL)) {
      var value = String(active);
      if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
      pressed.add(el);
    } else if (pressed.delete(el)) {
      el.removeAttribute('aria-pressed');
    }
  }

  function set(group, key) {
    if (typeof group !== 'string' || !group || (key !== null && (typeof key !== 'string' || !key))) return;
    if (get(group) === key) return;
    if (key === null) selections.delete(group);
    else selections.set(group, key);
    DocForm.all(ITEM).forEach(function (el) {
      if (el.getAttribute(GROUP) === group) sync(el);
    });
    document.dispatchEvent(new root.CustomEvent('df:highlightchange', { detail: { group: group, key: key } }));
  }

  function toggle(el) {
    var group = el.getAttribute(GROUP);
    var key = el.getAttribute(KEY);
    set(group, get(group) === key ? null : key);
  }

  function controlFor(target) {
    var el = target.closest && target.closest(CONTROL);
    if (el && el.matches(ITEM) && !el.matches(':disabled, [aria-disabled="true"]')) return el;
    return null;
  }

  function syncAdded(node) {
    if (node.nodeType !== 1 || !document.body.contains(node)) return;
    if (node.matches(ITEM)) sync(node);
    DocForm.all(ITEM, node).forEach(sync);
  }

  DocForm.highlight = { get: get, set: set };

  DocForm.register('highlight', function () {
    DocForm.all(ITEM).forEach(sync);
    // Redraws can replace controls or reuse marks with a different key.
    new root.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') sync(record.target);
        else record.addedNodes.forEach(syncAdded);
      });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributeFilter: [GROUP, KEY, 'role', 'tabindex']
    });

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      var control = controlFor(event.target);
      if (control) toggle(control);
    });
    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
      var control = controlFor(event.target);
      if (!control || control !== event.target || control.matches('button')) return;
      event.preventDefault();
      if (!event.repeat) toggle(control);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
