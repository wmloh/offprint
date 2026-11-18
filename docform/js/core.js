(function (root) {
  'use strict';

  var boot = root.DocForm && root.DocForm._boot;
  if (root.DocForm && (!boot || boot.initialize)) {
    if (typeof console !== 'undefined') console.warn('[docform] core.js was loaded more than once; ignoring the repeat.');
    return;
  }

  var COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  var NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
  var hasOwn = Object.prototype.hasOwnProperty;
  var modules = [];
  var warned = {};
  var started = false;
  var transactions = [];
  var committing = false;
  var selectionScans = [];
  var initialItems = null;

  function transaction(fn) {
    transactions.push(fn);
    if (committing) return true;
    committing = true;
    try {
      var result = transactions.shift()();
      while (transactions.length) transactions.shift()();
      return result;
    } finally {
      transactions.length = 0;
      committing = false;
    }
  }

  function issue(feature, host, message, correction) {
    if (boot) boot.report('selection-input', feature, host, message, correction, message);
    else warnOnce(feature + ':' + (host && host.id) + ':' + message, message, host || undefined);
  }

  function signal(feature, host, snapshot) {
    var callbacks = new Set();
    function notify(fn, current, meta) {
      try { fn(current, meta); }
      catch (error) { issue(feature, host, 'Selection subscriber failed: ' + String(error), 'Check the subscriber callback.'); }
    }
    return {
      subscribe: function (fn, options) {
        if (typeof fn !== 'function') return function () {};
        var listener = { fn: fn };
        callbacks.add(listener);
        if (options && options.immediate && snapshot() !== null) {
          var immediate = function () { notify(fn, snapshot(), Object.freeze({ previous: null, origin: 'init' })); };
          if (committing) immediate();
          else transaction(immediate);
        }
        return function () { callbacks.delete(listener); };
      },
      emit: function (current, previous, origin, group) {
        var meta = Object.freeze({ previous: previous, origin: origin });
        Array.from(callbacks).forEach(function (listener) {
          if (callbacks.has(listener)) notify(listener.fn, current, meta);
        });
        var detail = Object.assign({ current: current }, meta);
        if (group !== undefined) detail.group = group;
        (host || document).dispatchEvent(new root.CustomEvent('df:' + feature + ':change', {
          bubbles: Boolean(host), detail: Object.freeze(detail)
        }));
      }
    };
  }

  function selectionKey(value) {
    return typeof value === 'string' && value.trim() || null;
  }

  function selectionFlag(el, name, feature) {
    var value = data(el, name, null);
    if (value === null || value === 'false') return false;
    if (value === '' || value === 'true') return true;
    issue(feature, el, 'Invalid data-df-' + name + ' value.', 'Use an empty attribute, true, or false.');
    return false;
  }

  function selectionMode(host, feature) {
    var mode = data(host, 'selection-mode', 'both');
    if (mode === 'both' || mode === 'publish' || mode === 'follow') return mode;
    issue(feature, host, 'Invalid selection mode.', 'Use both, publish, or follow.');
    return 'both';
  }

  function itemDomain(feature, host, items) {
    var keys = items.map(function (el) { return selectionKey(data(el, 'key', null)); });
    if (!keys.length || keys.includes(null) || new Set(keys).size !== keys.length) {
      issue(feature, host, 'Each item needs a unique nonempty key.', 'Set a distinct data-df-key on every item.');
      return null;
    }
    var initial = items.findIndex(function (el) { return selectionFlag(el, 'initial', feature); });
    return { keys: keys, initial: Math.max(0, initial), items: items };
  }

  function collectItems(feature, host, domain) {
    var name = data(host, 'selection-group', null);
    if (!domain) {
      DocForm._selection.ensure(name);
      return;
    }
    DocForm._selection.collect(name, domain.keys,
      selectionMode(host, feature) !== 'follow' && selectionFlag(host, 'selection-seed', feature)
        ? [[domain.items[domain.initial], domain.keys[domain.initial]]] : []);
  }

  function itemController(feature, host, domain, snapshotAt, render) {
    var keys = domain.keys;
    var selection = DocForm._selection;
    var group = selection && selection.ensure(data(host, 'selection-group', null));
    var mode = group ? selectionMode(host, feature) : 'both';
    var state = null;
    var events = signal(feature, host, function () { return state; });

    function apply(index, origin) {
      if (index < 0 || index >= keys.length || (state && state.index === index)) return null;
      var previous = state;
      state = Object.freeze(snapshotAt(index, keys[index]));
      var current = state;
      render(current, previous);
      return function () { events.emit(current, previous, origin); };
    }

    function choose(index, origin) {
      if (index < 0 || index >= keys.length) return false;
      return transaction(function () {
        var notify = apply(index, origin);
        if (group && mode !== 'follow') group.commit(keys[index], origin, notify);
        else if (notify) notify();
        return true;
      });
    }

    function select(key, origin) {
      return choose(keys.indexOf(selectionKey(key)), origin || 'api');
    }

    if (group && mode !== 'publish') {
      group.follow(function (key) { return apply(keys.indexOf(key), 'group'); });
    }
    return {
      controller: {
        select: function (key) { return select(key); },
        reset: function () { return choose(domain.initial, 'reset'); },
        snapshot: function () { return state; },
        subscribe: events.subscribe
      },
      choose: choose,
      start: function () {
        var shared = group && mode !== 'publish' ? keys.indexOf(group.api.get()) : -1;
        var notify = apply(shared < 0 ? domain.initial : shared, 'init');
        if (initialItems) initialItems.push(notify);
        else if (notify) transaction(notify);
      }
    };
  }

  function warnOnce(key, message, detail) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console === 'undefined') return;
    if (detail === undefined) console.warn('[docform] ' + message);
    else console.warn('[docform] ' + message, detail);
  }

  function data(el, key, fallback) {
    var value = el.getAttribute('data-df-' + key);
    return value === null ? fallback : value;
  }

  function flag(el, key) {
    var value = el.getAttribute('data-df-' + key);
    return value !== null && value !== 'false';
  }

  function num(el, key, fallback) {
    var value = parseFloat(el.getAttribute('data-df-' + key));
    return isFinite(value) ? value : fallback;
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function plainObject(value, name) {
    if (value == null) return {};
    if (!isObject(value)) {
      warnOnce('object:' + name, 'Manifest "' + name + '" must be an object; ignoring it.');
      return {};
    }
    var copy = {};
    Object.keys(value).forEach(function (key) { copy[key] = value[key]; });
    return copy;
  }

  function resolvePath(path, base) {
    try {
      return new URL(path, base).href;
    } catch (e) {
      warnOnce('path:' + path, 'Cannot resolve page path "' + path + '" against "' + base + '".');
      return null;
    }
  }

  function normalizePages(list, base, order, where) {
    if (list == null) return [];
    if (!Array.isArray(list)) {
      warnOnce('pages:' + where, 'Manifest "' + where + '" must be an array; ignoring it.');
      return [];
    }
    var out = [];
    list.forEach(function (item, i) {
      var at = where + '[' + i + ']';
      if (typeof item === 'string') item = { path: item };
      if (!isObject(item) || (typeof item.path !== 'string' && item.pages == null)) {
        warnOnce('page:' + at, 'Manifest entry "' + at + '" needs a path or pages; ignoring it.');
        return;
      }
      var path = typeof item.path === 'string' ? item.path : null;
      var node = {
        title: String(item.title || path || 'Untitled'),
        path: path,
        href: path === null ? null : resolvePath(path, base),
        collapsed: !!item.collapsed,
        pages: []
      };
      if (node.href) order.push(node);
      node.pages = normalizePages(item.pages, base, order, at + '.pages');
      out.push(node);
    });
    return out;
  }

  function color(name) {
    var key = String(name).trim().toLowerCase();
    if (COLORS.indexOf(key) >= 0) return key;
    warnOnce('color:' + key, 'Unknown colour "' + name + '"; use one of ' + COLORS.join(', ') + '.');
    return null;
  }

  function normalizeRoles(value) {
    var source = plainObject(value, 'roles');
    var roles = {};
    Object.keys(source).forEach(function (name) {
      var key = name.trim().toLowerCase();
      if (!NAME_RE.test(key)) {
        warnOnce('role-name:' + name, 'Ignoring role "' + name + '": use letters, digits, hyphens, or underscores.');
        return;
      }
      var mapped = color(source[name]);
      if (mapped) roles[key] = mapped;
      else warnOnce('role-color:' + key, 'Ignoring role "' + key + '" because its colour is unknown.');
    });
    return roles;
  }

  // glossaryPage: a path or { path, title } listed last in the page tree, unless the tree already has that page.
  function addGlossaryPage(value, pages, base, order) {
    if (value == null) return null;
    var item = typeof value === 'string' ? { path: value } : value;
    if (!isObject(item) || typeof item.path !== 'string' || !item.path) {
      warnOnce('glossary-page', 'Manifest "glossaryPage" must be a path or { path, title }; ignoring it.');
      return null;
    }
    var href = resolvePath(item.path, base);
    if (!href) return null;
    var key = href.split('#')[0];
    var listed = order.some(function (page) { return page.href.split('#')[0] === key; });
    if (!listed) {
      var title = typeof item.title === 'string' && item.title ? item.title : 'Glossary';
      pages.push.apply(pages, normalizePages([{ title: title, path: item.path }], base, order, 'glossaryPage'));
    }
    return href;
  }

  function normalizeSite(raw, base, options) {
    var provided = isObject(raw);
    if (raw != null && !provided) warnOnce('site', 'window.DocFormSite must be an object; ignoring it.');
    var source = provided ? raw : {};
    options = options || source.options || {};
    var tooltips = options.tooltips || {};
    var terms = plainObject(source.terms, 'terms');
    ['autoLink', 'hold'].forEach(function (key) {
      if (hasOwn.call(tooltips, key)) terms[key] = tooltips[key];
    });
    var search = source.assets && source.assets.search && source.assets.search.output || source.search;
    var order = [];
    var pages = normalizePages(source.pages, base, order, 'pages');
    return {
      provided: provided,
      base: base,
      title: typeof source.title === 'string' ? source.title : '',
      pages: pages,
      order: order,
      glossaryPage: addGlossaryPage(source.glossaryPage, pages, base, order),
      roles: normalizeRoles(options.roles && options.roles.colors !== undefined ? options.roles.colors : source.roles),
      glossary: plainObject(tooltips.terms === undefined ? source.glossary : tooltips.terms, 'glossary'),
      terms: terms,
      macros: plainObject(options.math && options.math.macros !== undefined ? options.math.macros : source.macros, 'macros'),
      bibliography: plainObject(options.citations && options.citations.entries !== undefined ?
        options.citations.entries : source.bibliography, 'bibliography'),
      refs: Object.assign(plainObject(source.refs, 'refs'), plainObject(options.references, 'options.references')),
      search: typeof search === 'string' && search ? resolvePath(search, base) : null
    };
  }

  // Glossary keys: "Linear map", "linear-map", and "linear_map" all name the same term.
  function termKey(text) {
    return String(text).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  }

  // Heading anchors: shared by nav.js, which assigns them, and the search index, which must predict them.
  function slug(text) {
    var out = String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return out || 'section';
  }

  function uniqueSlug(base, used) {
    var out = base;
    for (var n = 2; used.has(out); n++) out = base + '-' + n;
    used.add(out);
    return out;
  }

  function roleColor(name, site) {
    var roles = (site || DocForm.site || {}).roles || {};
    var key = String(name).trim().toLowerCase();
    if (hasOwn.call(roles, key)) return roles[key];
    warnOnce('role:' + key, 'Unknown role "' + name + '"; add it to the manifest roles.');
    return null;
  }

  function run(mod) {
    if (boot && !boot.canInitialize(mod.name)) return;
    try {
      mod.init(DocForm.site, DocForm);
    } catch (e) {
      if (boot) boot.moduleFailed(mod.name, e);
      else warnOnce('init:' + mod.name, 'Module "' + mod.name + '" failed to initialise.', e);
    }
  }

  // Clipboard API first; file:// pages and blocked permissions fall back to execCommand on a hidden textarea.
  function copyText(text) {
    var nav = root.navigator;
    if (nav && nav.clipboard && root.isSecureContext !== false) {
      return nav.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      area.remove();
      if (ok) resolve();
      else reject(new Error('Copy was blocked.'));
    });
  }

  function register(name, init) {
    for (var i = 0; i < modules.length; i++) {
      if (modules[i].name === name) {
        warnOnce('module:' + name, 'Module "' + name + '" is registered more than once; ignoring the repeat.');
        return;
      }
    }
    var mod = { name: name, init: init };
    modules.push(mod);
    if (started) run(mod);
  }

  function initialize() {
    if (started) return;
    started = true;
    if (DocForm._selection) {
      prepareSelection();
      DocForm._selection.start();
    }
    transaction(function () {
      initialItems = [];
      modules.slice().forEach(run);
      var pending = initialItems;
      initialItems = null;
      pending.forEach(function (notify) { if (notify) notify(); });
      if (DocForm._selection) DocForm._selection.finish();
    });
  }

  function prepareSelection() {
    if (!DocForm._selection) return;
    DocForm._selection.prepare();
    selectionScans.forEach(function (scan) {
      if (boot && !boot.canInitialize(scan.feature)) return;
      try { scan.fn(); }
      catch (error) { if (boot) boot.moduleFailed(scan.feature, error); else warnOnce(scan.feature + ':scan', String(error)); }
    });
  }

  function start() {
    var script = document.querySelector('script[data-df-site]');
    DocForm.page = root.location.href;
    DocForm.site = normalizeSite(root.DocFormSite, script && script.src ? script.src : DocForm.page);
    DocForm.site.selectionGroups = root.DocFormSite && root.DocFormSite.selectionGroups;
    initialize();
  }

  var DocForm = root.DocForm = Object.assign(root.DocForm || { site: null, page: null }, {
    colors: COLORS.slice(),
    register: register,
    data: data,
    flag: flag,
    num: num,
    all: all,
    color: color,
    roleColor: roleColor,
    resolvePath: resolvePath,
    normalizeSite: normalizeSite,
    slug: slug,
    uniqueSlug: uniqueSlug,
    termKey: termKey,
    copyText: copyText,
    warnOnce: warnOnce,
    _items: {
      key: selectionKey, flag: selectionFlag, mode: selectionMode, issue: issue, signal: signal,
      transaction: transaction, domain: itemDomain, controller: itemController, collect: collectItems,
      scan: function (feature, fn) { selectionScans.push({ feature: feature, fn: fn }); },
      target: function (target) { return typeof target === 'string' ? document.getElementById(target) : target; }
    }
  });

  if (boot) {
    boot.initialize = initialize;
    boot.prepareSelection = prepareSelection;
    boot.registered = function (name) { return modules.some(function (mod) { return mod.name === name; }); };
    DocForm.util = { slug: slug, uniqueSlug: uniqueSlug, copyText: copyText };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
