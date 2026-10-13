# 第十三章课堂记录

在本章工作台选择任务，点击“查看结果”，默认只读取本地实录。原件保留完整输入、实际SDK请求正文、原始响应、原答与检查；这里的索引和用量统计不替换原件。

## 先找到当前结果

| 页面 | 记录目录 | 本轮实际情况 |
| --- | --- | --- |
| 长文 | [long-03](long-text/long-03/) | 三种方法共8次返回；全文242字、汇总396字、最终修订502字，事实与篇幅另核 |
| 反馈分类 | [discovery-03](classification-discovery/discovery-03/)、[v1-03](classification-v1/v1-03/)、[v2-03](classification-v2/v2-03/) | 共6次返回；两版各完整重标12条，教师参考不等于真实未知数据盲测 |
| 核查抽取 | [extract-04](extraction/extract-04/) | 1次成功返回八项；缺口证据与比例集合仍未通过，647字节候选CSV完整读回8×11业务值 |
| 逐项状态 | [batch-03](batch/batch-03/) | 两教师候选各1次真实修复；原整批对象另外保留，其他六项原字节未动，原汇总未采用 |
| 模板核对 | [templates-03](templates/templates-03/) | 2次均取得stop返回，但带Markdown JSON围栏，严格解析失败；四次CSV导出/读回均失败，未生成CSV |

当前五页展示对应19个返回：长文8、分类6、成功抽取1、修复2、模板2。正常stop、JSON解析、字段和证据检查、业务文件往返及人的采用各有自己的结果。R06修复的预计量引用虽然通过连续子串检查，仍不足解释实际null；R04旧检查失败也保留。

## 各条件分别回查

- [qinglan-ch13-start](https://github.com/Ador-able/vibe-coding-course-labs/tree/qinglan-ch13-start/qinglan/chapter13/project)：初始实际Git起点8901504，长文4096输出预算，没有显式关闭思考。对应[long-01](long-text/long-01/)六个返回：五个length且正文为空，唯一stop带JSON围栏，严格解析失败。依赖不全时没有发reduce或第三步refine。
- [qinglan-ch13-run-start](https://github.com/Ador-able/vibe-coding-course-labs/tree/qinglan-ch13-run-start/qinglan/chapter13/project)：第二起点7f65d10，长文预算16384、追加JSON格式说明，仍没有显式关闭思考。对应[long-02](long-text/long-02/)六次发起，五个返回；第六个在途refine2由教师停止本地进程，见[受控停止说明](long-text/long-02/controlled-stop.json)，提供方终态和usage未知。
- [qinglan-ch13-comparison-start](https://github.com/Ador-able/vibe-coding-course-labs/tree/qinglan-ch13-comparison-start/qinglan/chapter13/project)：本次比较起点5a77af7，按冻结设置显式发送thinking disabled。长文/分类4096，抽取/模板8192，逐项修复4096；温度0、自动重试0。长文材料与字段口径没有因实际输出而改写。
- [extract-03](extraction/extract-03/)是连接超时，不曾取得HTTP响应或模型usage。教师明确人工以相同输入和设置另建extract-04重试一次，旧失败保留，不记为SDK自动重试或字段错答。

旧两轮合计12次发起、11次返回、1个终态未知；新条件共有20次发起、19次返回，另1次连接失败。合计32次提供方请求入口尝试、30个HTTP返回。没有取得usage的两次不能记作0，也不能从客户端停止或连接失败推断提供方未处理或未计费。

模型实测源码标识为sha256:1c7ad14c7dbea0d9b1228167019423c49537385aefe717547696e26e12ab4846、Git5a77af73e6e6e05fa4865177e40730f593406064；当前展示源码为sha256:f77ee9eb8024e427f9e7de2d83466c3518e87e8129eabfa6b14ee5d5bb8d76ff，只调整页面展示，没有重发模型。三份[实际起点源码快照](../materials/source-versions/)从相应Git标签原字提取；各记录里的源码标识和输入清单保持采集时的值。

## 已取得用量

| 条件或任务 | 提供方尝试 | 已取得返回 | 用量缺失 | 输入Token合计 | 输出Token合计 | 其中思考Token |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧条件一 | 6 | 6 | 0 | 11958 | 22120 | 21291 |
| 旧条件二 | 6 | 5 | 1 | 9595 | 77532 | 76565 |
| 当前长文 | 8 | 8 | 0 | 16939 | 7738 | 0 |
| 反馈分类 | 6 | 6 | 0 | 7049 | 3115 | 0 |
| 核查抽取 | 2 | 1 | 1 | 1437 | 1896 | 0 |
| 教师候选修复 | 2 | 2 | 0 | 1935 | 496 | 0 |
| 模板核对 | 2 | 2 | 0 | 3517 | 5067 | 0 |
| 全部已取得usage | 32 | 30 | 2 | 52430 | 117964 | 97856 |

[用量统计原表](用量统计.json)按32个独立record.json去重，只累计30个实际响应中的usage，report.json的重复副本不重复计数。这里的合计不是32次的完整计费用量，更不是账户账单；未核单价或实付，不计算人民币费用。

## 材料与来源

三章是第十章当时导出的draft存档；反馈、核查日志与两错误候选由教师编写。teacher_candidate与cloud、cloud_repair分开保存，教师错误不记为模型历史错答。CSV直接转存成功抽取的十一列候选业务值，不含证据或汇总，不以文件往返通过代替内容采用。零网络SDK预览在previews/，不是已发出的提供方请求；官方Mock核心检查也不计入课堂云实录。

[四张原生高清截图](../materials/screenshots/)绑定当前展示源码。图片未经插值放大或拼接，截图回执保留原像素、DPR和SHA；完整原文仍以inputs/和本目录原件为准。
