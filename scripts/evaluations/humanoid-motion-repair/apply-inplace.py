"""Apply tested manual revisions at the existing public paths, after provider completion."""
from pathlib import Path
import json,shutil,hashlib
REPO=Path(__file__).resolve().parents[3];OUT=REPO/'.codex-tmp/humanoid-motion-repair-20260906'
RUN=REPO/'.codex-tmp/three-creator-eval/runs/reliable-human-open-ten-20260906'
def apply(site):
 ready=OUT/'publish-ready.json'
 if not ready.exists():return False
 rows=json.loads(ready.read_text());manifest_path=site/'results.json';raw=manifest_path.read_bytes();manifest=json.loads(raw)
 assert manifest['id']=='reliable-human-open-ten-20260906'
 state=json.loads((RUN/'live-status.json').read_text());states={r['taskId']:r for r in state['attempts']};changed=False
 def copy(source,target):
  nonlocal changed
  if target.is_file() and source.read_bytes()==target.read_bytes():return
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);changed=True
 for row in manifest['cases']:
  task=row['id'];num=task.split('-')[3]
  if task not in rows:continue
  assert states[task]['phase'] in ['delivered','failed'],'Never overwrite a running Agent: '+task
  config=rows[task];report=json.loads((OUT/(num+'-playtest.json')).read_text())['result'];capture=json.loads((OUT/(num+'-captures.json')).read_text())['result']
  assert report['status']=='passed' and report['worldBuildHash']==capture['worldBuildHash']==config['build']
  payload=Path(config['originalPayloadRoot']) if config.get('originalPayloadRoot') else RUN/task/'host-verified/payload';original=json.loads((payload/'delivery.json').read_text());assert original['sourceHash']==config['baseSourceHash'] and original['worldBuildHash']==config['baseBuild']
  backup=OUT/'backups'/task;backup.mkdir(parents=True,exist_ok=True)
  if not (backup/'public-case.json').exists():
   assert not row.get('manualRepair');(backup/'public-case.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n')
  originalrow=json.loads((backup/'public-case.json').read_text());playableRelative=originalrow.get('playable') or ('cases/'+task+'/'+config['baseBuild']+'/playable/index.html');row['playable']=playableRelative;playable=site/playableRelative;caseRoot=playable.parent.parent
  src=OUT/'workspaces'/task/'.three-creator/candidates'/config['build']/'playable'
  for p in src.rglob('*'):
   if not p.is_file():continue
   rel=p.relative_to(src)
   if rel.parts[0] not in ['index.html','asset-definitions.json','compiled','runtime','assets']:continue
   copy(p,playable.parent/rel)
  capdir=caseRoot/'captures'/'manual-motion-repair';triviews=[];opening=None
  for item in capture['images']:
   source=Path(item['image']['path']);assert hashlib.sha256(source.read_bytes()).hexdigest()==item['image']['sha256'];dest=capdir/source.name;copy(source,dest);relative=dest.relative_to(site).as_posix()
   if item['view']=='opening':opening=relative
   else:triviews.append({'name':', '.join(item.get('entityIds',[])),'entityIds':item.get('entityIds',[]),'image':relative})
  video=caseRoot/'playtest'/'manual-motion-repair.mp4';copy(Path(report['videoPath']),video)
  provenance={'kind':'manual-humanoid-motion-repair','source':'user-authorized manual repair','originalCloudPhase':states[task]['phase'],'originalWorldBuildHash':config['baseBuild'],'originalSourceHash':config['baseSourceHash'],'worldBuildHash':config['build'],'sourceHash':report['sourceHash'],'runtimeHash':report['runtimeHash'],'motionAssetId':'humanoid.g-bot','publishedAt':config['at'],'validationScope':'Short walk/run/jump/reset regression and refreshed captures; original full-route evidence remains archived.','originalDeliveryBackup':'Host-verified payload and original provider archive retained by Host.'}
  copySource=OUT/'backups'/task/'manual-repair.json';copySource.write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n');copy(copySource,playable.parent/'manual-repair.json')
  row.update(status='ready',deliveryStatus='ready',note='已人工修复人物动作：复用 G-bot 动作，保留原场景和服装。原链接已更新，刷新即可试玩。',worldBuildHash=config['build'],sourceHash=report['sourceHash'],opening=opening,triviews=triviews,video=video.relative_to(site).as_posix(),manualRepair=provenance,originalGenerationMetrics=originalrow.get('metrics',{}),validationMode='manual-motion-regression')
  row['originalArchiveSha256']=originalrow.get('archiveSha256');row.pop('archiveSha256',None)
  row['metrics']={**originalrow.get('metrics',{}),'simulationSeconds':report['actualWallSeconds'],'actualWallSeconds':report['actualWallSeconds'],'activePlaySeconds':report['activePlaySeconds'],'inputWallSeconds':report['inputWallSeconds'],'videoDurationSeconds':report['videoMetadata']['durationSeconds'],'visitedTargets':0,'targetCount':0,'travelledMeters':report['travelledMeters']}
 app=site/'app.mjs'
 if app.exists():
  text=app.read_text();updated=text if 'c.manualRepair ?' in text else text.replace(': \"保留 Agent 原始交付\"', ': (c.manualRepair ? \"已人工修复人物动作；原始云端证据保留\" : \"保留 Agent 原始交付\")')
  if updated!=text:app.write_text(updated);changed=True
 new=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 if new!=raw:manifest_path.write_bytes(new);changed=True
 return changed
if __name__=='__main__':
 import sys
 print(json.dumps({'changed':apply(Path(sys.argv[1]))}))
