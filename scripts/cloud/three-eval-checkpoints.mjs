// Host-only bounded retrieval of the two fixed optional checkpoint outputs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open,writeFile,rename,realpath,rm,mkdtemp,copyFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectThreeLiveHead} from './three-eval-live.mjs';
const exec=promisify(execFile), here=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_ARCHIVE=256*1024*1024;
export const THREE_CHECKPOINT_OUTPUTS=Object.freeze([{path:'creator-checkpoint.json',required:false,content_type:'application/json'},{path:'creator-checkpoint.tar.gz',required:false,content_type:'application/gzip'}]);
export const THREE_PROGRESS_OUTPUTS=Object.freeze([{path:'creator-progress.json',required:false,content_type:'application/json'},{path:'creator-progress.tar.gz',required:false,content_type:'application/gzip'}]);
export const CHECKPOINT_READ_PYTHON=String.raw`import os,sys,json,stat,hashlib
row=json.loads(sys.argv[1]); root=row['workDirectory']+'/tasks/'+row['taskId']+'/outputs'
kind=row.get('artifactKind','checkpoint'); assert kind in ('checkpoint','progress'); prefix='creator-'+kind
def read_at(directory,name,limit):
    fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>limit: raise ValueError('FILE_NOT_ADMITTED')
        data=stream.read(limit+1)
        if len(data)!=info.st_size: raise ValueError('FILE_CHANGED')
        return data
try:
    if os.path.realpath(root)!=root: raise ValueError('PATH_INVALID')
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        first=read_at(fd,prefix+'.json',8388608); receipt=json.loads(first)
        if receipt.get('archiveSha256')==row.get('knownArchiveSha256'):
            print(json.dumps({'unchanged':True})); sys.exit(0)
        archive=read_at(fd,prefix+'.tar.gz',268435456)
        if read_at(fd,prefix+'.json',8388608)!=first or len(archive)!=receipt.get('archiveByteLength') or hashlib.sha256(archive).hexdigest()!=receipt.get('archiveSha256'): raise ValueError('PAIR_CHANGED')
        sys.stdout.buffer.write(json.dumps({'receipt':receipt}).encode()+b'\n');sys.stdout.buffer.write(archive)
    finally: os.close(fd)
except (OSError,ValueError,KeyError):
    print(json.dumps({'unavailable':True}))
`;
async function optional(file){
  try{
    if(await realpath(file)!==path.resolve(file))throw new Error('THREE_CHECKPOINT_PATH_INVALID');
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.size>8*1024*1024)throw new Error('THREE_CHECKPOINT_FILE_NOT_ADMITTED');return JSON.parse(await handle.readFile('utf8'));}
    finally{await handle.close();}
  }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
function artifactKind(kind) { if(!['checkpoint','progress'].includes(kind))throw new Error('THREE_CHECKPOINT_KIND_INVALID');return kind; }
export async function installThreeArtifact(kind,{archivePath,receiptPath,caseRoot,expected,jobId}) {
  artifactKind(kind);
  const root=await realpath(caseRoot), receipt=await optional(receiptPath);
  if(root!==path.resolve(caseRoot)||!receipt)throw new Error('THREE_CHECKPOINT_PATH_INVALID');
  const identity=kind==='checkpoint'?receipt.worldBuildHash:receipt.sourceHash;
  if(!/^[a-f0-9]{64}$/.test(identity??'')||!/^[a-f0-9]{64}$/.test(receipt.archiveSha256??''))throw new Error('THREE_CHECKPOINT_IDENTITY_INVALID');
  const directory=path.join(root,kind+'-verified',identity+'-'+receipt.archiveSha256.slice(0,16));
  // Revalidate closure even on cache hits: a verified pointer is not permission
  // to accept later changed bytes or attach an archive from another attempt.
  await exec('python3',[path.join(here,'three-'+kind+'-unpack.py'),'--archive',archivePath,'--receipt',receiptPath,'--output',directory,'--expected-json',JSON.stringify(expected)],{maxBuffer:16*1024*1024,timeout:60000});
  const savedArchive=path.join(directory,'creator-'+kind+'.tar.gz');
  if(path.resolve(archivePath)!==savedArchive) {
    const temporary=savedArchive+'.'+randomUUID()+'.tmp';
    await copyFile(archivePath,temporary);await rename(temporary,savedArchive);
  }
  const value={...receipt,jobId,verifiedDirectory:path.relative(root,directory).split(path.sep).join('/')};
  const temporary=path.join(root,`${kind}-latest.${randomUUID()}.tmp`);
  await writeFile(temporary,JSON.stringify(value));await rename(temporary,path.join(root,kind+'-latest.json'));return value;
}
export const installThreeCheckpoint=args=>installThreeArtifact('checkpoint',args);
export const installThreeProgress=args=>installThreeArtifact('progress',args);
export async function readVerifiedThreeArtifact(kind,{caseRoot,expected,jobId}) {
  artifactKind(kind);const root=await realpath(caseRoot), pointer=await optional(path.join(root,kind+'-latest.json'));
  if(!pointer)return null;
  const relative=pointer.verifiedDirectory;
  if(root!==path.resolve(caseRoot)||pointer.jobId!==jobId||typeof relative!=='string'||!new RegExp('^'+kind+'-verified/[a-f0-9]{64}-[a-f0-9]{16}$').test(relative))throw new Error('THREE_CHECKPOINT_IDENTITY_INVALID');
  const directory=path.join(root,relative),archivePath=path.join(directory,'creator-'+kind+'.tar.gz'),receiptPath=path.join(directory,kind+'-receipt.json');
  const verified=await installThreeArtifact(kind,{archivePath,receiptPath,caseRoot,expected,jobId});
  if(verified.archiveSha256!==pointer.archiveSha256)throw new Error('THREE_CHECKPOINT_IDENTITY_INVALID');
  return {kind,receipt:verified,archivePath,receiptPath,directory};
}
export async function retrieveThreeArtifact(kind,{jobId,taskId,workDirectory,caseRoot,expected},{pod,namespace='ray',container='ray-head',transport=exec}={}) {
  artifactKind(kind);
  if(!/^gen_[a-f0-9]{8,64}$/.test(jobId??'')||!/^[a-z0-9][a-z0-9-]{2,159}$/.test(taskId??'')||workDirectory!==`/fsx/pipeline/lwdp_generation/${jobId}`||expected.taskId!==taskId)throw new Error('THREE_CHECKPOINT_IDENTITY_INVALID');
  if(await realpath(caseRoot)!==path.resolve(caseRoot))throw new Error('THREE_CHECKPOINT_PATH_INVALID');
  const previous=await optional(path.join(caseRoot,kind+'-latest.json'));
  let knownArchiveSha256=null;
  if(previous?.jobId===jobId&&typeof previous.verifiedDirectory==='string'&&new RegExp('^'+kind+'-verified/[a-f0-9]{64}-[a-f0-9]{16}$').test(previous.verifiedDirectory)) {
    try{await access(path.join(caseRoot,previous.verifiedDirectory,'creator-'+kind+'.tar.gz'));knownArchiveSha256=previous.archiveSha256;}catch{}
  }
  if(!pod){const inventory=await transport('kubectl',['-n',namespace,'get','pods','-l','ray.io/cluster=ray-cluster,ray.io/node-type=head','-o','json'],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});pod=selectThreeLiveHead(JSON.parse(inventory.stdout),container);}
  const {stdout}=await transport('kubectl',['-n',namespace,'exec',pod,'-c',container,'--','python3','-c',CHECKPOINT_READ_PYTHON,JSON.stringify({jobId,taskId,workDirectory,artifactKind:kind,knownArchiveSha256})],{encoding:'buffer',timeout:45000,maxBuffer:MAX_ARCHIVE+8*1024*1024});
  const bytes=Buffer.from(stdout), boundary=bytes.indexOf(10);if(boundary<0)throw new Error('THREE_CHECKPOINT_TRANSPORT_INVALID');
  const header=JSON.parse(bytes.subarray(0,boundary).toString());if(header.unchanged||header.unavailable)return previous;
  const archive=bytes.subarray(boundary+1), receipt=header.receipt;
  if(archive.length>MAX_ARCHIVE||archive.length!==receipt?.archiveByteLength||sha(archive)!==receipt.archiveSha256)throw new Error('THREE_CHECKPOINT_PAIR_MISMATCH');
  const temporary=await mkdtemp(path.join(caseRoot,'.'+kind+'-download-'));
  try{const archivePath=path.join(temporary,'creator-'+kind+'.tar.gz'),receiptPath=path.join(temporary,'creator-'+kind+'.json');await writeFile(archivePath,archive);await writeFile(receiptPath,JSON.stringify(receipt));return await installThreeArtifact(kind,{archivePath,receiptPath,caseRoot,expected,jobId});}
  finally{await rm(temporary,{recursive:true,force:true});}
}
export const retrieveThreeCheckpoint=(args,options)=>retrieveThreeArtifact('checkpoint',args,options);
export const retrieveThreeProgress=(args,options)=>retrieveThreeArtifact('progress',args,options);

/** Terminal resume refreshes optional artifacts only; no admission or model API. */
export async function refreshTerminalThreeCheckpoint({mode,state,caseRoot,expected,requestId,caseHash},{retrieve=retrieveThreeCheckpoint,retrievalOptions={}}={}) {
  if(mode!=='resume'||!['failed','delivered'].includes(state?.phase)||!state.jobId)return{changed:false};
  if(state.taskId!==expected.taskId||state.caseId!==expected.caseId||state.profile!==expected.profile||state.runtimeHash!==expected.creatorRuntimeLockHash||state.requestId!==requestId||state.caseHash!==caseHash)throw new Error('THREE_CHECKPOINT_TERMINAL_IDENTITY_INVALID');
  try{
    const checkpoint=await retrieve({jobId:state.jobId,taskId:expected.taskId,workDirectory:`/fsx/pipeline/lwdp_generation/${state.jobId}`,caseRoot,expected},retrievalOptions);
    if(!checkpoint)return{changed:false};
    const next={...state,checkpoint:{worldBuildHash:checkpoint.worldBuildHash,sourceHash:checkpoint.sourceHash,createdAt:checkpoint.createdAt,status:'runnable'}};
    delete next.checkpointObservationWarning;
    if(JSON.stringify(next)===JSON.stringify(state))return{changed:false};
    const temporary=path.join(caseRoot,`state.checkpoint-refresh.${randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify(next));await rename(temporary,path.join(caseRoot,'state.json'));
    return{changed:true,checkpoint:next.checkpoint};
  }catch{return{changed:false,warning:'THREE_CHECKPOINT_NOT_REFRESHED'};}
}

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
