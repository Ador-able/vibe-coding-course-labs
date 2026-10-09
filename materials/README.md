# 流式输出完整练习材料

本包把两轮既有模型输出交给成熟 SDK 重新读取，观察增量、完整消息快照、进度和结束边界。历史原件、零模型读取、浏览器回放和教师卡分别存放。不需要模型凭据，不调用模型或保存业务对象。

## 独立恢复回放页

需要 Git、Node.js24.12.0及pnpm11.20.0。依赖按现有锁文件联网安装，包不含node_modules。先解压本包到一个独立目录，再在该目录打开PowerShell。下列两个项目目录必须是新目录，不在已有项目中复用。

```powershell
git init 回放项目
git -C 回放项目 fetch ../流式回放页面.bundle refs/tags/vcm-04-02-replay-start:refs/tags/vcm-04-02-replay-start refs/tags/vcm-04-02-replay-delivery:refs/tags/vcm-04-02-replay-delivery
git -C 回放项目 switch --detach 601a3fbe5849875c8324d4b2d816ede7f97e20ff
git -C 回放项目 rev-parse --show-toplevel
git -C 回放项目 rev-parse HEAD
Set-Location 回放项目
pnpm install --frozen-lockfile
pnpm streaming:replay
```

HEAD应为601a3fbe5849875c8324d4b2d816ede7f97e20ff，Git根应为刚建立的回放项目。打开http://127.0.0.1:4332/streaming.html。这里仅启动静态页面，不启动实时模型服务。不要运行streaming:dev来完成这个离线观察。

选择完整记录，点击“回放选中记录”，先看摘要结束以后问题仍在到达。读完再选择中途停止记录，检查第二项“2. 与”、未知用量和缺失finish。展开记录可看全部事件、原始请求和本次完整消息快照；两个下载分别给历史原字节和本次实际观察。

切换原版、台面、笔记页使用同一个对象，不重新消费。“下次回放”只决定下一次输入，可以保持当前停止记录的显示。页面120毫秒间隔是展示节奏，表中历史毫秒来自原件；不能把二者用于比较模型速度。本次停止只中止本地读取，不修改历史状态。加载失败保留真实异常，有前次对象时仍可查看上一份；本页没有自动重试或刷新恢复。

## 用固定31209环境运行Node读取

已有完整106个快照无需重做；需要亲自观察时，在本包目录另建一个固定项目。它与上面的回放页不是同一个HEAD：

```powershell
git init SDK读取项目
git -C SDK读取项目 fetch ../流式回放页面.bundle refs/tags/vcm-04-02-replay-start:refs/tags/vcm-04-02-replay-start refs/tags/vcm-04-02-replay-delivery:refs/tags/vcm-04-02-replay-delivery
git -C SDK读取项目 switch --detach 31209d553e6b95af2f1ac1055fc6de5d08e22a36
git -C SDK读取项目 rev-parse --show-toplevel
git -C SDK读取项目 rev-parse HEAD
Set-Location SDK读取项目
pnpm install --frozen-lockfile
Set-Location ..
node ./拟用记录器/读取已有消息流.mjs ./SDK读取项目
```

记录器要求提供目录本身为Git根，HEAD严格等于31209，SDK为7.0.122，输入两文件SHA正确。它只消费已有UI事件，输出到零模型记录/新UUID；不导入模型或Store。读取失败、实际比较false和已读快照均保存，不补写或重试。不要把该脚本指向601a的回放页检出。

## 文件与观察范围

拟用完整材料/01、02是原字节历史，UUID分别为1153e17e-e0b4-4870-978f-bf0eca94b0fb、f7f927eb-9faa-49d4-af68-fe3429ed2e67；历史执行点d966a050551e0dab7bf7e21ba1924c32baeb5986。它们后来归档在31209中，不能说证据文件当时就在执行提交。03为完整纪要，04为四份完整阶段请求与正文，05为原事件投影，06/07/08为教师构造对照、检查Prompt与未运行小说迁移卡，09为真实SDK完整快照选读。

零模型记录/a8f5c50a-71ee-4dd9-93b6-ba853dbafb83包含全部106快照、原输入、传入事件、索引与比较。两轮运行时整体严格比较均false，正文比较均true；导出JSON后可见最后消息值相同。没有足够未序列化对象信息定位false原因，不用假设解释它。

页面实际记录/6dd2e9b3-9b53-4c40-b3c2-c8bc6cdb012a对应9014完整三方向链，104项通过、33张图；df6233原先探针在隐藏选择器处超时，已收材料保留，不能称完整链通过。页面最终像素/713ea14c-0126-4e3e-9329-690bdac7bce4对应add1：底色、同对象、下次选择、有前次失败条件通过，17张图；最后无前次失败仍显示载入中，整体运行未完成。a8bc76fb为探针错误选择器导致的初始失败，无业务观察。页面失败提示最终核/9fe6ef63-4677-43d0-8aaa-45f9113b1284对应601a，只核两种主提示、原异常、前次对象与重新读取入口，7项通过，两张图。各自原件保留，不把它们说成全部在最终点重拍。

页面源码完整差异与七份Git原字节在页面最终固定实现-601a3fb；固定页保留原历史事件、用量、半句及含义偏差。本包提供实际结果，不保证再次读取的随机UUID、时间或运行时对象性质完全相同。它没有验证网页刷新续接、HTTP恢复、数据库保存、人工采用或文学质量。

公共Git仅含公开31209祖先及这份回放页；第三方课程与官方文档全文不在包中。材料清单列每个文件的完整字节SHA，便于核对下载与恢复。
