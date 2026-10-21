'use strict';
const { validatePack, emptyState, recordAttempt, selectQuestions, DAY } = require('../src/index.cjs');
const pack = validatePack(require('./pack.json'));
const state = emptyState();
const now = Date.parse('2026-10-22T02:00:00Z');
recordAttempt(state, pack.questions[0], ['A'], now);
console.log(JSON.stringify({ correct: state.questions['math-add-v1'].lastCorrect, dueToday: selectQuestions(pack.questions, state, 'demo', 'due', 10, now).map(q => q.id), dueTomorrow: selectQuestions(pack.questions, state, 'demo', 'due', 10, now + DAY).map(q => q.id) }, null, 2));
