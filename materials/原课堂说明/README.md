# 成熟 Harness 的最小任务练习

这个实验练习怎样向 AI 提供有效资料、连接已有能力，并从真实产物判断任务是否完成。小说第一章只是载体。模型和工具往返由 Codex Harness 承担；本项目复用已有 Store、MCP、两项 Skill 与插件，不实现模型循环。

## 安装和初始化

需要 Node.js 24.12.0、pnpm 11.20.0。Codex SDK/CLI 固定为 0.160.0，MCP SDK 固定为 1.31.0；模型任务需要本机已有可用的 Codex 登录或配置。

在配套包的 Harness最小任务 目录从 bundle 恢复一个独立 Git 仓库，再进入固定起点。任务观察入口用本仓库提交记录运行版本；直接在不含 .git 的源码快照中发任务，不能保证得到本节的提交。

```powershell
git clone ./Harness固定起止.bundle 任务实验
Set-Location 任务实验
git checkout vcm-07-01-start
```

```powershell
pnpm install --frozen-lockfile --virtual-store-dir .pnpm
pnpm build
pnpm lab init seed/Harness第一章.json --db data/harness.sqlite
pnpm lab show --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea
pnpm lab chapter 1 --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea
```

初始化文件是人工提供的用途、要求、设定与一个大纲目标，没有正文。init 拒绝覆盖已有作品。开始模型任务前，目录应为空，读取第 1 章应返回 null；具体状态以实际返回为准。不要把历史章节或测试文字复制到这次作品中。

## 人工查看入口

```powershell
pnpm prototype --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea --port 4337
```

打开 http://127.0.0.1:4337/?work=harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea&chapter=1。零章时页面显示尚未保存，章名、正文和保存按钮不可用。工具真正保存后，人工重新读取才能取得正文；页面没有连接模型执行进度，不自动显示“正在生成”。

页面的原版、台面与笔记页使用相同对象、字段和操作。业务资料按需展开。网页通过薄 HTTP 入口调用同一 Store；人工保存标记为 human，状态仍为 draft。要求、设定、大纲、采用与导出使用已有 CLI 入口。网页不自动导入任何旧稿，也没有另一份业务正文。

保存等待时章名与正文不可编辑。网络结果未确认时，本地修改保留且可以继续编辑，先读取当前稿对照，不能直接重复保存。旧修订被业务拒绝后，也需要取得当前稿并重新判断，不能只换修订号。

## 检查能力并提交任务

```powershell
pnpm plugin:prepare --db data/harness.sqlite
pnpm plugin:add --output runs/插件安装.json
try {
  pnpm plugin:catalog --output runs/插件目录.json
  pnpm plugin:preflight --out runs/目录初查
  pnpm plugin:preflight --out runs/目录复查
  pnpm plugin:preflight --out runs/目录确认
  pnpm plugin:observe --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea --chapter 1 --prompt prompts/Harness第一章.txt
} finally {
  pnpm plugin:remove --output runs/插件移除.json
}
```

先确认本机没有正在使用的同名实验插件。安装与移除交给官方 CLI；其他工具、Skill 与记忆的停用只在本次宿主参数中覆盖。移动项目后重新准备绑定并安装，旧缓存不会自动跟随源目录变化。

预检只查询官方宿主能力目录、配置及本次预检会话，不发送模型请求，不执行业务工具。以实际预检中的 isolated、skillsIsolated、memoryIsolated 为准；三项与两个 Skill 均满足以后，观察入口才继续。目录可见并不证明模型已经使用方法或保存正文。

观察入口只提交一次 SDK 自然任务，保存完整输入、公开事件、工具参数与返回、最终文字及运行前后五表。Ctrl+C 将 AbortSignal 传给 SDK；已取得的事件与业务快照仍需保留，取消不会撤回已经执行的保存。本章不把历史中断实验当作这个入口的新实测。

运行 UUID 定位本次日志；thread ID 定位 Harness 会话。这个入口不调用原 agent 命令的 createTask，因此业务 tasks 表及正文的 taskId/threadId 不能当作本轮运行登记。自动经验记忆停用，当前故事材料通过 MCP 重新读取；这不证明自动记忆实验已完成。

## 读取与判断真实产物

```powershell
pnpm lab chapter 1 --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea --output runs/完整第一章.json
pnpm lab show --db data/harness.sqlite --work harness-02f7db59-e6a1-4e9a-8c4d-75adfa2a1fea
```

将完整工具返回、CLI/数据库与网页的章名、正文、修订和状态互相核对。turn.completed 只表示这轮正常结束，模型的一句“已保存”也不代替业务读回。文学表现、设定相容与人的采用需要另行阅读全文判断；不自动采用或发布。

如果资料、业务保存或运行失败，保留实际错误并重读当前作品，不补造成功记录。取消、网络断开与回退会话也不证明数据库没有产物。

本实验只覆盖课堂本机的一章任务和人工查看修改，不实现网页内持续对话、审批交互、调度器或生产平台。现行 app-server 的接口用于解释可选能力；本次 TypeScript SDK 的字段和行为以固定 0.160.0 类型与实际事件为准。Node 24.12.0 的 node:sqlite 仍为实验性模块。
