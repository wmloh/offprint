// Reader file dropzones: <div data-df-dropzone> lets a reader drop or choose a local CSV, JSON, or YAML file. The file
// is read in the browser (nothing is uploaded), checked against data-df-accept and data-df-max-size, and shown with
// the data views, or sent to data-df-target: the id of a chart, a data block, or a results table (or an element
// holding one). Reset brings back the target's own data. Load after data.js and before results.js.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm || !DocForm.dataset) {
    if (typeof console !== 'undefined') console.warn('[docform] dropzone.js needs core.js and data.js loaded before it.');
    return;
  }

  var data = DocForm.dataset;
  var TYPES = ['csv', 'json', 'yaml'];
  var NAMES = { csv: 'CSV', json: 'JSON', yaml: 'YAML' };
  var EXTENSIONS = { csv: ['.csv'], json: ['.json'], yaml: ['.yaml', '.yml'] };
  var COPIED = ['data-df-view', 'data-df-max-rows', 'data-df-max-size', 'data-df-tree-depth'];
  var runtime = DocForm._dataViews;
  var legacyDestinations = new WeakMap();

  // "csv json" or "csv, yaml" -> types in that order; empty or missing means all three.
  function accepted(value) {
    var list = String(value == null ? '' : value).split(/[\s,]+/).filter(Boolean).map(function (v) {
      var t = data.type(v.replace(/^\./, ''));
      if (!t) DocForm.warnOnce('dropzone-accept:' + v, 'Ignoring "' + v + '" in data-df-accept; use csv, json, or yaml.');
      return t;
    }).filter(function (t, i, all) { return t && all.indexOf(t) === i; });
    return list.length ? list : TYPES.slice();
  }

  // "CSV", "CSV or JSON", "CSV, JSON, or YAML".
  function listNames(types) {
    var names = types.map(function (t) { return NAMES[t]; });
    if (names.length < 3) return names.join(' or ');
    return names.slice(0, -1).join(', ') + ', or ' + names[names.length - 1];
  }

  // The data type of a file from its extension, else its MIME type; null when it is not one the zone accepts.
  function fileType(name, mime, accept) {
    var ext = String(name || '').match(/\.(\w+)$/);
    var t = ext ? data.type(ext[1]) : null;
    if (!ext && mime) t = data.type(String(mime).split(';')[0]);
    return t && accept.indexOf(t) >= 0 ? t : null;
  }

  // { type } for a file the zone takes, else { error } with a sentence for the reader.
  function check(file, accept, maxBytes) {
    var label = '"' + file.name + '"';
    var t = fileType(file.name, file.type, accept);
    if (!t) return { error: label + ' is not a ' + listNames(accept) + ' file.' };
    if (file.size > maxBytes) {
      return { error: label + ' is ' + data.formatSize(file.size) + ', over this file box\'s ' + data.formatSize(maxBytes) + ' limit.' };
    }
    return { type: t };
  }

  function axis(a, fallback) {
    var out = {};
    if (typeof a === 'string') out.label = a;
    else if (a && typeof a === 'object') Object.keys(a).forEach(function (k) { if (k !== 'min' && k !== 'max') out[k] = a[k]; });
    if (!out.label && fallback) out.label = fallback;
    return out;
  }

  // A chart spec from parsed data on top of the chart's own spec, which keeps its type, axis types and labels,
  // reference lines, and series colours by name. Tabular data gives one series per column after the first (x);
  // a JSON or YAML object with "series" replaces the matching spec fields. Fixed axis bounds are dropped so the new
  // data shows in full. Returns { spec, rows, total } or throws.
  function chartSpec(parsed, base, maxRows) {
    base = base || {};
    var next = {};
    Object.keys(base).forEach(function (k) { next[k] = base[k]; });
    var grid = data.table(parsed);
    var value = parsed.type === 'csv' ? null : parsed.value;
    if (grid) {
      if (grid.columns.length < 2) throw new Error('a chart needs an x column and at least one series column.');
      var cells = maxRows > 0 ? grid.cells.slice(0, maxRows) : grid.cells;
      var spec = DocForm.chart.fromTable([grid.columns].concat(cells), base.type);
      var old = Array.isArray(base.series) ? base.series : [];
      spec.series.forEach(function (s) {
        var same = old.filter(function (o) { return o && o.name === s.name; })[0];
        if (!same) return;
        if (same.role) s.role = same.role;
        if (same.color) s.color = same.color;
      });
      delete next.categories;
      delete next.markedCategories;
      delete next.data;
      next.series = spec.series;
      next.x = axis(base.x, grid.columns[0]);
      next.y = axis(base.y, '');
      return { spec: next, rows: cells.length, total: grid.cells.length };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.series)) {
      Object.keys(value).forEach(function (k) { next[k] = value[k]; });
      if (!value.x) next.x = axis(base.x, '');
      if (!value.y) next.y = axis(base.y, '');
      return { spec: next, rows: null, total: null };
    }
    throw new Error('a chart needs a table with an x column and one column per series, or a chart spec with "series".');
  }

  function chartOf(el) {
    if (!DocForm.chart || !DocForm.chart.get) return null;
    var api = DocForm.chart.get(el);
    if (api) return api;
    var inner = el.querySelector && el.querySelector('.df-chart');
    return inner ? DocForm.chart.get(inner) : null;
  }

  function blockOf(el) {
    if (data.isBlock(el)) return el;
    var inner = el.querySelector && el.querySelector('.df-data');
    return inner && data.isBlock(inner) ? inner : null;
  }

  function controls(api, kind, convert) {
    var access = runtime.access(api);
    if (!access) return null;
    return Object.assign({}, access, {
      kind: kind,
      feed: function (entry, limits, zone, ticket) {
        var made = convert(entry, limits);
        if (!access.update(made.input, zone, ticket)) {
          throw access.error() || new Error('The destination rejected this file.');
        }
        return made.note || '';
      },
      restore: function (zone, ticket) {
        if (!access.reset(zone, ticket)) throw access.error() || new Error('The destination could not reset.');
      }
    });
  }

  function plotNote(made) {
    return made.total !== null && made.rows < made.total ?
      'Plotting the first ' + made.rows.toLocaleString('en-US') + ' of ' + made.total.toLocaleString('en-US') + ' rows.' : '';
  }

  function legacyDestination(el, makeLink) {
    if (legacyDestinations.has(el)) return legacyDestinations.get(el);
    var linked = makeLink();
    if (!linked) return null;
    var sequence = 0;
    var owner = null;
    var managed = Object.assign({}, linked, {
      reserve: function () { return ++sequence; },
      current: function (ticket) { return ticket === sequence; },
      owns: function (zone) { return owner === zone; },
      feed: function (entry, limits, zone) {
        var parsed = data.parse(entry.text, entry.type);
        if (!parsed) throw new Error('Invalid file.');
        var note = linked.feed(entry, limits);
        owner = zone;
        return note;
      },
      restore: function (zone) {
        if (owner === zone) { linked.restore(); owner = null; }
      }
    });
    legacyDestinations.set(el, managed);
    return managed;
  }

  // How to send entries to a target and take them back: { kind, feed(entry, limits) -> message, restore() }.
  // feed throws when the data cannot be shown there. template is a static results table's header, read at load.
  function link(el, template) {
    var api = chartOf(el);
    if (api) {
      var managedChart = controls(api, 'chart', function (entry, limits) {
        var made = DocForm.chart._upload(api, entry, limits.maxRows) ||
          chartSpec(data.parse(entry.text, entry.type), DocForm.chart._baseline(api), limits.maxRows);
        return { input: made.spec, note: plotNote(made) };
      });
      if (managedChart) return managedChart;
      var original;
      return {
        kind: 'chart',
        feed: function (entry, limits) {
          if (original === undefined) original = api.spec();
          var made = chartSpec(data.parse(entry.text, entry.type), original, limits.maxRows);
          var errors = DocForm.chart.validate(made.spec);
          if (errors.length) throw new Error(errors.join(' '));
          api.update(made.spec);
          return plotNote(made);
        },
        restore: function () {
          if (original !== undefined) api.update(original);
          original = undefined;
        }
      };
    }
    var view = DocForm.dataView.get(el);
    if (view) return controls(view, 'data', function (entry) { return { input: entry }; });
    var block = blockOf(el);
    if (block) {
      return {
        kind: 'data',
        feed: function (entry) { data.show(block, entry); return ''; },
        restore: function () { data.restore(block); }
      };
    }
    var table = el.tagName === 'TABLE' ? el : el.querySelector && el.querySelector('table[data-df-results]');
    var results = table && DocForm.results && DocForm.results.get(table);
    if (results) return controls(results, 'table', function (entry) {
      return { input: DocForm.results._upload(entry) };
    });
    if (table && template) {
      var host = null;
      return {
        kind: 'table',
        feed: function (entry) {
          var parsed = data.parse(entry.text, entry.type);
          if (!data.table(parsed)) throw new Error('a results table needs CSV or a list of flat records.');
          var next = document.createElement('div');
          next.className = 'df-dropzone-table';
          data.show(next, entry, template);
          (host || table).replaceWith(next);
          host = next;
          // The static table's filter bar sits beside it, so it hides while the table is away.
          var bar = DocForm.results && DocForm.results.bar ? DocForm.results.bar(table) : null;
          if (bar) bar.hidden = true;
          return '';
        },
        restore: function () {
          if (host) host.replaceWith(table);
          host = null;
          var bar = DocForm.results && DocForm.results.bar ? DocForm.results.bar(table) : null;
          if (bar) bar.hidden = false;
        }
      };
    }
    return null;
  }

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function setup(zone) {
    var accept = accepted(DocForm.data(zone, 'accept', ''));
    var caps = data.limits(zone, DocForm._dataSource.options('dropzone', zone));
    var targetId = DocForm.data(zone, 'target', '').trim();
    var sourceName = DocForm.data(zone, 'target-source', '').trim();
    var hasTarget = zone.hasAttribute('data-df-target');
    var hasSource = zone.hasAttribute('data-df-target-source');
    var invalid = hasTarget && hasSource || hasTarget && !targetId || hasSource && !sourceName;
    if (invalid) runtime.issue('dropzone', zone, 'Choose one valid file destination.');
    var target = null;
    var template = null;
    if (!invalid && targetId) {
      target = document.getElementById(targetId);
      if (!target) DocForm.warnOnce('dropzone-target:' + targetId, 'No element has the id "' + targetId + '" for this dropzone.', zone);
      var table = target && (target.tagName === 'TABLE' ? target : target.querySelector('table[data-df-results]'));
      if (table && !table.closest('.df-data')) {
        // A results table's header is read before results.js adds its sort buttons and rule notes.
        if (!table.classList.contains('df-results') && table.tHead) {
          template = table.cloneNode(true);
          Array.prototype.slice.call(template.tBodies).forEach(function (b) { b.remove(); });
        }
      }
    }

    var prompt = Array.prototype.slice.call(zone.childNodes);
    zone.textContent = '';
    zone.classList.add('df-dropzone');
    var area = make('div', 'df-dropzone-area');
    if (prompt.some(function (n) { return n.nodeType === 1 || n.textContent.trim(); })) {
      prompt.forEach(function (n) { area.appendChild(n); });
    } else {
      area.appendChild(make('p', 'df-dropzone-prompt', 'Drop a ' + listNames(accept) + ' file here.'));
    }
    var hint = make('p', 'df-dropzone-hint');
    var choose = make('button', 'df-dropzone-choose', 'Choose a file');
    choose.type = 'button';
    var input = make('input');
    input.type = 'file';
    input.hidden = true;
    input.setAttribute('accept', accept.map(function (t) { return EXTENSIONS[t].join(','); }).join(','));
    hint.appendChild(choose);
    hint.appendChild(document.createTextNode(' ' + listNames(accept) + ', up to ' + data.formatSize(caps.maxBytes) +
      '. The file stays on this computer.'));
    area.appendChild(hint);
    area.appendChild(input);
    var status = make('p', 'df-dropzone-status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    var statusText = make('span');
    var reset = make('button', 'df-dropzone-reset', 'Reset');
    reset.type = 'button';
    status.appendChild(statusText);
    status.appendChild(reset);
    zone.appendChild(area);
    zone.appendChild(status);
    var output = null;
    var linked = null;
    var reading = 0;
    var request;

    var say = function (text, isError, canReset) {
      status.hidden = !text;
      status.classList.toggle('is-error', !!isError);
      statusText.textContent = text;
      reset.hidden = !canReset;
    };

    function owns() {
      return linked ? linked.owns(zone) : !!output;
    }
    function destination() {
      if (invalid) throw new Error('Choose one valid file destination.');
      if (hasSource) {
        var source = DocForm.data.source(sourceName);
        if (!source) throw new Error('No data source named "' + sourceName + '" is registered.');
        return controls(source, 'source', function (entry) { return { input: entry }; });
      }
      if (hasTarget) {
        var result = target && link(target, template);
        if (!result) throw new Error('The file target needs a chart, data view, or results table.');
        return result.reserve ? result : legacyDestination(target, function () { return result; });
      }
      return null;
    }
    var clear = function () {
      reading++;
      if (linked && (owns() || request && linked.current(request.ticket))) {
        linked.restore(zone, linked.reserve());
      }
      request = null;
      if (output) output.remove();
      output = null;
      zone.classList.remove('is-loaded');
    };

    var load = function (files) {
      var id = ++reading;
      try { linked = destination(); }
      catch (error) {
        runtime.issue('dropzone', zone, error.message);
        return say(error.message, true, false);
      }
      var ticket = linked ? linked.reserve() : id;
      request = { ticket: ticket };
      if (files.length !== 1) return say('Choose one file at a time.', true, owns());
      var file = files[0];
      var verdict = check(file, accept, caps.maxBytes);
      if (verdict.error) return say(verdict.error, true, owns());
      say('Reading "' + file.name + '"…', false, true);
      function current() {
        if (id !== reading) return false;
        if (!linked || linked.current(ticket)) return true;
        say('This file was superseded by a newer change.', false, owns());
        return false;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        if (current()) say('Could not read "' + file.name + '".', true, owns());
      };
      reader.onload = function () {
        if (!current()) return;
        var entry = { name: file.name, type: verdict.type, text: String(reader.result) };
        var note = '';
        if (linked) {
          try {
            note = linked.feed(entry, caps, zone, ticket);
          } catch (e) {
            var m = String(e.message);
            return say('Could not show "' + file.name + '": ' + m.charAt(0).toLowerCase() + m.slice(1), true, owns());
          }
        } else {
          var next = make('div', 'df-dropzone-output');
          COPIED.forEach(function (a) { if (zone.hasAttribute(a)) next.setAttribute(a, zone.getAttribute(a)); });
          if (zone.hasAttribute('data-df-data-view')) next.setAttribute('data-df-view', zone.getAttribute('data-df-data-view'));
          if (!next.hasAttribute('data-df-max-size')) next.setAttribute('data-df-max-size', String(caps.maxBytes));
          if (output) output.replaceWith(next);
          else zone.appendChild(next);
          output = next;
          data.show(output, entry);
        }
        zone.classList.add('is-loaded');
        say('Showing "' + file.name + '" (' + data.formatSize(file.size) + ')' + (linked ? ' in place of the page\'s data' : '') +
          '.' + (note ? ' ' + note : ''), false, true);
      };
      try { reader.readAsText(file); }
      catch (error) { if (current()) say(error.message, true, owns()); }
    };

    choose.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) load(input.files);
      input.value = '';
    });
    reset.addEventListener('click', function () {
      try { clear(); }
      catch (error) { say(error.message, true, owns()); return; }
      say('', false, false);
      choose.focus();
    });
    var depth = 0;
    zone.addEventListener('dragenter', function (event) {
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') < 0) return;
      event.preventDefault();
      depth++;
      zone.classList.add('is-dragging');
    });
    zone.addEventListener('dragover', function (event) {
      if (!zone.classList.contains('is-dragging')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove('is-dragging');
    });
    zone.addEventListener('drop', function (event) {
      if (!zone.classList.contains('is-dragging')) return;
      event.preventDefault();
      depth = 0;
      zone.classList.remove('is-dragging');
      var files = event.dataTransfer.files;
      if (!files || !files.length) return;
      load(files);
    });
  }

  DocForm.dropzone = {
    accepted: accepted,
    listNames: listNames,
    fileType: fileType,
    check: check,
    chartSpec: chartSpec,
    link: link
  };

  DocForm.register('dropzone', function () {
    DocForm.all('[data-df-dropzone]:not(.df-dropzone)').forEach(setup);
  });
})(typeof window !== 'undefined' ? window : globalThis);
