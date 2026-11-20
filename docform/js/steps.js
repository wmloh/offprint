// Figure steps and standalone cards with authored details.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] steps.js needs core.js loaded before it.');
    return;
  }

  var items = DocForm._items;
  var detail = DocForm._detail;
  if (!detail) {
    if (typeof console !== 'undefined') console.warn('[docform] steps.js needs detail.js loaded before it.');
    return;
  }
  var figures = new WeakMap();
  var cards = new WeakMap();

  function detailsIn(box) {
    var pane = box.querySelector(':scope > .df-step-details');
    return pane ? Array.from(pane.children) : [];
  }

  function detailById(details, id) {
    return id && details.find(function (child) { return child.id === id; });
  }

  function selectOnPointer(row, state, index) {
    // Scrolling can move a row under a stationary pointer and dispatch pointerenter.
    row.addEventListener('pointermove', function (event) {
      if ((event.pointerType === 'mouse' || event.pointerType === 'pen') &&
          state.controller.snapshot().index !== index) state.choose(index, 'user');
    });
  }

  var uniqueId = detail.uniqueId;

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
    detail.scrollport(list);
    return detail.panel(details);
  }

  function prepareFigure(box) {
    var figure = box.querySelector(':scope > figure');
    var panel = box.querySelector(':scope > .df-step-panel');
    if (!figure || !panel) {
      items.issue('figure-steps', box, 'A figure-step panel needs a figure and controls.', 'Add direct figure and .df-step-panel children.');
      return null;
    }
    var list = panel.querySelector(':scope > .df-step-list') || panel;
    var domain = items.domain('figure-steps', box, DocForm.all(':scope > button, :scope > li > button', list));
    if (!domain) return null;
    var details = detailsIn(box);
    var targets = domain.items.map(function (button) {
      return detailById(details, DocForm.data(button, 'detail', null));
    });
    if (domain.items.some(function (button, i) { return button.hasAttribute('data-df-detail') && !targets[i]; })) {
      items.issue('figure-steps', box, 'A figure step links to a missing detail.', 'Use the ID of a direct child of .df-step-details.');
      return null;
    }
    return { domain: domain, figure: figure, list: list, details: details, targets: targets };
  }

  function setupFigure(box) {
    var prepared = prepareFigure(box);
    if (!prepared) return;
    var domain = prepared.domain;
    var figure = prepared.figure;
    var list = prepared.list;
    var buttons = domain.items;
    var highlight = trackSelection(list, buttons);
    var panes = setupPanes(list, prepared.details);

    function sync(current, origin) {
      if (!current.animationKey || !DocForm._animationStep) return null;
      var notification = DocForm._animationStep(figure, current.animationKey, origin);
      if (notification === false) {
        items.issue('figure-steps', box, 'Unknown animation key "' + current.animationKey + '".', 'Use a key from the figure animation or start.');
      }
      return notification;
    }

    var state = items.controller('figure-steps', box, domain, function (index, key) {
      var target = prepared.targets[index];
      return { key: key, index: index, animationKey: items.key(DocForm.data(buttons[index], 'animation-key')),
        detailId: target ? target.id : null };
    }, function (current, previous, origin) {
      if (previous) buttons[previous.index].removeAttribute('aria-current');
      var button = buttons[current.index];
      button.setAttribute('aria-current', 'step');
      highlight(button);
      panes.show(prepared.targets[current.index]);
      return sync(current, origin);
    });

    buttons.forEach(function (button, index) {
      var target = prepared.targets[index];
      if (figure.id) button.setAttribute('aria-controls', figure.id);
      if (target) {
        var describedBy = button.getAttribute('aria-describedby');
        button.setAttribute('aria-describedby', describedBy ? describedBy + ' ' + target.id : target.id);
      }
      var row = button.parentElement === list ? button : button.parentElement;
      function choose() { state.choose(index, 'user'); }
      selectOnPointer(row, state, index);
      button.addEventListener('focus', choose);
      button.addEventListener('click', choose);
    });
    box.classList.add('df-figure-steps-ready');
    figure.classList.add('df-step-figure');
    figures.set(box, state.controller);
    detail.source(box, state.controller);
    state.start();
    if (document.readyState !== 'complete' && !(DocForm.animation && DocForm.animation.get(figure))) {
      root.addEventListener('load', function () {
        var notify = sync(state.controller.snapshot(), 'init');
        if (typeof notify === 'function') items.notify(notify);
      }, { once: true });
    }
  }

  function prepareCards(box) {
    var panel = box.querySelector(':scope > .df-step-panel');
    var list = panel && panel.querySelector(':scope > .df-step-list');
    var details = detailsIn(box);
    var buttons = list ? DocForm.all(':scope > button, :scope > .df-step-group > button', list) : [];
    var targets = buttons.map(function (button) {
      return detailById(details, DocForm.data(button, 'detail', null));
    });
    if (!buttons.length || !list.getAttribute('aria-labelledby') || targets.length !== details.length ||
        !targets.every(Boolean) || new Set(targets).size !== details.length) {
      items.issue('cards', box, 'A card panel needs a labelled list and one button per detail.',
        'Set aria-labelledby and set data-df-detail to its corresponding detail ID.');
      return null;
    }
    var domain = items.domain('cards', box, buttons);
    return domain && { domain: domain, list: list, details: details, targets: targets };
  }

  function setupCards(box) {
    var prepared = prepareCards(box);
    if (!prepared) return;
    var domain = prepared.domain;
    var list = prepared.list;
    var buttons = domain.items;
    var targets = prepared.targets;
    var highlight;
    var panes;

    function setTabStop(index) {
      buttons.forEach(function (button, i) { button.tabIndex = i === index ? 0 : -1; });
    }

    var state = items.controller('cards', box, domain, function (index, key) {
      return { key: key, index: index, detailId: targets[index].id };
    }, function (current) {
      var index = current.index;
      var focused = buttons.indexOf(document.activeElement);
      setTabStop(focused < 0 ? index : focused);
      buttons.forEach(function (button, i) {
        button.setAttribute('aria-selected', String(i === index));
      });
      highlight(buttons[index]);
      panes.show(targets[index]);
    });

    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    buttons.forEach(function (button, i) {
      var target = targets[i];
      if (!button.id) button.id = uniqueId(target.id + '-card');
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
      button.setAttribute('aria-controls', target.id);
      target.setAttribute('role', 'tabpanel');
      target.setAttribute('aria-labelledby', button.id);
      selectOnPointer(button, state, i);
      button.addEventListener('click', function () {
        state.choose(i, 'user');
      });
      button.addEventListener('focus', function () { setTabStop(i); });
      button.addEventListener('blur', function (event) {
        if (!buttons.includes(event.relatedTarget)) setTabStop(state.controller.snapshot().index);
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

    panes = setupPanes(list, prepared.details);
    highlight = trackSelection(list, buttons);
    box.classList.add('df-card-panel-ready');
    cards.set(box, state.controller);
    detail.source(box, state.controller);
    state.start();
  }

  DocForm.figureSteps = { get: function (target) { return figures.get(items.target(target)) || null; } };
  DocForm.cards = { get: function (target) { return cards.get(items.target(target)) || null; } };

  items.scan('figure-steps', function () {
    DocForm.all('.df-figure-steps').forEach(function (box) {
      var prepared = prepareFigure(box);
      items.collect('figure-steps', box, prepared && prepared.domain);
    });
  });
  items.scan('cards', function () {
    DocForm.all('.df-card-panel').forEach(function (box) {
      var prepared = prepareCards(box);
      items.collect('cards', box, prepared && prepared.domain);
    });
  });
  DocForm.register('figure-steps', function () { DocForm.all('.df-figure-steps').forEach(setupFigure); });
  DocForm.register('cards', function () { DocForm.all('.df-card-panel').forEach(setupCards); });
})(typeof window !== 'undefined' ? window : globalThis);
