const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docform/js/steps.js'), 'utf8');

function element(attrs = {}, parentElement = null) {
  const attributes = new Map(Object.entries(attrs));
  const classList = new Set();
  classList.toggle = (name, on) => on ? classList.add(name) : classList.delete(name);
  return Object.assign(new EventTarget(), {
    parentElement,
    classList,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  });
}

function setup({ list = false, late = false, descriptions = false } = {}) {
  const figure = Object.assign(element(), { id: 'example' });
  const panel = Object.assign(element(), {
    clientWidth: 192, offsetWidth: 200, clientHeight: 80, scrollHeight: 120, clientLeft: 0,
    getBoundingClientRect: () => ({ left: 20, right: 220 })
  });
  const details = descriptions ? ['first', 'second', 'third'].map((id) => Object.assign(element(), { id })) : [];
  const buttons = ['0', '', '4'].map((value, index) => element({
    'data-df-step': value, 'data-df-step-detail': details[index]?.id
  }, list ? element() : panel));
  const children = {
    ':scope > figure': figure,
    ':scope > .df-step-panel': panel,
    ':scope > .df-step-details': descriptions ? { children: details } : null
  };
  const box = Object.assign(element(), { querySelector: (selector) => children[selector] });
  const go = [];
  const visited = [];
  let controller = late ? null : { go: (step) => go.push(step) };
  figure.addEventListener('df:figurestep', (event) => visited.push([event.detail.index, event.detail.step]));

  const view = new EventTarget();
  const DocForm = {
    all: (_, scope) => scope === panel ? buttons : [box],
    anim: { get: () => controller },
    register: (_, init) => init()
  };
  const context = vm.createContext({
    DocForm,
    CustomEvent,
    document: { readyState: 'interactive', getElementById: (id) => id === figure.id ? figure : null },
    getComputedStyle: () => ({ direction: 'ltr' }),
    addEventListener: view.addEventListener.bind(view)
  });
  vm.runInContext(source, context);

  function loadAnimation() {
    controller = { go: (step) => go.push(step) };
    view.dispatchEvent(new Event('load'));
  }

  return { figure, panel, buttons, details, go, visited, loadAnimation, select: DocForm.steps.select };
}

function pointer(target, type, pointerType, clientX) {
  target.dispatchEvent(Object.assign(new Event(type), { pointerType, clientX }));
}

test('hover selects a listed step and leaves the selected marker and figure in sync', () => {
  const { figure, panel, buttons, go, visited } = setup({ list: true });
  assert.equal(buttons[0].getAttribute('aria-current'), 'step');
  assert.equal(buttons[2].getAttribute('aria-controls'), 'example');

  pointer(buttons[2].parentElement, 'pointerenter', 'mouse');
  panel.dispatchEvent(new Event('scroll'));
  assert.deepEqual(go, [0]);

  pointer(buttons[2].parentElement, 'pointermove', 'mouse');
  pointer(buttons[2].parentElement, 'pointermove', 'mouse');
  pointer(buttons[2].parentElement, 'pointerleave', 'mouse');
  assert.equal(buttons[0].getAttribute('aria-current'), null);
  assert.equal(buttons[2].getAttribute('aria-current'), 'step');
  assert.equal(figure.getAttribute('data-df-active-step'), '4');
  assert.deepEqual(go, [0, 4]);
  assert.deepEqual(visited, [[0, 0], [2, 4]]);
});

test('keyboard focus and tap select cards while swiping leaves the current step alone', () => {
  const { buttons, go } = setup();
  buttons[1].dispatchEvent(new Event('focus'));
  buttons[1].dispatchEvent(new Event('blur'));
  pointer(buttons[2], 'pointermove', 'touch');
  assert.equal(buttons[1].getAttribute('aria-current'), 'step');
  assert.deepEqual(go, [0, 2]);

  buttons[2].dispatchEvent(new Event('click'));
  pointer(buttons[0], 'pointermove', 'pen');
  assert.deepEqual(go, [0, 2, 4, 0]);
});

test('an animation available only at page load shows the latest selection', () => {
  const { buttons, go, visited, loadAnimation } = setup({ late: true });
  buttons[2].dispatchEvent(new Event('click'));
  assert.deepEqual(go, []);
  loadAnimation();
  assert.deepEqual(go, [4]);
  assert.deepEqual(visited, [[0, 0], [2, 4]]);
});

test('a custom visualization can select a step by figure or id and share its selected detail', () => {
  const { figure, buttons, details, go, visited, select } = setup({ descriptions: true });
  const inert = () => details.map((detail) => detail.inert);
  assert.deepEqual(inert(), [false, true, true]);
  assert.equal(buttons[2].getAttribute('aria-describedby'), 'third');

  figure.addEventListener('df:figurestep', (event) => select(figure, event.detail.step));
  assert.equal(select('example', 4), true);
  assert.deepEqual(inert(), [true, true, false]);
  assert.equal(buttons[2].getAttribute('aria-current'), 'step');
  assert.equal(figure.getAttribute('data-df-active-step'), '4');
  assert.equal(select('missing', 2), false);
  assert.equal(select(figure, 3), false);
  assert.deepEqual(visited, [[0, 0], [2, 4]]);

  buttons[1].dispatchEvent(new Event('focus'));
  assert.deepEqual(inert(), [true, false, true]);
  assert.deepEqual(go, [0, 4, 2]);
});

test('an overflowing panel reveals its scrollbar at the track and hides it outside that area', () => {
  const { panel } = setup();
  const visible = () => panel.classList.has('df-step-scrollbar-hover');
  pointer(panel, 'pointermove', 'mouse', 150);
  assert.equal(visible(), false);
  pointer(panel, 'pointermove', 'mouse', 215);
  assert.equal(visible(), true);
  pointer(panel, 'pointerleave', 'mouse');
  assert.equal(visible(), false);
  pointer(panel, 'pointermove', 'touch', 215);
  assert.equal(visible(), false);
  panel.scrollHeight = panel.clientHeight;
  pointer(panel, 'pointermove', 'mouse', 215);
  assert.equal(visible(), false);
});
