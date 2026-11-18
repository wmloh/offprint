// Figure steps and standalone cards with authored details.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] steps.js needs core.js loaded before it.');
    return;
  }

  var selectors = new WeakMap();

  function watchScrollbar(panel) {
    panel.classList.add('df-step-scrollport');

    function show(over) {
      panel.classList.toggle('df-step-scrollbar-hover', over);
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

  function detailsIn(box) {
    var pane = box.querySelector(':scope > .df-step-details');
    return pane ? Array.from(pane.children) : [];
  }

  function detailById(details, id) {
    return id && details.find(function (detail) { return detail.id === id; });
  }

  function showDetail(details, active) {
    details.forEach(function (detail) { detail.inert = detail !== active; });
  }

  function uniqueId(base) {
    var id = base;
    for (var suffix = 2; document.getElementById(id); suffix++) id = base + '-' + suffix;
    return id;
  }

  // A hidden bold copy in the same grid cell reserves the label's selected width.
  function wrapLabel(button) {
    var label = document.createElement('span');
    label.className = 'df-step-label';
    label.append.apply(label, Array.from(button.childNodes));
    var bold = label.cloneNode(true);
    bold.className = 'df-step-label-bold';
    bold.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(bold.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
    button.append(label, bold);
  }

  // One highlight slides between rows; transitions retarget from wherever it is.
  function trackSelection(list, buttons) {
    var marker = document.createElement('span');
    marker.className = 'df-step-indicator';
    marker.setAttribute('aria-hidden', 'true');
    list.insertBefore(marker, list.firstChild);
    buttons.forEach(wrapLabel);
    var current;

    function place() {
      if (!current) return;
      marker.style.transform = 'translate(' + current.offsetLeft + 'px, ' + current.offsetTop + 'px)';
      marker.style.width = current.offsetWidth + 'px';
      marker.style.height = current.offsetHeight + 'px';
    }

    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(place);
      observer.observe(list);
      buttons.forEach(function (button) { observer.observe(button); });
    }

    return function (button) {
      if (current) marker.classList.add('df-step-indicator-glide');
      current = button;
      place();
    };
  }

  function setupPanes(list, details) {
    watchScrollbar(list);
    details.forEach(function (detail) {
      if (detail.getAttribute('tabindex') === null) detail.setAttribute('tabindex', '0');
      watchScrollbar(detail);
    });
  }

  function setupFigure(box) {
    var figure = box.querySelector(':scope > figure');
    var panel = box.querySelector(':scope > .df-step-panel');
    if (!figure || !panel) {
      DocForm.warnOnce('steps:layout', 'A .df-figure-steps block needs a figure and a .df-step-panel.');
      return;
    }
    var list = panel.querySelector(':scope > .df-step-list') || panel;
    var buttons = DocForm.all(':scope > button[data-df-step], :scope > li > button[data-df-step]', list);
    if (!buttons.length) {
      DocForm.warnOnce('steps:buttons', 'A .df-step-panel needs buttons with data-df-step.');
      return;
    }
    var details = detailsIn(box);
    var entries = buttons.map(function (button, index) {
      var value = button.getAttribute('data-df-step').trim();
      var number = Number(value);
      var step = value && Number.isSafeInteger(number) && number >= 0 ? number : index + 1;
      var detail = detailById(details, button.getAttribute('data-df-step-detail'));
      return { button: button, index: index, step: step, detail: detail };
    });
    var shown;
    var highlight = trackSelection(list, buttons);

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
      highlight(entry.button);
      showDetail(details, entry.detail);
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
      var row = button.parentElement === list ? button : button.parentElement;
      // Scrolling can move a row under a stationary pointer and dispatch pointerenter.
      row.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') select(entry);
      });
      button.addEventListener('focus', function () { select(entry); });
      button.addEventListener('click', function () { select(entry); });
    });
    setupPanes(list, details);
    box.classList.add('df-figure-steps-ready');
    figure.classList.add('df-step-figure');
    if (!select(entries[0]) && document.readyState !== 'complete') {
      root.addEventListener('load', sync, { once: true });
    }
  }

  function setupCards(box) {
    var panel = box.querySelector(':scope > .df-step-panel');
    var list = panel && panel.querySelector(':scope > .df-step-list');
    var details = detailsIn(box);
    var buttons = list ? DocForm.all(':scope > button[data-df-card], :scope > .df-step-group > button[data-df-card]', list) : [];
    var targets = buttons.map(function (button) {
      return detailById(details, button.getAttribute('data-df-card'));
    });
    if (!buttons.length || !list.getAttribute('aria-labelledby') || targets.length !== details.length ||
        !targets.every(Boolean) || new Set(targets).size !== details.length) {
      DocForm.warnOnce('steps:cards', 'A .df-card-panel needs a labelled .df-step-list and one button per detail.');
      return;
    }

    var selected;
    var highlight;

    function setTabStop(index) {
      buttons.forEach(function (button, i) { button.tabIndex = i === index ? 0 : -1; });
    }

    function select(index) {
      setTabStop(index);
      if (index === selected) return;
      selected = index;
      buttons.forEach(function (button, i) {
        button.setAttribute('aria-selected', String(i === index));
      });
      highlight(buttons[index]);
      showDetail(details, targets[index]);
    }

    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    buttons.forEach(function (button, i) {
      var detail = targets[i];
      if (!button.id) button.id = uniqueId(detail.id + '-card');
      var group = button.parentElement !== list && button.parentElement;
      // A tab list cannot own named groups, so each group title describes its cards instead.
      var groupHeading = group && group.querySelector(':scope > .df-step-group-heading');
      if (group) group.setAttribute('role', 'none');
      if (groupHeading) {
        if (!groupHeading.id) groupHeading.id = uniqueId(list.getAttribute('aria-labelledby') + '-group');
        groupHeading.setAttribute('aria-hidden', 'true');
        var describedBy = button.getAttribute('aria-describedby');
        button.setAttribute('aria-describedby', describedBy ? describedBy + ' ' + groupHeading.id : groupHeading.id);
      }
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', detail.id);
      detail.setAttribute('role', 'tabpanel');
      detail.setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', function () { select(i); });
      button.addEventListener('focus', function () { setTabStop(i); });
      button.addEventListener('blur', function (event) {
        if (!buttons.includes(event.relatedTarget)) setTabStop(selected);
      });
      button.addEventListener('keydown', function (event) {
        var last = buttons.length - 1;
        var next;
        switch (event.key) {
          case 'ArrowUp': next = i === 0 ? last : i - 1; break;
          case 'ArrowDown': next = i === last ? 0 : i + 1; break;
          case 'Home': next = 0; break;
          case 'End': next = last; break;
          default: return;
        }
        event.preventDefault();
        buttons[next].focus();
      });
    });

    setupPanes(list, details);
    highlight = trackSelection(list, buttons);
    select(0);
    box.classList.add('df-card-panel-ready');
  }

  DocForm.steps = {
    select: function (target, step) {
      var figure = typeof target === 'string' ? document.getElementById(target) : target;
      var select = selectors.get(figure);
      return select ? select(step) : false;
    }
  };

  DocForm.register('steps', function () {
    DocForm.all('.df-figure-steps').forEach(setupFigure);
    DocForm.all('.df-card-panel').forEach(setupCards);
  });
})(typeof window !== 'undefined' ? window : globalThis);
