// Figure zoom: clicking a page image or figure opens it in a frosted full-screen view. Escape, the backdrop,
// or the close button return it to the page. The element itself moves, so animations and sliders keep working.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] zoom.js needs core.js loaded before it.');
    return;
  }

  var TRIGGERS = '.df-page img, .df-page figure, [data-df-zoom]';
  var DIAGRAMS = 'figure.df-timeline, figure.df-sequence, figure.df-tree-diagram';
  // Focusable regions without a control role, such as chart plots, still open the zoom view.
  var SKIP = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="button"], [role="link"], ' +
    '[role="tab"], [role="slider"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], ' +
    '[tabindex][aria-describedby], [data-df-term], [data-df-tip], .df-anim-controls, .df-anim-caption';
  var CLOSE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  var CLOSE_MS = 260;

  var open = null;
  var component = DocForm._component;
  var boot = DocForm._boot;
  var changes = component.signal('zoom', null, snapshot);
  var closing = component.signal('zoom', null, snapshot, { action: 'closing' });

  function snapshot() {
    return open ? Object.freeze({ target: open.target, overlay: open.overlay, stage: open.stage }) : null;
  }

  // The element that zooms for a trigger: its enclosing figure, else the trigger itself.
  function zoomTarget(el) {
    if (el.closest('.df-sidebar, .df-controls, a') || component.closestFlag(el, 'no-zoom', 'zoom')) return null;
    var figure = el.closest('.df-page figure');
    return figure || el;
  }

  function describe(target) {
    var cap = target.querySelector && target.querySelector('figcaption');
    var img = target.tagName === 'IMG' ? target : null;
    var svg = target.querySelector && target.querySelector('svg[aria-label]');
    var text = (img && img.alt) || (svg && svg.getAttribute('aria-label')) || (cap && cap.textContent.trim()) || '';
    return text ? 'Enlarged: ' + text : 'Enlarged figure';
  }

  function beginClose(origin) {
    if (!open || open.finish) return;
    var state = open;
    var previous = snapshot();
    state.removeShortcut();
    state.overlay.classList.remove('is-open');
    document.documentElement.classList.remove('df-zoom-open');
    state.finish = function () {
      if (open !== state) return;
      open = null;
      clearTimeout(state.timer);
      if (state.placeholder.parentNode) state.placeholder.parentNode.replaceChild(state.target, state.placeholder);
      state.target.classList.remove('df-zoomed');
      state.overlay.remove();
      if (state.opener && typeof state.opener.focus === 'function') state.opener.focus({ preventScroll: true });
      changes.emit(null, previous, origin);
    };
    state.overlay.addEventListener('transitionend', function (event) {
      if (event.target === state.overlay) component.transaction(state.finish);
    });
    state.timer = setTimeout(function () { component.transaction(state.finish); }, CLOSE_MS + 80);
    if (!boot) emit('df:zoomclose', state);
    closing.emit(null, previous, origin);
  }

  function close(origin) {
    return component.transaction(function () {
      beginClose(origin);
      return true;
    });
  }

  function emit(type, state) {
    var event;
    var detail = { target: state.target, overlay: state.overlay, stage: state.stage };
    if (typeof root.CustomEvent === 'function') event = new root.CustomEvent(type, { detail: detail });
    else {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent(type, false, false, detail);
    }
    document.dispatchEvent(event);
  }

  function show(target, opener, origin) {
    var rect = target.getBoundingClientRect();
    var styles = root.getComputedStyle(target);
    var placeholder = document.createElement('div');
    placeholder.className = 'df-zoom-placeholder';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.width = target.tagName === 'IMG' ? rect.width + 'px' : '';
    placeholder.style.margin = styles.margin;
    placeholder.style.display = styles.display === 'inline' ? 'inline-block' : styles.display;

    var overlay = document.createElement('div');
    overlay.className = 'df-zoom';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', describe(target));
    var stage = document.createElement('div');
    stage.className = 'df-zoom-stage';
    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'df-zoom-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.innerHTML = CLOSE_ICON;

    target.parentNode.replaceChild(placeholder, target);
    target.classList.add('df-zoomed');
    stage.appendChild(target);
    overlay.appendChild(stage);
    overlay.appendChild(closeButton);
    document.body.appendChild(overlay);
    document.documentElement.classList.add('df-zoom-open');

    var removeShortcut = DocForm.shortcuts.register({
      id: 'zoom.close', key: 'Escape', label: 'Close enlarged figure', scope: overlay, editable: true,
      active: function () { return true; },
      run: function () { close('user'); }
    });
    DocForm._shortcutHint(closeButton, 'zoom.close', 'Close');
    open = { target: target, placeholder: placeholder, overlay: overlay, stage: stage, opener: opener,
      removeShortcut: removeShortcut };
    overlay.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      var items = DocForm.all('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', overlay)
        .filter(function (el) { return !el.disabled && el.getClientRects().length; });
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target === stage) close('user');
    });
    closeButton.addEventListener('click', function () { close('user'); });
    // Two frames let the start state paint before the open transition.
    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () {
        if (open && open.overlay === overlay && !open.finish) overlay.classList.add('is-open');
      });
    });
    closeButton.focus({ preventScroll: true });
    if (!boot) emit('df:zoomopen', open);
    changes.emit(snapshot(), null, origin);
  }

  function requestOpen(el, opener, origin) {
    return component.transaction(function () {
      var target = zoomTarget(el);
      if (!target || !target.parentNode) return false;
      if (open && open.target.contains(target)) {
        if (!open.finish) return true;
        target = open.target;
      }
      if (open) {
        beginClose(origin);
        open.finish();
      }
      if (!target.parentNode) return false;
      show(target, opener, origin);
      return true;
    });
  }

  // The zoom trigger around a clicked node, unless the click landed on a control or link inside it.
  function triggerFor(node) {
    if (!node || typeof node.closest !== 'function' || node.closest('.df-zoom')) return null;
    if (component.closestFlag(node, 'no-zoom', 'zoom')) return null;
    var diagram = node.closest(DIAGRAMS);
    if (diagram && !isTrigger(diagram)) return null;
    var trigger = node.closest(TRIGGERS);
    while (trigger && !isTrigger(trigger)) trigger = trigger.parentElement && trigger.parentElement.closest(TRIGGERS);
    if (!trigger) return null;
    for (var el = node; el && el !== trigger; el = el.parentElement) if (el.matches(SKIP)) return null;
    return trigger;
  }

  function isTrigger(el) {
    var diagram = el.closest(DIAGRAMS);
    if (diagram) return el === diagram && component.flag(el, 'zoom', 'zoom');
    return el.matches('.df-page img, .df-page figure') ||
      (boot ? component.flag(el, 'zoom', 'zoom') : el.hasAttribute('data-df-zoom'));
  }

  DocForm.register('zoom', function () {
    DocForm.all(TRIGGERS).forEach(function (el) {
      if (!isTrigger(el)) return;
      var target = zoomTarget(el);
      if (!target) return;
      if (target.classList.contains('df-zoomable')) return;
      target.classList.add('df-zoomable');
      if (!target.hasAttribute('tabindex')) target.tabIndex = 0;
    });
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      var trigger = triggerFor(event.target);
      var target = trigger && zoomTarget(trigger);
      if (!target) return;
      requestOpen(target, target, 'user');
    });
    DocForm.shortcuts.register({
      id: 'zoom.open', key: ['Enter', 'Space'], label: 'Enlarge focused figure', scope: document.body,
      when: function (event, el) {
        return el && el.classList && el.classList.contains('df-zoomable') && !el.closest('.df-zoom');
      },
      run: function (event, el) { requestOpen(el, el, 'user'); }
    });
  });

  DocForm.zoom = {
    open: function (target) {
      var el = component.target(target, 'zoom', true);
      return !!el && requestOpen(el, document.activeElement, 'api');
    },
    close: function () { return close('api'); },
    isOpen: function () { return !!open; },
    snapshot: snapshot,
    subscribe: changes.subscribe,
    current: snapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
