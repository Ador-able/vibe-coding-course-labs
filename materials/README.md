# 用AGENTS.md说明项目规则：练习材料

本练习在已有小说工作台中整理项目与目录约定，观察规则来源、条件参考读取与一次真实只读调查。小说仅作AI协作材料。原版、台面、笔记页保留相同业务；这份练习没有重新设计、渲染或选择界面。

## 恢复固定材料

需要现有Node.js与Git。本节只读调查不需要安装应用依赖、构建、启动HTTP或打开业务数据库。

请把ZIP解压到新的短目录，例如D:/Lab/rules-package；不要放进已有项目后直接使用父项目HEAD。ZIP中有公开交付Git bundle和材料目录。先从bundle建立独立公开Git根，再恢复应用自己的Git根：

```powershell
git clone --config core.autocrlf=false D:/Lab/rules-package/vcm-09-06-公开交付.bundle D:/Lab/rules-lab
git -C D:/Lab/rules-lab checkout --detach vcm-09-06-public-end
git -C D:/Lab/rules-lab status --porcelain=v1 --untracked-files=all
Set-Location D:/Lab/rules-lab
node tools/复做材料零模型核对.mjs
```

第三条应为空。最后一条只创建此前不存在的project目录，恢复应用并逐项核166个文件、三份教师输入与三份规则/参考；不会启动Codex、请求模型、安装依赖或运行应用。已有project时会停止，避免覆盖自己的改动。公开交付标签start与end指向同一份完整材料；零模型恢复后project是公开仓库外的新独立Git目录，不把它误认成课程发生了应用改动。

应用原起点为0cb480c4f2fc4acf680d7581617106f85473b28c；教师规则起点及本轮调查完成点均为74c566efe2b6ee084e6d2835bbacaa88e1e1edeb，标签vcm-09-06-rules-start。两点之间只替换根AGENTS，加入prototype/AGENTS与docs/ui-comparison，其余163项原Git文件保持。bundle含上述自主应用及教师规则；没有第三方研究全文。

## 开展自己的新调查

使用自己已可用、已登录的成熟编码助手，从project/prototype开始新会话，核对当前宿主对项目/目录约定的加载方式；把prompts/整页方案只读调查.txt的完整提示交给它。保持同一教师输入和只读范围，保存实际读取与回答，再区分来源、读到正文与后续符合。

本章历史宿主为Codex0.160.0，固定官方源码commit a956835d020762cb2b570053af06f643a11c0ecc；模型gpt-6.1-sol。历史用户规则来源仍存在，正文没有公开。三空会话目录对照保存在runs/preflight-01；唯一自然任务保存在runs/rules-task-de791888-a661-48a0-abc1-34c086f2b380。

scripts/与config/保留当次完整观察定义。其中官方安装入口、本机路径、停用目录和审核文件属于历史实验条件；runs中的两份review公开副本approvedBy为null。不要直接执行旧观察器以冒充本机已审核、也不要复制作者身份或全局配置。复做者使用自己的宿主与合法配置，新增会话的来源与行为另行记录，不能把此包中的历史结果写成新机器已经发生。

教师快照来源.json说明三章材料记录于2026-10-02T21:44:09.321Z，来自既有存档人工初始化的完整对象。本章没有重新获取GET、初始化业务或写入Store。五表只读基线是教师材料，表数量1/1/3/3/0；完整正文与状态在当前作品完整对象.json，不以计数替代阅读。

## 阅读实际结果

自然任务一次turn/start，10次命令，无MCP业务调用或Hook；第2次搜索不存在的目录退出1，任务仍正常completed。完整参数/返回在complete-commands.json，原回答3939个UTF16字符在final-response.txt。166文件、三输入与工作区前后相同。

原回答有两处链接定位偏差：prototype-http.ts:18是GET，human草稿保存实际23–24；app.js:15是readCurrent，保存POST与读回GET实际17。原回答保持原文，不能把主要结论正确说成每条链接都精确。

代码、规则和完整参考确实读到了；回答把功能与状态、操作辨认、整页审美分开，并说明未运行范围。新规则和新任务同时变化，又有原有用户规则等条件，没有无规则模型对照；不证明规则独立带来改进，也不证明界面或文学质量通过。

协议记录是必要公开投影：教师输入、公开来源路径、工具参数/完整产物、公开回答及运行终态保留；模型推理、压缩上下文、身份、受保护宿主指令及私有记忆正文不收录。没有读取用户规则原文，也不把该投影称为完整私有rollout原字节。

## 文件与来源范围

teacher/保存三份完整教师约定与参考；inputs/保存完整作品、五表快照及来源；fixtures/保存应用bundle与精确清单；runs/保存实际公开过程；visuals/保存原创解释PNG与完整提示；research/仅保存编者取舍、原课阅读位置和官方精确链接。完整第三方课程字幕、HTML、官方网页与源码研究快照留在内部来源，不随包重新分发。

文件SHA清单与公开固定提交见ZIP中的固定记录.json。应用bundle的Git原件为LF，本节教师文件及运行快照也是所核原字节；读者若启用自动CRLF转换，应把换行差异与内容差异分开，不声称SHA相同。这里clone显式使用仓库局部core.autocrlf=false，不改全局配置。
