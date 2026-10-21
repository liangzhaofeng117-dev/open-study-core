'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/index.cjs');
const demo = require('../examples/pack.json');
const copy = () => structuredClone(demo);
const now = Date.parse('2026-10-22T02:00:00Z');

test('原创完整题包可加载，自定义科目可限制', () => {
  assert.equal(core.validatePack(demo), demo);
  assert.throws(() => core.validatePack(demo, { exams: ['other'] }), /科目/);
});

test('空对象、坏结构、非法选项和伪布尔值被拒绝', () => {
  assert.throws(() => core.validatePack(null));
  for (const value of [null, {}, 'questions']) {
    assert.throws(() => core.validatePack({ schema: 1, questions: value }));
  }
  const malformed = [
    q => q.options.push(null), q => q.options[0] = { id: 'A', text: null },
    q => q.answer = ['Z'], q => q.pending = 'false', q => q.assessment = 1,
    q => q.options.push(q.options[0]), q => q.answer = [], q => q.stem = ''
  ];
  for (const mutate of malformed) { const pack = copy(); mutate(pack.questions[0]); assert.throws(() => core.validatePack(pack)); }
});

test('重复编号、危险键和缺少来源均不进入题包', () => {
  const pack = copy(); pack.questions.push(pack.questions[0]);
  assert.throws(() => core.validatePack(pack), /重复/);
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const attack = copy(); attack.questions[0].id = id;
    assert.throws(() => core.validatePack(attack), /编号/);
  }
  const missing = copy(); missing.sources = [];
  assert.throws(() => core.validatePack(missing), /来源/);
  assert.equal({}.polluted, undefined);
});

test('容量按 UTF-8 字节计算，中文超限不能绕过', () => {
  const pack = copy(); pack.sources[0].description = '中'.repeat(1_340_000);
  assert.throws(() => core.validatePack(pack), /UTF-8/);
});

test('重复导入与对象键重排幂等，返回值与输入不共享可变引用', () => {
  const reordered = copy(); reordered.questions[0] = Object.fromEntries(Object.entries(reordered.questions[0]).reverse());
  const merged = core.mergePack(demo, reordered);
  assert.equal(merged.questions.length, 2);
  merged.questions[0].stem = 'changed';
  assert.notEqual(demo.questions[0].stem, 'changed');
});

test('同号修改被拒绝；无效导入不改变原包', () => {
  const snapshot = JSON.stringify(demo), changed = copy(); changed.questions[0].answer = ['A'];
  assert.throws(() => core.mergePack(demo, changed), /冲突/);
  const missing = { schema: 1, questions: [{ ...demo.questions[0], id: 'new-v1', sourceId: 'missing' }] };
  assert.throws(() => core.mergePack(demo, missing), /来源/);
  assert.equal(JSON.stringify(demo), snapshot);
});

test('分片可引用已有来源，合并后总容量再次校验', () => {
  const extra = { schema: 1, questions: [{ ...demo.questions[0], id: 'new-v1' }] };
  assert.equal(core.mergePack(demo, extra).questions.length, 3);
  const base = copy(), addition = { schema: 1, sources: [{ id: 'source-two', title: '新来源', description: 'x'.repeat(2_100_000) }] };
  base.sources[0].description = 'x'.repeat(2_100_000);
  assert.throws(() => core.mergePack(base, addition), /UTF-8/);
});

test('多选顺序及重复项不影响判分，漏选多选无效项判错', () => {
  const question = demo.questions[1];
  assert.equal(core.grade(question, ['C', 'A', 'C']), true);
  for (const answer of [[], ['A'], ['A', 'B', 'C'], ['A', 'C', 'Z']]) assert.equal(core.grade(question, answer), false);
  assert.equal(core.grade(demo.questions[0], null), false);
  assert.throws(() => core.grade(question, [null]));
});

test('待核验题不能计分，也不会改变记录', () => {
  const state = core.emptyState(), question = { ...demo.questions[0], pending: true, answer: [] };
  assert.throws(() => core.recordAttempt(state, question, ['A'], now), /待核验/);
  assert.deepEqual(state, core.emptyState());
});

test('复习间隔逐级增长，答错后重置连续正确数和间隔', () => {
  const state = core.emptyState(), question = demo.questions[0];
  for (let index = 0; index < 7; index++) {
    core.recordAttempt(state, question, ['B'], now);
    assert.equal(state.questions[question.id].due, now + core.INTERVALS[Math.min(index, 4)] * core.DAY);
  }
  core.recordAttempt(state, question, ['A'], now);
  assert.equal(state.questions[question.id].streak, 0);
  assert.equal(state.questions[question.id].due, now + core.DAY);
  assert.equal(state.questions[question.id].wrong, 1);
});

test('每日、留出、待核验、跨科目题目隔离', () => {
  const normal = demo.questions[0], held = { ...normal, id: 'holdout', assessment: true };
  const rows = [normal, held, { ...normal, id: 'pending', pending: true }, { ...normal, id: 'other-exam', exam: 'other' }];
  const state = core.emptyState();
  assert.deepEqual(core.selectQuestions(rows, state, 'demo').map(q => q.id), [normal.id]);
  assert.deepEqual(core.selectQuestions(rows, state, 'demo', 'check').map(q => q.id), ['holdout']);
  core.recordAttempt(state, held, ['A'], now);
  assert.deepEqual(core.selectQuestions(rows, state, 'demo', 'due', 10, now + core.DAY).map(q => q.id), ['holdout']);
});

test('due 包含到期瞬间，错题修正后仍保留历史但不再计为未解决', () => {
  const state = core.emptyState(), question = demo.questions[0];
  core.recordAttempt(state, question, ['A'], now);
  assert.equal(core.selectQuestions(demo.questions, state, 'demo', 'due', 10, now + core.DAY - 1).length, 0);
  assert.equal(core.selectQuestions(demo.questions, state, 'demo', 'due', 10, now + core.DAY).length, 1);
  core.recordAttempt(state, question, ['B'], now + core.DAY);
  assert.equal(core.selectQuestions(demo.questions, state, 'demo', 'unresolved').length, 0);
  assert.equal(core.selectQuestions(demo.questions, state, 'demo', 'wrong').length, 1);
});

test('选择顺序可复现，输入数组保持原顺序', () => {
  const rows = [demo.questions[1], demo.questions[0]], snapshot = rows.slice();
  const state = core.emptyState();
  assert.deepEqual(core.selectQuestions(rows, state, 'demo').map(q => q.id), ['math-add-v1', 'math-even-v1']);
  assert.deepEqual(rows, snapshot);
  core.recordAttempt(state, rows[1], ['B'], now);
  assert.deepEqual(core.selectQuestions(rows, state, 'demo', 'unseen').map(q => q.id), ['math-even-v1']);
});

test('上海午夜和 UTC 偏移边界明确，不接受非法时间与偏移', () => {
  const boundary = Date.parse('2026-10-21T16:00:00Z');
  assert.equal(core.dayKey(boundary - 1), '2026-10-21');
  assert.equal(core.dayKey(boundary), '2026-10-22');
  assert.equal(core.dayKey(boundary, 0), '2026-10-21');
  assert.throws(() => core.dayKey(NaN));
  assert.throws(() => core.dayKey(now, 841));
});

test('历史上限和答题统计正确，调用者答案数组不能事后改写记录', () => {
  const state = core.emptyState(), answer = ['B'];
  core.recordAttempt(state, demo.questions[0], answer, now);
  answer[0] = 'A';
  assert.deepEqual(state.questions['math-add-v1'].lastAnswer, ['B']);
  state.history[0].selected[0] = 'A';
  assert.deepEqual(state.questions['math-add-v1'].lastAnswer, ['B']);
  for (let index = 0; index < 1501; index++) core.recordAttempt(state, demo.questions[0], ['B'], now);
  assert.equal(state.history.length, 1500);
  assert.equal(state.questions['math-add-v1'].attempts, 1502);
});

test('非法状态、题量和模式在写入前失败', () => {
  const state = core.emptyState(); state.activity[core.dayKey(now)] = 'bad';
  const before = JSON.stringify(state);
  assert.throws(() => core.recordAttempt(state, demo.questions[0], ['B'], now));
  assert.equal(JSON.stringify(state), before);
  for (const count of [0, -1, 101, 2.5, NaN]) assert.throws(() => core.selectQuestions(demo.questions, core.emptyState(), 'demo', 'all', count));
  assert.throws(() => core.selectQuestions(demo.questions, core.emptyState(), 'demo', 'misspelled'));
});
