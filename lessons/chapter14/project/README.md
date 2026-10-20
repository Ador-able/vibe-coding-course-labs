# 凡人小说业务工作台

从课程实验首页选择“业务流转”，或打开 http://127.0.0.1:4318/lessons/chapter14/ 。查看课堂实录不调用模型；本章命令在当前目录执行。

八节共用三组原生流程：反馈登记、PDF/TXT文字提取、父子流程分路，共四份workflow。课程材料来自用户提供的《凡人修仙传》TXT，C03/C04/C05完整原文另附可核对的大纲与设定。片段跨书中章界，反馈所指第五/六/四章与片段C04/C05/C03分别记录。教师反馈用于练习登记与回查，不更改原著。

入口依次为 flow.html、authorization.html、files.html、ids.html、webhook.html、calendar.html、branch.html、acceptance.html。页面只读已有实录，没有记录的步骤显示尚未保存。账号授权案例与日历安排是教师提案；接收者验收由实际操作人另行完成。

## 自己运行

保存自己的改动后，在仓库中建立个人实验分支。只读实录无需Docker；运行原生流程才需要本机n8n。

使用官方固定版本 docker.n8n.io/n8nio/n8n:2.41.6，准备独立容器和新卷：

~~~powershell
docker volume create fanren-ch14-classroom-20261015
docker run -d --name fanren-ch14-classroom-20261015 -p 127.0.0.1:5689:5678 -v fanren-ch14-classroom-20261015:/home/node/.n8n -e GENERIC_TIMEZONE=Asia/Shanghai -e TZ=Asia/Shanghai -e N8N_HOST=localhost -e N8N_PORT=5678 -e N8N_PROTOCOL=http -e N8N_EDITOR_BASE_URL=http://localhost:5689/ -e WEBHOOK_URL=http://localhost:5689/ -e N8N_SECURE_COOKIE=false -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_PERSONALIZATION_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false docker.n8n.io/n8nio/n8n:2.41.6
~~~

第一次在 http://localhost:5689 使用n8n标准UI准备自己的账户和API key。将baseUrl与apiKey保存到用户目录 .vibe-coding-labs/fanren-n8n-ch14.json；N8N_LAB_CONFIG也可指定自己的私密配置。个人凭据不进Git、不交给工作台页面。

1. node scripts/n8n.mjs prepare：创建测试/正式Task、Feedback各一组空表与独立回执表，导入四份原生workflow，保持未发布。
2. node scripts/n8n.mjs probe：探测未发布正式入口，保存这一次实际返回。
3. 在n8n编辑器打开反馈workflow，点击测试监听，再运行 node scripts/n8n.mjs feedback test-E01。监听由真实编辑器启动。
4. node scripts/n8n.mjs publish：把同一反馈流程绑定正式空表，保存并发布实际版本；先子后父，回查已发布版本。标准UI另核触发器是否就绪。
5. 依次运行 node scripts/n8n.mjs feedback production-E01、node scripts/n8n.mjs feedback duplicate-E01、node scripts/n8n.mjs feedback production-E02。串行重复使用完全相同输入；故障分支来自教师指定的failTask=true。
6. 保持根目录的课程实验服务运行，执行 node scripts/n8n.mjs files，再执行 node scripts/n8n.mjs branch。文件命令只有一次POST，带两份资料；批次命令只有一次POST，带E02/E01/E03三个任务。

完整输入、每次POST的字节SHA和items计划在 inputs/执行请求清单.json。最多7次Webhook POST，0模型、0Google、0邀请或邮件；文件流程只提取文字并准备提示。父子流程将实际原文、大纲和设定随task对象传递，写入完整输入回执，没有替你作文学判断。

错误时保留原件与真实对象ID，不自动重发业务。node scripts/n8n.mjs readback另存五表独立读回；它不会再提交反馈。收到、任务终态、通知与人工采用分别回查。

## 来源与检查

inputs/凡人原文片段与段落定位.json保留三个片段的全部原字，materials/用户原书与凡人片段核对.json记录用户TXT字节SHA与连续匹配。大纲、设定由教师按原句整理，当前至第六章授课承诺，不补后文结果。批次三项各携带对应完整原文、大纲与设定。

PDF与TXT复用第十二章完整C05的段落空行排版；三个原页为2645×3743原图。页数和正文分组是材料属性，本章n8n真实提取是否成功仍看执行原件。原生节点、版本、ID和连接沿用既有模板，来源与改动范围在 materials/原生模板来源.json。

pnpm check核输入原件、引文与原生表达式语法；pnpm test核完整业务投影；pnpm source:check核冻结源码。pnpm calendar只重算固定日期的IANA时区，不访问日历。更换自己的输入时，按实际字节更新输入清单，再冻结新的源码与Git起点，使用新的采集目录。

教师隔离实测可用 node scripts/setup-classroom.mjs create调用该版本标准owner/setup、login、API key接口，创建本机合成账户，私密原件只存用户目录。既有其他课堂容器、卷和历史执行不作为本轮结果；历史材料保存在 records/历史青岚-20261013。
