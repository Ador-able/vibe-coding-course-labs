# 小说工作台原型实验

用三章完整草稿练习如何让 AI 把未知变成可观察的实验。真实 HTTP 页面读取现有 Store；人修改后保存，CLI 与 MCP 都能从同一 Store 读回。这里没有另写模型循环。

## 运行

固定课堂环境为 Node.js 24.12.0、pnpm 11.20.0。解压下载包后，在仓库目录执行：

```shell
pnpm install --frozen-lockfile
pnpm build
pnpm prototype
```

打开终端给出的 `http://127.0.0.1:4326`。首次运行用完整归档经 Store 人工初始化本轮 UUID 作品和三章草稿；已有 `data/prototype.sqlite` 时读取它，不重置或覆盖。另做实验可以指定新路径：`pnpm prototype --db data/another-prototype.sqlite --port 4327`。

当前稿默认第 2 章。查看章名、完整正文和读取修订；修改后点“保存草稿”。打开另一窗口，先保留同一旧修订，再让第一窗口保存；旧窗口保存会收到修订冲突。它保留本地修改，“读取当前稿”会提供已保存稿供对照。“以当前稿重新编辑”明确改用已保存正文；不会自动合并。未保存文本只在本页缓冲，离开或刷新需自己保存。

页面下方可切换原版、台面和笔记页。三个方案共享字段、文案、数据与业务操作；可以用 `?variant=original`、`?variant=desk`、`?variant=notes` 保留选择。`vcm-15-05-start` 提供原版，`vcm-15-05-end` 提供三个方案。比较结论由使用者选择，固定完成点不表示哪一版胜出。

## 实验与读回

```shell
pnpm test
pnpm prototype:ui
pnpm prototype:time
```

浏览器证据脚本使用项目锁定的 Playwright 1.63.0 和本机已安装的 Edge，不安装系统浏览器。它为每个方案生成独立 UUID 库，保持相同完整作品资料、三章正文、必要操作和 1440×1200 视口；另记录 390×844 窄屏。完整 HTTP 输入返回、初始化与最终业务状态、整页和关键状态图片在 `runs/prototype-ui-运行标识`。失败轮次全部帧不计为通过证据。起点只跑 `pnpm prototype:ui --variants original`。

使用终端中的实际作品 ID 查看保存结果：

```shell
pnpm lab chapter 2 --db data/prototype.sqlite --work 实际作品ID
pnpm prototype:mcp --db data/prototype.sqlite --work 实际作品ID --output runs/mcp-readback.json
```

官方 MCP Client 只调用三项读取工具，保存完整协议、实际返回和只读五表核对；它不运行模型。固定 MCP SDK 为 1.31.0，这个实验使用其 2025-11-25 初始化协议；它不是当前 2026 MCP 初始化方式的教程。CLI 和 MCP 的业务代码沿用同一 Store；成熟 Codex Harness 入口保留在 `src/agent.ts`，调用模型需要该入口自己的可用账户和配置，本节不要求运行。

`prototype:time` 是教师构造的独立时间规则，不是小说功能。明确时间输入用于检查不足 24 小时、恰满、暂停、恢复和新反馈重新计时；没有实际发送提醒。

## 范围

本地 HTTP、人工修改、修订拒绝、读回与网络未确认状态可以实际观察。三章输入性质、通过条件和未验证范围见 [PROTOTYPE.md](PROTOTYPE.md)。保存草稿不代表已获文学认可；工具读回不代表模型理解并使用了改稿。这里只提供本机教学入口，不包含多人身份、线上发布或自动撤回未知写入。

比较时分别记录功能、位置辨认、整幅口吻和结构代价。实际截图与操作仍需人看；脚本通过不替代审美判断。原型给出问题的证据，是否采用页面或代码另作决定。
