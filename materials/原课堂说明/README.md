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

## 实现和范围

`agent.ts` 调用一次 `startThread` 和 `runStreamed`，只消费事件、记录运行和核对产物。Codex 决定何时调用工具。`mcp.ts` 以官方 MCP SDK 提供 stdio 服务，业务日志写 stderr；`store.ts` 维护 SQLite 的当前资料、正文版本和任务记录；`cli.ts` 是人工入口。入口由 Zod 校验格式，业务入口检查对象、实际范围和基线；原子事务及主键维持修订一致性。

当前可单独调用 `read_work`、`read_chapter`、`list_chapters` 和 `save_draft`。初始化数据只有一章；本阶段不包含多章推进、人工采用、插件加载或资源与提示目录。对应能力在实际加入并运行后再用于课程。

Node 24.12.0 的 `node:sqlite` 仍为实验性模块。本项目使用其同步数据库、参数绑定与事务，未依赖外部数据库服务。同步调用适合本实验规模，不以此证明大型并发系统的性能。
