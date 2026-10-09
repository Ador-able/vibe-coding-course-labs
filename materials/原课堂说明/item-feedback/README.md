# 字段与统计分母练习

八份日报为教师原创，不是真实用户或广告投放。先核字段、原句和统计范围，再交CSV。此次AI一次请求未通过整份验收；正确CSV与计算来自请求前独立教师参考，没有修改模型原答。

## 完整已有材料

inputs/reports.json是8份完整来源，teacher-reference.json在请求前保存11字段参考和统计规则。prompts/instructions.txt与task.txt为实际完整教师任务，task已经填入所有来源；参考未发给模型。

runs/extract-01完整保留prompt、instructions、request-body、response-body、output和report。没有请求头或凭据。一次HTTP200、stop，48.4秒，input1342/output2184/total3526tokens，未核账单。qwen-plus-2025-12-01、temperature0、enable_thinking:false、maxOutputTokens6144、maxRetries0。实际SDK ai7.0.122和兼容入口3.0.59。

JSON形状成立不代表内容通过：R01证据借用了R02句式，R06两个证据自行加入英文省略号；汇总又含重复R02、零展示R05，点击200和比例约4.651%均错误。六个标题末句号与教师参考不同，但原材料没有清晰界定边界，需人确认，不能统称捏造。content-review.md逐条核完整8份及汇总，原结果不改。

runs/inspection.json保留全88业务值/80证据位置核对与失败。modelAccepted=false；程序完成核查并正常退出，不等于AI通过。runs/request-check.json只证明原始请求/返回/用量与当前对应文件相同，不作内容验收。

## 正确参考与实际CSV

runs/teacher-csv-01/teacher-reference.csv是606B教师参考CSV；restored-full-rows.json保留完整读回8×11值，calculation.json保存记录范围和计算。文件11物理行不代表11数据记录：两份标题含实际换行。所有数值和重复/预算字段空单元格按本练习约定恢复null，0保持0，标题非空；CSV没有自动保存JSON类型。没有XLSX或Excel/Sheets实测。

CTR取R01/R03/R07/R08，195/4300约4.535%；等权平均四日报比例4.75%回答另一问题。R04的20点击缺对应展示，已知点击215不能除以同一4300。R05的0/0不写成0%，按本次>0规则排除，但零值仍在原表。R06预计量与10元预算不当实际。花费35覆盖六条已知实际，订阅10仅覆盖五条已知事件，非六条完整合计或独立人数。

## 独立恢复，零模型读回

本次实际Node24.19.0、Python3.12.14、pnpm11.25.0。解压即可读extract-fields/已有成果；从包目录恢复独立Git根：

```plaintext
git clone --config core.autocrlf=false extract-fields.bundle extract-fields-replay
cd extract-fields-replay
git checkout --detach course-extract-fields-end-04
git status --porcelain=v1 --untracked-files=all
node check-request.mjs
python inspect.py
```

start标签固定请求前输入与程序；end-04增加实际返回、核对程序及说明。clone只为该新库设置换行选项，不改全局配置；该CSV通过仓库属性保留实际CRLF字节，正文展示统一LF。两检查不调用模型，只核现有原件与按教师参考重写确定结果。读JSON中的每项失败，不能把脚本退出0当整份结果通过。

## 换自己的完整材料

先按工作用途确定字段、状态、单位、空值、重复键及每个统计问题，明确标题等字段边界，并保存完整参考与输入。包中的课堂检查器针对这8份固定材料；新材料需要新的逐字段/原句/分母核查，不能套用课堂通过结论。

若确需新调用，在自己副本使用已有工作区及锁：

```plaintext
pnpm install --frozen-lockfile
node run-extract.mjs runs/my-extract-01
```

仅通过当前进程DASHSCOPE_API_KEY提供自己已有授权的百炼密钥，不写进提示、JSON、Git或公共文件。端点https://dashscope.aliyuncs.com/compatible-mode/v1。脚本只读当前inputs/提示，新目录必须不存在，绝不覆盖课堂记录，不自动重试或修正结果。新调用可能计费；本次usage不证明免费或实际账单。

inspect.py固定读取课堂extract-01并独立教师参考，不自动验收my-extract-01。新任务须另核完整结果与自己的当前口径。缺少记录、请求失败和合法零条结果分别保存，不能都用空数组凑齐。

research/采用范围.md仅保留研究定位与采用范围。第三方SRT、PDF、网页全文及私有授权设置留内部，不在公共包。材料没有真实营销、身份、总体抽样或因果设计，不外推标题效果或真实用户比例。
