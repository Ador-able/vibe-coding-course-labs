# 动作审批实验

在本地练习数据中，先读完整保存动作，再由人决定是否执行。保存草稿、采用正文和发布作品是三个不同动作。本实验只保存草稿。

把本包解压为 `approval-lab`，与请求观察室目录放在一起。请编码助手在本包中执行一次 `pnpm install --frozen-lockfile` 和 `pnpm build`，然后初始化练习数据：

```powershell
pnpm lab init 'fixtures/审批作品.json' --db 'data/approval.sqlite'
pnpm lab chapter 1 --db 'data/approval.sqlite'
```

新数据库的第一章应为 `null`。复做时换一个新的数据库文件名，所有命令保持同一个 `--db`。

模型设置沿用请求观察室页面中保存的配置。以下调用模型的命令在请求观察室目录运行；会产生真实模型调用：

```powershell
node scripts/run-lab.mjs '../approval-lab' dist/approval-cli.js propose 'fixtures/保存动作A.json' --output '待决A.json'
```

在审批实验目录打开 `待决A.json`，通读 `pending.input`。使用其中的任务 `id` 和 `pending.approvalId` 查看、决定；这些操作不调用模型：

```powershell
pnpm approval show '任务id'
pnpm approval decide '任务id' --approval-id '当前approvalId' --decision deny --reason '已核读具体参数，本次拒绝保存。'
pnpm lab chapter 1 --db 'data/approval.sqlite'
```

`decide` 只记录人的决定，第一章仍应为 `null`。回到请求观察室目录，交回决定：

```powershell
node scripts/run-lab.mjs '../approval-lab' dist/approval-cli.js resume '任务id' --approval-id '当前approvalId'
```

拒绝后回到审批实验目录读章稿，仍应为 `null`。任务和待决参数保存在 SQLite 中，退出命令或重开终端后可用 `show` 重新读取。

## 已批准的动作改变参数

再次提议 A，读完整参数后，由人决定是否批准。课程对照需要批准 A 后先不 `resume`，读章稿确认仍未保存，再改成 B。替换命令在请求观察室目录执行：

```powershell
node scripts/run-lab.mjs '../approval-lab' dist/approval-cli.js replace '任务id' 'fixtures/保存动作B.json' --approval-id 'A的approvalId' --reason '改用B的具体正文，需要重新决定。' --output '待决B.json'
```

读取 `待决B.json`：B 必须有新 `approvalId`，A 的批准不能用于 B。在请求观察室目录尝试用 A 的编号 `resume`，应得到 `APPROVAL_NOT_CURRENT`；第一章仍为 `null`。

由人核读 B 的完整参数，用审批实验目录的 `decide` 记录决定。批准用 `--decision approve`，拒绝用 `--decision deny`；理由写明自己对这份具体参数的判断。记录决定后仍不保存。只有使用 B 的当前编号 `resume` 才交回决定；批准时实际保存一次，拒绝时不保存。

```powershell
pnpm lab chapter 1 --db 'data/approval.sqlite'
```

批准并交回 B 后，独立读章稿应得到 `r1`、`draft` 和 B 的全文。判断状态要看真实待决对象、执行事件和业务读回，模型总结不能代替这些结果。让编码助手准备文件、代填编号可以减少操作，批准或拒绝仍由人作出。

## 请求记录与失败

调用模型后，审批实验目录的 `runs/任务id/轮次` 保留真正发送的请求正文、响应和执行结果，不保存认证头。`show` 可读当前状态，`--output 路径` 可把命令结果保存为 JSON。

未决定、拒绝和旧编号都不执行。模型失败留下 `failed` 和错误记录；若保存后模型总结失败，先用独立 `chapter` 入口读回，不能自动重复保存。本实验不演示任意执行点的崩溃恢复。
