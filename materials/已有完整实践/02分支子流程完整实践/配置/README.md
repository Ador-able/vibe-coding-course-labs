# 本轮批次进入子流程

这组原生n8n配置处理一批三条完整教师反馈。父流程传入同一批次的三项，子流程按原值分支、保存完整回执，再把最后节点的全部结果交还父流程。没有模型、章稿修改、聊天记忆或通知发送。

运行条件是课程既有n8n2.41.6课堂底座；镜像摘要在runtime.json。模板中的占位身份必须换成自己实例中的真实对象，不能把别人的表或子流程ID当作可跨实例复用的材料。

## 材料和预期

inputs/current-batch.json是一次业务POST的完整正文，顺序E02、E01、E03。inputs/catalog.json另有一个归档项，只用于检查“本轮”与“目录全部”的差别，不是线上全库，也不进入当前请求。

原值严格等于布尔false时为recorded，严格等于布尔true时为classroom_failed，其余为needs_review。字符串“false”原样保留，不自动按false处理。recorded只表示本节完整回执登记，classroom_failed是课堂业务条件，needs_review供人核对。没有抛出运行时工具异常的条件，不据此证明任意异常都继续。

## 绑定和导入

1. 在自己的课堂n8n项目新建空表，按receipt-table.json建立14列。保留真实表身份。
2. 用成熟Node运行以下本地绑定命令，将TABLE_ID替换成该表真实ID。此脚本只写本地JSON，不调用服务。

```plaintext
node bind-branch.mjs --receipt-table TABLE_ID --child-output bound/child.json
```

3. 导入bound/child.json，保存独立子流程，保留真实工作流ID及版本。普通Execute Sub-workflow与AI的Workflow Tool发布要求不是同一接口；当前实例实际保存、发布和执行版本分别记录。
4. 将CHILD_ID替换成刚保存的子流程ID，生成父流程配置：

```plaintext
node bind-branch.mjs --child-workflow CHILD_ID --parent-output bound/parent.json
```

5. 导入bound/parent.json，核其正式入口course-vcm-11-07-batch、一次全部项mode=once、等待开启、五项当前值映射和额外默认分支。只有在自己的隔离练习里保存/发布对应版本后才提交inputs/current-batch.json。

子流程由一次调用接收三个完整项，不是为每项创建一个子执行。ordinary Set/Split Out/Execute/Switch是普通节点的当前项映射；本例没有AI附属工具子节点，不能用本例保证附属子节点也逐项解析表达式。

## 按身份核对结果

打开完整POST、父拆分/调用输入、子触发器输入、每条分支、Append、完整表行、子最后输出、父接回与HTTP完整返回。先按eventId对应，再比较batchId、sourceVersion、selectedEventIds、完整feedback及作品/章/读者/反馈身份。parentExecutionId和childExecutionId来自两次真正执行，不是业务eventId。

originalInputJson是完整五项子输入的JSON值序列化，解析后核对，不冒充原请求字节。Append可能改变排列，结果数量相同也不证明身份和内容相同。默认分支要保留原值，不因类型待核而消失。

最后Data Table返回完整保存行；开启等待的父流程接回这些行。HTTP200、节点绿色、模型口头说明都不能将未完成项改为业务成功，notificationStatus=not_sent不等于送达。新表是回执表，不是文学采用记录，也不是旧E01成功反馈表。

此例只定义三个分支各一项的有限批次。未覆盖任意缺字段、空分支、并发、幂等重发、节点异常隔离、持久恢复或真实外部通知。如果发生实际失败，先保留完整输出、已写入材料和具体位置，不通过自动重复提交去凑预期结果。
