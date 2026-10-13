# 渐进式读取

用《青岚修仙录》的资料，观察 Agent 如何先读入口，再按需查找依据。

克隆后，在本目录打开终端。沿用课程的运行环境和已有 Codex 登录，无需另外注册账号或填写模型配置。

完成仓库根的共用安装后，在本目录运行：

```powershell
pnpm experiment --condition tiered
```

完成后，打开 `运行记录` 中最新的文件夹，查看 `tiered/output.txt`。本次输入、实际读取过程和用量也保存在该文件夹。

需要比较其他读法时，按需运行：

```powershell
pnpm experiment --condition full
pnpm experiment --condition summary
```

`full` 提供全部原文，`summary` 只提供摘要。结果分别保存在各次运行的 `full` 或 `summary` 文件夹。
