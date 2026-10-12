# 切块要保留一段话的完整意思

在 `project/` 中启动静态页：

```powershell
python -m http.server 4345 --bind 127.0.0.1 --directory public
```

打开 http://127.0.0.1:4345/。已有小块、原页和四次真实回答可直接查看，不需要安装依赖或配置模型。结束时在这个终端按 Ctrl+C。

亲手改变切分时，再按锁文件准备依赖，运行 `pnpm chunks:observe`。它不调用模型；保留原记录，核对新块与旧回答是否仍对应。

需要研究新回答时，从仓库根使用 `node scripts/run-lab.mjs project scripts/observe-answers.mjs`，沿用请求观察室的模型设置。这个操作会产生真实调用，默认查看无需执行。
