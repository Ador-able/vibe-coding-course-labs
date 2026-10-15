import json
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
out=Path(__file__).parent
a=json.loads((out/'独立核对.json').read_text(encoding='utf-8'))
font=lambda size:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)
blue='#315f91';ink='#203c57';muted='#637e98';border='#cfdeea'
def wrap(draw,text,f,width):
    rows=[];line=''
    for c in text:
        if c=='\n':rows.append(line);line='';continue
        if line and draw.textlength(line+c,font=f)>width:rows.append(line);line=c
        else:line+=c
    if line:rows.append(line)
    return rows
def text(draw,content,x,y,size=46,width=2368,color=ink):
    f=font(size)
    for line in wrap(draw,content,f,width):
        draw.text((x,y),line,font=f,fill=color);y+=int(size*1.65)
    return y
def begin(title,meta):
    im=Image.new('RGB',(2560,2400),'#f7f8fa');d=ImageDraw.Draw(im)
    y=text(d,title,96,56,70,color='#173e64');y=text(d,meta,96,y+8,40,color=muted)
    return im,d,y+36
images=[]
im,d,y=begin('同一份原文，调查发生在不同会话','凡人修仙传 C03／C04／C05 · 2026-10-15实测 · gpt-6.1-sol / xhigh')
rows=[['实际记录','A：自己调查','B：委派后回查'],['完整调查','主会话读五份材料','一个子会话读五份材料'],['成功命令','主6次','子10次；主1次'],['主会话最后收到的原文','C05指定2段＋20行上下文','只回查C05第8、42行'],['主任务自然结束',f"{a['naturalTurnCompletedMs']['A']/1000:.2f}秒",f"{a['naturalTurnCompletedMs']['B']/1000:.2f}秒"],['固定材料','前后字节一致','前后字节一致']]
xs=[96,690,1530];widths=[550,800,890]
for i,row in enumerate(rows):
    height=max(len(wrap(d,c,font(43),w)) for c,w in zip(row,widths))*71+38
    d.rectangle((96,y,2464,y+height),fill='#eaf0f6' if i==0 else 'white')
    for c,x,w in zip(row,xs,widths):text(d,c,x+18,y+16,43,w,color=blue if i==0 else ink)
    d.line((96,y+height,2464,y+height),fill=border,width=2);y+=height
y+=32
for s in ['B主会话累计输入：77,419 tokens','B子会话累计输入：159,104 tokens','B主＋子：236,523 tokens；A主为175,786 tokens。']:y=text(d,s,110,y,47,color=blue)
y=text(d,'B主会话没有收到子调查的全部工具原文，但要读报告、等待并回查。先A后B各完成一次，耗时与累计用量不能外推为委派的固定收益；它们也不是实时上下文占用或费用。',96,y+24,40,color=muted)
y=text(d,'真实记录整理图 · 完整输入、命令返回与计时见同目录记录。',96,y+16,36,color=muted)
im=im.crop((0,0,2560,y+52));im.save(out/'调查分工与真实用量.png');images.append({'file':'调查分工与真实用量.png','width':im.width,'height':im.height})
im,d,y=begin('接回报告后，主会话实际核了哪两段','B主会话唯一命令的真实返回 · materials/第三章.md · 完整段落')
for row in a['readback']:
    y=text(d,f"第{row['line']}行",96,y,48,color=blue)+15
    lines=wrap(d,row['text'],font(46),2264);height=len(lines)*75+54
    d.rounded_rectangle((96,y,2464,y+height),radius=18,fill='white',outline=border,width=2)
    text(d,row['text'],146,y+22,46,2264);y+=height+32
y=text(d,'第8行保留韩立“似懂非懂”“隐隐约约”的认识；第42行区分承诺教采药炼药、可能教医术，以及明确不教武功。',96,y,42)
y=text(d,'主会话没有重读C03／C04：期限、例外及录取结果仍来自子报告，不能把两段回查扩大成全稿独立复核。创建消息正文为密文，任务逐字交付仍未独立验证。',96,y+24,39,color=muted)
y=text(d,'真实记录整理图 · 引文直接读取固定文件，不是浏览器截图。',96,y+16,36,color=muted)
assert y+52<2400
im=im.crop((0,0,2560,y+52));im.save(out/'主会话两段实际回查.png');images.append({'file':'主会话两段实际回查.png','width':im.width,'height':im.height})
(out/'图片生成方式.json').write_bytes((json.dumps({'生成':'直接以2560像素宽排版真实命令返回与核对数据，使用微软雅黑原生字形；实录整理图，不是浏览器截图，未放大低清图片','images':images},ensure_ascii=False,indent=2)+'\n').encode())
readme=(out/'阅读说明.md').read_text(encoding='utf-8').replace('图片来自本目录实录整理页的原生PDF导出并直接渲染2560像素宽区域，不是放大的低清屏幕截图。','图片直接以2560像素宽排版本目录真实命令返回和核对数据，属于实录整理图，不是浏览器截图。浏览器无法连接本机实录服务，未冒称完成原生页面截图。')
(out/'阅读说明.md').write_bytes(readme.encode())
print(json.dumps(images,ensure_ascii=False))
