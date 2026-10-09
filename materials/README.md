# 文件编号、文件内容与提取文字

本练习用同一章节的三页 PDF 和完整 UTF-8 TXT，验证资料身份、真实下载、解析文字与待发送提示的不同边界。唯一实际批次中，两份下载原字节均与原件一致；PDF 三页 text 为空，TXT 取得完整正文。工作流正常结束，整批材料保持 material_incomplete，模型请求与通知均为 0。

## 固定配置与材料

配置起点：115a4188f4b0d8ecda505feb4c9f740dad71d376，标签 course-file-material-start-03。

完整配置：10428f08223b703ed4e99256d2f086258752623f，标签 course-file-material-end-03。

“配置”目录保存完整点的 13 份文件；“文件材料配置.bundle”包含真实起止历史。文件原件为 files/chapter-three.pdf（5226 字节）和 files/chapter-three.txt（3093 字节），分别使用 SHA256 ba956b0cd60890370e92930730e5bdb7f2b8086236c5afa40cde09f6dec48e97 与 f80c723e7eada5bcfef34e2737941be7844df688b060b1889acecdd04c5384b5。

实际课堂环境为 n8n 2.41.6、Node.js 26.7.0，nodes-base/core 2.41.4、workflow 2.41.2、api-types 1.41.3；JSON 使用实际安装节点的版本与参数。教师文件服务只提供上述两份资料，没有接入 Google 账户、模型或通知服务。

## 在自己的独立目录恢复

解压后在解压目录运行：

```plaintext
git clone 文件材料配置.bundle project
git -C project checkout -b codex/my-file-material course-file-material-end-03
git -C project rev-parse --show-toplevel
git -C project status --porcelain=v1
```

确认 project 自身是独立 Git 根、完整点为上述提交、状态无未提交改动。若从材料起点开始，可在另一个新目录选择 course-file-material-start-03。保留自己的实验分支。

Node.js 24 或更高版本可直接运行以下静态检查，无项目依赖：

```plaintext
node scripts/检查配置语法与原件.mjs
```

该程序核固定资料原字节、JSON 与表达式语法及连线，不下载、解析、执行工作流或请求模型。

## 进入自己的 n8n 练习

导入 project/workflow.json。仅为 project/files 的这两份文件提供本地文件服务。课堂 Docker 地址为 http://host.docker.internal:4359/chapter-three.pdf 和 /chapter-three.txt；其他部署需要改成容器实际可访问的地址，不能把宿主 localhost 当作容器内同一地址。

使用自己的实际工作流 ID 与版本。选测试监听或正式发布其中一个入口，先核这个版本已可使用，再向这个入口发送 project/inputs/完整两项目录输入.json 的一批目录。正式路径为 /webhook/vcm-11-03-file-material，测试路径为 /webhook-test/vcm-11-03-file-material。保留自己的完整请求、回应、执行终态、节点输出和实际字节，不把课堂 executionId 当成新结果。

本次采用正式入口，工作流 5owiqM4AugfT3axS，版本 a1ced136-8f54-4212-9efa-bd8796a80f69，执行 7。发布后第一次读到 in_progress；POST 前重新读取已为 published，liveVersion 与该版本一致。一个 POST 导致 PDF/TXT 各一次 GET，13 个节点实际执行，未支持 MIME 分支未走。

下载记录的 binary.fileName 是 chapter-three.pdf/txt，目录 fileName 是两份中文教师文件名。分别保留，不要求两个名字相同。当前 sourceFile 有 filesystem-v2 存储 ID，data 不是文件的 base64；实际文件流已按权限读取并逐字节核同原件。

## 阅读完整实际结果

“实际记录”保留 14 份真实公开材料：创建、发布、唯一 POST、最终读回、13 节点完整业务输出、完整批次、两份实际存储文件、TXT 全文与提示、PDF 警告、文件服务日志和已有业务对象前后读回。账号身份、Cookie、私有会话及调用者信息按各记录 projection 省略，完整业务文字未改。不是私有 HTTP 或内部对象的原字节全集。

PDF rawParsedText=["","",""]，parsedPageCount=3；preparedText 仅四个换行，text_empty、preparedPrompt=null。日志含 loadFont - translateFont failed，要求 cMapUrl/cMapPacked，另有画布相关 warning。这说明当前提取环境此次未取得可用 PDF 文字，不能据此断言文件是扫描件或没有文字层。

TXT 原文 1063 个 UTF-16 字元，实际完整提示 1216 个 UTF-16 字元；其 stage 为 prepared_not_sent。批次 stage 为 material_incomplete，modelRequestCount=0，notificationStatus=not_sent。HTTP 200 和执行 success/finished=true 不能改变材料的这个判断。

“配置/inputs/既有三页正文参考.json”是以前的页段正文参考，不是本轮 n8n 输出。“配置/README.md”和“配置/主编唯一批次执行定义.json”保留运行前准备，后者 approvedBy=null；实际采用与核对见“实际记录/主编实际完整核对.json”。不要把冻结预期或旧正文填成解析成功。

人可以明确选择已核完整的 TXT 继续下一项任务，但这是人的材料选择；本次没有自动回退、调用模型、OCR、复杂版式或外部账户验证。新环境输出可能不同，应读自己的真实结果。

## 练习、图片与清单

“教师材料/四题完整提示与答案.md”包含完整题目、提示和解析。“图”保存原创关系示意与完整生成提示；图中页号和短线不是本次解析文字，本轮 PDF 实际为空。图不代替真实节点记录。

“研究采用与定位.md”保存编者采用判断和公开资料定位；原课程与完整第三方源码不在练习包中。全部公共文件的实际长度和 SHA 见“完整原字节清单.json”。Git 只恢复配置和文件，无法恢复课堂账号、服务、发布或执行状态。
