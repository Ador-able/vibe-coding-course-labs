# 课堂记录

默认页面读取这里的实际记录，不提交 Webhook、不查询正在运行的 n8n、不请求模型。

每次采集单独保存完整输入、HTTP 回答、实际执行投影与表内独立读回。`source.json` 绑定真实执行时的 Git 提交、源码 SHA 与完整输入清单 SHA；`*.source.json` 绑定本机私密 API 原件和公开投影。

公开投影保留完整反馈、完整提取文字、完整待发送提示、原始值与业务关联。账户对象、认证头、Webhook headers 和二进制存储 data/id 留在本机；两份公开原件与实际下载元信息另存。账号、密码、API key、Cookie 和容器卷数据库不进入仓库。

相同采集目录不重复提交，失败原件保留。`readback` 只读当前五张隔离课堂表，产生新的时间目录；它不会再次提交反馈。接收者验收卡另由操作人完成，课堂实录不能代替接收者证据。

## 本章实际记录

- `feedback/`：未发布入口实际返回404；测试执行1与正式E01执行2成功。完全相同的串行重送产生执行3，沿用已有业务行。E02执行4失败，任务登记failed，未写入成功反馈。
- `files/files-01/`：执行5取回PDF与TXT完整文字，提示停在prepared_not_sent。`actual-binary-readback.json`登记原生存储流独立读取结果：83234B PDF、3245B TXT均与固定原件逐字节一致。
- `branch/batch-01/`：一次父执行6、一次子执行7，保留三条完整回执。布尔false、布尔true与字符串false分别进入recorded、classroom_failed、needs_review；没有文学采用或通知。
- `readback/final-*`：全部业务请求结束后的五表独立读回，测试任务/反馈为1/1行，正式任务/反馈为2/1行，回执3行。

业务执行源码固定在`qinglan-ch14-run-start`（9c69aef，源码SHA d172d5d3…）；完整快照在`source-versions/实际执行源码-9c69aef.json`。两张截图对应显示与采集源码SHA 8d21ad44…，快照在`source-versions/显示与采集修正源码-8d21ad4.json`。亲手运行从`qinglan-ch14-practice-start`开始，其完整输入与稳定采集源码见项目`source-version.json`；执行原件保留各自使用的版本。

文件入口返回后，首次执行列表查询为空；稍后以完整requestId与解析输入SHA确认执行5，原POST没有重发。采集启动时文件与批次请求发生约10秒重叠，各自输入、执行和读回分别保存。文件模板传入binaryMode=separate，但平台实际保存设置未保留该字段；实际binary.id标明filesystem-v2，字节依据来自原生二进制读取。

本章共7次Webhook POST（包含一次未发布探测）、7次执行，模型、Google请求与真人通知均为0。完整核验数据见`课堂实测索引与来源说明.json`。
