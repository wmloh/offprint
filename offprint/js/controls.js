// Floating reading controls and page navigation.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] controls.js needs core.js loaded before it.');
    return;
  }

  var DRAWER = '(max-width: 860px), (any-hover: none)';
  var KEYS = { focus: 'offprint-focus', nav: 'offprint-nav', peek: 'offprint-nav-peek' };
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
  var ICONS = OffPrint._icons;
  var hasOwn = Object.prototype.hasOwnProperty;
  var doc = root.document;
  var html = doc && doc.documentElement;
  var listeners = [];

  function load(key) {
    if (OffPrint._readerState?.isolated()) return null;
    try {
      return root.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function save(key, value) {
    if (OffPrint._readerState?.isolated()) return;
    try {
      if (value === null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, value);
    } catch (e) {
      // Storage can be blocked; the choice then lasts only for this page view.
    }
  }

  // Reads and clears the sidebar-link click mark left by the previous page in this tab.
  function takePeek() {
    if (OffPrint._readerState?.isolated()) return false;
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
    if (OffPrint._readerState?.isolated()) return;
    try {
      root.sessionStorage.setItem(KEYS.peek, String(Date.now()));
    } catch (e) {
      // Without storage the next page starts with the panel closed.
    }
  }

  function navMode(value) {
    return hasOwn.call(NAV_MODES, value) ? value : 'shown';
  }

  var boot = OffPrint._boot;
  var component = OffPrint._component;
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
    html.classList.toggle('op-focus-mode', state.focus);
    html.classList.toggle('op-nav-hidden', !navShown());
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

  // Sharp elements: the page title and anything overlapping the central band, whichever section they are in.
  function dimmed(top, bottom, vh, title) {
    if (title) return false;
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
      html.classList.toggle('op-scrollbar-near', near);
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
    var button = make('button', 'op-controls-btn op-controls-' + name);
    button.type = 'button';
    button.innerHTML = ICONS[name];
    return button;
  }

  // Returns a setter for the control's shared hint, with its effective shortcut keys when it has one.
  function controlHint(el, shortcut) {
    return function (text) {
      if (shortcut) OffPrint._shortcutHint(el, shortcut, text);
      else OffPrint.util.hint(el, text);
    };
  }

  function appendPagePill(bar) {
    var links = OffPrint._navigation && OffPrint._navigation.pageLinks;
    if (!links || !links.length) return;
    var pager = bar.appendChild(make('nav', 'op-controls-pager'));
    pager.setAttribute('aria-label', 'Quick page navigation');
    links.forEach(function (entry) {
      var link = pager.appendChild(make('a', 'op-controls-btn'));
      var label = entry.label + ' page: ' + entry.page.title;
      link.href = entry.page.href;
      link.rel = entry.rel;
      link.setAttribute('aria-label', label);
      link.innerHTML = ICONS[entry.rel];
      controlHint(link)(label);
    });
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
      return sidebar.contains(active) || active.classList.contains('op-nav-resize');
    }

    function update() {
      if (state.navMode !== 'auto' || drawerMode && drawerMode.matches) return;
      var width = state.peeking ? sidebar.getBoundingClientRect().width : 0;
      var stayOpen = state.peeking && (html.classList.contains('op-nav-resizing') || navHasFocus(true));
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
    OffPrint.shortcuts.register({
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
    var box = make('span', 'op-controls-progress');
    box.setAttribute('role', 'progressbar');
    box.setAttribute('aria-label', 'Reading progress');
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', '100');
    box.innerHTML = ICONS.progress;
    var bar = box.querySelector('.op-progress-bar');
    var hint = controlHint(box);
    var shown = -1;
    return {
      el: box,
      set: function (value) {
        var pct = Math.round(value * 100);
        if (pct === shown) return;
        shown = pct;
        bar.setAttribute('stroke-dashoffset', String(100 - pct));
        box.setAttribute('aria-valuenow', String(pct));
        hint('Read ' + pct + '%');
      }
    };
  }

  function focusable(el) {
    return !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName) && !el.matches('.op-outline-sentinel, .op-section-lines');
  }

  // Plain wrappers such as <section> are opened so each element inside blurs on its own.
  function isWrapper(el) {
    return /^(SECTION|ARTICLE)$/.test(el.tagName) || el.tagName === 'DIV' && !el.attributes.length;
  }

  function focusBlocks(parent, out) {
    Array.prototype.forEach.call(parent.children, function (el) {
      if (!focusable(el)) return;
      if (isWrapper(el) && el.children.length) focusBlocks(el, out);
      else out.push(el);
    });
    return out;
  }

  function focusElements(main) {
    var blocks = focusBlocks(main, []);
    var titles = blocks.map(function (el) { return el.matches('h1, header') || !!el.querySelector('h1'); });
    blocks.forEach(function (el) { el.classList.add('op-focus-block'); });

    return {
      update: function () {
        var vh = root.innerHeight;
        blocks.forEach(function (el, i) {
          var r = el.getBoundingClientRect();
          el.classList.toggle('op-focus-dim', dimmed(r.top, r.bottom, vh, titles[i]));
        });
      }
    };
  }

  function render() {
    var main = document.querySelector('.op-page') || document.querySelector('main') || document.body;
    var sidebar = document.querySelector('.op-sidebar');
    var headings = OffPrint._all('h2, h3', main).filter(function (h) { return !h.closest('.op-sidebar'); });
    var drawerMode = root.matchMedia ? root.matchMedia(DRAWER) : null;
    var theme = OffPrint._theme;
    var pill = make('div', 'op-controls');
    var progressRing = ring();
    var actions = {};
    var navButton = null;
    var focusButton = null;
    var navHint;
    var focusHint;
    var sections = focusElements(main);
    var lastJump = null;
    var pending = false;

    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Page controls');
    pill.appendChild(progressRing.el);

    function drawer() {
      return drawerMode && drawerMode.matches && OffPrint._navigation && OffPrint._navigation.drawer ? OffPrint._navigation.drawer : null;
    }

    function syncNav() {
      if (!navButton) return;
      var d = drawer();
      var mode = d ? 'drawer' : state.navMode;
      var open = d ? d.isOpen() : navShown();
      if (navButton.getAttribute('data-op-nav-mode') !== mode) {
        navButton.setAttribute('data-op-nav-mode', mode);
        navButton.innerHTML = mode === 'auto' ? ICONS.navAuto : mode === 'hidden' ? ICONS.navHidden : ICONS.nav;
      }
      navButton.setAttribute('aria-expanded', String(open));
      var text = d ? (open ? 'Close navigation' : 'Open navigation') : NAV_LABELS[mode];
      navButton.setAttribute('aria-label', text);
      navHint(text);
      sidebar.inert = !d && !open;
    }

    function syncFocus() {
      if (!focusButton) return;
      focusButton.setAttribute('aria-pressed', String(state.focus));
      var text = state.focus ? 'Turn off focus mode' : 'Turn on focus mode';
      focusButton.setAttribute('aria-label', text);
      focusHint(text);
      if (state.focus) sections.update();
    }

    if (sidebar) {
      if (!sidebar.id) sidebar.id = 'op-sidebar';
      navButton = pill.appendChild(iconButton('nav'));
      navHint = controlHint(navButton, 'controls.nav');
      navButton.setAttribute('aria-controls', sidebar.id);
      actions.nav = function () {
        var d = drawer();
        if (d) d._toggleFromControl(navButton);
        else setNavMode(NAV_MODES[state.navMode]);
      };
      navButton.addEventListener('click', actions.nav);
      if (OffPrint._navigation && OffPrint._navigation.drawer) OffPrint._navigation.drawer.subscribe(syncNav);
      if (drawerMode) drawerMode.addEventListener('change', syncNav);
      watchAutoNav(sidebar, navButton, drawerMode, syncNav);
    }

    focusButton = pill.appendChild(iconButton('focus'));
    focusHint = controlHint(focusButton, 'controls.focus');
    actions.focus = function () { setFocus(!state.focus); };
    focusButton.addEventListener('click', actions.focus);

    if (OffPrint._search && typeof OffPrint._search.open === 'function') {
      var searchButton = pill.appendChild(make('button', 'op-controls-btn op-controls-search'));
      searchButton.type = 'button';
      searchButton.innerHTML = OffPrint._search.icon;
      searchButton.setAttribute('aria-label', 'Search');
      controlHint(searchButton, 'search.open')('Search');
      searchButton.addEventListener('click', function () { OffPrint._search.open(searchButton); });
    }

    if (theme && typeof theme.toggle === 'function') {
      var themeButton = make('button', 'op-controls-btn');
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
      if (state.focus) sections.update();
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(update);
    }

    Object.keys(actions).forEach(function (id) {
      var binding = SHORTCUTS[id];
      OffPrint.shortcuts.register({ id: 'controls.' + id, key: binding[0], label: binding[1], run: actions[id] });
    });
    if (themeButton) {
      var themeHint = controlHint(themeButton, 'controls.theme');
      theme.subscribe(function () { themeHint(themeButton.getAttribute('aria-label')); }, { immediate: true });
    }

    listeners.push(syncNav, syncFocus);
    var bar = make('div', 'op-controls-bar');
    var exportButton = boot.mountExport?.(pill, true);
    if (exportButton && OffPrint._tooltips) controlHint(exportButton)('Export');
    bar.appendChild(pill);
    appendPagePill(bar);
    document.body.appendChild(bar);
    html.classList.add('op-has-controls');
    syncNav();
    syncFocus();
    update();
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    // Saved states apply without animating; transitions start after the first frames.
    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () { html.classList.remove('op-controls-init'); });
    });
  }

  OffPrint._controls = {
    keys: KEYS,
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
    html.classList.add('op-controls-init', 'op-scrollbar-auto');
    if (doc.addEventListener) watchScrollbar();
  }
  applyClasses();

  OffPrint.register('controls', function () {
    boot.after('controls', render);
  });
})(typeof window !== 'undefined' ? window : globalThis);
