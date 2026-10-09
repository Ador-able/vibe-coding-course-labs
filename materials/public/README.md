# AI查资料与问人的课堂材料

这里保留同一份完整第一章和背景、四份当前任务、一次条件一次运行的公开原件。小说是练习材料，目标是判断可查事实、未知目标、未定偏好与要求冲突。产物均为草稿，没有保存到小说业务库，没有真人文学评分或发布决定。

## 直接做练习

选择materials/a中的chapter-one.md、background.md、current-task.md，上传至能读取附件的现有AI工具。使用frozen-inputs.json中该条件的完整prompt。另开对话，分别换用b、c、d的材料。无需安装本项目的SDK，也不要在同一对话里连续切换四份要求。

先预测应当查什么或问谁，再对照完整回复。核对已经给出的节奏是否使用、目标问题是否改变产物、偏好与冲突是否留给负责判断的人。四份条件是课堂构造，不据它们估计模型可靠率。

## 查看真实记录

公开运行目录runs/2026-10-02T13-41-12-237Z，各条件均保留input.json、events.jsonl、report.json、final-response.txt。完整章稿与最后的公开agent_message逐字一致。全部失败保留，没有重抽。

Node24.12.0、pnpm11.20.0，Codex SDK与CLI均固定0.160.0。四次新会话使用同一实际入口配置，没有显式设置型号，也没有生效型号证据。读取、工具和耗时以公共记录为准，不用模型自述或本轮结束推断保存成功。

四次都先尝试Windows read-only Shell，因sandbox辅助程序启动失败返回exit -1；随后实际调用正常入口已有的node_repl MCP，只读取本轮三个课堂文件。node_repl不是安装SDK自动提供的工具，也不是小说业务MCP。复制本项目但没有同样可用的工具，不能保证复制这条运行路径；主练习直接上传文件，不依赖这个环境。

诊断只读证据在diagnostics/。默认new Codex()确实解析已安装平台包的bin/codex.exe，实际--version为codex-cli0.160.0。实际Shell报os error 3，但后续stat显示所报辅助程序exe存在，根因未确定。

## 本机记录脚本

独立package.json与pnpm-workspace.yaml隔离于父项目。依赖本地安装，使用官方CLI已有认证；不复制、打印认证内容，不更新全局配置或修改第三方源码。

1. pnpm install --frozen-lockfile
2. pnpm run materials（只按冻结内容重新生成本地课堂材料，不调用模型）
3. Windows x64可执行node inspect-entry.mjs，核对默认解析路径、文件SHA与--version；它不调用模型。
4. 仅在已具备可读取这三个文件的同样入口工具条件时执行pnpm run run。此命令会按a到d顺序启动四个模型会话，各180秒取消条件，保留失败和公开结果。不把本机额外工具当默认SDK能力，也不保证模型重复输出相同文字。

run.mjs用公开codexPathOverride选中本项目固定官方平台程序；条件输入运行前逐字核对，不因看到结果而改写。read-only、approval never、网络与网页搜索关闭、low effort。计时包括本轮工具失败及后续读取，不是纯生成耗时。内部思维不是教学证据，记录只保留公开事件和最终文字。
