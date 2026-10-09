# 关键词和向量检索

本练习把同一问题分成关键词与语义查询，在同一资料范围内取得候选，再按名次融合。候选是否相关、能支持哪些结论，要回查完整原文。页面不生成回答，不保存小说，也不自动判定文学采用。

## 独立恢复与依赖

在下载包所在目录把代码恢复到一个新的目录。该目录需要有自己的Git根；不要把观察脚本直接放进Knowledge父仓库运行。

~~~powershell
git clone ./资料代码.bundle ./检索实验
git -C ./检索实验 switch --detach vcm-05-03-end
Set-Location -LiteralPath ./检索实验
git rev-parse --show-toplevel
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm materials:check
~~~

`vcm-05-03-start`指向继承的05-02完成点`e35d02102264529747376941b24aaee4e161b062`；`vcm-05-03-end`固定本节代码。确切SHA及安装/字节检查回执见交付清单。保留本项目的`pnpm-workspace.yaml`，使用现有锁文件，不加跳过工作区的参数。

实际准备使用Node.js 24.19.0、pnpm 11.25.0。包沿用既有`packageManager`声明11.20.0；安装回执记录实际调用版本。AI SDK 7.0.122、OpenAI兼容provider 3.0.59、Orama及其官方tokenizers 3.1.18均已写入锁文件。依赖本地安装，不改第三方代码。继承的切块、问答和PDF脚本是前置资料，本节不执行它们。

## 固定材料与位置

`inputs/retrieval/固定输入清单.json`记录12份输入的原字节。材料是18个既有小说块、4份完整教师便签；再加3条固定语义查询，合计25条向量输入。资料身份用唯一`corpus.id`，不能把同一`docId`的不同块合并。

完整第三章为1063个UTF-16码元、25段，是已有模型草稿，没有文学采用结论。18个块保留原text、SHA、正文范围、源文件身份和页定位。四份TXT便签由教师构造，不是新PDF解析页、真人委托或付款。小说定位用已有PDF物理页；便签定位用完整TXT及行范围。

`public/source-pages/`复用已有三页原图，`page-images.json`保存其来源和原字节摘要，本节不重新解析或渲染PDF。正文范围均为UTF-16左闭右开位置，不能当图片坐标。

## 一轮嵌入观察

这一步会请求真实供应商，先确认自己的合法模型权限。当前进程须已有`API_KEY`环境变量；脚本不读取凭据文件。不要把密钥写进命令历史或交付包。

~~~powershell
pnpm embeddings:observe
~~~

脚本使用百炼现有兼容入口`https://dashscope.aliyuncs.com/compatible-mode/v1`、`text-embedding-v4`和1024维。按固定顺序分成10/10/5三批，逐批执行一次`embedMany`，每批`maxRetries:0`、`maxParallelCalls:1`、60秒超时。实际HTTP请求正文应显示同一输入与`dimensions:1024`。

每轮独立写入`runs/embeddings-<UUID>/report.json`，终端给出完整路径。记录实际请求/响应正文、SDK values/向量/usage/warnings/providerMetadata、起止时间、输入与锁文件SHA。SDK responses只投影body、省略headers，不称整个结果对象原样。Authorization和凭据不保存。actualHttpRequests计进入原生fetch的尝试，wrapperCalls另计包装入口调用；不由调用次数证明服务器已收到。SDK计量不是实际账单，实际费用未取得时保持未知。

失败保留已取得的批次、完整HTTP正文与错误；脚本不切模型、换端点或重试。只有完成的25条向量才可继续本地排名。不要为理想排序再发这一轮嵌入。

## 使用同一记录排名

明确指定上一命令实际输出的`report.json`，不自动选择最近一轮或某次成功结果。

~~~powershell
pnpm retrieval:rank ./runs/embeddings-实际UUID/report.json
~~~

这是占位路径，运行时替换为实际UUID。排名脚本核对原输入、HTTP索引、完整向量与SDK顺序后，使用同一批向量计算六个条件，不再请求供应商。

关键词路只搜索text，用Orama中文tokenizer与组件的BM25检索；保存实际tokens、完整符合条件的命中及top3。中文tokenizer官方标为experimental，默认去重。本轮不依据原文重复次数手算其分数。`exact:false`保留组件词语/前缀匹配，`tolerance:0`不启用拼写容错；这不认证完整编号。`threshold:1`为至少一个词命中，不是全部词都必须出现。

两路共用逻辑`where`。Orama的enum筛选实际调用为`{projectCode:{eq:'AX-17'}}`等；向量路按同一元数据等值条件筛出资料后，用SDK `cosineSimilarity`排序。Q1/Q2分别保留memo/v1与加AX-17编号的条件；Q3保留story/v1及范围为空的story/v9。元数据来自固定教师输入，不是用户权限凭据。

RRF只接收各路实际top3；按唯一块ID形成并集，名次从1开始，`k=60`，每路贡献为`1/(60+rank)`。未进入该路top3时，贡献0、名次null。同分按ID字典序；不相加BM25与余弦原分数，也不能补出两路未返回的片段。

完整结果写入`runs/retrieval-<UUID>/observation.json`，并以相同字节复制到`public/observation.json`。记录包括原输入/25条向量、全部条件/候选/分数、RRF并集与各路贡献、完整原文和位置。四便签等12份输入另复制到`public/materials/`供回查。失败时查看实际命令输出，未形成的排名不要填成成功。

## 读取页面

实际排名完成后再启动自己的静态服务。

~~~powershell
pnpm dev
~~~

浏览器打开`http://127.0.0.1:4346`。查看结束在该服务终端按Ctrl+C；它只提供本章静态文件，不接入n8n或其他项目。

页面选择完整问题和范围，显示关键词、语义、融合三列候选及选中块全文。“回查原文”读取对应完整TXT或已有PDF原页。Q1核编号、对象和人名；Q2核预约/记录日期、总费用/预付关系；Q3核观察与原因未定的关系。分数、分词、完整JSON和下载按需展开。没有生成回答按钮或模型自评。

三种方向沿用同一份记录与当前选择。原版保持并列；台面合并工作面、缩窄来源侧；笔记页用连续内容面、把来源放到后面。切换不修改候选、不重算或嵌入。功能、辨认和整幅口吻各自判断，原版也可被采用。

筛选范围为空时保留问题、上次选择和已查看原文，明确当前无候选；记录或原文载入错误是另一种状态，不据此说资料没有相关内容。重载只读取静态文件。实际代表流程、关键状态和审美取舍由使用者查看后记录，不能从代码或安装通过推出界面验收。
