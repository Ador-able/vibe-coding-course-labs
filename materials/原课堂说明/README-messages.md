# 消息保存与输入准备练习

这个入口把完整历史 UI 消息保存到自己的 SQLite，再读回、重开记录并准备下一轮输入。它不运行模型，不恢复历史生成，不重放流。旧实时和回放入口仍在各自原文件中。

完整结束来源是 `1153e17e-e0b4-4870-978f-bf0eca94b0fb`，停止来源是 `f7f927eb-9faa-49d4-af68-fe3429ed2e67`。导入用户外壳和人工校正是本节教师材料；两份助手消息来自完整历史原件，正文、半句、未知用量和原 ID 保留。输入在 `fixtures/message-history`，页面可以查看它们的完整字节清单。

## 从独立包恢复

在新解压的练习目录内执行；不要在另一个项目的 Git 或已有业务库中运行：

```powershell
git init
git fetch ./消息保存练习.bundle refs/tags/vcm-04-03-start:refs/tags/vcm-04-03-start refs/tags/vcm-04-03-code:refs/tags/vcm-04-03-code refs/tags/vcm-04-03-ui:refs/tags/vcm-04-03-ui refs/tags/vcm-04-03-final:refs/tags/vcm-04-03-final
git reset --mixed vcm-04-03-final
git switch --detach vcm-04-03-final
pnpm install --frozen-lockfile
pnpm run messages:check
pnpm run messages:build
```

`git reset --mixed` 仅在这个新解压目录中设置 HEAD 和索引，保持完整包文件；然后转成固定交付点的 detached HEAD。使用 Node24.12.0 和 pnpm11.20.0；锁文件固定 AI SDK7.0.122。Node 的 SQLite API 属于 Active development，这个本地练习不代表生产部署评估。`pnpm-workspace.yaml` 将本目录作为独立安装根。依赖本地安装，无需账户、模型密钥或全局插件。

## 启动自己的数据库

在练习目录内选择一个新实验 ID，记住输出的数据库路径。服务只监听本机4335；若该端口被占用，请用 `--port` 明确选择另一空闲端口。

```powershell
$messageExperimentId = [Guid]::NewGuid().ToString()
$messageDatabasePath = Join-Path (Get-Location).Path ".local-data/$messageExperimentId.sqlite"
$messageRecordDirectory = Join-Path (Get-Location).Path "artifacts/messages-$messageExperimentId"
pnpm run messages:dev --db $messageDatabasePath --evidence-dir $messageRecordDirectory
```

打开 `http://127.0.0.1:4335/message-history.html`。服务输出自身 ID、进程号、当前 Git HEAD、数据库与完整 API 日志路径。启动时要求本目录有自己的 Git，且代码没有未固定改动。静态构建、类型检查不创建数据库；数据库仅在上述服务命令中明确打开。

先装入“用户材料”；正常来源接着依次装入第4、第57快照及完整历史消息。三份助手对象使用同一消息 ID，只更新同一条数据库行。另选停止来源，先保存用户材料，再保存停止原件。会话 ID 是新建的保存记录身份，不冒称原模型运行 ID。

第4、第57快照保存为 `incomplete`。只有正常原件的最终消息结合原件 `state=completed` 才保存为 `completed`；停止原件保存为 `stopped`。这项应用状态由服务根据来源提供，浏览器不提交成功标记。完整正文中的“限20人”和新增10/10期限仍需按原纪要审查；数据库状态不是事实认证。

## 独立读回与重开

每次页面保存以后都有一项独立 GET。要从另一个 SQLite 连接读取原始行和完整重建消息，在另一个终端执行：

```powershell
pnpm run messages:inspect --db $messageDatabasePath --out (Join-Path $messageRecordDirectory '独立SQL读回.json')
```

若使用新终端，把 `--db` 与 `--out` 后面的值换成服务输出的实际路径。检查全部消息 ID、position、role、parts 顺序及完整 metadata。文件复制的 SHA 和数据库 JSON 的完整解析值是两种比较，不把重新格式化后的字节视为原字节。

将页面的会话 URL 保存下来，停止本服务，再用**同一个数据库路径**启动同一固定代码：

```powershell
pnpm run messages:dev --db $messageDatabasePath --evidence-dir $messageRecordDirectory
```

在新标签或新浏览器上下文打开原会话 URL。页面从 GET 读取数据库；不用 localStorage 或旧标签内存补回历史。这里验证的是保存记录可读，原模型运行没有恢复。

## 用真实写锁观察保存失败

在已保存的助手消息下核对、编辑“人的校正”。独立终端持有同一个数据库的写锁：

```powershell
pnpm run messages:lock --db $messageDatabasePath --log (Join-Path $messageRecordDirectory '独立写锁.jsonl')
```

看到 `lock-acquired` 后，在页面亲自点击“保存校正”。此时写入应由真实 SQLite 连接拒绝，页面保留输入，不显示已保存。用独立只读连接检查库是否仍是失败前的完整对象。

回到锁终端按 Enter 释放锁；**再次回到页面亲自保存**，然后检查保存回执、GET 和独立 SQL。锁工具不自动操作页面，服务不自动重试。校正保存的网络结果不能确认时，输入仍保留，但须先用“重新读取”核对再保存。新建会话时 POST 返回身份未收到的网络歧义没有在本练习中验证或完整处理，不能据此认为所有创建重试都已解决。

## 比较下一轮输入

校正保存并读回以后，点击一次“准备下一轮输入”。服务先检查完整 UI 数组，再用固定 SDK 的 `convertToModelMessages` 生成三份完整投影：

- P0：所有 UI 消息，SDK 默认转换，仅观察停止文字能否进入；不是本轮采用的输入。
- P1：应用排除整条未完成助手消息，再默认转换；仍不主动转换自定义校正 data。
- P2：同 P1 的历史选择，显式将 `data-review-note` 转成“人工校正：…”的文本。进度 data 不发送。

完整投影、选择前后 UI 数组、被排除 ID/原因及下一轮规则都在“完整对象与转换比较”中。P2 是本轮**准备**的输入，没有发给模型。默认转换不按 `text.state` 自动排除半句，页面能显示校正也不证明具体校正已进入模型消息。

停止原件仍保存在库中。这里明确选择整条停止助手消息不进入成功历史，其完整摘要也没有自动采用；原纪要和人的重做要求仍进入下一轮准备材料。其他使用目的应明确选择对象，不能仅凭可以转换决定采用。

## 三个整页方向

“原版”“台面”“笔记页”共用同一完整对象和操作。切换只改变布局，不重新装入、保存或转换。保留相同纪要、长正文、半句、必要字段和操作；分别检查功能状态、可辨认程度和整幅口吻。原版的并列、台面的集中和笔记页的连续阅读各有代价，不能只凭宽松或整齐决定胜负。

## 调用链与记录

`server.ts` 读取固定材料 → `store.ts` 保存完整 UI parts/metadata及独立应用状态 → GET 按 position 读回 → `projection.ts` 校验并选择历史 → 官方 SDK 转换为模型消息。`main.ts` 负责显示、保留未保存校正和三方向；不持有业务数据库，也不调用模型。

数据库仅两表：`conversations`、`messages`。消息主键 `(conversation_id,message_id)`，同会话 position 唯一，外键连接会话。没有 metadata 的消息使用 SQL NULL，读回不增加 `metadata:null`；JSON 文本 `null` 和缺字段分开。保存为单个 JSON 数组保留所有 parts 顺序，不意味着所有业务都必须选同一种表结构。

API JSONL 保留完整实际输入、状态和返回；页面“下载当前观察”另含本标签请求、保存对象、校正草稿及准备输入。`messages-inspect.mjs` 只读现有数据库；`messages-lock.mjs` 只在明确运行时持锁。停止/读回/准备均不会发模型请求。

## 查看完整留存材料

`evidence/message-history/60d0b170-bb63-4b8e-a0de-7cd8841bed70` 包含两条记录的全部 HTTP 返回、十份独立 SQL 读回、真实写锁、完整输入准备和整页界面。`实验说明.md` 给出实际执行版本与截图边界，`图像原格式清单.json` 标明早期扩展名为 PNG 但实际为 JPEG 的原件。留存文件没有据文件名重写图片字节；正文采用图另列准确格式。

要只读核对停止服务后的完整 SQLite 原件，在新终端使用：

```powershell
$messageRecordedDatabase = Join-Path (Get-Location).Path 'evidence/message-history/60d0b170-bb63-4b8e-a0de-7cd8841bed70/保存后数据库.sqlite'
New-Item -ItemType Directory -Path './artifacts' -Force | Out-Null
pnpm run messages:inspect --db $messageRecordedDatabase --out './artifacts/留存数据库完整读回.json'
```

该命令只读归档库；实际练习仍使用自己选择的 `.local-data` 路径。留存助手消息和人的校正并不等于业务采用的稿件版本。本实验保留原件的缺 metadata 字段及未知 usage/finishReason；没有测试任意输入 `metadata:null` 的所有情况。
