const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '../docform/js', name), 'utf8');
const core = read('core.js');
const controls = read('controls.js');

function load(stored = {}, session = null) {
  const store = new Map(Object.entries(stored));
  const classes = new Set();
  const window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    sessionStorage: session && {
      getItem: (key) => (session.has(key) ? session.get(key) : null),
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: (key) => session.delete(key)
    },
    document: {
      documentElement: {
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          toggle: (name, on) => (on ? classes.add(name) : classes.delete(name))
        }
      }
    }
  };
  const context = vm.createContext({ window, URL, console: { warn() {} } });
  vm.runInContext(core, context);
  vm.runInContext(controls, context);
  return { controls: window.DocForm.controls, store, classes };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('focus picks the last heading at or above the centre, the intro before any heading, and the last at the end', () => {
  const { controls } = load();
  assert.equal(controls.pickFocus([-400, 120, 380, 900], 400, false), 2);
  assert.equal(controls.pickFocus([-400, 400, 900], 400, false), 1);
  assert.equal(controls.pickFocus([450, 900], 400, false), -1);
  assert.equal(controls.pickFocus([-900, -300, 100], 400, true), 2);
  assert.equal(controls.pickFocus([], 400, true), -1);
});

test('focus keeps the title, the focused section, and blocks in the central band sharp', () => {
  const { controls } = load();
  const vh = 1000;
  assert.equal(controls.dimmed([2, 2], 2, -900, -500, vh, false), false);
  assert.equal(controls.dimmed([1, 1], 2, 150, 260, vh, false), false);
  assert.equal(controls.dimmed([3, 3], 2, 790, 900, vh, false), false);
  assert.equal(controls.dimmed([1, 1], 2, -300, 190, vh, false), true);
  assert.equal(controls.dimmed([3, 3], 2, 820, 900, vh, false), true);
  assert.equal(controls.dimmed([-1, -1], 2, -400, -300, vh, true), false);
});

test('the page scrollbar shows only near the right edge', () => {
  const { controls } = load();
  assert.equal(controls.nearScrollbar(1890, 1920), true);
  assert.equal(controls.nearScrollbar(1860, 1920), false);
});

test('page blocks join the section before them, and blocks holding headings span them', () => {
  const { controls } = load();
  // intro paragraph, h2 (0), paragraph, h3 (1), figure, <section> holding h2 (2) and h3 (3), pager
  const spans = controls.blockSpans([[], [0], [], [1], [], [2, 3], []]);
  assert.deepEqual(plain(spans), [[-1, -1], [0, 0], [0, 0], [1, 1], [1, 1], [2, 3], [3, 3]]);
});

test('section jumps skip the heading already at the top and step back from mid-section', () => {
  const { controls } = load();
  assert.equal(controls.stepHeading([-500, 24, 600], 1, 24), 2);
  assert.equal(controls.stepHeading([-500, 24, 600], -1, 24), 0);
  assert.equal(controls.stepHeading([-500, -100, 600], -1, 24), 1);
  assert.equal(controls.stepHeading([-500, 24], 1, 24), -1);
  assert.equal(controls.progress(250, 1000), 0.25);
  assert.equal(controls.progress(-20, 1000), 0);
  assert.equal(controls.progress(0, 0), 1);
});

test('focus mode and the hidden sidebar persist, apply on load, and store explicit settings when reset', () => {
  const fresh = load();
  assert.deepEqual(plain(fresh.controls.state()), { focus: false, nav: true });
  fresh.controls.setNav(false);
  fresh.controls.setFocus(true);
  assert.equal(fresh.store.get('docform-nav'), 'hidden');
  assert.equal(fresh.store.get('docform-focus'), 'on');
  assert.ok(fresh.classes.has('df-nav-hidden') && fresh.classes.has('df-focus-mode'));

  const next = load(Object.fromEntries(fresh.store));
  assert.deepEqual(plain(next.controls.state()), { focus: true, nav: false });
  assert.ok(next.classes.has('df-nav-hidden') && next.classes.has('df-focus-mode'));
  next.controls.setNav(true);
  next.controls.setFocus(false);
  assert.equal(next.store.get('docform-focus'), 'off');
  assert.equal(next.store.get('docform-nav'), 'shown');
  assert.equal(next.classes.has('df-nav-hidden') || next.classes.has('df-focus-mode'), false);
});

test('auto-hide persists with the sidebar initially closed and keeps the subsection rail outside its trigger', () => {
  const fresh = load();
  assert.equal(fresh.controls.setNavMode('auto'), true);
  assert.equal(fresh.store.get('docform-nav'), 'auto');
  assert.ok(fresh.classes.has('df-nav-hidden'));

  const next = load(Object.fromEntries(fresh.store));
  assert.equal(next.controls.state().nav, false);
  assert.ok(next.classes.has('df-nav-hidden'));
  assert.equal(next.controls.nearNavEdge(8, 260, false), true);
  assert.equal(next.controls.nearNavEdge(10, 260, false), false);
  assert.equal(next.controls.nearNavEdge(264, 260, true), true);
  assert.equal(next.controls.nearNavEdge(265, 260, true), false);
  assert.equal(next.controls.setNavMode('shown'), true);
  assert.equal(next.store.get('docform-nav'), 'shown');
});

test('a recent sidebar link click opens the next auto-hide page with the panel shown, once', () => {
  const carried = new Map([['docform-nav-peek', String(Date.now())]]);
  const next = load({ 'docform-nav': 'auto' }, carried);
  assert.equal(next.controls.state().nav, true);
  assert.equal(next.classes.has('df-nav-hidden'), false);
  assert.equal(carried.size, 0);

  const stale = load({ 'docform-nav': 'auto' }, new Map([['docform-nav-peek', String(Date.now() - 60000)]]));
  assert.equal(stale.controls.state().nav, false);
  const hidden = new Map([['docform-nav-peek', String(Date.now())]]);
  assert.equal(load({ 'docform-nav': 'hidden' }, hidden).controls.state().nav, false);
  assert.equal(hidden.size, 0);

  const { controls } = load();
  assert.equal(controls.leavesPage('file:///d/b.html#x', 'file:///d/a.html'), true);
  assert.equal(controls.leavesPage('file:///d/a.html#x', 'file:///d/a.html#y'), false);
});

test('shortcuts dispatch single keys and ignore modifiers, handled events, and form fields', () => {
  const { controls } = load();
  const field = { closest: (selector) => (selector.includes('input') ? {} : null) };
  const button = { closest: () => null };
  const calls = [];
  const actions = { theme: () => calls.push('theme'), next: () => calls.push('next') };
  const key = (k, extra = {}) => {
    const event = { key: k, target: button, prevented: false, ...extra };
    event.preventDefault = () => { event.prevented = true; };
    return event;
  };

  const handled = key('T');
  assert.equal(controls.dispatch(handled, actions), 'theme');
  assert.equal(handled.prevented, true);
  assert.equal(controls.dispatch(key('j'), actions), 'next');
  assert.equal(controls.dispatch(key('f'), actions), null);
  assert.equal(controls.dispatch(key('t', { ctrlKey: true }), actions), null);
  assert.equal(controls.dispatch(key('t', { defaultPrevented: true }), actions), null);
  assert.equal(controls.dispatch(key('t', { target: field }), actions), null);
  assert.equal(controls.dispatch(key('t', { target: { isContentEditable: true } }), actions), null);
  assert.equal(controls.shortcut(key('n')), 'nav');
  assert.equal(controls.shortcut(key('k')), 'prev');
  assert.deepEqual(calls, ['theme', 'next']);
});
