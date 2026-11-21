// Peek bubbles: every <details> in the page becomes a small tinted bubble showing its title. Near the viewport centre
// it grows in place, with a smooth animation, into a larger bubble holding the content; bubbles open at the same time
// each grow where they stand. The content is clear only while the pointer is over it (or focus is in it; a tap keeps
// it clear), and scrolling past the bubble shrinks it back, holding the text below it still.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] bubble.js needs core.js loaded before it.');
    return;
  }

  // Fractions of the viewport height: a bubble opens once its centre rises above `open`, stays open while its top
  // is above `keep`, and collapses once its bottom passes above `passed`. At most MOST are open at once.
  var BAND = { open: 0.6, keep: 0.75, passed: 0.1 };
  var MOST = 3;
  var DURATION = 420;
  var EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  var doc = root.document;
  var count = 0;

  // Indexes of the bubbles to show, in page order. Open ones keep a wider band so they do not flicker at the edge.
  // At most MOST are shown, preferring those nearest the viewport centre. `skip` marks dismissed bubbles.
  function pick(boxes, vh, open) {
    var chosen = [];
    boxes.forEach(function (b, i) {
      if (b.skip || b.bottom < vh * BAND.passed) return;
      var centre = (b.top + b.bottom) / 2;
      if (open.indexOf(i) >= 0 ? b.top > vh * BAND.keep : centre > vh * BAND.open) return;
      chosen.push({ index: i, dist: Math.abs(centre - vh / 2) });
    });
    return chosen.sort(function (a, b) { return a.dist - b.dist; }).slice(0, MOST)
      .map(function (c) { return c.index; }).sort(function (a, b) { return a - b; });
  }

  function make(tag, className) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  // Collapsed bubbles keep their content in a hidden store under body, laid out at the column width, so page modules
  // (references, code, charts) still find and render it.
  function build(details, store) {
    var summary = details.querySelector(':scope > summary');
    var anchor = make('div', 'df-bubble');
    var title = make('span', 'df-bubble-title');
    var sheet = make('div', 'df-bubble-sheet');
    // df-page gives the content the page's typography and lets page modules (code, zoom) find it.
    var body = make('div', 'df-bubble-body df-page');

    Array.prototype.forEach.call(details.attributes, function (attr) {
      // data-df-reveal is dropped: reveal.js may already have chosen its targets, which would leave the bubble hidden.
      if (attr.name === 'open' || attr.name === 'data-df-reveal') return;
      if (attr.name === 'class') anchor.className += ' ' + attr.value;
      else anchor.setAttribute(attr.name, attr.value);
    });
    if (summary) {
      while (summary.firstChild) title.appendChild(summary.firstChild);
      summary.remove();
    } else title.textContent = 'Details';
    while (details.firstChild) body.appendChild(details.firstChild);

    sheet.id = 'df-bubble-' + (++count);
    anchor.setAttribute('role', 'button');
    anchor.tabIndex = 0;
    anchor.setAttribute('aria-expanded', 'false');
    anchor.setAttribute('aria-controls', sheet.id);
    anchor.appendChild(title);

    body.tabIndex = 0;
    sheet.appendChild(body);
    store.appendChild(sheet);

    details.replaceWith(anchor);
    return { anchor: anchor, sheet: sheet, body: body, open: false, dismissed: false, wantReveal: false, anim: null };
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }

  function stop(b) {
    if (b.anim) b.anim.forEach(function (a) { a.cancel(); });
    b.anim = null;
  }

  // Grows or shrinks the bubble between two sizes: its width, and the sheet's height and opacity.
  function resize(b, width, height, opacity, done) {
    var opts = { duration: DURATION, easing: EASE };
    var anims = b.anim = [
      b.anchor.animate([{ width: width[0] + 'px' }, { width: width[1] + 'px' }], opts),
      b.sheet.animate([{ height: height[0] + 'px', opacity: opacity[0] }, { height: height[1] + 'px', opacity: opacity[1] }], opts)
    ];
    anims[1].onfinish = function () {
      if (b.anim !== anims) return;
      b.anim = null;
      done();
    };
    return anims;
  }

  // Keeps the text below a shrinking bubble still by scrolling with the change in its height, frame by frame.
  // Browser scroll anchoring is paused meanwhile so that it does not adjust a second time.
  var holding = 0;
  function hold(b) {
    var html = doc.documentElement;
    var last = b.anchor.offsetHeight;
    var live = true;
    holding++;
    html.classList.add('df-bubble-holding');
    function step() {
      var h = b.anchor.offsetHeight;
      if (h !== last) root.scrollBy(0, h - last);
      last = h;
    }
    (function frame() {
      if (!live) return;
      step();
      root.requestAnimationFrame(frame);
    })();
    return function () {
      if (!live) return;
      step();
      live = false;
      if (--holding === 0) html.classList.remove('df-bubble-holding');
    };
  }

  function reveal(b, on) {
    b.anchor.classList.toggle('is-revealed', on !== false && b.open);
  }

  function setup(details) {
    var store = make('div', 'df-bubble-store');
    store.setAttribute('aria-hidden', 'true');
    store.inert = true;
    doc.body.appendChild(store);
    var bubbles = details.map(function (el) { return build(el, store); });
    var shown = [];
    var pending = false;

    // Ends a shrink's scroll hold at the bubble's current height, before its animation is cancelled.
    function unhold(b) {
      if (b.release) b.release();
      b.release = null;
    }

    function open(b) {
      unhold(b);
      // Reopening mid-shrink grows from the current size.
      var from = b.anchor.offsetWidth;
      var fromHeight = b.anim ? b.sheet.offsetHeight : 0;
      var fromOpacity = b.anim ? parseFloat(root.getComputedStyle(b.sheet).opacity) || 0 : 0;
      stop(b);
      b.open = true;
      b.anchor.setAttribute('aria-expanded', 'true');
      b.anchor.appendChild(b.sheet);
      b.anchor.classList.add('is-open');
      if (typeof b.anchor.animate === 'function') {
        resize(b, [from, b.anchor.offsetWidth], [fromHeight, b.sheet.offsetHeight], [fromOpacity, 1], function () {});
      }
      if (b.wantReveal) {
        b.wantReveal = false;
        reveal(b);
        b.body.focus({ preventScroll: true });
      }
    }

    function close(b, animate) {
      if (!b.open) return;
      var hadFocus = b.sheet.contains(doc.activeElement);
      b.open = false;
      b.anchor.setAttribute('aria-expanded', 'false');
      reveal(b, false);
      var vh = root.innerHeight;
      var before = rectOf(b.anchor);
      var from = [b.anchor.offsetWidth, b.sheet.offsetHeight, parseFloat(root.getComputedStyle(b.sheet).opacity)];
      stop(b);
      var settle = function () {
        b.anchor.classList.remove('is-open');
        store.appendChild(b.sheet);
      };
      // Measures the collapsed width; nothing is painted before the bubble is put back to shrink.
      settle();
      var to = b.anchor.offsetWidth;
      if (hadFocus) b.anchor.focus({ preventScroll: true });
      if (!animate || typeof b.anchor.animate !== 'function') {
        // When the bubble is above the viewport, keep the reader's place in the text.
        if (before.bottom <= 0) root.scrollBy(0, rectOf(b.anchor).height - before.height);
        return;
      }
      b.anchor.classList.add('is-open');
      b.anchor.appendChild(b.sheet);
      // Scrolled past: the bubble sits above the middle, so the text the reader is on stays put while it shrinks.
      if (before.bottom < vh / 2) b.release = hold(b);
      resize(b, [from[0], to], [from[1], 0], [isFinite(from[2]) ? from[2] : 1, 0], function () {
        settle();
        unhold(b);
      });
    }

    function update() {
      pending = false;
      var vh = root.innerHeight;
      var boxes = bubbles.map(function (b) {
        var box = rectOf(b.anchor);
        // A dismissed bubble becomes a candidate again once it has left the band.
        if (b.dismissed && (box.bottom < vh * BAND.passed || box.top > vh * BAND.keep)) b.dismissed = false;
        box.skip = b.dismissed;
        return box;
      });
      var next = pick(boxes, vh, shown);
      shown.forEach(function (i) { if (next.indexOf(i) < 0) close(bubbles[i], true); });
      next.forEach(function (i) { if (shown.indexOf(i) < 0) open(bubbles[i]); });
      shown = next;
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(update);
    }

    function activate(b) {
      if (b.open) {
        reveal(b);
        b.body.focus({ preventScroll: true });
        return;
      }
      b.dismissed = false;
      b.wantReveal = true;
      b.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      schedule();
    }

    bubbles.forEach(function (b, i) {
      var sheet = b.sheet;
      var show = function () { reveal(b); };
      sheet.addEventListener('pointerenter', show);
      sheet.addEventListener('pointerdown', show);
      sheet.addEventListener('focusin', show);
      // Touch fires pointerleave right after a tap, so a tapped bubble stays clear until it collapses.
      sheet.addEventListener('pointerleave', function (event) {
        if (event.pointerType !== 'touch') reveal(b, false);
      });
      sheet.addEventListener('focusout', function (event) {
        if (!sheet.contains(event.relatedTarget) && !sheet.matches(':hover')) reveal(b, false);
      });
      b.anchor.addEventListener('click', function (event) {
        if (sheet.contains(event.target)) return;
        activate(b);
      });
      b.anchor.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && b.open) {
          event.preventDefault();
          b.dismissed = true;
          close(b, true);
          shown = shown.filter(function (j) { return j !== i; });
          b.anchor.focus({ preventScroll: true });
          return;
        }
        if (event.target !== b.anchor || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        activate(b);
      });
    });

    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    update();
  }

  DocForm.peekBubbles = {
    pick: pick,
    band: Object.assign({}, BAND),
    most: MOST
  };

  DocForm.register('bubble', function () {
    var page = doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
    var list = DocForm.all('details', page).filter(function (el) {
      return !DocForm._component.closestFlag(el, 'no-bubble', 'peek-bubbles') &&
        !el.parentElement.closest('details, .df-dropdown-panel');
    });
    if (list.length) setup(list);
  });
})(typeof window !== 'undefined' ? window : globalThis);
