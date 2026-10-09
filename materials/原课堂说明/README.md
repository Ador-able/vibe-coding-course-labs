# 方法与业务入口组成的插件练习

我们把已经可用的小说工作台 MCP 与章节 Skill 组成一个本地 Codex 插件。方法说明怎样处理任务；MCP 调用当前业务；SQLite 保存作品、正文与修订。小说是练习载体，实验不实现模型或工具调度循环。

## 可运行起点

需要 Node.js 24.12.0、pnpm 11.20.0，以及可用的 Codex 登录或模型配置。依赖锁定在本项目，Codex SDK 与 CLI 为 0.160.0，MCP SDK 为 1.31.0。现有工作台的四工具、资源与提示保留；本节不新增业务函数或网页。人工入口是 CLI。

`vcm-08-05-start` 保留进入本节前的完整项目；完成点见下载包的版本清单。初始化资料来自人工编写的 `seed/钟楼.json`，其中没有模型生成正文。每轮使用新的数据库，`init` 拒绝覆盖已有作品。

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm lab init seed/钟楼.json --db data/我的插件实验.sqlite
pnpm plugin:prepare --db data/我的插件实验.sqlite
```

插件的 `binding.json` 只绑定本机已经构建的服务与数据库路径，不放认证。移动项目后重新绑定，再重新安装；源目录改变不代表已安装缓存改变。插件不会替你安装项目依赖。

## Codex 插件入口

`.agents/plugins/marketplace.json` 是本地发现入口；`plugins/novel-workbench-course/plugin.json`、`mcp.json`、`skills/` 是插件内容。`serve.mjs` 只启动原有业务服务，既不复制数据库，也不调度模型。

插件 ID 为 `novel-workbench-course@novel-workbench-course-lab`。先确认自己的配置里没有这个已在使用的同名插件，再临时安装本实验。官方 CLI 会写入此插件的启用项；实验结束由同一官方入口移除。本轮参数中的其他插件、技能与记忆覆盖不修改用户全局文件。

```powershell
pnpm plugin:add --output runs/插件安装.json
try {
  pnpm plugin:catalog --output runs/插件目录.json
  pnpm plugin:preflight --out runs/目录初查
  pnpm plugin:preflight --out runs/目录复查
  pnpm plugin:preflight --out runs/目录确认
  pnpm plugin:observe --db data/我的插件实验.sqlite --prompt seed/插件任务.txt
} finally {
  pnpm plugin:remove --output runs/插件移除.json
}
```

预检只通过官方 app-server 查询实际目录并归档自己的预检会话，不发送模型任务，不执行业务工具。首次查询记录本机实际其他工具与技能；随后生成本进程的停用覆盖，再检查实际目录。只有 `isolated`、`skillsIsolated` 与 `memoryIsolated` 均为真，且本插件两个 Skill 可见，模型观察入口才继续。目录错误或宿主退出保留原始反馈，不能据源配置认定已隔离。

模型观察入口只调用一次官方 SDK `runStreamed`，公开事件、完整提示、工具参数与返回、最终回答、运行前后五表保存到独立的 `runs/<标识>/`。结束通过官方 `thread/archive` 归档自己的会话。模型的 shell 读取用于方法正文与按需参考；业务读写仍由 MCP 完成。

## 读取真实结果

```powershell
pnpm lab chapter 1 --db data/我的插件实验.sqlite --output runs/我的完整章节.json
pnpm lab show --db data/我的插件实验.sqlite
```

检查实际正文、作品修订、章节修订与 `draft` 状态。方法被读取、保存调用完成、稿件符合任务和人工采用是不同的结果。MCP 的 `save_draft` 没有采用权限。人工阅读后，若决定采用，使用 `adopt` 填真实当前修订与阅读理由；不为演示状态而自动采用。

```powershell
pnpm lab adopt 1 --db data/我的插件实验.sqlite --expected-revision 当前修订 --note "填写自己的阅读决定"
```

资料变化返回 `STALE_WORK`，目标章变化返回 `STALE_CHAPTER`，前文变化返回 `STALE_PREVIOUS`。先读变化的完整材料并重新判断，不能仅换数字再保存旧稿。失败或取消不等于数据库没有产物，应查询实际章节。

## 另一宿主的原生组合

OpenCode 1.18.34 原生支持 MCP 与 Agent Skills。本实验使用 `hosts/opencode/opencode.json` 复用同一服务与 Skill 文件，没有把 OpenAI 的 `plugin.json` 当作 OpenCode 插件格式。OpenCode 的原生插件是其自己的 JS/TS 或 npm 扩展；本轮没有新建这类扩展，也没有接 Hook。

`scripts/opencode-local.mjs` 将配置、数据、缓存与状态限定在本实验目录；只在子进程使用配置。供应商沿用已有合法百炼北京入口，当前默认模型为 `qwen-plus`，官方 `@ai-sdk/openai-compatible` 与 `{env:COURSE_QWEN_API_KEY}` 占位符；`enable_thinking:false` 是请求选项，32K/4096 是本实验预算，不是模型最大规格或免费额度。配置保留 `qwen-flash` 的同类模型条目，历史运行用它执行过两轮。默认主模型与小模型均为 `qwen-plus`。

自己的密钥文件只需 `API_KEY=...`，不放进项目或下载包。下面的文件路径须换成自己已有授权的文件。脚本只将这个字段传入当前子进程，不创建全局认证记录。公开输入记录只保留变量占位符；密钥值不保存或显示。

```powershell
pnpm lab init seed/钟楼.json --db data/我的另一宿主.sqlite
pnpm host:opencode --db data/我的另一宿主.sqlite --out runs/另一宿主目录 -- mcp list
pnpm host:opencode --db data/我的另一宿主.sqlite --out runs/另一宿主技能 -- debug skill
pnpm host:observe --db data/我的另一宿主.sqlite --env-file "自己的授权密钥文件完整路径"
pnpm lab chapter 1 --db data/我的另一宿主.sqlite --output runs/另一宿主完整章节.json
```

原提示从 stdin 送入原生命令，避免 Windows 参数传递把整句提示加上字面外引号。每次保留原生 JSON 事件与 `export` 的完整会话，再对照真实数据库。模型与宿主同时变化，这不构成严格同模型效果比较。供应商目录的费用字段不代替实际费用依据。

## 已发生的结果与边界

Codex 最小复做实际读取方法与保存参考，调用六次 MCP，保存并读回完整第 1 章，正文为 842 个基本汉字，状态为草稿。任务表为空，因为这次直接从插件进入，没有原有 `agent` 入口的业务任务关联；它不证明长期任务、中断恢复或 Hook 检查已完成。

OpenCode 的 Big Pickle 首次返回 403，没有业务调用或写入。随后 `qwen-flash` 的同一任务可以保存，但没有读取 Skill，没有保存后读回，正文仅 220 个基本汉字，却报告“约 1050”。原会话收到明确人工纠正反馈后加载了核心，却误把本地参考当 MCP 资源；保存并读回 r2，正文仍仅 250 个基本汉字，篇幅和开门过程未达标。原 r1 完整保留。

最后一次使用新空数据库和独立会话，业务资料、方法与自然请求不变；模型换成 `qwen-plus`，宿主指引补清本地参考的普通 `read` 入口。这两项共同改变，不能分离归因或给模型排名。它实际加载核心、读取完整参考，完成六次 MCP 调用以及保存后读回和目录核对；全文与人工入口、持久状态一致。这证明方法与业务能力在另一宿主接通。正文却只有 336 个基本汉字、397 个非空白字符，而自报 1098，且未明确学徒、首次到镇与守塔人开门，整章任务仍未完成。入口接通、方法采用与产物符合任务分别判断，所有失败保留，不自动重试或人工补稿。

首次 Codex 试跑实际读取过全局课程记忆，不能作为只有插件与当前资料的证据。原始记录留在作者本机；公开实验材料保留调用事实并省略任务无关记忆文本，明确说明省略范围。随后按官方配置关闭记忆与其他方法，重新完成同一任务。公开证据中的隔离复做保留全部 SDK 事件；最终纯预检使用当前 `features.memories=false`，没有为弃用提示再增加模型调用。

原有 `pnpm agent` 入口仍保留，它与插件入口分别启用同一业务服务，不在同一运行中重复连接。现有取消、会话接续与任务记录的课程成果也保留，本节没有复测或扩大它们的结论。

Node 24.12.0 的 `node:sqlite` 仍为实验性模块。同步数据库适合当前规模；这不证明生产并发性能或完整生产权限隔离。
