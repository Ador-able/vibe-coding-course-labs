# 第十五章保存交付检查

本次只生成 A 的最小提交检查。应用已有修复，`prototype/app.js`、真实 HTTP、Store、教师原件、冻结测试和锁文件均不修改。B“是否正式采用第二章”仍为 `needs_human_decision`，决定为空，未领取模型任务，也没有执行采用。草稿保存、任务结束、程序检查、文学采用分别核对；单一工作台能否辨认本地稿、已保存稿、对照稿及下一步，以及页面审美，仍需真实使用判断。

生成起点：课程 Git 根 `D:/Projects/Knowledge/.coursebook-work/c15-impl`；目录 `qinglan/chapter15/project`；HEAD `f71cee739bd8be4ad908044d5bc02aec0f08ff49`；分支 `codex/qinglan-chapter15`；生成前工作区与未跟踪列表为空。首次 Git 状态读取有全局 ignore 权限警告；随后只读命令屏蔽全局与系统 Git 配置，成功读到实际空状态。没有读取私密规则、Memory 或凭据，也没有修改 Git 配置或 index。

## 依据与完整输入

以 `inputs/177-前置实录索引.json` 的实际文件为依据，生成前逐项读取字节并核对长度与 SHA，全部吻合。旧恢复点 `ae16bc886a46e8d8d1f8e9d6c5cbb31ffbefeb5c` 的正常保存有 20 项等待行为断言失败；正确点 `400ff2f26a3570fa2bb47ba6ca77717c7fc49575` 的同输入正常保存通过，两边服务收到 POST 前 abort 也通过。四例真实浏览器记录、完整终端、进程退出码与独立五表读回均保留在 `records/regression*`。这些是先前实录，本轮未重跑。

原生评审完整记录在 `records/review-01/review/`，一次原生评审已完成，未取得内部结构化评审对象。可见结论未发现材料支持的新增正确性问题；服务提交后 GET 失败、真实并发与视觉审美仍未知。完整原件审计还保留了命令输出中的工具错误和客户端后台联网尝试，不能把最终命令退出码为零说成过程没有错误或客户端零联网。

初始化复用 `scripts/seed.mjs` 导出的 `seed(store)`，读取 `inputs/完整教师初始化.json` 的完整作品与三章，不调用 seed 的 CLI，也不读取或写入共享 `practice.json`、`data/`。原始存档在 `inputs/青岚修仙录-三章原始课堂存档.md`，来自既有课堂提交 `3abac6b711599c2cef3c30b79036d3dc72c1321f` 的 `qinglan/chapter10/project/materials/172-命令观察实录/完整三章待审.md`，10231 字节，SHA256 `655ff9b25e25b44023a22fad199e658876e2245e1d6914600338ba93ae454ecf`。本轮仅引用这个公开存档副本，没有读取其他章节工作目录。

该存档包含此前模型生成与编者改稿，是已有三章，不是本轮新写或新采用的小说。实验通过成熟 Store 初始化新作品 r1 和三章 `human/draft r1`，不复制旧修订、任务或采用历史。林青仍为青岚宗外门弟子、炼气三层，筑基是长远愿望。检查使用 `inputs/独立业务预期.json` 的同一完整预期和键盘补记；补记属于测试输入，不是文学采用，不增加突破、拿起铜片或声音触发手影等事实。

## 一次准备与调用

以下命令是教师静态核读后，在自己的独立实验 clone 中执行的准备；本轮模型没有执行。使用已有 Node 24.12.0、pnpm 11.20.0、项目锁依赖和 Playwright 1.63.0，不新增框架或依赖。在课程 Git 根准备一次：

```sh
pnpm install --frozen-lockfile --filter qinglan-existing-project-lab
pnpm --dir qinglan/chapter15/project exec playwright install --with-deps chromium
```

默认使用 Playwright 的 Chromium。Windows 若已准备 Microsoft Edge，可明确选择；失败直接保留，不自动换浏览器，也不重试：

```powershell
$env:DELIVERY_BROWSER_CHANNEL = 'msedge'
pnpm --dir qinglan/chapter15/project run check:delivery
```

使用默认 Chromium 时不设置 `DELIVERY_BROWSER_CHANNEL`；在 PowerShell 中可 `Remove-Item Env:DELIVERY_BROWSER_CHANNEL -ErrorAction SilentlyContinue` 清除此前选择。明确设置为空或带首尾空白会报环境失败。

`check:delivery` 顺序执行 `pnpm run build && pnpm run test:delivery`；构建非零就停止。`test:delivery` 是 `node --test scripts/check-saving-delivery.mjs`，直接入口要求已有对应的 `dist`。Hook 和 PR 使用同一个本章 `check:delivery`，没有调用课程根的递归 build 或其他章节全套。

主要调用链：本章入口 → 本章 TypeScript 构建 → 一个 Node test → 动态加载成熟 Store、真实 `prototypeServer` 和 `seed` → 独立 SQLite → 一个 Playwright Chromium 实例 → 真实页面及 HTTP → Store 事务 → 完整读回、刷新、五表及全部历史 → 清理 → 统一断言 → Node、pnpm、Hook 或 Actions 的退出状态。

## 单例实际行为与证据

每次创建新的 `runs/delivery-saving-UUID/`，SQLite 为该目录内的 `practice.sqlite`，完整记录为 `record.json`。不覆盖既有运行，也不产生第二个场景。记录保留完整教师输入、独立预期、来源与字节/SHA/base64、应用与构建产物、实际 Git 状态、浏览器版本、页面全文/HTML/焦点、鼠标键盘尝试、原生服务与浏览器请求响应、五表原始列和解析后的完整历史、未完成步骤及分类错误。运行会写入自己的实验库，不触碰业务共享库。

先通过正常鼠标和键盘选第二章、追加保存前补记组成完整 A，并真实重新读取原稿形成已有对照。随后安装两个等待门：POST 门暂停在真实服务收到请求前；放行真实 POST 后，GET 门暂停随后完整读回。两个门只延迟请求，放行用 `route.continue()`，不伪造响应。等待期间尝试点击章名/正文、正常按键及输入，观察焦点、禁用、不可编辑和完整 A 是否保持；同时检查覆盖编辑、导航、保存、读取暂停。

POST 门前五表仍是完整 seed；GET 门期间服务已保存完整 A 一次。放行 GET 后检查页面完整 A、保存 r2 和旧对照收起，然后真实键盘验证恢复编辑。仅恢复补记留在本地，刷新接受离开提示并丢弃它，重新选第二章读到完整 A，不再保存一次。

观察和清理结束后才汇集断言。必要记录必须明确存在，不能以 `undefined === undefined`、空遍历或仅 HTTP 200/JSON 合法判通过。完整请求包含作品 r1、本章 r1 和第一章 r1 基线；浏览器与真实服务 API 请求响应逐项匹配。两个初读 GET 和两个保存后/刷新 GET 均核对完整作品、三章正文、元数据与依据。五表要求仅第二章新增一次 `human/draft r2`，原 r1 历史、作品及第 1、3 章原始列字节保持，tasks 为空。第三章正文仍原样而 `basisCurrent=false`。

只覆盖这一个正常保存实例。服务前 abort 的旧实录继续保留，但新入口不重跑它；已提交后 GET 失败、未知终态、真实并发、全部空白字符、撤销、页面辨认和审美均未覆盖。`human` 是来源字段，不是身份认证；三章齐全、正文相同或程序通过都不表示第二章已采用。

## Git Hook、LF 和暂存条件

Hook 位于课程 Git 根 `.githooks/pre-commit`，LF 行尾，shebang 为 `#!/bin/sh`；先定位实际根，再 `exec pnpm --dir qinglan/chapter15/project run check:delivery`，原样传播非零。clone 默认不会自动启用自定义 hooksPath；教师在自己的 clone 明确启用：

```sh
git config --local core.hooksPath .githooks
```

此命令本轮没有执行。Hook 应提交为 **100755**。Windows 工作文件无法代替 Git index 的 executable mode；本轮禁止写 index，因此 100755 尚未登记，也不能声称已经提交。教师在允许完整暂存时将 Hook 登记为可执行，并核对真实模式：

```sh
git update-index --chmod=+x .githooks/pre-commit
git ls-files --stage -- .githooks/pre-commit
```

前一命令只用于已经完整暂存该文件的独立 clone；输出首列需为 `100755`。Unix clone 还需工作文件可执行（`chmod +x .githooks/pre-commit`）。保留 LF；教师登记后通过 `git show :.githooks/pre-commit` 核对 index 中的实际字节。没有修改本轮仓库配置、Git 暂存或第三方文件。

本轮只读 Diff 对课程根新 Hook 和 workflow 提示：以后 Git 接触工作副本时可能把 LF 转为 CRLF。当前四个新文件实际均为 LF。教师需在自己的 clone 确保后续 checkout 的 Hook 工作字节仍为 LF，再执行模式和逐项字节核对；本轮没有为了消除提示而修改 Git 配置或增加其他文件。

普通 Hook 构建并检查工作区，不能证明任意部分暂存内容已检查。本次教师验证条件是：完整暂存该实验副本的全部待提交改动，确认未跟踪文件无遗漏，worktree 与 index 逐项相同。对所有已暂存文件检查未暂存差异，并逐文件核对 `git show :路径` 的 index 内容与工作字节（包括新增文件、既有行尾转换和 Hook 模式）；`git diff --exit-code` 可辅助确认 Git 层面的未暂存差异，但不能替代原字节核对。暂存后若再改工作文件，需要重新核对；本轮没有建立或验证这个条件。

## PR 配置与远端核查

配置依据为已读并核对冻结 SHA 的 `inputs/CI官方版本与范围.json`：`actions/checkout@v7`、`pnpm/setup@v3`、`actions/upload-artifact@v7`；setup 使用 `runtime: node@24.12.0`、`install: false`，pnpm 从已有根 `packageManager: pnpm@11.20.0` 取得。没有猜版本、使用旧 node-version 字段或联网查版本。

YAML 仅定义 `pull_request` 及本章目录、本 Hook、本 workflow、课程根 package/workspace 路径，权限仅 `contents: read`。锁依赖安装、Chromium 及系统前置准备后，执行同一必要检查。日志记录 event、PR head SHA、PR base SHA、event SHA 和实际 `git rev-parse HEAD`，另记 Node/pnpm 版本。默认 PR checkout 可能为模拟合并提交，不能把事件 SHA 或 PR head 直接当作实际运行 HEAD。

artifact 使用 `if: always()` 保存真实 `qinglan/chapter15/project/runs/delivery-saving-*`；名称含运行 id 与 attempt。文件不存在时如实 warn，不制造通过记录。安装或构建提前失败时可能没有运行目录；取消、宿主强制终止或上传本身失败也可能无法取得 artifact。远端实际执行后，人需核对日志中的事件/SHA/工具版本、安装与检查退出码，以及下载 artifact 内 `record.json` 的完整输入、实际 HEAD、assertions、passed、unfinished、四类错误、SQLite 与五表历史。仅看绿色图标或 YAML 文本不足以证明这些事实。

本轮只生成配置，没有创建 PR、触发远端、上传 artifact、合并或设置分支保护，因此 CI 状态仍是未运行。

## 失败、清理与代价

环境、观察、记录、清理错误分别存入 `environmentErrors`、`observationErrors`、`recordingErrors`、`cleanupErrors`；页面错误、源码变化与未完成步骤也保留并使检查失败。每步写 checkpoint；记录写入失败不重试、不报成功，最终写盘失败时把完整诊断送到 stderr。断言只在末尾统一汇集，目标行为失败不会提前截断后续正常观察。

无论观察成功与否，finally 都放行两门，等待路由并移除它们，排空响应记录，关闭页面、context、browser 和 HTTP，再取最终五表/历史并关闭 Store；每项清理独立有界，失败后继续其他清理。放行可能让已经等待的真实 POST 完成，不能称清理撤销了保存，所以清理后还要完整取证。清理失败不能当通过；时间限制或宿主强制终止不能保证资源已全部关闭。

不删除证据目录、SQLite 或可能残留的 WAL/SHM，不自动重跑，不覆盖失败。教师需先保留完整终端、`record.json` 和整个运行目录；若清理超时，核对记录中的清理步骤、实际进程及端口后处理资源。存档完成后，若要删实验记录，只针对核实位于本 clone 的明确 `runs/delivery-saving-UUID` 目录人工处理。

代价是每次本章构建、一个真实浏览器、完整三章及页面/HTTP/历史证据的磁盘占用；依赖和浏览器只准备一次。观察预算 120 秒，动作 4 秒、请求/单项清理 12 秒、步骤最多 30 秒，Node test 上限 420 秒；CI 整个 job 上限 15 分钟。普通快速实录不能保证每台机器耗时相同。

本轮未安装、build/test、启动服务/浏览器、写业务库或执行 Git add/commit/push。模型生成及静态核读不等于运行通过。教师静态核读后，在独立旧/新副本直接检查各一次，再真实 Hook 提交各一次；完整暂存且 worktree/index 相同才解释该次提交验证。不通过就保留真实结果，不追理想结果。B 是否正式采用第二章继续由内容负责人决定。
