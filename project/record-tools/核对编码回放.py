from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json
root=Path(__file__).resolve().parent/'实际证据'/'等待修复-bd569d65-2fed-4eb5-b948-015a6ad3cd63'
rows=[]
for name in ['原版','台面','笔记页']:
 path=root/(name+'-关键状态回放.gif')
 with Image.open(path) as gif:
  durations=[]
  for index in range(gif.n_frames):
   gif.seek(index);durations.append(gif.info.get('duration',0))
  if gif.n_frames!=150 or sum(durations)!=15000 or gif.size!=(1200,1000): raise RuntimeError('回放帧/时间/尺寸不符')
  sheet=Image.new('RGB',(2400,3090),'white')
  for position,index in enumerate([10,30,50,75,105,135]):
   gif.seek(index);frame=gif.convert('RGB')
   frame.save(root/(name+'-编码帧-'+str(index)+'.png'))
   x=(position%2)*1200;y=(position//2)*1030
   sheet.paste(frame,(x,y+30));ImageDraw.Draw(sheet).text((x+15,y+8),f'{position+1}: encoded frame {index}',fill='black')
  sheet.save(root/(name+'-编码六状态.png'))
 rows.append({'name':name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'encodedFrames':150,'sourceStates':6,'width':1200,'height':1000,'durationMilliseconds':sum(durations),'frameOrder':['current','edit','saved','conflict','compare','network-unconfirmed'],'scope':'同一次19f7/bd569运行的真实关键状态截图回放，不是连续录屏；等待状态另有完整截图，最终0cb文案另有独立回归。'})
(root/'编码回放机器核对.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(rows,ensure_ascii=False))
