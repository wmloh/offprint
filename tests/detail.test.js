const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');

function element(attrs = {}, children = []) {
  const attributes = new Map(Object.entries(attrs));
  const classes = new Set();
  return Object.assign(new EventTarget(), {
    id: attrs.id || '',
    children,
    parentElement: null,
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value))
  });
}

function setup({ follow, group, initial } = {}) {
  const details = ['raw', 'clean', 'report'].map((key) => element({ 'data-df-key': key, ...(key === initial ? { 'data-df-initial': '' } : {}) }));
  const pane = element({ ...(follow ? { 'data-df-detail-for': follow } : {}), ...(group ? { 'data-df-selection-group': group } : {}) }, details);
  pane.id = 'pane';
  const source = element();
  const warnings = [];
  const boot = { canInitialize: () => true, report: (_, feature, host, message) => warnings.push(message), moduleFailed: (_, error) => { throw error; } };
  const document = { readyState: 'interactive', getElementById: (id) => ({ flow: source, pane })[id] ?? null };
  const DocForm = { _boot: boot };
  const context = vm.createContext({ DocForm, document, CustomEvent, getComputedStyle: () => ({}) });
  vm.runInContext(read('core.js'), context);
  DocForm._all = (selector) => selector === '.df-detail-pane' ? [pane] : [];
  vm.runInContext(read('detail.js'), context);
  boot.initialize();
  return { DocForm, pane, details, source, warnings, shown: () => details.findIndex((d) => !d.inert) };
}

function keyed(start) {
  const listeners = new Set();
  let state = start ? { key: start } : null;
  return {
    snapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    set: (key) => { state = { key }; listeners.forEach((fn) => fn(state)); }
  };
}

test('a pane starts on its initial child and keeps the last detail for unknown keys', () => {
  const { DocForm, pane, details, shown, warnings } = setup({ initial: 'clean' });
  const controller = DocForm._detailPane.get(pane);
  assert.deepEqual(warnings, []);
  assert.equal(shown(), 1);
  assert.equal(details[0].getAttribute('tabindex'), '0');
  assert.equal(controller.show('report'), true);
  assert.equal(shown(), 2);
  assert.equal(controller.show('missing'), false);
  assert.equal(shown(), 2);
  assert.equal(controller.snapshot().key, 'report');
  assert.equal(controller.snapshot().detailId, details[2].id);
});

test('a pane follows a keyed source registered before or after it', () => {
  const late = setup({ follow: 'flow' });
  const source = keyed('report');
  late.DocForm._detail.source(late.source, source);
  assert.equal(late.shown(), 2);
  source.set('raw');
  assert.equal(late.shown(), 0);
  const events = [];
  late.pane.addEventListener('df:detail-pane:change', (event) => events.push(event.detail.current.key));
  source.set('clean');
  assert.deepEqual(events, ['clean']);
});

test('a pane reports a missing source or an unavailable selection group', () => {
  assert.match(setup({ follow: 'nowhere' }).warnings.join(), /missing element/);
  assert.match(setup({ group: 'trace' }).warnings.join(), /unavailable selection group/);
});
