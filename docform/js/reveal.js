// One-time reveals for marked blocks and split views, and two-way slides for callouts.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] reveal.js needs core.js loaded before it.');
    return;
  }

  var SELECTOR = '[data-df-reveal]:not(.df-callout, .df-split, [data-df-no-reveal])';
  var SPLIT = '.df-split:not([data-df-no-reveal])';
  var STAGGER = 140;
  var CALLOUT_INSET = 0.25;
  var doc = root.document;
  var html = doc && doc.documentElement;
  var canObserve = typeof root.IntersectionObserver === 'function';

  // Revealed once it intersects, or once it is already above the viewport (such as after a restored scroll
  // position), so nothing stays hidden behind the reader.
  function shouldReveal(entry) {
    return !!entry.isIntersecting || entry.boundingClientRect.bottom <= 0;
  }

  // Reveals each observed element once and stops watching it. `Observer` is IntersectionObserver or a stand-in.
  function revealer(Observer, show, options) {
    var observer = new Observer(function (entries) {
      entries.forEach(function (entry) {
        if (!shouldReveal(entry)) return;
        observer.unobserve(entry.target);
        show(entry.target);
      });
    }, options || { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    return observer;
  }

  // "2:1" or "2 1" gives the panes those column shares; missing or invalid shares count as 1.
  function splitColumns(spec, count) {
    var parts = String(spec || '').split(/[\s:\/,]+/).filter(Boolean);
    var cols = [];
    for (var i = 0; i < count; i++) {
      var share = parseFloat(parts[i]);
      cols.push('minmax(0, ' + (share > 0 ? share : 1) + 'fr)');
    }
    return cols.join(' ');
  }

  function setupSplit(split) {
    var panes = Array.prototype.filter.call(split.children, function (el) {
      return !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName);
    });
    panes.forEach(function (pane, i) {
      var side = i === 0 ? 'start' : i === panes.length - 1 ? 'end' : 'middle';
      pane.classList.add('df-split-pane', 'df-split-' + side);
      pane.style.setProperty('--df-pane-delay', i * STAGGER + 'ms');
    });
    var spec = DocForm.data(split, 'split', '');
    if (spec) split.style.setProperty('--df-split-cols', splitColumns(spec, panes.length));
    split.style.setProperty('--df-split-count', String(Math.max(panes.length, 1)));
  }

  function show(el) {
    el.classList.add('df-revealed');
  }

  function calloutVisible(top, bottom, height, scrolled, remaining) {
    // Widen the band at the page ends so every callout can reach it.
    var inset = height * CALLOUT_INSET;
    var start = Math.min(inset, Math.max(0, scrolled));
    var end = height - Math.min(inset, Math.max(0, remaining));
    return bottom > start && top < end;
  }

  function slideCallouts(callouts) {
    if (!callouts.length) return;
    var pending = false;
    callouts.forEach(function (el) { el.classList.add('df-callout-slide'); });

    function update() {
      pending = false;
      var height = root.innerHeight;
      var scrolled = root.scrollY;
      var remaining = html.scrollHeight - height - scrolled;
      var visible = callouts.map(function (el) {
        var rect = el.getBoundingClientRect();
        return calloutVisible(rect.top, rect.bottom, height, scrolled, remaining);
      });
      callouts.forEach(function (el, i) {
        el.classList.toggle('df-callout-away', !visible[i]);
      });
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(update);
    }

    update();
    root.addEventListener('scroll', schedule, { capture: true, passive: true });
    root.addEventListener('resize', schedule);
    if (typeof root.ResizeObserver === 'function') {
      var observer = new root.ResizeObserver(schedule);
      observer.observe(document.querySelector('.df-page') || document.body);
      callouts.forEach(function (el) { observer.observe(el); });
    }
  }

  var boot = DocForm._boot;
  function setupSplits() { DocForm.all('.df-split').forEach(setupSplit); }
  if (boot) DocForm.register('split-views', setupSplits);
  DocForm.register('reveal', function () {
    var splits = !boot || boot.enabled('split-views');
    if (!boot) setupSplits();
    if (!boot || boot.enabled('callouts')) slideCallouts(DocForm.all('.df-page .df-callout:not([data-df-no-reveal])'));
    var targets = DocForm.all(splits ? SELECTOR + ', ' + SPLIT : SELECTOR);
    if (!canObserve) {
      targets.forEach(show);
      return;
    }
    var observer = revealer(root.IntersectionObserver, show);
    targets.forEach(function (el) {
      var delay = DocForm.num(el, 'reveal-delay', NaN);
      if (isFinite(delay)) el.style.setProperty('--df-reveal-delay', delay + 'ms');
      observer.observe(el);
    });
    if (html && html.classList) html.classList.add('df-reveal-on');
  });

  DocForm.reveal = {
    shouldReveal: shouldReveal,
    revealer: revealer,
    splitColumns: splitColumns,
    calloutVisible: calloutVisible,
    show: show
  };
})(typeof window !== 'undefined' ? window : globalThis);
