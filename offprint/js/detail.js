// Shared detail panes: keyed children shown one at a time and driven by any keyed source.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] detail.js needs core.js loaded before it.');
    return;
  }

  var items = OffPrint._items;
  var panes = new WeakMap();
  var sources = new WeakMap();
  var waiting = new WeakMap();

  // Reveal a thin scrollbar only while the pointer is over the track of an overflowing pane.
  function scrollport(panel) {
    panel.classList.add('op-scrollport');

    function show(over) {
      panel.classList.toggle('op-scrollbar-hover', over);
    }

    panel.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch' || panel.scrollHeight <= panel.clientHeight) {
        show(false);
        return;
      }
      var rect = panel.getBoundingClientRect();
      var style = root.getComputedStyle(panel);
      var leftBorder = parseFloat(style.borderLeftWidth) || 0;
      var rightBorder = parseFloat(style.borderRightWidth) || 0;
      var gutter = panel.offsetWidth - panel.clientWidth - leftBorder - rightBorder;
      var left = gutter > 1 ? panel.clientLeft > Math.round(leftBorder) : style.direction === 'rtl';
      var distance = left ? event.clientX - rect.left - leftBorder : rect.right - rightBorder - event.clientX;
      show(distance >= 0 && distance <= Math.max(8, gutter));
    }, { passive: true });
    panel.addEventListener('pointerleave', function () { show(false); });
  }

  // Inactive details stay mounted and inert so nested widgets keep their state.
  function panel(details) {
    details.forEach(function (detail) {
      if (detail.getAttribute('tabindex') === null) detail.setAttribute('tabindex', '0');
      scrollport(detail);
    });
    return {
      details: details,
      show: function (active) {
        details.forEach(function (detail) { detail.inert = detail !== active; });
      }
    };
  }

  // A keyed source exposes snapshot().key and subscribe(fn). Panes waiting for its host attach now.
  function source(host, controller) {
    sources.set(host, controller);
    var pending = waiting.get(host);
    if (pending) {
      waiting.delete(host);
      pending.forEach(function (attach) { attach(controller); });
    }
  }

  function follow(host, attach) {
    var controller = sources.get(host);
    if (controller) attach(controller);
    else {
      if (!waiting.has(host)) waiting.set(host, []);
      waiting.get(host).push(attach);
    }
  }

  function setupPane(pane, options) {
    if (panes.has(pane)) return panes.get(pane);
    var children = Array.from(pane.children);
    var keys = children.map(function (child) { return items.key(child.getAttribute('data-op-key')); });
    if (!children.length || keys.includes(null) || new Set(keys).size !== keys.length) {
      items.issue('detail-pane', pane, 'A detail pane needs direct children with unique keys.',
        'Set a distinct data-op-key on every direct child.');
      return null;
    }
    var shared = panel(children);
    var state = null;
    var track = OffPrint._readerState?.watch('detail-pane', pane, function () { return state?.key; }, show);
    var events = items.signal('detail-pane', pane, function () { return state; });

    function apply(index, origin) {
      if (index < 0 || (state && state.key === keys[index])) return index >= 0;
      var previous = state;
      var child = children[index];
      if (!child.id) child.id = uniqueId((pane.id || 'op-detail') + '-' + keys[index]);
      state = Object.freeze({ key: keys[index], detailId: child.id });
      shared.show(child);
      var current = state;
      items.notify(function () { events.emit(current, previous, origin); });
      track?.(origin);
      return true;
    }

    // Unknown keys leave the last detail in place, so the pane never empties.
    function show(key, origin) {
      return apply(keys.indexOf(items.key(key)), origin || 'api');
    }

    var initial = children.findIndex(function (child) { return items.flag(child, 'initial', 'detail-pane'); });
    apply(Math.max(0, initial), 'init');
    pane.classList.add('op-detail-pane-ready');

    var controller = {
      show: function (key) { return show(key); },
      snapshot: function () { return state; },
      subscribe: events.subscribe
    };
    panes.set(pane, controller);

    var target = (options && options.source) || pane.getAttribute('data-op-detail-for');
    var group = pane.getAttribute('data-op-selection-group');
    if (target) {
      var host = typeof target === 'string' ? document.getElementById(target) : target;
      if (!host) {
        items.issue('detail-pane', pane, 'A detail pane follows a missing element.', 'Set data-op-detail-for to an existing keyed source ID.');
      } else {
        follow(host, function (controller) {
          var current = controller.snapshot();
          if (current) show(current.key, 'source');
          controller.subscribe(function (next, meta) {
            if (show(next.key, 'source') && meta) track?.(meta.origin);
          });
        });
      }
    } else if (group) {
      var selection = OffPrint.selection && OffPrint.selection.group(group);
      if (!selection) {
        items.issue('detail-pane', pane, 'A detail pane follows an unavailable selection group.', 'Enable selection and use a group with keyed participants.');
      } else {
        selection.subscribe(function (next) { if (next.key !== null) show(next.key, 'group'); }, { immediate: true });
      }
    }
    return controller;
  }

  function uniqueId(base) {
    var id = base;
    for (var suffix = 2; document.getElementById(id); suffix++) id = base + '-' + suffix;
    return id;
  }

  OffPrint._detail = { scrollport: scrollport, panel: panel, source: source, mount: setupPane, uniqueId: uniqueId };
  OffPrint._detailPane = {
    get: function (target) { return panes.get(items.target(target)) || null; },
    mount: function (target, options) {
      var pane = items.target(target);
      return pane ? setupPane(pane, options) : null;
    }
  };

  OffPrint.register('detail-pane', function () {
    OffPrint._all('.op-detail-pane').forEach(function (pane) {
      // Diagrams link their direct panes during setup.
      var parent = pane.parentElement;
      var diagram = parent && ['op-pipeline', 'op-timeline', 'op-sequence', 'op-tree-diagram'].some(function (cls) {
        return parent.classList.contains(cls);
      });
      if (!diagram) setupPane(pane);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
