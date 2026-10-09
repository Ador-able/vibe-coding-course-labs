# 动作审批教学实验

这个独立项目复用最小 Agent 的小说业务保存契约，使用极短草稿观察动作审批。它只操作本地练习数据，不采用、发送或发布正文。

运行环境为 Node.js 24.12.0 或更新版本、pnpm 11.20.0。先执行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm lab init 'fixtures/审批作品.json' --db 'data/approval.sqlite'
pnpm lab chapter 1 --db 'data/approval.sqlite'
```

新的数据库尚无章稿，最后一条命令返回 null。复做时使用新的数据库文件名，切换 Git 标签不会清空业务数据。

src/schemas.ts、src/store.ts 与 src/cli.ts 原样复用固定 agent-practice-02-end 的实现。复用源码记录.json 保存原提交和逐文件 SHA256。读写入口检查当前作品、章节范围与修订基线，保存结果为 draft；adopt 是另一项人工内容决定。

普通模型配置由使用者自己的 .env 提供，键名为 API_BASE_URL、MODEL、API_KEY。将空 .env.example 复制为 .env 后填写；配置只由后端读取，.env、运行数据库、安装缓存和构建产物均不进入 Git 存档。
