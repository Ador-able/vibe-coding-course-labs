# 先调查已有项目，再交给 AI 修改

本包保留已有小说原型、教师实际输入、两轮自然调查、一次零模型探针、编者贡献说明与来源定位。学习目标是沿编辑与保存行为理解现有实现，再决定继续调查、规划或授权有限修改；没有新应用补丁，也不要求重新生成小说。

## 两个 Git 仓库分别恢复

解压目录供直接阅读。要运行核对，请先从外层 `vcm-09-07-交付.bundle` 恢复一个新的独立交付仓库，不在 Knowledge 父库或解压目录直接运行观察脚本。

```powershell
git -c core.autocrlf=false clone "D:\course-downloads\vcm-09-07-交付.bundle" "D:\course-labs\09-07"
git -C "D:\course-labs\09-07" checkout --detach vcm-09-07-public-end
git -C "D:\course-labs\09-07" rev-parse --show-toplevel
git -C "D:\course-labs\09-07" status --porcelain=v1 --untracked-files=all
```

修改示例中的下载路径。目标必须是尚不存在的新目录；如果已有文件，就另选目录保留它们，不重置或删除原工作。`vcm-09-07-public-start` 和 `vcm-09-07-public-end` 是本交付仓库的实际固定标签，用来定位材料与完整结果；它们不冒充模型运行时产生的应用版本。应用在两轮调查前后都是下列同一提交。

再恢复应用自己的 Git 根：

```powershell
Set-Location -LiteralPath "D:\course-labs\09-07"
git -c core.autocrlf=false clone .\fixtures\novel-prototype-0cb480c.bundle .\novel-prototype-lab
git -C .\novel-prototype-lab checkout --detach 0cb480c4f2fc4acf680d7581617106f85473b28c
git -C .\novel-prototype-lab rev-parse --show-toplevel
git -C .\novel-prototype-lab rev-parse HEAD
git -C .\novel-prototype-lab status --porcelain=v1 --untracked-files=all
git -C .\novel-prototype-lab diff
git -C .\novel-prototype-lab diff --cached
```

根必须是刚恢复的 `novel-prototype-lab`，HEAD 必须是完整的 `0cb480c4f2fc4acf680d7581617106f85473b28c`，三种差异读取都应为空。包中 `fixtures/application-files.json` 分别记录原实验工作字节与 Git blob 字节；原工作副本的 CRLF 和恢复后的 LF 可能不同，只允许已经逐项核对的换行差异，不能称原字节完全相同。

## 无模型恢复核对

本节实际使用 Node 24.12.0、pnpm 11.20.0、Codex 0.160.0；应用锁定 MCP SDK 1.31.0、Codex SDK 0.160.0、Zod 4.6.5、Playwright 1.63.0、TypeScript 7.0.2 与 Node 类型 24.19.1。下面沿用原应用已有的包管理器、workspace 和锁文件，不需要全局安装项目依赖：

```powershell
Set-Location -LiteralPath "D:\course-labs\09-07\novel-prototype-lab"
pnpm install --frozen-lockfile
pnpm run build
Set-Location -LiteralPath "D:\course-labs\09-07"
New-Item -ItemType Directory -Path .\data
Copy-Item -LiteralPath .\fixtures\teacher-baseline.sqlite -Destination .\data\investigation.sqlite
node .\scripts\verify-recovery.mjs
```

只在新目录中复制基线，不覆盖已有数据库。脚本用 Node 内置入口和只读 SQLite 检查：独立应用 Git 根、固定 HEAD、164 个完整文件、五表全部行及三章全文、两轮命令和自然提示、完整最终回答以及探针边界。结果写入本交付仓库的 `验证结果/`，不会调用宿主、模型、Hook 或保存业务。只读 SQLite 核对不等于整个进程没有日志或辅助文件；主库字节和完整对象另行比较。

本次教师首次安装额外使用了 `--ignore-workspace`，跳过原包已有的年龄排除配置而失败，后来仅对一次冻结安装命令设置 minimumReleaseAge=0 才成功。原日志保留在 `evidence/preparation/`；这些额外参数不是恢复步骤，也不说明原包缺配置。安装或构建失败时保留具体错误，不修改第三方、锁文件或全局策略。

## 当前数据与可选页面读取

`fixtures/teacher-baseline.sqlite` 是教师初始化并停止自有服务以后的主库：69632 字节，SHA256 `6bdff7f653594cba25dc942f2fa60862128964bcafe043fa9a35552c0b56f35f`。作品 ID 为 `investigation-394a891c-e22d-49f1-ba57-ce08803dfe93`；五表计数为 1/1/3/3/0，三章均为人工初始化的 draft r1。它不是本节模型新生成，不含旧 409 作品或旧网络作品的全部历史。完整对象和正文在 `inputs/`。

如果只想读本节材料，不必启动服务。要查看实际原型，可以在自有副本运行已有入口：

```powershell
Set-Location -LiteralPath "D:\course-labs\09-07\novel-prototype-lab"
node .\dist\prototype-server.js --db ..\data\investigation.sqlite --port 4397 --work investigation-394a891c-e22d-49f1-ba57-ce08803dfe93
```

浏览器读取 `http://127.0.0.1:4397/?chapter=2&variant=original`，另将 variant 改为 desk、notes，保留相同业务内容。原 Store 启动会设置 WAL 和表；这不是“全程无写入”的入口。已有 seed 会写业务数据，本节恢复现成库不执行它。默认只读取，自己保存或采用后数据库就不再是本节基线；应另存结果并按真实版本解释。

本次教师实际完成两个直接 GET、五个浏览器 GET，全部 200，并保留三个页面完整截图和正文。随后 Ctrl+C 回执退出 1，实际进程与端口已经消失，输入已明确服务停止。三种页面读取相同内容仅支持功能/状态观察；信息辨认、整体审美仍须分别比较，由真实使用者选择，原版可以胜出。

## 三种观察不能合并

1. `runs/01-first-failure/`：第一轮自然任务一线程一 turn。三条命令都在辅助程序启动前失败，没有取得项目和输入正文；宿主正常 completed，调查未完成。原回答据此停止判断。
2. `runs/02-zero-model-probe/`：官方独立 command/exec 只运行一次 Get-Location，无线程、模型或重试。退出 0、stderr 为空，但返回目录尾部未完整匹配，观察器退出 1。它与模型 shell 是不同接口，不证明路径长度因果或 AI 调查完成。
3. `runs/03-independent-investigation/`：另一轮独立自然任务使用同版本、同原字节的已安装较短官方入口，其余提示、模型、提供方、工作目录、权限、代码和业务基线保留。27 个完整命令取得材料，226845 毫秒正常结束并归档；代码、五表、主库和全局配置前后相同。第 19 条语法失败，第 22 条退出 0 仍含 Git fatal，第 25 条错误读取 JSON 字符串，第 27 条才正确解析。没有新保存、采用、服务运行或测试套件执行。

原始模型回答中的“数据一致，因此没有理由重做界面口吻”保留，课程不采纳这个推断。完整回答与命令可逐项回查。回答提出的人工合并验证没有执行，预算中断分支没有触发；不从本轮推出节省费用或因果收益。

## 宿主定义与公开范围

`definitions/` 保留当时实际脚本、配置和输入的原字节。它们含作者本机的绝对路径与当时停用目录，只用于核对历史，不能在另一机器直接当正确配置使用。review 模板均为 `approvedBy: null`；默认恢复不运行观察器或模型。要用自己的现成编码助手调查，应先核本机模型、能力目录、实际规则来源与权限，使用 `prompts/调查任务.txt` 替换真实起点，并保留一次完整请求、实际命令与全文结果，不沿用他人信任或自动重试。

当时 project_doc_max_bytes=0 关闭项目规则自动读取，但宿主仍加载 `C:/Users/32686/.codex/AGENTS.md` 来源；只记录路径，没有读取或公开正文。该条件不是完全隔离，read-only 也不自然证明目录外无法读取。模型命令的实际范围另行核对。

`public-protocol.jsonl` 是必要事件/字段投影。完整自然输入、实际命令参数与结果、助手公开回答、业务对象和终态保留；账户、身份、远控元信息、reasoning 项、受保护宿主 system/developer 与私有记忆正文不收录。每轮 `projection.json` 记录保留/排除计数，不能声称所有宿主事件按原字节公开。宿主原始私有归档、凭据、全局配置正文和第三方二进制不在包中。

`research/` 仅保存编者的贡献与取舍说明、28 份原课的题名/课节编号/字幕时间范围和原件校验值，以及官方链接、固定版本与实际阅读区间。完整原课字幕、HTML、提取全文、官方网页和官方源码留在内部研究来源，不随本练习包分发。字幕/HTML 全文阅读不等于看完视频或全部视觉版面；源码中存在检查也不等于本轮执行通过。

交付仓库从这些公开文件建立独立 Git 历史；公开 bundle 不含旧交付仓库或移出的研究正文。起止标签用于固定同一份公开材料，不表示重新执行了原实验。应用自身固定存档、教师基线、完整自然提示与公开实际运行记录保持原字节。
