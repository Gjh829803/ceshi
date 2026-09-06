"""Durable campaign queue. Quality decisions are separate, evidence-backed Host inputs."""
from pathlib import Path
import json,os,sys,time,datetime,hashlib,subprocess,fcntl,collections,re
from account_availability import update_availability
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

def free_account_slots(quality,active_count,unreviewed_count,production_limit=4):
 cap={'verified-good':8,'production-good':4,'promising':2}.get(quality,0)
 if quality=='production-good' and type(production_limit) is int and 1<=production_limit<=8:cap=production_limit
 free=max(0,cap-active_count)
 return min(free,max(0,2-unreviewed_count)) if quality=='promising' else free

def used_model_output(row):
 root=Path(row['root']);events=root/'creator-events.jsonl'
 if row.get('worldBuildHash'):return True
 if events.exists():
  if events.stat().st_size>65536:return True
  rejected=False;has_events=False
  for line in events.read_text(errors='replace').splitlines():
   try:event=json.loads(line)
   except ValueError:continue
   has_events=True
   if event.get('type') in ['item.started','item.completed']:return True
   if event.get('type') in ['error','turn.failed']:
    message=str(event.get('message') or (event.get('error') or {}).get('message') or '').lower()
    rejected=rejected or 'hit your usage limit' in message or 'at capacity' in message
  return False if rejected else has_events or (root/'creator-launcher-report.json').exists()
 if (root/'creator-launcher-report.json').exists():return True
 message=(row.get('failure') or {}).get('message','')
 if 'Codex account slots' in message or message=='THREE_EXECUTION_GUARD: queue-deadline':return False
 final=read(root/'job-final.json',{})
 if final.get('timing',{}).get('available') and final['timing'].get('first_item_started_at')=='':return False
 return True

def can_retry_attempts(attempts):
 if len(attempts)>=4 or sum(used_model_output(r) for r in attempts)>=2:return False
 if any(Path(r['root'],name).exists() for r in attempts for name in ['creator-result.json','checkpoint-latest.json']):return False
 for r in attempts:
  if r['phase']!='failed':return False
  normal=r.get('providerStatus') in ['failed','completed','succeeded','submit_failed']
  stopped_before_model=r.get('providerStatus') in ['stopped','cancelled'] and r.get('executionComplete') and (r.get('failure') or {}).get('message')=='THREE_EXECUTION_GUARD: queue-deadline' and not used_model_output(r)
  if not normal and not stopped_before_model:return False
 return True

def runnable_checkpoint(root,state):
 checkpoint=read(root/'checkpoint-latest.json',{})
 if checkpoint.get('kind')!='three-creator-checkpoint' or checkpoint.get('status')!='runnable':return None
 expected={'jobId':state.get('jobId'),'taskId':state.get('taskId'),'caseId':state.get('caseId'),'profile':state.get('profile'),'creatorRuntimeLockHash':state.get('runtimeHash')}
 if any(not v or checkpoint.get(k)!=v for k,v in expected.items()):return None
 account=state.get('accountRouting',{})
 if not account.get('verified') or account.get('denied'):return None
 directory=checkpoint.get('verifiedDirectory','')
 if not re.fullmatch(r'checkpoint-verified/[a-f0-9]{64}-[a-f0-9]{16}',directory):return None
 target=root/directory
 if target.resolve()!=target:return None
 report=read(target/'checkpoint-verification.json',{});receipt=read(target/'checkpoint-receipt.json',{})
 if report.get('kind')!='three-creator-checkpoint-verification' or report.get('status')!='verified':return None
 if any(checkpoint.get(k)!=report.get(k) for k in ['worldBuildHash','archiveSha256']):return None
 if any(checkpoint.get(k)!=receipt.get(k) for k in ['sourceHash','worldBuildHash','archiveSha256','creatorRuntimeLockHash','taskId']):return None
 return checkpoint

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
   checkpoint=runnable_checkpoint(root/task,state) or {}
   rows.append({'availabilityFacts':live.get(task,{}).get('failureFacts',[]),'executionComplete':state.get('rayCleanupConfirmed') is True and state.get('providerStatus') in ['succeeded','completed','failed','cancelled','stopped'],'recoveredArtifact':bool(recovered),'checkpointArtifact':bool(checkpoint),'taskId':task,'caseId':task.removesuffix('--three-sdk'),'wave':wave['runId'],'root':str(root/task),'phase':state.get('phase','not-started'),'jobId':state.get('jobId'),'providerStatus':state.get('providerStatus'),'requestedAccountSha256':hashlib.sha256(ids[0].encode()).hexdigest() if len(ids)==1 else None,'actualAccount':state.get('accountRouting',{}),'worldBuildHash':state.get('worldBuildHash') or checkpoint.get('worldBuildHash'),'sourceHash':state.get('sourceHash') or checkpoint.get('sourceHash'),'failure':state.get('failure'),'submittedAt':state.get('submittedAt'),'cliActivityObserved':live.get(task,{}).get('cliActivityObserved',False)})
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
   auto=update_availability(rows,read(OUT/'automatic-availability.json'),{v['identitySha256']:k for k,v in decisions.items()},now())
   for identity,block in list(auto['blockedAccounts'].items()):
    if block['jobId'] in decisions.get(block['label'],{}).get('availabilityClearedForJobIds',[]):del auto['blockedAccounts'][identity]
   write(OUT/'automatic-availability.json',auto)
   for row in rows:byCase.setdefault(row['caseId'],[]).append(row)
   completed={cid for cid,attempts in byCase.items() if any(r['phase']=='delivered' for r in attempts)}
   recovered={r['caseId'] for r in rows if r.get('recoveredArtifact')};checkpoints={r['caseId'] for r in rows if r.get('checkpointArtifact')};available=completed|recovered|checkpoints
   active=[r for r in rows if r['phase'] not in TERMINAL and not r.get('executionComplete')];pendingRecovery=[r for r in rows if r['phase'] not in TERMINAL];busy=collections.Counter(r['requestedAccountSha256'] for r in active)
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
   status={'id':config['id'],'updatedAt':now(),'deadline':config['deadline'],'target':300,'selected':300,'submitted':len({r['caseId'] for r in rows if r['jobId']}),'delivered':len(completed),'recoveredArtifacts':len(recovered-completed),'availableArtifacts':len(available),'active':len(active),'pendingDeliveries':sum(r['phase']=='delivery-pending' for r in rows),'cliObserved':sum(r['cliActivityObserved'] for r in active),'failedAttempts':sum(r['phase']=='failed' for r in rows),'qualityReviewed':len(reviews),'qualityReviewPending':len(reviewqueue),'notDispatched':300-len(byCase),'accountDecisions':{k:v['status'] for k,v in decisions.items()},'cases':rows,'hoursRemaining':round(remainingSeconds/3600,2),'localFreeGiB':round(__import__('shutil').disk_usage(OUT).free/1024**3,2)}
   status['automaticAccountBlocks']={v['label']:v['kind'] for v in auto['blockedAccounts'].values()}
   status['runnableCheckpoints']=len(checkpoints-(completed|recovered))
   write(OUT/'status.json',status)
   if len(completed|recovered)==300:write(OUT/'complete.json',status);return
   if (OUT/'halt.json').exists():time.sleep(30);continue
   if status['localFreeGiB']<8:
    write(OUT/'storage-attention.json',{'at':now(),'freeGiB':status['localFreeGiB'],'reason':'Pause new admission; preserve existing jobs and recover space without deleting unique evidence.'});time.sleep(30);continue
   if now()>config['latestNewGenerationAt']:
    if not pendingRecovery:
     write(OUT/'deadline-summary.json',status)
     if remainingSeconds<=0:return
    time.sleep(30);continue
   # Actual outcome reviews, never runtime/token-length proxies, unlock probation expansion.
   inventory=read(OUT/'account-inventory-private.json',[]);policy=read(Path(config['accountPolicyPath']));denied={a['identitySha256'] for a in policy['denied']};accounts=[]
   for a in inventory:
    decision=decisions.get(a['label'],{});state=decision.get('status');
    if not a['eligible'] or a['healthStatus']!='active' or a['identitySha256'] in denied:continue
    if decision.get('availability','').startswith('blocked-'):continue
    if a['identitySha256'] in auto['blockedAccounts']:continue
    if state not in ['verified-good','promising','production-good']:continue
    if a['label'] not in ['A','B','C','G'] and not decision.get('qualityEvidence'):continue
    if state=='production-good':
     qualified={e['taskId'] for e in decision.get('qualityEvidence',[]) if e.get('verdict') in ['strong','satisfactory'] and reviews.get(e['taskId'],{}).get('accountIdentitySha256')==a['identitySha256'] and reviews.get(e['taskId'],{}).get('worldBuildHash')==e.get('worldBuildHash') and reviews.get(e['taskId'],{}).get('visualInspected') is True}
     if len(qualified)<2:continue
    unreviewed=sum(r['requestedAccountSha256']==a['identitySha256'] and r['taskId'] not in reviews for r in rows)
    free=free_account_slots(state,busy[a['identitySha256']],unreviewed,decision.get('productionConcurrency',4))
    accounts.extend([a]*free)
   # Keep initial exploration broad, then fill freed slots using approved accounts.
   # Previously verified accounts may keep working while probation results are assessed.
   slots=min(config['maxConcurrency']-len(active),len(accounts),64)
   pending=[c for c in master['cases'] if c['id'] not in byCase]
   # Only a deliberate retry after a confirmed terminal attempt; same reference/runtime.
   retry=[c for c in master['cases'] if c['id'] in byCase and c['id'] not in available and can_retry_attempts(byCase[c['id']])]
   pending+=retry
   if slots<1 or not pending:time.sleep(30);continue
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
   args=['node','scripts/cloud/three-eval-runner.mjs','--mode','prepare','--run-id',run,'--manifest',str(path),'--runtime-lock',config['runtimeLockPath'],'--case-limit',str(len(cases)),'--max-concurrency','64','--account-concurrency','20','--account-policy-file',config['accountPolicyPath'],'--account-inventory-file',config['inventoryPath'],'--experiment-revision','overnight-human-300-v1']
   subprocess.run(args,cwd=REPO,capture_output=True,check=True,timeout=120)
   config['waves'].append({'runId':run,'runRoot':str(root),'caseIds':[c['id'] for c in cases],'stage':'quality-weighted-production','createdAt':now()});config['phase']='production';write(OUT/'campaign.json',config);start_supervisor(root)
   print(json.dumps({'at':now(),'launchedWave':run,'count':len(cases),'accounts':collections.Counter(a['label'] for a in assign)}),flush=True)
  except Exception as e:write(OUT/'controller-warning.json',{'at':now(),'error':str(e)[-800:]});print(type(e).__name__,str(e)[-300:],flush=True)
  time.sleep(30)
if __name__=='__main__':main()
