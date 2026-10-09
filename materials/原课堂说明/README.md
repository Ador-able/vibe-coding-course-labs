# Webhook：收到与完成

这个课堂配置使用 n8n 2.41.6 的原生节点，在任务表与反馈表中分别保存真实结果。HTTP 接收响应、业务完成和通知送达是三个判断；本例没有通知接收者，通知状态始终为 `not_sent`。

完整工作流、两表字段及两份教师输入随本目录提供。绑定读者实际新建的表后导入工作流；机器分配的表 ID、行 ID 和执行 ID 应从自己的实例取得，不能把模板占位符当作实际对象。

## 创建两张自己的数据表

在同一个 n8n 项目的 Data tables 页中创建任务表与反馈表，按 `tables/task-table.json` 和 `tables/feedback-table.json` 的字段名、类型设置。两表都由 n8n 自动增加系统列 `id`、`createdAt`、`updatedAt`，不要自行新增同名列或预置行 ID。

任务表的六项业务字段保存原始事件的编号、作品、章节、读者与全文。`failTask` 保留课堂条件；`status` 是 received/completed/failed；`notificationStatus` 始终 not_sent；`executionId` 保存产生任务的实际执行 ID。`feedbackRowId` 在收到时为空，成功写入反馈后保存该反馈的实际行 ID。反馈表的 `taskRowId` 保存来源任务的真实系统 `id`，不等同于 `eventId` 或 `feedbackId`。

在各表页面取得自己的实际表 ID，然后仅生成已绑定的导入文件：

```plaintext
node bind.mjs --task-table 实际任务表ID --feedback-table 实际反馈表ID --output bound/workflow.json --workflow-name course-m13-反馈收到与完成 --webhook-path course-m13-feedback-evidence
```

绑定脚本只写本地 JSON，不创建表，不导入、不发布、不调用 HTTP。`workflow.template.json` 的 `__TASK_TABLE_ID__` 和 `__FEEDBACK_TABLE_ID__` 是未绑定占位符。两个表需属于工作流有权访问的同一项目。若实例已存在同名路径，选择自己的新路径并把后续请求 URL 对齐。

在 n8n 导入 `bound/workflow.json`，核对节点里的两张表与完整映射后保存。模板没有账户凭证或已发布版本 ID；n8n 保存后生成当前工作流 ID 和版本 ID。

## 核对完整业务链

完整路径有两条分支：

1. Webhook 收到 POST 完整 body；按 eventId 查询任务表。查询无匹配行时，通过 Always Output Data 保留一项空对象，再由 If 进入新事件分支。存在真实行时进入重复事件分支，返回 duplicate=true、既有 taskRowId 和实际 status，不再次插入任务或反馈。
2. 新事件实际插入 received，得到系统行 id；Respond to Webhook 返回 202、该任务行 ID、实际 executionId 和 received。随后 Wait 5 秒，再由严格布尔 If 读取原 body.failTask。字符串 `"false"` 不是这份输入契约的布尔 false；保持严格类型，不启用宽松转换。
3. failTask=false 时先插入完整反馈，得到真实反馈行 id，再按原任务行 id 更新 completed，并记录 feedbackRowId。failTask=true 时只更新原任务为 failed，然后 Stop And Error 真正结束执行。两个分支的 notificationStatus 都保持 not_sent。

Wait 的 5 秒只是留给我们读取 received 的观察窗口。固定版本对小于 65 秒的等待保留当前执行活动，这个例子不能证明持久休眠、服务重启恢复或长期可靠调度。

## 从测试监听到正式入口

先保存未发布的工作流。在 Webhook 节点选择 Test URL，点击 Listen for test event，然后向界面显示的测试 URL 发送一次 `inputs/course-feedback-E01.json` 的完整原文；不要使用 pinData 或手工填节点输出替代真正收到 HTTP。固定 2.41.6 的后台手动运行入口也接受 `{ "triggerToStartFrom": { "name": "接收完整反馈" } }`，实际注册是否成功仍以测试响应和执行数据为准。

测试同样会写真实表。如果测试已写入 E01，保留这次执行与两表全文；为正式练习另建同结构空表，绑定正式表 ID 并保存正式版本，不删除测试结果，也不把测试遗留 E01 当成正式首次插入。

发布当前保存版本，等实例实际显示发布成功，再向 Webhook 节点显示的 Production URL 发送 E01 一次。这个入口可以在自己的本机课堂实例运行；“Production URL”不表示已部署到互联网。当前独立课堂例子的入口为 `http://127.0.0.1:5688/webhook/course-m13-feedback-evidence`；使用自己的实例时，以节点显示的 URL 为准。

发送时显式使用 `Content-Type: application/json`，文件原文作为整个请求体。收到 202 后立即读取任务表，核实际状态仍为 received、全文相同、反馈表尚未新增；再等待并读取真实终态。不要把 202 解释为 completed。

完成以后逐字重送同一个 E01 文件一次，核 HTTP 返回 duplicate=true 和既有行状态，且两表对应 E01 仍各一条。随后发送 E02 一次，核任务 failed、没有 E02 成功反馈，以及 Stop And Error 的原生错误终态；E01 原成果保留。输入若未收到回复或遇到超时，先保留请求和错误，查询服务器对象，不自动再次发送。

Respond to Webhook 已在新事件和重复事件分支各有明确入口。n8n 可能在没有执行 Respond 节点时返回标准 200，所以 HTTP 200、绿色节点或一条执行摘要不能代替两表完整读回。任务与反馈通过真实系统行 ID 相互对应，通知没有发送就仍是 not_sent。

本节只检查串行重送 E01 的识别，不保证并发提交、崩溃窗口、跨进程条件下的全局恰好一次。接口响应、任务状态、完整业务材料、执行终态分别保留。本配置没有模型请求，也不评判两份教师反馈是否已被小说采用。

## 时区与定时

工作流明确采用 Asia/Shanghai。这个相对 5 秒等待不受时区改变。将来用 Schedule Trigger 时，要检查工作流时区（未设时使用实例时区）、设置的计划、发布版本与实际触发执行；Webhook 或手动运行不能替代定时触发证据。本模板没有常驻定时任务。

节点版本和固定镜像说明见 `runtime.json`。导入配置、语法核对与真实运行是不同证据；以自己实例的实际对象与结果判断本次练习是否完成。
