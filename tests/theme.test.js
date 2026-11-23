const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '../offprint/js/core.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../offprint/js/theme.js'), 'utf8');

function load({ stored = null, dark = false, storage } = {}) {
  const store = new Map(stored === null ? [] : [['offprint-theme', stored]]);
  const attrs = {};
  const window = {
    OffPrint: { _boot: {} },
    localStorage: storage || {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    matchMedia: () => ({ matches: dark }),
    document: {
      readyState: 'loading',
      addEventListener() {},
      documentElement: {
        setAttribute: (name, value) => { attrs[name] = value; },
        removeAttribute: (name) => { delete attrs[name]; }
      }
    }
  };
  const context = vm.createContext({ window });
  vm.runInContext(core, context);
  vm.runInContext(source, context);
  return { theme: window.OffPrint._theme, store, attrs };
}

test('only light and dark exist; unknown values fall back to the OS preference', () => {
  const { theme } = load();
  assert.deepEqual([...theme.modes], ['light', 'dark']);
  assert.equal(theme.normalize('system'), 'light');
  assert.equal(theme.normalize('system', true), 'dark');
  assert.equal(theme.next('light'), 'dark');
  assert.equal(theme.next('dark'), 'light');
  assert.equal(theme.next('bogus'), 'dark');
});

test('the first visit follows the OS and always sets an explicit theme without saving it', () => {
  const dark = load({ dark: true });
  assert.equal(dark.theme.get(), 'dark');
  assert.equal(dark.attrs['data-op-theme'], 'dark');
  assert.equal(dark.store.has('offprint-theme'), false);
  const light = load();
  assert.equal(light.theme.current(), 'light');
  assert.equal(light.attrs['data-op-theme'], 'light');
});

test('a saved choice wins over the OS, and stale "system" values fall back to it', () => {
  assert.equal(load({ stored: 'light', dark: true }).theme.get(), 'light');
  assert.equal(load({ stored: 'system', dark: true }).theme.get(), 'dark');
  const { theme, store, attrs } = load();
  theme.set('dark');
  assert.equal(store.get('offprint-theme'), 'dark');
  assert.equal(attrs['data-op-theme'], 'dark');
});

test('blocked storage still switches themes without throwing', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const { theme, attrs } = load({ storage: blocked, dark: true });
  assert.equal(theme.get(), 'dark');
  assert.equal(theme.set('light'), true);
  assert.equal(attrs['data-op-theme'], 'light');
});
