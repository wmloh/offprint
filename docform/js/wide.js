// Wide blocks: a top-level figure, table, or wrapper marked data-df-wide grows past the reading column into the free
// space beside it, up to --df-wide-width. It stops a page gutter short of the sidebar, and keeps clear of the right
// margin while the page shows sidenotes or peek panels there. Without room, or without the script, it keeps the
// reading width.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] wide.js needs core.js loaded before it.');
    return;
  }

  var MAX = 1240;
  var EDGE = 24;

  // Extra width on each side of the reading column. `left` and `right` are the column's content edges, `cellLeft` and
  // `cellRight` the edges of the space the page sits in (beside the sidebar). Growth is shared evenly while both sides
  // have room; `margin` keeps the right side for margin content.
  function span(o) {
    var roomLeft = Math.max(0, o.left - o.cellLeft - o.edge);
    var roomRight = o.margin ? 0 : Math.max(0, o.cellRight - o.right - o.edge);
    var extra = Math.min(o.max - (o.right - o.left), roomLeft + roomRight);
    if (!(extra >= 1)) return { left: 0, right: 0 };
    var right = Math.min(roomRight, extra / 2);
    var left = Math.min(roomLeft, extra - right);
    right = Math.min(roomRight, extra - left);
    return { left: Math.floor(left), right: Math.floor(right) };
  }

  function cssPx(el, name, fallback) {
    var value = parseFloat(root.getComputedStyle(el).getPropertyValue(name));
    return isFinite(value) ? value : fallback;
  }

  // Whether sidenotes or peek panels currently use the right margin, judged by their own modules' rules.
  function marginInUse(page, view, contentRight) {
    var html = document.documentElement;
    var notes = DocForm.notes;
    if (notes && notes.fits && page.querySelector('.df-sidenote:not(.df-note-inline)') &&
      notes.fits(view, contentRight, cssPx(html, '--df-note-width', notes.width), cssPx(html, '--df-note-gap', notes.gap),
        notes.edge || 16)) return true;
    var bubble = DocForm.bubble;
    return !!(bubble && bubble.layout && page.querySelector('.df-bubble') && bubble.layout(view, contentRight).mode === 'panel');
  }

  function setup(blocks, page) {
    var html = document.documentElement;
    var pending = false;

    function layout() {
      pending = false;
      var rect = page.getBoundingClientRect();
      var style = root.getComputedStyle(page);
      var left = rect.left + (parseFloat(style.paddingLeft) || 0);
      var right = rect.right - (parseFloat(style.paddingRight) || 0);
      var view = html.clientWidth;
      var base = {
        left: left,
        right: right,
        cellLeft: rect.left - (parseFloat(style.marginLeft) || 0),
        cellRight: Math.min(view, rect.right + (parseFloat(style.marginRight) || 0)),
        edge: cssPx(html, '--df-page-gutter', EDGE),
        margin: marginInUse(page, view, right)
      };
      blocks.forEach(function (el) {
        base.max = cssPx(el, '--df-wide-width', MAX);
        var s = span(base);
        var on = s.left + s.right > 0;
        el.classList.toggle('df-wide-on', on);
        if (on) {
          el.style.setProperty('--df-wide-left', s.left + 'px');
          el.style.setProperty('--df-wide-right', s.right + 'px');
        } else {
          el.style.removeProperty('--df-wide-left');
          el.style.removeProperty('--df-wide-right');
        }
      });
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(layout);
    }

    layout();
    // Later changes, such as the sidebar hiding, glide; the first layout does not.
    root.requestAnimationFrame(function () { html.classList.add('df-wide-ready'); });
    root.addEventListener('resize', schedule);
    if (root.ResizeObserver) new root.ResizeObserver(schedule).observe(page);
    // Hiding the navigation panel animates the page grid without a resize; lay out again once it settles.
    document.addEventListener('transitionend', function (event) {
      var t = event.target;
      if (t === document.body || (t && t.classList && t.classList.contains('df-sidebar'))) schedule();
    });
    return layout;
  }

  DocForm.wide = { span: span, max: MAX };

  DocForm.register('wide', function () {
    var page = document.querySelector('.df-page');
    if (!page) return;
    var blocks = DocForm.all(':scope > [data-df-wide]', page);
    DocForm.all('[data-df-wide]', page).forEach(function (el) {
      if (blocks.indexOf(el) < 0) DocForm.warnOnce('wide:nested', 'data-df-wide works only on direct children of .df-page; ignoring nested blocks.');
    });
    if (blocks.length) DocForm.wide.layout = setup(blocks, page);
  });
})(typeof window !== 'undefined' ? window : globalThis);
