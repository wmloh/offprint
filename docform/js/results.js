// Results tables: table[data-df-results] gets sortable headers, optional heatmap shading per numeric column
// (data-df-heat, with an optional fixed data-df-heat-range), bold best values (data-df-best="max" or "min" on a
// header cell), and labelled pass/fail rules (data-df-threshold="<= 25", data-df-threshold-label).
// Opt-in filters: data-df-filters on the table (or data-df-filter on one header) adds header menus, and
// data-df-chips="Label: Column <= 25 & Other = a | b; …" adds named chips. Heat and best marks follow visible rows.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] results.js needs core.js loaded before it.');
    return;
  }

  // Leading number of a result cell, allowing a currency sign, units, a ± spread, and footnote marks:
  // "92.1 ± 0.3" -> 92.1, "1,204 ms" -> 1204, "−3.5%" -> -3.5. Labels, blanks, and dashes give null.
  var CELL = /^[<>~≈]?\s*[$€£]?\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(?:%|[A-Za-zµ×/]{1,4})?\s*(?:(?:±|\+\/?-)\s*(?:\d+\.?\d*|\.\d+)\s*%?)?\s*[*†‡]*$/i;

  function parseCell(text) {
    var t = String(text == null ? '' : text).trim().replace(/−/g, '-').replace(/(\d),(?=\d{3}\b)/g, '$1');
    var m = t.match(CELL);
    return m ? parseFloat(m[1]) : null;
  }

  // A column is numeric when every filled cell parses and at least one does; dashes and blanks count as empty.
  function numericColumn(texts) {
    var any = false;
    for (var i = 0; i < texts.length; i++) {
      var t = String(texts[i] == null ? '' : texts[i]).trim();
      if (!t || /^[-–—?]$|^n\/?a$/i.test(t)) continue;
      if (parseCell(t) === null) return false;
      any = true;
    }
    return any;
  }

  // Row order for a column: numbers or text, ascending or descending, empty cells last, ties in original order.
  function sortOrder(values, dir, numeric) {
    var sign = dir === 'desc' ? -1 : 1;
    var collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;
    return values.map(function (v, i) { return i; }).sort(function (a, b) {
      var va = values[a];
      var vb = values[b];
      var ea = va === null || va === '';
      var eb = vb === null || vb === '';
      if (ea || eb) return ea === eb ? a - b : ea ? 1 : -1;
      var c = numeric ? va - vb : collator ? collator.compare(va, vb) : String(va).localeCompare(String(vb));
      return c ? sign * c : a - b;
    });
  }

  // Indexes holding the best value (ties included) for "max" or "min".
  function best(values, dir) {
    var nums = values.filter(function (v) { return v !== null; });
    if (!nums.length) return [];
    var target = dir === 'min' ? Math.min.apply(null, nums) : Math.max.apply(null, nums);
    return values.reduce(function (out, v, i) { if (v === target) out.push(i); return out; }, []);
  }

  // Shading strength 0..1 per value, where 1 is the best end ("max" or "min"); a flat column shades nothing.
  // A fixed [lo, hi] range replaces the column's own extent and saturates values beyond it.
  function heat(values, dir, range) {
    var nums = values.filter(function (v) { return v !== null; });
    if (!nums.length) return values.map(function () { return null; });
    var lo = range ? range[0] : Math.min.apply(null, nums);
    var hi = range ? range[1] : Math.max.apply(null, nums);
    return values.map(function (v) {
      if (v === null) return null;
      if (hi === lo) return 0;
      var t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      return +(dir === 'min' ? 1 - t : t).toFixed(4);
    });
  }

  // "0, 60" or "0 ms, 60 ms" -> [0, 60]; anything else, or a range that is not increasing, gives null.
  function heatRange(text) {
    var parts = String(text == null ? '' : text).split(',');
    if (parts.length !== 2) return null;
    var lo = parseCell(parts[0]);
    var hi = parseCell(parts[1]);
    return lo !== null && hi !== null && lo < hi ? [lo, hi] : null;
  }

  // "<= 25 ms" -> { op: '<=', value: 25, text: '25 ms' }; also accepts <, >, >=, ≤, and ≥.
  function threshold(text) {
    var m = String(text == null ? '' : text).trim().match(/^(<=|>=|<|>|≤|≥)\s*(.+)$/);
    var value = m ? parseCell(m[2]) : null;
    if (value === null) return null;
    return { op: m[1] === '≤' ? '<=' : m[1] === '≥' ? '>=' : m[1], value: value, text: m[2].trim() };
  }

  // true (pass), false (fail), or null for a missing value.
  function verdict(rule, v) {
    if (v === null || v === undefined) return null;
    return rule.op === '<' ? v < rule.value : rule.op === '<=' ? v <= rule.value : rule.op === '>' ? v > rule.value : v >= rule.value;
  }

  var SYMBOLS = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

  function direction(value) {
    value = String(value || '').toLowerCase();
    return value === 'min' || value === 'lower' || value === 'low' ? 'min' : value === 'max' || value === 'higher' || value === 'high' ? 'max' : null;
  }

  // Filters below. Time columns hold ISO dates or date-times: "2026-03-01", "2026-03-01 14:05", or
  // "2026-03-01T14:05:09Z" and "+09:00" offsets. Times without a zone read as UTC, like the filter bounds.
  var ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

  function timeParts(text) {
    var m = String(text == null ? '' : text).trim().match(ISO_TIME);
    if (!m) return null;
    var month = +m[2] - 1;
    var day = +m[3];
    var date = new Date(0);
    date.setUTCFullYear(+m[1], month, day);
    var h = +(m[4] || 0);
    var min = +(m[5] || 0);
    var s = +(m[6] || 0);
    if (date.getUTCMonth() !== month || date.getUTCDate() !== day || h > 23 || min > 59 || s > 59) return null;
    var offset = 0;
    if (m[8] && m[8].toUpperCase() !== 'Z') {
      var zone = m[8].replace(':', '');
      var oh = +zone.slice(1, 3);
      var om = zone.length > 3 ? +zone.slice(3) : 0;
      if (oh > 23 || om > 59) return null;
      offset = (zone.charAt(0) === '-' ? -1 : 1) * (oh * 60 + om) * 60000;
    }
    var ms = m[7] ? +(m[7] + '00').slice(0, 3) : 0;
    return { ms: date.getTime() + ((h * 60 + min) * 60 + s) * 1000 + ms - offset, date: !m[4], zone: !!m[8] };
  }

  function timeValue(text) {
    var parts = timeParts(text);
    return parts ? parts.ms : null;
  }

  // Like numericColumn: every filled cell is a date or time and at least one is.
  function timeColumn(texts) {
    var any = false;
    for (var i = 0; i < texts.length; i++) {
      var t = String(texts[i] == null ? '' : texts[i]).trim();
      if (!t || /^[-–—?]$|^n\/?a$/i.test(t)) continue;
      if (!timeParts(t)) return false;
      any = true;
    }
    return any;
  }

  // Whether one cell passes a column filter: { excluded: [texts] } for value lists, or { min, max } bounds (either
  // may be null) for numbers and times. Once a bound is set, a missing value fails.
  function passes(filter, value, key) {
    if (!filter) return true;
    if (filter.excluded) return filter.excluded.indexOf(key) < 0;
    if (filter.min == null && filter.max == null) return true;
    if (value === null || value === undefined) return false;
    return (filter.min == null || value >= filter.min) && (filter.max == null || value <= filter.max);
  }

  function filterActive(filter) {
    return !!filter && (filter.excluded ? filter.excluded.length > 0 : filter.min != null || filter.max != null);
  }

  var OPS = { '≤': '<=', '≥': '>=', '≠': '!=' };

  // "Fast: Latency (ms) <= 25 & Optimizer = adam | sgd; Large: Params (M) >= 2" -> chips with their conditions.
  // A part that does not read as "Label: conditions" comes back with an error instead.
  function parseChips(text) {
    return String(text == null ? '' : text).split(';').map(function (part) { return part.trim(); }).filter(Boolean).map(function (part) {
      var at = part.indexOf(':');
      var label = at > 0 ? part.slice(0, at).trim() : '';
      if (!label) return { text: part, error: 'write it as "Label: Column <= 25".' };
      var conds = [];
      var bad = null;
      part.slice(at + 1).split('&').forEach(function (c) {
        var m = c.trim().match(/^(.+?)\s*(<=|>=|!=|≤|≥|≠|=|<|>)\s*(.+)$/);
        if (m) conds.push({ column: m[1].trim(), op: OPS[m[2]] || m[2], text: m[3].trim() });
        else bad = bad || c.trim();
      });
      if (bad !== null || !conds.length) return { label: label, text: part, error: '"' + (bad || part) + '" needs a column, an operator, and a value.' };
      return { label: label, conds: conds };
    });
  }

  // A chip condition for a column of kind 'number', 'time', or 'text' becomes { test(value, key) } or { error }.
  // = and != take alternatives split by |; text matches whole cells, ignoring case; missing numbers never match.
  function condition(cond, kind) {
    var alts = cond.text.split('|').map(function (t) { return t.trim(); }).filter(Boolean);
    var equal = cond.op === '=' || cond.op === '!=';
    if (kind === 'text') {
      if (!equal) return { error: '"' + cond.column + '" holds text, so use = or != with it.' };
      var want = alts.map(function (t) { return t.toLowerCase(); });
      return { test: function (v, key) { return (want.indexOf(String(key).toLowerCase()) >= 0) === (cond.op === '='); } };
    }
    var nums = alts.map(kind === 'time' ? timeValue : parseCell);
    if (!nums.length || nums.indexOf(null) >= 0 || (!equal && nums.length > 1)) {
      return { error: '"' + cond.text + '" is not ' + (kind === 'time' ? 'a date or time' : 'a number') + (equal ? '' : ' (one value only)') + '.' };
    }
    return {
      test: function (v) {
        if (v === null || v === undefined) return false;
        if (equal) return (nums.indexOf(v) >= 0) === (cond.op === '=');
        return verdict({ op: cond.op, value: nums[0] }, v);
      }
    };
  }

  var ARROWS = '<svg viewBox="0 0 10 12" width="8" height="10" aria-hidden="true" focusable="false">' +
    '<path class="df-sort-up" d="M5 1 9 5H1z"/><path class="df-sort-down" d="M5 11 1 7h8z"/></svg>';

  var FUNNEL = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">' +
    '<path d="M1 2h10L7.2 6.6V10L4.8 11V6.6z"/></svg>';

  // Filter state saved per data block, so Show more and dropped files keep the reader's filters by column name.
  var SAVED = typeof WeakMap === 'function' ? new WeakMap() : null;
  var CONTROLLERS = typeof WeakMap === 'function' ? new WeakMap() : null;
  var BARS = typeof WeakMap === 'function' ? new WeakMap() : null;

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function enhance(table) {
    // Data placeholders build their tables in data.js and enhance them once filled.
    if (table.classList.contains('df-results') || table.closest('[data-df-data]:not(.df-data-ready)')) return;
    var head = table.tHead ? table.tHead.rows[table.tHead.rows.length - 1] : null;
    var body = table.tBodies[0];
    if (!head || !body) {
      DocForm.warnOnce('results-head', 'A results table needs a thead and a tbody.', table);
      return;
    }
    var rows = Array.prototype.slice.call(body.rows);
    var heatAll = table.getAttribute('data-df-heat');
    var filterAll = table.getAttribute('data-df-filters');
    var tint = DocForm.data(table, 'heat-color', null);
    if (tint) table.style.setProperty('--df-heat-color', 'var(--df-' + tint + ')');
    table.classList.add('df-results');

    var columns = Array.prototype.map.call(head.cells, function (th, c) {
      var texts = rows.map(function (tr) {
        var cell = tr.cells[c];
        if (!cell) return '';
        var given = cell.getAttribute('data-df-value');
        return given !== null ? given : cell.textContent;
      });
      var keys = texts.map(function (t) { return String(t).trim(); });
      var numeric = numericColumn(texts);
      var time = !numeric && timeColumn(texts);
      var values = keys.map(function (t) { return numeric ? parseCell(t) : time ? timeValue(t) : t; });
      var bestDir = direction(DocForm.data(th, 'best', null));
      var heatAttr = th.getAttribute('data-df-heat');
      var rangeAttr = th.getAttribute('data-df-heat-range');
      var range = rangeAttr !== null ? heatRange(rangeAttr) : null;
      if (rangeAttr !== null && !range) DocForm.warnOnce('results-range:' + rangeAttr, 'Ignoring heat range "' + rangeAttr + '": use two increasing numbers such as "0, 60".', th);
      var heatOn = numeric && (heatAttr !== null ? heatAttr !== 'false' : !!range || (heatAll !== null && heatAll !== 'false' && c > 0));
      var heatDir = direction(heatAttr) || bestDir || direction(heatAll) || 'max';
      var cellTint = DocForm.data(th, 'heat-color', null);
      var ruleAttr = th.getAttribute('data-df-threshold');
      var rule = ruleAttr !== null ? threshold(ruleAttr) : null;
      if (ruleAttr !== null && !rule) DocForm.warnOnce('results-threshold:' + ruleAttr, 'Ignoring threshold "' + ruleAttr + '": use <, <=, >, or >= and a number, such as "<= 25".', th);
      if (rule && !numeric) {
        DocForm.warnOnce('results-threshold-text', 'A threshold needs a number column; ignoring it.', th);
        rule = null;
      }
      var filterAttr = th.getAttribute('data-df-filter');
      var filterOn = th.colSpan <= 1 && !th.hasAttribute('data-df-no-filter') && filterAttr !== 'false' &&
        (filterAttr !== null || (filterAll !== null && filterAll !== 'false'));
      var name = (th.getAttribute('data-df-column') || th.textContent).trim();

      if (rule) {
        // Each classified cell keeps its text and gains a visible verdict; missing values get none.
        values.forEach(function (v, r) {
          var cell = rows[r].cells[c];
          var pass = verdict(rule, v);
          if (!cell || pass === null) return;
          var tag = document.createElement('span');
          tag.className = 'df-verdict';
          tag.textContent = pass ? 'Pass' : 'Fail';
          cell.classList.add(pass ? 'df-pass' : 'df-fail');
          cell.appendChild(document.createTextNode(' '));
          cell.appendChild(tag);
        });
      }
      if (numeric) th.classList.add('df-num');
      rows.forEach(function (tr) { if (numeric && tr.cells[c]) tr.cells[c].classList.add('df-num'); });
      return {
        th: th, name: name, label: th.textContent.trim(), keys: keys, values: values, numeric: numeric,
        kind: numeric ? 'number' : time ? 'time' : 'text', dateOnly: time && keys.every(function (k) { var p = timeParts(k); return !p || p.date; }),
        zoned: time && keys.some(function (k) { var p = timeParts(k); return p && p.zone; }),
        best: bestDir, rule: rule, heatOn: heatOn, heatDir: heatDir, range: range, cellTint: cellTint,
        filter: filterOn ? (filterAttr === 'values' || !(numeric || time) ? 'values' : numeric ? 'range' : 'time') : null
      };
    });

    // Heat and best marks over the rows that pass the filters; a fixed range keeps every shade where it was.
    var shade = function (mask) {
      columns.forEach(function (col, c) {
        var shown = col.values.map(function (v, r) { return !mask || mask[r] ? v : null; });
        if (col.heatOn) {
          var h = heat(shown, col.heatDir, col.range);
          rows.forEach(function (tr, r) {
            var cell = tr.cells[c];
            if (!cell) return;
            if (h[r] === null) {
              cell.classList.remove('df-heat');
              cell.style.removeProperty('--df-heat');
              return;
            }
            cell.classList.add('df-heat');
            cell.style.setProperty('--df-heat', h[r]);
            if (col.cellTint) cell.style.setProperty('--df-heat-color', 'var(--df-' + col.cellTint + ')');
          });
        }
        if (col.numeric && col.best) {
          var top = best(shown, col.best);
          rows.forEach(function (tr, r) {
            var cell = tr.cells[c];
            if (!cell) return;
            if (top.indexOf(r) >= 0) cell.classList.add('df-best');
            else cell.classList.remove('df-best');
          });
        }
      });
    };
    shade(null);

    var state = { col: -1, dir: null };
    var apply = function () {
      var order;
      if (state.col < 0) order = rows;
      else {
        var col = columns[state.col];
        order = sortOrder(col.values, state.dir, col.kind !== 'text').map(function (i) { return rows[i]; });
      }
      order.forEach(function (tr) { body.appendChild(tr); });
      columns.forEach(function (col, c) {
        if (!col.button) return;
        var dir = state.col === c ? state.dir : null;
        col.th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none');
        col.button.setAttribute('data-df-sorted', dir || '');
      });
    };

    columns.forEach(function (col, c) {
      if (col.th.hasAttribute('data-df-no-sort') || col.th.colSpan > 1) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'df-sort';
      while (col.th.firstChild) button.appendChild(col.th.firstChild);
      button.insertAdjacentHTML('beforeend', '<span class="df-sort-icon">' + ARROWS + '</span>');
      col.th.appendChild(button);
      col.th.setAttribute('aria-sort', 'none');
      col.button = button;
      // First click puts the best (or largest numbers, or A to Z, or earliest) first; the third restores the written order.
      var first = col.best === 'min' ? 'asc' : col.numeric ? 'desc' : 'asc';
      button.addEventListener('click', function () {
        if (state.col !== c) state = { col: c, dir: first };
        else if (state.dir === first) state.dir = first === 'asc' ? 'desc' : 'asc';
        else state = { col: -1, dir: null };
        apply();
      });
    });

    setupFilters(table, body, rows, columns, shade);

    // The rule sits under the header text so readers can see what Pass means.
    columns.forEach(function (col) {
      if (!col.rule) return;
      var label = DocForm.data(col.th, 'threshold-label', '').trim();
      var note = document.createElement('span');
      note.className = 'df-rule';
      note.textContent = (label || 'Pass') + ': ' + SYMBOLS[col.rule.op] + ' ' + col.rule.text;
      col.th.appendChild(note);
    });
  }

  function findColumn(columns, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].name.toLowerCase() === lower || columns[i].label.toLowerCase() === lower) return columns[i];
    }
    return null;
  }

  // Header menus, chips, the row count, and Clear. Rows that fail stay in the body (so sorting still moves them)
  // but are hidden; an extra body says so when none pass.
  function setupFilters(table, body, rows, columns, shade) {
    var chipsAttr = table.getAttribute('data-df-chips');
    var chips = [];
    parseChips(chipsAttr).forEach(function (chip) {
      if (chip.error) {
        DocForm.warnOnce('results-chip:' + chip.text, 'Ignoring filter chip "' + chip.text + '": ' + chip.error, table);
        return;
      }
      var tests = [];
      var problem = null;
      chip.conds.forEach(function (cond) {
        var col = findColumn(columns, cond.column);
        var made = col ? condition(cond, col.kind) : { error: 'there is no column "' + cond.column + '".' };
        if (made.error) problem = problem || made.error;
        else tests.push({ col: col, test: made.test });
      });
      if (problem) DocForm.warnOnce('results-chip:' + chip.label + ':' + problem, 'Ignoring filter chip "' + chip.label + '": ' + problem, table);
      else chips.push({ label: chip.label, tests: tests, on: false });
    });
    var filtered = columns.filter(function (col) { return col.filter; });
    if (!filtered.length && !chips.length) return;

    var holder = table.closest('.df-data');
    var saved = SAVED && holder ? SAVED.get(holder) : null;
    var filters = {};
    if (saved) {
      filtered.forEach(function (col) {
        var f = saved.filters[col.name.toLowerCase()];
        if (f && !!f.excluded === (col.filter === 'values')) filters[col.name] = f;
      });
      chips.forEach(function (chip) { chip.on = saved.chips.indexOf(chip.label) >= 0; });
    }

    var bar = make('div', 'df-filter-bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Table filters');
    if (chips.length) {
      var list = make('div', 'df-chips');
      chips.forEach(function (chip) {
        var button = make('button', 'df-chip', chip.label);
        button.type = 'button';
        button.addEventListener('click', function () {
          chip.on = !chip.on;
          refresh();
        });
        chip.button = button;
        list.appendChild(button);
      });
      bar.appendChild(list);
    }
    var count = make('span', 'df-filter-count');
    count.setAttribute('aria-live', 'polite');
    var clear = make('button', 'df-filter-clear', 'Clear filters');
    clear.type = 'button';
    clear.addEventListener('click', function () { api.clear(); });
    bar.appendChild(count);
    bar.appendChild(clear);
    if (table.parentNode) table.parentNode.insertBefore(bar, table);
    if (BARS) BARS.set(table, bar);

    var emptyBody = make('tbody', 'df-filter-empty');
    var emptyCell = emptyBody.insertRow().insertCell();
    emptyCell.colSpan = Math.max(1, columns.length);
    emptyCell.textContent = 'No rows match these filters. ';
    var emptyClear = make('button', null, 'Clear filters');
    emptyClear.type = 'button';
    emptyClear.addEventListener('click', function () { api.clear(); });
    emptyCell.appendChild(emptyClear);
    emptyBody.hidden = true;
    table.appendChild(emptyBody);

    var menu = null;

    var refresh = function () {
      var mask = rows.map(function (tr, r) {
        return columns.every(function (col) { return passes(filters[col.name], col.values[r], col.keys[r]); }) &&
          chips.every(function (chip) {
            return !chip.on || chip.tests.every(function (t) { return t.test(t.col.values[r], t.col.keys[r]); });
          });
      });
      var shown = 0;
      rows.forEach(function (tr, r) {
        tr.hidden = !mask[r];
        if (mask[r]) shown++;
      });
      var active = chips.some(function (chip) { return chip.on; }) ||
        filtered.some(function (col) { return filterActive(filters[col.name]); });
      shade(active ? mask : null);
      count.textContent = active ? shown + ' of ' + plural(rows.length, 'row') + ' match' : plural(rows.length, 'row');
      clear.disabled = !active;
      emptyBody.hidden = shown > 0;
      chips.forEach(function (chip) { chip.button.setAttribute('aria-pressed', chip.on ? 'true' : 'false'); });
      filtered.forEach(function (col) {
        var on = filterActive(filters[col.name]);
        col.toggle.setAttribute('data-df-active', on ? 'true' : 'false');
        col.toggle.setAttribute('aria-label', 'Filter ' + col.label + (on ? ' (filtered)' : ''));
      });
      if (SAVED && holder) {
        var keep = { filters: {}, chips: chips.filter(function (chip) { return chip.on; }).map(function (chip) { return chip.label; }) };
        Object.keys(filters).forEach(function (name) { if (filterActive(filters[name])) keep.filters[name.toLowerCase()] = filters[name]; });
        SAVED.set(holder, keep);
      }
      if (typeof CustomEvent === 'function') {
        table.dispatchEvent(new CustomEvent('df:filter', { bubbles: true, detail: { shown: shown, total: rows.length } }));
      }
    };

    // Header buttons sit beside the sort button (or the header text) in one row.
    filtered.forEach(function (col) {
      var toggle = make('button', 'df-filter-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-haspopup', 'dialog');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = FUNNEL;
      toggle.addEventListener('click', function () {
        if (menu && menu.col === col) closeMenu(false);
        else openMenu(col);
      });
      col.toggle = toggle;
      var row = make('div', 'df-head');
      if (col.button) {
        col.th.insertBefore(row, col.button);
        row.appendChild(col.button);
      } else {
        var label = make('span', 'df-head-label');
        while (col.th.firstChild) label.appendChild(col.th.firstChild);
        col.th.appendChild(row);
        row.appendChild(label);
        col.th.classList.add('df-filterable');
      }
      row.appendChild(toggle);
    });

    var setFilter = function (col, filter) {
      if (filterActive(filter)) filters[col.name] = filter;
      else delete filters[col.name];
      refresh();
    };

    function closeMenu(refocus) {
      if (!menu) return;
      var col = menu.col;
      menu.el.remove();
      document.removeEventListener('pointerdown', menu.outside, true);
      document.removeEventListener('keydown', menu.key, true);
      window.removeEventListener('scroll', menu.place, true);
      window.removeEventListener('resize', menu.place);
      col.toggle.setAttribute('aria-expanded', 'false');
      menu = null;
      if (refocus) col.toggle.focus();
    }

    function openMenu(col) {
      closeMenu(false);
      var el = make('div', 'df-filter-menu');
      el.id = 'df-filter-menu-' + Math.random().toString(36).slice(2, 8);
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Filter ' + col.label);
      el.appendChild(make('p', 'df-filter-title', col.label));
      if (col.filter === 'values') valueList(el, col);
      else boundInputs(el, col);
      var reset = make('button', 'df-filter-reset', 'Reset column');
      reset.type = 'button';
      reset.addEventListener('click', function () {
        setFilter(col, null);
        openMenu(col);
      });
      el.appendChild(reset);
      document.body.appendChild(el);
      col.toggle.setAttribute('aria-expanded', 'true');
      col.toggle.setAttribute('aria-controls', el.id);
      menu = {
        el: el,
        col: col,
        place: function () {
          var at = col.toggle.getBoundingClientRect();
          var w = el.offsetWidth;
          var h = el.offsetHeight;
          var vw = document.documentElement.clientWidth;
          var vh = document.documentElement.clientHeight;
          el.style.left = Math.max(8, Math.min(at.right - w, vw - w - 8)) + 'px';
          el.style.top = (at.bottom + 4 + h > vh - 8 && at.top - h - 4 > 8 ? at.top - h - 4 : at.bottom + 4) + 'px';
        },
        outside: function (e) {
          if (!el.contains(e.target) && !col.toggle.contains(e.target)) closeMenu(false);
        },
        key: function (e) {
          if (e.key === 'Escape') {
            e.stopPropagation();
            closeMenu(true);
          }
        }
      };
      el.addEventListener('focusout', function (e) {
        if (menu && menu.el === el && e.relatedTarget && !el.contains(e.relatedTarget) && e.relatedTarget !== col.toggle) closeMenu(false);
      });
      document.addEventListener('pointerdown', menu.outside, true);
      document.addEventListener('keydown', menu.key, true);
      window.addEventListener('scroll', menu.place, true);
      window.addEventListener('resize', menu.place);
      menu.place();
      var first = el.querySelector('input, button');
      if (first) first.focus();
    }

    // Distinct values in sorted order with their counts; unticking one hides its rows.
    function valueList(el, col) {
      var seen = {};
      var firsts = [];
      col.keys.forEach(function (k, r) {
        if (Object.prototype.hasOwnProperty.call(seen, k)) seen[k]++;
        else {
          seen[k] = 1;
          firsts.push(r);
        }
      });
      var order = sortOrder(firsts.map(function (r) { return col.values[r]; }), 'asc', col.kind !== 'text').map(function (i) { return col.keys[firsts[i]]; });
      var excluded = (filters[col.name] && filters[col.name].excluded) || [];
      var tools = make('div', 'df-filter-tools');
      var boxes = [];
      var update = function () {
        setFilter(col, { excluded: boxes.filter(function (b) { return !b.input.checked; }).map(function (b) { return b.key; }) });
      };
      [['All', true], ['None', false]].forEach(function (pair) {
        var b = make('button', null, pair[0]);
        b.type = 'button';
        b.addEventListener('click', function () {
          boxes.forEach(function (box) { box.input.checked = pair[1]; });
          update();
        });
        tools.appendChild(b);
      });
      el.appendChild(tools);
      var list = make('div', 'df-filter-values');
      order.forEach(function (key) {
        var label = make('label', 'df-filter-value');
        var input = make('input');
        input.type = 'checkbox';
        input.checked = excluded.indexOf(key) < 0;
        input.addEventListener('change', update);
        label.appendChild(input);
        label.appendChild(make('span', key ? null : 'df-filter-blank', key || '(blank)'));
        label.appendChild(make('span', 'df-filter-n', String(seen[key])));
        boxes.push({ key: key, input: input });
        list.appendChild(label);
      });
      el.appendChild(list);
    }

    // Min and Max for numbers, From and To for times; empty boxes leave that side open.
    function boundInputs(el, col) {
      var nums = col.values.filter(function (v) { return v !== null && v !== ''; });
      var lo = Math.min.apply(null, nums);
      var hi = Math.max.apply(null, nums);
      var current = filters[col.name] || { min: null, max: null };
      var time = col.filter === 'time';
      var type = time ? (col.dateOnly ? 'date' : 'datetime-local') : 'number';
      var show = function (v) {
        if (v == null) return '';
        if (!time) return String(v);
        var iso = new Date(v).toISOString();
        return col.dateOnly ? iso.slice(0, 10) : iso.slice(0, 19);
      };
      var inputs = {};
      var grid = make('div', 'df-filter-bounds');
      [['min', time ? 'From' : 'Min', lo], ['max', time ? 'To' : 'Max', hi]].forEach(function (side) {
        var label = make('label');
        label.appendChild(make('span', null, side[1] + (time && col.zoned ? ' (UTC)' : '')));
        var input = make('input');
        input.type = type;
        if (!time) input.step = 'any';
        else if (!col.dateOnly) input.step = '1';
        input.placeholder = show(side[2]);
        input.value = show(current[side[0]]);
        input.addEventListener('input', function () {
          var read = function (i) { return i.value.trim() === '' ? null : time ? timeValue(i.value) : parseCell(i.value); };
          setFilter(col, { min: read(inputs.min), max: read(inputs.max) });
        });
        inputs[side[0]] = input;
        label.appendChild(input);
        grid.appendChild(label);
      });
      el.appendChild(grid);
      el.appendChild(make('p', 'df-filter-extent', 'Column: ' + show(lo) + ' to ' + show(hi) + '. Rows without a value are hidden once a bound is set.'));
    }

    var api = {
      set: function (name, filter) {
        var col = findColumn(filtered, String(name));
        if (!col) return false;
        setFilter(col, filter);
        return true;
      },
      chip: function (label, on) {
        var chip = chips.filter(function (c) { return c.label.toLowerCase() === String(label).toLowerCase(); })[0];
        if (!chip) return false;
        chip.on = on === undefined ? !chip.on : !!on;
        refresh();
        return true;
      },
      clear: function () {
        filters = {};
        chips.forEach(function (chip) { chip.on = false; });
        closeMenu(false);
        refresh();
      },
      shown: function () { return rows.filter(function (tr) { return !tr.hidden; }).length; }
    };
    if (CONTROLLERS) CONTROLLERS.set(table, api);
    refresh();
  }

  DocForm.results = {
    enhance: enhance,
    parseCell: parseCell,
    numericColumn: numericColumn,
    sortOrder: sortOrder,
    best: best,
    heat: heat,
    heatRange: heatRange,
    threshold: threshold,
    verdict: verdict,
    timeValue: timeValue,
    timeColumn: timeColumn,
    passes: passes,
    parseChips: parseChips,
    condition: condition,
    // { set(column, filter), chip(label, on), clear(), shown() } for a filtered table, or null.
    filters: function (table) { return CONTROLLERS ? CONTROLLERS.get(table) || null : null; },
    bar: function (table) { return BARS ? BARS.get(table) || null : null; }
  };

  DocForm.register('results', function () {
    DocForm.all('table[data-df-results]').forEach(enhance);
  });
})(typeof window !== 'undefined' ? window : globalThis);
