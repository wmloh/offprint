// Data files: CSV, JSON, and YAML text registered under a name and shown as results tables, highlighted code, or a
// tree (data-df-view="tree", drawn by tree.js).
// Sources are wrapped .js files that set window.DocFormData[name] = { type, text } (made by
// docform/tools/data-file.html), <script type="text/csv" data-df-data="name"> blocks, and <pre data-df-data> blocks
// that also render in place. Any other element with data-df-data="name" is a placeholder for that data.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] data.js needs core.js loaded before it.');
    return;
  }

  var TYPES = ['csv', 'json', 'yaml'];
  var VIEWS = ['auto', 'table', 'code', 'tree'];
  var NAMES = { csv: 'CSV', json: 'JSON', yaml: 'YAML' };
  var MIME = {
    'text/csv': 'csv', 'application/json': 'json', 'text/json': 'json',
    'text/yaml': 'yaml', 'application/yaml': 'yaml', 'text/x-yaml': 'yaml', 'application/x-yaml': 'yaml'
  };
  var hasOwn = Object.prototype.hasOwnProperty;
  var store = Object.create(null);
  var defaults = { maxBytes: 1024 * 1024, maxRows: 5000 };
  var sources = new Map();
  var invalidSources = new Map();
  var transforms = new Map();
  var runtime = DocForm._dataViews;

  function DataError(message, line) {
    var e = new Error(line ? 'Line ' + line + ': ' + message : message);
    e.name = 'DataError';
    e.line = line || null;
    return e;
  }

  function type(value) {
    var key = String(value == null ? '' : value).trim().toLowerCase();
    if (key === 'yml') key = 'yaml';
    if (hasOwn.call(MIME, key)) key = MIME[key];
    return TYPES.indexOf(key) >= 0 ? key : null;
  }

  // Type from a file name such as "runs.csv", else a guess from the first non-blank character and line.
  function sniff(text, name) {
    var ext = String(name || '').match(/\.(\w+)$/);
    var given = ext && type(ext[1]);
    if (given) return given;
    var t = String(text).replace(/^﻿/, '').trimStart();
    if (/^[[{"]/.test(t)) return 'json';
    var first = t.split('\n')[0];
    return first.indexOf(',') >= 0 && !/^[^,]*:\s/.test(first) ? 'csv' : 'yaml';
  }

  // UTF-8 bytes, which is what the converter and the size cap measure.
  function size(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  // "1 MB", "500 KB", "2mb", or a plain byte count -> bytes (1 KB = 1024 bytes); anything else gives null.
  function parseSize(value) {
    var m = String(value == null ? '' : value).trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(b|bytes?|kb|k|mb|m)?$/i);
    if (!m) return null;
    var unit = (m[2] || 'b').charAt(0).toLowerCase();
    return Math.round(parseFloat(m[1]) * (unit === 'k' ? 1024 : unit === 'm' ? 1024 * 1024 : 1));
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + (bytes === 1 ? ' byte' : ' bytes');
    var kb = bytes / 1024;
    if (kb < 1024) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB';
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  function count(n) {
    return Number(n).toLocaleString('en-US');
  }

  // Drops a leading blank line and trailing blank lines, then the indentation every line shares.
  function dedent(text) {
    var lines = String(text).replace(/^﻿/, '').replace(/^[ \t]*\r?\n/, '').replace(/(?:\r?\n[ \t]*)+$/, '').split(/\r?\n/);
    var indent = null;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var n = line.match(/^[ \t]*/)[0].length;
      if (indent === null || n < indent) indent = n;
    });
    return lines.map(function (line) { return line.slice(indent || 0); }).join('\n');
  }

  function add(name, text, kind) {
    var key = String(name == null ? '' : name).trim();
    if (!key || typeof text !== 'string') {
      DocForm.warnOnce('data-add:' + key, 'Data needs a name and text; ignoring "' + key + '".');
      return null;
    }
    if (store[key]) {
      DocForm.warnOnce('data-dup:' + key, 'Data "' + key + '" is registered more than once; keeping the first.');
      return store[key];
    }
    var given = kind == null ? null : type(kind);
    if (kind != null && !given) DocForm.warnOnce('data-type:' + kind, 'Unknown data type "' + kind + '"; use csv, json, or yaml.');
    store[key] = { name: key, type: given || sniff(text, key), text: text };
    return store[key];
  }

  // Registered data by name: added entries first, then window.DocFormData, read lazily so file order is free.
  function get(name) {
    var key = String(name == null ? '' : name).trim();
    if (store[key]) return store[key];
    var globals = root.DocFormData;
    if (!globals || typeof globals !== 'object' || !hasOwn.call(globals, key)) return null;
    var entry = globals[key];
    if (typeof entry === 'string') return add(key, entry);
    if (entry && typeof entry.text === 'string') return add(key, entry.text, entry.type);
    DocForm.warnOnce('data-entry:' + key, 'window.DocFormData["' + key + '"] needs a text string; ignoring it.');
    return null;
  }

  function names() {
    var out = Object.keys(store);
    var globals = root.DocFormData;
    if (globals && typeof globals === 'object') Object.keys(globals).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  // Unquoted fields become numbers, booleans, or null when empty; quoted fields and codes with leading zeros stay text.
  function typed(text, quoted) {
    if (quoted) return text;
    var t = text.trim();
    if (!t) return null;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(t) && !/^[-+]?0\d/.test(t) && Number.isFinite(Number(t))) return Number(t);
    if (/^true$/i.test(t)) return true;
    if (/^false$/i.test(t)) return false;
    return text;
  }

  // RFC 4180 CSV: quoted fields may hold commas, doubled quotes, and line breaks; blank lines are skipped.
  // Returns column names, typed rows, and the raw text of each cell.
  function parseCsv(text) {
    var src = String(text).replace(/^﻿/, '');
    var records = [];
    var record = null;
    var field = '';
    var quoted = false;
    var line = 1;
    var startLine = 1;
    var i = 0;
    var finishField = function () {
      record.cells.push(field);
      record.quoted.push(quoted);
      field = '';
      quoted = false;
    };
    while (i < src.length) {
      var c = src[i];
      if (!record) {
        if (c === '\n' || c === '\r') {
          if (c === '\n') line++;
          i++;
          continue;
        }
        record = { cells: [], quoted: [], line: line };
      }
      if (c === '"' && field === '' && !quoted) {
        quoted = true;
        startLine = line;
        var close = -1;
        for (var j = i + 1; j < src.length; j++) {
          if (src[j] === '"') {
            if (src[j + 1] === '"') { j++; continue; }
            close = j;
            break;
          }
        }
        if (close < 0) throw DataError('a quoted field is not closed.', startLine);
        field = src.slice(i + 1, close).replace(/""/g, '"');
        line += (field.match(/\n/g) || []).length;
        i = close + 1;
        var after = src[i];
        if (after !== undefined && after !== ',' && after !== '\n' && after !== '\r') {
          throw DataError('unexpected text after a closing quote.', line);
        }
        continue;
      }
      if (c === ',') {
        finishField();
        i++;
        continue;
      }
      if (c === '\n' || c === '\r') {
        finishField();
        records.push(record);
        record = null;
        if (c === '\r' && src[i + 1] === '\n') i++;
        if (src[i] === '\n') line++;
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (record) {
      finishField();
      records.push(record);
    }
    if (!records.length) throw DataError('the CSV is empty.');
    var header = records[0];
    var columns = header.cells.map(function (name, k) { return name.trim() || 'Column ' + (k + 1); });
    var rows = [];
    var cells = [];
    records.slice(1).forEach(function (r) {
      if (r.cells.length !== columns.length) {
        throw DataError('this row has ' + r.cells.length + ' fields; the header has ' + columns.length + '.', r.line);
      }
      cells.push(r.cells);
      rows.push(r.cells.map(function (cell, k) { return typed(cell, r.quoted[k]); }));
    });
    return { columns: columns, rows: rows, cells: cells };
  }

  function parseJson(text) {
    var src = String(text).replace(/^﻿/, '');
    if (!src.trim()) throw DataError('the JSON is empty.');
    try {
      return JSON.parse(src);
    } catch (e) {
      // V8 messages name a position and sometimes echo the source; keep the reason and give the line and column.
      var message = String(e.message).replace(/^JSON\.parse: /, '').replace(/, "[\s\S]*" is not valid JSON$/, '');
      var at = message.match(/ in JSON at position (\d+)(?: \(line \d+ column \d+\))?/);
      if (!at) throw DataError(message);
      var before = src.slice(0, +at[1]).split('\n');
      throw DataError(message.replace(at[0], '') + ' (column ' + (before[before.length - 1].length + 1) + ').', before.length);
    }
  }

  // One YAML document read with the core schema (plain maps, lists, strings, numbers, booleans, and null).
  function parseYaml(text) {
    var yaml = root.jsyaml;
    if (!yaml || typeof yaml.loadAll !== 'function') {
      throw DataError('YAML needs docform/vendor/js-yaml/js-yaml.min.js loaded before the page finishes loading.');
    }
    var docs = [];
    try {
      yaml.loadAll(String(text).replace(/^﻿/, ''), function (doc) { docs.push(doc); }, { schema: yaml.CORE_SCHEMA });
    } catch (e) {
      var line = e.mark && isFinite(e.mark.line) ? e.mark.line + 1 : null;
      var reason = String(e.reason || e.message);
      var tag = reason.match(/unknown tag !<([^>]*)>/);
      if (tag) {
        var shown = tag[1].replace(/^tag:yaml\.org,2002:/, '!!');
        throw DataError('the tag ' + shown + ' is not supported. Data blocks read plain YAML without custom tags; ' +
          'remove the tag or quote the value.', line);
      }
      throw DataError(reason, line);
    }
    if (docs.length > 1) {
      throw DataError('found ' + docs.length + ' YAML documents. A data block reads one document; ' +
        'split the file or remove the extra "---" lines.');
    }
    return docs.length ? docs[0] : null;
  }

  // { type, value } for JSON and YAML, or { type, columns, rows, cells } for CSV. Throws a DataError.
  function parse(text, kind) {
    var key = type(kind) || sniff(text);
    if (key === 'csv') {
      var csv = parseCsv(text);
      csv.type = 'csv';
      return csv;
    }
    return { type: key, value: key === 'json' ? parseJson(text) : parseYaml(text) };
  }

  function scalar(v) {
    return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  }

  function isPlain(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function cellText(v) {
    return v === null || v === undefined ? '' : String(v);
  }

  // Columns and cell text when the data is tabular: CSV, or a non-empty array of objects with only scalar values.
  // Object keys become columns in first-seen order; missing keys give empty cells.
  function table(parsed) {
    if (!parsed) return null;
    if (parsed.type === 'csv') return { columns: parsed.columns.slice(), cells: parsed.cells };
    var list = parsed.value;
    if (!Array.isArray(list) || !list.length) return null;
    var columns = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!isPlain(item)) return null;
      for (var k in item) {
        if (!hasOwn.call(item, k)) continue;
        if (!scalar(item[k])) return null;
        if (columns.indexOf(k) < 0) columns.push(k);
      }
    }
    if (!columns.length) return null;
    return {
      columns: columns,
      cells: list.map(function (item) {
        return columns.map(function (c) { return cellText(hasOwn.call(item, c) ? item[c] : null); });
      })
    };
  }

  // The parsed value, with CSV rows as objects keyed by column name.
  function valueOf(parsed) {
    if (!parsed || parsed.type !== 'csv') return parsed ? parsed.value : null;
    return parsed.rows.map(function (row) {
      var item = {};
      parsed.columns.forEach(function (c, k) {
        Object.defineProperty(item, c, { value: row[k], enumerable: true, writable: true, configurable: true });
      });
      return item;
    });
  }

  function keyOf(value) {
    return typeof value === 'string' && value.trim() || null;
  }

  function copyValue(value, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) return value;
    var proto = value && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
    var array = Array.isArray(value);
    if (!array && proto !== null && (!proto || Object.getPrototypeOf(proto) !== null ||
        !hasOwn.call(proto, 'constructor') || proto.constructor.name !== 'Object')) {
      throw DataError('Expected a JSON-compatible value.');
    }
    ancestors = ancestors || new Set();
    if (ancestors.has(value)) throw DataError('Circular data is not supported.');
    ancestors.add(value);
    var copy = array ? Array.from(value, function (item) { return copyValue(item, ancestors); }) :
      Object.fromEntries(Object.keys(value).map(function (key) { return [key, copyValue(value[key], ancestors)]; }));
    ancestors.delete(value);
    return copy;
  }

  function equalValue(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    var keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(function (key) {
      return hasOwn.call(b, key) && equalValue(a[key], b[key]);
    });
  }

  function readInput(input, name, revision) {
    var kind = input && input.type;
    var text = kind === 'value' ? null : input && input.text;
    var parsed;
    if (kind === 'value') parsed = { type: kind, value: copyValue(input.value) };
    else if (TYPES.includes(kind) && typeof text === 'string') parsed = parse(text, kind);
    else throw DataError('Supply {type, text} for CSV, JSON, or YAML, or {type: "value", value}.');
    if (kind === 'csv' && new Set(parsed.columns).size !== parsed.columns.length) throw DataError('CSV source fields must be unique.');
    if (kind === 'json' || kind === 'yaml') parsed.value = copyValue(parsed.value);
    var value = valueOf(parsed);
    var display = text === null ? JSON.stringify(value, null, 2) : text;
    return {
      snapshot: runtime.freeze({ name: name, type: kind, value: value, text: text, revision: revision }),
      parsed: parsed, display: display, bytes: size(text === null ? JSON.stringify(value) : text)
    };
  }

  function define(name, input) {
    name = keyOf(name);
    if (!name || sources.has(name)) {
      runtime.issue('data', name, name ? 'Data "' + name + '" is registered more than once; keeping the first.' : 'A source needs a nonempty name.');
      return null;
    }
    var original;
    try { original = readInput(input, name, 0); }
    catch (error) {
      if (input && TYPES.includes(input.type) && typeof input.text === 'string') invalidSources.set(name, input);
      runtime.issue('data', name, error.message);
      return null;
    }
    invalidSources.delete(name);
    var current = original;
    var bindings = [];
    var api = { snapshot: function () { return current.snapshot; } };
    var events = runtime.signal('data', null, api.snapshot, {
      identity: 'source',
      eventState: function (state) { return Object.freeze({ revision: state.revision, type: state.type }); }
    });
    api.subscribe = events.subscribe;

    function commit(next, restoring) {
      var before = current.snapshot;
      var after = next.snapshot;
      if (before.type === after.type && (after.type === 'value' ?
        equalValue(before.value, after.value) : before.text === after.text)) return;
      var prepared = bindings.map(function (binding) { return binding.prepare(next, restoring); });
      current = next;
      var notifications = bindings.map(function (binding, i) { return binding.view.stage(prepared[i], 'source'); });
      return function (origin) {
        notifications.forEach(function (notify) { if (notify) notify(); });
        events.emit(after, before, origin, name);
      };
    }

    function attempt(fn) {
      try { return fn(); }
      catch (error) { runtime.issue('data', name, error.message); throw error; }
    }
    runtime.destination(api, function (input) {
      return attempt(function () { return commit(readInput(input, name, current.snapshot.revision + 1)); });
    }, function () {
      return attempt(function () {
        var snapshot = Object.assign({}, original.snapshot, { revision: current.snapshot.revision + 1 });
        return commit(Object.assign({}, original, { snapshot: Object.freeze(snapshot) }), true);
      });
    });
    sources.set(name, { api: api, current: function () { return current; }, bindings: bindings });
    return api;
  }

  function source(name) {
    var key = keyOf(name);
    var found = sources.get(key);
    return found ? found.api : null;
  }

  function registerWrapped(name) {
    var entry = get(name);
    return entry && define(name, entry);
  }

  function defineTransform(name, fn) {
    name = keyOf(name);
    if (!name || transforms.has(name) || typeof fn !== 'function') {
      runtime.issue('data', name, 'Give each transform a unique name and a function.');
      return false;
    }
    transforms.set(name, fn);
    return true;
  }

  function optionsFor(feature, host, instance) {
    var boot = DocForm._boot;
    return boot ? boot.merge.apply(null, boot.optionLayers(feature, host.id).concat(instance || {})) :
      Object.assign({}, instance);
  }

  function mappedFields(value, fields) {
    var keys = fields.map(keyOf);
    if (keys.includes(null)) throw DataError('Mapping fields must be nonempty strings.');
    if (!Array.isArray(value) || value.some(function (record) {
      return !isPlain(record) || keys.some(function (key) { return !hasOwn.call(record, key) || !scalar(record[key]); });
    })) throw DataError('Expected records with scalar fields ' + keys.join(', ') + '.');
    return keys;
  }

  function transformValue(options, host, input) {
    if (options.transform === undefined) return input.snapshot.value;
    var transform = transforms.get(keyOf(options.transform));
    if (!transform) throw DataError('Unknown data transform "' + options.transform + '".');
    return runtime.transform(function () {
      return copyValue(transform(input.snapshot, { host: host, mapping: copyValue(options.mapping ?? null) }));
    });
  }

  function binding(feature, host, options, prepare) {
    var name = keyOf(host.getAttribute('data-df-source'));
    var entry = sources.get(name);
    var caps = limits(host, options);
    var cached;
    var initial;
    function prepareView(input, first) {
      if (input.bytes > caps.maxBytes && !(first && feature === 'data-view')) {
        throw DataError('Data for ' + (host.id || feature) + ' exceeds ' + formatSize(caps.maxBytes) + '.');
      }
      var value = transformValue(options, host, input);
      if (value !== input.snapshot.value && !(first && feature === 'data-view') &&
          size(JSON.stringify(value)) > caps.maxBytes) throw DataError('Transformed data exceeds the view’s size limit.');
      return prepare(value, options.mapping, input, options.transformOutput === 'spec', caps, first);
    }
    return {
      read: function () {
        if (!entry) throw DataError('No data named "' + name + '" is registered.');
        var input = entry.current();
        if (cached !== input) {
          initial = prepareView(input, true);
          cached = input;
        }
        return initial;
      },
      mount: function (view) {
        if (entry) entry.bindings.push({ view: view, prepare: prepareView });
        try { view.start(this.read()); }
        catch (error) { runtime.issue(feature, host, error.message); }
      }
    };
  }

  // The view to draw: "table", "code", or "tree". A requested table falls back to code when the data is not tabular.
  function view(parsed, requested) {
    var want = String(requested || 'auto').trim().toLowerCase();
    var tabular = !!table(parsed);
    if (want === 'code' || want === 'tree') return want;
    if (want === 'table' && !tabular) {
      DocForm.warnOnce('data-view-table', 'This data is not a flat list of records, so it is shown as code instead of a table.');
    }
    return tabular ? 'table' : 'code';
  }

  // Per-block caps from data-df-max-size and data-df-max-rows, else DocForm.dataset.defaults.
  function limits(el, options) {
    var out = { maxBytes: defaults.maxBytes, maxRows: defaults.maxRows };
    options = options || {};
    [options.maxSize, el && el.getAttribute('data-df-max-size')].forEach(function (bytes) {
      if (bytes == null) return;
      var b = parseSize(bytes);
      if (b > 0 && Number.isFinite(b)) out.maxBytes = b;
      else runtime.issue('data', el, 'Invalid size limit "' + bytes + '". Use a size such as "2 MB".');
    });
    [options.maxRows, el && el.getAttribute('data-df-max-rows')].forEach(function (rows) {
      if (rows == null) return;
      var r = Number(rows);
      if (r > 0 && Number.isSafeInteger(r)) out.maxRows = r;
      else runtime.issue('data', el, 'Invalid row limit "' + rows + '". Use a positive whole number.');
    });
    return out;
  }

  // DOM rendering below.

  var STATE = typeof WeakMap === 'function' ? new WeakMap() : null;

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function columnKey(th) {
    var given = th.getAttribute('data-df-field') ?? th.getAttribute('data-df-column');
    return (given !== null ? given : th.textContent).trim();
  }

  // A results table from the placeholder's own table (its header cells pick, order, and style the columns) or a
  // plain one with every column.
  function buildTable(state, data, limit) {
    var table;
    var picks;
    if (state.mapping) {
      table = state.template ? state.template.cloneNode(true) : make('table');
      var oldHead = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
      var headers = oldHead ? Array.from(oldHead.cells) : [];
      if (table.tHead) table.deleteTHead();
      Array.from(table.tBodies).forEach(function (body) { body.remove(); });
      var row = table.createTHead().insertRow();
      picks = state.mapping.map(function (column) {
        var authored = headers.find(function (th) { return columnKey(th) === column.field; });
        var th = authored || make('th');
        if (!authored || column.label !== undefined) th.textContent = column.label ?? column.field;
        th.setAttribute('data-df-field', column.field);
        th.setAttribute('scope', 'col');
        row.appendChild(th);
        return data.columns.indexOf(column.field);
      });
    } else if (state.template) {
      table = state.template.cloneNode(true);
      var head = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
      var lower = data.columns.map(function (c) { return c.toLowerCase(); });
      picks = head ? Array.prototype.map.call(head.cells, function (th) {
        var key = columnKey(th);
        var at = data.columns.indexOf(key);
        if (at < 0 && !th.hasAttribute('data-df-field')) at = lower.indexOf(key.toLowerCase());
        if (at < 0) DocForm.warnOnce('data-col:' + state.name + ':' + key, 'Data "' + state.name + '" has no column "' + key + '".', th);
        return at;
      }) : [];
      Array.prototype.slice.call(table.tBodies).forEach(function (b) { b.remove(); });
    }
    if (!table || !picks.length) {
      table = make('table');
      table.setAttribute('data-df-results', '');
      var thead = table.createTHead();
      var tr = thead.insertRow();
      data.columns.forEach(function (c) { tr.appendChild(make('th', null, c)).setAttribute('scope', 'col'); });
      picks = data.columns.map(function (c, k) { return k; });
    }
    var body = document.createElement('tbody');
    data.cells.slice(0, limit).forEach(function (row) {
      var tr = body.insertRow();
      picks.forEach(function (k) { tr.insertCell().textContent = k < 0 ? '' : row[k]; });
    });
    table.appendChild(body);
    if (!table.hasAttribute('data-df-results')) table.setAttribute('data-df-results', '');
    return table;
  }

  function buildCode(lang, text) {
    var pre = make('pre');
    pre.setAttribute('data-df-lang', lang);
    pre.appendChild(make('code', null, text));
    return pre;
  }

  function linesOf(text, limit) {
    var lines = String(text).replace(/^﻿/, '').replace(/\s+$/, '').split(/\r?\n/);
    return { total: lines.length, text: lines.slice(0, limit).join('\n') };
  }

  function moreControl(state, shown, total, unit) {
    var p = make('p', 'df-data-more');
    p.setAttribute('aria-live', 'polite');
    p.appendChild(document.createTextNode('Showing ' + count(shown) + ' of ' + count(total) + ' ' + unit + '. '));
    var left = total - shown;
    var step = Math.min(left, state.limits.maxRows);
    var button = make('button', null, step === left ? 'Show all' : 'Show ' + count(step) + ' more');
    button.type = 'button';
    button.addEventListener('click', function () {
      state.shown = shown + step;
      draw(state);
      if (state.controller) state.controller.change('user');
      var again = state.el.querySelector('.df-data-more button');
      if (again) again.focus();
    });
    p.appendChild(button);
    return p;
  }

  function errorBox(title, message) {
    var box = make('div', 'df-data-error');
    box.setAttribute('role', 'note');
    box.appendChild(make('strong', null, title));
    if (message) box.appendChild(document.createTextNode(' ' + message.charAt(0).toUpperCase() + message.slice(1)));
    return box;
  }

  function enhanceAll(el, modern) {
    if (DocForm.results && DocForm.results.enhance) DocForm.all('table[data-df-results]', el).forEach(function (table) {
      DocForm.results.enhance(table, { silent: modern });
    });
    if (DocForm.code && DocForm.code.enhance) DocForm.all('pre', el).forEach(DocForm.code.enhance);
  }

  function emit(state, detail) {
    if (state.modern) {
      state.snapshot = detail.error ? null : {
        name: state.name, view: detail.view, total: detail.rows ?? null,
        shown: detail.rows == null ? null : Math.min(detail.rows, state.shown || state.limits.maxRows)
      };
      return;
    }
    if (typeof CustomEvent !== 'function') return;
    detail.name = state.name;
    state.el.dispatchEvent(new CustomEvent('df:datarender', { bubbles: true, detail: detail }));
  }

  function draw(state) {
    var el = state.el;
    var entry = state.entry;
    el.textContent = '';
    if (!entry) {
      el.appendChild(errorBox('No data named "' + state.name + '".', 'Load its data file before the page finishes loading.'));
      return;
    }
    var label = '"' + state.name + '"';
    var bytes = entry.bytes ?? size(entry.text);
    if (bytes > state.limits.maxBytes && !state.force) {
      var note = make('p', 'df-data-notice', label + ' is ' + formatSize(bytes) + ', over this block\'s ' +
        formatSize(state.limits.maxBytes) + ' limit. ');
      var go = make('button', null, 'Show anyway');
      go.type = 'button';
      go.addEventListener('click', function () {
        state.force = true;
        draw(state);
        if (state.controller) state.controller.change('user');
      });
      note.appendChild(go);
      el.appendChild(note);
      emit(state, { view: null, error: 'size' });
      return;
    }
    var limit = state.shown || state.limits.maxRows;
    var parsed;
    try {
      parsed = state.parsed || (state.parsed = parse(entry.text, entry.type));
    } catch (e) {
      el.appendChild(errorBox('Could not read ' + label + ' as ' + NAMES[entry.type] + '.', e.message));
      var raw = linesOf(entry.text, limit);
      var pre = make('pre', 'df-data-raw', raw.text);
      pre.setAttribute('data-df-no-code', '');
      el.appendChild(pre);
      if (raw.total > limit) el.appendChild(moreControl(state, limit, raw.total, 'lines'));
      emit(state, { view: 'raw', error: e.message });
      return;
    }
    var shown = state.grid && (state.view === 'auto' || state.view === 'table') ? 'table' : view(parsed, state.view);
    if (shown === 'tree' && !DocForm.tree) {
      DocForm.warnOnce('data-tree', 'data-df-view="tree" needs docform/js/tree.js; showing code instead.', el);
      shown = 'code';
    }
    if (shown === 'tree') {
      el.appendChild(DocForm.tree.build(valueOf(parsed), { label: 'Data ' + label, open: state.open, maxItems: state.limits.maxRows }));
      emit(state, { view: 'tree' });
    } else if (shown === 'table') {
      var data = state.grid || table(parsed);
      el.appendChild(buildTable(state, data, limit));
      if (data.cells.length > limit) el.appendChild(moreControl(state, limit, data.cells.length, 'rows'));
      emit(state, { view: 'table', rows: data.cells.length });
    } else {
      var lines = linesOf(entry.text, limit);
      el.appendChild(buildCode(entry.type === 'value' ? 'json' : entry.type, lines.text));
      if (lines.total > limit) el.appendChild(moreControl(state, limit, lines.total, 'lines'));
      emit(state, { view: 'code', rows: lines.total });
    }
    enhanceAll(el, state.modern);
  }

  function scriptType(el) {
    return type(DocForm.data(el, 'type', null)) || type(el.getAttribute('type'));
  }

  function tableMapping(value, mapping, template, parsed) {
    var head = template && template.tHead && template.tHead.rows[template.tHead.rows.length - 1];
    var required = head ? Array.from(head.cells).filter(function (cell) {
      return cell.hasAttribute('data-df-field');
    }).map(columnKey) : [];
    var columns = mapping && mapping.columns;
    if (mapping !== undefined) {
      if (!Array.isArray(columns) || !columns.length || columns.some(function (column) {
        return !column || (column.label !== undefined && typeof column.label !== 'string');
      })) throw DataError('Table mapping needs columns with a field and an optional label.');
      required = columns.map(function (column) { return column.field; });
    }
    if (!required.length) return null;
    var keys = mappedFields(value, required);
    if (new Set(keys).size !== keys.length) throw DataError('Table fields must be unique.');
    if (parsed && parsed.type === 'csv' && keys.some(function (key) { return !parsed.columns.includes(key); })) {
      throw DataError('A required CSV field is missing.');
    }
    return columns ? columns.map(function (column, i) { return { field: keys[i], label: column.label }; }) : null;
  }

  var dataViews = new WeakMap();

  function mountView(target, instance) {
    var el = runtime.target(target);
    if (!el) return null;
    if (dataViews.has(el)) return dataViews.get(el);
    var name = keyOf(el.getAttribute('data-df-source'));
    var options = optionsFor('data-view', el, instance);
    var mode = el.getAttribute('data-df-data-view') ?? options.view ?? 'auto';
    if (!VIEWS.includes(mode)) {
      runtime.issue('data-view', el, 'Unknown data view "' + mode + '".');
      mode = 'auto';
    }
    var fallback = Array.from(el.childNodes);
    var initiallyHidden = el.hidden;
    var template = el.querySelector(':scope > table');
    var state = { name: name, view: mode, template: template, modern: true,
      limits: limits(el, options), open: DocForm.num(el, 'tree-depth', options.treeDepth ?? 1), el: el };

    function prepare(input, value) {
      var mapping = tableMapping(value, options.mapping, template, input.parsed);
      var grid = mapping && input.parsed.type !== 'csv' ? {
        columns: mapping.map(function (column) { return column.field; }),
        cells: value.map(function (record) {
          return mapping.map(function (column) { return cellText(record[column.field]); });
        })
      } : null;
      return { input: input, mapping: mapping, grid: grid };
    }

    function ensureHost() {
      if (el.tagName === 'PRE' && state.el === el) {
        state.el = make('div');
        el.after(state.el);
        el.hidden = true;
        dataViews.set(state.el, controller.api);
      }
      state.el.classList.add('df-data', 'df-data-ready');
    }

    var controller = runtime.controller('data-view', el, {
      prepare: function (entry) {
        var input = readInput(entry, name, 0);
        if (input.bytes > state.limits.maxBytes) throw DataError('The file exceeds this view’s size limit.');
        return prepare(input, input.snapshot.value);
      },
      render: function (prepared) {
        if (!prepared) {
          if (state.el !== el) { state.el.remove(); state.el = el; el.hidden = initiallyHidden; }
          else el.replaceChildren.apply(el, fallback);
          state.snapshot = null;
          return;
        }
        ensureHost();
        var input = prepared.input;
        state.mapping = prepared.mapping;
        state.grid = prepared.grid;
        state.entry = { text: input.display, type: input.snapshot.type, bytes: input.bytes };
        state.parsed = input.parsed;
        state.snapshot = null;
        state.shown = 0;
        state.force = false;
        draw(state);
      },
      snapshot: function () { return state.snapshot || null; },
      alwaysNotify: true
    }, 'render');
    state.controller = controller;
    dataViews.set(el, controller.api);
    if (name) {
      binding('data-view', el, options, function (value, mapping, input, spec) {
        if (spec) input = readInput(value, name, 0);
        else if (value !== input.snapshot.value) input = readInput({ type: 'value', value: value }, name, 0);
        return prepare(input, input.snapshot.value);
      }).mount(controller);
      if (!sources.has(name) && invalidSources.has(name)) {
        ensureHost();
        state.entry = invalidSources.get(name);
        draw(state);
      }
    }
    return controller.api;
  }

  // given and template, from DocForm.dataset.show, draw an entry that is not registered into any element.
  function setup(el, given, template) {
    var name = given ? given.name : DocForm.data(el, 'data', '').trim();
    var entry;
    var host = el;
    if (given) {
      entry = given;
    } else if (el.tagName === 'PRE') {
      // An inline block renders its own text and also registers it when the name is free.
      var text = dedent(el.textContent);
      var kind = scriptType(el) || sniff(text, name);
      entry = { name: name, type: kind, text: text };
      if (name && !store[name] && !get(name)) add(name, text, kind);
      host = make('div');
      Array.prototype.forEach.call(el.attributes, function (a) { host.setAttribute(a.name, a.value); });
      el.replaceWith(host);
    } else {
      entry = get(name);
      var given = type(DocForm.data(el, 'type', null));
      if (entry && given && given !== entry.type) entry = { name: entry.name, type: given, text: entry.text };
    }
    var requested = DocForm.data(host, 'view', 'auto').trim().toLowerCase();
    if (VIEWS.indexOf(requested) < 0) {
      DocForm.warnOnce('data-view:' + requested, 'Unknown data-df-view "' + requested + '"; use auto, table, code, or tree.', host);
      requested = 'auto';
    }
    template = template || host.querySelector('table');
    var state = {
      el: host,
      name: name,
      entry: entry,
      view: requested,
      template: template && template.tHead ? template.cloneNode(true) : null,
      limits: limits(host),
      open: DocForm.num(host, 'tree-depth', 1),
      shown: 0,
      force: false,
      parsed: null
    };
    host.classList.add('df-data', 'df-data-ready');
    if (!entry) DocForm.warnOnce('data-missing:' + name, 'No data named "' + name + '" is registered.', host);
    if (STATE) STATE.set(host, state);
    draw(state);
  }

  function render(el) {
    var state = STATE && STATE.get(el);
    if (!state) return setup(el);
    state.entry = get(state.name) || state.entry;
    state.parsed = null;
    state.shown = 0;
    draw(state);
  }

  // Draws another entry ({ name, type, text }) in a block, such as a file a reader dropped. The block keeps its view,
  // limits, and table header, and restore() brings back what it showed first. An element that is not yet a data
  // block becomes one, using template (a table with a thead) for its columns when given.
  function show(el, entry, template) {
    var state = STATE && STATE.get(el);
    if (!state) return setup(el, entry, template ? template.cloneNode(true) : null);
    if (!hasOwn.call(state, 'saved')) state.saved = state.entry;
    state.entry = entry;
    state.parsed = null;
    state.shown = 0;
    state.force = false;
    draw(state);
  }

  function restore(el) {
    var state = STATE && STATE.get(el);
    if (!state || !hasOwn.call(state, 'saved')) return false;
    state.entry = state.saved;
    delete state.saved;
    state.parsed = null;
    state.shown = 0;
    state.force = false;
    draw(state);
    return true;
  }

  function isBlock(el) {
    return !!(STATE && el && STATE.get(el));
  }

  DocForm.dataset = {
    defaults: defaults,
    add: add,
    get: get,
    names: names,
    type: type,
    sniff: sniff,
    size: size,
    parseSize: parseSize,
    formatSize: formatSize,
    dedent: dedent,
    parse: parse,
    parseCsv: parseCsv,
    parseJson: parseJson,
    parseYaml: parseYaml,
    table: table,
    valueOf: valueOf,
    view: view,
    limits: limits,
    render: render,
    show: show,
    restore: restore,
    isBlock: isBlock
  };

  Object.assign(DocForm.data, {
    define: define, source: source, defineTransform: defineTransform,
    names: function () { return Array.from(sources.keys()); },
    parse: parse, table: table, valueOf: valueOf
  });
  DocForm._dataSource = {
    binding: binding, options: optionsFor, fields: mappedFields, key: keyOf, input: readInput,
    columns: tableMapping, transform: transformValue
  };
  DocForm.dataView = {
    mount: mountView,
    get: function (target) { return dataViews.get(runtime.target(target)) || null; }
  };

  function readInline() {
    Object.keys(root.DocFormData || {}).forEach(function (name) {
      if (!sources.has(name) && !invalidSources.has(name)) registerWrapped(name);
    });
    DocForm.all('script[data-df-source], pre[data-df-source]').forEach(function (el) {
      var name = DocForm.data(el, 'source', '').trim();
      var text = dedent(el.textContent);
      var declared = el.getAttribute('data-df-source-type');
      var kind = el.tagName === 'PRE' ? (declared === null ? sniff(text, name) : type(declared)) :
        MIME[(el.getAttribute('type') || '').trim().toLowerCase()];
      if (kind) define(name, { type: kind, text: text });
      else runtime.issue('data', el, 'Use a CSV, JSON, or YAML data MIME type.');
    });
    DocForm.all('script[data-df-data]').forEach(function (el) {
      var name = DocForm.data(el, 'data', '').trim();
      add(name, dedent(el.textContent), scriptType(el));
    });
  }

  var boot = DocForm._boot;
  if (boot) {
    boot.readData = readInline;
    boot.registerData = registerWrapped;
  }
  DocForm.register(boot ? 'data-view' : 'data', function () {
    if (!boot) readInline();
    DocForm.all('[data-df-data-view]:not([data-df-dropzone])').forEach(function (el) { mountView(el); });
    DocForm.all('[data-df-data]:not(script):not(.df-data-ready)').forEach(function (el) {
      setup(el);
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
