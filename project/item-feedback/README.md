# 批量执行要保存每一项的状态

先在 `project/item-feedback/public/` 查看已有结果，无需安装项目依赖或调用模型：

```powershell
python -m http.server 4357 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4357/index.html`，按课程步骤回查完整输入、结果与检查状态。

需要亲手运行新材料时，再在 `project/` 执行 `pnpm install --frozen-lockfile`，使用本节给出的共用入口和独立结果目录。沿用请求观察室已保存的 OpenAI 兼容设置。

完整输入、历史结果和说明位于仓库根的 `materials/`；本课 Git 节点见 `github-nodes.json`。
