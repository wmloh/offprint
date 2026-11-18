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
  const el = Object.assign(new EventTarget(), {
    parentElement,
    classList,
    childNodes: [],
    style: {},
    offsetLeft: 0,
    offsetTop: 0,
    offsetHeight: 32,
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    append: (...nodes) => nodes.forEach((node) => {
      const from = node.parentNode?.childNodes;
      if (from) from.splice(from.indexOf(node), 1);
      node.parentNode = el;
      el.childNodes.push(node);
    }),
    insertBefore: (node) => el.childNodes.unshift(node),
    cloneNode: () => Object.assign(element(Object.fromEntries(attributes)), { childNodes: [...el.childNodes] }),
    querySelectorAll: () => []
  });
  return el;
}

const fakeDocument = (ids = {}) => ({
  readyState: 'interactive',
  getElementById: (id) => ids[id] ?? null,
  createElement: () => element()
});

function scrollport(attrs = {}) {
  return Object.assign(element(attrs), {
    clientWidth: 192, offsetWidth: 200, clientHeight: 80, scrollHeight: 120, clientLeft: 0,
    getBoundingClientRect: () => ({ left: 20, right: 220 })
  });
}

function setup({ list = false, headed = false, late = false, descriptions = false } = {}) {
  const figure = Object.assign(element(), { id: 'example' });
  const panel = scrollport();
  const cardList = headed ? scrollport() : panel;
  panel.querySelector = (selector) => selector === ':scope > .df-step-list' && headed ? cardList : null;
  const details = descriptions ? ['first', 'second', 'third'].map((id) => Object.assign(scrollport(), { id })) : [];
  const buttons = ['0', '', '4'].map((value, index) => element({
    'data-df-step': value, 'data-df-step-detail': details[index]?.id
  }, list ? element() : cardList));
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
    all: (selector, scope) => scope === cardList ? buttons : selector === '.df-figure-steps' ? [box] : [],
    warnOnce: assert.fail,
    anim: { get: () => controller },
    register: (_, init) => init()
  };
  const context = vm.createContext({
    DocForm,
    CustomEvent,
    document: fakeDocument({ [figure.id]: figure }),
    getComputedStyle: () => ({ direction: 'ltr' }),
    addEventListener: view.addEventListener.bind(view)
  });
  vm.runInContext(source, context);

  function loadAnimation() {
    controller = { go: (step) => go.push(step) };
    view.dispatchEvent(new Event('load'));
  }

  return { figure, panel, cardList, buttons, details, go, visited, loadAnimation, select: DocForm.steps.select };
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

test('a headed selector and its active detail have separate scrollports', () => {
  const { panel, cardList, details, buttons } = setup({ headed: true, descriptions: true });
  const visible = (el) => el.classList.has('df-step-scrollbar-hover');
  assert.equal(panel.classList.has('df-step-scrollport'), false);
  assert.equal(details[0].getAttribute('tabindex'), '0');

  pointer(cardList, 'pointermove', 'mouse', 215);
  assert.equal(visible(cardList), true);
  assert.equal(visible(details[0]), false);
  pointer(cardList, 'pointerleave', 'mouse');
  pointer(details[0], 'pointermove', 'mouse', 215);
  assert.equal(visible(cardList), false);
  assert.equal(visible(details[0]), true);

  buttons[1].dispatchEvent(new Event('focus'));
  assert.equal(buttons[1].getAttribute('aria-current'), 'step');
  assert.equal(details[1].inert, false);
  assert.equal(details[0].inert, true);
  assert.equal(visible(details[1]), false);
});

function cardPanel(id) {
  const details = ['one', 'two', 'three'].map((name) => Object.assign(scrollport(), { id: `${id}-${name}` }));
  const list = scrollport({ 'aria-labelledby': `${id}-heading` });
  const buttons = details.map((detail) => element({ 'data-df-card': detail.id }, list));
  const panel = { querySelector: (selector) => selector === ':scope > .df-step-list' ? list : null };
  const children = {
    ':scope > .df-step-panel': panel,
    ':scope > .df-step-details': { children: details }
  };
  const box = Object.assign(element(), { querySelector: (selector) => children[selector] });
  return { box, list, buttons, details };
}

function setupCards(panels, tabSets = []) {
  let focused;
  function focus(button) {
    if (focused === button) return;
    focused?.dispatchEvent(Object.assign(new Event('blur'), { relatedTarget: button }));
    focused = button;
    focused?.dispatchEvent(new Event('focus'));
  }

  panels.flatMap((panel) => panel.buttons).forEach((button) => { button.focus = () => focus(button); });
  const warnings = [];
  const DocForm = {
    all: (selector, scope) => {
      if (selector === '.df-card-panel') return panels.map((panel) => panel.box);
      if (selector === '.df-tabs, [data-df-tabs]') return tabSets;
      assert.ok(selector === '.df-figure-steps' ||
        selector === ':scope > button[data-df-card], :scope > .df-step-group > button[data-df-card]');
      return panels.find((panel) => panel.list === scope)?.buttons ?? [];
    },
    data: (el, name, fallback) => el.getAttribute(`data-df-${name}`) ?? fallback,
    flag: (el, name) => el.hasAttribute(`data-df-${name}`),
    warnOnce: (key) => warnings.push(key),
    register: (_, init) => init()
  };
  const document = Object.assign(fakeDocument(), {
    createElement: () => {
      const children = [];
      return Object.assign(element(), { children, appendChild: (child) => children.push(child) });
    }
  });
  const context = vm.createContext({ DocForm, document });
  vm.runInContext(source, context);
  if (tabSets.length) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../docform/js/tabs.js'), 'utf8'), context);
  }
  return { focus, warnings, focused: () => focused };
}

function keydown(button, key) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
  button.dispatchEvent(event);
  return event.defaultPrevented;
}

test('standalone cards move focus separately from selection and leave activation to the button', () => {
  const panel = cardPanel('recipe');
  const { list, buttons: [first, second, third], details } = panel;
  const { focus, focused, warnings } = setupCards([panel]);
  assert.deepEqual(warnings, []);
  assert.equal(list.getAttribute('role'), 'tablist');
  assert.equal(list.getAttribute('aria-orientation'), 'vertical');
  assert.equal(first.getAttribute('role'), 'tab');
  assert.equal(first.getAttribute('aria-controls'), details[0].id);
  assert.equal(details[0].getAttribute('role'), 'tabpanel');
  assert.equal(details[0].getAttribute('aria-labelledby'), first.id);
  assert.equal(details[0].getAttribute('tabindex'), '0');
  assert.deepEqual(details.map((detail) => detail.inert), [false, true, true]);

  first.focus();
  pointer(second, 'pointermove', 'mouse');
  assert.equal(keydown(first, 'ArrowUp'), true);
  assert.equal(focused(), third);
  assert.equal(keydown(third, 'ArrowDown'), true);
  assert.equal(focused(), first);
  assert.equal(keydown(first, 'End'), true);
  assert.equal(focused(), third);
  assert.equal(keydown(third, 'Home'), true);
  assert.equal(focused(), first);
  keydown(first, 'ArrowDown');
  assert.equal(focused(), second);
  assert.deepEqual(panel.buttons.map((button) => button.tabIndex), [-1, 0, -1]);
  assert.equal(first.getAttribute('aria-selected'), 'true');
  assert.equal(second.getAttribute('aria-selected'), 'false');
  focus(details[0]);
  assert.deepEqual(panel.buttons.map((button) => button.tabIndex), [0, -1, -1]);

  second.focus();
  assert.equal(keydown(second, 'Enter'), false);
  assert.equal(keydown(second, ' '), false);
  second.dispatchEvent(new Event('click'));
  assert.equal(first.getAttribute('aria-selected'), 'false');
  assert.equal(second.getAttribute('aria-selected'), 'true');
  assert.deepEqual(details.map((detail) => detail.inert), [true, false, true]);
});

test('switching cards preserves nested selection and isolates other card panels', () => {
  const outer = cardPanel('outer');
  const inner = cardPanel('inner');
  const other = cardPanel('other');
  outer.details[0].children = [inner.box];
  const input = { value: 'reader setting' };
  inner.details[1].children = [input];
  setupCards([outer, inner, other]);

  inner.buttons[1].dispatchEvent(new Event('click'));
  other.buttons[2].dispatchEvent(new Event('click'));
  outer.buttons[1].dispatchEvent(new Event('click'));
  assert.equal(outer.details[0].inert, true);
  outer.buttons[0].dispatchEvent(new Event('click'));
  assert.equal(outer.details[0].inert, false);
  assert.equal(outer.details[0].children[0], inner.box);
  assert.equal(inner.buttons[1].getAttribute('aria-selected'), 'true');
  assert.equal(inner.details[1].children[0], input);
  assert.equal(other.buttons[2].getAttribute('aria-selected'), 'true');
});

test('returning to a card retains the language chosen with the tabs module', () => {
  const panel = cardPanel('recipe');
  const python = element({ 'data-df-tab': 'Python', 'data-df-selected': '' });
  const javascript = element({ 'data-df-tab': 'JavaScript' });
  const children = [python, javascript];
  const tabs = Object.assign(element(), { children, insertBefore: (list) => children.unshift(list) });
  panel.details[0].children = [tabs];
  setupCards([panel], [tabs]);

  const [pythonTab, javascriptTab] = children[0].children;
  assert.equal(pythonTab.getAttribute('aria-selected'), 'true');
  javascriptTab.dispatchEvent(new Event('click'));
  panel.buttons[1].dispatchEvent(new Event('click'));
  panel.buttons[0].dispatchEvent(new Event('click'));
  assert.equal(javascriptTab.getAttribute('aria-selected'), 'true');
  assert.equal(javascript.hidden, false);
  assert.equal(python.hidden, true);
  assert.equal(panel.details[0].inert, false);
});

test('a card that targets a nested or missing detail leaves every authored detail available', () => {
  const outer = cardPanel('outer');
  const inner = cardPanel('inner');
  outer.details[1].children = [inner.box];
  outer.buttons[1].setAttribute('data-df-card', inner.details[0].id);
  const { warnings } = setupCards([outer, inner]);
  assert.deepEqual(warnings, ['steps:cards']);
  assert.equal(outer.box.classList.has('df-card-panel-ready'), false);
  assert.ok(outer.details.every((detail) => !detail.inert));
  assert.equal(inner.box.classList.has('df-card-panel-ready'), true);
});

test('grouped cards keep one tab list, take their group title as a description, and slide one highlight', () => {
  const panel = cardPanel('runs');
  const [first, second, third] = panel.buttons;
  const heading = element();
  const group = Object.assign(element({}, panel.list), {
    querySelector: (selector) => selector === ':scope > .df-step-group-heading' ? heading : null
  });
  second.parentElement = third.parentElement = group;
  panel.buttons.forEach((button, i) => { button.offsetTop = i * 40; button.childNodes = [{ text: `Card ${i}`, parentNode: button }]; });
  setupCards([panel]);

  assert.equal(group.getAttribute('role'), 'none');
  assert.equal(heading.id, 'runs-heading-group');
  assert.equal(heading.getAttribute('aria-hidden'), 'true');
  assert.equal(first.getAttribute('aria-describedby'), null);
  assert.equal(third.getAttribute('aria-describedby'), heading.id);
  assert.equal(third.getAttribute('aria-controls'), panel.details[2].id);

  const [label, bold] = third.childNodes;
  assert.equal(label.className, 'df-step-label');
  assert.equal(third.childNodes.length, 2);
  assert.deepEqual(label.childNodes.map((node) => node.text), ['Card 2']);
  assert.equal(bold.className, 'df-step-label-bold');
  assert.equal(bold.getAttribute('aria-hidden'), 'true');

  const marker = panel.list.childNodes[0];
  assert.equal(marker.className, 'df-step-indicator');
  assert.equal(marker.style.transform, 'translate(0px, 0px)');
  assert.equal(marker.classList.has('df-step-indicator-glide'), false);
  third.dispatchEvent(new Event('click'));
  assert.equal(marker.style.transform, 'translate(0px, 80px)');
  assert.equal(marker.style.height, '32px');
  assert.equal(marker.classList.has('df-step-indicator-glide'), true);
});
