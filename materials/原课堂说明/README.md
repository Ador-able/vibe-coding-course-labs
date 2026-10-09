# 文件内容与原页回查

本练习使用PyMuPDF读取固定PDF的文字、版式块和页图像。页面只查看已有JSON和原页，不调用模型、OCR或向量库。小说是完整练习资料，分页、页眉和便签是教师构造，正文尚未由人决定采用。

## 查看附带实际材料

将资料ZIP解压到一个不存在Git父目录的新目录。终端进入包内“练习”，恢复包内Git的两个标签并保留附带原文件：

```powershell
git init
git fetch ../资料代码.bundle refs/tags/vcm-05-01-start:refs/tags/vcm-05-01-start refs/tags/vcm-05-01-end:refs/tags/vcm-05-01-end
git reset --mixed vcm-05-01-end
git rev-parse HEAD
python -X utf8 -m http.server 4344 --bind 127.0.0.1 --directory public
```

浏览器打开http://127.0.0.1:4344/。Python静态服务是标准库能力，查看附带结果不需要安装PyMuPDF，也不需要重跑生成或读取。端口占用时为自己的服务选择空闲端口；结束后在启动它的终端按Ctrl+C。

输入“还不知道”，在文字版命中回查第2页；切到中页扫描版，保留相同查询，查看未命中、缺口和真实原页。改便签版查“保留记号”，区分完整便签与正文；错误文件保留查询、原异常及未知页数。切换原版/台面/笔记方向，不重新读取PDF。

## 固定原件与实际记录

本轮原读取执行点是edd22cef42a0d900b0e75a31080530e784fca584，使用Python3.13.11、PyMuPDF1.27.2.2。读取UUID为bf29c1f7-44aa-43ac-a81e-263899ece86d；完整返回在public/observation.json，记录目录有同字节副本、全部物理页PNG。public/fixtures.json保留四份原文件字节和SHA。

文字版和改便签版三页都有文字；中页扫描版的第2页text为空，仍保留物理页2、原页、缺口，第3页不前移。错误文件40字节不是PDF，打开失败；pageCount为null，不是0页成功。25段正文全部保留，换行来自真实版式提取，不能把换行差异改写为原字符缺失。

位置包含docId、fileSha256、parseProfile、physicalPage和blockNo。bbox帮助回原页；版式块可能拆开一句话，不是语义块。此轮全部页旋转0，未验证任意旋转、多栏或跨页表格。文件SHA指认准确字节，不判断文学采用或索引已更新。

## 自己构造一轮

先用独立新目录从起点建个人分支，不在附带实际原件目录覆盖输入：

```powershell
git clone --branch vcm-05-01-end ../资料代码.bundle 新实验
Set-Location 新实验
git switch -c my-material-experiment
```

起点供观察新增文件，完整可运行代码和固定输入在vcm-05-01-end。Git中不包含附带的已生成public/files与观察输出，所以这一新实验目录不会覆盖课程原件。要求Python3.10以上，在本练习目录创建虚拟环境并安装唯一固定依赖：

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -X utf8 scripts/build_inputs.py
.venv/Scripts/python.exe -X utf8 scripts/read_material.py
```

生成器拒绝覆盖已有public/files。读取器每轮生成新UUID，保留完整异常/原页并写页面快照，没有自动重试/OCR/模型/业务保存。自己的PDF封装字节及SHA以新轮记录为准；不能借旧SHA代表新生成文件。需要文字/原图之外的能力时，另按任务核对成熟工具，不把空文字页补造为识别成功。

## 页面观察材料

“页面观察”目录包含36组合的完整状态字段、实际下载/失败记录以及40幅采用的主工作区/必要末段JPEG选录。CSS视口为1280×900或390×844，缩放1；JPEG实际像素尺寸另列于采用索引，不把选录叫一张全页图。早期整页截图接口超时和连续滚动像素不稳定保留说明；未采用的连续分段图不全部公开，原始文件长度/SHA及遗漏范围在公开成员对应表中。完整JSON由实际DOM和下载原字节核对，不以逐屏截图代替。

方向口吻由使用者选择。原版桌面便于并列回查；台面让主体集中但原页更窄；笔记页连续阅读但原页更远。长记录展开、扫描缺口和错误仍保留，不靠删数据改善观感。

公开JSON对Windows用户下载路径作窄投影，字段位置与原长度/SHA可查；其余应用状态、事件及返回不补造。第三方原课/官方全文、宿主私有资料和编纂评审不在包内。固定成员清单列每个交付文件长度/SHA；Git恢复只恢复源码与附带资料，不恢复模型会话或外部状态。
