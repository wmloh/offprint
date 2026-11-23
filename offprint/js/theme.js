(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  var boot = OffPrint && OffPrint._boot;
  if (!boot || OffPrint._theme) return;

  var MODES = ['light', 'dark'];
  var KEY = 'offprint-theme';
  var QUERY = '(prefers-color-scheme: dark)';
  var LABELS = { light: 'Light', dark: 'Dark' };
  var ICONS = OffPrint._icons;
  var doc = root.document;
  var component = OffPrint._component;
  var mode = 'light';
  var toggles = new Map();

  function snapshot() { return Object.freeze({ mode: mode }); }
  var changes = component.signal('theme', null, snapshot);

  // Unknown or missing values fall back to the OS preference, so the result is always light or dark.
  function normalize(value, dark) {
    return MODES.indexOf(value) >= 0 ? value : (dark ? 'dark' : 'light');
  }

  function next(value) {
    return normalize(value) === 'dark' ? 'light' : 'dark';
  }

  function prefersDark() {
    try {
      return !!(root.matchMedia && root.matchMedia(QUERY).matches);
    } catch (e) {
      return false;
    }
  }

  function read() {
    if (boot.replaying) return normalize(boot.themeDefault, prefersDark());
    var stored = null;
    try {
      stored = root.localStorage.getItem(KEY);
    } catch (e) {
      // Blocked storage: start from the OS preference.
    }
    return normalize(MODES.indexOf(stored) >= 0 ? stored : boot.themeDefault, prefersDark());
  }

  function write(value) {
    if (boot.replaying) return;
    if (OffPrint._readerState?.isolated()) return;
    try {
      root.localStorage.setItem(KEY, value);
    } catch (e) {
      // Storage can be blocked; the choice then lasts only for this page view.
    }
  }

  function apply(value) {
    mode = normalize(value, mode === 'dark');
    var el = doc && doc.documentElement;
    if (el) el.setAttribute('data-op-theme', mode);
  }

  function paint(button) {
    var text = 'Theme: ' + LABELS[mode] + '. Switch to ' + LABELS[next(mode)] + '.';
    button.innerHTML = ICONS[mode] + '<span class="op-theme-toggle-label">' + LABELS[mode] + '</span>';
    button.setAttribute('aria-label', text);
    button.title = text;
  }

  function paintToggles() {
    new Set(toggles.values()).forEach(function (button) { paint(button); });
  }

  function change(value, origin, persist) {
    if (!MODES.includes(value)) {
      component.issue('theme', null, 'Unknown theme "' + String(value) + '".', 'Use light or dark.');
      return false;
    }
    return component.transaction(function () {
      var previous = snapshot();
      if (persist) write(value);
      if (value === mode) return true;
      apply(value);
      paintToggles();
      changes.emit(snapshot(), previous, origin);
      return true;
    });
  }

  function renderToggle(host) {
    if (toggles.has(host)) return toggles.get(host);
    var button = host;
    if (host.tagName !== 'BUTTON') {
      button = doc.createElement('button');
      host.textContent = '';
      host.appendChild(button);
    }
    button.type = 'button';
    button.classList.add('op-theme-toggle');
    button.addEventListener('click', function () {
      change(next(mode), 'user', true);
    });
    toggles.set(host, button);
    toggles.set(button, button);
    paint(button);
    return button;
  }

  function start() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-op-theme-toggle]'), function (host) {
      if (component.flag(host, 'theme-toggle', 'theme')) renderToggle(host);
    });
    root.addEventListener('storage', function (event) {
      if (event.key !== KEY && event.key !== null) return;
      change(read(), 'storage', false);
    });
  }

  apply(read());

  OffPrint._theme = {
    modes: MODES.slice(),
    key: KEY,
    normalize: normalize,
    next: next,
    prefersDark: prefersDark,
    get: function () { return mode; },
    current: function () { return mode; },
    set: function (value) { return change(value, 'api', true); },
    toggle: renderToggle,
    snapshot: snapshot,
    subscribe: changes.subscribe,
    mount: function (target) {
      var host = component.target(target, 'theme', true);
      return host ? renderToggle(host) : null;
    }
  };
  OffPrint.register('theme', start);
})(typeof window !== 'undefined' ? window : globalThis);
