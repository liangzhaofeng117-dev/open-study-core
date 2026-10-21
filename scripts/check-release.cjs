'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const required = ['README.md', 'CONTRIBUTING.md', 'MAINTAINERS.md', 'CHANGELOG.md', 'docs/pack-format.md', 'docs/provenance.json', 'src/index.cjs', 'bin/check-pack.cjs', 'examples/pack.json', 'tests/core.test.cjs', 'tests/cli.test.cjs', '.github/workflows/test.yml'];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
const blockers = [];
if (!fs.existsSync(path.join(root, 'LICENSE')) || pkg.license === 'UNLICENSED') blockers.push('许可证尚未由权利人确认并启用');
if (!pkg.repository) blockers.push('尚未配置目标仓库地址');
console.log(JSON.stringify({ structureReady: missing.length === 0, missingFiles: missing, runtimeDependencyCount: Object.keys(pkg.dependencies || {}).length, sourcePreparationReady: missing.length === 0 && blockers.length === 0, preparationBlockers: blockers, npmPublicationProtected: pkg.private === true, repositoryVisibility: 'not_checked_here', applicationEligibility: 'not_assessed_by_this_script' }, null, 2));
// 发布待办与代码损坏分别表达；本命令只验收本地准备结构。
if (missing.length) process.exitCode = 1;
