# 课程实验

模型机制、请求观察与各章代码实践共用这个仓库。

所有实验共用根目录的 `pnpm-lock.yaml`，依赖只在根目录安装一次。

## 首次准备

安装 Node.js 24.13.1 或更高的 24 版本和 pnpm 11.20 后：

```powershell
git clone https://github.com/Ador-able/vibe-coding-course-labs.git
cd vibe-coding-course-labs
pnpm install --frozen-lockfile
```

## 使用

Windows 双击 **启动实验.cmd**；其他系统运行 `pnpm start`。打开 http://127.0.0.1:4318，选择本节实验。后续沿用这个目录和启动入口。

观察实验在页面选择条件并运行，回答与完整记录在本页查看。查看课堂实录不调用模型；自行生成会产生实际用量。

接口实验共用页面的“模型设置”。Codex 实验沿用本机已有登录与模型选择。修改代码、Git 和外部业务系统的练习按本章说明操作；命令可从根目录用 `pnpm lab chapter05 lab` 执行。

## 目录

- `labs/`：模型机制与请求实验，页面、源码和测试各自归位。
- `lessons/`：各章实践、共用原文和课堂实录。
- `shared/`：全局样式、导航、模型设置和实验运行界面。
- `src/`、`scripts/`：统一服务和运行工具。

修改源码后运行 `pnpm build`。保留启动窗口，按 Ctrl+C 停止。
