# 复用业务函数的双工具 MCP 实验

这个实验观察已有业务怎样成为 AI 可以调用的能力。小说是练习载体。人工命令和 MCP 调用共享 `Store`、输入定义及同一份 SQLite 内容，不另存 MCP 专用稿件。工作台是命令行入口，没有图形页面。

## 固定起点与完成点

`vcm-08-02-start` 指向 `3c6dde16004469f3fc36ba417804a65880ee43e5`。它已经有人工查看、编辑、持久保存、四工具 MCP 服务、成熟 Harness 和历史模型运行。这个起点不是没有 MCP 的空项目。

`vcm-08-02-end` 保留这些能力，并提供 `src/mcp-two-tools.ts` 的双工具入口及 `scripts/exercise-two-tools.mjs` 的独立调用实验。起点与完成点共享原有业务函数；本节新增的是范围清楚的接入层和观察方法。

已实际运行的双工具代码提交是 `6617e3953c0a1425d5345c854ee09a43ff40888d`，运行标识为 `03ba0552-8582-4dbf-9deb-8412b9f005ac`。完成点另包含说明与这轮证据，代码版本与运行标识分别辨认。

## 本地运行

本次环境是 Node.js 24.12.0、pnpm 11.20.0，MCP SDK 锁定 1.31.0。实际协商协议为 2025-11-25。安装与构建只在本项目执行，不改全局宿主配置。当前 MCP 2026-07-28 和 SDK v2 的初始化、包名与注册方式另有变化，不能混入本项目的固定接口。

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm mcp:exercise
```

实验每次创建新的 `runs/mcp-two-<UUID>/novel.sqlite`，输出本次完整路径，不复用历史业务库。运行不需要模型登录、不调用模型。Node.js 的 SQLite 实验性提示写入 stderr，不是一次工具执行失败。

脚本先直接调用业务函数，初始化作品 `mcp-clocktower`，确认未写第二章返回 `null`，保存人工第一章 r1，再关闭并重新打开资料库核对持久保存。随后官方 `Client` 启动双工具服务，发现工具、读取要求、保存人工准备的正文为 r2，再通过独立人工 CLI 完整读回。之后检查旧正文基线、无效章号、缺少作品，以及人将当前章改成 r3 后的旧提议。

双工具只提供 `read_work` 和 `save_draft`。它没有读取章节接口；当前正文与前文修订由人工 CLI 查看、判断和提供。它可以被兼容客户端调用，不足以让一个 Agent 独立读取全部前文并完成多章写作。已有 `dist/mcp.js` 的四工具入口供成熟 Harness 使用。

## 人工查看和编辑

运行结束后把输出的数据库绝对路径填入 `$experimentDb`。以下命令读取的是本次数据库中真实保存的内容。

```powershell
$experimentDb = '本次输出的数据库绝对路径'
pnpm lab show --db $experimentDb --work mcp-clocktower
pnpm lab chapter 1 --db $experimentDb --work mcp-clocktower --output 当前正文.json
pnpm lab chapter 2 --db $experimentDb --work mcp-clocktower
```

当前第一章应是 r3、标题“人的改稿”，完整正文为“【人工修改】林澈退后一步，等守塔人说明条件。”；第二章返回 `null`。作品要求仍为修订 1。改稿通过 `pnpm lab save` 提交完整草稿输入，不直接改 SQLite。

```powershell
pnpm lab save 人工改稿提议.json --db $experimentDb --work mcp-clocktower
pnpm lab chapter 1 --db $experimentDb --work mcp-clocktower
```

提议需包括 `workId`、`chapterNumber`、`expectedWorkRevision`、`expectedChapterRevision`、`expectedPreviousRevisions`、`title`、`body`。第一章的前文基线为 `[]`；此轮结束后的第一章当前修订为 3。新的人工改稿成功后为 r4，始终作为草稿等待人判断。

## 调用链与反馈

`Client.callTool` → SDK 接收、检查输入 → 双工具处理函数 → `Store.getWork` 或 `Store.saveDraft` → 返回真实对象 → SDK 返回结果。CLI 也调用同一个 Store。MCP 负责对外描述、连接与返回，资料库负责作品身份、要求及正文修订和原子保存。

业务失败返回 `isError: true` 和含 `code/message` 的文本。实际无效章号由固定 SDK 返回工具错误结果，文本包含 `-32602`；这条公开消息仍是 JSON-RPC `result`，不能仅凭文本中的编号判断为顶层协议错误。未写章节是成功查询的 `null`；缺作品是 `WORK_NOT_FOUND`。

服务日志使用 `console.error`，不向承载协议的 stdout 输出说明。示例保留 SDK 的成熟传输实现，没有自己编排模型循环或手工重写 JSON-RPC。

## 关闭与实际范围

脚本在正常运行、调用者读取后故意抛错，以及没有待执行写入时终止服务三种情况下结束连接。三轮的关闭后 PID 均为空。断连后再次读取实际抛出 `Not connected`。人的 r3 内容在三种连接结束后保持。

这里没有在写入进行中终止服务，没有测试网络超时、远程 HTTP 或 ChatCut 调用，也不证明连接中断会撤回写入。若写入后失去回执，应先查真实业务状态，不原样重试写入。

官方 Client 这轮的正文和参数由人准备。`save_draft` 固定将入口标记为 `origin: 'agent'`，这个字段不证明正文由模型生成；这轮 `taskId/threadId` 都为空。模型是否参与要回查真实模型事件。

## 既有真实模型保存

`evidence/02-三章接续真实运行/` 保存另一次真实成熟 Harness 任务。第 2 章任务是 `01c3ac84-3f42-4853-b153-5f896625cfff`，代码提交 `bb6b4b344f8dddc215e76baf74eff7e5ce9f42ea`，Harness 会话 `01a0fbde-cf97-7792-97b0-3618469f1835`。它使用已有四工具入口 `novel_lab`，不是本节双工具实验。

这次模型实际读作品要求 r2、第 1 章 r3、第 2 章空结果和目录，生成正文并提交 `save_draft`，随后调用 `read_chapter/list_chapters`。第 2 章保存为 r1、draft，依据第一章 r3；保存返回的完整对象与 MCP 读回和独立 CLI 读回一致。1103 是正文字符串字符数，包含标点等，不是 token 数或中文汉字计数。完整 Prompt、事件、返回及文学判断范围均保留。第一章的采用是编者的教学动作，不代表真实用户认可文学品质。

本节不重复付费调用，也不把工具接通、运行完成、人工采用或文学品质判断混为同一件事。
