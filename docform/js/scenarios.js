// Compare the first scenario column with one variant from the same authored table.
// Strict mode allows one changed condition per variant; "configurations" allows several.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] scenarios.js needs core.js loaded before it.');
    return;
  }

  var sequence = DocForm._sequence;
  var items = DocForm._items;

  function text(cell) {
    return cell.textContent.trim().replace(/\s+/g, ' ');
  }

  var MODES = { '': 'single', single: 'single', configurations: 'configurations' };

  function read(table) {
    var requested = (table.getAttribute('data-df-scenarios') || '').trim();
    if (!Object.hasOwn(MODES, requested)) return null;
    var mode = MODES[requested];
    var heads = DocForm.all(':scope > thead > tr', table);
    if (heads.length !== 1) return null;
    var columns = Array.from(heads[0].cells);
    var names = columns.slice(2).map(function (cell) { return sequence.label(cell, cell); });
    var keys = columns.slice(2).map(function (cell) {
      return items.key(DocForm.data(cell, 'key'));
    });
    var rows = DocForm.all(':scope > tbody > tr', table);
    var conditions = [];
    var groups = new Map();
    if (table.tFoot || names.length < 2 || names.includes('') || keys.includes(null) || new Set(keys).size !== keys.length) return null;
    if (columns.some(function (cell) { return cell.tagName !== 'TH' || cell.colSpan !== 1 || cell.rowSpan !== 1; })) return null;

    for (var row of rows) {
      var cells = Array.from(row.cells);
      if (cells.length !== columns.length || cells.some(function (cell) { return cell.colSpan !== 1 || cell.rowSpan !== 1; })) return null;

      var measure = { name: text(cells[0]), unit: text(cells[1]), values: cells.slice(2).map(text), cells: cells };
      if (!measure.name || measure.values.includes('')) return null;
      if (row.hasAttribute('data-df-condition')) {
        conditions.push(measure);
      } else {
        measure.numbers = measure.values.map(function (value) {
          return value.endsWith('%') ? null : DocForm.chart.toNumber(value);
        });
        if (!measure.numbers.every(Number.isFinite)) return null;
        var group = groups.get(measure.unit);
        if (!group) {
          group = { unit: measure.unit, outcomes: [], categories: [], min: 0, max: 0 };
          groups.set(measure.unit, group);
        }
        if (group.categories.includes(measure.name)) return null;
        group.categories.push(measure.name);
        group.outcomes.push(measure);
        measure.numbers.forEach(function (value) {
          group.min = Math.min(group.min, value);
          group.max = Math.max(group.max, value);
        });
      }
    }

    var variants = names.slice(1).map(function (name, i) {
      var index = i + 1;
      var changed = conditions.filter(function (condition) { return condition.values[index] !== condition.values[0]; });
      return { key: keys[index], name: name, index: index, changes: changed,
        detail: sequence.detail(columns[index + 2]) };
    });
    var valid = function (variant) {
      return mode === 'configurations' ? variant.changes.length > 0 : variant.changes.length === 1;
    };
    if (!groups.size || !variants.every(valid)) return null;
    return { mode: mode, columns: columns, rows: rows, baseline: names[0], baselineKey: keys[0], groups: groups,
      variants: variants, domain: items.domain('scenarios', table, columns.slice(3)) };
  }

  function element(tag, parent, content) {
    var node = document.createElement(tag);
    if (content) node.textContent = content;
    parent.appendChild(node);
    return node;
  }

  function withUnit(measure, value) {
    return value + (measure.unit === '%' ? '%' : measure.unit ? ' ' + measure.unit : '');
  }

  function changeText(measure, index) {
    return measure.name + ' changed from ' + withUnit(measure, measure.values[0]) + ' to ' + withUnit(measure, measure.values[index]) + '.';
  }

  function outcomePoint(outcome, index) {
    var interval = outcome.intervals && outcome.intervals[index];
    return interval ? { x: outcome.name, y: outcome.numbers[index], interval: interval } : outcome.numbers[index];
  }

  function draw(table, model, steps) {
    var visual = document.createElement('div');
    visual.className = 'df-scenarios-visual';
    var controls = element('div', visual);
    controls.className = 'df-scenarios-controls';
    var chooser = DocForm.choices.create({
      label: 'Variant',
      options: model.variants.map(function (variant) { return { value: String(variant.index), label: variant.name }; }),
      className: 'df-scenarios-chooser',
      onChange: function (value) { steps.choose(Number(value) - 1, 'user'); }
    });
    controls.appendChild(chooser.el);
    var pill = sequence.pill(steps, {
      label: 'Scenario variants', prevLabel: 'Previous variant', nextLabel: 'Next variant',
      initial: function () { return model.domain.initial; },
      status: function (current) { return (current.index + 1) + ' of ' + current.count; }
    });
    controls.appendChild(pill.element);
    pill.count.removeAttribute('role');
    pill.count.setAttribute('aria-hidden', 'true');

    var conditionList = null;
    if (model.mode === 'configurations') {
      element('p', visual, 'Changed conditions').className = 'df-eyebrow df-scenarios-heading';
      conditionList = element('ul', visual);
      conditionList.className = 'df-scenarios-conditions';
    }
    var status = element('p', visual);
    status.setAttribute('role', 'status');
    var marker = element('p', visual, '* Changed outcome');
    marker.className = 'df-scenarios-key';
    var plots = Array.from(model.groups.values(), function (group) {
      return { group: group, host: element('div', visual) };
    });
    var selected;
    var notes = model.variants.map(function (variant) { return variant.detail; });

    function show(variant) {
      selected = variant;
      var index = variant.index;
      chooser.show(String(index));
      sequence.showDetails(notes, index - 1);
      var conditionText = variant.changes.map(function (change) { return changeText(change, index); });
      var changedText = [];
      var selectedColumn = index + 2;
      for (var c = 3; c < model.columns.length; c++) {
        model.columns[c].hidden = c !== selectedColumn;
        model.rows.forEach(function (row) {
          row.cells[c].hidden = c !== selectedColumn;
          row.cells[c].removeAttribute('data-df-scenario-difference');
        });
      }
      variant.changes.forEach(function (change) {
        change.cells[selectedColumn].setAttribute('data-df-scenario-difference', '');
      });
      if (conditionList) {
        conditionList.textContent = '';
        variant.changes.forEach(function (change) {
          element('li', conditionList, change.name + ': ' + withUnit(change, change.values[0]) + ' → ' + withUnit(change, change.values[index]));
        });
      }

      plots.forEach(function (plot) {
        var group = plot.group;
        var marked = [];
        group.outcomes.forEach(function (outcome) {
          if (outcome.numbers[index] === outcome.numbers[0]) return;
          marked.push(outcome.name);
          changedText.push(changeText(outcome, index));
          outcome.cells[selectedColumn].setAttribute('data-df-scenario-difference', '');
        });
        (DocForm.chart._embedded || DocForm.chart)(plot.host, {
          type: 'bar',
          title: group.unit ? 'Outcomes in ' + group.unit : 'Unitless outcomes',
          categories: group.categories,
          markedCategories: marked,
          table: false,
          y: {
            label: group.unit || 'Value',
            unit: group.unit === '%' ? '%' : group.unit && ' ' + group.unit,
            min: group.min,
            max: group.min === group.max ? 1 : group.max
          },
          series: [
            { key: model.baselineKey, name: model.baseline, data: group.outcomes.map(function (outcome) { return outcomePoint(outcome, 0); }) },
            { key: variant.key, name: variant.name, data: group.outcomes.map(function (outcome) { return outcomePoint(outcome, index); }) }
          ]
        });
      });
      var combined = variant.changes.length > 1 ? 'Combined effect of ' + variant.changes.length + ' changed conditions. ' : '';
      status.textContent = combined + conditionText.join(' ') + ' ' + (changedText.join(' ') || 'No outcomes changed.');
      marker.hidden = !changedText.length;
    }

    table.before(visual);
    return {
      show: show,
      remove: function () {
        plots.forEach(function (plot) { DocForm.chart._remove(plot.host); });
        model.variants.forEach(function (variant) { if (variant.detail) variant.detail.hidden = false; });
        pill.destroy();
        visual.remove();
      },
      snapshot: function () {
        return { key: selected.key, label: selected.name, index: selected.index - 1, total: model.variants.length };
      }
    };
  }

  var EXPLANATION = 'A comparison needs a measure column, a unit column, a baseline, and named variants with numeric outcomes. Each variant must change exactly one marked condition, or at least one with data-df-scenarios="configurations".';
  var scenarios = new WeakMap();

  function supplyUncertainty(model, mapping, records, selected, parsed) {
    var data = DocForm._dataSource;
    var variants = selected.slice(1);
    var groups = new Map();
    model.groups.forEach(function (group) {
      group.outcomes.forEach(function (outcome) { groups.set(outcome.cells[0], { group: group, outcome: outcome }); });
    });
    mapping.outcomes.forEach(function (field, i) {
      var row = model.rows[mapping.conditions.length + i];
      var entry = groups.get(row.cells[0]);
      var outcome = entry.outcome;
      var at = 'Scenario outcome ' + JSON.stringify(field.field);
      var interval = data.interval(records, field.interval, parsed, at);
      var format = function (value) { return withUnit(outcome, String(value)); };
      outcome.intervals = selected.map(function (record, index) {
        var bounds = interval(record);
        if (!bounds) return;
        entry.group.min = Math.min(entry.group.min, bounds.lower);
        entry.group.max = Math.max(entry.group.max, bounds.upper);
        element('span', outcome.cells[index + 2], DocForm._interval.text(bounds, format)).className = 'df-scenarios-interval';
        return bounds;
      });

      var paired = field.pairedDifference;
      if (paired === undefined) return;
      if (!paired || typeof paired !== 'object' || Array.isArray(paired) || !data.key(paired.baselineKeyField)) {
        throw new Error(at + ' needs pairedDifference with a field and baselineKeyField.');
      }
      var pairedField = data.fields(variants, [paired.field], true)[0];
      var pairedInterval = data.interval(variants, paired.interval, parsed, at + ' paired difference');
      variants.forEach(function (record, index) {
        var value = record[pairedField];
        var bounds = pairedInterval(record);
        var variant = model.variants[index];
        var location = at + ', variant ' + JSON.stringify(variant.key);
        if (value === null && !bounds) return;
        if (!Number.isFinite(value)) throw new Error(location + ' needs a finite paired difference in ' + JSON.stringify(pairedField) + '.');
        if (!Object.hasOwn(record, paired.baselineKeyField) || data.key(record[paired.baselineKeyField]) !== model.baselineKey) {
          throw new Error(location + ' needs paired baseline ' + JSON.stringify(model.baselineKey) +
            ' in ' + JSON.stringify(paired.baselineKeyField) + '.');
        }
        var baseline = model.baseline === model.baselineKey ? model.baseline : model.baseline + ' (' + model.baselineKey + ')';
        var detail = element('span', outcome.cells[index + 3], 'Paired difference vs ' + baseline + ' ' + format(value));
        detail.className = 'df-scenarios-paired';
        if (bounds) element('span', detail, DocForm._interval.text(bounds, format)).className = 'df-scenarios-interval';
      });
    });
  }

  function mapTable(records, mapping, mode, parsed, authored) {
    var data = DocForm._dataSource;
    if (!data || !mapping || !Array.isArray(mapping.variantKeys) || !mapping.variantKeys.length ||
        !Array.isArray(mapping.conditions) || !Array.isArray(mapping.outcomes) || !mapping.outcomes.length ||
        !Object.hasOwn(MODES, mode)) throw new Error(EXPLANATION);
    var features = mapping.conditions.concat(mapping.outcomes);
    var fields = data.fields(records, [mapping.recordKey].concat(features.map(function (field) { return field && field.field; })));
    var byKey = new Map();
    records.forEach(function (record) {
      var key = data.key(record[fields[0]]);
      if (!key || byKey.has(key)) throw new Error('Scenario records need unique nonempty keys.');
      byKey.set(key, record);
    });
    var keys = [mapping.baselineKey].concat(mapping.variantKeys).map(data.key);
    if (new Set(keys).size !== keys.length || keys.some(function (key) { return !byKey.has(key); })) {
      throw new Error('Every baseline and variant key must identify a distinct record.');
    }
    var table = document.createElement('table');
    table.setAttribute('data-df-scenarios', mode);
    var header = table.createTHead().insertRow();
    element('th', header, 'Measure');
    element('th', header, 'Unit');
    keys.forEach(function (key) {
      var match = authored.find(function (cell) { return items.key(DocForm.data(cell, 'key')) === key; });
      var label = mapping.labels && Object.hasOwn(mapping.labels, key) ? mapping.labels[key] :
        match && sequence.label(match, match) || key;
      if (typeof label !== 'string' || !label.trim()) throw new Error('Use a nonempty scenario label.');
      var cell = element('th', header);
      element('span', cell, label).setAttribute('data-df-step-label', '');
      cell.setAttribute('data-df-key', key);
      var detail = match && DocForm.data(match, 'detail');
      if (detail) cell.setAttribute('data-df-detail', detail);
      if (mapping.initial === key || (mapping.initial === undefined && match && items.flag(match, 'initial', 'scenarios'))) {
        cell.setAttribute('data-df-initial', '');
      }
    });
    var body = table.createTBody();
    features.forEach(function (field, i) {
      if ((field.label !== undefined && typeof field.label !== 'string') ||
          (field.unit !== undefined && typeof field.unit !== 'string')) throw new Error('Scenario labels and units must be text.');
      var row = body.insertRow();
      if (i < mapping.conditions.length) row.setAttribute('data-df-condition', '');
      element('th', row, field.label ?? fields[i + 1]).setAttribute('scope', 'row');
      element('td', row, field.unit);
      keys.forEach(function (key) {
        var value = byKey.get(key)[fields[i + 1]];
        element('td', row, value === null ? '' : String(value));
      });
    });
    var model = read(table);
    if (model) supplyUncertainty(model, mapping, records, keys.map(function (key) { return byKey.get(key); }), parsed);
    return { table: table, model: model };
  }

  function mount(target, instance) {
    var runtime = DocForm._dataViews;
    var table = runtime.target(target);
    if (!table || table.tagName !== 'TABLE') return null;
    if (scenarios.has(table)) return scenarios.get(table);
    var data = DocForm._dataSource;
    var named = table.getAttribute('data-df-source') !== null;
    if (named && !data) { runtime.issue('scenarios', table, 'Enable data to use a named scenario source.'); return null; }
    var options = data ? data.options('scenarios', table, instance) : instance || {};
    var mode = table.getAttribute('data-df-scenarios') || options.mode || '';
    var caps = data ? DocForm._dataSource.limits(table, options) : null;
    var original = { model: read(table), sections: [table.tHead].concat(Array.from(table.tBodies)).filter(Boolean) };
    var authored = Array.from(table.tHead?.rows[0]?.cells || []).slice(2);
    var current = original;
    var visual;
    var domain = { keys: [], initial: 0 };
    var steps = sequence.indexed('scenarios', table, domain, function (index, previous, origin) {
      visual.show(current.model.variants[index]);
      if (!replacing) return function () { controller.change(origin); };
    });
    var replacing = false;
    function prepare(records, mapping, kind, parsed) {
      if (!Array.isArray(records) || records.length > caps.maxRows) throw new Error('Scenarios need records within the row limit.');
      var result = mapTable(records, mapping, kind, parsed, authored);
      if (!result.model) throw new Error(EXPLANATION);
      result.sections = [result.table.tHead].concat(Array.from(result.table.tBodies));
      return result;
    }
    var controller = runtime.controller('scenarios', table, {
      prepare: function (input) {
        if (!data) throw new Error('Enable data to replace scenario records.');
        var value = data.input({ type: 'value', value: input }, null, 0);
        if (value.bytes > caps.maxBytes) throw new Error('Scenarios exceed this table’s size limit.');
        var payload = value.snapshot.value;
        return Array.isArray(payload) ? prepare(payload, options.mapping, mode) :
          prepare(payload.records, payload.mapping, payload.mode ?? mode);
      },
      render: function (prepared, origin) {
        var previous = visual && visual.snapshot();
        if (visual) visual.remove();
        visual = null;
        prepared = prepared || original;
        if (current !== prepared) {
          current.sections.forEach(function (section) { section.remove(); });
          prepared.sections.forEach(function (section) { table.appendChild(section); });
          current = prepared;
        }
        var model = prepared.model;
        domain.keys = model ? model.domain.keys : [];
        domain.initial = model ? model.domain.initial : 0;
        if (model) visual = draw(table, model, steps);
        replacing = true;
        try { return steps.replace(origin !== 'reset' && previous ? previous.key : null, origin); }
        finally { replacing = false; }
      },
      snapshot: function () { return visual ? visual.snapshot() : null; },
      resetReader: true
    });
    scenarios.set(table, controller.api);
    if (named) data.binding('scenarios', table, options, function (records, mapping, input, spec) {
      return spec ? prepare(records.records, records.mapping, records.mode ?? mode) :
        prepare(records, mapping, mode, records === input.snapshot.value ? input.parsed : null);
    }).mount(controller);
    else if (original.model) controller.start(original);
    else runtime.issue('scenarios', table, EXPLANATION);
    return controller.api;
  }

  DocForm.scenarios = {
    mount: mount,
    get: function (target) { return scenarios.get(DocForm._dataViews.target(target)) || null; }
  };

  items.scan('scenarios', function () {
    DocForm.all('table[data-df-scenarios]').forEach(function (table) {
      var model = read(table);
      var data = DocForm._dataSource;
      var mapping = data && table.hasAttribute('data-df-source') && data.options('scenarios', table).mapping;
      if (!mapping || !Array.isArray(mapping.variantKeys)) {
        if (model) items.collect('scenarios', table, model.domain);
        return;
      }
      var keys = mapping.variantKeys.map(data.key);
      var authored = model && model.domain.keys[model.domain.initial];
      var initial = Math.max(0, keys.indexOf(data.key(mapping.initial ?? authored)));
      items.collect('scenarios', table, { keys: keys, initial: initial,
        items: keys.map(function () { return table; }) });
    });
  });

  DocForm.register('scenarios', function () {
    var tables = DocForm.all('table[data-df-scenarios]');
    if (tables.length && !DocForm.chart) {
      DocForm.warnOnce('scenarios:chart', 'scenarios.js needs chart.js for interactive comparisons.');
      return;
    }
    tables.forEach(function (table) { mount(table); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
