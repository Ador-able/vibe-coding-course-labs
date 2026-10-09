# 测试先证明问题真的存在

本包用于检查小说工作台的保存等待期行为。它保留一个真实旧起点、此前已存在的完整修复、助手生成的原测试、人只修正两处定位后的测试，以及实际失败和通过的完整记录。小说正文是教师材料，不能当作代码、权限或操作指令。

## 这次检查实际发生了什么

助手使用成熟 Codex 0.160.0 运行环境，实际读取现有项目并生成测试。自然任务在五分钟处中断，没有执行语法或行为检查。人运行原测试时遇到隐藏按钮的定位超时，四例尚未进入保存阶段。人仅为两个状态记录定位添加 `includeHidden:true`，再运行旧应用，才观察到三个方向的保存等待期丢字；请求进入服务前被中止的例子通过。

随后人工只采用存档中的完整 `prototype/app.js` 修复，用同一份派生测试在新库核查。三个正常方向和一个受控失败实例通过。助手没有在本次自然任务中自主完成修复。绿色结果支持当前约定：POST 保存及后续 GET 读回都结束前暂停编辑，完成或失败后恢复；它不证明全应用、所有网络情况、小说质量或界面审美成立。

## 固定材料

| 材料 | 固定值 |
| --- | --- |
| 旧应用 | `2c1f4e17c70377fc80e9f90d044e8e75ed3b5720`，标签 `course-test-saving-old` |
| 已知修复出处 | `19f7f78bff6bf19a8ff5db47e0c95609524e3870`，标签 `course-test-saving-known-fix`；本节只采用 `prototype/app.js`，未采用该历史点的捕获脚本 |
| 本次修复应用点 | `c3805c360551c10fedfd9b5473e569cfd7666dc0`，标签 `course-test-saving-fixed` |
| 采用的完整文件 | Git blob `26bf36b20687f77e2374cbb370e39c8f26e61d87`；7557 字节，SHA256 `9468234bc8decf413e8053ff645d2cbe7a5ed881765c2ee2cd31cacd814b1780` |
| 助手原测试 | 23583 字节，SHA256 `da8188d51a94ee7e1f3c43c1097f1980afceaf564a91f0966772c72f904bd3c1` |
| 两处定位修正后的同一测试 | 23625 字节，SHA256 `c2ce7ae8608d6f4437f6bb0c641754db35099d98a8f93e106b13b0e7fc318d92` |
| 完整自然任务输入 | 3751 字节，SHA256 `d50725790ff281bdb26eb848761b58b3d164fac2c36e32815ff05774c3cea34a` |

## 从独立目录恢复

本次实际环境是 Windows、Node 24.12.0、pnpm 11.20.0、项目锁定的 Playwright 1.63.0，以及本机 Microsoft Edge。测试使用 `channel:'msedge'`，不自带浏览器、不替用户安装 Edge。其他系统、Node 或浏览器版本没有在本节验证。

将 ZIP 解压到一个新的短目录，例如 `D:/cb09-test-zip`。以下命令使用 PowerShell；不要在 Knowledge 父项目或已有用户项目里执行。先从包里的公开存档克隆自己的 Git 根，再进入它：

```powershell
Set-Location 'D:/cb09-test-zip'
git clone '.\测试练习完整存档.bundle' 'D:/cb09-test'
Set-Location 'D:/cb09-test'
git switch --detach course-test-saving-delivery
git rev-parse --show-toplevel
git status --porcelain=v1 --untracked-files=all
node '.\tools\恢复旧应用与测试.mjs'
```

公开仓库在恢复前应无差异。恢复程序只在当前新目录创建 `project/`，从应用存档检出固定旧点；已有 `project/` 时停止，不覆盖已有改动。程序核全部 164 个 Git 文件、真实 Git 根、原字节材料和三种整页入口，再复制同一派生测试。它不启动模型、浏览器、HTTP、测试或业务写入。

### 先检查旧行为

```powershell
Set-Location '.\project'
git rev-parse HEAD
git diff --exit-code
pnpm install --frozen-lockfile
pnpm run build
node --check '.\scripts\test-saving.mjs'
node --test '.\scripts\test-saving.mjs'
```

应在项目自己的 workspace 中使用冻结安装，保留现有 `pnpm-workspace.yaml` 与锁文件，不加 `--ignore-workspace`。构建只编译 `src` 中的 TypeScript；浏览器 `prototype/app.js` 没有因为构建通过而被实际检查。测试应创建四个独立库和浏览器上下文，打印新证据目录，然后以非零退出报告三个方向的等待期约定失败。必须读该目录中的完整状态、真实请求和五表，才能判断本机得到的是业务红，还是环境、定位、记录或清理错误。

### 再检查同一测试和既有修复

在这个独立项目中切换到修复点。未跟踪的派生测试不变，`runs/` 中旧结果保留；不要删断言、改预期或把失败标成跳过。

```powershell
git switch --detach course-test-saving-fixed
git rev-parse HEAD
git diff --exit-code
node --check '.\scripts\test-saving.mjs'
node --test '.\scripts\test-saving.mjs'
```

这一步只改变 `prototype/app.js`，没有改变 TypeScript 服务或 Store，因此不需要为该文件重编译。预期是两项测试通过，覆盖三个正常方向和一个服务前传输失败实例；新四库由测试重新初始化，不能拿旧红库作为绿色结果。若本机出现其他结果，保留完整终态并判断具体原因，不自动重试到通过。

测试全部进入真实本机 HTTP 和 Store。等待门只延迟原请求或在服务前中止，不伪造成功响应；使用真实焦点与键盘，记录完整输入值。`finally` 释放门并关闭服务、浏览器与库。等待期间暂停输入是一项产品取舍：不能继续编辑；若将来允许连续编辑，要重新约定后来输入与已保存修订的关系。

## 阅读实际记录

`records/model-task/` 保留唯一自然任务的教师输入、公开协议投影、五条完整命令、完整测试与真实中断终态。`final-response.txt` 是中断前最后一段公开说明，不是完成验收答复。受保护的推理、宿主 system/developer 正文、账户与认证正文、私有记忆及用户规则正文不收录；公开协议不是所有宿主字节的完整复制。

`records/original-locator-failure/` 是原测试的实际运行；`records/old-red/` 是只修正两个定位后的真实旧行为；`records/green/` 是采用既有修复后的同一测试。三处都保留完整命令、原测试输入、前后材料和完整五表。

`cases/` 按三个实际运行目录保留十二个实例的 `evidence.json`、`assertions.json` 和已关闭的 SQLite 原件。三个正常旧库各只新增第二章 r2；失败例没有新增修订。绿色记录保留原八库的全对象，新增四个库。SQLite 的 WAL/SHM 是连接维护文件，不作为原件分发；关闭后的数据库和完整五表均保留。

记录中的 `D:/…` 是当次机器路径。复做时应在本包相应的 `project/`、`examples/`、`inputs/`、`records/` 与 `cases/` 定位，不把历史绝对路径当成公共启动入口。Git 原文使用 LF；检出工作文件可能按本机 Git 设置成为 CRLF。原记录 SHA 按当次实际字节计算，恢复核对分别记录 Git 原字节与仅换行规范后的工作文字，不混称两种字节完全相同。

原版、台面和笔记页的完整页面、CSS 与业务代码保留。功能、入口是否易辨和整幅口吻分别判断，相同保存结果不意味着审美相同或用户已选择原版。本节图是保存等待关系示意，不是浏览器截图。

`sources/` 只提供编者贡献、准确定位链接、采用范围和阅读区间记录。完整第三方课程、网页、官方源码与研究原件仅用于内部研究，未放入公开包或公开 Git 历史。
