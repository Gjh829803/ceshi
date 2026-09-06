import {constants} from 'node:fs';
import {mkdir, readdir, lstat, realpath, open, writeFile, rename, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import type {CreatorProfile} from './contracts.js';

const run = promisify(execFile);
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const SOURCE_EXTENSIONS = new Set(['.html','.ts','.tsx','.js','.jsx','.mjs','.json','.css','.md','.png','.jpg','.jpeg','.webp','.svg','.glb','.gltf','.bin','.wasm','.woff','.woff2','.mp3','.ogg','.wav']);
const EXCLUDED = new Set(['node_modules','outputs','inputs','dist','scratch','runtime','compiled','codex_home','home','tmp','auth.json','credentials','aws-credentials','aws-config','google-service-account.json','secrets.json','secret.json','token.json','tokens.json']);
const ROOT_EXCLUDED = new Set(['episode.json','package-lock.json','creator-result.json']);
const fail = (detail: string): never => { throw new Error(`THREE_PROGRESS_${detail}`); };
const forbidden = (name: string) => name.startsWith('.') || EXCLUDED.has(name.toLowerCase()) || name.toLowerCase().startsWith('codex_home_') || /^(?:auth|credentials?|secrets?|tokens?)(?:\.|$)/i.test(name);
export interface ProgressIdentity {
  profile: CreatorProfile; caseId: string; taskId: string; runtimeHash: string; creatorRuntimeLockHash: string;
}
export interface CreatorProgressReceipt extends ProgressIdentity {
  kind: 'three-creator-progress'; schemaVersion: 1; status: 'unverified';
  sourceHashAlgorithm: 'author-inventory-sha256-v1'; sourceHash: string; createdAt: string;
  files: Record<string,string>; archiveSha256: string; archiveByteLength: number; progressManifestSha256: string;
}
export interface ProgressLimits {maximumFiles?: number; maximumFileBytes?: number; maximumTotalBytes?: number; archiveTimeoutMs?: number}

async function directory(file: string) {
  let info;
  try {info=await lstat(file);}catch(error:any) {
    if(error.code!=='ENOENT')throw error;
    await directory(path.dirname(file));
    try {await mkdir(file);}catch(error:any){if(error.code!=='EEXIST')throw error;}
    info=await lstat(file);
  }
  if(!info.isDirectory() || await realpath(file)!==file)fail('PATH_INVALID');
}
async function closedRead(file: string, maximum: number): Promise<Buffer> {
  const before=await lstat(file);
  if(!before.isFile() || before.nlink!==1 || before.size>maximum || await realpath(file)!==file)fail('FILE_NOT_ADMITTED');
  const fd=await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened=await fd.stat();
    if(!opened.isFile() || opened.nlink!==1 || opened.dev!==before.dev || opened.ino!==before.ino || opened.size>maximum)fail('SOURCE_CHANGED');
    // Bounded read even if a writer grows the file after fstat.
    const chunks:Buffer[]=[]; let length=0;
    while(true) {
      const chunk=Buffer.alloc(Math.min(65536,maximum-length+1));
      const {bytesRead}=await fd.read(chunk,0,chunk.length,null);if(!bytesRead)break;
      length+=bytesRead;if(length>maximum)fail('SOURCE_BUDGET');chunks.push(chunk.subarray(0,bytesRead));
    }
    const after=await fd.stat(), current=await lstat(file);
    if(after.size!==length || before.size!==after.size || before.mtimeMs!==after.mtimeMs || before.ctimeMs!==after.ctimeMs || current.ino!==after.ino || current.dev!==after.dev || current.nlink!==1 || await realpath(file)!==file)fail('SOURCE_CHANGED');
    return Buffer.concat(chunks,length);
  } finally {await fd.close();}
}
/** Latest author files, deliberately independent of compile success or project validity. */
export async function collectProgressSources(workspace: string, limits: ProgressLimits = {}): Promise<Map<string,Buffer>> {
  const root=path.resolve(workspace), result=new Map<string,Buffer>();
  if(await realpath(root)!==root)fail('PATH_INVALID');
  const maximumFiles=Math.min(limits.maximumFiles??2000,2000), maximumFileBytes=Math.min(limits.maximumFileBytes??128*1024*1024,128*1024*1024), maximumTotalBytes=Math.min(limits.maximumTotalBytes??128*1024*1024,128*1024*1024);
  if(![maximumFiles,maximumFileBytes,maximumTotalBytes].every(value=>Number.isSafeInteger(value)&&value>0))fail('LIMIT_INVALID');
  let total=0, entries=0;
  async function walk(dir: string, depth: number) {
    if(depth>20 || await realpath(dir)!==dir || !(await lstat(dir)).isDirectory())fail('PATH_INVALID');
    for(const name of (await readdir(dir)).sort()) {
      if(++entries>10000)fail('SOURCE_BUDGET');
      // Exclude host and private directories before stat/read, including linked ones.
      if(forbidden(name) || (dir===root && (ROOT_EXCLUDED.has(name) || name.toLowerCase().startsWith('creator-'))))continue;
      if(/[\\\x00-\x1f]/.test(name))fail('PATH_INVALID');
      const file=path.join(dir,name), info=await lstat(file);
      if(info.isSymbolicLink())fail('LINK_REJECTED');
      if(info.isDirectory())await walk(file,depth+1);
      else if(info.isFile()) {
        if(!SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()))continue;
        if(result.size>=maximumFiles || info.size>maximumFileBytes || total+info.size>maximumTotalBytes)fail('SOURCE_BUDGET');
        const bytes=await closedRead(file,Math.min(maximumFileBytes,maximumTotalBytes-total));
        total+=bytes.length;result.set(path.relative(root,file).split(path.sep).join('/'),bytes);
      } else fail('FILE_NOT_ADMITTED');
    }
    if(await realpath(dir)!==dir)fail('PATH_INVALID');
  }
  await walk(root,0);return result;
}
/** Sorted UTF-16 relative names; unlike Compiler sourceHash this excludes resolved catalog metadata. */
export function progressSourceHash(source: Map<string,Buffer>): string {
  return digest(JSON.stringify(Object.fromEntries([...source.keys()].sort().map(name=>[name,digest(source.get(name)!)]))));
}
async function durableWrite(file: string, bytes: string | Buffer) {
  const fd=await open(file,'wx');try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
}

/** Sole launcher-owned writer. Unverified progress never supplies a playable/delivery receipt. */
export class CreatorProgress {
  private latest: CreatorProgressReceipt | undefined;
  private saving: Promise<CreatorProgressReceipt|null> | undefined;
  constructor(private readonly workspace: string, private readonly identity: ProgressIdentity, private readonly limits: ProgressLimits = {}) {
    if(!['three-sdk','three-raw'].includes(identity.profile) || !/^[a-z0-9][a-z0-9-]{2,99}$/.test(identity.caseId) || identity.taskId!==`${identity.caseId}--${identity.profile}` || ![identity.runtimeHash,identity.creatorRuntimeLockHash].every(value=>HASH.test(value)))fail('IDENTITY_INVALID');
  }
  save(): Promise<CreatorProgressReceipt|null> {
    if(this.saving)return this.saving;
    this.saving=this.snapshot().finally(()=>{this.saving=undefined;});return this.saving;
  }
  private async snapshot(): Promise<CreatorProgressReceipt|null> {
    const workspace=path.resolve(this.workspace), source=await collectProgressSources(workspace,this.limits);
    // Empty author directory is not a useful recovery point; preserve earlier work.
    if(!source.size)return null;
    const sourceHash=progressSourceHash(source);
    if(this.latest?.sourceHash===sourceHash)return this.latest;
    const output=path.join(workspace,'outputs'), generations=path.join(workspace,'.three-creator','progress');
    await directory(output);await directory(generations);
    const root=path.join(generations,randomUUID()), payload=path.join(root,'payload');await directory(path.join(payload,'source'));
    const files:Record<string,string>={};
    try {
      for(const name of [...source.keys()].sort()) {
        const target=path.join(payload,'source',name), bytes=source.get(name)!;
        await directory(path.dirname(target));await writeFile(target,bytes,{flag:'wx'});files[`source/${name}`]=digest(bytes);
      }
      const manifest={kind:'three-creator-progress' as const,schemaVersion:1 as const,status:'unverified' as const,...this.identity,sourceHashAlgorithm:'author-inventory-sha256-v1' as const,sourceHash,createdAt:new Date().toISOString(),files};
      const manifestBytes=JSON.stringify(manifest);await writeFile(path.join(payload,'progress.json'),manifestBytes,{flag:'wx'});
      await writeFile(path.join(payload,'artifact-hashes.json'),JSON.stringify({schemaVersion:1,files:{...files,'progress.json':digest(manifestBytes)}}),{flag:'wx'});
      const archive=path.join(root,'creator-progress.tar.gz');
      await run('tar',['-czf',archive,'--','payload'],{cwd:root,env:{PATH:'/usr/bin:/bin',COPYFILE_DISABLE:'1',LANG:'C',LC_ALL:'C'},timeout:Math.min(this.limits.archiveTimeoutMs??10000,10000),maxBuffer:1024*1024});
      // A concurrent edit produces a later retry, never a falsely coherent snapshot.
      if(progressSourceHash(await collectProgressSources(workspace,this.limits))!==sourceHash)fail('SOURCE_CHANGED');
      const archiveBytes=await closedRead(archive,256*1024*1024);
      const receipt:CreatorProgressReceipt={...manifest,archiveSha256:digest(archiveBytes),archiveByteLength:archiveBytes.length,progressManifestSha256:digest(manifestBytes)};
      await durableWrite(path.join(root,'creator-progress.json'),JSON.stringify(receipt));
      const archiveDestination=path.join(output,'creator-progress.tar.gz'), receiptDestination=path.join(output,'creator-progress.json');
      const temporaryArchive=path.join(output,`creator-progress.${randomUUID()}.tmp`), temporaryReceipt=path.join(output,`creator-progress.${randomUUID()}.json.tmp`);
      await durableWrite(temporaryArchive,archiveBytes);await durableWrite(temporaryReceipt,JSON.stringify(receipt));
      let previousArchive:Buffer|undefined, previousReceipt:Buffer|undefined;
      try {
        try {previousArchive=await closedRead(archiveDestination,256*1024*1024);previousReceipt=await closedRead(receiptDestination,8*1024*1024);}catch(error:any){if(error.code!=='ENOENT')throw error;}
        // Two filesystem names cannot be committed atomically. Readers admit only a
        // matching pair and retain their last verified version during this interval.
        await rename(temporaryArchive,archiveDestination);
        try {await rename(temporaryReceipt,receiptDestination);}
        catch(error) {
          // Roll back ordinary commit failures; immutable generations also retain the
          // prior pair if the worker is killed between the two renames.
          if(previousArchive && previousReceipt) {
            const rollback=path.join(output,`creator-progress.${randomUUID()}.rollback`);
            await durableWrite(rollback,previousArchive);await rename(rollback,archiveDestination);
          } else await rm(archiveDestination,{force:true});
          throw error;
        }
      } finally {await rm(temporaryArchive,{force:true});await rm(temporaryReceipt,{force:true});}
      this.latest=receipt;
      // Keep current and one preceding immutable pair, bounding periodic disk use.
      // Retention housekeeping cannot turn an already committed pair into failure.
      try {
        const entries=await readdir(generations,{withFileTypes:true}), prior=[];
        for(const entry of entries)if(entry.isDirectory()&&entry.name!==path.basename(root)) {
          const file=path.join(generations,entry.name);prior.push({file,modified:(await lstat(file)).mtimeMs});
        }
        prior.sort((a,b)=>b.modified-a.modified);
        for(const old of prior.slice(1))await rm(old.file,{recursive:true,force:true});
      } catch { /* The next successful snapshot retries bounded retention. */ }
      return receipt;
    } catch(error) {
      await rm(root,{recursive:true,force:true});throw error;
    }
  }
}
