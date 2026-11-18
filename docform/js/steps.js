// Figure steps selected by pointer, keyboard, touch, or page controls.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] steps.js needs core.js loaded before it.');
    return;
  }

  var selectors = new WeakMap();

  function watchScrollbar(panel) {
    function show(over) {
      panel.classList.toggle('df-step-scrollbar-hover', over);
    }

    panel.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch' || panel.scrollHeight <= panel.clientHeight) {
        show(false);
        return;
      }
      var rect = panel.getBoundingClientRect();
      var gutter = Math.max(8, panel.offsetWidth - panel.clientWidth);
      var left = panel.clientLeft > 0 || root.getComputedStyle(panel).direction === 'rtl';
      var distance = left ? event.clientX - rect.left : rect.right - event.clientX;
      show(distance >= 0 && distance <= gutter);
    }, { passive: true });
    panel.addEventListener('pointerleave', function () { show(false); });
  }

  function setup(box) {
    var figure = box.querySelector(':scope > figure');
    var panel = box.querySelector(':scope > .df-step-panel');
    if (!figure || !panel) {
      DocForm.warnOnce('steps:layout', 'A .df-figure-steps block needs a figure and a .df-step-panel.');
      return;
    }
    var buttons = DocForm.all(':scope > button[data-df-step], :scope > li > button[data-df-step]', panel);
    if (!buttons.length) {
      DocForm.warnOnce('steps:buttons', 'A .df-step-panel needs buttons with data-df-step.');
      return;
    }
    var description = box.querySelector(':scope > .df-step-details');
    var details = description ? Array.from(description.children) : [];
    var entries = buttons.map(function (button, index) {
      var value = button.getAttribute('data-df-step').trim();
      var number = Number(value);
      var step = value && Number.isSafeInteger(number) && number >= 0 ? number : index + 1;
      var detailId = button.getAttribute('data-df-step-detail');
      var detail = detailId && details.find(function (el) { return el.id === detailId; });
      return { button: button, index: index, step: step, detail: detail };
    });
    var shown;

    function sync() {
      var ctl = DocForm.anim && DocForm.anim.get(figure);
      if (ctl) ctl.go(shown.step);
      return ctl;
    }

    function select(entry) {
      if (entry === shown) return;
      if (shown) shown.button.removeAttribute('aria-current');
      shown = entry;
      entry.button.setAttribute('aria-current', 'step');
      details.forEach(function (detail) { detail.inert = detail !== entry.detail; });
      figure.setAttribute('data-df-active-step', String(entry.step));
      var ctl = sync();
      if (shown === entry) {
        figure.dispatchEvent(new root.CustomEvent('df:figurestep', { detail: { index: entry.index, step: entry.step } }));
      }
      return ctl;
    }

    selectors.set(figure, function (step) {
      if (shown && shown.step === step) return true;
      var entry = entries.find(function (item) { return item.step === step; });
      if (!entry) return false;
      select(entry);
      return true;
    });

    entries.forEach(function (entry) {
      var button = entry.button;
      if (figure.id) button.setAttribute('aria-controls', figure.id);
      if (entry.detail) {
        var describedBy = button.getAttribute('aria-describedby');
        button.setAttribute('aria-describedby', describedBy ? describedBy + ' ' + entry.detail.id : entry.detail.id);
      }
      var row = button.parentElement === panel ? button : button.parentElement;
      // Scrolling can move a row under a stationary pointer and dispatch pointerenter.
      row.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') select(entry);
      });
      button.addEventListener('focus', function () { select(entry); });
      button.addEventListener('click', function () { select(entry); });
    });
    watchScrollbar(panel);
    box.classList.add('df-figure-steps-ready');
    figure.classList.add('df-step-figure');
    if (!select(entries[0]) && document.readyState !== 'complete') {
      root.addEventListener('load', sync, { once: true });
    }
  }

  DocForm.steps = {
    select: function (target, step) {
      var figure = typeof target === 'string' ? document.getElementById(target) : target;
      var select = selectors.get(figure);
      return select ? select(step) : false;
    }
  };

  DocForm.register('steps', function () {
    DocForm.all('.df-figure-steps').forEach(setup);
  });
})(typeof window !== 'undefined' ? window : globalThis);
