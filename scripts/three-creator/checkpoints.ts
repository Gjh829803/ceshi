import {copyFile, mkdir, readFile, rename, realpath, lstat, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {type Candidate, hashTree, verifyFiles, isWithin} from './compiler.js';
import {type CreatorProfile, THREE_CREATOR_VERSION, sha256} from './contracts.js';

const run = promisify(execFile);
const hash = /^[a-f0-9]{64}$/;
const fail = (detail: string): never => { throw new Error(`THREE_CHECKPOINT_${detail}`); };
export interface CreatorCheckpoint {
  kind:'three-creator-checkpoint'; schemaVersion:1; status:'runnable'; profile:CreatorProfile;
  worldBuildHash:string; sourceHash:string; runtimeHash:string; creatorRuntimeLockHash:string|null;
  caseId:string|null; taskId:string|null; toolVersion:string; createdAt:string; previewView:string;
  files:Record<string,string>; archiveSha256:string; archiveByteLength:number; checkpointManifestSha256:string;
}
async function closedFile(file:string) {
  const info=await lstat(file);
  if(!info.isFile()||info.nlink!==1||info.size>256*1024*1024||await realpath(file)!==file)fail('FILE_NOT_ADMITTED');
  return readFile(file);
}
async function directory(file:string) {
  await mkdir(file,{recursive:true});if(await realpath(file)!==file)fail('PATH_INVALID');
}
/** A runnable build checkpoint is not a completed delivery or a quality approval. */
export class CreatorCheckpoints {
  private latest:CreatorCheckpoint|undefined;
  constructor(private readonly workspace:string, private readonly profile:CreatorProfile) {}
  async save(candidate:Candidate, preview:any):Promise<CreatorCheckpoint> {
    const workspace=await realpath(this.workspace), root=path.join(workspace,'.three-creator');
    if(candidate.profile!==this.profile||![candidate.worldBuildHash,candidate.sourceHash,candidate.runtimeHash].every(value=>hash.test(value))||candidate.root!==path.join(root,'candidates',candidate.worldBuildHash)||candidate.sourceRoot!==path.join(candidate.root,'source')||candidate.playableRoot!==path.join(candidate.root,'playable'))fail('CANDIDATE_IDENTITY_INVALID');
    if(await realpath(candidate.root)!==candidate.root)fail('PATH_INVALID');
    for(const name of Object.keys(candidate.files)) {
      const parts=name.split('/');
      if(parts.some(part=>['auth.json','credentials','.aws','.codex','.creator-session','codex_home'].includes(part.toLowerCase())||part.toLowerCase().startsWith('codex_home_'))||(['source','playable'].includes(parts[0]!)&&parts[1]==='scratch'))fail('PRIVATE_PATH');
    }
    if(preview?.kind!=='three-creator-browser-preview'||preview.worldBuildHash!==candidate.worldBuildHash||preview.sourceHash!==candidate.sourceHash||preview.profile!==this.profile||!['opening','current','top-down','entity-triview'].includes(preview.view)||!['pageErrors','runtimeErrors','blockedNetworkRequests'].every(key=>Array.isArray(preview[key])&&preview[key].length===0))fail('PREVIEW_NOT_CLEAN');
    await verifyFiles(candidate.root,candidate.files);
    if(this.latest?.worldBuildHash===candidate.worldBuildHash)return this.latest;
    const imagePath=preview.image?.path;
    if(typeof imagePath!=='string'||!isWithin(path.join(root,'evidence',candidate.worldBuildHash),imagePath))fail('IMAGE_PATH_INVALID');
    const image=await closedFile(imagePath);
    if(sha256(image)!==preview.image.sha256||image.length!==preview.image.byteLength||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('IMAGE_CHANGED');
    let input:any=null;
    try{input=JSON.parse((await closedFile(path.join(workspace,'inputs','case-input.json'))).toString());}
    catch(error:any){if(error.code!=='ENOENT')throw error;}
    const creatorRuntimeLockHash=process.env.WORLDKIT_CREATOR_RUNTIME_HASH??null;
    if(input&&(input.profile!==this.profile||input.runtimeHash!==creatorRuntimeLockHash||input.taskId!==`${input.caseId}--${this.profile}`))fail('TASK_IDENTITY_INVALID');
    const output=path.join(workspace,'outputs');await directory(output);
    const checkpointRoot=path.join(root,'checkpoints',candidate.worldBuildHash,randomUUID()), payload=path.join(checkpointRoot,'payload');await directory(payload);
    // Copy only Compiler's closed inventory; never enumerate author scratch or outputs.
    for(const [name,digest] of Object.entries(candidate.files)) {
      if(!/^(source|playable)\//.test(name))fail('CANDIDATE_PATH_INVALID');
      const bytes=await closedFile(path.join(candidate.root,name));if(sha256(bytes)!==digest)fail('CANDIDATE_CHANGED');
      const target=path.join(payload,name);await directory(path.dirname(target));await writeFile(target,bytes,{flag:'wx'});
    }
    await directory(path.join(payload,'preview'));await writeFile(path.join(payload,'preview','preview.png'),image,{flag:'wx'});
    const evidence={kind:preview.kind,schemaVersion:1,profile:this.profile,sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,view:preview.view,pageErrors:[],runtimeErrors:[],blockedNetworkRequests:[],image:{path:'preview.png',sha256:sha256(image),byteLength:image.length}};
    await writeFile(path.join(payload,'preview','preview.json'),JSON.stringify(evidence));
    const manifest={kind:'three-creator-checkpoint' as const,schemaVersion:1 as const,status:'runnable' as const,profile:this.profile,
      worldBuildHash:candidate.worldBuildHash,sourceHash:candidate.sourceHash,runtimeHash:candidate.runtimeHash,creatorRuntimeLockHash,
      caseId:input?.caseId??null,taskId:input?.taskId??null,toolVersion:THREE_CREATOR_VERSION,createdAt:new Date().toISOString(),previewView:preview.view,files:await hashTree(payload)};
    const manifestBytes=JSON.stringify(manifest);await writeFile(path.join(payload,'checkpoint.json'),manifestBytes);
    await writeFile(path.join(payload,'artifact-hashes.json'),JSON.stringify({schemaVersion:1,files:await hashTree(payload)}));
    const sealed=await hashTree(payload);
    const archive=path.join(checkpointRoot,'creator-checkpoint.tar.gz');
    await run('tar',['-czf',archive,'--','payload'],{cwd:checkpointRoot,env:{...process.env,COPYFILE_DISABLE:'1'}});
    await verifyFiles(payload,sealed);
    await verifyFiles(candidate.root,candidate.files);
    const bytes=await closedFile(archive), receipt:CreatorCheckpoint={...manifest,archiveSha256:sha256(bytes),archiveByteLength:bytes.length,checkpointManifestSha256:sha256(manifestBytes)};
    const archiveTemp=path.join(output,`creator-checkpoint.${randomUUID()}.tmp`), receiptTemp=path.join(output,`creator-checkpoint.${randomUUID()}.json.tmp`);
    await copyFile(archive,archiveTemp);await writeFile(receiptTemp,JSON.stringify(receipt));
    // Receiver validates the pair before promotion. The immutable prior build remains.
    await rename(archiveTemp,path.join(output,'creator-checkpoint.tar.gz'));await rename(receiptTemp,path.join(output,'creator-checkpoint.json'));
    this.latest=receipt;return receipt;
  }
}
