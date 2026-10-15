# 凡人原文资料工作台

沿用仓库根已完成的一次安装与构建。进入本目录，双击启动实验.cmd，打开[工作台](http://127.0.0.1:4352/)。读取、切块、检索、更新和评估共用一个服务；默认只读取已保存实录，不会调用模型。端口被占用时，在本目录执行 `$env:LAB_PORT=4353; node server.mjs`。

完整C05原文用于PDF和切块；C01—C30每份至少2000汉字原文、选拔与入谷大纲和设定进入检索输入。大纲与设定标为编者归纳，不能替代原文。C04更新只是将阅读范围从前段补齐全文，不改原著。

原件在public/files，完整读取与后续模型记录在public/records。原页以320DPI保留；未提取到文字的页保留位置和图像。本轮没有OCR。公开记录不会保存凭据。

## 可选：重新请求

沿用请求观察室已保存的本机共用文字与向量模型设置，不需新增.env或登录。每次使用新的记录名；下面各条件只请求一次，不自动重试。先核inputs中的完整输入与冻结清单，按顺序执行：

```powershell
node scripts/observe-answers.mjs my-chunk-answers
node scripts/observe-embeddings.mjs my-embeddings
node scripts/rank-retrieval.mjs my-retrieval
node scripts/prepare-update.mjs
node scripts/observe-update.mjs my-update
node scripts/evaluate.mjs
```

回答和向量原样记录实际输入、返回、HTTP次数与模型结束原因。失败时先读本次记录，不覆盖或挑选另一次答案。新增向量须与前轮使用同一模型和服务；不满足时停止。

PDF原件、页图与读取记录已经提供，学生无需安装Python或重新生成。维护者需要重新制作原件时，可按requirements.txt使用现成PyMuPDF；生成脚本拒绝覆盖已有原件。
