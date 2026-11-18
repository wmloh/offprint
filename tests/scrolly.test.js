const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console: { warn() {} } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('scrolly.js'), context);
const scrolly = context.DocForm.scrolly;

test('the active prose step is the last one past the trigger line', () => {
  const tops = [900, 1500, 2100];
  assert.equal(scrolly.activeStep(tops, 600), -1);
  assert.equal(scrolly.activeStep(tops, 900), 0);
  assert.equal(scrolly.activeStep([-800, -200, 450], 600), 2);
  assert.equal(scrolly.activeStep([-800, 300, 1200], 600), 1);
  assert.equal(scrolly.activeStep([], 600), -1);
});

test('prose steps map to animation steps by position or explicit number', () => {
  const values = ['', null, '2', 'x', '0'];
  assert.deepEqual([-1, 0, 1, 2, 3, 4, 9].map((i) => scrolly.stepNumber(values, i)), [0, 1, 2, 2, 4, 0, 0]);
});

test('the trigger line sits below the pinned figure within half to most of the viewport', () => {
  assert.equal(scrolly.triggerLine(1000, 200), 500);
  assert.equal(scrolly.triggerLine(1000, 550), 650);
  assert.equal(scrolly.triggerLine(1000, 980), 850);
});
