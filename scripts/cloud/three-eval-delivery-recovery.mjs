import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {selectThreeLiveHead} from './three-eval-live.mjs';
import {validateProviderWorkspace} from './three-eval-workspace.mjs';
const exec=promisify(execFile),MAX_ARCHIVE=256*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Recover only fixed formal outputs after a confirmed terminal execution. This
// copies real files; it does not synthesize result/report/event receipts.
const DELIVERY_NAMES=new Set(['creator-launcher-report.json','creator-result.json','creator-delivery.tar.gz','creator-events.jsonl','creator-stderr.log','creator-mcp-stderr.log']);
export const DELIVERY_READ_PYTHON=String.raw`import os,sys,json,stat,hashlib,re
row=json.loads(sys.argv[1]);name=row['name'];assert name in ('creator-result.json','creator-delivery.tar.gz','creator-events.jsonl','creator-launcher-report.json','creator-stderr.log','creator-mcp-stderr.log')
workspace=row['workspace'];base='/fsx/pipeline/lwdp_generation/'+row['jobId']+'/tasks';task=row['taskId']
assert re.fullmatch(r'gen_[a-f0-9]{8,64}',row['jobId']) and re.fullmatch(r'[a-z0-9][a-z0-9-]{2,159}',task) and re.fullmatch(r'[a-f0-9]{64}',row['runtimeHash'])
assert workspace==base+'/'+task or (os.path.basename(workspace)==task and os.path.dirname(os.path.dirname(workspace))==base+'/account_attempts' and re.fullmatch(re.escape(task)+r'_[A-Za-z0-9_-]{4,64}',os.path.basename(os.path.dirname(workspace))))
assert os.path.normpath(workspace)==workspace
root=workspace+'/outputs'
try:
    assert os.path.realpath(root)==root
    directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in root.split('/')[1:]:
            following=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory);os.close(directory);directory=following
        def read_file(filename):
            fd=os.open(filename,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
            with os.fdopen(fd,'rb') as stream:
                before=os.fstat(stream.fileno());assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<=before.st_size<=268435456
                data=stream.read(268435457);after=os.fstat(stream.fileno());assert len(data)==before.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)
                return data
        report_bytes=read_file('creator-launcher-report.json');report=json.loads(report_bytes)
        assert report.get('kind')=='three-creator-launcher-report' and report.get('taskId')==task and report.get('workspace')==workspace and report.get('runtimeHash')==row['runtimeHash']
        data=report_bytes if name=='creator-launcher-report.json' else read_file(name);digest=hashlib.sha256(data).hexdigest()
        if name in ('creator-result.json','creator-delivery.tar.gz'):
            artifact=report.get('artifacts',{}).get(name,{})
            assert report.get('status')=='delivered' and artifact.get('sha256')==digest and artifact.get('bytes')==len(data) and len(data)>0
        if name=='creator-events.jsonl' and report.get('eventsSha256'):assert report['eventsSha256']==digest
        if name=='creator-stderr.log' and report.get('stderrSha256'):assert report['stderrSha256']==digest
        header={'name':name,'sha256':digest,'bytes':len(data),'jobId':row['jobId'],'taskId':task,'workspace':workspace,'runtimeHash':row['runtimeHash'],'sourcePath':root+'/'+name,'launcherSha256':hashlib.sha256(report_bytes).hexdigest(),'pathResolution':'directory-fd-no-follow'}
        sys.stdout.buffer.write(json.dumps(header).encode()+b'\n');sys.stdout.buffer.write(data)
    finally:os.close(directory)
except (OSError,AssertionError,ValueError,TypeError):print(json.dumps({'unavailable':True}))
`;
export async function retrieveThreeDeliveryArtifacts({jobId,taskId,caseRoot,workspaceBinding,names=[...DELIVERY_NAMES]},{pod,namespace='ray',container='ray-head',transport=exec}={}) {
  if(!/^gen_[a-f0-9]{8,64}$/.test(jobId??'')||!/^[a-z0-9][a-z0-9-]{2,159}$/.test(taskId??'')||!Array.isArray(names)||names.some(name=>!DELIVERY_NAMES.has(name))||new Set(names).size!==names.length)throw Error('THREE_DELIVERY_RECOVERY_SCOPE_INVALID');
  if(await realpath(caseRoot)!==path.resolve(caseRoot))throw Error('THREE_DELIVERY_RECOVERY_PATH_INVALID');
  if(workspaceBinding?.jobId!==jobId||workspaceBinding?.taskId!==taskId||!/^[a-f0-9]{64}$/.test(workspaceBinding?.runtimeHash??''))throw Error('THREE_DELIVERY_RECOVERY_BINDING_INVALID');
  validateProviderWorkspace(workspaceBinding);
  if(!names.length)return {};
  if(!pod){const inventory=await transport('kubectl',['-n',namespace,'get','pods','-l','ray.io/cluster=ray-cluster,ray.io/node-type=head','-o','json'],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});pod=selectThreeLiveHead(JSON.parse(inventory.stdout),container);}
  const recovered={};
  for(const name of names){
    const {stdout}=await transport('kubectl',['-n',namespace,'exec',pod,'-c',container,'--','python3','-c',DELIVERY_READ_PYTHON,JSON.stringify({name,jobId,taskId,workspace:workspaceBinding.workspace,runtimeHash:workspaceBinding.runtimeHash})],{encoding:'buffer',timeout:45000,maxBuffer:MAX_ARCHIVE+1024*1024});
    const bytes=Buffer.from(stdout),boundary=bytes.indexOf(10);if(boundary<0)throw Error('THREE_DELIVERY_RECOVERY_TRANSPORT_INVALID');
    const header=JSON.parse(bytes.subarray(0,boundary).toString());if(header.unavailable)continue;
    const content=bytes.subarray(boundary+1);if(header.name!==name||header.bytes!==content.length||content.length>MAX_ARCHIVE||header.sha256!==sha(content)||header.jobId!==jobId||header.taskId!==taskId||header.workspace!==workspaceBinding.workspace||header.runtimeHash!==workspaceBinding.runtimeHash||header.sourcePath!==`${workspaceBinding.workspace}/outputs/${name}`||!/^[a-f0-9]{64}$/.test(header.launcherSha256??'')||header.pathResolution!=='directory-fd-no-follow')throw Error('THREE_DELIVERY_RECOVERY_HASH_MISMATCH');
    const temporary=path.join(caseRoot,`.delivery-recovery-${randomUUID()}`);await writeFile(temporary,content,{flag:'wx',mode:0o600});await rename(temporary,path.join(caseRoot,name));
    recovered[name]={bytes:header.bytes,sha256:header.sha256,source:'trusted-host-provider-output-recovery',sourcePath:header.sourcePath,launcherSha256:header.launcherSha256,workspaceBinding,pathResolution:header.pathResolution};
  }
  return recovered;
}
