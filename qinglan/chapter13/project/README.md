# 青岚小说整理工作台

沿用已克隆的 [课程仓库](https://github.com/Ador-able/vibe-coding-course-labs) 和仓库根的首次准备。进入本目录，双击 `启动实验.cmd`，打开 `http://127.0.0.1:4355`。也可运行 `node server.mjs`；需要独立端口时设置 `LAB_PORT`。

五个入口依次为长文、分类、抽取、逐项状态、模板核对。选择当前步骤或来源，点击“查看结果”。页面只读已保存材料，不调用模型。完整原文、原答和来源均可回查，字段以中文显示；请求正文、用量和专业检查按需展开。共用模型设置沿用请求观察室，不重复填写密钥。

## 材料和实录

- `inputs/`：完整三章存档、教师反馈和核查日志、完整提示、独立参考与原字节清单。三章均为当时存档中的 draft；日志和错误候选是教师材料，不代表真实核查或作者采用。
- `records/`：各轮完整发送体、返回体、原答、源码标识、检查、逐项状态与 CSV。每个新记录名独立，已有原件不覆盖。
- `public/lab.json`：只读页面使用的展示数据，由原材料和实际记录生成；原请求及响应仍保留在 `records/`。

长文记录区分全文输入、map-reduce、refine 的各自墙钟时间。三个 map 同时发出，等各自终态以后才决定是否汇总；refine 依次使用上一份实际结果。独立方法失败保留，依赖失败不继续，不自动重试。

逐项页分别保留整批抽取真实原项、独立教师错误候选和本轮真实修复。教师候选不记为云模型失败，六项原记录不因修复两项而改写。正常返回、程序检查、语义判断和作者采用分别记录；这套实验没有中途崩溃恢复或通用缓存调度器。

## 自己运行一轮

默认课堂实录无需重跑。确有新的材料或提示需要比较时，先固定完整输入和真实 Git 起点，使用新的记录名。模型调用读取本机共用设置；长文与分类各 4096 输出预算，整批抽取和模板各 8192，逐项修复各 4096，temperature 0、maxRetries 0，不主动关闭思考。基本步骤共 17 次文本请求，教师候选修复另 2 次；实际失败保留，不为得到课堂答案追跑。

修改材料后，先同步全部原件与独立参考，让编码助手按每份文件的实际字节重生成 `inputs/registry.json` 中的长度和 SHA256 清单；旧清单不会自动接受新材料。再运行 `pnpm source:freeze`、`pnpm build` 和必要检查，提交新的实际 Git 起点，然后用新记录名运行。`source:freeze` 只冻结源码，不更新输入清单。

在本目录依次运行：

```powershell
node scripts/observe-long.mjs my-long-01
node scripts/observe-labels.mjs discovery my-discovery-01
node scripts/observe-labels.mjs v1 my-v1-01
node scripts/observe-labels.mjs v2 my-v2-01
node scripts/observe-extract.mjs my-extract-01
node scripts/register-batch.mjs my-batch-01
node scripts/observe-repairs.mjs records/batch/my-batch-01
node scripts/read-batch.mjs records/batch/my-batch-01 records/batch/my-batch-01/readback.json
node scripts/observe-templates.mjs my-templates-01
node scripts/check-records.mjs
node scripts/prepare-page.mjs
```

独立参考不发送给模型。`requests:preview` 只让 SDK 序列化请求正文，不进入 HTTP；reduce 和后两次 refine 的完整正文须等实际前序结果取得后构建。

CSV 使用 Python 标准库；只有主动重新导出才需要 Python。导出保留候选业务值，不修复其证据或汇总。另一个进程完整读回十一列，按约定恢复 null、零、逗号、双引号与嵌入换行。例如：

```powershell
python -X utf8 scripts/csv-records.py export records/templates/my-templates-01/V1/output.txt records/templates/my-templates-01/V1/csv
python -X utf8 scripts/csv-records.py readback records/templates/my-templates-01/V1/output.txt records/templates/my-templates-01/V1/csv
```

对 V2 或整批抽取使用各自实际原答路径。CSV 字节读回相同不等于整份结果已正确；文中的虚构日志值也不证明文学品质、真实执行、去重人数或因果效果。用量按实际记录，未确认单价或账单时不计算真实费用。
