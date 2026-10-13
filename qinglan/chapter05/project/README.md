# 工具与 Agent

通过《青岚修仙录》练习读取资料、生成草稿、真实保存和读回检查。

在此目录打开终端。沿用仓库根安装好的依赖，模型任务沿用本机已有的 Codex 登录：

```powershell
pnpm build
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

## 人的决定怎样进入下一轮

第四节使用一个尚未选定章末方向的新练习库：

```powershell
node 准备实验.mjs 04
pnpm agent --db data/04/novel.sqlite --chapter 1 --cancel-after-ms 180000
pnpm lab chapter 1 --db data/04/novel.sqlite
```

读实际问题和当前章稿。若需要人的方向，查看 `materials/第四节方向.json`，作出选择后先预览，再写入。例如选择 B：

```powershell
node scripts/记录第四节方向.mjs --choice B
node scripts/记录第四节方向.mjs --choice B --apply
```

把第一轮终端返回的任务编号交给编码助手，用 `--resume-task` 接续同一练习库的第一章。随后独立读回，核对 Agent 是否真正读到并使用了人的新决定。

人工改稿与采用沿用 `lab save`、`lab adopt`：先通读实际正文，再让助手按当前修订保存完整改稿。改变正文后应重新判断是否采用；采用决定只对应那份具体稿件。

### 选做：审批一次具体保存

动作审批使用另一个练习库，模型沿用请求观察室已保存的设置：

```powershell
node 准备实验.mjs 04-审批
pnpm approval propose materials/保存动作A.json
```

完整核读返回的待决正文与参数，再把自己的批准或拒绝交给助手。助手使用返回的任务编号和 `approvalId` 记录决定、接续；不要省去这次具体决定。独立检查保存结果：

```powershell
pnpm lab chapter 1 --db data/04-审批/novel.sqlite
```

`materials/保存动作A.json` 与 B 是编者写的短教学文本，用于观察参数变化，不是模型生成记录。它们只允许保存本地草稿；内容采用和发布属于另外的决定。

## 观察何时继续、求助或停下

先选一个条件。A 的材料足够，B 尚缺人的章末方向，C 会发生真实的草稿写入失败。下面只准备并运行 C：

```powershell
node 准备实验.mjs 05-C
pnpm agent --db data/05-C/novel.sqlite --chapter 1 --cancel-after-ms 180000
pnpm lab chapter 1 --db data/05-C/novel.sqlite
```

对照运行记录和独立读回结果，判断本轮实际保存了什么、为什么停止、还缺什么。非零退出码可能表示未保存、失败或取消，具体原因要看记录。

想观察另一个条件时，把三条命令中的 `05-C` 改为 `05-A` 或 `05-B`；每次只准备指定条件。已有数据库不覆盖，其他条件也无需重新运行。沿用已有登录与依赖，不必切换代码或重装。

如需观察取消，在已经保存过草稿的练习库中另起一轮，把取消时间改为 `5000`，再独立读回。旧稿仍在不表示本轮完成；取消也不能撤销已经发生的保存。

