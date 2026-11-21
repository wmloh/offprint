(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  var boot = DocForm && DocForm._boot;
  if (!boot || DocForm._theme) return;

  var MODES = ['light', 'dark'];
  var KEY = 'docform-theme';
  var QUERY = '(prefers-color-scheme: dark)';
  var LABELS = { light: 'Light', dark: 'Dark' };
  var SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    light: SVG + '<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></svg>',
    dark: SVG + '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>'
  };
  var doc = root.document;
  var component = DocForm._component;
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
    if (DocForm._readerState?.isolated()) return;
    try {
      root.localStorage.setItem(KEY, value);
    } catch (e) {
      // Storage can be blocked; the choice then lasts only for this page view.
    }
  }

  function apply(value) {
    mode = normalize(value, mode === 'dark');
    var el = doc && doc.documentElement;
    if (el) el.setAttribute('data-df-theme', mode);
  }

  function paint(button) {
    var text = 'Theme: ' + LABELS[mode] + '. Switch to ' + LABELS[next(mode)] + '.';
    button.innerHTML = ICONS[mode] + '<span class="df-theme-toggle-label">' + LABELS[mode] + '</span>';
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
    button.classList.add('df-theme-toggle');
    button.addEventListener('click', function () {
      change(next(mode), 'user', true);
    });
    toggles.set(host, button);
    toggles.set(button, button);
    paint(button);
    return button;
  }

  function start() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-df-theme-toggle]'), function (host) {
      if (component.flag(host, 'theme-toggle', 'theme')) renderToggle(host);
    });
    root.addEventListener('storage', function (event) {
      if (event.key !== KEY && event.key !== null) return;
      change(read(), 'storage', false);
    });
  }

  apply(read());

  DocForm._theme = {
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
  DocForm.register('theme', start);
})(typeof window !== 'undefined' ? window : globalThis);
