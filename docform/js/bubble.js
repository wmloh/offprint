// Peek bubbles: every <details> in the page becomes a small tinted bubble showing its title. Near the viewport centre
// it flies into a frosted panel in the right gutter (or expands in place when the gutter is too narrow); bubbles
// open at the same time stack vertically. The content is clear only while the pointer is over it (or focus is in it;
// a tap keeps it clear), and scrolling past the bubble collapses it again.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] bubble.js needs core.js loaded before it.');
    return;
  }

  // Fractions of the viewport height: a bubble opens once its centre rises above `open`, stays open while its top
  // is above `keep`, and collapses once its bottom passes above `passed`. Stacked panels share `stack` of the height.
  var BAND = { open: 0.6, keep: 0.75, passed: 0.1, stack: 0.8 };
  var PANEL = { min: 280, max: 460, margin: 24, gap: 16, most: 3 };
  var DURATION = 420;
  var EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  var STRIP = ['id', 'aria-describedby', 'data-df-term', 'data-df-tip', 'tabindex'];
  var doc = root.document;
  var count = 0;

  // Gutter between the text column's content edge and the viewport edge; too narrow means expanding in place.
  function layout(viewport, contentRight) {
    var free = viewport - contentRight;
    var width = Math.min(PANEL.max, free - 2 * PANEL.margin);
    if (!(width >= PANEL.min)) return { mode: 'inline', width: 0, right: 0 };
    return { mode: 'panel', width: Math.round(width), right: Math.round((free - width) / 2) };
  }

  // Indexes of the bubbles to show, in page order. Open ones keep a wider band so they do not flicker at the edge.
  // At most PANEL.most are shown, preferring those nearest the viewport centre. `skip` marks dismissed bubbles.
  function pick(boxes, vh, open) {
    var chosen = [];
    boxes.forEach(function (b, i) {
      if (b.skip || b.bottom < vh * BAND.passed) return;
      var centre = (b.top + b.bottom) / 2;
      if (open.indexOf(i) >= 0 ? b.top > vh * BAND.keep : centre > vh * BAND.open) return;
      chosen.push({ index: i, dist: Math.abs(centre - vh / 2) });
    });
    return chosen.sort(function (a, b) { return a.dist - b.dist; }).slice(0, PANEL.most)
      .map(function (c) { return c.index; }).sort(function (a, b) { return a - b; });
  }

  // Each panel's height cap when n share the stack, and the tops that centre the stack of `heights` vertically.
  function cap(n, vh) {
    return n ? Math.floor((vh * BAND.stack - PANEL.gap * (n - 1)) / n) : 0;
  }

  function stack(heights, vh) {
    var total = heights.reduce(function (sum, h) { return sum + h; }, 0) + PANEL.gap * Math.max(0, heights.length - 1);
    var top = Math.round((vh - total) / 2);
    return heights.map(function (h) {
      var at = top;
      top += h + PANEL.gap;
      return at;
    });
  }

  function make(tag, className) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  // A copy for display only: no ids, tooltips, or tab stops, so it cannot clash with the original.
  function inert(node) {
    var copy = node.cloneNode(true);
    if (copy.nodeType !== 1) return copy;
    [copy].concat(Array.prototype.slice.call(copy.querySelectorAll('*'))).forEach(function (el) {
      STRIP.forEach(function (name) { el.removeAttribute(name); });
    });
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  }

  function build(details) {
    var id = 'df-bubble-' + (++count);
    var summary = details.querySelector(':scope > summary');
    var anchor = make('div', 'df-bubble');
    var title = make('span', 'df-bubble-title');
    var sheet = make('div', 'df-bubble-sheet');
    // df-page gives the content the page's typography and lets page modules (code, zoom) find it.
    var body = make('div', 'df-bubble-body df-page');
    var panel = make('aside', 'df-bubble-panel');
    var heading = make('div', 'df-bubble-panel-title');

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

    anchor.setAttribute('role', 'button');
    anchor.tabIndex = 0;
    anchor.setAttribute('aria-expanded', 'false');
    anchor.setAttribute('aria-controls', id);
    anchor.appendChild(title);

    body.tabIndex = 0;
    sheet.appendChild(body);

    panel.id = id;
    ['data-df-color', 'data-df-role'].forEach(function (name) {
      if (details.hasAttribute(name)) panel.setAttribute(name, details.getAttribute(name));
    });
    panel.setAttribute('aria-label', title.textContent.trim() || 'Details');
    panel.inert = true;
    heading.appendChild(inert(title));
    panel.appendChild(heading);
    panel.appendChild(sheet);

    details.replaceWith(anchor);
    doc.body.appendChild(panel);
    return { anchor: anchor, panel: panel, sheet: sheet, body: body, open: false, dismissed: false, wantReveal: false, anim: null };
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom };
  }

  // Animates the panel between the bubble's rectangle and its own resting place (FLIP with transform-origin 0 0).
  function morph(b, from, closing, done) {
    if (b.anim) b.anim.cancel();
    var to = rectOf(b.panel);
    if (typeof b.panel.animate !== 'function' || !to.width || !to.height || !from.width) {
      b.anim = null;
      if (done) done();
      return;
    }
    var shrunk = 'translate(' + (from.left - to.left) + 'px, ' + (from.top - to.top) + 'px) scale(' +
      (from.width / to.width) + ', ' + (from.height / to.height) + ')';
    var frames = [{ transform: shrunk, opacity: 0.5 }, { transform: 'none', opacity: 1 }];
    if (closing) frames = [{ transform: 'none', opacity: 1 }, { transform: shrunk, opacity: 0 }];
    var anim = b.anim = b.panel.animate(frames, { duration: DURATION, easing: EASE });
    anim.onfinish = function () {
      if (b.anim === anim) b.anim = null;
      if (done) done();
    };
  }

  function reveal(b, on) {
    on = on !== false && b.open;
    b.panel.classList.toggle('is-revealed', on);
    b.anchor.classList.toggle('is-revealed', on);
  }

  function setup(details) {
    var bubbles = details.map(build);
    var page = doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
    var mode = null;
    var shown = [];
    var pending = false;

    function open(b) {
      b.open = true;
      b.anchor.setAttribute('aria-expanded', 'true');
      if (mode === 'panel') {
        b.panel.appendChild(b.sheet);
        b.panel.inert = false;
        // Placed without sliding; arrange() positions it before the flight starts.
        b.panel.classList.add('is-open', 'is-entering');
        b.anchor.classList.add('is-away');
      } else {
        b.anchor.appendChild(b.sheet);
        b.anchor.classList.add('is-inline');
        if (typeof b.sheet.animate === 'function') {
          b.sheet.animate([{ height: '0px', opacity: 0 }, { height: b.sheet.offsetHeight + 'px', opacity: 1 }],
            { duration: DURATION, easing: EASE });
        }
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
      b.anchor.classList.remove('is-revealed');
      if (b.panel.classList.contains('is-open')) {
        b.panel.inert = true;
        b.anchor.classList.remove('is-away');
        var finish = function () {
          if (b.open) return;
          b.panel.classList.remove('is-open', 'is-revealed', 'is-entering');
        };
        if (animate) morph(b, rectOf(b.anchor), true, finish);
        else finish();
      } else {
        // The bubble shrinks back; when it is above the viewport, keep the reader's place in the text.
        var before = rectOf(b.anchor);
        b.anchor.classList.remove('is-inline');
        b.panel.appendChild(b.sheet);
        if (before.bottom <= 0) root.scrollBy(0, rectOf(b.anchor).height - before.height);
      }
      if (hadFocus) b.anchor.focus({ preventScroll: true });
    }

    // Stacks the open panels in page order, centred vertically, then flies in the ones that just opened.
    function arrange() {
      if (mode !== 'panel') return;
      var vh = root.innerHeight;
      var list = shown.map(function (i) { return bubbles[i]; });
      var limit = cap(list.length, vh);
      list.forEach(function (b) { b.panel.style.maxHeight = limit + 'px'; });
      var tops = stack(list.map(function (b) { return b.panel.offsetHeight; }), vh);
      list.forEach(function (b, i) { b.panel.style.top = tops[i] + 'px'; });
      list.forEach(function (b) {
        if (!b.panel.classList.contains('is-entering')) return;
        morph(b, rectOf(b.anchor), false);
        b.panel.offsetHeight; // Commit the snapped position before transitions return.
        b.panel.classList.remove('is-entering');
      });
    }

    function measure() {
      var r = page.getBoundingClientRect();
      var pad = parseFloat(root.getComputedStyle(page).paddingRight) || 0;
      var next = layout(doc.documentElement.clientWidth, r.right - pad);
      doc.documentElement.style.setProperty('--df-bubble-width', next.width + 'px');
      doc.documentElement.style.setProperty('--df-bubble-right', next.right + 'px');
      if (next.mode === mode) return;
      bubbles.forEach(function (b) { close(b, false); });
      shown = [];
      mode = next.mode;
    }

    function update() {
      pending = false;
      measure();
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
      arrange();
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
      var show = function () { reveal(b); };
      [b.panel, b.sheet].forEach(function (el) {
        el.addEventListener('pointerenter', show);
        el.addEventListener('pointerdown', show);
        el.addEventListener('focusin', show);
        // Touch fires pointerleave right after a tap, so a tapped bubble stays clear until it collapses.
        el.addEventListener('pointerleave', function (event) {
          if (event.pointerType !== 'touch') reveal(b, false);
        });
        el.addEventListener('focusout', function (event) {
          if (!b.sheet.contains(event.relatedTarget) && !b.panel.matches(':hover') && !b.sheet.matches(':hover')) reveal(b, false);
        });
      });
      b.anchor.addEventListener('click', function (event) {
        if (b.sheet.contains(event.target)) return;
        activate(b);
      });
      b.anchor.addEventListener('keydown', function (event) {
        if (event.target !== b.anchor || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        activate(b);
      });
      [b.panel, b.anchor].forEach(function (el) {
        el.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape' || !b.open) return;
          event.preventDefault();
          b.dismissed = true;
          close(b, true);
          shown = shown.filter(function (j) { return j !== i; });
          arrange();
          b.anchor.focus({ preventScroll: true });
        });
      });
    });

    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('resize', schedule);
    // The sidebar sliding away widens the gutter without a resize or scroll.
    doc.addEventListener('transitionend', function (event) {
      if (event.target === doc.body || (event.target.classList && event.target.classList.contains('df-sidebar'))) schedule();
    });
    update();
  }

  DocForm.peekBubbles = DocForm.bubble = {
    layout: layout,
    pick: pick,
    cap: cap,
    stack: stack,
    band: Object.assign({}, BAND),
    panel: Object.assign({}, PANEL)
  };

  DocForm.register('bubble', function () {
    var page = doc.querySelector('.df-page') || doc.querySelector('main') || doc.body;
    var list = DocForm.all('details', page).filter(function (el) {
      return !DocForm._component.closestFlag(el, 'no-bubble', 'peek-bubbles') && !el.parentElement.closest('details');
    });
    if (list.length) setup(list);
  });
})(typeof window !== 'undefined' ? window : globalThis);
