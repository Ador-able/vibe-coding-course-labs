# 逐项反馈与有限重做

这是八份教师日报的独立课堂副本。完整来源、教师参考、一次旧请求及其八项原答都保留。旧的 R01、R06 引用失败和错误汇总不会被修成历史成功；本节只准备两项各一次的反馈请求。生成、技术检查和内容采用分别记录。

## 固定依赖

AI SDK 7.0.122、OpenAI compatible provider 3.0.59，按现有 pnpm 锁安装：

```powershell
pnpm install --frozen-lockfile --offline --package-import-method copy --virtual-store-dir .pnpm
```

离线安装需要本机已有对应包；其他机器按同一锁正常安装，不改版本。实际 Node 和 pnpm 版本见固定回执。`node_modules`、本地虚拟存储和新状态不入 Git。源起点为 `9415697030adf3921890b2ee4e9112dc83d6d3e3`；业务状态由下面的明确入口产生，不能从 Git 提交推断已经请求模型。

## 原材料与状态

`inputs/reports.json` 是八份完整教师材料，`inputs/teacher-reference.json` 是旧请求前的参考。`runs/extract-01` 保留单次旧发送与返回，`runs/inspection.json` 和 `content-review.md` 保留原核对与拒绝采用的理由。

先登记历史，创建新的状态目录：

```powershell
pnpm run history state/history-01
```

这一步不进入 SDK、供应商或 HTTP。八项各有来源、完整派生对象和处理配方；八条历史 attempt 都指向同一个旧请求，历史 HTTP 总数仍是1。登记的结构、业务值与连续引用检查是本节本地检查，原187检查也另有完整原件。六项历史结果保持原配方和原对象，没有被叫作新反馈模板缓存命中。原汇总单独保存为 rejected。

## 一次有限的两项重做

下面是模型入口。执行进程需有已授权的 `DASHSCOPE_API_KEY`；不在文件里放密钥，不输出或保存含 Authorization 的请求头。

```powershell
pnpm run repair state/history-01
```

固定 R01／R06，以两个 Promise 同时执行，每项最多一次 fetch 尝试，没有第三次请求或自动重试。完整教师任务和人工反馈在 `prompts/repair`，原指令在 `prompts/instructions.txt`。使用 qwen-plus-2025-12-01、temperature 0、maxOutputTokens 3072、maxRetries 0、enable_thinking false，以及 SDK 的总生成超时60秒。超时是 SDK 取消边界，不是磁盘写入的硬实时保证。

每个新 attempt 有独立目录，保留完整 prompt、instructions、feedback、发送体、响应体、原输出和错误；wrapper 进入与真正 fetch 尝试分开计数。供应商没有响应或 SDK 失败，不代表供应商没处理请求。操作者 Ctrl+C 会发出取消信号，不自动重发；本节不据保存后读回推断测试了中途崩溃恢复。

`generationState=returned` 表示取得了生成结果；`checkState=passed` 只表示当前固定结构、值、连续引用与上下文标记检查通过；`contentDecision=needs_human` 仍需人阅读全文。R06 的引用还要由人判断是否真正支持实际 null；标题句号归属也没有自动确认。原汇总仍为未采用，不重新计算统计。

若模型、JSON、引用或内容值失败，本项原件保留，repair 以非零退出；另一项已经保存的结果也保留。不要重复 repair。继续读完整记录，根据本次事实判断失败，不凑成功重跑。

## 保存后的检查和新进程读取

```powershell
pnpm run check:state state/history-01 runs/check-01.json
pnpm run read:state state/history-01 runs/read-01.json
```

这两个入口只导入 Node 内置模块和 `records.mjs`，不加载 AI SDK、不读 API_KEY、不请求 HTTP。第一步核来源与完整发送／返回的对应，六项历史文件原字节、两个新 attempt 和拒绝采用的汇总；第二步在新的进程读取完整状态、全部 attempt 与完整输入。各自把回执保存到状态目录之外，并比较状态前后原字节。

技术核对器正常退出不表示内容采用；技术检查失败可以保留在状态内，读取入口仍可显示已有结果。本地记录不等于供应商前缀缓存，也不证明异步 Batch 服务已提交或计费。

## 三方向只读页面

```powershell
pnpm run prepare:page runs/read-01.json public/state.json
python -m http.server 4357 --bind 127.0.0.1 --directory public
```

打开 `http://127.0.0.1:4357/`，查看 R06 的原材料、历史失败、人工反馈和当前结果／待确认，再查看 R01；未采用的原汇总可展开。页面只有保存数据的查看动作，没有模型或重做按钮。静态 `state.json` 来自完整纯读取回执，后续状态变化须另生成明确的新数据文件，不能假装自动刷新。

原版、台面和笔记页采用同一 DOM、内容和操作。本节原版是这个状态页面的基准设计；10-04 没有这张页面。三方向壳与色域来自已有资料回查练习，具体来源与原字节在 `页面壳来源.json`。实际渲染后分别检查功能状态、位置辨认和整体口吻，记录密度、列宽和页长的代价；没有指定哪一版胜出。

停止静态服务时只结束自己启动的准确进程。不修改全局配置、账号、旧187项目或其他课程服务。
