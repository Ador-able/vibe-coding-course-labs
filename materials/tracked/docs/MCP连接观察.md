# MCP 连接观察

本实验使用官方 MCP Client 连接已有的小说教学 Server。它不调用模型、不安装插件、不改变宿主配置，也不制作 Server。需要 Git、Node.js 24.12.0 或同系列更新版本、pnpm 11.20.0。项目已经保存独立 package.json、pnpm-workspace.yaml 和固定锁文件。

完成版运行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm mcp:observe
```

每次使用新的 UUID 目录，终端返回 `directory`。它在 `runs/mcp-connection/` 下，包含本轮协议消息、完整工具目录、参数和返回、运行环境，以及连接前后的业务状态。没有旧数据库初始化冲突，也不覆盖此前观察。

## 资料与实际动作

准备阶段用已有业务函数创建作品 bridge-clocktower 和两章大纲，再人工保存第一章短稿。该稿的 origin 为 human、状态为 draft。这是人工编写的教学资料，不属于模型新生成的小说，也不表示读者已经认可作品质量。第二章只有大纲，尚无保存正文；missing-work 作品不存在。

观察阶段先执行官方 Client.connect 与 tools/list，之后依次调用 read_work、list_chapters、read_chapter 第一章、read_chapter 第二章、read_chapter missing-work 第一章。固定 Server 声明四个工具，本次仅调用其中三个读取工具，共五次调用，不调用 save_draft。

`protocol.jsonl` 是公开 Transport 回调中 SDK 解析后的 JSON-RPC 对象，按观察顺序记录。客户端发送使用原 send 方法；收到消息后仍由官方 Client 正常处理。它不是原始管道字节抓包，也不是宿主模型会话日志。JSON-RPC 请求有 id，与同 id 的返回对应；通知没有同样的请求返回配对。

`tools.json` 保留所有声明及输入/输出结构。`calls.json` 保留五次完整请求和返回。正常读取第一章时有具体正文、修订和草稿状态；第二章成功返回 result:null；不存在的作品返回 isError:true 与 WORK_NOT_FOUND。最后一种是工具业务错误，不能因 JSON-RPC 返回对象存在而当作取到资料。

`business-before.json` 与 `business-after.json` 通过独立的只读 SQLite 连接读取五张业务表，包含实际完整对象及历史修订。脚本对照两份逻辑状态，并核对作品和第一章读取与真实对象一致。这里比较逻辑业务内容，不用 SQLite 文件字节变化代替业务判断。准备阶段确实写入了人工资料；观察阶段只读取。

## 版本与关闭

项目锁定 @modelcontextprotocol/sdk 1.31.0，现有成熟 Harness 依赖 @openai/codex-sdk 0.160.0。这个观察入口只使用前者。实际协商的 MCP 版本取自 initialize 返回，保存在 report.json；不要从包版本猜协议版本。

本入口保留固定 SDK 的初始化行为。2026-07-28 规范改为逐请求携带版本和能力，可以预先调用 server/discover；这与本次固定 SDK 的日志形状不同。新旧行为用于理解支持范围，不要求在本实验中改写底层 SDK。

连接后的读取结束或发生观察程序错误时，finally 都调用 client.close，并记录实际关闭回调与返回。报告核对正常结束后 transport.pid 是否为空。本实验没有触发用户取消、超时、子进程崩溃或远程断线，不据此声称这些路径已验证。

若构建失败，先核对 Node 和固定依赖；若连接或调用报错，保留本轮 protocol.jsonl、server-stderr.txt 与 report.json，对照失败发生在建立连接、协议调用还是业务对象读取。报告 verification.passed=false 时命令非零退出，不把有最终报告当成业务验证通过。stdout 中的协议消息由原 Server 输出；日志写 stderr。

已有 `evidence/03-资源提示与插件` 是课程存档中先前的真实宿主运行。其代码版本、任务与模型会话另行记录，不能把它说成本观察入口生成的新日志。资源、提示、插件制作及模型如何使用返回分别在对应课程讲授。

本章完整观察保存在 `evidence/08-MCP连接/`。其中 `官方Client` 是运行7485fbc1的公开协议及独立五表状态，实际运行源码为b3d0ba13；`既有宿主` 是主编对固定03-end的运行426f9341，包含Skill和参考全文的实际读取、五次MCP返回及独立CLI的完整三章。归档没有改变这些运行时的源码或结果。两种记录的任务、人工材料和会话各不相同，不能拼成一次模型运行。各文件字节哈希见同目录清单；教学意义及验证范围见运行与范围说明。
