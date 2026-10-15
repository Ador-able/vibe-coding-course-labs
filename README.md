# 进阶 Vibe Coding 课程实验

本仓库提供课程的代码练习和完整课堂材料。[课程实验与凡人原文资料](fanren/README.md)按课程章节给出源码、材料与实录入口，只需克隆一次，后续沿用同一仓库。固定源码节点见 `github-nodes.json`；凡人实验的当前入口以各章 README 为准。两套观察页分别从[请求观察室](https://github.com/Ador-able/vibe-coding-ai-request-lab)和[模型机制观察室](https://github.com/Ador-able/vibe-coding-model-mechanics-lab)取得。

[第十三章小说整理工作台](fanren/chapter13/project/README.md)提供五个入口：长文、反馈分类、核查日志抽取、逐项状态、模板核对，沿用仓库首次安装与构建。

## 开始一课

按[统一准备](fanren/README.md#获取与继续)完成一次克隆、安装和构建。后续直接进入本节目录，例如第十五章：

```powershell
cd fanren/chapter15/project
pnpm lab
```

各章 `project/` 保存实际源码，完整输入、材料与实录的位置见本章 README。复用已有环境准备；只读课堂实录不调用模型。

## 重来或进入下一课

先保留自己的源码和业务数据。需要独立复做时，按本章 README 准备练习库；进入下一课继续使用已克隆仓库，不必重新安装整套环境。

Git 恢复源码和随仓库提供的材料。自己的数据库、生成内容和运行记录独立保留；切换节点不会替你回滚或清空它们。每课使用独立练习数据库，已有作品不要再次初始化。

## 共用模型设置

使用 OpenAI 兼容接口的实验共用请求观察室的模型设置。填写一次后各实验自动沿用，再用仓库中的入口运行需要配置的 Node.js 程序。以动作审批课为例，在仓库根目录运行：

```powershell
node scripts/run-lab.mjs fanren/chapter05/project dist/approval-cli.js
```

程序照常接收键盘输入和后续参数。模型配置缺失时入口会指向请求观察室设置页；运行错误使用目标程序自己的退出码。使用已登录宿主的实验沿用该宿主配置。
