"""Single incremental publisher for all campaign waves; no review gate."""
from pathlib import Path
import json,os,time,subprocess,shutil,hashlib,importlib.util,tarfile,io,tempfile,fcntl,datetime
REPO=Path(__file__).resolve().parents[3];OUT=REPO/'.codex-tmp/overnight-human-300-20260906';SITE=OUT/'gallery';VIEWER=REPO.parent/'gpt6-world-agent-refactor';SCRIPTS=VIEWER/'scripts/cloud';RUN='overnight-human-300-20260906'
def read(p,default=None):
 try:return json.loads(p.read_text())
 except (FileNotFoundError,json.JSONDecodeError):return default

def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);t=p.with_name(p.name+'.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');os.replace(t,p)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def cp(a,b):
 if b.exists() and a.stat().st_size==b.stat().st_size and a.stat().st_mtime_ns<=b.stat().st_mtime_ns:return
 b.parent.mkdir(parents=True,exist_ok=True)
 # Public build/reference bytes are immutable; hardlinks avoid a third local copy.
 immutable=a.suffix in ['.png','.jpg','.glb','.wasm','.mp4','.webm','.map'] or 'runtime' in a.parts or 'compiled' in a.parts
 if immutable:
  temporary=b.with_name(b.name+'.link-part')
  try:
   if temporary.exists():temporary.unlink()
   os.link(a,temporary);os.replace(temporary,b);return
  except OSError:
   if temporary.exists():temporary.unlink()
 shutil.copy2(a,b)
def main():
 lease=(OUT/'publisher.lock').open('w');fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB);write(OUT/'publisher-owner.json',{'pid':os.getpid(),'startedAt':now()});SITE.mkdir(exist_ok=True);master=read(OUT/'master-selection.json');manifestRows={}
 for c in master['cases']:
  ref=f'references/{c["id"]}.png';cp(Path(c['referenceImage']['path']),SITE/ref)
  task=c['id']+'--three-sdk';manifestRows[task]={'id':task,'baseCaseId':c['id'],'profile':'three-sdk','title':c['title'],'reference':ref,'referenceImageSha256':c['referenceImage']['contentSha256'],'prompt':c['effectiveUserPrompt'],'status':'queued','tags':['human','open'],'note':'已选入今晚 300 例生产队列；等待账号分配。'}
 for n in ['index.html','styles.css','app.mjs']:cp(VIEWER/'apps/creator-evaluation-site'/n,SITE/n)
 spec=importlib.util.spec_from_file_location('publisher_base',REPO/'scripts/cloud/publish-creator-evaluation-site.py');pub=importlib.util.module_from_spec(spec);spec.loader.exec_module(pub)
 sent=read(OUT/'published-files.json',{});cache={};lastFingerprint={};cycle=0
 while True:
  try:
   cycle+=1;config=read(OUT/'campaign.json');progressRows={};rows=dict(manifestRows)
   for wave in config['waves']:
    root=Path(wave['runRoot']);gallery=OUT/'waves'/wave['runId']/'gallery';fingerprint=hashlib.sha256(b''.join(p.read_bytes() for p in sorted(root.glob('*--three-sdk/state.json')))).hexdigest()
    if lastFingerprint.get(wave['runId'])!=fingerprint or not (gallery/'results.json').exists():
     proc=subprocess.run(['python3',str(SCRIPTS/'sync-three-evaluation-site.py'),'--run-root',str(root),'--inputs-root',str(OUT/'inputs'),'--gallery-root',str(gallery),'--stage-only'],cwd=VIEWER,capture_output=True,text=True,timeout=240)
     if proc.returncode:raise RuntimeError(proc.stderr[-700:])
     lastFingerprint[wave['runId']]=fingerprint
    nodeargs=['node',str(SCRIPTS/'three-eval-progress.mjs'),'--run-root',str(root),'--output',str(gallery/'progress.json')]
    if (root/'live-status.json').exists() and not (root/'supervisor-complete.json').exists():nodeargs+=['--live-status',str(root/'live-status.json')]
    subprocess.run(nodeargs,cwd=VIEWER,capture_output=True,check=True,timeout=60)
    for c in read(gallery/'results.json',{}).get('cases',[]):
     task=c['id']
     if not rows.get(task,{}).get('playable') or c.get('playable'):rows[task]=c
    for c in read(gallery/'progress.json',{}).get('cases',[]):progressRows[c['taskId']]=c
    for directory in ['cases','references']:
     folder=gallery/directory
     if folder.exists():
      for p in folder.rglob('*'):
       if p.is_file():cp(p,SITE/p.relative_to(gallery))
   status=read(OUT/'status.json',{});decisions=read(OUT/'account-decisions.json',{'accounts':{}})
   accountLabels={v['identitySha256']:k for k,v in decisions['accounts'].items()}
   execution={r['taskId']:r for r in status.get('cases',[])}
   for task,c in rows.items():
    assigned=execution.get(task,{});actual=assigned.get('actualAccount',{});label=actual.get('label') or accountLabels.get(assigned.get('requestedAccountSha256'))
    if label:c['tags']=list(dict.fromkeys(c.get('tags',[])+['账号 '+label+('（已核对）' if actual.get('verified') else '（指定）')]))
    if task not in progressRows:progressRows[task]={'taskId':task,'caseId':c['baseCaseId'],'phase':'queued','stage':'queued','stageLabel':'等待账号质量评估与投递','lastObservedAt':now(),'source':'Host production queue','attempts':[]}
   timestamp=now();manifest={'schemaVersion':1,'kind':'three-creator-evaluation-gallery','id':RUN,'title':'今晚 300 个人形开阔世界','description':'08:00 截止 · 真实云端流程 · 首批账号摸底，后续按质量分配','createdAt':config['createdAt'],'updatedAt':timestamp,'reviewStorageKey':'worldkit-feedback-'+RUN,'cases':[rows[c['id']+'--three-sdk'] for c in master['cases']]}
   write(SITE/'results.json',manifest);write(SITE/'progress.json',{'kind':'three-creator-run-progress','schemaVersion':1,'runId':RUN,'updatedAt':timestamp,'model':'gpt-6-astra','effort':'xhigh','cases':list(progressRows.values())});write(SITE/'production-status.json',{k:v for k,v in status.items() if k!='cases'});write(SITE/'account-quality.json',decisions)
   remote=pub.validate_manifest(manifest,'three')+'/runs/'+RUN
   files=[];newSent={}
   for p in sorted(SITE.rglob('*'),key=lambda p:(p.name=='results.json',str(p))):
    if not p.is_file():continue
    rel=p.relative_to(SITE).as_posix()
    if p.is_symlink() or p.suffix in ['.env','.ts','.gz'] or rel.startswith(('source/','.')):raise ValueError('Unexpected public file')
    stat=p.stat();key=(stat.st_size,stat.st_mtime_ns);digest=cache.get(rel)
    if not digest or digest[0]!=key: digest=(key,hashlib.sha256(p.read_bytes()).hexdigest());cache[rel]=digest
    newSent[rel]=digest[1]
    if sent.get(rel)!=digest[1]:files.append(p)
   if files:
    inventory=json.loads(subprocess.check_output(['kubectl','-n','ray','get','pods','-l','ray.io/cluster=ray-cluster,ray.io/node-type=head','-o','json'],timeout=30));heads=[p['metadata']['name'] for p in inventory['items'] if not p['metadata'].get('deletionTimestamp') and p['status']['phase']=='Running' and any(c.get('type')=='Ready' and c.get('status')=='True' for c in p['status'].get('conditions',[]))];assert len(heads)==1
    with tempfile.TemporaryFile() as buffer:
     with tarfile.open(fileobj=buffer,mode='w',format=tarfile.USTAR_FORMAT) as tar:
      for p in files:
       b=p.read_bytes();i=tarfile.TarInfo(p.relative_to(SITE).as_posix());i.size=len(b);i.mode=0o644;tar.addfile(i,io.BytesIO(b))
     buffer.seek(0);subprocess.run(['kubectl','-n','ray','exec','-i',heads[0],'-c','ray-head','--','python','-c',pub.INSTALL,remote,'full'],stdin=buffer,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,timeout=480)
    sent=newSent;write(OUT/'published-files.json',sent);write(OUT/'publication-status.json',{'updatedAt':timestamp,'url':'http://k8s-lwdp-worldkit-1b0222fb6d-f0f26ee23663e783.elb.us-east-2.amazonaws.com/creator-evals/three/runs/'+RUN+'/','changedFiles':len(files),'playable':sum(bool(c.get('playable')) for c in rows.values()),'selected':300});print(json.dumps({'publishedAt':timestamp,'files':len(files),'playable':sum(bool(c.get('playable')) for c in rows.values())}),flush=True)
   if (OUT/'complete.json').exists():write(OUT/'publication-complete.json',{'at':now()});return
  except Exception as e:write(OUT/'publisher-warning.json',{'at':now(),'error':str(e)[-800:]});print(type(e).__name__,str(e)[-300:],flush=True)
  time.sleep(45)
if __name__=='__main__':main()
