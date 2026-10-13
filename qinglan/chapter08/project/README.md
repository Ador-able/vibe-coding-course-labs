# 青岚修仙录：原型与任务推进

三种练习共用本目录的依赖、登录和 `materials/` 完整材料，各自使用独立数据库。新库的资料为 r1，三章均为人工导入的 r1 草稿。阅读现成材料不需要调用模型。

## 开始本节

沿用仓库根的统一安装和构建，下面的命令在本目录执行。修改源码后才需要重新构建。

## 查看原型

```powershell
pnpm prototype --port 4338
```

打开返回的网址，在页头选择原版、台面或笔记页。三种方案使用同一份资料和相同操作。修改后保存仍是草稿；旧窗口保存被拒绝时，本地文字保留，可读取当前稿对照。连接中断时不能确认保存是否发生，恢复后先读取当前稿。

已有数据库会保留。需要另开练习时使用 `pnpm prototype --db data/另一次原型.sqlite --port 4340`。`pnpm prototype:time` 执行五个确定时间的提醒规则输入，不发送实际提醒。

## 跨会话推进

下面两个会话使用当前 Codex 登录和模型选择。宿主配置只作用于本实验，首次运行前统一检查一次：

```powershell
pnpm host:check
pnpm cross:prepare
pnpm cross:a
pnpm cross:b
```

准备结果和完整输入在 `task-state/`。A 在真实导出完成并核对完整字节后发出取消；实际中断位置以运行记录和文件为准。B 使用新会话，检查当前三章及已有导出，文件一致时复用，再保存完整核对和最新进度。二者不生成小说，也不自动采用。

每个任务只执行一次。异常记录留在 `runs/`，没有自动重试。任务最多等待十分钟；超时与完成结果分开记录。不要为了取得漂亮结果重复执行，先核对已有文件与返回。

## 根据人工变化调整计划

可直接使用本目录真实 B 实录，不必先调用模型重做 A/B。下列命令新建独立库；档案中的编号与路径只用于追溯。若尚未检查宿主，先执行一次 `pnpm host:check`。

```powershell
pnpm replan:prepare --from materials/跨会话实录
$exercise = Get-Content -LiteralPath 'replan/task.json' -Raw | ConvertFrom-Json
pnpm lab save replan/第二章-人工修改完整输入.json --db $exercise.db --work qinglan
pnpm lab chapter 2 --db $exercise.db --work qinglan
pnpm replan:run
```

若要使用自己刚完成的 A/B 结果，将准备命令改为 `pnpm replan:prepare --from task-state`；已经存在的 `replan/` 不会被覆盖。

人工保存将第二章改为准备材料中的完整新结尾。第三章保留原文；模型实际读完前后文与旧交付后，只更新 `replan/调整后的计划.md` 和 `replan/当前进度.md`。新计划中的工作尚未执行，旧导出也不会自动更新。

## 现有能力与证据

本实验沿用同一套 Store、CLI 和 MCP；Codex SDK 使用官方会话执行机制。

| 入口 | 实际职责 |
| --- | --- |
| `pnpm lab show --db 数据库 --work qinglan` | 读作品资料和章节目录，目录没有完整正文 |
| `pnpm lab chapter 1 --db 数据库 --work qinglan` | 读指定章完整正文、修订和状态 |
| `pnpm lab save 输入.json --db 数据库 --work qinglan` | 按输入中的当前修订保存人工草稿；旧依据会被拒绝 |
| `pnpm lab export 交付.md --db 数据库 --work qinglan` | 导出按章排列的正文、修订和状态 |
| `Store.exportWork` | 返回当前完整导出文本，可在内存中比较，不写交付文件 |
| `pnpm prototype:mcp --db 数据库 --work qinglan --output 读回.json` | 官方 MCP Client 读同一业务库并检查连接关闭 |

任务说明把 U 映射到教学访谈，W 映射到实际作品对象，R 映射到本轮真实初始化与读回，K 映射到本节能力说明。新任务输入来自当前可读材料；跨会话实录作为明确标注的历史材料使用，不把旧结论当作当前业务事实。

独立检查可用 `node scripts/capture-stage.mjs --folder task-state --output runs/独立核对.json`，记录当前业务五表、完整正文和实际文件；重新规划时把目录换为 `replan`。检查记录不替代人的连续阅读或文学选择。

交付自带 `source-version.json`，克隆后无需 Git 仓库。本目录实录只保留明确列出的教学输入、结果与检查，不含账户凭据、私有宿主目录、原始 SDK 事件和数据库。

`materials/跨会话实录/` 可供直接准备重规划；`materials/重规划实录/` 是已经结束的一次实际任务，只供阅读；`materials/原型实录/` 提供三种界面的实际截图。历史实录保留原始文字与版本，来源和已知失败见 `交付说明.md`。
