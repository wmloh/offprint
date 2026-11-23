// Section lines: each top-level h2 of the page takes the next named colour from --op-section-cycle (data-op-color or
// data-op-role on the heading wins), and a thin line in that colour runs down the left margin from the heading to the
// end of its section, continuous past tables and figures. The lines live in their own overlay layer rather than on the
// headings, so focus-mode blur or any other filter on a heading or block never reaches them. They are measured again
// after resizes, reflows, and content changes. Without the script, sections.css draws the same line on each heading,
// at heading height, in the default order.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] sections.js needs core.js loaded before it.');
    return;
  }

  var CYCLE = ['blue', 'green', 'purple', 'orange', 'pink', 'brown'];
  var RAIL_PAD = 8;
  var SKIP = 'script, style, template, .op-pager, .op-section-lines';

  // Named colours from a token value such as "blue green purple"; unknown names are dropped with a warning.
  function cycle(text) {
    var names = String(text || '').split(/[\s,]+/).filter(Boolean).map(OffPrint._color).filter(Boolean);
    return names.length ? names : CYCLE.slice();
  }

  function override(heading) {
    return heading.hasAttribute('data-op-color') || heading.hasAttribute('data-op-role');
  }

  function px(el, name, fallback) {
    var value = parseFloat(root.getComputedStyle(el).getPropertyValue(name));
    return isFinite(value) ? value : fallback;
  }

  function visible(el) {
    if (el.matches(SKIP)) return false;
    var style = root.getComputedStyle(el);
    if (style.display === 'none' || style.position === 'fixed' || style.position === 'absolute') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function setup(page) {
    var html = document.documentElement;
    var pending = false;
    var layer = document.createElement('div');
    layer.className = 'op-section-lines';
    layer.setAttribute('aria-hidden', 'true');
    var lines = [];

    // One line per heading, carrying the heading's colour attributes so data-op-color and data-op-role still apply.
    function line(h, i, name) {
      var el = lines[i] || (lines[i] = layer.appendChild(document.createElement('span')));
      el.className = 'op-section-line';
      ['data-op-color', 'data-op-role'].forEach(function (attr) {
        if (h.hasAttribute(attr)) el.setAttribute(attr, h.getAttribute(attr));
        else el.removeAttribute(attr);
      });
      el.style.setProperty('--op-section-color', name ? 'var(--op-' + name + ')' : 'var(--op-accent)');
      return el;
    }

    function layout() {
      pending = false;
      var children = Array.prototype.slice.call(page.children);
      var headings = children.filter(function (el) { return el.tagName === 'H2'; });
      var names = cycle(root.getComputedStyle(html).getPropertyValue('--op-section-cycle'));
      headings.forEach(function (h, i) {
        if (override(h)) h.style.removeProperty('--op-section-color');
        else h.style.setProperty('--op-section-color', 'var(--op-' + names[i % names.length] + ')');
      });
      while (lines.length > headings.length) layer.removeChild(lines.pop());
      if (!headings.length) return;
      if (layer.parentNode !== page) page.appendChild(layer);

      var first = headings[0];
      var column = first.getBoundingClientRect().left;
      var offset = px(first, '--op-section-offset', 14);
      var width = px(first, '--op-section-line-width', 2);
      var lineLeft = column - offset - width / 2;
      var rail = document.querySelector('.op-section-rail');
      var covered = !!rail && root.getComputedStyle(rail).display !== 'none' &&
        rail.getBoundingClientRect().right > lineLeft - RAIL_PAD;
      page.classList.toggle('op-sections-covered', covered);

      var origin = page.getBoundingClientRect();
      headings.forEach(function (h, i) {
        var top = h.getBoundingClientRect().top;
        var end = h.getBoundingClientRect().bottom;
        for (var index = children.indexOf(h) + 1; index < children.length && children[index].tagName !== 'H2'; index++) {
          if (visible(children[index])) end = Math.max(end, children[index].getBoundingClientRect().bottom);
        }
        var length = Math.max(0, Math.round(end - top));
        h.style.setProperty('--op-section-length', length + 'px');
        var el = line(h, i, override(h) ? null : names[i % names.length]);
        el.style.top = Math.round(top - origin.top + 0.15 * px(h, 'font-size', 24)) + 'px';
        el.style.left = (lineLeft - origin.left) + 'px';
        el.style.height = length + 'px';
      });
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(layout);
    }

    page.classList.add('op-sections-drawn');
    layout();
    root.addEventListener('resize', schedule);
    if (root.ResizeObserver) new root.ResizeObserver(schedule).observe(page);
    // Added or removed top-level blocks and heading colour changes; deeper changes that move content resize the page.
    if (root.MutationObserver) {
      new root.MutationObserver(function (records) {
        if (records.some(function (r) {
          return r.type === 'childList' ? r.target === page : r.target.parentElement === page && r.target.tagName === 'H2';
        })) schedule();
      }).observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-op-color', 'data-op-role'] });
    }
    // Reveals and the sidebar settle through transitions without resizing the page.
    document.addEventListener('transitionend', function (event) {
      var t = event.target;
      if (t === document.body || t.parentElement === page ||
        (t.classList && (t.classList.contains('op-sidebar') || t.classList.contains('op-section-rail')))) schedule();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    return layout;
  }

  var layoutPage = null;
  OffPrint._sections = {
    cycle: cycle,
    layout: function () {
      if (!layoutPage) return false;
      layoutPage();
      return true;
    }
  };

  OffPrint.register('sections', function () {
    var page = document.querySelector('.op-page:not(.op-bubble-body)');
    if (page) layoutPage = setup(page);
  });
})(typeof window !== 'undefined' ? window : globalThis);
