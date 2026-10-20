# 保存提交检查

`check:delivery`只构建本章，并检查一个正常保存实例。它使用同一完整三章与独立预期，验证保存前的完整A、POST等待、GET读回等待、恢复编辑、刷新和五表历史。每次使用新的实验目录、SQLite和本机空闲端口。

三章来自已有课堂存档，初始化为新作品与三章`human/draft r1`。键盘补记是测试输入；保存成功和程序检查不表示第二章已正式采用，内容决定仍由负责人作出。

## 运行入口

沿用课程仓库的一次安装与构建准备。进入`lessons/chapter15/project`后运行：

```sh
pnpm run check:delivery
```

入口依次执行本章构建和`node --test scripts/check-saving-delivery.mjs`，构建失败便停止。直接运行Node测试需要已有相应`dist`。

默认使用Playwright Chromium。在课程根准备浏览器一次：

```sh
pnpm --dir lessons/chapter15/project exec playwright install --with-deps chromium
```

Windows已有Edge时，可以明确选用它：

```powershell
$env:DELIVERY_BROWSER_CHANNEL = 'msedge'
pnpm run check:delivery
```

浏览器启动失败会保留环境错误，不自动换浏览器或重跑。

## 保存检查与原件

程序从`inputs/完整教师初始化.json`初始化完整作品和三章，从`inputs/独立业务预期.json`取得完整A及键盘补记。原始存档在`inputs/凡人修仙传-三段原文.json`，各原件字节与SHA可从输入清单回查。

两个请求门只延迟真实POST与随后的GET，放行使用`route.continue()`。等待时通过正常鼠标和键盘尝试输入，核对章名、正文、覆盖编辑、保存和导航状态。POST事务保存后，GET与刷新继续核对完整A；只有第二章增加一次草稿修订，其他正文与原历史保持。

每次记录在`runs/delivery-saving-UUID/`，其中`record.json`保留完整输入、页面、实际请求响应、当前对象、五表原始列、历史和分类错误，`practice.sqlite`保留独立实验库。先完成观察与清理，再统一汇集断言。

这个入口只检查正常保存。服务前abort的课堂实录单独保留；服务提交后GET失败、真实并发、页面辨认与审美须另行验证。

## 启用Git钩子

在自己的课程clone里启用一次：

```sh
git config --local core.hooksPath .githooks
```

钩子使用LF行尾并提交为`100755`，从实际Git根调用本章`check:delivery`。准备完整候选时登记并核对执行模式：

```sh
git add -- .githooks/pre-commit
git update-index --chmod=+x .githooks/pre-commit
git ls-files --stage -- .githooks/pre-commit
```

最后一条输出的模式应为`100755`。Unix工作文件还需可执行权限。

钩子检查工作区。提交前须完整暂存本次候选，确认未跟踪文件无遗漏，并逐项核对工作字节与index里的实际内容一致。暂存后又改了工作文件，就重新核对。部分暂存不能直接沿用这一条件。

检查非零时，钩子的`exec`把失败传回Git，本次候选提交被拒绝；候选和检查记录继续保留。

## PR配置

`.github/workflows/chapter15-delivery.yml`仅定义本章相关路径的`pull_request`检查，使用`contents: read`。它依据`inputs/CI官方版本与范围.json`准备既有Node、pnpm、锁依赖和Chromium，再运行同一个本章入口。

配置尚未在远端运行。实际执行后，核对事件、PR head/base、事件SHA、真实检出HEAD、工具版本及检查退出码，并读回artifact中的完整记录。`if: always()`会尝试保存证据；安装或构建提前失败时可能还没有运行目录，取消或上传失败也可能无法取得artifact。

## 失败与代价

环境、观察、记录和清理错误分开保留。finally放行请求门、关闭页面与浏览器、关闭HTTP、取最终五表并关闭Store；放行可能让已在等待的保存完成，因此清理后仍要读回数据库。清理失败和未完成步骤都使检查失败。

程序不覆盖失败目录、不删除证据、不自动重试。先保留终端、完整`record.json`和实验库，再根据实际进程、端口与清理记录处理残留资源。

每次检查的代价是本章构建、一个真实浏览器和完整证据的磁盘占用。依赖与浏览器准备可复用；实际运行时间以本次回执为准。
