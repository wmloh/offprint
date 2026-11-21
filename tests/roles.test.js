const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const core = read('core.js');
const roles = read('roles.js');

function load() {
  const warnings = [];
  const window = {};
  const context = vm.createContext({ window, URL, console: { warn: (message) => warnings.push(message) } });
  vm.runInContext(core, context);
  vm.runInContext(roles, context);
  return { DocForm: window.DocForm, warnings };
}

test('roles become root variables and case-insensitive accent rules', () => {
  const { DocForm, warnings } = load();
  const site = DocForm._normalizeSite({ options: { roles: { colors: { Theorem: 'purple', 'key-idea': 'yellow' } } } }, 'file:///x/site.js');
  const css = DocForm._roles.css(site.roles);
  assert.match(css, /^:root\{--df-role-theorem:var\(--df-purple\);--df-role-theorem-bg:var\(--df-purple-bg\);--df-role-key-idea:var\(--df-yellow\);/);
  assert.ok(css.includes('[data-df-role][data-df-role="theorem" i]{--df-accent:var(--df-role-theorem);--df-accent-bg:var(--df-role-theorem-bg);}'));
  assert.ok(css.includes('[data-df-role="key-idea" i]'));
  assert.equal(warnings.length, 0);
});

test('no roles produce no stylesheet', () => {
  const { DocForm } = load();
  assert.equal(DocForm._roles.css({}), '');
});

test('every named colour has text and background tokens and a data-df-color rule', () => {
  const { DocForm } = load();
  const tokens = fs.readFileSync(path.join(__dirname, '../docform/css/tokens.css'), 'utf8');
  const base = fs.readFileSync(path.join(__dirname, '../docform/css/base.css'), 'utf8');
  for (const name of DocForm._colors) {
    assert.match(tokens, new RegExp(`--df-${name}: light-dark\\(`), name);
    assert.match(tokens, new RegExp(`--df-${name}-bg: light-dark\\(`), name);
    assert.ok(base.includes(`[data-df-color="${name}" i] { --df-accent: var(--df-${name}); --df-accent-bg: var(--df-${name}-bg); }`), name);
  }
});

test('role tips keep nonempty text for known roles and warn about the rest', () => {
  const { DocForm, warnings } = load();
  const site = DocForm._normalizeSite({ options: { roles: {
    colors: { Theorem: 'purple', tip: 'yellow' },
    tips: { THEOREM: ' A proven statement. ', tip: '  ', ghost: 'Unknown.' }
  } } }, 'file:///x/site.js');
  assert.deepEqual(JSON.parse(JSON.stringify(site.roleTips)), { theorem: 'A proven statement.' });
  assert.equal(DocForm._roles.tip('Theorem', site), 'A proven statement.');
  assert.equal(DocForm._roles.tip('tip', site), null);
  assert.equal(warnings.length, 2);
});
