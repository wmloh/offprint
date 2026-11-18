const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const sources = ['chart.js', 'scenarios.js'].map((file) => readFileSync(join(__dirname, '../docform/js', file), 'utf8'));

function node(tag, text = '', children = []) {
  const attrs = new Map();
  const classes = new Set();
  const el = Object.assign(new EventTarget(), {
    tagName: tag.toUpperCase(), children, hidden: false, value: '', colSpan: 1, rowSpan: 1, clientWidth: 640,
    classList: {
      add: (name) => classes.add(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    style: { setProperty() {} },
    setAttribute: (name, value) => attrs.set(name, String(value)),
    getAttribute: (name) => attrs.get(name) ?? null,
    hasAttribute: (name) => attrs.has(name),
    removeAttribute: (name) => attrs.delete(name),
    appendChild(child) { this.insertBefore(child, null); },
    insertBefore(child, anchor) {
      child.parentNode = this;
      children.splice(anchor ? children.indexOf(anchor) : children.length, 0, child);
    },
    replaceChild(child, old) {
      child.parentNode = this;
      children.splice(children.indexOf(old), 1, child);
    },
    before(sibling) { this.parentNode.insertBefore(sibling, this); },
    click() { this.dispatchEvent(new Event('click')); }
  });
  return Object.defineProperties(el, {
    firstChild: { get: () => children[0] ?? null },
    cells: { get: () => children },
    selectedIndex: { get: () => children.findIndex((option) => option.value === el.value) },
    textContent: {
      get: () => text + children.map((child) => child.textContent).join(''),
      set(value) { text = value; children.length = 0; }
    }
  });
}

function row(values, condition = false, head = false) {
  const tr = node('tr', '', values.map((value, i) => node(head || !i ? 'th' : 'td', value)));
  if (condition) tr.setAttribute('data-df-condition', '');
  return tr;
}

function fixture(threshold = '20') {
  const head = row(['Measure', 'Unit', 'Baseline', 'Higher threshold', 'Longer window', 'Small adjustment'], false, true);
  const rows = [
    row(['Threshold', '%', '20', '25', threshold, '21'], true),
    row(['Window', 's', '5', '5', '10', '5'], true),
    row(['False alarms', 'alerts', '6', '2', '9', '6']),
    row(['Lead time', 's', '-2', '−3', '10', '-2.0']),
    row(['Missed alerts', 'alerts', '1', '1', '4', '1'])
  ];
  const table = node('table');
  table.appendChild(node('thead', '', [head]));
  table.appendChild(node('tbody', '', rows));
  return { table, head, rows };
}

function setup({ table }, withChart = true) {
  const page = node('main');
  page.appendChild(table);
  const warnings = [];
  const modules = new Map();
  const DocForm = {
    all(selector, el) {
      switch (selector) {
        case 'table[data-df-scenarios]': return [table];
        case ':scope > thead > tr': return el.children[0].children;
        case ':scope > tbody > tr': return el.children[1].children;
        case '.is-active': return [];
        default: throw new Error(`Unexpected selector ${selector}`);
      }
    },
    warnOnce: (_, message) => warnings.push(message),
    register: (name, start) => modules.set(name, start)
  };
  const context = vm.createContext({ DocForm, document: { createElement: node, createElementNS: (_, tag) => node(tag) } });
  if (withChart) vm.runInContext(sources[0], context);
  vm.runInContext(sources[1], context);
  return { page, chart: DocForm.chart, warnings, start: modules.get('scenarios') };
}

function descendants(el) {
  return el.children.flatMap((child) => [child, ...descendants(child)]);
}

test('selecting and resetting variants keeps baseline geometry and highlights the changed values', () => {
  const data = fixture();
  const { page, chart, start, warnings } = setup(data);
  const columns = [data.head, ...data.rows];
  const visible = () => columns.map((tr) => tr.cells.flatMap((cell, i) => cell.hidden ? [] : [i]));
  assert.deepEqual(page.children, [data.table]);
  assert.ok(visible().every((indices) => indices.length === 6));
  start();

  const [controls, status, key, alerts, seconds] = page.firstChild.children;
  const [label, reset] = controls.children;
  const select = label.firstChild;
  const selectVariant = (index) => {
    select.value = select.children[index].value;
    select.dispatchEvent(new Event('change'));
  };
  const metricCells = (column) => data.rows.filter((tr) => tr.cells[column].hasAttribute('data-df-scenario-difference'));
  const markerCount = (host) => descendants(host).filter((el) => el.tagName === 'TEXT' && el.textContent === '*').length;
  const paths = (host) => descendants(host).filter((el) => el.tagName === 'PATH').map((el) => el.getAttribute('d'));
  const body = (host) => chart.get(host).model();
  const axis = (host) => [body(host).y.min, body(host).y.max, ...body(host).categories];
  const baselinePaths = [paths(alerts).slice(0, 2), paths(seconds).slice(0, 1)];

  assert.equal(status.getAttribute('role'), 'status');
  assert.match(status.textContent, /Threshold changed from 20% to 25%\. False alarms changed from 6 alerts to 2 alerts\. Lead time changed/);
  assert.deepEqual(axis(alerts), [0, 9, 'False alarms', 'Missed alerts']);
  assert.deepEqual(axis(seconds), [-3, 10, 'Lead time']);
  assert.deepEqual(metricCells(3), [data.rows[0], data.rows[2], data.rows[3]]);
  assert.equal(markerCount(alerts), 1);
  assert.ok(visible().every((indices) => indices.join() === '0,1,2,3'));
  assert.ok([alerts, seconds].every((host) => host.firstChild.children[1].children.at(-1).hidden), 'the Table toggle is hidden');

  selectVariant(1);
  assert.equal(body(alerts).series[1].name, 'Longer window');
  assert.deepEqual([paths(alerts).slice(0, 2), paths(seconds).slice(0, 1)], baselinePaths);
  assert.deepEqual(axis(alerts), [0, 9, 'False alarms', 'Missed alerts']);
  assert.deepEqual(axis(seconds), [-3, 10, 'Lead time']);
  assert.equal(markerCount(alerts), 2);
  assert.deepEqual(metricCells(3), []);
  assert.deepEqual(metricCells(4), data.rows.slice(1));
  assert.match(status.textContent, /Window changed from 5 s to 10 s/);
  assert.ok(visible().every((indices) => indices.join() === '0,1,2,4'));

  selectVariant(2);
  assert.match(status.textContent, /Threshold changed from 20% to 21%\. No outcomes changed\./);
  assert.equal(key.hidden, true);
  assert.equal(markerCount(seconds), 0);
  assert.deepEqual(metricCells(5), [data.rows[0]]);
  reset.click();
  assert.equal(select.selectedIndex, 0);
  assert.equal(reset.getAttribute('aria-disabled'), 'true');
  assert.equal(body(alerts).series[1].name, 'Higher threshold');
  assert.equal(key.hidden, false);
  assert.ok(visible().every((indices) => indices.join() === '0,1,2,3'));
  assert.deepEqual(warnings, []);
});

test('tables remain intact when a variant changes two conditions or the chart script is absent', () => {
  for (const [data, withChart] of [[fixture('25'), true], [fixture(), false]]) {
    const { page, start, warnings } = setup(data, withChart);
    start();
    assert.deepEqual(page.children, [data.table]);
    assert.ok([data.head, ...data.rows].every((tr) => tr.cells.every((cell) => !cell.hidden)));
    assert.equal(warnings.length, 1);
  }
});

test('configuration mode lists and marks every changed condition and resets to the first variant', () => {
  const data = fixture('25');
  data.table.setAttribute('data-df-scenarios', 'configurations');
  const { page, chart, start, warnings } = setup(data);
  start();

  const [controls, heading, list, status, , alerts] = page.firstChild.children;
  const [label, reset] = controls.children;
  const select = label.firstChild;
  const items = () => list.children.map((li) => li.textContent);
  const marked = (column) => data.rows.filter((tr) => tr.cells[column].hasAttribute('data-df-scenario-difference'));
  assert.equal(heading.textContent, 'Changed conditions');
  assert.deepEqual(items(), ['Threshold: 20% → 25%']);
  assert.doesNotMatch(status.textContent, /Combined/);

  select.value = select.children[1].value;
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(items(), ['Threshold: 20% → 25%', 'Window: 5 s → 10 s']);
  assert.match(status.textContent, /^Combined effect of 2 changed conditions\. Threshold changed from 20% to 25%\. Window changed from 5 s to 10 s\. False alarms changed/);
  assert.deepEqual(marked(4), data.rows);
  assert.deepEqual(chart.get(alerts).model().y.max, 9);

  reset.click();
  assert.equal(select.selectedIndex, 0);
  assert.deepEqual(items(), ['Threshold: 20% → 25%']);
  assert.deepEqual(marked(4), []);
  assert.deepEqual(warnings, []);
});

test('configuration mode still rejects unchanged variants and unknown modes', () => {
  const unchanged = fixture();
  unchanged.rows[0].cells[5].textContent = '20';
  unchanged.table.setAttribute('data-df-scenarios', 'configurations');
  const unknown = fixture('25');
  unknown.table.setAttribute('data-df-scenarios', 'bundles');
  for (const data of [unchanged, unknown]) {
    const { page, start, warnings } = setup(data);
    start();
    assert.deepEqual(page.children, [data.table]);
    assert.equal(warnings.length, 1);
  }
});
