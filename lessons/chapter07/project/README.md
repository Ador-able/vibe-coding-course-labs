# 凡人修仙传：插件、MCP、Skill 与 Hook

沿用仓库根的统一安装和构建，在本目录使用本节入口。模型练习沿用本机 Codex 登录和模型选择。


## 不调用模型的观察

| 学习问题 | 命令 |
| --- | --- |
| 同一作品标识在两个数据库里是不是同一份稿件 | `pnpm objects:observe` |
| MCP 连接、发现与读取 | `pnpm mcp:observe` |
| 通过两个工具保存并读回，拒绝旧修订 | `pnpm mcp:exercise` |
| 工具、资源和提示模板怎样取得当前材料 | `pnpm mcp:entries` |

每次观察使用新数据库，完整输入和返回保存在命令输出指向的 `runs/` 目录。

## 让模型使用能力

先准备当前练习，再运行对应任务。同一时间只运行一项，不在任务进行中切换练习。

| 练习 | 准备 | 运行 |
| --- | --- | --- |
| 插件只读检查三章 | `pnpm prepare:reading` | `pnpm plugin:check` |
| Skill 选择与不适用任务对照 | `pnpm prepare:skill` | 分别运行下方两条命令 |
| 插件写入一份开篇草稿 | `pnpm prepare:plugin` | `pnpm plugin:observe --db data/fanren/plugin.sqlite --prompt seed/插件任务.txt` |
| 保存后触发三种 Hook 对照 | `pnpm prepare:hook` | `pnpm hook:observe` |
| 复核旧反馈并修改当前局部草稿 | `pnpm prepare:feedback` | `pnpm feedback:observe` |

```powershell
pnpm skill:observe --scenario chapter
pnpm skill:observe --scenario sentence
```

两条 Skill 命令各开一个新会话。单句请求没有预先禁止工具，观察模型实际是否选用整章检查方法。

需要比较另一个宿主时，可以选做 OpenCode 对照。它复用请求观察室已保存的模型设置，使用独立新库：

```powershell
pnpm lab init materials/插件起草-作品.json --db data/fanren/opencode-plus.sqlite
pnpm host:observe
```

若启动时返回 `spawn UNKNOWN`，先在本目录运行 `pnpm rebuild opencode-ai` 完成依赖的原生程序安装，再用 `pnpm exec opencode --version` 检查。保留失败目录，恢复环境后另开运行。

退出成功不等于草稿已保存；按本轮工具返回和数据库结果判断。

准备命令会导入人工材料、检查实际工具与方法目录，并绑定当前练习的数据库。已有数据库保持原样；再次准备不会清空或重新生成。模型任务不自动重试，失败记录仍保留。

固定 Hook 脚本已逐文件核对。准备命令核对文件哈希和本机实际目录，只对当前宿主进程启用相应检查。Hook 检测文字占位符，不判断文学质量。

## 查看结果

命令结束后打开本轮 `report.json`、`final-response.txt` 和完整事件记录。通过人工入口读回实际保存内容，例如：

```powershell
pnpm lab chapter 1 --db data/fanren/plugin.sqlite
pnpm lab chapter 1 --db data/fanren/feedback.sqlite
```

`materials/材料说明.md` 区分完整三章阅读材料、人工局部片段和插件起草要求。材料文件存在不等于模型已经使用或保存。人工教学采用也不表示读者认可文学质量。

本章宿主数据位于 `runs/private-codex-home/`，复用登录但隔离插件缓存与配置；不要分享这个目录。Git仓库不包含登录、个人配置、生成数据库或私人目录预检。需要保留的实验结果按课程提供的记录单独查看。
