const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const core = readFileSync(join(__dirname, '../offprint/js/core.js'), 'utf8');
const source = readFileSync(join(__dirname, '../offprint/js/stepper.js'), 'utf8');

function element(tag, attrs = {}, children = []) {
  const attributes = new Map(Object.entries(attrs));
  const node = Object.assign(new EventTarget(), {
    tag, nodeType: 1,
    id: attrs.id || '',
    children,
    classList: new Set(),
    textContent: '',
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    toggleAttribute: (name, on) => on ? attributes.set(name, '') : attributes.delete(name),
    appendChild: (child) => children.push(child),
    querySelector(selector) {
      assert.equal(selector, ':scope > [data-op-step-label]');
      return children.find((child) => child.getAttribute('data-op-step-label') !== null);
    },
    before(sibling) { this.controls = sibling; },
    click() { this.dispatchEvent(new Event('click')); }
  });
  return Object.defineProperty(node, 'hidden', {
    get: () => attributes.has('hidden'),
    set: (on) => node.toggleAttribute('hidden', on)
  });
}

function sequence(id, ...keys) {
  return element('ol', { id }, keys.map((key) => {
    const name = element('strong', { 'data-op-step-label': '' });
    name.textContent = key;
    return element('li', { 'data-op-key': key }, [name]);
  }));
}

function view(tag, id, key) {
  return element(tag, { 'data-op-stepper-view': id, 'data-op-key': key });
}

function setup(lists, views = []) {
  const warnings = [];
  const boot = { canInitialize: () => true, report: (_, feature, host, message) => warnings.push(message),
    moduleFailed: (_, error) => { throw error; } };
  const OffPrint = { _boot: boot };
  const all = (selector, list) => {
      switch (selector) {
        case 'ol[data-op-stepper]': return lists;
        case '[data-op-stepper-view][data-op-key]': return views;
        case ':scope > li': return list.children.filter((child) => child.tag === 'li');
        default: throw new Error(`Unexpected selector ${selector}`);
      }
  };
  const context = vm.createContext({
    OffPrint,
    CustomEvent,
    document: {
      createElement: element,
      getElementById: (id) => lists.find((list) => list.id === id) ?? null
    }
  });
  vm.runInContext(core, context);
  OffPrint._all = all;
  vm.runInContext(source, context);
  return { start: boot.initialize, stepper: OffPrint.sequence, warnings };
}

test('controls stop at both boundaries and Reset restores the initial step and linked results', () => {
  const list = sequence('sum', 'Inputs', 'Add', 'Check');
  const intro = view('p', 'sum', 'Inputs');
  const firstRow = view('tr', 'sum', 'Inputs');
  const finalRow = view('tr', 'sum', 'Check');
  const figure = view('g', 'sum', 'Check');
  const views = [intro, firstRow, finalRow, figure];
  const { start, stepper } = setup([list], views);
  const changes = [];
  const viewVisibility = () => views.map((node) => node.getAttribute('hidden') === null);
  list.addEventListener('op:step', (event) => {
    const { index, key, origin } = event.detail;
    const { count } = stepper.get(list).snapshot();
    assert.equal(origin, changes.length ? 'user' : 'init');
    assert.equal(event.bubbles, true);
    assert.deepEqual(Object.keys(event.detail), ['key', 'index', 'origin']);
    assert.equal(list.children[index].getAttribute('aria-current'), 'step');
    assert.equal(list.controls.children[2].textContent, `Step ${index + 1} of ${count}`);
    changes.push({ index, key, visible: viewVisibility() });
  });

  assert.deepEqual(viewVisibility(), [true, true, true, true]);
  assert.equal(list.controls, undefined);
  start();
  const [reset, previous, status, next] = list.controls.children;
  const isDisabled = (button) => button.getAttribute('aria-disabled') === 'true';
  const disabled = () => [previous, next, reset].map(isDisabled);
  assert.equal(list.controls.getAttribute('role'), 'group');
  assert.equal(status.getAttribute('role'), 'status');
  assert.deepEqual([previous, next, reset].map((button) => button.getAttribute('aria-label')), ['Previous step', 'Next step', 'Reset']);
  for (const button of [previous, next, reset]) {
    assert.equal(button.tag, 'button');
    assert.equal(button.type, 'button');
    assert.equal(button.title, button.getAttribute('aria-label'));
    assert.match(button.innerHTML, /^<svg [^>]*aria-hidden="true"/);
    assert.equal(button.getAttribute('aria-controls'), 'sum');
  }
  assert.deepEqual(disabled(), [true, false, true]);
  previous.click();
  reset.click();
  next.click();
  assert.deepEqual(disabled(), [false, false, false]);
  next.click();
  assert.deepEqual(disabled(), [false, true, false]);
  next.click();
  assert.deepEqual(list.children.map((step) => step.hidden), [true, true, false]);
  previous.click();
  next.click();
  reset.click();

  assert.deepEqual(disabled(), [true, false, true]);
  assert.deepEqual(list.children.map((step) => step.hidden), [false, true, true]);
  assert.deepEqual(list.children.map((step) => step.getAttribute('aria-current')), ['step', null, null]);
  assert.deepEqual(changes, [
    { index: 0, key: 'Inputs', visible: [true, true, false, false] },
    { index: 1, key: 'Add', visible: [false, false, false, false] },
    { index: 2, key: 'Check', visible: [false, false, true, true] },
    { index: 1, key: 'Add', visible: [false, false, false, false] },
    { index: 2, key: 'Check', visible: [false, false, true, true] },
    { index: 0, key: 'Inputs', visible: [true, true, false, false] }
  ]);
});

test('steppers with the same keys update only their own views', () => {
  const first = sequence('first', 'Inputs', 'Check');
  const second = sequence('second', 'Inputs', 'Check');
  const firstView = view('p', 'first', 'Check');
  const secondView = view('p', 'second', 'Check');
  const { start, stepper } = setup([first, second], [firstView, secondView]);
  start();

  first.controls.children[3].click();
  assert.equal(stepper.get(first).snapshot().key, 'Check');
  assert.equal(stepper.get(second).snapshot().key, 'Inputs');
  assert.equal(firstView.getAttribute('hidden'), null);
  assert.equal(secondView.getAttribute('hidden'), '');
});

test('a single step stays visible and an ambiguous sequence stays readable', () => {
  const single = sequence('single', 'Start');
  const invalid = sequence('invalid', 'Start', 'Start');
  const { start, stepper, warnings } = setup([single, invalid]);
  start();

  for (const control of single.controls.children.filter((child) => child.tag === 'button')) {
    assert.equal(control.getAttribute('aria-disabled'), 'true');
    control.click();
  }
  assert.equal(stepper.get(single).snapshot().key, 'Start');
  assert.equal(single.children[0].hidden, false);
  assert.equal(stepper.get(invalid), null);
  assert.equal(invalid.controls, undefined);
  assert.ok(invalid.children.every((step) => !step.hidden));
  assert.equal(warnings.length, 1);
});

test('select jumps to a named step through the same update as the controls', () => {
  const list = sequence('trace', 'send', 'retry', 'late');
  const row = view('tr', 'trace', 'late');
  const { start, stepper, warnings } = setup([list], [row]);
  assert.equal(stepper.get('trace'), null, 'nothing to select before setup');
  start();
  const changes = [];
  list.addEventListener('op:step', (event) => changes.push(event.detail.key));
  const [reset, previous, , next] = list.controls.children;

  assert.equal(stepper.get('trace').select('late'), true);
  assert.equal(stepper.get(list).select('late'), true);
  assert.deepEqual(list.children.map((step) => step.hidden), [true, true, false]);
  assert.equal(row.getAttribute('hidden'), null);
  assert.deepEqual([previous, next, reset].map((b) => b.getAttribute('aria-disabled')), ['false', 'true', 'false']);
  assert.equal(stepper.get('trace').select('missing'), false);
  assert.equal(stepper.get('trace').snapshot().key, 'late');
  previous.click();
  assert.deepEqual(changes, ['late', 'retry'], 'reselecting the current step sends no change');
  assert.equal(warnings.length, 0);
});
