// Floating control pill: reading progress, navigation panel, focus mode, theme, and keyboard shortcuts.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] controls.js needs core.js loaded before it.');
    return;
  }

  var DRAWER = '(max-width: 860px), (any-hover: none)';
  var KEYS = { focus: 'docform-focus', nav: 'docform-nav', peek: 'docform-nav-peek' };
  var NAV_MODES = { shown: 'hidden', hidden: 'auto', auto: 'shown' };
  var NAV_LABELS = {
    shown: 'Navigation shown. Select to hide',
    hidden: 'Navigation hidden. Select for auto-hide',
    auto: 'Navigation auto-hide. Select to keep it open'
  };
  var NAV_EDGE = 8;
  // Milliseconds after a sidebar link click within which the next page opens with the auto-hide panel still shown.
  var PEEK_CARRY = 5000;
  var SHORTCUTS = {
    theme: ['t', 'Toggle theme'], focus: ['f', 'Toggle focus mode'], nav: ['n', 'Toggle navigation'],
    next: ['j', 'Next heading'], prev: ['k', 'Previous heading']
  };
  var JUMP_CHAIN = 1000;
  // Fractions of the viewport height: blocks overlapping this central band stay sharp in focus mode.
  var FOCUS_BAND = [0.2, 0.8];
  // Pixels from the window's right edge within which the page scrollbar shows.
  var SCROLLBAR_ZONE = 40;
  var SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    nav: SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11M3.5 5.5h0.5M3.5 8h0.5"/></svg>',
    navHidden: SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m7 5.5-2.5 2.5L7 10.5"/></svg>',
    navAuto: SVG + '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 3v10" stroke-dasharray="1.2 2"/><path d="m8.5 5.5 2.5 2.5-2.5 2.5"/></svg>',
    focus: SVG + '<path d="M1.5 5V3a1.5 1.5 0 0 1 1.5-1.5h2M11 1.5h2A1.5 1.5 0 0 1 14.5 3v2M14.5 11v2a1.5 1.5 0 0 1-1.5 1.5h-2M5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2M5 8h6"/></svg>'
  };
  var hasOwn = Object.prototype.hasOwnProperty;
  var doc = root.document;
  var html = doc && doc.documentElement;
  var listeners = [];

  function load(key) {
    try {
      return root.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function save(key, value) {
    try {
      if (value === null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, value);
    } catch (e) {
      // Storage can be blocked; the choice then lasts only for this page view.
    }
  }

  // Reads and clears the sidebar-link click mark left by the previous page in this tab.
  function takePeek() {
    try {
      var at = Number(root.sessionStorage.getItem(KEYS.peek));
      root.sessionStorage.removeItem(KEYS.peek);
      var age = Date.now() - at;
      return at > 0 && age >= 0 && age <= PEEK_CARRY;
    } catch (e) {
      return false;
    }
  }

  function markPeek() {
    try {
      root.sessionStorage.setItem(KEYS.peek, String(Date.now()));
    } catch (e) {
      // Without storage the next page starts with the panel closed.
    }
  }

  function navMode(value) {
    return hasOwn.call(NAV_MODES, value) ? value : 'shown';
  }

  var boot = DocForm._boot;
  var component = DocForm._component;
  var initialFocus = component.option('controls', null, 'focus', false, function (value) {
    return typeof value === 'boolean';
  });
  var initialNav = component.option('controls', null, 'navMode', 'shown', function (value) {
    return typeof value === 'string' && hasOwn.call(NAV_MODES, value);
  });
  var focus = load(KEYS.focus);
  var savedNav = load(KEYS.nav);
  var startNav = hasOwn.call(NAV_MODES, savedNav) ? savedNav : initialNav;
  var carriedPeek = takePeek();
  var state = {
    focus: focus === 'on' || (focus !== 'off' && initialFocus),
    navMode: startNav,
    peeking: startNav === 'auto' && carriedPeek
  };

  function navShown() {
    return state.navMode === 'shown' || state.peeking;
  }

  function applyClasses() {
    if (!html || !html.classList) return;
    html.classList.toggle('df-focus-mode', state.focus);
    html.classList.toggle('df-nav-hidden', !navShown());
  }

  function setFocus(on) {
    if (typeof on !== 'boolean') return false;
    state.focus = !!on;
    save(KEYS.focus, state.focus ? 'on' : 'off');
    applyClasses();
    listeners.forEach(function (fn) { fn(); });
    return true;
  }

  function setNav(shown) {
    setNavMode(shown ? 'shown' : 'hidden');
    return navShown();
  }

  function setNavMode(mode) {
    if (typeof mode !== 'string' || !hasOwn.call(NAV_MODES, mode)) return false;
    state.navMode = navMode(mode);
    state.peeking = false;
    save(KEYS.nav, state.navMode);
    applyClasses();
    listeners.forEach(function (fn) { fn(); });
    return true;
  }

  // The focused section is the last heading at or above the viewport centre (-1 is the text before any heading),
  // or the last heading once the page is scrolled to the end.
  function pickFocus(tops, centre, atBottom) {
    if (atBottom && tops.length) return tops.length - 1;
    var index = -1;
    for (var i = 0; i < tops.length && tops[i] <= centre; i++) index = i;
    return index;
  }

  // Each block lists the indexes of the headings it is or contains. A block without headings belongs to the
  // section before it; a block with headings spans from its first to its last heading.
  function blockSpans(blocks) {
    var current = -1;
    return blocks.map(function (inner) {
      if (!inner.length) return [current, current];
      current = inner[inner.length - 1];
      return [inner[0], current];
    });
  }

  // Sharp blocks: the page title, the focused section, and anything overlapping the central band.
  function dimmed(span, index, top, bottom, vh, title) {
    if (title) return false;
    if (index >= span[0] && index <= span[1]) return false;
    return bottom <= vh * FOCUS_BAND[0] || top >= vh * FOCUS_BAND[1];
  }

  // Headings rest about `margin` below the viewport top after a jump, so only those clearly past it count.
  function stepHeading(tops, dir, margin) {
    var i;
    if (dir > 0) {
      for (i = 0; i < tops.length; i++) if (tops[i] > margin + 4) return i;
    } else {
      for (i = tops.length - 1; i >= 0; i--) if (tops[i] < margin - 4) return i;
    }
    return -1;
  }

  function progress(scrollY, max) {
    if (!(max > 0)) return 1;
    return Math.min(1, Math.max(0, scrollY / max));
  }

  function nearScrollbar(x, width) {
    return x >= width - SCROLLBAR_ZONE;
  }

  // The page scrollbar stays transparent (keeping its width, so nothing shifts) until the pointer comes near it.
  function watchScrollbar() {
    var near = false;
    function set(value) {
      if (value === near) return;
      near = value;
      html.classList.toggle('df-scrollbar-near', near);
    }
    document.addEventListener('pointermove', function (event) {
      set(nearScrollbar(event.clientX, html.clientWidth || root.innerWidth));
    }, { passive: true });
    html.addEventListener('pointerleave', function () { set(false); });
  }

  function make(tag, className) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function iconButton(name) {
    var button = make('button', 'df-controls-btn df-controls-' + name);
    button.type = 'button';
    button.innerHTML = ICONS[name];
    return button;
  }

  function label(button, text, key) {
    button.setAttribute('aria-label', text);
    DocForm._shortcutHint(button, 'controls.' + key, text);
  }

  function nearNavEdge(x, width, open) {
    return x <= (open ? width + 4 : NAV_EDGE);
  }

  // A page opened from the auto-hide panel starts with it shown; the next pointer move outside closes it.
  function watchAutoNav(sidebar, button, drawerMode, sync) {
    var x = state.peeking ? 0 : Infinity;

    function peek(open) {
      if (state.peeking === open) return;
      state.peeking = open;
      applyClasses();
      sync();
    }

    function navHasFocus(visibleOnly) {
      var active = document.activeElement;
      if (!active || visibleOnly && !active.matches(':focus-visible')) return false;
      return sidebar.contains(active) || active.classList.contains('df-nav-resize');
    }

    function update() {
      if (state.navMode !== 'auto' || drawerMode && drawerMode.matches) return;
      var width = state.peeking ? sidebar.getBoundingClientRect().width : 0;
      var stayOpen = state.peeking && (html.classList.contains('df-nav-resizing') || navHasFocus(true));
      peek(nearNavEdge(x, width, state.peeking) || stayOpen);
    }

    function follow(event) {
      if (event.pointerType === 'touch' || state.navMode !== 'auto') return;
      x = event.clientX;
      update();
    }

    function leave(event) {
      if (event.pointerType === 'touch') return;
      x = Infinity;
      update();
    }

    root.addEventListener('pointermove', follow, { passive: true });
    root.addEventListener('pointerup', follow, { passive: true });
    root.addEventListener('blur', leave);
    html.addEventListener('pointerleave', leave);
    document.addEventListener('focusout', function () {
      if (state.peeking) Promise.resolve().then(update);
    });
    DocForm.shortcuts.register({
      id: 'controls.close-peek', key: 'Escape', label: 'Close auto-hide navigation',
      scope: function () { return state.peeking && sidebar; },
      run: function () {
        if (navHasFocus(false)) button.focus({ preventScroll: true });
        x = Infinity;
        peek(false);
      }
    });
    if (drawerMode) drawerMode.addEventListener('change', function () {
      x = Infinity;
      peek(false);
    });
    if (drawerMode && drawerMode.matches) peek(false);
    // Pointer clicks on links to another page carry the open panel over to it.
    sidebar.addEventListener('click', function (event) {
      if (!state.peeking || !event.detail || event.defaultPrevented || event.button ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest && event.target.closest('a[href]');
      if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
      if (leavesPage(link.href, root.location.href)) markPeek();
    });
  }

  function leavesPage(href, current) {
    return String(href).split('#')[0] !== String(current).split('#')[0];
  }

  function ring() {
    var box = make('span', 'df-controls-progress');
    box.setAttribute('role', 'progressbar');
    box.setAttribute('aria-label', 'Reading progress');
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', '100');
    box.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<circle class="df-progress-track" cx="10" cy="10" r="7"/>' +
      '<circle class="df-progress-bar" cx="10" cy="10" r="7" pathLength="100" stroke-dasharray="100" ' +
      'stroke-dashoffset="100" transform="rotate(-90 10 10)"/></svg>';
    var bar = box.querySelector('.df-progress-bar');
    var shown = -1;
    return {
      el: box,
      set: function (value) {
        var pct = Math.round(value * 100);
        if (pct === shown) return;
        shown = pct;
        bar.setAttribute('stroke-dashoffset', String(100 - pct));
        box.setAttribute('aria-valuenow', String(pct));
        box.title = 'Read ' + pct + '%';
      }
    };
  }

  function topLevelBlock(el, main) {
    while (el.parentElement && el.parentElement !== main) el = el.parentElement;
    return el.parentElement === main ? el : null;
  }

  function focusSections(main, headings) {
    var blocks = Array.prototype.filter.call(main.children, function (el) {
      return !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName) && !el.matches('.df-outline-sentinel, .df-section-lines');
    });
    var inner = blocks.map(function () { return []; });
    headings.forEach(function (h, i) {
      var at = blocks.indexOf(topLevelBlock(h, main));
      if (at >= 0) inner[at].push(i);
    });
    var spans = blockSpans(inner);
    var titles = blocks.map(function (el) { return el.matches('h1, header') || !!el.querySelector('h1'); });
    blocks.forEach(function (el) { el.classList.add('df-focus-block'); });

    return {
      reset: function () {},
      update: function () {
        var vh = root.innerHeight;
        var max = document.documentElement.scrollHeight - vh;
        var index = pickFocus(headings.map(function (h) { return h.getBoundingClientRect().top; }),
          vh / 2, max > 0 && root.scrollY >= max - 2);
        blocks.forEach(function (el, i) {
          var r = el.getBoundingClientRect();
          el.classList.toggle('df-focus-dim', dimmed(spans[i], index, r.top, r.bottom, vh, titles[i]));
        });
      }
    };
  }

  function render() {
    var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
    var sidebar = document.querySelector('.df-sidebar');
    var headings = DocForm.all('h2, h3', main).filter(function (h) { return !h.closest('.df-sidebar'); });
    var drawerMode = root.matchMedia ? root.matchMedia(DRAWER) : null;
    var theme = DocForm.theme;
    var pill = make('div', 'df-controls');
    var progressRing = ring();
    var actions = {};
    var navButton = null;
    var focusButton = null;
    var sections = headings.length ? focusSections(main, headings) : null;
    var lastJump = null;
    var pending = false;

    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Page controls');
    pill.appendChild(progressRing.el);

    function drawer() {
      return drawerMode && drawerMode.matches && DocForm.navigation && DocForm.navigation.drawer ? DocForm.navigation.drawer : null;
    }

    function syncNav() {
      if (!navButton) return;
      var d = drawer();
      var mode = d ? 'drawer' : state.navMode;
      var open = d ? d.isOpen() : navShown();
      if (navButton.getAttribute('data-df-nav-mode') !== mode) {
        navButton.setAttribute('data-df-nav-mode', mode);
        navButton.innerHTML = mode === 'auto' ? ICONS.navAuto : mode === 'hidden' ? ICONS.navHidden : ICONS.nav;
      }
      navButton.setAttribute('aria-expanded', String(open));
      label(navButton, d ? (open ? 'Close navigation' : 'Open navigation') : NAV_LABELS[mode], 'nav');
      sidebar.inert = !d && !open;
    }

    function syncFocus() {
      if (!focusButton) return;
      focusButton.setAttribute('aria-pressed', String(state.focus));
      label(focusButton, state.focus ? 'Turn off focus mode' : 'Turn on focus mode', 'focus');
      if (sections) {
        sections.reset();
        if (state.focus) sections.update();
      }
    }

    if (sidebar) {
      if (!sidebar.id) sidebar.id = 'df-sidebar';
      navButton = pill.appendChild(iconButton('nav'));
      navButton.setAttribute('aria-controls', sidebar.id);
      actions.nav = function () {
        var d = drawer();
        if (d) d._toggleFromControl(navButton);
        else setNavMode(NAV_MODES[state.navMode]);
      };
      navButton.addEventListener('click', actions.nav);
      if (DocForm.navigation && DocForm.navigation.drawer) DocForm.navigation.drawer.subscribe(syncNav);
      if (drawerMode) drawerMode.addEventListener('change', syncNav);
      watchAutoNav(sidebar, navButton, drawerMode, syncNav);
    }

    if (sections) {
      focusButton = pill.appendChild(iconButton('focus'));
      actions.focus = function () { setFocus(!state.focus); };
      focusButton.addEventListener('click', actions.focus);
    }

    if (DocForm.search && typeof DocForm.search.open === 'function') {
      var searchButton = pill.appendChild(make('button', 'df-controls-btn df-controls-search'));
      searchButton.type = 'button';
      searchButton.innerHTML = DocForm.search.icon;
      searchButton.setAttribute('aria-label', 'Search');
      DocForm._shortcutHint(searchButton, 'search.open', 'Search');
      searchButton.addEventListener('click', function () { DocForm.search.open(searchButton); });
    }

    if (theme && typeof theme.toggle === 'function') {
      var themeButton = make('button', 'df-controls-btn');
      pill.appendChild(themeButton);
      theme.mount(themeButton);
      actions.theme = function () { themeButton.click(); };
    }

    if (headings.length) {
      var jump = function (dir) {
        var now = Date.now();
        var target;
        if (lastJump && now - lastJump.time < JUMP_CHAIN) {
          target = lastJump.index + dir;
        } else {
          var margin = parseFloat(root.getComputedStyle(headings[0]).scrollMarginTop) || 0;
          target = stepHeading(headings.map(function (h) { return h.getBoundingClientRect().top; }), dir, margin);
        }
        if (target < 0 || target >= headings.length) return;
        lastJump = { index: target, time: now };
        headings[target].scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      actions.next = function () { jump(1); };
      actions.prev = function () { jump(-1); };
    }

    function update() {
      pending = false;
      progressRing.set(progress(root.scrollY, document.documentElement.scrollHeight - root.innerHeight));
      if (sections && state.focus) sections.update();
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(update);
    }

    Object.keys(actions).forEach(function (id) {
      var binding = SHORTCUTS[id];
      DocForm.shortcuts.register({ id: 'controls.' + id, key: binding[0], label: binding[1], run: actions[id] });
    });
    if (themeButton) DocForm._shortcutHint(themeButton, 'controls.theme');

    listeners.push(syncNav, syncFocus);
    document.body.appendChild(pill);
    html.classList.add('df-has-controls');
    syncNav();
    syncFocus();
    update();
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    // Saved states apply without animating; transitions start after the first frames.
    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () { html.classList.remove('df-controls-init'); });
    });
  }

  DocForm.controls = {
    keys: KEYS,
    pickFocus: pickFocus,
    blockSpans: blockSpans,
    dimmed: dimmed,
    focusBand: FOCUS_BAND.slice(),
    stepHeading: stepHeading,
    nearNavEdge: nearNavEdge,
    leavesPage: leavesPage,
    nearScrollbar: nearScrollbar,
    progress: progress,
    state: function () { return { focus: state.focus, nav: navShown() }; },
    snapshot: function () { return Object.freeze({ focus: state.focus, nav: navShown(), navMode: state.navMode }); },
    setFocus: setFocus,
    setNav: setNav,
    setNavMode: setNavMode
  };

  // Applied as soon as the script runs, so a hidden panel or focus mode does not flash on page load.
  if (html && html.classList) {
    html.classList.add('df-controls-init', 'df-scrollbar-auto');
    if (doc.addEventListener) watchScrollbar();
  }
  applyClasses();

  DocForm.register('controls', function () {
    boot.after('controls', render);
  });
})(typeof window !== 'undefined' ? window : globalThis);
