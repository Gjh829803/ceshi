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
