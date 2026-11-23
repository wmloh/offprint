const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../offprint/js/quiz.js'), 'utf8');

function load() {
  const OffPrint = { register() {} };
  const context = { OffPrint, console };
  context.window = context;
  vm.runInNewContext(source, context);
  return OffPrint.quiz;
}

// Values cross the vm realm, so compare them as plain JSON.
const json = (value) => JSON.parse(JSON.stringify(value));
const same = (actual, expected) => assert.deepEqual(json(actual), json(expected));
const quiz = load();
const model = quiz._model;

const single = (id, correct = 1, extra = {}) => ({
  id, prompt: id, options: ['a', 'b', 'c'].map((text, i) => i === correct ? { text, correct: true } : text), ...extra
});

test('a bare quiz becomes a stack of one with cascaded settings and inherited tags', () => {
  const stack = model.normalize({ title: 'Optics', tags: ['domain:optics'], feedback: 'question', hintPenalty: 0.5,
    questions: [single('q1'), { ...single('q2'), tags: ['lenses'], scoring: 'all' }] });
  assert.equal(stack.quizzes.length, 1);
  assert.equal(stack.count, 2);
  same(stack.tags, ['domain:optics']);
  const [a, b] = stack.quizzes[0].questions;
  same(b.tags, ['domain:optics', 'lenses']);
  assert.equal(a.settings.feedback, 'question');
  assert.equal(b.settings.scoring, 'all');
  assert.equal(a.settings.hintPenalty, 0.5);
});

test('normalization rejects malformed questions with located messages', () => {
  const bad = (input, pattern) => assert.throws(() => model.normalize(input), pattern);
  bad({ questions: [{ options: ['a', 'b'] }] }, /question 1: mark exactly one option correct/);
  bad({ questions: [{ type: 'multi', options: ['a', 'b'] }] }, /at least one option correct/);
  bad({ questions: [{ type: 'ordering' }] }, /unknown question type "ordering"/);
  bad({ questions: Array.from({ length: 9 }, (_, i) => single('q' + i)) }, /at most 8 or set draw/);
  bad({ questions: [single('x'), single('x')] }, /duplicate question id "x"/);
  bad({ questions: [{ type: 'fill', text: 'A [[a]]', blanks: { a: 'x', b: 'y' } }] }, /blank "b" is not used/);
  bad({ questions: [{ type: 'fill', text: 'A [[a]]', blanks: { a: { options: ['x', 'y'], answer: 'z' } } }] }, /one of its options/);
  bad({ feedback: 'later', questions: [single('q')] }, /feedback must be/);
});

test('partial credit, all-or-nothing, and hint penalties score each type', () => {
  const stack = model.normalize({ hintPenalty: 0.25, quizzes: [{ questions: [
    { type: 'multi', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, 'c'] },
    { type: 'multi', scoring: 'all', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, 'c'] },
    { type: 'fill', text: '[[x]] and [[y]] in [[z]]', blanks: {
      x: { answer: ['Light', 'light'] }, y: { answer: 'WAVE', match: 'nocase' }, z: { options: ['air', 'glass'], answer: 'glass' } } },
    { type: 'match', pairs: [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']], distractors: ['5'] },
    single('s', 0)
  ] }] });
  const [multi, strict, fill, match, one] = stack.quizzes[0].questions;
  same(model.score(multi, [0, 2], 0), { raw: 0, score: 0 });
  same(model.score(multi, [0], 0), { raw: 0.5, score: 0.5 });
  same(model.score(strict, [0], 0), { raw: 0, score: 0 });
  same(model.score(strict, [0, 1], 0), { raw: 1, score: 1 });
  assert.equal(model.score(fill, { x: '  light ', y: 'wave', z: 'air' }, 0).raw, 2 / 3);
  assert.equal(model.score(match, { 0: 0, 1: 1, 2: 4 }, 0).raw, 0.5);
  same(model.score(one, 0, 2), { raw: 1, score: 0.5 });
  assert.equal(model.score(one, null, 0).raw, 0);
});

test('blank matching modes', () => {
  const blank = (answer, match) => ({ answer: [].concat(answer), options: null, match });
  assert.ok(model.blankCorrect(blank('x  + 1', 'trim'), ' x + 1 '));
  assert.ok(!model.blankCorrect(blank('X', 'trim'), 'x'));
  assert.ok(model.blankCorrect(blank('X', 'nocase'), 'x'));
  assert.ok(!model.blankCorrect(blank('a b', 'exact'), 'a  b'));
  assert.ok(model.blankCorrect(blank('x\\*\\*2|x\\*x', 'regex'), 'x*x'));
  assert.ok(!model.blankCorrect(blank('x', 'trim'), '   '));
});

test('plans draw from a bank, shuffle when asked, and stay stable for a seed', () => {
  const stack = model.normalize({ shuffle: { questions: true, options: true, retry: false }, quizzes: [
    { draw: 3, questions: Array.from({ length: 10 }, (_, i) => single('q' + i)) },
    { shuffle: false, questions: [single('a'), single('b')] }
  ] });
  const first = model.plan(stack, model.random(7));
  const again = model.plan(stack, model.random(7));
  const ids = (p) => p.map((part) => part.items.map((item) => item.question.id));
  assert.equal(first[0].items.length, 3);
  assert.equal(new Set(ids(first)[0]).size, 3);
  same(ids(first), ids(again));
  same(ids(first)[1], ['a', 'b']);
  same(first[1].items[0].order, [0, 1, 2]);
  const retry = model.plan(stack, model.random(7), true);
  same(retry[0].items.map((item) => item.order), retry[0].items.map(() => [0, 1, 2]));
});

test('aggregation builds time, quiz, and tag views', () => {
  const quizzes = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const views = model.aggregate([
    { quiz: 'a', label: 'Q1.1', tags: ['optics'], score: 1, time: 4000, hints: 0 },
    { quiz: 'a', label: 'Q1.2', tags: ['optics', 'waves'], score: 0, time: 2000, hints: 1 },
    { quiz: 'b', label: 'Q2.1', tags: ['waves'], score: 0.5, time: 6000, hints: 0 }
  ], quizzes);
  same(views.time.map((r) => r.value), [4, 2, 6]);
  same(views.quiz.map((r) => r.value), [50, 50]);
  same(views.tagScore.map((r) => [r.label, r.value]), [['optics', 50], ['waves', 25]]);
  same(views.tagTime.map((r) => r.value), [3, 4]);
  same(views.total, { score: 0.5, full: 1, count: 3, time: 12000, hints: 1 });
  assert.equal(model.clock(3725000), '1:02:05');
  assert.equal(model.clock(65000), '01:05');
});

test('custom types register once and join normalization and scoring', () => {
  assert.throws(() => quiz.defineType('single', { render() {}, score() {} }), /already defined/);
  assert.throws(() => quiz.defineType('Bad', { render() {}, score() {} }), /lowercase/);
  quiz.defineType('ordering', {
    normalize: (input, fail) => (Array.isArray(input.items) ? { items: input.items } : fail('needs items.')),
    render() {}, answered: () => true,
    score: (q, answer) => (answer || []).filter((item, i) => item === q.data.items[i]).length / q.data.items.length
  });
  const stack = model.normalize({ questions: [{ type: 'ordering', items: ['a', 'b', 'c', 'd'] }] });
  assert.equal(model.score(stack.quizzes[0].questions[0], ['a', 'b', 'd', 'c'], 0).raw, 0.5);
  assert.throws(() => model.normalize({ questions: [{ type: 'ordering' }] }), /question 1: needs items/);
  assert.ok(quiz.types().includes('ordering'));
});
