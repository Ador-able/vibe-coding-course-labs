# 文件身份、文件字节与提取文字

本练习把同一份三页小说资料的 PDF 和完整 UTF-8 文本放进一批目录，下载后分别解析，再形成两份待发送提示。小说是完整资料样本；练习关注 AI 工作中材料有没有真正取得、来源有没有错配，以及下一步实际会使用什么文字。

运行入口为课堂独立 n8n 2.41.6、Node.js 26.7.0。该镜像中的 n8n-nodes-base 实际为 2.41.4，n8n-core 为 2.41.4，n8n-workflow 为 2.41.2。配置使用这套已安装节点的参数。没有模型节点、通知节点或外部账号接入。

## 材料与入口

`files/chapter-three.pdf` 是既有三页自主课堂 PDF，5226 字节，SHA256 为 `ba956b0cd60890370e92930730e5bdb7f2b8086236c5afa40cde09f6dec48e97`。

`files/chapter-three.txt` 是既有小说第三章完整 UTF-8 原文，3093 字节，SHA256 为 `f80c723e7eada5bcfef34e2737941be7844df688b060b1889acecdd04c5384b5`。

`inputs/完整两项目录输入.json` 保留每项的 sourceId、中文 fileName、参考 MIME 和稳定下载 URL。sourceId 是教师资料身份，不是 Google Drive 的真实 fileId。中文 fileName 帮助人定位原件；HTTP 下载的 binaryMetadata.fileName 来自实际返回或 ASCII URL，可能是 chapter-three.pdf/txt，两者分别保存。

`inputs/既有三页正文参考.json` 是前一资料练习的页段正文参考，不是本次 n8n 的解析输出。PDF 本身还含页标题、页码与排版换行，后续需要对照本次真实三页 text；不能把参考正文填成新解析结果。

`workflow.json` 可导入原生 n8n 工作流。保存和发布应核对实际返回的工作流 ID 与版本 ID，不用文件里的节点 UUID 冒充这些业务对象。

## 真实材料链

1. Webhook 接收完整一批目录，Set 取 body，Split Out 将 documents 拆成两项，各自保留 document 和本批 requestId。
2. HTTP Request 4.5 对当前项的 downloadUrl 发 GET，选择 File、完整响应、sourceFile 二进制字段，关闭节点自动重试。两份文件各取得一次，不能把目录对象当下载字节。
3. 完整 File 响应的 JSON 是响应状态与 headers。Set 沿 `$('逐项资料').item` 取回当前项的身份，保留 sourceFile，并单独保存实际 binaryMetadata 和 downloadResponse。
4. Switch 3.4 根据 sourceFile 实际 MIME 路由，application/pdf 交 PDF 操作，text/plain 交文本操作。expectedMimeType 只作对照，未覆盖实际返回。未支持类型进入 Stop and Error；下载与解析错误也按原生错误结束，不制作替代正文。
5. PDF 的 binaryPropertyName=sourceFile、maxPages=3、joinPages=false、keepSource=both。本批固定资料为三页，输出 text 应是逐页数组；保留其原值和 numpages 等元数据。固定实现的 numrender 赋值来自文档总页数，不能仅凭这个数证明实际每页文字已经核过。
6. TXT 的 binaryPropertyName=sourceFile、operation=text、destinationKey=text、encoding=utf8、stripBOM=true、keepSource=both，输出 text 是解码后的完整字符串。
7. Merge 的 Append 汇集两路原项，不按行号拼接不同资料。Set 保存 rawParsedText，PDF 的 preparedText 明确以两个换行连接各页，TXT 直接使用 text；完整待发送提示只使用这个 preparedText。Aggregate 收齐各项 JSON，最终返回本批完整 documents 数组。

工作流显式使用 binaryMode=separate。下载后的身份 Set 在 Include Other Input Fields 开启时设置 Strip Binary Data=false，以保留后续解析所需的 sourceFile。最后的材料 Set 去掉 binary，只保留原解析文字与选定正文，避免把编码文件写进任务。

最终 documents 数为两项且两项有非空文字时，批次 stage 为 prepared_not_sent；若文字为空则返回 material_incomplete，并保留真实空结果。text_available 只说明有非空文字，不证明内容完整、来源正确或模型理解正确。两份提示没有发送给模型，通知仍为 not_sent。

## 取得真实字节并核原件

文件执行记录可能保存 binary.sourceFile 的存储 ID，data 可能只是存储方式名称，不是文件内容。应从实际执行对象取当前项的 binary 记录，不靠文件名猜原件。

固定镜像的原生读取路径有两种：带 id 的记录，可由有相应工作流／执行读权限的课堂账户调用 `GET /rest/binary-data?id=实际ID&action=download` 取得文件流；宿主节点的 getBinaryDataBuffer 同样先按真实记录交给 BinaryDataService。没有 id 的内嵌记录，由该服务按 BINARY_ENCODING 读取。不要将所有 data 字符串直接当 base64。无需创建签名 URL 或公开令牌。

真实下载字节应分别与上述两个 SHA、长度相同，且 sourceId 与当前项对应。binaryMetadata.bytes、HTTP Content-Length 和文件名都是辅助字段，不替代原字节核对。PDF 三页全文、TXT 全文和两个 preparedPrompt 还需要逐项读回。

## 运行与保留结果

先在独立目录恢复此材料仓库，确认目录本身是独立 Git 根。运行 `node scripts/检查配置语法与原件.mjs` 只核 JSON、表达式语法、固定材料字节和连线，不下载或执行任何节点。

由操作者只为两份 files 文件提供本地教师文件服务。本批固定 URL 为 `http://host.docker.internal:4359/chapter-three.pdf` 和 `http://host.docker.internal:4359/chapter-three.txt`。服务没有外部账户、凭据或额外资料。运行前先确认该课堂端口与访问条件，失败保留实际错误。

导入 workflow.json 后，使用一个实际工作流版本。若选测试入口，先开启这份工作流的测试监听，再只向该测试 URL 发一次完整目录；若选正式入口，先核实际保存／发布结果，再只向正式 URL 发一次。两种入口选择其一，不把同一输入各发一遍。完整教学批次在 `inputs/完整两项目录输入.json`，没有预填新解析文字。

保留这一次 POST 的完整业务回应、实际 executionId、执行终态、各节点完整输入输出和两份真实下载字节。成功回应不替代执行终态核查；若没有执行到 Respond to Webhook，应保留出错节点和实际终态，不能补出 prepared_not_sent。

本练习没有新 Google OAuth、语音转写、扫描 OCR、模型、向量库、通知、复杂版式或规模性能验证。后续真实模型任务还须检查请求中的完整文字与原答，preparedPrompt 存在不能证明已经发送。
