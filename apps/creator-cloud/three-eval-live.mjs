// Read-only Host observations. Only fixed public output files are admitted;
// author source, account homes and scratch directories are never traversed.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const threeLiveReaderPython = String.raw`import pathlib,json,os,stat,datetime,sys,math,re
rows=json.loads(sys.argv[1]); results=[]
def safe_error(value):
    text=str(value or '')
    if 'hit your usage limit' in text.lower(): return 'Selected account has reached its usage limit.'
    if 'at capacity' in text.lower(): return 'Selected model is at capacity.'
    if 'model is not supported when using Codex with a ChatGPT account' in text: return 'Selected model is not supported for this Codex account.'
    import re
    match=re.search(r'\b(?:THREE|CREATOR|LWDP)_[A-Z0-9_]+\b',text)
    return match.group(0) if match else ('Private diagnostics retained.' if text else None)
def failure_facts(value):
    text=str(value or ''); facts=[]
    if 'hit your usage limit' in text.lower(): facts.append({'layer':'model-service','code':'MODEL_USAGE_LIMIT'})
    if 'PHYSICS_TRIANGLE_BUDGET_EXCEEDED' in text: facts.append({'layer':'sdk-physics','code':'PHYSICS_TRIANGLE_BUDGET_EXCEEDED'})
    if 'PHYSICS_COLLIDER_BUDGET_EXCEEDED' in text: facts.append({'layer':'sdk-physics','code':'PHYSICS_COLLIDER_BUDGET_EXCEEDED'})
    if 'at capacity' in text.lower(): facts.append({'layer':'model-service','code':'MODEL_CAPACITY'})
    if 'model is not supported when using Codex with a ChatGPT account' in text: facts.append({'layer':'model-service','code':'MODEL_NOT_SUPPORTED_FOR_ACCOUNT'})
    if 'THREE_SOURCE_SYMLINK' in text and ('scratch/' in text or 'codex_home' in text): facts.append({'layer':'host-integration','code':'PLATFORM_SCRATCH_SCANNED_AS_SOURCE'})
    if 'PHYSICS_BOX_DEGENERATE' in text: facts.append({'layer':'author-geometry','code':'PHYSICS_BOX_DEGENERATE'})
    if 'THREE_BROWSER_STARTUP_FAILED' in text and 'PHYSICS_BOX_DEGENERATE' not in text: facts.append({'layer':'browser-startup','code':'THREE_BROWSER_STARTUP_FAILED','cause':'not-identified'})
    if 'THREE_SUBMIT_PLAYTEST_REQUIRED' in text: facts.append({'layer':'delivery-prerequisite','code':'THREE_SUBMIT_PLAYTEST_REQUIRED'})
    return facts
def result_summary(value):
    if not isinstance(value,dict): return None
    summary={}
    if value.get('status') in ['passed','failed','ready','ready-for-independent-review']: summary['status']=value['status']
    for key in ['isCompleteEpisode','capturedInput']:
        if isinstance(value.get(key),bool): summary[key]=value[key]
    for key in ['plannedSeconds','requestedSeconds','actualWallSeconds','inputWallSeconds','activePlaySeconds','completedSteps']:
        number=value.get(key)
        if isinstance(number,(int,float)) and not isinstance(number,bool) and math.isfinite(number): summary[key]=number
    if isinstance(value.get('videoMetadata'),dict):
        video={k:v for k,v in value['videoMetadata'].items() if k in ['durationSeconds','frameCount','widthPixels','heightPixels'] and isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)}
        if video: summary['videoMetadata']=video
    failure=safe_error(value.get('failure'))
    if isinstance(failure,str) and re.fullmatch(r'(?:THREE|CREATOR|LWDP)_[A-Z0-9_]+',failure): summary['failure']=failure
    return summary or None
def read_public(p):
    if p.resolve()!=p: raise ValueError('LIVE_PATH_CHANGED')
    directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in p.parent.parts[1:]:
            following=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
            os.close(directory); directory=following
        fd=os.open(p.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
    finally: os.close(directory)
    s=os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>134217728:
        os.close(fd); raise ValueError('LIVE_FILE_NOT_ADMITTED')
    with os.fdopen(fd) as f: data=f.read()
    return data,s
def locate_outputs(row):
    base=pathlib.Path(row['workDir'])/'tasks'; task=row['taskId']; direct=base/task
    candidates=[]; pending=[]
    def inspect(workspace):
        out=workspace/'outputs'
        if not os.path.lexists(out): return
        if out.resolve()!=out or not out.is_dir(): raise ValueError('LIVE_OUTPUT_PATH_CHANGED')
        report_file=out/'creator-launcher-report.json'
        if not os.path.lexists(report_file): pending.append(out); return
        data,_=read_public(report_file); report=json.loads(data)
        if report.get('taskId')!=task or report.get('workspace')!=str(workspace) or not re.fullmatch(r'[a-f0-9]{64}',str(report.get('runtimeHash') or '')) or (row.get('runtimeHash') and report.get('runtimeHash')!=row['runtimeHash']): raise ValueError('LIVE_REPORT_IDENTITY_CHANGED')
        candidates.append((out,report))
    explicit=row.get('providerWorkspace')
    if explicit:
        workspace=pathlib.Path(explicit)
        attempt=workspace.parent
        if workspace!=direct and not (workspace.name==task and attempt.parent==base/'account_attempts' and re.fullmatch(re.escape(task)+r'_[A-Za-z0-9_-]{4,64}',attempt.name)): raise ValueError('LIVE_PROVIDER_WORKSPACE_INVALID')
        inspect(workspace)
    else:
        inspect(direct)
        attempts=base/'account_attempts'
        if os.path.lexists(attempts):
            if attempts.resolve()!=attempts or not attempts.is_dir(): raise ValueError('LIVE_ATTEMPT_PATH_CHANGED')
            matches=[entry for entry in attempts.iterdir() if re.fullmatch(re.escape(task)+r'_[A-Za-z0-9_-]{4,64}',entry.name)]
            if len(matches)>64: raise ValueError('LIVE_ATTEMPT_LIMIT')
            for entry in matches:
                if entry.is_symlink() or not entry.is_dir(): raise ValueError('LIVE_ATTEMPT_PATH_CHANGED')
                inspect(entry/task)
    if len(candidates)>1:
        active=[entry for entry in candidates if entry[1].get('status') in ['starting','running']]
        if len(active)!=1: raise ValueError('LIVE_ATTEMPT_AMBIGUOUS')
        candidates=active
    if candidates: return candidates[0]
    if len(pending)>1: raise ValueError('LIVE_ATTEMPT_AMBIGUOUS')
    return (pending[0] if pending else direct/'outputs'),None
for row in rows:
    r=dict(row); r['outputsExist']=False
    try:
        out,report=locate_outputs(row); r['outputsExist']=out.exists()
        r['resolvedWorkspace']=str(out.parent); r['outputPathSource']='provider-workspace' if row.get('providerWorkspace') else ('provider-account-attempt' if out.parent.parent.parent.name=='account_attempts' else 'task-workspace')
        if out.exists():
            if out.resolve()!=out: raise ValueError('LIVE_OUTPUT_PATH_CHANGED')
            if report:
                r['launcher']={k:report.get(k) for k in ['status','startedAt','finishedAt','runtimeHash','childExitCode']}; r['launcher']['error']=safe_error(report.get('error'))
            else:
                r['observationPending']='launcher-identity-pending'; results.append(r); continue
            p=out/'creator-checkpoint.json'
            if p.exists():
                data,_=read_public(p); checkpoint=json.loads(data)
                if checkpoint.get('kind')=='three-creator-checkpoint' and checkpoint.get('status')=='runnable' and checkpoint.get('taskId')==row['taskId'] and checkpoint.get('creatorRuntimeLockHash')==r.get('launcher',{}).get('runtimeHash'):
                    hashes={k:checkpoint.get(k) for k in ['worldBuildHash','sourceHash','archiveSha256']}
                    if all(isinstance(v,str) and re.fullmatch(r'[a-f0-9]{64}',v) for v in hashes.values()):
                        # Receipt presence is not archive verification or a delivery.
                        r['checkpointReceipt']={'status':'observed-unverified',**hashes,'createdAt':checkpoint.get('createdAt')}
            p=out/'creator-events.jsonl'
            if p.exists():
                data,s=read_public(p); events=[]
                for line in data.splitlines():
                    try: events.append(json.loads(line))
                    except json.JSONDecodeError: pass
                kinds={}; tools={}; latest_operation=None; latest_tool=None; image_responses=0; facts=[]; operations={}
                for event in events:
                    kind=event.get('type'); kinds[kind]=kinds.get(kind,0)+1; item=event.get('item',{})
                    if item.get('type') in ['image_generation','imageGeneration','image_generation_call'] and kind in ['item.started','item.completed']:
                        status='running' if kind=='item.started' else ('failed' if item.get('failure') or item.get('status') in ['failed','error'] else 'succeeded')
                        latest_tool={'name':'imagegen','status':'completed' if status=='succeeded' else status,'timestamp':None}
                        operation_id='imagegen:'+str(item.get('id') or len(operations))
                        latest_operation={'id':operation_id,'type':'imagegen.generate','status':status,'createdAt':None,'updatedAt':None}
                        operations[operation_id]=latest_operation
                    if item.get('type')=='mcp_tool_call': latest_tool={'name':item.get('tool'),'status':item.get('status') or ('running' if kind=='item.started' else None),'timestamp':None}
                    if event.get('type')=='item.completed' and item.get('type')=='mcp_tool_call':
                        tool=item.get('tool'); tools[tool]=tools.get(tool,0)+1
                        for block in (item.get('result') or {}).get('content',[]):
                            if block.get('type')=='image': image_responses+=1
                            if block.get('type')=='text':
                                try: operation=json.loads(block.get('text',''))
                                except (json.JSONDecodeError,TypeError): continue
                                if isinstance(operation,dict) and 'status' in operation and ('id' in operation or 'operationId' in operation):
                                    operation_id=operation.get('id') or operation.get('operationId')
                                    previous=operations.get(operation_id,{})
                                    latest_operation={k:operation.get(k,previous.get(k)) for k in ['id','operationId','type','status','createdAt','updatedAt']};latest_operation['id']=operation_id;latest_operation['error']=safe_error(operation.get('error'));latest_operation['errorCode']=latest_operation['error']
                                    summary=result_summary(operation.get('result'))
                                    if summary: latest_operation['resultSummary']=summary
                                    facts.extend(failure_facts(operation.get('error')))
                                    progress=operation.get('progress')
                                    if isinstance(progress,dict):
                                        latest_operation['progress']={k:progress.get(k) for k in ['stepIndex','elapsedSeconds','requestedSeconds'] if isinstance(progress.get(k),(int,float)) and not isinstance(progress.get(k),bool) and math.isfinite(progress[k])}
                                        if isinstance(progress.get('phase'),str): latest_operation['progress']['phase']=progress['phase']
                                    if isinstance(operation_id,str): operations[operation_id]=latest_operation
                errors=[{'type':e.get('type'),'message':safe_error(e.get('message') or (e.get('error') or {}).get('message'))} for e in events if e.get('type') in ['error','turn.failed']][-2:]
                for e in events:
                    if e.get('type') in ['error','turn.failed']: facts.extend(failure_facts(e.get('message') or (e.get('error') or {}).get('message')))
                r['failureFacts']=list({(f['layer'],f['code']):f for f in facts}.values())
                history=[]
                for operation in list(operations.values())[-100:]:
                    entry={k:operation.get(k) for k in ['id','type','status','createdAt','updatedAt']}; code=operation.get('errorCode')
                    entry['errorCode']=code if isinstance(code,str) and re.fullmatch(r'(?:THREE|CREATOR|LWDP)_[A-Z0-9_]+',code) else None
                    if operation.get('progress'): entry['progress']={k:v for k,v in operation['progress'].items() if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)}
                    if operation.get('resultSummary'): entry['resultSummary']=operation['resultSummary']
                    history.append(entry)
                r['events']={'bytes':s.st_size,'lastModifiedAt':datetime.datetime.fromtimestamp(s.st_mtime,datetime.timezone.utc).isoformat(),'types':kinds,'completedMcpCalls':tools,'imageResponses':image_responses,'latestTool':latest_tool,'latestOperation':latest_operation,'operations':history,'errors':errors}
                r['cliActivityObserved']=bool(kinds.get('thread.started') or kinds.get('turn.started'))
    except Exception as e: r['observationError']=str(e)
    results.append(r)
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'jobs':results}))`;

export function selectThreeLiveHead(inventory, container='ray-head') {
  const candidates=(inventory.items??[]).filter(item=>!item.metadata?.deletionTimestamp&&item.status?.phase==='Running'&&item.spec?.containers?.some(value=>value.name===container)&&item.status?.conditions?.some(value=>value.type==='Ready'&&value.status==='True'));
  if(candidates.length!==1||!/^[a-z0-9-]+$/.test(candidates[0].metadata?.name??''))throw new Error('THREE_LIVE_HEAD_UNAVAILABLE');
  return candidates[0].metadata.name;
}

export async function readThreeLiveStatus(jobs, {cacheMilliseconds=15000, namespace='ray', pod, container='ray-head'}={}) {
  const cacheRoot=path.join(repo,'.codex-tmp/three-creator-eval/live-cache');
  await mkdir(cacheRoot,{recursive:true});
  const fresh=[], pending=[];
  for (const job of jobs) {
    if (!/^gen_[a-f0-9]+$/.test(job.jobId??'') || !/^[a-z0-9][a-z0-9-]{2,99}$/.test(job.taskId??'') || job.workDir!==`/fsx/pipeline/lwdp_generation/${job.jobId}`) throw new Error('THREE_LIVE_IDENTITY_INVALID');
    if(job.runtimeHash!==undefined&&!/^[a-f0-9]{64}$/.test(job.runtimeHash))throw new Error('THREE_LIVE_IDENTITY_INVALID');
    try {const saved=JSON.parse(await readFile(path.join(cacheRoot,job.jobId+'.json'),'utf8'));if(saved.readerVersion===2&&saved.job.taskId===job.taskId&&saved.job.requestId===(job.requestId??null)&&saved.job.runtimeHash===(job.runtimeHash??null)&&saved.job.providerWorkspace===(job.providerWorkspace??null)&&(!saved.job.events||Array.isArray(saved.job.events.operations))&&Date.now()-Date.parse(saved.observedAt)<cacheMilliseconds){fresh.push({...saved.job,observedAt:saved.observedAt});continue;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
    pending.push({jobId:job.jobId,taskId:job.taskId,requestId:job.requestId??null,workDir:job.workDir,runtimeHash:job.runtimeHash??null,providerWorkspace:job.providerWorkspace??null});
  }
  if (pending.length) {
    if (!pod) {
      const inventory=await exec('kubectl',['-n',namespace,'get','pods','-l','ray.io/cluster=ray-cluster,ray.io/node-type=head','-o','json'],{encoding:'utf8',timeout:25000,maxBuffer:2*1024*1024});
      pod=selectThreeLiveHead(JSON.parse(inventory.stdout),container);
    }
    const {stdout}=await exec('kubectl',['-n',namespace,'exec',pod,'-c',container,'--','python3','-c',threeLiveReaderPython,JSON.stringify(pending)],{encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024});
    const result=JSON.parse(stdout);
    for(const job of result.jobs){const file=path.join(cacheRoot,job.jobId+'.json'),temp=file+`.${process.pid}.part`;await writeFile(temp,JSON.stringify({readerVersion:2,observedAt:result.observedAt,job}));const {rename}=await import('node:fs/promises');await rename(temp,file);fresh.push({...job,observedAt:result.observedAt});}
  }
  return {observedAt:new Date().toISOString(),jobs:jobs.map(job=>fresh.find(item=>item.jobId===job.jobId))};
}
