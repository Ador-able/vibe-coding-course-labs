# 提示模板完整任务比较

十份资料均为教师练习日报，无真实投放。两版各一次请求、无重试；字段值同口径，V1五处非连续引文与七项汇总不符，V2连续性成立却仍四项汇总不符；两版各四处预计数字证据不足。整项均needs_correction、未采用，六个标题待人。完整内容判断另附，计数不代替含义。

## 在自己的独立目录恢复

```plaintext
git clone --config core.autocrlf=false 课堂代码.bundle project
git -C project checkout --detach 618a3c09699a4a5aa106101be1f6e37149669f0e
node 复做材料零模型核对.mjs
```

代码原起点bfc0a4b，完成点618a3c09699a4a5aa106101be1f6e37149669f0e。课堂代码bundle含原起点与实际实现历史；请建立自己的练习分支，并确认恢复后的 project 本身是独立 Git 根。64工作原件也保留在“当前代码”，Git原blob与工作CRLF分别列在固定记录，不能把换行差异说成业务改动。冻结材料的原字节与七个新增程序LF由.gitattributes保护。

实际Node24.19.0、Python3.12.14，依赖已锁SDK7.0.122/provider3.0.59。需要运行只读页面时，在project按现有workspace正常安装一次：

```plaintext
pnpm install --frozen-lockfile
```

不需模型密钥，不重做旧八项和两条局部反馈。包内已保存全部新结果，复制到自己的项目：

```plaintext
Copy-Item -LiteralPath './实际结果/comparison-runs' -Destination './project/comparison-runs' -Recurse
Get-ChildItem -LiteralPath './实际结果/public' -File | Copy-Item -Destination './project/public'
python -m http.server 4358 --bind 127.0.0.1 --directory project/public
```

打开http://127.0.0.1:4358/comparison.html。依次V1R06/R09，再V2同两项及汇总/CSV。页面只读取现有comparison-state，不请求模型；停止自己的静态服务。已有十二份同流程JPEG与完整DOM对象在界面对照，实际1280×720/DPR1.25，未测窄屏。内容与各版口吻分别判断，原版可胜出。

## 阅读完整输入与当前保存结果

comparison-inputs中16份完整输入：原八项和旧输出/反馈属于历史；07为当前十项、08为不发送的独立参考、09为共同规则、10/11为两完整任务、13为唯一增加段。真正发送request-body/原HTTPresponse-body/SDK公开投影/原输出都在实际结果/comparison-runs/comparison-01各版目录。响应headers省略，没有Authorization。CSV只含11列，证据和汇总在原JSON，null字面按既定列解释，不数物理行。已在独立的无密钥进程完成完整读回。

## 自己重新比较时的入口

另恢复一份只有代码的新project（不要复制实际结果），仅在该进程引用自己合法DASHSCOPE_API_KEY。固定入口各一次：

```plaintext
node compare-templates.mjs
node inspect-comparison.mjs
python comparison-csv.py export
python comparison-csv.py read-export
node prepare-comparison-page.mjs
```

运行compare时两版串行各一次、maxRetries0；其后各入口不提供密钥。每阶段只创建新记录，已有结果目录会拒绝覆盖。供应商模型输出可能变化，本地请求失败也不证明供应商未运行。保留原失败，不自动补齐/纠正/追跑。重新比较是新的模型使用；这不是为复现课堂原答案而必须执行的步骤。本节已有运行的准确argv与完整终态在实际命令公共字段。

## 保留范围

真实业务原文字节不改；命令字段仅投影作者机器位置和pid。完整公开投影范围及原字节SHA见公共字段范围。原课与完整官方网页、内部审核、账户凭据不在包中；研究采用仅保留来源定位与编者取舍。图为关系说明，实际输出未用图中标签替换。
