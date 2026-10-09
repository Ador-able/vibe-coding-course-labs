# 何时使用子代理：同材料有限调查

本实验使用现成 Codex 的读取与子代理能力；代码只记录事件，不实现代理调度。比较两个新主会话：A 自己调查，B 委派一个默认子代理后回查原文。每个条件只进行一次自然任务，运行失败也保留。

## 可运行起点

需要 Git、Node.js 24.12.0 或更新版本、pnpm 11.20.0，以及本机已登录的 Codex。只使用项目本地安装的官方 SDK/CLI 0.160.0；模型和推理继承运行主机的默认值。本次固定主机默认为 gpt-6.1-sol/high，不因此规定其他主机必须使用同一个模型。

将完整包解压到一个新的独立目录，在包目录运行以下命令。ZIP 不含 .git；先从随包 bundle 恢复两个固定标签并把 HEAD 设为公开交付完成点。reset --mixed 只设置 HEAD 和索引，保留解压文件字节；不要在已有项目中执行这些初始化命令。

```powershell
git init
git fetch ".\子代理有限比较-完整Git历史.bundle" "refs/tags/vcm-14-01-start:refs/tags/vcm-14-01-start" "refs/tags/vcm-14-01-end:refs/tags/vcm-14-01-end"
git reset --mixed vcm-14-01-end
git rev-parse HEAD
git diff --exit-code
pnpm install --frozen-lockfile
node --check scripts/observe.mjs
```

git rev-parse HEAD 的结果应与固定文件清单.json 的 publicDeliveryEnd 相同，git diff 应没有输出。以上检查不调用模型。Git 恢复不恢复 Codex 登录、宿主配置、聊天或业务状态。确认具备宿主能力并决定重新调查时，再执行下面两条命令：

```powershell
pnpm observe --condition A
pnpm observe --condition B
```

上面两条 observe 命令各发起一次新的模型主任务，B 在任务内部请求一个子代理。重新执行会产生新的实际任务与使用量，不能把新结果冒充本轮记录。学习文章也可直接阅读已有完整材料、输入与返回，无需重新调用模型。

## 材料与范围

materials/三章完整待审稿.md 是此前实际导出的三章 r1/draft，原文件逐字节保留；三份分章文件正文逐字相同。materials/当前要求与设定.json 收录当前用途、要求、设定与三章大纲，并说明归档和本轮状态的边界。没有连接数据库、生成小说或采用正文。

prompts 内的两份完整输入只改变自己调查或委派的组织方法。完整调查任务与材料相同；最后两处回查固定为第三章已经观察到的发现及原因未决问答。B 的实际委派内容、fork 参数、工作目录与模型继承要根据真实子会话记录核对，不能凭提示句当成执行事实。

## 真实记录

scripts/observe.mjs 用官方 startThread/runStreamed，模型使用 read-only，外部记录器保存本轮全部公开事件与接收时间。runs 下每次 UUID 目录保留完整输入、原始 JSONL、带时间 JSONL、全部公开代理消息、结束状态与材料前后 SHA。没有预设取消、任务重试或追加模型循环。

父会话的公开事件不能代替子会话所有工具返回。本次创建实际返回 canonical task_name，公开 SDK receiver_thread_ids 为空；子 UUID 由该 B 父 UUID 的真实线程 source 关系限定取得。随后核对实际子输入、函数参数、全部工具返回和自然结束。主代理回查与子代理调查分开，不把一份报告转发称为完成复核。

耗时是这一轮实际墙钟记录；公开工具返回字符、文件字节和累计 usage 是不同口径，不能冒充单时刻 context 占用或整个团队消费。宿主既有系统、工具、AGENTS、技能及记忆背景和任务以外读取一并记录；不复制父聊天不意味着只有任务文字。三章材料较短，结果不预设委派胜出，不外推长任务性能，也不判断人的文学采用。

## 本轮实际接口与可复核范围

prompts/会话B完整输入.txt 原样保留执行前的 fork_context=false 设计。实际宿主暴露 collaboration.spawn_agent，实际参数 fork_turns='none'、task_name='independent_investigation'，没有模型、推理或角色覆盖。三会话记录的 multi_agent_version 均为 v2；静态 CLI feature 列表和 Rust v1 fork_context 类型不代表实际模型工具接口。

父创建参数 message 与子初始 encrypted_content 是相同的2532字节密文，无法独立核实明文逐字等于 prompts/完整调查任务.txt。保留原字段与限制，不解密、猜测或为满足设计重跑。实际子输入的可读记录没有父用户任务或聊天的消息副本，但有宿主既有说明、项目材料范围、技能和记忆摘要；不透明的委派消息是否另含背景说明不能核实。SDK/CLI 与材料可固定，宿主提供的服务端能力及默认模型配置未在包中冻结；再次执行需核实际能力与权限。

records 下包含两轮公开 SDK 原始输入/事件/计时/回执、三个指定会话的 JSONL 公开投影、完整七个 stdout、三个最终回答和 B 真正收到的完整子报告。公开投影省略账户身份字段值、宿主内部基础指令正文及各条 system/developer 指令正文，包括其中私有记忆背景；本次实际每会话10个字符串字段。各处原位置、类型、长度和 SHA 留在公开投影边界.json，受保护正文仅留本机供审核。其余记录及字段逐项核对保持，2532字节不透明委派保留；消息角色、教师输入、全部工具调用/返回、输出、状态及用量保留。省略宿主背景不表示运行时无背景。

公开 Git 项目以实际执行起点的安全代码和材料为祖先，公开完成点只保存公开成果和说明；bundle 不包含本机私有历史对象。执行版本与公开交付版本分开记录，没有在完成点再次执行两轮。完整三章仍 draft，文学采用待人。Git记录与ZIP逐文件清单分别核对，不把课程图像当真实界面或实测结果。
