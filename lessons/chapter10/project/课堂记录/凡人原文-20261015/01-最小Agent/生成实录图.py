from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont
out=Path(__file__).parent
a=json.loads((out/'独立核对.json').read_text(encoding='utf-8'))
font=lambda size:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)
blue='#315f91';ink='#20384f';muted='#607991';border='#cfdeea'
def wrap(draw,s,f,width):
    rows=[];line=''
    for c in s:
        if c=='\n': rows.append(line);line='';continue
        if line and draw.textlength(line+c,font=f)>width: rows.append(line);line=c
        else: line+=c
    if line: rows.append(line)
    return rows
def text(d,s,x,y,size=46,width=2368,color=ink):
    for row in wrap(d,s,font(size),width): d.text((x,y),row,font=font(size),fill=color);y+=int(size*1.6)
    return y
def begin(title,meta):
    im=Image.new('RGB',(2560,2600),'#f7f8fa');d=ImageDraw.Draw(im)
    y=text(d,title,96,55,68,color=blue)
    y=text(d,meta,96,y+8,38,color=muted)
    return im,d,y+36
images=[]
im,d,y=begin('从凡人大纲到真正保存的一章','2026-10-15 实测 · 《凡人修仙传》C03 原文导入 · 提交 18a7011')
rows=[
    ('实际动作','真实结果'),
    ('读取作品资料','完整三段大纲、人物设定与规则，资料 r1'),
    ('查询目录与目标章','目录 []；第 1 章为 null，正文基线 0'),
    ('调用 save_draft','C03 全文保存为第 1 章 r1 · agent · draft'),
    ('再次读取正文与目录','完整正文、保存返回及 SQLite 对象相同'),
    ('人在工作台校订一字','仅“做→坐”，保存为 r2 · human · draft'),
]
for i,row in enumerate(rows):
    widths=[680,1610];height=max(len(wrap(d,s,font(44),w)) for s,w in zip(row,widths))*71+34
    d.rectangle((96,y,2464,y+height),fill='#eaf0f6' if i==0 else 'white')
    text(d,row[0],118,y+15,44,680,color=blue if i==0 else ink)
    text(d,row[1],820,y+15,44,1610,color=blue if i==0 else ink)
    d.line((96,y+height,2464,y+height),fill=border,width=2);y+=height
y=text(d,'一次正式模型任务：26 条 SDK 事件、4 次成功命令、6 次 MCP 调用。',96,y+32,43,color=blue)
y=text(d,'导入正文 2,371 个 Unicode 码点、2,036 个汉字。原文与模型保存 r1 逐字相同；人的 r2 仅一个字符不同。',96,y+16,43)
y=text(d,'原作出自忘语。agent 标记保存入口，不能把原文导入称为 AI 原创。r1 和来源文件保持原样，r2 仍待人判断。',96,y+16,40,color=muted)
y=text(d,'真实记录整理图 · 直接以 2560 像素排版实录，不是浏览器截图。',96,y+24,34,color=muted)
im=im.crop((0,0,2560,y+55));im.save(out/'原文导入与真实保存.png');images.append({'file':'原文导入与真实保存.png','width':im.width,'height':im.height})
im,d,y=begin('人改一个字，工作台留下两个版本','真实页面编辑与保存 · 原文 r1 保留 · 人工校订 r2')
model=(out/'模型导入完整正文.md').read_text(encoding='utf-8')
human=(out/'人工校订完整正文.md').read_text(encoding='utf-8')
old=next(line for line in model.splitlines() if '一屁股做了下来' in line)
new=next(line for line in human.splitlines() if '一屁股坐了下来' in line)
for label,body in [('r1 · 原文导入 · agent · draft',old),('r2 · 编者人工校订 · human · draft',new)]:
    y=text(d,label,96,y,45,color=blue)+14
    height=len(wrap(d,body,font(48),2264))*77+52
    d.rounded_rectangle((96,y,2464,y+height),radius=16,fill='white',outline=border,width=2)
    text(d,body,146,y+22,48,2264);y+=height+38
y=text(d,'保存后页面：已保存 r2。',96,y,45,color=blue)
y=text(d,'本次网络记录：POST /api/draft → 200；GET 当前作品 → 200。页面读回全文与拟改全文相同，独立 SQLite 核对也只有“做→坐”一字变化。',96,y+16,42)
y=text(d,'完整标题、其余 2,370 个字符、作品资料和旧 r1 均保持原样。本轮没有再调用模型读取 r2，后续任务需要取得当前正文。',96,y+16,40,color=muted)
y=text(d,'真实记录整理图 · 引文取自完整保存对象，不是浏览器截图。',96,y+24,34,color=muted)
im=im.crop((0,0,2560,y+55));im.save(out/'人工一字校订与版本.png');images.append({'file':'人工一字校订与版本.png','width':im.width,'height':im.height})
(out/'图片生成方式.json').write_text(json.dumps({'method':'直接2560像素宽排版真实运行、页面观察与独立核对；未放大低清图片；不是浏览器截图','images':images},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(images,ensure_ascii=False))
