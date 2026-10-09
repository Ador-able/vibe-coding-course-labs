# 插件与另一宿主练习

把本文件交给编码助手准备项目。沿用已安装的 Node.js、pnpm 和现有 Codex 登录；首次安装依赖并构建。更换目录或数据库后，按现有脚本重新绑定插件。人的反馈与采用决定由人给出。

## Codex 插件

在项目目录准备新的数据库：

```shell
pnpm install --frozen-lockfile
pnpm build
pnpm lab init seed/钟楼.json --db data/我的插件实验.sqlite
pnpm plugin:prepare --db data/我的插件实验.sqlite
pnpm plugin:preflight
```

插件目录、添加、检查和清理使用 package.json 中的 plugin 系列入口。已安装插件先确认绑定，避免重复安装。业务数据保持在自己的练习库中。

## OpenCode

先在请求观察室页面保存模型设置。在本项目目录初始化独立练习库，之后让助手用请求观察室的 scripts/run-lab.mjs 运行本项目的 scripts/opencode-local.mjs 或 scripts/observe-opencode.mjs。启动桥的参数依次是本项目绝对目录、入口脚本和入口参数；例如：

```shell
node "请求观察室目录/scripts/run-lab.mjs" "本项目完整目录" scripts/observe-opencode.mjs --db data/我的另一宿主.sqlite
```

地址、密钥和型号均沿用页面已保存的配置，不另填授权文件。宿主配置、状态与缓存使用本项目独立目录。工具执行会调用真实模型；只查看目录与方法不生成正文。记录保存实际输入、事件和退出状态，不保存认证值。32K 上下文和4096输出是实验预算，不代表模型规格或供应商费用。

实际运行前读 seed/插件任务.txt。人工反馈使用 seed/人工纠正.txt 和本次真实会话标识；不能接续课堂历史会话。结束后从业务入口读取完整章稿，读过以后再决定修改或采用。失败时保留本轮记录，未知结果先读回业务状态。
