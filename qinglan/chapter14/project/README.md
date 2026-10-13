# 青岚小说业务工作台

沿用这个课程仓库。首次在仓库根执行一次 `pnpm install` 和 `pnpm build`，后续进入本章目录，双击 `启动实验.cmd`，或运行 `pnpm start`。默认工作台在 `http://127.0.0.1:4360`；原件服务在 `4361`，仅提供本章 PDF/TXT。

八节共用同一批课堂记录与三个原生流程。页面中的查看操作只读完整记录，0 模型、0 外部授权和通知。日历页是固定课堂日期的教师提案与本机 IANA 计算；接收者验收卡保持各项未检查，由实际操作人另行完成。

入口：`flow.html`、`authorization.html`、`files.html`、`ids.html`、`webhook.html`、`calendar.html`、`branch.html`、`acceptance.html`。

## 亲手运行原生流程

先保存自己的改动，再从干净的实践起点建立自己的分支：

```powershell
git switch -c qinglan-my-ch14 qinglan-ch14-practice-start
```

继续使用本章目录。这个标签保留完整输入、程序和空记录索引，后续命令将保存你自己的结果；课堂完整实录保留在 `qinglan-ch14-end`。自己的记录需保存后再切换分支。

仅这一部分需要 Docker 与本机 n8n。查看课堂记录无需启动 n8n。

使用 `docker.n8n.io/n8nio/n8n:2.41.6`，准备自己的隔离容器和新卷。下面端口不占用前面章节的请求观察室：

```powershell
docker volume create qinglan-ch14-classroom-20261013
docker run -d --name qinglan-ch14-classroom -p 127.0.0.1:5689:5678 -v qinglan-ch14-classroom-20261013:/home/node/.n8n -e GENERIC_TIMEZONE=Asia/Shanghai -e TZ=Asia/Shanghai -e N8N_HOST=localhost -e N8N_PORT=5678 -e N8N_PROTOCOL=http -e N8N_EDITOR_BASE_URL=http://localhost:5689/ -e WEBHOOK_URL=http://localhost:5689/ -e N8N_SECURE_COOKIE=false -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_PERSONALIZATION_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false docker.n8n.io/n8nio/n8n:2.41.6
```

第一次在 `http://localhost:5689` 使用 n8n 标准 UI 设置自己的账户，创建 API key。将 `baseUrl` 和 `apiKey` 保存在用户目录 `.vibe-coding-labs/n8n-ch14.json`；它不在 Git 中，也不需要交给工作台页面。读者使用自己的账户范围，不由课程替你创建凭据。

1. `node scripts/n8n.mjs prepare` 创建测试/正式各一组 Task/Feedback 空表和独立回执表，导入四个真实原生 workflow，保持未发布。绑定与私密 API 原件在 `.local`。
2. `node scripts/n8n.mjs probe` 留下未发布正式 URL 的实际返回。
3. 在 n8n 编辑器打开反馈 workflow，点击真正的测试监听，再执行 `node scripts/n8n.mjs feedback test-E01`。命令不代替浏览器监听。
4. `node scripts/n8n.mjs publish` 将同一反馈流程重绑定到正式空表，保存并发布实际版本；先发布子、后发布父。命令回查实际版本，触发器就绪另在标准 n8n UI 核对，再提交业务。
5. 依次执行 `feedback production-E01`、`feedback duplicate-E01`、`feedback production-E02`。每次命令只提交一次，保存完整原件，再独立读回表和执行；收到不等于完成。
6. 保持工作台与4361原件服务运行，执行 `node scripts/n8n.mjs files`；再执行 `node scripts/n8n.mjs branch`。后者只提交 E02/E01/E03 三项，完整教师目录中的归档意见不提交。

运行遇到错误，保留原件与对象 ID，不自动重试或覆盖采集目录。`node scripts/n8n.mjs readback` 可另存五表的真实独立读回，0 新业务提交。

## 来源与检查

完整三章沿用前章固定 draft 存档，本文不表示章稿已采用。原生模板来自 `vcm-11-01-end`、`vcm-11-03-end`、`vcm-11-07-end`，来源字节与 SHA 在 `materials/原生模板来源.json`。正常中文三页 PDF 与 TXT 使用相同完整第三章；PDF 原页按288DPI原生渲染，本机文本层检查与 n8n 实际提取分别记录。

`pnpm check` 核输入原件与原生表达式语法，`pnpm source:check` 核实际源码冻结，`pnpm calendar` 重算固定 IANA 时区。想改自己的材料时，先按实际字节同步输入清单，再 `pnpm source:freeze`、检查并固定新的 Git 起点，使用新的采集目录；不能让旧 SHA 冒充新输入。

教师隔离实测可用 `node scripts/setup-classroom.mjs create` 调用该固定版本的标准 owner/setup、login、API key 接口创建本机合成课堂账户。此命令与个人首次 UI 准备分开，完整账号资料仅存用户私密目录，不创建 Google 账户或发送真人通知。
