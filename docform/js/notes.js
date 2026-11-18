// Footnotes written inline as .df-note: margin sidenotes when the window has room, hover notes otherwise.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] notes.js needs core.js loaded before it.');
    return;
  }

  var WIDTH = 240;
  var GAP = 32;
  var EDGE = 16;
  // Notes inside these stay hover notes: a float there would cover a neighbouring pane or be clipped.
  var INLINE_ONLY = '.df-split, table, figure, pre, .df-tabs, .df-figure-steps, .df-card-panel, .df-bubble-panel, .df-tooltip, .df-zoom';

  // Whether a sidenote column fits between the reading column's right edge and the window's right edge.
  function fits(viewWidth, columnRight, width, gap, edge) {
    return viewWidth - columnRight >= width + gap + edge;
  }

  function cssPx(el, name, fallback) {
    var value = parseFloat(root.getComputedStyle(el).getPropertyValue(name));
    return isFinite(value) ? value : fallback;
  }

  function setup(notes, main) {
    var html = document.documentElement;
    var tooltip = DocForm.tooltips;
    var items = notes.map(function (note, i) {
      var n = i + 1;
      var inline = !!note.parentElement.closest(INLINE_ONLY);
      note.classList.add('df-sidenote');
      if (inline) note.classList.add('df-note-inline');
      note.id = note.id || 'df-note-' + n;
      note.setAttribute('role', 'note');
      var num = document.createElement('span');
      num.className = 'df-sidenote-num';
      num.textContent = n + '';
      num.setAttribute('aria-hidden', 'true');
      note.insertBefore(num, note.firstChild);

      var ref = document.createElement('sup');
      ref.className = 'df-note-ref';
      var mark = document.createElement('button');
      mark.type = 'button';
      mark.className = 'df-note-mark';
      mark.textContent = n + '';
      mark.setAttribute('aria-label', 'Note ' + n);
      mark.setAttribute('aria-controls', note.id);
      ref.appendChild(mark);
      note.before(ref);

      var item = { note: note, mark: mark, inline: inline };
      var link = function (on) {
        note.classList.toggle('is-active', on);
        mark.classList.toggle('is-active', on);
      };
      mark.addEventListener('mouseenter', function () { link(true); });
      mark.addEventListener('mouseleave', function () { link(false); });
      note.addEventListener('mouseenter', function () { link(true); });
      note.addEventListener('mouseleave', function () { link(false); });

      if (tooltip) {
        tooltip.attach(mark, '', '', {
          content: function () {
            var copy = note.cloneNode(true);
            copy.removeAttribute('id');
            copy.removeAttribute('role');
            copy.className = 'df-note-body';
            var badge = copy.querySelector('.df-sidenote-num');
            if (badge) badge.remove();
            return copy;
          },
          className: 'df-note-card',
          focusable: false,
          enabled: function () { return !item.margin; }
        });
      } else {
        // Without tooltip.js, the marker opens the note in place.
        mark.addEventListener('click', function () {
          if (item.margin) return;
          var open = !note.classList.contains('is-open');
          note.classList.toggle('is-open', open);
          mark.setAttribute('aria-expanded', String(open));
        });
      }
      mark.addEventListener('click', function () {
        if (!item.margin) return;
        note.classList.remove('df-note-flash');
        void note.offsetWidth;
        note.classList.add('df-note-flash');
      });
      return item;
    });

    var pending = false;
    function layout() {
      pending = false;
      var rect = main.getBoundingClientRect();
      var columnRight = rect.right - cssPx(main, 'padding-right', 0);
      var width = cssPx(html, '--df-note-width', WIDTH);
      var gap = cssPx(html, '--df-note-gap', GAP);
      var margin = fits(html.clientWidth, columnRight, width, gap, EDGE);
      html.classList.toggle('df-sidenotes', margin);
      items.forEach(function (item) {
        // Modules such as bubble.js may move a note into a panel after setup.
        item.inline = !!item.note.parentElement.closest(INLINE_ONLY);
        item.note.classList.toggle('df-note-inline', item.inline);
        item.margin = margin && !item.inline;
        if (item.margin && tooltip) item.note.classList.remove('is-open');
      });
      if (!margin) return;
      // Floats sit against their own block's right edge; nudge those inside padded blocks out to the column's edge.
      var shifts = items.map(function (item) {
        if (!item.margin) return null;
        var current = parseFloat(item.note.style.getPropertyValue('--df-note-shift')) || 0;
        return current + (columnRight + gap) - item.note.getBoundingClientRect().left;
      });
      items.forEach(function (item, i) {
        if (shifts[i] === null || Math.abs(shifts[i]) < 0.5) item.note.style.removeProperty('--df-note-shift');
        else item.note.style.setProperty('--df-note-shift', Math.round(shifts[i]) + 'px');
      });
    }

    function schedule() {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(layout);
    }

    layout();
    root.addEventListener('resize', schedule);
    if (root.ResizeObserver) new root.ResizeObserver(schedule).observe(main);
    // The navigation panel slides over several frames; lay out again once it settles.
    document.addEventListener('transitionend', function (event) {
      if (event.target && event.target.classList && event.target.classList.contains('df-sidebar')) schedule();
    });
    return { layout: layout };
  }

  var layoutPage = null;
  DocForm.sidenotes = DocForm.notes = {
    fits: fits, width: WIDTH, gap: GAP, edge: EDGE,
    layout: function () {
      if (!layoutPage) return false;
      layoutPage();
      return true;
    }
  };

  DocForm.register('notes', function () {
    var main = document.querySelector('.df-page') || document.querySelector('main') || document.body;
    var notes = DocForm.all('.df-note').filter(function (el) { return !el.closest('.df-tooltip'); });
    if (!notes.length) return;
    layoutPage = setup(notes, main).layout;
  });
})(typeof window !== 'undefined' ? window : globalThis);
