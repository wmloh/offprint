const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');
const core = read('core.js');
const roles = read('roles.js');

function load() {
  const warnings = [];
  const window = {};
  const context = vm.createContext({ window, URL, console: { warn: (message) => warnings.push(message) } });
  vm.runInContext(core, context);
  vm.runInContext(roles, context);
  return { OffPrint: window.OffPrint, warnings };
}

test('roles become root variables and case-insensitive accent rules', () => {
  const { OffPrint, warnings } = load();
  const site = OffPrint._normalizeSite({ options: { roles: { colors: { Theorem: 'purple', 'key-idea': 'yellow' } } } }, 'file:///x/site.js');
  const css = OffPrint._roles.css(site.roles);
  assert.match(css, /^:root\{--op-role-theorem:var\(--op-purple\);--op-role-theorem-bg:var\(--op-purple-bg\);--op-role-key-idea:var\(--op-yellow\);/);
  assert.ok(css.includes('[data-op-role][data-op-role="theorem" i]{--op-accent:var(--op-role-theorem);--op-accent-bg:var(--op-role-theorem-bg);}'));
  assert.ok(css.includes('[data-op-role="key-idea" i]'));
  assert.equal(warnings.length, 0);
});

test('no roles produce no stylesheet', () => {
  const { OffPrint } = load();
  assert.equal(OffPrint._roles.css({}), '');
});

test('every named colour has text and background tokens and a data-op-color rule', () => {
  const { OffPrint } = load();
  const tokens = fs.readFileSync(path.join(__dirname, '../offprint/css/tokens.css'), 'utf8');
  const base = fs.readFileSync(path.join(__dirname, '../offprint/css/base.css'), 'utf8');
  for (const name of OffPrint._colors) {
    assert.match(tokens, new RegExp(`--op-${name}: light-dark\\(`), name);
    assert.match(tokens, new RegExp(`--op-${name}-bg: light-dark\\(`), name);
    assert.ok(base.includes(`[data-op-color="${name}" i] { --op-accent: var(--op-${name}); --op-accent-bg: var(--op-${name}-bg); }`), name);
  }
});

test('role tips keep nonempty text for known roles and warn about the rest', () => {
  const { OffPrint, warnings } = load();
  const site = OffPrint._normalizeSite({ options: { roles: {
    colors: { Theorem: 'purple', tip: 'yellow' },
    tips: { THEOREM: ' A proven statement. ', tip: '  ', ghost: 'Unknown.' }
  } } }, 'file:///x/site.js');
  assert.deepEqual(JSON.parse(JSON.stringify(site.roleTips)), { theorem: 'A proven statement.' });
  assert.equal(OffPrint._roles.tip('Theorem', site), 'A proven statement.');
  assert.equal(OffPrint._roles.tip('tip', site), null);
  assert.equal(warnings.length, 2);
});
