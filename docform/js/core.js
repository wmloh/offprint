(function (root) {
  'use strict';

  if (root.DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] core.js was loaded more than once; ignoring the repeat.');
    return;
  }

  var COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  var NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
  var hasOwn = Object.prototype.hasOwnProperty;
  var modules = [];
  var warned = {};
  var started = false;

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

  function normalizeSite(raw, base) {
    var provided = isObject(raw);
    if (raw != null && !provided) warnOnce('site', 'window.DocFormSite must be an object; ignoring it.');
    var source = provided ? raw : {};
    var order = [];
    var pages = normalizePages(source.pages, base, order, 'pages');
    return {
      provided: provided,
      base: base,
      title: typeof source.title === 'string' ? source.title : '',
      pages: pages,
      order: order,
      glossaryPage: addGlossaryPage(source.glossaryPage, pages, base, order),
      roles: normalizeRoles(source.roles),
      glossary: plainObject(source.glossary, 'glossary'),
      terms: plainObject(source.terms, 'terms'),
      macros: plainObject(source.macros, 'macros'),
      bibliography: plainObject(source.bibliography, 'bibliography'),
      refs: plainObject(source.refs, 'refs'),
      search: typeof source.search === 'string' && source.search ? resolvePath(source.search, base) : null
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
    try {
      mod.init(DocForm.site, DocForm);
    } catch (e) {
      warnOnce('init:' + mod.name, 'Module "' + mod.name + '" failed to initialise.', e);
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

  function start() {
    if (started) return;
    started = true;
    var script = document.querySelector('script[data-df-site]');
    DocForm.page = root.location.href;
    DocForm.site = normalizeSite(root.DocFormSite, script && script.src ? script.src : DocForm.page);
    modules.slice().forEach(run);
  }

  var DocForm = root.DocForm = {
    colors: COLORS.slice(),
    site: null,
    page: null,
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
    warnOnce: warnOnce
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
