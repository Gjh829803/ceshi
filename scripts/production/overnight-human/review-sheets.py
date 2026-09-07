from pathlib import Path
import json,sys,subprocess
from PIL import Image,ImageDraw
REPO=Path(__file__).resolve().parents[3];OUT=REPO/'.codex-tmp/overnight-human-300-20260906';DEST=OUT/'review-sheets';DEST.mkdir(exist_ok=True)
queue=json.loads((OUT/'review-queue.json').read_text())['cases'];queue=[r for r in queue if r.get('openingPath') and Path(r['openingPath']).exists()];index=[]
for off in range(0,len(queue),8):
 rows=queue[off:off+8];sheet=Image.new('RGB',(1200,190*len(rows)),'white');draw=ImageDraw.Draw(sheet)
 for i,row in enumerate(rows):
  for col,key in enumerate(['referencePath','openingPath']):
   im=Image.open(row[key]).convert('RGB');im.thumbnail((588,162));sheet.paste(im,(col*600,i*190))
  label=row['actualAccount'].get('label','unverified');draw.text((5,i*190+165),row['taskId']+'  account='+label+'  '+str(row['worldBuildHash'])[:10],fill='black');index.append(row)
 sheet.save(DEST/f'comparison-{off//8+1:02d}.jpg')
(DEST/'index.json').write_text(json.dumps(index,indent=2));print(json.dumps({'cases':len(queue),'sheets':(len(queue)+7)//8,'root':str(DEST)}))
# For motion, use original playtest keyframes and ffmpeg timestamp frames; never
# equate a static opening screenshot with verified gait. Evidence is retained.
if '--motion' in sys.argv:
 for row in queue:
  root=Path(row['verifiedRoot']);report=root/'playtest/playtest.json'
  if not report.exists():continue
  played=json.loads(report.read_text());duration=played['videoMetadata']['durationSeconds'];dest=DEST/row['taskId'].split('-')[2];dest.mkdir(exist_ok=True)
  sheet=Image.new('RGB',(1240,1440),'white');draw=ImageDraw.Draw(sheet)
  for i,t in enumerate([2,15,35,duration*.3,duration*.5,duration*.7,duration*.85,duration-3]):
   frame=dest/f'motion-{i}.jpg';subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',str(root/'playtest/playtest.mp4'),'-frames:v','1','-y',str(frame)],check=True)
   im=Image.open(frame);im.thumbnail((612,340));x=i%2*620;y=i//2*360;sheet.paste(im,(x,y));draw.text((x+4,y+344),f'{t:.1f} sec',fill='black')
  sheet.save(dest/'motion-world.jpg');pair=Image.new('RGB',(1600,470),'white')
  for i,key in enumerate(['referencePath','openingPath']):
   im=Image.open(row[key]);im.thumbnail((796,446));pair.paste(im,(i*800,0))
  ImageDraw.Draw(pair).text((5,450),row['taskId']+' '+row['actualAccount'].get('label','unknown'),fill='black');pair.save(dest/'comparison.jpg')
  print(json.dumps({'taskId':row['taskId'],'account':row['actualAccount'].get('label'),'duration':duration,'travelledMeters':played.get('travelledMeters'),'targets':[(t['id'],t['reached']) for t in played.get('targetResults',[])],'pageErrors':played.get('pageErrors'),'runtimeErrors':played.get('runtimeErrors')},ensure_ascii=False))
