# 文件内容先变成可追溯的资料

在 `project/` 中启动静态页：

```powershell
python -m http.server 4344 --bind 127.0.0.1 --directory public
```

打开 http://127.0.0.1:4344/。已有四份材料、完整读取记录和原页图像可直接查看，不需要安装解析器或重新生成文件。结束时在这个终端按 Ctrl+C。

需要亲手更换材料时，另建练习副本，再使用 `requirements.txt` 和 `scripts/` 中的生成、读取程序。已有课堂记录保留在仓库的 `materials/`；自己的新记录与原件分别保存。
