# Agent 任务教学实验

这是一个命令行实验：读取当前作品要求，借助 Codex 的成熟 Harness 写一章草稿，通过 MCP 保存，再读回真实内容。小说只是练习工具和状态判断的载体。本项目不实现模型与工具调度循环。

## 运行

需要 Node.js 24.12.0 或同系列更新版本、pnpm 11.20.0，以及正常可用的 Codex 登录或模型配置。依赖由本项目锁定；Codex SDK 使用项目内的 CLI，不更新全局 CLI，也不修改全局 Codex 配置。

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lab init
pnpm agent
pnpm lab chapter 1
```

`init` 创建人工编写的钟楼设定、用途、要求和单章大纲。初始化拒绝覆盖已有作品。模型生成的正文只出现在执行 `agent` 后；测试中的人工文字不属于模型成果。

可以用独立数据库重复实验，例如 `pnpm lab init --db data/另一轮.sqlite`，随后在 `agent` 和 `lab` 命令中使用同一个 `--db` 路径。

如需选择自己的模型或已安装 CLI，复制 `lab.config.example.json` 为 `lab.config.json`，可填写 `model` 或 `codexPathOverride`。默认不指定模型，采用正常 Codex 配置。配置中不放认证内容；登录由成熟运行环境处理。

## 查看结果和错误

每次执行返回独立任务标识、Harness 会话标识和记录目录 `runs/<任务标识>/`。`events.jsonl` 保存 SDK 返回的公开事件，`report.json` 保存运行状态及读取到的章节状态，`chapter.json` 保存结束时实际读取的正文。文学品质和设定语义仍需人阅读核对。

`completed` 是运行环境报告的结束状态；`draft` 是保存下来的稿件状态。它们不代表人已采用。若运行失败或取消，已成功保存的正文仍在数据库中；先读回，不能仅靠运行结束或失败推断产物存在与否。

```powershell
pnpm lab show
pnpm lab task 任务标识
pnpm lab chapter 1 --output data/正文与状态.json
pnpm agent --cancel-after-ms 5000
```

Ctrl+C 或取消参数使用 SDK 的 AbortSignal。取消时间只是实验触发条件，不保证模型恰好处于哪个步骤；以该次事件和数据库读取结果为准。

`pnpm lab save 草稿.json` 是人工保存入口，与 MCP 共享同一个业务函数。输入必须包含作品、章节、当前要求修订、当前正文修订、标题和正文。修改会生成新修订；旧修订提议得到 `STALE_CHAPTER`，原有正文保持。MCP 的 `save_draft` 只能保存草稿，不提供人工采用工具。本实验不宣称这些入口构成生产权限隔离。

## 改稿后接续

可以将单章大纲扩成三个连续章节。人工修改资料用 `update`；修改正文用 `save`；采用某个确切修订用 `adopt`，并写下自己的阅读判断。采用动作也产生新修订。作品资料与正文都有实际历史文本，可分别回查；采用状态是入口记录的决定，不是模型评分或程序自动品质认证。

```powershell
pnpm lab update seed/钟楼三章.json --expected-revision 1
pnpm lab work-version 1
pnpm lab save data/改稿提议.json
pnpm lab adopt 1 --expected-revision 2 --note "我读过这份草稿，决定采用当前开篇。"
pnpm agent --chapter 2 --resume-task 前一次任务标识
pnpm lab export data/三章草稿.md
```

改稿提议填写 `expectedPreviousRevisions`：第一章为 `[]`，第二章需列出第一章当前修订，第三章需列出前两章当前修订。若要求或前文已变化，保存分别返回 `STALE_WORK` 或 `STALE_PREVIOUS`，不会把旧依据静默当作新依据。

`--resume-task` 从业务任务记录取得真正的 Harness 会话标识，再调用 SDK `resumeThread`。接续的是对话，当前资料仍须重新读取。本次执行有自己的新任务标识，旧任务的取消或完成状态保持。每次只要求一章，由成熟 Harness 承担工具选择与执行；没有自行重放消息或循环调度模型。

导出包含按顺序排列的当前正文、修订、状态与采用说明。输出同时说明大纲是否全部有稿、资料基线是否仍一致。草稿、采用与资料变更不会被隐藏；这些状态均不代替人对文学品质的判断。

## 实现和范围

`agent.ts` 选择 `startThread` 或 `resumeThread`，调用一次 `runStreamed`，只消费事件、记录运行和核对产物。Codex 决定何时调用工具。`mcp.ts` 以官方 MCP SDK 提供 stdio 服务，业务日志写 stderr；`store.ts` 维护 SQLite 的当前资料、正文版本和任务记录；`cli.ts` 是人工入口。入口由 Zod 校验格式，业务入口检查对象、实际范围和基线；原子事务及主键维持修订一致性。

当前可单独调用 `read_work`、`read_chapter`、`list_chapters` 和 `save_draft`。初始化提供单章起点，也可用人工入口扩为三章。人工采用、资料更新和导出不开放为 Agent 的自行批准工具。

## 资源、提示与插件

MCP 另有当前作品要求和章节正文两种资源模板，目录只列出实际资料和已保存的章。`review_chapter` 返回检查方法与取得时的资料快照，不调用模型或改变采用状态。独立客户端验证入口：

```powershell
pnpm mcp:inspect --chapter 1 --output data/资源与提示.json
```

目录、读取内容和模型实际使用是不同环节；协议目录存在不代表每个宿主会自动采用资源和提示。本地插件将 `novel-chapter-task` Skill 与同一 MCP 组合。先构建、初始化并保存一章，再绑定自己的构建和数据库：

```powershell
pnpm plugin:prepare
pnpm plugin:add --output data/插件安装回执.json
try {
  pnpm plugin:catalog --output data/插件目录.json
  pnpm plugin:check --chapter 1
} finally {
  pnpm plugin:remove --output data/插件移除回执.json
}
```

这组命令用于临时安装、检查和移除本实验插件，开始前确认 `novel-practice@novel-agent-lab` 尚未安装，避免移除已有实验。`plugin:add` 由当前项目的官方 CLI 安装，只在用户配置中设置该插件的 `enabled=true`，不登记全局 marketplace。插件检查本身是独立的只读模型调用，记录真实会话、事件、已安装 Skill 的读取、工具读取与前后业务状态。检查结束后，`plugin:remove` 由官方 CLI 移除该插件的缓存和用户配置条目。以检查记录中的 `passed` 与实际读取结果为准；卸载命令成功不能代替检查成功。

项目配置写有默认停用插件，但项目配置是否进入本轮配置取决于宿主的信任和加载范围。普通 `agent` 入口另外通过本轮参数显式停用该插件，避免重复业务服务；插件检查入口通过本轮参数显式启用它。CLI 目录可能只显示 available；以宿主实际工具调用、Skill 读取路径和回读核对作为运行证据。

插件检查结束后归档这一轮检查会话，保留记录并释放该会话的运行资源；写作任务的会话仍保留用于接续。Windows 实跑曾在结束后短暂占用插件缓存，官方移除报告 `os error 32`。遇到这一反馈先查看检查的归档结果，再重试同一个插件的官方移除。移除成功后仍需核对该插件配置条目和缓存状态，不能凭结束消息认定清理完成。

`plugins/novel-practice/binding.json` 是忽略入 Git 的本地绑定，只含已构建 MCP 入口与数据库路径。插件启动脚本加载现有项目的服务和依赖，不携带第二份数据库。需要正常 PATH 中的 Node.js；插件本身不替你安装实验项目。换目录或独立 worktree 后重新执行 `plugin:prepare`，再由官方安装入口重新安装。已安装缓存可能保留此前绑定；只改源目录不代表宿主已经改用新路径。官方移除不删除仓库中的业务数据库，也不承诺清除平台独立的插件数据目录。

插件读取与保存工具沿用业务修订检查。当前插件检查不执行写入，其直接调用没有 `agent.ts` 的任务关联；完整生成、取消、会话接续和保存验收使用已有 `agent` 入口。不能把只读插件检查扩大成通过插件生成与保存的实测结论。

Node 24.12.0 的 `node:sqlite` 仍为实验性模块。本项目使用其同步数据库、参数绑定与事务，未依赖外部数据库服务。同步调用适合本实验规模，不以此证明大型并发系统的性能。
