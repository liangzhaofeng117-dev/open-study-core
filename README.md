# Open Study Core · 知序学习内核

从知序备考小程序提取的通用 JavaScript 学习组件：带来源的 JSON 资料包校验、冲突安全的增量导入、精确判分、间隔复习和可复现的练习选题。适合希望把内容与学习逻辑分开的工具开发者。

**采用 MIT 许可证。** 代码维护账号为 `liangzhaofeng117-dev`，仓库地址为 https://github.com/liangzhaofeng117-dev/open-study-core 。包设置为 `private: true` 以防止误发布到 npm；GitHub 源码按 [MIT 许可证](LICENSE) 使用。当前没有已核实的外部用户或下载量。

## 快速运行

Node.js 18 或更高版本；无运行时依赖，也无需安装依赖。

```sh
git clone https://github.com/liangzhaofeng117-dev/open-study-core.git
cd open-study-core
npm test
npm run example
npm run check
npm run validate -- examples/pack.json --exam demo
```

## 直接校验自己的资料包

无需编写接入代码，也无需安装依赖即可运行：

```sh
node bin/check-pack.cjs /path/to/pack.json
node bin/check-pack.cjs /path/to/pack.json --exam math --exam language
node bin/check-pack.cjs --help
```

成功时向标准输出写入 JSON 汇总，包括来源、知识卡、题目、任务及待核验题数量；失败时向标准错误写入 JSON 错误。返回码 `0` 表示有效，`1` 表示 JSON、UTF-8 或题包内容错误，`2` 表示参数、文件读取或容量错误，可用于导入前校验或 CI。文件名以横线开头时使用 `--` 分隔选项和文件名。

CLI 只读取本地常规文件，不改写文件或上传内容；解析前限制最多读取 4,000,000 字节，拒绝不正确的 UTF-8，接受标准 UTF-8 BOM。它验证结构和引用，不核验知识正确性、来源真实性或内容授权。学习状态与个人资料仍由宿主应用保存。

## 作为组件接入

```js
const study = require('./src/index.cjs');
const pack = study.validatePack(require('./examples/pack.json'));
const state = study.emptyState();
const now = Date.parse('2026-10-22T02:00:00Z');

study.recordAttempt(state, pack.questions[0], ['A'], now);
const tomorrow = study.selectQuestions(
  pack.questions, state, 'demo', 'due', 10, now + study.DAY
);
console.log(tomorrow.map(question => question.id));
// ['math-add-v1']
```

示例仅包含本次编写的两道基础算术题。代码与既有小程序分离，不包含购买题库、教材正文、学习笔记、客户文稿、账号配置或个人学习状态。

## 功能与约定

| API | 作用 |
| --- | --- |
| `validatePack(pack, { exams?, requireSources? })` | 检查结构、编号、选项、答案、来源引用和 4,000,000 UTF-8 字节上限；默认检查来源完整性 |
| `mergePack(base, addition, { exams? })` | 合并资料片段；同号同内容幂等、同号改内容报错；结果始终必须有完整来源 |
| `grade(question, selected)` | 单选/多选/判断题精确匹配；多选顺序和重复项不影响结果 |
| `emptyState()` | 新建只含题目记录、每日活动和历史的学习状态 |
| `recordAttempt(state, question, selected, now?, { utcOffsetMinutes? })` | 原地更新状态并返回判分结果；不进行文件或网络操作 |
| `selectQuestions(questions, state, exam, mode?, count?, now?)` | 从有效题目按规则选取，模式为 `all/unseen/due/wrong/unresolved/check` |
| `dayKey(now?, utcOffsetMinutes?)` | 按固定 UTC 偏移生成日期，默认 +480 分钟（上海时间） |

连续答对的复习间隔依次为 1、3、7、14、30 天；以后维持 30 天。答错重置连续正确次数，次日复习。该规则是可解释的简单基线，未经学习效果实验验证，不代表科学最优间隔或考试通过概率。

`pending: true` 的题目不能计分或被选入练习。`assessment: true` 的留出题只在 `check` 或已做题的复习模式出现。`wrong` 保留历史错题；`unresolved` 仅保留最近一次答错的题。选题按连续正确次数、编号排序，到期模式按到期时间、编号排序；不随机打乱输入数组。

单次选题数量必须为 1—100 的整数。历史最多保留 1,500 次，累计答题计数不会因此清空。ID 采用 ASCII 字母、数字及 `._-`，禁止危险对象属性名。题包中对象字段顺序不同视为同一内容，数组顺序不同仍视为变化。

`validatePack` 返回原始对象；`mergePack` 返回与输入断开引用的新对象。答题状态属于可信应用内存，不是任意备份文件的恢复入口。加载外部备份需由宿主另做完整校验；本版不提供状态迁移。

## 数据与平台

完整示例见 `examples/pack.json`，格式见 [题包格式](docs/pack-format.md)。核心使用 CommonJS，直接在 Node.js 运行；浏览器或小程序接入需由宿主构建工具打包和适配存储。尚未完成跨浏览器或真机验证。固定时差不自动处理夏令时。

资料来源字段帮助追溯内容，不能自动证明内容授权。接入者应核实自己导入、分发的题目和教材权限。该库不联网、不采集数据、不调用大模型 API。

## 来源、贡献与维护

本组件改编自用户既有的知序备考学习引擎，提取与重写由 Codex 辅助完成；原始题库与平台代码未纳入。源文件摘要和变更范围记录在 [代码来源说明](docs/provenance.json)。原有小程序尚未切换到此组件，当前只是独立复用候选。

欢迎提交可复现的缺陷报告、题包兼容性案例和小范围修复；流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## English summary

An offline, dependency-free JavaScript core extracted from an existing study mini-program. It validates source-linked study packs, rejects conflicting imports, grades answers and schedules deterministic spaced review. The source is licensed under MIT. The package remains private to prevent accidental npm publishing. It ships only original arithmetic fixtures; no purchased question banks, textbooks or user data. No external adoption or usage claims are made.
