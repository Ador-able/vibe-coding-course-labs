# 批量处理模型实验

这个包包含五节实验的完整输入、课堂原答、提示和可选实跑程序。已有记录可以直接阅读。新的运行不会覆盖课堂结果。

先在请求观察室的“模型设置”保存连接。这个包的共用入口读取同一份已保存设置，不需要另填密钥。在包根目录安装一次：

```powershell
pnpm install --frozen-lockfile
```

把这个包交给编码助手时可以直接说：

> 按 README 准备本节实验，复用请求观察室已保存的模型设置。先读取课堂材料，只有我要求新的实际结果时才运行模型。使用共用入口和新的结果目录，保留真实失败，不自动重试、不覆盖原答、不把课堂答案当作新模型结果。

下面所有命令从这个包的根目录运行。结果目录若已存在会拒绝覆盖，再做一次时选新的目录名。真实运行产生模型费用。

| 实验 | 项目目录 | 运行内容 |
| --- | --- | --- |
| 长文本 | `long-text` | 三种方法，共八次请求 |
| 批量分类 | `batch-labels` | 每阶段两批；读者确认口径后再进入下一阶段 |
| 字段与分母 | `extract-fields` | 八份材料，一次请求 |
| 逐项反馈 | `item-feedback` | 登记旧历史，只重做 R01、R06，各最多一次 |
| 两模板比较 | `template-comparison` | 同一输入，两版串行各一次 |

## 长文本

```powershell
node scripts/run-lab.mjs long-text compare.mjs runs/my-comparison-01
```

新报告、各次实际发送与返回、中间笔记和最后摘要在 `long-text/runs/my-comparison-01`。保留完整材料，人工回查摘要。

## 批量分类

```powershell
node scripts/run-lab.mjs batch-labels run-stage.mjs discovery runs/my-discovery-01
```

先看发现结果，再由你确认 `inputs/codebook-v1.json` 的口径。确认后才运行 v1：

```powershell
node scripts/run-lab.mjs batch-labels run-stage.mjs v1 runs/my-v1-01
```

需要修改口径时明确更新 `inputs/codebook-v2.json`，再用同一口径重处理两批，不自动从 v1 推进到 v2：

```powershell
node scripts/run-lab.mjs batch-labels run-stage.mjs v2 runs/my-v2-01
```

每阶段的新报告记录实际设置、完整两批输入及原答；程序退出不代表标签已经采用。

## 字段与分母

```powershell
node scripts/run-lab.mjs extract-fields run-extract.mjs runs/my-extract-01
```

新记录在 `extract-fields/runs/my-extract-01`。回查原文、空值、重复项、统计分母和单位，保持原答。课堂的 `check-request.mjs`、`inspect.py` 针对已保存课堂记录；自己的新材料不能照用固定参考判作通过。

## 逐项反馈

先创建自己的新状态，登记过程不调用模型：

```powershell
node item-feedback/register-history.mjs state/my-history-01
node scripts/run-lab.mjs item-feedback repair-two.mjs state/my-history-01
node item-feedback/check-state.mjs state/my-history-01 runs/check-my-history-01.json
node item-feedback/read-state.mjs state/my-history-01 runs/read-my-history-01.json
```

历史六项、原错误汇总和课堂原件保留。每个新尝试的 recipe、请求正文及检查都按本次实际设置核对；结构、固定值和引用检查通过仍需人工判断支持关系。某项失败时保留另一项的结果，勿再次 repair 同一状态。

已有只读页可直接启动，无需安装或模型设置：

```powershell
python -m http.server 4357 --bind 127.0.0.1 --directory item-feedback/public
```

打开 http://127.0.0.1:4357/ 阅读课堂历史与两次反馈结果。页面不会自动调用模型或采用结果。

## 两模板比较

```powershell
node scripts/run-lab.mjs template-comparison compare-templates.mjs comparison-runs/my-comparison-01
node template-comparison/inspect-comparison.mjs comparison-runs/my-comparison-01
python template-comparison/comparison-csv.py export comparison-runs/my-comparison-01
python template-comparison/comparison-csv.py read-export comparison-runs/my-comparison-01
```

完整冻结输入先按原字节核对；连接设置单独进入新报告。后续检查核实际请求的模型、地址和输入，再检查结构、覆盖、值、连续引用与汇总。CSV 导出不修正内容，另一个进程读回逐行比较；失败会保留具体原因。检查通过也不表示整项采用。

需要查看新比较页时：

```powershell
node template-comparison/prepare-comparison-page.mjs comparison-runs/my-comparison-01 public-my-comparison
python -m http.server 4358 --bind 127.0.0.1 --directory template-comparison/public-my-comparison
```

打开 http://127.0.0.1:4358/comparison.html。新页面目录不存在时才创建，课堂 `public` 不覆盖。只看课堂比较时直接把静态服务的目录改为 `template-comparison/public`。

## 失败处理

没保存共享设置时，共用入口会提示先打开请求观察室。连接失败、超时、模型拒绝或非法结果都保留在本次记录，没有自动重试；请求失败不能证明供应商未处理。认证头不写入请求记录。停止页面只结束自己启动的服务。
