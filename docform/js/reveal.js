// Scroll reveals: elements marked data-df-reveal and every .df-split fade in once on first entering the viewport.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] reveal.js needs core.js loaded before it.');
    return;
  }

  var SELECTOR = '[data-df-reveal], .df-split:not([data-df-no-reveal])';
  var STAGGER = 140;
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

  // Hides reveal targets only once this script runs, so pages stay readable without it.
  if (html && html.classList && canObserve) html.classList.add('df-reveal-on');

  DocForm.register('reveal', function () {
    DocForm.all('.df-split').forEach(setupSplit);
    var targets = DocForm.all(SELECTOR);
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
  });

  DocForm.reveal = {
    shouldReveal: shouldReveal,
    revealer: revealer,
    splitColumns: splitColumns,
    show: show
  };
})(typeof window !== 'undefined' ? window : globalThis);
