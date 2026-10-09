# 保存交付检查

本入口把已验证的保存约定接到本地提交检查和 PR CI，只运行原版一个正常保存实例。当前应用起点为 `c3805c360551c10fedfd9b5473e569cfd7666dc0`；旧点为 `2c1f4e17c70377fc80e9f90d044e8e75ed3b5720`。旧新红绿是教师既有材料，本轮只生成交付文件，没有安装、构建、测试、浏览器、服务、暂存、提交、推送或远端运行结果。先由教师和主编静态审读，再分别执行同一检查的旧/新提交。

## 运行入口

准备好项目现有依赖和浏览器后，在仓库根目录运行：

```sh
pnpm run check:delivery
```

调用顺序为 `pnpm run build && pnpm run test:delivery`；后者是 `node --test scripts/check-saving-delivery.mjs`。build 生成真实 dist 并做 TypeScript 检查，构建失败就不启动实例；它不替代保存验证。直接使用 `test:delivery` 前必须先构建当前版本，避免读到旧 dist。本入口不挂接整套 unit、其他 browser 测试或 UI capture，也不自动重试。

默认启动 Playwright 自带 Chromium，需要预先安装匹配当前 Playwright 的浏览器。未来执行环境的准备命令为 `pnpm install --frozen-lockfile`、`pnpm exec playwright install --with-deps chromium`；Windows 的系统依赖处理以实际环境为准。本轮没有执行这些命令，没有新增依赖或改锁文件。

Windows 如需使用机器上已经存在的 Edge，只为本次进程显式设置 channel，例如 PowerShell：

```powershell
$deliveryPreviousChannel = [Environment]::GetEnvironmentVariable('DELIVERY_BROWSER_CHANNEL', 'Process')
try {
  $env:DELIVERY_BROWSER_CHANNEL = 'msedge'
  pnpm run check:delivery
  if ($LASTEXITCODE -ne 0) { throw "交付检查退出码：$LASTEXITCODE" }
} finally {
  [Environment]::SetEnvironmentVariable('DELIVERY_BROWSER_CHANNEL', $deliveryPreviousChannel, 'Process')
}
```

未设置变量时使用 Chromium；仅接受显式 `msedge`，启动失败不回退。日志和 evidence 写入实际 browser、version、channel，以及 Node 版本和平台。上例恢复进程变量，不修改系统环境。

## 初始化与独立预期

每次创建新的 `runs/delivery-saving-UUID/fixture.sqlite`，只在这个目录写证据和 SQLite；HTTP 绑定 `127.0.0.1` 的随机端口，浏览器使用隔离上下文。它不读取或写入用户库、旧实验库或第三方服务。

真实调用链为：检查调用 `scripts/prototype-seed.mjs` 的 `seedPrototype` → dist 中的 `Store.init/saveDraft` → `prototypeServer` 提供原页面及真实 API → 原版页面正常键盘编辑和提交 → `POST /api/draft` 调用 `Store.saveDraft(input, 'human')` → `GET /api/work` 调用 Store 读回 → 刷新和五表核对。submit 的顺序是先 `sync()` 捕获 A，再 `setBusy(true)`，再构造 input。两门用 `page.route` 延迟真实请求并 `continue`；不用 fulfill 或伪造业务响应。

完整文本来自 `fixtures/three-chapter-archive.json`，归档标注的代码版本为 `13c964e15aec25928b2ae3dceddfea52773cf695`。seed 用新作品 ID，初始化完整作品为 r1、三章为 r1/human/draft；不恢复归档中的旧作品修订、agent 任务或 adopted 状态。evidence 保留 fixture 原文、解析后的完整对象、SHA256、seed 路径和 SHA256、完整初始化返回及五表。这是教师通过 Store 的人工初始化，不是本轮模型创作或真实用户采用小说。

教师固定资料为 `../inputs/完整教师派生测试.mjs`、`../inputs/旧新行为和既有评审说明.md`、`../inputs/独立业务预期.json`，供静态审读；可复用检查运行时不依赖仓库外 inputs。仓库中的 `scripts/test-saving.mjs` 原字节保留，SHA256 为 `c2ce7ae8608d6f4437f6bb0c641754db35099d98a8f93e106b13b0e7fc318d92`。新入口不执行或修改该原件，不复制 `record === undefined` 弱断言。

输入原样固定如下，章名和正文分别追加：

| 阶段 | 章名补记 | 正文补记（`\n` 表示真实换行） |
| --- | --- | --- |
| 保存前 | ` · 保存前补记` | `\n\n保存前补记：林澈把观察时间写在页边。` |
| POST 等待 | `【POST等待输入】` | `\nPOST等待输入：周伯仍站在窗边。` |
| GET 读回等待 | `【读回等待输入】` | `\n读回等待输入：林澈又核对了一次记号。` |
| 恢复编辑 | `【恢复编辑】` | `\n恢复编辑：这段暂留本地。` |

A 只从固定 fixture 第 2 章完整章名、正文加保存前补记拼接。键盘输入后先记录全文与 A 的独立比较，再正常重新读取，使对照和覆盖入口可见，本地仍须为 A。完成这些步骤后才安装 POST、保存后 GET 两门。

POST 等待时记录完整提交参数、页面全文和初始五表；正常尝试焦点、`Control+End` 和键盘追加。释放 POST，取得真实完整返回后等待 GET 门，记录此时已保存的对象、历史和全文，再正常尝试第二组等待期输入。随后释放 GET，读回全文，正常追加恢复编辑补记，最后刷新，获取真实 GET、页面和完整五表当前/历史。

业务要求是完整 POST 提交 A 和正确版本依据；两等待期章名、正文、可见覆盖动作暂停，每次键盘尝试不能改 A；仅第 2 章增加一次 human/draft r2，作品及第 1、3 章原样。POST 返回、GET 读回、刷新及持久化须符合独立完整字段预期，并互相一致。第 3 章正文和历史不变，但它的派生 `basisCurrent` 在第 2 章升至 r2 后为 false，这是读回字段的预期变化。完成后可以继续编辑；恢复补记只留本地，刷新仍为 A。Store 生成的 `updatedAt` 必须是有效 ISO 时间，并在响应、当前记录和新历史中一致，其他字段不能借实际返回定义正确答案。

## 证据、失败传播和代价

先观察、释放两门、读回、刷新并核对存储，收尾资源后才统一输出业务断言。因此旧实现的第一个 disabled 失败不会遮住随后接纳又丢失输入的全过程。每条浏览器请求及响应全文、状态、服务入口记录、焦点、逐字段键盘动作前后全值、各阶段完整数据库与历史都进入 `evidence.json`；`result.json` 含同一完整记录及分类断言、测试错误。SQLite 一并保留。不要用断言总数、按钮状态或总绿灯代替全文和独立预期。

环境初始化、观察中断、页面运行、记录和清理错误分开报告。观察未完整完成时业务标记待定，入口仍失败；不能把缺浏览器或定位超时叫作业务红。任意异常先释放两门，收尾路由和响应记录，再分别关闭上下文、浏览器、HTTP 服务和 Store；某个清理失败不阻止后续关闭，错误保留并令检查非零。目录或磁盘本身无法写入时，不能保证证据文件存在；错误进入标准测试输出并使入口失败，两份最终文件分别尝试落盘。

等待上限沿用教师的单次 30 秒，测试整体上限 300 秒；正常运行的实际耗时尚未测量。每次承担一次真实构建、浏览器启动、完整作品初始化、真实 HTTP 保存/读回和 SQLite 检查，保留完整全文会积累磁盘空间。CI 另有依赖、浏览器及系统依赖安装成本，job 上限 15 分钟。人工查看证据后自行管理保存周期，本入口不清删历史 runs，不省略证据。

## Git 钩子与暂存区

`.githooks/pre-commit` 使用 Git 自带钩子，以 `exec pnpm run check:delivery` 前台执行；构建或测试的非零退出直接阻止 commit。钩子文件须保持 LF 和 Git 可执行模式 `100755`。克隆不会自动启用自定义 hooksPath；静态审读后由人显式配置：

```sh
git config --local core.hooksPath .githooks
```

在人工暂存钩子后，如其 Git 模式不是 `100755`，由人执行 `git update-index --chmod=+x .githooks/pre-commit`；Unix 工作区也要有执行权限，可用 `chmod +x .githooks/pre-commit`。用 `git ls-files --stage .githooks/pre-commit` 和 `git config --local --get core.hooksPath` 核查。本轮没有暂存或修改仓库配置，也没有设置 index 模式。

该普通钩子运行的是**工作区**，不会构造 index 的隔离快照。本次拟提交必须完整暂存，检查所用工作区文件与 index 相同；当前生成阶段未暂存，不能声称已经满足。人工提交前用 `git status --short`、`git diff --exit-code`、`git diff --cached --name-status` 和 `git diff --cached` 核对完整暂存、依赖及来源。`git diff` 不报告未跟踪文件，应结合 status 检查；已有未跟踪教师原件须原样保留，由人确认其归档安排。任何部分暂存、检查后再编辑或未跟踪输入，都不能冒称验证了任意待提交快照。

本地钩子可以被用户跳过，不能作为远端强制策略；本入口不提供绕过命令。要求 PR 必须通过 `saving-delivery` 才能合并，需要人另外配置仓库规则或分支保护，并确认必需状态对应此 workflow/job。本轮没有配置这些策略，也不自动提交或合并。

## PR CI 的核查

`delivery.yml` 仅响应 `pull_request`，权限仅 `contents: read`。按本轮给定的已核官方入口使用 `actions/checkout@v7`、`pnpm/setup@v3`（Node 24.12.0，pnpm 从既有 `packageManager: pnpm@11.20.0` 取得，`install: false`），再执行 frozen-lockfile 安装、Chromium 安装和同一 `pnpm run check:delivery`。没有云端编码调度、自动评论或外部 PR 操作。

运行日志分别记录 event、PR head、事件 SHA 和实际 `git rev-parse HEAD`。默认 PR checkout 检出模拟合并点，PR head 是提案分支提交，二者须分别核查，不能把模拟合并 SHA 称为分支 head。审读者在 Actions 的这次运行中核对上述日志、构建/检查步骤退出码、分类结果和对应 artifact；核对 PR 的当前 head 是否仍与该运行 head 一致。新 head 需要新检查。

`actions/upload-artifact@v7` 在成功或失败后上传这次 runner 的 `runs/delivery-saving-*` 实际文件，名字含 run ID 和 attempt。新检出 runner 不带历史 runs；如果安装或 build 提前失败、根本没有产生记录，上传会报告无文件，失败原因看对应步骤日志，不能补造 artifact 或保存成功。artifact 不是 CI 结论的替代品，下载后还要审读独立预期、正文和错误分类。

YAML 本轮尚未在远端运行，不能称 CI 成功；也没有提交、PR 或合并结果。教师后续须确认同一入口在真实旧提交得到完整观察的业务红，在新提交得到真实保存与读回一致的绿。

## 人工取舍与范围

这个必要检查只覆盖原版正常保存一个实例；服务前 abort、另外两种整页方向、其他网络中断位置、并发竞争和全站行为不在新增覆盖内。采用单个稳定必要实例换取每次提交可承担的成本；是否扩展覆盖、证据保留周期和远端强制策略由人决定。

功能、信息辨认和整页审美分别判断。原版、集中工作的台面、连续笔记页三种方向继续保留，B 未领取；业务数据一致不能宣告原版审美胜出。审美仍等真实用户选择，小说是否采用仍只能由人通过人工入口决定。本检查不修改界面，不评价文学品质，不自动采用草稿。
