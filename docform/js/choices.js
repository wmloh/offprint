// Shared choice groups: one fieldset of chips (native radios or checkboxes in pill labels) or, for larger sets, a
// searchable combobox. Parameters, chart legends, results filters, scenarios, and matrices all build through here,
// so every single or multiple choice looks, moves, and answers the keyboard the same way. Every press ripples.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] choices.js needs core.js loaded before it.');
    return;
  }

  // Sets up to this size, in count and total label length, render as chips; larger ones as a combobox.
  var CHIP_LIMIT = 7;
  var CHIP_TEXT = 80;
  var DISPLAYS = ['auto', 'chips', 'combobox'];
  var RIPPLE_MS = 600;
  var count = 0;

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function frame(fn) {
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(fn);
    else fn();
  }

  function fold(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function display(requested, options) {
    if (requested !== 'auto') return requested;
    var text = options.reduce(function (sum, option) { return sum + option.label.length; }, 0);
    return options.length <= CHIP_LIMIT && text <= CHIP_TEXT ? 'chips' : 'combobox';
  }

  // A wave that spreads from the press point, or from the centre for keyboard presses, then removes itself.
  function ripple(el, event) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    var box = el.getBoundingClientRect();
    var pointed = event && typeof event.clientX === 'number' && (event.clientX || event.clientY);
    var x = pointed ? event.clientX - box.left : box.width / 2;
    var y = pointed ? event.clientY - box.top : box.height / 2;
    var size = 2 * Math.sqrt(Math.pow(Math.max(x, box.width - x), 2) + Math.pow(Math.max(y, box.height - y), 2));
    var wave = make('span', 'df-ripple');
    wave.setAttribute('aria-hidden', 'true');
    wave.style.setProperty('--df-ripple-x', x + 'px');
    wave.style.setProperty('--df-ripple-y', y + 'px');
    wave.style.setProperty('--df-ripple-size', size + 'px');
    el.appendChild(wave);
    var done = function () { wave.remove(); };
    wave.addEventListener('animationend', done);
    if (typeof root.setTimeout === 'function') root.setTimeout(done, RIPPLE_MS + 200);
  }

  // Pointer presses ripple where they land; a change with no recent press came from the keyboard and ripples from
  // the centre.
  function rippleOn(el, input) {
    var pressed = 0;
    el.addEventListener('pointerdown', function (event) {
      pressed = Date.now();
      ripple(el, event);
    });
    if (input) input.addEventListener('change', function () {
      if (Date.now() - pressed > RIPPLE_MS) ripple(el);
    });
  }

  function labelInto(el, text) {
    if (DocForm.math && DocForm.math.mixed) el.innerHTML = DocForm.math.mixed(text);
    else el.textContent = text;
  }

  // Authored <label><input value="…"> Text</label> items directly in the fieldset.
  function authoredItems(box) {
    return Array.prototype.filter.call(box.children || [], function (child) {
      return child.tagName === 'LABEL';
    }).map(function (label) {
      var input = Array.prototype.filter.call(label.children || [], function (child) { return child.tagName === 'INPUT'; })[0];
      return input ? { label: label, input: input } : null;
    }).filter(Boolean);
  }

  function matches(items, options, multiple) {
    if (items.length !== options.length) return false;
    var values = options.map(function (option) { return option.value; });
    return items.every(function (item) {
      return item.input.type === (multiple ? 'checkbox' : 'radio') && values.indexOf(item.input.value) >= 0;
    }) && new Set(items.map(function (item) { return item.input.value; })).size === items.length;
  }

  // Native radio or checkbox inputs inside pill labels. Arrow keys, Home, and End move between chips; for a
  // single choice they also choose, as native radios do. A highlight slides to the chosen chip.
  function chips(box, legend, options, multiple, change, authored) {
    var id = 'df-choice-' + (++count);
    var glider = null;
    if (!multiple) {
      glider = make('span', 'df-choices-glider');
      glider.setAttribute('aria-hidden', 'true');
      box.classList.add('df-choices-still');
      box.appendChild(glider);
    }
    var byValue = new Map(authored.map(function (item) { return [item.input.value, item]; }));
    var name = authored.length && authored[0].input.name || id;
    var inputs = options.map(function (option, i) {
      var item = byValue.get(option.value);
      var chip = item ? item.label : make('label');
      var input = item ? item.input : make('input');
      chip.classList.add('df-chip');
      input.classList.add('df-chip-input');
      input.type = multiple ? 'checkbox' : 'radio';
      input.name = name;
      if (!input.id) input.id = id + '-' + i;
      input.value = option.value;
      // Authored text moves into the text span, so the check mark and swatch can sit before it.
      var text = make('span', 'df-chip-text');
      if (item) {
        Array.prototype.slice.call(chip.childNodes).forEach(function (node) {
          if (node !== input) text.appendChild(node);
        });
      }
      if (!text.textContent.trim()) labelInto(text, option.label);
      chip.appendChild(input);
      if (multiple) {
        var tick = make('span', 'df-chip-check');
        tick.setAttribute('aria-hidden', 'true');
        chip.appendChild(tick);
      }
      if (option.swatch) chip.appendChild(option.swatch);
      chip.appendChild(text);
      if (option.note !== undefined) chip.appendChild(make('span', 'df-chip-note', String(option.note)));
      if (option.title) chip.title = option.title;
      if (option.mark) option.mark(chip);
      box.appendChild(chip);
      rippleOn(chip, input);
      input.addEventListener('change', function () {
        if (!multiple) {
          if (input.checked) change(input.value);
          return;
        }
        change(inputs.filter(function (el) { return el.checked; }).map(function (el) { return el.value; }));
      });
      return input;
    });
    var steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    box.addEventListener('keydown', function (event) {
      var at = inputs.indexOf(event.target);
      var step = steps[event.key];
      if (at < 0 || event.altKey || event.ctrlKey || event.metaKey ||
        (step === undefined && event.key !== 'Home' && event.key !== 'End')) return;
      event.preventDefault();
      var next = inputs[event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 :
        (at + step + inputs.length) % inputs.length];
      next.focus();
      if (!multiple && !next.checked) {
        ripple(next.parentNode);
        change(next.value);
      }
    });

    var settled = false;
    function glide() {
      var on = inputs.filter(function (input) { return input.checked; })[0];
      var chip = on && on.parentNode;
      var shown = Boolean(chip && chip.offsetWidth > 0);
      glider.classList.toggle('is-hidden', !shown);
      if (!shown) return;
      glider.style.setProperty('--df-chip-x', chip.offsetLeft + 'px');
      glider.style.setProperty('--df-chip-y', chip.offsetTop + 'px');
      glider.style.setProperty('--df-chip-w', chip.offsetWidth + 'px');
      glider.style.setProperty('--df-chip-h', chip.offsetHeight + 'px');
      if (settled) return;
      settled = true;
      // The first placement jumps into place; later ones slide.
      frame(function () { box.classList.remove('df-choices-still'); });
    }
    if (!multiple && root.ResizeObserver) new root.ResizeObserver(glide).observe(box);
    return function (value) {
      inputs.forEach(function (input) {
        input.checked = multiple ? value.includes(input.value) : input.value === value;
        input.parentNode.classList.toggle('is-selected', input.checked);
      });
      if (!multiple) glide();
    };
  }

  // A text field with role="combobox" that filters a listbox in a dropdown popover. A single choice shows its
  // label in the field; a multiple choice lists removable chips before the field and adds All and None actions.
  function combobox(box, legend, choices, multi, change) {
    var id = 'df-choice-' + (++count);
    if (!legend.id) legend.id = id + '-label';
    var wrap = make('div', 'df-combo');
    var field = make('div', 'df-combo-field');
    var picked = null;
    if (multi) {
      picked = make('ul', 'df-combo-chips');
      picked.setAttribute('aria-label', 'Chosen');
      field.appendChild(picked);
    }
    var input = make('input', 'df-combo-input');
    input.type = 'text';
    input.id = id;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-labelledby', legend.id);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (multi) input.setAttribute('placeholder', 'Search choices');
    field.appendChild(input);
    wrap.appendChild(field);

    var panel = make('div', 'df-dropdown-panel df-combo-panel');
    panel.id = id + '-panel';
    var popover = typeof panel.showPopover === 'function' && DocForm.dropdowns && typeof DocForm.dropdowns.follow === 'function';
    if (popover) panel.setAttribute('popover', 'manual');
    else panel.hidden = true;
    var all = null;
    var none = null;
    var tally = null;
    if (multi) {
      var actions = make('div', 'df-combo-actions');
      all = make('button', 'df-combo-action', 'All');
      none = make('button', 'df-combo-action', 'None');
      tally = make('span', 'df-combo-count');
      [all, none].forEach(function (button) {
        button.type = 'button';
        actions.appendChild(button);
        rippleOn(button);
      });
      actions.appendChild(tally);
      panel.appendChild(actions);
      all.addEventListener('click', function () { change(choices.map(function (choice) { return choice.value; })); });
      none.addEventListener('click', function () { change([]); });
    }
    var list = make('ul', 'df-combo-list');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', legend.id);
    if (multi) list.setAttribute('aria-multiselectable', 'true');
    var options = choices.map(function (choice, i) {
      var option = make('li', 'df-combo-option');
      option.id = id + '-option-' + i;
      option.setAttribute('role', 'option');
      if (choice.mark) choice.mark(option);
      if (multi) {
        var tick = make('span', 'df-chip-check');
        tick.setAttribute('aria-hidden', 'true');
        option.appendChild(tick);
      }
      if (choice.swatch) option.appendChild(choice.swatch);
      var label = make('span', 'df-combo-text', choice.label);
      option.appendChild(label);
      if (choice.note !== undefined) option.appendChild(make('span', 'df-chip-note', String(choice.note)));
      option.addEventListener('pointerdown', function (event) { ripple(option, event); });
      option.addEventListener('click', function () { pick(i); });
      option.addEventListener('mousemove', function () { if (active !== i) activate(i, false); });
      list.appendChild(option);
      return { el: option, label: label, folded: fold(choice.label), value: fold(choice.value) };
    });
    var empty = make('p', 'df-combo-empty', 'No matching choices');
    empty.setAttribute('role', 'status');
    empty.hidden = true;
    panel.appendChild(list);
    panel.appendChild(empty);
    wrap.appendChild(panel);
    box.appendChild(wrap);

    var selected = multi ? [] : null;
    var open = false;
    var active = -1;
    var query = '';
    var stop = null;
    var chipFor = new Map();
    var live = false;

    function labelOf(value) {
      var choice = choices.filter(function (c) { return c.value === value; })[0];
      return choice ? choice.label : '';
    }

    function isOn(i) {
      return multi ? selected.includes(choices[i].value) : selected === choices[i].value;
    }

    function visible() {
      return options.map(function (_, i) { return i; }).filter(function (i) { return !options[i].el.hidden; });
    }

    // Marks the first match in each label so readers see why it stayed.
    function highlight(item, needle) {
      var text = choices[options.indexOf(item)].label;
      var at = needle ? item.folded.indexOf(needle) : -1;
      if (at < 0 || item.folded.length !== text.length) {
        item.label.textContent = text;
        return;
      }
      item.label.textContent = '';
      item.label.appendChild(document.createTextNode(text.slice(0, at)));
      item.label.appendChild(make('mark', null, text.slice(at, at + needle.length)));
      item.label.appendChild(document.createTextNode(text.slice(at + needle.length)));
    }

    function filter() {
      var needle = fold(query.trim());
      options.forEach(function (item) {
        item.el.hidden = Boolean(needle) && item.folded.indexOf(needle) < 0 && item.value.indexOf(needle) < 0;
        highlight(item, needle);
      });
      var shown = visible();
      empty.hidden = shown.length > 0;
      if (shown.indexOf(active) < 0) activate(shown.length ? shown[0] : -1, true);
    }

    function activate(i, scroll) {
      if (active >= 0) options[active].el.classList.remove('is-active');
      active = i;
      if (i < 0) {
        input.removeAttribute('aria-activedescendant');
        return;
      }
      var el = options[i].el;
      el.classList.add('is-active');
      input.setAttribute('aria-activedescendant', el.id);
      if (scroll && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }

    function move(step) {
      var shown = visible();
      if (!shown.length) return;
      var at = shown.indexOf(active);
      activate(shown[at < 0 ? (step > 0 ? 0 : shown.length - 1) : (at + step + shown.length) % shown.length], true);
    }

    function show() {
      if (open) return;
      open = true;
      input.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
      filter();
      var shown = visible();
      var chosen = shown.filter(isOn);
      activate(chosen.length ? chosen[0] : shown.length ? shown[0] : -1, true);
      if (!popover) {
        panel.hidden = false;
        return;
      }
      if (field.offsetWidth) panel.style.minWidth = field.offsetWidth + 'px';
      panel.showPopover();
      stop = DocForm.dropdowns.follow(field, panel);
    }

    function hide() {
      if (!open) return;
      open = false;
      input.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('is-open');
      activate(-1, false);
      query = '';
      input.value = multi ? '' : labelOf(selected);
      if (!popover) {
        panel.hidden = true;
        return;
      }
      if (stop) stop();
      stop = null;
      if (panel.matches(':popover-open')) panel.hidePopover();
    }

    function pick(i) {
      var value = choices[i].value;
      if (!multi) {
        change(value);
        hide();
        return;
      }
      change(isOn(i) ? selected.filter(function (v) { return v !== value; }) : choices.map(function (c) { return c.value; })
        .filter(function (v) { return v === value || selected.includes(v); }));
    }

    function unpick(value) {
      change(selected.filter(function (v) { return v !== value; }));
    }

    if (popover) {
      // The popover closes itself when its field scrolls out of view.
      panel.addEventListener('toggle', function (event) { if (event.newState === 'closed') hide(); });
    }
    // Keep focus in the field while pointing at choices and actions.
    panel.addEventListener('mousedown', function (event) { event.preventDefault(); });
    input.addEventListener('click', show);
    input.addEventListener('focus', function () {
      if (!multi && typeof input.select === 'function') input.select();
    });
    input.addEventListener('input', function () {
      query = input.value;
      if (!open) show();
      filter();
      var shown = visible();
      activate(shown.length ? shown[0] : -1, true);
    });
    input.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        if (!open) show();
        else if (!event.altKey) move(key === 'ArrowDown' ? 1 : -1);
        else if (key === 'ArrowUp') hide();
      } else if (key === 'Enter') {
        if (!open || active < 0) return;
        event.preventDefault();
        ripple(options[active].el);
        pick(active);
      } else if (key === 'Escape') {
        if (open) {
          event.preventDefault();
          hide();
        } else if (input.value && multi) input.value = '';
        else if (!multi) input.value = labelOf(selected);
      } else if (key === 'Tab') hide();
      else if (key === 'Backspace' && multi && !input.value && selected.length) unpick(selected[selected.length - 1]);
    });
    wrap.addEventListener('focusout', function (event) {
      var next = event.relatedTarget;
      if (!next || !(typeof wrap.contains === 'function' && wrap.contains(next))) hide();
    });

    function renderChips() {
      Array.from(chipFor.keys()).forEach(function (value) {
        if (selected.includes(value)) return;
        chipFor.get(value).remove();
        chipFor.delete(value);
      });
      choices.forEach(function (choice, i) {
        if (!selected.includes(choice.value) || chipFor.has(choice.value)) return;
        var chip = make('li', 'df-combo-chip' + (live ? ' is-new' : ''));
        chip.appendChild(make('span', 'df-combo-chip-text', choice.label));
        var remove = make('button', 'df-combo-remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + choice.label);
        remove.addEventListener('click', function () {
          unpick(choice.value);
          input.focus();
        });
        chip.appendChild(remove);
        // Insert before the next chosen chip so chips keep declaration order without moving existing ones.
        var later = choices.slice(i + 1).map(function (c) { return chipFor.get(c.value); }).filter(Boolean)[0];
        picked.insertBefore(chip, later || null);
        chipFor.set(choice.value, chip);
      });
    }

    return function (value) {
      selected = value;
      options.forEach(function (item, i) { item.el.setAttribute('aria-selected', String(isOn(i))); });
      if (multi) {
        renderChips();
        all.disabled = selected.length === choices.length;
        none.disabled = !selected.length;
        tally.textContent = selected.length + ' of ' + choices.length + ' chosen';
      } else if (!open || !query) input.value = labelOf(value);
      live = true;
    };
  }

  // spec: { host?: fieldset, label, hideLabel?, multiple?, options: [{ value, label, swatch?, note?, title?, mark? }],
  // display?: 'auto' | 'chips' | 'combobox', className?, onChange(value) }. A single choice's value is a string; a
  // multiple choice's is an array in option order. Returns { el, display, mismatch, show(value) }; call show with
  // the starting value and again after every accepted change.
  function create(spec) {
    var options = spec.options || [];
    var multiple = !!spec.multiple;
    var host = spec.host && spec.host.tagName === 'FIELDSET' ? spec.host : null;
    var box = host || make('fieldset');
    var requested = spec.display || (host && DocForm.data(host, 'choice-display', null)) || 'auto';
    if (DISPLAYS.indexOf(requested) < 0) {
      DocForm.warnOnce('choice-display:' + requested, 'Unknown choice display "' + requested + '"; use auto, chips, or combobox.', box);
      requested = 'auto';
    }
    var shown = display(requested, options);
    var legend = Array.prototype.filter.call(box.children || [], function (child) { return child.tagName === 'LEGEND'; })[0];
    if (!legend) {
      legend = make('legend');
      labelInto(legend, spec.label || '');
      box.insertBefore(legend, (box.children && box.children[0]) || null);
    }
    legend.classList.add('df-choices-label');
    if (spec.hideLabel) legend.classList.add('is-hidden');

    var authored = host ? authoredItems(box) : [];
    var fits = authored.length > 0 && matches(authored, options, multiple);
    // Authored items are reused as chips when they match; otherwise they make way for generated ones.
    if (!fits || shown !== 'chips') authored.forEach(function (item) { item.label.remove(); });
    box.classList.add('df-choices', 'df-choices-' + shown);
    if (multiple) box.classList.add('is-multiple');
    if (spec.className) spec.className.split(/\s+/).filter(Boolean).forEach(function (name) { box.classList.add(name); });

    var change = typeof spec.onChange === 'function' ? spec.onChange : function () {};
    var showValue = shown === 'chips' ? chips(box, legend, options, multiple, change, fits ? authored : []) :
      combobox(box, legend, options, multiple, change);
    return { el: box, display: shown, mismatch: authored.length > 0 && !fits, show: showValue };
  }

  // Reads authored items as option descriptors: value from the input, label from the visible text.
  function read(fieldset) {
    return authoredItems(fieldset).map(function (item) {
      return { value: item.input.value, label: item.label.textContent.trim(), checked: !!item.input.checked };
    });
  }

  DocForm.choices = {
    create: create,
    read: read,
    ripple: ripple,
    display: display,
    limit: CHIP_LIMIT,
    textLimit: CHIP_TEXT
  };
})(typeof window !== 'undefined' ? window : globalThis);
