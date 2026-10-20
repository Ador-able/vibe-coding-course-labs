# 凡人原文整理工作台

从课程实验首页选择“小说材料整理”，或打开 http://127.0.0.1:4318/lessons/chapter13/ 。查看课堂实录不调用模型；本章命令在当前目录执行。

五个入口依次是[长文](http://127.0.0.1:4318/lessons/chapter13/)、[原文分类](http://127.0.0.1:4318/lessons/chapter13/classification.html)、[人数抽取](http://127.0.0.1:4318/lessons/chapter13/extraction.html)、[逐项状态](http://127.0.0.1:4318/lessons/chapter13/batch.html)和[模板核对](http://127.0.0.1:4318/lessons/chapter13/templates.html)。页面只读已存实录，选择当前来源后点“查看结果”；完整输入、用量与检查按需展开，不请求模型。

## 材料和判断范围

长文直接使用仓库C03、C04、C05三段连续原文，从选拔到初见墨大夫；它们跨越原书章节边界，称“三段”而非“三章”。分类使用十二个连续原段，人数抽取使用十段原文，其中R06是R05同一段的重复导入。原文位置与SHA256见inputs/原文定位说明.json；任务口径与独立参考均在调用前冻结，参考不发送给模型。

人数字段只按本项人群和原段提取。三十余、五六不换成准确整数；未报告的正式人数为null，明确尚非正式才为0。将来缺的岗位、遣送指令与已发生或已宣布的身份分开。比例只问“下山同行的一组”：六名正式与两名记名，同组分子6、分母8，重复导入不再累计。不同场景可能是同一批人，不把所有行相加称独立人数，也不以这份比例推断全部考核者录取率。

records保存每轮完整发送体、返回体、原答、用量、实际执行Git提交号与逐项状态。已有原件不覆盖；页面只展示与当前冻结输入字节一致的记录。生成结束、程序检查、语义回查与内容采用分别判断。实录读回页截图只是已有记录的展示，不是重新生成。

## 需要比较新条件时

默认直接阅读课堂实录。确有新的材料或提示要比较时，先固定输入和Git起点，用全新的记录名运行；单轮失败保留，不为得到课堂答案追跑。参数为temperature 0、maxRetries 0、显式关闭思考；长文与分类输出预算4096，抽取与模板8192，单项修复4096。

基础范围最多17次文本请求：长文8次、分类6次、整批抽取1次、两模板各1次。最多额外2次只用于本轮真实存在、确需修复的未通过候选；原答全过则0次，不为凑步骤构造坏模型输出。教师边界候选只做本地检查，不进入云修复。

在本目录按需运行本节的一组命令，不必每次重做全章：

~~~powershell
node scripts/observe-long.mjs my-long-01
node scripts/observe-labels.mjs discovery my-discovery-01
node scripts/observe-labels.mjs v1 my-v1-01
node scripts/observe-labels.mjs v2 my-v2-01
node scripts/observe-extract.mjs my-extract-01
node scripts/check-records.mjs
node scripts/register-batch.mjs my-batch-01
node scripts/observe-repairs.mjs records/batch/my-batch-01
node scripts/read-batch.mjs records/batch/my-batch-01 records/batch/my-batch-01/readback.json
node scripts/observe-templates.mjs my-templates-01
node scripts/check-records.mjs
node scripts/prepare-page.mjs
~~~

长文三个map并行，全部取得可用前序返回后才reduce；refine依次使用上一份实际输出。每种方法保留自己的墙钟时间与全部调用用量。依赖缺失就保留缺失范围，不假装已处理全文。

逐项页从本轮整批原答注册各项状态，只对有可解析候选且程序未通过的项定点处理，按原ID顺序最多两项。原答无法解析时保留“未取得本项”，不凭空补造字段。其余项逐字节保留；本地没有测试崩溃自动恢复或通用缓存调度。修复两项不会自动更新整批汇总或证明模板已经通过回归。

## CSV与输入维护

CSV只转换七个业务字段，不修复其中的语义。需要导出时，分别启动Python进程：

~~~powershell
python -X utf8 scripts/csv-records.py export records/extraction/my-extract-01/extract/output.txt records/extraction/my-extract-01/extract/csv
python -X utf8 scripts/csv-records.py readback records/extraction/my-extract-01/extract/output.txt records/extraction/my-extract-01/extract/csv
~~~

对两版模板使用各自实际原答路径。空数值单元格和duplicateOf空值按约定恢复null，0原样保留；CSV标准库按逻辑记录处理文本。无法解析原答时，导出失败也保留，不去掉围栏后冒称原答已合格。

原文更新或要调整教师口径时，先改scripts/prepare-inputs.mjs，再运行它生成完整inputs与字节清单。随后运行pnpm build、必要测试、pnpm source:freeze并提交实际源码与材料，才能运行新比较。requests:preview只采集SDK序列化正文，HTTP发送为0；依赖步骤等本轮真实前序结果取得后再构建。未确认账户单价和账单时只记录用量，不计算实际费用。
