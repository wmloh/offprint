const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../offprint/js', file), 'utf8');
const warnings = [];
const context = vm.createContext({ URL, console: { warn: (message) => warnings.push(message) } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('sections.js'), context);
const sections = context.OffPrint._sections;

test('the colour cycle keeps known named colours in order and falls back to the default', () => {
  assert.deepEqual([...sections.cycle(' Green, red  teal blue ')], ['green', 'red', 'blue']);
  assert.match(warnings.at(-1), /Unknown colour "teal"/);
  assert.deepEqual([...sections.cycle('')], ['blue', 'green', 'purple', 'orange', 'pink', 'brown']);
  assert.deepEqual([...sections.cycle('cyan')], [...sections.cycle('')]);
});
