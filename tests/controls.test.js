const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '../offprint/js', name), 'utf8');
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
  return { controls: window.OffPrint._controls, store, classes };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('focus keeps the title and elements in the central band sharp, regardless of section', () => {
  const { controls } = load();
  const vh = 1000;
  assert.equal(controls.dimmed(150, 260, vh, false), false);
  assert.equal(controls.dimmed(790, 900, vh, false), false);
  assert.equal(controls.dimmed(-900, 2000, vh, false), false);
  assert.equal(controls.dimmed(-300, 190, vh, false), true);
  assert.equal(controls.dimmed(820, 900, vh, false), true);
  assert.equal(controls.dimmed(-400, -300, vh, true), false);
});

test('the page scrollbar shows only near the right edge', () => {
  const { controls } = load();
  assert.equal(controls.nearScrollbar(1890, 1920), true);
  assert.equal(controls.nearScrollbar(1860, 1920), false);
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
  assert.equal(fresh.store.get('offprint-nav'), 'hidden');
  assert.equal(fresh.store.get('offprint-focus'), 'on');
  assert.ok(fresh.classes.has('op-nav-hidden') && fresh.classes.has('op-focus-mode'));

  const next = load(Object.fromEntries(fresh.store));
  assert.deepEqual(plain(next.controls.state()), { focus: true, nav: false });
  assert.ok(next.classes.has('op-nav-hidden') && next.classes.has('op-focus-mode'));
  next.controls.setNav(true);
  next.controls.setFocus(false);
  assert.equal(next.store.get('offprint-focus'), 'off');
  assert.equal(next.store.get('offprint-nav'), 'shown');
  assert.equal(next.classes.has('op-nav-hidden') || next.classes.has('op-focus-mode'), false);
});

test('auto-hide persists with the sidebar initially closed and keeps the subsection rail outside its trigger', () => {
  const fresh = load();
  assert.equal(fresh.controls.setNavMode('auto'), true);
  assert.equal(fresh.store.get('offprint-nav'), 'auto');
  assert.ok(fresh.classes.has('op-nav-hidden'));

  const next = load(Object.fromEntries(fresh.store));
  assert.equal(next.controls.state().nav, false);
  assert.ok(next.classes.has('op-nav-hidden'));
  assert.equal(next.controls.nearNavEdge(8, 260, false), true);
  assert.equal(next.controls.nearNavEdge(10, 260, false), false);
  assert.equal(next.controls.nearNavEdge(264, 260, true), true);
  assert.equal(next.controls.nearNavEdge(265, 260, true), false);
  assert.equal(next.controls.setNavMode('shown'), true);
  assert.equal(next.store.get('offprint-nav'), 'shown');
});

test('a recent sidebar link click opens the next auto-hide page with the panel shown, once', () => {
  const carried = new Map([['offprint-nav-peek', String(Date.now())]]);
  const next = load({ 'offprint-nav': 'auto' }, carried);
  assert.equal(next.controls.state().nav, true);
  assert.equal(next.classes.has('op-nav-hidden'), false);
  assert.equal(carried.size, 0);

  const stale = load({ 'offprint-nav': 'auto' }, new Map([['offprint-nav-peek', String(Date.now() - 60000)]]));
  assert.equal(stale.controls.state().nav, false);
  const hidden = new Map([['offprint-nav-peek', String(Date.now())]]);
  assert.equal(load({ 'offprint-nav': 'hidden' }, hidden).controls.state().nav, false);
  assert.equal(hidden.size, 0);

  const { controls } = load();
  assert.equal(controls.leavesPage('file:///d/b.html#x', 'file:///d/a.html'), true);
  assert.equal(controls.leavesPage('file:///d/a.html#x', 'file:///d/a.html#y'), false);
});
