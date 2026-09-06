"""Durable campaign queue. Quality decisions are separate, evidence-backed Host inputs."""
from pathlib import Path
import json,os,sys,time,datetime,hashlib,subprocess,fcntl,collections
REPO=Path(__file__).resolve().parents[3];OUT=REPO/'.codex-tmp/overnight-human-300-20260906';TERMINAL={'delivered','failed','stopped','cancelled'}
def read(p,default=None):
 try:return json.loads(p.read_text())
 except (FileNotFoundError,json.JSONDecodeError):return default

def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);t=p.with_name(p.name+'.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');os.replace(t,p)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def alive(pid):
 try:os.kill(int(pid),0);return True
 except (OSError,ValueError,TypeError):return False

def start_supervisor(root):
 owner=read(root/'supervisor-owner.json',{});pid=owner.get('pid')
 if alive(pid) or (root/'supervisor-complete.json').exists():return
 with (root/'supervisor-launch.log').open('ab') as log:p=subprocess.Popen(['node','scripts/cloud/three-eval-supervisor.mjs','--run-root',str(root)],cwd=REPO,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 write(root/'campaign-supervisor.json',{'pid':p.pid,'at':now()})

def refresh_health():
 env={k:v for k,v in os.environ.items() if not k.startswith('AWS_')};env.update(AWS_SHARED_CREDENTIALS_FILE=str(REPO/'.codex-tmp/runtime-config/aws-credentials'),AWS_CONFIG_FILE=str(REPO/'.codex-tmp/runtime-config/aws-config'),AWS_EC2_METADATA_DISABLED='true')
 p=OUT/'health-private.latest.json';subprocess.run(['aws','s3','cp','s3://leap-world-us-east-2/world-model/platform/codex-account-health/accounts.json',str(p),'--only-show-errors'],env=env,check=True,capture_output=True,timeout=45);p.chmod(0o600)
 health=read(p,{})['accounts'];known=read(OUT/'account-inventory-private.json',[]);by={a.get('account_id',k):a for k,a in health.items()}
 for row in known:
  current=by.get(row['codexAccountId'],{});row.update(eligible=current.get('available') is True,healthStatus=current.get('status','unknown'),quotaLeftPercent=current.get('quota_left_percent'),checkedAt=current.get('last_checked_at'))
 write(OUT/'account-inventory-private.json',known);(OUT/'account-inventory-private.json').chmod(0o600)

def rows_of(config):
 rows=[]
 for wave in config['waves']:
  root=Path(wave['runRoot']);plan=read(root/'evaluation-plan.json',{})
  live={r['taskId']:r for r in read(root/'live-status.json',{}).get('attempts',[])}
  for task in plan.get('selectedTaskIds',[]):
   state=read(root/task/'state.json',{});payload=read(root/task/'payload.json',{});ids=payload.get('options',{}).get('codex_account_ids',[])
   recovery=read(root/task/'host-recovered-delivery.json',{});recovered=recovery.get('kind')=='three-creator-recovered-delivery' and recovery.get('status')=='artifact-verified' and recovery.get('jobId')==state.get('jobId') and all(recovery.get(k)==state.get(k) and state.get(k) for k in ['sourceHash','worldBuildHash'])
   rows.append({'recoveredArtifact':bool(recovered),'taskId':task,'caseId':task.removesuffix('--three-sdk'),'wave':wave['runId'],'root':str(root/task),'phase':state.get('phase','not-started'),'jobId':state.get('jobId'),'providerStatus':state.get('providerStatus'),'requestedAccountSha256':hashlib.sha256(ids[0].encode()).hexdigest() if len(ids)==1 else None,'actualAccount':state.get('accountRouting',{}),'worldBuildHash':state.get('worldBuildHash'),'sourceHash':state.get('sourceHash'),'failure':state.get('failure'),'submittedAt':state.get('submittedAt'),'cliActivityObserved':live.get(task,{}).get('cliActivityObserved',False)})
 return rows

def main():
 OUT.mkdir(parents=True,exist_ok=True);lease=(OUT/'controller.lock').open('w');fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB);write(OUT/'controller-owner.json',{'pid':os.getpid(),'startedAt':now()});lasthealth=0
 while True:
  try:
   config=read(OUT/'campaign.json');master=read(Path(config['masterManifest']));decisions=read(OUT/'account-decisions.json',{'accounts':{}})['accounts']
   if time.time()-lasthealth>600:
    try:refresh_health();lasthealth=time.time()
    except Exception as e:write(OUT/'health-warning.json',{'at':now(),'reason':type(e).__name__});lasthealth=time.time()-480
   for wave in config['waves']:start_supervisor(Path(wave['runRoot']))
   rows=rows_of(config);byCase={}
   for row in rows:byCase.setdefault(row['caseId'],[]).append(row)
   completed={cid for cid,attempts in byCase.items() if any(r['phase']=='delivered' for r in attempts)}
   recovered={r['caseId'] for r in rows if r.get('recoveredArtifact')};available=completed|recovered
   active=[r for r in rows if r['phase'] not in TERMINAL];busy=collections.Counter(r['requestedAccountSha256'] for r in active)
   reviews=read(OUT/'quality-reviews.json',{'cases':{}})['cases'];reviewqueue=[]
   for row in rows:
    root=Path(row['root']);verified=root/'host-verified/payload';caps=verified/'captures/captures.json';report=read(caps,{})
    if (row['phase']=='delivered' or row.get('recoveredArtifact')) and row['taskId'] not in reviews:
     image=next((i.get('image',{}).get('path') for i in report.get('images',[]) if i.get('view')=='opening'),None)
     existing=next((verified/'captures').glob('opening*.png'),None) if verified.exists() else None
     ref=OUT/'inputs'/row['caseId']/'reference.png'
     reviewqueue.append({**row,'referencePath':str(ref),'openingPath':str(existing) if existing else None,'verifiedRoot':str(verified),'note':'Inspect original vs opening and movement evidence; technical pass alone is not quality.'})
   write(OUT/'review-queue.json',{'updatedAt':now(),'cases':reviewqueue})
   elapsed=time.time()-datetime.datetime.fromisoformat(config['createdAt']).timestamp();remainingSeconds=datetime.datetime.fromisoformat(config['deadline'].replace('Z','+00:00')).timestamp()-time.time()
   status={'id':config['id'],'updatedAt':now(),'deadline':config['deadline'],'target':300,'selected':300,'submitted':len({r['caseId'] for r in rows if r['jobId']}),'delivered':len(completed),'recoveredArtifacts':len(recovered-completed),'availableArtifacts':len(available),'active':len(active),'cliObserved':sum(r['cliActivityObserved'] for r in active),'failedAttempts':sum(r['phase']=='failed' for r in rows),'qualityReviewed':len(reviews),'qualityReviewPending':len(reviewqueue),'notDispatched':300-len(byCase),'accountDecisions':{k:v['status'] for k,v in decisions.items()},'cases':rows,'hoursRemaining':round(remainingSeconds/3600,2),'localFreeGiB':round(__import__('shutil').disk_usage(OUT).free/1024**3,2)}
   write(OUT/'status.json',status)
   if len(available)==300:write(OUT/'complete.json',status);return
   if (OUT/'halt.json').exists():time.sleep(30);continue
   if status['localFreeGiB']<8:
    write(OUT/'storage-attention.json',{'at':now(),'freeGiB':status['localFreeGiB'],'reason':'Pause new admission; preserve existing jobs and recover space without deleting unique evidence.'});time.sleep(30);continue
   if now()>config['latestNewGenerationAt']:
    if not active:
     write(OUT/'deadline-summary.json',status)
     if remainingSeconds<=0:return
    time.sleep(30);continue
   # Actual outcome reviews, never runtime/token-length proxies, unlock probation expansion.
   inventory=read(OUT/'account-inventory-private.json',[]);policy=read(Path(config['accountPolicyPath']));denied={a['identitySha256'] for a in policy['denied']};accounts=[]
   for a in inventory:
    decision=decisions.get(a['label'],{});state=decision.get('status');
    if not a['eligible'] or a['healthStatus']!='active' or a['identitySha256'] in denied:continue
    if decision.get('availability','').startswith('blocked-'):continue
    if state not in ['verified-good','promising','production-good']:continue
    if a['label'] not in ['A','B','C','G'] and not decision.get('qualityEvidence'):continue
    cap=8 if state=='verified-good' else 2 if state=='promising' else 4;free=max(0,cap-busy[a['identitySha256']]);accounts.extend([a]*free)
   # Keep initial exploration broad, then fill freed slots using approved accounts.
   # Previously verified accounts may keep working while probation results are assessed.
   slots=min(config['maxConcurrency']-len(active),len(accounts),64)
   pending=[c for c in master['cases'] if c['id'] not in byCase]
   # Only a deliberate retry after a confirmed terminal attempt; same reference/runtime.
   retry=[c for c in master['cases'] if c['id'] in byCase and c['id'] not in completed and len(byCase[c['id']])<2 and all(r['phase']=='failed' and r.get('providerStatus') in ['failed','completed','succeeded','submit_failed'] for r in byCase[c['id']]) and not any(Path(r['root'],'creator-result.json').exists() for r in byCase[c['id']])]
   pending+=retry
   if slots<4 or not pending:time.sleep(30);continue
   # Prefer proven accounts; balance occupancy before using their remaining capacity.
   accounts.sort(key=lambda a:(0 if decisions[a['label']]['status']=='verified-good' else 1 if decisions[a['label']]['status']=='production-good' else 2,-float(a.get('quotaLeftPercent') or 0),a['label']))
   pools={a['label']:[x for x in accounts if x['label']==a['label']] for a in accounts};allocated=[]
   while pools:
    for label in list(pools):
     allocated.append(pools[label].pop());
     if not pools[label]:del pools[label]
   selected=pending[:slots];assign=allocated[:len(selected)];waveIndex=len(config['waves'])+1;run=f'overnight-human-300-20260906-wave-{waveIndex:02d}';support=OUT/'waves'/run;support.mkdir(parents=True,exist_ok=True)
   cases=[]
   for case,a in zip(selected,assign):cases.append({**case,'codexAccountIds':[a['codexAccountId']]})
   manifest={**master,'id':run,'cases':cases};path=support/'selected-cases.json';write(path,manifest);path.chmod(0o600);root=REPO/'.codex-tmp/three-creator-eval/runs'/run
   args=['node','scripts/cloud/three-eval-runner.mjs','--mode','prepare','--run-id',run,'--manifest',str(path),'--runtime-lock',config['runtimeLockPath'],'--case-limit',str(len(cases)),'--max-concurrency','64','--account-concurrency','8','--account-policy-file',config['accountPolicyPath'],'--account-inventory-file',config['inventoryPath'],'--experiment-revision','overnight-human-300-v1']
   subprocess.run(args,cwd=REPO,capture_output=True,check=True,timeout=120)
   config['waves'].append({'runId':run,'runRoot':str(root),'caseIds':[c['id'] for c in cases],'stage':'quality-weighted-production','createdAt':now()});config['phase']='production';write(OUT/'campaign.json',config);start_supervisor(root)
   print(json.dumps({'at':now(),'launchedWave':run,'count':len(cases),'accounts':collections.Counter(a['label'] for a in assign)}),flush=True)
  except Exception as e:write(OUT/'controller-warning.json',{'at':now(),'error':str(e)[-800:]});print(type(e).__name__,str(e)[-300:],flush=True)
  time.sleep(30)
if __name__=='__main__':main()
