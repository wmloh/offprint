const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../docform/js', file), 'utf8');
const context = vm.createContext({ URL, console: { warn() {} } });
context.window = context;
vm.runInContext(read('core.js'), context);
vm.runInContext(read('reveal.js'), context);
const reveal = context.DocForm.reveal;

const entry = (target, isIntersecting, bottom) => ({ target, isIntersecting, boundingClientRect: { bottom } });

test('elements reveal when they intersect or already sit above the viewport', () => {
  assert.equal(reveal.shouldReveal(entry('a', true, 300)), true);
  assert.equal(reveal.shouldReveal(entry('a', false, 1400)), false);
  assert.equal(reveal.shouldReveal(entry('a', false, -20)), true);
  assert.equal(reveal.shouldReveal(entry('a', false, 0)), true);
});

test('each element reveals once and is no longer watched', () => {
  let observer;
  class FakeObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.watched = new Set();
      observer = this;
    }
    observe(el) { this.watched.add(el); }
    unobserve(el) { this.watched.delete(el); }
    fire(entries) { this.callback(entries.filter((e) => this.watched.has(e.target)), this); }
  }
  const shown = [];
  reveal.revealer(FakeObserver, (el) => shown.push(el));
  ['a', 'b', 'c'].forEach((el) => observer.observe(el));

  observer.fire([entry('a', false, 900), entry('b', false, 1500), entry('c', false, -10)]);
  assert.deepEqual(shown, ['c']);
  observer.fire([entry('a', true, 500)]);
  observer.fire([entry('a', false, 900), entry('a', true, 400), entry('b', true, 700)]);
  assert.deepEqual(shown, ['c', 'a', 'b']);
  assert.equal(observer.watched.size, 0);
  assert.match(observer.options.rootMargin, /-12%/);
});

test('split column shares follow the spec and default to equal panes', () => {
  assert.equal(reveal.splitColumns('2:1', 2), 'minmax(0, 2fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('3 2', 3), 'minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('x:0', 2), 'minmax(0, 1fr) minmax(0, 1fr)');
  assert.equal(reveal.splitColumns('', 1), 'minmax(0, 1fr)');
});
