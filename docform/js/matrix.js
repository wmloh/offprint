// Evaluation matrices from named records, with a shared choice-chip measure chooser and a shared scale.
(function () {
  'use strict';

  var runtime = DocForm._dataViews;
  var component = DocForm._component;
  var data = DocForm._dataSource;
  var matrices = new WeakMap();

  function descriptors(items, name, read) {
    if (!Array.isArray(items) || !items.length) throw new Error('Supply ordered matrix ' + name + ' descriptors.');
    var seen = new Set();
    return items.map(function (item) {
      var key = data.key(item && item.key);
      var label = data.key(item && item.label);
      if (!key || !label || seen.has(key)) {
        throw new Error('Matrix ' + name + ' need distinct keys and nonempty labels. Check ' + JSON.stringify(key) + '.');
      }
      seen.add(key);
      return read ? read(item, key, label) : { key: key, label: label };
    });
  }

  function measure(item, key, label) {
    var name = 'Matrix measure ' + JSON.stringify(key);
    if (!data.key(item.field)) throw new Error(name + ' needs a record field.');
    var range = item.range;
    if (range !== undefined && (!Array.isArray(range) || range.length !== 2 ||
        !range.every(Number.isFinite) || !(range[0] < range[1]))) {
      throw new Error(name + ' needs a range of two increasing finite numbers.');
    }
    ['unit', 'normalization'].forEach(function (option) {
      if (item[option] !== undefined && !data.key(item[option])) {
        throw new Error(name + ' needs nonempty text for ' + option + '.');
      }
    });
    return { key: key, label: label, field: item.field, range: range && range.slice(),
      unit: item.unit, normalization: item.normalization };
  }

  function prepare(records, mapping, parsed, caps, maxCells) {
    if (!Array.isArray(records) || records.length > caps.maxRows) {
      throw new Error('Supply matrix records within the ' + caps.maxRows + '-row limit.');
    }
    if (!mapping || !data.key(mapping.row) || !data.key(mapping.column)) {
      throw new Error('Matrix mapping needs exact row and column field names.');
    }
    var rows = descriptors(mapping.rows, 'rows');
    var columns = descriptors(mapping.columns, 'columns');
    if (rows.length * columns.length > maxCells) throw new Error('Matrix exceeds the ' + maxCells + '-cell limit.');
    var measures = descriptors(mapping.measures, 'measures', measure);
    var fields = [mapping.row, mapping.column].concat(measures.map(function (item) { return item.field; }));
    data.fields(records, fields, true);
    if (parsed && parsed.type === 'csv' && fields.some(function (field) { return !parsed.columns.includes(field); })) {
      throw new Error('Matrix CSV needs the mapped fields ' + fields.map(function (field) { return JSON.stringify(field); }).join(', ') + '.');
    }

    var rowIndices = new Map(rows.map(function (item, i) { return [item.key, i]; }));
    var columnIndices = new Map(columns.map(function (item, i) { return [item.key, i]; }));
    var cells = new Map();
    var extents = measures.map(function () { return [Infinity, -Infinity]; });
    records.forEach(function (record, i) {
      var row = data.key(record[mapping.row]);
      var column = data.key(record[mapping.column]);
      var location = 'Matrix record ' + (i + 1);
      if (!rowIndices.has(row) || !columnIndices.has(column)) {
        throw new Error(location + ' needs declared row and column keys. Check ' +
          JSON.stringify([record[mapping.row], record[mapping.column]]) + '.');
      }
      var index = rowIndices.get(row) * columns.length + columnIndices.get(column);
      if (cells.has(index)) {
        throw new Error(location + ' duplicates the cell for ' + JSON.stringify([row, column]) + '.');
      }
      cells.set(index, measures.map(function (item, j) {
        var value = record[item.field];
        if (value === null) return null;
        if (!Number.isFinite(value)) {
          throw new Error(location + ' field ' + JSON.stringify(item.field) + ' needs a finite number or null.');
        }
        extents[j][0] = Math.min(extents[j][0], value);
        extents[j][1] = Math.max(extents[j][1], value);
        return value;
      }));
    });
    return { rows: rows, columns: columns, measures: measures, cells: cells, extents: extents };
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function header(row, label, scope) {
    var cell = make('th', null, label);
    cell.setAttribute('scope', scope);
    row.appendChild(cell);
  }

  function format(value, unit) {
    return String(value) + (unit ? (unit === '%' ? '%' : ' ' + unit) : '');
  }

  function strength(value, lower, upper) {
    if (value <= lower) return 0;
    if (value >= upper) return 1;
    var span = upper - lower;
    return Number.isFinite(span) ? (value - lower) / span :
      (value / 2 - lower / 2) / (upper / 2 - lower / 2);
  }

  function mount(target, instance) {
    var table = component.target(target, 'matrix', true);
    if (!table) return null;
    if (table.tagName !== 'TABLE') {
      component.issue('matrix', table, 'Use a table element for an evaluation matrix.');
      return null;
    }
    if (matrices.has(table)) return matrices.get(table);
    if (!data.key(table.getAttribute('data-df-source'))) {
      component.issue('matrix', table, 'Set data-df-source to a named record source.');
      return null;
    }
    var options = data.options('matrix', table, instance);
    var caps = DocForm.dataset.limits(table, options);
    var positiveInteger = function (value) { return Number.isSafeInteger(value) && value > 0; };
    var maxCells = component.option('matrix', table, 'maxCells', 5000, positiveInteger, instance);
    maxCells = component.number(table, 'max-cells', 'matrix', maxCells, positiveInteger);
    var fallback = Array.from(table.children).filter(function (child) {
      return ['COLGROUP', 'THEAD', 'TBODY', 'TFOOT', 'TR'].includes(child.tagName);
    });
    var controls = make('div', 'df-matrix-controls');
    var picker = null;
    var summary = make('span', 'df-matrix-summary');
    var ramp = make('span', 'df-matrix-ramp');
    summary.setAttribute('role', 'status');
    ramp.setAttribute('aria-hidden', 'true');
    controls.appendChild(summary);
    controls.appendChild(ramp);

    var model = null;
    var head;
    var body;
    var selected = 0;

    function draw() {
      var item = model.measures[selected];
      var [min, max] = model.extents[selected];
      var hasValues = min !== Infinity;
      var [lower, upper] = item.range || [min, max];
      var scaled = hasValues && lower !== upper;
      if (picker) picker.show(item.key);
      ramp.hidden = !scaled;
      var scaleText = hasValues ? (scaled ? format(lower, item.unit) + ' to ' + format(upper, item.unit) :
        'All values equal ' + format(lower, item.unit)) : 'No values supplied';
      if (item.normalization) scaleText = item.normalization + ' · ' + scaleText;
      summary.textContent = picker ? scaleText : item.label + ' · ' + scaleText;

      var nextBody = make('tbody');
      model.rows.forEach(function (row, i) {
        var line = make('tr');
        header(line, row.label, 'row');
        model.columns.forEach(function (_, j) {
          var values = model.cells.get(i * model.columns.length + j);
          var value = values ? values[selected] : null;
          var cell = make('td', value === null ? 'df-matrix-missing' : 'df-matrix-value',
            value === null ? 'Missing' : format(value, item.unit));
          if (scaled && value !== null) {
            cell.style.setProperty('--df-matrix-strength', strength(value, lower, upper));
          }
          line.appendChild(cell);
        });
        nextBody.appendChild(line);
      });
      if (body) table.replaceChild(nextBody, body);
      else table.appendChild(nextBody);
      body = nextBody;
    }

    function choose(key, origin) {
      key = data.key(key);
      return runtime.transaction(function () {
        if (!model) return false;
        var index = model.measures.findIndex(function (item) { return item.key === key; });
        if (index < 0) return false;
        if (index !== selected) {
          selected = index;
          draw();
          controller.change(origin);
        }
        return true;
      });
    }

    var controller = runtime.controller('matrix', table, {
      prepare: function (records) {
        var input = data.input({ type: 'value', value: records }, null, 0);
        if (input.bytes > caps.maxBytes) throw new Error('Matrix records exceed the table’s size limit.');
        return prepare(input.snapshot.value, options.mapping, null, caps, maxCells);
      },
      render: function (next, origin) {
        if (!next && !model) return;
        var previous = model && model.measures[selected].key;
        if (!model) fallback.forEach(function (section) { section.remove(); });
        if (head) head.remove();
        if (body) body.remove();
        body = null;
        model = next;
        if (!model) {
          controls.remove();
          table.classList.remove('df-matrix');
          fallback.forEach(function (section) { table.appendChild(section); });
          return;
        }

        selected = origin === 'reset' ? 0 : Math.max(0, model.measures.findIndex(function (item) {
          return item.key === previous;
        }));
        var line = make('tr');
        line.appendChild(make('td'));
        model.columns.forEach(function (column) { header(line, column.label, 'col'); });
        head = make('thead');
        head.appendChild(line);
        table.appendChild(head);
        if (picker) picker.el.remove();
        picker = model.measures.length < 2 ? null : DocForm.choices.create({
          label: 'Measure',
          className: 'df-matrix-picker',
          options: model.measures.map(function (item) { return { value: item.key, label: item.label }; }),
          onChange: function (key) { if (!choose(key, 'user') && model) picker.show(model.measures[selected].key); }
        });
        if (picker) controls.insertBefore(picker.el, controls.firstChild);
        if (!controls.parentNode) table.before(controls);
        table.classList.add('df-matrix');
        draw();
      },
      snapshot: function () {
        if (!model) return null;
        var item = model.measures[selected];
        return { key: item.key, index: selected, label: item.label, total: model.measures.length };
      },
      resetReader: true
    });

    controller.api.select = function (key) { return choose(key, 'api'); };
    matrices.set(table, controller.api);
    data.binding('matrix', table, options, function (records, mapping, input, spec) {
      if (spec) return prepare(records && records.records, records && records.mapping, null, caps, maxCells);
      return prepare(records, mapping, records === input.snapshot.value ? input.parsed : null, caps, maxCells);
    }).mount(controller);
    return controller.api;
  }

  DocForm.matrix = {
    mount: mount,
    get: function (target) { return matrices.get(component.target(target, 'matrix', false)) || null; }
  };

  DocForm.register('matrix', function () {
    DocForm.all('table[data-df-matrix]').forEach(function (table) {
      if (component.flag(table, 'matrix', 'matrix')) mount(table);
    });
  });
})();
