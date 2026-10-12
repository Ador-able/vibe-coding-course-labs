# 关键词和向量检索可以一起用

在 `project/` 中启动静态页：

```powershell
python -m http.server 4346 --bind 127.0.0.1 --directory public
```

打开 http://127.0.0.1:4346/。已有候选、向量、原文和原页可直接查看，不需要安装依赖、配置模型或重新请求嵌入。结束时在这个终端按 Ctrl+C。

需要用已有向量重算排序时，再按锁文件准备依赖，让编码助手运行 `pnpm retrieval:rank`，传入仓库 `materials/实际记录/embeddings-e273a2bf-4aed-4c2e-bb5d-21a6fb3da732/report.json` 的实际路径。它只计算已有向量，不请求模型；保留原记录和新结果。

更换资料后确需新向量时，从仓库根使用 `node scripts/run-lab.mjs project scripts/observe-embeddings.mjs`，沿用请求观察室的服务和向量模型设置。这个操作会产生真实调用，默认查看无需执行。
