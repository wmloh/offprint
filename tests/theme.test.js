const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docform/js/theme.js'), 'utf8');

function load({ stored = null, dark = false, storage } = {}) {
  const store = new Map(stored === null ? [] : [['docform-theme', stored]]);
  const attrs = {};
  const window = {
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
  vm.runInNewContext(source, { window });
  return { theme: window.DocFormTheme, store, attrs };
}

test('preference resolution follows the system only in system mode', () => {
  const { theme } = load();
  assert.equal(theme.normalize('bogus'), 'system');
  assert.equal(theme.normalize(null), 'system');
  assert.equal(theme.resolve('system', true), 'dark');
  assert.equal(theme.resolve('system', false), 'light');
  assert.equal(theme.resolve('light', true), 'light');
  assert.equal(theme.resolve('dark', false), 'dark');
  assert.equal(load({ dark: true }).theme.current(), 'dark');
});

test('toggle cycles system, light, dark, then back to system', () => {
  const { theme } = load();
  assert.equal(theme.next('system'), 'light');
  assert.equal(theme.next('light'), 'dark');
  assert.equal(theme.next('dark'), 'system');
  assert.equal(theme.next('bogus'), 'light');
});

test('stored choice applies on load and invalid values fall back to system', () => {
  const dark = load({ stored: 'dark' });
  assert.equal(dark.theme.get(), 'dark');
  assert.equal(dark.attrs['data-df-theme'], 'dark');
  const bogus = load({ stored: 'sepia' });
  assert.equal(bogus.theme.get(), 'system');
  assert.equal('data-df-theme' in bogus.attrs, false);
});

test('choices persist, and system mode clears the stored value', () => {
  const { theme, store, attrs } = load();
  theme.set('light');
  assert.equal(store.get('docform-theme'), 'light');
  assert.equal(attrs['data-df-theme'], 'light');
  theme.set('system');
  assert.equal(store.has('docform-theme'), false);
  assert.equal('data-df-theme' in attrs, false);
});

test('blocked storage falls back to system without throwing', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const { theme, attrs } = load({ storage: blocked });
  assert.equal(theme.get(), 'system');
  assert.equal(theme.set('dark'), 'dark');
  assert.equal(attrs['data-df-theme'], 'dark');
});
