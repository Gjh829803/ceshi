import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {selectThreeLiveHead} from './three-eval-live.mjs';
const exec=promisify(execFile),MAX_ARCHIVE=256*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Recover only fixed formal outputs after a confirmed terminal execution. This
// copies real files; it does not synthesize result/report/event receipts.
const DELIVERY_NAMES=new Set(['creator-result.json','creator-delivery.tar.gz','creator-events.jsonl','creator-launcher-report.json']);
export const DELIVERY_READ_PYTHON=String.raw`import os,sys,json,stat,hashlib
row=json.loads(sys.argv[1]);name=row['name'];assert name in ('creator-result.json','creator-delivery.tar.gz','creator-events.jsonl','creator-launcher-report.json')
root=row['workDirectory']+'/tasks/'+row['taskId']+'/outputs'
try:
    assert os.path.realpath(root)==root
    directory=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
        with os.fdopen(fd,'rb') as stream:
            before=os.fstat(stream.fileno());assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<before.st_size<=268435456
            data=stream.read(268435457);after=os.fstat(stream.fileno());assert len(data)==before.st_size and (before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns)
            sys.stdout.buffer.write(json.dumps({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}).encode()+b'\n');sys.stdout.buffer.write(data)
    finally:os.close(directory)
except (OSError,AssertionError):print(json.dumps({'unavailable':True}))
`;
export async function retrieveThreeDeliveryArtifacts({jobId,taskId,caseRoot,names=[...DELIVERY_NAMES]},{pod,namespace='ray',container='ray-head',transport=exec}={}) {
  if(!/^gen_[a-f0-9]{8,64}$/.test(jobId??'')||!/^[a-z0-9][a-z0-9-]{2,159}$/.test(taskId??'')||!Array.isArray(names)||names.some(name=>!DELIVERY_NAMES.has(name))||new Set(names).size!==names.length)throw Error('THREE_DELIVERY_RECOVERY_SCOPE_INVALID');
  if(await realpath(caseRoot)!==path.resolve(caseRoot))throw Error('THREE_DELIVERY_RECOVERY_PATH_INVALID');
  if(!names.length)return {};
  if(!pod){const inventory=await transport('kubectl',['-n',namespace,'get','pods','-l','ray.io/cluster=ray-cluster,ray.io/node-type=head','-o','json'],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});pod=selectThreeLiveHead(JSON.parse(inventory.stdout),container);}
  const recovered={};
  for(const name of names){
    const {stdout}=await transport('kubectl',['-n',namespace,'exec',pod,'-c',container,'--','python3','-c',DELIVERY_READ_PYTHON,JSON.stringify({name,jobId,taskId,workDirectory:`/fsx/pipeline/lwdp_generation/${jobId}`})],{encoding:'buffer',timeout:45000,maxBuffer:MAX_ARCHIVE+1024*1024});
    const bytes=Buffer.from(stdout),boundary=bytes.indexOf(10);if(boundary<0)throw Error('THREE_DELIVERY_RECOVERY_TRANSPORT_INVALID');
    const header=JSON.parse(bytes.subarray(0,boundary).toString());if(header.unavailable)continue;
    const content=bytes.subarray(boundary+1);if(header.name!==name||header.bytes!==content.length||content.length>MAX_ARCHIVE||header.sha256!==sha(content))throw Error('THREE_DELIVERY_RECOVERY_HASH_MISMATCH');
    const temporary=path.join(caseRoot,`.delivery-recovery-${randomUUID()}`);await writeFile(temporary,content,{flag:'wx'});await rename(temporary,path.join(caseRoot,name));
    recovered[name]={bytes:header.bytes,sha256:header.sha256,source:'trusted-host-fixed-output-recovery'};
  }
  return recovered;
}
