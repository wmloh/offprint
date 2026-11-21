// Shared keyed selection and plain HTML, SVG, and button participants.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] highlight.js needs core.js loaded before it.');
    return;
  }

  var items = DocForm._items;
  var GROUP = 'data-df-selection-group';
  var KEY = 'data-df-key';
  var ACTIVE = 'data-df-selection-active';
  var ITEM = '[' + GROUP + '][' + KEY + ']';
  var CONTROL = 'button:not([role="tab"]), [role="button"][tabindex]';
  var DISABLED = ':disabled, [aria-disabled="true"]';
  var groups = new Map();
  var pressed = new WeakSet();
  var configured = false;
  var started = false;

  function groupFor(name) {
    return groups.get(items.key(name));
  }

  function storageKey(name) {
    return 'docform-selection:' + JSON.stringify([DocForm.site.base, name]);
  }

  function load(name) {
    try { return items.key(root.localStorage.getItem(storageKey(name))); }
    catch (error) { return null; }
  }

  function save(name, key) {
    try {
      if (key === null) root.localStorage.removeItem(storageKey(name));
      else root.localStorage.setItem(storageKey(name), key);
    } catch (error) {
      // Local storage can be blocked when reading from disk.
    }
  }

  function invalid(message) {
    items.issue('selection', null, message, 'Use a distinct group name, an optional key or null for initial, and a boolean persist.');
  }

  function define(name, options) {
    name = items.key(name);
    if (!name || groups.has(name)) {
      invalid('Invalid or duplicate selection group "' + name + '".');
      return null;
    }
    if (options === undefined) options = {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      invalid('Selection group "' + name + '" needs an options object.');
      return null;
    }
    var initial = options.initial === undefined ? undefined : items.key(options.initial);
    if (initial === null && options.initial !== null) {
      invalid('Invalid initial key in selection group "' + name + '".');
      initial = undefined;
    }
    if (options.persist !== undefined && typeof options.persist !== 'boolean') {
      invalid('Invalid persistence option in selection group "' + name + '".');
    }

    var current = started ? Object.freeze({ key: null }) : null;
    var keys = new Set();
    var seeds = [];
    var custom = [];
    var followers = new Set();
    var events = items.signal('selection', null, function () { return current; });
    var persist = options.persist === true;
    var origin;

    function commit(key, from, notifyLocal) {
      var previous = current;
      var changed = !previous || previous.key !== key;
      var notifications = notifyLocal ? [notifyLocal] : [];
      if (changed) {
        current = Object.freeze({ key: key });
        if (persist && started) save(name, key);
        followers.forEach(function (apply) {
          var notify = apply(key);
          if (notify) notifications.push(notify);
        });
        DocForm.all(ITEM).forEach(function (el) {
          if (items.key(el.getAttribute(GROUP)) === name) sync(el);
        });
      } else if (key === null && persist && started) {
        save(name, key);
      }
      notifications.forEach(function (notify) { notify(); });
      if (changed) events.emit(current, previous, from, name);
      return true;
    }

    function write(key, from) {
      if (!started) return false;
      return items.transaction(function () { return commit(key, from); });
    }

    var api = {
      get: function () { return current ? current.key : null; },
      snapshot: function () { return current || Object.freeze({ key: null }); },
      select: function (key) {
        key = items.key(key);
        return key !== null && write(key, 'api');
      },
      clear: function () { return write(null, 'api'); },
      subscribe: events.subscribe
    };

    var group = {
      api: api,
      commit: commit,
      toggle: function (key) {
        return items.transaction(function () { return commit(api.get() === key ? null : key, 'user'); });
      },
      follow: function (apply) {
        followers.add(apply);
        return function () { followers.delete(apply); };
      },
      collect: function (domain, candidates) {
        domain.forEach(function (key) { keys.add(key); });
        seeds.push.apply(seeds, candidates);
      },
      seed: function (key) {
        if (started) return false;
        custom.push(key);
        return true;
      },
      prepare: function () { keys.clear(); seeds.length = 0; },
      start: function () {
        var stored = persist && initial === undefined ? load(name) : null;
        var key = initial === undefined ? null : initial;
        origin = 'init';
        if (initial === undefined) {
          if (stored && (keys.has(stored) || custom.includes(stored))) {
            key = stored;
            origin = 'storage';
          } else {
            seeds.sort(function (a, b) {
              var position = a[0].compareDocumentPosition(b[0]);
              return position & 4 ? -1 : position & 2 ? 1 : 0;
            });
            key = seeds.length ? seeds[0][1] : custom[0] || null;
          }
        }
        current = Object.freeze({ key: key });
        keys.clear();
        seeds.length = 0;
        custom.length = 0;
      },
      finish: function () { if (origin) events.emit(current, null, origin, name); }
    };
    groups.set(name, group);
    if (started && initial !== undefined) {
      items.transaction(function () { return commit(initial, 'init'); });
    }
    return api;
  }

  function ensure(name) {
    name = items.key(name);
    if (!name) return null;
    if (!groups.has(name)) define(name);
    return groups.get(name);
  }

  function sync(el) {
    var key = items.key(el.getAttribute(KEY));
    var group = key && ensure(el.getAttribute(GROUP));
    var active = Boolean(group && group.api.get() === key);
    el.toggleAttribute(ACTIVE, active);
    if (group && el.matches(CONTROL)) {
      var value = String(active);
      if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
      pressed.add(el);
    } else if (pressed.delete(el)) {
      el.removeAttribute('aria-pressed');
    }
  }

  function prepare() {
    if (!configured) {
      configured = true;
      var options = DocForm.site.selectionGroups;
      if (options) Object.keys(options).forEach(function (name) { define(name, options[name]); });
    }
    groups.forEach(function (group) { group.prepare(); });
    DocForm.all(ITEM).forEach(function (el) {
      var key = items.key(el.getAttribute(KEY));
      if (!key) return;
      collect(el.getAttribute(GROUP), [key], el.matches(CONTROL) && !el.matches(DISABLED) &&
        items.flag(el, 'selection-seed', 'selection') ? [[el, key]] : []);
    });
  }

  function collect(name, keys, seeds) {
    var group = ensure(name);
    if (group && !started) group.collect(keys, seeds);
  }

  function controlFor(target) {
    var el = target.closest && target.closest(CONTROL);
    if (el && el.matches(ITEM) && !el.matches(DISABLED)) return el;
    return null;
  }

  function toggle(el) {
    var key = items.key(el.getAttribute(KEY));
    var group = key && ensure(el.getAttribute(GROUP));
    if (group) group.toggle(key);
  }

  function syncAdded(node) {
    if (node.nodeType !== 1 || !document.body.contains(node)) return;
    if (node.matches(ITEM)) sync(node);
    DocForm.all(ITEM, node).forEach(sync);
  }

  DocForm.selection = {
    group: function (name) { var group = groupFor(name); return group ? group.api : null; },
    define: define,
    seed: function (name, key) {
      var group = groupFor(name);
      key = items.key(key);
      return Boolean(group && key && group.seed(key));
    }
  };
  DocForm._selection = {
    ensure: ensure, collect: collect, sync: sync, prepare: prepare,
    start: function () {
      groups.forEach(function (group) { group.start(); });
      started = true;
    },
    finish: function () {
      groups.forEach(function (group) { group.finish(); });
    }
  };

  DocForm.register('selection', function () {
    DocForm.all(ITEM).forEach(sync);
    new root.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') {
          var el = record.target;
          if (el.matches(ITEM) || el.hasAttribute(ACTIVE) || pressed.has(el)) sync(el);
        } else record.addedNodes.forEach(syncAdded);
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
    DocForm.shortcuts.register({
      id: 'selection.activate', key: ['Enter', 'Space'], label: 'Toggle selection',
      scope: function (event, target) {
        var control = target && controlFor(target);
        return control === target && control && !control.matches('button') ? control : null;
      },
      run: function (event, target) { if (!event.repeat) toggle(target); }
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
