// Reader file dropzones: <div data-op-dropzone> lets a reader drop or choose a local CSV, JSON, or YAML file. The file
// is read in the browser (nothing is uploaded), checked against data-op-accept and data-op-max-size, and shown with
// the data views, or sent to data-op-target: the id of a chart, a data block, or a results table (or an element
// holding one). Reset brings back the target's own data. Load after data.js and before results.js.
(function (root) {
  'use strict';

  var OffPrint = root.OffPrint;
  if (!OffPrint || !OffPrint._dataSource) {
    if (typeof console !== 'undefined') console.warn('[offprint] dropzone.js needs core.js and data.js loaded before it.');
    return;
  }

  var data = OffPrint.data;
  var source = OffPrint._dataSource;
  var TYPES = source.types;
  var NAMES = source.names;
  var EXTENSIONS = { csv: ['.csv'], tsv: ['.tsv'], json: ['.json'], yaml: ['.yaml', '.yml'], xml: ['.xml'],
    markdown: ['.md', '.markdown'] };
  var runtime = OffPrint._dataViews;
  var legacyDestinations = new WeakMap();

  // "csv json" or "csv, yaml" -> types in that order; empty or missing means every data type.
  function accepted(value) {
    var list = String(value == null ? '' : value).split(/[\s,]+/).filter(Boolean).map(function (v) {
      var t = source.type(v.replace(/^\./, ''));
      if (!t) OffPrint._warnOnce('dropzone-accept:' + v, 'Ignoring "' + v + '" in data-op-accept; use ' + TYPES.join(', ') + '.');
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
    var t = ext ? source.type(ext[1]) : null;
    if (!ext && mime) t = source.type(String(mime).split(';')[0]);
    return t && accept.indexOf(t) >= 0 ? t : null;
  }

  // { type } for a file the zone takes, else { error } with a sentence for the reader.
  function check(file, accept, maxBytes) {
    var label = '"' + file.name + '"';
    var t = fileType(file.name, file.type, accept);
    if (!t) return { error: label + ' is not a ' + listNames(accept) + ' file.' };
    if (file.size > maxBytes) {
      return { error: label + ' is ' + source.formatSize(file.size) + ', over this file box\'s ' + source.formatSize(maxBytes) + ' limit.' };
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

  // Overlay parsed data on the authored chart spec. Cartesian tables give one series per value column and
  // pie tables give one slice per row. Full specs replace matching fields. Fixed axis bounds are dropped to
  // show the new data in full. Returns { spec, rows, total } or throws.
  function chartSpec(parsed, base, maxRows) {
    base = base || {};
    var next = {};
    Object.keys(base).forEach(function (k) { next[k] = base[k]; });
    var grid = data.table(parsed);
    var value = source.isGrid(parsed) ? null : parsed.value;
    if (grid) {
      if (grid.columns.length < 2) throw new Error('a chart needs an x column and at least one series column.');
      var cells = maxRows > 0 ? grid.cells.slice(0, maxRows) : grid.cells;
      var spec = OffPrint._chart.fromTable([grid.columns].concat(cells), base.type);
      if (spec.type === 'pie') {
        var slices = new Map((base.data || []).map(function (slice) { return [slice.label, slice]; }));
        next.data = spec.data.map(function (slice) {
          var old = slices.get(slice.label);
          return old ? Object.assign({}, old, { value: slice.value }) : slice;
        });
        next.y = axis(base.y, spec.y.label);
        return { spec: next, rows: cells.length, total: grid.cells.length };
      }
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
    if (value && typeof value === 'object' && !Array.isArray(value) && (Array.isArray(value.series) ||
        ((value.type || base.type) === 'pie' && Array.isArray(value.data)))) {
      Object.keys(value).forEach(function (k) { next[k] = value[k]; });
      if (!value.x) next.x = axis(base.x, '');
      if (!value.y) next.y = axis(base.y, '');
      return { spec: next, rows: null, total: null };
    }
    throw new Error(base.type === 'pie' ? 'a pie chart needs a table with label and value columns or a chart spec with "data".' :
      'a chart needs a table with an x column and one column per series, or a chart spec with "series".');
  }

  function chartOf(el) {
    if (!OffPrint._chart || !OffPrint._chart.get) return null;
    var api = OffPrint._chart.get(el);
    if (api) return api;
    var inner = el.querySelector && el.querySelector('.op-chart');
    return inner ? OffPrint._chart.get(inner) : null;
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
        var made = OffPrint._chart._upload(api, entry, limits.maxRows) ||
          chartSpec(data.parse(entry.text, entry.type), OffPrint._chart._baseline(api), limits.maxRows);
        return { input: made.spec, note: plotNote(made) };
      });
      if (managedChart) return managedChart;
      var original;
      return {
        kind: 'chart',
        feed: function (entry, limits) {
          if (original === undefined) original = api.spec();
          var made = chartSpec(data.parse(entry.text, entry.type), original, limits.maxRows);
          var errors = OffPrint._chart.validate(made.spec);
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
    var view = OffPrint._dataView.get(el) || OffPrint._dataView.get(el.querySelector && el.querySelector('.op-data'));
    if (view) return controls(view, 'data', function (entry) { return { input: entry }; });
    var table = el.tagName === 'TABLE' ? el : el.querySelector && el.querySelector('table[data-op-results]');
    var results = table && OffPrint._results && OffPrint._results.get(table);
    if (results) return controls(results, 'table', function (entry) {
      return { input: OffPrint._results._upload(entry) };
    });
    if (table && template) {
      var host = null;
      return {
        kind: 'table',
        feed: function (entry) {
          var parsed = data.parse(entry.text, entry.type);
          if (!data.table(parsed)) throw new Error('a results table needs CSV or a list of flat records.');
          var next = document.createElement('div');
          next.className = 'op-dropzone-table';
          source.showFile(next, entry, { view: 'table', limits: source.limits(next), open: 1 }, template);
          (host || table).replaceWith(next);
          host = next;
          // The static table's filter bar sits beside it, so it hides while the table is away.
          var bar = OffPrint._results && OffPrint._results.bar ? OffPrint._results.bar(table) : null;
          if (bar) bar.hidden = true;
          return '';
        },
        restore: function () {
          if (host) host.replaceWith(table);
          host = null;
          var bar = OffPrint._results && OffPrint._results.bar ? OffPrint._results.bar(table) : null;
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
    var accept = accepted(OffPrint._data(zone, 'accept', ''));
    var caps = source.limits(zone, source.options('dropzone', zone));
    var targetId = OffPrint._data(zone, 'target', '').trim();
    var sourceName = OffPrint._data(zone, 'target-source', '').trim();
    var hasTarget = zone.hasAttribute('data-op-target');
    var hasSource = zone.hasAttribute('data-op-target-source');
    var invalid = hasTarget && hasSource || hasTarget && !targetId || hasSource && !sourceName;
    if (invalid) runtime.issue('dropzone', zone, 'Choose one valid file destination.');
    var target = null;
    var template = null;
    var display = !hasTarget && !hasSource ? source.fileDisplay(zone, caps) : null;
    if (!invalid && targetId) {
      target = OffPrint._component.target(targetId, 'dropzone', true);
      var table = target && (target.tagName === 'TABLE' ? target : target.querySelector('table[data-op-results]'));
      if (table && !table.closest('.op-data')) {
        // A results table's header is read before results.js adds its sort buttons and rule notes.
        if (!table.classList.contains('op-results') && table.tHead) {
          template = table.cloneNode(true);
          Array.prototype.slice.call(template.tBodies).forEach(function (b) { b.remove(); });
        }
      }
    }

    var prompt = Array.prototype.slice.call(zone.childNodes);
    zone.textContent = '';
    zone.classList.add('op-dropzone');
    var area = make('div', 'op-dropzone-area');
    if (prompt.some(function (n) { return n.nodeType === 1 || n.textContent.trim(); })) {
      prompt.forEach(function (n) { area.appendChild(n); });
    } else {
      area.appendChild(make('p', 'op-dropzone-prompt', 'Drop a ' + listNames(accept) + ' file here.'));
    }
    var hint = make('p', 'op-dropzone-hint');
    var choose = make('button', 'op-button op-dropzone-choose', 'Choose a file');
    choose.type = 'button';
    var input = make('input');
    input.type = 'file';
    input.hidden = true;
    input.setAttribute('accept', accept.map(function (t) { return EXTENSIONS[t].join(','); }).join(','));
    hint.appendChild(choose);
    hint.appendChild(document.createTextNode(' ' + listNames(accept) + ', up to ' + source.formatSize(caps.maxBytes) +
      '. The file stays on this computer.' + (OffPrint._readerState ? ' Accepted files can be saved in this browser for export.' : '')));
    area.appendChild(hint);
    area.appendChild(input);
    var status = make('p', 'op-dropzone-status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    var statusText = make('span');
    var reset = make('button', 'op-button op-dropzone-reset', 'Reset');
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
        var controller = data.source(sourceName);
        if (!controller) throw new Error('No data source named "' + sourceName + '" is registered.');
        return controls(controller, 'source', function (entry) { return { input: entry }; });
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
      OffPrint._readerState?.removeImport(zone);
      if (output) output.remove();
      output = null;
      zone.classList.remove('is-loaded');
    };

    function applyFile(entry, ticket) {
      if (source.size(entry.text) > caps.maxBytes) throw new Error('The decoded file exceeds this file box’s size limit.');
      if (linked) return linked.feed(entry, caps, zone, ticket);
      var parsed = data.parse(entry.text, entry.type);
      var next = make('div', 'op-dropzone-output');
      source.showFile(next, entry, display, null, parsed, zone);
      if (output) output.replaceWith(next);
      else zone.appendChild(next);
      output = next;
      return '';
    }

    var readerState = OffPrint._readerState;
    var remember;
    if (readerState && !invalid) {
      var baseline = hasSource && data.source(sourceName)?.snapshot();
      var authored = baseline?.type === 'value' ? JSON.stringify(baseline.value) : baseline?.text;
      var signature = hasSource ? ['source', sourceName, baseline?.type, readerState.stamp(authored ?? '')] :
        hasTarget ? ['target', targetId, readerState.targetStamp(target)] : ['standalone'];
      remember = readerState.registerImport(hasSource || hasTarget ? JSON.stringify(signature.slice(0, 2)) : null,
        zone, JSON.stringify(signature), function (entry) {
          linked = destination();
          var note = applyFile(entry, linked?.reserve());
          zone.classList.add('is-loaded');
          say('Showing "' + entry.name + '"' + (linked ? ' in place of the page\'s data' : '') +
            '.' + (note ? ' ' + note : ''), false, true);
          return true;
        }, function (item) {
          return accept.includes(item.type) && item.bytes <= caps.maxBytes && typeof item.name === 'string';
        });
    }

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
        var note;
        try {
          note = applyFile(entry, ticket);
        } catch (error) {
          var message = String(error.message);
          return say('Could not show "' + file.name + '": ' + message.charAt(0).toLowerCase() + message.slice(1), true, owns());
        }
        remember?.(entry);
        zone.classList.add('is-loaded');
        say('Showing "' + file.name + '" (' + source.formatSize(file.size) + ')' + (linked ? ' in place of the page\'s data' : '') +
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

  OffPrint._dropzone = {
    accepted: accepted,
    listNames: listNames,
    fileType: fileType,
    check: check,
    chartSpec: chartSpec,
    link: link
  };

  OffPrint.register('dropzone', function () {
    OffPrint._all('[data-op-dropzone]:not(.op-dropzone)').forEach(setup);
  });
})(typeof window !== 'undefined' ? window : globalThis);
