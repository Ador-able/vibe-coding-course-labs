# 青岚修仙录：保存调查

沿用课程仓库的一次准备：在根目录`pnpm install --frozen-lockfile`、`pnpm build`，之后进入`qinglan/chapter15/project`。资料与完整实录随Git保存，不用下载实验附件。已有各章依赖与登录继续沿用。

运行`pnpm lab`，打开`http://127.0.0.1:4364`。一个选择控件、一个“查看结果”，五节共用完整课堂记录；页面只读取本地文件，不调用模型。当前尚未保存新实录时会显示空状态。

自己的工作台先运行`pnpm practice:seed`初始化新的独立SQLite和完整三章，再运行`pnpm prototype`，打开`http://127.0.0.1:4365`。它使用第十章已有单一界面、Store和HTTP。三章来自10231字节的既有课堂存档，本次初始化为新作品、三章human/draft r1；原r3历史与模型任务不复制，human不表示正式采用。

课堂实录和自己的操作要分开。先保存自己的改动，再从`qinglan-ch15-practice-start`另建个人分支：`git switch -c qinglan-my-ch15 qinglan-ch15-practice-start`。该点保留最终稳定源码与完整材料，`records/index.json`为空。个人运行用新的UUID或记录名及独立SQLite；已存在的目录不会覆盖，课堂end原件可从Git回查。

五节各有准确start/end，见`inputs/五节Git与实测计划.json`。前三章完整教师输入、独立A和键盘补记均在`inputs/`。当前应用已暂停保存/读回等待期间的编辑；需要对照历史缺陷时，只在自己的独立恢复副本运行`node scripts/restore-historical-bug.mjs`，它只恢复实际旧setBusy/render行为。历史原源码与SHA在`materials/historical/`，这不是当前正确应用仍有问题。

本章沿用官方Codex SDK/CLI0.160.0和既有本机登录；私有`CODEX_HOME`只复制登录与模型选择，不复制用户规则、插件或记忆。配置、会话及认证只在Git忽略的`runs/private-codex-home`。规则来源按原生实际返回记录，不套用其他版本的加载结果。`host:check`只查目录；`rules:observe`只创建三空会话，无模型任务。

亲自调查或改代码时，把`inputs/`中当前完整提示交给已经使用的编码助手即可。先保存自己的源码改动，再按本节Git起点开始，保留真实Diff、结果与未完成条件。

需要按课堂原生条件复做时，运行`node scripts/observe.mjs task investigation --record investigation-01`。它核当前源码与输入SHA，记录实际Git与完整原答；规则任务用`task rules`，测试任务用`task tests`，原生评审用`review`，交付任务用`task delivery`。命令会发送一次实际模型任务，不自动重试或续发；一次客户端任务不等于一次底层调用。

170与177的前置索引要在本节开始前填入实际旧点/正确点、完整原记录路径和SHA并标为ready。未准备时模型入口拒绝执行。换材料须先同步原件/参考与索引，再`node scripts/freeze-inputs.mjs`、`pnpm source:freeze`、`pnpm source:check`，提交新的真实起点，用新记录名运行。原失败和已有原答不改写。

正常保存与服务收到请求前abort使用同一完整预期，实际浏览器请求门只延迟真实POST/GET；实际输入用正常键盘，不伪造响应或越过disabled。页面/请求/数据库当前和历史、环境与清理各有记录。服务已经保存后GET失败、真实并发、审美和文学采用若未运行就保持未验证。Git交付只检查一个正常保存实例；Hook启用、完整暂存对应和真实提交需另核，PR YAML尚未运行就不称CI通过。

Node/SQLite、Windows既有Edge与本地Codex宿主仍是实际运行前置。观察器在超时后请求一次原生中断，终态未知就保留未知；它不保证只读沙箱绝对阻止目录外读取，实际命令和任务范围仍要核。模型写的测试或交付代码先静态核读，再执行真实检查；单凭聊天结束或构建不能代替业务验证。
