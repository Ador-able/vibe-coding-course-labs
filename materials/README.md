# 把经过验证的改动交付出去：练习入口

课程学习如何组织 AI 的工作、检查和交付。小说原文只是保存与读回的练习材料，本包不评定文学或界面审美。

## 从哪个点开始

包内 `code/应用完整.bundle` 是应用自己的完整 Git 存档，含真实旧行为、交付起点和本地完成提交。不要在父 Knowledge 仓库或仅有 ZIP 的目录直接取 HEAD。

| 点 | 固定标签 | 完整提交 | 用途 |
| --- | --- | --- | --- |
| 交付起点 | course-vcm-09-05-start | c3805c360551c10fedfd9b5473e569cfd7666dc0 | 应用已修好等待行为，尚没有本节五项交付入口 |
| 完成点 | course-vcm-09-05-end | 877c9d61dc98c33a36e813060a2c4331867f4624 | 原生 Git 钩子实际通过后收录五项文件 |
| 真实旧点 | course-vcm-09-05-old | 2c1f4e17c70377fc80e9f90d044e8e75ed3b5720 | 旧等待期会接纳输入，后来又被读回覆盖 |

另一个 `公共交付完整.bundle` 只包含本练习载荷的独立公共 Git 根；它的 HEAD 不能当成应用版本。确切公共提交和原字节清单在 `固定交付记录.json`、`完整原字节清单.json`。

## 零模型恢复

需要 Git 和 Node.js。本次实测 Node24.12.0、pnpm11.20.0、Git2.52.0.windows.1、Playwright1.63.0，实际浏览器为 Edge154.0.4258.48。不要全局安装项目依赖或改原锁文件。

将本包解压到一个新的短目录，例如 `D:/练习/交付01`。在该目录运行：

```sh
node tools/恢复练习.mjs checked
```

恢复器先逐项核包的原字节，再 clone 应用存档到新的 `project/`，建立个人分支 `codex/practice-delivery-checked`，检出完成点并核自己的 Git 根、168 个完整跟踪文件。最后把既有 c2ce 教师测试恢复为 `scripts/test-saving.mjs` 未跟踪原件；它不属于五项提交。

可独立选择 `start` 恢复到 `start-project/` 的 c380 起点；或 `old` 恢复到 `old-project/` 的 2c1 旧点。旧点先核164原文件，再仅采用 `delivery-files/` 中的 package、检查脚本与钩子三个原产物；它不会暂存、启用钩子或提交。目标已存在时失败并保留当前目录，换一个新解压目录重新练习。

恢复只改变新自有目录，不启动宿主或服务，不写入实验数据库，不安装或执行检查，也不复原账号、全局配置、外部仓库或业务状态。完整 Git stdout/stderr/status/signal 和字节核对回执保存在解压根。

## 安装与检查

进入选中的实际应用 Git 根，再用项目原有 workspace 和锁文件安装：

```sh
pnpm install --frozen-lockfile
```

不加 `--ignore-workspace`，不改年龄策略、锁文件或第三方库。课程已经提供模型生成的完整五文件、原任务与原回复；阅读它们不需要模型调用。

完成点和已采用三项入口的旧点可以运行 `pnpm run check:delivery`。默认 Chromium 需当前项目已有的 Playwright 浏览器安装；Windows 若使用既有 Edge，可在当前 PowerShell 进程明确设置：

```powershell
$env:DELIVERY_BROWSER_CHANNEL = 'msedge'
pnpm run check:delivery
```

检查实际构建 dist，再运行原版一个正常保存实例。每次新建 `runs/delivery-saving-UUID/` 和 SQLite，由 Store 初始化完整既有作品及三章；脚本驱动正常键盘使用教师补记，不是模型重写小说。请求门仅延迟真实 POST/GET，观察结束后才断言；记录完整输入、请求返回、当前/历史、刷新、浏览器及清理。正确版应通过；旧版应完成同一流程后以五项业务失败非零退出。环境失败不是业务红，原错误与完整产物应保留。

本章不运行 `scripts/test-saving.mjs` 的既有十二实例，也不重新渲染原版/台面/笔记页。真实异常、并发、界面辨认、审美和文学采用须按相应需要另判。

## 真正提交时的条件

本地钩子不会因 clone 自动启用。只在自己的这份 Git 根明确设置 `git config --local core.hooksPath .githooks`。同时确保磁盘钩子可以执行、Git 中 mode 为100755；Unix可用 `chmod +x .githooks/pre-commit`，`git add --chmod=+x`只控制index，不代替磁盘或真正执行。

完整暂存时，当前实现只纳入这五项：

```sh
git add -- package.json scripts/check-saving-delivery.mjs .githooks/pre-commit .github/workflows/delivery.yml docs/delivery-check.md
git add --chmod=+x -- .githooks/pre-commit
git diff --cached
git diff
git status --short --untracked-files=all
git write-tree
```

确认工作区/index逐文件对应，教师原件仍未跟踪。旧版只暂存前三项，以同一检查检验真实旧行为；不能用脚本缺失或伪退出演拒绝。只用自己获准的提交身份正常 `git commit`，不用跳过参数。本文普通钩子检查的是工作区，任意部分暂存并未验证。

已记录的实际旧提交退出1、HEAD2c1不变、三项index保留；当前提交退出0、HEAD877c、parentc380、commit tree等于提交前候选树，精确五项且Hook100755。Hook真实Trace2启动/退出、Git原输出与SQLite放在 `evidence/02-hook-*`、`evidence/03-hook-*-业务原件`。两个独立正常实例是先前检查链验证，真正的Git触发实例另存，不能合成只有一次执行。

## 已有记录与还没发生的操作

`evidence/01-助手生成/` 保留原任务、原回复、十五个完整命令/聚合输出、完整Diff与公共协议投影。原观察器scope false／exit1没有倒改：它误把 `git status --ignored` 里的 M/?? 行当纯忽略项；实际 !! 仍只有node_modules。独立解释不替代后来的真实业务结果。只有API实际提供的aggregatedOutput，没有伪造独立Shell stdout/stderr。

JSON公共投影排除受保护宿主指令/推理正文与身份字段，重新序列化；它不是全协议原字节公开。Git和检查业务原件按实际字节保留，精确原/新摘要在 `公开范围.json`。第三方原课全文、官方全文、私有宿主配置和内部主编证明不在公共包，来源定位与编者采用判断在 `research/`。

`delivery-files/.github/workflows/delivery.yml` 是可评审的PR检查配置，尚没有远端run/artifact。PR、推送、分支保护、merge和部署都没有执行。若准备外部交付，先在自己的仓库核实际base/head、Diff、授权与身份，再核真实CI checkout/log/artifact和最终mergeSHA；本地成功不冒充这些对象。
