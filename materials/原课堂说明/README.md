# 回答与资料版本

这个课堂练习把已有检索候选接到两次自然回答，中间只更新一份费用便签。小说18个块和3份未改便签继续使用原对象及原向量；费用便签从v1换为v2，当前仍是22块的混合版本。便签是教师材料，不代表真人预约、付款、故障结论或小说设定采用。

## 恢复与依赖

把本章固定的资料代码.bundle放到新独立目录外，从bundle克隆，检出course-answer-update-end-04标签。进入克隆出的Git根，先核`git status --porcelain=v1 --untracked-files=all`为空。不要把包解压进父项目后直接运行，也不要选择父项目HEAD。

```plaintext
git clone 资料代码.bundle answer-source-lab
cd answer-source-lab
git switch --detach course-answer-update-end-04
git status --porcelain=v1 --untracked-files=all
pnpm install --frozen-lockfile
node scripts/check-update-inputs.mjs
```

采用Node 24.12.0至25之前的24系列，pnpm 11.20.0。锁文件沿已有起点，不改依赖版本：ai 7.0.122、@ai-sdk/openai-compatible 3.0.59、@orama/orama和@orama/tokenizers 3.1.18。已有原始解析/切块代码属于前置来源，本节不调用它们，不重新读PDF、嵌入旧25项或执行旧6条件排名。

`inputs/update`保存16份完整冻结输入和清单；`public/materials/AX-17日期与费用便签-v2.txt`是真实291字节、119 UTF16字元的新四行原文，SHA256为14b086f003cb9a47595a3ca52e46ac77b4c9eba5f70bee6d643338d6dc126852。旧费用和委托TXT仍分别保留。TXT按行和正文位置定位，旧元信息中的page-1不是PDF页。

## 唯一自然执行链

私有启动进程只提供既有API_KEY，不把凭据文件或启动器放进公共材料。端点和模型来自冻结契约，程序不读取全局配置或凭据文件。公开命令如下；输出目录名必须是一个未用过的明确名字，程序不能覆盖已有记录。

```plaintext
node scripts/observe-current-answers.mjs current-answer-01
node scripts/check-current-answers.mjs runs/current-answer-01/report.json
node scripts/prepare-answer-page.mjs runs/current-answer-01/report.json
```

顺序固定为A一次generateText、一批2项embedMany、Orama删除旧块/插入新块、一次更新后的两路检索与RRF、B一次generateText。最多三个实际原生fetch尝试，各阶段最多一个；maxRetries:0，嵌入maxParallelCalls:1，单次60秒。回答模型qwen-plus-2025-12-01、最多1200输出token、enable_thinking:false；嵌入text-embedding-v4、1024维。计数分别记录wrapper入口和真正进入fetch的尝试，不能据此证明供应商已收到或费用免费。真实账单没有从SDK取得。

A只使用上一节已保存Q2-filtered候选的全文，不执行旧排名。A抛错、没有可用text或因长度限制结束，就保存并停止后续；自然完整但有内容错误的A原样进入B。新向量失败则保留A及实际错误，停止更新。删除或插入失败则留下各子状态和索引快照，不自动重试，也不称事务回滚。B候选为空不调用B，只有一份就只附那一份，不能用设计提案补回资料。

当前where只有memo和AX-17，不用旧全库version:v1排除费用v2，也不用v2排掉委托v1。21个旧材料向量逐对象保留，新费用和本轮独立查询才用新向量。两路各取top3，RRF k=60、名次从1开始、按块ID去重、并列按ID；完整并集决定B的来源。提示为回查方便按docId排列全文，原排序另存。独立查询由教师固定，没有第三次问题改写请求。

B的messages是原用户问题、A本次实际完整text、本轮追问及当前实际候选。没有填入教师理想答案，没有重复附上旧A检索正文，也没有把旧金额当当前条件。两轮同时改变资料、历史和问题，因此不能将结果解释为严格单变量改进。

## 原件与判断

每阶段调用前保存完整实际system/messages和来源快照，原HTTP正文、SDK公开投影、全部新向量、usage及自然失败都在唯一运行目录。SDK finalStep只保留本次内容、模型、结束、usage、性能及请求/响应正文等公开字段，省略headers；不声称整个SDK对象原样公开。

current-index.json保存当前22个全文对象、向量、逐docId当前版本和旧归档，再只读重新载入核同。这不是数据库事务、并发更新或远端索引。`completed`只说明步骤走到B返回；应另外读finishReason、完整回答与来源，判断是否受长度限制、是否支持日期/金额/未知。标签存在仅说明可定位，不能证明引用支持正确，所有内容仍为needs_human。

`check-current-answers`只读核对请求、对象与原字节，不重新运行检索或问答，不把结构一致改写为语义合格。不要因检查进程退出0就采用回答。

## 只读页面

prepare-answer-page把指定真实报告原字节复制到public/answer-observation.json，并复制五份对应TXT。可用成熟本地静态服务显示：

```plaintext
python -X utf8 -m http.server 4347 --bind 127.0.0.1 --directory public
```

打开http://127.0.0.1:4347，选择回答和来源，按“查看依据”。A的FEE-v1永远指向当时完整v1，B只显示它本轮实际输入的FEE-v2/TASK-v1。选择A/B、来源和方向只读取固定记录及TXT，不再调用模型。加载或来源失败会保留实际已返回回答，不伪造成功。

原版/台面/笔记页共享同一DOM、完整回答和关键状态。有限比较是同一B与新费用原文，桌面1280×900和窄屏390×844；再用A旧FEE-v1→B新FEE-v2确认绑定。功能、辨认与审美分别判断，原版可保留。样例运行前没有真实回答或页面证据，不能用静态代码代替实际使用结果。
