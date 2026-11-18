// Results tables: table[data-df-results] gets sortable headers, optional heatmap shading per numeric column
// (data-df-heat), and bold best values (data-df-best="max" or "min" on a header cell).
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
  function heat(values, dir) {
    var nums = values.filter(function (v) { return v !== null; });
    if (!nums.length) return values.map(function () { return null; });
    var lo = Math.min.apply(null, nums);
    var hi = Math.max.apply(null, nums);
    return values.map(function (v) {
      if (v === null) return null;
      if (hi === lo) return 0;
      var t = (v - lo) / (hi - lo);
      return +(dir === 'min' ? 1 - t : t).toFixed(4);
    });
  }

  function direction(value) {
    value = String(value || '').toLowerCase();
    return value === 'min' || value === 'lower' || value === 'low' ? 'min' : value === 'max' || value === 'higher' || value === 'high' ? 'max' : null;
  }

  var ARROWS = '<svg viewBox="0 0 10 12" width="8" height="10" aria-hidden="true" focusable="false">' +
    '<path class="df-sort-up" d="M5 1 9 5H1z"/><path class="df-sort-down" d="M5 11 1 7h8z"/></svg>';

  function enhance(table) {
    var head = table.tHead ? table.tHead.rows[table.tHead.rows.length - 1] : null;
    var body = table.tBodies[0];
    if (!head || !body) {
      DocForm.warnOnce('results-head', 'A results table needs a thead and a tbody.', table);
      return;
    }
    var rows = Array.prototype.slice.call(body.rows);
    var heatAll = table.getAttribute('data-df-heat');
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
      var numeric = numericColumn(texts);
      var values = texts.map(function (t) { return numeric ? parseCell(t) : String(t).trim(); });
      var bestDir = direction(DocForm.data(th, 'best', null));
      var heatAttr = th.getAttribute('data-df-heat');
      var heatOn = numeric && (heatAttr !== null ? heatAttr !== 'false' : heatAll !== null && heatAll !== 'false' && c > 0);
      var heatDir = direction(heatAttr) || bestDir || direction(heatAll) || 'max';
      var cellTint = DocForm.data(th, 'heat-color', null);

      if (heatOn) {
        heat(values, heatDir).forEach(function (t, r) {
          var cell = rows[r].cells[c];
          if (!cell || t === null) return;
          cell.classList.add('df-heat');
          cell.style.setProperty('--df-heat', t);
          if (cellTint) cell.style.setProperty('--df-heat-color', 'var(--df-' + cellTint + ')');
        });
      }
      if (numeric && bestDir) {
        best(values, bestDir).forEach(function (r) {
          var cell = rows[r].cells[c];
          if (cell) cell.classList.add('df-best');
        });
      }
      if (numeric) th.classList.add('df-num');
      rows.forEach(function (tr) { if (numeric && tr.cells[c]) tr.cells[c].classList.add('df-num'); });
      return { th: th, values: values, numeric: numeric, best: bestDir };
    });

    var state = { col: -1, dir: null };
    var apply = function () {
      var order;
      if (state.col < 0) order = rows;
      else {
        var col = columns[state.col];
        order = sortOrder(col.values, state.dir, col.numeric).map(function (i) { return rows[i]; });
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
      // First click puts the best (or largest numbers, or A to Z) first; the third restores the written order.
      var first = col.best === 'min' ? 'asc' : col.numeric ? 'desc' : 'asc';
      button.addEventListener('click', function () {
        if (state.col !== c) state = { col: c, dir: first };
        else if (state.dir === first) state.dir = first === 'asc' ? 'desc' : 'asc';
        else state = { col: -1, dir: null };
        apply();
      });
    });
  }

  DocForm.results = {
    parseCell: parseCell,
    numericColumn: numericColumn,
    sortOrder: sortOrder,
    best: best,
    heat: heat
  };

  DocForm.register('results', function () {
    DocForm.all('table[data-df-results]').forEach(enhance);
  });
})(typeof window !== 'undefined' ? window : globalThis);
