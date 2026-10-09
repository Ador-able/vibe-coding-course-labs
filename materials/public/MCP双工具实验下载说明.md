# MCP 双工具实验下载包

本包提供两个固定 Git 标签、完整完成版源码与实际运行证据。小说只是观察工具输入、真实保存、人的修改和失败反馈的载体。人工工作台使用命令行，没有图形页面。

## 固定版本

- 起点：`vcm-08-02-start`，`3c6dde16004469f3fc36ba417804a65880ee43e5`。已有可靠 Store、CLI、四工具 MCP、成熟 Harness 和历史成果。
- 完成点：`vcm-08-02-end`，`db7cc45749c79c061dbbc94a6e61343ac846b8a3`。提供双工具适配器、独立官方 Client 实验、说明和原始证据。
- 实际双工具运行代码：`6617e3953c0a1425d5345c854ee09a43ff40888d`，运行 `03ba0552-8582-4dbf-9deb-8412b9f005ac`。完成点只另加入这轮说明、证据及字节保存规则，源码行为相同。

`MCP双工具.bundle` 可以恢复 Git 起点、完成点和已有实验历史；`mcp-two-tools-lab/` 是完成版源码。包内不含依赖、构建文件、认证配置或本机数据库。真实运行的公开事件保留完整对象，历史任务按各自版本和标识辨认。

## 从完成点观察

在本 ZIP 解压目录执行：

```powershell
git clone ./MCP双工具.bundle mcp-two-tools-practice
cd mcp-two-tools-practice
git switch -c my-mcp-two vcm-08-02-end
pnpm install --frozen-lockfile
pnpm build
pnpm mcp:exercise
```

本次使用 Node.js 24.12.0、pnpm 11.20.0、MCP SDK 1.31.0，实际协商协议 2025-11-25。依赖锁定在当前项目内。普通实验不需要模型登录，也不收费调用模型。

每次执行创建独立 `runs/mcp-two-<UUID>/novel.sqlite`。输出包含本次资料库路径，后续人工查看必须使用这个路径，不使用归档中写明的作者本机路径。

```powershell
$experimentDb = '刚才输出的 dbPath'
pnpm lab show --db $experimentDb --work mcp-clocktower
pnpm lab chapter 1 --db $experimentDb --work mcp-clocktower
pnpm lab chapter 2 --db $experimentDb --work mcp-clocktower
```

第一章应为人的改稿 r3，正文是“【人工修改】林澈退后一步，等守塔人说明条件。”，状态 draft；第二章未写，返回 null。实验中 MCP 保存的 r2 仍在历史表，不能把它误作实验结束后的当前正文。

`mcp-two-tools-lab/` 源码目录便于阅读和对照。完整 `mcp:exercise` 会通过 Git 记录实际代码版本，因此应从上面的 Git 克隆运行。

## 从起点动手

另建目录，避免把自己的练习改动覆盖在完成版上。

```powershell
git clone ./MCP双工具.bundle mcp-two-tools-from-start
cd mcp-two-tools-from-start
git switch -c my-mcp-adapter vcm-08-02-start
pnpm install --frozen-lockfile
pnpm build
```

起点有 `src/store.ts`、`src/schemas.ts`、`src/cli.ts` 和既有完整服务。先直接验证业务函数，再按正文加入 `src/mcp-two-tools.ts`，不要重写业务库。完成版 `src/mcp-two-tools.ts` 和 `scripts/exercise-two-tools.mjs` 可逐项对照；需要完整实验脚本时从完成点读取，不自己拼造成功回执。

## 证据目录

`evidence/08-双工具MCP/`：人工业务起点、官方 Client 的完整公开协议对象、六次正常连接下的工具调用、CLI 完整读回、人工改稿、空闲断连、调用者异常及五表状态。

`evidence/02-三章接续真实运行/`：已有四工具服务的真实模型任务，第 2 章任务 `01c3ac84-3f42-4853-b153-5f896625cfff`，实际代码 `bb6b4b344f8dddc215e76baf74eff7e5ce9f42ea`。它与本章双工具实验分属不同运行，不能混成同一次调用。

详细调用链、格式校验、修订反馈和恢复范围见 `docs/MCP双工具实验.md`。纯 Client 的正文由人准备；MCP 的 `origin:'agent'` 是固定入口标记。空闲断连没有待执行写入，不证明断连撤销写入。本包没有本章的远程 HTTP、超时、ChatCut 或双工具模型调用实测。
