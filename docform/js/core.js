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
  var preparingData = false;
  var selectionScans = [];
  var initialItems = null;

  function transaction(fn) {
    if (preparingData) throw new Error('Data transforms cannot change controller state.');
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
    if (boot) boot.report('component-input', feature, host, message, correction, message);
    else warnOnce(feature + ':' + (host && host.id) + ':' + message, message, host || undefined);
  }

  function notifyNow(fn) {
    if (committing) fn();
    else transaction(fn);
  }

  function signal(feature, host, snapshot, options) {
    options = options || {};
    var callbacks = new Set();
    function notify(fn, current, meta) {
      try { fn(current, meta); }
      catch (error) { issue(feature, host, 'Subscriber failed: ' + String(error), 'Check the subscriber callback.'); }
    }
    return {
      subscribe: function (fn, options) {
        if (typeof fn !== 'function') return function () {};
        var listener = { fn: fn };
        callbacks.add(listener);
        if (options && options.immediate && snapshot() !== null) {
          notifyNow(function () { notify(fn, snapshot(), Object.freeze({ previous: null, origin: 'init' })); });
        }
        return function () { callbacks.delete(listener); };
      },
      emit: function (current, previous, origin, group) {
        var meta = Object.freeze({ previous: previous, origin: origin });
        Array.from(callbacks).forEach(function (listener) {
          if (callbacks.has(listener)) notify(listener.fn, current, meta);
        });
        if (typeof root.CustomEvent !== 'function' || typeof document === 'undefined') return;
        var detail = Object.assign({ current: current }, meta);
        if (options.eventState) {
          detail.current = options.eventState(current);
          detail.previous = previous === null ? null : options.eventState(previous);
        }
        if (group !== undefined) detail[options.identity || 'group'] = group;
        (host || document).dispatchEvent(new root.CustomEvent('df:' + feature + ':' + (options.action || 'change'), {
          bubbles: Boolean(host), detail: Object.freeze(detail)
        }));
      }
    };
  }

  function selectionKey(value) {
    return typeof value === 'string' && value.trim() || null;
  }

  function dataIssue(feature, target, message) {
    if (boot) boot.report('data-input', feature, target, message, 'Check the source, mapping, and view limits.', message);
    else warnOnce(feature + ':' + message, message, target);
  }

  function transformData(fn) {
    var previous = preparingData;
    preparingData = true;
    try { return fn(); } finally { preparingData = previous; }
  }

  function immutable(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(immutable);
      Object.freeze(value);
    }
    return value;
  }

  function destination(api, update, reset) {
    var sequence = 0;
    var owner = null;
    var error = null;
    function mutate(input, origin, zone, ticket, clear) {
      return transaction(function () {
        if (ticket !== undefined && ticket !== sequence) return false;
        if (zone && clear && owner !== zone) return true;
        error = null;
        var committed;
        try { committed = clear ? reset() : update(input, origin); }
        catch (failure) { error = failure; return false; }
        sequence++;
        owner = zone && !clear ? zone : null;
        if (committed) committed(origin);
        return true;
      });
    }
    api.update = function (input) { return mutate(input, 'api'); };
    api.reset = function () { return mutate(null, 'reset', null, undefined, true); };
    dataDestinations.set(api, {
      reserve: function () { return ++sequence; },
      current: function (ticket) { return sequence === ticket; },
      owns: function (zone) { return owner === zone; },
      update: function (input, zone, ticket) { return mutate(input, 'drop', zone, ticket); },
      reset: function (zone, ticket) { return mutate(null, 'reset', zone, ticket, true); },
      error: function () { return error; }
    });
  }

  var dataDestinations = new WeakMap();

  function viewController(feature, host, adapter, action) {
    var base = null;
    var local = false;
    var refilterLocal = null;
    var state = null;
    var api = { snapshot: function () { return state; } };
    var events = signal(feature, host, api.snapshot, { action: action });
    api.subscribe = events.subscribe;

    function notify(next, origin, force) {
      var previous = state;
      state = immutable(next);
      if (next === null || (!force && JSON.stringify(state) === JSON.stringify(previous))) return;
      var current = state;
      return function () { events.emit(current, previous, origin); };
    }

    function render(prepared, origin) {
      adapter.render(prepared, origin);
      return notify(adapter.snapshot(), origin, adapter.alwaysNotify);
    }

    destination(api, function (input, origin) {
      var prepared;
      try { prepared = adapter.prepare(input); }
      catch (error) { dataIssue(feature, host, error.message); throw error; }
      adapter.render(prepared, origin);
      local = true;
      refilterLocal = prepared && prepared.refilter;
      return function (origin) {
        var emission = notify(adapter.snapshot(), origin, adapter.alwaysNotify);
        if (emission) emission();
      };
    }, function () {
      if (!local && !adapter.resetReader) return;
      local = false;
      refilterLocal = null;
      return render(base, 'reset');
    });

    return {
      api: api,
      baseline: function () { return base; },
      change: function (origin) {
        var emission = notify(adapter.snapshot(), origin);
        if (emission) notifyNow(emission);
      },
      stage: function (prepared, origin) {
        base = prepared;
        if (!local) return render(prepared, origin);
      },
      prepareFilter: function (prepared, values) {
        var nextLocal = refilterLocal ? refilterLocal(values) : null;
        return function () {
          base = prepared;
          if (!local) return render(prepared, 'group');
          if (nextLocal) return render(nextLocal, 'group');
        };
      },
      start: function (prepared) {
        var emission = this.stage(prepared, 'init');
        if (emission) {
          if (initialItems) initialItems.push(emission);
          else notifyNow(emission);
        }
      }
    };
  }

  function attributeFlag(el, name, feature, fallback) {
    var value = data(el, name, null);
    if (value === null) return fallback === true;
    if (value === 'false') return false;
    if (value === '' || value === 'true') return true;
    issue(feature, el, 'Invalid data-df-' + name + ' value.', 'Use an empty attribute, true, or false.');
    return fallback === true;
  }

  function closestFlag(el, name, feature) {
    if (!boot) return el.closest('[data-df-' + name + ']');
    for (var node = el; node; node = node.parentElement) {
      if (node.hasAttribute('data-df-' + name) && attributeFlag(node, name, feature)) return node;
    }
    return null;
  }

  function attributeNumber(el, name, feature, fallback, valid) {
    var value = data(el, name, null);
    if (value === null) return fallback;
    var parsed = Number(value);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) &&
      Number.isFinite(parsed) && valid(parsed)) return parsed;
    issue(feature, el, 'Invalid data-df-' + name + ' value.', 'Use a finite number within the supported range.');
    return fallback;
  }

  function option(feature, host, name, fallback, valid, programmatic) {
    var layers = boot ? boot.optionLayers(feature, host && host.id) : [];
    return layers.concat(programmatic || {}).reduce(function (value, layer) {
      if (!isObject(layer) || !hasOwn.call(layer, name)) return value;
      if (valid(layer[name])) return layer[name];
      issue(feature, host, 'Invalid ' + feature + ' option "' + name + '".', 'Check the supported values for ' + name + '.');
      return value;
    }, fallback);
  }

  function elementTarget(target, feature, report, doc) {
    doc = doc || root.document;
    if (target && target.nodeType === 1) return target;
    if (typeof target === 'string' && target && doc) {
      var element = doc.getElementById(target);
      if (element && (!doc.querySelectorAll || all('[id]', doc).filter(function (el) {
        return el.id === target;
      }).length < 2)) return element;
    }
    if (report) issue(feature, null, 'Cannot resolve a unique element for "' + String(target) + '".',
      'Pass a unique plain ID or an Element.');
    return null;
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
    var initial = items.findIndex(function (el) { return attributeFlag(el, 'initial', feature); });
    return { keys: keys, initial: Math.max(0, initial), items: items };
  }

  function collectItems(feature, host, domain) {
    var name = data(host, 'selection-group', null);
    if (!domain) {
      DocForm._selection.ensure(name);
      return;
    }
    DocForm._selection.collect(name, domain.keys,
      selectionMode(host, feature) !== 'follow' && attributeFlag(host, 'selection-seed', feature)
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
      var notify = render(current, previous, origin);
      return function () {
        if (typeof notify === 'function') notify();
        events.emit(current, previous, origin);
      };
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

  function estimateInterval(value, at) {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !Number.isFinite(value.lower) || !Number.isFinite(value.upper) || value.lower > value.upper) {
      throw new Error(at + ' needs finite interval bounds with lower ≤ upper.');
    }
    var interval = { lower: value.lower, upper: value.upper };
    if (value.label !== undefined) {
      if (typeof value.label !== 'string' || !value.label.trim()) throw new Error(at + ' needs a nonempty interval label.');
      interval.label = value.label;
    }
    if (value.count !== undefined) {
      if (!Number.isInteger(value.count) || value.count < 0) throw new Error(at + ' needs a nonnegative integer interval count.');
      interval.count = value.count;
    }
    return interval;
  }

  function intervalText(interval, format) {
    return (interval.label || 'Interval') + ' [' + format(interval.lower) + ', ' + format(interval.upper) + ']' +
      (interval.count === undefined ? '' : ' (n = ' + interval.count + ')');
  }

  var DocForm = root.DocForm = Object.assign(root.DocForm || { site: null, page: null }, {
    colors: COLORS.slice(),
    register: register,
    data: data,
    flag: flag,
    num: num,
    all: all,
    color: color,
    _normalizeRoles: normalizeRoles,
    roleColor: roleColor,
    resolvePath: resolvePath,
    normalizeSite: normalizeSite,
    slug: slug,
    uniqueSlug: uniqueSlug,
    termKey: termKey,
    copyText: copyText,
    warnOnce: warnOnce,
    _component: {
      target: elementTarget, flag: attributeFlag, closestFlag: closestFlag, number: attributeNumber, option: option, issue: issue,
      transaction: transaction, notify: notifyNow, signal: signal
    },
    _dataViews: {
      controller: viewController, destination: destination, issue: dataIssue, freeze: immutable,
      transform: transformData,
      access: function (api) { return dataDestinations.get(api); },
      transaction: transaction, signal: signal, notify: notifyNow,
      target: function (target) { return typeof target === 'string' ? document.getElementById(target) : target; }
    },
    _interval: { normalize: estimateInterval, text: intervalText },
    _items: {
      key: selectionKey, flag: attributeFlag, mode: selectionMode, issue: issue, signal: signal,
      transaction: transaction, notify: notifyNow, domain: itemDomain, controller: itemController, collect: collectItems,
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
