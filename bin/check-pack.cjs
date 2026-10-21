#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { TextDecoder } = require('node:util');
const { validatePack, idOK } = require('../src/index.cjs');
const MAX_BYTES = 4_000_000;
const HELP = 'Usage: node bin/check-pack.cjs <file.json> [--exam <id>]\nRepeat --exam to allow multiple subjects. Use -- before a filename starting with a dash.\nExit codes: 0 valid, 1 invalid content, 2 usage or file error.\n';

function argumentsFor(args) {
  let file, positionalOnly = false;
  const exams = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!positionalOnly && arg === '--') { positionalOnly = true; continue; }
    if (!positionalOnly && arg === '--exam') {
      const exam = args[++index];
      if (!idOK(exam)) throw new Error('--exam requires a valid subject ID');
      exams.push(exam);
    } else if (!positionalOnly && arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else if (file !== undefined) throw new Error('Provide exactly one JSON file');
    else file = arg;
  }
  if (!file) throw new Error('Provide a JSON file');
  return { file, exams: exams.length ? [...new Set(exams)] : undefined };
}

function failure(code, message, exitCode) {
  process.stderr.write(JSON.stringify({ ok: false, code, message }) + '\n');
  process.exitCode = exitCode;
}

function readBounded(file) {
  // 解析之前限制文件与读取字节，避免无界 readFile 后才检查容量。
  if (!fs.statSync(file).isFile()) throw new Error('Input must be a regular file');
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Input must be a regular file');
    if (stat.size > MAX_BYTES) throw new Error('Input exceeds 4,000,000 bytes');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (used > MAX_BYTES) throw new Error('Input exceeds 4,000,000 bytes');
    return bytes.subarray(0, used);
  } finally { fs.closeSync(fd); }
}

function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(HELP); return; }
  let options;
  try { options = argumentsFor(args); }
  catch (error) { failure('USAGE', error.message, 2); return; }
  let bytes;
  try { bytes = readBounded(options.file); }
  catch (error) { failure('INPUT_ERROR', error.message, 2); return; }
  try {
    // 严格拒绝坏的 UTF-8；标准 UTF-8 BOM 由解码器处理。
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const pack = validatePack(JSON.parse(content), { exams: options.exams });
    const counts = Object.fromEntries(['sources', 'lessons', 'questions', 'tasks'].map(section => [section, (pack[section] || []).length]));
    counts.pending = (pack.questions || []).filter(question => question.pending).length;
    counts.assessment = (pack.questions || []).filter(question => question.assessment).length;
    process.stdout.write(JSON.stringify({ ok: true, schema: pack.schema, counts }) + '\n');
  } catch (error) { failure('INVALID_PACK', error.message, 1); }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { argumentsFor, readBounded, main };
