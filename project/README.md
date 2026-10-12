# 答案要对应资料，更新要替换旧内容

当前源码位于 `project/`。本课节点见仓库根的 `github-nodes.json`。

先查看已保存的两轮回答、更新记录与原文，无需安装项目依赖或调用模型。在 `project/public/` 启动静态页：

```powershell
python -m http.server 4347 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4347/`，分别选择 A 的 FEE-v1 和 B 的 FEE-v2，点击“查看依据”，核对日期、费用和预付关系。

需要重新研究更新过程时，在练习副本的 `project/` 执行 `pnpm install --frozen-lockfile`，再按 `package.json` 的命令操作。新查询与索引须使用同一个向量模型；更换向量模型时先重建已有向量。

课堂路径保留在 `inputs/`。从当前源码目录运行时直接使用这些相对路径。

使用 OpenAI 兼容接口的入口从仓库根运行 `node scripts/run-lab.mjs <源码目录> <Node.js入口> [本节参数...]`。它读取请求观察室已保存的设置；当前型号和地址由你的设置决定。

完整输入、课堂结果与原操作说明在仓库根 `materials/`。原说明保留当时的命令和记录；本机准备以本 README 和当前课程步骤为准。
