const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');

// A small DOM with bubbling events, focus, and layout offsets for choice controls.
class El {
  constructor(doc, tag) {
    Object.assign(this, { doc, tag, tagName: tag.toUpperCase(), nodeType: 1, children: [], parentNode: null, text: '',
      attrs: new Map(), listeners: {}, hidden: false, value: '', checked: false, disabled: false, type: '' });
    this.style = { props: {}, setProperty: (name, value) => { this.style.props[name] = value; } };
    const classes = () => new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean));
    const save = (set) => this.setAttribute('class', [...set].join(' '));
    this.classList = {
      add: (...names) => save(names.reduce((set, n) => set.add(n), classes())),
      remove: (...names) => save(names.reduce((set, n) => (set.delete(n), set), classes())),
      toggle: (name, on) => (on ?? !classes().has(name)) ? this.classList.add(name) : this.classList.remove(name),
      contains: (name) => classes().has(name)
    };
  }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.text = String(value); }
  get nextSibling() { const list = this.parentNode?.children; return list ? list[list.indexOf(this) + 1] ?? null : null; }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  insertBefore(child, ref) {
    child.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(i < 0 ? this.children.length : i, 0, child);
    child.parentNode = this;
    return child;
  }
  appendChild(child) { return this.insertBefore(child, null); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  contains(node) { for (; node; node = node.parentNode) if (node === this) return true; return false; }
  closest(tag) { for (let n = this; n && n.tag; n = n.parentNode) if (n.tag === tag) return n; return null; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  byClass(name) { return this.all().filter((n) => n.classList.contains(name)); }
  one(name) { return this.byClass(name)[0]; }
  querySelectorAll(selector) {
    const attrs = selector.split(', ').map((part) => /^\[([\w-]+)\]$/.exec(part)?.[1]);
    return this.all().filter((n) => attrs.some((a) => a && n.hasAttribute(a)));
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  focus() { this.doc.activeElement = this; }
  select() { this.selected = true; }
}

function fire(target, type, props = {}) {
  const event = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
  for (let node = target; node; node = node.parentNode) (node.listeners?.[type] || []).forEach((fn) => fn(event));
  return event;
}
const key = (el, k, extra) => fire(el, 'keydown', { key: k, ...extra });
const choices = (...labels) => labels.map((label) => ({ value: label.toLowerCase(), label }));
const many = choices('Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Ångström');

// Starts fresh core and params modules over hosts built from [tag, attrs, parent index?] after defining the page scope.
function page(define, hosts, { popover = false } = {}) {
  const frames = [];
  const warned = [];
  let start;
  const document = {
    readyState: 'loading', activeElement: null,
    addEventListener: (_, fn) => { start = fn; },
    createElement: (tag) => {
      const el = new El(document, tag);
      if (popover) {
        el.open = false;
        el.showPopover = () => { el.open = true; };
        el.hidePopover = () => { el.open = false; fire(el, 'toggle', { newState: 'closed' }); };
        el.matches = (selector) => selector === ':popover-open' && el.open;
      }
      return el;
    },
    createTextNode: (text) => Object.assign(new El(document, '#text'), { text, nodeType: 3 }),
    querySelector: () => null,
    querySelectorAll: (selector) => document.body.querySelectorAll(selector),
    dispatchEvent() {}
  };
  document.body = new El(document, 'body');
  const ctx = vm.createContext({ URL, document, requestAnimationFrame: (fn) => frames.push(fn),
    location: { href: 'file:///page.html' }, console: { warn: (m) => warned.push(m) } });
  ctx.window = ctx;
  vm.runInContext(read('core.js'), ctx);
  vm.runInContext(read('params.js'), ctx);
  const follows = [];
  if (popover) ctx.DocForm.dropdowns = { follow: (trigger, panel) => { follows.push([trigger, panel]); return () => follows.pop(); } };
  const scope = ctx.DocForm.parameters.define('page', define);
  const nodes = [];
  hosts.forEach(([tag, attrs, parent]) => {
    const el = (parent === undefined ? document.body : nodes[parent]).appendChild(new El(document, tag));
    nodes.push(el);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  });
  start();
  return { scope, nodes, frames, warned, document, follows };
}

const host = (name, extra = {}) => ['div', { 'data-df-parameter': name, ...extra }];
const styleOf = (el) => ['chips', 'combobox', 'native'].find((s) => el.classList.contains('df-param-' + s)) ||
  (el.one('df-param-select') || el.one('df-param-multiselect') ? 'native' : null);

test('choice styles follow set size and label length, per-control overrides, and an authored select fallback', () => {
  const long = choices('A rather long label for a choice', 'Another long label for a choice', 'A third long label here');
  const env = page({
    small: { type: 'select', choices: choices('One', 'Two') },
    wordy: { type: 'select', choices: long },
    large: { type: 'multiselect', choices: many },
    mode: { type: 'select', choices: choices('Fast', 'Exact'), default: 'exact' }
  }, [host('small'), host('wordy'), host('large'), host('small', { 'data-df-parameter-style': 'combobox' }),
    host('large', { 'data-df-parameter-style': 'chips' }), host('small', { 'data-df-parameter-style': 'native' }),
    host('large', { 'data-df-parameter-style': 'native' }), host('small', { 'data-df-parameter-style': 'pills' }),
    ['select', { 'data-df-parameter': 'mode' }],
    ['label', {}], ['select', { 'data-df-parameter': 'mode', 'data-df-parameter-style': 'chips', 'data-df-parameter-label': 'Mode' }, 9]]);
  const [small, wordy, large, smallCombo, largeChips, smallNative, largeNative, unknown, plain, label, styled] = env.nodes;
  assert.deepEqual([small, wordy, large, smallCombo, largeChips, smallNative, largeNative, unknown].map(styleOf),
    ['chips', 'combobox', 'combobox', 'combobox', 'chips', 'native', 'native', 'chips']);
  assert.equal(smallNative.one('df-param-select').tag, 'select');
  assert.equal(largeNative.one('df-param-multiselect').tag, 'fieldset');
  assert.match(env.warned.join('\n'), /unknown style "pills"/);

  assert.equal(plain.hidden, false, 'an authored select stays native without a style');
  assert.equal(plain.value, 'exact');
  assert.equal(label.hidden, true, 'a styled select hides with its wrapping label');
  const box = label.nextSibling;
  assert.ok(box.classList.contains('df-param-chips'));
  assert.equal(box.one('df-param-label').textContent, 'Mode');
  assert.deepEqual(styled.children.map((o) => o.value), ['fast', 'exact']);
  const radios = box.byClass('df-chip-input');
  radios[0].checked = true;
  fire(radios[0], 'change');
  assert.equal(env.scope.get('mode'), 'fast');
  assert.equal(styled.value, 'fast', 'the hidden select follows');
  assert.equal(plain.value, 'fast');
  plain.value = 'exact';
  fire(plain, 'change');
  assert.deepEqual(radios.map((r) => r.checked), [false, true]);
});

test('single-choice chips are radios that glide, follow the scope, and move with arrow keys', () => {
  const env = page({ mode: { type: 'select', choices: choices('Raw', 'Scaled', 'Log'), default: 'scaled', selectionGroup: 'modes' } },
    [host('mode', { 'data-df-parameter-label': 'Mode' }), host('mode')]);
  const [a, b] = env.nodes;
  const group = a.one('df-chips');
  const heading = a.one('df-param-label');
  assert.equal(group.getAttribute('role'), 'radiogroup');
  assert.equal(group.getAttribute('aria-labelledby'), heading.id);
  assert.equal(heading.textContent, 'Mode');
  const chips = a.byClass('df-chip');
  const radios = a.byClass('df-chip-input');
  assert.deepEqual(radios.map((r) => [r.type, r.name === radios[0].name, r.checked]),
    [['radio', true, false], ['radio', true, true], ['radio', true, false]]);
  assert.notEqual(radios[0].name, b.one('df-chip-input').name, 'each control has its own radio group');
  assert.deepEqual(chips.map((c) => c.getAttribute('data-df-key')), ['raw', 'scaled', 'log']);
  assert.ok(chips[1].classList.contains('is-selected'));

  const glider = a.one('df-chips-glider');
  assert.ok(glider.classList.contains('is-hidden'), 'no layout yet, so the highlight waits');
  Object.assign(chips[2], { offsetLeft: 120, offsetTop: 0, offsetWidth: 50, offsetHeight: 24 });
  radios[2].checked = true;
  fire(radios[2], 'change');
  assert.equal(env.scope.get('mode'), 'log');
  assert.deepEqual(b.byClass('df-chip-input').map((r) => r.checked), [false, false, true]);
  assert.ok(!glider.classList.contains('is-hidden'));
  assert.deepEqual(glider.style.props, { '--df-chip-x': '120px', '--df-chip-y': '0px', '--df-chip-w': '50px', '--df-chip-h': '24px' });
  assert.ok(group.classList.contains('df-chips-still'), 'the first placement does not slide');
  env.frames.splice(0).forEach((fn) => fn());
  assert.ok(!group.classList.contains('df-chips-still'));

  assert.equal(key(radios[2], 'ArrowRight').defaultPrevented, true);
  assert.equal(env.scope.get('mode'), 'raw', 'arrows wrap and choose');
  assert.equal(env.document.activeElement, radios[0]);
  key(radios[0], 'ArrowUp');
  assert.equal(env.scope.get('mode'), 'log');
  key(radios[2], 'Home');
  assert.equal(env.scope.get('mode'), 'raw');
  key(radios[0], 'End');
  assert.equal(env.scope.get('mode'), 'log');
  assert.equal(key(radios[2], 'ArrowLeft', { ctrlKey: true }).defaultPrevented, false, 'modified keys stay native');
  assert.equal(key(radios[2], 'a').defaultPrevented, false);
});

test('multiple-choice chips are checkboxes in declaration order and arrows only move focus', () => {
  const env = page({ runs: { type: 'multiselect', choices: choices('A', 'B', 'C'), default: ['c'] } }, [host('runs')]);
  const [el] = env.nodes;
  assert.equal(el.one('df-chips').getAttribute('role'), 'group');
  assert.equal(el.one('df-chips-glider'), undefined);
  const boxes = el.byClass('df-chip-input');
  assert.deepEqual(boxes.map((b) => [b.type, b.checked]), [['checkbox', false], ['checkbox', false], ['checkbox', true]]);
  boxes[0].checked = true;
  fire(boxes[0], 'change');
  assert.deepEqual([...env.scope.get('runs')], ['a', 'c']);
  assert.deepEqual(el.byClass('df-chip').map((c) => c.classList.contains('is-selected')), [true, false, true]);
  key(boxes[0], 'ArrowRight');
  assert.equal(env.document.activeElement, boxes[1]);
  assert.deepEqual([...env.scope.get('runs')], ['a', 'c']);
  env.scope.set('runs', []);
  assert.deepEqual(boxes.map((b) => b.checked), [false, false, false]);
});

test('a single-choice combobox filters, highlights matches, and picks with the keyboard', () => {
  const env = page({ pick: { type: 'select', choices: many, default: 'gamma' } }, [host('pick', { 'data-df-parameter-label': 'Letter' })]);
  const [el] = env.nodes;
  const input = el.one('df-combo-input');
  const panel = el.one('df-combo-panel');
  const list = el.one('df-combo-list');
  const options = el.byClass('df-combo-option');
  const shown = () => options.filter((o) => !o.hidden).map((o) => o.textContent);
  const active = () => input.getAttribute('aria-activedescendant');
  assert.equal(el.one('df-param-label').htmlFor, input.id);
  assert.deepEqual(['role', 'aria-expanded', 'aria-controls'].map((a) => input.getAttribute(a)), ['combobox', 'false', list.id]);
  assert.equal(list.getAttribute('role'), 'listbox');
  assert.equal(input.value, 'Gamma');
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute('popover'), null, 'without popovers the panel shows in place');

  fire(input, 'click');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.equal(shown().length, many.length, 'opening shows every choice');
  assert.equal(active(), options[2].id, 'the chosen option starts active');
  assert.equal(options[2].getAttribute('aria-selected'), 'true');

  input.value = 'ta';
  fire(input, 'input');
  assert.deepEqual(shown(), ['Beta', 'Delta', 'Zeta', 'Eta', 'Theta', 'Iota']);
  assert.equal(active(), options[1].id);
  assert.equal(options[1].one('df-combo-text').children[1].tag, 'mark');
  assert.equal(options[1].one('df-combo-text').children[1].textContent, 'ta');
  key(input, 'ArrowUp');
  assert.equal(active(), options[8].id, 'arrows wrap among matches');
  key(input, 'ArrowDown');
  key(input, 'ArrowDown');
  assert.equal(active(), options[3].id);
  assert.equal(key(input, 'Enter').defaultPrevented, true);
  assert.equal(env.scope.get('pick'), 'delta');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(input.value, 'Delta');
  assert.equal(input.hasAttribute('aria-activedescendant'), false);

  input.value = 'angst';
  fire(input, 'input');
  assert.deepEqual(shown(), ['Ångström'], 'accents fold for matching');
  input.value = 'zzz';
  fire(input, 'input');
  assert.deepEqual(shown(), []);
  assert.equal(el.one('df-combo-empty').hidden, false);
  assert.equal(key(input, 'Enter').defaultPrevented, false);
  key(input, 'Escape');
  assert.equal(panel.hidden, true);
  assert.equal(input.value, 'Delta', 'Escape restores the chosen label');
  assert.equal(env.scope.get('pick'), 'delta');

  key(input, 'ArrowDown');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  fire(options[0], 'click');
  assert.equal(env.scope.get('pick'), 'alpha');
  assert.equal(panel.hidden, true);
  fire(input, 'click');
  fire(input, 'focusout', { relatedTarget: options[0] });
  assert.equal(panel.hidden, false, 'focus within the control keeps it open');
  fire(input, 'focusout', { relatedTarget: null });
  assert.equal(panel.hidden, true);
  env.scope.set('pick', 'kappa');
  assert.equal(input.value, 'Kappa');
});

test('a multiple-choice combobox keeps ordered removable chips with All and None actions', () => {
  const env = page({ runs: { type: 'multiselect', choices: many, default: ['beta'], selectionGroup: 'runs' } }, [host('runs')]);
  const [el] = env.nodes;
  const input = el.one('df-combo-input');
  const options = el.byClass('df-combo-option');
  const [all, none] = el.byClass('df-combo-action');
  const chipText = () => el.byClass('df-combo-chip-text').map((c) => c.textContent);
  assert.equal(el.one('df-combo-list').getAttribute('aria-multiselectable'), 'true');
  assert.equal(options[4].getAttribute('data-df-key'), 'epsilon');
  assert.deepEqual(chipText(), ['Beta']);
  assert.ok(!el.one('df-combo-chip').classList.contains('is-new'), 'starting chips do not animate in');
  assert.equal(el.one('df-combo-count').textContent, '1 of 11 chosen');
  const beta = el.one('df-combo-chip');

  fire(input, 'click');
  input.value = 'ep';
  fire(input, 'input');
  key(input, 'Enter');
  assert.deepEqual([...env.scope.get('runs')], ['beta', 'epsilon']);
  assert.equal(input.getAttribute('aria-expanded'), 'true', 'a multiselect stays open while picking');
  fire(options[0], 'click');
  assert.deepEqual(chipText(), ['Alpha', 'Beta', 'Epsilon']);
  assert.equal(el.byClass('df-combo-chip')[1], beta, 'existing chips stay in place');
  assert.ok(el.byClass('df-combo-chip')[0].classList.contains('is-new'));
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  key(input, 'Enter');
  assert.deepEqual([...env.scope.get('runs')], ['alpha', 'beta'], 'Enter toggles the active option off');

  fire(el.byClass('df-combo-remove')[0], 'click');
  assert.deepEqual([...env.scope.get('runs')], ['beta']);
  assert.equal(env.document.activeElement, input);
  assert.equal(el.byClass('df-combo-remove')[0].getAttribute('aria-label'), 'Remove Beta');
  input.value = 'x';
  key(input, 'Backspace');
  assert.deepEqual([...env.scope.get('runs')], ['beta'], 'Backspace edits text while the field has some');
  input.value = '';
  key(input, 'Backspace');
  assert.deepEqual([...env.scope.get('runs')], []);
  assert.equal(none.disabled, true);

  fire(all, 'click');
  assert.equal(env.scope.get('runs').length, many.length);
  assert.equal(all.disabled, true);
  assert.equal(el.one('df-combo-count').textContent, '11 of 11 chosen');
  fire(none, 'click');
  assert.deepEqual(chipText(), []);
  assert.equal(fire(el.one('df-combo-panel'), 'mousedown').defaultPrevented, true, 'pointing keeps focus in the field');
});

test('a combobox uses a manual popover that follows its field and closes with it', () => {
  const env = page({ pick: { type: 'select', choices: many } }, [host('pick')], { popover: true });
  const [el] = env.nodes;
  const input = el.one('df-combo-input');
  const panel = el.one('df-combo-panel');
  const field = el.one('df-combo-field');
  assert.equal(panel.getAttribute('popover'), 'manual');
  assert.ok(panel.classList.contains('df-dropdown-panel'));
  fire(input, 'click');
  assert.equal(panel.open, true);
  assert.deepEqual(env.follows, [[field, panel]]);
  panel.hidePopover();
  assert.equal(input.getAttribute('aria-expanded'), 'false', 'a popover hidden elsewhere closes the combobox');
  assert.deepEqual(env.follows, []);
  fire(input, 'click');
  key(input, 'Escape');
  assert.equal(panel.open, false);
});
