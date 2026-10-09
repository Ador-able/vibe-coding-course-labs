# 验收自己的 Agent：课堂材料

本包提供独立应用源码、完整教师输入、真实业务对象、三轮 SDK 公开事件、人工操作与最后文件。它用于学习怎样检查 AI 的过程和交付；小说是练习材料。

## 先分清文件的身份

`history.bundle` 保存完整自主项目 Git 历史。代码起点为 `a38b82de03b4ca7ed3b7ccdbcf71ed4207205d85`（`vcm-13-01-start`），本节最小实现完成点为 `b789bc481b244bc38270616d100b6ac4d2a6d867`（`vcm-13-01-prepared`）。`project/` 的 190 个文件逐项取该提交的 Git blob 原字节，不把 Windows 检出换行称同一原字节。里面的旧故事与 evidence 是以前课堂的完整自主记录，不是本次新故事。

本节 A／B／C 使用同一实现，实际版本为 0.13.1／0.13.2／0.13.3 的工具组合与绑定另存 `actual-runtime/` 和各阶段 input-public；B/C 教师请求和人的新资料不在准备提交里，完整原件单列 `teacher/`。运行完成不靠制造一个没有业务意义的源码差异来证明。

本次作品 ID 为 `heldout-01252847-2f31-4ada-a646-9c0e3d17a327`。`records/A/before.*` 是真实零章起点（已有 A Task），不是导入旧正文；`data/课堂最终一致备份.sqlite` 是最后两章采用后的完整一致副本。六份阶段 SQLite 原字节与对应完整五表保留。最终五表条目数为 works=1、work_versions=3、chapters=2、chapter_versions=5、tasks=3；这些数量只帮助定位，不能代替文学阅读。

## 本机查看和导出

需要 Node ≥24.12.0、固定 pnpm 11.20.0。本次主编实际使用 Node 24.19.0；TypeScript、SDK 和 MCP 版本以 package.json 与锁文件为准。本包不含 node_modules。解压到自己的独立短目录，进入 `project/`：

```powershell
pnpm install --frozen-lockfile --virtual-store-dir .pnpm --package-import-method copy
pnpm --virtual-store-dir .pnpm exec tsc -p tsconfig.json
Copy-Item -LiteralPath '../data/课堂最终一致备份.sqlite' -Destination './课堂副本.sqlite'
node dist/cli.js show --db 课堂副本.sqlite --work heldout-01252847-2f31-4ada-a646-9c0e3d17a327
node dist/cli.js chapter 1 --db 课堂副本.sqlite --work heldout-01252847-2f31-4ada-a646-9c0e3d17a327
node dist/cli.js chapter 2 --db 课堂副本.sqlite --work heldout-01252847-2f31-4ada-a646-9c0e3d17a327
node dist/cli.js export 课堂重新导出.md --db 课堂副本.sqlite --work heldout-01252847-2f31-4ada-a646-9c0e3d17a327
```

导出位置参数写文件，父目录须实际存在。独立导出与 `deliverables/最后一封回信-课堂完整采用稿.md` 比较完整正文和版本；这个原文件为 7277 字节。若想人工查看／改稿，启动同一 Store 的薄网页入口：

```powershell
node dist/prototype-server.js --db 课堂副本.sqlite --work heldout-01252847-2f31-4ada-a646-9c0e3d17a327 --port 4368
```

在自己的本地端口打开页面，页底保留原版／台面／笔记页三种方向。改稿会生成自己的新草稿并取消该章当前采用，不是修改随包的只读证据。请只在复制后的库里操作，停止只关闭自己的服务。本文没有承诺窄屏体验。

如需恢复源码历史，在另一空目录用 `git -c core.autocrlf=false clone ../history.bundle project-history`，再 checkout 明确的 start 或 prepared 标签。不要覆盖本包 project，也不要修改全局 Git 设置。

## 怎样重做新的 AI 任务

当前 Task 已经完成或取消，旧 thread 是本次课堂实际会话，不能当成你宿主里的现成会话。用新作品／新库／新 Task 和你已认证的成熟宿主重新开展。先替换 initial-work 的 ID，在自己的空库经原 CLI 初始化；将自己的实际业务入口与已有方法交给宿主。观察器源代码保存本次关联、SDK runStreamed／resumeThread、实际保存后 Abort 和归档方法，但本次停用目录／路径绑定／批准回执并不是跨电脑的通用一键重放配置，包内不含私有启动器。

按 A 完整输入执行到真实保存返回，停止后先读实际对象。H1 中两条要求是编者故意加入的同级条件冲突；真正存在晚返分支的冲突，早返且核实交接完成仍是合法第三路。B 请求只检查当前资料，不续写。读完 B 再由你真正选择目标，保存当前要求和需要修改的正文。自己的 C 输入必须依据自己的真实前置，不预填本次版本号或模型回应。

教师材料中 H2 是主编课堂选择，不是课程用户的文学决定。旧 A 请求的 STALE_WORK 是另一次官方 Client 零模型反例，不是自然 B/C 遇到的错误。工具先在作品基线处拒绝，其他错误分支没有因此全部验证。最终采用和导出均另由人完成。

## 怎样读完整实际记录

`records/A`：21 个 SDK 事件；save_draft 返回第一章 r1 后教学取消，没有 turn.completed，用量 null；章稿保留。final-response.txt 只是停止前最后一段模型消息，不是正常最终收尾答复。

`records/B`：15 个 SDK 事件；同会话只读，取得新要求和完整首章，指出晚返条件的冲突与具体优先级问题。业务资料／首章及 A Task 不变，观察器将 B 的独立 Task 记录 completed。

`records/C`：24 个 SDK 事件；读取要求 r3、已采用首章 r3和空第二章，保存第二章 r1／draft并完整读回，正常完成后归档同一会话。只有章节任务 Skill 和它的一份状态参考被实际阅读，不把两项启用方法都称参与。

`records/human`：真实 H1 资料变化、H2 人的要求／首章人工操作与采用、一次旧请求拒绝，以及 H3 第二章采用和真实文件导出。`records/final` 是最后 HTTP 完整业务返回与五表；当前首章 r3／第二章 r2 都 adopted，依据当前。

`records/directory-*` 保留必要目录与首次未就绪失败。首查没有取得正确本节缓存，不把正常缓存稍后形成或第二次目录通过改写成首查已通过。目录通过只证明当时连接与能力，不代替后面自然任务。

这些 SDK 事件是公开客户端层的过程记录，不是完整底层模型协议，不提供逐次模型请求数。公共投影排除非教学账户通知、remoteControl／installationId、共享配置正文及私有路径／宿主指令；内部原件保持。全部教师请求、业务工具参数和完整业务返回不概括；省略范围见公开投影说明。不取得私有 rollout。累计 usage 不解释为上下文窗口、单次 API 调用或金额。

## 实际页面与完整文本

`ui/` 中三个 H2 JPEG 使用同一个人工保存后的完整首章（r2 draft）、同 1280×720 CSS 视口／DPR1.25、同字段和必要操作。实际一次保存后切换方向，不重演三次保存。原存 png 的字节实际是 JPEG，正确 jpg 只改扩展名，没有图像加工。实际尺寸原版1264×1330、台面1264×1115、笔记页1264×1508。旧误读 PNG 头的元数据只保留为内部未采用证据，本包尺寸索引以实际 JPEG 解码为准。

H3 第二章页为1264×1330 JPEG；实际页面读两章已采用并点第二章，没有再改稿。全页截图不代表 textarea 每行都同时可见；完整 value、实际 POST／GET、HTTP／DB 和真实文件负责全文核对。三方案的功能、辨认、整体口吻与结构代价分开记录，原版可以胜出，不替用户选择。

教学图是干净关系示意，灰线不代表实际章稿逐字呈现；它不是本次运行截图。没有新 ChatCut 入口、OAuth授权、剪辑或导出记录，课程中的剪辑表只作迁移准备。
