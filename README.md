# 进阶 Vibe Coding 课程实验

本仓库提供课程的代码练习和完整课堂材料。每课有可切换的起点与完成点；节点名称和入口见 `github-nodes.json`。两套观察页分别从[请求观察室](https://github.com/Ador-able/vibe-coding-ai-request-lab)和[模型机制观察室](https://github.com/Ador-able/vibe-coding-model-mechanics-lab)取得。

## 开始一课

只需克隆一次本仓库，从本课起点建立自己的练习分支。将命令中的课次替换为索引中给出的实际节点：

```powershell
git switch -c codex/exercise-06-01 vcm-06-01-start
cd project
```

`project/` 是这一课的实际源码，`materials/` 保存课堂输入、对照结果和操作说明。复用仍适用的环境准备；当前源码需要安装依赖或构建时，按该课 README 进行。

## 重来或进入下一课

先在自己的练习分支提交需要保留的源码改动，再从本课起点另建分支。进入下一课也从索引中的下一课起点另建分支；完成点用于查看课堂实现。

Git 恢复源码和随仓库提供的材料。自己的数据库、生成内容和运行记录独立保留；切换节点不会替你回滚或清空它们。每课使用独立练习数据库，已有作品不要再次初始化。

## 共用模型设置

使用 OpenAI 兼容接口的实验共用请求观察室的模型设置。填写一次后各实验自动沿用，再用仓库中的入口运行需要配置的 Node.js 程序。以动作审批课为例：

```powershell
node scripts/run-lab.mjs project/approval-lab dist/approval-cli.js
```

程序照常接收键盘输入和后续参数。模型配置缺失时入口会指向请求观察室设置页；运行错误使用目标程序自己的退出码。使用已登录宿主的实验沿用该宿主配置。
