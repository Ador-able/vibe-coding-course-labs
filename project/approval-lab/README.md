# 人的决定怎样改变 Agent 下一步

当前源码位于 `project/approval-lab/`。本课节点见仓库根的 `github-nodes.json`。

在 `project/approval-lab/` 中准备当前源码需要的依赖：

```powershell
pnpm install --frozen-lockfile
pnpm build
```

可用命令见 `package.json` 的 `scripts`。沿用课程本节给出的入口和参数，不需要重复运行其他课的实验。

课堂路径保留在 `fixtures/`。从当前源码目录运行时直接使用这些相对路径。

使用 OpenAI 兼容接口的入口从仓库根运行 `node scripts/run-lab.mjs <源码目录> <Node.js入口> [本节参数...]`。它读取请求观察室已保存的设置；当前型号和地址由你的设置决定。

完整输入、课堂结果与原操作说明在仓库根 `materials/`。原说明保留当时的命令和记录；本机准备以本 README 和当前课程步骤为准。
