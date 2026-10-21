'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../bin/check-pack.cjs');
const fixture = path.resolve(__dirname, '../examples/pack.json');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 5_000 });
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-study-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('CLI validates from another directory without changing input or writing files', t => {
  const dir = temp(t), before = fs.readFileSync(fixture);
  const result = run([fixture, '--exam', 'demo'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, schema: 1, counts: { sources: 1, lessons: 0, questions: 2, tasks: 0, pending: 0, assessment: 0 } });
  assert.equal(result.stderr, '');
  assert.deepEqual(fs.readFileSync(fixture), before);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('CLI differentiates invalid content, missing files and usage errors', () => {
  const invalid = run([fixture, '--exam', 'other']);
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_PACK');
  const missing = run([path.resolve(__dirname, 'does-not-exist.json')]);
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).code, 'INPUT_ERROR');
  for (const args of [[], ['--exam'], ['--unknown'], [fixture, fixture], [fixture, '--exam', '__proto__']]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stderr).code, 'USAGE');
    assert.equal(result.stdout, '');
  }
});

test('CLI supports multiple permitted subjects, help and dash-prefixed filenames', t => {
  const dir = temp(t);
  fs.copyFileSync(fixture, path.join(dir, '-pack.json'));
  assert.equal(run(['--exam', 'other', '--exam', 'demo', '--', '-pack.json'], dir).status, 0);
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Exit codes/);
});

test('CLI rejects malformed JSON and corrupt UTF-8, accepts UTF-8 BOM', t => {
  const dir = temp(t), file = path.join(dir, 'pack.json');
  for (const bytes of [Buffer.from('{broken'), Buffer.from([0xff, 0xfe, 0x7b])]) {
    fs.writeFileSync(file, bytes);
    const result = run([file]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).code, 'INVALID_PACK');
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(fixture)]));
  assert.equal(run([file]).status, 0);
});

test('CLI rejects oversized inputs and directories before JSON parsing', t => {
  const dir = temp(t), file = path.join(dir, 'large.json');
  fs.writeFileSync(file, Buffer.alloc(4_000_001, 0x20));
  const large = run([file]);
  assert.equal(large.status, 2);
  assert.match(JSON.parse(large.stderr).message, /4,000,000/);
  assert.equal(run([dir]).status, 2);
});
