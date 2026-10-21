'use strict';

// 从知序备考的学习引擎提取；保留业务思路，去除题库、平台接口和个人状态。
const DAY = 86_400_000;
const INTERVALS = Object.freeze([1, 3, 7, 14, 30]);
const SECTIONS = Object.freeze(['sources', 'lessons', 'questions', 'tasks']);
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(value) && !BLOCKED.has(value);
const clone = value => JSON.parse(JSON.stringify(value));

function normalized(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.some(item => !idOK(item))) throw new TypeError('答案必须由有效的选项编号组成');
  return [...new Set(values)].sort();
}

function validateQuestion(question) {
  if (!isObject(question) || !idOK(question.id) || !idOK(question.exam)) throw new TypeError('题目编号或科目标识无效');
  if (!['single', 'multiple', 'judge'].includes(question.type)) throw new TypeError('题型无效');
  if (typeof question.stem !== 'string' || !question.stem.trim() || question.stem.length > 12_000) throw new TypeError('题干为空或过长');
  if (!idOK(question.sourceId)) throw new TypeError('题目必须关联有效来源编号');
  if (typeof question.explanation !== 'string') throw new TypeError('题目必须包含解析字段');
  if (question.pending !== undefined && typeof question.pending !== 'boolean') throw new TypeError('pending 必须是布尔值');
  if (question.assessment !== undefined && typeof question.assessment !== 'boolean') throw new TypeError('assessment 必须是布尔值');
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 12) throw new TypeError('题目需要 2—12 个选项');
  if (question.options.some(option => !isObject(option) || !idOK(option.id) || typeof option.text !== 'string' || !option.text.trim())) throw new TypeError('选项无效');
  const ids = question.options.map(option => option.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('选项编号重复');
  const answers = normalized(question.answer);
  if (answers.some(id => !ids.includes(id))) throw new TypeError('答案不在选项中');
  if (!question.pending && (!answers.length || (question.type !== 'multiple' && answers.length !== 1))) throw new TypeError('答案与题型不匹配');
  return question;
}

function utf8Bytes(text) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function validatePack(pack, { exams, requireSources = true } = {}) {
  if (!isObject(pack) || pack.schema !== 1) throw new TypeError('资料包必须使用 schema: 1');
  if (exams !== undefined && (!Array.isArray(exams) || !exams.length || exams.some(exam => !idOK(exam)))) throw new TypeError('exams 必须是非空科目标识数组');
  const encoded = JSON.stringify(pack);
  if (utf8Bytes(encoded) > 4_000_000) throw new RangeError('资料包超过 4,000,000 UTF-8 字节');
  for (const section of SECTIONS) {
    if (pack[section] !== undefined && !Array.isArray(pack[section])) throw new TypeError(section + ' 必须是数组');
    const seen = new Set();
    for (const row of pack[section] || []) {
      if (!isObject(row) || !idOK(row.id) || seen.has(row.id)) throw new TypeError(section + ' 存在无效或重复编号');
      seen.add(row.id);
      if (section === 'sources') {
        if (typeof row.title !== 'string' || !row.title.trim()) throw new TypeError('来源缺少标题');
        continue;
      }
      if (!idOK(row.exam) || (exams && !exams.includes(row.exam))) throw new TypeError('科目标识不在允许范围内');
      if (!idOK(row.sourceId)) throw new TypeError('内容必须关联有效来源编号');
      if (section === 'questions') validateQuestion(row);
      if (section === 'lessons' && (typeof row.title !== 'string' || !row.title.trim() || !Array.isArray(row.blocks) || !row.blocks.length || row.blocks.some(block => !isObject(block) || typeof block.text !== 'string'))) throw new TypeError('知识卡需要标题和正文块');
      if (section === 'tasks' && (typeof row.title !== 'string' || !row.title.trim() || typeof row.prompt !== 'string' || !row.prompt.trim() || !Array.isArray(row.checklist) || row.checklist.some(item => typeof item !== 'string'))) throw new TypeError('任务需要标题、内容和文本验收清单');
    }
  }
  if (requireSources) {
    const sourceIds = new Set((pack.sources || []).map(source => source.id));
    for (const section of ['questions', 'lessons', 'tasks']) {
      for (const row of pack[section] || []) if (!sourceIds.has(row.sourceId)) throw new TypeError('来源 ' + row.sourceId + ' 尚未提供');
    }
  }
  return pack;
}

// 对象字段顺序不构成内容修改，数组顺序仍保留语义。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function mergePack(base, addition, options = {}) {
  validatePack(base, { ...options, requireSources: false });
  validatePack(addition, { ...options, requireSources: false });
  const result = { schema: 1 };
  for (const section of SECTIONS) {
    const map = new Map((base[section] || []).map(row => [row.id, row]));
    for (const row of addition[section] || []) {
      if (map.has(row.id) && JSON.stringify(canonical(map.get(row.id))) !== JSON.stringify(canonical(row))) throw new Error('编号 ' + row.id + ' 内容冲突；修改内容请使用新版本编号');
      map.set(row.id, row);
    }
    result[section] = [...map.values()];
  }
  validatePack(result, { ...options, requireSources: true });
  return clone(result);
}

function timestamp(now) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new TypeError('时间戳无效');
}

function dayKey(now = Date.now(), utcOffsetMinutes = 480) {
  timestamp(now);
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw new RangeError('UTC 偏移应在 -720 到 840 分钟内');
  const date = new Date(now + utcOffsetMinutes * 60_000);
  if (!Number.isFinite(date.getTime())) throw new RangeError('偏移后的日期无效');
  return date.toISOString().slice(0, 10);
}

function emptyState() {
  return { schema: 1, questions: {}, activity: {}, history: [] };
}

function checkState(state) {
  if (!isObject(state) || state.schema !== 1 || !isObject(state.questions) || !isObject(state.activity) || !Array.isArray(state.history)) throw new TypeError('学习状态无效');
}

function grade(question, selected) {
  validateQuestion(question);
  if (question.pending) throw new Error('待核验题不能计分');
  const actual = normalized(selected), expected = normalized(question.answer);
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

function recordAttempt(state, question, selected, now = Date.now(), { utcOffsetMinutes = 480 } = {}) {
  checkState(state);
  timestamp(now);
  const correct = grade(question, selected);
  const previous = own(state.questions, question.id) ? state.questions[question.id] : { attempts: 0, correct: 0, wrong: 0, streak: 0 };
  if (!isObject(previous) || ['attempts', 'correct', 'wrong', 'streak'].some(key => !Number.isSafeInteger(previous[key]) || previous[key] < 0)) throw new TypeError('已有答题记录无效');
  const streak = correct ? previous.streak + 1 : 0;
  const days = correct ? INTERVALS[Math.min(streak - 1, INTERVALS.length - 1)] : 1;
  const due = now + days * DAY;
  timestamp(due);
  const day = dayKey(now, utcOffsetMinutes);
  const activity = own(state.activity, day) ? state.activity[day] : 0;
  if (!Number.isSafeInteger(activity) || activity < 0) throw new TypeError('当日活动记录无效');
  const answer = normalized(selected);
  state.questions[question.id] = {
    attempts: previous.attempts + 1, correct: previous.correct + Number(correct), wrong: previous.wrong + Number(!correct),
    streak, lastCorrect: correct, lastAnswer: answer.slice(), lastAt: now, due
  };
  state.activity[day] = activity + 1;
  state.history.push({ id: question.id, exam: question.exam, selected: answer.slice(), correct, at: now });
  state.history = state.history.slice(-1500);
  return correct;
}

function selectQuestions(questions, state, exam, mode = 'all', count = 10, now = Date.now()) {
  checkState(state);
  timestamp(now);
  if (!idOK(exam)) throw new TypeError('科目标识无效');
  if (!['all', 'unseen', 'due', 'wrong', 'unresolved', 'check'].includes(mode)) throw new TypeError('练习模式无效');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError('题量必须为 1—100 的整数');
  if (!Array.isArray(questions)) throw new TypeError('题目必须为数组');
  questions.forEach(validateQuestion);
  const ids = questions.map(question => question.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('题目编号重复');
  let pool = questions.filter(question => question.exam === exam && !question.pending);
  if (mode === 'check') pool = pool.filter(question => question.assessment);
  else if (['all', 'unseen'].includes(mode)) pool = pool.filter(question => !question.assessment);
  const record = question => own(state.questions, question.id) ? state.questions[question.id] : undefined;
  if (mode === 'unseen') pool = pool.filter(question => !record(question));
  if (mode === 'due') pool = pool.filter(question => Number.isFinite(record(question)?.due) && record(question).due <= now);
  if (mode === 'wrong') pool = pool.filter(question => record(question)?.wrong > 0);
  if (mode === 'unresolved') pool = pool.filter(question => record(question)?.lastCorrect === false);
  pool.sort((a, b) => {
    const difference = mode === 'due' ? record(a).due - record(b).due : (record(a)?.streak || 0) - (record(b)?.streak || 0);
    return difference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return pool.slice(0, count);
}

module.exports = { DAY, INTERVALS, idOK, normalized, validatePack, mergePack, dayKey, emptyState, grade, recordAttempt, selectQuestions };
