// Figure steps and standalone cards with authored details.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint) {
    if (typeof console !== 'undefined') console.warn('[offprint] steps.js needs core.js loaded before it.');
    return;
  }

  var items = OffPrint._items;
  var detail = OffPrint._detail;
  if (!detail) {
    if (typeof console !== 'undefined') console.warn('[offprint] steps.js needs detail.js loaded before it.');
    return;
  }
  var sequence = OffPrint._sequence;
  var cards = new WeakMap();
  var figures = new WeakMap();

  function detailsIn(box) {
    var pane = box.querySelector(':scope > .op-step-details');
    return pane ? Array.from(pane.children) : [];
  }

  function detailById(details, id) {
    return id && details.find(function (child) { return child.id === id; });
  }

  function selectOnPointer(row, state, index) {
    // Scrolling can move a row under a stationary pointer and dispatch pointerenter.
    row.addEventListener('pointermove', function (event) {
      if ((event.pointerType === 'mouse' || event.pointerType === 'pen') &&
          state.controller.snapshot().index !== index) {
        var choose = function () { state.choose(index, 'user'); };
        if (OffPrint._readerState) OffPrint._readerState.transient(choose);
        else choose();
      }
    });
  }

  var uniqueId = detail.uniqueId;

  function span(className) {
    var el = document.createElement('span');
    el.className = className;
    return el;
  }

  // A hidden bold copy in the same grid cell reserves the label's selected width. Direct .op-tag children move to a
  // right-hand slot outside both copies, so their tooltips are not duplicated.
  function wrapLabel(button, number) {
    var tags = OffPrint._all(':scope > .op-tag', button);
    var label = span('op-step-label');
    label.append.apply(label, Array.from(button.childNodes).filter(function (node) { return tags.indexOf(node) < 0; }));
    var bold = label.cloneNode(true);
    bold.className = 'op-step-label-bold';
    bold.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(bold.querySelectorAll('[id]'), function (el) { el.removeAttribute('id'); });
    if (number != null) {
      // The tab list already announces position, so the circle is visual only.
      var circle = span('op-step-number');
      circle.setAttribute('aria-hidden', 'true');
      circle.textContent = number;
      button.append(circle);
    }
    button.append(label, bold);
    if (tags.length) {
      var slot = span('op-step-tags');
      slot.append.apply(slot, tags);
      button.append(slot);
    }
  }

  // data-op-numbered counts 1..N across groups; an integer data-op-number restarts the count from that value.
  function numbersFor(host, buttons) {
    if (!OffPrint._flag(host, 'numbered')) return [];
    var next = 1;
    return buttons.map(function (button) {
      var own = OffPrint._data(button, 'number', null);
      if (own === null) return String(next++);
      own = own.trim();
      if (/^-?\d+$/.test(own)) next = parseInt(own, 10) + 1;
      return own;
    });
  }

  function searchText(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // data-op-search adds a filter box above the list that matches each label and its tags. A filtered row only hides;
  // the selection stays until the reader picks a visible row.
  function setupFilter(host, panel, list, buttons, rows, noun, changed) {
    if (!host.hasAttribute('data-op-search')) return null;
    if (list === panel) {
      items.issue(noun === 'card' ? 'cards' : 'figure-steps', host, 'A searchable selector needs a .op-step-list.',
        'Wrap the step buttons in .op-step-list inside .op-step-panel.');
      return null;
    }
    var texts = buttons.map(function (button) { return searchText(button.textContent); });
    var shown = buttons.map(function () { return true; });
    var groups = OffPrint._all(':scope > .op-step-group', list);
    var hint = OffPrint._data(host, 'search', '').trim() || 'Filter ' + noun + 's';
    var box = document.createElement('div');
    box.className = 'op-step-search';
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'op-step-search-input';
    input.placeholder = hint;
    input.setAttribute('aria-label', hint);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (list.id) input.setAttribute('aria-controls', list.id);
    box.append(input);
    var empty = document.createElement('p');
    empty.className = 'op-step-empty';
    empty.setAttribute('role', 'status');
    panel.insertBefore(box, list);
    panel.append(empty);

    function apply() {
      var terms = searchText(input.value).split(' ').filter(Boolean);
      var count = 0;
      buttons.forEach(function (button, i) {
        shown[i] = terms.every(function (term) { return texts[i].indexOf(term) >= 0; });
        if (shown[i]) count++;
        rows[i].classList.toggle('op-step-filtered', !shown[i]);
      });
      groups.forEach(function (group) {
        group.classList.toggle('op-step-filtered', !buttons.some(function (button, i) {
          return shown[i] && button.parentElement === group;
        }));
      });
      empty.textContent = count ? '' : 'No matching ' + noun + 's';
      changed();
    }

    var track = OffPrint._readerState?.watch('panel-filter', host,
      function () { return searchText(input.value); }, function (value) {
        if (typeof value !== 'string') return false;
        input.value = value;
        apply();
        return true;
      });
    function filter() {
      apply();
      track?.('user');
    }
    input.addEventListener('input', filter);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && input.value) {
        input.value = '';
        filter();
      } else if (event.key === 'ArrowDown') {
        var first = buttons.find(function (button, i) { return shown[i]; });
        if (first) first.focus();
      } else {
        return;
      }
      event.preventDefault();
    });
    return { input: input, shown: function (i) { return shown[i]; } };
  }

  // One highlight slides between rows; transitions retarget from wherever it is. It hides while its row is filtered.
  function trackSelection(list, buttons, numbers, visible) {
    var marker = document.createElement('span');
    marker.className = 'op-step-indicator';
    marker.setAttribute('aria-hidden', 'true');
    list.insertBefore(marker, list.firstChild);
    buttons.forEach(function (button, i) { wrapLabel(button, numbers[i]); });
    var current;

    function place() {
      if (!current) return;
      var hidden = visible && !visible(buttons.indexOf(current));
      marker.style.visibility = hidden ? 'hidden' : '';
      if (hidden) return;
      marker.style.transform = 'translate(' + current.offsetLeft + 'px, ' + current.offsetTop + 'px)';
      marker.style.width = current.offsetWidth + 'px';
      marker.style.height = current.offsetHeight + 'px';
    }

    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(place);
      observer.observe(list);
      buttons.forEach(function (button) { observer.observe(button); });
    }

    var select = function (button) {
      if (current) marker.classList.add('op-step-indicator-glide');
      current = button;
      place();
    };
    select.refresh = place;
    return select;
  }

  function rowOf(button, list) {
    return button.parentElement === list ? button : button.parentElement;
  }

  function setupPanes(list, details) {
    detail.scrollport(list);
    return detail.panel(details);
  }

  function prepareFigure(box) {
    var figure = box.querySelector(':scope > figure');
    var panel = box.querySelector(':scope > .op-step-panel');
    if (!figure || !panel) {
      items.issue('figure-steps', box, 'A figure-step panel needs a figure and controls.', 'Add direct figure and .op-step-panel children.');
      return null;
    }
    var list = panel.querySelector(':scope > .op-step-list') || panel;
    var domain = items.domain('figure-steps', box, OffPrint._all(':scope > button, :scope > li > button', list));
    if (!domain) return null;
    var details = detailsIn(box);
    var targets = domain.items.map(function (button) {
      return detailById(details, OffPrint._data(button, 'detail', null));
    });
    if (domain.items.some(function (button, i) { return button.hasAttribute('data-op-detail') && !targets[i]; })) {
      items.issue('figure-steps', box, 'A figure step links to a missing detail.', 'Use the ID of a direct child of .op-step-details.');
      return null;
    }
    return { domain: domain, figure: figure, panel: panel, list: list, details: details, targets: targets };
  }

  function setupFigure(box) {
    var prepared = prepareFigure(box);
    if (!prepared) return;
    var domain = prepared.domain;
    var figure = prepared.figure;
    var list = prepared.list;
    var buttons = domain.items;
    var filter = setupFilter(box, prepared.panel, list, buttons, buttons.map(function (button) {
      return rowOf(button, list);
    }), 'step', function () { highlight.refresh(); });
    var labels = buttons.map(function (button, index) {
      return sequence.label(button, button) || domain.keys[index];
    });
    var highlight = trackSelection(list, buttons, numbersFor(box, buttons), filter && filter.shown);
    var panes = setupPanes(list, prepared.details);

    function sync(index, origin) {
      return sequence.apply(figure, domain.keys[index], origin);
    }

    var state = sequence.indexed('figure-steps', box, domain, function (index, previous, origin) {
      if (previous !== null) buttons[previous].removeAttribute('aria-current');
      var button = buttons[index];
      button.setAttribute('aria-current', 'step');
      highlight(button);
      panes.show(prepared.targets[index]);
      return sync(index, origin);
    });
    var pill = sequence.pill(state, {
      className: 'op-figure-step-controls', label: 'Figure steps', controls: figure.id,
      initial: function () { return domain.initial; },
      status: function (current) { return labels[current.index]; }
    });
    if (domain.keys.length > 1) figure.appendChild(pill.element);

    buttons.forEach(function (button, index) {
      var target = prepared.targets[index];
      if (figure.id) button.setAttribute('aria-controls', figure.id);
      if (target) {
        var describedBy = button.getAttribute('aria-describedby');
        button.setAttribute('aria-describedby', describedBy ? describedBy + ' ' + target.id : target.id);
      }
      var row = rowOf(button, list);
      function choose() { state.choose(index, 'user'); }
      selectOnPointer(row, state, index);
      button.addEventListener('focus', choose);
      button.addEventListener('click', choose);
    });
    box.classList.add('op-figure-steps-ready');
    figure.classList.add('op-step-figure');
    figures.set(box, { figure: figure, panel: prepared.panel, list: list, buttons: buttons,
      labels: labels, keys: domain.keys, notes: prepared.targets,
      read: function () { return state.controller.index; } });
    state.start();
    detail.source(box, state.controller);
    if (document.readyState !== 'complete' && !OffPrint.sequence.get(figure)) {
      root.addEventListener('load', function () {
        sequence.start(sync(state.controller.index, 'init'));
      }, { once: true });
    }
  }

  function prepareCards(box) {
    var panel = box.querySelector(':scope > .op-step-panel');
    var list = panel && panel.querySelector(':scope > .op-step-list');
    var details = detailsIn(box);
    var buttons = list ? OffPrint._all(':scope > button, :scope > .op-step-group > button', list) : [];
    var targets = buttons.map(function (button) {
      return detailById(details, OffPrint._data(button, 'detail', null));
    });
    if (!buttons.length || !list.getAttribute('aria-labelledby') || targets.length !== details.length ||
        !targets.every(Boolean) || new Set(targets).size !== details.length) {
      items.issue('cards', box, 'A card panel needs a labelled list and one button per detail.',
        'Set aria-labelledby and set data-op-detail to its corresponding detail ID.');
      return null;
    }
    var domain = items.domain('cards', box, buttons);
    return domain && { domain: domain, panel: panel, list: list, details: details, targets: targets };
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
    var filter = setupFilter(box, prepared.panel, list, buttons, buttons, 'card', function () {
      if (buttons.indexOf(document.activeElement) < 0) setTabStop(state.controller.snapshot().index);
      highlight.refresh();
    });

    function visible(i) { return !filter || filter.shown(i); }

    // A filtered-out selection passes the tab stop to the first visible card.
    function setTabStop(index) {
      if (!visible(index)) index = Math.max(0, buttons.findIndex(function (button, i) { return visible(i); }));
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
      var groupHeading = group && group.querySelector(':scope > .op-step-group-heading');
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
        var order = buttons.filter(function (other, k) { return visible(k); });
        var at = order.indexOf(button);
        var last = order.length - 1;
        var next;
        switch (event.key) {
          case 'ArrowUp':
            if (at === 0 && filter) { filter.input.focus(); event.preventDefault(); return; }
            next = at <= 0 ? last : at - 1;
            break;
          case 'ArrowDown': next = at === last ? 0 : at + 1; break;
          case 'Home': next = 0; break;
          case 'End': next = last; break;
          default: return;
        }
        event.preventDefault();
        order[next].focus();
      });
    });

    panes = setupPanes(list, prepared.details);
    highlight = trackSelection(list, buttons, numbersFor(box, buttons), filter && filter.shown);
    box.classList.add('op-card-panel-ready');
    cards.set(box, state.controller);
    detail.source(box, state.controller);
    state.start();
  }

  OffPrint._cards = { get: function (target) { return cards.get(items.target(target)) || null; } };

  items.scan('figure-steps', function () {
    OffPrint._all('.op-figure-steps').forEach(function (box) {
      var prepared = prepareFigure(box);
      items.collect('figure-steps', box, prepared && prepared.domain);
    });
  });
  items.scan('cards', function () {
    OffPrint._all('.op-card-panel').forEach(function (box) {
      var prepared = prepareCards(box);
      items.collect('cards', box, prepared && prepared.domain);
    });
  });
  OffPrint._figureSteps = { reader: function (box) { return figures.get(box); } };
  OffPrint.register('figure-steps', function () { OffPrint._all('.op-figure-steps').forEach(setupFigure); });
  OffPrint.register('cards', function () { OffPrint._all('.op-card-panel').forEach(setupCards); });
})(typeof window !== 'undefined' ? window : globalThis);
