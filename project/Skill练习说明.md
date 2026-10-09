# 观察项目 Skill 怎样被采用

本练习沿用已有的小说工作台业务与官方 Codex Harness。方法包位于 `.agents/skills/novel-chapter-review`，其中 `SKILL.md` 给出已保存章节的只读检查方法，两份参考分别处理保存基线与叙述表现。

业务服务原有四个工具；本次宿主只开放 `read_work`、`list_chapters`、`read_chapter`，不开放保存。资料与正文仍由原来的 Store 保存。本轮样例是人工编写的两个短片段：第 1 章已经人工采用，第 2 章草稿错误地写成林澈拿到了钥匙；随后资料从 r1 改成 r2，前文修订未变。

## 固定运行环境

在实验仓库根目录核对 `package.json`、`pnpm-workspace.yaml` 与锁文件，使用 Node.js 24.12.0 和 pnpm 11.20.0。执行 `pnpm install --frozen-lockfile`，再执行 `pnpm build`。依赖固定为 Codex SDK / CLI 0.160.0、MCP SDK 1.31.0。

使用宿主正常的模型登录。实验不读取登录凭据，不改变用户的全局配置；未指定模型，沿用宿主默认选择。本节验证的是这版 Codex 的项目目录约定，其他宿主需要分别核对其发现路径和启用方式。

## 先做不调用模型的目录预检

运行以下两条命令：

```powershell
pnpm skill:catalog --check-tools --out runs/catalog-initial
pnpm skill:catalog --check-tools --out runs/catalog-isolated
```

脚本调用本地官方 app-server 的 `skills/list` 与 MCP 状态目录，不开始模型 turn，也不调用业务工具。它只把公开目录中无关服务器的名字与插件 ID 写入 `runs/skill-isolation.json`，供后续实验进程关闭这些连接；这个文件不是用户全局配置。无关连接的禁用项保留有效的传输格式，且 `enabled=false`，不会运行占位命令。

最后一次输出应为 `isolated=true`，并列出启用的项目 Skill 与小说服务的三个读取工具。目录没有隔离成功，观察脚本就不进入模型运行。目录可发现不表示正文已经加载。

## 观察两种新任务

以下命令各开始一次独立模型会话，会使用账户的模型额度：

```powershell
pnpm skill:observe --scenario chapter --run-label 我的章节检查
pnpm skill:observe --scenario sentence --run-label 我的单句润色
```

每次创建自己的 UUID 目录和 SQLite 数据库，不复用别人的稿件。完整请求保存在 `input.json`，公开事件保存在 `events.jsonl`，全文回答保存在 `final-response.txt`，五表全对象保存在 `before-five-tables.json` 与 `after-five-tables.json`。

`report.json` 逐项核对是否见到方法和参考的完整文件输出、每次工具返回是否等于当前对象、五表是否改变。不对文学判断打分，也不把模型声称“用了 Skill”算成读取证据。完成后归档这两个实验会话，保存的公开证据仍留在实验目录。

章节检查应观察设定矛盾与保存基线分别怎样判定；单句润色只需提供给定句子的两种写法。按实际事件判断是否采用方法，不能为符合预期删掉未触发、误触发或失败记录。

## 改变方法并迁移

调整描述或参考以后，在新会话检查。同一章要评议叙述表现时，才需要 `references/prose-review.md`；保存基线检查应读取 `references/basis-and-status.md`。这两个文件都不自动等于已经加载。

本 Skill 没有 `scripts/`：现有 MCP 已经提供本次需要的材料，不需要重复实现数据库读取。运行目录的观察脚本用于教学取证，并不是 Skill 的能力组成。

本练习没有写作、保存、人工采用、资源自动注入或跨宿主验证。已有工具能取得当前对象，但不能凭修订数字推断历史全文发生了哪些变化。
