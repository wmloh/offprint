const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('params.js'), context);
const params = context.DocForm.params;

test('slider steps imply decimal places', () => {
  assert.deepEqual(['1', '0.5', '0.05', '10', '1e-3'].map(params.digitsOf), [0, 1, 2, 0, 3]);
});

test('values format with fixed or trimmed decimals and no negative zero', () => {
  assert.equal(params.format(3.14159, 2), '3.14');
  assert.equal(params.format(2, 2), '2.00');
  assert.equal(params.format(1 / 3), '0.333');
  assert.equal(params.format(2.5), '2.5');
  assert.equal(params.format(-0.0001, 2), '0.00');
  assert.equal(params.format(-0.0001), '0');
  assert.equal(params.format(NaN), '?');
  assert.equal(params.format(Infinity), '∞');
  assert.equal(params.format('text'), 'text');
});

test('templates substitute expressions with Math in scope and optional places', () => {
  const scope = { a: 3, b: 4, theta: Math.PI / 6 };
  assert.equal(params.fill('c = \\sqrt{ {{a}}^2 + {{b}}^2 } = {{sqrt(a*a + b*b)}}', scope), 'c = \\sqrt{ 3^2 + 4^2 } = 5');
  assert.equal(params.fill('{{sin(theta)|3}} and {{PI|2}}', scope), '0.500 and 3.14');
  assert.equal(params.fill('{{a > 2 ? "big" : "small"}}', scope), 'big');
  assert.equal(params.fill('{{ a || 1 }}', scope), '3');
  assert.equal(params.fill('no braces {here}', scope), 'no braces {here}');
});

test('bad expressions show a placeholder and warn once', () => {
  const before = warnings.length;
  assert.equal(params.fill('{{missing + 1}} {{missing + 1}}', { a: 1 }), '? ?');
  assert.equal(warnings.length, before + 1);
  assert.match(warnings.at(-1), /Cannot evaluate "missing \+ 1"/);
});
