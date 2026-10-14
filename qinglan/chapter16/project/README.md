# 青岚修仙录：新任务验收

本节在同一青岚宗世界中，用独立两章支线《雾里的药符》验收已有Agent。林青仍是炼气三层；铜片主线的章稿不导入此作品。

沿用已克隆的课程仓库。在本目录运行 `pnpm run lab`，打开 `http://127.0.0.1:4367`，选择阶段并点“查看结果”。先读结论，再按需展开完整原答和过程；查看实录不调用模型。

## 亲自实践

复用第十章已有的Store、MCP、Skill和成熟Harness。完成第十章的一次准备后，在本目录运行 `pnpm run practice:prepare`，新建独立SQLite并将第十章工作台切到本作品；原练习库与入口记录继续保留。

之后在 `qinglan/chapter10/project` 操作：

1. 运行 `pnpm run prototype --port 4368` 打开工作台。运行 `pnpm run agent --prompt ../../chapter16/project/inputs/A-首章任务.txt --chapter 1 --stop-after-save`。停止后读实际首章；使用命令返回的自己的运行目录。
2. 将 `inputs/B-变化后的完整要求.json` 保存为当前作品要求：`pnpm run lab update ../../chapter16/project/inputs/B-变化后的完整要求.json --expected-revision 1`。若资料已有修改，先读取它，不能直接套课堂修订。
3. 用 `inputs/B-条件检查任务.txt` 发起只读任务，`--resume-run` 指向自己的A目录。原会话若不能恢复，先确认真实对象，再用 `inputs/B-新会话恢复任务.txt` 新建只读会话。本次课堂保留了原会话失败与新会话恢复两份记录。
4. 读完分析，作自己的取舍。课堂选择在 `inputs/人的当前要求.json`，用现有 `lab update` 保存；实际资料为r2时才使用 `--expected-revision 2`。在工作台的暮钟与行程说明之后插入 `inputs/课堂补写段落.txt`，保存完整首章并读回核对。
5. 完整阅读后，自行决定是否采用首章：`pnpm run lab adopt 1 --expected-revision 当前章修订 --note "具体阅读理由"`。课堂采用备注记录课堂决定，不能代替你的选择。
6. 用 `inputs/C-接续任务.txt` 完成第二章，`--chapter 2 --resume-run 自己已成功完成的B目录`。读当前完整要求和首章，以自己的实际基线保存，再核正文。缺失工具结果的会话须先处理，不能直接接续。
7. 完整阅读两章后决定第二章的采用，再运行 `pnpm run lab export 自己的交付.md`。打开实际文件，核章序、全文、状态和理由。源码切换不会恢复自己的数据库与会话。

课堂运行共四个模型Task：A保存后取消、B原会话恢复失败、B新会话只读完成、C接续完成。完整原件在 `records/`，6772字节的Markdown交付在 `records/D/青岚修仙录-雾里的药符.md`。模型结束、业务保存、编者课堂采用和文件交付分别核对；模型调用按需执行，没有自动重跑。
