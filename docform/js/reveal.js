// Two-way reveals for marked blocks and split views around the viewport centre, and two-way slides for callouts.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] reveal.js needs core.js loaded before it.');
    return;
  }

  var SELECTOR = '[data-df-reveal]:not(.df-callout, .df-split)';
  var SPLIT = '.df-split';
  var STAGGER = 140;
  var CALLOUT_INSET = 0.25;
  // Fractions of the viewport height trimmed from each end of the reveal band. A hidden block enters the wider
  // inset; a shown block stays until it leaves the narrower one, so the edge does not flicker.
  var REVEAL_ENTER = 0.15;
  var REVEAL_KEEP = 0.04;
  var doc = root.document;
  var html = doc && doc.documentElement;
  var component = DocForm._component;
  var tracked = [];

  // Like peek bubbles, a block shows while it sits in a band around the viewport centre and hides again once it
  // moves away. The band widens at the page ends so blocks there can still reach it.
  function revealVisible(top, bottom, height, scrolled, remaining, shown) {
    var inset = height * (shown ? REVEAL_KEEP : REVEAL_ENTER);
    var start = Math.min(inset, Math.max(0, scrolled));
    var end = height - Math.min(inset, Math.max(0, remaining));
    return bottom > start && top < end;
  }

  // "2:1" or "2 1" gives the panes those column shares; missing or invalid shares count as 1.
  function splitColumns(spec, count) {
    var parts = String(spec || '').split(/[\s:\/,]+/).filter(Boolean);
    var cols = [];
    for (var i = 0; i < count; i++) {
      var share = Number(parts[i]);
      cols.push('minmax(0, ' + (Number.isFinite(share) && share > 0 ? share : 1) + 'fr)');
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

  function showTarget(target) {
    var el = component.target(target, 'reveals', true);
    if (!el) return false;
    tracked = tracked.filter(function (t) { return t !== el; });
    show(el);
    return true;
  }

  // Toggles .df-revealed on each tracked block as it enters or leaves the band. data-df-reveal-once blocks stop
  // being tracked after their first entrance.
  function trackReveals(targets) {
    var pending = false;
    tracked = targets.slice();

    function update() {
      pending = false;
      var height = root.innerHeight;
      var scrolled = root.scrollY;
      var remaining = html.scrollHeight - height - scrolled;
      var boxes = tracked.map(function (el) { return el.getBoundingClientRect(); });
      tracked = tracked.filter(function (el, i) {
        var shown = el.classList.contains('df-revealed');
        var next = revealVisible(boxes[i].top, boxes[i].bottom, height, scrolled, remaining, shown) ||
          (shown && el.matches(':focus-within'));
        if (next !== shown) el.classList.toggle('df-revealed', next);
        return !(next && el.hasAttribute('data-df-reveal-once'));
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
  function revealAllowed(el) {
    return boot ? !component.flag(el, 'no-reveal', 'reveals') : !el.hasAttribute('data-df-no-reveal');
  }
  function setupSplits() { DocForm.all('.df-split').forEach(setupSplit); }
  if (boot) DocForm.register('split-views', setupSplits);
  DocForm.register('reveal', function () {
    var splits = !boot || boot.enabled('split-views');
    if (!boot) setupSplits();
    if (!boot || boot.enabled('callouts')) slideCallouts(DocForm.all('.df-page .df-callout').filter(revealAllowed));
    var targets = DocForm.all(splits ? SELECTOR + ', ' + SPLIT : SELECTOR).filter(revealAllowed);
    if (typeof root.requestAnimationFrame !== 'function') {
      targets.forEach(show);
      return;
    }
    targets.forEach(function (el) {
      var delay = component.number(el, 'reveal-delay', 'reveals', null, function (value) { return value >= 0; });
      if (delay !== null) el.style.setProperty('--df-reveal-delay', delay + 'ms');
      el.classList.add('df-reveal-watched');
    });
    if (html && html.classList) html.classList.add('df-reveal-on');
    trackReveals(targets);
  });

  DocForm._reveal = {
    revealVisible: revealVisible,
    splitColumns: splitColumns,
    calloutVisible: calloutVisible,
    show: show
  };
  DocForm.reveals = { show: showTarget };
})(typeof window !== 'undefined' ? window : globalThis);
