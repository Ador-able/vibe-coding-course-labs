# 渐进式读取

用《凡人修仙传》开篇的30条原文，观察 Agent 如何先读入口，再按需查找依据。原文来源与位置见[共用材料说明](../../materials/凡人修仙传/来源说明.md)。

先打开[课堂实录.html](课堂实录.html)，可以查看三组实际回答、本轮摘要和逐层读取记录，无需重新调用模型。下面的命令用于自己运行。

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

`full` 提供全部原文；`summary` 先从本次原文生成约300字阅读进度摘要，再开一个新会话，只用刚生成的摘要回答。两步的实际输入、输出和用量分别保存在 `compress/` 与 `summary/`，摘要生成失败时停止。

运行 `pnpm experiment` 可以一次完成三种读法，包括摘要生成共四次 Agent 任务。已有登录与模型设置保持不变。每种读法都重新开会话，材料哈希在运行前后核对；结果以本次真实返回为准。
