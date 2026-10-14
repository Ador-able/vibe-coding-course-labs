# 青岚宗检索指标课堂算例

沿用已克隆的课程仓库。本目录用九份完整资料和六道题解释检索指标，输入、候选列表及相关性等级由编者给定，不是真实检索器结果。林青仍在同一青岚宗世界，藏卷楼支线独立于工作台的已存章稿。

先读input.json与actual-calculation.json。需要自己复算时，在本目录运行node calculate.mjs，结果另存my-calculation.json，不安装依赖、不调用模型。已有输出不覆盖；再次计算时指定一个新文件名，例如node calculate.mjs another-calculation.json。

计算保留短列表空位、无答案、模拟失败、完整标注池与RRF零分项的不同规则。输入字节与SHA以报告为准。
