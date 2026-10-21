# 资料包 schema 1

顶层 `schema` 固定为 `1`；`sources`、`questions`、`lessons`、`tasks` 均为可选数组。默认校验完整包；分片只有在与既有来源一起合并后才可使用。

来源至少包含 `id`、非空 `title`。`url`、`license`、`author` 等可作为附加来源信息保存，但本库不核验它们的法律效力或真实性。

题目必填 `id`、`exam`、`type`、`stem`、`options`、`sourceId`、`explanation`。已核验题还必须有非空 `answer`。选项是 2—12 个 `{ id, text }` 对象；选项编号唯一，答案必须指向其中的编号。单选与判断题的答案仅含一个编号，多选题采用精确集合匹配。

`pending` 和 `assessment` 如果存在必须为布尔值。待核验题允许缺少答案或使用空数组；它仍须具有有效选项、来源及解析字段。`exam` 为任意有效 ID，可通过 `validatePack(pack, { exams: ['demo'] })` 限制允许的科目。

知识卡必填 `id`、`exam`、`title`、`sourceId`、非空 `blocks` 数组；每个块包含字符串 `text`。任务必填 `id`、`exam`、`title`、`prompt`、`sourceId`、字符串数组 `checklist`。不同内容段之间可使用相同 ID，同一段内不允许重复；提交给选题 API 的问题数组也不得有重复 ID。

完整题包的内容必须指向包内来源。`mergePack` 接受来源已经存在于另一分片的内容，但最终合并结果必须完整，合并后也会重新检查总字节上限。内容更新须换用新 ID，例如 `math-add-v2`，不能静默覆盖已学习题目或直接把待核验题改成同号已核验题。

输入应为 JSON 文档解析得到的数据。读入超大 JSON 文件时，宿主应在解析前限制文件大小，避免先解析再校验造成内存压力。此组件的容量检查不能代替文件上传或读取层的大小限制。
