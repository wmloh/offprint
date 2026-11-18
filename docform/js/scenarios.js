// Compare the first scenario column with one variant from the same authored table.
// Strict mode allows one changed condition per variant; "configurations" allows several.
(function (root) {
  'use strict';

  var DocForm = root.DocForm;
  if (!DocForm) {
    if (typeof console !== 'undefined') console.warn('[docform] scenarios.js needs core.js loaded before it.');
    return;
  }

  function text(cell) {
    return cell.textContent.trim().replace(/\s+/g, ' ');
  }

  var MODES = { '': 'single', configurations: 'configurations' };

  function read(table) {
    var mode = MODES[(table.getAttribute('data-df-scenarios') || '').trim()];
    if (!mode) return null;
    var heads = DocForm.all(':scope > thead > tr', table);
    if (heads.length !== 1) return null;
    var columns = Array.from(heads[0].cells);
    var names = columns.slice(2).map(text);
    var rows = DocForm.all(':scope > tbody > tr', table);
    var conditions = [];
    var groups = new Map();
    if (table.tFoot || names.length < 2 || names.includes('') || new Set(names).size !== names.length) return null;
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
      return { name: name, index: index, changes: changed };
    });
    var valid = function (variant) {
      return mode === 'configurations' ? variant.changes.length > 0 : variant.changes.length === 1;
    };
    if (!groups.size || !variants.every(valid)) return null;
    return { mode: mode, columns: columns, rows: rows, baseline: names[0], groups: groups, variants: variants };
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

  function setup(table) {
    var model = read(table);
    if (!model) {
      DocForm.warnOnce('scenarios:markup', 'A comparison needs a measure column, a unit column, a baseline, and named variants with numeric outcomes. Each variant must change exactly one marked condition, or at least one with data-df-scenarios="configurations".', table);
      return;
    }

    var visual = document.createElement('div');
    visual.className = 'df-scenarios-visual';
    var controls = element('div', visual);
    controls.className = 'df-scenarios-controls';
    var label = element('label', controls, 'Variant');
    var select = element('select', label);
    model.variants.forEach(function (variant) {
      element('option', select, variant.name).value = variant.index;
    });
    var reset = element('button', controls, 'Reset');
    reset.type = 'button';

    var conditionList = null;
    if (model.mode === 'configurations') {
      element('p', visual, 'Changed conditions').className = 'df-scenarios-heading';
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

    function show(variant) {
      var index = variant.index;
      select.value = index;
      reset.setAttribute('aria-disabled', String(index === 1));
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
        DocForm.chart(plot.host, {
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
            { name: model.baseline, data: group.outcomes.map(function (outcome) { return outcome.numbers[0]; }) },
            { name: variant.name, data: group.outcomes.map(function (outcome) { return outcome.numbers[index]; }) }
          ]
        });
      });
      var combined = variant.changes.length > 1 ? 'Combined effect of ' + variant.changes.length + ' changed conditions. ' : '';
      status.textContent = combined + conditionText.join(' ') + ' ' + (changedText.join(' ') || 'No outcomes changed.');
      marker.hidden = !changedText.length;
    }

    select.addEventListener('change', function () {
      var variant = model.variants[select.selectedIndex];
      if (variant) show(variant);
    });
    reset.addEventListener('click', function () {
      if (select.selectedIndex !== 0) show(model.variants[0]);
    });
    table.before(visual);
    show(model.variants[0]);
  }

  DocForm.register('scenarios', function () {
    var tables = DocForm.all('table[data-df-scenarios]');
    if (!tables.length) return;
    if (!DocForm.chart) {
      DocForm.warnOnce('scenarios:chart', 'scenarios.js needs chart.js for interactive comparisons.');
      return;
    }
    tables.forEach(setup);
  });
})(typeof window !== 'undefined' ? window : globalThis);
