# MCP连接观察实验存档

ZIP内有本说明和`MCP连接观察.bundle`。这是固定Git课程存档，包含原有成熟Harness与小说教学MCP，以及本章的官方Client观察入口。无需登录模型账户，不安装插件，不改宿主配置。它不调用模型；此前真实宿主读取另有完整记录。

## 从独立目录恢复

准备Git、Node.js 24.12.0或同系列更新版本、pnpm 11.20.0。解压到自己的课程练习目录，打开终端：

```powershell
git clone ./MCP连接观察.bundle mcp-connection-lab
cd mcp-connection-lab
git switch -c my-mcp vcm-08-01-end
pnpm install --frozen-lockfile
pnpm build
pnpm mcp:observe
```

项目内package.json、pnpm-workspace.yaml和锁文件已经保存。按锁文件安装本地依赖，不混用其他包管理器或全局SDK。终端报告directory指向本轮新UUID目录；以前运行不会被覆盖。

固定起点vcm-08-01-start：3c6dde16004469f3fc36ba417804a65880ee43e5，已有业务Server与成熟Harness，本章观察脚本尚未加入。

固定完成点vcm-08-01-end：6153557ab321d2a3fae2cce70ae7ea3c9f309833，增加官方Client观察脚本、中文说明与完整证据。

## 实际观察与判断

脚本用已有业务函数准备新的人工教学库：作品bridge-clocktower只有第一章保存为human/draft，第二章只有大纲；missing-work不存在。观察阶段只发现目录并调用read_work、list_chapters和三次read_chapter，共五次读取。固定Server声明四个工具；观察阶段不调用save_draft。

本轮protocol.jsonl保留官方Transport公开回调中的已解析JSON-RPC对象，tools.json是完整工具目录，calls.json是实际参数和返回。business-before.json与business-after.json通过独立只读SQLite连接查询五张完整业务表，核对逻辑内容及第一章正文。它们不是数据库文件字节哈希。report.json有协商版本、观察错误、验证结果及范围。

已有正文应与真实对象一致；有效作品未保存的第二章是成功返回result:null；不存在的作品是isError:true/WORK_NOT_FOUND。建立连接或拿到返回并不能把后两项改称已有章稿。verification.passed=false时命令非零退出，保留原始文件排查失败发生在哪一步。

实际固定依赖为@modelcontextprotocol/sdk 1.31.0与@openai/codex-sdk 0.160.0；此入口只使用前者。作者真实运行7485fbc1采用源码b3d0ba13，实际协商MCP为2025-11-25。归档增加证据和说明，不改变当时实际运行源码。当前2026-07-28规范采用逐请求版本/能力及server/discover，本入口不冒充验证新协议。

## 完整已有证据

evidence/08-MCP连接/官方Client是本章完整协议、业务前后状态和报告；既有宿主目录是主编此前对固定03-end的实际插件检查426f9341：完整Skill和参考读取、五次工具返回、模型最终回答及独立CLI章稿。二者材料、任务和会话不同，不拼成一次运行。每份文件原始字节哈希见同目录文件字节清单.json。

第一章r3/adopted是编者教学采用操作，后两章r1/draft；它不表示真实读者对文学品质的认可。连接成功、字段核对或模型的好评都不替代正文阅读与人的取舍。

本次观察只验证stdio连接、能力发现、五次读取、业务错误返回后正常关闭。没有实测远程HTTP、超时、取消、子进程崩溃或ChatCut；也不把正常关闭推断成所有失败路径都可靠。
