# 工具与 Agent

通过《青岚修仙录》练习读取资料、生成草稿、真实保存和读回检查。

在此目录打开终端。首次使用安装一次依赖，模型任务沿用本机已有的 Codex 登录：

```powershell
pnpm install --frozen-lockfile
```

准备第一节并生成第一章：

```powershell
node 准备实验.mjs 01
pnpm agent --db data/01/novel.sqlite --chapter 1 --cancel-after-ms 180000
```

生成后，独立读回数据库中的完整正文：

```powershell
pnpm lab chapter 1 --db data/01/novel.sqlite
```

检查林青的身份、来意、放行过程和章末异常是否符合材料。保存状态为草稿，仍需人读正文判断。

每次运行的完整事件、汇报和结果保存在 `runs/` 中。失败或取消后也先读回；取消不会撤销已经完成的保存。数据库已存在时，准备命令会停止，已有内容保留。重做可用 `--db data/01-重做.sqlite`，之后生成和读回使用同一路径。

源码调整后运行 `pnpm build`，再用 `pnpm test` 检查工具读写和修订约束。

## 已有草稿后，Agent 怎样继续

第二节可从独立练习开始。准备命令把第一节的真实草稿人工载入新库，来源见 `materials/第一章来源.json`：

```powershell
node 准备实验.mjs 02
pnpm agent --db data/02/novel.sqlite --chapter 1 --cancel-after-ms 180000
pnpm lab chapter 1 --db data/02/novel.sqlite
```

先比较 `materials/第一章真实稿.json` 与读回结果，再看本轮记录中读取到的旧正文和保存修订。三章接续属于进一步观察，不需要先完成它才能做下一节。

## 比较谁来安排读取

第三节先比较两种方式：应用按固定顺序读取，或由 Agent 决定读取。两次均使用同一份真实第一章，每次自动建立独立练习库：

```powershell
pnpm compare --case existing --mode serial --cancel-after-ms 180000
pnpm compare --case existing --mode agent --cancel-after-ms 180000
```

对照终端给出的记录目录，看谁读取了什么、模型是否取得全文，以及数据库是否保持原样。其他方式 `routed`、`concurrent`、`mixed`，以及空稿 `empty`、缺失作品 `missing-work`，可按课程需要单独选择；每次只运行指定的一组。
